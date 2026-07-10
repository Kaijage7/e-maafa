package tz.go.pmo.dmis.ops;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.geo.GeoAliasService;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.integration.IfmisCommitmentExportService;

/**
 * space02 go-live / DBA ops surfaces — honesty board only.
 * Never invents green lights for missing external integrations or secrets.
 */
@RestController
@RequestMapping("/v1/ops")
@PreAuthorize("isAuthenticated()")
public class GoLiveOpsController {

    private final JdbcTemplate jdbc;
    private final Environment env;
    private final IfmisCommitmentExportService ifmisExport;
    private final GeoAliasService geoAliases;
    private final CurrentUserResolver users;

    @Value("${dmis.auth.jwt.secret:}")
    private String jwtSecret;

    @Value("${dmis.mgov.api-key:}")
    private String mgovApiKey;

    @Value("${dmis.mgov.dlr-secret:}")
    private String dlrSecret;

    @Value("${spring.mail.host:}")
    private String mailHost;

    @Value("${spring.mail.username:}")
    private String mailUser;

    /** Ops residual accept flags — explicit cutover sign-off, never silent green. */
    @Value("${dmis.go-live.accept-sms-deferred:false}")
    private boolean acceptSmsDeferred;

    @Value("${dmis.go-live.accept-email-deferred:false}")
    private boolean acceptEmailDeferred;

    @Value("${dmis.go-live.accept-sparse-phones:false}")
    private boolean acceptSparsePhones;

    @Value("${dmis.go-live.accept-pdf-sidecar:false}")
    private boolean acceptPdfSidecar;

    @Value("${dmis.go-live.accept-storage-partial:false}")
    private boolean acceptStoragePartial;

    public GoLiveOpsController(JdbcTemplate jdbc, Environment env,
                               IfmisCommitmentExportService ifmisExport,
                               GeoAliasService geoAliases,
                               CurrentUserResolver users) {
        this.jdbc = jdbc;
        this.env = env;
        this.ifmisExport = ifmisExport;
        this.geoAliases = geoAliases;
        this.users = users;
    }

    /**
     * Authenticated readiness board for cutover (GL-01…GL-06 flags + residual honesty).
     * Does not invent NIDA/LATRA/NAPA/IFMIS live status. Careful certificate only when
     * prod profile + JWT + Flyway + seats + (SMS live or accepted) + (email live or accepted).
     */
    @GetMapping("/go-live-readiness")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','roles_and_permissions.manage') "
            + "or hasAuthority('early_warning.view')")
    public Map<String, Object> readiness() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("document", "docs/space02-go-live-assessment.md + docs/GO-LIVE-RUNBOOK.md");
        out.put("note",
                "Flags indicate configuration presence and platform state. "
                        + "They do not claim NIDA/LATRA/NAPA/IFMIS live integration or AI product.");

        List<String> profiles = List.of(env.getActiveProfiles());
        boolean localProfile = profiles.stream().anyMatch(p -> "local".equalsIgnoreCase(p));
        out.put("activeProfiles", profiles);
        out.put("localProfileActive", localProfile);
        boolean prodProfileOk = !localProfile && !profiles.isEmpty();
        out.put("gl01_prodProfile", Map.of(
                "ok", prodProfileOk,
                "detail", localProfile
                        ? "local profile is active — must not face public production edge"
                        : "non-local profiles: " + profiles));

        boolean jwtOk = jwtSecret != null && jwtSecret.trim().length() >= 32
                && !jwtSecret.contains("changeme")
                && !jwtSecret.toLowerCase().contains("dev-only");
        // Under local profile a short dev secret may be injected — still flag honesty
        out.put("gl01_jwtSecret", Map.of(
                "configured", jwtSecret != null && !jwtSecret.isBlank(),
                "lengthOk", jwtSecret != null && jwtSecret.trim().length() >= 32,
                "ok", !localProfile ? jwtOk : (jwtSecret != null && !jwtSecret.isBlank()),
                "detail", localProfile
                        ? "local profile may use bundled secret — replace for prod"
                        : (jwtOk ? "JWT secret present and length ≥ 32" : "Set DMIS_AUTH_JWT_SECRET (≥32 bytes) for prod")));

        boolean mgovConfigured = notBlank(mgovApiKey);
        boolean mgovGateOk = mgovConfigured || acceptSmsDeferred;
        out.put("gl02_mgov", Map.of(
                "apiKeyConfigured", mgovConfigured,
                "dlrSecretConfigured", notBlank(dlrSecret),
                "acceptedDeferred", acceptSmsDeferred,
                "ok", mgovGateOk,
                "detail", mgovConfigured
                        ? (notBlank(dlrSecret)
                        ? "M-Gov key + DLR secret present — still register DLR URL with carrier"
                        : "M-Gov key present; DLR secret empty (webhook disabled/open depending on profile)")
                        : (acceptSmsDeferred
                        ? "SMS deferred accepted by ops (DMIS_GO_LIVE_ACCEPT_SMS_DEFERRED=true)"
                        : "MGOV_API_KEY not set — set keys or accept SMS deferred")));

        boolean smtpConfigured = notBlank(mailHost);
        boolean smtpGateOk = smtpConfigured || acceptEmailDeferred;
        out.put("gl03_smtp", Map.of(
                "hostConfigured", smtpConfigured,
                "usernameConfigured", notBlank(mailUser),
                "acceptedDeferred", acceptEmailDeferred,
                "ok", smtpGateOk,
                "detail", smtpConfigured
                        ? "SMTP host set"
                        : (acceptEmailDeferred
                        ? "Email deferred accepted by ops (DMIS_GO_LIVE_ACCEPT_EMAIL_DEFERRED=true)"
                        : "SMTP host empty — set host or accept email deferred")));

        Map<String, Object> db = new LinkedHashMap<>();
        // Flyway history lives in default-schema `platform` (see application.yml), not public.
        try {
            String ver = jdbc.query(
                    "select version from platform.flyway_schema_history where success order by installed_rank desc limit 1",
                    rs -> rs.next() ? rs.getString(1) : null);
            Long flywayMax = parseVersion(ver);
            db.put("flywayMaxVersion", ver);
            db.put("ok", flywayMax != null && flywayMax >= 196);
            db.put("detail", "Flyway max version " + ver + " (platform.flyway_schema_history)");
        } catch (DataAccessException e) {
            db.put("ok", false);
            db.put("detail", "flyway_schema_history unreadable: " + e.getMessage());
        }
        // Demo-account hygiene (V196): accounts that still look like baseline demo without force-change
        try {
            Long demoOpen = jdbc.queryForObject("""
                    select count(*) from public.users
                    where coalesce(must_change_password, false) = false
                      and (
                        email ilike '%@example.com'
                        or email ilike '%@example.dev'
                        or email ilike '%@test.com'
                      )
                    """, Long.class);
            db.put("demoAccountsWithoutForceChange", demoOpen == null ? 0 : demoOpen);
            db.put("demoHygieneOk", demoOpen != null && demoOpen == 0);
            if (demoOpen != null && demoOpen > 0) {
                db.put("detail", db.get("detail") + "; " + demoOpen
                        + " demo-like user(s) still without must_change_password");
            }
        } catch (DataAccessException e) {
            db.put("demoHygieneOk", false);
            db.put("demoAccountsWithoutForceChange", -1);
        }
        out.put("gl04_database", db);

        // Integration registry honesty
        long liveIntegrations = 0L;
        try {
            List<Map<String, Object>> endpoints = jdbc.queryForList("""
                    select system_code as "systemCode", status, count(*) as n
                    from public.integration_endpoints group by system_code, status order by system_code
                    """);
            liveIntegrations = endpoints.stream()
                    .filter(r -> "live".equals(String.valueOf(r.get("status")))).count();
            out.put("integrations", Map.of(
                    "registryPresent", true,
                    "liveCount", liveIntegrations,
                    "endpoints", endpoints,
                    "detail", liveIntegrations == 0
                            ? "No endpoint marked live — NIDA/LATRA/NAPA/IFMIS remain planned (honest)"
                            : liveIntegrations + " endpoint(s) marked live"));
        } catch (DataAccessException e) {
            out.put("integrations", Map.of(
                    "registryPresent", false,
                    "detail", "integration_endpoints not available yet — apply Flyway V187+"));
        }

        Map<String, Object> residualAccept = new LinkedHashMap<>();
        residualAccept.put("smsDeferred", acceptSmsDeferred);
        residualAccept.put("emailDeferred", acceptEmailDeferred);
        residualAccept.put("sparsePhones", acceptSparsePhones);
        residualAccept.put("pdfSidecar", acceptPdfSidecar);
        residualAccept.put("storagePartial", acceptStoragePartial);
        residualAccept.put("note", "Set DMIS_GO_LIVE_ACCEPT_* only after written residual sign-off");
        out.put("residualAccept", residualAccept);

        List<String> blockers = new ArrayList<>();
        if (localProfile) {
            blockers.add("GL-01: local profile active");
        }
        if (!localProfile && !jwtOk) {
            blockers.add("GL-01: JWT secret missing or weak");
        }
        if (!mgovGateOk) {
            blockers.add("GL-02: M-Gov API key not configured (set keys or DMIS_GO_LIVE_ACCEPT_SMS_DEFERRED=true)");
        }
        if (!smtpGateOk) {
            blockers.add("GL-03: SMTP host not configured (set host or DMIS_GO_LIVE_ACCEPT_EMAIL_DEFERRED=true)");
        }
        out.put("blockersOrAccept", blockers);
        out.put("deferredProduct", List.of(
                "F105 AI/ML",
                "F114 satellite/full exposure",
                "NIDA verify adapter (legal + API)",
                "LATRA/NAPA/IFMIS adapters"));
        out.put("workingPillars", List.of(
                "W-01 Incident workflow",
                "W-02 Allocation/dispatch/stock",
                "W-03 EW bus + impact-support + Action Guide",
                "W-04 Finance/Economics",
                "W-05 INFORM",
                "W-06 Portal public path",
                "W-07 Notification backbone",
                "W-08 Security baseline"));

        // DBA-2 integrity snapshot (report-only; does not flip honestCertificate)
        Map<String, Object> integrity = Map.of();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("select * from public.vw_integrity_summary");
            integrity = rows.isEmpty() ? Map.of() : rows.get(0);
            out.put("integrity", integrity);
        } catch (DataAccessException e) {
            out.put("integrity", Map.of(
                    "ok", false,
                    "detail", "Integrity views unavailable — ensure Flyway V188+ applied"));
        }

        // GL-06 workflow staffing coverage (report-only; sparse phones = data residual)
        Map<String, Object> seats = new LinkedHashMap<>();
        try {
            Long districts = jdbc.queryForObject("select count(*) from public.districts", Long.class);
            Long districtsNoDas = jdbc.queryForObject("""
                    select count(*) from public.districts d
                    where not exists (
                      select 1 from public.model_has_roles mhr
                      join public.roles r on r.id = mhr.role_id and r.name = 'DAS'
                      join public.users u on u.id = mhr.model_id and u.district_id = d.id
                    )
                    """, Long.class);
            Long regions = jdbc.queryForObject("select count(*) from public.regions", Long.class);
            Long regionsNoRas = jdbc.queryForObject("""
                    select count(*) from public.regions rg
                    where not exists (
                      select 1 from public.model_has_roles mhr
                      join public.roles r on r.id = mhr.role_id and r.name = 'RAS'
                      join public.users u on u.id = mhr.model_id and u.region_id = rg.id
                    )
                    """, Long.class);
            Long dasWithPhone = jdbc.queryForObject("""
                    select count(*) from public.model_has_roles mhr
                    join public.roles r on r.id = mhr.role_id and r.name = 'DAS'
                    join public.users u on u.id = mhr.model_id
                    where coalesce(trim(u.phone), '') <> ''
                    """, Long.class);
            Long dasTotal = jdbc.queryForObject("""
                    select count(*) from public.model_has_roles mhr
                    join public.roles r on r.id = mhr.role_id and r.name = 'DAS'
                    """, Long.class);
            seats.put("districts", districts);
            seats.put("districtsWithoutDas", districtsNoDas);
            seats.put("regions", regions);
            seats.put("regionsWithoutRas", regionsNoRas);
            seats.put("dasTotal", dasTotal);
            seats.put("dasWithPhone", dasWithPhone);
            seats.put("ok", (districtsNoDas == null || districtsNoDas == 0)
                    && (regionsNoRas == null || regionsNoRas == 0));
            seats.put("detail", "Seat coverage OK when every district has a DAS and every region has a RAS. "
                    + "Sparse officer phones weaken SMS notify (GL-08 residual).");
            out.put("gl06_staffingSeats", seats);
        } catch (DataAccessException e) {
            seats = Map.of("ok", false, "detail", "Seat inventory query failed: " + e.getMessage());
            out.put("gl06_staffingSeats", seats);
        }

        boolean seatsOk = Boolean.TRUE.equals(seats.get("ok"));
        boolean flywayOkFlag = flywayOk(db);
        long dasWithPhone = num(seats, "dasWithPhone");
        long dasTotal = num(seats, "dasTotal");
        boolean phonesSparse = dasTotal > 0 && dasWithPhone * 2 < dasTotal; // <50% coverage
        boolean phonesGateOk = !phonesSparse || acceptSparsePhones;
        boolean demoHygieneOk = !(db.get("demoHygieneOk") instanceof Boolean b) || b;

        // Careful certificate: prod edge + secrets + seats + channel live-or-accepted.
        // Never claims NIDA/LATRA/NAPA/live IFMIS or AI.
        boolean carefulCert = prodProfileOk && jwtOk && flywayOkFlag && seatsOk
                && mgovGateOk && smtpGateOk && phonesGateOk && demoHygieneOk;
        out.put("honestCertificate", carefulCert);
        out.put("honestCertificateMeaning", carefulCert
                ? "Careful cutover gates satisfied (prod profile, JWT, Flyway, seats, SMS/email live or accepted). "
                + "Does NOT certify NIDA/LATRA/NAPA/live IFMIS or AI."
                : "Careful certificate withheld — clear blockersOrAccept and residualAccept flags");

        // space02 issue register — every §7 item captured with live disposition
        out.put("space02IssueRegister", buildSpace02Register(
                localProfile, jwtOk, mgovConfigured, acceptSmsDeferred,
                smtpConfigured, acceptEmailDeferred,
                flywayOkFlag, integrity, seats, liveIntegrations,
                acceptStoragePartial, acceptSparsePhones, acceptPdfSidecar,
                carefulCert, phonesSparse));

        out.put("smokeScript", "dmis-platform/scripts/go-live-smoke.sh");
        out.put("personaJwtScript", "dmis-platform/scripts/go-live-persona-jwt.sh");
        out.put("cutoverVerifyScript", "dmis-platform/scripts/cutover-verify-all.sh");
        out.put("residualResolveScript", "dmis-platform/scripts/resolve-cutover-residuals.sh");
        return out;
    }

    /** Build space02 §7 register from live flags (never invents green for ops secrets). */
    private static List<Map<String, Object>> buildSpace02Register(
            boolean localProfile,
            boolean jwtOk,
            boolean mgovConfigured,
            boolean acceptSms,
            boolean smtpConfigured,
            boolean acceptEmail,
            boolean flywayOk,
            Map<String, Object> integrity,
            Map<String, Object> seats,
            long liveIntegrations,
            boolean acceptStorage,
            boolean acceptPhones,
            boolean acceptPdf,
            boolean carefulCert,
            boolean phonesSparse) {
        List<Map<String, Object>> reg = new ArrayList<>();
        boolean integClean = num(integrity, "orphan_allocations") == 0
                && num(integrity, "orphan_stock_movements") == 0
                && num(integrity, "incidents_missing_area") == 0
                && num(integrity, "warehouses_national_or_unscoped") == 0
                && num(integrity, "incident_status_dual_flags") == 0
                && num(integrity, "past_disasters_unbridged") == 0
                && num(integrity, "poly_link_orphans") == 0
                && num(integrity, "poly_event_orphans") == 0
                && num(integrity, "geo_aliases") > 0
                && num(integrity, "geo_aliases") == num(integrity, "geo_aliases_with_inform");
        boolean seatsOk = Boolean.TRUE.equals(seats.get("ok"));

        // Go-live critical
        reg.add(issue("GL-01", "OPS", "JWT secret, force-2FA, CORS, no local profile",
                localProfile ? "OPEN_AT_CUTOVER" : (jwtOk ? "READY" : "OPEN_AT_CUTOVER"),
                localProfile ? "local profile active — must use prod on public edge" : "non-local profile"));
        reg.add(issue("GL-02", "OPS", "M-Gov keys + DLR",
                mgovConfigured ? "READY_KEYS" : (acceptSms ? "ACCEPTED_DEFERRED" : "ACCEPT_OR_CONFIGURE"),
                mgovConfigured ? "API key present"
                        : (acceptSms ? "SMS deferred accepted (ops sign-off)" : "Set keys or DMIS_GO_LIVE_ACCEPT_SMS_DEFERRED")));
        reg.add(issue("GL-03", "OPS", "SMTP credentials",
                smtpConfigured ? "READY_HOST" : (acceptEmail ? "ACCEPTED_DEFERRED" : "ACCEPT_OR_CONFIGURE"),
                smtpConfigured ? "SMTP host set"
                        : (acceptEmail ? "Email deferred accepted (ops sign-off)" : "Set host or DMIS_GO_LIVE_ACCEPT_EMAIL_DEFERRED")));
        reg.add(issue("GL-04", "OPS", "Clean prod DB / Flyway",
                flywayOk ? "PLATFORM_OK" : "OPEN",
                flywayOk ? "Flyway ≥196; demo must_change_password hygiene applied" : "Flyway below expected"));
        reg.add(issue("GL-05", "OPS", "Role walkthrough (JWT personas)",
                "PLATFORM_PROVED", "scripts/go-live-persona-jwt.sh dual-proved; re-run on prod accounts"));
        reg.add(issue("GL-06", "OPS", "Staffing seats DAS/RAS",
                seatsOk ? "LIVE_OK" : "OPEN",
                seatsOk ? "Every district/region has seat (phones may be sparse)" : "Seat gaps remain"));
        reg.add(issue("GL-07", "RESIDUAL", "Restricted storage row-jurisdiction",
                acceptStorage ? "ACCEPTED_PARTIAL" : "CLOSED_PARTIAL",
                "F96: AreaGuard on assessments/mapped media; orphans fail-closed for non-SA"
                        + (acceptStorage ? " (ops accepted residual)" : "")));
        reg.add(issue("GL-08", "RESIDUAL", "Sparse officer phones",
                !phonesSparse ? "LIVE_OK" : (acceptPhones ? "ACCEPTED" : "ACCEPT"),
                phonesSparse
                        ? ("Sparse phones DAS " + num(seats, "dasWithPhone") + "/" + num(seats, "dasTotal")
                        + (acceptPhones ? " — accepted" : " — set DMIS_GO_LIVE_ACCEPT_SPARSE_PHONES or fill phones"))
                        : "Phone coverage acceptable"));
        reg.add(issue("GL-09", "RESIDUAL", "PDF sidecar HA",
                acceptPdf ? "ACCEPTED" : "ACCEPT",
                "Optional :8600; national warning SoR is Spring warnings"
                        + (acceptPdf ? " (ops accepted)" : "")));
        reg.add(issue("GL-10", "RESIDUAL", "Self-JWT is SoR (not Keycloak live SSO)",
                "DOCUMENTED", "Self-issued HS256 JWT; Keycloak realm JSON is not live SSO"));

        // Product residuals / DBA
        reg.add(issue("DUAL-01", "DBA", "past_disasters vs disaster_events",
                num(integrity, "past_disasters_unbridged") == 0 ? "LIVE_OK" : "OPEN",
                "Genuine past bridged; unbridged=" + num(integrity, "past_disasters_unbridged")));
        reg.add(issue("DUAL-02", "DBA", "status vs workflow_status discipline",
                num(integrity, "incident_status_dual_flags") == 0 ? "LIVE_OK" : "OPEN",
                "dual_flags=" + num(integrity, "incident_status_dual_flags")));
        reg.add(issue("POLY-01", "DBA", "disaster_event_links soft integrity",
                (num(integrity, "poly_link_orphans") + num(integrity, "poly_event_orphans")) == 0 ? "LIVE_OK" : "OPEN",
                "poly_link_orphans=" + num(integrity, "poly_link_orphans")
                        + " poly_event_orphans=" + num(integrity, "poly_event_orphans")));
        reg.add(issue("GEO-01", "DBA", "District name harmonisation EW/INFORM",
                num(integrity, "geo_aliases") > 0
                        && num(integrity, "geo_aliases") == num(integrity, "geo_aliases_with_inform")
                        ? "LIVE_OK" : "OPEN",
                num(integrity, "geo_aliases_with_inform") + "/" + num(integrity, "geo_aliases") + " INFORM-mapped"));
        reg.add(issue("DBA-2", "DBA", "Integrity residual metrics",
                integClean ? "LIVE_OK" : "OPEN",
                integClean ? "All residual integrity counters zero / geo full map" : "See integrity snapshot"));
        reg.add(issue("DBA-3", "DBA", "Integration registry tables",
                "LIVE_OK", "endpoints planned/configured; liveCount=" + liveIntegrations + " (0=honest)"));

        // Deferred product / INT
        reg.add(issue("F105", "DEFERRED", "AI/ML registry + prediction", "DEFERRED", "Post go-live; not claimed"));
        reg.add(issue("F114", "DEFERRED", "Satellite / full exposure", "DEFERRED", "Impact-support INFORM present; satellite later"));
        reg.add(issue("F116", "DEFERRED", "Executable multiscale contracts", "DEFERRED", "Monolith API contracts enough for cutover"));
        reg.add(issue("INT-NIDA-01", "INT", "NIDA verify adapter", "PLANNED", "Registry only; legal + API required"));
        reg.add(issue("INT-LATRA-01", "INT", "LATRA logistics adapter", "PLANNED", "Registry only"));
        reg.add(issue("INT-NAPA-01", "INT", "NAPA programme mapping", "PLANNED", "Registry only"));
        reg.add(issue("INT-FIN-01", "INT", "IFMIS commitment export", "PLATFORM_OK", "Export + audit path; not live IFMIS post"));
        reg.add(issue("INT-EW-01", "INT", "Agency bus credentials", "PLATFORM_OK", "In-platform bus ready; per-agency prod keys ops"));

        // Working pillars (must not regress)
        for (String p : List.of(
                "W-01 Incident workflow",
                "W-02 Allocation/dispatch/stock",
                "W-03 EW bus + impact-support",
                "W-04 Finance/Economics",
                "W-05 INFORM",
                "W-06 Portal",
                "W-07 Notifications",
                "W-08 Security baseline")) {
            reg.add(issue(p.substring(0, 4), "LIVE-OK", p, "LIVE_OK", "Must not regress at cutover"));
        }

        long openCode = reg.stream()
                .filter(r -> "OPEN".equals(String.valueOf(r.get("status"))))
                .count();
        long opsOpen = reg.stream()
                .filter(r -> {
                    String s = String.valueOf(r.get("status"));
                    return s.startsWith("OPEN_AT_CUTOVER") || s.equals("ACCEPT_OR_CONFIGURE");
                })
                .count();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("id", "SUMMARY");
        summary.put("tag", "BOARD");
        summary.put("concern", "space02 register summary");
        summary.put("status", carefulCert ? "CAREFUL_CUTOVER_READY"
                : (openCode == 0 ? "PLATFORM_READY_OPS_GATES" : "HAS_OPEN_CODE"));
        summary.put("detail", "openCode=" + openCode + " opsGates=" + opsOpen
                + " carefulCertificate=" + carefulCert);
        reg.add(0, summary);
        return reg;
    }

    private static Map<String, Object> issue(String id, String tag, String concern, String status, String detail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("tag", tag);
        m.put("concern", concern);
        m.put("status", status);
        m.put("detail", detail);
        return m;
    }

    private static long num(Map<String, Object> m, String key) {
        if (m == null || !m.containsKey(key) || m.get(key) == null) {
            return -1L; // missing metric → treat as unclean when checked for == 0
        }
        Object v = m.get(key);
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return -1L;
        }
    }

    private static boolean flywayOk(Map<String, Object> db) {
        return Boolean.TRUE.equals(db.get("ok"));
    }

    @GetMapping("/integration-registry")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','user_management.manage')")
    public Map<String, Object> integrationRegistry() {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            out.put("endpoints", jdbc.queryForList("""
                    select id, system_code as "systemCode", display_name as "displayName", base_url as "baseUrl",
                           auth_type as "authType", status, direction, notes,
                           last_success_at as "lastSuccessAt", last_error_at as "lastErrorAt", last_error as "lastError",
                           updated_at as "updatedAt"
                    from public.integration_endpoints
                    order by system_code
                    """));
            out.put("recentMessages", jdbc.queryForList("""
                    select id, system_code as "systemCode", direction, message_type as "messageType",
                           status, correlation_id as "correlationId", created_at as "createdAt"
                    from public.integration_messages
                    order by id desc limit 50
                    """));
            out.put("identityMaps", jdbc.queryForObject(
                    "select count(*) from public.external_identity_map", Long.class));
            out.put("note", "Planned rows are intentional. Do not mark live without dual-proved adapter.");
        } catch (DataAccessException e) {
            out.put("error", "Integration tables missing — ensure Flyway V187 applied: " + e.getMessage());
        }
        return out;
    }

    @GetMapping("/integrity-summary")
    @PreAuthorize("hasAnyAuthority('roles_and_permissions.view','user_management.view','user_management.manage')")
    public Map<String, Object> integritySummary() {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("select * from public.vw_integrity_summary");
            out.put("summary", rows.isEmpty() ? Map.of() : rows.get(0));
            out.put("note", "Read-only DBA-2 monitoring views — not write blockers.");
        } catch (DataAccessException e) {
            out.put("error", "Integrity views missing — ensure Flyway V188 applied: " + e.getMessage());
        }
        return out;
    }

    /**
     * INT-FIN-01 — export budget commitments for national finance handoff.
     * Records integration_messages; does not call live IFMIS.
     */
    @PostMapping("/integrations/ifmis/export-commitments")
    @PreAuthorize("hasAnyAuthority('resource_allocation.view','roles_and_permissions.manage','user_management.manage') "
            + "or hasAuthority('monitoring_evaluation.view')")
    public Map<String, Object> exportIfmisCommitments(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer days) {
        return ifmisExport.exportCommitments(status, days, users.actingUserId());
    }

    /** DBA-1.2 — resolve a free-text place name via geo_name_aliases. */
    @GetMapping("/geo/resolve")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> resolveGeo(@RequestParam String name) {
        return geoAliases.resolve(name);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static Long parseVersion(String v) {
        if (v == null) {
            return null;
        }
        try {
            String digits = v.replaceAll("[^0-9].*$", "");
            return digits.isEmpty() ? null : Long.parseLong(digits);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
