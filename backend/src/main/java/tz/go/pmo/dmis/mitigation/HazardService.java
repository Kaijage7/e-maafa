package tz.go.pmo.dmis.mitigation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Reproduces Admin/HazardController against the existing {@code hazards} table: the index payload
 * (paginate 15 ordered by type then name + 4 stats + 2 chart datasets), show, store, update,
 * updateStatus and the relation-guarded destroy.
 */
@Service
@RequiredArgsConstructor
public class HazardService {

    private static final int PER_PAGE = 15;

    private final MitHazardRepository hazards;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public HazardIndexResponse index(int page) {
        Page<MitHazard> result = hazards.findAllByOrderByTypeAscNameAsc(PageRequest.of(Math.max(page, 1) - 1, PER_PAGE));
        List<HazardIndexResponse.HazardRow> rows = result.getContent().stream()
                .map(h -> new HazardIndexResponse.HazardRow(h.getId(), h.getName(), h.getType(), h.getCategory(),
                        h.getSeverity(), h.getFrequency(), h.getSeasonalPattern(), Boolean.TRUE.equals(h.getIsActive())))
                .toList();
        HazardIndexResponse.Stats stats = new HazardIndexResponse.Stats(
                hazards.count(),
                hazards.countByType("Natural"),
                hazards.countByType("Human_induced"),
                hazards.countByIsActiveTrue());
        List<HazardIndexResponse.CategoryDatum> byCategory = hazards.countByCategory().stream()
                .map(c -> new HazardIndexResponse.CategoryDatum(c.getCategory(), c.getTotal()))
                .toList();
        List<HazardIndexResponse.SeverityFrequencyDatum> bySeverity = hazards.countBySeverityAndFrequency().stream()
                .map(c -> new HazardIndexResponse.SeverityFrequencyDatum(c.getSeverity(), c.getFrequency(), c.getTotal()))
                .toList();
        int first = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + 1;
        int last = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + result.getNumberOfElements();
        HazardIndexResponse.Pagination pagination = new HazardIndexResponse.Pagination(
                result.getNumber() + 1, Math.max(result.getTotalPages(), 1), result.getTotalElements(), first, last);
        return new HazardIndexResponse(rows, pagination, stats, byCategory, bySeverity);
    }

    @Transactional(readOnly = true)
    public HazardDetailResponse show(Long id) {
        return toDetail(find(id));
    }

    @Transactional
    public HazardDetailResponse store(HazardWriteRequest request) {
        if (hazards.existsByName(request.name())) {
            throw new BusinessRuleException("The name has already been taken.");
        }
        MitHazard hazard = new MitHazard();
        apply(hazard, request);
        // The create form posts every optional field (hidden, empty -> null), so they are all set.
        hazard.setSeverity(request.severity());
        hazard.setFrequency(request.frequency());
        hazard.setTypicalDuration(request.typicalDuration());
        hazard.setSeasonalPattern(request.seasonalPattern());
        hazard.setCreatedAt(Instant.now());
        return toDetail(hazards.save(hazard));
    }

    @Transactional
    public HazardDetailResponse update(Long id, HazardWriteRequest request) {
        MitHazard hazard = find(id);
        if (hazards.existsByNameAndIdNot(request.name(), id)) {
            throw new BusinessRuleException("The name has already been taken.");
        }
        apply(hazard, request);
        return toDetail(hazards.save(hazard));
    }

    @Transactional
    public void updateStatus(Long id, boolean isActive) {
        MitHazard hazard = find(id);
        hazard.setIsActive(isActive);
        hazard.setUpdatedAt(Instant.now());
        hazards.save(hazard);
    }

    @Transactional
    public void destroy(Long id) {
        MitHazard hazard = find(id);
        // HazardController@destroy guards — a hazard with dependents must not be deleted.
        if (hasRows("early_warnings", "hazard_id = ?", hazard.getId())) {
            throw new BusinessRuleException("Cannot delete hazard with associated early warnings.");
        }
        if (hasRows("anticipatory_action_plans", "hazard_type = ?", hazard.getName())) {
            throw new BusinessRuleException("Cannot delete hazard with associated anticipatory action plans.");
        }
        if (hasRows("contingency_plans", "hazard_type = ?", hazard.getName())) {
            throw new BusinessRuleException("Cannot delete hazard with associated contingency plans.");
        }
        hazards.delete(hazard);
    }

    private MitHazard find(Long id) {
        return hazards.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Hazard " + id + " not found"));
    }

    /**
     * The fields BOTH existing forms post. Deliberate fix of a source defect: the Laravel update sets
     * is_active from $request->has('is_active') and the edit form never posts it, silently
     * deactivating on every save — here is_active only changes when the request provides it.
     */
    private void apply(MitHazard hazard, HazardWriteRequest request) {
        hazard.setName(request.name());
        hazard.setType(request.type());
        hazard.setDescription(request.description());
        hazard.setCategory(request.category());
        hazard.setSeverityScale(request.severityScale());
        if (request.isActive() != null) {
            hazard.setIsActive(request.isActive());
        } else if (hazard.getIsActive() == null) {
            hazard.setIsActive(true);
        }
        hazard.setUpdatedAt(Instant.now());
    }

    /** Existence check tolerant of the dependent table not existing on a standalone local database. */
    private boolean hasRows(String table, String where, Object param) {
        Boolean tableExists = jdbc.queryForObject("select to_regclass('public." + table + "') is not null", Boolean.class);
        if (!Boolean.TRUE.equals(tableExists)) {
            return false;
        }
        Boolean exists = jdbc.queryForObject("select exists(select 1 from public." + table + " where " + where + ")",
                Boolean.class, param);
        return Boolean.TRUE.equals(exists);
    }

    private HazardDetailResponse toDetail(MitHazard h) {
        return new HazardDetailResponse(h.getId(), h.getName(), h.getType(), h.getCategory(), h.getSeverity(),
                h.getFrequency(), h.getSeverityScale(), h.getDescription(), h.getTypicalDuration(),
                h.getSeasonalPattern(), Boolean.TRUE.equals(h.getIsActive()),
                parse(h.getWarningSigns()), parse(h.getImpactAreas()), parse(h.getResponseRequired()),
                parse(h.getPreventionMeasures()), parse(h.getHistoricalIncidents()), parse(h.getAffectedSectors()),
                parse(h.getVulnerabilityFactors()));
    }

    private List<String> parse(String json) {
        if (!StringUtils.hasText(json)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() { });
        } catch (Exception e) {
            return List.of(json);
        }
    }
}
