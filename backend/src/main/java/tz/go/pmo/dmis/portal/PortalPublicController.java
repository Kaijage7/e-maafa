package tz.go.pmo.dmis.portal;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * PUBLIC portal API — no authentication, by design (this powers the citizen-facing site,
 * exactly like Laravel's PublicPortalController routes). Permitted in SecurityConfig
 * via {@code /v1/portal/**}.
 */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
@Tag(name = "Public Portal", description = "Citizen-facing portal (no auth)")
public class PortalPublicController {

    private final PortalPublicService service;
    private final ThreatService threatService;

    @GetMapping("/landing")
    @Operation(summary = "Everything the public landing page needs, in one payload")
    public Map<String, Object> landing() {
        return service.landing();
    }

    @GetMapping("/i18n")
    @Operation(summary = "Bilingual UI dictionary (key→{en,sw}) the portal hydrates over its defaults")
    public Map<String, Object> i18n() {
        return service.i18n();
    }

    @GetMapping("/news/{slug}")
    @Operation(summary = "One published news article + related articles")
    public Map<String, Object> news(@PathVariable String slug) {
        return service.newsArticle(slug);
    }

    @GetMapping("/incidents/{id}")
    @Operation(summary = "Live public snapshot of an incident published to the portal (situation + response + resources)")
    public Map<String, Object> incident(@PathVariable long id) {
        Map<String, Object> snapshot = service.incidentSnapshot(id);
        if (snapshot == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Incident not found or not published to the portal.");
        }
        return snapshot;
    }

    @GetMapping("/publications")
    @Operation(summary = "Publications (disaster risk frameworks) filtered by document type")
    public Map<String, Object> publications(@RequestParam(required = false) String type) {
        return service.publications(type);
    }

    @PostMapping("/report-hazard")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Citizen hazard report (the landing's Report Hazard wizard)")
    public Map<String, Object> reportHazard(@RequestBody Map<String, Object> request) {
        return service.submitHazardReport(request);
    }

    @PostMapping("/subscribe")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Public alert subscription (the /subscribe page)")
    public Map<String, Object> subscribe(@RequestBody Map<String, Object> request) {
        return service.subscribe(request);
    }

    @PostMapping("/unsubscribe")
    @Operation(summary = "Unsubscribe step 1 — send a one-time confirmation code to the given phone/email")
    public Map<String, Object> unsubscribe(@RequestBody Map<String, Object> request) {
        return service.unsubscribe(request);
    }

    @PostMapping("/unsubscribe-confirm")
    @Operation(summary = "Unsubscribe step 2 — confirm with the one-time code (and optional reason) to stop alerts")
    public Map<String, Object> unsubscribeConfirm(@RequestBody Map<String, Object> request) {
        return service.confirmUnsubscribe(request);
    }

    @GetMapping("/unsubscribe-reasons")
    @Operation(summary = "CMS-controlled list of unsubscribe reasons for the unsubscribe form")
    public Map<String, Object> unsubscribeReasons() {
        return service.unsubscribeReasons();
    }

    @PostMapping("/register-stakeholder")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Public stakeholder registration (pending verification)")
    public Map<String, Object> registerStakeholder(@RequestBody Map<String, Object> request) {
        return service.registerStakeholder(request);
    }

    @GetMapping("/regions")
    @Operation(summary = "Public list of Tanzania regions (stakeholder-registration cascade)")
    public List<Map<String, Object>> regions() {
        return service.regions();
    }

    @GetMapping("/regions/{regionId}/districts")
    @Operation(summary = "Public list of districts in a region (registration cascade)")
    public List<Map<String, Object>> districts(@PathVariable long regionId) {
        return service.districts(regionId);
    }

    @GetMapping("/districts/{districtId}/councils")
    @Operation(summary = "Public list of councils (LGAs) in a district (location cascade)")
    public List<Map<String, Object>> councils(@PathVariable long districtId) {
        return service.councils(districtId);
    }

    @GetMapping("/councils/{councilId}/wards")
    @Operation(summary = "Public list of wards in a council (location cascade)")
    public List<Map<String, Object>> wards(@PathVariable long councilId) {
        return service.wards(councilId);
    }

    @GetMapping("/education")
    @Operation(summary = "Published educational content (public education portal)")
    public Map<String, Object> education() {
        return service.education();
    }

    @GetMapping("/education/{id}")
    @Operation(summary = "One published educational item (full content)")
    public Map<String, Object> educationItem(@PathVariable long id) {
        return service.educationItem(id);
    }

    @GetMapping("/shelters")
    @Operation(summary = "Evacuation centers for the public finder (map + list)")
    public Map<String, Object> shelters() {
        return service.shelters();
    }

    @GetMapping("/threats")
    @Operation(summary = "Active national threats (the public threat strip)")
    public Object threats() {
        return Map.of("threats", threatService.activeThreats());
    }

    @GetMapping("/threats/{id}")
    @Operation(summary = "Threat detail: DMD interventions timeline + stakeholder plans (map)")
    public Map<String, Object> threatDetail(@PathVariable long id) {
        return threatService.threatDetail(id);
    }

    @PostMapping("/threats/{id}/plans")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Stakeholder plan submission under a threat (geo + sector/LGA info)")
    public Map<String, Object> submitThreatPlan(@PathVariable long id, @RequestBody Map<String, Object> request) {
        return threatService.submitPlan(id, request);
    }

    @GetMapping("/hazard-hub/{name}")
    @Operation(summary = "A hazard's education hub: card + materials by audience + related articles")
    public Map<String, Object> hazardHub(@PathVariable String name) {
        return service.hazardHub(name);
    }

    @GetMapping("/hazard-calendar")
    @Operation(summary = "National hazard calendar — likely hazards by month (Tanzania seasonality)")
    public java.util.List<Map<String, Object>> hazardCalendar() {
        return service.hazardCalendar();
    }
}
