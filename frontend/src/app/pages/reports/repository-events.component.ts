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
}
interface Hazard { id: number; name: string; }

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
      <button class="btn-add" type="button" (click)="drawerOpen.set(true)"><i class="fas fa-plus"></i> Register Event</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Event Cards" icon="fa-database" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['open'] ?? 0" label="Open (data entry)" icon="fa-pen" color="#d97706" />
      <dmis-stat-card [value]="stats()['validated'] ?? 0" label="Validated (in Sendai figures)" icon="fa-check-double" color="#059669" />
      <dmis-stat-card [value]="stats()['archived'] ?? 0" label="Archived" icon="fa-box-archive" color="#64748b" />
    </div>

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
                  <td style="text-align:right;">{{ e.lossTzs | number:'1.0-0' }}</td>
                  <td><span class="r-badge" style="background:rgba(13,110,253,0.1);color:#0d6efd;">{{ e.linkCount }}</span></td>
                  <td><span class="r-badge {{ statusBadge(e.status) }}">{{ e.status }}</span></td>
                  <td><button class="btn-add" style="padding:0.3rem 0.8rem;font-size:0.74rem;" (click)="open(e.id)">Open card</button></td>
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
        <div style="background:#fff;border-radius:16px;max-width:680px;width:100%;max-height:92vh;overflow-y:auto;padding:1.3rem 1.4rem;display:grid;gap:0.8rem;" (click)="$event.stopPropagation()">
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
          <button class="btn-add" [disabled]="!fName().trim() || !fStart() || saving()" (click)="save()">
            <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
            {{ saving() ? 'Saving…' : 'Register event card' }}
          </button>
          <p style="font-size:0.74rem;color:var(--text-light);margin:0;">
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
  drawerOpen = signal(false);
  saving = signal(false);

  fHazard = signal(''); fYear = signal(''); fStatus = signal('');
  fName = signal(''); fHazardId = signal(''); fStart = signal(''); fEnd = signal('');
  fRegion = signal(''); fScope = signal('District'); fDesc = signal(''); fSource = signal('');

  currentYear = new Date().getFullYear();
  years = Array.from({ length: 30 }, (_, k) => this.currentYear - k);

  constructor() {
    this.reload();
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

  statusBadge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
  open(id: number): void { this.router.navigate(['/m/reports-analytics/repository', id]); }

  save(): void {
    this.saving.set(true);
    this.http.post<{ id: number }>('/api/v1/repository/events', {
      name: this.fName(), hazardId: this.fHazardId() || null, startedOn: this.fStart(),
      endedOn: this.fEnd() || null, primaryRegion: this.fRegion(), scope: this.fScope(),
      description: this.fDesc(), dataSource: this.fSource(),
    }).subscribe({
      next: r => { this.saving.set(false); this.drawerOpen.set(false); this.open(r.id); },
      error: () => this.saving.set(false),
    });
  }
}
