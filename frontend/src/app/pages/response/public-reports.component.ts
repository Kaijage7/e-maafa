import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface ReportRow {
  id: number; report_code: string; hazard_type: string; description: string | null;
  location_description: string | null; latitude: number | null; longitude: number | null;
  urgency_level: string | null; reporter_name: string | null; reporter_phone: string | null;
  status: string; review_notes: string | null; linked_incident_id: number | null;
  linked_incident_title: string | null; reviewed_by_name: string | null;
  created_at: string; reviewed_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-pending', reviewing: 'badge-approved', converted: 'badge-approved', dismissed: 'badge-muted',
};

/**
 * Public Reports — the triage desk that closes the loop from the citizen "Report Hazard" wizard
 * (public portal writes public_hazard_reports) into the Response module. Responders see incoming
 * citizen reports, mark them under review, dismiss non-credible ones, or CONVERT a credible report
 * into a formal incident — which then enters the normal incident approval workflow.
 */
@Component({
  selector: 'page-public-reports',
  standalone: true,
  imports: [FormsModule, DatePipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Public Hazard Reports" icon="fa-flag"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Public Reports'}]">
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Reports" icon="fa-flag" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['new_reports'] ?? 0" label="New (awaiting triage)" icon="fa-bell" color="#d97706" />
      <dmis-stat-card [value]="stats()['reviewing'] ?? 0" label="Under review" icon="fa-magnifying-glass" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['converted'] ?? 0" label="Converted to incident" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="stats()['dismissed'] ?? 0" label="Dismissed" icon="fa-ban" color="#64748b" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Citizen-submitted hazard reports" icon="fa-inbox" [badge]="reports().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:170px;" [(ngModel)]="fStatus" (change)="reload()">
            <option value="">All statuses</option>
            <option value="new">New</option><option value="reviewing">Reviewing</option>
            <option value="converted">Converted</option><option value="dismissed">Dismissed</option>
          </select>
          <input class="form-control" style="max-width:260px;" placeholder="Search code / hazard / location…"
                 [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>Code</th><th>Hazard</th><th>Location</th><th>Reporter</th>
              <th style="text-align:center;">Urgency</th><th>Received</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              @for (r of reports(); track r.id) {
                <tr class="data-row">
                  <td style="font-family:monospace;font-size:0.78rem;">{{ r.report_code }}</td>
                  <td><span class="r-badge" style="background:rgba(220,53,69,0.1);color:#dc3545;">{{ r.hazard_type }}</span></td>
                  <td style="font-size:0.82rem;max-width:200px;">{{ r.location_description || '—' }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.reporter_name || 'Anonymous' }}<br>
                    <span style="font-size:0.74rem;color:var(--text-light);">{{ r.reporter_phone || '' }}</span></td>
                  <td style="text-align:center;"><span class="r-badge" [class.badge-pending]="r.urgency_level==='High'||r.urgency_level==='Critical'">{{ r.urgency_level || '—' }}</span></td>
                  <td style="font-size:0.78rem;color:var(--text-mid);">{{ r.created_at | date:'dd MMM, HH:mm' }}</td>
                  <td><span class="r-badge {{ badge(r.status) }}">{{ r.status }}</span>
                    @if (r.linked_incident_id) { <div style="font-size:0.72rem;color:#059669;margin-top:2px;">→ incident #{{ r.linked_incident_id }}</div> }</td>
                  <td style="text-align:right;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === r.id">
                        <a class="ctx-item" (click)="view(r)"><i class="fas fa-eye"></i> View report</a>
                        @if (r.status === 'new' || r.status === 'reviewing') {
                          @if (r.status === 'new') { <a class="ctx-item" (click)="review(r)"><i class="fas fa-magnifying-glass"></i> Mark under review</a> }
                          <a class="ctx-item success" (click)="openConvert(r)"><i class="fas fa-arrow-right-arrow-left"></i> Convert to incident</a>
                          <a class="ctx-item danger" (click)="dismiss(r)"><i class="fas fa-ban"></i> Dismiss</a>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:2rem;">No citizen reports match the filter.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <!-- Detail -->
    @if (detail(); as r) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
            <h5 style="font-weight:800;margin:0;">{{ r.hazard_type }} — {{ r.report_code }}</h5>
            <span class="r-badge {{ badge(r.status) }}">{{ r.status }}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;font-size:0.84rem;">
            <div style="grid-column:1/3;"><div class="f-lbl">Location</div>{{ r.location_description || '—' }}
              @if (r.latitude && r.longitude) { <span style="color:var(--text-light);font-size:0.78rem;"> ({{ r.latitude }}, {{ r.longitude }})</span> }</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Description</div>{{ r.description || '—' }}</div>
            <div><div class="f-lbl">Reporter</div>{{ r.reporter_name || 'Anonymous' }}</div>
            <div><div class="f-lbl">Phone</div>{{ r.reporter_phone || '—' }}</div>
            <div><div class="f-lbl">Urgency</div>{{ r.urgency_level || '—' }}</div>
            <div><div class="f-lbl">Received</div>{{ r.created_at | date:'dd MMM yyyy, HH:mm' }}</div>
            @if (r.review_notes) { <div style="grid-column:1/3;"><div class="f-lbl">Review notes</div>{{ r.review_notes }}</div> }
            @if (r.reviewed_by_name) { <div style="grid-column:1/3;"><div class="f-lbl">Triaged by</div>{{ r.reviewed_by_name }} · {{ r.reviewed_at | date:'dd MMM, HH:mm' }}</div> }
            @if (r.linked_incident_id) { <div style="grid-column:1/3;"><div class="f-lbl">Linked incident</div>
              <a (click)="goIncident(r.linked_incident_id!)" style="color:#0d6efd;cursor:pointer;">#{{ r.linked_incident_id }} — {{ r.linked_incident_title }}</a></div> }
          </div>
          <div style="text-align:right;margin-top:1rem;"><button class="btn-cancel" (click)="detail.set(null)">Close</button></div>
        </div>
      </div>
    }

    <!-- Convert -->
    @if (convertRow(); as r) {
      <div class="modal-backdrop" (click)="convertRow.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()" style="max-width:480px;">
          <h5 style="font-weight:800;margin:0 0 0.4rem;"><i class="fas fa-arrow-right-arrow-left me-2"></i>Convert to incident</h5>
          <p style="font-size:0.84rem;color:var(--text-mid);">Create a formal incident from citizen report <strong>{{ r.report_code }}</strong> ({{ r.hazard_type }} at {{ r.location_description }}). It enters the incident approval workflow.</p>
          <label class="f-lbl">Severity level</label>
          <select class="form-select" [(ngModel)]="convSeverity">
            <option value="Minor">Minor</option><option value="Moderate">Moderate</option>
            <option value="Major">Major</option><option value="Catastrophic">Catastrophic</option>
          </select>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="convertRow.set(null)">Cancel</button>
            <button class="btn-add" [disabled]="saving()" (click)="confirmConvert()">
              <i class="fas" [class.fa-arrow-right]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Convert
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); display: block; margin-bottom: 3px; }
    .btn-mini { font-size: 0.72rem; padding: 0.25rem 0.7rem; border-radius: 7px; border: 1px solid var(--border); background: #fff; cursor: pointer; margin-left: 4px; color: var(--text-dark); }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1500; display: flex; align-items: flex-start; justify-content: center; padding: 3vh 1rem; overflow-y: auto; }
    .modal-card { background: var(--card-bg, #fff); border-radius: 16px; max-width: 640px; width: 100%; padding: 1.4rem 1.5rem; }
    .btn-cancel { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 0.5rem 1rem; cursor: pointer; }
    .badge-muted { background: rgba(100,116,139,0.14); color: #64748b; }
  `],
})
export class PublicReportsComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = '/api/v1/response/public-reports';

  reports = signal<ReportRow[]>([]);
  stats = signal<Record<string, number>>({});
  detail = signal<ReportRow | null>(null);
  convertRow = signal<ReportRow | null>(null);
  saving = signal(false);

  fStatus = ''; fSearch = '';
  convSeverity = 'Moderate';
  openMenu = signal<number | null>(null);

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.reports.set(r.reports);
      this.stats.set(r.stats);
    });
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }

  view(r: ReportRow): void { this.detail.set(r); }

  review(r: ReportRow): void {
    const notes = prompt('Optional triage note for this report:') ?? '';
    this.http.post(`${this.base}/${r.id}/review`, { notes }).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.error?.detail ?? 'Could not mark under review.'),
    });
  }

  dismiss(r: ReportRow): void {
    const reason = prompt('Reason for dismissing this report (required):');
    if (!reason || !reason.trim()) { return; }
    this.http.post(`${this.base}/${r.id}/dismiss`, { reason: reason.trim() }).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.error?.detail ?? 'Could not dismiss the report.'),
    });
  }

  openConvert(r: ReportRow): void { this.convSeverity = 'Moderate'; this.convertRow.set(r); }

  confirmConvert(): void {
    const r = this.convertRow();
    if (!r) { return; }
    this.saving.set(true);
    this.http.post<any>(`${this.base}/${r.id}/convert`, { severity_level: this.convSeverity }).subscribe({
      next: res => {
        this.saving.set(false); this.convertRow.set(null); this.reload();
        if (res.incident_id && confirm(`${res.message}\n\nOpen the new incident now?`)) {
          this.router.navigate(['/m/response/incidents', res.incident_id]);
        }
      },
      error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not convert the report.'); },
    });
  }

  goIncident(id: number): void { this.router.navigate(['/m/response/incidents', id]); }

  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
