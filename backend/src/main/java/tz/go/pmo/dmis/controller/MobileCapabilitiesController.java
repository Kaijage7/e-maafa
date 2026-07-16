package tz.go.pmo.dmis.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Machine-readable hybrid transport contract for mobile clients.
 *
 * <p>Does not implement every mobile feature; it declares which paths are ready, which stay on REST,
 * which stay on GraphQL, and which are planned so a native app is not architecturally blocked.</p>
 */
@RestController
@RequestMapping("/v1/mobile")
public class MobileCapabilitiesController {

    @GetMapping("/capabilities")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> capabilities() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("api_version", "1");
        body.put("hybrid", true);
        body.put("principle", "GraphQL for composite reads and native foreground wake-up; "
                + "REST for commands, auth, uploads, offline cursor recovery, and web SSE.");

        Map<String, Object> graphql = new LinkedHashMap<>();
        graphql.put("http", "POST /api/graphql");
        graphql.put("websocket", "wss://<host>/api/graphql (graphql-transport-ws)");
        graphql.put("operations_ready", List.of(
                Map.of("name", "mobileHome", "kind", "query",
                        "use", "Composite home: viewer + incidents + notifications + syncCursor"),
                Map.of("name", "incidentWorkspace", "kind", "query",
                        "use", "Single incident detail workspace (tasks/allocations summary)"),
                Map.of("name", "mobileReference", "kind", "query",
                        "use", "Offline bootstrap: hazards, types, severities, sources, regions"),
                Map.of("name", "mobileSync", "kind", "subscription",
                        "use", "Content-free foreground wake-up only — then drain REST cursors")));
        graphql.put("operations_forbidden", List.of("mutations", "domain writes", "file upload"));
        graphql.put("allowlist_roots", List.of(
                "mobileHome", "incidentWorkspace", "mobileReference", "mobileSync"));
        body.put("graphql", graphql);

        Map<String, Object> rest = new LinkedHashMap<>();
        rest.put("ready", List.of(
                Map.of("method", "POST", "path", "/api/v1/auth/login", "use", "Authenticate (JWT)"),
                Map.of("method", "POST", "path", "/api/v1/mobile/incidents",
                        "use", "Idempotent mobile incident create", "headers", List.of("Idempotency-Key")),
                Map.of("method", "PUT", "path", "/api/v1/mobile/devices/current",
                        "use", "Register installation / optional push token"),
                Map.of("method", "DELETE", "path", "/api/v1/mobile/devices/current",
                        "use", "Revoke installation"),
                Map.of("method", "GET", "path", "/api/v1/sync/changes",
                        "use", "Durable incident delta pages after offline/reconnect"),
                Map.of("method", "GET", "path", "/api/v1/sync/stream",
                        "use", "Web SSE wake-up (Angular); native prefers GraphQL mobileSync or FCM"),
                Map.of("method", "GET", "path", "/api/v1/notifications/changes",
                        "use", "Notification catch-up cursor"),
                Map.of("method", "GET", "path", "/api/v1/response/incidents/{id}",
                        "use", "Full REST incident show when workspace GraphQL is not enough"),
                Map.of("method", "POST", "path", "/api/v1/response/incidents",
                        "use", "Web multipart create (mobile JSON adapter preferred for offline queue)")));
        rest.put("future_mobile_adapters", List.of(
                Map.of("path", "/api/v1/mobile/drafts/assessments",
                        "use", "Offline assessment drafts with Idempotency-Key",
                        "transport", "REST"),
                Map.of("path", "/api/v1/mobile/uploads",
                        "use", "Resumable media parts + complete",
                        "transport", "REST"),
                Map.of("path", "/api/v1/mobile/commands/*",
                        "use", "Workflow submit/approve adapters that reuse existing domain services",
                        "transport", "REST"),
                Map.of("path", "FCM/APNs sender",
                        "use", "Background wake using platform.mobile_device_installations",
                        "transport", "push → REST cursor")));
        body.put("rest", rest);

        Map<String, Object> offline = new LinkedHashMap<>();
        offline.put("local_client_states", List.of(
                "DRAFT", "QUEUED", "SYNCING", "SYNCED", "CONFLICT", "REJECTED"));
        offline.put("note", "Local client states must stay separate from server workflow statuses.");
        offline.put("retry_header", "Idempotency-Key");
        offline.put("device_headers", List.of("X-Device-Installation", "X-Client-Version"));
        offline.put("convergence", "Write via REST → same PostgreSQL → GraphQL snapshot / REST delta / SSE");
        body.put("offline_policy", offline);

        Map<String, Object> web = new LinkedHashMap<>();
        web.put("spa_transport", "REST + SSE (no GraphQL required)");
        web.put("sse", "GET /api/v1/sync/stream");
        body.put("web", web);

        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }
}
