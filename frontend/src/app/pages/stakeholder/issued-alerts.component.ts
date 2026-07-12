import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface IssuedWarning {
  id: number; warningCode: string; hazardType: string; severityLevel: string;
  alertMessage: string; affectedRegions: string; affectedDistricts?: string | null;
  peopleAtRisk: number; bulletinUrl?: string | null; status?: string;
  area_summary?: string; district_count?: number; district_names_full?: string;
}
interface IssuedBulletin {
  id: number; title: string; severity: string; pdfUrl: string; hazardType?: string;
}
interface LandingFeed {
  warnings: IssuedWarning[];
  bulletins?: IssuedBulletin[];
  stats: { emergencyCount: number; warningCount: number; watchCount: number; peopleAtRisk: number };
}

/**
 * Issued Alerts — grouped by severity / bulletin type so operators open the band
 * they need instead of scrolling one long mixed table.
 */
@Component({
  selector: 'stakeholder-issued-alerts',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  styles: [`
    .flow {
      background:#f0fdfa; border:1px solid #99f6e4; border-radius:10px; padding:10px 14px;
      font-size:0.8rem; color:#115e59; margin:-4px 0 14px; line-height:1.45;
    }
    .block { background:#fff; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:12px; overflow:hidden; }
    .block > summary {
      list-style:none; cursor:pointer; display:flex; align-items:center; gap:10px;
      padding:12px 14px; font-weight:800; font-size:0.9rem; background:#f8fafc; color:#0f172a;
    }
    .block > summary::-webkit-details-marker { display:none; }
    .block[open] > summary { border-bottom:1px solid #eef2f7; }
    .block .badge {
      margin-left:auto; background:#0f172a; color:#fff; border-radius:999px;
      font-size:0.72rem; font-weight:800; padding:2px 9px;
    }
    .block .body { padding:4px 12px 12px; overflow-x:auto; }
    .hint { font-size:0.74rem; color:#64748b; margin:0 0 8px; }
    .area { color:#64748b; font-size:0.78rem; }
  `],
  template: `
    <div class="page-title">
      <h1>Issued Alerts &amp; Active Warnings</h1>
      <span class="badge b-muted">Read-only</span>
      <span class="spacer"></span>
      @if (loadedAt()) {
        <span class="muted" style="font-size:13px;"><i class="far fa-clock" style="margin-right:4px;"></i>Updated {{ loadedAt() }}</span>
      }
    </div>
    <div class="flow">
      <b>Alert flow:</b>
      Hazard entities / PMO publish a warning →
      area officers receive it (bell + this page) →
      Response acts (incidents, resources, tasks) →
      bulletins (PDF) support dissemination.
      This page is the <b>read-only action list</b>, not the EW authoring workbench.
      <a routerLink="/m/response/dashboard" style="font-weight:700;margin-left:6px;">Response dashboard</a>
    </div>

    <div class="tiles" style="margin-bottom:16px;">
      <div class="tile accent-red"><div class="n">{{ stats().emergencyCount }}</div><div class="l">Emergency / Major</div></div>
      <div class="tile accent-orange"><div class="n">{{ stats().warningCount }}</div><div class="l">Warning</div></div>
      <div class="tile"><div class="n">{{ stats().watchCount }}</div><div class="l">Advisory / Watch</div></div>
      <div class="tile accent-green"><div class="n">{{ stats().peopleAtRisk | number }}</div><div class="l">People at risk</div></div>
    </div>

    @for (g of warningGroups(); track g.key) {
      <details class="block" [open]="g.key === 'major'">
        <summary>
          <i class="fas fa-satellite-dish" style="color:#ea580c"></i>
          {{ g.label }}
          <span class="badge">{{ g.items.length }}</span>
        </summary>
        <div class="body">
          <p class="hint">{{ g.hint }}</p>
          @if (g.items.length) {
            <table class="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Hazard</th>
                  <th>Area coverage</th>
                  <th style="text-align:right;">People at risk</th>
                  <th>Bulletin</th>
                </tr>
              </thead>
              <tbody>
                @for (w of g.items; track w.id) {
                  <tr>
                    <td style="font-weight:700;">{{ w.warningCode }}</td>
                    <td>{{ w.hazardType }}</td>
                    <td class="area">{{ areaLine(w) }}</td>
                    <td style="text-align:right;">{{ w.peopleAtRisk | number }}</td>
                    <td>
                      @if (w.bulletinUrl) {
                        <a [href]="w.bulletinUrl" target="_blank" rel="noopener">View PDF</a>
                      } @else { <span class="muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <div class="muted" style="padding:12px 0;">None in this band for your view.</div>
          }
        </div>
      </details>
    }

    @if (!warningGroups().length) {
      <div class="card" style="margin-bottom:16px;">
        <div class="card-b muted" style="text-align:center; padding:2rem;">
          <i class="fas fa-check-circle" style="font-size:1.6rem; color:var(--green); display:block; margin-bottom:8px;"></i>
          No published early-warning alerts currently cover your jurisdiction.
        </div>
      </div>
    }

    <details class="block" [open]="bulletins().length > 0 && bulletins().length <= 8">
      <summary>
        <i class="fas fa-file-pdf" style="color:#b91c1c"></i>
        Issued bulletins (PDF products)
        <span class="badge">{{ bulletins().length }}</span>
      </summary>
      <div class="body">
        <p class="hint">Agency / PMO products used for SMS·email dissemination — open only the severity you need.</p>
        @for (bg of bulletinGroups(); track bg.key) {
          <details style="margin:8px 0;border:1px solid #f1f5f9;border-radius:8px;" [open]="bg.key === 'major'">
            <summary style="cursor:pointer;padding:8px 10px;font-weight:800;font-size:0.8rem;color:#475569;list-style:none;">
              {{ bg.label }} ({{ bg.items.length }})
            </summary>
            <table class="tbl" style="margin:0 8px 8px;">
              <thead><tr><th>Bulletin</th><th>Hazard</th><th>Document</th></tr></thead>
              <tbody>
                @for (b of bg.items; track b.id) {
                  <tr>
                    <td style="font-weight:600;">{{ b.title }}</td>
                    <td>{{ b.hazardType || '—' }}</td>
                    <td>
                      @if (b.pdfUrl) {
                        <a [href]="b.pdfUrl" target="_blank" rel="noopener"><i class="fas fa-file-pdf" style="margin-right:4px;"></i>View PDF</a>
                      } @else { <span class="muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
        } @empty {
          <div class="muted" style="padding:12px 0;">No bulletins published for your view.</div>
        }
      </div>
    </details>
  `,
})
export class StakeholderIssuedAlertsComponent {
  private http = inject(HttpClient);

  private feed = signal<LandingFeed | null>(null);
  loadedAt = signal('');

  warnings = computed(() => this.feed()?.warnings ?? []);
  bulletins = computed(() => this.feed()?.bulletins ?? []);
  stats = computed(() => this.feed()?.stats ?? { emergencyCount: 0, warningCount: 0, watchCount: 0, peopleAtRisk: 0 });

  constructor() {
    document.title = 'Issued Alerts — e-MAAFA';
    this.load();
  }

  warningGroups(): { key: string; label: string; hint: string; items: IssuedWarning[] }[] {
    const rows = this.warnings();
    const major: IssuedWarning[] = [];
    const warning: IssuedWarning[] = [];
    const advisory: IssuedWarning[] = [];
    for (const w of rows) {
      const s = (w.severityLevel || '').toUpperCase();
      if (s.includes('EMERGENCY') || s.includes('MAJOR')) major.push(w);
      else if (s.includes('ADVIS') || s.includes('WATCH')) advisory.push(w);
      else warning.push(w);
    }
    return [
      { key: 'major', label: '1 · Major / Emergency warnings', hint: 'Highest priority — escalate Response and logistics first.', items: major },
      { key: 'warning', label: '2 · Warning level', hint: 'Active warnings requiring monitoring and preparedness.', items: warning },
      { key: 'advisory', label: '3 · Advisory / Watch', hint: 'Lower intensity — stay informed; pre-position if needed.', items: advisory },
    ].filter(g => g.items.length > 0);
  }

  bulletinGroups(): { key: string; label: string; items: IssuedBulletin[] }[] {
    const rows = this.bulletins();
    const major: IssuedBulletin[] = [];
    const warning: IssuedBulletin[] = [];
    const advisory: IssuedBulletin[] = [];
    for (const b of rows) {
      const s = (b.severity || '').toUpperCase().replace(/_/g, ' ');
      if (s.includes('MAJOR') || s.includes('EMERGENCY')) major.push(b);
      else if (s.includes('WARN')) warning.push(b);
      else advisory.push(b);
    }
    return [
      { key: 'major', label: 'Major warning bulletins', items: major },
      { key: 'warning', label: 'Warning bulletins', items: warning },
      { key: 'advisory', label: 'Advisory bulletins', items: advisory },
    ].filter(g => g.items.length > 0);
  }

  areaLine(w: IssuedWarning): string {
    if (w.area_summary) return w.area_summary;
    const r = w.affectedRegions || '';
    const d = w.affectedDistricts || '';
    if (d && d.split(',').length > 4) {
      return (r || 'Areas') + ' · ' + d.split(',').length + ' districts';
    }
    return [r, d].filter(Boolean).join(' — ') || 'Area coverage on file';
  }

  private load(): void {
    forkJoin({
      dash: this.http.get<any>('/api/v1/response/dashboard').pipe(catchError(() => of(null))),
      ew: this.http.get<any>('/api/v1/ew/warnings').pipe(catchError(() => of(null))),
      products: this.http.get<any>('/api/v1/ew/products').pipe(catchError(() => of(null))),
      portal: this.http.get<LandingFeed>('/api/v1/portal/landing').pipe(catchError(() => of(null))),
    }).subscribe(({ dash, ew, products, portal }) => {
      const fromDash = this.mapDashAlerts(dash?.area_early_warnings);
      const fromEw = this.mapEwWarnings(ew);
      const warnings = fromDash.length ? fromDash : (fromEw.length ? fromEw : (portal?.warnings ?? []));
      const rawBulletins = this.mapProducts(products);
      const bulletins = this.dedupeBulletins(rawBulletins.length ? rawBulletins : (portal?.bulletins ?? []));
      this.feed.set({ warnings, bulletins, stats: this.computeStats(warnings, portal?.stats) });
      const now = new Date();
      this.loadedAt.set(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    });
  }

  private mapDashAlerts(rows: any[] | null | undefined): IssuedWarning[] {
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows.map((w, i) => ({
      id: Number(w.id ?? i),
      warningCode: String(w.warning_code ?? '—'),
      hazardType: String(w.hazard_names ?? 'Hazard'),
      severityLevel: String(w.warning_level ?? 'Warning'),
      alertMessage: String(w.area_summary ?? w.hazard_names ?? 'Issued early warning'),
      affectedRegions: String(w.region_names ?? ''),
      affectedDistricts: w.district_names ? String(w.district_names) : null,
      peopleAtRisk: Number(w.people_at_risk ?? 0),
      area_summary: w.area_summary ? String(w.area_summary) : undefined,
      district_count: w.district_count != null ? Number(w.district_count) : undefined,
      district_names_full: w.district_names_full ? String(w.district_names_full) : undefined,
      status: String(w.status ?? 'published'),
    }));
  }

  private mapEwWarnings(payload: any): IssuedWarning[] {
    const rows = payload?.warnings ?? payload?.data ?? (Array.isArray(payload) ? payload : []);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((w: any) => String(w.status ?? '').toLowerCase() === 'published')
      .map((w: any, i: number) => {
        const hazards = w.hazards ?? w.hazardRows ?? [];
        const names = Array.isArray(hazards)
          ? hazards.map((h: any) => h.name || h.hazard || h.hazardName).filter(Boolean).join(', ')
          : '';
        const regions = Array.isArray(hazards)
          ? [...new Set(hazards.map((h: any) => h.region || h.regionName).filter(Boolean))].join(', ')
          : (w.affectedRegions || '');
        const level = Array.isArray(hazards) && hazards[0]
          ? (hazards[0].level || hazards[0].warningLevel || 'Warning')
          : (w.severityLevel || 'Warning');
        return {
          id: Number(w.id ?? i),
          warningCode: String(w.warningCode ?? w.warning_code ?? '—'),
          hazardType: names || String(w.hazardType ?? 'Hazard'),
          severityLevel: String(level),
          alertMessage: String(w.alertMessage ?? (names || 'Published early warning')),
          affectedRegions: String(regions),
          affectedDistricts: null,
          peopleAtRisk: Number(w.peopleAtRisk ?? 0),
          status: String(w.status ?? 'published'),
        } as IssuedWarning;
      });
  }

  private mapProducts(payload: any): IssuedBulletin[] {
    const rows = payload?.products ?? payload?.data ?? payload?.items ?? (Array.isArray(payload) ? payload : []);
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 40).map((p: any, i: number) => ({
      id: Number(p.id ?? i),
      title: String(p.title ?? p.file_name ?? p.fileName ?? 'Bulletin'),
      severity: String(p.severity ?? p.warning_level ?? 'warning'),
      pdfUrl: String(p.pdf_url ?? p.pdfUrl ?? (p.pdf_path ? '/api/storage/' + p.pdf_path : '')),
      hazardType: p.hazard_type ?? p.hazardType ?? undefined,
    }));
  }

  /** Collapse exact duplicate titles (seed noise) into one row. */
  private dedupeBulletins(rows: IssuedBulletin[]): IssuedBulletin[] {
    const seen = new Set<string>();
    const out: IssuedBulletin[] = [];
    for (const b of rows) {
      const k = (b.title + '|' + b.severity).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return out;
  }

  private computeStats(warnings: IssuedWarning[], portalStats?: LandingFeed['stats'] | null): LandingFeed['stats'] {
    if (!warnings.length && portalStats) return portalStats;
    let emergencyCount = 0, warningCount = 0, watchCount = 0, peopleAtRisk = 0;
    for (const w of warnings) {
      const s = (w.severityLevel || '').toUpperCase();
      if (s.includes('EMERGENCY') || s.includes('MAJOR')) emergencyCount++;
      else if (s.includes('WARNING')) warningCount++;
      else watchCount++;
      peopleAtRisk += Number(w.peopleAtRisk || 0);
    }
    return { emergencyCount, warningCount, watchCount, peopleAtRisk };
  }
}
