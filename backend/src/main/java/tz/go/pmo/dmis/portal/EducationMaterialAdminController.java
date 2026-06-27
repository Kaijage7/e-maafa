package tz.go.pmo.dmis.portal;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Content Management → Public Awareness — the hazard education repository. Every material is
 * tied to a hazard and an AUDIENCE (children / adults / persons with disabilities / all) and is
 * one of: action guide (action statements), video, document or poster. The public hazard hubs
 * (/education/hazard/{name}) render exactly what is managed here.
 */
@RestController
@RequestMapping("/v1/content/education-materials")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Hazard education materials (admin)")
public class EducationMaterialAdminController {

    /** Allowed audience + type vocabularies — kept server-side so bad values can't reach the hubs. */
    private static final List<String> AUDIENCES = List.of("children", "adults", "disabilities", "all");
    private static final List<String> TYPES = List.of("action_guide", "video", "document", "poster", "other");
    private static final List<String> PHASES = List.of("before", "during", "after", "any");

    private final JdbcTemplate jdbc;

    public record MaterialWrite(String hazard, String audience, String materialType, String title,
                                String body, String titleSw, String bodySw, String videoUrl,
                                String filePath, Integer sortOrder, Boolean isActive, String phase) {
    }

    @GetMapping
    @Operation(summary = "All materials + per-hazard counts (admin list)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> items = jdbc.queryForList(
                "select id, hazard, audience, material_type as \"materialType\", title, body,"
                        + " title_sw as \"titleSw\", body_sw as \"bodySw\","
                        + " video_url as \"videoUrl\", file_path as \"filePath\", sort_order as \"sortOrder\", phase,"
                        + " is_active as \"isActive\" from public.education_materials"
                        + " order by hazard, audience, sort_order, id");
        List<Map<String, Object>> counts = jdbc.queryForList(
                "select hazard, count(*) as count from public.education_materials group by hazard order by hazard");
        return Map.of("items", items, "counts", counts);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a material to a hazard's repository")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> create(@RequestBody MaterialWrite req) {
        validate(req);
        Long id = jdbc.queryForObject(
                "insert into public.education_materials(hazard,audience,material_type,title,body,title_sw,body_sw,"
                        + "video_url,file_path,sort_order,is_active,phase,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,?,?,?,now(),now()) returning id", Long.class,
                req.hazard().trim(), req.audience(), req.materialType(), req.title().trim(),
                req.body(), blankToNull(req.titleSw()), blankToNull(req.bodySw()),
                req.videoUrl(), req.filePath(),
                req.sortOrder() == null ? 0 : req.sortOrder(), req.isActive() == null || req.isActive(),
                PHASES.contains(req.phase()) ? req.phase() : "any");
        return Map.of("id", id, "message", "Material added");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a material")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody MaterialWrite req) {
        validate(req);
        int n = jdbc.update("update public.education_materials set hazard=?, audience=?, material_type=?,"
                        + " title=?, body=?, title_sw=?, body_sw=?, video_url=?, file_path=?,"
                        + " sort_order=coalesce(?, sort_order),"
                        + " is_active=coalesce(?, is_active), phase=?, updated_at=now() where id=?",
                req.hazard().trim(), req.audience(), req.materialType(), req.title().trim(),
                req.body(), blankToNull(req.titleSw()), blankToNull(req.bodySw()),
                req.videoUrl(), req.filePath(), req.sortOrder(), req.isActive(),
                PHASES.contains(req.phase()) ? req.phase() : "any", id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a material")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> delete(@PathVariable long id) {
        jdbc.update("delete from public.education_materials where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    /** Empty/blank Swahili fields are stored as NULL so the public side falls back to English. */
    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private static void validate(MaterialWrite req) {
        if (req.hazard() == null || req.hazard().isBlank() || req.title() == null || req.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hazard and title are required");
        }
        if (!AUDIENCES.contains(req.audience())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Audience must be one of: " + String.join(", ", AUDIENCES));
        }
        if (!TYPES.contains(req.materialType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Type must be one of: " + String.join(", ", TYPES));
        }
    }
}
