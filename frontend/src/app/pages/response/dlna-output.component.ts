import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DLNA_SECTIONS, DlnaField, dlnaDisplay } from './dlna-schema';
import { buildAnnex1Html } from './dlna-print';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * NDRF Annex 1 — the generated Damage, Loss and Needs Assessment document, rendered
 * from exactly what the sectors keyed (same schema as the form, so it can never drift).
 * Print-formatted; every unanswered item shows an honest "—" rather than being hidden.
 */
@Component({
    selector: 'page-dlna-output',
    imports: [RouterLink],
    styles: [`
    .doc { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 34px 44px; font-size: 0.85rem; color: #1f2937; }
    .doc-head { text-align: center; border-bottom: 2px solid #0d3b66; padding-bottom: 14px; margin-bottom: 18px; }
    .doc-head .gov { font-weight: 800; letter-spacing: 0.5px; font-size: 0.9rem; }
    .doc-head .office { font-size: 0.82rem; color: #475569; }
    .doc-head h1 { font-size: 1.15rem; margin: 10px 0 2px; color: #0d3b66; }
    .doc-head .ref { font-size: 0.82rem; color: #475569; }
    .status-final { color: #065f46; font-weight: 700; }
    .status-progress { color: #92400e; font-weight: 700; }
    h2 { font-size: 0.95rem; color: #0d3b66; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 22px 0 8px; }
    h3 { font-size: 0.8rem; text-transform: uppercase; color: #475569; margin: 14px 0 4px; }
    .kv { display: grid; grid-template-columns: minmax(280px, 46%) 1fr; gap: 4px 16px; padding: 3px 0; border-bottom: 1px dotted #eef1f5; }
    .kv .k { color: #475569; }
    .kv .v { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 0.82rem; }
    th { text-align: left; border: 1px solid #cbd5e1; background: #f1f5f9; padding: 5px 8px; font-size: 0.75rem; text-transform: uppercase; color: #475569; }
    td { border: 1px solid #e2e8f0; padding: 5px 8px; }
    .attr { font-size: 0.75rem; color: #6c757d; font-style: italic; margin: 2px 0 8px; }
    .toolbar { max-width: 900px; margin: 0 auto 12px; display: flex; gap: 8px; justify-content: flex-end; }
    .btn-sm { font-size: 0.78rem; padding: 6px 14px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; font-family: inherit; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .btn-sm:hover { background: #f1f5f9; }
    .b-file { background: #0d3b66; color: #fff; border-color: #0d3b66; }
    .b-file:hover { background: #0a2f52; }
    .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e3e6ed; font-size: 0.75rem; color: #6c757d; display: flex; justify-content: space-between; }
    @media print { .toolbar { display: none; } .doc { border: none; padding: 0; } }
  `],
    template: `
    @if (assessment(); as a) {
      <div class="toolbar">
        <a class="btn-sm" [routerLink]="['/m/response/dlna', a.id]"><i class="fas fa-arrow-left"></i> Back to keying</a>
        <button type="button" class="btn-sm" (click)="print()"><i class="fas fa-print"></i> Print</button>
        @if (a.status === 'Final' && canFile()) {
          <button type="button" class="btn-sm b-file" [disabled]="filing()" (click)="filePdf()">
            <i class="fas fa-file-pdf"></i> {{ filing() ? 'Filing…' : 'Generate PDF → Reports & Analytics' }}</button>
        }
      </div>
      <div class="doc">
        <div class="doc-head">
          <div class="gov">THE UNITED REPUBLIC OF TANZANIA</div>
          <div class="office">PRIME MINISTER'S OFFICE — DISASTER MANAGEMENT DEPARTMENT</div>
          <h1>DAMAGE, LOSS AND NEEDS ASSESSMENT (NDRF 2026 — ANNEX 1)</h1>
          <div class="ref">Ref: <b>{{ a.ref_no ?? ('DLNA #' + a.id) }}</b> ·
            Incident: <b>{{ incident()?.title }}</b> ·
            <span [class.status-final]="a.status === 'Final'" [class.status-progress]="a.status !== 'Final'">
              {{ a.status === 'Final' ? 'FINAL' : 'IN PROGRESS — not yet the official record' }}</span></div>
        </div>

        @if (covered().length > 1) {
          <h2>Incidents Covered ({{ assessment()?.scope === 'SAME_HAZARD' ? 'combined — same hazard' : 'combined — multi-hazard' }})</h2>
          <table><thead><tr><th>Incident</th><th>Hazard</th><th>Severity</th></tr></thead>
            <tbody>@for (ci of covered(); track ci.id) { <tr><td>{{ ci.title }}{{ ci.id === assessment()?.incident_id ? ' (lead)' : '' }}</td><td>{{ ci.hazard ?? '—' }}</td><td>{{ ci.severity_level ?? '—' }}</td></tr> }</tbody></table>
        }
        <h2>1. General Information</h2>
        <div class="kv"><span class="k">Date of visit</span><span class="v">{{ a.date_of_visit?.substring(0, 10) ?? '—' }}</span></div>
        <div class="kv"><span class="k">Region</span><span class="v">{{ a.region ?? '—' }}</span></div>
        <div class="kv"><span class="k">District</span><span class="v">{{ a.district ?? '—' }}</span></div>
        <div class="kv"><span class="k">Ward</span><span class="v">{{ a.ward ?? '—' }}</span></div>
        <div class="kv"><span class="k">Village / Mtaa</span><span class="v">{{ a.village ?? '—' }}</span></div>
        <div class="kv"><span class="k">GPS coordinates</span><span class="v">{{ a.gps_coordinates ?? '—' }}</span></div>
        <div class="kv"><span class="k">Type of disaster</span><span class="v">{{ a.disaster_type ?? '—' }}{{ a.disaster_type_other ? ' — ' + a.disaster_type_other : '' }}</span></div>
        <div class="kv"><span class="k">Name(s) of affected villages / mitaa</span><span class="v">{{ a.affected_villages ?? '—' }}</span></div>

        @if (teamMembers().length) {
          <h3>Assessment team</h3>
          <table><thead><tr><th>Name</th><th>Organization</th></tr></thead>
            <tbody>@for (m of teamMembers(); track $index) { <tr><td>{{ m.name || '—' }}</td><td>{{ m.organization || '—' }}</td></tr> }</tbody></table>
        }
        @if (interviewees().length) {
          <h3>Person(s) interviewed</h3>
          <table><thead><tr><th>Name</th><th>Position</th></tr></thead>
            <tbody>@for (p of interviewees(); track $index) { <tr><td>{{ p.name || '—' }}</td><td>{{ p.position || '—' }}</td></tr> }</tbody></table>
        }

        @for (sec of orderedSections(); track sec.section_key) {
          @if (schemaFor(sec.section_key); as schema) {
            <h2>{{ schema.no }}. {{ schema.title }}</h2>
            <div class="attr">Sector: {{ sec.sector_lead }}
              @if (sec.status === 'Submitted') { · keyed by {{ sec.filled_by_name ?? '—' }} on {{ sec.filled_at?.substring(0, 10) }} }
              @else { · <b>section not yet submitted</b> }
            </div>
            @for (f of schema.fields; track f.key) {
              @if (printable(f, sec.data)) {
                @switch (f.type) {
                  @case ('heading') { <h3>{{ f.label }}</h3> }
                  @case ('rows') {
                    <div class="kv" style="border:none"><span class="k">{{ f.label }}</span><span></span></div>
                    @if ((sec.data?.[f.key] ?? []).length) {
                      <table>
                        <thead><tr>@for (c of f.columns ?? []; track c.key) { <th>{{ c.label }}</th> }</tr></thead>
                        <tbody>
                          @for (row of sec.data[f.key]; track $index) {
                            <tr>@for (c of f.columns ?? []; track c.key) { <td>{{ row[c.key] ?? '—' }}</td> }</tr>
                          }
                        </tbody>
                      </table>
                    } @else { <div class="kv"><span class="k"></span><span class="v">—</span></div> }
                  }
                  @default {
                    <div class="kv"><span class="k">{{ f.label }}</span><span class="v">{{ display(f, sec.data?.[f.key]) }}</span></div>
                  }
                }
              }
            }
          }
        }

        <div class="foot">
          <span>Generated from e-MAAFA (DMIS) — keyed data, section-attributed.</span>
          <span>@if (a.status === 'Final') { Finalized {{ a.finalized_at?.substring(0, 10) }} } @else { Working copy }</span>
        </div>
      </div>
    }
  `
})
export class DlnaOutputComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly assessment = signal<any | null>(null);
  readonly incident = signal<any | null>(null);
  readonly sectionsData = signal<any[]>([]);
  readonly covered = signal<any[]>([]);
  readonly filing = signal(false);
  private id = 0;

  ngOnInit(): void {
    ensureSweetAlert();
    // Browser printing must show ONLY the document — the app shell hides via this body class.
    document.body.classList.add('doc-print-page');
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.http.get<any>(`/api/v1/response/dlna/${this.id}`).subscribe(d => {
      this.assessment.set(d.assessment);
      this.incident.set(d.incident);
      this.covered.set(d.covered_incidents ?? []);
      this.sectionsData.set(d.sections.map((s: any) => ({ ...s, data: parseJson(s.data) ?? {} })));
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('doc-print-page');
  }

  canFile(): boolean {
    return this.auth.hasPermission('damage_assessment.create');
  }

  /** Renders the document HTML (same schema as this screen) and files it as a PDF report. */
  filePdf(): void {
    const html = buildAnnex1Html(this.assessment(), this.incident(), this.sectionsData(), this.covered());
    this.filing.set(true);
    this.http.post<any>(`/api/v1/response/dlna/${this.id}/file-report`, { html }).subscribe({
      next: r => {
        this.filing.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Filed', text: r.message }));
      },
      error: err => {
        this.filing.set(false);
        ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'The PDF could not be filed.', 'error'));
      },
    });
  }

  orderedSections(): any[] {
    return this.sectionsData();
  }

  schemaFor(key: string) {
    return DLNA_SECTIONS.find(s => s.key === key);
  }

  teamMembers(): any[] {
    return parseJson(this.assessment()?.team_members) ?? [];
  }

  interviewees(): any[] {
    return parseJson(this.assessment()?.interviewees) ?? [];
  }

  /** Conditional ("If yes…") items print only when their condition was met. */
  printable(f: DlnaField, data: any): boolean {
    if (!f.showIf) { return true; }
    return (data?.[f.showIf.key]) === f.showIf.equals;
  }

  display(f: DlnaField, value: any): string {
    return dlnaDisplay(f, value);
  }

  print(): void {
    window.print();
  }
}

function parseJson(v: any): any {
  if (v == null) { return null; }
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
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
