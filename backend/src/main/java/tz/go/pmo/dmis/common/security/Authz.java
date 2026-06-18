package tz.go.pmo.dmis.common.security;

/**
 * The single source of truth for DMIS authorization role names and {@code @PreAuthorize}
 * expressions. Before this class, real role checks existed only as seven divergent, copy-pasted
 * {@code CAN_WRITE} literals across {@code settings/*} and {@code repository/DisasterEventController};
 * every other endpoint was a bare {@code isAuthenticated()}. Consolidating here means roles are
 * declared once and referenced everywhere — change a role group in one place, not seven.
 *
 * <p><b>Role names are matched by exact string.</b> Spring authorities are {@code ROLE_<name>}
 * (see {@link KeycloakRealmRoleConverter}), and {@code hasAnyRole('Asst. Director')} prepends
 * {@code ROLE_} then string-compares — so the spaces and the period in {@code "Asst. Director"}
 * are significant and must match the seeded {@code public.roles.name} verbatim. The canonical
 * 13 are seeded by {@code local/LocalDataSeeder} (+ {@code UserRoleCoverageSeeder}); the statutory
 * declaration authorities (Minister, President, the committees) are added separately.
 *
 * <p>{@code @PreAuthorize} takes a SpEL <em>string literal</em>, which must be a compile-time
 * constant. The expression constants below are built by concatenating {@code static final String}
 * role tokens, which Java folds into a compile-time constant — so they are valid annotation values.
 */
public final class Authz {

    private Authz() {
    }

    // ---- The 13 operational SRS roles (verbatim from LocalDataSeeder.seedUsers) --------------
    public static final String SUPER_ADMIN = "Super Admin";
    public static final String SECRETARY = "Secretary";
    public static final String DIRECTOR = "Director";
    public static final String ASST_DIRECTOR = "Asst. Director";
    public static final String EOCC = "EOCC";
    public static final String COMMS_OFFICER = "Comms Officer";
    public static final String ICT_ADMIN = "ICT Admin";
    public static final String MDA_FOCAL = "MDA Focal";
    public static final String RAS = "RAS";
    public static final String REG_DC = "Reg DC";
    public static final String DAS = "DAS";
    public static final String DIST_DC = "Dist DC";
    public static final String PARTNERS = "Partners";
    /** District Executive Director — approves incidents at the district stage (jurisdiction-scoped). */
    public static final String DED = "DED";
    /** Regional Commissioner — regional oversight/viewer of incidents in their region. */
    public static final String RC = "RC";

    // ---- Statutory declaration authorities (Disaster Management Act No. 6 of 2022) ----------
    /** s.32 — the Minister gazettes a Disaster Area. */
    public static final String MINISTER = "Minister";
    /** s.33 — the President proclaims a State of Emergency. */
    public static final String PRESIDENT = "President";
    /** s.10 — reviews a proposed declaration before endorsement. */
    public static final String NATIONAL_TECHNICAL_COMMITTEE = "National Technical Committee";
    /** s.8(1)(d) — advises/endorses the declaring authority. */
    public static final String NATIONAL_STEERING_COMMITTEE = "National Steering Committee";

    /** The full canonical role set — used by the local persona default so the super-user truly covers every gate. */
    public static final String[] ALL = {
            SUPER_ADMIN, SECRETARY, DIRECTOR, ASST_DIRECTOR, EOCC, COMMS_OFFICER, ICT_ADMIN,
            MDA_FOCAL, RAS, REG_DC, DAS, DIST_DC, PARTNERS, DED, RC,
            MINISTER, PRESIDENT, NATIONAL_TECHNICAL_COMMITTEE, NATIONAL_STEERING_COMMITTEE
    };

    // ---- Base expressions --------------------------------------------------------------------
    public static final String AUTHENTICATED = "isAuthenticated()";

    /** Platform administration (user/role/permission management). Was settings UserManagement/RolePermission CAN_WRITE. */
    public static final String SYS_ADMIN = "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "')";

    /** Reference-data administration that the Director may also perform. Was settings LocationController CAN_WRITE. */
    public static final String LOCATION_WRITE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + DIRECTOR + "')";

    /** Translations / content i18n. Was settings TranslationController CAN_WRITE. */
    public static final String TRANSLATION_WRITE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + COMMS_OFFICER + "')";

    /** Approval-workflow configuration. Was settings ApprovalWorkflowConfigController CAN_WRITE. */
    public static final String APPROVAL_CONFIG_WRITE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + DIRECTOR + "','" + SECRETARY + "')";

    /** Resource catalogue maintenance. Was settings ResourceCatalogueController CAN_WRITE. */
    public static final String CATALOGUE_WRITE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + DIRECTOR + "','" + EOCC + "','" + ASST_DIRECTOR + "')";

    /** Disaster-repository (Sendai) maintenance. Was repository DisasterEventController CAN_WRITE. */
    public static final String REPOSITORY_WRITE =
            "hasAnyRole('" + EOCC + "','" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "')";

    /** Super Admin only — defense-in-depth on writes that are otherwise locked at the service layer. */
    public static final String SUPER_ADMIN_ONLY = "hasRole('" + SUPER_ADMIN + "')";

    // ---- One Health (mirrors the Laravel OhEvent/OhDirective/OhDissemination can* checks) ----------
    /** OH approver/oversight: event review, dissemination approve/resend, event close/archive. */
    public static final String OH_APPROVE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "')";
    /** OH operator/issuer: issue directive, directive update, escalate, create/edit/progress actions. */
    public static final String OH_OPERATE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "')";
    /** OH dissemination AUTHORING (draft stakeholder/public): operator set + Comms Officer (drafts, cannot approve). */
    public static final String OH_DISSEMINATE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + COMMS_OFFICER + "')";
    /** OH recipient-stakeholder acknowledgement (the documented Partners-allowed exception). */
    public static final String OH_ACKNOWLEDGE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + PARTNERS + "','" + MDA_FOCAL + "','" + RAS + "','" + REG_DC + "','" + DAS + "','" + DIST_DC + "')";
    /** OH event reporting (event store): all workflow operators incl. sector/regional/district; not view-only/Comms-only. */
    public static final String OH_REPORT_EVENT =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + MDA_FOCAL + "','" + RAS + "','" + REG_DC + "','" + DAS + "','" + DIST_DC + "')";
    /** OH directive implementation response: operators + recipient institutions (per-row attachment guard in the service). */
    public static final String OH_RESPOND =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + PARTNERS + "','" + MDA_FOCAL + "','" + RAS + "','" + REG_DC + "','" + DAS + "','" + DIST_DC + "')";

    // ---- Recovery (Laravel admin route group: oversight + operations + sector; no field/view-only) --
    /** Author/register recovery programs, strategic projects, relief logs, project status. */
    public static final String RECOVERY_MANAGE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + EOCC + "','" + MDA_FOCAL + "')";
    /** Lifecycle/verification transitions (program status, relief confirm) — supervisory operators. */
    public static final String RECOVERY_OVERSIGHT =
            "hasAnyRole('" + SUPER_ADMIN + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + EOCC + "')";
    /** Publication/approval gate (knowledge approve) — author/approver separation. */
    public static final String RECOVERY_APPROVE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + SECRETARY + "')";
    /** Broad authoring of pending knowledge entries (adds Comms Officer who curates the library). */
    public static final String RECOVERY_KNOWLEDGE_SUBMIT =
            "hasAnyRole('" + SUPER_ADMIN + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + EOCC + "','" + MDA_FOCAL + "','" + COMMS_OFFICER + "')";

    // ---- Notification channel diagnostics (real outbound test SMS/email) ----------------------------
    /** Gateway commissioning/diagnostics: test SMS + test email. Comms owns dissemination, ICT owns the gateway. */
    public static final String CHANNEL_TEST_WRITE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + COMMS_OFFICER + "')";

    // ---- Response: Disaster Needs Assessment (field damage survey; maker-checker on verify) ----------
    /**
     * Author/operate a damage assessment (create/update/submit/photo): national ops + sector + regional/
     * district field officers + admins. Field officers (RAS/Reg DC/DAS/Dist DC) DO the surveys, so they are
     * included; Comms Officer and external Partners are not assessors. Mirrors {@link #OH_REPORT_EVENT}.
     */
    public static final String RESPONSE_ASSESS_WRITE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + MDA_FOCAL + "','" + RAS + "','" + REG_DC + "','" + DAS + "','" + DIST_DC + "','" + DED + "','" + SECRETARY + "')";
    /**
     * Verify/complete an assessment — the CHECKER step. Oversight only, so a field assessor who submitted an
     * assessment cannot also verify it (segregation of duties).
     */
    public static final String RESPONSE_ASSESS_VERIFY =
            "hasAnyRole('" + SUPER_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "')";

    // ---- Response operations: a two-tier ladder (operate vs oversight) + the national command tier -
    /**
     * The response OPERATOR tier — report/run incidents, work the command-post DRF lanes, author
     * anticipatory plans, and request/move resources. Identical actor set to {@link #RESPONSE_ASSESS_WRITE}
     * (national ops + sector + regional/district field officers + admins; excludes Comms Officer and
     * external Partners), aliased so the operator tier is declared once. The precise per-step approver
     * and segregation-of-duties checks live in the workflow services / {@code ApprovalWorkflowEngine}.
     */
    public static final String RESPONSE_OPERATE = RESPONSE_ASSESS_WRITE;
    /**
     * The response OVERSIGHT / approver tier — approve or reject resource requests and anticipatory
     * plans, fast-track, archive. Identical set to {@link #RESPONSE_ASSESS_VERIFY} (Super Admin + EOCC +
     * Director + Asst. Director), aliased; it excludes the field requesters so maker ≠ checker.
     */
    public static final String RESPONSE_OVERSIGHT = RESPONSE_ASSESS_VERIFY;
    /**
     * National response COMMAND — the statutory disaster-declaration chain and high-level response
     * command: Super Admin + Secretary + Director + Asst. Director + EOCC; excludes field/sector/
     * partners/comms.
     *
     * <p><b>Interim:</b> the statutory authorities — the Minister gazettes a Disaster Area
     * (s.32), the President proclaims a State of Emergency (s.33), and the National Technical / Steering
     * Committees review — are not yet seeded as roles (only the 13 operational roles exist). This gate
     * therefore keeps everyone below national command out now; once the statutory roles are seeded, the
     * {@code declare}/{@code endorse} steps tighten to those specific authorities.
     */
    public static final String RESPONSE_COMMAND =
            "hasAnyRole('" + SUPER_ADMIN + "','" + SECRETARY + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + EOCC + "')";
    /**
     * Submit a stakeholder bid / supply offer — the one partner-facing write in Response. External
     * Partners are the bidders, so they are included alongside the response operators who may record an
     * offer on a stakeholder's behalf; excludes Comms (the accept/dismiss decision is the OVERSIGHT tier).
     */
    public static final String RESPONSE_BID_SUBMIT =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + PARTNERS + "','" + MDA_FOCAL + "','" + RAS + "','" + REG_DC + "','" + DAS + "','" + DIST_DC + "')";

    // ---- Statutory declaration chain — each step gated to its own authority, not one command tier --
    /** s.10 review step — the National Technical Committee (Super Admin may act break-glass). */
    public static final String DECLARE_REVIEW =
            "hasAnyRole('" + SUPER_ADMIN + "','" + NATIONAL_TECHNICAL_COMMITTEE + "')";
    /** s.8 endorsement step — the National Steering Committee. */
    public static final String DECLARE_ENDORSE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + NATIONAL_STEERING_COMMITTEE + "')";
    /**
     * The declaring / standing authority — Minister (s.32) or President (s.33); also governs extend + revoke.
     * The per-type split (Minister declares a Disaster Area, the President proclaims a State of Emergency) is
     * asserted inside {@code DeclarationController.declare}.
     */
    public static final String DECLARE_AUTHORITY =
            "hasAnyRole('" + SUPER_ADMIN + "','" + MINISTER + "','" + PRESIDENT + "')";

    // ---- Early Warning (EW): bulletin ingest, warning lifecycle, dissemination, field monitoring ----
    /**
     * Ingest PMO-DMD bulletins and store generated EW products (pending warnings, 722E_4 PDFs)
     * — trusted-operator data entry into the national warning pipeline; not for field/partner/comms tiers.
     */
    public static final String EW_INGEST =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "')";
    /**
     * Warning lifecycle gate — approve / publish a warning (the critical pending→public-map step) and
     * withdraw a published agency bulletin. Oversight tier only, so the operator who drafts a warning is
     * not the one who releases it (maker-checker on the public alert).
     */
    public static final String EW_APPROVE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "')";
    /** Trigger multi-channel dissemination (public + leaders SMS, stakeholder email): operators + Comms. */
    public static final String EW_DISSEMINATE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + COMMS_OFFICER + "')";
    /** Field monitoring submissions (focal-point reports, cross-agency bulletins): all operators incl. regional/district field officers. Mirrors {@link #OH_REPORT_EVENT}. */
    public static final String EW_REPORT = OH_REPORT_EVENT;

    // ---- Content / Public-Portal administration (CMS: news, education, hazard cards, slides, agencies) -
    /**
     * Author/maintain published portal content — news, educational content & materials, hazard-card
     * sections, portal slides/gallery/settings, media upload. Comms owns the public voice; ICT/Super Admin
     * administer. Excludes field/partner tiers (cannot publish to the citizen-facing portal).
     */
    public static final String CONTENT_MANAGE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + COMMS_OFFICER + "','" + ICT_ADMIN + "')";
    /**
     * Compose &amp; send a communication (SMS/email broadcast) from the Communication Center. The dissemination
     * operators ({@link #RESPONSE_OPERATE}: command + sector + field officers) PLUS the Comms Officer who owns
     * the public voice. A SUPERSET of the Alert-Dissemination gate ({@link #RESPONSE_OPERATE}) so that anyone
     * who can disseminate the normal way can also send from the Communication Center (same action, one gate).
     */
    public static final String COMMS_DISSEMINATE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + COMMS_OFFICER + "','" + EOCC + "','"
            + DIRECTOR + "','" + ASST_DIRECTOR + "','" + MDA_FOCAL + "','" + RAS + "','" + REG_DC + "','"
            + DAS + "','" + DIST_DC + "')";
    /** Register/maintain partner agencies shown on the portal — administrators (delete tightens to {@link #SYS_ADMIN}). */
    public static final String AGENCY_MANAGE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + DIRECTOR + "')";
    /** Active-threat board authoring (threats, updates, contingency-plan status) — response oversight, not Comms. */
    public static final String THREAT_MANAGE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "')";

    // ---- Stakeholder registry administration ---------------------------------------------------------
    /** Register / edit a stakeholder (partner) organisation — an administrative function, never any signed-in user. */
    public static final String STAKEHOLDER_ADMIN =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + DIRECTOR + "')";
    /** Verify a stakeholder organisation — the trust decision; oversight/command tier (separate from the registrar). */
    public static final String STAKEHOLDER_VERIFY =
            "hasAnyRole('" + SUPER_ADMIN + "','" + DIRECTOR + "','" + SECRETARY + "','" + ASST_DIRECTOR + "')";

    // ---- Preparedness operations (training plans, evacuation centres, warehouses, inventory) ---------
    /**
     * Manage preparedness assets/plans — national ops + sector + regional/district field officers (who
     * plan and run their own jurisdiction's centres, warehouses and drills); excludes Comms and Partners.
     * <b>Provided for the Preparedness module owner to apply</b> (those controllers are currently
     * {@code isAuthenticated()}-only); refine the role set if the module's doctrine differs.
     */
    public static final String PREPAREDNESS_MANAGE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + EOCC + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + MDA_FOCAL + "','" + RAS + "','" + REG_DC + "','" + DAS + "','" + DIST_DC + "')";

    // ---- Prevention & Mitigation (DRR planning: measures, hazards, frameworks, risk assessments) ------
    /**
     * Author DRR/mitigation reference data — mitigation measures, infrastructure items, hazards (+status),
     * frameworks, risk assessments (create/edit/delete), past disasters. National ops + technical admin;
     * excludes view-only/partner/field-only tiers. Closes the live-proven hole where a read-only viewer
     * created and deleted a hazard.
     */
    public static final String MITIGATION_MANAGE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + ICT_ADMIN + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + EOCC + "')";
    /**
     * Approve / publish a risk assessment — the oversight gate. Deliberately EXCLUDES MDA Focal (the
     * assessment proved an MDA-Focal could approve a risk assessment) and ICT (approval is a doctrine
     * decision, not a technical one) so the author tier cannot self-approve.
     */
    public static final String MITIGATION_APPROVE =
            "hasAnyRole('" + SUPER_ADMIN + "','" + DIRECTOR + "','" + ASST_DIRECTOR + "','" + EOCC + "')";
}
