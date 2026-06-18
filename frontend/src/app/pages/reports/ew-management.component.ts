import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface MatchedIncident { id: number; title: string; reported_at: string; severity_level: string; status: string; region_name: string; }
interface PrepActivity { kind: string; name: string; status: string; starts: string; ends: string; area: string; }
interface WarningRow {
  id: number; warning_code: string; hazard: string; area: string; warning_level: string;
  validity_start: string; validity_end: string; ew_class: string; incident_count: number;
  incidents: MatchedIncident[]; preparedness: PrepActivity[]; lead_time_hours?: number;
}
interface UnwarnedRow { id: number; title: string; hazard: string; severity_level: string; status: string; reported_at: string; region_name: string; }
interface EwAnalysis {
  summary: Record<string, number>;
  warnings: WarningRow[];
  unwarned_incidents: UnwarnedRow[];
  drr: { disasters_total: number; disasters_ew_linked: number; ew_coverage_pct: number };
}

/**
 * Early Warning Management — links Early Warning THROUGHOUT (the Reports & Analytics tab the user asked
 * for). Each issued warning is correlated with the incidents in its warned area during its validity
 * window and the preparedness activities active then, classifying every case:
 *   warned→incident · warning→no-incident · unwarned-incident · preparedness-during-warning,
 * plus warning lead time and the DRR-in-the-EW-context metric (% of archived disasters preceded by a
 * warning). Backend: GET /v1/reports/early-warnings (EwManagementController).
 */
@Component({
  selector: 'page-ew-management',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, NgClass, PageHeaderComponent, PanelComponent, StatCardComponent],
  styles: [`
    .ew-classbar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 4px 0 6px; }
    @media (max-width: 900px) { .ew-classbar { grid-template-columns: repeat(2, 1fr); } }
    .ew-q { border-radius: 12px; padding: 12px 14px; color: #fff; }
    .ew-q b { display: block; font-size: 1.7rem; line-height: 1; } .ew-q span { font-size: 0.72rem; font-weight: 700; opacity: 0.95; }
    .ew-q small { display: block; font-size: 0.66rem; opacity: 0.85; margin-top: 3px; }
    .q-hit { background: #059669; } .q-false { background: #f59e0b; } .q-gap { background: #dc2626; } .q-prep { background: #2563eb; }
    .r-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .r-table th { text-align: left; font-size: 0.68rem; text-transform: uppercase; color: #64748b; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    .r-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .pill { font-size: 0.62rem; font-weight: 800; border-radius: 7px; padding: 2px 8px; color: #fff; white-space: nowrap; }
    .p-hit { background: #059669; } .p-false { background: #f59e0b; } .p-gap { background: #dc2626; }
    .lvl { font-size: 0.62rem; font-weight: 800; border-radius: 6px; padding: 1px 7px; }
    .l-major { background: #fee2e2; color: #b91c1c; } .l-warning { background: #ffedd5; color: #c2410c; } .l-advisory { background: #fef9c3; color: #854d0e; }
    .inc-line { font-size: 0.76rem; color: #334155; padding: 2px 0; } .inc-line .t { color: #94a3b8; }
    .prep-chip { display: inline-block; font-size: 0.66rem; background: #dbeafe; color: #1e40af; border-radius: 6px; padding: 1px 7px; margin: 2px 3px 0 0; }
    .muted { color: #94a3b8; font-size: 0.78rem; }
    .drr-card { display: flex; align-items: center; gap: 16px; }
    .drr-ring { width: 86px; height: 86px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.2rem; color: #1f2d3d; }
    .banner { padding: 10px 14px; border-radius: 10px; font-size: 0.84rem; margin-bottom: 10px; }
    .banner.err { background: #fee2e2; color: #b91c1c; } .banner.load { background: #f1f5f9; color: #475569; }
  `],
  template: `
    <dmis-page-header title="Early Warning Management" icon="fa-bullseye"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Reports & Analytics'}, {label:'Early Warning Management'}]">
      <button class="btn-add" style="background:#64748b;" type="button" (click)="print()"><i class="fas fa-print"></i> Print</button>
    </dmis-page-header>

    <div class="panel-row no-print" style="margin-bottom:0.4rem;">
      <dmis-panel title="Analysis period" icon="fa-calendar-range">
        <div class="panel-body" style="display:flex;gap:0.7rem;align-items:flex-end;flex-wrap:wrap;">
          <div><label class="f-lbl">From</label><input type="date" class="form-control" [(ngModel)]="start"></div>
          <div><label class="f-lbl">To</label><input type="date" class="form-control" [(ngModel)]="end"></div>
          <button class="btn-add" (click)="reload()"><i class="fas fa-filter"></i> Analyse</button>
          <span class="muted" style="align-self:center;">Correlates issued warnings ⇄ incidents ⇄ preparedness by area + validity window</span>
        </div>
      </dmis-panel>
    </div>

    @if (loadError()) { <div class="banner err"><i class="fas fa-triangle-exclamation"></i> Could not load the analysis. <button class="btn-add" style="margin-left:8px" (click)="reload()">Retry</button></div> }
    @else if (loading()) { <div class="banner load"><i class="fas fa-circle-notch fa-spin"></i> Correlating warnings, incidents and preparedness…</div> }

    <div class="stats-row">
      <dmis-stat-card [value]="s()['warnings_issued'] ?? 0" label="Warnings issued" icon="fa-tower-broadcast" color="#003366" />
      <dmis-stat-card [value]="s()['warned_incident'] ?? 0" label="Warned → incident" icon="fa-bullseye" color="#059669" />
      <dmis-stat-card [value]="s()['warning_no_incident'] ?? 0" label="Warning → no incident" icon="fa-shield-halved" color="#f59e0b" />
      <dmis-stat-card [value]="s()['unwarned_incident'] ?? 0" label="Unwarned incidents" icon="fa-triangle-exclamation" color="#dc2626" />
      <dmis-stat-card [value]="s()['preparedness_during_warning'] ?? 0" label="Preparedness in window" icon="fa-people-carry-box" color="#2563eb" />
      <dmis-stat-card [value]="(s()['avg_lead_time_hours'] ?? 0)" label="Avg lead time (h)" icon="fa-stopwatch" color="#7c3aed" />
    </div>

    <!-- the four early-warning-effectiveness classes -->
    <div class="ew-classbar">
      <div class="ew-q q-hit"><b>{{ s()['warned_incident'] ?? 0 }}</b><span>WARNED → INCIDENT</span><small>warning issued, hazard struck (true positive)</small></div>
      <div class="ew-q q-false"><b>{{ s()['warning_no_incident'] ?? 0 }}</b><span>WARNING → NO INCIDENT</span><small>warning passed, no incident (good forecast / false alarm)</small></div>
      <div class="ew-q q-gap"><b>{{ s()['unwarned_incident'] ?? 0 }}</b><span>UNWARNED INCIDENT</span><small>hazard struck with no covering warning (the gap)</small></div>
      <div class="ew-q q-prep"><b>{{ s()['preparedness_during_warning'] ?? 0 }}</b><span>PREPAREDNESS IN WINDOW</span><small>anticipatory action active during a warning</small></div>
    </div>

    <div class="panel-row">
      <dmis-panel title="Issued warnings — linked to incidents & preparedness" icon="fa-link" [badge]="warnings().length + ' warnings'">
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Hazard / Area</th><th>Level</th><th>Validity window</th><th>Outcome</th><th>Incidents in window (day & time)</th><th>Preparedness</th></tr></thead>
            <tbody>
              @for (w of warnings(); track w.id) {
                <tr>
                  <td><b>{{ w.hazard || 'Hazard' }}</b><br><span class="muted">{{ w.area || '—' }}<span *ngIf="w.warning_code"> · {{ w.warning_code }}</span></span></td>
                  <td><span class="lvl" [ngClass]="lvlClass(w.warning_level)">{{ w.warning_level }}</span></td>
                  <td style="white-space:nowrap">{{ w.validity_start | date:'MMM d' }} → {{ w.validity_end | date:'MMM d' }}</td>
                  <td>
                    @if (w.ew_class === 'warned_incident') { <span class="pill p-hit">WARNED → INCIDENT</span><br><small class="muted" *ngIf="w.lead_time_hours != null">lead {{ w.lead_time_hours }}h</small> }
                    @else { <span class="pill p-false">NO INCIDENT</span> }
                  </td>
                  <td>
                    @for (i of w.incidents; track i.id) {
                      <div class="inc-line">• {{ i.title }} <span class="t">— {{ i.reported_at | date:'MMM d, HH:mm' }} · {{ i.severity_level }}</span></div>
                    }
                    @if (!w.incidents.length) { <span class="muted">none</span> }
                  </td>
                  <td>
                    @for (p of w.preparedness; track $index) { <span class="prep-chip" title="{{ p.kind }} · {{ p.status }}">{{ p.name || p.kind }}</span> }
                    @if (!w.preparedness.length) { <span class="muted">none</span> }
                  </td>
                </tr>
              }
              @if (!warnings().length && !loading()) { <tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No issued warnings in this period.</td></tr> }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row">
      <dmis-panel title="Unwarned incidents — the early-warning gap" icon="fa-triangle-exclamation" [badge]="unwarned().length + ' incidents'">
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Incident</th><th>Hazard</th><th>Area</th><th>Reported</th><th>Severity</th></tr></thead>
            <tbody>
              @for (i of unwarned(); track i.id) {
                <tr><td>{{ i.title || ('Incident #' + i.id) }}</td><td>{{ i.hazard || '—' }}</td><td>{{ i.region_name || '—' }}</td>
                    <td style="white-space:nowrap">{{ i.reported_at | date:'MMM d, HH:mm' }}</td><td>{{ i.severity_level || '—' }}</td></tr>
              }
              @if (!unwarned().length && !loading()) { <tr><td colspan="5" class="muted" style="text-align:center;padding:24px">No unwarned incidents — every incident was preceded by a warning.</td></tr> }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row">
      <dmis-panel title="Disaster Risk Reduction — early-warning coverage" icon="fa-book-open-reader">
        <div class="panel-body">
          <div class="drr-card">
            <div class="drr-ring" [style.background]="coverageRing()">{{ drr().ew_coverage_pct | number:'1.0-1' }}%</div>
            <div>
              <div style="font-size:0.9rem;color:#1f2d3d;font-weight:600">{{ drr().disasters_ew_linked }} of {{ drr().disasters_total }} archived disasters were preceded by an early warning.</div>
              <div class="muted" style="margin-top:4px">This is the early-warning dimension of DRR in the Disaster Repository — what share of disasters the early-warning system anticipated. Raising it is the DRR objective.</div>
            </div>
          </div>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class EwManagementComponent {
  private http = inject(HttpClient);
  start = '';
  end = '';
  data = signal<EwAnalysis | null>(null);
  loading = signal(true);
  loadError = signal(false);

  s = computed(() => this.data()?.summary ?? {});
  warnings = computed(() => this.data()?.warnings ?? []);
  unwarned = computed(() => this.data()?.unwarned_incidents ?? []);
  drr = computed(() => this.data()?.drr ?? { disasters_total: 0, disasters_ew_linked: 0, ew_coverage_pct: 0 });

  constructor() { this.reload(); }

  reload(): void {
    this.loading.set(true); this.loadError.set(false);
    let url = '/api/v1/reports/early-warnings';
    const q: string[] = [];
    if (this.start) q.push('from=' + this.start);
    if (this.end) q.push('to=' + this.end);
    if (q.length) url += '?' + q.join('&');
    this.http.get<EwAnalysis>(url).subscribe({
      next: r => { this.data.set(r); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  lvlClass(level: string): string {
    const l = (level || '').toLowerCase();
    return l.includes('major') ? 'l-major' : l.includes('warning') ? 'l-warning' : 'l-advisory';
  }
  coverageRing(): string {
    const p = this.drr().ew_coverage_pct || 0;
    const col = p >= 60 ? '#059669' : p >= 30 ? '#f59e0b' : '#dc2626';
    return `conic-gradient(${col} ${p * 3.6}deg, #e5e7eb 0deg)`;
  }
  print(): void { window.print(); }
}
