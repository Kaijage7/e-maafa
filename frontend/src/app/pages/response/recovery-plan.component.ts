import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { buildAnnex2Html } from './dlna-print';
import { DLNA_SECTIONS } from './dlna-schema';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

interface Rows { [k: string]: any; }

/**
 * NDRF Annex 2 — Disaster Recovery Implementation Plan, one per incident. Chapters follow
 * the official template; the situation analysis is pre-seeded from the incident record and
 * its DLNA, everything else is keyed by the planning team. A document view renders the plan
 * in the official chapter order for print.
 */
@Component({
  selector: 'page-recovery-plan',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    label { display: block; font-size: 0.75rem; font-weight: 600; color: #334155; margin: 10px 0 3px; }
    input, textarea { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    .btn-sm { font-size: 0.78rem; padding: 6px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .b-blue { background: #0d3b66; color: #fff; }
    .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; } .b-outline:hover { background: #f1f5f9; }
    .wf-strip { display: flex; gap: 8px; align-items: center; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem; flex-wrap: wrap; }
    .rows-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    .rows-table th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #6c757d; padding: 4px 6px; }
    .rows-table td { padding: 3px 6px; }
    .hint { font-size: 0.78rem; color: #6c757d; }
    .seed { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; color: #475569; margin: 6px 0; }
    /* Document view */
    .doc { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 34px 44px; font-size: 0.85rem; color: #1f2937; }
    .doc-head { text-align: center; border-bottom: 2px solid #0d3b66; padding-bottom: 14px; margin-bottom: 18px; }
    .doc-head .gov { font-weight: 800; letter-spacing: 0.5px; }
    .doc-head h1 { font-size: 1.12rem; margin: 10px 0 2px; color: #0d3b66; }
    .doc h2 { font-size: 0.95rem; color: #0d3b66; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 20px 0 8px; }
    .doc p { white-space: pre-wrap; margin: 6px 0; }
    .doc table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 0.8rem; }
    .doc th { text-align: left; border: 1px solid #cbd5e1; background: #f1f5f9; padding: 5px 8px; font-size: 0.75rem; text-transform: uppercase; color: #475569; }
    .doc td { border: 1px solid #e2e8f0; padding: 5px 8px; }
    .doc .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e3e6ed; font-size: 0.75rem; color: #6c757d; display: flex; justify-content: space-between; }
    @media print { .wf-strip, dmis-page-header { display: none !important; } .doc { border: none; padding: 0; } }
  `],
  template: `
    @if (incident(); as inc) {
      <dmis-page-header [title]="'Recovery Implementation Plan — ' + inc.title" icon="fa-diagram-project"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'DLNA', url:'/m/response/dlna'}, {label:'Recovery Plan'}]">
      </dmis-page-header>

      <div class="wf-strip">
        <span class="hint"><i class="fas fa-circle-info"></i> NDRF Annex 2 — one plan per incident.
          @if (dlna()) { Situation analysis draws on <b>{{ dlna().ref_no }}</b> ({{ dlna().status }}). }
          @else { No DLNA opened for this incident yet — the situation analysis will lack keyed assessment data. }
        </span>
        <span style="flex:1"></span>
        <a class="btn-sm b-outline" [routerLink]="['/m/response/incidents', inc.id]"><i class="fas fa-exclamation-triangle"></i> Incident</a>
        <button type="button" class="btn-sm b-outline" (click)="mode.set(mode() === 'edit' ? 'doc' : 'edit')">
          <i class="fas" [class.fa-file-lines]="mode() === 'edit'" [class.fa-pen]="mode() === 'doc'"></i>
          {{ mode() === 'edit' ? 'Document view' : 'Back to editing' }}</button>
        @if (mode() === 'doc') {
          <button type="button" class="btn-sm b-outline" (click)="print()"><i class="fas fa-print"></i> Print</button>
          @if (canEdit()) {
            <button type="button" class="btn-sm b-blue" [disabled]="filing()" (click)="filePdf()">
              <i class="fas fa-file-pdf"></i> {{ filing() ? 'Filing…' : 'Generate PDF → Reports & Analytics' }}</button>
          }
        }
        @if (mode() === 'edit' && canEdit()) {
          <button type="button" class="btn-sm b-blue" (click)="save()"><i class="fas fa-save"></i> Save Plan</button>
        }
      </div>

      @if (mode() === 'edit') {
        <dmis-panel title="Chapter 1 — Introduction" icon="fa-book-open">
          <textarea rows="3" [(ngModel)]="ch.introduction" placeholder="Introduction to the plan…"></textarea>
        </dmis-panel>
        <dmis-panel title="Chapter 2 — Rationale, Objectives and Scope" icon="fa-bullseye">
          <textarea rows="3" [(ngModel)]="ch.rationale"></textarea>
        </dmis-panel>
        <dmis-panel title="Chapter 3 — Situation Analysis" icon="fa-magnifying-glass-chart">
          <div class="seed"><b>From the incident record:</b> {{ seedSummary() }}</div>
          <label>Overall socioeconomic impact of the disaster</label>
          <textarea rows="3" [(ngModel)]="ch.situation_overview"></textarea>
          <label>Summary of assessment findings per sector</label>
          <table class="rows-table">
            @if (ch.sector_findings.length) { <thead><tr><th style="width:220px">Sector</th><th>Findings</th><th></th></tr></thead> }
            <tbody>
              @for (r of ch.sector_findings; track $index; let idx = $index) {
                <tr><td><input [(ngModel)]="r.sector" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.findings" [ngModelOptions]="{standalone: true}"></td>
                    <td><button type="button" class="btn-sm b-outline" (click)="ch.sector_findings.splice(idx, 1)">✕</button></td></tr>
              }
            </tbody>
          </table>
          <button type="button" class="btn-sm b-outline" (click)="ch.sector_findings.push({sector:'', findings:''})"><i class="fas fa-plus"></i> Add sector</button>
        </dmis-panel>
        <dmis-panel title="Chapter 4 — Measures Taken to Address the Disaster" icon="fa-hand-holding-heart">
          <label>Fiscal and monetary measures</label>
          <textarea rows="2" [(ngModel)]="ch.measures_fiscal"></textarea>
          <label>Measures in each impacted sector</label>
          <table class="rows-table">
            @if (ch.sector_measures.length) { <thead><tr><th style="width:220px">Sector</th><th>Measures taken</th><th></th></tr></thead> }
            <tbody>
              @for (r of ch.sector_measures; track $index; let idx = $index) {
                <tr><td><input [(ngModel)]="r.sector" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.measures" [ngModelOptions]="{standalone: true}"></td>
                    <td><button type="button" class="btn-sm b-outline" (click)="ch.sector_measures.splice(idx, 1)">✕</button></td></tr>
              }
            </tbody>
          </table>
          <button type="button" class="btn-sm b-outline" (click)="ch.sector_measures.push({sector:'', measures:''})"><i class="fas fa-plus"></i> Add sector</button>
        </dmis-panel>
        <dmis-panel title="Chapter 5 — Proposed Priority Areas in Need of Additional Financing" icon="fa-ranking-star">
          <table class="rows-table">
            @if (ch.priorities.length) { <thead><tr><th style="width:200px">Sector</th><th>Relevance</th><th>Proposed activities</th><th></th></tr></thead> }
            <tbody>
              @for (r of ch.priorities; track $index; let idx = $index) {
                <tr><td><input [(ngModel)]="r.sector" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.relevance" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.activities" [ngModelOptions]="{standalone: true}"></td>
                    <td><button type="button" class="btn-sm b-outline" (click)="ch.priorities.splice(idx, 1)">✕</button></td></tr>
              }
            </tbody>
          </table>
          <button type="button" class="btn-sm b-outline" (click)="ch.priorities.push({sector:'', relevance:'', activities:''})"><i class="fas fa-plus"></i> Add priority</button>
        </dmis-panel>
        <dmis-panel title="Chapter 6 — Monitoring, Evaluation, Accountability and Learning" icon="fa-chart-line">
          <label>Risk and sustainability of the plan</label>
          <textarea rows="2" [(ngModel)]="ch.risk_sustainability"></textarea>
          <label>Monitoring indicators</label>
          <table class="rows-table">
            @if (ch.monitoring.length) { <thead><tr><th>Indicator</th><th>Baseline</th><th>Target</th><th>Method</th><th>Verification</th><th>Frequency</th><th>Responsible</th><th></th></tr></thead> }
            <tbody>
              @for (r of ch.monitoring; track $index; let idx = $index) {
                <tr><td><input [(ngModel)]="r.indicator" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.baseline" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.target" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.method" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.verification" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.frequency" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.responsible" [ngModelOptions]="{standalone: true}"></td>
                    <td><button type="button" class="btn-sm b-outline" (click)="ch.monitoring.splice(idx, 1)">✕</button></td></tr>
              }
            </tbody>
          </table>
          <button type="button" class="btn-sm b-outline" (click)="ch.monitoring.push({indicator:'', baseline:'', target:'', method:'', verification:'', frequency:'', responsible:''})"><i class="fas fa-plus"></i> Add indicator</button>
          <p class="hint" style="margin-top:8px">Reporting timeline (per the template): Weekly (Early Recovery) · Monthly (Rehabilitation) ·
            Quarterly (Reconstruction) · Bi-annual/Annual consolidated national reporting · Final Report.</p>
        </dmis-panel>
        <dmis-panel title="Chapter 7 — Budget, Action Plan and Implementation Matrix" icon="fa-coins">
          <label>Proposed budget</label>
          <table class="rows-table">
            @if (ch.budget.length) { <thead><tr><th style="width:200px">Sector</th><th>Activity</th><th style="width:160px">Amount (TZS)</th><th></th></tr></thead> }
            <tbody>
              @for (r of ch.budget; track $index; let idx = $index) {
                <tr><td><input [(ngModel)]="r.sector" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.activity" [ngModelOptions]="{standalone: true}"></td>
                    <td><input type="number" min="0" [(ngModel)]="r.amount" [ngModelOptions]="{standalone: true}"></td>
                    <td><button type="button" class="btn-sm b-outline" (click)="ch.budget.splice(idx, 1)">✕</button></td></tr>
              }
            </tbody>
          </table>
          <button type="button" class="btn-sm b-outline" (click)="ch.budget.push({sector:'', activity:'', amount:null})"><i class="fas fa-plus"></i> Add budget line</button>
          <p class="hint">Total proposed: <b>{{ budgetTotal() | number }}</b> TZS</p>
          <label>Recovery objectives and implementation matrix</label>
          <table class="rows-table">
            @if (ch.matrix.length) { <thead><tr><th>Objective</th><th>Strategies</th><th>Target</th><th>Timeframe</th><th>Responsible entity</th><th>Output indicator</th><th>Outcome indicator</th><th></th></tr></thead> }
            <tbody>
              @for (r of ch.matrix; track $index; let idx = $index) {
                <tr><td><input [(ngModel)]="r.objective" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.strategies" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.target" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.timeframe" [ngModelOptions]="{standalone: true}" placeholder="e.g. 0–3 months"></td>
                    <td><input [(ngModel)]="r.responsible" [ngModelOptions]="{standalone: true}" placeholder="Implementing entity"></td>
                    <td><input [(ngModel)]="r.output_indicator" [ngModelOptions]="{standalone: true}"></td>
                    <td><input [(ngModel)]="r.outcome_indicator" [ngModelOptions]="{standalone: true}"></td>
                    <td><button type="button" class="btn-sm b-outline" (click)="ch.matrix.splice(idx, 1)">✕</button></td></tr>
              }
            </tbody>
          </table>
          <button type="button" class="btn-sm b-outline" (click)="ch.matrix.push({objective:'', strategies:'', target:'', timeframe:'', responsible:'', output_indicator:'', outcome_indicator:''})"><i class="fas fa-plus"></i> Add matrix row</button>
        </dmis-panel>
      } @else {
        <div class="doc">
          <div class="doc-head">
            <div class="gov">THE UNITED REPUBLIC OF TANZANIA — PRIME MINISTER'S OFFICE</div>
            <h1>DISASTER RECOVERY IMPLEMENTATION PLAN (NDRF 2026 — ANNEX 2)</h1>
            <div class="hint">{{ inc.title }} · {{ inc.district_name ?? '' }}{{ inc.region_name ? ', ' + inc.region_name : '' }}
              @if (dlna()) { · informed by {{ dlna().ref_no }} ({{ dlna().status }}) }</div>
          </div>
          <h2>Chapter 1 — Introduction</h2><p>{{ ch.introduction || '—' }}</p>
          <h2>Chapter 2 — Rationale, Objectives and Scope</h2><p>{{ ch.rationale || '—' }}</p>
          <h2>Chapter 3 — Situation Analysis</h2>
          <p><b>Incident record:</b> {{ seedSummary() }}</p>
          <p>{{ ch.situation_overview || '—' }}</p>
          @if (ch.sector_findings.length) {
            <table><thead><tr><th>Sector</th><th>Assessment findings</th></tr></thead>
              <tbody>@for (r of ch.sector_findings; track $index) { <tr><td>{{ r.sector || '—' }}</td><td>{{ r.findings || '—' }}</td></tr> }</tbody></table>
          }
          <h2>Chapter 4 — Measures Taken to Address the Disaster</h2>
          <p><b>Fiscal and monetary measures:</b> {{ ch.measures_fiscal || '—' }}</p>
          @if (ch.sector_measures.length) {
            <table><thead><tr><th>Sector</th><th>Measures taken</th></tr></thead>
              <tbody>@for (r of ch.sector_measures; track $index) { <tr><td>{{ r.sector || '—' }}</td><td>{{ r.measures || '—' }}</td></tr> }</tbody></table>
          }
          <h2>Chapter 5 — Proposed Priority Areas in Need of Additional Financing</h2>
          @if (ch.priorities.length) {
            <table><thead><tr><th>Sector</th><th>Relevance</th><th>Proposed activities</th></tr></thead>
              <tbody>@for (r of ch.priorities; track $index) { <tr><td>{{ r.sector || '—' }}</td><td>{{ r.relevance || '—' }}</td><td>{{ r.activities || '—' }}</td></tr> }</tbody></table>
          } @else { <p>—</p> }
          <h2>Chapter 6 — Monitoring, Evaluation, Accountability and Learning</h2>
          <p><b>Risk and sustainability:</b> {{ ch.risk_sustainability || '—' }}</p>
          @if (ch.monitoring.length) {
            <table><thead><tr><th>Indicator</th><th>Baseline</th><th>Target</th><th>Method</th><th>Verification</th><th>Frequency</th><th>Responsible</th></tr></thead>
              <tbody>@for (r of ch.monitoring; track $index) { <tr><td>{{ r.indicator || '—' }}</td><td>{{ r.baseline || '—' }}</td><td>{{ r.target || '—' }}</td><td>{{ r.method || '—' }}</td><td>{{ r.verification || '—' }}</td><td>{{ r.frequency || '—' }}</td><td>{{ r.responsible || '—' }}</td></tr> }</tbody></table>
          }
          <p><b>Reporting timeline:</b> Weekly (Early Recovery) · Monthly (Rehabilitation) · Quarterly (Reconstruction) ·
            Bi-annual/Annual consolidated national reporting · Final Report.</p>
          <h2>Chapter 7 — Budget, Action Plan and Implementation Matrix</h2>
          @if (ch.budget.length) {
            <table><thead><tr><th>Sector</th><th>Activity</th><th>Amount (TZS)</th></tr></thead>
              <tbody>@for (r of ch.budget; track $index) { <tr><td>{{ r.sector || '—' }}</td><td>{{ r.activity || '—' }}</td><td>{{ (r.amount | number) ?? '—' }}</td></tr> }</tbody></table>
            <p><b>Total proposed budget:</b> {{ budgetTotal() | number }} TZS</p>
          }
          @if (ch.matrix.length) {
            <table><thead><tr><th>Objective</th><th>Strategies</th><th>Target</th><th>Timeframe</th><th>Responsible</th><th>Output indicator</th><th>Outcome indicator</th></tr></thead>
              <tbody>@for (r of ch.matrix; track $index) { <tr><td>{{ r.objective || '—' }}</td><td>{{ r.strategies || '—' }}</td><td>{{ r.target || '—' }}</td><td>{{ r.timeframe || '—' }}</td><td>{{ r.responsible || '—' }}</td><td>{{ r.output_indicator || '—' }}</td><td>{{ r.outcome_indicator || '—' }}</td></tr> }</tbody></table>
          }
          <div class="foot">
            <span>Generated from e-MAAFA (DMIS) — sectors: Productive, Infrastructure, Social and Cross-cutting.</span>
            <span>Incident #{{ inc.id }}</span>
          </div>
        </div>
      }
    }
  `,
})
export class RecoveryPlanComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly incident = signal<any | null>(null);
  readonly dlna = signal<any | null>(null);
  readonly mode = signal<'edit' | 'doc'>('edit');
  readonly filing = signal(false);

  ch: any = emptyChapters();
  private incidentId = 0;
  private dlnaId: number | null = null;

  canEdit(): boolean {
    return this.auth.hasPermission('damage_assessment.create');
  }

  ngOnInit(): void {
    ensureSweetAlert();
    document.body.classList.add('doc-print-page');
    this.incidentId = Number(this.route.snapshot.paramMap.get('incidentId'));
    this.http.get<any>(`/api/v1/response/dlna/plan/by-incident/${this.incidentId}`).subscribe(d => {
      this.incident.set(d.incident);
      this.dlna.set(d.dlna);
      this.dlnaId = d.dlna?.id ?? null;
      const stored = parseJson(d.plan?.chapters);
      this.ch = { ...emptyChapters(), ...(stored ?? {}) };
      // A brand-new plan with a DLNA behind it gets the Chapter-3 STRUCTURE pre-seeded:
      // one findings row per DLNA section (sector labels from the instrument), content keyed by the planner.
      if (!stored && d.dlna && !this.ch.sector_findings.length) {
        this.ch.sector_findings = DLNA_SECTIONS.map(sec => ({ sector: sec.title, findings: '' }));
      }
      if (!this.canEdit()) { this.mode.set('doc'); }
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('doc-print-page');
  }

  seedSummary(): string {
    const i = this.incident();
    if (!i) { return ''; }
    const parts = [
      `${i.title} (${i.severity_level ?? '—'}, ${i.status ?? '—'})`,
      i.district_name ? `${i.district_name}${i.region_name ? ', ' + i.region_name : ''}` : null,
      i.occurred_at ? `occurred ${String(i.occurred_at).substring(0, 10)}` : null,
      i.people_affected != null ? `${i.people_affected} people affected` : null,
      i.deaths_total != null ? `${i.deaths_total} deaths` : null,
      i.injured_total != null ? `${i.injured_total} injured` : null,
      i.displaced != null ? `${i.displaced} displaced` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }

  budgetTotal(): number {
    return (this.ch.budget as Rows[]).reduce((s, r) => s + (Number(r['amount']) || 0), 0);
  }

  save(): void {
    this.http.post<any>(`/api/v1/response/dlna/plan/by-incident/${this.incidentId}`,
      { chapters: this.ch, dlna_id: this.dlnaId }).subscribe({
        next: r => ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Saved', text: r.message, timer: 1800, showConfirmButton: false })),
        error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'Could not save the plan.', 'error')),
      });
  }

  print(): void {
    window.print();
  }

  /** Renders the plan document HTML and files it as a versioned PDF in Reports & Analytics. */
  filePdf(): void {
    const html = buildAnnex2Html(this.incident(), this.dlna(), this.ch, this.seedSummary());
    this.filing.set(true);
    this.http.post<any>(`/api/v1/response/dlna/plan/by-incident/${this.incidentId}/file-report`, { html }).subscribe({
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
}

function emptyChapters(): any {
  return {
    introduction: '', rationale: '', situation_overview: '', sector_findings: [],
    measures_fiscal: '', sector_measures: [], priorities: [], risk_sustainability: '',
    monitoring: [], budget: [], matrix: [],
  };
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
