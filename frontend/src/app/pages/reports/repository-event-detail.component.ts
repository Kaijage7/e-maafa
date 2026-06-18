import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

interface EventCard {
  id: number; eventCode: string; name: string; hazardType: string; glideNumber: string | null;
  startedOn: string; endedOn: string | null; primaryRegion: string; scope: string;
  description: string; triggeringEvent: string; dataSource: string;
  status: 'Open' | 'Validated' | 'Archived'; recordedBy: string; validatedBy: string; validatedAt: string;
}
interface Effects {
  id: number; region: string; district: string | null;
  deaths_male: number; deaths_female: number; deaths_total: number; missing_total: number;
  injured_total: number; directly_affected: number; displaced: number; relocated: number;
  children_affected: number; pwd_affected: number; houses_destroyed: number; houses_damaged: number;
  agriculture_loss_tzs: number; livestock_lost: number; crops_destroyed_ha: number;
  housing_loss_tzs: number; infrastructure_loss_tzs: number; other_loss_tzs: number; total_loss_tzs: number;
  schools_damaged: number; health_facilities_damaged: number; roads_km_damaged: number;
  bridges_damaged: number; water_systems_damaged: number; power_systems_damaged: number;
  services_disrupted: string | null; notes: string | null; source: string | null;
}
interface LinkRow { id: number; entityType: string; entityId: number; label: string; note: string | null; linkedBy: string; linkedOn: string; }
interface Suggestion { id: number; label: string; detail: string | null; when: string; }

/** Entity-type presentation for the linked-records timeline (icon + tint + where it lives). */
const ENTITY_META: Record<string, { icon: string; color: string; title: string }> = {
  early_warning: { icon: 'fa-broadcast-tower', color: '#2563eb', title: 'Early warning' },
  threat: { icon: 'fa-satellite-dish', color: '#7c3aed', title: 'Threat watch' },
  alert: { icon: 'fa-bell', color: '#0891b2', title: 'Alert' },
  public_hazard_report: { icon: 'fa-bullhorn', color: '#ca8a04', title: 'Citizen report' },
  incident: { icon: 'fa-bolt', color: '#dc2626', title: 'Incident' },
  damage_assessment: { icon: 'fa-clipboard-check', color: '#d97706', title: 'Damage assessment' },
  response_activation: { icon: 'fa-truck-fast', color: '#059669', title: 'Response activation' },
  allocated_resource: { icon: 'fa-boxes-stacked', color: '#059669', title: 'Resource allocation' },
  evacuation_center: { icon: 'fa-house-flag', color: '#0d6efd', title: 'Evacuation center' },
  oh_event: { icon: 'fa-heartbeat', color: '#e83e8c', title: 'One Health event' },
  past_disaster: { icon: 'fa-history', color: '#64748b', title: 'Past disaster note' },
};

/** Numeric fields of the effects form, grouped the way the Sendai Monitor groups them. */
const FORM_GROUPS: { title: string; hint: string; fields: { key: string; label: string }[] }[] = [
  {
    title: 'Human impact — Target A (mortality) & B (affected)',
    hint: 'Sex-disaggregated deaths as the Sendai Monitor requests; affected people by category',
    fields: [
      { key: 'deathsMale', label: 'Deaths (male)' }, { key: 'deathsFemale', label: 'Deaths (female)' },
      { key: 'missingTotal', label: 'Missing' }, { key: 'injuredTotal', label: 'Injured' },
      { key: 'directlyAffected', label: 'Directly affected' }, { key: 'displaced', label: 'Displaced' },
      { key: 'relocated', label: 'Relocated' }, { key: 'childrenAffected', label: 'Children affected' },
      { key: 'pwdAffected', label: 'Persons w/ disabilities' },
    ],
  },
  {
    title: 'Housing & economy — Target C (direct economic loss, TZS)',
    hint: 'Sector split mirrors indicators C-2 (agriculture), C-4 (housing), C-5 (infrastructure)',
    fields: [
      { key: 'housesDestroyed', label: 'Houses destroyed' }, { key: 'housesDamaged', label: 'Houses damaged' },
      { key: 'agricultureLossTzs', label: 'Agriculture loss (TZS)' }, { key: 'livestockLost', label: 'Livestock lost' },
      { key: 'cropsDestroyedHa', label: 'Crops destroyed (ha)' }, { key: 'housingLossTzs', label: 'Housing loss (TZS)' },
      { key: 'infrastructureLossTzs', label: 'Infrastructure loss (TZS)' }, { key: 'otherLossTzs', label: 'Other loss (TZS)' },
    ],
  },
  {
    title: 'Critical infrastructure & services — Target D',
    hint: 'Facilities damaged/destroyed and basic services disrupted (D-1 … D-8)',
    fields: [
      { key: 'schoolsDamaged', label: 'Schools' }, { key: 'healthFacilitiesDamaged', label: 'Health facilities' },
      { key: 'roadsKmDamaged', label: 'Roads (km)' }, { key: 'bridgesDamaged', label: 'Bridges' },
      { key: 'waterSystemsDamaged', label: 'Water systems' }, { key: 'powerSystemsDamaged', label: 'Power systems' },
    ],
  },
];

/**
 * Disaster Repository — one event card ("/m/reports-analytics/repository/:id").
 *
 * The EOCC officer's working surface for a disaster: per-district Sendai-disaggregated
 * effects entry, the linking console binding everything the system knows about the event
 * (warnings, incidents, assessments, dispatches …), one-click pre-fill from those linked
 * records, the response-investment figure, and the Open → Validated → Archived lifecycle
 * that freezes figures into the Sendai analytics.
 */
@Component({
  selector: 'page-repository-event-detail',
  standalone: true,
  imports: [DecimalPipe, PageHeaderComponent, PanelComponent],
  template: `
    @if (card(); as e) {
      <dmis-page-header [title]="e.eventCode + ' — ' + e.name" icon="fa-database"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Reports & Analytics'},
                        {label:'Disaster Repository', url:'/m/reports-analytics/repository'}, {label:e.eventCode}]">
        <!-- Lifecycle: Open → Validated → Archived -->
        @if (e.status === 'Open') {
          <button class="btn-add" style="background:#059669;" (click)="transition('validate')">
            <i class="fas fa-check-double"></i> Validate card</button>
        } @else if (e.status === 'Validated') {
          <button class="btn-add" style="background:#64748b;" (click)="transition('archive')">
            <i class="fas fa-box-archive"></i> Archive</button>
          <button class="btn-add" style="background:#d97706;" (click)="transition('reopen')">
            <i class="fas fa-rotate-left"></i> Reopen</button>
        } @else {
          <button class="btn-add" style="background:#d97706;" (click)="transition('reopen')">
            <i class="fas fa-rotate-left"></i> Reopen</button>
        }
      </dmis-page-header>

      <!-- Card header facts -->
      <div class="panel-row">
        <dmis-panel [title]="'Event card — ' + e.status" icon="fa-id-card"
                    [badge]="e.hazardType || 'hazard unset'">
          <div class="panel-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.9rem;">
            <div><div class="f-label">Period</div><div class="f-value">{{ e.startedOn }}{{ e.endedOn ? ' → ' + e.endedOn : '' }}</div></div>
            <div><div class="f-label">Primary region · scope</div><div class="f-value">{{ e.primaryRegion || '—' }} · {{ e.scope }}</div></div>
            <div><div class="f-label">GLIDE number</div><div class="f-value">{{ e.glideNumber || 'not issued' }}</div></div>
            <div><div class="f-label">Data source</div><div class="f-value">{{ e.dataSource || '—' }}</div></div>
            <div><div class="f-label">Recorded by</div><div class="f-value">{{ e.recordedBy || '—' }}</div></div>
            @if (e.validatedBy) {
              <div><div class="f-label">Validated</div><div class="f-value">{{ e.validatedBy }} — {{ e.validatedAt }}</div></div>
            }
          </div>
          @if (e.description) {
            <div class="panel-body" style="border-top:1px solid var(--border);font-size:0.86rem;color:var(--text-mid);line-height:1.65;">
              {{ e.description }}
              @if (e.triggeringEvent) { <div style="margin-top:4px;"><strong>Trigger:</strong> {{ e.triggeringEvent }}</div> }
            </div>
          }
        </dmis-panel>
      </div>

      <!-- National totals (live sum of the effects records) -->
      <div class="panel-row" style="animation-delay:.05s;">
        <dmis-panel title="Event totals — what feeds the Sendai indicators" icon="fa-calculator">
          <div class="panel-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.7rem;">
            @for (t of totalTiles(); track t.label) {
              <div style="border:1px solid var(--border);border-radius:12px;padding:0.7rem 0.85rem;text-align:center;">
                <div style="font-size:1.25rem;font-weight:800;" [style.color]="t.color">{{ t.value | number:'1.0-0' }}</div>
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.4px;">{{ t.label }}</div>
                <div style="font-size:0.62rem;color:#94a3b8;">{{ t.indicator }}</div>
              </div>
            }
          </div>
        </dmis-panel>
      </div>

      <!-- Effects records per admin unit -->
      <div class="panel-row" style="animation-delay:.1s;">
        <dmis-panel title="Effects records (per region/district)" icon="fa-table-list" [badge]="effects().length + ' records'">
          <div class="panel-body" style="padding:0;">
            <table class="r-table">
              <thead><tr><th>Area</th><th style="text-align:right;">Deaths</th><th style="text-align:right;">Missing</th>
                <th style="text-align:right;">Affected</th><th style="text-align:right;">Displaced</th>
                <th style="text-align:right;">Houses hit</th><th style="text-align:right;">Loss (TZS)</th><th>Source</th><th></th></tr></thead>
              <tbody>
                @for (x of effects(); track x.id) {
                  <tr class="data-row">
                    <td><div class="r-title">{{ x.region }}</div><div class="r-subtitle">{{ x.district || 'region-wide' }}</div></td>
                    <td style="text-align:right;font-weight:700;color:#dc2626;">{{ x.deaths_total | number }}</td>
                    <td style="text-align:right;">{{ x.missing_total | number }}</td>
                    <td style="text-align:right;">{{ x.directly_affected | number }}</td>
                    <td style="text-align:right;">{{ x.displaced | number }}</td>
                    <td style="text-align:right;">{{ x.houses_destroyed + x.houses_damaged | number }}</td>
                    <td style="text-align:right;">{{ x.total_loss_tzs | number:'1.0-0' }}</td>
                    <td style="font-size:0.74rem;color:var(--text-light);">{{ x.source || '—' }}</td>
                    <td style="white-space:nowrap;">
                      @if (e.status === 'Open') {
                        <button class="btn-icon" title="Edit" (click)="editEffects(x)"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon" title="Delete" (click)="deleteEffects(x.id)"><i class="fas fa-trash" style="color:#dc2626;"></i></button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="9" style="text-align:center;color:var(--text-light);padding:1.6rem;">
                    No effects recorded yet — add the first record below or pull figures from the linked records.
                  </td></tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Effects entry form (EOCC) -->
          @if (e.status === 'Open') {
            <div class="panel-body" style="border-top:1px solid var(--border);">
              <div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;margin-bottom:0.9rem;">
                <h6 style="margin:0;font-weight:800;">{{ form()['id'] ? 'Edit effects — ' + form()['region'] : 'Add effects record' }}</h6>
                <button class="btn-add" style="background:#7c3aed;padding:0.35rem 0.9rem;font-size:0.76rem;" (click)="pull()">
                  <i class="fas fa-wand-magic-sparkles"></i> Pre-fill from linked records
                </button>
                @if (pullNote()) { <span style="font-size:0.74rem;color:#7c3aed;">{{ pullNote() }}</span> }
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:0.6rem;margin-bottom:0.8rem;">
                <input class="form-control" placeholder="Region *" [value]="form()['region'] || ''" (input)="setF('region', $any($event.target).value)">
                <input class="form-control" placeholder="District (blank = region-wide)" [value]="form()['district'] || ''" (input)="setF('district', $any($event.target).value)">
                <input class="form-control" placeholder="Source (sitrep no., assessment …)" [value]="form()['source'] || ''" (input)="setF('source', $any($event.target).value)">
              </div>
              @for (g of formGroups; track g.title) {
                <div style="margin-bottom:0.8rem;">
                  <div style="font-size:0.76rem;font-weight:800;color:var(--text-dark);">{{ g.title }}</div>
                  <div style="font-size:0.68rem;color:var(--text-light);margin-bottom:0.45rem;">{{ g.hint }}</div>
                  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.5rem;">
                    @for (f of g.fields; track f.key) {
                      <div>
                        <label style="font-size:0.66rem;color:var(--text-mid);display:block;margin-bottom:2px;">{{ f.label }}</label>
                        <input type="number" min="0" class="form-control" style="font-size:0.8rem;"
                               [value]="form()[f.key] ?? ''" (input)="setF(f.key, $any($event.target).value)">
                      </div>
                    }
                  </div>
                </div>
              }
              <div style="display:grid;grid-template-columns:2fr 1fr;gap:0.6rem;align-items:end;">
                <div>
                  <label style="font-size:0.66rem;color:var(--text-mid);display:block;margin-bottom:2px;">Services disrupted (comma-separated: Education, Health, Water, Power, Transport, Telecoms)</label>
                  <input class="form-control" [value]="form()['servicesDisrupted'] || ''" (input)="setF('servicesDisrupted', $any($event.target).value)">
                </div>
                <div style="display:flex;gap:0.5rem;">
                  <button class="btn-add" [disabled]="!form()['region'] || saving()" (click)="saveEffects()">
                    <i class="fas fa-save"></i> {{ form()['id'] ? 'Update record' : 'Save record' }}
                  </button>
                  @if (form()['id']) {
                    <button type="button" style="border:1px solid var(--border);background:#fff;border-radius:9px;padding:0.5rem 0.9rem;cursor:pointer;" (click)="resetForm()">Cancel</button>
                  }
                </div>
              </div>
            </div>
          }
        </dmis-panel>
      </div>

      <!-- Linked records: the event's operational story across the whole system -->
      <div class="panel-row" style="animation-delay:.15s;">
        <dmis-panel title="Linked records — everything around this disaster" icon="fa-link" [badge]="links().length + ' linked'">
          <div class="panel-body">
            <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:1.1rem;align-items:start;">
              <!-- linked list -->
              <div style="display:grid;gap:0.5rem;">
                @for (l of links(); track l.id) {
                  <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;padding:0.55rem 0.75rem;">
                    <span [style.background]="meta(l.entityType).color" style="width:30px;height:30px;border-radius:8px;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <i class="fas {{ meta(l.entityType).icon }}" style="font-size:0.72rem;"></i>
                    </span>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:0.82rem;font-weight:700;color:var(--text-dark);">{{ l.label || (meta(l.entityType).title + ' #' + l.entityId) }}</div>
                      <div style="font-size:0.68rem;color:var(--text-light);">{{ meta(l.entityType).title }} · linked {{ l.linkedOn }} by {{ l.linkedBy }}</div>
                    </div>
                    @if (e.status === 'Open') {
                      <button class="btn-icon" title="Unlink" (click)="unlink(l.id)"><i class="fas fa-link-slash" style="color:#dc2626;"></i></button>
                    }
                  </div>
                } @empty {
                  <div style="border:1px dashed var(--border);border-radius:10px;padding:1.4rem;text-align:center;color:var(--text-light);font-size:0.82rem;">
                    Nothing linked yet — pick from the system's suggestions →
                  </div>
                }
              </div>
              <!-- suggestions -->
              <div>
                <div style="font-size:0.76rem;font-weight:800;color:var(--text-dark);margin-bottom:0.5rem;">
                  <i class="fas fa-lightbulb me-1" style="color:#d97706;"></i>Found in the system (event window ±14 days)
                </div>
                <div style="display:grid;gap:0.45rem;max-height:420px;overflow-y:auto;">
                  @for (group of suggestionGroups(); track group.type) {
                    @for (s of group.items; track s.id) {
                      <div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:9px;padding:0.45rem 0.6rem;background:rgba(13,110,253,0.02);">
                        <i class="fas {{ meta(group.type).icon }}" [style.color]="meta(group.type).color" style="font-size:0.72rem;width:16px;"></i>
                        <div style="flex:1;min-width:0;">
                          <div style="font-size:0.76rem;font-weight:700;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ s.label }}</div>
                          <div style="font-size:0.64rem;color:var(--text-light);">{{ s.when }}{{ s.detail ? ' · ' + s.detail : '' }}</div>
                        </div>
                        @if (e.status === 'Open') {
                          <button class="btn-add" style="padding:0.2rem 0.6rem;font-size:0.68rem;" (click)="link(group.type, s.id)">Link</button>
                        }
                      </div>
                    }
                  } @empty {
                    <div style="font-size:0.74rem;color:var(--text-light);">No unlinked candidates in this event's window.</div>
                  }
                </div>
              </div>
            </div>
          </div>
          <!-- Response investment -->
          <div class="panel-body" style="border-top:1px solid var(--border);display:flex;align-items:center;gap:1.4rem;flex-wrap:wrap;">
            <div>
              <div class="f-label">DMD response investment (linked dispatches)</div>
              <div style="font-size:1.3rem;font-weight:800;color:#059669;">TZS {{ investment()['valueTzs'] | number:'1.0-0' }}</div>
            </div>
            <div style="font-size:0.78rem;color:var(--text-mid);">
              {{ investment()['allocations'] }} allocations · {{ investment()['resourceTypes'] }} resource types —
              computed from the resource allocations of the linked incidents.
            </div>
          </div>
        </dmis-panel>
      </div>
    }
  `,
  styles: [`
    .f-label { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-light); }
    .f-value { font-size: 0.86rem; font-weight: 700; color: var(--text-dark); }
    .btn-icon { border: none; background: transparent; cursor: pointer; padding: 4px 7px; color: var(--text-mid); }
  `],
})
export class RepositoryEventDetailComponent {
  private http = inject(HttpClient);

  card = signal<EventCard | null>(null);
  effects = signal<Effects[]>([]);
  links = signal<LinkRow[]>([]);
  totals = signal<Record<string, number>>({});
  investment = signal<Record<string, number>>({});
  suggestions = signal<Record<string, Suggestion[]>>({});
  form = signal<Record<string, any>>({});
  saving = signal(false);
  pullNote = signal('');

  formGroups = FORM_GROUPS;
  private id = 0;

  /** Totals strip wired to the indicator each figure feeds — the card IS a Sendai record. */
  totalTiles = computed(() => {
    const t = this.totals();
    return [
      { label: 'Deaths', value: t['deaths'] ?? 0, color: '#dc2626', indicator: 'Sendai A-2' },
      { label: 'Missing', value: t['missing'] ?? 0, color: '#dc2626', indicator: 'Sendai A-3' },
      { label: 'Injured', value: t['injured'] ?? 0, color: '#d97706', indicator: 'Sendai B-2' },
      { label: 'Directly affected', value: t['directlyAffected'] ?? 0, color: '#d97706', indicator: 'Sendai B-1' },
      { label: 'Displaced', value: t['displaced'] ?? 0, color: '#d97706', indicator: 'Sendai B-1' },
      { label: 'Houses destroyed', value: t['housesDestroyed'] ?? 0, color: '#7c3aed', indicator: 'Sendai B-4' },
      { label: 'Loss (TZS)', value: t['totalLossTzs'] ?? 0, color: '#0d6efd', indicator: 'Sendai C-1' },
      { label: 'Schools', value: t['schools'] ?? 0, color: '#0891b2', indicator: 'Sendai D-3' },
      { label: 'Health facilities', value: t['healthFacilities'] ?? 0, color: '#0891b2', indicator: 'Sendai D-2' },
      { label: 'Roads (km)', value: t['roadsKm'] ?? 0, color: '#0891b2', indicator: 'Sendai D-1' },
    ];
  });

  suggestionGroups = computed(() => Object.entries(this.suggestions())
    .map(([type, items]) => ({ type, items }))
    .filter(g => g.items.length > 0));

  constructor(route: ActivatedRoute) {
    route.paramMap.subscribe(p => {
      this.id = Number(p.get('id'));
      this.reload();
    });
  }

  reload(): void {
    this.http.get<any>(`/api/v1/repository/events/${this.id}`).subscribe(r => {
      this.card.set(r.event);
      this.effects.set(r.effects);
      this.links.set(r.links);
      this.totals.set(r.totals);
      this.investment.set(r.responseInvestment);
    });
    this.http.get<Record<string, Suggestion[]>>(`/api/v1/repository/events/${this.id}/link-suggestions`)
      .subscribe(s => this.suggestions.set(s));
  }

  meta(type: string): { icon: string; color: string; title: string } {
    return ENTITY_META[type] ?? { icon: 'fa-circle', color: '#64748b', title: type };
  }

  setF(key: string, value: string): void { this.form.update(f => ({ ...f, [key]: value })); }
  resetForm(): void { this.form.set({}); this.pullNote.set(''); }

  /** Loads a saved record back into the form (snake_case row → camelCase form keys). */
  editEffects(x: Effects): void {
    this.form.set({
      id: x.id, region: x.region, district: x.district, source: x.source,
      deathsMale: x.deaths_male, deathsFemale: x.deaths_female, missingTotal: x.missing_total,
      injuredTotal: x.injured_total, directlyAffected: x.directly_affected, displaced: x.displaced,
      relocated: x.relocated, childrenAffected: x.children_affected, pwdAffected: x.pwd_affected,
      housesDestroyed: x.houses_destroyed, housesDamaged: x.houses_damaged,
      agricultureLossTzs: x.agriculture_loss_tzs, livestockLost: x.livestock_lost,
      cropsDestroyedHa: x.crops_destroyed_ha, housingLossTzs: x.housing_loss_tzs,
      infrastructureLossTzs: x.infrastructure_loss_tzs, otherLossTzs: x.other_loss_tzs,
      schoolsDamaged: x.schools_damaged, healthFacilitiesDamaged: x.health_facilities_damaged,
      roadsKmDamaged: x.roads_km_damaged, bridgesDamaged: x.bridges_damaged,
      waterSystemsDamaged: x.water_systems_damaged, powerSystemsDamaged: x.power_systems_damaged,
      servicesDisrupted: x.services_disrupted, notes: x.notes,
    });
    window.scrollTo({ top: 600, behavior: 'smooth' });
  }

  saveEffects(): void {
    this.saving.set(true);
    this.http.post(`/api/v1/repository/events/${this.id}/effects`, this.form()).subscribe({
      next: () => { this.saving.set(false); this.resetForm(); this.reload(); },
      error: () => this.saving.set(false),
    });
  }

  deleteEffects(effectsId: number): void {
    this.http.delete(`/api/v1/repository/events/${this.id}/effects/${effectsId}`)
      .subscribe(() => this.reload());
  }

  /** Aggregates figures from linked incidents/assessments into the form for EOCC review. */
  pull(): void {
    this.http.get<any>(`/api/v1/repository/events/${this.id}/pull`).subscribe(r => {
      const inc = r.fromIncidents ?? {};
      const loss = Number(r.fromAssessments?.estimatedLossTzs ?? 0);
      this.form.update(f => ({
        ...f,
        deathsMale: inc.deathsMale, deathsFemale: inc.deathsFemale, missingTotal: inc.missingTotal,
        injuredTotal: inc.injuredTotal, displaced: inc.displaced,
        childrenAffected: inc.childrenAffected, pwdAffected: inc.pwdAffected,
        otherLossTzs: loss || f['otherLossTzs'],
        region: f['region'] || (inc.regions ? String(inc.regions).split(',')[0].trim() : ''),
        source: f['source'] || `Aggregated from ${inc.incidentCount ?? 0} linked incident(s), ${r.fromAssessments?.assessmentCount ?? 0} assessment(s)`,
      }));
      this.pullNote.set('Figures pre-filled — review, assign the correct area, then save.');
    });
  }

  link(entityType: string, entityId: number): void {
    this.http.post(`/api/v1/repository/events/${this.id}/links`, { entityType, entityId })
      .subscribe(() => this.reload());
  }

  unlink(linkId: number): void {
    this.http.delete(`/api/v1/repository/events/${this.id}/links/${linkId}`).subscribe(() => this.reload());
  }

  transition(action: string): void {
    this.http.post(`/api/v1/repository/events/${this.id}/transition`, { action })
      .subscribe({ next: () => this.reload(), error: err => alert(err?.error?.message ?? 'Action not allowed') });
  }
}
