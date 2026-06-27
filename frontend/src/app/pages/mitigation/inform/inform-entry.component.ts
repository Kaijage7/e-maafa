import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Area, Indicator, InformService, ValuePost } from './inform.service';
import { standardise } from './standardise';
import { INFORM_STYLES } from './inform-ui';

interface Row { indicator: Indicator; raw: number | null; denom: number | null; score: number | null; }
type Mode = 'actual' | 'scores' | 'paste';

/** INFORM tab — sector Data Entry, three modes:
 *  • actual : key raw values → live 0-10 standardiser preview (POST raw).
 *  • scores : key the 0-10 score directly (POST value0to10 — backend skips the standardiser).
 *  • paste  : paste "indicatorId, 0-10" lines in bulk (POST value0to10 each).
 *  All land PENDING for PMO approval. Sector officers reach this via prevention_and_mitigation.view + risk_index.create. */
@Component({
  selector: 'page-inform-entry',
  standalone: true,
  imports: [FormsModule],
  styles: [INFORM_STYLES, `
    :host { display:block; }
    .mode-row { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:1rem; }
    .mode-row button { font:inherit; font-size:.78rem; font-weight:700; padding:.35rem .85rem; border-radius:50px; border:1.5px solid var(--line,#cbd5e1); background:#fff; color:var(--text-mid,#475569); cursor:pointer; }
    .mode-row button.on { background:var(--module-color,#0d6efd); border-color:var(--module-color,#0d6efd); color:#fff; }
    textarea.paste { width:100%; min-height:160px; font:13px/1.5 ui-monospace,monospace; padding:.6rem .7rem; border:1px solid var(--line,#cbd5e1); border-radius:8px; }
  `],
  template: `
    <p class="muted">Pick your sector and an area, then key INFORM values. Submissions land pending PMO approval.</p>

    <div class="mode-row">
      <button [class.on]="mode()==='actual'" (click)="mode.set('actual')">Enter actual values → standardised</button>
      <button [class.on]="mode()==='scores'" (click)="mode.set('scores')">Enter scores (0–10)</button>
      <button [class.on]="mode()==='paste'" (click)="mode.set('paste')">Paste 0–10 by indicator</button>
    </div>

    <div class="row-controls">
      <div class="field" style="min-width:220px;"><label for="owner">Sector / owner</label>
        <select id="owner" [(ngModel)]="owner" (ngModelChange)="onOwnerChange()">
          <option value="">— select sector —</option>
          @for (o of owners(); track o) { <option [value]="o">{{ o }}</option> }
        </select>
      </div>
      <div class="field" style="min-width:240px;"><label for="area">Area</label>
        <select id="area" [(ngModel)]="areaCode">
          <option value="">— select area —</option>
          @for (a of areas(); track a.code) { <option [value]="a.code">{{ a.name }} ({{ a.level }})</option> }
        </select>
      </div>
      <div class="field"><label for="by">Entered by</label>
        <input id="by" type="text" [(ngModel)]="enteredBy" placeholder="your name / username">
      </div>
    </div>

    @if (loadingInd()) {
      <p class="muted">Loading indicators for {{ owner }}…</p>
    } @else if (owner && rows().length === 0) {
      <p class="muted">No indicators registered for this owner.</p>
    } @else if (rows().length > 0) {

      @if (mode() === 'paste') {
        <p class="muted" style="font-size:.8rem;">Paste one indicator per line: <code>indicatorId, score</code> (0–10). Commas, tabs or spaces accepted. Unknown ids are ignored.</p>
        <textarea class="paste" [(ngModel)]="pasteText" placeholder="HA.NAT.DR-FRE, 6.2&#10;VU.SE.POV-HDI 4.1"></textarea>
        <p class="muted" style="margin-top:.4rem;">{{ pasteParsed().length }} valid row(s) matched this sector's indicators.</p>
      } @else {
        <div class="card" style="padding:0; overflow:auto; max-height:52vh;">
          <table>
            <thead>
              <tr>
                <th>Indicator</th><th>Component</th><th>Unit</th>
                @if (mode()==='actual') {
                  <th style="width:140px;">Raw value</th>
                  @if (anyDenominator()) { <th style="width:140px;">Denominator</th> }
                  <th class="num" style="width:90px;">0–10</th>
                } @else {
                  <th class="num" style="width:120px;">Score (0–10)</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.indicator.id) {
                <tr>
                  <td><strong>{{ r.indicator.id }}</strong></td>
                  <td>{{ r.indicator.component || '—' }}</td>
                  <td class="muted">{{ r.indicator.unit || '—' }}</td>
                  @if (mode()==='actual') {
                    <td><input class="cell" style="width:120px;" type="number" step="any" [(ngModel)]="r.raw" placeholder="raw"></td>
                    @if (anyDenominator()) {
                      <td>@if (needsDenom(r.indicator)) { <input class="cell" style="width:120px;" type="number" step="any" [(ngModel)]="r.denom" placeholder="denom"> } @else { <span class="muted">—</span> }</td>
                    }
                    <td class="num">@if (preview(r) != null) { <span class="score">{{ preview(r) }}</span> } @else { <span class="score empty">—</span> }</td>
                  } @else {
                    <td class="num"><input class="cell" style="width:100px;" type="number" min="0" max="10" step="0.1" [(ngModel)]="r.score" placeholder="0–10"></td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <div style="margin-top:1rem; display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
        <button class="btn" [disabled]="!canSubmit() || submitting()" (click)="submit()">
          {{ submitting() ? 'Submitting…' : 'Submit values' }}
        </button>
        <span class="muted">{{ enteredCount() }} value(s) to submit</span>
        @if (success()) { <span class="success">{{ success() }}</span> }
        @if (error()) { <span class="error">{{ error() }}</span> }
      </div>
    }
  `,
})
export class InformEntryComponent implements OnInit {
  private svc = inject(InformService);
  mode = signal<Mode>('actual');
  owners = signal<string[]>([]);
  areas = signal<Area[]>([]);
  rows = signal<Row[]>([]);
  owner = '';
  areaCode = '';
  enteredBy = '';
  pasteText = '';
  loadingInd = signal(false);
  submitting = signal(false);
  success = signal<string | null>(null);
  error = signal<string | null>(null);

  anyDenominator = computed(() => this.rows().some(r => this.needsDenom(r.indicator)));

  ngOnInit(): void {
    try { this.enteredBy = JSON.parse(localStorage.getItem('dmis.user') || '{}')?.name || ''; } catch { /* ignore */ }
    this.svc.getIndicators().subscribe({
      next: list => { const set = new Set<string>(); for (const it of list ?? []) if (it.owner) set.add(it.owner); this.owners.set(Array.from(set).sort()); },
      error: () => this.owners.set([]),
    });
    this.svc.getAreas().subscribe({ next: list => this.areas.set(list ?? []), error: () => this.areas.set([]) });
  }

  onOwnerChange(): void {
    this.success.set(null); this.error.set(null); this.rows.set([]); this.pasteText = '';
    if (!this.owner) return;
    this.loadingInd.set(true);
    this.svc.getIndicators(this.owner).subscribe({
      next: list => { this.rows.set((list ?? []).map(it => ({ indicator: it, raw: null, denom: null, score: null }))); this.loadingInd.set(false); },
      error: err => { this.error.set(err?.status ? `HTTP ${err.status}` : 'Could not load indicators'); this.loadingInd.set(false); },
    });
  }

  needsDenom(it: Indicator): boolean { return !!it.denominator && it.denominator !== 'None'; }
  preview(r: Row): number | null { return standardise(r.raw, r.indicator, r.denom); }

  /** Parse the paste box into {indicatorId, score} matched against this sector's indicators. */
  pasteParsed = computed(() => {
    const byId = new Map(this.rows().map(r => [r.indicator.id.toUpperCase(), r.indicator.id]));
    const out: { indicatorId: string; value: number }[] = [];
    for (const line of (this.pasteText || '').split(/\r?\n/)) {
      const m = line.trim().split(/[\s,;\t]+/).filter(Boolean);
      if (m.length < 2) continue;
      const id = byId.get(m[0].toUpperCase());
      const v = Number(m[m.length - 1]);
      if (id && isFinite(v)) out.push({ indicatorId: id, value: v });
    }
    return out;
  });

  enteredCount(): number {
    if (this.mode() === 'paste') return this.pasteParsed().length;
    if (this.mode() === 'scores') return this.rows().filter(r => r.score != null && isFinite(r.score)).length;
    return this.rows().filter(r => r.raw != null && isFinite(r.raw)).length;
  }
  canSubmit(): boolean { return !!this.owner && !!this.areaCode && !!this.enteredBy.trim() && this.enteredCount() > 0; }

  submit(): void {
    if (!this.canSubmit()) return;
    this.success.set(null); this.error.set(null); this.submitting.set(true);
    const by = this.enteredBy.trim();
    let payloads: ValuePost[];
    if (this.mode() === 'paste') {
      payloads = this.pasteParsed().map(p => ({ indicatorId: p.indicatorId, areaCode: this.areaCode, value0to10: Math.max(0, Math.min(10, p.value)), by }));
    } else if (this.mode() === 'scores') {
      payloads = this.rows().filter(r => r.score != null && isFinite(r.score))
        .map(r => ({ indicatorId: r.indicator.id, areaCode: this.areaCode, value0to10: Math.max(0, Math.min(10, r.score as number)), by }));
    } else {
      payloads = this.rows().filter(r => r.raw != null && isFinite(r.raw))
        .map(r => ({ indicatorId: r.indicator.id, areaCode: this.areaCode, raw: r.raw as number, by }));
    }
    let done = 0, failed = 0; const total = payloads.length;
    for (const p of payloads) {
      this.svc.postValue(p).subscribe({
        next: () => { done++; this.maybeFinish(done, failed, total); },
        error: () => { failed++; this.maybeFinish(done, failed, total); },
      });
    }
  }

  private maybeFinish(done: number, failed: number, total: number): void {
    if (done + failed < total) return;
    this.submitting.set(false);
    if (failed === 0) this.success.set(`Submitted ${done} value(s) for ${this.areaCode} — pending PMO approval.`);
    else if (done === 0) this.error.set(`All ${failed} submission(s) failed. Check the backend.`);
    else { this.success.set(`Submitted ${done} value(s) — pending PMO approval.`); this.error.set(`${failed} submission(s) failed.`); }
  }
}
