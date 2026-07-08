import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface EventRow {
  id: number; eventCode: string; name: string; hazardType: string;
  startedOn: string; endedOn: string | null; primaryRegion: string; scope: string;
  status: 'Open' | 'Validated' | 'Archived'; recordedBy: string;
  deaths: number; affected: number; lossTzs: number; linkCount: number;
  /** F04: recorded gov_response_tzs + computed linked-incident costs (dispatches + cash commitments). */
  costUsedTzs: number;
}
interface Hazard { id: number; name: string; }
interface CandidateEvent {
  id: number; eventCode: string; name: string; status: string;
  hazardType: string | null; startedOn: string; primaryRegion: string | null; linkCount: number;
}
interface IncidentWorkItem {
  id: number; title: string; hazardType: string | null; startedOn: string; endedOn: string | null;
  resolvedOn: string | null; status: string; workflowStatus: string; severityLevel: string | null;
  regionName: string | null; districtName: string | null; locationDescription: string | null;
  affected: number; deaths: number; injured: number; missing: number; displaced: number;
  responseValueTzs: number; assessmentCount: number; allocationCount: number;
  candidateEvents: CandidateEvent[];
}

const STATUS_BADGE: Record<string, string> = {
  Open: 'badge-pending', Validated: 'badge-approved', Archived: 'badge-rejected',
};

/**
 * Disaster Repository — the national disaster loss database (Reports & Analytics module).
 * One DesInventar-style event card per disaster; EOCC officers register cards here, attach
 * per-district effects, link the surrounding system records, and validate the card so its
 * figures feed the Sendai Framework analytics.
 */
@Component({
  selector: 'page-repository-events',
  standalone: true,
  imports: [DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Disaster Repository — Loss Database" icon="fa-database"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Reports & Analytics'}, {label:'Disaster Repository'}]">
      <button class="btn-add" type="button" style="background:#64748b;margin-right:0.4rem;" (click)="exportCsv()"><i class="fas fa-download"></i> Export CSV</button>
      <button class="btn-add" type="button" (click)="drawerOpen.set(true)"><i class="fas fa-plus"></i> Register Event</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Event Cards" icon="fa-database" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['open'] ?? 0" label="Open (data entry)" icon="fa-pen" color="#d97706" />
      <dmis-stat-card [value]="stats()['validated'] ?? 0" label="Validated (in Sendai figures)" icon="fa-check-double" color="#059669" />
      <dmis-stat-card [value]="stats()['archived'] ?? 0" label="Archived" icon="fa-box-archive" color="#64748b" />
    </div>

    @if (worklist().length) {
      <div class="panel-row">
        <dmis-panel title="Resolved Incident Intake" icon="fa-clipboard-check" [badge]="worklist().length + ' unrecorded'">
          <div class="panel-body" style="padding:0;">
            <table class="r-table">
              <thead><tr>
                <th>Incident</th><th>Hazard</th><th>Area</th><th>Resolved</th>
                <th style="text-align:right;">Impact</th><th>Repository action</th>
              </tr></thead>
              <tbody>
                @for (i of worklist(); track i.id) {
                  <tr class="data-row">
                    <td>
                      <div class="r-title">{{ i.title }}</div>
                      <div class="r-subtitle">INC-{{ i.id }} · {{ i.status }}{{ i.workflowStatus ? ' / ' + i.workflowStatus : '' }}</div>
                    </td>
                    <td style="font-size:0.82rem;">{{ i.hazardType || '—' }}</td>
                    <td style="font-size:0.82rem;">
                      {{ i.districtName || i.regionName || i.locationDescription || '—' }}
                      @if (i.districtName && i.regionName) { <div class="r-subtitle">{{ i.regionName }}</div> }
                    </td>
                    <td style="font-size:0.8rem;color:var(--text-mid);">
                      {{ i.resolvedOn || i.endedOn || i.startedOn || '—' }}
                    </td>
                    <td style="text-align:right;font-size:0.82rem;">
                      <b>{{ i.deaths | number }}</b> deaths
                      <div class="r-subtitle">{{ i.affected | number }} affected · {{ i.assessmentCount }} assessments · {{ i.allocationCount }} allocations</div>
                    </td>
                    <td>
                      <div style="display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;">
                        @for (c of i.candidateEvents; track c.id) {
                          <button class="btn-add" type="button" style="padding:0.28rem 0.65rem;font-size:0.76rem;background:#0f766e;"
                                  [disabled]="linkingIncident() === i.id + ':' + c.id"
                                  (click)="linkIncident(i, c)">
                            <i class="fas" [class.fa-link]="linkingIncident() !== i.id + ':' + c.id"
                               [class.fa-spinner]="linkingIncident() === i.id + ':' + c.id"
                               [class.fa-spin]="linkingIncident() === i.id + ':' + c.id"></i>
                            Link {{ c.eventCode }}
                          </button>
                        }
                        <button class="btn-add" type="button" style="padding:0.28rem 0.65rem;font-size:0.76rem;"
                                [disabled]="creatingFromIncident() === i.id"
                                (click)="createFromIncident(i)">
                          <i class="fas" [class.fa-database]="creatingFromIncident() !== i.id"
                             [class.fa-spinner]="creatingFromIncident() === i.id"
                             [class.fa-spin]="creatingFromIncident() === i.id"></i>
                          {{ creatingFromIncident() === i.id ? 'Creating…' : 'Create card' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </dmis-panel>
      </div>
    }

    <div class="panel-row">
      <dmis-panel title="Disaster Event Cards" icon="fa-layer-group" [badge]="events().length + ' shown'">
        <!-- Registry filters -->
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:200px;" [value]="fHazard()" (change)="fHazard.set($any($event.target).value); reload()">
            <option value="">All hazards</option>
            @for (h of hazardTypes(); track h) { <option [value]="h">{{ h }}</option> }
          </select>
          <select class="form-select" style="max-width:160px;" [value]="fYear()" (change)="fYear.set($any($event.target).value); reload()">
            <option value="">All years</option>
            @for (y of years; track y) { <option [value]="y">{{ y }}</option> }
          </select>
          <select class="form-select" style="max-width:170px;" [value]="fStatus()" (change)="fStatus.set($any($event.target).value); reload()">
            <option value="">All statuses</option>
            <option value="Open">Open</option><option value="Validated">Validated</option><option value="Archived">Archived</option>
          </select>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>Event</th><th>Hazard</th><th>Period</th><th>Region</th>
              <th style="text-align:right;">Deaths</th><th style="text-align:right;">Affected</th>
              <th style="text-align:right;">Loss (TZS)</th><th>Links</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              @for (e of events(); track e.id) {
                <tr class="data-row">
                  <td><div class="r-title">{{ e.name }}</div><div class="r-subtitle">{{ e.eventCode }}</div></td>
                  <td style="font-size:0.82rem;">{{ e.hazardType || '—' }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ e.startedOn }}{{ e.endedOn ? ' — ' + e.endedOn : '' }}</td>
                  <td style="font-size:0.82rem;">{{ e.primaryRegion || '—' }}</td>
                  <td style="text-align:right;font-weight:700;color:#dc2626;">{{ e.deaths | number }}</td>
                  <td style="text-align:right;">{{ e.affected | number }}</td>
                  <td style="text-align:right;">{{ e.lossTzs | number:'1.0-0' }}
                    @if (e.costUsedTzs > 0) {
                      <div class="r-subtitle" style="white-space:nowrap;" title="Response cost used — recorded + computed from linked incidents">
                        cost used {{ e.costUsedTzs | number:'1.0-0' }}</div>
                    }
                  </td>
                  <td><span class="r-badge" style="background:rgba(13,110,253,0.1);color:#0d6efd;">{{ e.linkCount }}</span></td>
                  <td><span class="r-badge {{ statusBadge(e.status) }}">{{ e.status }}</span></td>
                  <td><button class="btn-add" style="padding:0.3rem 0.8rem;font-size:0.8rem;" (click)="open(e.id)">Open card</button></td>
                </tr>
              } @empty {
                <tr><td colspan="10" style="text-align:center;color:var(--text-light);padding:2rem;">
                  No event cards match — register the first card for this filter.
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <!-- Register Event modal -->
    @if (drawerOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="drawerOpen.set(false)">
        <div style="background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:92vh;overflow-y:auto;padding:1.3rem 1.4rem;display:grid;gap:0.8rem;" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0;"><i class="fas fa-database me-2"></i>Register Disaster Event</h5>
          <div>
            <label class="form-label">Event name <span class="text-danger">*</span></label>
            <input class="form-control" placeholder="e.g. Rufiji River Floods, April 2026" [value]="fName()" (input)="fName.set($any($event.target).value)">
          </div>
          <div>
            <label class="form-label">Hazard <span class="text-danger">*</span></label>
            <select class="form-select" [value]="fHazardId()" (change)="fHazardId.set($any($event.target).value)">
              <option value="">Select hazard</option>
              @for (h of hazards(); track h.id) { <option [value]="h.id">{{ h.name }}</option> }
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
            <div><label class="form-label">Started on <span class="text-danger">*</span></label>
              <input type="date" class="form-control" [value]="fStart()" (input)="fStart.set($any($event.target).value)"></div>
            <div><label class="form-label">Ended on</label>
              <input type="date" class="form-control" [value]="fEnd()" (input)="fEnd.set($any($event.target).value)"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
            <div><label class="form-label">Primary region</label>
              <input class="form-control" placeholder="e.g. Pwani" [value]="fRegion()" (input)="fRegion.set($any($event.target).value)"></div>
            <div><label class="form-label">Scope</label>
              <select class="form-select" [value]="fScope()" (change)="fScope.set($any($event.target).value)">
                <option>Ward</option><option selected>District</option><option>Regional</option><option>National</option>
              </select></div>
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea class="form-control" rows="3" placeholder="What happened, where, key dynamics"
                      [value]="fDesc()" (input)="fDesc.set($any($event.target).value)"></textarea>
          </div>
          <div>
            <label class="form-label">Data source</label>
            <input class="form-control" placeholder="e.g. EOCC sitreps 1–4; RAS Pwani assessment"
                   [value]="fSource()" (input)="fSource.set($any($event.target).value)">
          </div>
          <div>
            <label class="form-label">Government response cost (TZS) — recorded</label>
            <input type="number" min="0" class="form-control" placeholder="e.g. 5000000"
                   [value]="fGovResponse()" (input)="fGovResponse.set($any($event.target).value)">
            <p style="font-size:0.75rem;color:var(--text-light);margin:0.25rem 0 0;">
              Optional manual figure. Costs from linked incidents (resource dispatches, Budget &amp; Finance
              commitments) are computed automatically on the card.
            </p>
          </div>
          <button class="btn-add" [disabled]="!fName().trim() || !fStart() || saving()" (click)="save()">
            <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
            {{ saving() ? 'Saving…' : 'Register event card' }}
          </button>
          <p style="font-size:0.8rem;color:var(--text-light);margin:0;">
            The card gets a DE-{{ currentYear }}-NNNN code. Add per-district effects and link the related
            warnings/incidents on the card page, then validate it to feed the Sendai analytics.
          </p>
        </div>
      </div>
    }
  `,
})
export class RepositoryEventsComponent {
  private http = inject(HttpClient);
  private router = inject(Router);

  events = signal<EventRow[]>([]);
  stats = signal<Record<string, number>>({});
  hazardTypes = signal<string[]>([]);
  hazards = signal<Hazard[]>([]);
  worklist = signal<IncidentWorkItem[]>([]);
  drawerOpen = signal(false);
  saving = signal(false);
  creatingFromIncident = signal<number | null>(null);
  linkingIncident = signal<string | null>(null);

  fHazard = signal(''); fYear = signal(''); fStatus = signal('');
  fName = signal(''); fHazardId = signal(''); fStart = signal(''); fEnd = signal('');
  fRegion = signal(''); fScope = signal('District'); fDesc = signal(''); fSource = signal('');
  fGovResponse = signal('');

  currentYear = new Date().getFullYear();
  years = Array.from({ length: 30 }, (_, k) => this.currentYear - k);

  constructor() {
    this.reload();
    this.reloadWorklist();
    this.http.get<{ hazards: Hazard[] }>('/api/v1/hazards?page=1')
      .subscribe({ next: r => this.hazards.set(r.hazards ?? []), error: () => this.hazards.set([]) });
  }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fHazard()) { q.set('hazard', this.fHazard()); }
    if (this.fYear()) { q.set('year', this.fYear()); }
    if (this.fStatus()) { q.set('status', this.fStatus()); }
    this.http.get<{ events: EventRow[]; stats: Record<string, number>; hazardTypes: string[] }>(
      `/api/v1/repository/events?${q}`).subscribe(r => {
        this.events.set(r.events);
        this.stats.set(r.stats);
        this.hazardTypes.set(r.hazardTypes);
      });
  }

  reloadWorklist(): void {
    this.http.get<{ incidents: IncidentWorkItem[] }>('/api/v1/repository/events/incident-worklist')
      .subscribe({ next: r => this.worklist.set(r.incidents ?? []), error: () => this.worklist.set([]) });
  }

  /** A2: download the repository as CSV honouring the current filters (HttpClient → Bearer token → blob). */
  exportCsv(): void {
    const q = new URLSearchParams();
    if (this.fHazard()) { q.set('hazard', this.fHazard()); }
    if (this.fYear()) { q.set('year', this.fYear()); }
    if (this.fStatus()) { q.set('status', this.fStatus()); }
    this.http.get(`/api/v1/repository/events/export?${q}`, { responseType: 'blob' }).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `disaster-repository-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  statusBadge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
  open(id: number): void { this.router.navigate(['/m/reports-analytics/repository', id]); }

  createFromIncident(i: IncidentWorkItem): void {
    this.creatingFromIncident.set(i.id);
    this.http.post<{ id: number }>(`/api/v1/repository/events/from-incident/${i.id}`, {}).subscribe({
      next: r => {
        this.creatingFromIncident.set(null);
        this.reload();
        this.reloadWorklist();
        this.open(r.id);
      },
      error: () => this.creatingFromIncident.set(null),
    });
  }

  linkIncident(i: IncidentWorkItem, c: CandidateEvent): void {
    const key = `${i.id}:${c.id}`;
    this.linkingIncident.set(key);
    this.http.post(`/api/v1/repository/events/${c.id}/links`, {
      entityType: 'incident',
      entityId: i.id,
      note: 'Linked from resolved incident intake',
    }).subscribe({
      next: () => {
        this.linkingIncident.set(null);
        this.reload();
        this.reloadWorklist();
        this.open(c.id);
      },
      error: () => this.linkingIncident.set(null),
    });
  }

  save(): void {
    this.saving.set(true);
    this.http.post<{ id: number }>('/api/v1/repository/events', {
      name: this.fName(), hazardId: this.fHazardId() || null, startedOn: this.fStart(),
      endedOn: this.fEnd() || null, primaryRegion: this.fRegion(), scope: this.fScope(),
      description: this.fDesc(), dataSource: this.fSource(),
      govResponseTzs: this.fGovResponse() || null,
    }).subscribe({
      next: r => { this.saving.set(false); this.drawerOpen.set(false); this.open(r.id); },
      error: () => this.saving.set(false),
    });
  }
}
