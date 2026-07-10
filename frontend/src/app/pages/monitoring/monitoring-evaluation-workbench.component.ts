import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

type Row = Record<string, any>;

interface WorkbenchResponse {
  period: string;
  level: string;
  institutionClass?: string | null;
  scope: Row;
  levels: string[];
  levelLabels?: Record<string, string>;
  domains: string[];
  institutionClasses?: Row[];
  indicators: Row[];
  targets: Row[];
  values: Row[];
  canManage: boolean;
  canEnter: boolean;
  nationalRegistry?: boolean;
  importanceNote?: string;
}

@Component({
  selector: 'page-monitoring-evaluation-workbench',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .me-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .btn-sm, .btn-primary { border:1px solid #cbd5e1; background:#fff; color:#334155; border-radius:7px; padding:7px 11px; font-size:0.78rem; font-weight:800; cursor:pointer; font-family:inherit; text-decoration:none; display:inline-flex; gap:7px; align-items:center; }
    .btn-primary { background:#0f766e; border-color:#0f766e; color:#fff; }
    .btn-sm:hover { background:#f8fafc; }
    .btn-primary:disabled, .btn-sm:disabled { opacity:.55; cursor:not-allowed; }
    .pill { border:1px solid #dbe4ef; background:#f8fafc; border-radius:999px; padding:6px 10px; font-size:0.76rem; font-weight:800; color:#334155; display:inline-flex; gap:6px; align-items:center; }
    .filters { display:grid; grid-template-columns:minmax(160px,0.9fr) 120px minmax(160px,0.9fr) minmax(180px,1fr) minmax(200px,1.1fr) auto; gap:9px; align-items:end; margin-bottom:12px; }
    .class-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
    .class-chip { border:1px solid #cbd5e1; background:#fff; border-radius:999px; padding:5px 10px; font-size:0.72rem; font-weight:800; color:#334155; cursor:pointer; font-family:inherit; }
    .class-chip.active { background:#0f766e; border-color:#0f766e; color:#fff; }
    .class-chip small { opacity:.8; font-weight:700; margin-left:4px; }
    .note { background:#f0fdfa; border:1px solid #99f6e4; color:#115e59; border-radius:8px; padding:9px 11px; font-size:0.78rem; margin-bottom:12px; line-height:1.4; }
    label { display:grid; gap:4px; color:#475569; font-size:0.72rem; font-weight:850; text-transform:uppercase; letter-spacing:0; }
    input, select, textarea { border:1px solid #cbd5e1; border-radius:7px; background:#fff; color:#0f172a; font:inherit; font-size:0.82rem; padding:8px 9px; min-width:0; }
    textarea { min-height:150px; resize:vertical; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height:1.45; }
    .grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(320px,0.42fr); gap:14px; align-items:start; }
    .table-wrap { overflow:auto; max-height:640px; border-radius:8px; }
    table { width:100%; border-collapse:separate; border-spacing:0; font-size:0.78rem; }
    th { position:sticky; top:0; z-index:3; background:#f8fafc; color:#64748b; text-align:left; text-transform:uppercase; font-size:0.66rem; padding:8px; border-bottom:1px solid #e2e8f0; white-space:nowrap; }
    th.target-head { left:0; z-index:4; min-width:230px; }
    td { padding:6px 8px; border-bottom:1px solid #edf2f7; color:#334155; background:#fff; vertical-align:middle; }
    td.target-cell { position:sticky; left:0; z-index:2; background:#fff; min-width:230px; box-shadow:1px 0 0 #e2e8f0; }
    .target-name { display:block; font-weight:850; color:#0f172a; max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .target-meta { display:block; color:#64748b; font-size:0.7rem; max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px; }
    .ind-head { min-width:150px; max-width:190px; white-space:normal; line-height:1.2; vertical-align:bottom; }
    .ind-code { display:block; color:#0f766e; font-size:0.65rem; font-weight:900; margin-bottom:2px; word-break:break-word; }
    .cell-input { width:125px; padding:6px 7px; font-size:0.78rem; border-radius:6px; }
    .cell-input.dirty { border-color:#0f766e; box-shadow:0 0 0 2px rgba(15,118,110,.12); }
    .side { display:grid; gap:14px; }
    .panel-body { padding:12px; }
    .paste-actions { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap; }
    .hint-line { color:#64748b; font-size:0.75rem; line-height:1.35; margin-top:8px; }
    .status { border-radius:8px; padding:9px 11px; font-size:0.82rem; margin-bottom:12px; }
    .status.ok { background:#dcfce7; border:1px solid #bbf7d0; color:#166534; }
    .status.err { background:#fee2e2; border:1px solid #fecaca; color:#991b1b; }
    .catalogue { display:grid; gap:8px; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .form-grid .wide { grid-column:1 / -1; }
    .empty { color:#94a3b8; text-align:center; padding:28px 8px; font-size:0.83rem; }
    .summary-strip { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
    .summary-strip span { border:1px solid #e2e8f0; background:#fff; border-radius:8px; padding:8px 10px; font-size:0.76rem; color:#475569; font-weight:750; }
    .summary-strip b { color:#0f172a; font-variant-numeric:tabular-nums; }
    @media (max-width: 1120px) {
      .grid, .filters { grid-template-columns:1fr; }
      .filters .me-actions { justify-content:flex-start; }
    }
  `],
  template: `
    <dmis-page-header title="M&E Data Workbench" icon="fa-table-cells"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Monitoring & Evaluation'}, {label:'Data Workbench'}]">
      <div class="me-actions">
        <a class="btn-sm" routerLink="/m/monitoring-evaluation/dashboard"><i class="fas fa-gauge-high"></i> Dashboard</a>
        <span class="pill"><i class="fas fa-location-crosshairs"></i> {{ scopeLabel() }}</span>
      </div>
    </dmis-page-header>

    @if (message()) { <div class="status ok">{{ message() }}</div> }
    @if (error()) { <div class="status err">{{ error() }}</div> }
    @if (importanceNote()) {
      <div class="note"><i class="fas fa-sitemap"></i> {{ importanceNote() }}</div>
    }
    @if (workbench()?.scope?.['identityNote']) {
      <div class="note" style="background:#eff6ff;border-color:#93c5fd;color:#1e3a8a">
        <i class="fas fa-id-badge"></i> {{ workbench()!.scope!['identityNote'] }}
        Values auto-bind to your login institution/area when keys are omitted.
        Credentials and area/agency/stakeholder links are set in System Settings → User Management;
        what each role may enter is controlled in Roles &amp; Permissions
        (<code>monitoring_evaluation.view / enter / manage</code>).
      </div>
    }

    <div class="filters">
      <label>Level
        <select [(ngModel)]="level" (change)="onLevelChange()">
          @for (l of levels(); track l) { <option [value]="l">{{ levelLabel(l) }}</option> }
        </select>
      </label>
      <label>Period
        <input [(ngModel)]="period" (change)="load()" placeholder="2026-Q3">
      </label>
      <label>Institution class
        <select [(ngModel)]="institutionClass" (change)="load()" [disabled]="!classFilterEnabled()">
          <option value="">All classes</option>
          @for (c of institutionClasses(); track c['class']) {
            <option [value]="c['class']">{{ c['labelEn'] || c['class'] }} ({{ c['total'] }})</option>
          }
        </select>
      </label>
      <label>Domain
        <select [(ngModel)]="domain" (change)="load()">
          <option value="">All domains</option>
          @for (d of domains(); track d) { <option [value]="d">{{ d }}</option> }
        </select>
      </label>
      <label>Search
        <input [(ngModel)]="search" (keyup.enter)="load()" placeholder="Search ministry, UN, NGO, private…">
      </label>
      <div class="me-actions">
        <button class="btn-sm" type="button" (click)="load()"><i class="fas fa-rotate"></i> Refresh</button>
        <button class="btn-primary" type="button" (click)="saveAll()" [disabled]="!canEnter() || saving() || !dirtyKeys().length">
          <i class="fas fa-floppy-disk"></i> Save {{ dirtyKeys().length || '' }}
        </button>
      </div>
    </div>

    @if (classFilterEnabled() && institutionClasses().length) {
      <div class="class-chips">
        <button type="button" class="class-chip" [class.active]="!institutionClass" (click)="setClass('')">All</button>
        @for (c of institutionClasses(); track c['class']) {
          <button type="button" class="class-chip" [class.active]="institutionClass === c['class']" (click)="setClass(c['class'])">
            {{ c['labelEn'] || c['class'] }}<small>{{ c['total'] }}</small>
          </button>
        }
      </div>
    }

    <div class="summary-strip">
      <span><b>{{ targets().length | number }}</b> targets</span>
      <span><b>{{ indicators().length | number }}</b> indicators</span>
      <span><b>{{ values().length | number }}</b> saved values</span>
      <span><b>{{ dirtyKeys().length | number }}</b> edited cells</span>
      @if (institutionClass) { <span>Class: <b>{{ institutionClass }}</b></span> }
    </div>

    <div class="grid">
      <dmis-panel title="Indicator matrix" icon="fa-table" [badge]="period || workbench()?.period || ''">
        <div class="table-wrap">
          @if (targets().length && indicators().length) {
            <table>
              <thead>
                <tr>
                  <th class="target-head">Target</th>
                  @for (i of indicators(); track i['id']) {
                    <th class="ind-head">
                      <span class="ind-code">{{ i['code'] }}</span>
                      {{ i['name'] }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (t of targets(); track t['key']) {
                  <tr>
                    <td class="target-cell">
                      <span class="target-name">{{ t['label'] }}</span>
                      <span class="target-meta">{{ t['meta'] || title(t['areaLevel']) }}</span>
                    </td>
                    @for (i of indicators(); track i['id']) {
                      <td>
                        @if (i['valueType'] === 'boolean') {
                          <select class="cell-input" [class.dirty]="isDirty(cellKey(i, t))"
                            [ngModel]="cellValue(i, t)" (ngModelChange)="setCell(i, t, $event)" [disabled]="!canEnter()">
                            <option value=""></option>
                            <option value="1">Yes</option>
                            <option value="0">No</option>
                          </select>
                        } @else {
                          <input class="cell-input" [class.dirty]="isDirty(cellKey(i, t))"
                            [type]="i['valueType'] === 'text' ? 'text' : 'number'"
                            [ngModel]="cellValue(i, t)" (ngModelChange)="setCell(i, t, $event)"
                            [disabled]="!canEnter()" [placeholder]="i['unit'] || i['valueType']">
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <div class="empty">No M&E targets or indicators for this selection.</div>
          }
        </div>
      </dmis-panel>

      <div class="side">
        <dmis-panel title="Paste values" icon="fa-paste">
          <div class="panel-body">
            <textarea [(ngModel)]="pasteText" placeholder="Target&#9;REG_FY_TCVMP_CONSIDERED&#9;REG_RESPONSE_BUDGET_USED"></textarea>
            <div class="paste-actions">
              <button class="btn-sm" type="button" (click)="applyPaste()" [disabled]="!pasteText.trim()"><i class="fas fa-wand-magic-sparkles"></i> Apply</button>
              <button class="btn-sm" type="button" (click)="pasteText = ''"><i class="fas fa-eraser"></i> Clear</button>
            </div>
            @if (pasteSummary()) { <div class="hint-line">{{ pasteSummary() }}</div> }
          </div>
        </dmis-panel>

        @if (canManage()) {
          <dmis-panel title="Indicator catalogue" icon="fa-sliders">
            <div class="panel-body catalogue">
              <div class="form-grid">
                <label>Code <input [(ngModel)]="newIndicator['code']" placeholder="MDA_CUSTOM_INDICATOR"></label>
                <label>Level
                  <select [(ngModel)]="newIndicator['level']">
                    @for (l of levels(); track l) { <option [value]="l">{{ title(l) }}</option> }
                  </select>
                </label>
                <label class="wide">Name <input [(ngModel)]="newIndicator['name']" placeholder="Indicator name"></label>
                <label>Domain <input [(ngModel)]="newIndicator['domain']" placeholder="Domain"></label>
                <label>Type
                  <select [(ngModel)]="newIndicator['valueType']">
                    <option value="number">Number</option>
                    <option value="count">Count</option>
                    <option value="currency">Currency</option>
                    <option value="percent">Percent</option>
                    <option value="boolean">Boolean</option>
                    <option value="text">Text</option>
                  </select>
                </label>
                <label>Unit <input [(ngModel)]="newIndicator['unit']" placeholder="Unit"></label>
                <label>Frequency <input [(ngModel)]="newIndicator['frequency']" placeholder="quarterly"></label>
              </div>
              <button class="btn-primary" type="button" (click)="createIndicator()" [disabled]="!newIndicator['code'] || !newIndicator['name'] || !newIndicator['domain']">
                <i class="fas fa-plus"></i> Add indicator
              </button>
            </div>
          </dmis-panel>
        }
      </div>
    </div>

    @if (loading()) { <div class="empty">Loading M&E workbench...</div> }
  `,
})
export class MonitoringEvaluationWorkbenchComponent {
  private http = inject(HttpClient);

  workbench = signal<WorkbenchResponse | null>(null);
  loading = signal(false);
  saving = signal(false);
  error = signal('');
  message = signal('');
  edits = signal<Record<string, string>>({});
  dirtyKeys = signal<string[]>([]);
  pasteSummary = signal('');

  level = 'region';
  period = this.defaultPeriod();
  domain = '';
  search = '';
  institutionClass = '';
  pasteText = '';
  newIndicator: Row = {
    code: '',
    name: '',
    domain: '',
    level: 'region',
    valueType: 'number',
    unit: '',
    frequency: 'quarterly',
  };

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    const params: Row = { level: this.level, period: this.period };
    if (this.domain) params['domain'] = this.domain;
    if (this.search) params['search'] = this.search;
    if (this.institutionClass && this.classFilterEnabled()) params['institutionClass'] = this.institutionClass;
    this.http.get<WorkbenchResponse>('/api/v1/monitoring-evaluation/workbench', { params }).subscribe({
      next: res => {
        this.workbench.set(res);
        this.level = res.level || this.level;
        this.period = res.period || this.period;
        if (res.institutionClass != null && res.institutionClass !== undefined) {
          this.institutionClass = String(res.institutionClass || '');
        }
        this.resetEdits(res);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Unable to load M&E workbench.');
      },
    });
  }

  onLevelChange(): void {
    this.institutionClass = '';
    this.load();
  }

  setClass(cls: string): void {
    this.institutionClass = cls || '';
    this.load();
  }

  classFilterEnabled(): boolean {
    return this.level === 'agency' || this.level === 'stakeholder';
  }

  levels(): string[] { return this.workbench()?.levels ?? ['national', 'region', 'district', 'council', 'agency', 'stakeholder', 'incident', 'warning']; }
  domains(): string[] { return this.workbench()?.domains ?? []; }
  institutionClasses(): Row[] { return this.workbench()?.institutionClasses ?? []; }
  indicators(): Row[] { return this.workbench()?.indicators ?? []; }
  targets(): Row[] { return this.workbench()?.targets ?? []; }
  values(): Row[] { return this.workbench()?.values ?? []; }
  canManage(): boolean { return !!this.workbench()?.canManage; }
  canEnter(): boolean { return !!this.workbench()?.canEnter; }
  importanceNote(): string { return this.workbench()?.importanceNote || ''; }

  levelLabel(value: any): string {
    const key = String(value || '');
    const labels = this.workbench()?.levelLabels;
    if (labels && labels[key]) return labels[key];
    const fallback: Record<string, string> = {
      national: 'National (PMO-DMD / SP 2026–2031 / readiness)',
      region: 'Regions (budget, EOCC, teams, DM cycle)',
      district: 'Districts (budget, plan, DM cycle)',
      council: 'District / LGA (budget, EPR plan, DM cycle)',
      agency: 'Ministries & government institutions',
      stakeholder: 'Partners (FBO / NGO / INGO / Private / UN)',
      incident: 'Incidents',
      warning: 'Early warnings',
    };
    return fallback[key] || this.title(key);
  }

  cellKey(indicator: Row, target: Row): string {
    return `${indicator['id']}|${target['key']}`;
  }

  cellValue(indicator: Row, target: Row): string {
    return this.edits()[this.cellKey(indicator, target)] ?? '';
  }

  setCell(indicator: Row, target: Row, value: any): void {
    const key = this.cellKey(indicator, target);
    this.edits.update(e => ({ ...e, [key]: String(value ?? '') }));
    if (!this.dirtyKeys().includes(key)) {
      this.dirtyKeys.update(keys => [...keys, key]);
    }
  }

  isDirty(key: string): boolean {
    return this.dirtyKeys().includes(key);
  }

  saveAll(): void {
    const payload = this.dirtyKeys()
      .map(key => this.payloadForKey(key))
      .filter((row): row is Row => !!row);
    if (!payload.length) return;
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.http.post<Row>('/api/v1/monitoring-evaluation/values/batch', {
      period: this.period,
      status: 'submitted',
      values: payload,
    }).subscribe({
      next: res => {
        this.saving.set(false);
        this.dirtyKeys.set([]);
        const saved = Number(res['saved'] ?? 0);
        const failed = Number(res['failed'] ?? 0);
        this.message.set(`Saved ${saved} M&E value${saved === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}.`);
        if (failed) this.error.set((res['errors'] ?? []).map((e: Row) => `Row ${e['row']}: ${e['error']}`).join(' | '));
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'Unable to save M&E values.');
      },
    });
  }

  applyPaste(): void {
    const lines = this.pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      this.pasteSummary.set('No rows applied.');
      return;
    }
    const header = this.splitLine(lines[0]);
    const columns = header.slice(1).map(h => this.findIndicator(h));
    let applied = 0;
    let skipped = 0;
    for (const line of lines.slice(1)) {
      const cols = this.splitLine(line);
      const target = this.findTarget(cols[0]);
      if (!target) {
        skipped++;
        continue;
      }
      for (let i = 1; i < cols.length; i++) {
        const indicator = columns[i - 1];
        if (!indicator) {
          skipped++;
          continue;
        }
        this.setCell(indicator, target, cols[i]);
        applied++;
      }
    }
    this.pasteSummary.set(`Applied ${applied} cells${skipped ? `, skipped ${skipped}` : ''}.`);
  }

  createIndicator(): void {
    this.error.set('');
    this.message.set('');
    this.http.post<Row>('/api/v1/monitoring-evaluation/indicators', this.newIndicator).subscribe({
      next: () => {
        this.message.set('M&E indicator added.');
        this.newIndicator = { code: '', name: '', domain: '', level: this.level, valueType: 'number', unit: '', frequency: 'quarterly' };
        this.load();
      },
      error: err => this.error.set(err?.error?.message || 'Unable to add M&E indicator.'),
    });
  }

  title(value: any): string {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  scopeLabel(): string {
    const s = this.workbench()?.scope ?? {};
    if (s['identityNote']) return String(s['identityNote']).split('—')[0].trim();
    if (s['stakeholderId']) return `Your organisation · Partner M&E`;
    if (s['agencyId']) return `Your institution · MDA M&E`;
    if (s['councilId']) return `Council / LGA #${s['councilId']}`;
    if (s['districtId']) return `District #${s['districtId']}`;
    if (s['regionId']) return `Region #${s['regionId']}`;
    if (this.workbench()?.nationalRegistry || this.workbench()?.canManage || s['nationalRegistry']) {
      return 'National institution registry (PMO)';
    }
    return 'National scope';
  }

  private resetEdits(res: WorkbenchResponse): void {
    const edits: Record<string, string> = {};
    for (const target of res.targets) {
      for (const indicator of res.indicators) {
        const value = res.values.find(v => Number(v['indicatorId']) === Number(indicator['id']) && this.sameTarget(v, target));
        if (value) {
          edits[this.cellKey(indicator, target)] = indicator['valueType'] === 'text'
            ? String(value['textValue'] ?? '')
            : String(value['numericValue'] ?? '');
        }
      }
    }
    this.edits.set(edits);
    this.dirtyKeys.set([]);
  }

  private payloadForKey(key: string): Row | null {
    const [indicatorId, targetKey] = key.split('|');
    const indicator = this.indicators().find(i => String(i['id']) === indicatorId);
    const target = this.targets().find(t => t['key'] === targetKey);
    if (!indicator || !target) return null;
    const raw = this.edits()[key];
    const value: Row = {
      indicatorId: indicator['id'],
      period: this.period,
      areaLevel: target['areaLevel'],
      regionId: target['regionId'],
      districtId: target['districtId'],
      councilId: target['councilId'],
      agencyId: target['agencyId'],
      stakeholderId: target['stakeholderId'],
      incidentId: target['incidentId'],
      warningId: target['warningId'],
    };
    if (indicator['valueType'] === 'text') value['textValue'] = raw;
    else value['numericValue'] = raw === '' ? null : Number(raw);
    return value;
  }

  private sameTarget(value: Row, target: Row): boolean {
    return String(value['areaLevel']) === String(target['areaLevel'])
      && this.same(value['regionId'], target['regionId'])
      && this.same(value['districtId'], target['districtId'])
      && this.same(value['councilId'], target['councilId'])
      && this.same(value['agencyId'], target['agencyId'])
      && this.same(value['stakeholderId'], target['stakeholderId'])
      && this.same(value['incidentId'], target['incidentId'])
      && this.same(value['warningId'], target['warningId']);
  }

  private same(a: any, b: any): boolean {
    return String(a ?? '') === String(b ?? '');
  }

  private splitLine(line: string): string[] {
    return line.includes('\t') ? line.split('\t').map(v => v.trim()) : line.split(',').map(v => v.trim());
  }

  private findIndicator(label: string): Row | null {
    const key = label.trim().toLowerCase();
    return this.indicators().find(i =>
      String(i['code']).toLowerCase() === key || String(i['name']).toLowerCase() === key) ?? null;
  }

  private findTarget(label: string): Row | null {
    const key = label.trim().toLowerCase();
    return this.targets().find(t =>
      String(t['key']).toLowerCase() === key || String(t['label']).toLowerCase() === key) ?? null;
  }

  private defaultPeriod(): string {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${q}`;
  }
}
