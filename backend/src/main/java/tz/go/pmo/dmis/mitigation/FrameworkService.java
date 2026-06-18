package tz.go.pmo.dmis.mitigation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Reproduces MitigationController's framework methods over the existing
 * {@code disaster_risk_frameworks} table: index (paginate 15 latest + 4 stats + 2 doughnut
 * datasets), AJAX show, store (draft relaxes the required rules, status defaults Active), update,
 * destroy — with the attachment upload/replace/delete semantics.
 */
@Service
@RequiredArgsConstructor
public class FrameworkService {

    private static final int PER_PAGE = 15;
    private static final ZoneId ZONE = ZoneId.of("Africa/Dar_es_Salaam");
    static final List<String> DOCUMENT_TYPES =
            List.of("Act", "Policies", "Regulations", "DRR Guidelines", "Plans and Strategies", "Other");
    static final List<String> HAZARD_TYPES =
            List.of("Floods", "Droughts", "Landslides", "Epidemics", "Cyclone", "Fire");
    static final List<String> GEOGRAPHIC_SCOPES =
            List.of("National", "Regional", "Districts", "Ward", "Village/Street");

    private final FrameworkRepository frameworks;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    @Value("${dmis.storage.public-root:${user.dir}/storage/public}")
    private String publicRoot;

    @Transactional(readOnly = true)
    public Map<String, Object> index(int page) {
        Page<DisasterRiskFramework> result = frameworks.findAll(
                PageRequest.of(Math.max(page, 1) - 1, PER_PAGE, Sort.by(Sort.Direction.DESC, "createdAt")));
        List<Map<String, Object>> rows = result.getContent().stream().map(this::toDetail).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("frameworks", rows);
        out.put("pagination", Map.of(
                "currentPage", result.getNumber() + 1,
                "lastPage", Math.max(result.getTotalPages(), 1),
                "total", result.getTotalElements(),
                "firstItem", result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + 1,
                "lastItem", result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + result.getNumberOfElements()));
        out.put("stats", Map.of(
                "total", frameworks.count(),
                "acts", frameworks.countByDocumentType("Act"),
                "policies", frameworks.countByDocumentType("Policies"),
                "national", frameworks.countByGeographicScope("National")));
        out.put("byDocType", jdbc.queryForList("select document_type, count(*) as total "
                + "from public.disaster_risk_frameworks where document_type is not null group by document_type"));
        out.put("byScope", jdbc.queryForList("select geographic_scope, count(*) as total "
                + "from public.disaster_risk_frameworks where geographic_scope is not null group by geographic_scope"));
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> show(Long id) {
        return toDetail(find(id));
    }

    @Transactional
    public Map<String, Object> store(FrameworkWriteRequest r) {
        validate(r, "draft".equalsIgnoreCase(r.getStatus() == null ? "" : r.getStatus()));
        DisasterRiskFramework fw = new DisasterRiskFramework();
        apply(fw, r);
        fw.setStatus(StringUtils.hasText(r.getStatus()) ? r.getStatus() : "Active");
        if (hasFile(r.getAttachment())) {
            fw.setAttachmentPath(storeFile(r.getAttachment()));
        }
        fw.setCreatedAt(Instant.now());
        fw.setUpdatedAt(Instant.now());
        return toDetail(frameworks.save(fw));
    }

    @Transactional
    public Map<String, Object> update(Long id, FrameworkWriteRequest r) {
        validate(r, false); // frameworkUpdate has no draft relaxation
        DisasterRiskFramework fw = find(id);
        apply(fw, r);
        if (StringUtils.hasText(r.getStatus())) {
            fw.setStatus(r.getStatus());
        }
        if (hasFile(r.getAttachment())) {
            deleteFile(fw.getAttachmentPath());
            fw.setAttachmentPath(storeFile(r.getAttachment()));
        }
        fw.setUpdatedAt(Instant.now());
        return toDetail(frameworks.save(fw));
    }

    @Transactional
    public void destroy(Long id) {
        DisasterRiskFramework fw = find(id);
        deleteFile(fw.getAttachmentPath());
        frameworks.delete(fw);
    }

    private DisasterRiskFramework find(Long id) {
        return frameworks.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Framework " + id + " not found"));
    }

    /** frameworkStore/Update validation: draft relaxes hazard_types/scope/narrative requirements. */
    private void validate(FrameworkWriteRequest r, boolean isDraft) {
        if (!DOCUMENT_TYPES.contains(r.getDocumentType())) {
            throw new BusinessRuleException("The selected document type is invalid.");
        }
        int year = LocalDate.now(ZONE).getYear();
        if (r.getYearOfApproval() == null || r.getYearOfApproval() < 1900 || r.getYearOfApproval() > year) {
            throw new BusinessRuleException("The year of approval must be between 1900 and " + year + ".");
        }
        if (!isDraft) {
            if (r.getHazardTypes() == null || r.getHazardTypes().isEmpty()) {
                throw new BusinessRuleException("The hazard types field is required.");
            }
            if (!StringUtils.hasText(r.getGeographicScope())) {
                throw new BusinessRuleException("The geographic scope field is required.");
            }
            if (!StringUtils.hasText(r.getNarrativeDescription())) {
                throw new BusinessRuleException("The narrative description field is required.");
            }
        }
        if (r.getHazardTypes() != null && !HAZARD_TYPES.containsAll(r.getHazardTypes())) {
            throw new BusinessRuleException("The selected hazard types are invalid.");
        }
        if (StringUtils.hasText(r.getGeographicScope()) && !GEOGRAPHIC_SCOPES.contains(r.getGeographicScope())) {
            throw new BusinessRuleException("The selected geographic scope is invalid.");
        }
        if (StringUtils.hasText(r.getNarrativeDescription()) && r.getNarrativeDescription().length() > 150) {
            throw new BusinessRuleException("The narrative description must not be greater than 150 characters.");
        }
        if (r.getImplementationPeriodEnd() != null && r.getImplementationPeriodStart() != null
                && !r.getImplementationPeriodEnd().isAfter(r.getImplementationPeriodStart())) {
            throw new BusinessRuleException("The implementation period end must be a date after implementation period start.");
        }
    }

    private void apply(DisasterRiskFramework fw, FrameworkWriteRequest r) {
        fw.setDocumentType(r.getDocumentType());
        fw.setDocumentTypeOther(nullIfLiteralNull(r.getDocumentTypeOther()));
        fw.setDocumentName(r.getDocumentName());
        fw.setYearOfApproval(r.getYearOfApproval());
        fw.setHazardTypes(json(r.getHazardTypes()));
        fw.setGeographicScope(r.getGeographicScope());
        fw.setNarrativeDescription(r.getNarrativeDescription());
        fw.setSectorsCovered(r.getSectorsCovered());
        fw.setKeyStakeholders(r.getKeyStakeholders());
        fw.setImplementationPeriodStart(r.getImplementationPeriodStart());
        fw.setImplementationPeriodEnd(r.getImplementationPeriodEnd());
        fw.setExternalLink(nullIfLiteralNull(r.getExternalLink()));
        fw.setRelatedDocuments(nullIfLiteralNull(r.getRelatedDocuments()));
        fw.setLanguage(StringUtils.hasText(r.getLanguage()) ? r.getLanguage() : "en");
    }

    /** The source strips the literal string 'null' some form fields post. */
    private static String nullIfLiteralNull(String value) {
        return "null".equals(value) ? null : value;
    }

    private static boolean hasFile(MultipartFile file) {
        return file != null && !file.isEmpty();
    }

    private String storeFile(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.contains(".")
                ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!List.of("pdf", "doc", "docx").contains(ext)) {
            throw new BusinessRuleException("The attachment must be a file of type: pdf, doc, docx.");
        }
        if (file.getSize() > 10240L * 1024) {
            throw new BusinessRuleException("The attachment must not be greater than 10240 kilobytes.");
        }
        try {
            Path dir = Path.of(publicRoot, "frameworks");
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            try (var in = file.getInputStream()) {
                Files.copy(in, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            }
            return "frameworks/" + name;
        } catch (IOException e) {
            throw new BusinessRuleException("Failed to store the attachment.");
        }
    }

    private void deleteFile(String relativePath) {
        if (!StringUtils.hasText(relativePath)) {
            return;
        }
        try {
            Files.deleteIfExists(Path.of(publicRoot, relativePath));
        } catch (IOException ignored) {
            // the record operation must not fail on a missing file
        }
    }

    private Map<String, Object> toDetail(DisasterRiskFramework fw) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", fw.getId());
        out.put("documentType", fw.getDocumentType());
        out.put("documentTypeOther", fw.getDocumentTypeOther());
        out.put("documentName", fw.getDocumentName());
        out.put("yearOfApproval", fw.getYearOfApproval());
        out.put("hazardTypes", parseStrings(fw.getHazardTypes()));
        out.put("geographicScope", fw.getGeographicScope());
        out.put("narrativeDescription", fw.getNarrativeDescription());
        out.put("status", fw.getStatus());
        out.put("sectorsCovered", fw.getSectorsCovered());
        out.put("keyStakeholders", fw.getKeyStakeholders());
        out.put("implementationPeriodStart", fw.getImplementationPeriodStart() == null ? null : fw.getImplementationPeriodStart().toString());
        out.put("implementationPeriodEnd", fw.getImplementationPeriodEnd() == null ? null : fw.getImplementationPeriodEnd().toString());
        out.put("attachmentPath", fw.getAttachmentPath());
        out.put("externalLink", fw.getExternalLink());
        out.put("language", fw.getLanguage() == null ? "en" : fw.getLanguage());
        out.put("relatedDocuments", fw.getRelatedDocuments());
        return out;
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
}
