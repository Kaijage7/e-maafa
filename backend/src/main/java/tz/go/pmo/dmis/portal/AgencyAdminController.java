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
 * Content Management → Agencies — partner agency registry CRUD over agencies,
 * reproducing Admin/AgencyController (the EWE institutions + partners directory).
 */
@RestController
@RequestMapping("/v1/content/agencies")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Partner agencies (admin)")
public class AgencyAdminController {

    private final JdbcTemplate jdbc;

    public record AgencyWriteRequest(String name, String acronym, String agencyType, String mandateDescription,
                                     String contactPersonName, String contactPersonEmail, String contactPersonPhone,
                                     String website, Boolean isActive) {
    }

    @GetMapping
    @Operation(summary = "Agency registry + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> items = jdbc.queryForList(
                "select id, name, acronym, agency_type as \"agencyType\", mandate_description as \"mandate\","
                        + " contact_person_name as \"contactPersonName\", contact_person_email as \"contactPersonEmail\","
                        + " contact_person_phone as \"contactPersonPhone\", website, is_active as \"isActive\""
                        + " from public.agencies order by name");
        long active = items.stream().filter(i -> Boolean.TRUE.equals(i.get("isActive"))).count();
        long government = items.stream().filter(i -> "Government".equals(i.get("agencyType"))).count();
        return Map.of("items", items,
                "stats", Map.of("total", items.size(), "active", active, "government", government,
                        "other", items.size() - government));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register an agency")
    @PreAuthorize("hasAuthority('user_management.manage')")
    @Transactional
    public Map<String, Object> create(@RequestBody AgencyWriteRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agency name is required");
        }
        Long id = jdbc.queryForObject(
                "insert into public.agencies(name,acronym,agency_type,mandate_description,contact_person_name,"
                        + "contact_person_email,contact_person_phone,website,is_active,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,now(),now()) returning id", Long.class,
                req.name().trim(), req.acronym(), req.agencyType() == null ? "Government" : req.agencyType(),
                req.mandateDescription(), req.contactPersonName(), req.contactPersonEmail(),
                req.contactPersonPhone(), req.website(), req.isActive() == null || req.isActive());
        return Map.of("id", id, "message", "Agency registered");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an agency")
    @PreAuthorize("hasAuthority('user_management.manage')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody AgencyWriteRequest req) {
        int n = jdbc.update("update public.agencies set name=coalesce(?,name), acronym=coalesce(?,acronym),"
                        + " agency_type=coalesce(?,agency_type), mandate_description=coalesce(?,mandate_description),"
                        + " contact_person_name=coalesce(?,contact_person_name),"
                        + " contact_person_email=coalesce(?,contact_person_email),"
                        + " contact_person_phone=coalesce(?,contact_person_phone), website=coalesce(?,website),"
                        + " is_active=coalesce(?,is_active), updated_at=now() where id=?",
                req.name(), req.acronym(), req.agencyType(), req.mandateDescription(), req.contactPersonName(),
                req.contactPersonEmail(), req.contactPersonPhone(), req.website(), req.isActive(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agency not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    /**
     * Delete an agency (ports the source's {@code destroy()} — completes the CRUD the auditor
     * flagged as missing in A9). Blocked while the agency is referenced by operational rows
     * (agency stock, incidents) so we surface a clear 409 rather than an FK 500; deactivate instead.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete an agency (blocked if referenced; deactivate instead)")
    @PreAuthorize("hasAuthority('user_management.manage')")
    @Transactional
    public void delete(@PathVariable long id) {
        Long exists = jdbc.queryForObject("select count(*) from public.agencies where id = ?", Long.class, id);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agency not found");
        }
        Long refs = jdbc.queryForObject(
                "select (select count(*) from public.agency_resources where agency_id = ?)"
                        + " + (select count(*) from public.incidents where agency_id = ?)", Long.class, id, id);
        if (refs != null && refs > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This agency is referenced by " + refs + " operational record(s) — deactivate it instead.");
        }
        jdbc.update("delete from public.agencies where id = ?", id);
    }
}
