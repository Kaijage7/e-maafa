# National data integration research for e-MAAFA / DMIS

> **Honesty contract:** This document describes **what data should integrate where**, **how**, and **with what legal/technical gates**.  
> It does **not** claim that NIDA, NBS, LATRA, NAPA, IDSR, TMA pull APIs, or satellite exposure are **live** in DMIS today.  
> Current platform status: EW **agency bus** + **impact-support (INFORM)** + integration **registry** (`planned` / `configured`) + geo/INFORM harmonisation.  
> **Mark `integration_endpoints.status = live` only after MoU + dual-proved adapter.**

**Audience:** PMO-DMD, TMA, MoH, MoW, NBS, NIDA, LATRA, VPO/DoE (NAPA/NAP), ICT implementers  
**Related:** `V187` integration tables, `DmdImpactSupportService`, `ew_agency_submissions`, `geo_name_aliases`, space02 §6

---

## 1. Design principle (impact-based early warning)

```text
  Entity hazard layer (TMA, MoW, GST, MoH, …)
        │  colour / tier  +  measured values (mm, level, cases, …)
        │  per selected geography only
        ▼
  Agency bus  →  PMO consolidated day map
        │
        ▼
  Impact-support overlays (must not invent entity colour):
        • INFORM risk / H / V / C
        • Exposure (people, assets, infrastructure)
        • Optional sector feeds (health, transport, water)
        ▼
  PMO paint / directives / products / anticipatory action
```

**TMA-style dual representation (your rainfall example):**

| Layer | Meaning | Example |
|-------|---------|--------|
| **Area colour / tier** | Qualitative severity for map paint (Yellow / Orange / Red) | District A = **Yellow**, District B = **Red** |
| **Measured values** | Quantitative observations/forecasts for that area only | A: 34 mm, 54 mm, 32 mm · B: 98 mm, 67 mm |
| **Unselected areas** | No colour, no forced values | Blank / null — not zero pretending “no rain” |

DMIS should store **both**:

1. **Category** (tier/colour) for consolidation & UI legend  
2. **Value series / thresholds** (JSON or typed observations) for impact scoring and audit  

Never overwrite TMA colour with INFORM colour. Impact-support already scores **beside** entity tiers (`impact-support-v2`).

---

## 2. Integration modes (how data enters DMIS)

| Mode | When to use | DMIS landing | Examples |
|------|-------------|--------------|----------|
| **A. Agency bus submit** | Entity already in EW multi-agency model | `ew_agency_submissions` → consolidated + impact-support | TMA, MoW, GST, MoH, MoA, NEMC (today’s native path) |
| **B. Pull adapter (scheduled)** | Official API/file drops | Adapter → validate → bus or staging table → `integration_messages` | Future TMA product feed, MoW river gauges |
| **C. Verify-only** | Sensitive identity | Call out → yes/no + token; **no full citizen dump** | NIDA CIG verification |
| **D. Bulk reference load** | Slow-changing census/admin stats | Staging → `exposure_*` / INFORM indicators | NBS population by district/ward |
| **E. Event / case push** | Health/agri surveillance events | One Health / EW MoH channel | e-IDSR / DHIS2 priority diseases |
| **F. Programme code map** | Adaptation/recovery finance | `external_identity_map` + recovery projects | NAPA/NAP programme codes |
| **G. Logistics exposure** | Road/network risk | Impact-support LATRA proxy layer | LATRA road corridors, closures |

All external traffic should log **`integration_messages`** (idempotency, hash, status). Core DRM tables stay SoR; adapters never dual-write silently.

---

## 3. System-by-system research → DMIS use

### 3.1 NBS — National Bureau of Statistics (people & socio-economic exposure)

| Item | Research note |
|------|----------------|
| **Role** | Official population, housing, surveys, census hubs (incl. digital 2022 PHC), portals (TNADA, TASIS, Census Hub) |
| **Data useful to DMIS** | Population by region/district/ward/sex/age; urban density; housing type; poverty/DHS-linked vulnerability proxies |
| **Integration type** | **D – bulk reference** (periodic refresh), not real-time |
| **DMIS consumers** | Impact-support **exposure** points; INFORM population denominators; M&E; economics of disaster; portal risk context |
| **Harmonisation** | Map NBS geocodes → `regions`/`districts`/`councils` + `geo_name_aliases` + `inform_area` |
| **Honesty** | Use published census/survey vintages with `as_of` date; do not invent ward populations |

**Target tables (recommended expand):**  
`exposure_population` (area_code, year, total, under5, elderly, density, source, as_of)  
Already partially covered by INFORM indicators where loaded.

---

### 3.2 NIDA — National Identification Authority

| Item | Research note |
|------|----------------|
| **Role** | National ID (NIN); stakeholder **verification** via NIDA services / CIG-style gateway (MoU required; not a public free API) |
| **Data useful to DMIS** | **Verify-only**: is NIN valid? match name/DOB hash? for officers, partners, beneficiaries |
| **Integration type** | **C – verify-only outbound** |
| **DMIS consumers** | User/stakeholder onboarding; beneficiary lists; partner KYC — **not** impact map layers |
| **Privacy** | Tanzania Data Protection Act 2022; never store full biometric dumps or wholesale citizen tables in DMIS |
| **Registry** | Already `NIDA` planned in `integration_endpoints` |

**Do not** use NIDA as an “exposure people count” source. Population exposure = **NBS**.

---

### 3.3 LATRA — Land Transport Regulatory Authority

| Item | Research note |
|------|----------------|
| **Role** | Road transport regulation; network and operational logistics relevance for evacuation and supply |
| **Data useful to DMIS** | Critical corridors, closures, depots, fleet constraints (as available under MoU) |
| **Integration type** | **B/F/G** — inbound logistics exposure |
| **DMIS consumers** | Impact-support **exposure/ops** layers; dispatch/allocation routing context; EW transport advisories |
| **Registry** | `LATRA` planned |

Start with **static critical-road GIS + manual updates**, then live closure feeds if MoU allows.

---

### 3.4 NAPA / NAP — climate adaptation programmes (VPO / sector plans)

| Item | Research note |
|------|----------------|
| **Role** | National Adaptation Programme of Action / NAP process: priority adaptation projects, sectors (water, agri, health, infrastructure) |
| **Data useful to DMIS** | Programme codes, project geography, sector, status — **not** live weather |
| **Integration type** | **F – programme code map** |
| **DMIS consumers** | Recovery strategic projects; M&E climate indicators; finance/NAPA-linked recovery |
| **Registry** | `NAPA` planned bidirectional |

Link `strategic_projects` / recovery programmes via `external_identity_map (NAPA, programme_code → local_id)`.

---

### 3.5 Health — IDSR / e-IDSR / DHIS2 (Mainland health digitisation)

| Item | Research note |
|------|----------------|
| **IDSR** | WHO AFRO strategy; Tanzania guidelines for priority diseases; surveillance + response |
| **e-IDSR / DHIS2** | Electronic disease surveillance commonly implemented on **DHIS2** (e.g. malaria eIDSR patterns); MoH digital HIS for routine data |
| **Data useful to DMIS** | Priority disease **events** (disease, area, period, cases, deaths, threshold breach); not full clinical records |
| **Integration type** | **E – event push** (+ optional **B** pull from DHIS2 if MoH exposes API) |
| **DMIS consumers** | **One Health events**; **MoH EW agency bus** (epidemic tier); impact-support health exposure; scanner tasking to health |
| **Registry** | `MOH` planned inbound |

**Payload sketch (honest, minimal):**

```json
{
  "system": "eIDSR",
  "disease_code": "CHOLERA",
  "area": { "region": "Dodoma", "district": "Dodoma Urban" },
  "period": { "from": "2026-03-01", "to": "2026-03-07" },
  "metrics": { "cases": 42, "deaths": 1 },
  "threshold_status": "alert",
  "source_ref": "DHIS2-EVENT-…"
}
```

Map disease → DMIS hazard catalogue (`Epidemic/Disease Outbreak`). Area → `geo_name_aliases`.

---

### 3.6 TMA — Tanzania Meteorological Authority (hazard entry model)

| Item | Research note |
|------|----------------|
| **Role** | National weather/climate; multi-hazard EWS partner; forecasts, warnings, rainfall products |
| **Integration type today** | **A – agency bus** (`agency=tma` submissions) — no fake official pull API claimed |
| **Future** | Optional **B – pull** of products if TMA provides official channel |

**Recommended hazard entry model (matches your colour + mm example):**

```text
Submission (per day / product):
  hazard_type: rainfall | wind | …
  areas[]: only districts TMA selected
    area_id / name
    tier: yellow | orange | red | …
    colour: #hex (optional UI)
    values: [
      { "metric": "rainfall_mm_24h", "value": 34 },
      { "metric": "rainfall_mm_48h", "value": 54 }
    ]
    threshold_note: "Yellow 20–50 mm; Red >75 mm" (optional)
  unselected areas: omitted entirely
```

**Rules:**

1. **Colour/tier** drives map paint and multi-agency merge.  
2. **Values** drive impact scoring (e.g. mm vs drainage capacity, people in flood plains).  
3. Areas without selection stay **null** — do not paint grey as “0 mm” unless TMA sends explicit zero.  
4. PMO may **override paint** on consolidated board; entity row remains audit truth.

**DMIS consumers:** EW consolidated map, impact-support entity points, bulletins/products, anticipatory plans, portal warnings.

---

### 3.7 MoW, GST, MoA, NEMC, MLF (other EW entities)

Same **agency bus** pattern as TMA:

| Agency | Typical metrics | Colour/tier meaning |
|--------|-----------------|---------------------|
| **MoW** | River level (m), discharge, flood stage | Stage → flood colour |
| **GST** | Seismic intensity, landslide susceptibility | Overlay (often not hydromet tier) |
| **MoA** | Crop stress, pest outbreak area | Agri advisory colour |
| **NEMC** | Pollution/env incident | Env overlay |
| **MLF** | Livestock EW indicators | Pastoral risk |

Each submission: **selected areas only** + tier + values.

---

### 3.8 Other national systems already in registry

| Code | Role in DMIS | Data |
|------|--------------|------|
| **IFMIS** | Finance handoff | Commitment **export** (configured, not live post) |
| **MGOV** | SMS | Outbound alerts |
| **SMTP** | Email | Outbound |

---

## 4. Where each feed is used in DMIS modules

| DMIS module | Primary integrations |
|-------------|----------------------|
| **EW agency consoles (TMA/MoW/…)** | A: own submissions |
| **PMO DMD consolidated map** | Merge all agency tiers by day/area |
| **Impact analysis / impact-support** | Entity tiers + values + INFORM H/V/C + exposure (NBS people, LATRA roads) + multi-agency density |
| **Products / bulletins / disseminate** | Consolidated narrative + SMS/email (M-Gov) |
| **One Health** | MoH/e-IDSR events; link to epidemic EW |
| **Incidents / response** | Forecast match (EW); allocation; never need NIDA for ops map |
| **INFORM / mitigation** | NBS + survey indicators; hazard history |
| **Recovery / strategic projects** | NAPA/NAP programme codes |
| **Finance / NDMF** | IFMIS export path |
| **Portal public** | Published warnings/incidents only — no raw NIDA |
| **M&E** | Outcome indicators; optional census denominators |

---

## 5. PMO Impact Analysis target pipeline (end state)

```text
1. Load entity layers for day D
     TMA: colour + mm per selected district
     MoW: colour + river stage per basin/district
     MoH: epidemic alert flag + case counts (if any)
     …

2. Overlay exposure (slow layer, cached)
     NBS population & density by district/ward
     Critical infrastructure (internal DMIS + LATRA roads)
     Evacuation centre capacity (official gazette when available)

3. Overlay vulnerability & coping
     INFORM structural scores (already in impact-support)
     Optional poverty/health facility density from NBS/DHIS2 aggregates

4. Score (transparent formula — not black-box AI)
     entityPts + informPts + exposurePts + multiAgencyPts + opsPts
     → suggested red/orange/yellow **support** layer
     PMO still owns final paint / directive

5. Output
     Map layers, district rank table, recommended actions, audit trail
```

**Today:** steps 1 (bus), 3 (INFORM), partial 4–5 exist.  
**Gaps to build (honest):** step 2 exposure warehouse; richer value payloads on bus; e-IDSR adapter; TMA value schema standardisation.

---

## 6. Database harmonisation (required for all of the above)

### 6.1 Geography SoR

| Layer | SoR in DMIS | Aliases |
|-------|-------------|---------|
| Region / district / council | `regions`, `districts`, `councils` | `geo_name_aliases` |
| INFORM areas | `inform_area` | already linked 156/156 district aliases |
| External geocodes | NBS, DHIS2 org units, TMA names | map into aliases + `external_identity_map` |

**Rule:** Every inbound payload must resolve to `district_id` / `region_id` or land in **quarantine** (`integration_messages.status = rejected`), never silent free-text only.

### 6.2 Hazard SoR

| Concept | SoR |
|---------|-----|
| Hazard catalogue | `hazards` |
| EW product type | Mapped to hazard_id |
| Health disease code | Map table `hazard_external_codes (system, code, hazard_id)` |

### 6.3 New / extended tables (recommended — expand-only)

| Table | Purpose |
|-------|---------|
| `ew_observation_values` | metric, value, unit, area_id, submission_id, observed_at |
| `exposure_population` | NBS-derived people counts by area + vintage |
| `exposure_infrastructure` | roads, bridges, facilities (LATRA/internal) |
| `hazard_external_codes` | e-IDSR disease ↔ hazard |
| (existing) `integration_*` | endpoints, messages, identity map |

### 6.4 What not to harmonise into one fat table

- Do **not** merge full NIDA citizens into `users`  
- Do **not** replace INFORM engine with a second risk engine without governance  
- Do **not** store clinical detail from DHIS2 — aggregate events only  

---

## 7. Phased implementation (no theatre)

| Phase | Deliverable | Dual-proof |
|-------|-------------|------------|
| **P0 (now)** | Keep bus + impact-support + INFORM; document value+colour schema for TMA/MoW | Schema contract review |
| **P1** | Standardise agency payload: `tier` + `values[]`; store values; show in impact-support | Submit sample rainfall multi-district; assert colours + mm round-trip |
| **P2** | NBS population bulk load → exposure layer in impact-support | District population visible in score breakdown |
| **P3** | MoH e-IDSR/DHIS2 event adapter → One Health + MoH EW | Test cholera threshold event appears in OH + bus |
| **P4** | LATRA static corridors + optional closures | Overlay on impact map |
| **P5** | NAPA programme codes ↔ recovery projects | Identity map round-trip |
| **P6** | NIDA verify-only for partners/officers | Legal MoU + yes/no only |
| **P7** | Optional TMA official pull if API provided | Side-by-side with bus submit |

Each phase ends with: adapter dual-proof + `integration_messages` audit + status upgrade only when proven.

---

## 8. Legal / institutional gates (non-optional)

| Gate | Systems |
|------|---------|
| MoU + data sharing agreement | NIDA, MoH/DHIS2, LATRA, NBS bulk, TMA pull |
| Personal data minimisation | NIDA verify-only; no biometric store |
| Official statistics citation | NBS vintage & disclaimer |
| Sector SoR | Health cases remain MoH SoR; DMIS holds operational copy for DRM |
| Change control | Expand-only Flyway; no mid-event schema rewrite |

---

## 9. Mapping to current `integration_endpoints`

| system_code | Status today | Next honest step |
|-------------|--------------|------------------|
| TMA | planned | Formalise value+colour bus contract (P1) |
| MOW | planned | Same hydromet values |
| MOH | planned | e-IDSR event adapter design (P3) |
| GST, MOA, NEMC | planned | Bus metrics per hazard |
| NIDA | planned | Verify-only after MoU (P6) |
| LATRA | planned | Static exposure then feed (P4) |
| NAPA | planned | Programme code map (P5) |
| IFMIS | configured | Export path only until MoF dual-proof |
| MGOV / SMTP | configured | Ops keys |

**liveCount must stay 0 until dual-proof.**

---

## 10. Summary for leadership

1. **Exposures (people)** come from **NBS**, not NIDA.  
2. **NIDA** is **identity verify**, not impact population.  
3. **TMA** (and peers) should send **colour/tier + numeric values** only for **selected areas**.  
4. **PMO impact analysis** overlays entity hazard + exposure + INFORM vulnerability — **support**, not silent override of entity science.  
5. **Health** links via **e-IDSR/DHIS2 events** into **One Health + MoH EW**.  
6. **LATRA / NAPA** are logistics exposure and adaptation programme linkage.  
7. **Database harmonisation** = one geography SoR + aliases + external identity map + observation values — already started with geo/INFORM integrity.  
8. **No fakes:** adapters after MoU; registry stays honest; AI/satellite remain deferred (F105/F114).

---

## 11. Delivered platform hooks (this repo)

### M&E organization indicators (V197+)

| API | Purpose |
|-----|---------|
| `GET /v1/monitoring-evaluation/organizations/indicators?agencyId=` | List indicators assigned to org |
| `POST /v1/monitoring-evaluation/organizations/indicators` | Assign indicator (`autoCapture` optional) |
| `DELETE /v1/monitoring-evaluation/organizations/indicators/{id}` | Soft-remove assignment (values kept) |
| `POST /v1/monitoring-evaluation/organizations/capture` | Re-run auto-capture for period |

Auto-capture only from **in-platform** tables when `source_module` matches (budget, incidents, inventory, warnings, trainings, EC). Draft status — operator reviews before submit. **No external NBS/NIDA pull invented.**

Workbench UI: **M&E Data Workbench → Organization indicators**.

### Hazard area exposure context (careful)

| API | Purpose |
|-----|---------|
| `GET /v1/ops/hazard-area-context?areaName=&lat=&lng=` | Coordinates + **external** context links |

Returns honesty note + links to:

- OpenStreetMap / OpenTopoMap / Mapillary  
- Esri World Imagery (aerial basemap viewer)  
- Google Maps / Street View (**external** browser tab; Google ToS)  
- EO Browser (Sentinel) · NASA Worldview · Copernicus Browser  
- GDACS · ReliefWeb Tanzania (situational awareness)  
- Leaflet tile URL hints for OSM / Esri / Carto (map + labels hybrid)  

**Does not** classify damage or run satellite AI. PMO impact-support remains the analytical layer.

UI: **PMO-DMD Impact Analysis → Context bar / Justification → Load context links** for selected district.
Paint on a district also soft-loads context links.

### Impact Analysis command surface (beyond typical international bulletins)

| Group | What is captured |
|-------|------------------|
| **View** | Map basemap · Satellite (Esri) · Entity / Support / INFORM / Focus |
| **Paint** | Per-day colour · shapes · clear |
| **Imagery** | **SAT24 real-time** weather satellite (Tanzania / Africa) · NASA GIBS daily EO · Structures (Esri + Google Earth) |
| **Compose** | Readiness · directives · Multirisk PDF |
| **Context** | Exposure links · EC · overlay catalogue |
| **Paint / Edit** | Per-day district paint · colour-matched circle/polygon draw · clear shapes · PDF carries level colour |
| **Compose** | Per-day directives + impact narrative · colour sections → Multirisk PDF chips · readiness strip · Action Guide statements |
| **Context** | Exposure catalogue (live / ready / deferred / planned) · **Satellite feature set (24)** · evacuation centres · open EO & street context links |

### Satellite feature set (24) — accommodation map

Shared catalogue in `frontend/src/app/core/eo-gibs.ts` (`SAT_FEATURE_CATALOGUE`):

| Surface | Role |
|---------|------|
| **Impact Analysis** | Daily GIBS time-slice, filmstrip, entity paint over EO, Street View context |
| **Prevention & Mitigation → Risk Mapping** | **Historical A/B change** (30d–10y), past-disaster date snap, risk assets over EO, mitigation evidence context |
| **Both** | Basemaps, products, Worldview/Copernicus deep links |
| **Platform deferred/planned** | `satellite_scene` SoR, automated change AI (F105/F114), exposure intersect, EMS ingest |

**Honesty catalogue (never invent green lights):** live entity bus, INFORM, EC; ready basemaps, GIBS time-slice, historical A/B; **deferred** NBS / NIDA / LATRA / TANESCO / basin national APIs / **satellite damage AI**; **planned** CAP, Copernicus EMS product ingest, WorldPop, e-IDSR, governed scene metadata.

## 12. Suggested next engineering ticket (if approved)

**P1 only:** extend `ew_agency_submissions` (or child table) for `values[]` metrics; validate area list; surface mm/stage in impact-support district panel; dual-prove with synthetic TMA multi-district rainfall (colour + values) — **still no claim of live TMA national API**.

---

*Document version: 2026-07-12 · e-MAAFA/DMIS platform research for national integration positioning.*
