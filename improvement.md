# e-MAAFA / DMIS — Improvement Plan & Progress Ledger

> Living document. Source of truth for the honest full-system audit (`DMIS-LINKAGE-AUDIT.md`, 154 findings) and the fix campaign that follows it (`DMIS-AUDIT-FIX-LOG.md`). Last updated 2026-07-09.

## 1. How to read this

The audit graded every subsystem live (real API + SQL evidence, then an adversarial re-check of every serious accusation). Verdicts: **✅ WORKING** (verified) · **🟡 PARTIAL** (works, stated gaps) · **🔴 GAP** (designed, missing) · **🚨 FAKE** (pretends to work) · **⚫ DEAD** (unreachable/unused). Of 154 findings, **63 were already WORKING**; this plan tracks the **91 non-WORKING items** plus F92-F116 found during the fix campaign and fresh reassessments — each fixed item carries live verification evidence, not a claim.

**Backlog health (2026-07-09, after Wave 3 + the RBAC trim + fresh reassessment pass + F06/F15/F17/F18/F19/F20/F22/F37/F38/F39/F40/F41/F42/F43/F44/F45/F46/F94/F104 live fixes + F93/F100/F101/F103/F106/F109/F110/F111 code guards):** 116 tracked (91 audit + F92/F93/F94 found during the campaign + F95-F116 fresh reassessment) — **42 resolved · 74 open** (🟡PARTIAL 44 · ⚫DEAD 13 · 🔴GAP 16 · ❔UNVERIFIED 1).

| Status | Count |
|---|---|
| ✅ Fixed & live-verified (Wave 1, committed `924b08e`) | 7 |
| ✅ Fixed, live-verified + adversarially re-checked (Wave 2, committed `2abb5a5`) | 6 |
| ✅ Fixed & live-verified + independent re-probes (Wave 3, committed `b7093f5`): F05, F12, F24, F35, F70, F87, F88, F89, F91 (already fixed, closed), F92 | 10 |
| ✅ Fixed & live-verified (2026-07-08/09 continuation): F06, F15, F17, F18, F19, F20, F22, F37, F38, F39, F40, F41, F42, F43, F44, F45, F46, F94, F104 | 19 |
| ⬜ Remaining — P1 (severity 4) | 0 |
| ⬜ Remaining — P2 (priority 2: severity 3 plus promoted F93; incl. new F93/F95/F96/F99/F101/F102/F105/F106/F107/F108/F110/F111/F112/F113/F114/F115/F116) | 29 |
| ⬜ Remaining — P3 (priority 3: severity 1–2 cleanup/polish, excluding promoted F93; incl. new F97/F98/F100/F103/F109) | 45 |

**Ledger reconciliation (2026-07-09):**
- `DMIS-AUDIT-FIX-LOG.md` has **116 F-headings** and all 116 have status lines.
- Status parity after the F104 closure: **42 fixed/closed**, **74 open**, zero missing/unknown statuses.
- Open by type tag: **PARTIAL 44**, **DEAD 13**, **GAP 16**, **UNVERIFIED 1**.
- Open by raw severity tag: **s4 = 0**, **s3 = 28**, **s2 = 44**, **s1 = 2**.
- Fix-order buckets: **P1 = 0**, **P2 = 29**, **P3 = 45**. P2 is one larger than raw s3 because **F93** is severity 2 but promoted into the incident-lifecycle P2 workstream.
- Newer findings **F92-F116**: **3 fixed** (`F92`, `F94`, `F104`) and **22 open** (`F93`, `F95-F103`, `F105-F116`).
- This is exact for documented findings only; it is not a claim that no further issue can be discovered through deeper tests.

**Resolved-item confidence audit (2026-07-09):**
- The 42 resolved IDs are: `F01`, `F02`, `F03`, `F04`, `F05`, `F06`, `F07`, `F08`, `F09`, `F10`, `F11`, `F12`, `F13`, `F14`, `F15`, `F16`, `F17`, `F18`, `F19`, `F20`, `F21`, `F22`, `F24`, `F35`, `F37`, `F38`, `F39`, `F40`, `F41`, `F42`, `F43`, `F44`, `F45`, `F46`, `F70`, `F87`, `F88`, `F89`, `F91`, `F92`, `F94`, `F104`.
- None of those 42 IDs appear as active bullets in the Remaining sections.
- Strongest confidence: 16 items have live verification plus adversarial/independent re-checks (`F03`, `F04`, `F05`, `F10`, `F11`, `F12`, `F13`, `F16`, `F24`, `F35`, `F70`, `F87`, `F88`, `F89`, `F91`, `F92`).
- Live-verified but not independently re-smoked in this reconciliation pass: 26 items (`F01`, `F02`, `F06`, `F07`, `F08`, `F09`, `F14`, `F15`, `F17`, `F18`, `F19`, `F20`, `F21`, `F22`, `F37`, `F38`, `F39`, `F40`, `F41`, `F42`, `F43`, `F44`, `F45`, `F46`, `F94`, `F104`). Keep them resolved, but re-run their smoke checks before any production release sign-off.
- Known caveats do not reopen the fixed items, but remain important: `F12` intentionally relies on F05 journal events for command-role history; `F13` exposed and then led to fixed `F92`; `F24` exposed still-open official-source follow-up `F93`; `F91` was already fixed by redirect behavior rather than new code.
- Challenge-review correction resolved: `F94` was reopened when the first RBAC trim missed part of the area-role family, then closed after V144/V154 plus fresh-login API/browser smoke proved the issued-alerts-not-EW boundary for seeded area roles and SQL proved the no-user variants have no forbidden grants.
- Reexamination 2026-07-09: current source still supports the 42 resolved statuses by static code/route/migration review plus F104 browser smoke, and no resolved ID appears as a Remaining bullet. Frontend production build passed earlier for the F104 map-base cleanup; backend package passed with the local Maven/JDK path after the response dashboard queue SQL fix found during F104 smoke. Full backend tests remain blocked by F102: `mvn test` compiles main/test sources, then Spring tests repeatedly retry Hikari against local Postgres and do not complete without the live DB.
- Reexamination caveat: `F01` production handlers remain removed, but `SecurityEnforcementTest.ewDisseminateDeniesFieldRole()` still references the deleted `/ew/disseminate` endpoint. This is tracked under open `F102` test-suite cleanup, not as an F01 reopen.

**Whole-ledger reassessment (2026-07-09):**
- Scope: all **116** documented F-items were rechecked at the documentation + static source level: fix-log headings, `- Status:` lines, active Remaining bullets, backend routes/services, migrations, frontend route/API references, and the highest-risk implementation surfaces.
- Result: **one resolved item was reopened (`F94`)** by the current source review, then **F06, F15, F17, F18, F19, F20, F22, F37, F38, F39, F40, F41, F42, F43, F44, F45, F46, F94, and F104 were fixed and live-verified**; **no new F117** was justified by this pass. The exact production picture is now **42 resolved / 74 open**.
- Reconfirmed fixed side: the 42 fixed/closed IDs are still absent from active Remaining bullets; key fixed-path checks still line up for deleted EW boundary handlers, user area/stakeholder attachment, per-incident forecast linkage, backbone SMS eligibility for critical incident workflow handoffs, stakeholder-scoped One Health dissemination acknowledgments, dead outbox scaffold removal with V153 table drop, bulk resource approval, scoped fulfilment-source redirects, exercise scenario library/MSEL launch, partner approval-to-login provisioning, area-role issued-alerts-not-EW boundary, local-first governed map rendering plus district/region/national map focus, district-precise EW report matching, warning-linked anticipatory activation, resolved-incident repository intake, Sendai analytics quality, knowledge repository document upload/download/incident linkage, relief distribution incident/source/stock-journal linkage, active news article to incident snapshot continuity, partner registration-to-login/Open Needs continuity, targeted scanner tasking notifications, cost-used aggregation, ICS command roles, ops timeline, MoW taskings + agency scoping, real warehouse stock counts, Emergency Supplies stock-journal reconciliation, dashboard scope fix, and stale route removals/redirects.
- Reconfirmed open side: `F96` storage hardening is auth-only for restricted prefixes, not row/jurisdiction scoped; `F105`/`F114` have INFORM and deterministic scanner engines but no governed model-inference, satellite-scene, exposure-dataset, or impact-layer contracts; `F107`/`F115` still have raw SweetAlert/Leaflet HTML interpolation; `F100`, `F101`, `F103`, `F106`, `F109`, `F110`, and `F111` now have guards/invariants aligned in code but still need migrated-DB/live role/simulation/browser smoke before closure.
- RBAC hardening note 2026-07-09: action controls for One Health directive issuance and Open Needs NDMF training disbursement now read `one_health.directive` and `resource_allocation.dispatch` from the user's permission set, matching the backend gates and keeping control in System Settings -> Roles & Permissions. This is a hardening correction only; it does not change the 42/74 status count.
- Sector workflow hardening note 2026-07-09: DLNA contribution is split from assessment creation through `damage_assessment.key_section`, sector-bound users see and key only their assigned Annex-1 section(s), and One Health dissemination registry/show/recipient lookup are PMO/national desk permissions (`one_health.disseminate`, `one_health.approve`, `one_health.manage`) rather than general One Health view. V155 applies the role-matrix seed/trim. This is a hardening correction only; it does not change the 42/74 status count.
- Test evidence: frontend `npm run build -- --configuration production` passed on 2026-07-08 after the F103 route cleanup, after the F104 map-base registry cleanup, after the F106 public-report conversion UI, after the F38 EW report UI update, after the F39 command-post/EOCC linkage UI, after the F40 repository-intake UI, after the F41 Sendai analytics quality UI, after the F43 knowledge repository document UI, after the F44 relief distribution source-selection UI, after the F45 incident-snapshot contract update, after the F46 registration/approval UI update, after the F06 scenario-library UI update, and after the F15 notification preference/UI update. Backend `JAVA_HOME=/home/kaijage/tools/jdk /home/kaijage/tools/maven/bin/mvn -q -DskipTests compile` passed on 2026-07-08 after the F37 service fix, after the F38 report/forecast fix, after the F39 warning-link implementation, after the F40 repository-intake implementation, after the F41 analytics-quality implementation, after the F42 scanner-recipient targeting implementation, after the F43 knowledge repository upload/download implementation, after the F44 relief distribution stock-link implementation, after the F45 portal snapshot fix, after the F22/F46 partner-login provisioning fix, after the F06 scenario-library launch fix, and after the F15 incident-notification SMS eligibility fix. F37 was live-smoked through the inventory API and SQL after Flyway applied V146/V147. F38 was live-smoked through the EW report API, a SQL old-vs-new area comparison, and an incident forecast negative case. F39 was live-smoked through Flyway V148, issued-warning picker/API list, warning-code activation creation, duplicate live-post rejection, board/readiness readback, and stand-down retaining `warning_id`/`warning_code`. F40 was live-smoked through the repository incident-worklist API, one-click creation of `DE-2026-0137` from incident `31`, card/link readback, worklist removal, and duplicate-create HTTP 409 guard. F41 was live-smoked through Flyway V149, `/repository/analytics` API, SQL hazard normalization (`Floods=30`, no `Flood`), real-region ranking exclusion of `National (...)`, data-quality counts `74/1/2`, and replacement of the false loss-concentration insight with a sparse-loss completeness insight. F42 was live-smoked with a controlled scanner detection through dispatch->acknowledge->respond->return->re-respond->accept; SQL proved `scanner_tasking`, `scanner_returned`, and `scanner_accepted` went only to NEMC+EOCC (`2/2`, zero unexpected/missing), `scanner_response` went EOCC-only (`1/1`, zero unexpected/missing), and the controlled rows were deleted with follow-up SQL confirming zero leftovers. F43 was live-smoked through Flyway V150, knowledge list incidents/stats, multipart document upload linked to incident `31`, authenticated download returning a 133-byte PDF attachment, downloads_count increment `0 -> 1`, approve transition to Approved, and exact cleanup of the two controlled rows/files with follow-up checks confirming zero leftovers. F44 was live-smoked through Flyway V151, relief distribution list `stock_sources`, controlled create for incident `31` / resource `1` / temporary warehouse `1`, pending row proof with inventory unchanged at `90`, confirmation movement `76` as `Removal` / `relief_distribution` / `Completed`, inventory decrement `90 -> 89`, repeat-confirm idempotence, missing-incident 422 rejection, and exact cleanup/restoration with zero controlled leftovers. F45 was live-smoked with the real active article `market-fire-kariakoo-trading-area-2`: `/portal/news/...` returned HTTP 200 with `/incident/2`, `/portal/incidents/2` returned HTTP 200 with `Resolved`, `pinnedToMap=false`, `publishedViaNews=true`, and unpublished/nonlinked incident `1` still returned HTTP 404. F22/F46 were live-smoked with a controlled public registration `codex-f46-1783509948@example.test`: register HTTP 201, first verify HTTP 200 with `accountProvisioned=true` and user `114`, repeated verify HTTP 200 with the Partners role count staying `1->1`, one unused future reset token before reset, reset HTTP 200, login HTTP 200 as `Partners`, real JWT Open Needs HTTP 200 with `stats.canPledge=true`, SQL mirror links `41 <-> 114`, `partner_role_count=1`, and `reset_used=true`, then exact cleanup with zero controlled leftovers. F15 was live-smoked with a controlled Dist DC preference and Critical incident workflow handoff: blank-phone SMS opt-in returned HTTP 422, valid phone opt-in returned HTTP 200, Critical incident `102` produced one in-app row plus one pending `sms_logs` row through the backbone, Moderate control `103` produced zero SMS rows, and cleanup restored user `4` plus deleted all controlled incident/notification/SMS/email rows. Backend regression tests remain **blocked by F102**: `mvn test` compiles sources but then repeatedly retries Hikari against local Postgres and was interrupted after more than two minutes; the stale `/ew/disseminate` security test under `F102` still must be cleaned before backend tests can be trusted.
- F06 live-smoke evidence: Flyway V152 applied on the local DB; API listed seeded scenario `TZ-CYCLONE-FLOOD-HEALTH-72H` with 3 incident templates and 6 MSEL events; controlled scenario `CODEX-F06-1783510520` created 2 incident templates, 3 MSEL events, and 1 IC roster entry; launch returned run `1`, activations `48/49`, incidents `100/101`, 190 DRF tasks, 4 copied injects, 2 roster enrollments, and board reads proved scenario metadata, EOCC Officer as IC, expected-action injects, 15 DRF lanes, and compressed due-time firing. SQL totals matched exactly, then cleanup removed the controlled scenario/run/incident/activation/inject rows and follow-up SQL showed zero `CODEX-F06` leftovers while the seeded scenario remained.
- F17 live-smoke evidence: controlled One Health event `CODEX-F17-1783517460` and dissemination `11` targeted TMA stakeholder `1`; PMO/admin without stakeholder got HTTP 403, `X-Local-Roles: MDA Focal` got HTTP 200, SQL showed `acknowledgement_status='acknowledged'`, `acknowledged_by=5`, and a non-null ack timestamp; non-recipient dissemination `12` to MoH stakeholder `4` returned HTTP 403 and stayed pending; cleanup removed the controlled event/disseminations/pivots and follow-up SQL showed zero leftovers.
- F18 fixed evidence: removed the unused AggregateRoot/domain-event/outbox runtime classes, removed active-outbox claims from application/config comments, and added V153 to drop `platform.outbox_event`. Backend compile passed and source grep found no remaining Java references to the deleted event/outbox classes. Live DB verification now passed: local Docker backend started against the migrated `dmis-pg` database, `platform.flyway_schema_history` shows V153 success, `to_regclass('platform.outbox_event')` returned null, and there are zero failed Flyway migrations.
- F19/F20 fixed evidence: controlled live API smoke against the rebuilt prod-profile backend proved bulk approval approved two valid controlled requests, reported a bad id as a per-id failure, and refreshed the pending queue truthfully. Fulfilment-source smoke proved warehouse, procurement, and agency persistence; non-pending update rejection; strict parent-incident scoping; scoped RAS warehouse options; out-of-area warehouse 404; and own-region warehouse success. Headless Chrome smoke on the Angular approvals page proved pending checkboxes, Bulk Approve enablement after selection, and Warehouse/Agency/Procurement drawer controls with zero failed requests/page errors. Controlled rows and the temporary RAS approval grant were cleaned up, with follow-up SQL showing zero leftovers.
- F104 fixed evidence: browser smoke on the local stack proved DC/RAS/EOCC dashboard area payloads and role-scoped maps; district Response dashboard was bounded/masked to Dodoma Urban, RAS Response dashboard was bounded/masked to Dodoma with 7 district paths, EOCC retained national maps, DC/RAS EOCC routes denied, and Mitigation dashboard, GIS Map, Risk Assessment picker, One Health dashboard, MoW flood, DMD consolidated, and EW region picker all rendered nonblank local-vector maps with zero external tile requests, failed requests, bad responses, or page errors. The first smoke exposed a real `response/dashboard` SQL-spacing 500, which was fixed in `DashboardController.incidentQueue()` before closure; F23 stays open for the broader dashboard role matrix.
- Production honesty: this reassessment is strong static/code-ledger evidence plus clean frontend/backend compile gates, not a final release certificate. A production sign-off still needs backend regression tests in a DB-capable/hermetic environment, a migrated database, API smoke tests for the 42 resolved items, and role-based browser walkthroughs for the high-risk open modules.

**179-claim revalidation program (started 2026-07-08):**
- Full claim universe: **154 original audit claims + 25 later/fresh claims = 179 claims**. The 116 F-items are only the non-working/fresh issue ledger; the original **63 WORKING** claims are not honorary closures.
- Working-claim rule: every original `✅ WORKING` claim is now treated as an affirmative production claim that must survive fresh source, migration, role, route, API, and smoke-test review. If a working claim has an uncovered production gap, create the next F-number; if an existing F already covers the gap, cross-reference it instead of duplicating.
- First crosswalk corrections: original claim #107, "Drill-isolation seal ... sims cannot move real stock/money/comms", remains **qualified** because `F111` only has backend guard code so far and still needs live finance/drill smoke verification. Original claim #75, "Budget & Finance module ... working", is real but not production-clean because `F110` and `F111` remain open pending migrated/live verification. Original claims #133/#134, frontend dead-code hygiene and API mapping, do not prove role-consistent usability because `F95`, `F103`, `F109`, `F112`, and `F113` show permission/fallback mismatches. Original claims #149/#150, incident portal push/news, no longer carry the F45 dead-snapshot caveat after live public API verification, but they still need full working-claim crosswalk review before production sign-off. Original claim #53/#80, EW analytics, no longer has the F38 district-precision or F39 anticipatory-linkage caveats, but public warning/incident map linkage remains open under `F26`. Original claim #11, partner registration row creation, is no longer accepted as sufficient by itself; F22/F46 now add the missing verified approval-to-login/Open Needs round-trip.
- Next audit action: build a working-claim crosswalk for all 63 original WORKING claims before treating any of them as production-complete, then use role-by-role browser/API smoke tests to confirm or downgrade each claim.

**Documentation consistency rules:**
- This file summarizes; `DMIS-AUDIT-FIX-LOG.md` carries the per-finding evidence.
- Do not mark an item resolved here unless its fix-log status is `FIXED` or `CLOSED` with verification.
- If a new issue is discovered, assign the next F-number in the fix log first, then update this summary count and the correct P1/P2/P3 bucket.
- If a fixed item still appears under a Remaining section, remove it from Remaining but keep its validation evidence below.
- State uncertainty directly: use `OPEN`, `UNVERIFIED`, or an explicit caveat instead of implying production readiness.

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

No active P1 remains after F94 was closed by the V144/V154 area-role RBAC trim and fresh-login/API smoke. Continue with the P2 queue below unless a new severity-4 issue is discovered.

## 6. ⬜ Remaining — P2 (priority 2; mostly severity 3)

### Dead code + unproductive endpoints hunt
- **F32** 🔴 — GET+POST /v1/notifications/preferences - self-service channel preferences (in-app/email/SMS + phone) fully implemented, no UI anywhere
  - *Progress 2026-07-08:* Added topbar bell preferences panel wired to `GET/POST /v1/notifications/preferences` for in-app/email/SMS toggles and phone. Frontend production build passed. Still OPEN until live browser/API smoke proves load/save persistence and notification read/read-all behavior remains intact.
- **F33** 🔴 — POST /v1/response/dispatch/allocations/{id}/agency-request - the 'agency' fulfilment channel writes a journal entry + flips status to Sourcing, but the dispatch console never offers it
  - *Progress 2026-07-08:* Added the agency-request channel to the dispatch drawer, populated agency stock-line options, and hardened the backend to validate the selected stock line plus return real agency-user notification counts. Backend compile + frontend production build passed. Still OPEN until live smoke proves option visibility, mismatch rejection, journal/status write, and truthful notification behavior.

### Incident lifecycle depth
- **F23** 🔴 — Officer pending queue on DED/RAS landing (what is reported to them / what they reported)
  - *Progress 2026-07-08:* Added `needs_action` and `submitted_by_me` to `GET /v1/response/dashboard` using strict incident scope, no-simulation filtering, current role-to-workflow-stage mapping, and `submitted_by_user_id = actingUserId()`. Added dashboard cards with links, severity, workflow label, area, and timestamp. Backend compile + frontend production build passed. Still OPEN until live role smoke proves DED/District/RAS/Regional/national users only see their own actionable rows and submitted-by-me follows the real submitter.
- **F36** 🟡 — Operational status track vs workflow status — dual axes visible but unreconciled
  - *Fix:* Define reconciliation rules (e.g. op-Close freezes the ladder; approval of a Resolved incident warns) and reflect the caller's permissions in the op buttons.
- **F93** 🟡 — Official-source portal report INSERT also omits region_name/district_name
  - *Fix:* Implemented in `PortalPublicService.reportHazard`: official-source incidents now resolve/store area names like F24. Keep open until live submission verifies the inserted incident carries `region_name`/`district_name`.
- **F101** 🟡 — Manual incident creation is not guarded against out-of-area targets; form-data also exposes all assignable users
  - *Fix:* Implemented in `IncidentController`: create/update validate region/district existence and own-area targeting for area-tier callers; assignable users are permission + area scoped and `assigned_to_user_id` is server-validated. Keep open until live role-smoke confirms own-area create, foreign-area rejection, foreign-assignee rejection, and national behavior.
- **F106** 🟡 — Public Reports conversion UI cannot assign a district for untagged citizen reports, even though the backend conversion contract requires/allows it
  - *Fix:* Implemented in code 2026-07-08: public-report rows expose area ids/names; untagged report conversion now has Region -> District assignment, posts `district_id`, validates target district/region/caller area server-side, and shows inline errors. Keep open until live role/browser smoke proves the convert path and out-of-area rejects.

### Dissemination flows — EW bulletins, subscribers, stakeholders/partners, Communication Center, One Health, approval chains, scanner tasking, warehouse dispatch
- **F17** ✅ — One Health dissemination acknowledge endpoint (stakeholder ack round-trip)
  - *Fixed 2026-07-08:* Acknowledge now resolves the caller's One Health stakeholder from user/stakeholder/agency links and updates only that stakeholder's dissemination row. Verified with backend compile, local API smoke for stakeholderless 403, recipient MDA Focal 200 + SQL ack proof, non-recipient 403 with pending row preserved, and exact cleanup of controlled One Health rows.
- **F28** 🔴 — EW → subscribers on publish (alert_subscriptions auto SMS/email when a warning is published)
  - *Fix:* Wire publish() afterCommit to AudienceService.resolve('subscribers_by_hazard') + resolveAreas for the warned districts, reusing the existing disseminate machinery.
- **F42** ✅ — Scanner detection → entity tasking round-trip (V131: dispatch→acknowledge→respond→EOCC review/return)
  - *Fixed 2026-07-08:* Scanner tasking notifications now use targeted recipients instead of `notifyAllUsers`: tasking/returned/accepted go to the tasked agency users plus EOCC, response goes to EOCC reviewers, and Immediate taskings are email-eligible only for that targeted audience. Verified with backend compile, controlled API round-trip through both review outcomes, exact SQL recipient checks against 107 users, and cleanup of the smoke rows.

### EW ↔ incident linkage
- **F26** 🔴 — Public portal map: warnings + incidents + bulletins co-plotted but NO linkage indicator
  - *Progress 2026-07-08:* Added `districtName` to the public incident-map payload and an "Inside warned area" popup row for pinned incidents whose region/district matches active warning coverage, using warning severity precedence and district-name normalization. Backend compile + frontend production build passed. Still OPEN until live public-map smoke proves district-level and region-level matches render correctly while outside-area incidents stay unflagged.

### Incident Command Post + Virtual Simulations
- **F29** 🔴 — No real-time tracing anywhere: zero SSE/WebSocket in the entire codebase; board data refreshes only on user action
  - *Fix:* S-M: add a 20-30s polling interval on the open board (trivial, matches existing architecture) or an SSE endpoint streaming task_activity_log rows for the activation; @EnableScheduling is already on for the backend side.
- **F30** 🔴 — No resource/logistics picture on the Command Post board — commander cannot see the incident's allocations, dispatches or stock state from the ICP
  - *Fix:* S-M: fold a per-incident allocation/dispatch summary block into board() (one query over allocated_resources where incident_id = activation.incident_id) with a deep link to the dispatch console filtered by that incident (
- **F31** 🔴 — No operational periods / Incident Action Plan cadence at the Command Post (Situation Reports exist but only ad-hoc on the incident page)
  - *Fix:* S to surface the incident's history_reports on the board; L for real operational periods (activation_periods table with objectives, period-scoped task rollups, period handover journal entries feeding the AAR).

### portal ↔ system linkage integrity
- **F34** 🔴 — Citizen PHR reference-code tracking
  - *Progress 2026-07-08:* Implemented public-safe `GET /v1/portal/report-status/{code}`, `/track-report` page, nav/hero entry points, and report-success deep link. Backend compile + frontend production build passed. Still OPEN until live migrated smoke proves status transitions and published-only incident linking; optional SMS/email code delivery remains follow-up.
- **F45** ✅ — Active news article links citizens to a dead incident snapshot (news↔snapshot decoupled)
  - *Fixed 2026-07-08:* Public incident snapshots now serve incidents published either by portal map pin or by an active linked News & Events article, while unpublished/nonlinked incidents still 404. Verified with backend compile, frontend production build, SQL proof for active article `market-fire-kariakoo-trading-area-2` linking `/incident/2`, live `/portal/news/...` 200, live `/portal/incidents/2` 200 with `pinnedToMap=false` and `publishedViaNews=true`, and live `/portal/incidents/1` 404 as the unpublished control.
- **F46** ✅ — Register-partner → approval → login round-trip
  - *Fixed 2026-07-08:* Public partner registration now requires email, approval provisions the linked Partners login and set-password invite, the admin UI reports the account-provisioning result, and the resulting partner can sign in and reach Open Needs as its own stakeholder. Verified with backend compile, frontend production build, controlled registration/approval/reset/login/Open Needs API smoke, SQL link/role/token evidence, local pending email logs with live gateways disabled, and zero controlled leftovers.

### notifications + email/SMS coverage
- **F15** ✅ — Backbone SMS channel + per-user notify_sms preference — never exercised by any event
  - *Fixed 2026-07-08:* Critical incident workflow handoffs now make the central notification backbone SMS-eligible, still gated by each recipient's `notify_sms` preference and valid phone. The preference API rejects SMS opt-in without a Tanzanian mobile number, and the topbar shows that validation message. Verified with backend compile, frontend production build, blank-phone 422, valid opt-in 200, Critical incident workflow smoke producing an audited pending `sms_logs` row with M-Gov intentionally unconfigured, Moderate negative control producing zero SMS rows, and exact cleanup/restoration of all controlled rows.
- **F27** 🔴 — Silent events: disaster declarations, CP/AAP activation, assessments, support pledges accept/decline, budget/finance, recovery/relief, content publication — no notification at all
  - *Fix:* Wire notifyStage-style calls into declaration approval, ActivationService, pledge review, and budget-tier approvals; or correct the two javadoc claims so the dispatcher's contract matches reality.
- **F95** 🟡 — Communication Center permission split: route/menu is Content Management, overview/audience APIs require Communication & Alerts, log APIs require Content Management, send APIs require Communication & Alerts
  - *Fix:* Pick one canonical module permission model for the Communication Center (likely `communication_and_alerts.view/send`), mirror it in `access.ts`, `ModuleGuardFilter`, and the content log controllers, and hide/disable compose tabs for view-only users.
- **F108** 🟡 — Risk Frameworks/Publications permissions are split between Content Management and Prevention & Mitigation, while `/v1/frameworks` reads are only `isAuthenticated()`; 2026-07-07 live re-check proved a no-permission local persona gets `200` on frameworks while a mapped content API returns `403`
  - *Fix:* Decide whether `disaster_risk_frameworks` belongs to Content/Publications, Prevention & Mitigation, or an explicit shared permission set; then align frontend route guards, `ModuleGuardFilter`, and `FrameworkController` read/write authorities.
- **F112** 🟡 — Hazard Monitor is routed as Content Management but its real actions require the separate Hazards domain permission
  - *Fix:* Decide whether Threat/Hazard Monitor belongs to Content Management or Hazards/Prevention; align the frontend route, `ModuleGuardFilter`, controller authorities, and action-button visibility to that one permission model.
- **F113** 🟡 — Content Management still hosts Settings/User-Management submodules with different backend permission families
  - *Fix:* Move Translations/Agencies to their owning modules or change their backend gates to content permissions; align menu, route guard, `ModuleGuardFilter`, controller authorities, and button visibility.

### Frontend security / production hardening
- **F107** 🟡 — SweetAlert raw HTML strings bypass Angular escaping across operational dialogs
  - *Fix:* Replace raw `html:` string interpolation with Angular-owned modals or safe DOM construction/`escHtml` for every API value used in SweetAlert titles/options/bodies; add a regression case with HTML in names/messages.
- **F115** 🟡 — Leaflet tooltips still interpolate live API/operator values outside Angular escaping in Response, DMD, and cross-agency maps
  - *Fix:* Standardize every `bindTooltip`/`bindPopup`/`divIcon.html` string on the existing `escapeHtml` helper or DOM `textContent`; add a map-regression fixture with HTML in incident titles, locations, agency areas, and reference-marker names so these paths cannot silently regress.

### File/attachment authorization
- **F96** 🔴 — Restricted `/storage/**` operational files are auth-only, not row/jurisdiction-scoped
  - *Fix:* Replace direct static links for `reports/`, `assessments/`, `incident_photos/`, `incident_videos/`, `warnings/`, and `dissemination_uploads/` with authorized download endpoints that look up the owning row and run the same area/module guard before streaming bytes.

### Warehouse management
- **F25** 🔴 — Allocation 'Returned' discards deducted stock — no re-intake, no movement
  - *Progress 2026-07-08:* Implemented Returned handling for dispatched allocations: warehouse/temporary stock is re-intaked to the original source, agency dispatches restore agency_resources, Return stock_movements are written, and the dispatch journal records returned quantity/time/user/notes. Backend compile passed. Still OPEN until live migrated smoke proves stock restoration, movement rows, and idempotence for warehouse, temporary warehouse, and agency sources.
- **F37** ✅ — Emergency Supplies (preparedness) edits ledger with no journal — unaudited drift side-door
  - *Fixed 2026-07-08:* Emergency Supplies creates now journal positive new stock as `Intake`; edits lock the existing line, block resource reclassification while stock is present, journal warehouse moves as `Transfer`, and journal quantity deltas as `Adjustment_Increase` / `Adjustment_Decrease`. V146 posts one-time `emergency_supplies_reconciliation_20260708` adjustments for historical zonal warehouse/resource drift; V147 adds an idempotent actor fallback for deployments without the local admin seed. Verified with backend compile, live API create/edit/reject/move/zero-out smoke, Flyway V146/V147, and SQL reconciliation returning `0` drift pairs / `0` units.

### Disaster Repository + Reports & Analytics
- **F40** ✅ — Repository feeding model: MANUAL EOCC entry + seeders; NOT auto-fed by resolved incidents/warnings
  - *Fixed 2026-07-08:* Repository now has an EOCC "Resolved Incident Intake" worklist of resolved/closed live incidents with no repository link, candidate-card linking, and a one-click `from-incident` create path that opens an event card and writes the `incident` link in one transaction. Verified with backend compile, frontend production build, live worklist API, `DE-2026-0137` creation from incident `31`, card/link readback, worklist removal, and duplicate-create HTTP 409 guard.
- **F41** ✅ — Repository data quality: seeded pseudo-regions + near-empty loss figures distort analytics
  - *Fixed 2026-07-08:* V149 normalizes repository `Flood` to `Floods`; Sendai analytics excludes `National` / `National (...)` effects from regional rankings, suppresses the false loss-concentration insight when real-region loss is absent, and surfaces sparse-loss/pseudo-region data quality. Verified with backend compile, frontend production build, Flyway V149, `/repository/analytics` API, and SQL checks showing `Floods=30`, no `Flood`, real-region ranking without pseudo-national rows, and counted/loss-bearing/pseudo-region effects `74/1/2`.

### assignments/tasks/provisions + information & knowledge
- **F43** ✅ — Knowledge repository (recovery/knowledge-repository.component.ts + KnowledgeRepositoryController.java)
  - *Fixed 2026-07-08:* V150 adds incident/document metadata to the repository table; the backend accepts multipart PDF/DOC/DOCX uploads, serves authorized downloads while incrementing `downloads_count`, and returns incident/file metadata; the UI exposes incident selection, document upload, document actions, a documents stat, and incident links. Verified with backend compile, frontend production build, Flyway V150, live multipart upload/download/approve API smoke, SQL row/file verification, and cleanup of the controlled rows/files.
- **F44** ✅ — Relief distributions = provisions (recovery/relief-distributions.component.ts + ReliefDistributionController.java) — incident + warehouse linkage
  - *Fixed 2026-07-08:* V151 links relief distributions to a single warehouse or temporary warehouse source and stored stock movement. The backend now requires incident/source/resource linkage, blocks simulation incidents, scopes list stats/lookups, records actor/assessment/incident area metadata, and confirms by deducting source inventory plus writing one completed `relief_distribution` stock movement idempotently. The UI requires incident/resource/source selection and exposes incident/source/movement/actor fields. Verified with backend compile, frontend production build, Flyway V151, live create/confirm/idempotence/negative API smoke, SQL movement/inventory proof, and exact cleanup/restoration of the controlled smoke row.

### User roles & registration
- **F22** ✅ — Partner approval now creates and links a login for organic registrations
  - *Fixed 2026-07-08:* Verification now provisions a Partners-role `users` row from the stakeholder email, mirrors `stakeholders.user_id` and `users.stakeholder_id`, records a hashed one-time set-password token, and sends/logs a partner-login invite. Existing conflicting user emails are not silently merged. Verified with the same F46 live smoke: register 201, verify 200/user created, reset 200, login 200 as `Partners`, Open Needs `canPledge=true`, SQL mirror/role/reset proof, and zero controlled leftovers.

### Budget & Finance / NDMF controls
- **F110** 🟡 — Budget creation lets area finance actors misstate the budget tier/scope used by approval ceilings
  - *Fix:* Implemented in `BudgetController` + V145: sub-national budget scope is derived from the caller's actual area, national scope choices validate matching ids, and `disaster_budgets_scope_area_chk` enforces scope-vs-area consistency. Keep open until V145/live role-smoke verifies it.
- **F111** 🟡 — Direct NDMF incident disbursement skips incident area guard and simulation isolation
  - *Fix:* Implemented in `BudgetController.ndmfDisburse()`: requires a valid incident, applies strict incident area guard, and blocks table-top simulation incidents before cash moves. Keep open until live role-smoke proves in-area success, out-of-area rejection, and simulation blocking.

### Production readiness / CI, integrations & AI/ML
- **F102** 🟡 — Backend regression tests are not self-contained; Spring tests still require a live dev Postgres even though Testcontainers dependencies exist
  - *Fix:* Move `@SpringBootTest` suites to Testcontainers/dynamic datasource wiring, or split live-DB smoke tests from hermetic CI gates. The default developer command should compile and fail fast without a manually running `localhost:5440` database.
- **F105** 🔴 — AI/ML readiness is not architected yet: current analytics are real deterministic engines/scanners, not a governed model-inference platform
  - *Fix:* Add an ML integration contract before presenting AI-assisted features: model registry/versioning, feature snapshot references, prediction event/audit tables, confidence/explanation fields, human review/disposition, RBAC, retention policy, and an async integration bus that is actually wired.
- **F114** 🔴 — DMD Impact Analysis lacks a real satellite/exposure geospatial layer and direct INFORM-context overlay
  - *Fix:* Build the centralized map concept into a national GIS impact-analysis layer: satellite/EO layer catalogue, scene metadata, exposure datasets, hazard footprint storage, backend overlay/intersection results, direct INFORM risk + operational signal overlays, and a DMD layer switcher that can compare satellite view, hazard footprint, population/assets/exposure, preparedness resources, and INFORM context before generating the impact bulletin.
- **F116** 🟡 — Component linkage, AI-readiness, and multiscale production capacity are not captured as executable contracts
  - *Fix:* Create a system-linkage control plane before extracting microservices or shipping AI: component dependency matrix, API/event contracts, wired outbox/event bus, shared rate limits/cache/read models, SLO/load-test profile for district/region/national/surge usage, AI feature-snapshot/prediction contracts, and operator-facing degradation states for external GIS/notification/AI dependencies.

### Supporting documentation / architecture control
- **F99** 🟡 — System Design Document is materially stale against current migrations, RBAC, incident ladder and outbox reality
  - *Fix:* Refresh the SDD from the current code/migrations before using it as an implementation contract: migration corpus is now V1-V151 (135 files), permission-matrix/`hasAuthority` gates are live, the incident ladder is DDMC→DED→RDMC→RAS→EOCC→Director→PS with skip-if-unstaffed automation, and the outbox is designed but still not wired as the actual module-integration backbone.

## 7. Target Architecture Plan — Linkage, AI, And Multiscale Scale-Up

This is the production plan for making every component highly linked, captured, and safe to scale.

**Current verdict:** the technology choice is viable as a modular monolith: Spring Boot 3 / Java 21, Angular 18, PostgreSQL, Flyway, OpenAPI, Actuator health, async notification delivery, and a configurable Hikari pool are all acceptable foundations. It should not be presented as crash-proof international infrastructure yet. The missing pieces are mostly platform primitives, not a need to throw away the stack.

**Component-linkage control plane:**
- Build a canonical component map for each module: owner, frontend routes, API paths, database tables, permissions, row-scope rule, emitted events, consumed events, public/stakeholder exposure, and known audit items.
- Convert the existing dead outbox into the integration spine: every major operational fact should emit an event (`IncidentCreated`, `WarningPublished`, `BulletinGenerated`, `AssessmentVerified`, `StockMoved`, `BudgetCommitted`, `DonationDisbursed`, `PartnerVerified`, `AiPredictionReviewed`).
- Add contract tests for every event/API payload and require each new workflow to declare its upstream/downstream dependencies.
- Create read-model projections for dashboards, public portal counters, command board state, Sendai analytics, and executive watch instead of recomputing everything from live operational tables during surge.

**AI/ML production plan:**
- Phase 0 — data governance: classify all incident, EW, finance, GIS, health, stakeholder, and public-report fields; define retention, PII rules, and RBAC for AI outputs.
- Phase 1 — feature snapshots: create immutable `feature_snapshot` records for incident/EW/GIS/INFORM/resource state at the time a model runs.
- Phase 2 — model registry: add `model_registry`, `model_version`, `model_run`, and `prediction_event` tables with checksum, input snapshot id, confidence, explanation, suggested action, and expiry.
- Phase 3 — human-in-command review: no AI output should directly publish warnings, disburse money, move stock, or close incidents. Operators accept/reject suggestions, and that disposition becomes audit data.
- Phase 4 — priority use cases: incident triage assist, warning-to-incident likelihood, DMD impact severity estimate, exposure summarization from satellite/GIS layers, resource-demand forecast, missing-data detection, and public-report duplicate clustering.
- Phase 5 — monitoring: drift, hallucination/quality review for any LLM text, model-performance dashboards, rollback to deterministic rules, and offline fallback when model services are unavailable.

**Multiscale capacity model:**
- District scale: form submissions, incident list/detail, local warehouse and public-report triage must stay low-latency with strict row scope.
- Regional scale: RAS/RC dashboards should use precomputed regional read models and not national live aggregates.
- National scale: EOCC/Director/PMO dashboards should use cached/read-model state with explicit staleness timestamps.
- Surge scale: public landing, public report intake, warning maps, stakeholder issued-alerts, SMS/email fan-out, PDFs, GIS layers, and command dashboards should be protected by edge caching, shared rate limiting, async workers, and queue-depth monitoring.
- AI/GIS scale: satellite scenes, exposure intersections, INFORM overlays, and model predictions should run as async jobs against immutable snapshots, not inside user click request threads.

**Microservice sequence after hardening:**
- Extract notification/integration first, then analytics/read models, then EW ingestion, then public/stakeholder portal services.
- Keep incident command, finance ledger, stock movement, and approval workflows in the monolith until idempotency, event contracts, row scoping, and audit timelines are proven.

## 8. ⬜ Remaining — P3 (priority 3, polish/cleanup)

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
- **F103** 🟡 — Generic `/m/:slug` fallback masks bad or legacy module URLs as polished but nonfunctional pages
  - *Fix:* Implemented in code 2026-07-08: unknown authenticated `/m/:slug` and `/m/:slug/:item` routes now load a real not-found screen and the placeholder `ScreenComponent` was deleted; frontend production build passed. Keep open until browser smoke proves bad module URLs show not-found while known explicit module URLs still load real screens.

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
- **F47** ⚫ — V96 planning/logistic/advisory roles are semantically unfinished: comment capability was deleted, but User Management can now assign them with areas and V99 gives planning/logistic variants real finance permissions
  - *Fix:* Either hide/delete these roles until advisory workflows exist, or rebuild the comment/advisory capability and include planning/logistic variants in the RBAC + finance guard review (`F94`, `F110`, `F111`).
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

### Recovery scope/data integrity
- **F97** 🟡 — Recovery list rows are partly area-scoped, but stat cards, breakdowns, incident pickers and some mutations stay national / unguarded
  - *Fix:* Apply the same recovery area predicate to `stats`, `by_*`, and incident form-data queries; on create/status/confirm, area-guard any supplied `incident_id` and the target row before mutation.
- **F98** 🟡 — Strategic Projects `entry_id` uses `max(id)+1` before insert; uniqueness exists, but concurrent creates race into a duplicate-key failure
  - *Fix:* Generate `SP-` ids from the inserted row id, a sequence, or retry-on-conflict; keep the existing unique constraint as the last line of defense.

### portal ↔ system linkage integrity
- **F100** 🟡 — Public Reports triage list is area-scoped, but its stat cards are national
  - *Fix:* Implemented in `PublicReportsController.index()`: stats now reuse the same scoped/status/search predicate and params as the visible triage list. Keep open until live area-role smoke proves card totals match the scoped rows.
- **F109** 🟡 — Public Reports frontend route permission requires Communication & Alerts while the backend treats the desk as incident triage
  - *Fix:* Implemented in `access.ts`: `/m/response/public-reports` now requires `incidents.view`, matching the backend. Keep open until live browser/API role-smoke confirms incident users can enter and communications-only users cannot.
- **F83** 🟡 — Public subscribe → alert delivery chain
  - *Fix:* Honor channel prefs in AudienceService.collect (skip phone when channels excludes sms, etc.); consider an optional auto-disseminate hook on warning publish filtered by alert_level_priority.
- **F84** 🟡 — PHR report_code generation: count(*)+1 with no unique index
  - *Fix:* Unique index on report_code + generate from a sequence (or retry-on-conflict), matching the fix pattern used elsewhere.

## 9. Larger builds flagged by the audit (new modules, sized)

These exceed a defect-fix — they are net-new capability the audit recommends for the user's stated ambitions:

- **ICS command structure (M)** — incident commander / section chiefs / org chart per activation; today tasks assign to users but nobody commands the incident. (F05)
- **Unified per-incident operations timeline (M)** — one master log merging workflow history + tasks + dispatch + warehouse movements + comms; today these are 3 disconnected trails. (F12)
- **Real-time tracing (M)** — no SSE/WebSocket anywhere; the Command Post board is poll-only. (F29)
- **System-linkage and AI control plane (L)** — component dependency map, event/API contracts, capacity model, read-model projections, and governed AI prediction workflow. (F105/F116)

## 10. Working method (the honesty gate)

Every wave: parallel fixers on disjoint files → one rebuild → boot check → **run each fixer's live VERIFY script** (with a regression check on adjacent behavior) → mark the ledger item FIXED *only* with the observed evidence → commit with explicit staging. No item is 'done' on a code diff alone.


## 11. Re-validation record — Wave 1 (2026-07-06)

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

## 12. Validation record — Wave 2 (2026-07-06, committed `2abb5a5`)

Method: 4 parallel verifier agents (one per track), each running live API + independent SQL cross-checks + UI screenshots via real-login Puppeteer, followed by **4 independent skeptic agents instructed to REFUTE each pass** (fresh tokens, own SQL, own test rows). All 4 verdicts: **CONFIRMED** — the skeptics reproduced the decisive observations byte-for-byte.

| Track | Decisive observed evidence |
|---|---|
| F03 forecast badge | 6-key block on all incidents; hazard guard proven against a SQL-verified area+time overlap; controlled positive → covered:true w/ exact 33h lead; district precision held; both badges rendered |
| F04+F16 cost rollup | recorded/cash/in-kind arms each proven == independent SQL (incl. 109,715,000 in-kind the first verifier missed and the skeptic closed); 400-not-500 validation; CSV real values; all test rows cleaned |
| F10+F11 EW report | 53→8 == SQL distinct; one row per warning×region w/ correct min/max; demotions + NULL-hazard preservation verified; summary identity holds; no 500s across ranges |
| F13 MoW inbox | inbox visible to mow@pmo.go.tz with content == API; acknowledge round-trip + exact revert; TMA regression clean; found NEW pre-existing gap → logged as **F92** |

Notes from the re-check worth keeping: the backend was restarted mid-run at 02:43 by another session with identical behavior before/after (confirms the deployed jar carries this code); shared-DB test rows from concurrent verifiers transiently and *correctly* flipped EW classifications (family match working as designed); zero VERIFY-W2 rows remain.

## 13. Validation record — Wave 3 (2026-07-06, committed `b7093f5`) + F94 partial RBAC trim (committed `55b2a45`)

Method: 5 parallel fixer agents on strictly disjoint file sets → ONE rebuild → boot check (V140/V141 applied cleanly) → each fixer's live VERIFY script executed by the orchestrator → every failure investigated to root cause → independent spot re-probes of each decisive claim with fresh tokens/SQL. Failures triaged honestly, none glossed:

| Track | Result | How it was proven |
|---|---|---|
| F05 ICS roles | ✅ 17/17 in substance | appoint→journal→auto-relieve-with-handover→vacant all observed; SQL duplicate-active blocked by the partial unique index; 403 for non-privileged; org-chart panel screenshot. 2 script "fails" were the script expecting 400 where this codebase returns 422; the UI "fail" was the test string-matching lowercase against CSS-uppercased text — panel renders fully. |
| F12 ops timeline | ✅ 24/25, 1 explained | per-source counts == origin tables; re-probed independently (workflow 18==18, budget 1==1, the 5M disbursement leads the log); the "anonymous 200" is the documented local-profile dev persona — pre-existing show/list endpoints behave identically (F85). |
| F24+F70 area names | ✅ 12/12 | incidents 88/91 backfilled (Kyela/Mbeya, Handeni/Tanga); fresh convert carries both names; notification reads the real area; area-less incident omits the parenthetical; 0 rows left with id-set-name-null (re-probed 0\|0); historical '(null)' frozen at 7. |
| F92+F87 scanner | ✅ 30/30 | mow→tma 403 / mow→own 200 / admin→any 200 (re-probed); /stats 404; EOCC dispatch console still lists 12 taskings across 6 agencies (screenshot); MoW inbox unaffected. |
| F88+F89+F91 dead code | ✅ all | /map 405 (handler gone, sibling /{id} mappings still path-match — expected); portal i18n unchanged at 214 keys; F91 honestly closed as already-fixed (redirects existed, `32a50c5`) — verified, not re-implemented. |
| F35 dashboard scope (user-reported) | ✅ | TWO causes found: statistics block had NO area predicate; feeds used shared-or-own (region-less incidents leaked to every region). Both /dashboard and /eocc now use the registry's STRICT scope for area tiers, national byte-identical fast path. RAS Dodoma/Arusha/Kigoma/Dar all probed scoped; admin unchanged. En-route gotcha: jsonb `?` operator + bind params → PgJDBC 409 → jsonb_exists(). |
| F94 RBAC trim (user-reported) | ✅ fixed after reopen | V144 removed One Health/EW authoring/command-tier/partner-portal residues across the area-role family; V154 removed residual `early_warning.view`; fresh-login Chrome/API smoke for RAS, Reg DC, DED, DAS, Dist DC, and RC proved EW hub/report/API denied, Response Issued Alerts open, EOCC/Executive Watch/One Health denied; EOCC and Partner regressions passed. District Commissioner/planning/logistic variants have zero seeded users, so they were DB-verified for forbidden grants rather than browser-smoked. |

Process incidents kept honest: one restart attempt silently failed (backgrounded chain aborted at a stale pid; old jar kept serving) — caught by checking which pid owned :8080 and the jar mtime BEFORE running any verification; without that check the whole wave would have been "verified" against a jar not containing it.
