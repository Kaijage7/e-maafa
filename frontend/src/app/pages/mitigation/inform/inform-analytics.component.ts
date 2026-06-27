import { Component, computed, effect, inject, signal } from '@angular/core';
import { InformService, RiskRow } from './inform.service';
import { INFORM_STYLES } from './inform-ui';
import { InformRefreshService } from './inform-refresh.service';

const CLASSES = [
  { label: 'Very Low',  max: 2,    color: '#2ECC71' },
  { label: 'Low',       max: 3.5,  color: '#A9DFBF' },
  { label: 'Medium',    max: 5,    color: '#F4D03F' },
  { label: 'High',      max: 6.5,  color: '#E67E22' },
  { label: 'Very High', max: 10.1, color: '#E74C3C' },
];
function classOf(r: number | null | undefined) { if (r == null || !isFinite(r)) return null; for (const c of CLASSES) if (r <= c.max) return c; return CLASSES[4]; }

/** INFORM tab — Analytics: class distribution + top-12 councils (SVG bar charts) + a ranked,
 *  class-filterable table. All from the live batch /risk. */
@Component({
  selector: 'page-inform-analytics',
  standalone: true,
  imports: [],
  styles: [INFORM_STYLES, `
    :host { display:block; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:1.2rem; }
    @media (max-width:1000px){ .grid2 { grid-template-columns:1fr; } }
    .chart-card { background:#fff; border:1px solid var(--line,#e2e8f0); border-radius:10px; padding:.9rem 1rem; }
    .chart-card h3 { font-size:.9rem; margin:0; }
    .chart-card .sub { font-size:.72rem; color:var(--text-mid,#64748b); margin:.1rem 0 .6rem; }
    .filterbar { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; margin:1.4rem 0 .6rem; }
    .chip { font:inherit; font-size:.74rem; font-weight:700; padding:.25rem .7rem; border-radius:50px; border:1.5px solid var(--line,#cbd5e1); background:#fff; color:var(--text-mid,#475569); cursor:pointer; }
    .chip.on { color:#fff; border-color:transparent; }
    th.sortable { cursor:pointer; user-select:none; }
  `],
  template: `
    @if (loading()) { <p class="muted">Loading analytics…</p> }
    @else {
      <div class="grid2">
        <div class="chart-card">
          <h3>Distribution</h3>
          <div class="sub">{{ scored().length }} councils by INFORM risk class</div>
          <svg viewBox="0 0 540 260" width="100%" height="260" style="font-family:Calibri,system-ui,sans-serif;">
            @for (t of vTicksReal; track t) {
              <line [attr.x1]="40" [attr.y1]="yOf(t)" [attr.x2]="526" [attr.y2]="yOf(t)" stroke="#edf1f6" />
              <text [attr.x]="33" [attr.y]="yOf(t)+3.5" text-anchor="end" font-size="10" fill="#334155">{{ t }}</text>
            }
            <line x1="40" y1="22" x2="40" y2="220" stroke="#94a3b8" stroke-width="1.25" />
            <line x1="40" y1="220" x2="526" y2="220" stroke="#94a3b8" stroke-width="1.25" />
            @for (b of distBars(); track b.label) {
              <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="220-b.y" [attr.fill]="b.color" />
              <text [attr.x]="b.x+b.w/2" [attr.y]="b.y-5" text-anchor="middle" font-size="12" font-weight="700" fill="#0a0f1a">{{ b.value }}</text>
              <text [attr.x]="b.x+b.w/2" [attr.y]="235" text-anchor="middle" font-size="9.5" fill="#334155">{{ b.label }}</text>
            }
          </svg>
        </div>

        <div class="chart-card">
          <h3>Highest councils</h3>
          <div class="sub">top 12 by INFORM risk</div>
          <svg [attr.viewBox]="'0 0 540 ' + topH()" width="100%" [attr.height]="topH()" style="font-family:Calibri,system-ui,sans-serif;">
            @for (t of [0,5,10]; track t) {
              <line [attr.x1]="hx(t)" y1="10" [attr.x2]="hx(t)" [attr.y2]="topH()-26" stroke="#edf1f6" />
              <text [attr.x]="hx(t)" [attr.y]="topH()-11" text-anchor="middle" font-size="10" fill="#334155">{{ t }}</text>
            }
            <line x1="140" y1="10" [attr.x2]="140" [attr.y2]="topH()-26" stroke="#94a3b8" stroke-width="1.25" />
            @for (b of topBars(); track b.label; let i = $index) {
              <text x="132" [attr.y]="10+i*28+12" text-anchor="end" font-size="12" font-weight="600" fill="#0a0f1a">{{ b.label }}</text>
              <text x="132" [attr.y]="10+i*28+24" text-anchor="end" font-size="9.5" fill="#334155">{{ b.sub }}</text>
              <rect x="140" [attr.y]="10+i*28+6" [attr.width]="b.w" height="15" [attr.fill]="b.color" />
              <text [attr.x]="146+b.w" [attr.y]="10+i*28+16" font-size="12" font-weight="700" fill="#0a0f1a">{{ b.value.toFixed(1) }}</text>
            }
          </svg>
        </div>
      </div>

      <div class="filterbar">
        <span class="muted" style="font-weight:700;">Ranked councils:</span>
        <button class="chip" [class.on]="clsFilter()===''" [style.background]="clsFilter()===''?'#334155':''" (click)="clsFilter.set('')">All</button>
        @for (c of classes; track c.label) {
          <button class="chip" [class.on]="clsFilter()===c.label" [style.background]="clsFilter()===c.label?c.color:''" (click)="clsFilter.set(c.label)">{{ c.label }}</button>
        }
        <span class="muted">{{ ranked().length }} councils</span>
      </div>
      <div class="card" style="padding:0; overflow:auto; max-height:50vh;">
        <table>
          <thead><tr><th>#</th><th>Council</th><th class="sortable num" (click)="toggleSort()">Risk {{ sortDesc() ? '▼' : '▲' }}</th><th>Class</th></tr></thead>
          <tbody>
            @for (r of ranked(); track r.area; let i = $index) {
              <tr>
                <td class="muted">{{ i+1 }}</td>
                <td><strong>{{ r.name }}</strong> <span class="muted">({{ r.area }})</span></td>
                <td class="num">{{ r.risk?.toFixed(1) }}</td>
                <td><span class="pill" [style.background]="classColor(r.risk)+'22'" [style.color]="classColor(r.risk)">{{ classLabel(r.risk) }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class InformAnalyticsComponent {
  private svc = inject(InformService);
  classes = CLASSES;
  rows = signal<RiskRow[]>([]);
  loading = signal(true);
  clsFilter = signal('');
  sortDesc = signal(true);

  scored = computed(() => this.rows().filter(r => r.risk != null && isFinite(r.risk!)));

  private distMax = computed(() => {
    const counts = CLASSES.map(c => this.scored().filter(r => classOf(r.risk) === c).length);
    return Math.max(1, ...counts);
  });
  distBars = computed(() => {
    const n = CLASSES.length, band = (540 - 40 - 14) / n, bw = band * 0.52, max = this.niceMax();
    return CLASSES.map((c, i) => {
      const value = this.scored().filter(r => classOf(r.risk) === c).length;
      const y = 22 + 198 - (value / max) * 198;
      return { label: c.label, value, color: c.color, x: 40 + i * band + (band - bw) / 2, w: bw, y };
    });
  });
  niceMax() { const m = this.distMax(); return Math.ceil(m / 5) * 5 || 5; }
  yOf(t: number) { return 22 + 198 - (t / this.niceMax()) * 198; }
  get vTicksReal() { const mx = this.niceMax(); return [0, mx / 4, mx / 2, (3 * mx) / 4, mx].map(x => Math.round(x)); }

  topBars = computed(() => {
    return [...this.scored()].sort((a, b) => (b.risk! - a.risk!)).slice(0, 12)
      .map(r => ({ label: r.name, sub: r.area, value: r.risk!, color: classColor2(r.risk), w: Math.max(1, (r.risk! / 10) * (540 - 140 - 46)) }));
  });
  topH() { return 10 + 26 + Math.max(1, this.topBars().length) * 28; }
  hx(v: number) { return 140 + (Math.max(0, v) / 10) * (540 - 140 - 46); }

  ranked = computed(() => {
    let r = this.scored();
    const f = this.clsFilter();
    if (f) r = r.filter(x => classOf(x.risk)?.label === f);
    return [...r].sort((a, b) => this.sortDesc() ? b.risk! - a.risk! : a.risk! - b.risk!);
  });
  toggleSort() { this.sortDesc.update(v => !v); }
  classColor(r: number | null) { return classColor2(r); }
  classLabel(r: number | null) { return classOf(r)?.label || '—'; }

  private refresh = inject(InformRefreshService);

  constructor() {
    // Reload on first render and whenever an approval bumps the shared revision (no page reload needed).
    effect(() => { this.refresh.rev(); this.load(); });
  }

  private load(): void {
    this.svc.getRiskAll('council').subscribe({
      next: rows => { this.rows.set(rows || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
function classColor2(r: number | null | undefined) { return classOf(r)?.color || '#cfd6dd'; }
