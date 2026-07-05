# DMIS / e-MAAFA — Full-System Linkage Audit (no-sugar)
Audited 2026-07-05 on the LIVE local stack by 10 domain auditors + 6 adversarial verifications (every severity≥4 accusation re-tested by an independent agent trying to refute it — all 6 were UPHELD). Every finding carries evidence: file:line and/or a live API/SQL result. Verdicts: **WORKING** (live-verified) · **PARTIAL** (works, stated gaps) · **GAP** (designed but missing) · **FAKE** (pretends) · **DEAD** (unreachable/unused).

**Scorecard: 154 findings — FAKE 1 · DEAD 23 · GAP 21 · PARTIAL 45 · UNVERIFIED 1 · WORKING 63**

---

## User roles & registration (User Management, role enforcement, viewer roles, partner registration)

> User Management genuinely creates/edits users and assigns any of the 24 catalogued roles (writes correctly locked to Super Admin + ICT Admin, last-Super-Admin rail works, RC gets 403 on the index) — but it has NO region/district/agency/stakeholder attachment, and no endpoint anywhere in the backend sets users.region_id/district_id/stakeholder_id, so an admin cannot register a functional area officer (a UI-created RAS/DED sees zero incidents and cannot action any stage; seeded officers only work because SQL seeds set those columns). The statutory chain (Minister/President/NTC/NSC) is live-verified real, not decorative; Comms/ICT/MDA Focal each have distinct working footprints; RC is a genuine region-scoped viewer. Dist DC is NOT a viewer — it is the working DDMC entry approver and also holds incidents.publish against the codebase's own doctrine. Five V96 roles (Planning/Logistic Officers, District Commissioner) are dormant with zero users and their promised "comment" capability was deleted in V113. Partner registration works end-to-end up to verification, but approval never creates a login, and the manual link-user flow populates only one of the two stakeholder-link columns, silently bypassing the partner self-identity guards that read the other column.

### ⚫ DEAD (severity 2) — V96 roles (Regional/District Planning Officer, Regional/District Logistic Officer, District Commissioner) — dormant; their promised 'comment' capability was deleted

**Evidence:** psql model_has_roles: 0 users hold any of the five roles. They appear in NO Authz role expression and not in Authz.ALL (Authz.java:56-60). V96__workflow_roles_and_comment.sql:34-58 created incidents.comment and granted 'view + comment' to the advisory roles, but V113__remove_dead_permissions.sql:8-17 deleted incidents.comment ('has no endpoint') — so the advisory design is half-gone. Worse, if ever assigned via the UI: no area can be attached, so e.g. District Logistic Officer (warehouse_and_stock.manage, no view_national) lands in tier NONE → appendWarehouseScope→appendAreaScope→'1=0' (JurisdictionScope.java:250-256,194) → manages a warehouse list of zero rows. They ARE offered as checkboxes in the create form (part of the 24).

**Fix:** Either seed/document these as future workflow-stage placeholders and hide them from the create form, or delete them; if kept, they need the same area-attachment fix as the other area roles plus a real comment endpoint.

### 🔴 GAP (severity 4) — No product surface sets users.region_id / district_id / stakeholder_id — area officers can only be manufactured by SQL  
> **⚖ Adversarially verified — accusation UPHELD.**

**Evidence:** grep 'update public.users set' across the whole backend returns exactly 4 statements: name/email (UserManagementController.java:129), password (:153, AuthController.java:121), notify prefs+phone (NotificationController.java:100) — nothing ever writes region_id/district_id/stakeholder_id/agency_id. Consequence proven in code: JurisdictionScope.tierFor (JurisdictionScope.java:94-112) puts an area-role user with NULL area into REGION/DISTRICT tier, then appendAreaScope emits '1=0' (lines 177-194) → sees ZERO incidents; IncidentWorkflowService.assertStageAccess (lines 118-135) throws 'no area assigned' → cannot approve. Live seeded officers work only because seeds set the columns (psql: ras.mwanza region_id=56, dc@test.com district_id=101, rc.mwanza region_id=56).

**Fix:** Expose area attachment in User Management (single source: the users table already has the FK columns and indexes); until then every new DED/RAS/RC/DAS/DC account requires direct DB writes.

### 🔴 GAP (severity 3) — Dist DC holds incidents.publish → district officer can push incidents to the citizen portal, against the codebase's own doctrine; push endpoints are not area-guarded

**Evidence:** psql: incidents.publish held by Asst. Director, Comms Officer, Director, Dist DC, EOCC, ICT Admin, Secretary, Super Admin. Authz.java:174-179 documents publish as 'an EOCC coordination-centre function… never the district/regional responders'. The gates at IncidentController.java:519/568/614 (push-map/push-news/remove-news) check only hasAuthority('incidents.publish') and resolve the incident via workflow.findOr404 (IncidentWorkflowService.java:482-488) which is a bare SELECT by id with NO area predicate — so a Dist DC could publish another district's incident by id. Not live-tested (mutation); static evidence only.

**Fix:** Revoke incidents.publish from Dist DC in the matrix (V-migration) and add AreaGuard.assertOwn to the three push endpoints (matches the known scope-leak remediation backlog).

### 🔴 GAP (severity 3) — Partner approval does NOT create a login — a working partner login requires two undocumented manual admin steps

**Evidence:** PUT /v1/stakeholders/{id}/verify (StakeholderAdminController.java:127-157) only sets is_verified + sends a congratulation ('Congratulations, looking forward to your support…') — no users row, no credentials, no role assignment. To get a login the admin must separately create a user with the Partners role in User Management, then call /{id}/link-user (lines 163-184). Seeded partners prove the END state works: redcross@partner.tz login 200, open-needs feed 200, incidents 403 (Partners has only resource_allocation.request/view). But nothing in the approval flow produces that state, and the congratulation message implies more than the system did.

**Fix:** On verify (or a 'create login' action beside it), optionally mint a Partners-role user from the stakeholder's email, set BOTH link columns, and send credentials/reset link.

### 🟡 PARTIAL (severity 4) — Admin user creation + role assignment (Settings → User Management)

**Evidence:** Backend create takes ONLY name/email/password/roles: UserManagementController.java:93-113 (dmis-platform/backend/src/main/java/tz/go/pmo/dmis/settings/); frontend POST body is exactly {name,email,password,roles}: user-management.component.ts:180-182; the form has no region/district/agency picker (template lines 78-107). Role catalogue IS complete: live GET /v1/settings/users as admin returned all 24 DB roles as checkboxes (observed: 'roles offered: 24' incl. RAS/RC/DED/DAS/Dist DC/Reg DC). So an admin can create a user with ANY role but can NOT attach a region/district — the users table has region_id/district_id (psql \d users) that the screen never touches.

**Fix:** Add region/district (and agency/stakeholder) pickers to the create/edit modal, shown when an area/agency role is selected, and accept+persist them in UserManagementController.create/update.

### 🟡 PARTIAL (severity 4) — Two stakeholder-link columns, only one maintained: link-user sets stakeholders.user_id but every partner-identity guard reads users.stakeholder_id (set by seeds only)

**Evidence:** linkUser writes stakeholders.user_id only (StakeholderAdminController.java:181-182); NOTHING in the backend writes users.stakeholder_id (grep 'update public.users set' — 4 hits, none touch it). Yet JurisdictionScope.currentStakeholderId() reads users.stakeholder_id (JurisdictionScope.java:151-163) and is the basis for: (a) the bid self-identity guard — recordBid skips 'only your own organisation' when it is null (StakeholderBiddingController.java:227-230) while submitBid (POST /bids, gated only by resource_allocation.request which Partners HOLDS, line 185-193) accepts any body stakeholder_id → a UI-linked partner can file offers as ANY organisation; (b) SupportPledgeController.pledges() own-rows filter (line ~123) → a UI-linked partner sees the full staff review queue; (c) AreaGuard.assertNotStakeholder (AreaGuard.java:43) fails to recognise them as a partner. Seeded partners have BOTH columns set (psql: users 13,25-28 ↔ stakeholders 27,29-32) so the flaw is invisible in current data — it bites the first partner linked through the actual UI flow.

**Fix:** Make linkUser also set users.stakeholder_id (and clear it on unlink/relink), or refactor currentStakeholderId() to resolve via stakeholders.user_id as the single source of truth.

### 🟡 PARTIAL (severity 2) — Dist DC is NOT a viewer — it is the working DDMC entry-stage approver (design mismatch with 'DC = area viewer')

**Evidence:** IncidentWorkflowService.java:57-64: STAGE_ROLES maps 'waiting_ddmc' → Authz.DIST_DC (stage OWNER), area-checked to own district (lines 118-127). Matrix grants Dist DC incidents.approve/close/create/update/publish + tasks.manage (psql role_has_permissions). Live as dc@test.com (district 101 Dodoma Urban): sees 4 district incidents vs admin 24; POST approve on nonexistent id → 404 not 403 (the @PreAuthorize gate PASSES). The 'viewer DC' doctrine was instead implemented as a SEPARATE role 'District Commissioner' (V96__workflow_roles_and_comment.sql:29-31, 'view + comment, no approval') — which has 0 users and whose comment permission no longer exists.

**Fix:** Decide which DC role is canonical; if Dist DC is the DDMC approver by design, update the documented 'RC/DC are area viewers' doctrine; if not, move waiting_ddmc ownership and strip the write permissions.

### ✅ WORKING (severity 1) — RC (Regional Commissioner) as region-scoped viewer

**Evidence:** 31 rc.* accounts each with region_id (psql). JWT for rc.mwanza carries role [RC] + exactly 7 permissions, all *.view (command_post/early_warning/incidents/reports_and_analytics/stakeholders/tasks/warehouse_and_stock — decoded live token). Live: GET /v1/response/incidents → 1 incident (region Mwanza) vs admin's 24; POST /incidents/999999/approve → 403; GET /v1/onehealth/events → 403; GET /v1/settings/users → 403 (ModuleGuardFilter). RC appears in no Authz write expression (grep: only JurisdictionScope.REGION set, JurisdictionScope.java:36). Caveat: V96 intended RC to also 'comment' but incidents.comment was deleted as dead in V113__remove_dead_permissions.sql:5 — RC is pure view, no advisory-comment feature exists.

### ✅ WORKING (severity 1) — Statutory declaration chain roles: Minister, President, National Technical Committee, National Steering Committee

**Evidence:** Each role holds its specific permission (psql: Minister/President = disaster_declarations.declare; NTC = .review+.propose; NSC = .endorse+.propose) and DeclarationController gates each step by that permission (lines 85 propose, 113 technical-review, 123 endorse, 136 declare, 173 extend, 194 revoke). Live: minister login → GET /v1/response/declarations 200 with real gazette data (GN No. 412 of 2026), POST declare/999999 → 404 (gate passed); ntc → technical-review/999999 404 (passed) but declare/999999 403 (correctly NOT the declaring authority); president → declarations 200. One-user-per-role seeded (minister@/president@/ntc@/nsc@pmo.go.tz). Cosmetic: Authz.DECLARE_REVIEW/DECLARE_ENDORSE/DECLARE_AUTHORITY constants (Authz.java:204-215) are referenced by NO controller (grep) — dead constants superseded by the permission gates.

### ✅ WORKING (severity 1) — Comms Officer / ICT Admin / MDA Focal — real, distinct footprints (not decorative)

**Evidence:** Comms Officer: 16 perms (content_management.manage, communication_and_alerts.send, translations.manage, incidents.publish, early_warning.disseminate…); live GET /v1/content/news 200. ICT Admin: user_management.manage is held ONLY by Super Admin + ICT Admin (psql); live GET /v1/settings/users 200; appears in SYS_ADMIN/LOCATION_WRITE/CONTENT_MANAGE etc. (Authz.java:66-70,249). MDA Focal: 16 sector accounts (moa@, moh@, tma@…); live moa: GET /v1/ew/warnings 200, /v1/onehealth/events 200, /v1/reports/early-warnings 403 (lacks reports_and_analytics.view — ModuleGuardFilter.java:54), /v1/settings/users 403. Least-privilege boundaries observed working in all three.

### ✅ WORKING (severity 1) — Public partner registration → stakeholders row (pending verification) with genuine confirmation

**Evidence:** register-partner.component.ts:153-161 POSTs to /v1/portal/register-stakeholder; PortalPublicService.registerStakeholder (PortalPublicService.java:478-519) validates TZ phone/email, inserts stakeholders(is_active=true, is_verified=false) and sends real M-Gov SMS + SMTP best-effort (gateways known-real per prior verification). DB shows the pipeline in use: 27 stakeholders, 19 verified. Not re-POSTed live (record-creating); code path + existing rows are the evidence.

### ✅ WORKING (severity 1) — User Management endpoint hardening (write gate, module guard, lockout rail, duplicates, password policy)

**Evidence:** Writes gated hasAuthority('user_management.manage') (UserManagementController.java:43,92,118,137,148,167), held only by Super Admin + ICT Admin (psql); live: RC and MDA Focal GET /v1/settings/users → 403 (module guard blocks even the isAuthenticated() index), ICT Admin → 200. Last-Super-Admin rail (guardLastSuperAdmin, lines 189-203) blocks stripping/deleting the final Super Admin; duplicate email → 409 (lines 98-101); admin-set passwords run the shared PasswordPolicy (line 159-161); id-sequence self-heal prevents seeder pkey collisions (lines 102-106).

## Incident lifecycle depth (rollback/resubmit, close-as-rumour, officer queues, operational-vs-workflow axes, update feed/sitreps)

> The rollback machinery, close-as-rumour with DED+DAS notify, stage notifications, and the update/sitrep feeds are genuinely WORKING and live-verified (role AND area halves of the stage gate both proven by 422 probes; historical DB rows prove close-rumour and resolve notifications actually landed). The real defects are at the edges: the Resubmit button and /resubmit + /forward endpoints are DEAD legacy code (the current rollback lands on waiting_* stages, never the rolled_back_to_* statuses they require); rolling back into an unstaffed auto-skip tier strands the incident in Super-Admin-only limbo (precondition live-confirmed in Tanga where DED/RDMC tiers auto-skipped); there is NO officer pending-queue surface (bell notification + manual workflow filter are the only ways a RAS finds #91); dashboard stat cards are national while the feeds beside them are area-scoped; and citizen-report-converted incidents carry NULL region/district names, producing blank area columns and "(null)" in the very notifications that summon officers.

### ⚫ DEAD (severity 2) — Resubmit endpoint + UI button (rolled_back_to_* statuses)

**Evidence:** workflow.resubmit() only fires from rolled_back_to_district/regional/das/national (IncidentWorkflowService.java:325-331) but rollback() writes only waiting_* values (PREV_STAGE 90-96) — nothing can produce those statuses anymore; psql: 0 incidents in any rolled_back_to_* or legacy waiting_*_approval status; last real use was the pre-rework model (incident 3, 2026-06-12). Live probe on #91: 422 'This incident has not been rolled back, nothing to resubmit'. UI: canResubmit() only for 'rolled_back_to_das' (incident-show.component.ts:323-325) — button can never render; canSubmit()'s rolled_back_to_district/regional branches (319-321) equally dead.

**Fix:** Delete the legacy status space (resubmit endpoint, canResubmit, WORKFLOW_STATUSES legacy entries) or re-point resubmit at the real rollback semantics.

### ⚫ DEAD (severity 2) — Forward-to-Assistant-Director endpoint POST /{id}/forward

**Evidence:** forward() whitelists only legacy stages waiting_national_approval/waiting_assistant_director_approval/waiting_director_approval/rolled_back_to_national (IncidentWorkflowService.java:302-303) — unreachable in the DDMC→PS ladder; psql: 0 incidents at those stages; live probe at waiting_ras → 422 'not at a stage that can be forwarded'; no frontend caller (no 'forward' action in incident-show.component.ts). Latent hazard if ever revived: legacy stages have no STAGE_ROLES entry so assertStageAccess() returns without ANY role/area check (104-107), leaving only @PreAuthorize PERM_INCIDENT_APPROVE (IncidentController.java:459-463).

### ⚫ DEAD (severity 1) — Legacy workflow statuses shipped as live filter options; unused transition() helper

**Evidence:** form-data workflow_statuses returns all 22 entries including 10 unreachable legacy ones (live: rolled_back_to_district/das/regional/national, waiting_*_approval...) which the registry renders as filter options (incidents.component.ts:63-65, IncidentController.java:191, IncidentOptions.java:90-101); psql: 0 incidents in any of them. IncidentWorkflowService.transition() (462-466) has no callers (grep across response/: only the definition). resolveStageRecipients 'rolled_back_to_district' case (570) equally unreachable.

### 🔴 GAP (severity 3) — Officer pending queue on DED/RAS landing (what is reported to them / what they reported)

**Evidence:** No queue surface exists: post-login landing is the module hub (app.routes.ts:33) with zero incident content (grep pending|incident in module-hub.component.ts → empty); response dashboard payload has no stage-queue field (live keys: statistics/critical_alerts/recent_incidents/incidents_by_type/regional_data/new_incidents/my_area); incidents registry has no default workflow filter and no 'reported by me' view (no submitted_by anywhere in incidents.component.ts/dashboards.component.ts). What DOES work: the topbar bell (topbar.component.ts:24-44) — live as ras.tanga: notification 'Incident needs your action: Waiting for RAS' linking /m/response/incidents/91, unread=17 — and manually selecting the workflow filter (live: ?workflow_filter=waiting_ras → exactly #91).

**Fix:** Add a 'Needs your action' card on the response dashboard: incidents where workflow_status = the caller's stage in their area, plus a 'submitted by me' tab.

### 🔴 GAP (severity 3) — Citizen-report-converted incidents have NULL region_name/district_name — blank area columns, '(null)' in officer notifications, broken centroid fallback

**Evidence:** PublicReportsController.java:155-158 inserts district_id/region_id but omits the *_name columns the rest of the system reads; officer-created incidents resolve names (IncidentController.java:221 comment, update path coalesceName 315-316). Live: incidents 91 and 88 have region_id set but region_name/district_name NULL (psql); RAS Tanga's own queue lists #91 with blank area; resource_notifications 4771 and 446 read "Incident '...' (null) has reached..." — the message summoning the officer names no place; pushMap's no-coordinates fallback reads region_name (IncidentController.java:549-551) so a coordinate-less converted incident cannot fall back to its region centroid.

**Fix:** In the conversion INSERT, also select the names from regions/districts by the ids already in hand.

### 🟡 PARTIAL (severity 4) — Rollback into an unstaffed auto-skipped tier strands the incident (no settle, no resubmit path)

**Evidence:** settleStage javadoc: 'Backward transitions (rollback) deliberately do NOT call this' (IncidentWorkflowService.java:363-364); rollback lands on PREV_STAGE unconditionally (225-235). Live precondition on the test incident itself: #91 (Tanga) history shows auto_advanced past waiting_ded AND waiting_rdmc because 'no officer staffs this tier'; psql: region 52 staffing = RAS 1, RC 1 only; portal_settings incident_approval waiting_rdmc=skip_if_unstaffed. So one RAS rollback of #91 → waiting_rdmc, where assertStageAccess requires a Tanga 'Reg DC' that does not exist; submit() only accepts draft/rolled_back_* (173) and resubmit() rejects waiting_* — Super-Admin-only limbo. Most regions are staffed like Tanga (seed = 5 full-officer regions of 31).

**Fix:** On rollback, either re-run a reverse settle (skip unstaffed tiers downward) or block rollback into a tier that stageStaffed()=false with a clear message.

### 🟡 PARTIAL (severity 3) — Response dashboard stat cards are national while the feeds beside them are area-scoped

**Evidence:** DashboardController.java:78-96 — the six statistics subqueries filter only is_simulation, no jurisdiction predicate, while critical_alerts/recent_incidents/incidents_by_type/regional_data on the same page all go through incidentScope() → appendAreaScopeSharedOrOwn (58-64, 97-119). Live as ras.tanga: statistics.active_incidents=3, pending_tasks=200; psql: national active=3, Tanga-only active=0. A RAS reads national KPIs as if they were their region's.

**Fix:** Apply incidentScope() to the statistics block (or label the cards 'National').

### 🟡 PARTIAL (severity 3) — Operational status track vs workflow status — dual axes visible but unreconciled

**Evidence:** Both axes stored and displayed side-by-side (show page badges incident-show.component.ts:53-57; registry both badges incidents.component.ts:106; separate action groups 199-210). Coupling is one-way only: resolve()→status Resolved, closeAsRumor()→status Closed (IncidentWorkflowService.java:254,279), but verify/escalate/close and the edit form's free status field (IncidentController.java:302,319) never touch the ladder, and approve() ignores op status. Live contradiction: incident 2 = status 'Resolved' while workflow_status 'waiting_eocc' (psql) — it sits in EOCC's approval queue while operationally resolved. Op buttons are gated only by current op status, not stage or role, in the UI (canVerify/canEscalate/canClose 354-364); backend gates are PERM + areaGuard only (IncidentController.java:475-497).

**Fix:** Define reconciliation rules (e.g. op-Close freezes the ladder; approval of a Resolved incident warns) and reflect the caller's permissions in the op buttons.

### 🟡 PARTIAL (severity 2) — Workflow action buttons are stage-gated but not role-gated in the UI

**Evidence:** canApprove/canRollback/canResolve are purely workflow_status-based (incident-show.component.ts:327-347; the comment admits 'The backend still gates WHO may act'); only the Edit link checks a permission (line 274 canEdit). Any officer who can open the incident (e.g. the district DED while it waits at RAS) sees Approve/Roll Back/Resolve and gets a 422 on click — proven live (ras.dar on #2 → 'This stage is owned by EOCC'). Backend enforcement is solid; the UI over-offers.

**Fix:** Gate buttons on the caller's role matching STAGE_ROLES for the current stage (roles are in the JWT).

### ✅ WORKING (severity 2) — Situation update feed + situation reports (history reports) per incident

**Evidence:** Real inserts with validation + area guard: POST /{id}/updates (IncidentController.java:405-431, 5000-char cap, 9 typed categories) and POST /{id}/history-reports (644-667, full demographic split + services JSON); show() returns updates/workflow_histories/history_reports (379-397); UI renders feed + sitrep dialog (incident-show.component.ts:140-149, 252-263, 431-466). Adoption is thin (psql: 1 update, 1 sitrep total) and the sitrep modal captures only 4 of ~18 schema fields (deaths/injured/displaced/remarks — no gender split, missing counts, property-loss flags reachable from the UI), and sitrep figures never roll up into the incident's headline casualty totals.

**Fix:** Expand the sitrep dialog to the full column set or drop the unused columns; consider surfacing latest-sitrep vs headline figures.

### ✅ WORKING (severity 1) — Rollback at every stage (PREV_STAGE ladder) with role+area gating and mandatory comments

**Evidence:** IncidentWorkflowService.java:90-96 (PREV_STAGE covers all 6 post-entry stages; DDMC entry excluded by design, 216-238 comments mandatory + assertStageAccess before any write). Live: POST /v1/response/incidents/91/rollback as ras.tanga with empty comments → 422 'The comments field is required'; as ras.mwanza (wrong region) → 422 'incident is in another region'; as ras.dar on #2 at waiting_eocc (right area, wrong role) → 422 'This stage is owned by EOCC'. Historical proof it executes: incident_workflow_histories row incident 2 'rolled_back waiting_ded→waiting_ddmc' 2026-06-20; rollback_count/last_rollback_by_role stamped and rendered (incident-show.component.ts:56-57, incidents.component.ts:106 '↩ Returned' badge). Round-trip = previous approver re-approves via approve(); UI shows Approve at every waiting_* stage (incident-show.component.ts:328-331).

### ✅ WORKING (severity 1) — Close-as-rumour at DDMC entry with DED+DAS notification

**Evidence:** IncidentWorkflowService.java:247-261 (waiting_ddmc-only, sets closed_rumor + status Closed, logs 'rejected', notifies DED+DAS via resolveStageRecipients 557-561). Live stage-gate probe: POST /91/close-rumor at waiting_ras → 422 'Only an incident at the DDMC entry stage...'. Historical E2E proof: incident 2 history 'rejected waiting_ddmc→closed_rumor' 2026-06-20 AND resource_notifications rows 444/445 to das@pmo.go.tz + ded.dodoma@example.dev titled 'Closed — Rumour / Normal Case'; UI button stage-gated to waiting_ddmc (incident-show.component.ts:340-342). Copy quirk only: informational notices reuse the 'Incident needs your action:' title for closed_rumor/resolved (notifyStage 524-525).

### ✅ WORKING (severity 1) — Stage/close/resolve notifications to the officers who now own the incident

**Evidence:** notifyStage → resolveStageRecipients maps every resting stage to area-matched roles, resolved→RAS+RC+EOCC, approved→reporter (IncidentWorkflowService.java:511-576); never fails the transaction (537-540). Live: ras.tanga bell shows row 4771 for #91 with deep link /m/response/incidents/91; historical: rows 447-452 ('Resolved (handled locally)' to eocc/ras/rc.dodoma), 442 ('Incident approved' to the reporter), full per-stage trail on 2026-06-22 (rows 562-568 regdc→ras→eocc→director→secretary→reporter→ddmc). Minor: audit comment hardcodes 'converted by DDMC — presence approved' even when a RAS performs the triage conversion (PublicReportsController.java:166-167; live: #91 created row performed_by_role=RAS with that comment).

## Warehouse management (stock ops, dispatch round-trip, donations, procurement, temp warehouses, ledger integrity)

> Warehouse management is substantially REAL and live-verified: one ledger (inventory_items) + one journal (stock_movements) back intake/removal/transfer/borrow-loan/stock-taking, the dispatch manager-gate deducts FIFO under row locks with 1:1 approval-to-movement journalling, donations and procurement deliveries genuinely intake stock, everything works peacetime (all 38 live movements have incident_id NULL), and jurisdiction scoping was proven live (RAS Mwanza sees only Ilemela; cross-area read AND intake both 404). No negative stock anywhere. The real defects: (1) allocation status 'Returned' silently discards already-deducted stock — never re-intaken, no movement row; (2) the preparedness Emergency Supplies screen edits ledger quantities with zero journal entry — an unaudited side-door that already produced measurable ledger-vs-journal drift; (3) the Preparedness Warehouses registry displays a hardcoded "Stocks: 0" for every warehouse (actual: 6315 units in PMO Central); (4) donation receive rolls allocations up on quantity OFFERED, not quantity actually received; plus smaller integer-vs-decimal rounding and orphaned-row artifacts.

### 🚨 FAKE (severity 3) — Preparedness Warehouses registry 'Stocks' column always 0

**Evidence:** WarehouseService.java:20-21 comment: '(Stock counts join warehouse_stocks later; reported as 0 until then.)' and toRow() hardcodes `0` into WarehouseRow.stocks (WarehouseResponse.java:12); the warehouse_stocks table does not even exist (psql: relation "public.warehouse_stocks" does not exist). UI displays it as a badge (warehouses.component.ts:75,88 'Stocks' column). Live: GET /v1/warehouses shows stocks=0 for PMO Central/Coastal/Eastern while the ledger holds 6315/110/32 units.

**Fix:** Join inventory_items (sum(quantity) where warehouse_id=w.id and temporary_warehouse_id is null) — the number already exists in warehouse-ops index.

### 🔴 GAP (severity 3) — Allocation 'Returned' discards deducted stock — no re-intake, no movement

**Evidence:** ResourceAllocationController.java:43-45 allows In Transit→Returned and Deployed→Returned; updateStatus (325-347) handles Returned via `default -> { }` — only the status string changes. Stock was already FIFO-deducted at dispatch approval (DispatchController.java:316) but is never added back to any store and no stock_movements row is written (grep 'Returned' across response/*: only warehouse_loans have a real Return flow). Goods physically returned to a warehouse vanish from the ledger permanently.

**Fix:** On Returned, re-intake to the originating store (dispatch_approvals.source_id / journal source_id) via DispatchSupportService.addStock + a 'Return' stock_movements row, or force the operator to pick a receiving store.

### 🟡 PARTIAL (severity 3) — Emergency Supplies (preparedness) edits ledger with no journal — unaudited drift side-door

**Evidence:** InventoryService.java:114-124 (create) and 156-167 (update) INSERT/UPDATE public.inventory_items — including arbitrary quantity rewrites and moving an item to another warehouse — with zero stock_movements row, bypassing the 'single journal' invariant WarehouseOpsController's header (lines 23-34) claims. Live reconciliation SELECT (ledger vs journal net per warehouse+resource) shows drift on 9 pairs, e.g. wh1/res3 ledger 4925 vs journal −75, wh4/res2 599 vs 6. Same ledger, so stock totals stay consistent — but the audit trail cannot explain these quantities and any 'warehouse_and_stock.manage' holder can silently alter stock.

**Fix:** Route Emergency Supplies quantity changes through an Adjustment movement (like stock-taking does), or make quantity read-only there and point users at warehouse-ops intake/remove.

### 🟡 PARTIAL (severity 2) — Stakeholder donations intake (bid receive → warehouse stock)

**Evidence:** WORKS: StakeholderBiddingController.java:317-388 — receive() writes a donor-traceable inventory_items batch (DON-<bid>-<date>, supplier_donor) + an 'Intake' movement to the chosen, area-guarded store; live bids 1/4/5/6 are 'Received' with matching Intake movements. TWO defects: (a) roll-up at lines 376-385 sums quantity_offered of Received bids, not the actual received_quantity intaken at line 337 — a partial delivery (receive 10 of 25 offered) still counts 25 toward 'Delivered'; (b) live bids 8/11/12 have NULL allocated_resource_id (bid 12 is 'Accepted') — bidAllocationId (lines 881-887) hard-rejects them ('cannot be processed'), so that accepted donation can never become stock.

**Fix:** (a) persist received_quantity per bid and sum that; (b) allow receive() for unlinked bids into a store without allocation roll-up, or repair/withdraw the 3 orphan rows.

### 🟡 PARTIAL (severity 2) — Fractional quantities vs integer ledger (rounding drift)

**Evidence:** allocated_resources/dispatch_approvals quantities are numeric(_,2) (live information_schema: 2.50 exists in dispatch_approvals id 8) but inventory_items.quantity and stock_movements.quantity are integer. DispatchSupportService.deductStock line 187 rounds the remainder (`Math.round(available - deduct)`) — approving a 2.5-unit dispatch against a 10-unit batch leaves 8, deducting only 2 while the allocation journal records 2.5 and the movement logs (int)2. Under-deducts/creeps whenever fractional quantities are entered (API accepts doubles).

**Fix:** Reject non-integer quantities at dispatch/approval boundary, or make the ledger numeric.

### 🟡 PARTIAL (severity 2) — Orphaned rows: stock in no store + journal rows with no endpoints

**Evidence:** Live SELECTs: inventory_items id 18 (25 × Rescue Rope, warehouse_type='temporary') has BOTH warehouse_id and temporary_warehouse_id NULL — from a pre-fix donation receive (matching movement 12, also end-less, 2026-06-13; the class doc at StakeholderBiddingController.java:45-47 admits the old bug). This stock is counted in global KPIs (DashboardController.java:166 sums all inventory_items) but appears in no store sheet and can never be dispatched (availableQuantity requires temporary_warehouse_id). Also movement 9 ('Deduction' from agency) is permanently unattributable — stock_movements has no agency column, so all agency-sourced dispatches journal with no source. 3 end-less movements total; current code paths all write endpoints correctly.

**Fix:** One-time data repair pointing item 18/movement 12 at the actual receiving store; consider a source_agency_id column on stock_movements.

### 🟡 PARTIAL (severity 2) — Temporary warehouses (CRUD + ledger integration)

**Evidence:** CRUD real and guarded (TemporaryWarehouseController @PreAuthorize('warehouse_and_stock.manage') on POST/PUT, lines 41-66); temp stores participate fully in intake/transfer/dispatch/borrow via temporary_warehouse_id, live GET /v1/temporary-warehouses → 7 rows, Ilala store holds 325 units. GAP: update() can set is_active=false with residual stock and no check (TemporaryWarehouseService.java:119) — warehouse-ops index and dispatch sources filter is_active=true, so that stock disappears from operational view while DashboardController KPIs still count it; no decommission/transfer-out flow.

**Fix:** Block deactivation while Σ(inventory_items.quantity)>0, or prompt a transfer-out.

### 🟡 PARTIAL (severity 1) — Dispatch receive-side: no destination-stock update for incident deliveries

**Evidence:** Direct answer to the round-trip question: allocations dispatched to an INCIDENT are consumption — In Transit→Deployed→Delivered (ResourceAllocationController.java:336-346) only stamps timestamps/received_by; no destination store exists and no stock is created anywhere, which is defensible relief-distribution semantics. Destination stock IS updated in the flows that have a destination store: transfers, borrows/returns, procurement deliveries, donation receipts (all verified above). The one hole in the loop is the 'Returned' case reported separately. deployed_from_warehouse is informational only (set at approve, line 290; never deducts).

### ✅ WORKING (severity 1) — Stock intake / removal / transfer (warehouse-ops)

**Evidence:** WarehouseOpsController.java:158-269 — intake opens per-batch ledger row + 'Intake' movement; remove enforces verbatim reason list + FIFO deduct + 'Removal' movement; transfer = deduct origin + addStock dest + one 'Transfer' row, all @PreAuthorize('warehouse_and_stock.manage') and requireStore() area-guarded. Live: GET /v1/response/warehouse-ops returns 14 warehouses/6 temp with real totals; stock_movements holds 13 Intake, 4 Removal, 5 Transfer rows all 'Completed'; SELECTs found 0 negative quantities in inventory_items and agency_resources. Cross-area write proven blocked: RAS Mwanza POST intake into Dar's warehouse 2 → HTTP 404 before any insert.

### ✅ WORKING (severity 1) — Stock-taking with automatic adjustments

**Evidence:** WarehouseOpsController.java:314-397 — count sheet + per-line stock_taking_records, difference posts Adjustment_Increase/Decrease movement AND corrects the ledger row under 'for update' lock; expired/damaged conditions update item status. Live: GET stock-taking?warehouse_id=1 → 6 items + 2 history rows; DB has 4 stock_taking_records and 2+2 adjustment movements. Limitation (by design, mirrors source): zonal warehouses only — temporary stores cannot be counted (line 316 requireStore("zonal")).

### ✅ WORKING (severity 1) — Dispatch request→manager approve→FIFO deduct→journal

**Evidence:** DispatchController.java:195-260 (remaining-need guard subtracts already-dispatched + pending approvals), 299-339 (approve: row-locked lockApproval, deductStock FIFO with 'for update' batches in DispatchSupportService.java:160-194, 'Dispatch' movement, status 'Dispatch Approved'); reject returns allocation to 'Approved' with nothing moved. Live DB: dispatch_approvals 1 & 7 'Approved' each have exactly 1 journalled Dispatch movement (notes LIKE 'Dispatch approval ID: %'); the 2 'Rejected' rows have 0. Dashboard GET /v1/response/dispatch → grouped board, stats {in_transit:2, delivered:2}.

### ✅ WORKING (severity 1) — Procurement chain (submit→approve→deliver→intake, NDMF procurement)

**Evidence:** DispatchController.java:369-546 — journal-tracked procurement with partial deliveries; deliverProcurement (442-507) intakes each delivery via sources.addStock + an 'Intake' movement with to_warehouse_id set. NDMF cash→stock: StakeholderBiddingController.java:703-778 disburseProcurement checks fund balance, intakes with journal, rolls allocation up from actual Intake movements (766-768, deliberately not bids). Void (780-799) credits cash back and honestly documents 'procured stock is NOT auto-reversed'. Live: GET procurement-requests → 3 requests; 2 ndmf_disbursements exist; movement id 4 is a delivered consignment.

### ✅ WORKING (severity 1) — Peacetime operation (no active incident required)

**Evidence:** incident_id is optional on every warehouse op (WarehouseOpsController.incidentId() 759-766 returns null quietly; intake/remove/transfer/borrow all accept null; EOCC notification only fires when linked, line 198-202). Live proof: all 38 stock_movements rows have incident_id IS NULL (SELECT grouped) — the entire June ops history ran without incidents. SimulationGuard only blocks table-top drill incident ids, never plain-null peacetime ops.

### ✅ WORKING (severity 1) — Borrowing / loans between stores

**Evidence:** WarehouseOpsController.java:507-637 — borrow moves stock + warehouse_loans 'Outstanding' + 'Borrow' movement + EOCC notify; return is row-locked, partial-return aware, moves stock back and writes a 'Return' movement. Live: 3 loans (2 fully Returned with returned_quantity=quantity, 1 Outstanding due 2026-07-15), 3 Borrow + 3 Return movements; GET /loans returns derived overdue flag and outstanding_quantity.

### ✅ WORKING (severity 1) — Capacity utilisation + stockout forecast

**Evidence:** WarehouseOpsController.java:407-491 — used_sqm = Σ(qty × resource footprint), space-pressure flags, 30-day out-velocity forecast. Live: GET /capacity → 20 stores, network {total_capacity_sqm:26234, utilisation_pct:11.2, warehouses_under_pressure:0}, stockout_forecast list[4]. Data-driven, not canned.

### ✅ WORKING (severity 1) — Jurisdiction scoping of warehouse data (read AND write)

**Evidence:** requireStore→AreaGuard.assertWarehouseVisible on every mutation (WarehouseOpsController.java:679-682); appendStoreVisibility filters movements/loans/alerts. Live: RAS Mwanza index shows exactly [(15,'Ilemela Relief Depot')], zero foreign movements; GET stock for warehouse 2 → 404; POST intake into warehouse 2 → 404 with nothing written. Nit: index() comment (98-99) claims unassigned national-pool items stay visible in alert strips for area officers, but appendStoreVisibility is called with keepUnassigned=false (102-103), so they are hidden — comment/code mismatch, cosmetic.

### ✅ WORKING (severity 1) — Open-needs pledges + support pledges (partner funding side)

**Evidence:** StakeholderBiddingController.java:506-572 open-needs feed (still_needed = allocated − Accepted/Received commitments) + /pledge self-service (201-216, donor resolved server-side from linked stakeholder) → Pending bid → accept → receive→stock (the chain above). Live: bid 19 (2026-06-28) is a partner pledge in 'Accepted'. SupportPledgeController (measures/trainings) is deliberately cash/funding only — accept marks the item funded (154-160) and never creates stock, which is correct for its scope (in-kind pledges record text only).

### ✅ WORKING (severity 1) — Frontend warehouse/dispatch/donations screens wired to real endpoints

**Evidence:** warehouse-ops.component.ts:316-567 calls the real /v1/response/warehouse-ops endpoints (index/stock/movements/capacity/loans/borrow/return/intake/remove/transfer/stock-taking); dispatch-console.component.ts:362-531 covers board/sources/dispatch/approve/reject/procurement/bidding pool/receive; stakeholder-donations.component.ts and open-needs.component.ts likewise. All routed in app.routes.ts:51-56,83,129-134. No fake success handlers found — every button posts and refreshes from the server.

## EW ↔ incident linkage (forecast-vs-occurrence correlation)

> The "Warning ⇄ incident ⇄ preparedness linkage" report is REAL DB correlation, not cosmetic: EwManagementController (/v1/reports/early-warnings) joins warning_hazards×warnings to incidents by warned area + validity window, computes warned→incident / warning→no-incident / unwarned-incident / preparedness-in-window + lead time, and is live-verified (admin sees 53 warnings, 9 hits, 17 unwarned; RAS Mwanza correctly scoped to Mwanza-only; date filter works; Dar flood anticipatory plan correctly matched to the Dar flood warning). BUT match quality undercuts the user's question: each warning is counted once per district row (53 "warnings" are really 8 distinct codes; one warning counted 7×), hazard type is NOT used in matching despite the Javadoc claiming it is (a Heavy-rainfall warning "predicted" a Fire incident; a Drought warning "predicted" Cholera), and matching is region-granularity only (wh.district_id fetched but never compared to incident.district_id). Beyond this one report there is NO persisted incident↔warning link anywhere (no FK columns either direction), the public portal map co-plots warnings/incidents/bulletins with zero linkage indicator, the incident detail screen never says "this incident was/wasn't forecast", and the Command Post anticipatory (forecast) activation is free-text — not wired to any issued warning record (all 3 existing forecast activations are the demo-cyclone prefill). V129's FKs (assessments/alerts→incidents) are live and genuinely used, but they link communications/assessments to incidents, not warnings. The DRR "% of disasters preceded by a warning" metric is mechanically real but starved: links are manual and only 1 of 72 events is EW-linked.

### 🔴 GAP (severity 4) — Per-incident 'was this forecast?' answer — the user's core ask — has no surface on the incident record  
> **⚖ Adversarially verified — accusation UPHELD.**

**Evidence:** No FK columns exist in either direction: psql information_schema shows incidents has no warning/forecast column and early_warnings has no incident column. incident-show.component.ts contains no warning linkage UI (only Bootstrap 'btn-outline-warning'/Swal icons match a grep for 'warning'). The forecast/occurrence classification lives ONLY in the aggregate report; an officer opening incident #82 cannot see it fell inside warned district Bahi during EW-2026-00050's window.

**Fix:** Add a computed block to IncidentController.show (same EXISTS: warning_hazards row where area matches and reported_at within validity+tail) returning {covered:boolean, warning_code, warning_level, lead_hours}; render a 'Forecast: WARNED (EW-2026-00050, 33h lead) / UNWARNED' badge in incident-show and the triage queue. Optionally persist incidents.warning_id (nullable FK) set at triage time for auditability.

### 🔴 GAP (severity 3) — Public portal map: warnings + incidents + bulletins co-plotted but NO linkage indicator

**Evidence:** Backend PortalPublicService.java:47-113 serves warnings, incidents, bulletins as three independent lists (no warned/covered flag on incidents). Frontend public-portal.component.ts:394-435 draws warning pulse markers and incident purple rings separately; the incident popup (lines 426-433) shows title/severity/status/region and a live-status link — nothing says 'inside a warned district' or 'was forecast by warning X'. The choropleth (buildAlertFills, lines 322-353) colours warned districts but incidents are never tested against those same keys.

**Fix:** Cheapest: in initMap(), reuse buildAlertFills()'s bestRegion/bestDistrict maps — key each incident by norm(region)+'|'+normDist(district) and add an 'Inside warned area (severity)' row to the popup; proper: backend adds a warned:boolean via the same warning_hazards area+time EXISTS used in EwManagementController.

### 🟡 PARTIAL (severity 4) — EW report counts one warning once PER DISTRICT ROW — headline stats inflated ~6x

**Evidence:** EwManagementController.java:68-79 iterates raw warning_hazards rows (one per warning×hazard×district). DB: 53 rows but only 8 distinct warning_codes (psql: select count(distinct w.warning_code)... = 8). Live output shows EW-2026-00050 'Heavy rainfall / Dodoma' listed 7 times (district rows 1964,1965,1966,101,1968,1969,1970 share region_id=1), each matching the same incident 82 → warned_incident=9 is really 3 distinct warning-region hits. warnings_issued=53 vs 8 real warnings.

**Fix:** Aggregate to one row per (warning_id, region_id) — or per warning_code — before classification: group by w.id, wh.region_id with min(validity_start)/max(validity_end), and count distinct warnings in the summary.

### 🟡 PARTIAL (severity 4) — Hazard type NOT used in warned→incident matching (Javadoc claims it is) — cross-hazard false positives

**Evidence:** EwManagementController.java:27-28 claims hazard is 'used to refine when both sides carry hazard_id', but the incident query (lines 85-96) filters only time+region — no hazard predicate exists. Live proof: 'Heavy rainfall' warning EW-2026-00050 matched incident 82 'Fire' (hazard_id=4, both sides carry hazard ids) → counted as warned→incident true positive with 33h lead; 'Drought' warning EW-2026-00038 matched 'Windstorm roof damage' + 'Cholera outbreak'. 15 of 22 non-simulation incidents carry hazard_id, so refinement is feasible.

**Fix:** Add a hazard-compatibility predicate (wh.hazard_id = i.hazard_id, or a keyword-family map like AnticipatoryPlanController.matchingPlans' cyclone→floods logic at AnticipatoryPlanController.java:253-273) with a 'related-hazard' fallback bucket so rainfall→flood still counts.

### 🟡 PARTIAL (severity 3) — Warned-area match is region-granularity only — wh.district_id fetched but never used

**Evidence:** EwManagementController.java:70 selects wh.district_id, but the incident match (lines 92-93) compares only i.region_id / region_name. Incident 82 is in Bahi (district 1964, which WAS a warned district) but the code would equally match an incident in any unwarned Dodoma district. incidents carry district_id/district_name (psql: incident 82 → district_id 1964 'Bahi'), so district-precise 'inside the issued warning area' is answerable today and isn't.

**Fix:** When wh.district_id is not null, require i.district_id = wh.district_id (fall back to region match when the warning is region-wide); expose an 'in_warned_district' boolean per matched incident.

### 🟡 PARTIAL (severity 3) — Anticipatory (forecast) activation lifecycle — real, but NOT wired to issued warnings

**Evidence:** Real: CommandCenterController.java:142-177 POST /v1/response/coordination/forecast creates a monitoring-posture activation; readiness (lines 266-324) matches active anticipatory plans by hazard keyword + area via AnticipatoryPlanController.matchingPlans (real SQL, lines 253-310); impact-confirm creates+links an incident (response_activations.incident_id, lines ~250-263). Not wired: response_activations has NO warning column (psql column list: trigger_type/hazard_description/affected_areas/forecast_track only); the UI form is free-text + hand-drawn track (command-center.component.ts:818-848) with a loadCycloneDemo() prefill (lines 807-816); ALL 3 forecast activations in the DB (ids 24,37,38) are exactly that demo text ('Tropical Cyclone — heavy rain + destructive winds', Mtwara/Lindi/Pwani) — no real warning has ever driven one. No 'Activate command post' button exists on any EW/bulletin screen.

**Fix:** Add a warning picker to the forecast form (prefill hazard_description/affected_areas/expected_impact from the selected warnings/early_warnings row) and persist response_activations.warning_id; add an 'Open anticipatory post' action on the EOCC Bulletin / warning detail.

### 🟡 PARTIAL (severity 2) — "Preparedness during warning": trainings matched by DATE ONLY, no area filter

**Evidence:** EwManagementController.java:120-125 — the training_plans leg of the prep UNION filters only training_start_date/end_date overlap; any training anywhere in the country during the window counts as preparedness for that warned area. The anticipatory_action_plans leg (lines 115-119) does area-LIKE on district_council/coverage_location, so the asymmetry is a code gap, not a design choice.

**Fix:** Add 'and (t.venue ilike %area% or t.region ilike %area%)' mirroring the plan leg, or label the chip 'national training' when unscoped.

### 🟡 PARTIAL (severity 2) — Command Post readiness 'early_warnings' panel ignores the activation's areas

**Evidence:** CommandCenterController.java:311-315 — the readiness endpoint (Javadoc: 'Readiness picture for the affected areas') selects the last 10 early_warnings 'where status not in (expired,cancelled)' with NO area predicate, while evacuation_centers and warehouses in the same method ARE area-filtered (ilike any). A Mtwara cyclone post shows Dodoma flood warnings.

**Fix:** Add 'and affected_regions ilike any (?)' with the same like[] array used for evac centres.

### 🟡 PARTIAL (severity 2) — DRR 'disasters preceded by a warning' coverage metric — real query, starved data (1.4%)

**Evidence:** EwManagementController.java:157-172 counts disaster_event_links entity_type='early_warning' over validated/archived disaster_events — live: {disasters_total:72, disasters_ew_linked:1, ew_coverage_pct:1.4}. Links are purely manual (DisasterEventService.java:375 insert) and the suggestion helper (linkSuggestions, lines 392-412) offers early_warnings by DATE WINDOW only (±30/14 days) with no area/hazard narrowing — so curating 72 events is noisy manual work and nobody has done it (psql: disaster_event_links has exactly 1 early_warning row).

**Fix:** Rank linkSuggestions by area+hazard overlap (reuse the report's match SQL) and add a one-click 'auto-link matched warnings' on the event card; until curated, footnote the 1.4% figure as 'links pending' rather than presenting it as EW failure.

### ✅ WORKING (severity 2) — EW Management report — real warning⇄incident⇄preparedness correlation engine

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/reports/EwManagementController.java:68-155 does live SQL: warnings from warning_hazards×warnings (approved/published), incidents matched by region+validity window (+1d tail), unwarned via NOT EXISTS, lead-time computed, anticipatory plans matched by area LIKE + date overlap. Live: GET /api/v1/reports/early-warnings as admin → summary {warnings_issued:53, warned_incident:9, warning_no_incident:44, unwarned_incident:17, preparedness_during_warning:1, avg_lead_time_hours:35}; EW-2026-00042 Floods/Dar correctly matched incident 33 'Urban flooding — Ilala' AND the Dar es Salaam flood anticipatory plan. Area scoping proven: RAS Mwanza sees 0 warnings + 1 Mwanza unwarned incident only. Date filter proven (unwarned 17→11 for June). Routed+navigable: frontend app.routes.ts:94 → pages/reports/ew-management.component.ts, nav entry core/modules.ts:112. Donor/stakeholder accounts blocked (EwManagementController.java:56-58).

**Fix:** Genuine and consumed — keep; fix the three match-quality defects below before leadership trusts the headline numbers.

### ✅ WORKING (severity 1) — V129 assessment/alert→incident FKs — live and genuinely consumed

**Evidence:** Migration V129__assessment_alert_incident_fk.sql:16-22 adds both FKs; live: pg_constraint shows fk_damage_assessments_incident and fk_alerts_incident present. Columns are used, not decorative: AssessmentController.java:176 requires incident_id on create, inserts at 192, joins/filter at 95-116; CommunicationController.java writes alerts.incident_id (208-213), LEFT JOINs it for lists (424,465), uses it for area-scoping (457) and the drill guard (197-206). Data: 2 assessments (1 linked), 9 alerts (1 linked). Note: this FK links response artifacts to incidents — it contributes nothing to the warning↔incident question.

**Fix:** None needed for integrity; low link population is usage, not code.

### ✅ WORKING (severity 1) — Scanner detection → incident provenance (forward EW-monitoring→incident path)

**Evidence:** ScannerController.java:196-240 routeToIncident creates a draft incident and stamps scanner_detections.dispatched_as='incident', dispatched_ref, incident_id (lines 231-232). Live data confirms the path has been exercised: psql → detections 339→incident 28, 1465→incident 85 (of 60 detections). This is the only persisted EW-side→incident provenance in the system, but it records 'this incident came FROM monitoring', not 'this incident was inside an issued warning area' — it does not answer the forecast-coverage question either.

**Fix:** When rendering incidents born from scanner dispatch, surface the origin detection (already stored) alongside the proposed forecast-coverage badge so both provenance and coverage read together.

## notifications + email/SMS coverage

> The ONE-dispatcher claim is substantially true and live: NotificationService (backend/src/main/java/tz/go/pmo/dmis/notification/NotificationService.java) writes the unified in-app feed and hands SMS/email to an async ExternalDeliveryService that uses the real MgovSmsService/MailService and logs every attempt to sms_logs/email_logs. Today's matrix test proved the chain end-to-end: incident_workflow feed rows 4767-4771 (ras.tanga/ras.kigoma/ded.dar/eocc/ras.mbeya) plus matching email_logs rows (1 sent, 3 failed with genuine SMTP exceptions). The bell/topbar feed, Communication Center compose+send+scheduler, EW dissemination, One Health dissemination/escalate, and stakeholder-verify congratulation are all genuine. The honest gaps: the backbone's own SMS channel is dead code (no caller ever marks a Notice SMS-eligible, and only 1/107 users has a phone + notify_sms on); several flows the dispatcher's javadoc claims to cover (CP/AAP activation, content publication) never call it, and declarations, assessments, pledges, finance, and recovery are fully silent; there is no DLR and no retry — a failed email is logged and lost. One cosmetic defect: portal-origin incident notifications render the area as literal "(null)".

### ⚫ DEAD (severity 3) — Backbone SMS channel + per-user notify_sms preference — never exercised by any event

**Evidence:** grep across backend: NO caller ever uses Notice.all() or withChannels() (only definition hits in NotificationService.java:47/51); every call site uses Notice.inApp (sms=false) except IncidentWorkflowService.java:535 which sets email-only. So NotificationService.dispatch()'s smsPhones branch (lines 102-104) is unreachable in practice. Compounding: psql — only 1 of 107 users has a phone and notify_sms=true. All real SMS traffic bypasses the backbone via direct MgovSmsService calls (EW/OH/alerts/stakeholder-verify).

**Fix:** Either mark critical notices SMS-eligible (e.g. Critical-severity incident stages, EW publish) and seed officer phone numbers, or delete the dead per-user SMS branch and preference toggle so the settings UI stops promising a channel that can never fire.

### 🔴 GAP (severity 3) — Silent events: disaster declarations, CP/AAP activation, assessments, support pledges accept/decline, budget/finance, recovery/relief, content publication — no notification at all

**Evidence:** grep -c "notif" returns 0 for DeclarationController.java, ActivationService.java, AssessmentController.java, SupportPledgeController.java, StakeholderCoordinationController.java, finance/BudgetController.java; recovery/ and content/ packages have zero NotificationService references. Concretely: SupportPledgeController.java:154/168 flips pledge status to accepted/declined without telling the pledging stakeholder. This contradicts NotificationService.java:13-14 javadoc which claims 'CP/AAP activation … content publication, approvals' route through the dispatcher, and NotificationController.java:20-21 which claims the feed covers 'activations, publications'.

**Fix:** Wire notifyStage-style calls into declaration approval, ActivationService, pledge review, and budget-tier approvals; or correct the two javadoc claims so the dispatcher's contract matches reality.

### 🔴 GAP (severity 2) — Delivery status tracking / DLR — absent (confirmed still true); no retry of failed/pending sends

**Evidence:** sms_logs has external_id/delivered_at/retry_count columns but no code ever writes status='delivered' (grep 'delivered' over backend hits only dispatch/allocation domain statuses); the 6 delivered rows are old seeds (SELECT count(*) FROM sms_logs WHERE delivered_at IS NOT NULL → 6, all pre-June-20 stakeholder/public types); no M-Gov callback endpoint exists; SmsAuditLogger.java:35 only writes sent/failed/pending at send time. Only scheduler touching comms is CommunicationController.java:305 (scheduled-alert dispatch); nothing retries email_logs rows — today's 3 'failed' incident emails (SMTPSendFailedException EOF, TLS handshake) are permanently lost, recipients keep only the in-app row.

**Fix:** Add an M-Gov DLR callback (they return messageId → external_id already stored) and a bounded retry sweep over status='failed' logs; surface failed-stage-email counts on the Communication overview.

### 🟡 PARTIAL (severity 2) — Incident stage notification body renders area as literal "(null)" for portal-origin incidents

**Evidence:** IncidentWorkflowService.java:519-521 reads incident district_name/region_name and builds '(" + where + ")' with no null guard; portal-origin incidents leave both name columns null. LIVE: today's row 4771 message = "Incident 'Citizen report: Floods at Handeni' (null) has reached the 'Waiting for RAS' stage…"; psql: 7 of 59 incident_workflow rows contain '(null)' — and the same string went out in the emails.

**Fix:** Fall back to joining region/district names by id (or omit the parenthetical when both are null) in notifyStage.

### 🟡 PARTIAL (severity 2) — Warehouse loan notifications bypass the ONE dispatcher (direct insert, ignores notify_in_app preference)

**Evidence:** WarehouseOpsController.java:659 inserts directly into public.resource_notifications instead of calling NotificationService — no notify_in_app check, no channel eligibility, invisible to the dispatcher's log line. Rows exist (warehouse_loan_return x4, warehouse_borrow x2), so it works, but it is the one writer outside the claimed single backbone (ResourceApprovalController.java:71 only reads).

**Fix:** Route through notifications.notifyUser with Notice.inApp to restore the single-dispatcher invariant.

### 🟡 PARTIAL (severity 2) — notifyAllUsers broadcasts for scanner/EW ingest events flood every account's feed

**Evidence:** ScannerController.java:234/274/340/371/376 and EwBulletinIngestController.java:134 use notifyAllUsers — every one of 107 users gets internal scanner workflow chatter: psql shows 1096 scanner_tasking + 368 ew_bulletin_received feed rows, and the live overview reports in-app unread 432/433 (nobody reads the spam). Functionally real, but drowns the bell for officers with no scanner role.

**Fix:** Scope scanner events to notifyRoles (EOCC/focal points) and bulletin-received to EW approvers.

### ✅ WORKING (severity 1) — ONE dispatcher core (NotificationService → in-app feed + async external delivery with per-user channel preferences)

**Evidence:** NotificationService.java:90-124 dispatch() inserts public.resource_notifications per user honoring notify_in_app/notify_sms/notify_email, then ExternalDeliveryService.java:32-51 (@Async notificationExecutor) sends via MgovSmsService.sendBulk / MailService.sendBulk, each logging to sms_logs/email_logs. LIVE: psql shows 1990 feed rows, latest 2026-07-05 16:46:00 (today's matrix test); email_logs id 470 status=sent to ras.tanga@pmo.go.tz at 16:46:04 — real SMTP send 4s after the feed write.

### ✅ WORKING (severity 1) — Incident chain stage notifications (report→DDMC→DED→RDMC→RAS→EOCC→Director→PS + closed_rumor/resolved) — in-app + email, SMS silent by design

**Evidence:** IncidentWorkflowService.java:511-541 notifyStage builds Notice(sms=false, email=true) — comment at line 509: 'In-app + email only; SMS stays silent by design'; invoked at lines 237/260/283/316/384; recipients resolved per stage at 545-559 (DED of district, RAS of region, EOCC/Director/PS national). LIVE: feed rows 4767-4771 today to the exact stage owners (ras.mbeya 11:05, eocc 11:15, ras.kigoma+ded.dar 13:58, ras.tanga 16:46) and matching email_logs attempts for each. SMS-silent confirmed: zero sms_logs rows with notification_type='incident_workflow'.

### ✅ WORKING (severity 1) — Bell/topbar notification feed (unread badge, mark-read, deep links)

**Evidence:** NotificationController.java:36-82 serves GET /v1/notifications (+/unread-count, /{id}/read, /read-all) from resource_notifications; frontend/src/app/shell/topbar.component.ts:145 polls unread every 45s, :176-181 marks read and router.navigateByUrl(n.link). LIVE as ras.tanga@pmo.go.tz: GET /api/v1/notifications returned today's 'Incident needs your action: Waiting for RAS' (id 4771, link /m/response/incidents/91, is_read=false).

### ✅ WORKING (severity 1) — Communication Center compose+send: audiences, fan-out, scheduled alerts, resend-failed, templates, analytics

**Evidence:** CommunicationController.java:169 (POST /alerts) → fanOut (lines 236-260) writes in-app via the one dispatcher + alert_recipients pending rows flipped async by ExternalDeliveryService.deliverAlert (ExternalDeliveryService.java:59-86); scheduled dispatcher at :305 (@Scheduled 60s, atomic claim). LIVE as admin: GET /v1/response/communication → 9 alerts, 91 deliveries, 82.4% rate; /form-data → 8 recipient_groups, 5 templates; /v1/communication/overview + /audiences return real per-audience SMS/email reach (stakeholders 17/19, ew_leaders 14/14, all_users 1/107 sms). Proof the scheduler fires: alert id 13 scheduled_at 07:00 was sent 07:27:15 and its SMS logged (sms_logs id 78). alert_recipients: 34 sms sent / 4 failed / 12 email pending — honest statuses, not fabricated.

### ✅ WORKING (severity 1) — EW pipeline notifications: bulletin ingest broadcast, publish broadcast, PMO dissemination (SMS+email+PDF attach+coordinator in-app)

**Evidence:** EwBulletinIngestController.java:134 notifyAllUsers 'ew_bulletin_received' after-commit (368 feed rows, latest 06-28); EwWarningLifecycleController.java:286 'early_warning_published' broadcast after-commit; EwProductController.java:302/322/330 sends real MgovSmsService SMS ('ew_dissemination', 13 sent in sms_logs) + mail.sendComposed with PDF attachment + coordinator in-app ('ew_bulletin_disseminated', 28 feed rows). All routed through the same gateways that log to sms_logs/email_logs.

### ✅ WORKING (severity 1) — One Health dissemination + directive escalate — real gateway sends with honest pending→sent/failed accounting

**Evidence:** OneHealthDisseminationController.java:568/572 → ExternalDeliveryService.deliverOhDissemination (ExternalDeliveryService.java:103-132) flips oh_dissemination_logs pending→gateway outcome and writes true sms/email_sent_count; OneHealthDirectiveController.java:365-407 escalate() sends genuine MgovSmsService/MailService reminders (the former fake fixed in 1902f31). LIVE: oh_dissemination_logs shows sms 13 sent/7 pending, email 10 sent/16 pending (pending = pre-gateway-config attempts, honestly recorded); sms_logs ids 80-82 'ONE HEALTH ALERT…' status=sent.

### ✅ WORKING (severity 1) — Notification coverage of remaining wired events: approval engine, dispatch approve/reject, tasks, stakeholder bids, scanner, training support, stakeholder verify

**Evidence:** ApprovalWorkflowEngine.java:287 notifyRoles next approver + :309 requester outcome (22 approval_request feed rows); DispatchController.java:336/361 dispatch approved/rejected to requester; TaskController.java:328/348 task_assigned + dependency-ready (25 rows); StakeholderBiddingController.java:844/862 bid events incl. donation/resource bids; ScannerController.java:234-376 four scanner events; TrainingPlanService.java:167 Partners funding request; StakeholderAdminController.java:143-150 verify → direct deliver() email+SMS to the partner's own contacts (sms_logs 'stakeholder_verified' 2 sent). All in-app rows exist in resource_notifications with matching type counts.

## Disaster Repository + Reports & Analytics (repository-events, sendai-analytics, incident/resource/EW reports, past-disasters, cost tracking)

> The repository/analytics stack is overwhelmingly GENUINE: every count is computed live from Postgres (no hardcoded figures found), all six report screens call real endpoints, and CSV export, year filters and Sendai normalization were proven live. The repository is fed MANUALLY (EOCC entry + local-profile seeders that loaded the official DMD 2025/26 report as 72 Validated cards) — there is NO automatic feed from resolved incidents/warnings, only assistive link-suggestions/pull that are barely used (3 links on 75 events, zero incident links). The big hole is COST: three cost mechanisms exist (in-kind allocations×unit_cost, Budget&Finance cash commitments per incident — frontend now BUILT, memory outdated — and a gov_response_tzs column) but none reaches the repository: every one of the 75 event cards shows response investment TZS 0, and gov_response_tzs is a write-orphaned column exported as a permanent 0.00 CSV column. Loss data itself is thin (2/76 effects rows carry TZS loss) and 2 seeded pseudo-region rows ("National (23 regions + Zanzibar)") pollute the region ranking and the leadership "Loss concentration" insight.

### ⚫ DEAD (severity 3) — gov_response_tzs column: designed cost field with no fill path, exported as always-0

**Evidence:** V61__disaster_effects_official_report_fields.sql:20-23 creates it with a comment 'relief disbursed (OWM-SBUU + region/council)'; grep across backend+frontend finds only exportCsv (DisasterEventService.java:120,131) and the seeder insert (OfficialDisasterReportSeeder.java:77) — no API request field, no UI form field, show() omits it. LIVE: all rows 0; CSV export shows '0.00' for every event including the validated official-report cards.

**Fix:** Either wire it into the event form/API and show(), or remove it from the CSV header until fillable.

### 🔴 GAP (severity 4) — COST-USED per disaster: three disconnected mechanisms, repository shows TZS 0 for all 75 events  
> **⚖ Adversarially verified — accusation UPHELD.**

**Evidence:** (1) In-kind: responseInvestment = allocated_resources×unit_cost for LINKED incidents (DisasterEventService.java:493-504), rendered on the card (repository-event-detail.component.ts:284-291 'DMD response investment') — but zero incident links exist, so LIVE GET /repository/events/{id} returned {valueTzs:0, allocations:0} and the Sendai 'DMD response delivered' insight (SendaiAnalyticsService.java:223-238) never fires (absent from live insights list). (2) Cash: Budget&Finance V99-V101 works E2E — LIVE GET /v1/finance/budgets/1 shows commitment of 5,000,000 TZS against incident #2 'Market fire — Kariakoo', status disbursed; BUT grep shows only finance/BudgetController.java touches budget_commitments — no repository/analytics view joins cash spend to a disaster event. (3) gov_response_tzs on disaster_events (V61: 'Government relief disbursed for this event') has NO write path in create()/update() and is not returned by show(); only the seeder inserts it and all 75 rows are 0 (SELECT count where >0 → 0), yet exportCsv emits it as a permanently-0.00 'Gov Response (TZS)' column (Service.java:120,131).

**Fix:** Surface cost on the event card from both ledgers: sum budget_commitments (via linked incidents) + allocations×unit_cost; add gov_response_tzs to create/update/show or drop it from the CSV — today the exported column silently reports 0 government response for every disaster.

### 🟡 PARTIAL (severity 3) — Repository feeding model: MANUAL EOCC entry + seeders; NOT auto-fed by resolved incidents/warnings

**Evidence:** Only three writers of disaster_events exist (grep 'insert into disaster_events'): DisasterEventService (manual, guarded by disaster_repository.enter — held by EOCC/Director/Asst.Director/ICT Admin/Super Admin per role_has_permissions), plus @Profile("local") OfficialDisasterReportSeeder.java:29 (seeded the 72 Validated cards from seed/disaster_report_2025_26.json) and SendaiLocalSeeder. No listener/workflow creates a card when an incident resolves. Assistive tooling exists and works (linkSuggestions ±14-day window Service.java:392-428; pullFromLinks read-only pre-fill :437-457, Controller doc: 'never auto-saved') but adoption is near zero: disaster_event_links has 3 rows total (1 early_warning, 1 threat, 1 damage_assessment, ZERO incident links) across 75 events — so pull-from-links and response-investment return empty for every card.

**Fix:** Add a nudge at incident-close (offer 'record in Disaster Repository' with pre-linked incident) or a periodic EOCC worklist of resolved incidents with no repository card; the 3-links reality means the designed operational→repository chain is not happening.

### 🟡 PARTIAL (severity 3) — Repository data quality: seeded pseudo-regions + near-empty loss figures distort analytics

**Evidence:** Only 2 of 76 effects rows carry total_loss_tzs>0 (556B on DE-2024-0001 'National (other regions)' + 6.5M on an Open card, so live 2026 Target C = 0 TZS despite 72 validated disasters — the code is honest, the data is hollow). The seeded rows use pseudo-region names: SELECT shows 2 effects rows with region 'National (…)'; live regionRanking/'Loss concentration' insight consequently told leadership "National (23 regions + Zanzibar), Mwanza and National (other regions) carry 100% of recorded economic losses — prioritising these regions…", which is nonsense as a regional prioritisation statement. Also hazard taxonomy drift: hazardTypes list contains both 'Flood' and 'Floods', splitting the hazard profile.

**Fix:** Re-seed national-scope effects distributed to real regions or exclude pseudo-regions from regionRanking/insights; unify 'Flood'/'Floods'.

### 🟡 PARTIAL (severity 2) — past-disasters (Mitigation) vs Disaster Repository duplication

**Evidence:** Two independent registries record the same real-world events with no sync: past_disasters (6 rows incl. 'Bukoba earthquake 2016', 'Kilosa floods 2019') vs disaster_events (DE-2016-0001 'Kagera (Bukoba) Earthquake, September 2016', DE-2025-0109/DE-2026-0105 'Mafuriko — Kilosa'). PastDisasterService.java:50-121 is a functioning Laravel port (LIVE GET /v1/past-disasters → stats {total:6, withReports:1, geoLocated:2} + byYear chart) focused on narrative/lessons/doc-upload, not Sendai figures. A bridging link type 'past_disaster' exists in LINKABLE (DisasterEventService.java:42) but 0 links of that type exist in the DB.

**Fix:** Accept as narrative-vs-loss-DB split but cross-link the overlapping events, or show a 'also in repository' pointer to stop double data entry.

### 🟡 PARTIAL (severity 2) — Capability matrix vs user's ask ('number of incidents, issued EW, disasters occurred, cost used… everything')

**Evidence:** Answerable TODAY (all live-proven): incident counts+breakdowns+casualties (22; /v1/reports/incidents), disasters occurred by year/hazard/region/status (75; /v1/repository/events + yearlySeries), deaths/missing/affected (Sendai A/B: 58 & 27,901 for 2026), infrastructure damage (D: 40 facilities, 133.42km roads), economic loss where data exists (C 2024: 556B TZS, 0.28% GDP), issued EW + effectiveness incl. lead time (53 windows/10 bulletins, 9 warned-incidents, 35h avg lead), in-kind allocation value over a period (109.7M TZS), EW-coverage-of-disasters (1.4%), DRR instruments (30), partners+donations (35), CSV download. NOT answerable: cost USED per disaster (all cards TZS 0 — see cost finding), cash expenditure anywhere in Reports & Analytics, gov relief disbursed (column dead), and any repository↔finance join.

**Fix:** The single highest-value close-out is the cost-per-disaster join; everything else on the user's list already resolves to a real number.

### ✅ WORKING (severity 2) — Budget & Finance module (V99-V101) — current state incl. frontend

**Evidence:** Memory 'frontend not built' is OUTDATED: routes m/budget-finance/budgets(/:id) exist (app.routes.ts:34-35), components pages/finance/budget-finance.component.ts (376 lines) + budget-detail.component.ts (317 lines) call /v1/finance/* live; permission budget_and_finance.view granted to 12 roles; module in core/modules.ts:89. LIVE: GET /v1/finance/budgets → 1 active district budget 50M TZS (allocated 20M, committed 5M, disbursed 5M); GET /budgets/1 → line + commitment (incident-tied, maker-checker names populated) + virements[]. Gaps: token test data (1 budget/1 line/1 commitment, expended_amount null), and no analytics/repository view consumes these tables (grep: only BudgetController) — cash spend is invisible outside the module.

**Fix:** Feed budget disbursements into incident/repository cost views and the Sendai C/insight layer.

### ✅ WORKING (severity 1) — Disaster Repository registry + event card + CSV export (/v1/repository/events, frontend m/reports-analytics/repository)

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/repository/DisasterEventService.java:50-194 (index/show all SQL-derived), Controller.java:40-64. LIVE: GET /api/v1/repository/events → stats {total:75, open:3, validated:72}, per-event deaths/affected/lossTzs/linkCount; GET /export?year=2026 returned RFC4180 CSV with UTF-8 BOM (headers + DE-2026-0136 row observed). Lifecycle Open→Validated→Archived enforced (transition() requires ≥1 effects record, requireEditable freezes Validated cards, service.java:253-291,524-534). UI-created card DE-2026-0001 by 'Reg DC' proves the manual entry path is used end-to-end.

### ✅ WORKING (severity 1) — Sendai analytics dashboard (/v1/repository/analytics) — real DB math, not hardcoded

**Evidence:** SendaiAnalyticsService.java:59-133 computes targets A–D from disaster_event_effects joined on Validated/Archived cards only, E from disaster_risk_frameworks count, F from stakeholders+ndmf_donations, G from early_warnings; normalization uses sendai_baselines table (6 population + 3 gdp rows in DB), fallback literal only if table empty (:306-317). LIVE: 2026 → A=58 deaths+missing (0.09/100k), B=27,901, C=0 TZS, G=10 warnings; ?year=2024 → C=556,000,000,000 TZS = 0.28% GDP (matches DB row DE-2024-0001 556B, proving year filter + GDP math). yearlySeries/hazardProfile/regionRanking/dataQuality all straight SQL. Frontend sendai-analytics.component.ts:189 renders API data; no hardcoded population found. Caveats (honest, labeled): the 38 sendai_indicators rows are a 'Sendai indicator reference' display panel, only A-1/B-1/C-1/D-1/G-3 are actually computed; E and F are proxy counts (documents on record; partners+donations), stated as such in valueLabel.

### ✅ WORKING (severity 1) — Incident Reports (/v1/reports/incidents + m/reports-analytics/incident-reports)

**Evidence:** IncidentReportController.java:37-133: date-ranged (default 12mo), filters status/severity/region, simulation-excluded (is_simulation=false), area-scoped via JurisdictionScope.appendAreaScopeSharedOrOwn, partner accounts blocked (:44-46). LIVE: summary {total_incidents:22, critical:3, open:20, deaths:10, injured:19, displaced:420} + by_severity/by_type/by_region/by_month + 22 records. Minor data wart: live by_severity contains a non-canonical 'High' (1 incident) which the hardcoded severity dropdown (Controller.java:129) cannot filter to.

**Fix:** Normalise the stray 'High' severity value or derive filter_options.severities from data.

### ✅ WORKING (severity 1) — Resource Allocation Report (/v1/reports/resource-allocations) — allocation cost aggregates

**Evidence:** ResourceReportController.java:42-121: Σ quantity_allocated×unit_cost, by_status/by_category, sim-incidents excluded, area-scoped through the parent incident. LIVE (?start_date=2025-01-01): {total_requests:15, approved:1, total_value:109,715,000 TZS}, by_category = Search&Rescue 285 units / Shelter 59 / NFI 225, 15 records with per-line value. This is the ONLY working money-aggregate report today (in-kind value over a date range) — it is not per-disaster.

### ✅ WORKING (severity 1) — EW Management analytics (/v1/reports/early-warnings) — issued-warning effectiveness

**Evidence:** EwManagementController.java:52-186 correlates warning_hazards×approved/published warnings with incidents in the warned area+window: LIVE summary {warnings_issued:53, warned_incident:9, warning_no_incident:44, unwarned_incident:17, preparedness_during_warning:1, avg_lead_time_hours:35} + drr {disasters_total:72, disasters_ew_linked:1, ew_coverage_pct:1.4}. All four effectiveness classes computed from DB; frontend ew-management.component.ts:178 consumes it. Caveat: 'issued EW' has TWO sources of truth — this screen counts 53 warned area-hazard windows (warning_hazards of 10 approved warnings) while Sendai Target G counts 10 rows of the separate early_warnings table ('10 warnings issued this year'); both real but a director sees different headline numbers with different semantics on adjacent screens.

**Fix:** Label the two figures distinctly (warning bulletins vs warned area-windows) or reconcile Target G onto the warnings/warning_hazards source.

## Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch

> The dissemination backbone is genuinely real: one dispatcher (NotificationService) + one async gateway sender (ExternalDeliveryService) feeding M-Gov SMS and SMTP, both live-configured (configured:true on /content/sms-logs and /content/email-logs) with truthful per-recipient logging. LIVE-proven: EW bulletin disseminate (13 SMS sent, 28 coordinator bell notices, area+hazard+coordinator audiences resolve), Communication Center alert fan-out (34 SMS sent in alert_recipients), OH dissemination approve→gateway (sent rows + truthful counts), incident approval-chain emails (193 rows, one sent today to ras.tanga). Real gaps: no auto-push to alert_subscriptions on EW publish (subscriber SMS/email is operator-triggered only), no DLR webhook anywhere (delivered statuses are seed data), OH acknowledge endpoint hard-403s for everyone (dead round-trip), scanner tasking notices broadcast to ALL 107 users instead of the tasked entity (1096 bell rows of noise, in-app only), warehouse dispatch-approval queue gets no notification on new requests (poll-only), and role-targeted SMS reaches ~nobody because only 1 internal user has a phone seeded.

### ⚫ DEAD (severity 3) — One Health dissemination acknowledge endpoint (stakeholder ack round-trip)

**Evidence:** POST /v1/onehealth/disseminations/{id}/acknowledge (backend/.../onehealth/OneHealthDisseminationController.java:387-393) unconditionally returns 403 'You are not associated with a stakeholder' for EVERY caller — it never inspects the session's stakeholder link, so the acknowledgment leg of the dissemination round-trip can never succeed for anyone, despite carrying a one_health.acknowledge permission gate.

**Fix:** Resolve the caller's stakeholder via users.agency/stakeholder link (V95) and record the ack, or remove the endpoint.

### 🔴 GAP (severity 3) — EW → subscribers on publish (alert_subscriptions auto SMS/email when a warning is published)

**Evidence:** EwWarningLifecycleController.publish (backend/.../ew/EwWarningLifecycleController.java:284-300) fires ONLY Notice.inApp (sms=false,email=false) to system users. Grep of all alert_subscriptions consumers (CommunicationController 'public' group, AudienceService, AlertSubscriptionService, PortalPublicService, seeders) shows NO publish-time caller — subscribers with hazards_of_interest are never auto-notified when their hazard is published; they get SMS/email only if an operator later runs bulletin disseminate or a Communication Center send. LIVE: 5 active alert_subscriptions (3 phones/4 emails reachable per /v1/communication/audiences).

**Fix:** Wire publish() afterCommit to AudienceService.resolve('subscribers_by_hazard') + resolveAreas for the warned districts, reusing the existing disseminate machinery.

### 🔴 GAP (severity 2) — SMS/email delivery reports (DLR) — confirmed-delivered status from the gateway

**Evidence:** No inbound DLR/callback endpoint exists anywhere: grep '@PostMapping|@GetMapping .*(dlr|callback|delivery-report|webhook)' over backend/src/main/java returns nothing; sms_logs.delivered_at is written only by the RecoveryLocalSeeder (local/RecoveryLocalSeeder.java:187 seed data). LIVE dashboard counts of 'delivered' (6 sms rows, types public/stakeholder) are seeded, not gateway-confirmed; email_logs delivered=0. Terminal truth is 'sent to gateway', never 'delivered to handset'.

**Fix:** Expose an M-Gov DLR callback endpoint keyed on external_id and flip sms_logs to delivered/failed.

### 🟡 PARTIAL (severity 3) — Scanner detection → entity tasking round-trip (V131: dispatch→acknowledge→respond→EOCC review/return)

**Evidence:** Full state machine real: routeToEntity inserts tasking w/ urgency/source/instruction (backend/.../ew/scanner/ScannerController.java:246-281), acknowledge (306-315), respond (319-348), review accept/return (352-382), agency ownership enforced (assertOwnAgency); both UIs wired (pages/preparedness/disaster-scanner.component.ts:493-513 operator; ew-agencies/entity-taskings.component.ts:120-140 entity). LIVE: taskings awaiting=10, responded=1, returned=1; GET /entity-taskings?agency=nemc returns 3. BUT every notice (dispatch line 274, respond 340, review 371/376) uses notifyAllUsers — LIVE 1096 'scanner_tasking' bell rows ≈ 12 taskings × all 107 users: the tasked entity gets no targeted notification (and no SMS/email), while every unrelated user gets bell noise.

**Fix:** Target notifyUsers to the entity's users (users.agency_id) + EOCC role instead of notifyAllUsers; consider email eligibility for Immediate-urgency taskings.

### 🟡 PARTIAL (severity 2) — V92 area-coordinator targeting (users.region_id/district_id → RAS/RC/Reg DC/DAS/Dist DC/DED of affected areas)

**Evidence:** AudienceService.resolveAreaCoordinators/coordinatorUserIds (backend/.../notification/AudienceService.java:148-207) joins roles×users.region_id/district_id via AreaLookup. LIVE psql: simulated the exact SQL for Tanga → resolves ras.tanga@pmo.go.tz (RAS) + rc.tanga@pmo.go.tz (RC). But seeding is thin: 63/107 users have region_id, only 11 have district_id — district-tier coordinators (DAS/Dist DC/DED) outside the 5 seeded start-regions resolve to nobody (code degrades silently to empty, AudienceService.java:201-206).

**Fix:** Seed district_id for DAS/Dist DC/DED accounts in all districts, or dissemination to district coordinators silently reaches no one.

### 🟡 PARTIAL (severity 2) — Role-targeted SMS to internal officers (Directors, RCs, RAS...)

**Evidence:** Mechanism real (AudienceService.resolve 'role', AudienceService.java:67-74) but LIVE /v1/communication/audiences roles picker shows RC: 31 users 0 phones, RAS: 31 users 0 phones...; psql: only 1 of 107 users has notify_sms=true AND a phone. Role-SMS resolves correctly then reaches essentially nobody; NotificationService SMS branch (NotificationService.java:102-104) likewise.

**Fix:** Seed users.phone (+notify_sms) for officer accounts — known follow-on from the Communication Center build.

### 🟡 PARTIAL (severity 2) — Warehouse dispatch-approval notifications (dispatch notes to warehouse officers)

**Evidence:** Approve/reject notify ONLY the requester, in-app only (backend/.../response/DispatchController.java:336,361 → notify() 650-657 Notice.inApp); LIVE resource_notifications dispatch_approved=2, dispatch_rejected=2 — that leg works. But creating a dispatch request (lines 231-242) inserts the Pending dispatch_approvals row and returns WITHOUT any notification to the source warehouse's manager — the approval queue (GET /approvals, 264-292) is poll-only, so a pending dispatch can sit unseen. No email/SMS on any dispatch event.

**Fix:** On dispatch-request insert, notify users holding warehouse approval authority (in-app + email), mirroring notifyStage.

### 🟡 PARTIAL (severity 2) — EW push to partner stakeholders (proactive external push, beyond the stakeholder-portal feed read)

**Evidence:** No automatic external push to partners on EW publish — publish's broadcast is in-app only (EwWarningLifecycleController.java:286-290) so partner ACCOUNTS get a bell notice, but the stakeholders registry (17 phones/19 emails live) is reached only by operator-triggered sends: bulletin disseminate 'area' audience (AudienceService.resolveAreas matches stakeholders.region_id/district_id, AudienceService.java:118-140), CommCenter 'stakeholders' audience, or alert group 'response_agencies' (Partners role, 5 members live in /form-data). Stakeholder-portal issued-alerts feed read was verified previously (per task context).

**Fix:** If policy requires partners to be pushed on publish, add a stakeholders leg to the publish afterCommit hook.

### ✅ WORKING (severity 2) — Incident approval-chain stage notifications (dissemination inside approval flows: next-owner officers per stage, area-scoped)

**Evidence:** IncidentWorkflowService.notifyStage/resolveStageRecipients (backend/.../response/IncidentWorkflowService.java:504-559): waiting_ded→DED of district, waiting_ras→RAS of region via users.region_id/district_id, national tiers by role; in-app + email (sms silent by design, line 535). LIVE: email_logs 'incident_workflow'=193 rows, latest TODAY 2026-07-05 16:46 status=sent to ras.tanga@pmo.go.tz; several 'failed' today with SMTPSendFailException for seeded fake addresses (ras.kigoma@, ded.dar@) — channel real, deliverability limited by fake dev inboxes; 59 in-app 'incident_workflow' bell rows.

**Fix:** Failures are dev-data artifacts (nonexistent @pmo.go.tz mailboxes rejected by SMTP), not code defects.

### ✅ WORKING (severity 2) — One Health dissemination approve/resend → stakeholder+public SMS/email through real gateway with truthful counts

**Evidence:** approve (backend/.../onehealth/OneHealthDisseminationController.java:358-383) → sendDissemination (433-583): per-recipient oh_dissemination_logs written 'pending', afterCommit hands to ExternalDeliveryService.deliverOhDissemination (notification/ExternalDeliveryService.java:103-137) which flips logs and writes REAL sms/email_sent_count (no hardcoded 'sent'). Frontend wired (pages/onehealth/disseminations.component.ts:225,238). LIVE: oh_disseminations 4 sent/1 draft; logs sms sent=13, email sent=10; sms_logs 'oh_dissemination'=3 sent 2026-06-21, email_logs=18. Caveat: dissemination #5 (2026-06-15, pre-gateway-config) has 16 email + 7 sms logs stuck 'pending' forever with counts=0 — status row says 'sent' but nothing went out; only manual /resend recovers it.

**Fix:** Surface stuck-pending logs in the UI or add a retry sweep; dissemination #5 should be resent or marked failed.

### ✅ WORKING (severity 1) — EW bulletin → affected-area dissemination (EOCC Bulletin → SMS/email/in-app to subscribers, stakeholders, area coordinators)

**Evidence:** POST /v1/ew/products/{id}/disseminate (backend/src/main/java/tz/go/pmo/dmis/ew/EwProductController.java:241-343) resolves area∪hazard∪coordinator audiences, sends SMS via MgovSmsService.sendBulk('ew_dissemination'), emails PDF attachment, in-app to coordinators. Frontend wired: frontend/src/app/pages/preparedness/generated-bulletins.component.ts:367. LIVE: sms_logs notification_type='ew_dissemination' 13 rows ALL status=sent (max 2026-06-19); email_logs 3 rows; resource_notifications type='ew_bulletin_disseminated' 28 rows; 73 ew_generated_products exist; gateway configured:true.

### ✅ WORKING (severity 1) — Communication Center alert compose → group fan-out → real SMS/SMTP with truthful per-recipient status

**Evidence:** CommunicationController.sendAlert/fanOut (backend/.../response/CommunicationController.java:169-290): 8 groups all resolve to real recipients (public→alert_subscriptions, sectoral_focal→MDA Focal etc., lines 58-68, 369-388), rows written 'pending' then flipped by async ExternalDeliveryService.deliverAlert (notification/ExternalDeliveryService.java:59-94); scheduled alerts dispatched by @Scheduled poller (lines 305-339) incl. drill isolation (lines 195-205). Frontend: pages/response/communication.component.ts:219,242. LIVE: 9 alerts; alert_recipients sms sent=34/failed=4, email sent=16/pending=12, app sent=16, web sent=9; live /form-data returns real member counts (all_users 107, public 5).

**Fix:** 12 email alert_recipients stuck 'pending' from pre-gateway-config sends (no requeue except manual resend-failed endpoint).

### ✅ WORKING (severity 1) — Communication Center direct compose (SMS/Email Management) with audience targeting: subscribers/by-hazard/stakeholders/EW-leaders/role/agency/manual-pasted

**Evidence:** SmsLogController.send (backend/.../content/SmsLogController.java:80-110) + EmailLogController.java:89 merge pasted numbers with AudienceService.resolve; every send self-logged by the gateway. LIVE GET /v1/communication/audiences returns real reach: all_subscribers sms3/email4, stakeholders 17/19, ew_leaders 14/14, all_users email107; hazards picker (Floods 5, Drought 1) and roles picker live; sms_logs 'manual'=37 (latest 2026-07-04, status sent); both channels configured:true.

### ✅ WORKING (severity 1) — Resource-allocation approval engine notifications (approval_request/approval_granted to next approver role)

**Evidence:** ApprovalWorkflowEngine (backend/.../response/ApprovalWorkflowEngine.java:283-291) notifyRoles→in-app to the pending step's approver_role. LIVE: resource_notifications approval_request=22, approval_granted=8. In-app only (no email eligibility set) — consistent with queue-based work.

### ✅ WORKING (severity 1) — One Health directive escalate/reminder to unacknowledged stakeholders (SMS+email)

**Evidence:** OneHealthDirectiveController.java:392-422: real MgovSmsService.sendBulk('oh_directive_reminder') + MailService.sendBulk with honest failure messages ('gateway not configured' / 'gateway rejected') and truthful sent counts — the former fake 'Sent!' was replaced (genuineness-audit fix, commit 1902f31, previously E2E-verified). LIVE: zero sms_logs/email_logs rows of type oh_directive_reminder in this DB — path real but not exercised since the fix (gateway self-logs, so absence = never triggered, not fake).

### ✅ WORKING (severity 1) — EW pipeline in-app notices (bulletin received on ingest; warning published broadcast)

**Evidence:** Ingest announces pending bulletin to approvers afterCommit (backend/.../ew/EwBulletinIngestController.java:132-148); publish broadcasts (EwWarningLifecycleController.java:284-300). LIVE resource_notifications: ew_bulletin_received=368, early_warning_published=13 — both flows repeatedly exercised.

## Incident Command Post + Virtual Simulations (Command Post board, V132 exercise mode, SimulationGuard, dispatch-console & tasks as ICP building blocks)

> The Command Post (/m/response/coordination -> CommandCenterController /v1/response/coordination, 833 lines) is a genuine, live-working coordination surface: activation index, 15 NDPRP DRF lanes over 95 snapshot tasks, 72-hour clock, posture ladder (monitoring/emergency/disaster/safeguard with V41 doctrine), anticipatory forecast activation with animated storm-track map, per-activation journal timeline, drill-clone simulations with a 10-call-site SimulationGuard seal, table-top vs full-scale exercise modes (V132 allow_real_ops), scenario injects, and a derived After-Action Review with printable report. All core endpoints were live-verified this session (index returned 3 active/4 completed activations; board 27 = running table-top drill with 15 lanes/95 tasks; AAR for activation 4 returned real derived data; EOCC board correctly headlines the non-sim activation while exposing simulations_running=1). Dispatch console and Tasks are real, working ICP building blocks (393 tasks live, dependency/update/assign machinery; allocation->source->dispatch with manager gates). Against the user's ask ("ICP captured at a higher scale... traced well virtually"), the honest gaps are structural, not fake behavior: there is NO ICS organization model (no incident commander, no section chiefs, no per-activation org chart -- lanes assign to stakeholder orgs only), NO unified per-incident operations trace (dispatch/comms/allocation/warehouse actions never land on the board timeline; task_activity_log has only 13 rows), NO real-time push anywhere (zero SSE/WebSocket in the codebase; injects fire only when someone reloads the board), and simulation is single-incident-clone only (no scenario library, no MSEL templates, no multi-incident composite exercises, no participants/time-compression -- activation_injects table is empty today, the feature has never been used since its E2E test). One small live defect: impact-confirmed incidents are created without region/district, so the board's "Area readiness" panel silently degrades to unfiltered national lists.

### 🔴 GAP (severity 4) — No ICS organization structure: no incident commander, no section chiefs, no per-activation org chart or named command roles  
> **⚖ Adversarially verified — accusation UPHELD.**

**Evidence:** grep -rni 'commander|incident_command|ics_' over all migrations hits only a comment in V132 line 11; no table for activation roles exists (psql \dt shows only response_activations/incident_tasks/task_activity_log/activation_injects/task_dependencies/task_updates). DRF lanes assign to stakeholder ORGANIZATIONS (CommandCenterController.java:559-574) and tasks to users (TaskController.java:266), but nothing models who commands the incident, who runs Operations/Planning/Logistics/Finance, or deputies — the ICS backbone the user asked for.

**Fix:** M: add activation_command_roles table (activation_id, role e.g. IC/Ops/Planning/Logistics/Finance/PIO/Safety, user_id, appointed_at, journal on appoint/relieve), an org-chart panel on the board, and appointment events into task_activity_log so the AAR shows command handovers. Map the 15 DRF lanes under section chiefs for the hierarchy view.

### 🔴 GAP (severity 4) — Simulation at scale is single-incident only: no scenario library, no exercise templates/MSEL, no multi-incident composite exercises, no participants roster, no time compression  
> **⚖ Adversarially verified — accusation UPHELD.**

**Evidence:** psql: no tables matching %scenario%|%exercise%|%drill% exist; grep 'scenario' in backend hits only CommandCenterController (inject comments) and an unrelated EW seeder. A simulation = one cloned incident + ad-hoc injects typed in live (V132). There is no way to pre-author a national multi-region scenario (e.g. cyclone + flood + disease outbreak across 3 regions), reuse a past exercise script, enrol participants, compress the 72-hr clock, or score against expected actions — the 'higher scale' the user wants.

**Fix:** L: add exercise_scenarios (title, hazard, regions, objectives) + scenario_events (MSEL: offset_minutes, inject payload, target DRF, expected_action) tables; a launcher that spawns N drill-clone incidents/activations via the existing ActivationService.activate machinery and bulk-loads scenario_events into activation_injects with computed due_at; participant roster (reuse users + activation_command_roles); AAR aggregation across the scenario's activations. The clone+inject+AAR primitives all exist — this is composition, not new machinery.

### 🔴 GAP (severity 3) — No real-time tracing anywhere: zero SSE/WebSocket in the entire codebase; board data refreshes only on user action

**Evidence:** grep -rln 'EventSource|text/event-stream|WebSocket' over frontend/src/app and backend/src/main/java returns NOTHING. command-center.component.ts:651 setInterval only ticks the clock display (now signal); board data re-fetches solely after user POSTs (refresh() at :746). The backend comment 'the board polls' (CommandCenterController.java:389-390) overstates the frontend — there is no polling loop, so two operators on the same board do not see each other's moves until they act.

**Fix:** S-M: add a 20-30s polling interval on the open board (trivial, matches existing architecture) or an SSE endpoint streaming task_activity_log rows for the activation; @EnableScheduling is already on for the backend side.

### 🔴 GAP (severity 3) — No resource/logistics picture on the Command Post board — commander cannot see the incident's allocations, dispatches or stock state from the ICP

**Evidence:** Board payload keys (live GET /coordination/27): activation, drfs, critical_tasks, challenges, recent_activity, summary, stakeholders, task_statuses, priorities, posture_doctrine, injects — no allocations/dispatch data. Tasks carry only a free-text resource_request column (CommandCenterController.java:657-661). The real resource state lives in the separate dispatch console (/m/response/dispatch) and warehouse ops, unlinked from the board UI.

**Fix:** S-M: fold a per-incident allocation/dispatch summary block into board() (one query over allocated_resources where incident_id = activation.incident_id) with a deep link to the dispatch console filtered by that incident (dispatch index already accepts ?incident_id, DispatchController.java:77-80).

### 🔴 GAP (severity 3) — No operational periods / Incident Action Plan cadence at the Command Post (Situation Reports exist but only ad-hoc on the incident page)

**Evidence:** incident_history_reports + POST /{id}/history-reports exist and render on incident-show ('Situation Reports' panel, incident-show.component.ts:252-255), but the Command Post board has no operational-period concept, no IAP objectives per period, and does not even display the incident's situation reports (board payload lacks them). The only period structure is the single fixed 72-hour clock (component.ts:614-625).

**Fix:** S to surface the incident's history_reports on the board; L for real operational periods (activation_periods table with objectives, period-scoped task rollups, period handover journal entries feeding the AAR).

### 🟡 PARTIAL (severity 4) — Per-incident action tracing today = three DISCONNECTED trails, no unified operations log (the user's 'traced well virtually' is only partially met)

**Evidence:** Trail 1: incident_workflow_histories on incident-show (IncidentController.java:816, incident-show.component.ts:214-221). Trail 2: task_activity_log keyed by ACTIVATION not incident (ActivationService.java:100-105) — only 13 rows total live (psql), and only Command-Post actions write to it. Trail 3: Situation Reports (incident_history_reports, IncidentController.java:393/645). Dispatch, warehouse movements, communications, allocations and budget actions for an incident are journalled in their own modules and NEVER appear on the Command Post timeline — the board's recent_activity (CommandCenterController.java:374) reads task_activity_log only.

**Fix:** M: build a read-side union timeline endpoint per incident (task_activity_log + incident_workflow_histories + allocated_resources source_details journal + sms/email logs + warehouse ledger, all filtered by incident_id) and render it as the board's master ops log; no schema change needed since every trail already carries incident linkage.

### 🟡 PARTIAL (severity 2) — Scenario injects (script/fire/resolve, fire-on-board-read) — functional but NEVER used since its build-day E2E; zero rows in DB

**Evidence:** Endpoints CommandCenterController.java:410-478; due-injects auto-fire on board GET at :391-396; UI card + form command-center.component.ts:486-513, 1002-1031. LIVE: psql 'select * from activation_injects' = 0 rows; board 27 injects=[]. The mechanism is real (verified E2E 2026-07-03 per memory) but has no production usage, and injects only fire when a user happens to load the board — no scheduler despite @EnableScheduling being on (DmisPlatformApplication.java:20).

**Fix:** Add a @Scheduled(fixedDelay=60s) firer for due injects so timed events land even when nobody is watching the board (S); add target DRF/role addressing + expected-action field so injects test a specific section, not the shared feed (S).

### 🟡 PARTIAL (severity 2) — Impact-confirmed incidents are created without region/district, silently degrading the board's 'Area readiness' panel to unfiltered national lists

**Evidence:** confirmImpact insert (CommandCenterController.java:243-252) writes title/description/severity/location_description but NO region_id/region_name/district_id; readiness() (:266-300) then finds region_name blank, areas stays empty, and the 'areas.size()=0' branch disables all filtering ('? = 0 or ...'). LIVE: GET /coordination/27/readiness returned areas=[] yet evacuation_centers=5, warehouses=14 — presented in the UI as area readiness for the activation (component.ts:300-341) though it is the whole country. Also skews area-scoping in findOr404 since the incident carries NULL region.

**Fix:** S: in confirmImpact, resolve the first affected_areas entry against the regions table (AreaLookup helper already exists per jurisdiction work) and stamp region_id/region_name on the created incident; alternatively pass affected_areas through to readiness for forecast-born incidents.

### ✅ WORKING (severity 1) — Command Post board core (activation index, 15 DRF lanes, 95-task snapshot, 72-hr clock, posture ladder, lane drawer, journal timeline)

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/response/CommandCenterController.java:64-111 (index), :328-405 (board), :540-553 (lane); ActivationService.java:80-88 (95-task DRF snapshot). LIVE: GET /api/v1/response/coordination returned active=[(27 sim drill),(24 forecast),(1 live)], completed=4, doctrine=4 rows; GET /coordination/27 returned 15 drfs, summary total_tasks=95, 7 critical tasks; GET /coordination/27/drf/1 returned 7 tasks. Frontend command-center.component.ts:129-561 renders all of it (route app.routes.ts:155).

### ✅ WORKING (severity 1) — Virtual simulation via drill clone (is_simulation flag, [SIMULATION] title, identical machinery)

**Evidence:** ActivationService.java:52-62 clones the incident with is_simulation=true; CommandCenterController.java:113-132 activate mode=simulation. LIVE: psql shows activation 27 (incident 13, is_simulation=t, allow_real_ops=f, status=active) and completed sim activation 4; board 27 returned sim=True realops=False with full lane machinery.

### ✅ WORKING (severity 1) — Drill-isolation seal (SimulationGuard + KPI filters) — sims cannot move real stock/money/comms and never inflate dashboards

**Evidence:** SimulationGuard.java:48-63; wired at 10 call sites in 6 controllers (grep: DispatchController.java:200, ResourceAllocationController.java:172, WarehouseOpsController.java:162/211/243, StakeholderBiddingController.java:103, CommunicationController.java:199-200, BudgetController.java:197/288). KPI filters: DashboardController.java:81-203 (is_simulation=false everywhere + simulations_running), TaskController.java:38-40 NOT_SIM_TASK. LIVE: GET /v1/response/eocc returned active_activation.is_simulation=False (drill 27 running but NOT headlined) and statistics.simulations_running=1. Block refusals not re-fired this session (read-only rules); 9 blocks E2E-confirmed 2026-07-03 per memory (commit 31ebb9c).

### ✅ WORKING (severity 1) — Exercise modes: table-top drill (hard-blocked) vs full-scale exercise (allow_real_ops, forced [DRILL EXERCISE] comms marking)

**Evidence:** V132__exercise_mode_and_injects.sql:6-7 (allow_real_ops column); CommandCenterController.java:121-131; SimulationGuard.java:37-45 realOpsAllowed bypass; CommunicationController.java:201-203 forces '[DRILL EXERCISE] ' title + '[DRILL EXERCISE — NOT A REAL EMERGENCY]' message prefix; frontend Swal mode picker command-center.component.ts:976-1000 and forecast checkbox :180-187. LIVE: response_activations has allow_real_ops column populated (all f currently); badges TABLE-TOP DRILL / FULL-SCALE EXERCISE / REAL OPS ENABLED at component.ts:396-400.

### ✅ WORKING (severity 1) — After-Action Review: derived scorecard (timeline, task/72hr completion, per-DRF performance, inject response times) + printable PMO report

**Evidence:** CommandCenterController.java:481-537 buildAar + GET /{id}/aar; printAar() command-center.component.ts:1035-1110 (letterhead, scorecard, sign-off, window.print). LIVE: GET /api/v1/response/coordination/4/aar returned real journalled timeline (3 events incl. posture_changed), tasks 0/95, per-DRF rows — all derived from actual data, nothing canned.

**Fix:** AAR is exposed 'mid-exercise as a live scorecard' via GET /aar (line 480-485) but the UI only renders it when the activation is closed (component.ts:424) — surface the live scorecard button on active exercises (S).

### ✅ WORKING (severity 1) — Tasks module as ICP building block (assign/status/dependencies/updates/calendar, sim-excluded, area-scoped)

**Evidence:** TaskController.java:61-127 (index w/ NOT_SIM_TASK + jurisdiction scope), :266-282 assign, :283+ status with dependency enforcement (task_dependencies at :316-343, task_updates at :323). LIVE: GET /api/v1/response/tasks returned 200 rows, statistics total=393/completed=192/overdue=6.

### ✅ WORKING (severity 1) — Dispatch console as ICP building block (allocation board by incident, source picking, dispatch w/ warehouse-manager gate, procurement lifecycle, agency requests)

**Evidence:** DispatchController.java:77 (board), :195-200 (dispatch, sim-guarded), :264-342 (manager approvals), :369-527 (procurement incl. /track), :550 (agency request). LIVE: GET /api/v1/response/dispatch returned grouped board (1 incident group, pending_approval_count=0). Note '/track' is procurement-status tracking, not vehicle/GPS tracking.

### ✅ WORKING (severity 1) — Command Post permission gating (command_post.activate/.posture/.view, tasks.manage) is real and enforced

**Evidence:** psql: permissions rows command_post.activate, command_post.posture, command_post.view, tasks.manage all exist; @PreAuthorize on activate (CommandCenterController.java:114), forecast (:142), posture (:184), injects add/fire/delete (:412/:433/:469), lane mutations (:558/:577/:601/:668), deactivate (:685). Forecast activations additionally locked to NATIONAL tier (assertMayManageForecast :755-760); incident-linked ones area-scoped via findOr404 (:734-747).

## Dead code + unproductive endpoints hunt (whole repo: 511 backend endpoint mappings x 82 controllers cross-checked against 170 frontend TS files, plus reverse linkage, stub markers, dead-button patterns, and 8 truly-empty DB tables)

> Systematic sweep: extracted all 511 backend REST mappings and cross-checked frontend consumption (concatenation-aware, every candidate re-verified by hand after two scanner false-positive incidents), reverse-checked every frontend /api URL against backend mappings, scanned for stub/TODO markers, dead buttons, unreferenced components/classes, and empty+unreferenced tables. The codebase is unusually clean at the UI layer (zero dead components, zero fake buttons, zero broken frontend-to-backend links, zero TODO stubs in backend main) but carries ~17 functional-yet-unconsumed backend endpoints, one dead 9-class event/outbox pipeline polling an empty table every 2s since deployment, 5 retired-Streamlit EW boundary endpoints still armed to send real M-Gov SMS, and 4 schema-only dead tables. Caveat: live "anonymous" probes authenticate as the local-profile dev persona (LocalAuthFilter); the !local chain requires auth for /ew (SecurityPaths.java:33), so dead-surface findings are dead-code findings, not prod auth holes. Memory note "Budget & Finance frontend not built" is now outdated - it is fully wired.

### ⚫ DEAD (severity 4) — 5 EW boundary endpoints whose only consumers (Streamlit dashboards) were retired: GET /ew/stakeholders, POST /ew/disseminate, POST /ew/sms-test, POST /ew/monitoring/reports/batch, POST /ew/monitoring/request-update  
> **⚖ Adversarially verified — accusation UPHELD.**

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/ew/EwBoundaryController.java:51,67,133,166,179. Zero hits for these paths in frontend/src (grep 'ew/stakeholders|ew/disseminate|ew/sms-test|reports/batch|request-update' -> 0); only consumers are /home/kaijage/model/maafa/ew-engine-aside/.../dissemination_page.py + monitoring_page.py (retired Streamlit, outside the running stack). Live: GET /api/ew/stakeholders -> 200 with 27 stakeholders incl. PII; POST /api/ew/disseminate -> 422 'bulletin_number is required' proving the method body executes and would dispatch REAL M-Gov SMS (sendBulkSms at :86-100). The sibling /ew/monitoring/reports GET+POST and /ew/bulletins/ingest ARE used (disaster-scanner.component.ts:455,528; ew-agency.service.ts:68).

**Fix:** Delete the 5 handlers (or fold dissemination into the native Communication Center flow); they are dormant SMS-dispatching surface with no UI.

### ⚫ DEAD (severity 3) — Entire domain-event/outbox pipeline is dead machinery: AggregateRoot, DomainEvent, DomainEventLogger, OutboxAppender, OutboxDispatcher, OutboxEnvelope, OutboxEvent, OutboxEventRepository, OutboxRelay

**Evidence:** grep 'extends AggregateRoot|registerEvent' across backend/src -> zero hits outside common/domain+common/event (no entity ever raises an event). platform.outbox_event = 0 rows (psql count). OutboxRelay.java:29-31 runs @Scheduled(fixedDelay 2000ms) polling findTop100ByPublishedAtIsNull forever against the eternally-empty table. No external class references OutboxDispatcher/OutboxEnvelope.

**Fix:** Either wire aggregates to registerEvent (the notification backbone could ride it) or remove the 9 classes + platform.outbox_event table and the 2s scheduler.

### ⚫ DEAD (severity 3) — POST /v1/response/approvals/bulk-approve - real PMO bulk fast-track logic with per-id area scoping, no UI consumer

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/response/ResourceApprovalController.java:220 (engine.fastTrack loop, per-id findOr404 area guard). grep 'bulk-approve' frontend/src -> 0. approvals.component.ts has no checkbox/bulk selection (grep 'bulk|checkbox|selected' -> only unrelated hits); UI only calls /approvals, /my-requests, /{id}, /{id}/resubmit, /{id}/{action} (approvals.component.ts:211-256).

**Fix:** Add multi-select + bulk approve to the approvals queue UI, or drop the endpoint.

### ⚫ DEAD (severity 3) — POST /v1/response/approvals/{id}/update-source - approver source-redirect (warehouse/agency/procurement) with warehouse area guard, no UI consumer

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/response/ResourceApprovalController.java:193-217 (validates source, areaGuard.assertWarehouseVisible, updates allocated_resources). grep 'update-source' frontend/src -> 0; the approval drawer shows Source read-only (approvals.component.ts:156 '{{ d.warehouse_name ?? d.source_details }}').

**Fix:** Surface a 'redirect source' control in the approval drawer, or remove.

### ⚫ DEAD (severity 2) — GET /v1/response/communication/analytics - real alert analytics aggregates, zero consumers

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/response/CommunicationController.java:641. Live GET -> 200 {periods:{last_30d:9}, by_type:[warning:5...], by_severity:...}. grep 'communication/analytics' and '/analytics' in frontend -> only /v1/repository/analytics (sendai-analytics.component.ts:189).

**Fix:** Chart it in the Communication Center dashboard or delete.

### ⚫ DEAD (severity 2) — GET /v1/response/declarations/committees - statutory committee hierarchy reference data served, nothing consumes it

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/response/DeclarationController.java:212-217. Live GET -> 200 with NSCDM etc.; disaster_committees has 10 rows. grep 'committees' frontend/src -> 0 in HTTP context. Ties to the known committee-hierarchy structural gap (stakeholder-feedback item J).

**Fix:** Use it in the declaration form (committee assignment / s.35 donation chain) - the reference data and endpoint already exist.

### ⚫ DEAD (severity 2) — GET /v1/onehealth/directives/{id}/implementation-history - grouped-by-stakeholder history endpoint, never wired to the directive screen

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/onehealth/OneHealthDirectiveController.java:506-520 (real join over oh_directive_implementation_updates). grep 'implementation-history' frontend/src -> 0; directive-show.component.ts calls only /{id}, PUT /{id}, /escalate, /respond (:499-601).

**Fix:** Render the per-stakeholder implementation timeline in directive-show, or drop.

### ⚫ DEAD (severity 2) — GET /v1/onehealth/disseminations/recipients - recipients-preview lookup 'for the creation modal' that the modal never calls

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/onehealth/OneHealthDisseminationController.java:410-424 (comment says 'Recipients lookup for the creation modal'). grep 'disseminations/recipients' + '/recipients' frontend/src -> 0; event-show.component.ts:1286 posts disseminations directly without previewing recipients.

**Fix:** Wire a recipient-count preview into the dissemination modal (endpoint ready), or remove.

### ⚫ DEAD (severity 2) — GET /v1/portal/inform/signals - the public operational EO hazard-signals layer is served with rich real data but the public INFORM explorer never requests it

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/inform/web/PortalInformController.java:47-51. Live GET ?level=council -> 200 with per-council Drought signal 6.2, basket coverage, reliability, member scores. inform-explorer.component.ts calls only /portal/inform/structure, /stats, /risk, /risk/{code} (:596-682); grep 'portal/inform/signals' -> 0.

**Fix:** Add the signals map layer to the public explorer (the internal risk-index UI does consume the authenticated twin /v1/inform/signals).

### ⚫ DEAD (severity 2) — POST /v1/notifications/test/sms + /test/email (ChannelTestController) - real gateway test-fire endpoints, permission-gated, no UI consumer

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/notification/ChannelTestController.java:32,51 (real sms.sendBulk / mail send, hasAuthority('communication_and_alerts.send')). grep 'notifications/test' frontend/src -> 0. Referenced only by SecurityEnforcementTest. Confidence: medium that this is intentional curl-only ops tooling - but nothing in-product reaches it.

**Fix:** Either expose a 'send test message' button in Communication Center settings or document it as an ops-only endpoint.

### ⚫ DEAD (severity 2) — Tables recipient_groups + recipient_group_members (V22) - schema-only; audience resolution uses a hardcoded map instead

**Evidence:** 0 rows each (live count). Only reference to recipient_group_members anywhere is its CREATE TABLE (db/migration/V22__response_read_models.sql:309,318). CommunicationController never queries the recipient_groups TABLE - groupSummaries() iterates the hardcoded GROUP_ROLES map (CommunicationController.java:60-66,150-160) and 'recipient_groups' elsewhere in that file is the alerts JSON column (:209).

**Fix:** Drop both tables, or migrate GROUP_ROLES into recipient_groups to make audiences admin-editable.

### ⚫ DEAD (severity 2) — Table approval_level_definitions (V24) - dead twin of the live approval-workflow config tables

**Evidence:** 0 rows; only reference in the repo is CREATE TABLE (db/migration/V24__generalized_approval_workflow.sql:84); no Java/TS reference (grep ApprovalLevelDefinition|approval_level_definitions -> migrations only). The live admin screen uses approval_workflow_modules (1 row) + approval_workflow_configurations (ApprovalWorkflowConfigController.java:53-58).

**Fix:** Drop in a cleanup migration to stop schema drift confusion.

### ⚫ DEAD (severity 2) — Table oh_event_comments (V15) - One Health event comment thread designed in schema (with parent_id threading) but never ported to code

**Evidence:** 0 rows; references only in db/migration/V15__one_health_read_models.sql:327-333 and a V72 FK index; grep oh_event_comments|OhEventComment|EventComment across backend/src + frontend/src -> zero runtime hits. OneHealth event-show has no comment UI posting anywhere.

**Fix:** Port the comment thread (table is ready incl. threading) or drop the table.

### ⚫ DEAD (severity 1) — GET /v1/ew/scanner/stats - redundant duplicate of the stats block already embedded in the /detections payload the UI consumes

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/ew/scanner/ScannerController.java:131-132; the detections endpoint returns Map.of('detections', rows, 'stats', stats()) at :128 and disaster-scanner.component.ts:449 consumes that. Live GET /stats -> 200 {total:60,new:35,...}; grep 'scanner/stats' frontend/src -> 0.

**Fix:** Remove the standalone /stats handler.

### ⚫ DEAD (severity 1) — GET /v1/settings/translations/map - full EN/SW key map endpoint with no consumer (public uses /v1/portal/i18n, admin uses the paged list)

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/settings/TranslationController.java:75. Live GET -> 200 {lbl_about:{en,sw}...}. translations.component.ts calls only list/PUT/POST/DELETE on the base (:125-176); portal-i18n.ts hydrates from /v1/portal/i18n. grep 'translations/map' -> 0.

**Fix:** Delete, or repoint PortalLabels hydration at it if a single authoritative map is wanted.

### ⚫ DEAD (severity 1) — LocationDto record - referenced by nothing in main or test

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/common/web/LocationDto.java:6 (public record); class-name grep across backend/src (main+test) -> 0 external references (dead-class scan output).

**Fix:** Delete the file.

### 🔴 GAP (severity 3) — GET+POST /v1/notifications/preferences - self-service channel preferences (in-app/email/SMS + phone) fully implemented, no UI anywhere

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/notification/NotificationController.java:85-110. Live GET with admin token -> 200 {notify_in_app:true, notify_email:false, notify_sms:true...}. grep 'preferences' frontend/src -> 0 hits in any HTTP context. The rest of the bell IS wired: topbar.component.ts:153-185 calls /v1/notifications, /unread-count, /{id}/read, /read-all.

**Fix:** Add a small preferences popover to the topbar bell (backend contract already complete) - matches the Agent-2 backbone 'control plane' follow-on.

### 🔴 GAP (severity 3) — POST /v1/response/dispatch/allocations/{id}/agency-request - the 'agency' fulfilment channel writes a journal entry + flips status to Sourcing, but the dispatch console never offers it

**Evidence:** backend/src/main/java/tz/go/pmo/dmis/response/DispatchController.java:550-576 (real journal append, status='Sourcing', 'agency has been notified' message). grep 'agency-request' frontend/src -> 0; dispatch-console.component.ts only calls /sources, /dispatch, /procurement (:375-392). Note agency_resources table also has 0 rows in pg_stat and memory records it as deferred.

**Fix:** Either build the agency-sourcing tab in the dispatch console or remove the channel; today the endpoint's success message ('agency has been notified') also overstates - no notification is dispatched, only a journal entry.

### 🟡 PARTIAL (severity 1) — Standalone routes m/content-management/sms-management + email-management reachable only by typing the URL - components now live embedded in Communication Center

**Evidence:** app.routes.ts defines both; no routerLink/navigate/modules.ts nav entry composes them (route-vs-nav cross-check: not in modules.ts paths; Communication Center embeds them instead - communication-center.component.ts:119-121 '<page-sms-management [embedded]=true>'). Components themselves are alive and working.

**Fix:** Remove the leftover standalone routes or add redirects to communication-center.

### ❔ UNVERIFIED (severity 2) — Live-probe caveat: 'anonymous' 200s on /ew endpoints are the local-profile dev persona, not a production auth hole

**Evidence:** Anonymous GET /api/ew/stakeholders -> 200 with stakeholder PII and anonymous POST /api/ew/disseminate reached the method body (422 business validation, not 401) on the running stack. Cause: LocalSecurityConfig (@Profile('local'), LocalSecurityConfig.java:53-58) lets LocalAuthFilter authenticate tokenless requests as a full-role persona, satisfying @PreAuthorize. The !local chain (SecurityConfig.java:44 + SecurityPaths.java:33 'no EW path is publicly open') requires a bearer token. Production behavior not testable from this environment - flagging so the dead /ew endpoints are understood as dead-but-armed code, and as one more reason to delete them.

**Fix:** When removing the 5 dead /ew handlers, no prod security change is needed; if they are kept, re-verify the !local chain blocks them anonymously in a staging deploy.

### ✅ WORKING (severity 1) — Frontend dead-code hygiene: every component reachable, zero fake/dead buttons

**Evidence:** Unreferenced-file scan over all 170 non-spec TS files -> only app.component.ts flagged, which is imported by src/main.ts:3 (outside scan root). Dead-button greps: 0 empty (click) handlers, 0 href="#", 0 console.log-only handlers; every raw alert( is an error path after a real HTTP call (e.g. public-reports.component.ts:191). The 40 'unlinked' routes are reached via the data-driven sidebar (sidebar.component.ts:29 linkFor(m.slug,item.path) over core/modules.ts) plus in-page links (disaster-scanner.component.ts:436 agencyRoute; early-warnings/engine is a deliberate redirect at app.routes.ts:37).

### ✅ WORKING (severity 1) — No broken frontend-to-backend linkage: every /api URL the frontend calls has a live backend mapping

**Evidence:** Reverse scan of all frontend /api/* string+template literals against the 511 extracted mappings -> 12 initial mismatches, all resolved: /api/storage/** is served by PublicStorageConfig.java:22 addResourceHandler('/storage/**'), /api/v1/repository/analytics is a class-level @RequestMapping (SendaiAnalyticsController.java:18). Also: backend main has zero TODO/FIXME/not-implemented markers (grep; the only 'stub' strings are comments describing already-fixed sites, e.g. CommunicationController.java:65 'was a stub'). Budget & Finance is fully wired UI-to-API (budget-detail.component.ts:243-306 covers budgets/lines/commitments/virements; budget-finance.component.ts:288-372 thresholds/ndmf) - the memory note 'frontend not built' is outdated; budget_virements is empty of data, not dead.

## assignments/tasks/provisions + information & knowledge (DMIS response tasks, scanner entity taskings, knowledge repository, education pipeline, training plans, relief distributions)

> Task assignment is genuinely end-to-end (create→assign→track→complete with real activity log, dependency-unblock notices, live in-app notifications on assign, proper tasks.manage/tasks.view gating proven by 403/422 probes). Scanner entity-tasking round trip (V131) is real and exercised in DB, but the MoW flood console never renders the tasking inbox — a flood tasking sits 'awaiting', API-visible yet invisible in the entity's own UI. Knowledge repository works as a searchable metadata register but is shallower than it claims: no files/downloads (dead downloads_count column), no incident linkage, and its "feeds mitigation" loop is just a dashboard count. Training plans→funding-support link works and is live-proven (Partners role notified via the backbone), though it is one-way with no pledge tracking. Relief distributions record and confirm correctly and can link incidents, but are completely disconnected from warehouse stock (no inventory/stock_movements touch) and silently drop the damage-assessment/beneficiary-id/distributed-by columns. Education content pipeline spot-check passes (12 admin items = 12 public items).

### 🟡 PARTIAL (severity 4) — Scanner entity taskings round trip (V131) — entity-taskings.component.ts + ScannerController tasking endpoints

**Evidence:** Round trip is real code and exercised: awaiting→acknowledge→respond→EOCC accept/return (ScannerController.java:306-385, disaster-scanner.component.ts:86-87 Accept/Return wired, agency lockdown assertOwnAgency:70-77). DB: 12 taskings (10 awaiting/1 responded[gst]/1 returned[tma with review_note]); 1 row carries new urgency/source/instruction picker fields. Live GET ?agency=tma returns full context. BUT the MoW console never renders the inbox: route /m/preparedness/early-warnings/mow loads MowFloodComponent (app.routes.ts:41) which does NOT import EntityTaskingsComponent (grep confirms; only agency-event-console [gst/moa/moh/mlf/nemc] and ew-alert-map [tma] embed <dmis-entity-taskings>). Live: mow@pmo.go.tz GET entity-taskings?agency=mow returns tasking id 2 (flood, awaiting) — API-visible, UI-invisible; the dispatch notification links to that inbox-less page (consolePath, ScannerController.java:61-63). A flood tasking to the flood entity dies silently.

**Fix:** Embed <dmis-entity-taskings agency="mow"> in mow-flood.component.ts (same pattern as ew-alert-map.component.ts:85 for tma).

### 🟡 PARTIAL (severity 3) — Knowledge repository (recovery/knowledge-repository.component.ts + KnowledgeRepositoryController.java)

**Evidence:** Works as a searchable metadata register: live GET /v1/recovery/knowledge → 5 entries (all Approved), by_type breakdown; ?search=flood → 1 hit (ilike on title/description/hazard_type, KnowledgeRepositoryController.java:48-51); Pending→Approved endpoint real (:100-108); guarded (partner 403 via ModuleGuardFilter /v1/recovery→recovery.view; store/approve need recovery.manage). Gaps: (1) NO document storage — table has no file/path column, store() accepts none, so this 'library' holds only title+summary text; (2) downloads_count is a DEAD column — no download endpoint exists, all values 0; (3) NOT linked to incidents — no incident_id column and store() takes none; (4) 'closes the recovery loop / feeds mitigation' (class javadoc :24-26) is only a count tile: MitigationDashboardController.java:42 does select count(*); nothing else consumes the table (grep: only seeder + own controller); (5) fed only by RecoveryLocalSeeder + the manual form.

**Fix:** Add file upload/download (reuse frameworks storage pattern), an incident_id link, and hide or implement downloads_count.

### 🟡 PARTIAL (severity 3) — Relief distributions = provisions (recovery/relief-distributions.component.ts + ReliefDistributionController.java) — incident + warehouse linkage

**Evidence:** Record/confirm flow works live: GET /v1/recovery/relief-distributions → 6 rows, stats {6 confirmed, 8450 qty}; store validates qty>0, confirm flips Pending Verification→Confirmed (:118-126); guarded (partner 403). Incident link: schema + form have incident_id but it is optional and ALL 6 seeded rows show incident '—' (NULL). Warehouse stock: NOT linked — controller never touches inventory_items or stock_movements (grep: stock_movements only in DispatchController/WarehouseOpsController/StakeholderBidding/ResourceCatalogue), so recording a distribution deducts nothing anywhere; resource_id points at the national resource catalogue (public.resources — no stock columns), not a warehouse. Silently dropped columns: relief_distributions has damage_assessment_id, beneficiary_identifier, distributed_by_user_id but store() (:103-114) never writes them — the class javadoc's 'traceable to the incident/assessment' is only half true. Also stats/by_resource aggregates skip the area scope the list applies (:74-87), and nothing downstream consumes the table (grep: seeder + own controller only).

**Fix:** Bridge to the response ledger (write a stock_movement / consume a dispatched allocation), populate damage_assessment_id + distributed_by_user_id, scope the aggregates.

### 🟡 PARTIAL (severity 2) — Task assignee picker quality

**Evidence:** TaskController.java:167-169: form-data returns ALL 107 users as assignable — code comment admits 'Source filters User::where(is_active)... the local users read model has no such column yet — every local account is assignable'. Picker is also not area- or role-filtered, so a district officer can assign a task to any account nationwide (incl. partner/agency logins). Board also caps at 200 rows with no paging (TaskController.java:90, stats say 393) and ~285/583 incident_tasks rows have NULL incident_id (activation-generated), which always pass the shared-or-own area filter.

**Fix:** Filter form-data users by is_active + jurisdiction/role; add paging or raise limit with server-side paging.

### 🟡 PARTIAL (severity 2) — Relief distributions 'Confirm receipt' UI silent failure

**Evidence:** relief-distributions.component.ts:172-174 and knowledge-repository.component.ts:167: confirm()/approve() subscribe with next-only handlers — if backend returns 403 (user has recovery.view but not recovery.manage, e.g. DAS/ICT Admin who hold view-only per role_has_permissions) the click does nothing with no error message; list silently stays unchanged.

**Fix:** Add error callbacks surfacing e.error.detail like save() already does.

### ✅ WORKING (severity 2) — Training plans → funding-support link (preparedness/training-plans.component.ts + TrainingPlanService.requestSupport)

**Evidence:** Live: GET /v1/training-plans → 7 plans; 2 have supportRequested=true. requestSupport (TrainingPlanService.java:160-176) stamps support_requested_at and notifies role 'Partners' via NotificationService.notifyRoles (real Spatie-role fan-out, NotificationService.java:69-75). DB proof: 2 resource_notifications type training_support_request delivered to partner@pmo.go.tz; Partners role exists with 5 users; UI gates the button to unfunded plans (training-plans.component.ts:92) and shows a 'Support requested' chip (:75). Sibling links also proven: publish→portal_news (plan 1→news 12, category event, active) and push-priority→mitigation_measures (2 plans linked). Caveat (severity driver): the link is one-way — no pledge/response record, sourceOfFund stays NULL until hand-edited, and trainings are not area-scoped (known).

**Fix:** Add a partner pledge/response record that closes the loop into source_of_fund.

### ✅ WORKING (severity 1) — Response task assignment chain (frontend/src/app/pages/response/tasks.component.ts + backend response/TaskController.java)

**Evidence:** Live: GET /api/v1/response/tasks → 393 tasks, stats {pending 200, in_progress 1, completed 192, overdue 6, completion 48.9%}; detail /tasks/768 shows 4 activity-log rows (reassign + 3 status transitions); calendar → 12 events; form-data → 4 active incidents/107 users. DB: task_updates=10, task_dependencies=1, resource_notifications type task_assigned=25 and task_ready=5 (dependency-unblock notices, TaskController.java:335-355). Assign/notify path TaskController.java:327-332 uses NotificationService.notifyUser (the ONE dispatcher). Area scoping via JurisdictionScope on board/stats/calendar/create/detail (TaskController.java:78,96,190,364).

### ✅ WORKING (severity 1) — Task assignment authorization — who can assign

**Evidence:** POST /v1/response/tasks, /{id}/assign, /{id}/status all @PreAuthorize('tasks.manage') (TaskController.java:181,267,284); ModuleGuardFilter.java:67 maps /v1/response/tasks→tasks.view. Live probe: partner (redcross@partner.tz) GET → 403 {required: tasks.view}; partner POST {} → 403 before validation; admin POST {} → 422 'incident_id field is required' (gate ordering proven, no record created). DB: tasks.manage held by Asst. Director, DAS, DED, Director, Dist DC, EOCC, ICT Admin, RAS, Reg DC, Secretary, Super Admin (role_has_permissions).

### ✅ WORKING (severity 1) — Education/content pipeline internal→portal (content/educational-content + education-materials, spot check)

**Evidence:** Live: admin GET /v1/content/education (EducationalContentAdminController.java:30) → 12 items (bilingual titles e.g. 'Kuelewa Fahirisi ya Hatari ya INFORM…'); public GET /v1/portal/education → same 12 contents; admin /v1/content/education-materials → per-hazard counts (Accident 6, Building Collapse 6, Drought 7…). Matches prior full verification (12 hazard hubs + Guides via CMS API).

## portal ↔ system linkage integrity (DMIS/e-MAAFA public portal)

> The portal↔system wiring is overwhelmingly genuine: incident push-to-map/news and the /incident/:id live snapshot, EOCC bulletin publish→map with per-district blink points and served PDFs, landing counters, subscribe persistence, and education/publications feeds all live-verify against DB truth exactly. Three real defects: (1) an active News & Events article links citizens to a 404 dead snapshot because push-news articles are not coupled to un-pinning/resolution; (2) the citizen PHR reference code is a display-once token — no lookup endpoint, no tracking page, no SMS/email on submission or conversion, so the code is unusable; (3) partner registration→verification is real (live SMS/email evidence) but there is no path from "verified" to a login without an admin manually creating and linking a user account. Additionally, subscriber channel/priority/language preferences are captured but never honored at send time, all alert delivery is operator-triggered (no auto-dispatch on warning activation), and PHR codes are generated with the known count(*)+1 pattern without a unique index.

### 🔴 GAP (severity 3) — Citizen PHR reference-code tracking

**Evidence:** The code is issued and displayed exactly once on the wizard success screen (PortalPublicService.java:283 returns reportCode; landing.component.html:484 renders it) and is never usable again: no public lookup endpoint exists (PortalPublicController.java:33-175 has no report-status route; the only report_code query is the OFFICER-side list filter, PublicReportsController.java:58), no frontend route (app.routes.ts public children :12-31 contain no track/status page), and the reporter is never notified — submitHazardReport sends no SMS/email with the code, and conversion/dismissal in PublicReportsController touches reporter_phone only as a display column (:69). A citizen who loses the screen has nothing; one who keeps the code can do nothing with it.

**Fix:** Add GET /v1/portal/report-status/{code} returning public-safe status (received/under review/converted→linked incident if published/dismissed) + a small 'Track my report' box on the landing wizard; optionally SMS the code on submission (reporter_phone already validated).

### 🟡 PARTIAL (severity 3) — Active news article links citizens to a dead incident snapshot (news↔snapshot decoupled)

**Evidence:** push-news hardcodes '<a href="/incident/{id}">View the live incident status…' into the article body (IncidentController.java:584), but the snapshot 404s once the incident is unpinned: article id 13 (slug market-fire-kariakoo-trading-area-2) is is_active=true and appears in landing latestNews, its body links /incident/2, yet incident 2 has show_on_portal_map=f (status Resolved) → GET /api/v1/portal/incidents/2 = 404 (observed). Nothing couples resolve/unpin to remove-news or strips the link; citizen lands on the notFound screen (incident-snapshot.component.ts:149,157).

**Fix:** On unpin/close either deactivate the linked article (reuse removeNews) or rewrite the body link to a static summary; alternatively let incidentSnapshot serve a final read-only state for incidents that WERE published (e.g. keep serving when portal_news_id is set and article active).

### 🟡 PARTIAL (severity 3) — Register-partner → approval → login round-trip

**Evidence:** Register: POST /v1/portal/register-stakeholder → stakeholders row is_verified=false + REAL confirmation SMS/email (PortalPublicService.java:478-518; sms_logs partner_register 'sent' 2026-06-30; pending rows 33-37 in stakeholders). Approve: PUT /v1/stakeholders/{id}/verify sets is_verified + congrats via the shared delivery path (StakeholderAdminController.java:127-157; sms_logs/email_logs stakeholder_verified 4+4 rows, 2026-06-20). Login: verification creates NO user account — PUT /{id}/link-user (:163-184) only links an EXISTING users row, so an admin must separately create the login in User Management first. Seeded linked partners do work: redcross@partner.tz login → 200, users.stakeholder_id=29 (psql). The 5 publicly-registered pending partners have no login path surfaced anywhere in the flow; the link-user UI exists only inside the admin stakeholders page (stakeholders.component.ts).

**Fix:** On verify, offer 'create login' (provision users row with set-password email) or extend link-user to create-and-link; otherwise the advertised partner self-service (Open Needs donations) is unreachable for organically registered partners.

### 🟡 PARTIAL (severity 2) — Public subscribe → alert delivery chain

**Evidence:** Subscribe live-proven: POST /api/v1/portal/subscribe → {subscriptionId:SUB-2026-0007} and row persisted (psql: SUB-2026-0007|Audit Test Subscriber|0712000111|t); PortalPublicService.java:331-354. Delivery consumers are real: AudienceService.java:50-58 (all_subscribers/subscribers_by_hazard JSONB match), :118-139 (resolveAreas matches subscriber_location text — the column subscribe actually writes), wired into Communication Center compose and EW disseminate (EwProductController.java:241-334, defaults to area+hazard+coordinators). Live send evidence in logs: sms_logs ew_dissemination 13 'sent' (2026-06-19), alert 4 incl. 255712000111 (2026-06-20), email_logs alert 20 + ew_dissemination 3. Gaps: (a) NO automatic dispatch when a warning activates — every send is operator-initiated; (b) communication_channels, alert_level_priority and languages are captured but never consulted at send time (grep across backend: only insert/update/display references — no send-path filter).

**Fix:** Honor channel prefs in AudienceService.collect (skip phone when channels excludes sms, etc.); consider an optional auto-disseminate hook on warning publish filtered by alert_level_priority.

### 🟡 PARTIAL (severity 2) — PHR report_code generation: count(*)+1 with no unique index

**Evidence:** PortalPublicService.java:270-271 builds PHR-YYYY-NNNNN from select count(*)+1; pg_indexes on public_hazard_reports shows NO unique index on report_code (only pkey + 3 non-unique). Two concurrent submissions, or any future row deletion, silently mints duplicate citizen reference codes — the known DMIS count(*)+1 recurring pattern. Currently 0 duplicates in 17 rows (psql group-by check). alert_subscriptions.subscription_id uses the same pattern but IS protected by a unique index (alert_subscriptions_subscription_id_key), so a race there errors instead of duplicating.

**Fix:** Unique index on report_code + generate from a sequence (or retry-on-conflict), matching the fix pattern used elsewhere.

### ✅ WORKING (severity 1) — Incident push→portal map→/incident/:id live snapshot

**Evidence:** Code: IncidentController.java:519-563 (push-map: drill hard-block :530, draft override :538-546, centroid fallback :549-558), PortalPublicService.java:77-87 (landing shows ONLY show_on_portal_map=true, active, non-simulation), :198-234 (snapshot gated to show_on_portal_map + public-safe columns + resources/updates/escalation). Live: landing incidents=3 == psql count(3) for pinned+active; GET /api/v1/portal/incidents/83 → 200 (escalation:1, no reporter PII fields); unpinned id 91 → 404; id 999999 → 404; admin GET /v1/response/incidents/83 → show_on_portal_map:true, pushed_to_map_at 2026-07-01. Frontend markers gate the 'View live status' link on pinnedToMap (public-portal.component.ts:432).

### ✅ WORKING (severity 1) — Incident push-news → News & Events publication

**Evidence:** Code: IncidentController.java:569-611 (idempotent: updates existing portal_news_id :586-591, reactivates by slug on re-push :596-602), remove-news deactivates+unlinks :615-626. Live: GET /api/v1/portal/news/market-fire-kariakoo-trading-area-2 → 200 with article+3 related; portal_news rows carry incident-suffixed slugs (mining-accident-shinyanga-32, building-collapse-kariakoo-trading-area-31); incidents 2/3/82/83 carry pushed_to_map_at/pushed_to_news_at timestamps proving the endpoints were exercised.

### ✅ WORKING (severity 1) — EOCC Bulletin publish→portal map (PMO-explicit) + bulletin PDFs

**Evidence:** Code: EwProductController.java:178-227 (PATCH /{id}/publish sets is_published+show_on_map, unpublish clears; also mirrors to disaster_risk_frameworks 'Bulletin' rows :206-214), PortalPublicService.java:92-109 (landing bulletins query + area_points JSON parsed to objects). Live: landing bulletins=2 == psql count(2) of is_published+show_on_map rows (ids 86,89); areaPoints parsed to 43 and 27 district points; both PDFs serve publicly: /api/storage/ew-products/6e398dd9….pdf → 200 application/pdf 330013 bytes, b30f0e92….pdf → 200 323735 bytes. Warning-level map push also real (EwWarningLifecycleController.java:79-91); currently 0 of 10 active early_warnings pushed — landing warnings=0 matches SQL 0, consistent with the PMO-explicit-push doctrine.

### ✅ WORKING (severity 1) — Portal live-monitoring counters vs DB truth

**Evidence:** Every live number matches a SELECT: incidents 3=3, warnings 0=0, bulletins 2=2, stakeholderCount 27 = count(*) stakeholders 27, publicationCounts {Other:5,Act:3,Bulletin:1,Policies:4,'DRR Guidelines':6,'Plans and Strategies':20} sums to 39 = count(*) disaster_risk_frameworks 39; hero stats (emergency/warning/watch/peopleAtRisk) are computed from the same warnings result set (PortalPublicService.java:66-71), not stored numbers. The animated '190' hotline / '24/7' / '6·31·61M+' figures are CMS-editorial portal_settings values (landing.component.html:50-52,388-396; psql portal_settings stats.*) — institutional constants, not fake live metrics.

### ✅ WORKING (severity 1) — Public unsubscribe two-step (code → confirm)

**Evidence:** PortalPublicService.java:362-420: SHA-256-hashed one-time code, 15-min expiry, 5-attempt cap, deactivation only after confirm; send over the contact's own channel with failures swallowed to avoid subscription-existence leaks (:437-450). Live evidence it fires: email_logs alert_unsubscribe = 147 rows (latest 2026-06-24); alert_unsubscribe SMS rows also present. Not re-driven end-to-end in this audit (would dispatch real messages).

### ✅ WORKING (severity 1) — Education and publications public feeds

**Evidence:** Live: GET /api/v1/portal/education → 200, 12 contents == psql count of educational_contents is_published=true (12), bilingual fields present in /education/1 detail (titleSw/fullContentSw); GET /api/v1/portal/publications?type=Act → 3 rows with language codes; sample PDF /api/storage/frameworks/disaster_management_regulations_2022_sw.pdf → 200 application/pdf 222442 bytes; landing latestPublications=6 and publicationCounts by type sum to the 39-row table. Query code: PortalPublicService.java:179-188 (publications), :546-551 (education, is_published filter). Bulletin-publish feeds Publications too (EwProductController.java:206-214 → 'Bulletin':1 in live counts). Ancillary public feeds also live: /portal/shelters, /portal/threats, /portal/hazard-calendar all 200.
