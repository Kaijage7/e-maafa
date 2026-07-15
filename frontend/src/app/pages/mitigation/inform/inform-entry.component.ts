import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Area, Indicator, InformService, ValuePost } from './inform.service';
import { standardise } from './standardise';
import { INFORM_STYLES } from './inform-ui';
import { AuthService } from '../../../core/auth.service';

interface Row { indicator: Indicator; raw: number | null; denom: number | null; score: number | null; }
interface MultiPasteRow {
  indicatorId: string;
  areaCode: string;
  areaName: string;
  areaLevel: string;
  value: number;
  rowNo: number;
  column: string;
}
interface MultiPasteResult {
  values: MultiPasteRow[];
  errors: string[];
  warnings: string[];
  duplicates: number;
  skippedBlank: number;
}
type Mode = 'actual' | 'scores' | 'paste' | 'multiPaste';

/** INFORM tab — sector Data Entry, four modes:
 *  • actual : key raw values → live 0-10 standardiser preview (POST raw).
 *  • scores : key the 0-10 score directly (POST value0to10 — backend skips the standardiser).
 *  • paste  : paste "indicatorId, 0-10" lines in bulk (POST value0to10 each).
 *  • multiPaste : paste many area/indicator scores from spreadsheet rows in one staged POST.
 *  All land PENDING for PMO approval. Sector officers reach this via risk_index.view + risk_index.create. */
@Component({
    selector: 'page-inform-entry',
    imports: [FormsModule],
    styles: [INFORM_STYLES, `
    :host { display:block; }
    .mode-row { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:1rem; }
    .mode-row button { font:inherit; font-size:.78rem; font-weight:700; padding:.35rem .85rem; border-radius:50px; border:1.5px solid var(--line,#cbd5e1); background:#fff; color:var(--text-mid,#475569); cursor:pointer; }
    .mode-row button:hover:not(.on) { border-color:#94a3b8; background:#f8fafc; }
    .mode-row button.on { background:var(--module-color,#0d6efd); border-color:var(--module-color,#0d6efd); color:#fff; }
    textarea.paste { width:100%; min-height:160px; font:13px/1.5 ui-monospace,monospace; padding:.6rem .7rem; border:1px solid var(--line,#cbd5e1); border-radius:8px; }
    .paste-workbench { display:grid; gap:.8rem; }
    .level-cards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.55rem; }
    .level-card { text-align:left; min-height:84px; border:1.5px solid var(--line,#cbd5e1); border-radius:8px; background:#fff; padding:.65rem .75rem; cursor:pointer; color:var(--text-dark,#1e293b); font:inherit; }
    .level-card:hover:not(.on) { border-color:#94a3b8; background:#f8fafc; }
    .level-card.on { border-color:var(--module-color,#0d6efd); box-shadow:0 0 0 2px color-mix(in srgb,var(--module-color,#0d6efd) 18%,transparent); }
    .level-card b { display:block; font-size:1.15rem; margin:.15rem 0; }
    .level-card span { font-size:.76rem; font-weight:800; text-transform:uppercase; color:var(--text-mid,#475569); }
    .level-card small { display:block; color:#64748b; font-size:.74rem; line-height:1.25; white-space:normal; }
    .import-actions { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
    .import-actions .hint { margin-left:auto; font-size:.78rem; color:#64748b; }
    .stage-metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:.55rem; }
    .stage-metric { background:#fff; border:1px solid var(--line,#e2e8f0); border-radius:8px; padding:.6rem .7rem; }
    .stage-metric b { display:block; font-size:1.1rem; font-variant-numeric:tabular-nums; }
    .stage-metric span { display:block; font-size:.72rem; font-weight:800; text-transform:uppercase; color:#64748b; }
    .issue-box { border-radius:8px; padding:.65rem .8rem; font-size:.8rem; }
    .issue-box.error-box { background:#fef2f2; border:1px solid #fecaca; color:#991b1b; }
    .issue-box.warn-box { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
    .issue-box ul { margin:.35rem 0 0; padding-left:1.2rem; }
    .preview-wrap { max-height:260px; overflow:auto; border:1px solid var(--line,#e2e8f0); border-radius:8px; }
    .preview-wrap table { margin:0; }
    .ready-strip { display:flex; align-items:center; justify-content:space-between; gap:.75rem; background:#f8fafc; border:1px solid var(--line,#e2e8f0); border-radius:8px; padding:.55rem .7rem; }
    .honest-banner { background:#fffbeb; border:1px solid #fcd34d; border-radius:10px; padding:.75rem .9rem; margin:0 0 1rem; font-size:.86rem; color:#78350f; line-height:1.45; }
    .honest-banner strong { color:#92400e; }
    .honest-banner ol { margin:.35rem 0 0; padding-left:1.15rem; }
    @media (max-width: 900px) { .level-cards, .stage-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  `],
    template: `
    <div class="honest-banner">
      <strong>Honest pipeline — paste does <em>not</em> colour the map immediately.</strong>
      <ol>
        <li>Focal / sector officer pastes Excel or keys values here (your sector’s indicators only).</li>
        <li>Each row is saved as <strong>pending</strong> — it never becomes the live composite or EO signal until approved.</li>
        <li>PMO opens <strong>Approvals</strong>, reviews, and approves (or rejects).</li>
        <li>Only after approval does the Risk Map / public explorer recompute from the new <code>isLatest</code> values (refresh or wait for the next load).</li>
      </ol>
    </div>
    <p class="muted">Select a sector and an area, then key INFORM values. Submissions are queued for PMO approval.</p>

    <div class="mode-row">
      <button [class.on]="mode()==='actual'" (click)="mode.set('actual')">Enter actual values → standardised</button>
      <button [class.on]="mode()==='scores'" (click)="mode.set('scores')">Enter scores (0–10)</button>
      <button [class.on]="mode()==='paste'" (click)="mode.set('paste')">Paste 0–10 by indicator</button>
      <button [class.on]="mode()==='multiPaste'" (click)="mode.set('multiPaste'); areaCode=''">Paste by area (Excel matrix)</button>
    </div>

    <div class="row-controls">
      <div class="field" style="min-width:220px;"><label for="owner">Sector / owner</label>
        <select id="owner" [(ngModel)]="owner" (ngModelChange)="onOwnerChange()" [disabled]="sectorLocked()">
          <option value="">— select sector —</option>
          @for (o of owners(); track o) { <option [value]="o">{{ o }}</option> }
        </select>
      </div>
      <div class="field" style="min-width:180px;"><label for="areaLevel">Area level</label>
        <select id="areaLevel" [ngModel]="areaLevel()" (ngModelChange)="areaLevel.set($event); areaCode=''">
          <option value="">All levels</option>
          <option value="region">Regions</option>
          <option value="district">Districts</option>
          <option value="council">Councils</option>
        </select>
      </div>
      <div class="field" style="min-width:240px;"><label for="area">Area</label>
        <select id="area" [(ngModel)]="areaCode" [disabled]="mode()==='multiPaste'">
          <option value="">{{ mode()==='multiPaste' ? '— from pasted rows —' : '— select area —' }}</option>
          @for (a of filteredAreas(); track a.code) { <option [value]="a.code">{{ a.name }} ({{ a.level }})</option> }
        </select>
      </div>
      <div class="field"><label for="by">Entered by</label>
        <input id="by" type="text" [(ngModel)]="enteredBy" placeholder="Name or username">
      </div>
    </div>

    @if (loadingInd()) {
      <p class="muted">Loading indicators for {{ owner }}…</p>
    } @else if (owner && rows().length === 0) {
      <p class="muted">No indicators registered for this owner.</p>
    } @else if (rows().length > 0) {

      @if (mode() === 'paste') {
        <p class="muted" style="font-size:.8rem;">Paste one indicator per line: <code>indicatorId, score</code> (0–10). Commas, tabs or spaces accepted. Unknown ids are ignored.</p>
        <textarea class="paste" [ngModel]="pasteText()" (ngModelChange)="pasteText.set($event)" placeholder="HA.NAT.DR-FRE, 6.2&#10;VU.SE.POV-HDI 4.1"></textarea>
        <p class="muted" style="margin-top:.4rem;">{{ pasteParsed().length }} valid row(s) matched this sector's indicators.</p>
      } @else if (mode() === 'multiPaste') {
        <div class="paste-workbench">
          <div class="level-cards">
            @for (lvl of levelCards; track lvl.value) {
              <button type="button" class="level-card" [class.on]="areaLevel()===lvl.value" (click)="setAreaLevel(lvl.value)">
                <span>{{ lvl.label }}</span>
                <b>{{ areaCount(lvl.value) }}</b>
                <small>{{ lvl.help }}</small>
              </button>
            }
          </div>

          <div class="import-actions">
            <button type="button" class="btn ghost" (click)="loadPasteTemplate('matrix')">Load matrix template</button>
            <button type="button" class="btn ghost" (click)="loadPasteTemplate('long')">Load long template</button>
            <button type="button" class="btn ghost" (click)="pasteText.set('')">Clear paste</button>
            <span class="hint">Excel paste supports tab, comma or semicolon columns. Use 0-10 scores only.</span>
          </div>

          <textarea class="paste" [ngModel]="pasteText()" (ngModelChange)="pasteText.set($event)"
            placeholder="Matrix from Excel:&#10;areaCode&#9;HA.NAT.DR-FRE&#9;VU.SE.POV-HDI&#10;C001&#9;6.2&#9;4.1&#10;C002&#9;5.8&#9;3.9&#10;&#10;Long rows also work:&#10;C001&#9;HA.NAT.DR-FRE&#9;6.2"></textarea>

          <div class="stage-metrics">
            <div class="stage-metric"><b>{{ multiParsed().values.length }}</b><span>Valid values</span></div>
            <div class="stage-metric"><b>{{ multiAreaCount() }}</b><span>Areas matched</span></div>
            <div class="stage-metric"><b>{{ multiIndicatorCount() }}</b><span>Indicators</span></div>
            <div class="stage-metric"><b>{{ multiParsed().errors.length }}</b><span>Errors</span></div>
            <div class="stage-metric"><b>{{ multiParsed().duplicates }}</b><span>Duplicates skipped</span></div>
          </div>

          @if (multiParsed().errors.length) {
            <div class="issue-box error-box">
              <b>Fix these before submitting</b>
              <ul>@for (e of multiParsed().errors; track e) { <li>{{ e }}</li> }</ul>
            </div>
          }
          @if (multiParsed().warnings.length) {
            <div class="issue-box warn-box">
              <b>Review notes</b>
              <ul>@for (w of multiParsed().warnings; track w) { <li>{{ w }}</li> }</ul>
            </div>
          }

          @if (multiParsed().values.length) {
            <div class="preview-wrap">
              <table>
                <thead><tr><th>Area</th><th>Level</th><th>Indicator</th><th class="num">Score</th><th>Source</th></tr></thead>
                <tbody>
                  @for (v of multiPreview(); track v.areaCode + v.indicatorId + v.rowNo + v.column) {
                    <tr>
                      <td><strong>{{ v.areaCode }}</strong><br><span class="muted">{{ v.areaName }}</span></td>
                      <td><span class="pill">{{ v.areaLevel }}</span></td>
                      <td>{{ v.indicatorId }}</td>
                      <td class="num"><span class="score">{{ v.value }}</span></td>
                      <td class="muted">line {{ v.rowNo }} · {{ v.column }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="ready-strip">
              <span class="muted">{{ multiReadyText() }}</span>
              <span class="muted">Previewing first {{ multiPreview().length }} staged value(s).</span>
            </div>
          }
        </div>
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
                    <td><input class="cell" style="width:120px;" type="number" step="any" [(ngModel)]="r.raw" placeholder="Raw value"></td>
                    @if (anyDenominator()) {
                      <td>@if (needsDenom(r.indicator)) { <input class="cell" style="width:120px;" type="number" step="any" [(ngModel)]="r.denom" placeholder="Denominator"> } @else { <span class="muted">—</span> }</td>
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
  `
})
export class InformEntryComponent implements OnInit {
  private svc = inject(InformService);
  private auth = inject(AuthService);
  mode = signal<Mode>('actual');
  owners = signal<string[]>([]);
  areas = signal<Area[]>([]);
  rows = signal<Row[]>([]);
  areaLevel = signal('');
  sectorLocked = signal(false);
  owner = '';
  areaCode = '';
  enteredBy = '';
  pasteText = signal('');
  loadingInd = signal(false);
  submitting = signal(false);
  success = signal<string | null>(null);
  error = signal<string | null>(null);
  readonly levelCards = [
    { value: '', label: 'All levels', help: 'Accept region, district or council rows together' },
    { value: 'region', label: 'Regions', help: 'One row per region' },
    { value: 'district', label: 'Districts', help: 'One row per district' },
    { value: 'council', label: 'Councils', help: 'One row per council/LGA' },
  ];

  anyDenominator = computed(() => this.rows().some(r => this.needsDenom(r.indicator)));
  filteredAreas = computed(() => {
    const level = this.areaLevel();
    return level ? this.areas().filter(a => a.level === level) : this.areas();
  });

  ngOnInit(): void {
    this.enteredBy = this.auth.user()?.name ?? '';
    if (!this.enteredBy) {
      try { this.enteredBy = JSON.parse(localStorage.getItem('dmis.user') || '{}')?.name || ''; } catch { /* ignore */ }
    }
    this.svc.getIndicators().subscribe({
      next: list => {
        const set = new Set<string>();
        for (const it of list ?? []) if (it.owner) set.add(it.owner);
        const ownerList = Array.from(set).sort();
        const agency = this.auth.user()?.agency?.trim();
        const matched = agency ? ownerList.find(o => this.norm(o) === this.norm(agency)) : null;
        if (matched) {
          this.owners.set([matched]);
          this.owner = matched;
          this.sectorLocked.set(true);
          this.onOwnerChange();
        } else {
          this.owners.set(ownerList);
          this.sectorLocked.set(false);
        }
      },
      error: () => this.owners.set([]),
    });
    this.svc.getAreas().subscribe({ next: list => this.areas.set(list ?? []), error: () => this.areas.set([]) });
  }

  onOwnerChange(): void {
    this.success.set(null); this.error.set(null); this.rows.set([]); this.pasteText.set('');
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
    for (const line of (this.pasteText() || '').split(/\r?\n/)) {
      const m = line.trim().split(/[\s,;\t]+/).filter(Boolean);
      if (m.length < 2) continue;
      const id = byId.get(m[0].toUpperCase());
      const v = Number(m[m.length - 1]);
      if (id && isFinite(v)) out.push({ indicatorId: id, value: v });
    }
    return out;
  });

  multiParsed = computed(() => {
    const byId = this.indicatorLookup();
    const byArea = this.areaLookup();
    const values: MultiPasteRow[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    let duplicates = 0;
    let skippedBlank = 0;
    const lines = (this.pasteText() || '').split(/\r?\n/)
      .map((line, idx) => ({ raw: line, line: line.trim(), no: idx + 1 }))
      .filter(x => x.line && !x.line.startsWith('#'));
    if (!lines.length) {
      return { values, errors, warnings, duplicates, skippedBlank };
    }

    const first = this.splitPasteLine(lines[0].raw);
    const firstIsLongHeader = this.looksLikeLongHeader(first);
    const firstCellKnownArea = byArea.has(this.norm(first[0] ?? ''));
    const knownIndicatorColumns = first.slice(1).filter(cell => byId.has(this.norm(cell))).length;
    const matrixHeader = !firstIsLongHeader && first.length > 1
      && (this.isAreaHeader(first[0]) || this.isDescriptorHeader(first[0])
        || (!firstCellKnownArea && knownIndicatorColumns >= 2));
    const addValue = (area: Area, indicatorId: string, rawValue: string, rowNo: number, column: string) => {
      if (rawValue == null || String(rawValue).trim() === '') {
        skippedBlank++;
        return;
      }
      const value = this.parseScore(rawValue);
      if (value == null) {
        this.pushParseError(errors, `Line ${rowNo}: "${rawValue}" is not a numeric 0-10 score`);
        return;
      }
      if (value < 0 || value > 10) {
        this.pushParseError(errors, `Line ${rowNo}: ${value} is outside the 0-10 INFORM score range`);
        return;
      }
      const selectedLevel = this.areaLevel();
      if (selectedLevel && area.level !== selectedLevel) {
        this.pushParseError(errors, `Line ${rowNo}: ${area.name} is ${area.level}, not ${selectedLevel}`);
        return;
      }
      const key = `${area.code}|${indicatorId}`;
      if (seen.has(key)) {
        duplicates++;
        this.pushParseWarning(warnings, `Line ${rowNo}: duplicate ${area.code} / ${indicatorId} skipped`);
        return;
      }
      seen.add(key);
      values.push({ areaCode: area.code, areaName: area.name, areaLevel: area.level, indicatorId, value, rowNo, column });
    };

    if (matrixHeader) {
      const indicators = first.slice(1).map(id => {
        if (this.isDescriptorHeader(id)) return 'descriptor';
        return byId.get(this.norm(id)) || null;
      });
      indicators.forEach((indicatorId, idx) => {
        if (indicatorId == null) {
          this.pushParseError(errors, `Header column ${idx + 2}: unknown indicator "${first[idx + 1]}"`);
        }
      });
      for (const row of lines.slice(1)) {
        const parts = this.splitPasteLine(row.raw);
        if (parts.length < 1) {
          this.pushParseError(errors, `Line ${row.no}: missing area`);
          continue;
        }
        const area = byArea.get(this.norm(parts[0]));
        if (!area) {
          this.pushParseError(errors, `Line ${row.no}: unknown area ${parts[0]}`);
          continue;
        }
        indicators.forEach((indicatorId, idx) => {
          if (!indicatorId || indicatorId === 'descriptor') {
            return;
          }
          addValue(area, indicatorId, parts[idx + 1] ?? '', row.no, first[idx + 1]);
        });
      }
      return { values, errors, warnings, duplicates, skippedBlank };
    }

    const longRows = firstIsLongHeader ? lines.slice(1) : lines;
    for (const row of longRows) {
      const parts = this.splitPasteLine(row.raw);
      if (parts.length < 3) {
        this.pushParseError(errors, `Line ${row.no}: expected area, indicator, score`);
        continue;
      }
      let area = byArea.get(this.norm(parts[0]));
      let indicatorId = byId.get(this.norm(parts[1]));
      let valueText = parts[2];
      if (!area || !indicatorId) {
        indicatorId = byId.get(this.norm(parts[0]));
        area = byArea.get(this.norm(parts[1]));
        valueText = parts[2];
      }
      if (!area || !indicatorId) {
        this.pushParseError(errors, `Line ${row.no}: unknown area/indicator or invalid score`);
        continue;
      }
      addValue(area, indicatorId, valueText, row.no, 'score');
    }
    return { values, errors, warnings, duplicates, skippedBlank };
  });

  multiAreaCount(): number {
    return new Set(this.multiParsed().values.map(v => v.areaCode)).size;
  }

  multiIndicatorCount(): number {
    return new Set(this.multiParsed().values.map(v => v.indicatorId)).size;
  }

  multiPreview(): MultiPasteRow[] {
    return this.multiParsed().values.slice(0, 16);
  }

  multiReadyText(): string {
    const parsed = this.multiParsed();
    if (parsed.errors.length) {
      return 'Resolve the highlighted errors before submitting this staged batch.';
    }
    if (!parsed.values.length) {
      return 'Paste a filled Excel matrix or long-row list to stage values.';
    }
    const level = this.areaLevel() ? this.areaLevel() : 'mixed levels';
    return `Ready: ${parsed.values.length} value(s), ${this.multiAreaCount()} area(s), ${this.multiIndicatorCount()} indicator(s), ${level}.`;
  }

  enteredCount(): number {
    if (this.mode() === 'multiPaste') return this.multiParsed().values.length;
    if (this.mode() === 'paste') return this.pasteParsed().length;
    if (this.mode() === 'scores') return this.rows().filter(r => r.score != null && isFinite(r.score)).length;
    return this.rows().filter(r => r.raw != null && isFinite(r.raw)).length;
  }
  canSubmit(): boolean {
    const areaOk = this.mode() === 'multiPaste' || !!this.areaCode;
    const pasteOk = this.mode() !== 'multiPaste' || this.multiParsed().errors.length === 0;
    return !!this.owner && areaOk && !!this.enteredBy.trim() && this.enteredCount() > 0 && pasteOk;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.success.set(null); this.error.set(null); this.submitting.set(true);
    const by = this.enteredBy.trim();
    let payloads: ValuePost[];
    if (this.mode() === 'multiPaste') {
      payloads = this.multiParsed().values.map(p => ({ indicatorId: p.indicatorId, areaCode: p.areaCode, value0to10: p.value, by }));
      this.svc.postValuesBatch(payloads, by).subscribe({
        next: r => {
          this.submitting.set(false);
          if ((r.failed ?? 0) === 0) {
            this.success.set(`Submitted ${r.submitted} value(s) across ${this.multiAreaCount()} area(s) — pending PMO approval.`);
          } else if ((r.submitted ?? 0) === 0) {
            this.error.set(`All ${r.failed} submission(s) failed. ${r.errors?.[0]?.error ?? 'Please review the pasted rows.'}`);
          } else {
            this.success.set(`Submitted ${r.submitted} value(s) — pending PMO approval.`);
            this.error.set(`${r.failed} row(s) failed. ${r.errors?.[0]?.error ?? 'Review the pasted rows.'}`);
          }
        },
        error: err => {
          this.submitting.set(false);
          this.error.set(err?.error?.detail || err?.error?.message || 'Batch submission failed.');
        },
      });
      return;
    } else if (this.mode() === 'paste') {
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
    else if (done === 0) this.error.set(`All ${failed} submission(s) failed. Please try again.`);
    else { this.success.set(`Submitted ${done} value(s) — pending PMO approval.`); this.error.set(`${failed} submission(s) failed.`); }
  }

  private splitPasteLine(line: string): string[] {
    const raw = String(line ?? '').replace(/\r$/, '');
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (raw.includes('\t')) {
      return raw.split('\t').map(x => x.trim());
    }
    if (raw.includes(';')) {
      return raw.split(';').map(x => x.trim());
    }
    if (raw.includes(',')) {
      return this.splitCsv(raw);
    }
    return trimmed.split(/\s+/).map(x => x.trim()).filter(Boolean);
  }

  private clampScore(value: number): number {
    return Math.max(0, Math.min(10, value));
  }

  private norm(value: string): string {
    return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private pushParseError(errors: string[], message: string): void {
    if (errors.length < 8) {
      errors.push(message);
    }
  }

  private pushParseWarning(warnings: string[], message: string): void {
    if (warnings.length < 8) {
      warnings.push(message);
    }
  }

  setAreaLevel(level: string): void {
    this.areaLevel.set(level);
    this.areaCode = '';
  }

  areaCount(level: string): number {
    return level ? this.areas().filter(a => a.level === level).length : this.areas().length;
  }

  loadPasteTemplate(format: 'matrix' | 'long'): void {
    const areas = this.filteredAreas().slice(0, 8);
    const indicators = this.rows().slice(0, 6).map(r => r.indicator.id);
    if (!areas.length || !indicators.length) {
      this.error.set('Select a sector and make sure areas are loaded before generating a template.');
      return;
    }
    if (format === 'matrix') {
      const header = ['areaCode', ...indicators].join('\t');
      const rows = areas.map(a => [a.code, ...indicators.map(() => '')].join('\t'));
      this.pasteText.set([header, ...rows].join('\n'));
      this.success.set('Matrix template loaded. Fill the blank cells in Excel, then paste back here.');
      this.error.set(null);
      return;
    }
    this.pasteText.set(['areaCode\tindicatorId\tscore', '# Paste one value per row below this line'].join('\n'));
    this.success.set('Long-row template loaded. Add rows as areaCode, indicatorId and score.');
    this.error.set(null);
  }

  private indicatorLookup(): Map<string, string> {
    const map = new Map<string, string>();
    for (const row of this.rows()) {
      this.addLookup(map, row.indicator.id, row.indicator.id);
      this.addLookup(map, row.indicator['name'], row.indicator.id);
    }
    return map;
  }

  private areaLookup(): Map<string, Area> {
    const map = new Map<string, Area>();
    for (const area of this.areas()) {
      this.addLookup(map, area.code, area);
      this.addLookup(map, area.councilCode, area);
      this.addLookup(map, area.name, area);
      this.addLookup(map, `${area.name} ${area.level}`, area);
      this.addLookup(map, `${area.region ?? ''} ${area.name}`, area);
    }
    return map;
  }

  private addLookup<T>(map: Map<string, T>, key: unknown, value: T): void {
    const norm = this.norm(String(key ?? ''));
    if (norm && !map.has(norm)) {
      map.set(norm, value);
    }
  }

  private parseScore(raw: unknown): number | null {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const normalized = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text;
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
  }

  private splitCsv(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  private isAreaHeader(value: string): boolean {
    return ['AREA', 'AREACODE', 'AREACODE', 'CODE', 'REGION', 'DISTRICT', 'COUNCIL', 'LGA', 'LGACODE']
      .includes(this.norm(value));
  }

  private isDescriptorHeader(value: string): boolean {
    return ['AREANAME', 'NAME', 'LEVEL', 'REGIONNAME', 'DISTRICTNAME', 'COUNCILNAME', 'LGA', 'LGANAME']
      .includes(this.norm(value));
  }

  private looksLikeLongHeader(parts: string[]): boolean {
    const keys = parts.slice(0, 4).map(p => this.norm(p));
    const areaKeys = ['AREA', 'AREACODE', 'CODE', 'LGACODE', 'LGA'];
    const indicatorKeys = ['INDICATOR', 'INDICATORID', 'INDICATORCODE'];
    const valueKeys = ['SCORE', 'VALUE', 'VALUE0TO10', 'INFORMSCORE'];
    return keys.some(k => areaKeys.includes(k))
      && keys.some(k => indicatorKeys.includes(k))
      && keys.some(k => valueKeys.includes(k));
  }
}
