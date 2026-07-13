package tz.go.pmo.dmis.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;

/**
 * NDRF Annex 1 DLNA + Annex 2 recovery plan. Paths and JSON unchanged from the
 * former response package controller.
 */
public interface DlnaService {

    record CreateRequest(Long incident_id, String scope, List<Long> additional_incident_ids,
                         String date_of_visit, String region, String district,
                         String ward, String village, String gps_coordinates, String disaster_type,
                         String disaster_type_other, String affected_villages,
                         List<Map<String, Object>> team_members, List<Map<String, Object>> interviewees) {
    }

    record HeaderRequest(String date_of_visit, String region, String district, String ward,
                         String village, String gps_coordinates, String disaster_type,
                         String disaster_type_other, String affected_villages,
                         List<Map<String, Object>> team_members, List<Map<String, Object>> interviewees) {
    }

    record SectionRequest(JsonNode data, Boolean submit) {
    }

    record PlanRequest(JsonNode chapters, Long dlna_id) {
    }

    record FileReportRequest(String html) {
    }

    Map<String, Object> index(Long incidentId);

    Map<String, Object> create(CreateRequest req) throws Exception;

    Map<String, Object> show(long id);

    Map<String, Object> saveHeader(long id, HeaderRequest req) throws Exception;

    Map<String, Object> saveSection(long id, String key, SectionRequest req) throws Exception;

    Map<String, Object> reopenSection(long id, String key);

    Map<String, Object> finalize(long id);

    Map<String, Object> reopen(long id);

    Map<String, Object> planByIncident(long incidentId);

    Map<String, Object> savePlan(long incidentId, PlanRequest req) throws Exception;

    Map<String, Object> mySections();

    Map<String, Object> fileAnnex1Report(long id, FileReportRequest req) throws Exception;

    Map<String, Object> filePlanReport(long incidentId, FileReportRequest req) throws Exception;
}
