package tz.go.pmo.dmis.mitigation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * The v2 Mitigation Measures surface over the existing {@code mitigation_measures} table.
 * Deliberate fixes of source defects: the source's
 * show/edit/update/destroy methods don't exist and its store can never insert (missing NOT NULL
 * title, non-fillable fields, value-casing mismatches). Here the full intended CRUD works:
 * title mirrors project_programme_name (the model boot()'s copy, reversed), implementing_institution
 * and type_of_mitigation are persisted (values mapped to the DB checks), and priority is stored in
 * the DB's capitalised form.
 */
@Service
@RequiredArgsConstructor
public class MitigationMeasureService {

    private static final int PER_PAGE = 15;
    private static final DateTimeFormatter M_Y = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);
    private static final Map<String, String> TYPE_OF_MITIGATION = Map.of(
            "structural", "Structure", "non_structural", "Non-structure");

    private final MitigationMeasureRepository measures;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public MitigationMeasureResponses.Index index(int page) {
        Page<MitigationMeasure> result = measures.findAllByOrderByCreatedAtDesc(PageRequest.of(Math.max(page, 1) - 1, PER_PAGE));
        List<MitigationMeasureResponses.Row> rows = result.getContent().stream()
                .map(m -> new MitigationMeasureResponses.Row(m.getId(), m.getProjectProgrammeName(),
                        m.getImplementingInstitution(), m.getHazardRiskAddressed(), m.getProjectStatus(),
                        m.getPriority(), fmt(m.getImplementationPeriodStart()), fmt(m.getImplementationPeriodEnd())))
                .toList();
        MitigationMeasureResponses.Stats stats = new MitigationMeasureResponses.Stats(
                measures.count(),
                measures.countByProjectStatus("Ongoing"),
                measures.countByProjectStatus("Not started"),
                measures.countByProjectStatus("Completed"));
        List<MitigationMeasureResponses.PriorityDatum> byPriority = measures.countByPriority().stream()
                .map(c -> new MitigationMeasureResponses.PriorityDatum(c.getPriority(), c.getTotal()))
                .toList();
        int first = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + 1;
        int last = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + result.getNumberOfElements();
        MitigationMeasureResponses.Pagination pagination = new MitigationMeasureResponses.Pagination(
                result.getNumber() + 1, Math.max(result.getTotalPages(), 1), result.getTotalElements(), first, last);
        return new MitigationMeasureResponses.Index(rows, pagination, stats, byPriority);
    }

    @Transactional(readOnly = true)
    public MitigationMeasureResponses.Detail show(Long id) {
        return toDetail(find(id));
    }

    @Transactional
    public MitigationMeasureResponses.Detail store(MitigationMeasureWriteRequest r) {
        validate(r);
        MitigationMeasure m = new MitigationMeasure();
        apply(m, r);
        m.setCreatedAt(Instant.now());
        return toDetail(measures.save(m));
    }

    @Transactional
    public MitigationMeasureResponses.Detail update(Long id, MitigationMeasureWriteRequest r) {
        validate(r);
        MitigationMeasure m = find(id);
        apply(m, r);
        return toDetail(measures.save(m));
    }

    @Transactional
    public void destroy(Long id) {
        measures.delete(find(id));
    }

    private MitigationMeasure find(Long id) {
        return measures.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Mitigation measure " + id + " not found"));
    }

    private void validate(MitigationMeasureWriteRequest r) {
        requireIn(r.implementingEntity(), List.of("Government", "Non-Government"), "implementing entity");
        requireIn(r.projectStatus(), List.of("Ongoing", "Not started", "Completed", "Design"), "project status");
        requireIn(r.typeOfMitigation(), List.of("structural", "non_structural"), "type of mitigation");
        requireIn(r.priority(), List.of("low", "medium", "high"), "priority");
        if (r.implementationPeriodEnd() != null && r.implementationPeriodStart() != null
                && !r.implementationPeriodEnd().isAfter(r.implementationPeriodStart())) {
            throw new BusinessRuleException("The implementation period end must be a date after implementation period start.");
        }
    }

    private void apply(MitigationMeasure m, MitigationMeasureWriteRequest r) {
        // title is NOT NULL and the SRS form has no title — mirror project_programme_name.
        m.setTitle(r.projectProgrammeName());
        m.setProjectProgrammeName(r.projectProgrammeName());
        m.setImplementingEntity(r.implementingEntity());
        m.setImplementingInstitution(r.implementingInstitution());
        m.setHazardRiskAddressed(r.hazardRiskAddressed());
        m.setImplementationPeriodStart(r.implementationPeriodStart());
        m.setImplementationPeriodEnd(r.implementationPeriodEnd());
        m.setProjectStatus(r.projectStatus());
        m.setTypeOfMitigation(TYPE_OF_MITIGATION.get(r.typeOfMitigation()));
        m.setNarrativeDescription(r.narrativeDescription());
        m.setProjectCoverage(json(r.projectCoverage()));
        m.setProjectBeneficiaries(r.projectBeneficiaries());
        m.setProjectActivities(r.projectActivities());
        m.setExpectedOutcome(r.expectedOutcome());
        m.setAssociatedPartners(json(r.associatedPartners()));
        m.setResourcesAllocated(r.resourcesAllocated() == null ? null : json(List.of(r.resourcesAllocated())));
        m.setAdditionalSupportRequired(r.additionalSupportRequired());
        m.setChallengesBarriersNeeds(r.challengesBarriersNeeds());
        // DB check expects capitalised priorities.
        m.setPriority(r.priority().substring(0, 1).toUpperCase(Locale.ROOT) + r.priority().substring(1));
        m.setUpdatedAt(Instant.now());
    }

    private static void requireIn(String value, List<String> allowed, String field) {
        if (value == null || !allowed.contains(value)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
        }
    }

    private MitigationMeasureResponses.Detail toDetail(MitigationMeasure m) {
        return new MitigationMeasureResponses.Detail(m.getId(), m.getProjectProgrammeName(),
                m.getImplementingEntity(), m.getImplementingInstitution(), m.getHazardRiskAddressed(),
                m.getImplementationPeriodStart() == null ? null : m.getImplementationPeriodStart().toString(),
                m.getImplementationPeriodEnd() == null ? null : m.getImplementationPeriodEnd().toString(),
                m.getProjectStatus(),
                m.getTypeOfMitigation() == null ? null
                        : TYPE_OF_MITIGATION.entrySet().stream()
                                .filter(e -> e.getValue().equals(m.getTypeOfMitigation()))
                                .map(Map.Entry::getKey).findFirst().orElse(m.getTypeOfMitigation()),
                m.getNarrativeDescription(), parseStrings(m.getProjectCoverage()),
                m.getProjectBeneficiaries(), m.getProjectActivities(), m.getExpectedOutcome(),
                parseStrings(m.getAssociatedPartners()), firstOf(m.getResourcesAllocated()),
                m.getAdditionalSupportRequired(), m.getChallengesBarriersNeeds(),
                m.getPriority() == null ? null : m.getPriority().toLowerCase(Locale.ROOT));
    }

    private String firstOf(String json) {
        List<String> values = parseStrings(json);
        return values.isEmpty() ? null : values.get(0);
    }

    private List<String> parseStrings(String json) {
        if (!StringUtils.hasText(json)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() { });
        } catch (Exception e) {
            return List.of(json);
        }
    }

    private String json(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    private static String fmt(LocalDate date) {
        return date == null ? null : M_Y.format(date);
    }
}
