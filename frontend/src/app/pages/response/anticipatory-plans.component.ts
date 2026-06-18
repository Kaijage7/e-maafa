import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addTanzaniaGisBase, addMapNav } from '../../core/tz-map';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const L: any; // Leaflet 1.9.4, loaded globally in index.html

interface PlanRow {
  id: number; hazard_type: string; district_council: string; coverage_location: string | null;
  affected_people: number | null; budget: number | null; status: string;
  activation_window: number | null; focal_point_agency: string | null;
}

/** The hazards the matcher and seed cover (kept in sync with AnticipatoryPlanController.matchingPlans). */
const HAZARDS = ['Floods', 'Cyclone', 'Drought', 'Disease Outbreak', 'Landslide', 'Wildfire',
  'Earthquake', 'Tsunami', 'Heatwave', 'Pest Invasion', 'Volcanic Eruption', 'Sea level rise'];
// Tanzania's 31 administrative regions (adm1 reg_name values) — drives the coverage badge so it
// never depends on the async map render. Kept in sync with /geojson/adm1_region/adm1.geojson.
const TZ_REGIONS = ['Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera',
  'Kaskazini Pemba', 'Kaskazini Unguja', 'Katavi', 'Kigoma', 'Kilimanjaro', 'Kusini Pemba',
  'Kusini Unguja', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Mjini Magharibi', 'Morogoro', 'Mtwara',
  'Mwanza', 'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe',
  'Tabora', 'Tanga'];
const CHANNELS = ['SMS', 'Radio/TV', 'WhatsApp', 'Community meeting', 'Loudspeaker', 'Email'];
const FUNDING = ['Government', 'Non-government', 'Development partner', 'Others'];
const STATUS_BADGE: Record<string, string> = {
  active: 'badge-approved', pending: 'badge-pending', draft: 'badge-rejected', archived: 'badge-muted',
};

/**
 * Anticipatory Action Plans — the per-area, forecast-triggered preparedness plans the
 * Disaster Management Act 2022 / NDPRP 2022 require ("preparedness plans activated as per
 * specific areas forecasted to have impact"). Faithful port of Admin\AnticipatoryActionPlanController:
 * registry + rich create/edit form + draft→pending→active→archived approval workflow. Active
 * plans surface automatically in the Command Post readiness panel during anticipatory activation.
 */
@Component({
  selector: 'page-anticipatory-plans',
  standalone: true,
  imports: [FormsModule, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Anticipatory Action Plans" icon="fa-clipboard-list"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Anticipatory Action Plans'}]">
      <button class="btn-add" type="button" (click)="openForm(null)"><i class="fas fa-plus"></i> New Plan</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Plans" icon="fa-clipboard-list" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['active'] ?? 0" label="Active (forecast-ready)" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="stats()['pending'] ?? 0" label="Pending approval" icon="fa-hourglass-half" color="#d97706" />
      <dmis-stat-card [value]="peopleCoveredK()" label="People covered — active (000s)" icon="fa-users" color="#7c3aed" />
      <dmis-stat-card [value]="budgetBn()" label="Active budget (TZS bn)" icon="fa-coins" color="#e83e8c" />
    </div>

    <!-- National anticipatory-action coverage: where standing plans are forecast-ready -->
    <div class="panel-row">
      <dmis-panel title="National coverage — where anticipatory plans stand ready" icon="fa-map-location-dot"
                  [badge]="coveredRegions() + ' regions'">
        <div class="panel-body cov">
          <div id="aapMap" class="cov-map"></div>
          <div class="cov-side">
            @if (readinessGaps().length) {
              <div class="cov-gaps">
                <div class="gaps-head"><i class="fas fa-triangle-exclamation"></i> {{ readinessGaps().length }} readiness gap{{ readinessGaps().length === 1 ? '' : 's' }}</div>
                <div class="gaps-sub">Regions under an active hazard warning with <b>no</b> anticipatory plan</div>
                <div class="gaps-list">
                  @for (r of readinessGaps(); track r) { <span class="gap-chip"><i class="fas fa-location-dot"></i> {{ r }}</span> }
                </div>
              </div>
            }
            <div class="cov-legend">
              <div class="lg-title">Active plans per region</div>
              <div class="lg-row"><span class="sw" style="background:#c4b5fd"></span> 1 plan</div>
              <div class="lg-row"><span class="sw" style="background:#a78bfa"></span> 2 plans</div>
              <div class="lg-row"><span class="sw" style="background:#7c3aed"></span> 3 plans</div>
              <div class="lg-row"><span class="sw" style="background:#5b21b6"></span> 4+ plans</div>
              <div class="lg-row"><span class="sw" style="background:#eef2f5;border:1px solid #d8dee6"></span> no plan yet</div>
              <div class="lg-row"><span class="sw" style="background:rgba(239,68,68,0.16);border:1.5px dashed #ef4444"></span> readiness gap — hazard, no plan</div>
            </div>
            <div class="cov-haz">
              <div class="lg-title">Coverage by hazard</div>
              @for (h of byHazard(); track h.hazard_type) {
                <div class="haz-row">
                  <span class="haz-name">{{ h.hazard_type }}</span>
                  <span class="haz-bar"><span class="haz-fill" [style.width.%]="hazPct(h.count)"></span></span>
                  <span class="haz-n">{{ h.count }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row">
      <dmis-panel title="Anticipatory Action Plans" icon="fa-database" [badge]="plans().length + ' shown'">
        <!-- Filters -->
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:170px;" [(ngModel)]="fStatus" (change)="reload()">
            <option value="">All statuses</option>
            <option value="active">Active</option><option value="pending">Pending</option>
            <option value="draft">Draft</option><option value="archived">Archived</option>
          </select>
          <select class="form-select" style="max-width:190px;" [(ngModel)]="fHazard" (change)="reload()">
            <option value="">All hazards</option>
            @for (h of byHazard(); track h.hazard_type) { <option [value]="h.hazard_type">{{ h.hazard_type }} ({{ h.count }})</option> }
          </select>
          <input class="form-control" style="max-width:240px;" placeholder="Search council / coverage…"
                 [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()" title="Search"><i class="fas fa-magnifying-glass"></i></button>
          @if (fStatus || fHazard || fSearch) {
            <button class="btn-add" style="background:transparent;color:var(--text-mid);border:1px solid var(--border);" (click)="resetFilters()" title="Clear all filters"><i class="fas fa-rotate-left"></i> Reset</button>
          }
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>Hazard</th><th>District council</th><th>Coverage</th>
              <th style="text-align:right;">People</th><th style="text-align:right;">Budget (TZS)</th>
              <th style="text-align:center;">Window</th><th>Focal agency</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              @for (p of plans(); track p.id) {
                <tr class="data-row">
                  <td><span class="r-badge" style="background:rgba(13,110,253,0.1);color:#0d6efd;">{{ p.hazard_type }}</span></td>
                  <td class="r-title">{{ p.district_council }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);max-width:220px;">{{ p.coverage_location || '—' }}</td>
                  <td style="text-align:right;">{{ (p.affected_people ?? 0) | number }}</td>
                  <td style="text-align:right;">{{ (p.budget ?? 0) | number:'1.0-0' }}</td>
                  <td style="text-align:center;font-size:0.8rem;">{{ p.activation_window ? p.activation_window + 'd' : '—' }}</td>
                  <td style="font-size:0.78rem;color:var(--text-mid);">{{ p.focal_point_agency || '—' }}</td>
                  <td><span class="r-badge {{ badge(p.status) }}">{{ p.status }}</span></td>
                  <td style="text-align:right;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + p.hazard_type + ' — ' + p.district_council"
                              (click)="toggleMenu(p.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === p.id">
                        @if (p.status === 'draft') {
                          <a class="ctx-item" (click)="openForm(p)"><i class="fas fa-pen"></i> Edit</a>
                          <a class="ctx-item success" (click)="action(p,'submit')"><i class="fas fa-paper-plane"></i> Submit for approval</a>
                        }
                        @if (p.status === 'pending') {
                          <a class="ctx-item success" (click)="action(p,'approve')"><i class="fas fa-check"></i> Approve</a>
                          <a class="ctx-item danger" (click)="action(p,'reject')"><i class="fas fa-rotate-left"></i> Reject to draft</a>
                        }
                        @if (p.status === 'active') {
                          <a class="ctx-item" (click)="view(p)"><i class="fas fa-eye"></i> View details</a>
                          <a class="ctx-item" (click)="action(p,'archive')"><i class="fas fa-box-archive"></i> Archive</a>
                        }
                        @if (p.status === 'archived') { <a class="ctx-item" (click)="view(p)"><i class="fas fa-eye"></i> View details</a> }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9">
                  <div class="empty-state"><i class="fas fa-inbox"></i>
                    @if (fStatus || fHazard || fSearch) { No plans match these filters. }
                    @else { No anticipatory action plans yet — create the first one. }
                  </div>
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <!-- Create / Edit modal -->
    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-clipboard-list me-2"></i>{{ editId ? 'Edit' : 'New' }} Anticipatory Action Plan</h5>
          <div class="modal-grid">
            <div><label class="f-lbl">Hazard <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="m.hazard_type">
                <option value="">Select hazard</option>
                @for (h of hazards; track h) { <option [value]="h">{{ h }}</option> }
              </select></div>
            <div><label class="f-lbl">District council <span class="text-danger">*</span></label>
              <input class="form-control" [(ngModel)]="m.district_council" placeholder="e.g. Mtwara Municipal Council"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Coverage location (wards / specific areas)</label>
              <input class="form-control" [(ngModel)]="m.coverage_location" placeholder="e.g. coastal wards: Shangani, Mikindani, Magomeni"></div>
            <div><label class="f-lbl">People to be protected</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="m.affected_people"></div>
            <div><label class="f-lbl">Budget (TZS)</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="m.budget"></div>
            <div><label class="f-lbl">Activation window (forecast lead time, days)</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="m.activation_window"></div>
            <div><label class="f-lbl">Funding source</label>
              <select class="form-select" [(ngModel)]="m.funding_source">
                <option value="">—</option>
                @for (f of funding; track f) { <option [value]="f">{{ f }}</option> }
              </select></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Forecast trigger (the threshold that activates this plan)</label>
              <input class="form-control" [(ngModel)]="m.trigger" placeholder="e.g. TMA cyclone warning ≥ category 1 within 72h of the coast"></div>
            <div><label class="f-lbl">Anticipatory actions (one per line)</label>
              <textarea class="form-control" rows="4" [(ngModel)]="mActivities" placeholder="Evacuate coastal zones&#10;Open and stock shelters&#10;Secure fishing fleet"></textarea></div>
            <div><label class="f-lbl">Responsible actors (one per line)</label>
              <textarea class="form-control" rows="4" [(ngModel)]="mActors" placeholder="LGAs&#10;Regional Disaster Coordinator&#10;TMA&#10;Red Cross"></textarea></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Communication channels</label>
              <div style="display:flex;gap:0.9rem;flex-wrap:wrap;">
                @for (c of channels; track c) {
                  <label style="font-size:0.82rem;display:flex;align-items:center;gap:5px;cursor:pointer;">
                    <input type="checkbox" [checked]="mChannels().includes(c)" (change)="toggleChannel(c)"> {{ c }}</label>
                }
              </div></div>
            <div><label class="f-lbl">Focal point name</label><input class="form-control" [(ngModel)]="m.focal_point_name"></div>
            <div><label class="f-lbl">Focal point contact</label><input class="form-control" [(ngModel)]="m.focal_point_contact"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Focal point agency</label>
              <input class="form-control" [(ngModel)]="m.focal_point_agency" placeholder="e.g. PMO-DMD / Mtwara RS"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Closure criteria</label>
              <input class="form-control" [(ngModel)]="m.closure_criteria" placeholder="e.g. cyclone warning lifted and rapid assessment complete"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Description</label>
              <textarea class="form-control" rows="2" [(ngModel)]="m.description"></textarea></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button type="button" class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.hazard_type || !m.district_council || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ editId ? 'Update plan' : 'Create plan (draft)' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Read-only detail -->
    @if (detail(); as p) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
            <h5 style="font-weight:800;margin:0;">{{ p.hazard_type }} — {{ p.district_council }}</h5>
            <span class="r-badge {{ badge(p.status) }}">{{ p.status }}</span>
          </div>
          <div class="modal-grid" style="font-size:0.84rem;">
            <div><div class="f-lbl">Coverage</div>{{ p.coverage_location || '—' }}</div>
            <div><div class="f-lbl">People protected</div>{{ (p.affected_people ?? 0) | number }}</div>
            <div><div class="f-lbl">Budget</div>TZS {{ (p.budget ?? 0) | number:'1.0-0' }}</div>
            <div><div class="f-lbl">Activation window</div>{{ p.activation_window ? p.activation_window + ' days' : '—' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Forecast trigger</div>{{ p.trigger || '—' }}</div>
            <div><div class="f-lbl">Anticipatory actions</div>
              <ul style="margin:0;padding-left:18px;">@for (a of asArray(p.action_activities_type); track a) { <li>{{ a }}</li> }</ul></div>
            <div><div class="f-lbl">Responsible actors</div>
              <ul style="margin:0;padding-left:18px;">@for (a of asArray(p.responsible_actor); track a) { <li>{{ a }}</li> }</ul></div>
            <div><div class="f-lbl">Channels</div>{{ asArray(p.communication_channel).join(', ') || '—' }}</div>
            <div><div class="f-lbl">Funding</div>{{ p.funding_source || '—' }}</div>
            <div><div class="f-lbl">Focal point</div>{{ p.focal_point_name || '—' }}{{ p.focal_point_contact ? ' · ' + p.focal_point_contact : '' }}<br>{{ p.focal_point_agency || '' }}</div>
            <div><div class="f-lbl">Closure criteria</div>{{ p.closure_criteria || '—' }}</div>
          </div>
          <div style="text-align:right;margin-top:1rem;"><button class="btn-cancel" (click)="detail.set(null)">Close</button></div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); display: block; margin-bottom: 3px; }
    .btn-mini { font-size: 0.72rem; padding: 0.25rem 0.7rem; border-radius: 7px; border: 1px solid var(--border); background: #fff; cursor: pointer; margin-left: 4px; color: var(--text-dark); }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1500; display: flex; align-items: flex-start; justify-content: center; padding: 3vh 1rem; overflow-y: auto; }
    .modal-card { background: var(--card-bg, #fff); border-radius: 16px; max-width: 760px; width: 100%; padding: 1.4rem 1.5rem; }
    .btn-cancel { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 0.5rem 1rem; cursor: pointer; }
    .badge-muted { background: rgba(100,116,139,0.14); color: #64748b; }
    /* Anchor the row action menu under its trigger (the global .ctx-menu is position:fixed and detaches). */
    .ctx-menu { position: absolute; top: 100%; right: 0; }
    /* Two-up modal field grid on the design spacing scale; collapses to one column on small screens. */
    .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
    @media (max-width: 640px) {
      .modal-grid { grid-template-columns: 1fr; }
      .modal-grid > div { grid-column: 1 / -1 !important; }
    }
    .cov { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; align-items: stretch; }
    .cov-map { height: 520px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: #eef2f5; z-index: 1; }
    .cov-side { display: flex; flex-direction: column; gap: 0.9rem; }
    .lg-title { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); margin-bottom: 6px; }
    .cov-legend, .cov-haz { border: 1px solid var(--border); border-radius: 12px; padding: 0.8rem 0.9rem; }
    .cov-gaps { border: 1px solid rgba(239,68,68,0.35); background: rgba(239,68,68,0.06); border-radius: 12px; padding: 0.7rem 0.85rem; }
    .gaps-head { font-size: 0.8rem; font-weight: 800; color: #dc2626; display: flex; align-items: center; gap: 7px; }
    .gaps-sub { font-size: 0.68rem; color: var(--text-mid); margin: 3px 0 7px; }
    .gaps-list { display: flex; flex-wrap: wrap; gap: 4px; }
    .gap-chip { font-size: 0.68rem; font-weight: 700; background: #fff; color: #b91c1c; border: 1px solid rgba(239,68,68,0.4); border-radius: 8px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; }
    .lg-row { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-mid); padding: 2px 0; }
    .sw { width: 16px; height: 12px; border-radius: 3px; display: inline-block; }
    .cov-haz { flex: 1; overflow-y: auto; max-height: 400px; }
    .haz-row { display: grid; grid-template-columns: 92px 1fr 22px; gap: 8px; align-items: center; margin: 4px 0; }
    .haz-name { font-size: 0.74rem; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .haz-bar { background: rgba(124,58,237,0.12); border-radius: 5px; height: 9px; overflow: hidden; }
    .haz-fill { display: block; height: 100%; background: #7c3aed; border-radius: 5px; }
    .haz-n { font-size: 0.74rem; font-weight: 700; color: #7c3aed; text-align: right; }
    @media (max-width: 900px) { .cov { grid-template-columns: 1fr; } }
  `],
})
export class AnticipatoryPlansComponent implements OnDestroy {
  private http = inject(HttpClient);
  private base = '/api/v1/response/anticipatory-plans';

  plans = signal<PlanRow[]>([]);
  stats = signal<Record<string, number>>({});
  byHazard = signal<{ hazard_type: string; count: number }[]>([]);
  formOpen = signal(false);
  detail = signal<any | null>(null);
  saving = signal(false);

  fStatus = ''; fHazard = ''; fSearch = '';
  openMenu = signal<number | null>(null);
  hazards = HAZARDS; channels = CHANNELS; funding = FUNDING;

  editId: number | null = null;
  m: any = {};
  mActivities = '';
  mActors = '';
  mChannels = signal<string[]>([]);

  peopleCoveredK = computed(() => Math.round((this.stats()['people_covered'] ?? 0) / 1000));
  budgetBn = computed(() => Math.round((this.stats()['budget_active'] ?? 0) / 1e9));

  // National coverage state. The badge counts regions from the static TZ_REGIONS list against the
  // active-plan areas, so it settles as soon as the plans load — independent of the map's geojson render.
  private map: any = null;
  private mapTimer: any = null;                          // pending initMap timer — cancelled on destroy to avoid orphan re-init
  private covLayer: any = null;                          // the coverage choropleth layer (restyled when warnings land)
  private activeAreas = signal<string[]>([]);           // "district_council coverage" text per active plan, lowercased
  private hazardRegions = signal<Set<string>>(new Set()); // regions under an ACTIVE early-warning hazard (lowercased)
  coveredRegions = computed(() => TZ_REGIONS.filter(r => this.regionCount(r) > 0).length);
  /** Readiness gaps: regions with an active hazard warning but NO anticipatory plan — the decision this screen exists for. */
  readonly readinessGaps = computed(() =>
    TZ_REGIONS.filter(r => this.hazardRegions().has(r.toLowerCase()) && this.regionCount(r) === 0));

  constructor() {
    this.reload();
    this.loadCoverage();
    this.loadWarnings();
  }

  ngOnDestroy(): void {
    if (this.mapTimer) { clearTimeout(this.mapTimer); this.mapTimer = null; }
    if (this.map) { this.map.remove(); this.map = null; }
  }

  /** Hazard-coverage bar width relative to the most-covered hazard. */
  hazPct(n: number): number {
    const max = Math.max(1, ...this.byHazard().map(h => h.count));
    return Math.round((n / max) * 100);
  }

  /** Every active plan's area text, then shade the national map by how many cover each region. */
  private loadCoverage(): void {
    this.http.get<any>(`${this.base}?status=active`).subscribe(r => {
      this.activeAreas.set((r.plans ?? []).map((p: any) =>
        ((p.district_council ?? '') + ' ' + (p.coverage_location ?? '')).toLowerCase()));
      this.mapTimer = setTimeout(() => this.initMap(), 80);
    });
  }

  /** Active early-warning hazards by region → drives the readiness-gap overlay. Re-styles the map when it lands. */
  private loadWarnings(): void {
    this.http.get<any>('/api/v1/ew/warnings').subscribe({
      next: r => {
        const set = new Set<string>();
        for (const w of (r.warnings ?? [])) {
          if (w.status !== 'published' && w.status !== 'approved') { continue; } // issued warnings only
          for (const h of (w.hazards ?? [])) { if (h.region) { set.add(String(h.region).toLowerCase()); } }
        }
        this.hazardRegions.set(set);
        this.restyleCoverage();
      },
      error: () => { /* EW unavailable → simply no gap overlay, coverage still works */ },
    });
  }

  /** Fill/stroke for a region: red dashed = readiness gap (hazard, no plan); purple = plan coverage; else transparent. */
  private covStyle(region: string): any {
    const n = this.regionCount(region);
    if (n === 0 && this.hazardRegions().has(String(region).toLowerCase())) {
      return { fillColor: '#ef4444', fillOpacity: 0.16, color: '#ef4444', weight: 1.6, dashArray: '5 4' };
    }
    return { fillColor: this.covColour(n), fillOpacity: n > 0 ? 0.85 : 0.0,
      color: n > 0 ? '#ffffff' : 'transparent', weight: n > 0 ? 1 : 0, dashArray: '' };
  }

  private restyleCoverage(): void {
    if (this.covLayer) { this.covLayer.setStyle((f: any) => this.covStyle(f.properties.reg_name)); }
  }

  private initMap(): void {
    const el = document.getElementById('aapMap');
    if (!el || typeof L === 'undefined') { return; }
    if (this.map) { this.map.remove(); this.map = null; }
    // Clear any orphaned Leaflet id (e.g. a re-entered route) so L.map never throws "already initialized".
    if ((el as any)._leaflet_id != null) { (el as any)._leaflet_id = null; }
    this.map = L.map(el, {
      center: [-6.4, 35.0], zoom: 5, zoomControl: true, attributionControl: false,
      maxBounds: [[-12.0, 28.6], [-0.8, 41.2]], maxBoundsViscosity: 1.0,
    });
    addTanzaniaGisBase(this.map, this.http);
    addMapNav(this.map, { home: [-6.4, 35.0, 5] });
    // Coverage choropleth on a dedicated pane ABOVE the GIS base (no z-order race): each region is
    // shaded by how many ACTIVE anticipatory plans cover it, vivid purple scale matching the theme.
    this.map.createPane('coverage');
    this.map.getPane('coverage').style.zIndex = '620';
    this.http.get<any>('/geojson/adm1_region/adm1.geojson').subscribe(adm1 => {
      this.covLayer = L.geoJSON(adm1, {
        pane: 'coverage',
        style: (f: any) => this.covStyle(f.properties.reg_name),
        onEachFeature: (f: any, layer: any) => {
          const region = f.properties.reg_name;
          const n = this.regionCount(region);
          const gap = n === 0 && this.hazardRegions().has(String(region).toLowerCase());
          layer.bindTooltip(gap
            ? `⚠ ${region} — active hazard, NO anticipatory plan`
            : `${region} — ${n} active plan${n === 1 ? '' : 's'}`, { sticky: true });
          layer.on('mouseover', () => layer.setStyle({ weight: 2 }));
          layer.on('mouseout', () => this.covLayer?.resetStyle(layer));
        },
      }).addTo(this.map);
    });
    setTimeout(() => this.map?.invalidateSize(), 140);
  }

  /** Vivid purple scale by active-plan count (clearly visible even for 1 plan). */
  private covColour(n: number): string {
    return n >= 4 ? '#5b21b6' : n === 3 ? '#7c3aed' : n === 2 ? '#a78bfa' : n === 1 ? '#c4b5fd' : 'transparent';
  }

  /** How many active plans name this region (in council or coverage text). */
  private regionCount(region: string): number {
    const key = String(region).toLowerCase();
    return this.activeAreas().filter(a => a.includes(key)).length;
  }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fHazard) { q.set('hazard', this.fHazard); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.plans.set(r.plans);
      this.stats.set(r.stats);
      this.byHazard.set(r.by_hazard);
    });
  }

  /** Clear every filter and reload the full registry. */
  resetFilters(): void {
    this.fStatus = ''; this.fHazard = ''; this.fSearch = '';
    this.reload();
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }

  /** PG json fields arrive as {type:'json', value:'[...]'} on show — normalise to a real array. */
  asArray(v: any): string[] {
    if (!v) { return []; }
    if (Array.isArray(v)) { return v; }
    if (typeof v === 'object' && v.value) { try { return JSON.parse(v.value); } catch { return []; } }
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
    return [];
  }

  toggleChannel(c: string): void {
    this.mChannels.update(list => list.includes(c) ? list.filter(x => x !== c) : [...list, c]);
  }

  openForm(p: PlanRow | null): void {
    this.editId = p?.id ?? null;
    if (!p) {
      this.m = {}; this.mActivities = ''; this.mActors = ''; this.mChannels.set([]);
      this.formOpen.set(true);
      return;
    }
    this.http.get<any>(`${this.base}/${p.id}`).subscribe(r => {
      const f = r.plan;
      this.m = {
        hazard_type: f.hazard_type, district_council: f.district_council, coverage_location: f.coverage_location,
        affected_people: f.affected_people, budget: f.budget, activation_window: f.activation_window,
        funding_source: f.funding_source, trigger: f.trigger, closure_criteria: f.closure_criteria,
        focal_point_name: f.focal_point_name, focal_point_contact: f.focal_point_contact,
        focal_point_agency: f.focal_point_agency, description: f.description,
      };
      this.mActivities = this.asArray(f.action_activities_type).join('\n');
      this.mActors = this.asArray(f.responsible_actor).join('\n');
      this.mChannels.set(this.asArray(f.communication_channel));
      this.formOpen.set(true);
    });
  }

  view(p: PlanRow): void {
    this.http.get<any>(`${this.base}/${p.id}`).subscribe(r => this.detail.set(r.plan));
  }

  save(): void {
    this.saving.set(true);
    const body = {
      ...this.m,
      action_activities_type: this.lines(this.mActivities),
      responsible_actor: this.lines(this.mActors),
      communication_channel: this.mChannels(),
    };
    const url = this.editId ? `${this.base}/${this.editId}` : this.base;
    this.http.post<any>(url, body).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
      error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not save the plan.'); },
    });
  }

  action(p: PlanRow, act: 'submit' | 'approve' | 'reject' | 'archive'): void {
    const labels: Record<string, string> = {
      submit: 'Submit this draft for approval?', approve: 'Approve this plan — it becomes active and forecast-ready?',
      reject: 'Return this plan to draft?', archive: 'Archive this plan?',
    };
    if (!confirm(labels[act])) { return; }
    this.http.post(`${this.base}/${p.id}/${act}`, {}).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.error?.detail ?? 'Action failed.'),
    });
  }

  private lines(s: string): string[] {
    return s.split('\n').map(x => x.trim()).filter(Boolean);
  }

  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
