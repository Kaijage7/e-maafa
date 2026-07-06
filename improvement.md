# e-MAAFA / DMIS — Improvement Plan & Progress Ledger

> Living document. Source of truth for the honest full-system audit (`DMIS-LINKAGE-AUDIT.md`, 154 findings) and the fix campaign that follows it (`DMIS-AUDIT-FIX-LOG.md`). Last updated 2026-07-06.

## 1. How to read this

The audit graded every subsystem live (real API + SQL evidence, then an adversarial re-check of every serious accusation). Verdicts: **✅ WORKING** (verified) · **🟡 PARTIAL** (works, stated gaps) · **🔴 GAP** (designed, missing) · **🚨 FAKE** (pretends to work) · **⚫ DEAD** (unreachable/unused). Of 154 findings, **63 were already WORKING**; this plan tracks the **91 non-WORKING items** (plus **F92**, found during the Wave-2 adversarial re-check → 92 tracked) to closure — each fixed item carries live verification evidence, not a claim.

**Backlog health (2026-07-06, after Wave 3 + the RBAC trim):** 94 tracked (91 audit + F92/F93/F94 found during the campaign) — **24 resolved · 70 open** (🟡PARTIAL 33 · ⚫DEAD 18 · 🔴GAP 18 · ❔UNVERIFIED 1).

| Status | Count |
|---|---|
| ✅ Fixed & live-verified (Wave 1, committed `924b08e`) | 7 |
| ✅ Fixed, live-verified + adversarially re-checked (Wave 2, committed `2abb5a5`) | 6 |
| ✅ Fixed & live-verified + independent re-probes (Wave 3, committed `b7093f5`): F05, F12, F24, F35, F70, F87, F88, F89, F91 (already fixed, closed), F92 | 10 |
| ✅ Fixed & live-verified — F94 area-role least privilege (committed `55b2a45`, user-driven) | 1 |
| ⬜ Remaining — P1 (severity 4): F06 scenario library/MSEL | 1 |
| ⬜ Remaining — P2 (severity 3, incl. new F93) | 29 |
| ⬜ Remaining — P3 (severity 1–2) | 40 |

## 2. Major capability delivered before/around the audit (context)

These are the large pieces built in the sessions leading into this campaign — the foundation the fixes build on:

- **Public report → area triage → incident chain** — A citizen reports with Region→District pickers; the report routes to **that area's** triage queue only (strict cross-area isolation verified across regions); an officer converts it to an incident that enters the approval ladder. Commit `2bf48ab`.

- **Settings-driven approval automation** — Each ladder tier (DDMC→DED→RDMC→RAS→EOCC→Director→PS) is Manual / Auto-advance / Skip-if-unstaffed, controlled from System Settings. Unstaffed tiers auto-skip so an incident never stalls in a region without that coordinator — proven: a Tanga report settled to RAS, skipping the empty DED/RDMC. Commits `2bf48ab`, V133/V134.

- **Live Incident Map — jurisdiction focus** — District officers see their district, region officers their region, national sees all — on the official Tanzania GIS base (unified from the mismatched map). Commit `a7fa13f`.

- **System-wide UI overhaul** — Bigger standard fonts (public floor 0.8rem), full-width `min(1560px,94vw)` layouts, flat professional register, advanced portal/map popovers, all third-party assets vendored (zero CDN). Commit `de8cf37`.

- **Stakeholder Portal read-only alerts** — Partners see issued alerts/warnings, not the EW authoring console. Commit `0a05d59`.

## 3. ✅ Done & live-verified — Wave 1 (P0), committed `924b08e`

Seven highest-severity defects, each verified against the running stack before commit:

| # | Item | Verification |
|---|---|---|
| F01 | ⚫ 5 EW boundary endpoints whose only consumers (Streamlit dashboards) were retired: GET /ew/ | all 5 → 404, kept monitoring-report round-trip still works |
| F02 | 🔴 No product surface sets users.region_id / district_id / stakeholder_id — area officers can | API-created RAS(Mwanza) saw exactly its region's 1 incident; cross-region district rejected 400 |
| F07 | 🟡 Admin user creation + role assignment (Settings → User Management) | modal now has role-driven Region/District/Agency/Partner pickers + Area column; canSave blocks area roles without attachment. |
| F08 | 🟡 Two stakeholder-link columns, only one maintained: link-user sets stakeholders.user_id but | relink moved both columns, unlink cleared both |
| F09 | 🟡 Rollback into an unstaffed auto-skipped tier strands the incident (no settle, no resubmit  | #91 rejected (nothing staffed below), #34 rolled past RDMC to DED with stamped history; forward settle unchanged |
| F14 | 🚨 Preparedness Warehouses registry 'Stocks' column always 0 | API == psql (6315/2500/899/450/110/32) |
| F21 | 🔴 Dist DC holds incidents.publish → district officer can push incidents to the citizen porta | dc→403 on all three, EOCC passes gate |

## 4. ✅ Done, live-verified + adversarially re-checked — Wave 2 (P1), committed `2abb5a5`

Six items, each verified live AND independently re-checked by a second skeptic agent instructed to refute the pass (all four verdicts **CONFIRMED**) before commit:

| # | Item | Verification (observed, 2026-07-06) |
|---|---|---|
| F03 | 🔴 Per-incident 'was this forecast?' — no surface on the incident record | `forecast` block (6 keys) on every incident show; incident 82 in SQL-proven area+time overlap with EW-2026-00050 → covered:false (hazard guard fired); controlled Floods incident in warned district 1964 → covered:true, EW-2026-00050, lead 33h exact; same-region other district NOT claimed; both badge variants screenshotted |
| F04 | 🔴 COST-USED per disaster: three disconnected mechanisms, TZS 0 for all events | create 1,234,567 → update 7,654,321 → blank-leaves-unchanged all held; linked incident 2's commitments == independent SQL sum; in-kind arm proven non-zero (109,715,000 / 15 allocations == SQL); CSV carries the real figure |
| F10 | 🟡 EW report counted one warning per district row (~6x inflation) | warnings_issued 53 → **8** == SQL count(distinct warning_id); EW-2026-00050 exactly one Dodoma row listing its 7 districts; summary identity holds; RAS-scoped view consistent |
| F11 | 🟡 Hazard NOT used in warned→incident matching (cross-hazard false positives) | Fire/Drought incident 82 demoted to different_hazard bucket; Drought warning no longer claims Windstorm/Cholera; NULL-hazard incident still counts (never blocks); warned_incident 9 → 1 genuine |
| F13 | 🟡 MoW console never rendered the taskings inbox | awaiting flood tasking visible at /m/preparedness/early-warnings/mow as mow@pmo.go.tz (screenshot == API); Acknowledge round-trip worked and was precisely reverted; TMA console regression clean |
| F16 | ⚫ gov_response_tzs: no fill path, exported always-0 | value round-trips create→show→list→CSV; blank update leaves column unchanged; non-numeric → 400 readable (not a SQL 500) |

## 5. ⬜ Remaining — P1 (severity 4, do next)

### Incident Command Post + Virtual Simulations
- **F05** 🔴 — No ICS organization structure: no incident commander, no section chiefs, no per-activation org chart or named command roles
  - *Fix:* M: add activation_command_roles table (activation_id, role e.g. IC/Ops/Planning/Logistics/Finance/PIO/Safety, user_id, appointed_at, journal on appoint/relieve), an org-chart panel on the board, and appointment events in
- **F06** 🔴 — Simulation at scale is single-incident only: no scenario library, no exercise templates/MSEL, no multi-incident composite exercises, no participants roster, no time compression
  - *Fix:* L: add exercise_scenarios (title, hazard, regions, objectives) + scenario_events (MSEL: offset_minutes, inject payload, target DRF, expected_action) tables; a launcher that spawns N drill-clone incidents/activations via 
- **F12** 🟡 — Per-incident action tracing today = three DISCONNECTED trails, no unified operations log (the user's 'traced well virtually' is only partially met)
  - *Fix:* M: build a read-side union timeline endpoint per incident (task_activity_log + incident_workflow_histories + allocated_resources source_details journal + sms/email logs + warehouse ledger, all filtered by incident_id) an

## 6. ⬜ Remaining — P2 (severity 3)

### Dead code + unproductive endpoints hunt
- **F18** ⚫ — Entire domain-event/outbox pipeline is dead machinery: AggregateRoot, DomainEvent, DomainEventLogger, OutboxAppender, OutboxDispatcher, OutboxEnvelope, OutboxEvent, OutboxEventRepository, OutboxRelay
  - *Fix:* Either wire aggregates to registerEvent (the notification backbone could ride it) or remove the 9 classes + platform.outbox_event table and the 2s scheduler.
- **F19** ⚫ — POST /v1/response/approvals/bulk-approve - real PMO bulk fast-track logic with per-id area scoping, no UI consumer
  - *Fix:* Add multi-select + bulk approve to the approvals queue UI, or drop the endpoint.
- **F20** ⚫ — POST /v1/response/approvals/{id}/update-source - approver source-redirect (warehouse/agency/procurement) with warehouse area guard, no UI consumer
  - *Fix:* Surface a 'redirect source' control in the approval drawer, or remove.
- **F32** 🔴 — GET+POST /v1/notifications/preferences - self-service channel preferences (in-app/email/SMS + phone) fully implemented, no UI anywhere
  - *Fix:* Add a small preferences popover to the topbar bell (backend contract already complete) - matches the Agent-2 backbone 'control plane' follow-on.
- **F33** 🔴 — POST /v1/response/dispatch/allocations/{id}/agency-request - the 'agency' fulfilment channel writes a journal entry + flips status to Sourcing, but the dispatch console never offers it
  - *Fix:* Either build the agency-sourcing tab in the dispatch console or remove the channel; today the endpoint's success message ('agency has been notified') also overstates - no notification is dispatched, only a journal entry.

### Incident lifecycle depth
- **F23** 🔴 — Officer pending queue on DED/RAS landing (what is reported to them / what they reported)
  - *Fix:* Add a 'Needs your action' card on the response dashboard: incidents where workflow_status = the caller's stage in their area, plus a 'submitted by me' tab.
- **F24** 🔴 — Citizen-report-converted incidents have NULL region_name/district_name — blank area columns, '(null)' in officer notifications, broken centroid fallback
  - *Fix:* In the conversion INSERT, also select the names from regions/districts by the ids already in hand.
- **F35** 🟡 — Response dashboard stat cards are national while the feeds beside them are area-scoped
  - *Fix:* Apply incidentScope() to the statistics block (or label the cards 'National').
- **F36** 🟡 — Operational status track vs workflow status — dual axes visible but unreconciled
  - *Fix:* Define reconciliation rules (e.g. op-Close freezes the ladder; approval of a Resolved incident warns) and reflect the caller's permissions in the op buttons.

### Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- **F17** ⚫ — One Health dissemination acknowledge endpoint (stakeholder ack round-trip)
  - *Fix:* Resolve the caller's stakeholder via users.agency/stakeholder link (V95) and record the ack, or remove the endpoint.
- **F28** 🔴 — EW → subscribers on publish (alert_subscriptions auto SMS/email when a warning is published)
  - *Fix:* Wire publish() afterCommit to AudienceService.resolve('subscribers_by_hazard') + resolveAreas for the warned districts, reusing the existing disseminate machinery.
- **F42** 🟡 — Scanner detection → entity tasking round-trip (V131: dispatch→acknowledge→respond→EOCC review/return)
  - *Fix:* Target notifyUsers to the entity's users (users.agency_id) + EOCC role instead of notifyAllUsers; consider email eligibility for Immediate-urgency taskings.
- **F92** 🟡 — *(new, found by the Wave-2 F13 adversarial re-check)* GET /v1/ew/scanner/entity-taskings is not agency-scoped for READS — any authenticated agency user can read other agencies' taskings (mutations ARE guarded by assertOwnAgency); live-proven: mow read agency=tma taskings 200
  - *Fix:* Apply assertOwnAgency (with an EOCC/national bypass) to the GET handler, mirroring the mutation guards.

### EW ↔ incident linkage
- **F26** 🔴 — Public portal map: warnings + incidents + bulletins co-plotted but NO linkage indicator
  - *Fix:* Cheapest: in initMap(), reuse buildAlertFills()'s bestRegion/bestDistrict maps — key each incident by norm(region)+'|'+normDist(district) and add an 'Inside warned area (severity)' row to the popup; proper: backend adds 
- **F38** 🟡 — Warned-area match is region-granularity only — wh.district_id fetched but never used
  - *Fix:* When wh.district_id is not null, require i.district_id = wh.district_id (fall back to region match when the warning is region-wide); expose an 'in_warned_district' boolean per matched incident.
- **F39** 🟡 — Anticipatory (forecast) activation lifecycle — real, but NOT wired to issued warnings
  - *Fix:* Add a warning picker to the forecast form (prefill hazard_description/affected_areas/expected_impact from the selected warnings/early_warnings row) and persist response_activations.warning_id; add an 'Open anticipatory p

### Incident Command Post + Virtual Simulations
- **F29** 🔴 — No real-time tracing anywhere: zero SSE/WebSocket in the entire codebase; board data refreshes only on user action
  - *Fix:* S-M: add a 20-30s polling interval on the open board (trivial, matches existing architecture) or an SSE endpoint streaming task_activity_log rows for the activation; @EnableScheduling is already on for the backend side.
- **F30** 🔴 — No resource/logistics picture on the Command Post board — commander cannot see the incident's allocations, dispatches or stock state from the ICP
  - *Fix:* S-M: fold a per-incident allocation/dispatch summary block into board() (one query over allocated_resources where incident_id = activation.incident_id) with a deep link to the dispatch console filtered by that incident (
- **F31** 🔴 — No operational periods / Incident Action Plan cadence at the Command Post (Situation Reports exist but only ad-hoc on the incident page)
  - *Fix:* S to surface the incident's history_reports on the board; L for real operational periods (activation_periods table with objectives, period-scoped task rollups, period handover journal entries feeding the AAR).

### portal ↔ system linkage integrity
- **F34** 🔴 — Citizen PHR reference-code tracking
  - *Fix:* Add GET /v1/portal/report-status/{code} returning public-safe status (received/under review/converted→linked incident if published/dismissed) + a small 'Track my report' box on the landing wizard; optionally SMS the code
- **F45** 🟡 — Active news article links citizens to a dead incident snapshot (news↔snapshot decoupled)
  - *Fix:* On unpin/close either deactivate the linked article (reuse removeNews) or rewrite the body link to a static summary; alternatively let incidentSnapshot serve a final read-only state for incidents that WERE published (e.g
- **F46** 🟡 — Register-partner → approval → login round-trip
  - *Fix:* On verify, offer 'create login' (provision users row with set-password email) or extend link-user to create-and-link; otherwise the advertised partner self-service (Open Needs donations) is unreachable for organically re

### notifications + email/SMS coverage
- **F15** ⚫ — Backbone SMS channel + per-user notify_sms preference — never exercised by any event
  - *Fix:* Either mark critical notices SMS-eligible (e.g. Critical-severity incident stages, EW publish) and seed officer phone numbers, or delete the dead per-user SMS branch and preference toggle so the settings UI stops promisi
- **F27** 🔴 — Silent events: disaster declarations, CP/AAP activation, assessments, support pledges accept/decline, budget/finance, recovery/relief, content publication — no notification at all
  - *Fix:* Wire notifyStage-style calls into declaration approval, ActivationService, pledge review, and budget-tier approvals; or correct the two javadoc claims so the dispatcher's contract matches reality.

### Warehouse management
- **F25** 🔴 — Allocation 'Returned' discards deducted stock — no re-intake, no movement
  - *Fix:* On Returned, re-intake to the originating store (dispatch_approvals.source_id / journal source_id) via DispatchSupportService.addStock + a 'Return' stock_movements row, or force the operator to pick a receiving store.
- **F37** 🟡 — Emergency Supplies (preparedness) edits ledger with no journal — unaudited drift side-door
  - *Fix:* Route Emergency Supplies quantity changes through an Adjustment movement (like stock-taking does), or make quantity read-only there and point users at warehouse-ops intake/remove.

### Disaster Repository + Reports & Analytics
- **F40** 🟡 — Repository feeding model: MANUAL EOCC entry + seeders; NOT auto-fed by resolved incidents/warnings
  - *Fix:* Add a nudge at incident-close (offer 'record in Disaster Repository' with pre-linked incident) or a periodic EOCC worklist of resolved incidents with no repository card; the 3-links reality means the designed operational
- **F41** 🟡 — Repository data quality: seeded pseudo-regions + near-empty loss figures distort analytics
  - *Fix:* Re-seed national-scope effects distributed to real regions or exclude pseudo-regions from regionRanking/insights; unify 'Flood'/'Floods'.

### assignments/tasks/provisions + information & knowledge
- **F43** 🟡 — Knowledge repository (recovery/knowledge-repository.component.ts + KnowledgeRepositoryController.java)
  - *Fix:* Add file upload/download (reuse frameworks storage pattern), an incident_id link, and hide or implement downloads_count.
- **F44** 🟡 — Relief distributions = provisions (recovery/relief-distributions.component.ts + ReliefDistributionController.java) — incident + warehouse linkage
  - *Fix:* Bridge to the response ledger (write a stock_movement / consume a dispatched allocation), populate damage_assessment_id + distributed_by_user_id, scope the aggregates.

### User roles & registration
- **F22** 🔴 — Partner approval does NOT create a login — a working partner login requires two undocumented manual admin steps
  - *Fix:* On verify (or a 'create login' action beside it), optionally mint a Partners-role user from the stakeholder's email, set BOTH link columns, and send credentials/reset link.

## 7. ⬜ Remaining — P3 (severity 2, polish/cleanup)

### Dead code + unproductive endpoints hunt
- **F50** ⚫ — GET /v1/response/communication/analytics - real alert analytics aggregates, zero consumers
  - *Fix:* Chart it in the Communication Center dashboard or delete.
- **F51** ⚫ — GET /v1/response/declarations/committees - statutory committee hierarchy reference data served, nothing consumes it
  - *Fix:* Use it in the declaration form (committee assignment / s.35 donation chain) - the reference data and endpoint already exist.
- **F52** ⚫ — GET /v1/onehealth/directives/{id}/implementation-history - grouped-by-stakeholder history endpoint, never wired to the directive screen
  - *Fix:* Render the per-stakeholder implementation timeline in directive-show, or drop.
- **F53** ⚫ — GET /v1/onehealth/disseminations/recipients - recipients-preview lookup 'for the creation modal' that the modal never calls
  - *Fix:* Wire a recipient-count preview into the dissemination modal (endpoint ready), or remove.
- **F54** ⚫ — GET /v1/portal/inform/signals - the public operational EO hazard-signals layer is served with rich real data but the public INFORM explorer never requests it
  - *Fix:* Add the signals map layer to the public explorer (the internal risk-index UI does consume the authenticated twin /v1/inform/signals).
- **F55** ⚫ — POST /v1/notifications/test/sms + /test/email (ChannelTestController) - real gateway test-fire endpoints, permission-gated, no UI consumer
  - *Fix:* Either expose a 'send test message' button in Communication Center settings or document it as an ops-only endpoint.
- **F56** ⚫ — Tables recipient_groups + recipient_group_members (V22) - schema-only; audience resolution uses a hardcoded map instead
  - *Fix:* Drop both tables, or migrate GROUP_ROLES into recipient_groups to make audiences admin-editable.
- **F57** ⚫ — Table approval_level_definitions (V24) - dead twin of the live approval-workflow config tables
  - *Fix:* Drop in a cleanup migration to stop schema drift confusion.
- **F58** ⚫ — Table oh_event_comments (V15) - One Health event comment thread designed in schema (with parent_id threading) but never ported to code
  - *Fix:* Port the comment thread (table is ready incl. threading) or drop the table.
- **F85** ❔ — Live-probe caveat: 'anonymous' 200s on /ew endpoints are the local-profile dev persona, not a production auth hole
  - *Fix:* When removing the 5 dead /ew handlers, no prod security change is needed; if they are kept, re-verify the !local chain blocks them anonymously in a staging deploy.
- **F87** ⚫ — GET /v1/ew/scanner/stats - redundant duplicate of the stats block already embedded in the /detections payload the UI consumes
  - *Fix:* Remove the standalone /stats handler.
- **F88** ⚫ — GET /v1/settings/translations/map - full EN/SW key map endpoint with no consumer (public uses /v1/portal/i18n, admin uses the paged list)
  - *Fix:* Delete, or repoint PortalLabels hydration at it if a single authoritative map is wanted.
- **F89** ⚫ — LocationDto record - referenced by nothing in main or test
  - *Fix:* Delete the file.
- **F91** 🟡 — Standalone routes m/content-management/sms-management + email-management reachable only by typing the URL - components now live embedded in Communication Center
  - *Fix:* Remove the leftover standalone routes or add redirects to communication-center.

### Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- **F60** 🔴 — SMS/email delivery reports (DLR) — confirmed-delivered status from the gateway
  - *Fix:* Expose an M-Gov DLR callback endpoint keyed on external_id and flip sms_logs to delivered/failed.
- **F75** 🟡 — V92 area-coordinator targeting (users.region_id/district_id → RAS/RC/Reg DC/DAS/Dist DC/DED of affected areas)
  - *Fix:* Seed district_id for DAS/Dist DC/DED accounts in all districts, or dissemination to district coordinators silently reaches no one.
- **F76** 🟡 — Role-targeted SMS to internal officers (Directors, RCs, RAS...)
  - *Fix:* Seed users.phone (+notify_sms) for officer accounts — known follow-on from the Communication Center build.
- **F77** 🟡 — Warehouse dispatch-approval notifications (dispatch notes to warehouse officers)
  - *Fix:* On dispatch-request insert, notify users holding warehouse approval authority (in-app + email), mirroring notifyStage.
- **F78** 🟡 — EW push to partner stakeholders (proactive external push, beyond the stakeholder-portal feed read)
  - *Fix:* If policy requires partners to be pushed on publish, add a stakeholders leg to the publish afterCommit hook.

### Warehouse management
- **F63** 🟡 — Stakeholder donations intake (bid receive → warehouse stock)
  - *Fix:* (a) persist received_quantity per bid and sum that; (b) allow receive() for unlinked bids into a store without allocation roll-up, or repair/withdraw the 3 orphan rows.
- **F64** 🟡 — Fractional quantities vs integer ledger (rounding drift)
  - *Fix:* Reject non-integer quantities at dispatch/approval boundary, or make the ledger numeric.
- **F65** 🟡 — Orphaned rows: stock in no store + journal rows with no endpoints
  - *Fix:* One-time data repair pointing item 18/movement 12 at the actual receiving store; consider a source_agency_id column on stock_movements.
- **F66** 🟡 — Temporary warehouses (CRUD + ledger integration)
  - *Fix:* Block deactivation while Σ(inventory_items.quantity)>0, or prompt a transfer-out.
- **F90** 🟡 — Dispatch receive-side: no destination-stock update for incident deliveries

### Incident lifecycle depth
- **F48** ⚫ — Resubmit endpoint + UI button (rolled_back_to_* statuses)
  - *Fix:* Delete the legacy status space (resubmit endpoint, canResubmit, WORKFLOW_STATUSES legacy entries) or re-point resubmit at the real rollback semantics.
- **F49** ⚫ — Forward-to-Assistant-Director endpoint POST /{id}/forward
- **F62** 🟡 — Workflow action buttons are stage-gated but not role-gated in the UI
  - *Fix:* Gate buttons on the caller's role matching STAGE_ROLES for the current stage (roles are in the JWT).
- **F86** ⚫ — Legacy workflow statuses shipped as live filter options; unused transition() helper

### notifications + email/SMS coverage
- **F59** 🔴 — Delivery status tracking / DLR — absent (confirmed still true); no retry of failed/pending sends
  - *Fix:* Add an M-Gov DLR callback (they return messageId → external_id already stored) and a bounded retry sweep over status='failed' logs; surface failed-stage-email counts on the Communication overview.
- **F70** 🟡 — Incident stage notification body renders area as literal "(null)" for portal-origin incidents
  - *Fix:* Fall back to joining region/district names by id (or omit the parenthetical when both are null) in notifyStage.
- **F71** 🟡 — Warehouse loan notifications bypass the ONE dispatcher (direct insert, ignores notify_in_app preference)
  - *Fix:* Route through notifications.notifyUser with Notice.inApp to restore the single-dispatcher invariant.
- **F72** 🟡 — notifyAllUsers broadcasts for scanner/EW ingest events flood every account's feed
  - *Fix:* Scope scanner events to notifyRoles (EOCC/focal points) and bulletin-received to EW approvers.

### EW ↔ incident linkage
- **F67** 🟡 — "Preparedness during warning": trainings matched by DATE ONLY, no area filter
  - *Fix:* Add 'and (t.venue ilike %area% or t.region ilike %area%)' mirroring the plan leg, or label the chip 'national training' when unscoped.
- **F68** 🟡 — Command Post readiness 'early_warnings' panel ignores the activation's areas
  - *Fix:* Add 'and affected_regions ilike any (?)' with the same like[] array used for evac centres.
- **F69** 🟡 — DRR 'disasters preceded by a warning' coverage metric — real query, starved data (1.4%)
  - *Fix:* Rank linkSuggestions by area+hazard overlap (reuse the report's match SQL) and add a one-click 'auto-link matched warnings' on the event card; until curated, footnote the 1.4% figure as 'links pending' rather than presen

### User roles & registration
- **F47** ⚫ — V96 roles (Regional/District Planning Officer, Regional/District Logistic Officer, District Commissioner) — dormant; their promised 'comment' capability was deleted
  - *Fix:* Either seed/document these as future workflow-stage placeholders and hide them from the create form, or delete them; if kept, they need the same area-attachment fix as the other area roles plus a real comment endpoint.
- **F61** 🟡 — Dist DC is NOT a viewer — it is the working DDMC entry-stage approver (design mismatch with 'DC = area viewer')
  - *Fix:* Decide which DC role is canonical; if Dist DC is the DDMC approver by design, update the documented 'RC/DC are area viewers' doctrine; if not, move waiting_ddmc ownership and strip the write permissions.

### Disaster Repository + Reports & Analytics
- **F73** 🟡 — past-disasters (Mitigation) vs Disaster Repository duplication
  - *Fix:* Accept as narrative-vs-loss-DB split but cross-link the overlapping events, or show a 'also in repository' pointer to stop double data entry.
- **F74** 🟡 — Capability matrix vs user's ask ('number of incidents, issued EW, disasters occurred, cost used… everything')
  - *Fix:* The single highest-value close-out is the cost-per-disaster join; everything else on the user's list already resolves to a real number.

### Incident Command Post + Virtual Simulations
- **F79** 🟡 — Scenario injects (script/fire/resolve, fire-on-board-read) — functional but NEVER used since its build-day E2E; zero rows in DB
  - *Fix:* Add a @Scheduled(fixedDelay=60s) firer for due injects so timed events land even when nobody is watching the board (S); add target DRF/role addressing + expected-action field so injects test a specific section, not the s
- **F80** 🟡 — Impact-confirmed incidents are created without region/district, silently degrading the board's 'Area readiness' panel to unfiltered national lists
  - *Fix:* S: in confirmImpact, resolve the first affected_areas entry against the regions table (AreaLookup helper already exists per jurisdiction work) and stamp region_id/region_name on the created incident; alternatively pass a

### assignments/tasks/provisions + information & knowledge
- **F81** 🟡 — Task assignee picker quality
  - *Fix:* Filter form-data users by is_active + jurisdiction/role; add paging or raise limit with server-side paging.
- **F82** 🟡 — Relief distributions 'Confirm receipt' UI silent failure
  - *Fix:* Add error callbacks surfacing e.error.detail like save() already does.

### portal ↔ system linkage integrity
- **F83** 🟡 — Public subscribe → alert delivery chain
  - *Fix:* Honor channel prefs in AudienceService.collect (skip phone when channels excludes sms, etc.); consider an optional auto-disseminate hook on warning publish filtered by alert_level_priority.
- **F84** 🟡 — PHR report_code generation: count(*)+1 with no unique index
  - *Fix:* Unique index on report_code + generate from a sequence (or retry-on-conflict), matching the fix pattern used elsewhere.

## 8. Larger builds flagged by the audit (new modules, sized)

These exceed a defect-fix — they are net-new capability the audit recommends for the user's stated ambitions:

- **ICS command structure (M)** — incident commander / section chiefs / org chart per activation; today tasks assign to users but nobody commands the incident. (F05)
- **Scenario library & MSEL exercise engine (L)** — multi-region composite drills, reusable exercise scripts, participant rosters, time compression; today a simulation is one cloned incident + ad-hoc injects. (F06)
- **Unified per-incident operations timeline (M)** — one master log merging workflow history + tasks + dispatch + warehouse movements + comms; today these are 3 disconnected trails. (F12)
- **Real-time tracing (M)** — no SSE/WebSocket anywhere; the Command Post board is poll-only. (F29)

## 9. Working method (the honesty gate)

Every wave: parallel fixers on disjoint files → one rebuild → boot check → **run each fixer's live VERIFY script** (with a regression check on adjacent behavior) → mark the ledger item FIXED *only* with the observed evidence → commit with explicit staging. No item is 'done' on a code diff alone.


## 10. Re-validation record — Wave 1 (2026-07-06)

The 7 "Done" items were **re-verified a second time** against the live backend (not trusting the original fixer output). Method: independent re-run of each item's VERIFY script + a direct API-vs-DB truth check.

| # | Item | Re-validation result (2026-07-06) |
|---|---|---|
| F01 | 5 dead EW endpoints removed | ✅ all 5 return **404** live |
| F02 | Area attachment persists | ✅ API-created RAS → `region_id=56`; login saw **only Mwanza**'s incident; cross-region district → **400** |
| F07 | UM area pickers + lookups | ✅ `lookups` catalogue present; users carry `regionId/regionName` |
| F08 | Stakeholder link sync | ✅ create set **both** columns (`u.stakeholder_id=37`, `s37.user_id=match`); relink/unlink moved both |
| F09 | Rollback strand fix | ✅ #91 rollback **rejected** (nothing staffed below); #34 rolled past unstaffed RDMC to staffed DED; forward flow unchanged |
| F14 | Real warehouse stocks | ✅ **API == DB** exactly: 6315 / 110 / 899 / 450 / 2500 / 32 |
| F21 | Dist DC publish revoked + guarded | ✅ `dc@test.com` → **403** on push-map/news/remove-news; EOCC passes the gate |

All 7 hold. Wave 2 passed the same gate on 2026-07-06 — see below.

## 11. Validation record — Wave 2 (2026-07-06, committed `2abb5a5`)

Method: 4 parallel verifier agents (one per track), each running live API + independent SQL cross-checks + UI screenshots via real-login Puppeteer, followed by **4 independent skeptic agents instructed to REFUTE each pass** (fresh tokens, own SQL, own test rows). All 4 verdicts: **CONFIRMED** — the skeptics reproduced the decisive observations byte-for-byte.

| Track | Decisive observed evidence |
|---|---|
| F03 forecast badge | 6-key block on all incidents; hazard guard proven against a SQL-verified area+time overlap; controlled positive → covered:true w/ exact 33h lead; district precision held; both badges rendered |
| F04+F16 cost rollup | recorded/cash/in-kind arms each proven == independent SQL (incl. 109,715,000 in-kind the first verifier missed and the skeptic closed); 400-not-500 validation; CSV real values; all test rows cleaned |
| F10+F11 EW report | 53→8 == SQL distinct; one row per warning×region w/ correct min/max; demotions + NULL-hazard preservation verified; summary identity holds; no 500s across ranges |
| F13 MoW inbox | inbox visible to mow@pmo.go.tz with content == API; acknowledge round-trip + exact revert; TMA regression clean; found NEW pre-existing gap → logged as **F92** |

Notes from the re-check worth keeping: the backend was restarted mid-run at 02:43 by another session with identical behavior before/after (confirms the deployed jar carries this code); shared-DB test rows from concurrent verifiers transiently and *correctly* flipped EW classifications (family match working as designed); zero VERIFY-W2 rows remain.

## 12. Validation record — Wave 3 (2026-07-06, committed `b7093f5`) + F94 RBAC trim (committed `55b2a45`)

Method: 5 parallel fixer agents on strictly disjoint file sets → ONE rebuild → boot check (V140/V141 applied cleanly) → each fixer's live VERIFY script executed by the orchestrator → every failure investigated to root cause → independent spot re-probes of each decisive claim with fresh tokens/SQL. Failures triaged honestly, none glossed:

| Track | Result | How it was proven |
|---|---|---|
| F05 ICS roles | ✅ 17/17 in substance | appoint→journal→auto-relieve-with-handover→vacant all observed; SQL duplicate-active blocked by the partial unique index; 403 for non-privileged; org-chart panel screenshot. 2 script "fails" were the script expecting 400 where this codebase returns 422; the UI "fail" was the test string-matching lowercase against CSS-uppercased text — panel renders fully. |
| F12 ops timeline | ✅ 24/25, 1 explained | per-source counts == origin tables; re-probed independently (workflow 18==18, budget 1==1, the 5M disbursement leads the log); the "anonymous 200" is the documented local-profile dev persona — pre-existing show/list endpoints behave identically (F85). |
| F24+F70 area names | ✅ 12/12 | incidents 88/91 backfilled (Kyela/Mbeya, Handeni/Tanga); fresh convert carries both names; notification reads the real area; area-less incident omits the parenthetical; 0 rows left with id-set-name-null (re-probed 0\|0); historical '(null)' frozen at 7. |
| F92+F87 scanner | ✅ 30/30 | mow→tma 403 / mow→own 200 / admin→any 200 (re-probed); /stats 404; EOCC dispatch console still lists 12 taskings across 6 agencies (screenshot); MoW inbox unaffected. |
| F88+F89+F91 dead code | ✅ all | /map 405 (handler gone, sibling /{id} mappings still path-match — expected); portal i18n unchanged at 214 keys; F91 honestly closed as already-fixed (redirects existed, `32a50c5`) — verified, not re-implemented. |
| F35 dashboard scope (user-reported) | ✅ | TWO causes found: statistics block had NO area predicate; feeds used shared-or-own (region-less incidents leaked to every region). Both /dashboard and /eocc now use the registry's STRICT scope for area tiers, national byte-identical fast path. RAS Dodoma/Arusha/Kigoma/Dar all probed scoped; admin unchanged. En-route gotcha: jsonb `?` operator + bind params → PgJDBC 409 → jsonb_exists(). |
| F94 RBAC trim (user-reported) | ✅ | Role-level V142/V143 (auto-applies to all 31 RAS + Reg DC/DED/DAS): authority grants revoked, Stakeholder Portal got its own permission, EW authoring consoles route-gated create-tier. RAS hub 10→4 cards (screenshot); backend 403s scanner/scan, eocc/activate, onehealth/events for RAS; 5 sampled regional RAS accounts auto-trimmed; MoW/EOCC/Partners regressions clean. Caveat: sessions logged in before the trim keep their old menu until re-login (JWT carries the permission set). |

Process incidents kept honest: one restart attempt silently failed (backgrounded chain aborted at a stale pid; old jar kept serving) — caught by checking which pid owned :8080 and the jar mtime BEFORE running any verification; without that check the whole wave would have been "verified" against a jar not containing it.
