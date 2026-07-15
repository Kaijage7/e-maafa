package tz.go.pmo.dmis.service.impl;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.dto.request.MobileIncidentCreateRequest;
import tz.go.pmo.dmis.service.IncidentService;
import tz.go.pmo.dmis.service.MobileIncidentCommandService;

/**
 * Typed, file-free adapter over the authoritative incident REST/domain command. Idempotency is owned by
 * {@link tz.go.pmo.dmis.common.idempotency.ApiIdempotencyService} inside {@link IncidentService}, so web and
 * mobile retries share one receipt table and one transaction boundary.
 */
@Service
public class MobileIncidentCommandServiceImpl implements MobileIncidentCommandService {

    private final IncidentService incidentService;

    public MobileIncidentCommandServiceImpl(IncidentService incidentService) {
        this.incidentService = incidentService;
    }

    @Override
    public CommandResult createIncident(String idempotencyKey, MobileIncidentCreateRequest request) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Idempotency-Key is required for mobile incident creation.");
        }
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A JSON incident request is required.");
        }
        requireOffsetTimestamp("reported_at", request.reportedAt());
        requireOffsetTimestamp("occurred_at", request.occurredAt());
        requireOffsetTimestamp("ended_at", request.endedAt());

        Map<String, Object> result = incidentService.store(
                toIncidentForm(request), safeList(request.infrastructureDamage()),
                safeList(request.emergencyNeeds()), List.of(), null, idempotencyKey);
        boolean validationFailure = result.containsKey("errors") || !Boolean.TRUE.equals(result.get("success"));
        int status = validationFailure
                ? HttpStatus.UNPROCESSABLE_ENTITY.value()
                : HttpStatus.CREATED.value();
        Long resourceId = validationFailure ? null : asLong(result.get("id"));
        return new CommandResult(status, Map.copyOf(result), resourceId);
    }

    private static Map<String, String> toIncidentForm(MobileIncidentCreateRequest r) {
        Map<String, String> form = new LinkedHashMap<>();
        put(form, "title", r.title());
        put(form, "hazard_id", r.hazardId());
        put(form, "incident_type_id", r.incidentTypeId());
        put(form, "location_description", r.locationDescription());
        put(form, "region_id", r.regionId());
        put(form, "district_id", r.districtId());
        put(form, "council_id", r.councilId());
        put(form, "ward_id", r.wardId());
        put(form, "latitude", r.latitude());
        put(form, "longitude", r.longitude());
        put(form, "reported_at", r.reportedAt());
        put(form, "occurred_at", r.occurredAt());
        put(form, "ended_at", r.endedAt());
        put(form, "description", r.description());
        put(form, "severity_level", r.severityLevel());
        put(form, "reported_by_name", r.reportedByName());
        put(form, "reported_by_contact", r.reportedByContact());
        put(form, "assigned_to_user_id", r.assignedToUserId());
        put(form, "deaths_male", r.deathsMale());
        put(form, "deaths_female", r.deathsFemale());
        put(form, "deaths_total", r.deathsTotal());
        put(form, "injured_male", r.injuredMale());
        put(form, "injured_female", r.injuredFemale());
        put(form, "injured_total", r.injuredTotal());
        put(form, "missing_male", r.missingMale());
        put(form, "missing_female", r.missingFemale());
        put(form, "missing_total", r.missingTotal());
        put(form, "displaced", r.displaced());
        put(form, "people_with_disabilities", r.peopleWithDisabilities());
        put(form, "pregnant_affected", r.pregnantAffected());
        put(form, "children_affected", r.childrenAffected());
        put(form, "people_affected", r.peopleAffected());
        put(form, "emergency_needs_other", r.emergencyNeedsOther());
        put(form, "action_taken", r.actionTaken());
        // Safety invariants: a mobile create cannot self-approve, close or masquerade as an agency channel.
        form.put("status", "Reported");
        form.put("source_of_report", "Mobile App Report");
        return form;
    }

    private static void put(Map<String, String> target, String key, Object value) {
        if (value != null) {
            target.put(key, value.toString());
        }
    }

    private static List<String> safeList(List<String> value) {
        return value == null ? List.of() : List.copyOf(value);
    }

    private static Long asLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(value.toString());
    }

    private static void requireOffsetTimestamp(String field, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        try {
            OffsetDateTime.parse(value);
        } catch (DateTimeParseException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    field + " must be a valid RFC 3339 timestamp with an explicit offset.");
        }
    }
}
