import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface IssuedWarning {
  id: number; warningCode: string; hazardType: string; severityLevel: string;
  alertMessage: string; affectedRegions: string; affectedDistricts?: string | null;
  peopleAtRisk: number; bulletinUrl?: string | null; bulletinDescription?: string | null;
  status?: string;
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
 * Issued Alerts & Active Warnings (READ-ONLY) — Response + Stakeholder Portal.
 *
 * Primary feed for staff/area logins: area-scoped published early warnings + EW products
 * (not the EW workbench). Fallback for pure partners / public-map picture: portal landing.
 * Area officers only see warnings that cover their district/region.
 */
@Component({
  selector: 'stakeholder-issued-alerts',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="page-title">
      <h1>Issued Alerts &amp; Active Warnings</h1>
      <span class="badge b-muted">Read-only</span>
      <span class="spacer"></span>
      @if (loadedAt()) { <span class="muted" style="font-size:13px;"><i class="far fa-clock" style="margin-right:4px;"></i>Updated {{ loadedAt() }}</span> }
    </div>
    <p class="muted" style="margin:-8px 0 16px; font-size:14px;">
      Official alerts and bulletins issued for your area of responsibility. For coordination questions contact the EOCC.
    </p>

    <div class="tiles" style="margin-bottom:16px;">
      <div class="tile accent-red"><div class="n">{{ stats().emergencyCount }}</div><div class="l">Emergency / Major</div></div>
      <div class="tile accent-orange"><div class="n">{{ stats().warningCount }}</div><div class="l">Warning</div></div>
      <div class="tile"><div class="n">{{ stats().watchCount }}</div><div class="l">Advisory / Watch</div></div>
      <div class="tile accent-green"><div class="n">{{ stats().peopleAtRisk | number }}</div><div class="l">People at risk</div></div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-h"><h3>Active / published warnings</h3><span class="spacer"></span><span class="badge b-muted">{{ warnings().length }} issued</span></div>
      @if (warnings().length) {
        <table class="tbl">
          <thead><tr><th>Severity</th><th>Code / Hazard</th><th>Areas affected</th><th>Alert message</th><th style="text-align:right;">People at risk</th><th>Bulletin</th></tr></thead>
          <tbody>
            @for (w of warnings(); track w.id) {
              <tr>
                <td><span class="badge" [class]="'badge ' + sevBadge(w.severityLevel)"><span class="dot"></span>{{ w.severityLevel }}</span></td>
                <td style="font-weight:600;">{{ w.warningCode }} · {{ w.hazardType }}</td>
                <td>{{ w.affectedRegions }}@if (w.affectedDistricts) { <span class="muted"> — {{ w.affectedDistricts }}</span> }</td>
                <td style="max-width:420px;">{{ w.alertMessage }}</td>
                <td style="text-align:right;">{{ w.peopleAtRisk | number }}</td>
                <td>@if (w.bulletinUrl) { <a [href]="w.bulletinUrl" target="_blank" rel="noopener">View PDF</a> } @else { <span class="muted">—</span> }</td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <div class="card-b muted" style="text-align:center; padding:2rem;">
          <i class="fas fa-check-circle" style="font-size:1.6rem; color:var(--green); display:block; margin-bottom:8px;"></i>
          No published early-warning alerts currently cover your jurisdiction.
        </div>
      }
    </div>

    <div class="card">
      <div class="card-h"><h3>Issued bulletins</h3><span class="spacer"></span><span class="badge b-muted">{{ bulletins().length }} published</span></div>
      @if (bulletins().length) {
        <table class="tbl">
          <thead><tr><th>Bulletin</th><th>Hazard</th><th>Severity</th><th>Document</th></tr></thead>
          <tbody>
            @for (b of bulletins(); track b.id) {
              <tr>
                <td style="font-weight:600;">{{ b.title }}</td>
                <td>{{ b.hazardType || '—' }}</td>
                <td><span class="badge" [class]="'badge ' + sevBadge(b.severity)"><span class="dot"></span>{{ (b.severity || '').replace('_', ' ') }}</span></td>
                <td>@if (b.pdfUrl) { <a [href]="b.pdfUrl" target="_blank" rel="noopener"><i class="fas fa-file-pdf" style="margin-right:4px;"></i>View PDF</a> } @else { <span class="muted">—</span> }</td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <div class="card-b muted" style="text-align:center; padding:2rem;">No bulletins have been published for your view.</div>
      }
    </div>
  `,
})
export class StakeholderIssuedAlertsComponent {
  private http = inject(HttpClient);

  private feed = signal<LandingFeed | null>(null);
  loadedAt = signal('');

  warnings = computed(() => this.feed()?.warnings ?? []);
  bulletins = computed(() => this.feed()?.bulletins ?? []);
  stats = computed(() => this.feed()?.stats ?? { emergencyCount: 0, warningCount: 0, watchCount: 0, peopleAtRisk: 0 });

  sevBadge(sev: string): string {
    const s = (sev || '').toUpperCase();
    if (s.includes('EMERGENCY') || s.includes('MAJOR')) { return 'b-emergency'; }
    if (s.includes('WARNING')) { return 'b-warning'; }
    return 'b-watch';
  }

  constructor() {
    document.title = 'Issued Alerts — e-MAAFA';
    this.load();
  }

  private load(): void {
    // Prefer authenticated, jurisdiction-scoped issued warnings (staff / area officers).
    // Fall back to public portal landing (partners / map-curated feed).
    forkJoin({
      dash: this.http.get<any>('/api/v1/response/dashboard').pipe(catchError(() => of(null))),
      ew: this.http.get<any>('/api/v1/ew/warnings').pipe(catchError(() => of(null))),
      products: this.http.get<any>('/api/v1/ew/products').pipe(catchError(() => of(null))),
      portal: this.http.get<LandingFeed>('/api/v1/portal/landing').pipe(catchError(() => of(null))),
    }).subscribe(({ dash, ew, products, portal }) => {
      const fromDash = this.mapDashAlerts(dash?.area_early_warnings);
      const fromEw = this.mapEwWarnings(ew);
      const warnings = fromDash.length ? fromDash : (fromEw.length ? fromEw : (portal?.warnings ?? []));
      const bulletins = this.mapProducts(products).length
        ? this.mapProducts(products)
        : (portal?.bulletins ?? []);
      const stats = this.computeStats(warnings, portal?.stats);
      this.feed.set({ warnings, bulletins, stats });
      const now = new Date();
      this.loadedAt.set(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    });
  }

  private mapDashAlerts(rows: any[] | null | undefined): IssuedWarning[] {
    if (!Array.isArray(rows) || !rows.length) { return []; }
    return rows.map((w, i) => ({
      id: Number(w.id ?? i),
      warningCode: String(w.warning_code ?? w.warningCode ?? '—'),
      hazardType: String(w.hazard_names ?? w.hazardType ?? 'Hazard'),
      severityLevel: String(w.warning_level ?? w.severityLevel ?? 'Warning'),
      alertMessage: [w.hazard_names, w.region_names, w.district_names].filter(Boolean).join(' — ') || 'Issued early warning',
      affectedRegions: String(w.region_names ?? ''),
      affectedDistricts: w.district_names ? String(w.district_names) : null,
      peopleAtRisk: Number(w.people_at_risk ?? 0),
      status: String(w.status ?? 'published'),
    }));
  }

  private mapEwWarnings(payload: any): IssuedWarning[] {
    const rows = payload?.warnings ?? payload?.data ?? (Array.isArray(payload) ? payload : []);
    if (!Array.isArray(rows)) { return []; }
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
    if (!Array.isArray(rows)) { return []; }
    return rows.slice(0, 30).map((p: any, i: number) => ({
      id: Number(p.id ?? i),
      title: String(p.title ?? p.file_name ?? p.fileName ?? 'Bulletin'),
      severity: String(p.severity ?? p.warning_level ?? 'warning'),
      pdfUrl: String(p.pdf_url ?? p.pdfUrl ?? (p.pdf_path ? '/api/storage/' + p.pdf_path : '')),
      hazardType: p.hazard_type ?? p.hazardType ?? undefined,
    }));
  }

  private computeStats(
    warnings: IssuedWarning[],
    portalStats?: LandingFeed['stats'] | null,
  ): LandingFeed['stats'] {
    if (!warnings.length && portalStats) { return portalStats; }
    let emergencyCount = 0, warningCount = 0, watchCount = 0, peopleAtRisk = 0;
    for (const w of warnings) {
      const s = (w.severityLevel || '').toUpperCase();
      if (s.includes('EMERGENCY') || s.includes('MAJOR')) { emergencyCount++; }
      else if (s.includes('WARNING')) { warningCount++; }
      else { watchCount++; }
      peopleAtRisk += Number(w.peopleAtRisk || 0);
    }
    return { emergencyCount, warningCount, watchCount, peopleAtRisk };
  }
}
