package tz.go.pmo.dmis.service.impl;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.AgencyAdminService;

/**
 * System Settings -> Agencies — partner agency registry CRUD over agencies,
 * reproducing Admin/AgencyController (the EWE institutions + partners directory).
 */
@Service
@lombok.RequiredArgsConstructor
public class AgencyAdminServiceImpl implements AgencyAdminService {


    private final JdbcTemplate jdbc;
	    @Override
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

    @Override
    @Transactional
    public Map<String, Object> create(AgencyAdminService.AgencyWriteRequest req) {
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

    @Override
    @Transactional
    public Map<String, Object> update(long id, AgencyAdminService.AgencyWriteRequest req) {
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
    @Override
    @Transactional
    public void delete(long id) {
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
