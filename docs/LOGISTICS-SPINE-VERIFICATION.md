# Logistics spine verification (realistic multi-seat)

**Date:** 2026-07-13  
**Environment:** local API `clean2`, Flyway through **V205**  
**Stance:** No theatre. Every channel exercised with real seats, real stock movement, real SoD.

## What is captured (productive, not fake)

| Channel | How it works | Live proof |
|---------|--------------|------------|
| **Peacetime preparedness** (no incident) | Warehouse Ops: intake / transfer / borrow / stock-taking | DLO 2696 intake WH11 → transfer to WH17 + temp 23 |
| **Incident request** | `POST /v1/response/allocations` requires **approved/active** incident + area | Dist DC **1635** (district 1967) → alloc **57/58/59** on incident **129** |
| **Multi-level resource approval** | Engine chain + step role + maker≠checker | DAS **1637** → RAS **1497** → EOCC **2** → Asst Dir **97** → Director **3** → NTC **23** |
| **National final seat** | NTC holds last chain step | Completes to `Approved` / `workflow_status=approved` |
| **Dispatch from zonal warehouse** | Request → `dispatch_approvals` Pending → approve → stock FIFO deduct + `Dispatch` movement | Reg DC requests WH **1**; RLO **3012** approves; WH1 tarpaulins **1237→1234** |
| **Dispatch from temporary warehouse** | Same manager gate | Alloc **58** from temp **23**; stock **7→5** |
| **Stakeholder channel** | Publish only when **fully approved** → bid → accept | Alloc **59** blankets; bid accepted → status **Sourcing** |
| **Area isolation** | Lists/actions scoped by incident jurisdiction | Dist DC **4** (101) cannot see/source alloc **57** (1967); dispatch approvals list no Dar leak |
| **Segregation of duties** | Requester cannot approve own request | Dist DC requester → 403/engine block on approve |
| **Step-role enforcement** | Wrong role on current step rejected | RAS cannot action DAS step (422) |

## Realistic doctrine (honest)

```
PREPAREDNESS (no incident)
  Warehouse Ops: intake / WH↔WH / WH↔temp / loans
       │
INCIDENT (approved or Active Response)
  Allocation request (area officer)
       │
  Resource chain: DAS → RAS → EOCC → Asst. Director → Director → NTC
       │
  DISPATCH console (approved allocations only)
       ├─ warehouse / temporary_warehouse → manager gate (dispatch_approvals)
       ├─ agency → immediate deduct
       ├─ procurement / request_agency → sourcing journal
       └─ publish_stakeholders → bids → accept/receive → warehouse intake
```

- **Incident-linked** logistics: allocations + dispatch + stakeholder publish.  
- **Out-of-incident preparedness:** Warehouse Ops only (stocking, transfers, temp stores).  
- **No district warehouse in 1967:** city incident correctly draws **region/national** stock (PMO Central WH1) — realistic for LGAs without own store.

## Fixes applied this pass

| Issue | Fix |
|-------|-----|
| DAS/RAS/NTC/DLO/RLO on chain or gates but missing `resource_allocation.approve` | **V204** |
| NTC final seat had approve but not `resource_allocation.view` → ModuleGuard 403 | **V205** |
| `GET /dispatch/approvals` national soft leak for Dist seats | Area-scoped list + counts |
| Stakeholder **publish** while still pending DAS/RAS | Require fully approved (or already sourcing) |
| Bid body only accepted `allocated_resource_id` | Also accept `allocation_id` + `quantity` alias |
| Assessment registry charts national while rows scoped | Stats/charts use same incident area scope |

## Live residual drill rows (not faked seed)

| ID | Status | Notes |
|----|--------|-------|
| Alloc 57 | Dispatch Approved | Zonal/national WH1 path |
| Alloc 58 | Dispatch Approved | Temp WH 23 path |
| Alloc 59 | Sourcing | Stakeholder bid accepted |
| Prep stock | WH11=15, WH17=8, T23=5 (resource 1) | Peacetime stocking still on ledger |

## Dispatch source visibility (careful follow-up)

| Check | Result |
|-------|--------|
| Super Admin sources for alloc 57 | Dodoma-region stocked WHs (1, 11, 17) |
| Reg DC Dodoma sources | **no Arusha WH 4/12/14**; temp **23** only |
| Reg DC POST dispatch Arusha WH4 body | **404** `assertWarehouseVisible` |
| Reg DC POST dispatch WH11 (in scope) | **200** manager gate |
| Dist DC 101 sources on alloc 57 (district 1967) | **404** allocation area wall |
| Stakeholder bid **21** receive → WH1 | **Received**; alloc **59** Partially Fulfilled; intake +12 blankets |
| Alloc 57 status In Transit → Deployed | Productive; field consumption (no second ledger) |

**Code:** `DispatchSupportService.availableSources` uses `appendWarehouseScope`; `DispatchController.dispatch` re-checks warehouse/temp visibility on the body.

## Agency sources + dispatch SoD (careful follow-up)

| Check | Result |
|-------|--------|
| Agency stock in source picker | Scoped **shared-or-own** on `agency_resources` (region/district) |
| Untagged agency rows | Visible to area seats (national pool) |
| Agency row tagged Arusha (region 62) | **Hidden** from Dodoma Reg; still visible nationally |
| POST dispatch foreign agency body | **404** |
| RLO requests dispatch then self-approves | **422** segregation of duties |
| EOCC approves different seat | **200**; stock deducted |

**Code:** `appendAreaScopeSharedOrOwn` on agency list; `assertOwnOrShared` on agency dispatch body; `assertNotDispatchRequester` on approve/reject.

## Remaining honest limits

- Dual catalogue surfaces remain (`/v1/settings/resources` eGA + response settings) — both productive.  
- Live agency stock corpus is small and mostly **untagged** (NULL area → national shared until operators stamp region/district).

## Seats used (proof matrix)

| Role | User id | Action |
|------|---------|--------|
| Dist DC | 1635 | Request |
| DAS | 1637 | Chain step 1 |
| RAS | 1497 | Chain step 2 |
| EOCC | 2 | Chain step 3 + publish/accept bid |
| Asst. Director | 97 | Chain step 4 |
| Director | 3 | Chain step 5 |
| NTC | 23 | Chain step 6 (final) |
| Reg DC | 11 | Dispatch request |
| RLO | 3012 | Dispatch manager approve |
| DLO 101 | 2696 | Peacetime intake/transfer; OOA blocked on foreign incident |
