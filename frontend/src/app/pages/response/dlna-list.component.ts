import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * NDRF Annex 1 — DLNA registry: every Damage, Loss and Needs Assessment opened in the
 * system, keyed per incident, with section-keying progress. Opening a new DLNA binds it
 * to an incident so the instrument stays linked throughout the system.
 */
@Component({
  selector: 'page-dlna-list',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
    .chip { display: inline-block; font-size: 0.75rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; }
    .c-InProgress { background: #fef3c7; color: #92400e; }
    .c-Final { background: #d1fae5; color: #065f46; }
    .prog { display: inline-flex; align-items: center; gap: 6px; }
    .prog-bar { width: 90px; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .prog-fill { height: 100%; background: #0d6efd; }
    .empty { text-align: center; color: #94a3b8; padding: 30px 0; font-size: 0.85rem; }
    .new-box { display: grid; grid-template-columns: 2fr 1fr auto; gap: 10px; align-items: end; margin-bottom: 4px; }
    .new-box label { display: block; font-size: 0.75rem; font-weight: 600; color: #334155; margin-bottom: 3px; }
    .new-box select, .new-box input { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    .btn-new { font-size: 0.82rem; padding: 8px 16px; border-radius: 6px; border: none; background: #dc3545; color: #fff; font-weight: 600; cursor: pointer; font-family: inherit; }
    .btn-new:hover { background: #c82333; }
    .hint { font-size: 0.78rem; color: #6c757d; margin: 4px 0 10px; }
    .scope-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
    .scope-opt { display: block; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; cursor: pointer; color: #334155; }
    .scope-opt.on { border-color: #0d3b66; background: #eef4fb; }
    .scope-opt b { display: inline; }
    .scope-opt span { display: block; font-size: 0.75rem; color: #6c757d; margin-top: 2px; }
    .scope-opt input { margin-right: 6px; }
    .inc-multi { max-height: 220px; overflow-y: auto; border: 1px solid #e3e6ed; border-radius: 8px; padding: 6px 10px; }
    .inc-opt { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; padding: 3px 0; cursor: pointer; }
    .inc-opt .haz { margin-left: auto; font-size: 0.75rem; font-weight: 600; color: #0d3b66; background: #eef4fb; border-radius: 8px; padding: 1px 8px; }
  `],
  template: `
    <dmis-page-header title="Damage, Loss &amp; Needs Assessments (NDRF Annex 1)" icon="fa-file-lines"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'DLNA'}]">
    </dmis-page-header>

    @if (mySections().length) {
      <dmis-panel title="Sections Awaiting Your Sector" icon="fa-inbox">
        <p class="hint">These DLNA sections are assigned to your sector ({{ myAgency()?.toUpperCase() }}) and are still
          pending — open one to key your sector's part of the assessment.</p>
        <table>
          <thead><tr><th>DLNA</th><th>Incident</th><th>Section</th><th>Visit date</th><th></th></tr></thead>
          <tbody>
            @for (m of mySections(); track m.dlna_id + '-' + m.section_key) {
              <tr>
                <td style="font-weight:600">{{ m.ref_no }}</td>
                <td>{{ m.incident_title }}</td>
                <td>{{ m.sector_lead }}</td>
                <td>{{ m.date_of_visit?.substring(0, 10) ?? '—' }}</td>
                <td><a class="chip" style="background:#0d3b66;color:#fff;text-decoration:none"
                       [routerLink]="['/m/response/dlna', m.dlna_id]" [queryParams]="{section: m.section_key}">
                  <i class="fas fa-pen"></i> Key section</a></td>
              </tr>
            }
          </tbody>
        </table>
      </dmis-panel>
    }

    @if (canCreate()) {
      <dmis-panel title="Open a New DLNA" icon="fa-plus">
        <p class="hint">The DLNA is the official NDRF rapid-assessment instrument. It is opened <b>per incident</b>;
          each of the 11 sections is then keyed and submitted by its assigned sector, and the system generates the
          Annex&nbsp;1 document from what was keyed.</p>
        <div class="scope-row">
          <label class="scope-opt" [class.on]="scope === 'SINGLE'">
            <input type="radio" name="scope" value="SINGLE" [(ngModel)]="scope"> <b>Single incident</b>
            <span>One DLNA for one incident (default)</span></label>
          <label class="scope-opt" [class.on]="scope === 'SAME_HAZARD'">
            <input type="radio" name="scope" value="SAME_HAZARD" [(ngModel)]="scope"> <b>Combined — same hazard</b>
            <span>Several incidents of ONE hazard, e.g. floods across districts</span></label>
          <label class="scope-opt" [class.on]="scope === 'MULTI_HAZARD'">
            <input type="radio" name="scope" value="MULTI_HAZARD" [(ngModel)]="scope"> <b>Combined — multi-hazard</b>
            <span>A compound event, e.g. floods + landslides + cyclone</span></label>
        </div>
        <div class="new-box">
          <div><label>{{ scope === 'SINGLE' ? 'Incident *' : 'Lead incident *' }}</label>
            <select [(ngModel)]="newIncidentId">
              <option [ngValue]="null">Select incident…</option>
              @for (i of incidents(); track i.id) { <option [ngValue]="i.id">{{ i.title }} — {{ i.hazard ?? 'no hazard type' }} ({{ i.severity_level }})</option> }
            </select></div>
          <div><label>Date of visit</label><input type="date" [(ngModel)]="newDate"></div>
          <button type="button" class="btn-new" [disabled]="creating()" (click)="create()">
            <i class="fas fa-file-circle-plus"></i> {{ creating() ? 'Opening…' : (scope === 'SINGLE' ? 'Open DLNA' : 'Open Combined DLNA') }}</button>
        </div>
        @if (scope !== 'SINGLE') {
          <label style="display:block; font-size:0.75rem; font-weight:600; color:#334155; margin:10px 0 3px">
            Additional incidents covered * <span style="font-weight:400; color:#6c757d">— {{ scope === 'SAME_HAZARD' ? 'must all share the lead incident’s hazard' : 'must span at least two different hazards' }}</span></label>
          <div class="inc-multi">
            @for (i of incidents(); track i.id) {
              @if (i.id !== newIncidentId) {
                <label class="inc-opt">
                  <input type="checkbox" [checked]="additional.includes(i.id)" (change)="toggleAdditional(i.id)">
                  {{ i.title }} <span class="haz">{{ i.hazard ?? 'no hazard type' }}</span>
                </label>
              }
            }
          </div>
        }
      </dmis-panel>
    }

    <dmis-panel title="DLNA Registry" icon="fa-list">
      <table>
        <thead><tr><th>Ref</th><th>Lead incident</th><th>Coverage</th><th>Type</th><th>Area</th><th>Visit date</th><th>Sections keyed</th><th>Status</th><th>Opened by</th></tr></thead>
        <tbody>
          @for (d of assessments(); track d.id) {
            <tr>
              <td><a [routerLink]="['/m/response/dlna', d.id]" style="font-weight:600">{{ d.ref_no ?? ('#' + d.id) }}</a></td>
              <td><a [routerLink]="['/m/response/incidents', d.incident_id]">{{ d.incident_title }}</a></td>
              <td>@if (d.scope === 'SINGLE' || !d.scope) { <span style="color:#6c757d">Single</span> }
                  @else { <span class="chip" style="background:#eef4fb;color:#0d3b66">{{ d.scope === 'SAME_HAZARD' ? 'Same hazard' : 'Multi-hazard' }} · {{ d.incident_count }} incidents</span> }</td>
              <td>{{ d.disaster_type ?? '—' }}</td>
              <td>{{ d.district ?? '—' }}<br><small style="color:#6c757d">{{ d.region ?? '' }}</small></td>
              <td>{{ d.date_of_visit?.substring(0, 10) ?? '—' }}</td>
              <td>
                <span class="prog">
                  <span class="prog-bar"><span class="prog-fill" [style.width.%]="(d.submitted_count / d.section_count) * 100"></span></span>
                  {{ d.submitted_count }}/{{ d.section_count }}
                </span>
              </td>
              <td><span class="chip c-{{ d.status?.replace(' ', '') }}">{{ d.status }}</span></td>
              <td>{{ d.created_by_name ?? '—' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="9" class="empty"><i class="fas fa-file-lines"></i>
              No DLNA opened yet — open one against an incident above to start sector keying.</td></tr>
          }
        </tbody>
      </table>
    </dmis-panel>
  `,
})
export class DlnaListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly assessments = signal<any[]>([]);
  readonly incidents = signal<any[]>([]);
  readonly mySections = signal<any[]>([]);
  readonly myAgency = signal<string | null>(null);
  readonly creating = signal(false);
  newIncidentId: number | null = null;
  newDate = localToday();
  scope = 'SINGLE';
  additional: number[] = [];

  toggleAdditional(id: number): void {
    const i = this.additional.indexOf(id);
    if (i >= 0) { this.additional.splice(i, 1); } else { this.additional.push(id); }
  }

  canCreate(): boolean {
    return this.auth.hasPermission('damage_assessment.create');
  }

  ngOnInit(): void {
    ensureSweetAlert();
    this.http.get<any>('/api/v1/response/dlna').subscribe(d => {
      this.assessments.set(d.assessments);
      this.incidents.set(d.incidents);
    });
    this.http.get<any>('/api/v1/response/dlna/my-sections').subscribe({
      next: d => { this.mySections.set(d.sections ?? []); this.myAgency.set(d.agency ?? null); },
      error: () => { /* non-agency logins simply have no queue */ },
    });
  }

  create(): void {
    if (!this.newIncidentId) {
      ensureSweetAlert().then(() => Swal.fire('Missing incident',
        'The DLNA is keyed per incident — select the incident it surveys.', 'warning'));
      return;
    }
    if (this.scope !== 'SINGLE' && !this.additional.length) {
      ensureSweetAlert().then(() => Swal.fire('Missing incidents',
        'A combined DLNA needs at least one additional incident — tick the incidents it covers.', 'warning'));
      return;
    }
    this.creating.set(true);
    this.http.post<any>('/api/v1/response/dlna', {
      incident_id: this.newIncidentId, scope: this.scope,
      additional_incident_ids: this.scope === 'SINGLE' ? [] : this.additional,
      date_of_visit: this.newDate,
    }).subscribe({
      next: r => this.router.navigate(['/m/response/dlna', r.id]),
      error: err => {
        this.creating.set(false);
        ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'Could not open the DLNA.', 'error'));
      },
    });
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/vendor/sweetalert2/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = '/vendor/sweetalert2/sweetalert2.all.min.js';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}

/** Today's date in the operator's LOCAL timezone (UTC would be a day behind before 03:00 EAT). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
