import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

interface IssuedWarning {
  id: number; warningCode: string; hazardType: string; severityLevel: string;
  alertMessage: string; affectedRegions: string; affectedDistricts?: string | null;
  peopleAtRisk: number; bulletinUrl?: string | null; bulletinDescription?: string | null;
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
 * Stakeholder Portal — Issued Alerts & Active Warnings (READ-ONLY).
 * Partners see what the Government has issued (active warnings + published bulletins);
 * they do not get the Early-Warning management console (that authoring/consolidation
 * surface belongs to Preparedness / the EW agencies — user directive 2026-07-03).
 * Fed by the same live feed the public portal uses, so partners and the public
 * always read the same official picture.
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
      Official alerts and bulletins issued by the Government through e-MAAFA. For coordination questions contact the EOCC.
    </p>

    <div class="tiles" style="margin-bottom:16px;">
      <div class="tile accent-red"><div class="n">{{ stats().emergencyCount }}</div><div class="l">Emergency</div></div>
      <div class="tile accent-orange"><div class="n">{{ stats().warningCount }}</div><div class="l">Warning</div></div>
      <div class="tile"><div class="n">{{ stats().watchCount }}</div><div class="l">Watch</div></div>
      <div class="tile accent-green"><div class="n">{{ stats().peopleAtRisk | number }}</div><div class="l">People at risk</div></div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-h"><h3>Active warnings</h3><span class="spacer"></span><span class="badge b-muted">{{ warnings().length }} active</span></div>
      @if (warnings().length) {
        <table class="tbl">
          <thead><tr><th>Severity</th><th>Hazard</th><th>Areas affected</th><th>Alert message</th><th style="text-align:right;">People at risk</th><th>Bulletin</th></tr></thead>
          <tbody>
            @for (w of warnings(); track w.id) {
              <tr>
                <td><span class="badge" [class]="'badge ' + sevBadge(w.severityLevel)"><span class="dot"></span>{{ w.severityLevel }}</span></td>
                <td style="font-weight:600;">{{ w.hazardType }}</td>
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
          No active warnings at this time.
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
        <div class="card-b muted" style="text-align:center; padding:2rem;">No bulletins have been published.</div>
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
    this.http.get<LandingFeed>('/api/v1/portal/landing').subscribe(d => {
      this.feed.set(d);
      const now = new Date();
      this.loadedAt.set(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    });
  }
}
