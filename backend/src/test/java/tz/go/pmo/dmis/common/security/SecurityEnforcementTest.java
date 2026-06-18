package tz.go.pmo.dmis.common.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The enforcement proof on the actual runnable {@code local} chain (method security ON +
 * {@link LocalAuthFilter} persona). A guarded write endpoint must: reject a tokenless-but-wrong-role
 * persona with 403, clear the gate for the right role (then 400 on the empty body), and reject a
 * bogus bearer token with 401. Full {@code @SpringBootTest} so it exercises the same filter chain
 * the server runs; the local profile uses the dev Postgres and contacts no Keycloak.
 *
 * <p>Requires the local dev Postgres (the standard local dependency); CI provides it as a service.
 * The complementary {@link JwtTokenServiceTest} proves the signed-token contract with no DB at all.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class SecurityEnforcementTest {

    private static final String WRITE = "/v1/settings/users";

    @Autowired
    private MockMvc mvc;

    @Test
    void wrongRolePersonaIsForbidden() throws Exception {
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void fieldOfficerRoleIsForbiddenOnAdminWrite() throws Exception {
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminRoleClearsTheGate() throws Exception {
        // Super Admin passes @PreAuthorize; the empty body then fails @Valid → 400 (not 403).
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Super Admin"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ictAdminRoleClearsTheGate() throws Exception {
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "ICT Admin"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneHealthReviewDeniesViewOnlyPartner() throws Exception {
        // @PreAuthorize(OH_APPROVE) excludes Partners — blocked before the controller body (no mutation).
        mvc.perform(post("/v1/onehealth/events/1/review").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void recoveryProgramCreateDeniesFieldRole() throws Exception {
        // @PreAuthorize(RECOVERY_MANAGE) excludes DAS (field/district) — gated before any write.
        mvc.perform(post("/v1/recovery/recovery-programs").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void channelTestSmsDeniesNonAdmin() throws Exception {
        // @PreAuthorize(CHANNEL_TEST_WRITE) excludes DAS — blocked before any real gateway send.
        mvc.perform(post("/v1/notifications/test/sms").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void assessmentSubmitDeniesPartners() throws Exception {
        // @PreAuthorize(RESPONSE_ASSESS_WRITE) excludes external Partners — cannot operate damage assessments.
        mvc.perform(post("/v1/response/assessments/1/submit").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void assessmentVerifyDeniesFieldAssessor() throws Exception {
        // maker-checker: RESPONSE_ASSESS_VERIFY excludes the field role DAS — a field assessor may submit but not verify.
        mvc.perform(post("/v1/response/assessments/1/verify").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void incidentSubmitDeniesPartners() throws Exception {
        // @PreAuthorize(RESPONSE_OPERATE) excludes external Partners — they cannot run the incident workflow.
        mvc.perform(post("/v1/response/incidents/1/submit").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void declarationDeclareDeniesFieldRole() throws Exception {
        // DECLARE_AUTHORITY (Minister/President) excludes a district officer — a DAS cannot gazette a declaration.
        mvc.perform(post("/v1/response/declarations/1/declare").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void declarationDeclareDeniesCommandProposerTier() throws Exception {
        // The command tier (e.g. Director) PROPOSES, but DECLARE_AUTHORITY excludes it — so one command-tier
        // user can no longer drive propose→declare. Only the Minister/President (or Super Admin) may declare.
        mvc.perform(post("/v1/response/declarations/1/declare").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Director"))
                .andExpect(status().isForbidden());
    }

    @Test
    void declarationTechnicalReviewDeniesCommandTier() throws Exception {
        // s.10 review is the National Technical Committee's step — the command tier cannot self-review its proposal.
        mvc.perform(post("/v1/response/declarations/1/technical-review").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Director"))
                .andExpect(status().isForbidden());
    }

    @Test
    void declarationDeclareClearsForMinister() throws Exception {
        // The Minister clears the authorization gate (then fails on the missing declaration → not a 403).
        mvc.perform(post("/v1/response/declarations/999999/declare").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Minister"))
                .andExpect(status().is4xxClientError())
                .andExpect(status().isNotFound());
    }

    // ── Coverage — newly gated endpoints (Early Warning, Content/CMS, Stakeholder registry) ──

    @Test
    void ewWarningApproveDeniesPartners() throws Exception {
        // EW_APPROVE (oversight) excludes external Partners — they cannot release a pending warning to the public map.
        mvc.perform(post("/v1/ew/warnings/1/approve").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void ewWarningPublishDeniesFieldRole() throws Exception {
        // EW_APPROVE excludes district field officers — a DAS cannot publish a warning to the citizen portal.
        mvc.perform(post("/v1/ew/warnings/1/publish").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void ewDisseminateDeniesFieldRole() throws Exception {
        // EW_DISSEMINATE excludes field officers — a DAS cannot fire the public/leaders SMS + stakeholder email blast.
        mvc.perform(post("/ew/disseminate").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void contentNewsDeleteDeniesFieldRole() throws Exception {
        // CONTENT_MANAGE (Super Admin/Comms/ICT) excludes field officers — a DAS cannot delete portal news.
        mvc.perform(delete("/v1/content/news/1").header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void agencyDeleteDeniesNonSysAdmin() throws Exception {
        // Deleting a partner agency tightens to SYS_ADMIN (Super Admin/ICT) — a Director cannot delete one.
        mvc.perform(delete("/v1/content/agencies/1").header("X-Local-Roles", "Director"))
                .andExpect(status().isForbidden());
    }

    @Test
    void stakeholderVerifyDeniesRegistrarOnlyRole() throws Exception {
        // Separation of duties: STAKEHOLDER_VERIFY excludes ICT Admin (who may register via STAKEHOLDER_ADMIN
        // but must not be the one who verifies the trust decision).
        mvc.perform(put("/v1/stakeholders/1/verify").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "ICT Admin"))
                .andExpect(status().isForbidden());
    }

    // ── RBAC closure — Prevention & Mitigation (the live-proven escalations) + Preparedness ──

    @Test
    void mitigationMeasureCreateDeniesPartnersWithValidBody() throws Exception {
        // The CREATE uses @Valid @RequestBody, so an EMPTY body 400s (validation) before the 403 — a re-probe
        // with an empty body misreads that as "ungated". A VALID body proves the role gate genuinely fires:
        // a Partner cannot create a mitigation measure (the assessment's reported gap, locked against regression).
        String body = "{\"projectProgrammeName\":\"x\",\"implementingEntity\":\"PMO\",\"implementingInstitution\":\"PMO\","
                + "\"hazardRiskAddressed\":\"Flood\",\"implementationPeriodStart\":\"2026-01-01\",\"implementationPeriodEnd\":\"2026-12-31\","
                + "\"projectStatus\":\"Ongoing\",\"typeOfMitigation\":\"Structural\",\"narrativeDescription\":\"x\","
                + "\"projectCoverage\":[\"Dar es Salaam\"],\"projectBeneficiaries\":\"c\",\"projectActivities\":\"a\","
                + "\"expectedOutcome\":\"o\",\"priority\":\"High\"}";
        mvc.perform(post("/v1/mitigation-measures").contentType(MediaType.APPLICATION_JSON).content(body)
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void hazardDeleteDeniesPartners() throws Exception {
        // The assessment proved a read-only/partner tier could create AND delete a hazard. MITIGATION_MANAGE
        // excludes Partners — so a Partner can no longer delete national hazard reference data.
        mvc.perform(delete("/v1/hazards/1").header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void riskAssessmentApproveDeniesMdaFocal() throws Exception {
        // The assessment proved an MDA-Focal could APPROVE a risk assessment. MITIGATION_APPROVE excludes
        // MDA Focal (author tier), enforcing maker-checker on the approval.
        mvc.perform(post("/v1/risk-assessments/1/approve").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "MDA Focal"))
                .andExpect(status().isForbidden());
    }

    @Test
    void preparednessTrainingPublishDeniesPartners() throws Exception {
        // PREPAREDNESS_MANAGE excludes external Partners — they cannot publish a national training plan.
        mvc.perform(post("/v1/training-plans/1/publish").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    // ── RBAC closure — Response module (operate vs oversight maker-checker) ──

    @Test
    void responseTaskCreateDeniesPartners() throws Exception {
        // RESPONSE_OPERATE excludes external Partners — they cannot create response tasks.
        mvc.perform(post("/v1/response/tasks").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void dispatchApprovalApproveDeniesFieldRole() throws Exception {
        // RESPONSE_OVERSIGHT excludes the field tier — a DAS cannot approve a dispatch (maker ≠ checker).
        mvc.perform(post("/v1/response/dispatch/approvals/1/approve").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void contingencyPlanApproveDeniesFieldRole() throws Exception {
        // RESPONSE_OVERSIGHT excludes the field tier — a DAS may author/submit a contingency plan but not approve it.
        mvc.perform(post("/v1/response/contingency-plans/1/approve").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void bogusJwtShapedBearerIsUnauthorized() throws Exception {
        // A JWT-SHAPED bearer (two dots) makes LocalAuthFilter yield to the resource server, which
        // rejects the bad signature.
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("Authorization", "Bearer aaa.bbb.ccc"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void nonJwtBearerFallsThroughToPersona() throws Exception {
        // LocalAuthFilter only hands a JWT-SHAPED bearer (two dots) to the JWT decoder; any other bearer
        // shape (here a single-dot token) must NOT reach the decoder — it would 401 as malformed — and
        // instead falls through to the local persona. A read endpoint gated only by isAuthenticated()
        // therefore returns 200. (This token-shape contract is verified independently of any caller.)
        mvc.perform(get("/v1/settings/users").header("Authorization", "Bearer payload.signature"))
                .andExpect(status().isOk());
    }
}
