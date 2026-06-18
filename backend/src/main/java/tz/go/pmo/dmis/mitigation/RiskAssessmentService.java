package tz.go.pmo.dmis.mitigation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Reproduces Admin/RiskAssessmentController over the existing {@code risk_assessments} table:
 * the index (priority-desc page + PAGE-SCOPED stats), AJAX show, store with the SRS field set
 * (code generation, matrix calculation, draft/submit action, repository-entry id, version init),
 * the narrower update (approval transition, attachment append, matrix recalc, NO version append),
 * destroy (deletes stored files), approve and publish.
 */
@Service
@RequiredArgsConstructor
public class RiskAssessmentService {

    private static final int PER_PAGE = 15;
    private static final ZoneId ZONE = ZoneId.of("Africa/Dar_es_Salaam");
    private static final DateTimeFormatter D_M_Y = DateTimeFormatter.ofPattern("dd MMM, yyyy", Locale.ENGLISH);

    static final List<String> RISK_LEVELS = List.of("Low", "Medium", "High", "Very High", "Critical");
    static final List<String> LIKELIHOODS = List.of("Rare", "Unlikely", "Possible", "Likely", "Almost Certain");
    static final List<String> SEVERITIES = List.of("Insignificant", "Minor", "Moderate", "Major", "Catastrophic");
    static final List<String> STATUSES = List.of("draft", "under_review", "approved", "published");
    static final List<String> KNOWLEDGE_TYPES = List.of("case_study", "best_practice", "lesson_learned", "research_report", "technical_guide");
    static final List<String> VISIBILITY_LEVELS = List.of("public", "restricted", "internal");
    static final List<String> PLAN_TYPES = List.of("anticipatory", "contingency");

    private final RiskAssessmentRepository assessments;
    private final MitHazardRepository hazards;
    private final ObjectMapper objectMapper;

    @Value("${dmis.storage.public-root:${user.dir}/storage/public}")
    private String publicRoot;

    /* ===================== READ ===================== */

    @Transactional(readOnly = true)
    public RiskAssessmentResponses.Index index(int page) {
        Page<RiskAssessment> result = assessments.pageForIndex(PageRequest.of(Math.max(page, 1) - 1, PER_PAGE));
        List<RiskAssessmentResponses.Row> rows = result.getContent().stream().map(this::toRow).toList();
        // DELIBERATE FIX of the source quirk: real aggregates instead of the page-scoped collection counts.
        RiskAssessmentResponses.Stats stats = new RiskAssessmentResponses.Stats(
                result.getTotalElements(),
                assessments.countByRiskLevelIn(List.of("High", "Very High", "Critical")),
                assessments.countByIsPublishedTrue(),
                assessments.countByAssessmentStatus("under_review"));
        List<RiskAssessmentResponses.HazardOption> hazardOptions =
                hazards.findAll(org.springframework.data.domain.Sort.by("name")).stream()
                        .map(h -> new RiskAssessmentResponses.HazardOption(h.getId(), h.getName()))
                        .toList();
        int first = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + 1;
        int last = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + result.getNumberOfElements();
        return new RiskAssessmentResponses.Index(rows,
                new RiskAssessmentResponses.Pagination(result.getNumber() + 1, Math.max(result.getTotalPages(), 1),
                        result.getTotalElements(), first, last),
                stats, hazardOptions);
    }

    @Transactional(readOnly = true)
    public RiskAssessmentResponses.Detail show(Long id) {
        return toDetail(find(id));
    }

    /* ===================== WRITE ===================== */

    @Transactional
    public RiskAssessmentResponses.Detail store(RiskAssessmentWriteRequest r) {
        validateOptions(r, true);
        if (!hazards.existsById(r.getHazardId())) {
            throw new BusinessRuleException("The selected hazard id is invalid.");
        }
        RiskAssessment a = new RiskAssessment();
        applyCommon(a, r);
        // SRS-only fields (store validation set)
        a.setPlanType(r.getPlanType());
        a.setCoverageRegions(json(splitComma(r.getCoverageRegions())));
        a.setSectors(json(splitComma(r.getSectors())));
        a.setCategoryTags(json(splitComma(r.getCategoryTags())));
        a.setKeyLessons(json(splitLines(r.getKeyLessons())));
        a.setEducationPlanning(r.getEducationPlanning() == null ? null
                : json(Map.of("description", r.getEducationPlanning())));
        a.setTimeframe(r.getTimeframe());
        a.setKnowledgeType(r.getKnowledgeType());
        a.setNarrativeDescription(r.getNarrativeDescription());
        a.setImplementationPeriod(r.getImplementationPeriod());
        a.setChallengesEncountered(r.getChallengesEncountered());
        a.setSuccessFactors(r.getSuccessFactors());
        a.setRecommendations(r.getRecommendations());
        a.setAwarenessType(r.getAwarenessType());
        a.setTargetAudience(r.getTargetAudience());
        a.setAuthor(r.getAuthor());
        a.setVisibilityLevel(StringUtils.hasText(r.getVisibilityLevel()) ? r.getVisibilityLevel() : "internal");
        a.setDeliveryChannels(json(r.getDeliveryChannels()));
        a.setIsPostDisaster(Boolean.TRUE.equals(r.getIsPostDisaster()));
        // controller-set values
        a.setAssessmentCode(generateAssessmentCode());
        a.setAssessedBy(StringUtils.hasText(r.getAssessedBy()) ? r.getAssessedBy() : currentUserName());
        a.setRiskMatrix(json(calculateRiskMatrix(r.getLikelihood(), r.getSeverityOfImpact())));
        if ("submit".equals(r.getAction())) {
            a.setAssessmentStatus("under_review");
            a.setSubmittedForApprovalAt(Instant.now());
        } else {
            a.setAssessmentStatus("draft");
        }
        if (StringUtils.hasText(r.getKnowledgeType())) {
            a.setRepositoryEntryId(generateRepositoryEntryId());
        }
        a.setVersion(1);
        a.setVersionHistory(json(List.of(Map.of(
                "version", 1,
                "created_at", Instant.now().toString(),
                "created_by", currentUserName(),
                "changes", "Initial creation"))));
        a.setAttachments(storeFiles(r.getAttachments(), "risk-assessments/attachments", null));
        a.setRiskMaps(storeFiles(r.getRiskMaps(), "risk-assessments/risk-maps", "risk_map"));
        a.setHazardMaps(storeFiles(r.getHazardMaps(), "risk-assessments/hazard-maps", "hazard_map"));
        a.setMediaFiles(storeFiles(r.getMediaFiles(), "risk-assessments/media", null));
        a.setIsPublished(false);
        a.setCreatedAt(Instant.now());
        a.setUpdatedAt(Instant.now());
        return toDetail(assessments.save(a));
    }

    @Transactional
    public RiskAssessmentResponses.Detail update(Long id, RiskAssessmentWriteRequest r) {
        validateOptions(r, false);
        RiskAssessment a = find(id);
        // Approval transition (update validation allows assessment_status).
        if (StringUtils.hasText(r.getAssessmentStatus())) {
            if (!STATUSES.contains(r.getAssessmentStatus())) {
                throw new BusinessRuleException("The selected assessment status is invalid.");
            }
            if ("approved".equals(r.getAssessmentStatus()) && !"approved".equals(a.getAssessmentStatus())) {
                a.setApprovedBy(currentUserDbId());
                a.setApprovedDate(Instant.now());
            }
            a.setAssessmentStatus(r.getAssessmentStatus());
        }
        applyCommon(a, r);
        // Attachments append to the existing list (update behavior).
        String appended = storeFiles(r.getAttachments(), "risk-assessments/attachments", null);
        if (appended != null) {
            List<Map<String, Object>> existing = parseList(a.getAttachments());
            existing.addAll(parseList(appended));
            a.setAttachments(json(existing));
        }
        a.setRiskMatrix(json(calculateRiskMatrix(r.getLikelihood(), r.getSeverityOfImpact())));
        // DELIBERATE FIX of the source quirk: every update appends a version entry.
        int nextVersion = (a.getVersion() == null ? 1 : a.getVersion()) + 1;
        a.setVersion(nextVersion);
        List<Map<String, Object>> history = parseList(a.getVersionHistory());
        history.add(Map.of(
                "version", nextVersion,
                "created_at", Instant.now().toString(),
                "created_by", currentUserName(),
                "changes", "Updated assessment details"));
        a.setVersionHistory(json(history));
        a.setUpdatedAt(Instant.now());
        return toDetail(assessments.save(a));
    }

    @Transactional
    public void destroy(Long id) {
        RiskAssessment a = find(id);
        for (String field : new String[]{a.getAttachments(), a.getRiskMaps(), a.getHazardMaps(), a.getMediaFiles()}) {
            for (Map<String, Object> file : parseList(field)) {
                Object path = file.get("path");
                if (path != null) {
                    try {
                        Files.deleteIfExists(Path.of(publicRoot, path.toString()));
                    } catch (IOException ignored) {
                        // record deletion must not fail on a missing file
                    }
                }
            }
        }
        assessments.delete(a);
    }

    @Transactional
    public void approve(Long id) {
        RiskAssessment a = find(id);
        a.setAssessmentStatus("approved");
        a.setApprovedBy(currentUserDbId());
        a.setApprovedDate(Instant.now());
        a.setUpdatedAt(Instant.now());
        assessments.save(a);
    }

    @Transactional
    public void publish(Long id) {
        RiskAssessment a = find(id);
        if (!"approved".equals(a.getAssessmentStatus())) {
            throw new BusinessRuleException("Only approved assessments can be published.");
        }
        a.setAssessmentStatus("published");
        a.setIsPublished(true);
        a.setUpdatedAt(Instant.now());
        assessments.save(a);
    }

    /* ===================== INTERNALS ===================== */

    private RiskAssessment find(Long id) {
        return assessments.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Risk assessment " + id + " not found"));
    }

    /** Fields validated by BOTH store and update. */
    private void applyCommon(RiskAssessment a, RiskAssessmentWriteRequest r) {
        a.setAssessmentTitle(r.getAssessmentTitle());
        a.setHazardId(r.getHazardId());
        a.setLocationName(r.getLocationName());
        a.setDistrictCouncil(r.getDistrictCouncil());
        a.setWard(r.getWard());
        a.setVillage(r.getVillage());
        a.setLatitude(r.getLatitude() == null ? null : BigDecimal.valueOf(r.getLatitude()));
        a.setLongitude(r.getLongitude() == null ? null : BigDecimal.valueOf(r.getLongitude()));
        a.setPopulationAtRisk(r.getPopulationAtRisk());
        a.setHouseholdsAffected(r.getHouseholdsAffected());
        a.setVulnerableGroups(json(r.getVulnerableGroups()));
        a.setRiskLevel(r.getRiskLevel());
        a.setLikelihood(r.getLikelihood());
        a.setSeverityOfImpact(r.getSeverityOfImpact());
        a.setImpactDescription(r.getImpactDescription());
        a.setEconomicImpact(r.getEconomicImpact() == null ? null : BigDecimal.valueOf(r.getEconomicImpact()));
        a.setCriticalInfrastructure(json(r.getCriticalInfrastructure()));
        a.setEnvironmentalImpact(json(r.getEnvironmentalImpact()));
        a.setExistingControls(r.getExistingControls());
        a.setEarlyWarningSystems(r.getEarlyWarningSystems());
        a.setEvacuationPlan(r.getEvacuationPlan());
        a.setStakeholders(json(r.getStakeholders()));
        a.setRecommendedActions(r.getRecommendedActions());
        a.setMitigationBudget(r.getMitigationBudget() == null ? null : BigDecimal.valueOf(r.getMitigationBudget()));
        a.setFundingSource(r.getFundingSource());
        a.setAssessmentDate(r.getAssessmentDate());
        a.setReviewDate(r.getReviewDate());
        if (r.getReviewDate() != null && r.getAssessmentDate() != null
                && r.getReviewDate().isBefore(r.getAssessmentDate())) {
            throw new BusinessRuleException("The review date must be a date after or equal to assessment date.");
        }
        a.setPriorityLevel(r.getPriorityLevel());
        a.setLessonsLearned(r.getLessonsLearned());
        if (StringUtils.hasText(r.getAssessedBy())) {
            a.setAssessedBy(r.getAssessedBy());
        }
    }

    private void validateOptions(RiskAssessmentWriteRequest r, boolean isStore) {
        requireIn(r.getRiskLevel(), RISK_LEVELS, "risk level");
        requireIn(r.getLikelihood(), LIKELIHOODS, "likelihood");
        requireIn(r.getSeverityOfImpact(), SEVERITIES, "severity of impact");
        if (isStore) {
            optionalIn(r.getPlanType(), PLAN_TYPES, "plan type");
            optionalIn(r.getKnowledgeType(), KNOWLEDGE_TYPES, "knowledge type");
            optionalIn(r.getVisibilityLevel(), VISIBILITY_LEVELS, "visibility level");
        }
    }

    private static void requireIn(String value, List<String> allowed, String field) {
        if (value == null || !allowed.contains(value)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
        }
    }

    private static void optionalIn(String value, List<String> allowed, String field) {
        if (StringUtils.hasText(value) && !allowed.contains(value)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
        }
    }

    /** calculateRiskMatrix(), verbatim scoring. */
    static Map<String, Object> calculateRiskMatrix(String likelihood, String severity) {
        int likelihoodScore = Math.max(LIKELIHOODS.indexOf(likelihood) + 1, 1);
        int severityScore = Math.max(SEVERITIES.indexOf(severity) + 1, 1);
        int riskScore = likelihoodScore * severityScore;
        String riskLevel = riskScore <= 4 ? "Low" : riskScore <= 9 ? "Medium"
                : riskScore <= 14 ? "High" : riskScore <= 19 ? "Very High" : "Critical";
        Map<String, Object> matrix = new LinkedHashMap<>();
        matrix.put("likelihood_score", likelihoodScore);
        matrix.put("severity_score", severityScore);
        matrix.put("risk_score", riskScore);
        matrix.put("risk_level", riskLevel);
        matrix.put("matrix_position", Map.of("x", likelihoodScore, "y", severityScore));
        return matrix;
    }

    /** RA-YYYYMM-#### scanning the current month, mirroring generateAssessmentCode(). */
    private String generateAssessmentCode() {
        YearMonth now = YearMonth.now(ZONE);
        Instant from = now.atDay(1).atStartOfDay(ZONE).toInstant();
        Instant to = now.plusMonths(1).atDay(1).atStartOfDay(ZONE).toInstant().minus(Duration.ofMillis(1));
        int sequence = assessments.findFirstByCreatedAtBetweenOrderByIdDesc(from, to)
                .map(last -> {
                    String code = last.getAssessmentCode();
                    try {
                        return Integer.parseInt(code.substring(code.length() - 4)) + 1;
                    } catch (Exception e) {
                        return 1;
                    }
                })
                .orElse(1);
        return "RA-" + now.getYear() + String.format("%02d", now.getMonthValue()) + "-"
                + String.format("%04d", sequence);
    }

    /** REP-YYYY-###### mirroring generateRepositoryEntryId(). */
    private String generateRepositoryEntryId() {
        int year = LocalDate.now(ZONE).getYear();
        Instant from = LocalDate.of(year, 1, 1).atStartOfDay(ZONE).toInstant();
        Instant to = LocalDate.of(year + 1, 1, 1).atStartOfDay(ZONE).toInstant().minus(Duration.ofMillis(1));
        int sequence = assessments.findFirstByRepositoryEntryIdNotNullAndCreatedAtBetweenOrderByIdDesc(from, to)
                .map(last -> {
                    var m = java.util.regex.Pattern.compile("REP-(\\d{4})-(\\d{6})")
                            .matcher(last.getRepositoryEntryId());
                    return m.matches() ? Integer.parseInt(m.group(2)) + 1 : 1;
                })
                .orElse(1);
        return "REP-" + year + "-" + String.format("%06d", sequence);
    }

    /** Stores uploads and returns the JSON metadata array Laravel builds (name/path/size/uploaded_at). */
    private String storeFiles(List<MultipartFile> files, String dir, String type) {
        if (files == null || files.stream().allMatch(f -> f == null || f.isEmpty())) {
            return null;
        }
        List<Map<String, Object>> entries = new ArrayList<>();
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                continue;
            }
            try {
                Path target = Path.of(publicRoot, dir);
                Files.createDirectories(target);
                String original = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename();
                String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
                String stored = UUID.randomUUID() + ext;
                try (var in = file.getInputStream()) {
                    Files.copy(in, target.resolve(stored), StandardCopyOption.REPLACE_EXISTING);
                }
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("name", original);
                entry.put("path", dir + "/" + stored);
                entry.put("size", file.getSize());
                if (type != null) {
                    entry.put("type", type);
                }
                entry.put("uploaded_at", Instant.now().toString());
                entries.add(entry);
            } catch (IOException e) {
                throw new BusinessRuleException("Failed to store an uploaded file.");
            }
        }
        return entries.isEmpty() ? null : json(entries);
    }

    private RiskAssessmentResponses.Row toRow(RiskAssessment a) {
        return new RiskAssessmentResponses.Row(a.getId(), a.getPriorityLevel(), a.getAssessmentCode(),
                a.getAssessmentTitle(), a.getPlanType(),
                a.getHazard() != null ? a.getHazard().getName() : null,
                a.getLocationName(), a.getDistrictCouncil(), a.getRiskLevel(), a.getAssessmentStatus(),
                Boolean.TRUE.equals(a.getIsPublished()),
                a.getAssessmentDate() == null ? null : D_M_Y.format(a.getAssessmentDate()),
                relative(a.getAssessmentDate()));
    }

    /** Carbon diffForHumans, to the precision the table shows. */
    private static String relative(LocalDate date) {
        if (date == null) {
            return "";
        }
        long days = java.time.temporal.ChronoUnit.DAYS.between(date, LocalDate.now(ZONE));
        if (days == 0) {
            return "today";
        }
        String unit;
        long amount;
        long abs = Math.abs(days);
        if (abs >= 365) {
            amount = abs / 365;
            unit = "year";
        } else if (abs >= 30) {
            amount = abs / 30;
            unit = "month";
        } else if (abs >= 7) {
            amount = abs / 7;
            unit = "week";
        } else {
            amount = abs;
            unit = "day";
        }
        String phrase = amount + " " + unit + (amount > 1 ? "s" : "");
        return days > 0 ? phrase + " ago" : phrase + " from now";
    }

    private RiskAssessmentResponses.Detail toDetail(RiskAssessment a) {
        String hazardName = a.getHazardId() == null ? null
                : hazards.findById(a.getHazardId()).map(MitHazard::getName).orElse(null);
        return new RiskAssessmentResponses.Detail(a.getId(), a.getAssessmentCode(), a.getPlanType(),
                a.getAssessmentTitle(), a.getHazardId(), hazardName, a.getLocationName(),
                a.getDistrictCouncil(), a.getWard(), a.getVillage(),
                a.getLatitude() == null ? null : a.getLatitude().doubleValue(),
                a.getLongitude() == null ? null : a.getLongitude().doubleValue(),
                a.getPopulationAtRisk(), a.getHouseholdsAffected(), parseStrings(a.getVulnerableGroups()),
                a.getRiskLevel(), a.getLikelihood(), a.getSeverityOfImpact(), parseMap(a.getRiskMatrix()),
                a.getImpactDescription(),
                a.getEconomicImpact() == null ? null : a.getEconomicImpact().doubleValue(),
                parseStrings(a.getCriticalInfrastructure()), parseStrings(a.getEnvironmentalImpact()),
                a.getExistingControls(), a.getEarlyWarningSystems(), a.getEvacuationPlan(),
                parseStrings(a.getStakeholders()), a.getRecommendedActions(),
                a.getMitigationBudget() == null ? null : a.getMitigationBudget().doubleValue(),
                a.getFundingSource(),
                a.getAssessmentDate() == null ? null : a.getAssessmentDate().toString(),
                a.getAssessedBy(),
                a.getReviewDate() == null ? null : a.getReviewDate().toString(),
                a.getAssessmentStatus(), Boolean.TRUE.equals(a.getIsPublished()), a.getPriorityLevel(),
                a.getLessonsLearned(), parseStrings(a.getCoverageRegions()), parseStrings(a.getSectors()),
                a.getTimeframe(), a.getKnowledgeType(), a.getNarrativeDescription(),
                parseStrings(a.getKeyLessons()), a.getImplementationPeriod(), a.getChallengesEncountered(),
                a.getSuccessFactors(), a.getRecommendations(), a.getAwarenessType(), a.getTargetAudience(),
                parseStrings(a.getCategoryTags()), a.getAuthor(), a.getVisibilityLevel(),
                parseStrings(a.getDeliveryChannels()), Boolean.TRUE.equals(a.getIsPostDisaster()),
                a.getRepositoryEntryId(), a.getVersion(), parseList(a.getVersionHistory()),
                a.getCreatedAt() == null ? null : a.getCreatedAt().toString());
    }

    private static List<String> splitComma(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return Arrays.stream(value.split(",")).map(String::trim).toList();
    }

    private static List<String> splitLines(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return Arrays.stream(value.split("\n")).map(String::trim).filter(s -> !s.isEmpty()).toList();
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

    private List<Map<String, Object>> parseList(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() { });
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private Map<String, Object> parseMap(String json) {
        if (!StringUtils.hasText(json)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception e) {
            return Map.of();
        }
    }

    /** auth()->id() equivalent — users.id when the principal carries a numeric subject, else null. */
    private static Long currentUserDbId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            try {
                return Long.parseLong(jwt.getSubject());
            } catch (Exception notNumeric) {
                return null;
            }
        }
        return null;
    }

    /** auth()->user()->name ?? 'System'. */
    private static String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            Object name = jwt.getClaims().get("name");
            if (name != null) {
                return name.toString();
            }
        }
        return "System";
    }
}
