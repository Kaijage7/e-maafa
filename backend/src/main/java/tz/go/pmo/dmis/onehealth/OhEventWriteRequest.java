package tz.go.pmo.dmis.onehealth;

import java.util.List;
import java.util.Map;
import lombok.Getter;
import lombok.Setter;

/**
 * Payload of POST /v1/onehealth/events — mirrors the source's
 * OneHealthEventController::store() validated input, including the universal
 * One Health sections (human / animals / environment) and the legacy
 * category-based "detail" sub-form kept for backward compatibility.
 */
@Getter
@Setter
public class OhEventWriteRequest {

    private Long stakeholderId;
    private Long areaOfConcernId;
    private Long concernItemId;
    private String eventTitle;
    private String eventType;
    private String eventDescription;
    private String dateOfOccurrence;
    private String recommendation;
    private Long regionId;
    private Long districtId;
    private String wardVillage;
    private Long wardId;
    private Double latitude;
    private Double longitude;
    private String priorityLevel;
    private String riskLevel;

    /** Universal Human Cases section: cases_male, cases_female, cases_children, cases_total, deaths, admitted, lab_results. */
    private Map<String, Object> human;

    /** Universal Animal Entries (repeatable rows): species, species_other, cases, deaths, notes. */
    private List<Map<String, Object>> animals;

    /** Universal Environment section: hazard_id, weather_data, temperature, rainfall, wind_speed, environmental_impact. */
    private Map<String, Object> environment;

    /** Legacy category-based sub-form (backward compat with the source's detail[...] fields). */
    private Map<String, Object> detail;
}
