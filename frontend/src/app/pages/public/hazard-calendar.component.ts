import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

interface CalCell { riskLevel: string; season: string; note: string; }
interface CalRow { hazardName: string; hazardNameSw: string | null; icon: string; color: string; months: Record<number, CalCell>; }
interface CalApiRow { hazardName: string; hazardNameSw: string | null; icon: string; color: string; month: number; riskLevel: string; season: string; note: string; }

/**
 * C3 — public NATIONAL HAZARD CALENDAR (/hazard-calendar). A hazard × 12-month grid showing when each
 * hazard is most likely across the year in Tanzania, coloured by risk level. Data comes from the
 * /portal/hazard-calendar endpoint (genuine Tanzania seasonality, joined to the hazard cards for the
 * bilingual name + icon/colour). Fully bilingual via PortalLabels.lang().
 */
@Component({
  selector: 'public-hazard-calendar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="max-width:1100px;margin:0 auto;padding:1.5rem 1rem;">
      <a routerLink="/education" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ t('back') }}</a>
      <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0.6rem 0 0.2rem;">
        <i class="fas fa-calendar-days me-2" style="color:#0ea5e9;"></i>{{ t('title') }}
      </h1>
      <p style="color:var(--text-secondary, #64748b);margin:0 0 1.1rem;">{{ t('subtitle') }}</p>

      <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin-bottom:1rem;font-size:0.8rem;color:var(--text-primary,#2C3E50);">
        <span style="font-weight:700;">{{ t('legend') }}:</span>
        <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:14px;height:14px;border-radius:3px;background:#dc2626;display:inline-block;"></span>{{ t('high') }}</span>
        <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:14px;height:14px;border-radius:3px;background:#f59e0b;display:inline-block;"></span>{{ t('moderate') }}</span>
        <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:14px;height:14px;border-radius:3px;background:#16a34a;display:inline-block;"></span>{{ t('low') }}</span>
      </div>

      @if (rows().length) {
        <div style="overflow-x:auto;border:1px solid var(--card-border, #e2e8f0);border-radius:12px;">
          <table style="border-collapse:collapse;width:100%;min-width:780px;font-size:0.82rem;">
            <thead>
              <tr>
                <th style="text-align:left;padding:0.6rem 0.7rem;border-bottom:2px solid var(--card-border,#e2e8f0);position:sticky;left:0;background:var(--card-bg,#fff);color:var(--text-primary,#2C3E50);">{{ t('hazard') }}</th>
                @for (m of months; track m) {
                  <th style="padding:0.5rem 0.2rem;border-bottom:2px solid var(--card-border,#e2e8f0);text-align:center;font-weight:600;color:var(--text-secondary,#64748b);">{{ mon(m) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.hazardName) {
                <tr>
                  <td style="padding:0.55rem 0.7rem;white-space:nowrap;border-bottom:1px solid var(--card-border,#f1f5f9);position:sticky;left:0;background:var(--card-bg,#fff);font-weight:600;color:var(--text-primary,#2C3E50);">
                    <span [style.color]="r.color"><i class="fas {{ r.icon }} me-2"></i></span>{{ hazardName(r) }}
                  </td>
                  @for (m of months; track m) {
                    <td style="padding:0.3rem;text-align:center;border-bottom:1px solid var(--card-border,#f1f5f9);">
                      @if (r.months[m]; as c) {
                        <span [style.background]="riskColor(c.riskLevel)"
                              [title]="riskLabel(c.riskLevel) + ' — ' + c.season + ': ' + c.note"
                              style="display:inline-block;width:22px;height:22px;border-radius:5px;cursor:help;"></span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p style="font-size:0.74rem;color:var(--text-light, #94a3b8);margin-top:0.8rem;">{{ t('footnote') }}</p>
      } @else {
        <p style="color:var(--text-secondary,#64748b);">{{ t('loading') }}</p>
      }
    </div>
  `,
})
export class HazardCalendarComponent {
  readonly L = inject(PortalLabels);
  private http = inject(HttpClient);
  rows = signal<CalRow[]>([]);

  readonly months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  private readonly MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  private readonly MON_SW = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
  private readonly TR: Record<string, { en: string; sw: string }> = {
    title: { en: 'National Hazard Calendar', sw: 'Kalenda ya Majanga ya Kitaifa' },
    subtitle: { en: 'When hazards are most likely across the year in Tanzania', sw: 'Majanga yanapotarajiwa zaidi kwa mwaka nchini Tanzania' },
    hazard: { en: 'Hazard', sw: 'Janga' },
    legend: { en: 'Risk level', sw: 'Kiwango cha hatari' },
    high: { en: 'High', sw: 'Juu' },
    moderate: { en: 'Moderate', sw: 'Wastani' },
    low: { en: 'Low', sw: 'Chini' },
    back: { en: 'Back to Education', sw: 'Rudi kwenye Elimu' },
    loading: { en: 'Loading the hazard calendar…', sw: 'Inapakia kalenda ya majanga…' },
    footnote: { en: 'Indicative national seasonality — local timing varies by region. Hover a cell for the season and driver.', sw: 'Mwelekeo wa msimu wa kitaifa — muda hutofautiana kwa mkoa. Weka kishale kwenye kisanduku kuona msimu na chanzo.' },
  };

  constructor() {
    this.http.get<CalApiRow[]>('/api/v1/portal/hazard-calendar').subscribe(data => {
      const map = new Map<string, CalRow>();
      for (const r of data) {
        let row = map.get(r.hazardName);
        if (!row) {
          row = { hazardName: r.hazardName, hazardNameSw: r.hazardNameSw, icon: r.icon, color: r.color, months: {} };
          map.set(r.hazardName, row);
        }
        row.months[r.month] = { riskLevel: r.riskLevel, season: r.season, note: r.note };
      }
      this.rows.set([...map.values()]);
    });
  }

  t(k: string): string { const e = this.TR[k]; return e ? (this.L.lang() === 'sw' ? e.sw : e.en) : k; }
  mon(m: number): string { return (this.L.lang() === 'sw' ? this.MON_SW : this.MON_EN)[m - 1]; }
  hazardName(r: CalRow): string { return this.L.lang() === 'sw' && r.hazardNameSw ? r.hazardNameSw : r.hazardName; }
  riskColor(risk: string): string {
    return risk === 'High' ? '#dc2626' : risk === 'Moderate' ? '#f59e0b' : risk === 'Low' ? '#16a34a' : 'transparent';
  }
  riskLabel(risk: string): string {
    return risk === 'High' ? this.t('high') : risk === 'Moderate' ? this.t('moderate') : risk === 'Low' ? this.t('low') : '';
  }
}
