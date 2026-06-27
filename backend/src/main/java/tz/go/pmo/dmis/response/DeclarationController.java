package tz.go.pmo.dmis.response;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Formal disaster declarations under the Disaster Management Act No. 6 of 2022 —
 * the headline legal instruments absent from the Laravel source:
 *
 *   • Disaster Area (s.32) — declared by the MINISTER by Government Gazette notice;
 *     directs the NDPRP in the area for up to 3 months (extendable); unlocks s.6 powers.
 *   • State of Emergency (s.33) — proclaimed by the PRESIDENT via the National Steering
 *     Committee under the Emergency Powers Act (Cap 221).
 *
 * The escalation chain is faithful to the Act (it is statutory, not reconfigurable like the
 * resource-approval engine): propose → National Technical Committee review (s.10) → National
 * Steering Committee endorsement (s.8(1)(d) "advise the declaring authority") → the authority
 * declares. Every step is journaled in declaration_events.
 */
@RestController
@RequestMapping("/v1/response/declarations")
public class DeclarationController {

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;

    public DeclarationController(JdbcTemplate jdbc, IncidentWorkflowService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @GetMapping
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("declarations", jdbc.queryForList("""
                select d.*, u.name as declared_by_name, pu.name as proposed_by_name,
                       (d.status = 'declared' and d.effective_until is not null and d.effective_until < current_date) as is_expired,
                       case when d.declaration_type = 'disaster_area' then 'Disaster Area (s.32)'
                            else 'State of Emergency (s.33)' end as type_label
                from public.disaster_declarations d
                left join public.users u on u.id = d.declared_by
                left join public.users pu on pu.id = d.proposed_by
                order by d.created_at desc limit 100
                """));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status = 'declared'
                            and (effective_until is null or effective_until >= current_date)) as active,
                       count(*) filter (where status in ('proposed','technical_review','steering_endorsed')) as in_chain,
                       count(*) filter (where status = 'revoked'
                            or (status = 'declared' and effective_until < current_date)) as ended
                from public.disaster_declarations
                """));
        return out;
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> out = new LinkedHashMap<>(findOr404(id));
        out.put("events", jdbc.queryForList("""
                select e.*, u.name as user_name from public.declaration_events e
                left join public.users u on u.id = e.user_id
                where e.declaration_id = ? order by e.created_at
                """, id));
        return Map.of("declaration", out);
    }

    /** Propose a declaration — usually from a disaster-posture activation. */
    @PreAuthorize("hasAuthority('disaster_declarations.propose')")
    @PostMapping
    @Transactional
    public Map<String, Object> propose(@RequestBody Map<String, Object> body) {
        String type = require(body.get("declaration_type"), "declaration_type");
        if (!List.of("disaster_area", "state_of_emergency").contains(type)) {
            throw new BusinessRuleException("declaration_type must be disaster_area or state_of_emergency.");
        }
        boolean disasterArea = "disaster_area".equals(type);
        String authority = disasterArea ? "Minister" : "President";
        String legalBasis = disasterArea ? "DM Act 2022 s.32" : "DM Act 2022 s.33 + Emergency Powers Act (Cap 221)";
        Long activationId = lngOrNull(body.get("activation_id"));
        Boolean sim = activationId == null ? Boolean.FALSE : jdbc.queryForObject(
                "select is_simulation from public.response_activations where id = ?", Boolean.class, activationId);
        Long id = jdbc.queryForObject("""
                insert into public.disaster_declarations(declaration_type, authority, legal_basis, activation_id,
                    incident_id, hazard, area_scope, justification, status, is_simulation, proposed_by,
                    created_at, updated_at)
                values (?,?,?,?,?,?,?,?, 'proposed', ?, ?, now(), now()) returning id
                """, Long.class, type, authority, legalBasis, activationId, lngOrNull(body.get("incident_id")),
                str(body.get("hazard")), require(body.get("area_scope"), "area_scope"),
                str(body.get("justification")), Boolean.TRUE.equals(sim), users.actingUserId());
        event(id, "proposed", "Proposed by DMD", "Declaration proposed for " + body.get("area_scope"));
        return Map.of("success", true, "id", id,
                "message", (disasterArea ? "Disaster Area" : "State of Emergency") + " declaration proposed.");
    }

    /** National Technical Committee review (s.10) — proposed → technical_review. */
    @PreAuthorize("hasAuthority('disaster_declarations.review')")
    @PostMapping("/{id}/technical-review")
    @Transactional
    public Map<String, Object> technicalReview(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        advance(id, "proposed", "technical_review", "technical_reviewed",
                "National Disaster Management Technical Committee", note(body));
        return ok("Reviewed by the National Technical Committee; advanced for steering endorsement.");
    }

    /** National Steering Committee endorsement (s.8(1)(d)) — technical_review → steering_endorsed. */
    @PreAuthorize("hasAuthority('disaster_declarations.endorse')")
    @PostMapping("/{id}/endorse")
    @Transactional
    public Map<String, Object> endorse(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        advance(id, "technical_review", "steering_endorsed", "steering_endorsed",
                "National Disaster Management Steering Committee", note(body));
        return ok("Endorsed by the National Steering Committee; the declaring authority may now declare.");
    }

    /**
     * The authority declares: Minister gazettes the Disaster Area (s.32) / President proclaims the
     * State of Emergency (s.33). Sets the effective window (disaster area defaults to 3 months).
     */
    @PreAuthorize("hasAuthority('disaster_declarations.declare')")
    @PostMapping("/{id}/declare")
    @Transactional
    public Map<String, Object> declare(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> d = findOr404(id);
        if (!"steering_endorsed".equals(d.get("status"))) {
            throw new BusinessRuleException("Only a steering-endorsed declaration can be declared.");
        }
        boolean disasterArea = "disaster_area".equals(d.get("declaration_type"));
        // s.32 / s.33: the Minister declares a Disaster Area; the President proclaims a State of Emergency.
        // Super Admin is the break-glass actor; the @PreAuthorize above already excluded the command/proposer tier.
        if (!actorHasRole(Authz.SUPER_ADMIN)) {
            String required = disasterArea ? Authz.MINISTER : Authz.PRESIDENT;
            if (!actorHasRole(required)) {
                throw new BusinessRuleException("Only the " + required
                        + (disasterArea ? " may gazette a Disaster Area (s.32)." : " may proclaim a State of Emergency (s.33)."));
            }
        }
        LocalDate from = LocalDate.now();
        // s.32: up to 3 months, extendable. State of Emergency window is set by the proclamation.
        LocalDate until = disasterArea ? from.plusMonths(3)
                : (body != null && body.get("effective_until") != null ? LocalDate.parse(String.valueOf(body.get("effective_until"))) : null);
        jdbc.update("""
                update public.disaster_declarations set status = 'declared', declared_by = ?, declared_at = now(),
                    effective_from = ?, effective_until = ?, gazette_reference = ?, updated_at = now()
                where id = ?
                """, users.actingUserId(), from, until,
                str(body == null ? null : body.get("gazette_reference")), id);
        String authority = String.valueOf(d.get("authority"));
        event(id, "declared", authority,
                disasterArea ? "Disaster Area declared by the Minister (Gazette); NDPRP directed for the area until " + until
                        : "State of Emergency proclaimed by the President");
        return ok((disasterArea ? "Disaster Area declared (s.32). Effective until " + until + "."
                : "State of Emergency proclaimed (s.33)."));
    }

    /** Extend a Disaster Area declaration (s.32 — "or such other extended period"). */
    @PreAuthorize("hasAuthority('disaster_declarations.declare')")
    @PostMapping("/{id}/extend")
    @Transactional
    public Map<String, Object> extend(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> d = findOr404(id);
        if (!"declared".equals(d.get("status"))) {
            throw new BusinessRuleException("Only an active declaration can be extended.");
        }
        // Parse in Java so a malformed date fails as a clean 400, not a raw ::date 500.
        java.time.LocalDate until;
        try {
            until = java.time.LocalDate.parse(require(body.get("effective_until"), "effective_until"));
        } catch (java.time.format.DateTimeParseException e) {
            throw new BusinessRuleException("effective_until must be a valid date (YYYY-MM-DD).");
        }
        jdbc.update("update public.disaster_declarations set effective_until = ?, updated_at = now() where id = ?", until, id);
        event(id, "extended", String.valueOf(d.get("authority")), "Extended to " + until);
        return ok("Declaration extended to " + until + ".");
    }

    /** Revoke / lift a declaration. */
    @PreAuthorize("hasAuthority('disaster_declarations.declare')")
    @PostMapping("/{id}/revoke")
    @Transactional
    public Map<String, Object> revoke(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> d = findOr404(id);
        if (List.of("revoked", "expired").contains(String.valueOf(d.get("status")))) {
            throw new BusinessRuleException("This declaration is already ended.");
        }
        String reason = require(body.get("reason"), "reason");
        jdbc.update("""
                update public.disaster_declarations set status = 'revoked', revoked_at = now(),
                    revocation_reason = ?, updated_at = now() where id = ?
                """, reason, id);
        event(id, "revoked", String.valueOf(d.get("authority")), reason);
        return ok("Declaration revoked.");
    }

    /** The statutory committee hierarchy (reference data for assignment + the s.35 donation chain). */
    @GetMapping("/committees")
    public Map<String, Object> committees() {
        return Map.of("committees", jdbc.queryForList(
                "select * from public.disaster_committees order by sort_order"));
    }

    // ── internals ──

    private void advance(long id, String fromStatus, String toStatus, String action, String actorRole, String note) {
        Map<String, Object> d = findOr404(id);
        if (!fromStatus.equals(d.get("status"))) {
            throw new BusinessRuleException("This action requires the declaration to be at '" + fromStatus + "'.");
        }
        jdbc.update("update public.disaster_declarations set status = ?, updated_at = now() where id = ?", toStatus, id);
        event(id, action, actorRole, note);
    }

    private void event(long declarationId, String action, String actorRole, String note) {
        jdbc.update("""
                insert into public.declaration_events(declaration_id, action, actor_role, user_id, note, created_at)
                values (?,?,?,?,?,now())
                """, declarationId, action, actorRole, users.actingUserId(), note);
    }

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.disaster_declarations where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Declaration not found.");
        }
        return rows.get(0);
    }

    /** True if the acting principal holds the given role (Spring authorities are {@code ROLE_<name>}). */
    private static boolean actorHasRole(String role) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> ("ROLE_" + role).equals(a.getAuthority()));
    }

    private static Map<String, Object> ok(String message) {
        return Map.of("success", true, "message", message);
    }

    private static String note(Map<String, Object> body) {
        return body == null ? null : str(body.get("note"));
    }

    private static String require(Object v, String field) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return s;
    }

    private static Long lngOrNull(Object v) {
        return v == null ? null : (long) Double.parseDouble(String.valueOf(v));
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
