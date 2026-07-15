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
    imports: [RouterLink],
    template: `
    <div class="v2-page-content cal-wrap">
      <a routerLink="/education" class="cal-back"><i class="fas fa-arrow-left me-1"></i> {{ t('back') }}</a>
      <h1 class="cal-title">
        <i class="fas fa-calendar-days me-2" style="color:#0ea5e9;"></i>{{ t('title') }}
      </h1>
      <p class="cal-subtitle">{{ t('subtitle') }}</p>

      <div class="cal-legend">
        <span class="cal-legend-label">{{ t('legend') }}:</span>
        <span class="cal-chip"><span class="cal-dot" style="background:#dc2626;"></span>{{ t('high') }}</span>
        <span class="cal-chip"><span class="cal-dot" style="background:#f59e0b;"></span>{{ t('moderate') }}</span>
        <span class="cal-chip"><span class="cal-dot" style="background:#16a34a;"></span>{{ t('low') }}</span>
      </div>

      @if (rows().length) {
        <div class="cal-scroller">
          <table class="cal-table">
            <thead>
              <tr>
                <th class="cal-hazard-col">{{ t('hazard') }}</th>
                @for (m of months; track m) {
                  <th class="cal-month">{{ mon(m) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.hazardName) {
                <tr>
                  <td class="cal-hazard-cell">
                    <span [style.color]="r.color"><i class="fas {{ r.icon }} me-2"></i></span>{{ hazardName(r) }}
                  </td>
                  @for (m of months; track m) {
                    <td class="cal-cell">
                      @if (r.months[m]; as c) {
                        <span class="cal-block" [style.background]="riskColor(c.riskLevel)"
                              [title]="riskLabel(c.riskLevel) + ' — ' + c.season + ': ' + c.note"></span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="cal-footnote">{{ t('footnote') }}</p>
      } @else {
        <p class="cal-loading">{{ t('loading') }}</p>
      }
    </div>
  `,
    styles: [`
    .cal-wrap { max-width: min(1560px, 94vw); margin: 0 auto; padding: 7rem 2rem 4rem; }
    .cal-back { color: #60a5fa; text-decoration: none; font-size: 0.9rem; }
    .cal-title { font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0.8rem 0 0.2rem; }
    .cal-subtitle { font-size: 1.05rem; color: var(--text-secondary, #64748b); margin: 0 0 1.3rem; }

    /* Flat legend chips */
    .cal-legend { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin-bottom: 1.2rem; }
    .cal-legend-label { font-size: 0.9rem; font-weight: 700; color: var(--text-primary, #2C3E50); }
    .cal-chip { display: inline-flex; align-items: center; gap: 7px; padding: 5px 14px; border-radius: 999px;
      border: 1px solid rgba(13, 43, 77, 0.14); background: var(--card-bg, #fff); font-size: 0.9rem;
      font-weight: 700; color: var(--text-primary, #2C3E50); }
    .cal-dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }

    .cal-scroller { overflow-x: auto; border: 1px solid var(--card-border, #e2e8f0); border-radius: 12px;
      background: var(--card-bg, #fff); }
    .cal-table { border-collapse: collapse; width: 100%; min-width: 900px; font-size: 0.9rem; }
    .cal-hazard-col { text-align: left; padding: 0.8rem 0.9rem; border-bottom: 2px solid var(--card-border, #e2e8f0);
      position: sticky; left: 0; background: var(--card-bg, #fff); color: var(--text-primary, #2C3E50);
      font-size: 0.9rem; }
    .cal-month { padding: 0.7rem 0.3rem; border-bottom: 2px solid var(--card-border, #e2e8f0); text-align: center;
      font-weight: 700; color: var(--text-secondary, #64748b); font-size: 0.9rem; }
    .cal-hazard-cell { padding: 0.65rem 0.9rem; white-space: nowrap; border-bottom: 1px solid var(--card-border, #f1f5f9);
      position: sticky; left: 0; background: var(--card-bg, #fff); font-weight: 600;
      color: var(--text-primary, #2C3E50); font-size: 0.95rem; }
    .cal-cell { padding: 0.35rem; text-align: center; border-bottom: 1px solid var(--card-border, #f1f5f9); }
    .cal-block { display: inline-block; width: 26px; height: 26px; border-radius: 6px; cursor: help; }

    .cal-footnote { font-size: 0.9rem; color: var(--text-light, #94a3b8); margin-top: 0.9rem; }
    .cal-loading { font-size: 1rem; color: var(--text-secondary, #64748b); }

    @media (max-width: 640px) {
      .cal-wrap { padding: 6rem 1rem 2.5rem; }
    }
  `]
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
