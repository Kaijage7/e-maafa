# DMIS Audit Fix Ledger — resolve ALL, honestly, one by one
Source: DMIS-LINKAGE-AUDIT.md (2026-07-05). Status: OPEN → FIXED (with verification evidence) / WONTFIX (with reason).
Migration counter: next free = V142 (V136 = Wave-1 publish revoke; V137–V139 = other sessions' [generated reports / DLNA scope / password reset, committed f3bcd60]; V140 = Wave-3 ICS command roles; V141 = Wave-3 area-name backfill). ASSIGN SERIALLY HERE before creating any migration.

## F01 [DEAD s4] 5 EW boundary endpoints whose only consumers (Streamlit dashboards) were retired: GET /ew/stakeholders, POST /ew/disseminate, POST /ew/sms-test, POST /ew/monitoring/reports/batch, POST /ew/monitoring/request-update
- Domain: Dead code + unproductive endpoints hunt
- Status: **FIXED 2026-07-05 — 5 dormant handlers deleted (Streamlit-only consumers); VERIFIED: all 5 → 404, kept monitoring-report round-trip still works.**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/ew/EwBoundaryController.java:51,67,133,166,179. Zero hits for these paths in frontend/src (grep 'ew/stakeholders|ew/disseminate|ew/sms-test|reports/batch|request-update' -> 0); only consumers are /home/kaijage/model/maafa/ew-engine-aside/.../dissemination_page.py + monitoring_page.py (retired Streamlit, outside the running stack). Live: GET /api/ew/stakeholders -> 200 with 27 stakeholders incl. PII; POST /api/ew/disseminate -> 422 'bulletin_number is required' proving the method body executes and would dispatch REAL M-Gov SMS (sendBulkSms at :86-100). The s
- Fix hint: Delete the 5 handlers (or fold dissemination into the native Communication Center flow); they are dormant SMS-dispatching surface with no UI.

## F02 [GAP s4] No product surface sets users.region_id / district_id / stakeholder_id — area officers can only be manufactured by SQL
- Domain: User roles & registration
- Status: **FIXED 2026-07-05 — UM create/update accepts+validates regionId/districtId/agencyId/stakeholderId; VERIFIED: API-created RAS(Mwanza) saw exactly its region's 1 incident; cross-region district rejected 400.**
- Evidence: grep 'update public.users set' across the whole backend returns exactly 4 statements: name/email (UserManagementController.java:129), password (:153, AuthController.java:121), notify prefs+phone (NotificationController.java:100) — nothing ever writes region_id/district_id/stakeholder_id/agency_id. Consequence proven in code: JurisdictionScope.tierFor (JurisdictionScope.java:94-112) puts an area-role user with NULL area into REGION/DISTRICT tier, then appendAreaScope emits '1=0' (lines 177-194) → sees ZERO incidents; IncidentWorkflowService.assertStageAccess (lines 118-135) throws 'no area assi
- Fix hint: Expose area attachment in User Management (single source: the users table already has the FK columns and indexes); until then every new DED/RAS/RC/DAS/DC account requires direct DB writes.

## F03 [GAP s4] Per-incident 'was this forecast?' answer — the user's core ask — has no surface on the incident record
- Domain: EW ↔ incident linkage
- Status: **FIXED 2026-07-06 (Wave 2) — computed `forecast` block on GET /v1/response/incidents/{id} (area district-first/region-fallback + validity+48h tail + hazard-compatibility guard) + green WARNED / grey Out-of-forecast badge on incident-show; VERIFIED live + independently re-checked (CONFIRMED): 6 incidents all carry the 6-key block; incident 82 in SQL-proven area+time overlap with EW-2026-00050 returns covered:false (hazard guard fired, drought_heat vs storm_water); controlled Floods incident in warned district 1964 returned covered:true EW-2026-00050 / Major Warning / lead 33h (= exact validity_start→reported_at); same-region district 1967 NOT claimed; district-less incident still 200s; both badge variants screenshotted on :4200 with zero console errors; test rows deleted.**
- Evidence: No FK columns exist in either direction: psql information_schema shows incidents has no warning/forecast column and early_warnings has no incident column. incident-show.component.ts contains no warning linkage UI (only Bootstrap 'btn-outline-warning'/Swal icons match a grep for 'warning'). The forecast/occurrence classification lives ONLY in the aggregate report; an officer opening incident #82 cannot see it fell inside warned district Bahi during EW-2026-00050's window.
- Fix hint: Add a computed block to IncidentController.show (same EXISTS: warning_hazards row where area matches and reported_at within validity+tail) returning {covered:boolean, warning_code, warning_level, lead_hours}; render a 'Forecast: WARNED (EW-2026-00050, 33h lead) / UNWARNED' badge in incident-show and the triage queue. Optionally persist incidents.warning_id (nullable FK) set at triage time for audi

## F04 [GAP s4] COST-USED per disaster: three disconnected mechanisms, repository shows TZS 0 for all 75 events
- Domain: Disaster Repository + Reports & Analytics
- Status: **FIXED 2026-07-06 (Wave 2) — list() returns per-event `costUsedTzs` (= recorded gov_response_tzs + in-kind allocations×unit_cost over linked incidents/allocations + budget_commitments cash over linked incidents), show() returns 7-key `costUsed` breakdown block, create/update accept optional govResponseTzs (blank=unchanged, non-numeric→400 not 500), detail card renders the three mechanisms honestly labelled; VERIFIED live + independently re-checked (CONFIRMED): create 1,234,567→update 7,654,321→blank-leaves-unchanged all held; linking incident 2 made budgetCommittedTzs equal the independent SQL sum; re-checker also proved the in-kind arm non-zero (109,715,000 over 15 allocations == SQL); CSV export shows the real figure; UI list column + cost card screenshotted; test event+links removed.**
- Evidence: (1) In-kind: responseInvestment = allocated_resources×unit_cost for LINKED incidents (DisasterEventService.java:493-504), rendered on the card (repository-event-detail.component.ts:284-291 'DMD response investment') — but zero incident links exist, so LIVE GET /repository/events/{id} returned {valueTzs:0, allocations:0} and the Sendai 'DMD response delivered' insight (SendaiAnalyticsService.java:223-238) never fires (absent from live insights list). (2) Cash: Budget&Finance V99-V101 works E2E — LIVE GET /v1/finance/budgets/1 shows commitment of 5,000,000 TZS against incident #2 'Market fire — 
- Fix hint: Surface cost on the event card from both ledgers: sum budget_commitments (via linked incidents) + allocations×unit_cost; add gov_response_tzs to create/update/show or drop it from the CSV — today the exported column silently reports 0 government response for every disaster.

## F05 [GAP s4] No ICS organization structure: no incident commander, no section chiefs, no per-activation org chart or named command roles
- Domain: Incident Command Post + Virtual Simulations
- Status: **FIXED 2026-07-06 (Wave 3) — V140 activation_command_roles (9 standard ICS roles, partial unique index = one active holder per role), appoint/relieve endpoints journaling both handover events into task_activity_log (AAR shows command handovers), board() returns command_roles + drf_sections (15 DRF lanes statically mapped under Operations/Planning/Logistics), 'Incident Command (ICS)' org-chart panel on the Command Post board; VERIFIED live: appoint IC→board+journal, replacement auto-relieves incumbent w/ handover journal, relieve→vacant, SQL duplicate-active blocked by the index, invalid role / unknown user → clean 422, Minister (no tasks.manage) → 403, board regression intact, UI panel screenshotted (initial UI-check 'failure' was the test string-matching lowercase against CSS-uppercased text).**
- Evidence: grep -rni 'commander|incident_command|ics_' over all migrations hits only a comment in V132 line 11; no table for activation roles exists (psql \dt shows only response_activations/incident_tasks/task_activity_log/activation_injects/task_dependencies/task_updates). DRF lanes assign to stakeholder ORGANIZATIONS (CommandCenterController.java:559-574) and tasks to users (TaskController.java:266), but nothing models who commands the incident, who runs Operations/Planning/Logistics/Finance, or deputies — the ICS backbone the user asked for.
- Fix hint: M: add activation_command_roles table (activation_id, role e.g. IC/Ops/Planning/Logistics/Finance/PIO/Safety, user_id, appointed_at, journal on appoint/relieve), an org-chart panel on the board, and appointment events into task_activity_log so the AAR shows command handovers. Map the 15 DRF lanes under section chiefs for the hierarchy view.

## F06 [GAP s4] Simulation at scale is single-incident only: no scenario library, no exercise templates/MSEL, no multi-incident composite exercises, no participants roster, no time compression
- Domain: Incident Command Post + Virtual Simulations
- Status: **OPEN**
- Evidence: psql: no tables matching %scenario%|%exercise%|%drill% exist; grep 'scenario' in backend hits only CommandCenterController (inject comments) and an unrelated EW seeder. A simulation = one cloned incident + ad-hoc injects typed in live (V132). There is no way to pre-author a national multi-region scenario (e.g. cyclone + flood + disease outbreak across 3 regions), reuse a past exercise script, enrol participants, compress the 72-hr clock, or score against expected actions — the 'higher scale' the user wants.
- Fix hint: L: add exercise_scenarios (title, hazard, regions, objectives) + scenario_events (MSEL: offset_minutes, inject payload, target DRF, expected_action) tables; a launcher that spawns N drill-clone incidents/activations via the existing ActivationService.activate machinery and bulk-loads scenario_events into activation_injects with computed due_at; participant roster (reuse users + activation_command_

## F07 [PARTIAL s4] Admin user creation + role assignment (Settings → User Management)
- Domain: User roles & registration
- Status: **FIXED 2026-07-05 — modal now has role-driven Region/District/Agency/Partner pickers + Area column; canSave blocks area roles without attachment.**
- Evidence: Backend create takes ONLY name/email/password/roles: UserManagementController.java:93-113 (dmis-platform/backend/src/main/java/tz/go/pmo/dmis/settings/); frontend POST body is exactly {name,email,password,roles}: user-management.component.ts:180-182; the form has no region/district/agency picker (template lines 78-107). Role catalogue IS complete: live GET /v1/settings/users as admin returned all 24 DB roles as checkboxes (observed: 'roles offered: 24' incl. RAS/RC/DED/DAS/Dist DC/Reg DC). So an admin can create a user with ANY role but can NOT attach a region/district — the users table has re
- Fix hint: Add region/district (and agency/stakeholder) pickers to the create/edit modal, shown when an area/agency role is selected, and accept+persist them in UserManagementController.create/update.

## F08 [PARTIAL s4] Two stakeholder-link columns, only one maintained: link-user sets stakeholders.user_id but every partner-identity guard reads users.stakeholder_id (set by seeds only)
- Domain: User roles & registration
- Status: **FIXED 2026-07-05 — linkUser/create/update sync users.stakeholder_id ↔ stakeholders.user_id both directions; VERIFIED: relink moved both columns, unlink cleared both.**
- Evidence: linkUser writes stakeholders.user_id only (StakeholderAdminController.java:181-182); NOTHING in the backend writes users.stakeholder_id (grep 'update public.users set' — 4 hits, none touch it). Yet JurisdictionScope.currentStakeholderId() reads users.stakeholder_id (JurisdictionScope.java:151-163) and is the basis for: (a) the bid self-identity guard — recordBid skips 'only your own organisation' when it is null (StakeholderBiddingController.java:227-230) while submitBid (POST /bids, gated only by resource_allocation.request which Partners HOLDS, line 185-193) accepts any body stakeholder_id →
- Fix hint: Make linkUser also set users.stakeholder_id (and clear it on unlink/relink), or refactor currentStakeholderId() to resolve via stakeholders.user_id as the single source of truth.

## F09 [PARTIAL s4] Rollback into an unstaffed auto-skipped tier strands the incident (no settle, no resubmit path)
- Domain: Incident lifecycle depth
- Status: **FIXED 2026-07-05 — rollback walks past unstaffed/auto tiers to first actionable tier or rejects with clear message; VERIFIED: #91 rejected (nothing staffed below), #34 rolled past RDMC to DED with stamped history; forward settle unchanged.**
- Evidence: settleStage javadoc: 'Backward transitions (rollback) deliberately do NOT call this' (IncidentWorkflowService.java:363-364); rollback lands on PREV_STAGE unconditionally (225-235). Live precondition on the test incident itself: #91 (Tanga) history shows auto_advanced past waiting_ded AND waiting_rdmc because 'no officer staffs this tier'; psql: region 52 staffing = RAS 1, RC 1 only; portal_settings incident_approval waiting_rdmc=skip_if_unstaffed. So one RAS rollback of #91 → waiting_rdmc, where assertStageAccess requires a Tanga 'Reg DC' that does not exist; submit() only accepts draft/rolled
- Fix hint: On rollback, either re-run a reverse settle (skip unstaffed tiers downward) or block rollback into a tier that stageStaffed()=false with a clear message.

## F10 [PARTIAL s4] EW report counts one warning once PER DISTRICT ROW — headline stats inflated ~6x
- Domain: EW ↔ incident linkage
- Status: **FIXED 2026-07-06 (Wave 2) — rows aggregated to ONE per warning×region (min/max validity, district list + district_count) BEFORE classification; headline counts per DISTINCT warning_id; additive summary keys same_area_different_hazard + warned_area_windows; VERIFIED live + independently re-checked (CONFIRMED): warnings_issued 53→8 == SQL count(distinct warning_id) for the default window; EW-2026-00050 appears exactly once for Dodoma with its 7 districts listed and min/max == SQL; rows == warned_area_windows == distinct (warning,region) pairs; summary identity warned+no_incident+different_hazard == issued holds; RAS(Dodoma) scoped view internally consistent; UI classbar (now 5 buckets) matches API; no 500s across date ranges incl. zero-warning ranges.**
- Evidence: EwManagementController.java:68-79 iterates raw warning_hazards rows (one per warning×hazard×district). DB: 53 rows but only 8 distinct warning_codes (psql: select count(distinct w.warning_code)... = 8). Live output shows EW-2026-00050 'Heavy rainfall / Dodoma' listed 7 times (district rows 1964,1965,1966,101,1968,1969,1970 share region_id=1), each matching the same incident 82 → warned_incident=9 is really 3 distinct warning-region hits. warnings_issued=53 vs 8 real warnings.
- Fix hint: Aggregate to one row per (warning_id, region_id) — or per warning_code — before classification: group by w.id, wh.region_id with min(validity_start)/max(validity_end), and count distinct warnings in the summary.

## F11 [PARTIAL s4] Hazard type NOT used in warned→incident matching (Javadoc claims it is) — cross-hazard false positives
- Domain: EW ↔ incident linkage
- Status: **FIXED 2026-07-06 (Wave 2) — hazard-compatibility predicate (exact hazard_id OR related family map: flood-storm / drought-agri / disease / fire / geophysical; a side with no hazard info is never demoted) applied in the EW report; incompatible area+time matches move to per-row `different_hazard_incidents` + summary `same_area_different_hazard` so the spatial coincidence stays visible without inflating true positives; VERIFIED live + independently re-checked (CONFIRMED): Fire/Drought incident 82 now in EW-2026-00050's different_hazard bucket not its hits; Drought EW-2026-00038 no longer claims Windstorm/Cholera; NULL-hazard incident kept as a hit (never blocks); the surviving warned_incident=1 is a genuine compatible match; warned_incident dropped 9→1 on the seeded corpus.**
- Evidence: EwManagementController.java:27-28 claims hazard is 'used to refine when both sides carry hazard_id', but the incident query (lines 85-96) filters only time+region — no hazard predicate exists. Live proof: 'Heavy rainfall' warning EW-2026-00050 matched incident 82 'Fire' (hazard_id=4, both sides carry hazard ids) → counted as warned→incident true positive with 33h lead; 'Drought' warning EW-2026-00038 matched 'Windstorm roof damage' + 'Cholera outbreak'. 15 of 22 non-simulation incidents carry hazard_id, so refinement is feasible.
- Fix hint: Add a hazard-compatibility predicate (wh.hazard_id = i.hazard_id, or a keyword-family map like AnticipatoryPlanController.matchingPlans' cyclone→floods logic at AnticipatoryPlanController.java:253-273) with a 'related-hazard' fallback bucket so rainfall→flood still counts.

## F12 [PARTIAL s4] Per-incident action tracing today = three DISCONNECTED trails, no unified operations log (the user's 'traced well virtually' is only partially met)
- Domain: Incident Command Post + Virtual Simulations
- Status: **FIXED 2026-07-06 (Wave 3) — GET /v1/response/incidents/{id}/ops-timeline (IncidentTimelineController): nine trails union-merged time-desc (workflow, task via activation, situation reports, allocations, dispatch incl. the source_details fulfilment journal, warehouse movements, sms/email incident_workflow logs, budget commitments) with per-source counts, ?source=/?limit= filters, incidents.view gate + the show hub's exact area scope; <dmis-incident-ops-timeline> master-log panel on incident-show; VERIFIED live: per-source counts == origin tables (independently re-probed: incident 2 workflow 18==18, budget 1==1, 5M disbursement leads the log), probe rows resolve 1:1, bogus source → 422 w/ detail+message, quiet incident → 200 empty, Partners → 403, anon parity == pre-existing incident endpoints (local dev persona, F85), UI panel rendered w/ 6 filter chips + 30 rows, no page errors. Honest scope note: command_role source omitted at build time (no such table then) — the F05 journal events DO ride in via the task trail.**
- Evidence: Trail 1: incident_workflow_histories on incident-show (IncidentController.java:816, incident-show.component.ts:214-221). Trail 2: task_activity_log keyed by ACTIVATION not incident (ActivationService.java:100-105) — only 13 rows total live (psql), and only Command-Post actions write to it. Trail 3: Situation Reports (incident_history_reports, IncidentController.java:393/645). Dispatch, warehouse movements, communications, allocations and budget actions for an incident are journalled in their own modules and NEVER appear on the Command Post timeline — the board's recent_activity (CommandCenterC
- Fix hint: M: build a read-side union timeline endpoint per incident (task_activity_log + incident_workflow_histories + allocated_resources source_details journal + sms/email logs + warehouse ledger, all filtered by incident_id) and render it as the board's master ops log; no schema change needed since every trail already carries incident linkage.

## F13 [PARTIAL s4] Scanner entity taskings round trip (V131) — entity-taskings.component.ts + ScannerController tasking endpoints
- Domain: assignments/tasks/provisions + information & knowledge
- Status: **FIXED 2026-07-06 (Wave 2) — `<dmis-entity-taskings agency="mow">` embedded in mow-flood.component.ts (same pattern as TMA's ew-alert-map embed); all 7 taskable entities now render their inbox (5 via shared agency-event-console, TMA + MoW via direct embeds); VERIFIED live + independently re-checked (CONFIRMED): as mow@pmo.go.tz the awaiting flood tasking is visible at /m/preparedness/early-warnings/mow (screenshot, content matches API), Acknowledge round-trip worked in the UI and was precisely reverted; TMA console regression clean; consolePath string equals the route visited. Follow-up logged as F92: GET /entity-taskings is not agency-scoped for READS (pre-existing, mutations are guarded by assertOwnAgency).**
- Evidence: Round trip is real code and exercised: awaiting→acknowledge→respond→EOCC accept/return (ScannerController.java:306-385, disaster-scanner.component.ts:86-87 Accept/Return wired, agency lockdown assertOwnAgency:70-77). DB: 12 taskings (10 awaiting/1 responded[gst]/1 returned[tma with review_note]); 1 row carries new urgency/source/instruction picker fields. Live GET ?agency=tma returns full context. BUT the MoW console never renders the inbox: route /m/preparedness/early-warnings/mow loads MowFloodComponent (app.routes.ts:41) which does NOT import EntityTaskingsComponent (grep confirms; only age
- Fix hint: Embed <dmis-entity-taskings agency="mow"> in mow-flood.component.ts (same pattern as ew-alert-map.component.ts:85 for tma).

## F14 [FAKE s3] Preparedness Warehouses registry 'Stocks' column always 0
- Domain: Warehouse management
- Status: **FIXED 2026-07-05 — real per-warehouse sum(inventory_items.quantity); VERIFIED: API == psql (6315/2500/899/450/110/32).**
- Evidence: WarehouseService.java:20-21 comment: '(Stock counts join warehouse_stocks later; reported as 0 until then.)' and toRow() hardcodes `0` into WarehouseRow.stocks (WarehouseResponse.java:12); the warehouse_stocks table does not even exist (psql: relation "public.warehouse_stocks" does not exist). UI displays it as a badge (warehouses.component.ts:75,88 'Stocks' column). Live: GET /v1/warehouses shows stocks=0 for PMO Central/Coastal/Eastern while the ledger holds 6315/110/32 units.
- Fix hint: Join inventory_items (sum(quantity) where warehouse_id=w.id and temporary_warehouse_id is null) — the number already exists in warehouse-ops index.

## F15 [DEAD s3] Backbone SMS channel + per-user notify_sms preference — never exercised by any event
- Domain: notifications + email/SMS coverage
- Status: **OPEN**
- Evidence: grep across backend: NO caller ever uses Notice.all() or withChannels() (only definition hits in NotificationService.java:47/51); every call site uses Notice.inApp (sms=false) except IncidentWorkflowService.java:535 which sets email-only. So NotificationService.dispatch()'s smsPhones branch (lines 102-104) is unreachable in practice. Compounding: psql — only 1 of 107 users has a phone and notify_sms=true. All real SMS traffic bypasses the backbone via direct MgovSmsService calls (EW/OH/alerts/stakeholder-verify).
- Fix hint: Either mark critical notices SMS-eligible (e.g. Critical-severity incident stages, EW publish) and seed officer phone numbers, or delete the dead per-user SMS branch and preference toggle so the settings UI stops promising a channel that can never fire.

## F16 [DEAD s3] gov_response_tzs column: designed cost field with no fill path, exported as always-0
- Domain: Disaster Repository + Reports & Analytics
- Status: **FIXED 2026-07-06 (Wave 2, together with F04) — govResponseTzs wired into create/update/show and the event form (inline edit while Open, read-only after validation), CSV export now carries real values; VERIFIED live + independently re-checked (CONFIRMED): recorded value round-trips create→show→list→CSV; blank update leaves the column unchanged (coalesce semantics); non-numeric input → 400 with readable message (ProblemDetail + message, frontend-compatible), not a SQL 500.**
- Evidence: V61__disaster_effects_official_report_fields.sql:20-23 creates it with a comment 'relief disbursed (OWM-SBUU + region/council)'; grep across backend+frontend finds only exportCsv (DisasterEventService.java:120,131) and the seeder insert (OfficialDisasterReportSeeder.java:77) — no API request field, no UI form field, show() omits it. LIVE: all rows 0; CSV export shows '0.00' for every event including the validated official-report cards.
- Fix hint: Either wire it into the event form/API and show(), or remove it from the CSV header until fillable.

## F17 [DEAD s3] One Health dissemination acknowledge endpoint (stakeholder ack round-trip)
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: POST /v1/onehealth/disseminations/{id}/acknowledge (backend/.../onehealth/OneHealthDisseminationController.java:387-393) unconditionally returns 403 'You are not associated with a stakeholder' for EVERY caller — it never inspects the session's stakeholder link, so the acknowledgment leg of the dissemination round-trip can never succeed for anyone, despite carrying a one_health.acknowledge permission gate.
- Fix hint: Resolve the caller's stakeholder via users.agency/stakeholder link (V95) and record the ack, or remove the endpoint.

## F18 [DEAD s3] Entire domain-event/outbox pipeline is dead machinery: AggregateRoot, DomainEvent, DomainEventLogger, OutboxAppender, OutboxDispatcher, OutboxEnvelope, OutboxEvent, OutboxEventRepository, OutboxRelay
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: grep 'extends AggregateRoot|registerEvent' across backend/src -> zero hits outside common/domain+common/event (no entity ever raises an event). platform.outbox_event = 0 rows (psql count). OutboxRelay.java:29-31 runs @Scheduled(fixedDelay 2000ms) polling findTop100ByPublishedAtIsNull forever against the eternally-empty table. No external class references OutboxDispatcher/OutboxEnvelope.
- Fix hint: Either wire aggregates to registerEvent (the notification backbone could ride it) or remove the 9 classes + platform.outbox_event table and the 2s scheduler.

## F19 [DEAD s3] POST /v1/response/approvals/bulk-approve - real PMO bulk fast-track logic with per-id area scoping, no UI consumer
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/response/ResourceApprovalController.java:220 (engine.fastTrack loop, per-id findOr404 area guard). grep 'bulk-approve' frontend/src -> 0. approvals.component.ts has no checkbox/bulk selection (grep 'bulk|checkbox|selected' -> only unrelated hits); UI only calls /approvals, /my-requests, /{id}, /{id}/resubmit, /{id}/{action} (approvals.component.ts:211-256).
- Fix hint: Add multi-select + bulk approve to the approvals queue UI, or drop the endpoint.

## F20 [DEAD s3] POST /v1/response/approvals/{id}/update-source - approver source-redirect (warehouse/agency/procurement) with warehouse area guard, no UI consumer
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/response/ResourceApprovalController.java:193-217 (validates source, areaGuard.assertWarehouseVisible, updates allocated_resources). grep 'update-source' frontend/src -> 0; the approval drawer shows Source read-only (approvals.component.ts:156 '{{ d.warehouse_name ?? d.source_details }}').
- Fix hint: Surface a 'redirect source' control in the approval drawer, or remove.

## F21 [GAP s3] Dist DC holds incidents.publish → district officer can push incidents to the citizen portal, against the codebase's own doctrine; push endpoints are not area-guarded
- Domain: User roles & registration
- Status: **FIXED 2026-07-05 — V136 revokes publish from Dist DC + national-guard on 3 push endpoints; VERIFIED: dc→403 on all three, EOCC passes gate.**
- Evidence: psql: incidents.publish held by Asst. Director, Comms Officer, Director, Dist DC, EOCC, ICT Admin, Secretary, Super Admin. Authz.java:174-179 documents publish as 'an EOCC coordination-centre function… never the district/regional responders'. The gates at IncidentController.java:519/568/614 (push-map/push-news/remove-news) check only hasAuthority('incidents.publish') and resolve the incident via workflow.findOr404 (IncidentWorkflowService.java:482-488) which is a bare SELECT by id with NO area predicate — so a Dist DC could publish another district's incident by id. Not live-tested (mutation);
- Fix hint: Revoke incidents.publish from Dist DC in the matrix (V-migration) and add AreaGuard.assertOwn to the three push endpoints (matches the known scope-leak remediation backlog).

## F22 [GAP s3] Partner approval does NOT create a login — a working partner login requires two undocumented manual admin steps
- Domain: User roles & registration
- Status: **OPEN**
- Evidence: PUT /v1/stakeholders/{id}/verify (StakeholderAdminController.java:127-157) only sets is_verified + sends a congratulation ('Congratulations, looking forward to your support…') — no users row, no credentials, no role assignment. To get a login the admin must separately create a user with the Partners role in User Management, then call /{id}/link-user (lines 163-184). Seeded partners prove the END state works: redcross@partner.tz login 200, open-needs feed 200, incidents 403 (Partners has only resource_allocation.request/view). But nothing in the approval flow produces that state, and the congra
- Fix hint: On verify (or a 'create login' action beside it), optionally mint a Partners-role user from the stakeholder's email, set BOTH link columns, and send credentials/reset link.

## F23 [GAP s3] Officer pending queue on DED/RAS landing (what is reported to them / what they reported)
- Domain: Incident lifecycle depth
- Status: **OPEN**
- Evidence: No queue surface exists: post-login landing is the module hub (app.routes.ts:33) with zero incident content (grep pending|incident in module-hub.component.ts → empty); response dashboard payload has no stage-queue field (live keys: statistics/critical_alerts/recent_incidents/incidents_by_type/regional_data/new_incidents/my_area); incidents registry has no default workflow filter and no 'reported by me' view (no submitted_by anywhere in incidents.component.ts/dashboards.component.ts). What DOES work: the topbar bell (topbar.component.ts:24-44) — live as ras.tanga: notification 'Incident needs y
- Fix hint: Add a 'Needs your action' card on the response dashboard: incidents where workflow_status = the caller's stage in their area, plus a 'submitted by me' tab.

## F24 [GAP s3] Citizen-report-converted incidents have NULL region_name/district_name — blank area columns, '(null)' in officer notifications, broken centroid fallback
- Domain: Incident lifecycle depth
- Status: **FIXED 2026-07-06 (Wave 3) — conversion INSERT resolves district_name/region_name by the ids in hand (+ derives region from district when the report carried only the district); V141 idempotent backfill repaired the broken rows; VERIFIED live: incidents 88 (Kyela, Mbeya) and 91 (Handeni, Tanga) backfilled, fresh citizen convert carried BOTH names, district-only convert derived the region, zero rows remain with id-set-but-name-null (independently re-probed 0|0), officer/seed incident names byte-identical to the pre-migration snapshot. Follow-up F93 logged: the official-source portal INSERT (PortalPublicService.reportHazard) has the same omission — outside this fix's file scope; V141 repaired its existing rows and the F70 id-fallback keeps its notifications clean.**
- Evidence: PublicReportsController.java:155-158 inserts district_id/region_id but omits the *_name columns the rest of the system reads; officer-created incidents resolve names (IncidentController.java:221 comment, update path coalesceName 315-316). Live: incidents 91 and 88 have region_id set but region_name/district_name NULL (psql); RAS Tanga's own queue lists #91 with blank area; resource_notifications 4771 and 446 read "Incident '...' (null) has reached..." — the message summoning the officer names no place; pushMap's no-coordinates fallback reads region_name (IncidentController.java:549-551) so a c
- Fix hint: In the conversion INSERT, also select the names from regions/districts by the ids already in hand.

## F25 [GAP s3] Allocation 'Returned' discards deducted stock — no re-intake, no movement
- Domain: Warehouse management
- Status: **OPEN**
- Evidence: ResourceAllocationController.java:43-45 allows In Transit→Returned and Deployed→Returned; updateStatus (325-347) handles Returned via `default -> { }` — only the status string changes. Stock was already FIFO-deducted at dispatch approval (DispatchController.java:316) but is never added back to any store and no stock_movements row is written (grep 'Returned' across response/*: only warehouse_loans have a real Return flow). Goods physically returned to a warehouse vanish from the ledger permanently.
- Fix hint: On Returned, re-intake to the originating store (dispatch_approvals.source_id / journal source_id) via DispatchSupportService.addStock + a 'Return' stock_movements row, or force the operator to pick a receiving store.

## F26 [GAP s3] Public portal map: warnings + incidents + bulletins co-plotted but NO linkage indicator
- Domain: EW ↔ incident linkage
- Status: **OPEN**
- Evidence: Backend PortalPublicService.java:47-113 serves warnings, incidents, bulletins as three independent lists (no warned/covered flag on incidents). Frontend public-portal.component.ts:394-435 draws warning pulse markers and incident purple rings separately; the incident popup (lines 426-433) shows title/severity/status/region and a live-status link — nothing says 'inside a warned district' or 'was forecast by warning X'. The choropleth (buildAlertFills, lines 322-353) colours warned districts but incidents are never tested against those same keys.
- Fix hint: Cheapest: in initMap(), reuse buildAlertFills()'s bestRegion/bestDistrict maps — key each incident by norm(region)+'|'+normDist(district) and add an 'Inside warned area (severity)' row to the popup; proper: backend adds a warned:boolean via the same warning_hazards area+time EXISTS used in EwManagementController.

## F27 [GAP s3] Silent events: disaster declarations, CP/AAP activation, assessments, support pledges accept/decline, budget/finance, recovery/relief, content publication — no notification at all
- Domain: notifications + email/SMS coverage
- Status: **OPEN**
- Evidence: grep -c "notif" returns 0 for DeclarationController.java, ActivationService.java, AssessmentController.java, SupportPledgeController.java, StakeholderCoordinationController.java, finance/BudgetController.java; recovery/ and content/ packages have zero NotificationService references. Concretely: SupportPledgeController.java:154/168 flips pledge status to accepted/declined without telling the pledging stakeholder. This contradicts NotificationService.java:13-14 javadoc which claims 'CP/AAP activation … content publication, approvals' route through the dispatcher, and NotificationController.java:
- Fix hint: Wire notifyStage-style calls into declaration approval, ActivationService, pledge review, and budget-tier approvals; or correct the two javadoc claims so the dispatcher's contract matches reality.

## F28 [GAP s3] EW → subscribers on publish (alert_subscriptions auto SMS/email when a warning is published)
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: EwWarningLifecycleController.publish (backend/.../ew/EwWarningLifecycleController.java:284-300) fires ONLY Notice.inApp (sms=false,email=false) to system users. Grep of all alert_subscriptions consumers (CommunicationController 'public' group, AudienceService, AlertSubscriptionService, PortalPublicService, seeders) shows NO publish-time caller — subscribers with hazards_of_interest are never auto-notified when their hazard is published; they get SMS/email only if an operator later runs bulletin disseminate or a Communication Center send. LIVE: 5 active alert_subscriptions (3 phones/4 emails re
- Fix hint: Wire publish() afterCommit to AudienceService.resolve('subscribers_by_hazard') + resolveAreas for the warned districts, reusing the existing disseminate machinery.

## F29 [GAP s3] No real-time tracing anywhere: zero SSE/WebSocket in the entire codebase; board data refreshes only on user action
- Domain: Incident Command Post + Virtual Simulations
- Status: **OPEN**
- Evidence: grep -rln 'EventSource|text/event-stream|WebSocket' over frontend/src/app and backend/src/main/java returns NOTHING. command-center.component.ts:651 setInterval only ticks the clock display (now signal); board data re-fetches solely after user POSTs (refresh() at :746). The backend comment 'the board polls' (CommandCenterController.java:389-390) overstates the frontend — there is no polling loop, so two operators on the same board do not see each other's moves until they act.
- Fix hint: S-M: add a 20-30s polling interval on the open board (trivial, matches existing architecture) or an SSE endpoint streaming task_activity_log rows for the activation; @EnableScheduling is already on for the backend side.

## F30 [GAP s3] No resource/logistics picture on the Command Post board — commander cannot see the incident's allocations, dispatches or stock state from the ICP
- Domain: Incident Command Post + Virtual Simulations
- Status: **OPEN**
- Evidence: Board payload keys (live GET /coordination/27): activation, drfs, critical_tasks, challenges, recent_activity, summary, stakeholders, task_statuses, priorities, posture_doctrine, injects — no allocations/dispatch data. Tasks carry only a free-text resource_request column (CommandCenterController.java:657-661). The real resource state lives in the separate dispatch console (/m/response/dispatch) and warehouse ops, unlinked from the board UI.
- Fix hint: S-M: fold a per-incident allocation/dispatch summary block into board() (one query over allocated_resources where incident_id = activation.incident_id) with a deep link to the dispatch console filtered by that incident (dispatch index already accepts ?incident_id, DispatchController.java:77-80).

## F31 [GAP s3] No operational periods / Incident Action Plan cadence at the Command Post (Situation Reports exist but only ad-hoc on the incident page)
- Domain: Incident Command Post + Virtual Simulations
- Status: **OPEN**
- Evidence: incident_history_reports + POST /{id}/history-reports exist and render on incident-show ('Situation Reports' panel, incident-show.component.ts:252-255), but the Command Post board has no operational-period concept, no IAP objectives per period, and does not even display the incident's situation reports (board payload lacks them). The only period structure is the single fixed 72-hour clock (component.ts:614-625).
- Fix hint: S to surface the incident's history_reports on the board; L for real operational periods (activation_periods table with objectives, period-scoped task rollups, period handover journal entries feeding the AAR).

## F32 [GAP s3] GET+POST /v1/notifications/preferences - self-service channel preferences (in-app/email/SMS + phone) fully implemented, no UI anywhere
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/notification/NotificationController.java:85-110. Live GET with admin token -> 200 {notify_in_app:true, notify_email:false, notify_sms:true...}. grep 'preferences' frontend/src -> 0 hits in any HTTP context. The rest of the bell IS wired: topbar.component.ts:153-185 calls /v1/notifications, /unread-count, /{id}/read, /read-all.
- Fix hint: Add a small preferences popover to the topbar bell (backend contract already complete) - matches the Agent-2 backbone 'control plane' follow-on.

## F33 [GAP s3] POST /v1/response/dispatch/allocations/{id}/agency-request - the 'agency' fulfilment channel writes a journal entry + flips status to Sourcing, but the dispatch console never offers it
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/response/DispatchController.java:550-576 (real journal append, status='Sourcing', 'agency has been notified' message). grep 'agency-request' frontend/src -> 0; dispatch-console.component.ts only calls /sources, /dispatch, /procurement (:375-392). Note agency_resources table also has 0 rows in pg_stat and memory records it as deferred.
- Fix hint: Either build the agency-sourcing tab in the dispatch console or remove the channel; today the endpoint's success message ('agency has been notified') also overstates - no notification is dispatched, only a journal entry.

## F34 [GAP s3] Citizen PHR reference-code tracking
- Domain: portal ↔ system linkage integrity
- Status: **OPEN**
- Evidence: The code is issued and displayed exactly once on the wizard success screen (PortalPublicService.java:283 returns reportCode; landing.component.html:484 renders it) and is never usable again: no public lookup endpoint exists (PortalPublicController.java:33-175 has no report-status route; the only report_code query is the OFFICER-side list filter, PublicReportsController.java:58), no frontend route (app.routes.ts public children :12-31 contain no track/status page), and the reporter is never notified — submitHazardReport sends no SMS/email with the code, and conversion/dismissal in PublicReports
- Fix hint: Add GET /v1/portal/report-status/{code} returning public-safe status (received/under review/converted→linked incident if published/dismissed) + a small 'Track my report' box on the landing wizard; optionally SMS the code on submission (reporter_phone already validated).

## F35 [PARTIAL s3] Response dashboard stat cards are national while the feeds beside them are area-scoped
- Domain: Incident lifecycle depth
- Status: **FIXED 2026-07-06 (Wave 3, pulled forward after the user hit it live: RAS saw pending_tasks=200 + a Mtwara/Lindi/Pwani critical alert) — scope was leaking TWO ways: the statistics block had NO area predicate, and the feed blocks used shared-or-own (region-less national incidents shown to every region). Both /dashboard and /eocc now use the registry's STRICT appendAreaScope for area tiers with a byte-identical national fast path (EOCC watch floor unchanged); board headline activation, by-severity/status rollups and alert counters scoped too (warehouse availability deliberately stays national — shared pool). VERIFIED live: RAS(Dodoma) dashboard 1 active/0 critical/0 tasks + empty critical_alerts; RAS eocc 2 active/0 critical, headline None, Dodoma-only status rollup; admin both endpoints byte-equal national (3/200/3 + Shinyanga/Cyclone alerts; 16 active + Msimbazi headline). Gotcha fixed en route: adding bind params to the alert_stats query made PgJDBC read the jsonb `?` operators as placeholders (409) → jsonb_exists().**
- Evidence: DashboardController.java:78-96 — the six statistics subqueries filter only is_simulation, no jurisdiction predicate, while critical_alerts/recent_incidents/incidents_by_type/regional_data on the same page all go through incidentScope() → appendAreaScopeSharedOrOwn (58-64, 97-119). Live as ras.tanga: statistics.active_incidents=3, pending_tasks=200; psql: national active=3, Tanga-only active=0. A RAS reads national KPIs as if they were their region's.
- Fix hint: Apply incidentScope() to the statistics block (or label the cards 'National').

## F36 [PARTIAL s3] Operational status track vs workflow status — dual axes visible but unreconciled
- Domain: Incident lifecycle depth
- Status: **OPEN**
- Evidence: Both axes stored and displayed side-by-side (show page badges incident-show.component.ts:53-57; registry both badges incidents.component.ts:106; separate action groups 199-210). Coupling is one-way only: resolve()→status Resolved, closeAsRumor()→status Closed (IncidentWorkflowService.java:254,279), but verify/escalate/close and the edit form's free status field (IncidentController.java:302,319) never touch the ladder, and approve() ignores op status. Live contradiction: incident 2 = status 'Resolved' while workflow_status 'waiting_eocc' (psql) — it sits in EOCC's approval queue while operation
- Fix hint: Define reconciliation rules (e.g. op-Close freezes the ladder; approval of a Resolved incident warns) and reflect the caller's permissions in the op buttons.

## F37 [PARTIAL s3] Emergency Supplies (preparedness) edits ledger with no journal — unaudited drift side-door
- Domain: Warehouse management
- Status: **OPEN**
- Evidence: InventoryService.java:114-124 (create) and 156-167 (update) INSERT/UPDATE public.inventory_items — including arbitrary quantity rewrites and moving an item to another warehouse — with zero stock_movements row, bypassing the 'single journal' invariant WarehouseOpsController's header (lines 23-34) claims. Live reconciliation SELECT (ledger vs journal net per warehouse+resource) shows drift on 9 pairs, e.g. wh1/res3 ledger 4925 vs journal −75, wh4/res2 599 vs 6. Same ledger, so stock totals stay consistent — but the audit trail cannot explain these quantities and any 'warehouse_and_stock.manage' 
- Fix hint: Route Emergency Supplies quantity changes through an Adjustment movement (like stock-taking does), or make quantity read-only there and point users at warehouse-ops intake/remove.

## F38 [PARTIAL s3] Warned-area match is region-granularity only — wh.district_id fetched but never used
- Domain: EW ↔ incident linkage
- Status: **OPEN**
- Evidence: EwManagementController.java:70 selects wh.district_id, but the incident match (lines 92-93) compares only i.region_id / region_name. Incident 82 is in Bahi (district 1964, which WAS a warned district) but the code would equally match an incident in any unwarned Dodoma district. incidents carry district_id/district_name (psql: incident 82 → district_id 1964 'Bahi'), so district-precise 'inside the issued warning area' is answerable today and isn't.
- Fix hint: When wh.district_id is not null, require i.district_id = wh.district_id (fall back to region match when the warning is region-wide); expose an 'in_warned_district' boolean per matched incident.

## F39 [PARTIAL s3] Anticipatory (forecast) activation lifecycle — real, but NOT wired to issued warnings
- Domain: EW ↔ incident linkage
- Status: **OPEN**
- Evidence: Real: CommandCenterController.java:142-177 POST /v1/response/coordination/forecast creates a monitoring-posture activation; readiness (lines 266-324) matches active anticipatory plans by hazard keyword + area via AnticipatoryPlanController.matchingPlans (real SQL, lines 253-310); impact-confirm creates+links an incident (response_activations.incident_id, lines ~250-263). Not wired: response_activations has NO warning column (psql column list: trigger_type/hazard_description/affected_areas/forecast_track only); the UI form is free-text + hand-drawn track (command-center.component.ts:818-848) wi
- Fix hint: Add a warning picker to the forecast form (prefill hazard_description/affected_areas/expected_impact from the selected warnings/early_warnings row) and persist response_activations.warning_id; add an 'Open anticipatory post' action on the EOCC Bulletin / warning detail.

## F40 [PARTIAL s3] Repository feeding model: MANUAL EOCC entry + seeders; NOT auto-fed by resolved incidents/warnings
- Domain: Disaster Repository + Reports & Analytics
- Status: **OPEN**
- Evidence: Only three writers of disaster_events exist (grep 'insert into disaster_events'): DisasterEventService (manual, guarded by disaster_repository.enter — held by EOCC/Director/Asst.Director/ICT Admin/Super Admin per role_has_permissions), plus @Profile("local") OfficialDisasterReportSeeder.java:29 (seeded the 72 Validated cards from seed/disaster_report_2025_26.json) and SendaiLocalSeeder. No listener/workflow creates a card when an incident resolves. Assistive tooling exists and works (linkSuggestions ±14-day window Service.java:392-428; pullFromLinks read-only pre-fill :437-457, Controller doc:
- Fix hint: Add a nudge at incident-close (offer 'record in Disaster Repository' with pre-linked incident) or a periodic EOCC worklist of resolved incidents with no repository card; the 3-links reality means the designed operational→repository chain is not happening.

## F41 [PARTIAL s3] Repository data quality: seeded pseudo-regions + near-empty loss figures distort analytics
- Domain: Disaster Repository + Reports & Analytics
- Status: **OPEN**
- Evidence: Only 2 of 76 effects rows carry total_loss_tzs>0 (556B on DE-2024-0001 'National (other regions)' + 6.5M on an Open card, so live 2026 Target C = 0 TZS despite 72 validated disasters — the code is honest, the data is hollow). The seeded rows use pseudo-region names: SELECT shows 2 effects rows with region 'National (…)'; live regionRanking/'Loss concentration' insight consequently told leadership "National (23 regions + Zanzibar), Mwanza and National (other regions) carry 100% of recorded economic losses — prioritising these regions…", which is nonsense as a regional prioritisation statement. 
- Fix hint: Re-seed national-scope effects distributed to real regions or exclude pseudo-regions from regionRanking/insights; unify 'Flood'/'Floods'.

## F42 [PARTIAL s3] Scanner detection → entity tasking round-trip (V131: dispatch→acknowledge→respond→EOCC review/return)
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: Full state machine real: routeToEntity inserts tasking w/ urgency/source/instruction (backend/.../ew/scanner/ScannerController.java:246-281), acknowledge (306-315), respond (319-348), review accept/return (352-382), agency ownership enforced (assertOwnAgency); both UIs wired (pages/preparedness/disaster-scanner.component.ts:493-513 operator; ew-agencies/entity-taskings.component.ts:120-140 entity). LIVE: taskings awaiting=10, responded=1, returned=1; GET /entity-taskings?agency=nemc returns 3. BUT every notice (dispatch line 274, respond 340, review 371/376) uses notifyAllUsers — LIVE 1096 'sc
- Fix hint: Target notifyUsers to the entity's users (users.agency_id) + EOCC role instead of notifyAllUsers; consider email eligibility for Immediate-urgency taskings.

## F43 [PARTIAL s3] Knowledge repository (recovery/knowledge-repository.component.ts + KnowledgeRepositoryController.java)
- Domain: assignments/tasks/provisions + information & knowledge
- Status: **OPEN**
- Evidence: Works as a searchable metadata register: live GET /v1/recovery/knowledge → 5 entries (all Approved), by_type breakdown; ?search=flood → 1 hit (ilike on title/description/hazard_type, KnowledgeRepositoryController.java:48-51); Pending→Approved endpoint real (:100-108); guarded (partner 403 via ModuleGuardFilter /v1/recovery→recovery.view; store/approve need recovery.manage). Gaps: (1) NO document storage — table has no file/path column, store() accepts none, so this 'library' holds only title+summary text; (2) downloads_count is a DEAD column — no download endpoint exists, all values 0; (3) NOT
- Fix hint: Add file upload/download (reuse frameworks storage pattern), an incident_id link, and hide or implement downloads_count.

## F44 [PARTIAL s3] Relief distributions = provisions (recovery/relief-distributions.component.ts + ReliefDistributionController.java) — incident + warehouse linkage
- Domain: assignments/tasks/provisions + information & knowledge
- Status: **OPEN**
- Evidence: Record/confirm flow works live: GET /v1/recovery/relief-distributions → 6 rows, stats {6 confirmed, 8450 qty}; store validates qty>0, confirm flips Pending Verification→Confirmed (:118-126); guarded (partner 403). Incident link: schema + form have incident_id but it is optional and ALL 6 seeded rows show incident '—' (NULL). Warehouse stock: NOT linked — controller never touches inventory_items or stock_movements (grep: stock_movements only in DispatchController/WarehouseOpsController/StakeholderBidding/ResourceCatalogue), so recording a distribution deducts nothing anywhere; resource_id point
- Fix hint: Bridge to the response ledger (write a stock_movement / consume a dispatched allocation), populate damage_assessment_id + distributed_by_user_id, scope the aggregates.

## F45 [PARTIAL s3] Active news article links citizens to a dead incident snapshot (news↔snapshot decoupled)
- Domain: portal ↔ system linkage integrity
- Status: **OPEN**
- Evidence: push-news hardcodes '<a href="/incident/{id}">View the live incident status…' into the article body (IncidentController.java:584), but the snapshot 404s once the incident is unpinned: article id 13 (slug market-fire-kariakoo-trading-area-2) is is_active=true and appears in landing latestNews, its body links /incident/2, yet incident 2 has show_on_portal_map=f (status Resolved) → GET /api/v1/portal/incidents/2 = 404 (observed). Nothing couples resolve/unpin to remove-news or strips the link; citizen lands on the notFound screen (incident-snapshot.component.ts:149,157).
- Fix hint: On unpin/close either deactivate the linked article (reuse removeNews) or rewrite the body link to a static summary; alternatively let incidentSnapshot serve a final read-only state for incidents that WERE published (e.g. keep serving when portal_news_id is set and article active).

## F46 [PARTIAL s3] Register-partner → approval → login round-trip
- Domain: portal ↔ system linkage integrity
- Status: **OPEN**
- Evidence: Register: POST /v1/portal/register-stakeholder → stakeholders row is_verified=false + REAL confirmation SMS/email (PortalPublicService.java:478-518; sms_logs partner_register 'sent' 2026-06-30; pending rows 33-37 in stakeholders). Approve: PUT /v1/stakeholders/{id}/verify sets is_verified + congrats via the shared delivery path (StakeholderAdminController.java:127-157; sms_logs/email_logs stakeholder_verified 4+4 rows, 2026-06-20). Login: verification creates NO user account — PUT /{id}/link-user (:163-184) only links an EXISTING users row, so an admin must separately create the login in User 
- Fix hint: On verify, offer 'create login' (provision users row with set-password email) or extend link-user to create-and-link; otherwise the advertised partner self-service (Open Needs donations) is unreachable for organically registered partners.

## F47 [DEAD s2] V96 roles (Regional/District Planning Officer, Regional/District Logistic Officer, District Commissioner) — dormant; their promised 'comment' capability was deleted
- Domain: User roles & registration
- Status: **OPEN**
- Evidence: psql model_has_roles: 0 users hold any of the five roles. They appear in NO Authz role expression and not in Authz.ALL (Authz.java:56-60). V96__workflow_roles_and_comment.sql:34-58 created incidents.comment and granted 'view + comment' to the advisory roles, but V113__remove_dead_permissions.sql:8-17 deleted incidents.comment ('has no endpoint') — so the advisory design is half-gone. Worse, if ever assigned via the UI: no area can be attached, so e.g. District Logistic Officer (warehouse_and_stock.manage, no view_national) lands in tier NONE → appendWarehouseScope→appendAreaScope→'1=0' (Jurisd
- Fix hint: Either seed/document these as future workflow-stage placeholders and hide them from the create form, or delete them; if kept, they need the same area-attachment fix as the other area roles plus a real comment endpoint.

## F48 [DEAD s2] Resubmit endpoint + UI button (rolled_back_to_* statuses)
- Domain: Incident lifecycle depth
- Status: **OPEN**
- Evidence: workflow.resubmit() only fires from rolled_back_to_district/regional/das/national (IncidentWorkflowService.java:325-331) but rollback() writes only waiting_* values (PREV_STAGE 90-96) — nothing can produce those statuses anymore; psql: 0 incidents in any rolled_back_to_* or legacy waiting_*_approval status; last real use was the pre-rework model (incident 3, 2026-06-12). Live probe on #91: 422 'This incident has not been rolled back, nothing to resubmit'. UI: canResubmit() only for 'rolled_back_to_das' (incident-show.component.ts:323-325) — button can never render; canSubmit()'s rolled_back_to
- Fix hint: Delete the legacy status space (resubmit endpoint, canResubmit, WORKFLOW_STATUSES legacy entries) or re-point resubmit at the real rollback semantics.

## F49 [DEAD s2] Forward-to-Assistant-Director endpoint POST /{id}/forward
- Domain: Incident lifecycle depth
- Status: **OPEN**
- Evidence: forward() whitelists only legacy stages waiting_national_approval/waiting_assistant_director_approval/waiting_director_approval/rolled_back_to_national (IncidentWorkflowService.java:302-303) — unreachable in the DDMC→PS ladder; psql: 0 incidents at those stages; live probe at waiting_ras → 422 'not at a stage that can be forwarded'; no frontend caller (no 'forward' action in incident-show.component.ts). Latent hazard if ever revived: legacy stages have no STAGE_ROLES entry so assertStageAccess() returns without ANY role/area check (104-107), leaving only @PreAuthorize PERM_INCIDENT_APPROVE (In

## F50 [DEAD s2] GET /v1/response/communication/analytics - real alert analytics aggregates, zero consumers
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/response/CommunicationController.java:641. Live GET -> 200 {periods:{last_30d:9}, by_type:[warning:5...], by_severity:...}. grep 'communication/analytics' and '/analytics' in frontend -> only /v1/repository/analytics (sendai-analytics.component.ts:189).
- Fix hint: Chart it in the Communication Center dashboard or delete.

## F51 [DEAD s2] GET /v1/response/declarations/committees - statutory committee hierarchy reference data served, nothing consumes it
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/response/DeclarationController.java:212-217. Live GET -> 200 with NSCDM etc.; disaster_committees has 10 rows. grep 'committees' frontend/src -> 0 in HTTP context. Ties to the known committee-hierarchy structural gap (stakeholder-feedback item J).
- Fix hint: Use it in the declaration form (committee assignment / s.35 donation chain) - the reference data and endpoint already exist.

## F52 [DEAD s2] GET /v1/onehealth/directives/{id}/implementation-history - grouped-by-stakeholder history endpoint, never wired to the directive screen
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/onehealth/OneHealthDirectiveController.java:506-520 (real join over oh_directive_implementation_updates). grep 'implementation-history' frontend/src -> 0; directive-show.component.ts calls only /{id}, PUT /{id}, /escalate, /respond (:499-601).
- Fix hint: Render the per-stakeholder implementation timeline in directive-show, or drop.

## F53 [DEAD s2] GET /v1/onehealth/disseminations/recipients - recipients-preview lookup 'for the creation modal' that the modal never calls
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/onehealth/OneHealthDisseminationController.java:410-424 (comment says 'Recipients lookup for the creation modal'). grep 'disseminations/recipients' + '/recipients' frontend/src -> 0; event-show.component.ts:1286 posts disseminations directly without previewing recipients.
- Fix hint: Wire a recipient-count preview into the dissemination modal (endpoint ready), or remove.

## F54 [DEAD s2] GET /v1/portal/inform/signals - the public operational EO hazard-signals layer is served with rich real data but the public INFORM explorer never requests it
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/inform/web/PortalInformController.java:47-51. Live GET ?level=council -> 200 with per-council Drought signal 6.2, basket coverage, reliability, member scores. inform-explorer.component.ts calls only /portal/inform/structure, /stats, /risk, /risk/{code} (:596-682); grep 'portal/inform/signals' -> 0.
- Fix hint: Add the signals map layer to the public explorer (the internal risk-index UI does consume the authenticated twin /v1/inform/signals).

## F55 [DEAD s2] POST /v1/notifications/test/sms + /test/email (ChannelTestController) - real gateway test-fire endpoints, permission-gated, no UI consumer
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/notification/ChannelTestController.java:32,51 (real sms.sendBulk / mail send, hasAuthority('communication_and_alerts.send')). grep 'notifications/test' frontend/src -> 0. Referenced only by SecurityEnforcementTest. Confidence: medium that this is intentional curl-only ops tooling - but nothing in-product reaches it.
- Fix hint: Either expose a 'send test message' button in Communication Center settings or document it as an ops-only endpoint.

## F56 [DEAD s2] Tables recipient_groups + recipient_group_members (V22) - schema-only; audience resolution uses a hardcoded map instead
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: 0 rows each (live count). Only reference to recipient_group_members anywhere is its CREATE TABLE (db/migration/V22__response_read_models.sql:309,318). CommunicationController never queries the recipient_groups TABLE - groupSummaries() iterates the hardcoded GROUP_ROLES map (CommunicationController.java:60-66,150-160) and 'recipient_groups' elsewhere in that file is the alerts JSON column (:209).
- Fix hint: Drop both tables, or migrate GROUP_ROLES into recipient_groups to make audiences admin-editable.

## F57 [DEAD s2] Table approval_level_definitions (V24) - dead twin of the live approval-workflow config tables
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: 0 rows; only reference in the repo is CREATE TABLE (db/migration/V24__generalized_approval_workflow.sql:84); no Java/TS reference (grep ApprovalLevelDefinition|approval_level_definitions -> migrations only). The live admin screen uses approval_workflow_modules (1 row) + approval_workflow_configurations (ApprovalWorkflowConfigController.java:53-58).
- Fix hint: Drop in a cleanup migration to stop schema drift confusion.

## F58 [DEAD s2] Table oh_event_comments (V15) - One Health event comment thread designed in schema (with parent_id threading) but never ported to code
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: 0 rows; references only in db/migration/V15__one_health_read_models.sql:327-333 and a V72 FK index; grep oh_event_comments|OhEventComment|EventComment across backend/src + frontend/src -> zero runtime hits. OneHealth event-show has no comment UI posting anywhere.
- Fix hint: Port the comment thread (table is ready incl. threading) or drop the table.

## F59 [GAP s2] Delivery status tracking / DLR — absent (confirmed still true); no retry of failed/pending sends
- Domain: notifications + email/SMS coverage
- Status: **OPEN**
- Evidence: sms_logs has external_id/delivered_at/retry_count columns but no code ever writes status='delivered' (grep 'delivered' over backend hits only dispatch/allocation domain statuses); the 6 delivered rows are old seeds (SELECT count(*) FROM sms_logs WHERE delivered_at IS NOT NULL → 6, all pre-June-20 stakeholder/public types); no M-Gov callback endpoint exists; SmsAuditLogger.java:35 only writes sent/failed/pending at send time. Only scheduler touching comms is CommunicationController.java:305 (scheduled-alert dispatch); nothing retries email_logs rows — today's 3 'failed' incident emails (SMTPSen
- Fix hint: Add an M-Gov DLR callback (they return messageId → external_id already stored) and a bounded retry sweep over status='failed' logs; surface failed-stage-email counts on the Communication overview.

## F60 [GAP s2] SMS/email delivery reports (DLR) — confirmed-delivered status from the gateway
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: No inbound DLR/callback endpoint exists anywhere: grep '@PostMapping|@GetMapping .*(dlr|callback|delivery-report|webhook)' over backend/src/main/java returns nothing; sms_logs.delivered_at is written only by the RecoveryLocalSeeder (local/RecoveryLocalSeeder.java:187 seed data). LIVE dashboard counts of 'delivered' (6 sms rows, types public/stakeholder) are seeded, not gateway-confirmed; email_logs delivered=0. Terminal truth is 'sent to gateway', never 'delivered to handset'.
- Fix hint: Expose an M-Gov DLR callback endpoint keyed on external_id and flip sms_logs to delivered/failed.

## F61 [PARTIAL s2] Dist DC is NOT a viewer — it is the working DDMC entry-stage approver (design mismatch with 'DC = area viewer')
- Domain: User roles & registration
- Status: **OPEN**
- Evidence: IncidentWorkflowService.java:57-64: STAGE_ROLES maps 'waiting_ddmc' → Authz.DIST_DC (stage OWNER), area-checked to own district (lines 118-127). Matrix grants Dist DC incidents.approve/close/create/update/publish + tasks.manage (psql role_has_permissions). Live as dc@test.com (district 101 Dodoma Urban): sees 4 district incidents vs admin 24; POST approve on nonexistent id → 404 not 403 (the @PreAuthorize gate PASSES). The 'viewer DC' doctrine was instead implemented as a SEPARATE role 'District Commissioner' (V96__workflow_roles_and_comment.sql:29-31, 'view + comment, no approval') — which ha
- Fix hint: Decide which DC role is canonical; if Dist DC is the DDMC approver by design, update the documented 'RC/DC are area viewers' doctrine; if not, move waiting_ddmc ownership and strip the write permissions.

## F62 [PARTIAL s2] Workflow action buttons are stage-gated but not role-gated in the UI
- Domain: Incident lifecycle depth
- Status: **OPEN**
- Evidence: canApprove/canRollback/canResolve are purely workflow_status-based (incident-show.component.ts:327-347; the comment admits 'The backend still gates WHO may act'); only the Edit link checks a permission (line 274 canEdit). Any officer who can open the incident (e.g. the district DED while it waits at RAS) sees Approve/Roll Back/Resolve and gets a 422 on click — proven live (ras.dar on #2 → 'This stage is owned by EOCC'). Backend enforcement is solid; the UI over-offers.
- Fix hint: Gate buttons on the caller's role matching STAGE_ROLES for the current stage (roles are in the JWT).

## F63 [PARTIAL s2] Stakeholder donations intake (bid receive → warehouse stock)
- Domain: Warehouse management
- Status: **OPEN**
- Evidence: WORKS: StakeholderBiddingController.java:317-388 — receive() writes a donor-traceable inventory_items batch (DON-<bid>-<date>, supplier_donor) + an 'Intake' movement to the chosen, area-guarded store; live bids 1/4/5/6 are 'Received' with matching Intake movements. TWO defects: (a) roll-up at lines 376-385 sums quantity_offered of Received bids, not the actual received_quantity intaken at line 337 — a partial delivery (receive 10 of 25 offered) still counts 25 toward 'Delivered'; (b) live bids 8/11/12 have NULL allocated_resource_id (bid 12 is 'Accepted') — bidAllocationId (lines 881-887) hard
- Fix hint: (a) persist received_quantity per bid and sum that; (b) allow receive() for unlinked bids into a store without allocation roll-up, or repair/withdraw the 3 orphan rows.

## F64 [PARTIAL s2] Fractional quantities vs integer ledger (rounding drift)
- Domain: Warehouse management
- Status: **OPEN**
- Evidence: allocated_resources/dispatch_approvals quantities are numeric(_,2) (live information_schema: 2.50 exists in dispatch_approvals id 8) but inventory_items.quantity and stock_movements.quantity are integer. DispatchSupportService.deductStock line 187 rounds the remainder (`Math.round(available - deduct)`) — approving a 2.5-unit dispatch against a 10-unit batch leaves 8, deducting only 2 while the allocation journal records 2.5 and the movement logs (int)2. Under-deducts/creeps whenever fractional quantities are entered (API accepts doubles).
- Fix hint: Reject non-integer quantities at dispatch/approval boundary, or make the ledger numeric.

## F65 [PARTIAL s2] Orphaned rows: stock in no store + journal rows with no endpoints
- Domain: Warehouse management
- Status: **OPEN**
- Evidence: Live SELECTs: inventory_items id 18 (25 × Rescue Rope, warehouse_type='temporary') has BOTH warehouse_id and temporary_warehouse_id NULL — from a pre-fix donation receive (matching movement 12, also end-less, 2026-06-13; the class doc at StakeholderBiddingController.java:45-47 admits the old bug). This stock is counted in global KPIs (DashboardController.java:166 sums all inventory_items) but appears in no store sheet and can never be dispatched (availableQuantity requires temporary_warehouse_id). Also movement 9 ('Deduction' from agency) is permanently unattributable — stock_movements has no 
- Fix hint: One-time data repair pointing item 18/movement 12 at the actual receiving store; consider a source_agency_id column on stock_movements.

## F66 [PARTIAL s2] Temporary warehouses (CRUD + ledger integration)
- Domain: Warehouse management
- Status: **OPEN**
- Evidence: CRUD real and guarded (TemporaryWarehouseController @PreAuthorize('warehouse_and_stock.manage') on POST/PUT, lines 41-66); temp stores participate fully in intake/transfer/dispatch/borrow via temporary_warehouse_id, live GET /v1/temporary-warehouses → 7 rows, Ilala store holds 325 units. GAP: update() can set is_active=false with residual stock and no check (TemporaryWarehouseService.java:119) — warehouse-ops index and dispatch sources filter is_active=true, so that stock disappears from operational view while DashboardController KPIs still count it; no decommission/transfer-out flow.
- Fix hint: Block deactivation while Σ(inventory_items.quantity)>0, or prompt a transfer-out.

## F67 [PARTIAL s2] "Preparedness during warning": trainings matched by DATE ONLY, no area filter
- Domain: EW ↔ incident linkage
- Status: **OPEN**
- Evidence: EwManagementController.java:120-125 — the training_plans leg of the prep UNION filters only training_start_date/end_date overlap; any training anywhere in the country during the window counts as preparedness for that warned area. The anticipatory_action_plans leg (lines 115-119) does area-LIKE on district_council/coverage_location, so the asymmetry is a code gap, not a design choice.
- Fix hint: Add 'and (t.venue ilike %area% or t.region ilike %area%)' mirroring the plan leg, or label the chip 'national training' when unscoped.

## F68 [PARTIAL s2] Command Post readiness 'early_warnings' panel ignores the activation's areas
- Domain: EW ↔ incident linkage
- Status: **OPEN**
- Evidence: CommandCenterController.java:311-315 — the readiness endpoint (Javadoc: 'Readiness picture for the affected areas') selects the last 10 early_warnings 'where status not in (expired,cancelled)' with NO area predicate, while evacuation_centers and warehouses in the same method ARE area-filtered (ilike any). A Mtwara cyclone post shows Dodoma flood warnings.
- Fix hint: Add 'and affected_regions ilike any (?)' with the same like[] array used for evac centres.

## F69 [PARTIAL s2] DRR 'disasters preceded by a warning' coverage metric — real query, starved data (1.4%)
- Domain: EW ↔ incident linkage
- Status: **OPEN**
- Evidence: EwManagementController.java:157-172 counts disaster_event_links entity_type='early_warning' over validated/archived disaster_events — live: {disasters_total:72, disasters_ew_linked:1, ew_coverage_pct:1.4}. Links are purely manual (DisasterEventService.java:375 insert) and the suggestion helper (linkSuggestions, lines 392-412) offers early_warnings by DATE WINDOW only (±30/14 days) with no area/hazard narrowing — so curating 72 events is noisy manual work and nobody has done it (psql: disaster_event_links has exactly 1 early_warning row).
- Fix hint: Rank linkSuggestions by area+hazard overlap (reuse the report's match SQL) and add a one-click 'auto-link matched warnings' on the event card; until curated, footnote the 1.4% figure as 'links pending' rather than presenting it as EW failure.

## F70 [PARTIAL s2] Incident stage notification body renders area as literal "(null)" for portal-origin incidents
- Domain: notifications + email/SMS coverage
- Status: **FIXED 2026-07-06 (Wave 3) — notifyStage areaLabel(): stored names first, else resolved by id from districts/regions, else the parenthetical is omitted entirely; VERIFIED live: fresh converted incident's stage notification reads "... 'Citizen report: Floods at Handeni verify site' (Handeni, Tanga) has reached ...", area-less incident's notification omits the parenthetical, historical '(null)' rows frozen at 7 with no new ones (independently re-probed).**
- Evidence: IncidentWorkflowService.java:519-521 reads incident district_name/region_name and builds '(" + where + ")' with no null guard; portal-origin incidents leave both name columns null. LIVE: today's row 4771 message = "Incident 'Citizen report: Floods at Handeni' (null) has reached the 'Waiting for RAS' stage…"; psql: 7 of 59 incident_workflow rows contain '(null)' — and the same string went out in the emails.
- Fix hint: Fall back to joining region/district names by id (or omit the parenthetical when both are null) in notifyStage.

## F71 [PARTIAL s2] Warehouse loan notifications bypass the ONE dispatcher (direct insert, ignores notify_in_app preference)
- Domain: notifications + email/SMS coverage
- Status: **OPEN**
- Evidence: WarehouseOpsController.java:659 inserts directly into public.resource_notifications instead of calling NotificationService — no notify_in_app check, no channel eligibility, invisible to the dispatcher's log line. Rows exist (warehouse_loan_return x4, warehouse_borrow x2), so it works, but it is the one writer outside the claimed single backbone (ResourceApprovalController.java:71 only reads).
- Fix hint: Route through notifications.notifyUser with Notice.inApp to restore the single-dispatcher invariant.

## F72 [PARTIAL s2] notifyAllUsers broadcasts for scanner/EW ingest events flood every account's feed
- Domain: notifications + email/SMS coverage
- Status: **OPEN**
- Evidence: ScannerController.java:234/274/340/371/376 and EwBulletinIngestController.java:134 use notifyAllUsers — every one of 107 users gets internal scanner workflow chatter: psql shows 1096 scanner_tasking + 368 ew_bulletin_received feed rows, and the live overview reports in-app unread 432/433 (nobody reads the spam). Functionally real, but drowns the bell for officers with no scanner role.
- Fix hint: Scope scanner events to notifyRoles (EOCC/focal points) and bulletin-received to EW approvers.

## F73 [PARTIAL s2] past-disasters (Mitigation) vs Disaster Repository duplication
- Domain: Disaster Repository + Reports & Analytics
- Status: **OPEN**
- Evidence: Two independent registries record the same real-world events with no sync: past_disasters (6 rows incl. 'Bukoba earthquake 2016', 'Kilosa floods 2019') vs disaster_events (DE-2016-0001 'Kagera (Bukoba) Earthquake, September 2016', DE-2025-0109/DE-2026-0105 'Mafuriko — Kilosa'). PastDisasterService.java:50-121 is a functioning Laravel port (LIVE GET /v1/past-disasters → stats {total:6, withReports:1, geoLocated:2} + byYear chart) focused on narrative/lessons/doc-upload, not Sendai figures. A bridging link type 'past_disaster' exists in LINKABLE (DisasterEventService.java:42) but 0 links of that
- Fix hint: Accept as narrative-vs-loss-DB split but cross-link the overlapping events, or show a 'also in repository' pointer to stop double data entry.

## F74 [PARTIAL s2] Capability matrix vs user's ask ('number of incidents, issued EW, disasters occurred, cost used… everything')
- Domain: Disaster Repository + Reports & Analytics
- Status: **OPEN**
- Evidence: Answerable TODAY (all live-proven): incident counts+breakdowns+casualties (22; /v1/reports/incidents), disasters occurred by year/hazard/region/status (75; /v1/repository/events + yearlySeries), deaths/missing/affected (Sendai A/B: 58 & 27,901 for 2026), infrastructure damage (D: 40 facilities, 133.42km roads), economic loss where data exists (C 2024: 556B TZS, 0.28% GDP), issued EW + effectiveness incl. lead time (53 windows/10 bulletins, 9 warned-incidents, 35h avg lead), in-kind allocation value over a period (109.7M TZS), EW-coverage-of-disasters (1.4%), DRR instruments (30), partners+dona
- Fix hint: The single highest-value close-out is the cost-per-disaster join; everything else on the user's list already resolves to a real number.

## F75 [PARTIAL s2] V92 area-coordinator targeting (users.region_id/district_id → RAS/RC/Reg DC/DAS/Dist DC/DED of affected areas)
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: AudienceService.resolveAreaCoordinators/coordinatorUserIds (backend/.../notification/AudienceService.java:148-207) joins roles×users.region_id/district_id via AreaLookup. LIVE psql: simulated the exact SQL for Tanga → resolves ras.tanga@pmo.go.tz (RAS) + rc.tanga@pmo.go.tz (RC). But seeding is thin: 63/107 users have region_id, only 11 have district_id — district-tier coordinators (DAS/Dist DC/DED) outside the 5 seeded start-regions resolve to nobody (code degrades silently to empty, AudienceService.java:201-206).
- Fix hint: Seed district_id for DAS/Dist DC/DED accounts in all districts, or dissemination to district coordinators silently reaches no one.

## F76 [PARTIAL s2] Role-targeted SMS to internal officers (Directors, RCs, RAS...)
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: Mechanism real (AudienceService.resolve 'role', AudienceService.java:67-74) but LIVE /v1/communication/audiences roles picker shows RC: 31 users 0 phones, RAS: 31 users 0 phones...; psql: only 1 of 107 users has notify_sms=true AND a phone. Role-SMS resolves correctly then reaches essentially nobody; NotificationService SMS branch (NotificationService.java:102-104) likewise.
- Fix hint: Seed users.phone (+notify_sms) for officer accounts — known follow-on from the Communication Center build.

## F77 [PARTIAL s2] Warehouse dispatch-approval notifications (dispatch notes to warehouse officers)
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: Approve/reject notify ONLY the requester, in-app only (backend/.../response/DispatchController.java:336,361 → notify() 650-657 Notice.inApp); LIVE resource_notifications dispatch_approved=2, dispatch_rejected=2 — that leg works. But creating a dispatch request (lines 231-242) inserts the Pending dispatch_approvals row and returns WITHOUT any notification to the source warehouse's manager — the approval queue (GET /approvals, 264-292) is poll-only, so a pending dispatch can sit unseen. No email/SMS on any dispatch event.
- Fix hint: On dispatch-request insert, notify users holding warehouse approval authority (in-app + email), mirroring notifyStage.

## F78 [PARTIAL s2] EW push to partner stakeholders (proactive external push, beyond the stakeholder-portal feed read)
- Domain: Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- Status: **OPEN**
- Evidence: No automatic external push to partners on EW publish — publish's broadcast is in-app only (EwWarningLifecycleController.java:286-290) so partner ACCOUNTS get a bell notice, but the stakeholders registry (17 phones/19 emails live) is reached only by operator-triggered sends: bulletin disseminate 'area' audience (AudienceService.resolveAreas matches stakeholders.region_id/district_id, AudienceService.java:118-140), CommCenter 'stakeholders' audience, or alert group 'response_agencies' (Partners role, 5 members live in /form-data). Stakeholder-portal issued-alerts feed read was verified previousl
- Fix hint: If policy requires partners to be pushed on publish, add a stakeholders leg to the publish afterCommit hook.

## F79 [PARTIAL s2] Scenario injects (script/fire/resolve, fire-on-board-read) — functional but NEVER used since its build-day E2E; zero rows in DB
- Domain: Incident Command Post + Virtual Simulations
- Status: **OPEN**
- Evidence: Endpoints CommandCenterController.java:410-478; due-injects auto-fire on board GET at :391-396; UI card + form command-center.component.ts:486-513, 1002-1031. LIVE: psql 'select * from activation_injects' = 0 rows; board 27 injects=[]. The mechanism is real (verified E2E 2026-07-03 per memory) but has no production usage, and injects only fire when a user happens to load the board — no scheduler despite @EnableScheduling being on (DmisPlatformApplication.java:20).
- Fix hint: Add a @Scheduled(fixedDelay=60s) firer for due injects so timed events land even when nobody is watching the board (S); add target DRF/role addressing + expected-action field so injects test a specific section, not the shared feed (S).

## F80 [PARTIAL s2] Impact-confirmed incidents are created without region/district, silently degrading the board's 'Area readiness' panel to unfiltered national lists
- Domain: Incident Command Post + Virtual Simulations
- Status: **OPEN**
- Evidence: confirmImpact insert (CommandCenterController.java:243-252) writes title/description/severity/location_description but NO region_id/region_name/district_id; readiness() (:266-300) then finds region_name blank, areas stays empty, and the 'areas.size()=0' branch disables all filtering ('? = 0 or ...'). LIVE: GET /coordination/27/readiness returned areas=[] yet evacuation_centers=5, warehouses=14 — presented in the UI as area readiness for the activation (component.ts:300-341) though it is the whole country. Also skews area-scoping in findOr404 since the incident carries NULL region.
- Fix hint: S: in confirmImpact, resolve the first affected_areas entry against the regions table (AreaLookup helper already exists per jurisdiction work) and stamp region_id/region_name on the created incident; alternatively pass affected_areas through to readiness for forecast-born incidents.

## F81 [PARTIAL s2] Task assignee picker quality
- Domain: assignments/tasks/provisions + information & knowledge
- Status: **OPEN**
- Evidence: TaskController.java:167-169: form-data returns ALL 107 users as assignable — code comment admits 'Source filters User::where(is_active)... the local users read model has no such column yet — every local account is assignable'. Picker is also not area- or role-filtered, so a district officer can assign a task to any account nationwide (incl. partner/agency logins). Board also caps at 200 rows with no paging (TaskController.java:90, stats say 393) and ~285/583 incident_tasks rows have NULL incident_id (activation-generated), which always pass the shared-or-own area filter.
- Fix hint: Filter form-data users by is_active + jurisdiction/role; add paging or raise limit with server-side paging.

## F82 [PARTIAL s2] Relief distributions 'Confirm receipt' UI silent failure
- Domain: assignments/tasks/provisions + information & knowledge
- Status: **OPEN**
- Evidence: relief-distributions.component.ts:172-174 and knowledge-repository.component.ts:167: confirm()/approve() subscribe with next-only handlers — if backend returns 403 (user has recovery.view but not recovery.manage, e.g. DAS/ICT Admin who hold view-only per role_has_permissions) the click does nothing with no error message; list silently stays unchanged.
- Fix hint: Add error callbacks surfacing e.error.detail like save() already does.

## F83 [PARTIAL s2] Public subscribe → alert delivery chain
- Domain: portal ↔ system linkage integrity
- Status: **OPEN**
- Evidence: Subscribe live-proven: POST /api/v1/portal/subscribe → {subscriptionId:SUB-2026-0007} and row persisted (psql: SUB-2026-0007|Audit Test Subscriber|0712000111|t); PortalPublicService.java:331-354. Delivery consumers are real: AudienceService.java:50-58 (all_subscribers/subscribers_by_hazard JSONB match), :118-139 (resolveAreas matches subscriber_location text — the column subscribe actually writes), wired into Communication Center compose and EW disseminate (EwProductController.java:241-334, defaults to area+hazard+coordinators). Live send evidence in logs: sms_logs ew_dissemination 13 'sent' (
- Fix hint: Honor channel prefs in AudienceService.collect (skip phone when channels excludes sms, etc.); consider an optional auto-disseminate hook on warning publish filtered by alert_level_priority.

## F84 [PARTIAL s2] PHR report_code generation: count(*)+1 with no unique index
- Domain: portal ↔ system linkage integrity
- Status: **OPEN**
- Evidence: PortalPublicService.java:270-271 builds PHR-YYYY-NNNNN from select count(*)+1; pg_indexes on public_hazard_reports shows NO unique index on report_code (only pkey + 3 non-unique). Two concurrent submissions, or any future row deletion, silently mints duplicate citizen reference codes — the known DMIS count(*)+1 recurring pattern. Currently 0 duplicates in 17 rows (psql group-by check). alert_subscriptions.subscription_id uses the same pattern but IS protected by a unique index (alert_subscriptions_subscription_id_key), so a race there errors instead of duplicating.
- Fix hint: Unique index on report_code + generate from a sequence (or retry-on-conflict), matching the fix pattern used elsewhere.

## F85 [UNVERIFIED s2] Live-probe caveat: 'anonymous' 200s on /ew endpoints are the local-profile dev persona, not a production auth hole
- Domain: Dead code + unproductive endpoints hunt
- Status: **OPEN**
- Evidence: Anonymous GET /api/ew/stakeholders -> 200 with stakeholder PII and anonymous POST /api/ew/disseminate reached the method body (422 business validation, not 401) on the running stack. Cause: LocalSecurityConfig (@Profile('local'), LocalSecurityConfig.java:53-58) lets LocalAuthFilter authenticate tokenless requests as a full-role persona, satisfying @PreAuthorize. The !local chain (SecurityConfig.java:44 + SecurityPaths.java:33 'no EW path is publicly open') requires a bearer token. Production behavior not testable from this environment - flagging so the dead /ew endpoints are understood as dead
- Fix hint: When removing the 5 dead /ew handlers, no prod security change is needed; if they are kept, re-verify the !local chain blocks them anonymously in a staging deploy.

## F86 [DEAD s1] Legacy workflow statuses shipped as live filter options; unused transition() helper
- Domain: Incident lifecycle depth
- Status: **OPEN**
- Evidence: form-data workflow_statuses returns all 22 entries including 10 unreachable legacy ones (live: rolled_back_to_district/das/regional/national, waiting_*_approval...) which the registry renders as filter options (incidents.component.ts:63-65, IncidentController.java:191, IncidentOptions.java:90-101); psql: 0 incidents in any of them. IncidentWorkflowService.transition() (462-466) has no callers (grep across response/: only the definition). resolveStageRecipients 'rolled_back_to_district' case (570) equally unreachable.

## F87 [DEAD s1] GET /v1/ew/scanner/stats - redundant duplicate of the stats block already embedded in the /detections payload the UI consumes
- Domain: Dead code + unproductive endpoints hunt
- Status: **FIXED 2026-07-06 (Wave 3) — standalone handler deleted; VERIFIED live: /stats → 404 (admin + mow, independently re-probed), /detections still returns the embedded stats block driving the console's 4 stat cards (UI screenshot clean).**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/ew/scanner/ScannerController.java:131-132; the detections endpoint returns Map.of('detections', rows, 'stats', stats()) at :128 and disaster-scanner.component.ts:449 consumes that. Live GET /stats -> 200 {total:60,new:35,...}; grep 'scanner/stats' frontend/src -> 0.
- Fix hint: Remove the standalone /stats handler.

## F88 [DEAD s1] GET /v1/settings/translations/map - full EN/SW key map endpoint with no consumer (public uses /v1/portal/i18n, admin uses the paged list)
- Domain: Dead code + unproductive endpoints hunt
- Status: **FIXED 2026-07-06 (Wave 3) — /map handler deleted after a fresh zero-consumer grep; VERIFIED live: GET → 405 (path still matched by the sibling /{id} PUT/DELETE mappings — expected, handler gone; independently re-probed), Translations admin list/create/edit/delete round-trip intact (214 rows), /v1/portal/i18n unchanged at 214 keys == pre-fix baseline.**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/settings/TranslationController.java:75. Live GET -> 200 {lbl_about:{en,sw}...}. translations.component.ts calls only list/PUT/POST/DELETE on the base (:125-176); portal-i18n.ts hydrates from /v1/portal/i18n. grep 'translations/map' -> 0.
- Fix hint: Delete, or repoint PortalLabels hydration at it if a single authoritative map is wanted.

## F89 [DEAD s1] LocationDto record - referenced by nothing in main or test
- Domain: Dead code + unproductive endpoints hunt
- Status: **FIXED 2026-07-06 (Wave 3) — file deleted after a fresh zero-reference grep (main+test); build compiles clean and boots (V140/V141 run proves the jar).**
- Evidence: backend/src/main/java/tz/go/pmo/dmis/common/web/LocationDto.java:6 (public record); class-name grep across backend/src (main+test) -> 0 external references (dead-class scan output).
- Fix hint: Delete the file.

## F90 [PARTIAL s1] Dispatch receive-side: no destination-stock update for incident deliveries
- Domain: Warehouse management
- Status: **OPEN**
- Evidence: Direct answer to the round-trip question: allocations dispatched to an INCIDENT are consumption — In Transit→Deployed→Delivered (ResourceAllocationController.java:336-346) only stamps timestamps/received_by; no destination store exists and no stock is created anywhere, which is defensible relief-distribution semantics. Destination stock IS updated in the flows that have a destination store: transfers, borrows/returns, procurement deliveries, donation receipts (all verified above). The one hole in the loop is the 'Returned' case reported separately. deployed_from_warehouse is informational only

## F91 [PARTIAL s1] Standalone routes m/content-management/sms-management + email-management reachable only by typing the URL - components now live embedded in Communication Center
- Domain: Dead code + unproductive endpoints hunt
- Status: **CLOSED 2026-07-06 (already fixed, no Wave-3 code change) — the exact redirects the ledger asked for already exist in app.routes.ts (committed 32a50c5); VERIFIED live: both URLs redirect to /m/content-management/communication-center and the embedded SMS/Email management panels render there (puppeteer 5/5).**
- Evidence: app.routes.ts defines both; no routerLink/navigate/modules.ts nav entry composes them (route-vs-nav cross-check: not in modules.ts paths; Communication Center embeds them instead - communication-center.component.ts:119-121 '<page-sms-management [embedded]=true>'). Components themselves are alive and working.
- Fix hint: Remove the leftover standalone routes or add redirects to communication-center.

## F92 [PARTIAL s3] Scanner entity-taskings READ endpoint not agency-scoped — any authenticated agency user can read other agencies' taskings
- Domain: Dissemination flows / least privilege (found by the Wave-2 F13 adversarial re-check, 2026-07-06)
- Status: **FIXED 2026-07-06 (Wave 3) — GET /entity-taskings now carries the mutation guard's exact rule: agency login (users.agency_id set) reads only its own inbox (explicit other-agency filter → 403 ProblemDetail w/ detail+message; missing filter forced to own agency), national/EOCC (agency-less, same bypass as assertOwnAgency + ewAgencyGuard) reads all; awaiting/responded counters scoped to the effective filter; VERIFIED live + independently re-probed: mow→tma 403, mow→own 200, admin→tma 200; EOCC dispatch console still lists all 12 taskings across 6 agencies (UI screenshot), MoW inbox (F13) unaffected.**
- Evidence: assertOwnAgency (ScannerController.java:70-77) guards only the MUTATIONS (acknowledge/respond/review); GET /v1/ew/scanner/entity-taskings?agency=X returns any agency's taskings to any authenticated agency user — live-proven: mow@pmo.go.tz successfully read agency=tma taskings (expected 403, got 200). Pre-existing behavior, NOT introduced or worsened by F13 (ScannerController has no working-tree changes); consistent with the fine-grained-RBAC follow-on that per-action gates are still TODO.
- Fix hint: Apply the same assertOwnAgency check (with an EOCC/national bypass) to the GET handler, mirroring the mutation guards.

## F93 [PARTIAL s2] Official-source portal report INSERT (PortalPublicService.reportHazard) also omits region_name/district_name
- Domain: Incident lifecycle depth (found by the Wave-3 F24 fixer, 2026-07-06)
- Status: **OPEN**
- Evidence: The trusted institution/sector/ministry path (PortalPublicService.reportHazard ~line 296, straight to a waiting_eocc incident) has the same *_name omission F24 fixed in the citizen conversion path. V141 backfilled its existing rows and F70's id-fallback keeps its notifications clean, so the symptom is currently invisible — but each NEW official-source incident is born with NULL names until this INSERT is fixed too.
- Fix hint: Mirror the F24 subselects (names by id) in the reportHazard INSERT; one-file change in PortalPublicService.java.

