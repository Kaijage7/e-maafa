package tz.go.pmo.dmis.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.service.NationalIntegrationService;

/**
 * Honest adapter contracts for NBS / NIDA / LATRA / NAPA.
 * Mirrors {@link tz.go.pmo.dmis.integration.IfmisCommitmentExportService}: payload + integration_messages,
 * never invents live registry feeds.
 */
@Service
public class NationalIntegrationServiceImpl implements NationalIntegrationService {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Systems with productive handoff endpoints (plus IFMIS under GoLiveOps). */
    private static final Set<String> SUPPORTED = Set.of("NBS", "NIDA", "LATRA", "NAPA", "IFMIS");

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver users;

    public NationalIntegrationServiceImpl(JdbcTemplate jdbc, CurrentUserResolver users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @Override
    public Map<String, Object> catalogue() {
        ensureNbsRow();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("document", "docs/NATIONAL-DATA-INTEGRATION-RESEARCH.md");
        out.put("honesty", honestyBlock());
        List<Map<String, Object>> systems = new ArrayList<>();
        for (String code : List.of("NBS", "NIDA", "LATRA", "NAPA", "IFMIS")) {
            systems.add(systemCard(code));
        }
        out.put("systems", systems);
        out.put("note",
                "Integration endpoints are productive handoff/contracts. "
                        + "Mark integration_endpoints.status=live only after MoU + dual-proved round-trip.");
        return out;
    }

    @Override
    public Map<String, Object> status(String systemCode) {
        String code = requireSystem(systemCode);
        ensureNbsRow();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("system", code);
        out.put("honesty", honestyBlock());
        try {
            List<Map<String, Object>> eps = jdbc.queryForList("""
                    select id, system_code as "systemCode", display_name as "displayName", base_url as "baseUrl",
                           auth_type as "authType", status, direction, notes,
                           last_success_at as "lastSuccessAt", last_error_at as "lastErrorAt", last_error as "lastError",
                           updated_at as "updatedAt"
                    from public.integration_endpoints where system_code = ?
                    """, code);
            out.put("endpoint", eps.isEmpty() ? null : eps.get(0));
            out.put("liveFeed", false);
            if (!eps.isEmpty()) {
                String st = String.valueOf(eps.get(0).get("status"));
                out.put("liveFeed", "live".equalsIgnoreCase(st));
            }
            out.put("recentMessages", jdbc.queryForList("""
                    select id, direction, message_type as "messageType", status,
                           correlation_id as "correlationId", payload_hash as "payloadHash",
                           created_at as "createdAt"
                    from public.integration_messages
                    where system_code = ?
                    order by id desc limit 20
                    """, code));
            out.put("identityMapCount", jdbc.queryForObject(
                    "select count(*) from public.external_identity_map where system_code = ?",
                    Long.class, code));
        } catch (DataAccessException e) {
            out.put("error", "Integration tables unavailable: " + e.getMessage());
        }
        out.put("contract", contractBody(code));
        out.put("availableActions", actionsFor(code));
        return out;
    }

    @Override
    public Map<String, Object> contract(String systemCode) {
        String code = requireSystem(systemCode);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("system", code);
        out.put("liveFeed", false);
        out.put("honesty", honestyBlock());
        out.put("contract", contractBody(code));
        out.put("availableActions", actionsFor(code));
        return out;
    }

    @Override
    @Transactional
    public Map<String, Object> nbsPopulationRequest(String areaLevel, Integer limit) {
        ensureNbsRow();
        String level = normalizeAreaLevel(areaLevel);
        int lim = clamp(limit, 50, 500);

        List<Map<String, Object>> areas = List.of();
        try {
            areas = jdbc.queryForList("""
                    select a.code as "areaCode", a.name as "areaName", a.level,
                           max(case when i.component = 'Habitat' then v.value_0_10 end) as "habitatScore",
                           max(case when i.component = 'Development & Poverty' then v.value_0_10 end) as "povertyScore",
                           max(case when i.component = 'Economic capacity' then v.value_0_10 end) as "economicCapacityScore"
                    from public.inform_area a
                    left join public.inform_indicator_value v
                           on v.area_code = a.code and v.is_latest = true
                    left join public.inform_indicator i on i.id = v.indicator_id
                           and i.component in ('Habitat', 'Development & Poverty', 'Economic capacity')
                    where a.level = ?
                    group by a.code, a.name, a.level
                    order by a.name
                    limit ?
                    """, level, lim);
        } catch (DataAccessException ignored) {
            // tables optional in thin envs
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("exportType", "dmis.nbs.population_request");
        payload.put("system", "NBS");
        payload.put("generatedAt", OffsetDateTime.now().toString());
        payload.put("requestedAreaLevel", level);
        payload.put("requestedFields", List.of(
                "population_total", "population_under5", "population_elderly",
                "households", "urban_share", "density_per_km2", "as_of_date", "source_vintage"));
        payload.put("geoHarmonisation", "Map NBS geocodes → regions/districts/councils + geo_name_aliases + inform_area.code");
        payload.put("interimInformScores", areas);
        payload.put("interimCount", areas.size());
        payload.put("interimSource",
                "INFORM Habitat / Development & Poverty / Economic capacity — NOT NBS census rows");
        payload.put("note",
                "Outbound request package for NBS bulk population reference. "
                        + "Not a live NBS API call. Do not treat interimInformScores as official population.");

        return recordAndWrap("NBS", "nbs.population_request", payload,
                "Submit this request via MoU channel; load responses into exposure_population / INFORM denominators after validation.");
    }

    @Override
    @Transactional
    public Map<String, Object> nidaVerifyRequest(Map<String, Object> body) {
        if (body == null) {
            throw new BusinessRuleException("Request body required: nin (required), fullName, purpose, localTable, localId");
        }
        String nin = str(body.get("nin"));
        if (nin == null || nin.isBlank()) {
            throw new BusinessRuleException("nin is required for NIDA verify-request (will be hashed; never stored raw)");
        }
        String cleaned = nin.replaceAll("\\s+", "");
        if (cleaned.length() < 8 || cleaned.length() > 32) {
            throw new BusinessRuleException("nin length must be between 8 and 32 characters (after whitespace strip)");
        }
        if (!cleaned.matches("[A-Za-z0-9]+")) {
            throw new BusinessRuleException("nin must be alphanumeric");
        }

        String purpose = str(body.get("purpose"));
        if (purpose == null || purpose.isBlank()) {
            purpose = "stakeholder_kyc";
        }
        Set<String> allowedPurpose = Set.of(
                "stakeholder_kyc", "beneficiary_kyc", "officer_onboarding", "partner_kyc", "other");
        if (!allowedPurpose.contains(purpose.toLowerCase(Locale.ROOT))) {
            throw new BusinessRuleException(
                    "purpose must be one of: " + String.join(", ", allowedPurpose));
        }
        purpose = purpose.toLowerCase(Locale.ROOT);

        String ninHash = sha256(cleaned.toUpperCase(Locale.ROOT));
        String fullName = str(body.get("fullName"));
        String localTable = str(body.get("localTable"));
        Long localId = longOrNull(body.get("localId"));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("exportType", "dmis.nida.verify_request");
        payload.put("system", "NIDA");
        payload.put("generatedAt", OffsetDateTime.now().toString());
        payload.put("mode", "verify_only");
        payload.put("ninHashSha256", ninHash);
        payload.put("ninLast4", cleaned.length() >= 4 ? cleaned.substring(cleaned.length() - 4) : "****");
        payload.put("fullName", fullName);
        payload.put("purpose", purpose);
        payload.put("localTable", localTable);
        payload.put("localId", localId);
        payload.put("expectedResponse", Map.of(
                "valid", "boolean",
                "matchConfidence", "high|medium|low|unknown",
                "verificationToken", "opaque",
                "verifiedAt", "ISO-8601"));
        payload.put("privacy",
                "Raw NIN is not persisted in DMIS. Only sha256 hash + last4 for audit correlation. "
                        + "Tanzania Data Protection Act 2022 applies.");
        payload.put("note",
                "Outbound verify package only — NIDA CIG/API is not called. "
                        + "Do not use NIDA as population exposure source (use NBS).");

        Map<String, Object> out = recordAndWrap("NIDA", "nida.verify_request", payload,
                "Send via approved GovESB/NIDA channel. On success, write external_identity_map(NIDA, token, local_table, local_id).");
        out.put("ninStored", false);
        out.put("ninHashSha256", ninHash);
        return out;
    }

    @Override
    @Transactional
    public Map<String, Object> latraLogisticsSnapshot(String district, Integer limit) {
        int lim = clamp(limit, 100, 1000);
        String dist = district == null ? null : district.trim();

        List<Map<String, Object>> warehouses = List.of();
        List<Map<String, Object>> infrastructure = List.of();
        List<Map<String, Object>> centres = List.of();
        try {
            if (dist != null && !dist.isBlank()) {
                warehouses = jdbc.queryForList("""
                        select w.id, w.name, w.zone, w.operational_status as "operationalStatus",
                               w.storage_capacity_sqm as "storageCapacitySqm", w.capacity,
                               w.latitude, w.longitude, r.name as region, d.name as district
                        from public.warehouses w
                        left join public.regions r on r.id = w.region_id
                        left join public.districts d on d.id = w.district_id
                        where lower(coalesce(d.name, w.city_or_region, '')) like lower(?)
                        order by w.id limit ?
                        """, "%" + dist + "%", lim);
                centres = jdbc.queryForList("""
                        select id, ecentre_id as "ecentreId", centre_name as "centreName",
                               centre_type as "centreType", region, district, council,
                               capacity_people as "capacityPeople", status, latitude, longitude
                        from public.evacuation_centers
                        where lower(coalesce(district, '')) like lower(?)
                           or lower(coalesce(region, '')) like lower(?)
                        order by id limit ?
                        """, "%" + dist + "%", "%" + dist + "%", lim);
            } else {
                warehouses = jdbc.queryForList("""
                        select w.id, w.name, w.zone, w.operational_status as "operationalStatus",
                               w.storage_capacity_sqm as "storageCapacitySqm", w.capacity,
                               w.latitude, w.longitude, r.name as region, d.name as district
                        from public.warehouses w
                        left join public.regions r on r.id = w.region_id
                        left join public.districts d on d.id = w.district_id
                        order by w.id limit ?
                        """, lim);
                centres = jdbc.queryForList("""
                        select id, ecentre_id as "ecentreId", centre_name as "centreName",
                               centre_type as "centreType", region, district, council,
                               capacity_people as "capacityPeople", status, latitude, longitude
                        from public.evacuation_centers
                        order by id limit ?
                        """, lim);
            }
            infrastructure = jdbc.queryForList("""
                    select id, name, type, status, capacity, latitude, longitude,
                           location_description as "locationDescription", address
                    from public.infrastructure_items
                    order by id limit ?
                    """, lim);
        } catch (DataAccessException ignored) {
            // optional
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("exportType", "dmis.latra.logistics_snapshot");
        payload.put("system", "LATRA");
        payload.put("generatedAt", OffsetDateTime.now().toString());
        payload.put("districtFilter", dist);
        payload.put("warehouses", warehouses);
        payload.put("warehouseCount", warehouses.size());
        payload.put("evacuationCentres", centres);
        payload.put("evacuationCentreCount", centres.size());
        payload.put("infrastructure", infrastructure);
        payload.put("infrastructureCount", infrastructure.size());
        payload.put("requestedFromLatra", List.of(
                "critical_corridor_id", "corridor_name", "status_open_closed",
                "affected_districts", "as_of", "alternate_route_hint"));
        payload.put("source", "DMIS preparedness/response asset registers — not LATRA live network feed");
        payload.put("note",
                "Logistics exposure snapshot for handoff and impact context. "
                        + "LATRA live closures/corridors not connected. INFORM Communication/Access remain proxies in impact-support.");

        return recordAndWrap("LATRA", "latra.logistics_snapshot", payload,
                "Share snapshot with LATRA/works partners; ingest corridor feed when MoU allows.");
    }

    @Override
    @Transactional
    public Map<String, Object> napaProgrammeMapExport(Integer limit) {
        int lim = clamp(limit, 50, 500);
        List<Map<String, Object>> projects = List.of();
        List<Map<String, Object>> identityMaps = List.of();
        try {
            projects = jdbc.queryForList("""
                    select id, entry_id as "entryId", project_name as "projectName",
                           project_category as "projectCategory", project_sector as "projectSector",
                           project_status as "projectStatus", location, project_coverage as "projectCoverage",
                           risk_hazard_type as "riskHazardType", risk_hazard_names as "riskHazardNames",
                           elements_at_risk as "elementsAtRisk", budget, created_at as "createdAt"
                    from public.strategic_projects
                    order by id desc limit ?
                    """, lim);
            identityMaps = jdbc.queryForList("""
                    select id, external_id as "externalId", local_table as "localTable",
                           local_id as "localId", verified_at as "verifiedAt", meta_json as "metaJson"
                    from public.external_identity_map
                    where system_code = 'NAPA'
                    order by id desc limit 100
                    """);
        } catch (DataAccessException ignored) {
            // optional
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("exportType", "dmis.napa.programme_map");
        payload.put("system", "NAPA");
        payload.put("generatedAt", OffsetDateTime.now().toString());
        payload.put("projects", projects);
        payload.put("projectCount", projects.size());
        payload.put("existingIdentityMaps", identityMaps);
        payload.put("identityMapCount", identityMaps.size());
        payload.put("mappingTarget", Map.of(
                "externalSystem", "NAPA",
                "externalId", "programme_or_project_code",
                "localTable", "strategic_projects",
                "localId", "strategic_projects.id"));
        payload.put("note",
                "Programme map export for NAPA/NAP linkage. Not a live ERP pull. "
                        + "Link via external_identity_map after dual-proved codes.");

        return recordAndWrap("NAPA", "napa.programme_map_export", payload,
                "Align programme codes with VPO/sector NAPA list; write external_identity_map rows when verified.");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Map<String, Object> recordAndWrap(String system, String messageType,
                                              Map<String, Object> payload, String nextStep) {
        String json;
        String hash;
        try {
            json = JSON.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
            hash = sha256(json);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialise " + system + " payload: " + e.getMessage());
        }

        String correlationId = system + "-" + OffsetDateTime.now().toLocalDate()
                + "-" + UUID.randomUUID().toString().substring(0, 8);
        String idempotencyKey = messageType + ":" + hash;
        Long endpointId = endpointId(system);
        Long messageId = null;
        try {
            List<Long> existing = jdbc.queryForList("""
                    select id from public.integration_messages
                    where system_code = ? and idempotency_key = ?
                    order by id desc limit 1
                    """, Long.class, system, idempotencyKey);
            if (!existing.isEmpty()) {
                messageId = existing.get(0);
                jdbc.update("""
                        update public.integration_messages set status = 'applied', updated_at = now(),
                            attempts = attempts + 1
                        where id = ?
                        """, messageId);
            } else {
                Object countObj = payload.getOrDefault("interimCount",
                        payload.getOrDefault("projectCount",
                                payload.getOrDefault("warehouseCount",
                                        payload.getOrDefault("ninHashSha256", "1"))));
                messageId = jdbc.queryForObject("""
                        insert into public.integration_messages(
                            endpoint_id, system_code, direction, message_type, correlation_id, idempotency_key,
                            status, payload_hash, payload_ref, attempts, created_at, updated_at)
                        values (?,?, 'outbound', ?, ?, ?, 'applied', ?, ?, 1, now(), now())
                        returning id
                        """, Long.class, endpointId, system, messageType, correlationId, idempotencyKey, hash,
                        "inline:" + countObj);
            }
            jdbc.update("""
                    update public.integration_endpoints set last_success_at = now(), updated_at = now(),
                        status = case when status = 'planned' then 'configured' else status end
                    where system_code = ?
                    """, system);
        } catch (DataAccessException ignored) {
            // still return payload
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("system", system);
        out.put("liveFeed", false);
        out.put("correlationId", correlationId);
        out.put("idempotencyKey", idempotencyKey);
        out.put("payloadHash", hash);
        out.put("messageId", messageId);
        out.put("payload", payload);
        out.put("actorUserId", users.actingUserId());
        out.put("nextStep", nextStep);
        out.put("honesty", honestyBlock());
        return out;
    }

    private Map<String, Object> systemCard(String code) {
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("systemCode", code);
        card.put("liveFeed", false);
        card.put("contract", contractBody(code));
        card.put("availableActions", actionsFor(code));
        try {
            List<Map<String, Object>> eps = jdbc.queryForList("""
                    select status, display_name as "displayName", notes, last_success_at as "lastSuccessAt"
                    from public.integration_endpoints where system_code = ?
                    """, code);
            if (!eps.isEmpty()) {
                card.put("registryStatus", eps.get(0).get("status"));
                card.put("displayName", eps.get(0).get("displayName"));
                card.put("notes", eps.get(0).get("notes"));
                card.put("lastSuccessAt", eps.get(0).get("lastSuccessAt"));
                card.put("liveFeed", "live".equalsIgnoreCase(String.valueOf(eps.get(0).get("status"))));
            } else {
                card.put("registryStatus", "missing");
            }
        } catch (DataAccessException e) {
            card.put("registryStatus", "unavailable");
        }
        return card;
    }

    private static Map<String, Object> contractBody(String code) {
        Map<String, Object> c = new LinkedHashMap<>();
        switch (code) {
            case "NBS" -> {
                c.put("mode", "bulk_reference");
                c.put("direction", "inbound");
                c.put("purpose", "Official population/housing denominators by admin area");
                c.put("notFor", "Real-time identity or live flood footprint counts");
                c.put("payloadSketch", Map.of(
                        "areaCode", "NBS or DMIS geo code",
                        "year", 2022,
                        "populationTotal", 0,
                        "asOf", "YYYY-MM-DD",
                        "sourceVintage", "PHC 2022"));
                c.put("dmisLanding", "staging → exposure denominators / INFORM population indicators");
            }
            case "NIDA" -> {
                c.put("mode", "verify_only");
                c.put("direction", "outbound");
                c.put("purpose", "NIN validity / name match for officers, partners, beneficiaries");
                c.put("notFor", "Population exposure counts or citizen dump storage");
                c.put("payloadSketch", Map.of(
                        "ninHashSha256", "…",
                        "fullName", "optional",
                        "purpose", "stakeholder_kyc"));
                c.put("dmisLanding", "external_identity_map (token only); never full biometric dump");
            }
            case "LATRA" -> {
                c.put("mode", "logistics_exposure");
                c.put("direction", "inbound");
                c.put("purpose", "Critical corridors, closures, fleet constraints for evacuation/supply");
                c.put("notFor", "Replacing DMIS warehouse/EC registers");
                c.put("payloadSketch", Map.of(
                        "corridorId", "…",
                        "status", "open|closed|restricted",
                        "districts", List.of("…")));
                c.put("dmisLanding", "impact-support logistics layer; dispatch context");
            }
            case "NAPA" -> {
                c.put("mode", "programme_code_map");
                c.put("direction", "bidirectional");
                c.put("purpose", "Link NAPA/NAP programmes to recovery/strategic projects");
                c.put("notFor", "Live weather or hazard colour");
                c.put("payloadSketch", Map.of(
                        "programmeCode", "…",
                        "localTable", "strategic_projects",
                        "localId", 0));
                c.put("dmisLanding", "external_identity_map + strategic_projects");
            }
            case "IFMIS" -> {
                c.put("mode", "commitment_export");
                c.put("direction", "outbound");
                c.put("purpose", "Disaster ops ledger handoff to national finance");
                c.put("notFor", "Live IFMIS posting without dual-proof");
                c.put("dmisLanding", "integration_messages + budget_commitments SoR");
                c.put("endpoint", "POST /v1/ops/integrations/ifmis/export-commitments");
            }
            default -> c.put("mode", "unknown");
        }
        c.put("liveFeed", false);
        return c;
    }

    private static List<Map<String, String>> actionsFor(String code) {
        List<Map<String, String>> a = new ArrayList<>();
        a.add(Map.of("method", "GET", "path", "/v1/ops/integrations/" + code.toLowerCase(Locale.ROOT) + "/status",
                "desc", "Registry status + recent messages"));
        a.add(Map.of("method", "GET", "path", "/v1/ops/integrations/" + code.toLowerCase(Locale.ROOT) + "/contract",
                "desc", "Machine-readable adapter contract"));
        switch (code) {
            case "NBS" -> a.add(Map.of("method", "POST",
                    "path", "/v1/ops/integrations/nbs/population-request",
                    "desc", "Build NBS population bulk-request + interim INFORM scores"));
            case "NIDA" -> a.add(Map.of("method", "POST",
                    "path", "/v1/ops/integrations/nida/verify-request",
                    "desc", "Build hashed NIN verify package (no live call)"));
            case "LATRA" -> a.add(Map.of("method", "POST",
                    "path", "/v1/ops/integrations/latra/logistics-snapshot",
                    "desc", "Export DMIS logistics assets + LATRA request shape"));
            case "NAPA" -> a.add(Map.of("method", "POST",
                    "path", "/v1/ops/integrations/napa/programme-map-export",
                    "desc", "Export strategic projects for NAPA code mapping"));
            case "IFMIS" -> a.add(Map.of("method", "POST",
                    "path", "/v1/ops/integrations/ifmis/export-commitments",
                    "desc", "Export budget commitments (existing)"));
            default -> { }
        }
        return a;
    }

    private static Map<String, Object> honestyBlock() {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("institutionFeedsLive", false);
        h.put("structuralExposure", "INFORM H/V/C live in DMIS");
        h.put("physicalFootprintIntersection", false);
        h.put("satelliteFullExposure", false);
        h.put("adaptersProvide", "contracts + handoff payloads + integration_messages audit");
        return h;
    }

    private String requireSystem(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessRuleException("systemCode is required");
        }
        String code = raw.trim().toUpperCase(Locale.ROOT);
        if (!SUPPORTED.contains(code)) {
            throw new BusinessRuleException(
                    "Unknown integration system '" + raw + "'. Supported: NBS, NIDA, LATRA, NAPA, IFMIS");
        }
        return code;
    }

    private static String normalizeAreaLevel(String raw) {
        if (raw == null || raw.isBlank()) {
            return "district";
        }
        String l = raw.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("region", "district", "council").contains(l)) {
            throw new BusinessRuleException("areaLevel must be one of: region, district, council");
        }
        return l;
    }

    private void ensureNbsRow() {
        try {
            jdbc.update("""
                    insert into public.integration_endpoints
                        (system_code, display_name, auth_type, status, direction, notes)
                    values ('NBS', 'National Bureau of Statistics', 'api_key', 'planned', 'inbound',
                        'Bulk population/housing reference. Not live. Interim INFORM denominators until dual-proved.')
                    on conflict (system_code) do nothing
                    """);
        } catch (DataAccessException ignored) {
            // Flyway V206 preferred
        }
    }

    private Long endpointId(String system) {
        try {
            List<Long> ids = jdbc.queryForList(
                    "select id from public.integration_endpoints where system_code = ? limit 1",
                    Long.class, system);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (DataAccessException e) {
            return null;
        }
    }

    private static int clamp(Integer v, int def, int max) {
        if (v == null || v < 1) {
            return def;
        }
        return Math.min(v, max);
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }

    private static Long longOrNull(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
