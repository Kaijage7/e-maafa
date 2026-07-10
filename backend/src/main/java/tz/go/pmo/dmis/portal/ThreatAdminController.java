package tz.go.pmo.dmis.portal;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Hazard Monitor / Threat Monitoring — DMD manages the national threats shown on the
 * public front: the threat itself (source agency, trend, severity, graphic, bilingual
 * descriptions + past-impacts), its intervention timeline (UPCOMING/NEW → ONGOING → COMPLETED, or POSTPONED) and
 * the review status of stakeholder plan submissions.
 */
@RestController
@RequestMapping("/v1/content/threats")
@RequiredArgsConstructor
@Tag(name = "Hazards", description = "Threat monitoring (admin)")
public class ThreatAdminController {

    private static final List<String> SEVERITIES = List.of("Watch", "Warning", "Emergency");
    private static final List<String> UPDATE_STATUS = List.of("UPCOMING", "NEW", "ONGOING", "COMPLETED", "POSTPONED");
    private static final List<String> PLAN_STATUS = List.of("Submitted", "Under review", "Approved");
    private static final List<String> GRAPHIC_EXTENSIONS = List.of("jpg", "jpeg", "png", "webp", "gif");
    private static final long MAX_GRAPHIC_BYTES = 5L * 1024 * 1024;

    private final JdbcTemplate jdbc;

    @Value("${dmis.storage.public-root:${user.dir}/storage/public}")
    private String publicRoot;

    public record ThreatWrite(String name, String sourceAgency, String trendLabel, String severity,
                              String graphicPath, String descriptionEn, String descriptionSw,
                              String pastImpactsEn, String pastImpactsSw, Boolean isActive) {
    }

    public record UpdateWrite(String title, String detail, String status, String startsOn,
                              String endsOn, Integer sortOrder, Boolean isActive) {
    }

    @GetMapping
    @Operation(summary = "All threats + their updates and plan counts (admin)")
    @PreAuthorize("hasAuthority('hazards.view')")
    public Map<String, Object> index() {
        List<Map<String, Object>> threats = jdbc.queryForList(
                "select t.id, t.name, t.source_agency as \"sourceAgency\", t.trend_label as \"trendLabel\","
                        + " t.severity, t.is_active as \"isActive\","
                        + " (select count(*) from public.threat_updates u where u.threat_id = t.id) as \"updateCount\","
                        + " (select count(*) from public.threat_plans p where p.threat_id = t.id) as \"planCount\""
                        + " from public.threats t order by t.id");
        return Map.of("threats", threats);
    }

    @GetMapping("/{id}")
    @Operation(summary = "One threat with full updates + plans (admin editing view)")
    @PreAuthorize("hasAuthority('hazards.view')")
    public Map<String, Object> detail(@PathVariable long id) {
        Map<String, Object> threat = jdbc.queryForMap(
                "select id, name, source_agency as \"sourceAgency\", trend_label as \"trendLabel\", severity,"
                        + " graphic_path as \"graphicPath\", description_en as \"descriptionEn\","
                        + " description_sw as \"descriptionSw\", past_impacts_en as \"pastImpactsEn\","
                        + " past_impacts_sw as \"pastImpactsSw\", is_active as \"isActive\""
                        + " from public.threats where id = ?", id);
        List<Map<String, Object>> updates = jdbc.queryForList(
                "select id, title, detail, status, starts_on as \"startsOn\", ends_on as \"endsOn\","
                        + " sort_order as \"sortOrder\", is_active as \"isActive\""
                        + " from public.threat_updates where threat_id = ? order by sort_order, id", id);
        List<Map<String, Object>> plans = jdbc.queryForList(
                "select id, plan_title as \"planTitle\", stakeholder_type as \"stakeholderType\","
                        + " stakeholder_name as \"stakeholderName\", region, status,"
                        + " to_char(created_at, 'DD Mon YYYY') as \"submittedOn\""
                        + " from public.threat_plans where threat_id = ? order by created_at desc", id);
        return Map.of("threat", threat, "updates", updates, "plans", plans);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a threat")
    @PreAuthorize("hasAuthority('hazards.manage')")
    @Transactional
    public Map<String, Object> create(@RequestBody ThreatWrite req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Threat name is required");
        }
        Long id = jdbc.queryForObject(
                "insert into public.threats(name,source_agency,trend_label,severity,graphic_path,description_en,"
                        + "description_sw,past_impacts_en,past_impacts_sw,is_active,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,?,now(),now()) returning id", Long.class,
                req.name().trim(), req.sourceAgency(), req.trendLabel(),
                oneOfOr(req.severity(), SEVERITIES, "Watch"),
                req.graphicPath(), req.descriptionEn(), req.descriptionSw(),
                req.pastImpactsEn(), req.pastImpactsSw(), req.isActive() == null || req.isActive());
        return Map.of("id", id, "message", "Threat registered");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a threat")
    @PreAuthorize("hasAuthority('hazards.manage')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody ThreatWrite req) {
        int n = jdbc.update("update public.threats set name=coalesce(?,name),"
                        + " source_agency=coalesce(?,source_agency), trend_label=coalesce(?,trend_label),"
                        + " severity=coalesce(?,severity), graphic_path=coalesce(?,graphic_path),"
                        + " description_en=coalesce(?,description_en), description_sw=coalesce(?,description_sw),"
                        + " past_impacts_en=coalesce(?,past_impacts_en), past_impacts_sw=coalesce(?,past_impacts_sw),"
                        + " is_active=coalesce(?,is_active), updated_at=now() where id=?",
                req.name(), req.sourceAgency(), req.trendLabel(),
                oneOfOrNull(req.severity(), SEVERITIES),
                req.graphicPath(), req.descriptionEn(), req.descriptionSw(),
                req.pastImpactsEn(), req.pastImpactsSw(), req.isActive(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Threat not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @PostMapping(value = "/{id}/graphic", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload and attach the public graphic for a threat")
    @PreAuthorize("hasAuthority('hazards.manage')")
    @Transactional
    public Map<String, Object> uploadGraphic(@PathVariable long id, @RequestParam("file") MultipartFile file) {
        String relativePath = storeGraphic(file);
        int n = jdbc.update("update public.threats set graphic_path=?, updated_at=now() where id=?", relativePath, id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Threat not found");
        }
        return Map.of("id", id, "path", relativePath, "url", "/api/storage/" + relativePath);
    }

    @PostMapping("/{id}/updates")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a DMD intervention/update to the threat timeline")
    @PreAuthorize("hasAuthority('hazards.manage')")
    @Transactional
    public Map<String, Object> addUpdate(@PathVariable long id, @RequestBody UpdateWrite req) {
        if (req.title() == null || req.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Update title is required");
        }
        Long updateId = jdbc.queryForObject(
                "insert into public.threat_updates(threat_id,title,detail,status,starts_on,ends_on,sort_order,"
                        + "is_active,created_at,updated_at) values (?,?,?,?,?::date,?::date,?,true,now(),now())"
                        + " returning id", Long.class,
                id, req.title().trim(), req.detail(),
                oneOfOr(req.status(), UPDATE_STATUS, "NEW"),
                blank(req.startsOn()), blank(req.endsOn()), req.sortOrder() == null ? 0 : req.sortOrder());
        return Map.of("id", updateId, "message", "Update added to the timeline");
    }

    @PutMapping("/updates/{updateId}")
    @Operation(summary = "Edit a timeline entry (e.g. flip NEW → ONGOING → COMPLETED, or POSTPONED)")
    @PreAuthorize("hasAuthority('hazards.manage')")
    @Transactional
    public Map<String, Object> editUpdate(@PathVariable long updateId, @RequestBody UpdateWrite req) {
        int n = jdbc.update("update public.threat_updates set title=coalesce(?,title), detail=coalesce(?,detail),"
                        + " status=coalesce(?,status), starts_on=coalesce(?::date,starts_on),"
                        + " ends_on=coalesce(?::date,ends_on), is_active=coalesce(?,is_active), updated_at=now()"
                        + " where id=?",
                req.title(), req.detail(), oneOfOrNull(req.status(), UPDATE_STATUS),
                blank(req.startsOn()), blank(req.endsOn()), req.isActive(), updateId);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Timeline entry not found");
        }
        return Map.of("id", updateId, "message", "Timeline updated");
    }

    @PutMapping("/plans/{planId}/status")
    @Operation(summary = "Review a stakeholder plan (Submitted → Under review → Approved)")
    @PreAuthorize("hasAuthority('hazards.manage')")
    @Transactional
    public Map<String, Object> reviewPlan(@PathVariable long planId, @RequestBody Map<String, Object> req) {
        String status = String.valueOf(req.getOrDefault("status", "Under review"));
        if (!PLAN_STATUS.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Status must be one of: " + String.join(", ", PLAN_STATUS));
        }
        jdbc.update("update public.threat_plans set status=?, updated_at=now() where id=?", status, planId);
        return Map.of("id", planId, "status", status, "message", "Plan status updated");
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a threat (cascades its timeline + plans)")
    @PreAuthorize("hasAuthority('hazards.manage')")
    @Transactional
    public Map<String, Object> delete(@PathVariable long id) {
        jdbc.update("delete from public.threats where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    private static String blank(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }

    private static String oneOfOr(String value, List<String> allowed, String fallback) {
        return oneOfOrNull(value, allowed) == null ? fallback : value;
    }

    private static String oneOfOrNull(String value, List<String> allowed) {
        return value != null && allowed.contains(value) ? value : null;
    }

    private String storeGraphic(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.contains(".")
                ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!GRAPHIC_EXTENSIONS.contains(ext)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The file must be one of: " + String.join(", ", GRAPHIC_EXTENSIONS));
        }
        if (file.getSize() > MAX_GRAPHIC_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The file must not be greater than 5 MB");
        }
        try {
            if (!signatureMatches(file, ext)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "The file content does not match a ." + ext + " file");
            }
            Path dir = Path.of(publicRoot, "portal", "threats");
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            try (var in = file.getInputStream()) {
                Files.copy(in, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            }
            return "portal/threats/" + name;
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store the threat graphic");
        }
    }

    private static boolean signatureMatches(MultipartFile file, String ext) throws IOException {
        byte[] h = new byte[12];
        int n;
        try (var in = file.getInputStream()) {
            n = in.readNBytes(h, 0, 12);
        }
        return switch (ext) {
            case "jpg", "jpeg" -> n >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF;
            case "png" -> n >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G'
                    && (h[4] & 0xFF) == 0x0D && (h[5] & 0xFF) == 0x0A && (h[6] & 0xFF) == 0x1A && (h[7] & 0xFF) == 0x0A;
            case "gif" -> n >= 6 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8';
            case "webp" -> n >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                    && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P';
            default -> false;
        };
    }
}
