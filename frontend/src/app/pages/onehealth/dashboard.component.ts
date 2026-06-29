import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OhReportEventModalComponent } from './report-event-modal.component';
import { addMapNav } from '../../core/tz-map';

declare const Chart: any;  // Chart.js, loaded per-page from the CDN exactly as the Blade page pushes it
declare const L: any;      // Leaflet (global, as the Blade page loads it)

interface RegionStat { region_id: number; name: string; total_events: number; active_count: number; closed_count: number; }
interface RecentEvent {
  id: number; event_id: string; event_title: string | null; event_description: string | null;
  status: string; status_label: string; priority_level: string | null; area_category: string | null;
  stakeholder_organization: string | null; region_name: string | null; created_at_relative: string;
}
interface DashboardStats {
  total_events: number; active_events: number; submitted: number; under_review: number;
  directive_issued: number; disseminated: number; monitoring: number; closed: number;
  overdue_directives: number; events_7d: number; events_prev_7d: number;
  new_events_this_month: number; new_events_last_month: number; daily_events_7d: number[];
  region_stats: RegionStat[]; events_by_status: Record<string, number>;
  month_labels: string[]; monthly_events: number[]; monthly_directives: number[];
  recent_events: RecentEvent[]; ew_alerts_active: number;
  trend_start: string; trend_end: string; current_month_name: string;
}

/**
 * Reproduction of onehealth/dashboard.blade.php (1802 lines): header card with status pills,
 * Event Trends line chart, KPI sparklines, status doughnut, resolution gauge, EW alert banner,
 * Recent Events table with client-side search/filter, Top Regions table and the Tanzania
 * Leaflet map (mask, lakes, adm1 choropleth with district/ward drill-down, event markers).
 * Chart options are verbatim from the page's script block.
 */
@Component({
  selector: 'page-oh-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, OhReportEventModalComponent],
  styles: [`
    :host { display: block; }
    .oh-breadcrumb { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-light); margin-bottom: 1rem; }
    .oh-breadcrumb a { color: var(--text-mid); text-decoration: none; }
    .oh-breadcrumb a:hover { color: var(--primary); }
    .oh-breadcrumb .sep { font-size: 0.6rem; }
    .oh-s1 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    .oh-s1-left { display: flex; flex-direction: column; gap: 1rem; }
    .oh-s1-right { display: flex; flex-direction: column; gap: 1rem; }
    .oh-card { background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .oh-card:hover { box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .oh-header-card { padding: 1.5rem 1.75rem 1.25rem; }
    .oh-header-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.75rem; }
    .oh-header-title { font-size: 1.45rem; font-weight: 800; color: var(--text-dark); letter-spacing: -0.5px; line-height: 1.2; }
    .oh-header-sub { font-size: 0.82rem; color: var(--text-light); margin-top: 0.25rem; font-weight: 500; }
    .oh-btn-report { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; border-radius: 6px; background: #0e7490; color: #fff; font-size: 0.82rem; font-weight: 600; border: none; cursor: pointer; white-space: nowrap; }
    .oh-btn-report:hover { background: #155e75; }
    .oh-btn-report i { font-size: 0.7rem; }
    .oh-header-divider { height: 1px; background: var(--line, #e2e8f0); margin-bottom: 0.85rem; }
    .oh-pills { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
    .oh-pill { display: flex; align-items: center; gap: 0.6rem; }
    .oh-pill-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; }
    .oh-pill-icon.green { background: #ecfdf5; color: #059669; }
    .oh-pill-icon.orange { background: #fff7ed; color: #ea580c; }
    .oh-pill-icon.red { background: #fef2f2; color: #dc2626; }
    .oh-pill-text strong { display: block; font-size: 0.85rem; font-weight: 700; color: var(--text-dark); line-height: 1.2; }
    .oh-pill-text span { font-size: 0.7rem; font-weight: 500; color: var(--text-light); }
    .oh-kpi-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .oh-kpi-card { padding: 1.15rem 1.25rem 0.75rem; display: flex; flex-direction: column; }
    .oh-kpi-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.15rem; }
    .oh-kpi-left { display: flex; flex-direction: column; }
    .oh-kpi-title { font-size: 0.82rem; font-weight: 700; color: var(--text-mid); }
    .oh-kpi-badge { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.15rem 0.45rem; border-radius: 6px; font-size: 0.68rem; font-weight: 700; margin-left: 0.4rem; vertical-align: middle; }
    .oh-kpi-badge.up { background: #ecfdf5; color: #059669; }
    .oh-kpi-badge.down { background: #fef2f2; color: #dc2626; }
    .oh-kpi-badge.neutral { background: #f3f4f6; color: #6b7280; }
    .oh-kpi-value { font-size: 1.75rem; font-weight: 800; color: var(--text-dark); letter-spacing: -0.5px; line-height: 1; }
    .oh-kpi-sub { font-size: 0.7rem; font-weight: 500; color: var(--text-light); margin-top: 0.2rem; }
    .oh-kpi-spark { margin-top: auto; padding-top: 0.5rem; height: 45px; position: relative; }
    .oh-kpi-spark canvas { width: 100% !important; height: 100% !important; }
    .oh-chart-card { padding: 1.25rem 1.5rem 1rem; flex: 1; }
    .oh-chart-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
    .oh-chart-title { font-size: 1.05rem; font-weight: 700; color: var(--text-dark); }
    .oh-chart-sub { font-size: 0.78rem; color: var(--text-light); font-weight: 500; margin-top: 0.1rem; }
    .oh-chart-meta { display: flex; align-items: center; gap: 1rem; }
    .oh-chart-period { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.75rem; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 0.75rem; font-weight: 600; color: var(--text-mid); }
    .oh-chart-period i { font-size: 0.65rem; color: var(--text-light); }
    .oh-legend { display: flex; align-items: center; gap: 1rem; }
    .oh-legend-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 600; color: var(--text-mid); }
    .oh-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
    .oh-legend-dot.events { background: #0891b2; }
    .oh-legend-dot.directives { background: #a5f3fc; }
    .oh-chart-canvas { position: relative; height: 220px; }
    .oh-mini-card { padding: 1.15rem 1.25rem 1rem; display: flex; flex-direction: column; }
    .oh-mini-head { margin-bottom: 0.5rem; }
    .oh-mini-title { font-size: 0.88rem; font-weight: 700; color: var(--text-dark); }
    .oh-mini-sub { font-size: 0.7rem; font-weight: 500; color: var(--text-light); margin-top: 0.1rem; }
    .oh-mini-chart { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; min-height: 130px; }
    .oh-mini-chart canvas { max-height: 140px; }
    .oh-doughnut-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 1.35rem; font-weight: 800; color: var(--text-dark); line-height: 1; }
    .oh-gauge-center { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); text-align: center; }
    .oh-gauge-center .gauge-val { font-size: 1.35rem; font-weight: 800; color: var(--text-dark); line-height: 1; }
    .oh-gauge-center .gauge-label { font-size: 0.65rem; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.3px; }
    .oh-mini-legend { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; }
    .oh-mini-legend-item { display: flex; align-items: center; justify-content: space-between; font-size: 0.73rem; color: var(--text-mid); font-weight: 500; }
    .oh-mini-legend-item .label-group { display: flex; align-items: center; gap: 0.4rem; }
    .oh-mini-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .oh-mini-legend-item .pct { font-weight: 700; color: var(--text-dark); }
    .oh-ew-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 0.65rem 1.15rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.75rem; }
    .oh-ew-banner i { color: #d97706; font-size: 1.1rem; }
    .oh-ew-banner .ew-text { font-size: 0.82rem; color: #92400e; font-weight: 600; }
    .oh-ew-banner a { margin-left: auto; font-size: 0.75rem; color: #d97706; text-decoration: underline; font-weight: 600; white-space: nowrap; }
    /* decorative fade-up animation removed per the flat/professional design standard */
    @media (max-width: 1200px) { .oh-s1 { grid-template-columns: 1fr; } .oh-chart-canvas { height: 200px; } }
    @media (max-width: 768px) { .oh-kpi-row { grid-template-columns: 1fr; } .oh-pills { flex-direction: column; gap: 0.75rem; } .oh-header-top { flex-direction: column; gap: 0.75rem; } .oh-chart-head { flex-direction: column; } .oh-chart-canvas { height: 180px; } }
    /* Recent events */
    .oh-events-card { padding: 0; margin-bottom: 1rem; overflow: hidden; }
    .oh-events-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; flex-wrap: wrap; gap: 0.75rem; }
    .oh-events-title { font-size: 1.05rem; font-weight: 700; color: var(--text-dark); }
    .oh-events-sub { font-size: 0.78rem; color: var(--text-light); font-weight: 500; margin-top: 0.1rem; }
    .oh-events-actions { display: flex; align-items: center; gap: 0.5rem; }
    .oh-search-box { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.75rem; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; }
    .oh-search-box i { font-size: 0.75rem; color: var(--text-light); }
    .oh-search-box input { border: none; background: transparent; outline: none; font-size: 0.78rem; color: var(--text-dark); font-family: inherit; width: 130px; }
    .oh-search-box input::placeholder { color: var(--text-light); }
    .oh-filter-select { padding: 0.4rem 0.75rem; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 0.78rem; font-weight: 600; color: var(--text-mid); cursor: pointer; font-family: inherit; appearance: auto; }
    .oh-more-btn { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 0.85rem; color: var(--text-light); cursor: pointer; }
    .oh-more-btn:hover { background: #f3f4f6; }
    .oh-table { width: 100%; border-collapse: collapse; }
    .oh-table th { padding: 0.65rem 1rem; font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-light); border-bottom: 1px solid #f3f4f6; text-align: left; white-space: nowrap; }
    .oh-table th .sort-icon { font-size: 0.5rem; margin-left: 0.3rem; opacity: 0.4; }
    .oh-table td { padding: 0.7rem 1rem; font-size: 0.88rem; color: var(--text-mid); border-bottom: 1px solid #f9fafb; vertical-align: middle; }
    .oh-table tbody tr { transition: background 0.15s; }
    .oh-table tbody tr:hover { background: rgba(8,145,178,0.02); }
    .oh-event-cell { display: flex; align-items: center; gap: 0.65rem; }
    .oh-event-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; }
    .oh-event-icon.health { background: #fef2f2; color: #dc2626; }
    .oh-event-icon.environmental { background: #ecfdf5; color: #059669; }
    .oh-event-icon.agriculture { background: #fffbeb; color: #d97706; }
    .oh-event-icon.food_safety { background: #eff6ff; color: #2563eb; }
    .oh-event-icon.default { background: #f3f4f6; color: #6b7280; }
    .oh-event-info .eid { font-size: 0.84rem; font-weight: 700; color: #0891b2; text-decoration: none; line-height: 1.3; }
    .oh-event-info .eid:hover { text-decoration: underline; }
    .oh-event-info .etitle { font-size: 0.77rem; color: var(--text-light); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .oh-reporter-cell { display: flex; align-items: center; gap: 0.5rem; }
    .oh-reporter-avatar { width: 28px; height: 28px; border-radius: 50%; background: #0e7490; display: flex; align-items: center; justify-content: center; font-size: 0.55rem; font-weight: 700; color: #fff; flex-shrink: 0; }
    .oh-reporter-name { font-size: 0.8rem; font-weight: 500; }
    .oh-priority { display: flex; align-items: center; gap: 2.5px; }
    .oh-priority .dot { width: 7px; height: 7px; border-radius: 50%; }
    .oh-priority.high .dot { background: #ef4444; }
    .oh-priority.high .dot.empty { background: #fecaca; }
    .oh-priority.medium .dot { background: #f59e0b; }
    .oh-priority.medium .dot.empty { background: #fde68a; }
    .oh-priority.low .dot { background: #10b981; }
    .oh-priority.low .dot.empty { background: #a7f3d0; }
    .oh-desc-text { max-width: 300px; font-size: 0.78rem; color: var(--text-mid); line-height: 1.4; }
    .oh-see-more { color: #0891b2; text-decoration: underline; font-size: 0.72rem; }
    .oh-status-pill { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.22rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; white-space: nowrap; }
    .oh-status-pill i { font-size: 0.55rem; }
    .oh-status-pill.st-approved { background: #ecfdf5; color: #059669; }
    .oh-status-pill.st-pending { background: #fff7ed; color: #ea580c; }
    .oh-status-pill.st-active { background: #eff6ff; color: #2563eb; }
    .oh-status-pill.st-closed { background: #f3f4f6; color: #6b7280; }
    .oh-time-cell { font-size: 0.8rem; color: var(--text-light); white-space: nowrap; }
    .oh-row-actions { display: flex; gap: 0.35rem; opacity: 0; transition: opacity 0.15s; }
    .oh-table tbody tr:hover .oh-row-actions { opacity: 1; }
    .oh-row-action { width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; cursor: pointer; border: 1px solid #e5e7eb; background: #fff; color: var(--text-mid); transition: all 0.15s; text-decoration: none; }
    .oh-row-action:hover { background: #f3f4f6; color: var(--text-dark); }
    .oh-table-footer { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.5rem; border-top: 1px solid #f3f4f6; font-size: 0.75rem; color: var(--text-light); }
    .oh-table-footer a { color: #0891b2; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 0.2rem; }
    .oh-table-footer a:hover { text-decoration: underline; }
    .oh-nav-links { display: flex; align-items: center; gap: 0.5rem; }
    .oh-nav-links .disabled { color: var(--text-light); pointer-events: none; }
    /* Top regions */
    .oh-regions-card { padding: 0; margin-bottom: 1.5rem; overflow: hidden; }
    .oh-regions-grid { display: grid; grid-template-columns: 1fr 1fr; min-height: 500px; }
    .oh-regions-left { padding: 1.25rem 1.5rem; }
    .oh-regions-right { border-left: 1px solid #f3f4f6; position: relative; }
    .oh-regions-title { font-size: 1.05rem; font-weight: 700; color: var(--text-dark); }
    .oh-regions-sub { font-size: 0.78rem; color: var(--text-light); font-weight: 500; margin-top: 0.1rem; margin-bottom: 1rem; }
    .oh-sum-row { display: grid; grid-template-columns: 1.5fr repeat(4, 1fr); padding: 0.5rem 0; margin-bottom: 0.25rem; border-bottom: 1px solid #f3f4f6; }
    .oh-sum-col .col-head { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-light); margin-bottom: 0.2rem; }
    .oh-sum-col .col-head .sort-icon { font-size: 0.45rem; opacity: 0.4; }
    .oh-sum-col .col-val { font-size: 1.05rem; font-weight: 800; color: var(--text-dark); }
    .oh-region-row { display: grid; grid-template-columns: 1.5fr repeat(4, 1fr); padding: 0.55rem 0; align-items: center; border-bottom: 1px solid #fafafa; font-size: 0.87rem; transition: background 0.15s; }
    .oh-region-row:hover { background: rgba(8,145,178,0.02); }
    .oh-region-name { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; color: var(--text-dark); }
    .oh-region-num { font-size: 0.72rem; font-weight: 700; color: var(--text-light); min-width: 18px; }
    .oh-region-dot { width: 18px; height: 13px; border-radius: 3px; flex-shrink: 0; background: #0891b2; }
    .oh-region-stat { color: var(--text-mid); }
    .oh-region-stat .pct { font-size: 0.72rem; color: var(--text-light); margin-left: 0.2rem; }
    .oh-region-rate { font-weight: 600; }
    .oh-regions-footer { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-top: 1px solid #f3f4f6; margin-top: 0.25rem; font-size: 0.72rem; color: var(--text-light); }
    .oh-regions-footer .nav-link { color: #0891b2; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 0.15rem; font-size: 0.72rem; }
    .oh-map-container { width: 100%; height: 100%; min-height: 500px; border-radius: 0 0 16px 0; }
    @media (max-width: 992px) { .oh-regions-grid { grid-template-columns: 1fr; } .oh-regions-right { border-left: none; border-top: 1px solid #f3f4f6; min-height: 280px; } .oh-map-container { border-radius: 0 0 16px 16px; } }
    @media (max-width: 768px) { .oh-events-header { flex-direction: column; align-items: flex-start; } .oh-sum-row, .oh-region-row { grid-template-columns: 1.5fr repeat(4, 1fr); font-size: 0.75rem; } }
  `],
  template: `
    <nav class="oh-breadcrumb">
      <a routerLink="/home">Home</a>
      <span class="sep"><i class="fas fa-chevron-right"></i></span>
      <span>One Health</span>
      <span class="sep"><i class="fas fa-chevron-right"></i></span>
      <span style="color:var(--text-dark);font-weight:600;">Dashboard</span>
    </nav>

    @if (stats(); as s) {
      <!-- ═══ SECTION 1: Dashboard Overview ═══ -->
      <div class="oh-s1">
        <div class="oh-s1-left">
          <div class="oh-card oh-header-card">
            <div class="oh-header-top">
              <div>
                <div class="oh-header-title">One Health Dashboard</div>
                <div class="oh-header-sub">Here's what's happening across all sectors right now</div>
              </div>
              <button type="button" class="oh-btn-report" (click)="reportModal.open()">
                <i class="fas fa-plus"></i> Report New Event
              </button>
            </div>
            <div class="oh-header-divider"></div>
            <div class="oh-pills">
              <div class="oh-pill">
                <div class="oh-pill-icon green"><i class="fas fa-heartbeat"></i></div>
                <div class="oh-pill-text"><strong>{{ s.active_events }} active events</strong><span>Awaiting review</span></div>
              </div>
              <div class="oh-pill">
                <div class="oh-pill-icon orange"><i class="fas fa-gavel"></i></div>
                <div class="oh-pill-text"><strong>{{ s.directive_issued }} directives</strong><span>Pending response</span></div>
              </div>
              <div class="oh-pill">
                <div class="oh-pill-icon red"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="oh-pill-text"><strong>{{ s.overdue_directives }} overdue</strong><span>Past deadline</span></div>
              </div>
            </div>
          </div>

          <div class="oh-card oh-chart-card">
            <div class="oh-chart-head">
              <div>
                <div class="oh-chart-title">Event Trends</div>
                <div class="oh-chart-sub">Events reported across all sectors</div>
              </div>
              <div class="oh-chart-meta">
                <div class="oh-chart-period">{{ s.trend_start }} - {{ s.trend_end }} <i class="fas fa-calendar-alt"></i></div>
                <div class="oh-legend">
                  <div class="oh-legend-item"><span class="oh-legend-dot events"></span> Events</div>
                  <div class="oh-legend-item"><span class="oh-legend-dot directives"></span> Directives</div>
                </div>
              </div>
            </div>
            <div class="oh-chart-canvas"><canvas #trendChart></canvas></div>
          </div>
        </div>

        <div class="oh-s1-right">
          <div class="oh-kpi-row">
            <div class="oh-card oh-kpi-card">
              <div class="oh-kpi-head">
                <div class="oh-kpi-left">
                  <div>
                    <span class="oh-kpi-title">Total Events</span>
                    @if (eventsChange() !== 0) {
                      <span class="oh-kpi-badge" [class]="eventsChange() > 0 ? 'oh-kpi-badge up' : 'oh-kpi-badge down'">{{ eventsChange() > 0 ? '+' : '' }}{{ eventsChange() }}%</span>
                    } @else { <span class="oh-kpi-badge neutral">0%</span> }
                  </div>
                  <div class="oh-kpi-sub">Last 7 days</div>
                </div>
                <div class="oh-kpi-value">{{ s.events_7d }}</div>
              </div>
              <div class="oh-kpi-spark"><canvas #sparkBars></canvas></div>
            </div>
            <div class="oh-card oh-kpi-card">
              <div class="oh-kpi-head">
                <div class="oh-kpi-left">
                  <div>
                    <span class="oh-kpi-title">New This Month</span>
                    @if (monthChange() !== 0) {
                      <span class="oh-kpi-badge" [class]="monthChange() > 0 ? 'oh-kpi-badge up' : 'oh-kpi-badge down'">{{ monthChange() > 0 ? '+' : '' }}{{ monthChange() }}%</span>
                    } @else { <span class="oh-kpi-badge neutral">0%</span> }
                  </div>
                  <div class="oh-kpi-sub">{{ s.current_month_name }}</div>
                </div>
                <div class="oh-kpi-value">{{ s.new_events_this_month }}</div>
              </div>
              <div class="oh-kpi-spark"><canvas #sparkLine></canvas></div>
            </div>
          </div>

          <div class="oh-kpi-row" style="flex:1;">
            <div class="oh-card oh-mini-card">
              <div class="oh-mini-head">
                <div class="oh-mini-title">Events by Status</div>
                <div class="oh-mini-sub">All time</div>
              </div>
              <div class="oh-mini-chart">
                <canvas #statusDoughnut></canvas>
                <div class="oh-doughnut-center">{{ activePercent() }}%</div>
              </div>
              <div class="oh-mini-legend">
                <div class="oh-mini-legend-item">
                  <div class="label-group"><span class="oh-mini-legend-dot" style="background:#0891b2;"></span> Active</div>
                  <span class="pct">{{ activePercent() }}%</span>
                </div>
                <div class="oh-mini-legend-item">
                  <div class="label-group"><span class="oh-mini-legend-dot" style="background:#a5f3fc;"></span> Monitoring</div>
                  <span class="pct">{{ monitoringPercent() }}%</span>
                </div>
                <div class="oh-mini-legend-item">
                  <div class="label-group"><span class="oh-mini-legend-dot" style="background:#0e7490;"></span> Closed</div>
                  <span class="pct">{{ resolutionRate() }}%</span>
                </div>
              </div>
            </div>
            <div class="oh-card oh-mini-card">
              <div class="oh-mini-head">
                <div class="oh-mini-title">Resolution Rate</div>
                <div class="oh-mini-sub">All time</div>
              </div>
              <div class="oh-mini-chart">
                <canvas #resolutionGauge></canvas>
                <div class="oh-gauge-center">
                  <div class="gauge-val">{{ resolutionRate() }}%</div>
                  <div class="gauge-label">Resolved</div>
                </div>
              </div>
              <div class="oh-mini-legend">
                <div class="oh-mini-legend-item">
                  <div class="label-group"><span class="oh-mini-legend-dot" style="background:#0891b2;"></span> Resolved</div>
                  <span class="pct">{{ resolutionRate() }}%</span>
                </div>
                <div class="oh-mini-legend-item">
                  <div class="label-group"><span class="oh-mini-legend-dot" style="background:#e5e7eb;"></span> Pending</div>
                  <span class="pct">{{ 100 - resolutionRate() }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- EW Alerts Indicator (link fixed: event_type=ew_alert — issues OH-9) -->
      @if (s.ew_alerts_active > 0) {
        <div class="oh-ew-banner">
          <i class="fas fa-exclamation-circle"></i>
          <div class="ew-text">{{ s.ew_alerts_active }} Active Early Warning Cross-Sector Alert(s)</div>
          <a routerLink="/m/one-health/events" [queryParams]="{ event_type: 'ew_alert' }">View Alerts <i class="fas fa-arrow-right" style="font-size:0.6rem;margin-left:0.2rem;"></i></a>
        </div>
      }

      <!-- ═══ SECTION 2: Recent Events Table ═══ -->
      <div class="oh-card oh-events-card">
        <div class="oh-events-header">
          <div>
            <div class="oh-events-title">Recent Events</div>
            <div class="oh-events-sub">Events reported across all sectors</div>
          </div>
          <div class="oh-events-actions">
            <div class="oh-search-box">
              <i class="fas fa-search"></i>
              <input type="text" placeholder="Search..." [ngModel]="recentSearch()" (ngModelChange)="recentSearch.set($event)">
            </div>
            <select class="oh-filter-select" [ngModel]="recentStatus()" (ngModelChange)="recentStatus.set($event)">
              <option value="">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="directive_issued">Directive Issued</option>
              <option value="disseminated">Disseminated</option>
              <option value="monitoring">Monitoring</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table class="oh-table">
            <thead>
              <tr>
                <th>Event <i class="fas fa-sort sort-icon"></i></th>
                <th>Reporter <i class="fas fa-sort sort-icon"></i></th>
                <th>Priority <i class="fas fa-sort sort-icon"></i></th>
                <th>Description <i class="fas fa-sort sort-icon"></i></th>
                <th>Status <i class="fas fa-sort sort-icon"></i></th>
                <th>Time <i class="fas fa-sort sort-icon"></i></th>
                <th style="width:80px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (event of filteredRecent(); track event.id) {
                <tr>
                  <td>
                    <div class="oh-event-cell">
                      <div class="oh-event-icon" [class]="'oh-event-icon ' + (event.area_category || 'default')">
                        <i class="fas" [class]="'fas ' + categoryIcon(event.area_category)"></i>
                      </div>
                      <div class="oh-event-info">
                        <a [routerLink]="['/m/one-health/events', event.id]" class="eid">{{ event.event_id }}</a>
                        <div class="etitle" [title]="event.event_title">{{ limit(event.event_title, 30) }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="oh-reporter-cell">
                      <div class="oh-reporter-avatar">{{ (event.stakeholder_organization || 'U').charAt(0).toUpperCase() }}</div>
                      <span class="oh-reporter-name">{{ limit(event.stakeholder_organization || 'Unknown', 22) }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="oh-priority" [class]="'oh-priority ' + (event.priority_level || 'medium')">
                      @for (i of [0, 1, 2, 3, 4]; track i) {
                        <span class="dot" [class.empty]="i >= priorityFilled(event.priority_level)"></span>
                      }
                    </div>
                  </td>
                  <td>
                    <div class="oh-desc-text">
                      {{ limit(event.event_description, 75) }}
                      @if ((event.event_description || '').length > 75) {
                        <a [routerLink]="['/m/one-health/events', event.id]" class="oh-see-more">See more</a>
                      }
                    </div>
                  </td>
                  <td>
                    <span class="oh-status-pill" [class]="'oh-status-pill ' + statusPill(event.status)">
                      {{ event.status_label }} <i class="fas" [class]="'fas ' + statusIcon(event.status)"></i>
                    </span>
                  </td>
                  <td><span class="oh-time-cell">{{ event.created_at_relative }}</span></td>
                  <td>
                    <div class="oh-row-actions">
                      <a [routerLink]="['/m/one-health/events', event.id]" class="oh-row-action" title="View"><i class="fas fa-eye"></i></a>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" style="text-align:center;padding:2.5rem 1rem;color:var(--text-light);">
                    <i class="fas fa-clipboard-list" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;opacity:0.5;"></i>
                    No events reported yet.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="oh-table-footer">
          <div>
            1 to {{ min(s.recent_events.length, 6) }} items of {{ s.total_events }}
            &nbsp;
            <a routerLink="/m/one-health/events">View all <i class="fas fa-chevron-right" style="font-size:0.5rem;"></i></a>
          </div>
          <div class="oh-nav-links">
            <span class="disabled">Previous</span>
            <a routerLink="/m/one-health/events">Next <i class="fas fa-chevron-right" style="font-size:0.5rem;"></i></a>
          </div>
        </div>
      </div>

      <!-- ═══ SECTION 2B: Top Regions by Events ═══ -->
      <div class="oh-card oh-regions-card">
        <div class="oh-regions-grid">
          <div class="oh-regions-left">
            <div class="oh-regions-title">Top Regions by Events</div>
            <div class="oh-regions-sub">Where most health events are reported</div>
            <div class="oh-sum-row">
              <div class="oh-sum-col"><div class="col-head">Region <i class="fas fa-sort sort-icon"></i></div></div>
              <div class="oh-sum-col"><div class="col-head">Events <i class="fas fa-sort sort-icon"></i></div><div class="col-val">{{ totalRegionEvents() }}</div></div>
              <div class="oh-sum-col"><div class="col-head">Active <i class="fas fa-sort sort-icon"></i></div><div class="col-val">{{ totalRegionActive() }}</div></div>
              <div class="oh-sum-col"><div class="col-head">Closed <i class="fas fa-sort sort-icon"></i></div><div class="col-val">{{ totalRegionClosed() }}</div></div>
              <div class="oh-sum-col"><div class="col-head">Resolution <i class="fas fa-sort sort-icon"></i></div><div class="col-val">{{ overallResRate() }}%</div></div>
            </div>
            @for (r of s.region_stats; track r.region_id; let idx = $index) {
              <div class="oh-region-row">
                <div class="oh-region-name">
                  <span class="oh-region-num">{{ idx + 1 }}.</span>
                  <span class="oh-region-dot"></span>
                  {{ r.name }}
                </div>
                <div class="oh-region-stat"><strong>{{ r.total_events }}</strong> <span class="pct">({{ pct(r.total_events, totalRegionEvents()) }}%)</span></div>
                <div class="oh-region-stat">{{ r.active_count }} <span class="pct">({{ pct(r.active_count, totalRegionEvents()) }}%)</span></div>
                <div class="oh-region-stat">{{ r.closed_count }} <span class="pct">({{ pct(r.closed_count, totalRegionEvents()) }}%)</span></div>
                <div class="oh-region-stat oh-region-rate">{{ pct(r.closed_count, r.total_events) }}%</div>
              </div>
            } @empty {
              <div style="padding:2rem 0;text-align:center;color:var(--text-light);font-size:0.82rem;">
                <i class="fas fa-map-marked-alt" style="font-size:1.2rem;display:block;margin-bottom:0.5rem;opacity:0.4;"></i>
                No regional data available yet.
              </div>
            }
            <div class="oh-regions-footer">
              <span>1 to {{ s.region_stats.length }} items of {{ s.region_stats.length }}</span>
              <div style="display:flex;gap:0.5rem;">
                <span class="disabled" style="font-size:0.72rem;color:var(--text-light);">Previous</span>
                <a routerLink="/m/one-health/events" class="nav-link">Next <i class="fas fa-chevron-right" style="font-size:0.45rem;"></i></a>
              </div>
            </div>
          </div>
          <div class="oh-regions-right">
            <div #regionsMap class="oh-map-container"></div>
          </div>
        </div>
      </div>
    }

    <oh-report-event-modal #reportModal (created)="load()" />
  `,
})
export class OhDashboardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  readonly reportModal = viewChild.required(OhReportEventModalComponent);
  private trendChart = viewChild<ElementRef<HTMLCanvasElement>>('trendChart');
  private sparkBars = viewChild<ElementRef<HTMLCanvasElement>>('sparkBars');
  private sparkLine = viewChild<ElementRef<HTMLCanvasElement>>('sparkLine');
  private statusDoughnut = viewChild<ElementRef<HTMLCanvasElement>>('statusDoughnut');
  private resolutionGauge = viewChild<ElementRef<HTMLCanvasElement>>('resolutionGauge');
  private regionsMap = viewChild<ElementRef<HTMLDivElement>>('regionsMap');

  stats = signal<DashboardStats | null>(null);
  recentSearch = signal('');
  recentStatus = signal('');

  private charts: any[] = [];
  private map: any = null;

  /** Tanzania region approximate centroids — verbatim from the Blade script. */
  private readonly regionCoords: Record<string, [number, number]> = {
    'Arusha': [-3.39, 36.68], 'Dar es Salaam': [-6.79, 39.21], 'Dodoma': [-6.16, 35.75], 'Geita': [-2.87, 32.23],
    'Iringa': [-7.77, 35.69], 'Kagera': [-1.50, 31.50], 'Katavi': [-6.50, 31.00], 'Kigoma': [-4.88, 29.63],
    'Kilimanjaro': [-3.07, 37.36], 'Lindi': [-10.00, 39.70], 'Manyara': [-4.32, 36.37], 'Mara': [-1.75, 34.00],
    'Mbeya': [-8.90, 33.45], 'Morogoro': [-6.82, 37.66], 'Mtwara': [-10.27, 40.18], 'Mwanza': [-2.52, 32.92],
    'Njombe': [-9.33, 34.77], 'Kaskazini Pemba': [-4.92, 39.70], 'Kusini Pemba': [-5.27, 39.74], 'Pwani': [-7.32, 38.82],
    'Rukwa': [-8.00, 31.50], 'Ruvuma': [-10.50, 35.50], 'Shinyanga': [-3.65, 33.42], 'Simiyu': [-2.63, 34.15],
    'Singida': [-4.82, 34.75], 'Songwe': [-8.95, 32.75], 'Tabora': [-5.02, 32.80], 'Tanga': [-5.07, 39.10],
    // Canonical Zanzibar region names (were 'Unguja North/South', 'Pemba North/South', 'Zanzibar' → never matched API)
    'Kaskazini Unguja': [-5.93, 39.30], 'Kusini Unguja': [-6.32, 39.41], 'Mjini Magharibi': [-6.16, 39.20],
  };

  // ── derived figures (the Blade's @php block) ──

  eventsChange = computed(() => {
    const s = this.stats();
    if (!s) { return 0; }
    if (s.events_prev_7d > 0) { return Math.round(((s.events_7d - s.events_prev_7d) / s.events_prev_7d) * 1000) / 10; }
    return s.events_7d > 0 ? 100 : 0;
  });

  monthChange = computed(() => {
    const s = this.stats();
    if (!s) { return 0; }
    if (s.new_events_last_month > 0) { return Math.round(((s.new_events_this_month - s.new_events_last_month) / s.new_events_last_month) * 1000) / 10; }
    return s.new_events_this_month > 0 ? 100 : 0;
  });

  resolutionRate = computed(() => {
    const s = this.stats();
    return s && s.total_events > 0 ? Math.round((s.closed / s.total_events) * 100) : 0;
  });

  /** Includes Monitoring, exactly as the Blade's $activeTotal does. */
  activePercent = computed(() => {
    const s = this.stats();
    if (!s || s.total_events === 0) { return 0; }
    const b = s.events_by_status;
    const active = (b['Submitted'] ?? 0) + (b['Under Review'] ?? 0) + (b['Directive Issued'] ?? 0) + (b['Disseminated'] ?? 0) + (b['Monitoring'] ?? 0);
    return Math.round((active / s.total_events) * 100);
  });

  monitoringPercent = computed(() => {
    const s = this.stats();
    return s && s.total_events > 0 ? Math.round((s.monitoring / s.total_events) * 100) : 0;
  });

  totalRegionEvents = computed(() => (this.stats()?.region_stats ?? []).reduce((a, r) => a + r.total_events, 0));
  totalRegionActive = computed(() => (this.stats()?.region_stats ?? []).reduce((a, r) => a + r.active_count, 0));
  totalRegionClosed = computed(() => (this.stats()?.region_stats ?? []).reduce((a, r) => a + r.closed_count, 0));
  overallResRate = computed(() => this.pct(this.totalRegionClosed(), this.totalRegionEvents()));

  filteredRecent = computed(() => {
    const s = this.stats();
    if (!s) { return []; }
    const term = this.recentSearch().toLowerCase();
    const status = this.recentStatus();
    return s.recent_events.filter(e => {
      const haystack = [e.event_id, e.event_title, e.stakeholder_organization, e.region_name].join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (!status || e.status === status);
    });
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
    this.map?.remove();
  }

  load(): void {
    this.http.get<DashboardStats>('/api/v1/onehealth/dashboard').subscribe(s => {
      this.stats.set(s);
      ensureChartJs().then(() => setTimeout(() => this.renderCharts(s), 50));
      setTimeout(() => this.renderMap(s), 80);
    });
  }

  // ── charts (options verbatim from the Blade script) ──

  private renderCharts(s: DashboardStats): void {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    const OH_TEAL = '#0891b2';
    const OH_TEAL_LT = '#a5f3fc';
    const OH_DARK = '#0e7490';
    const OH_BG = 'rgba(8,145,178,0.08)';
    const OH_BG2 = 'rgba(165,243,252,0.15)';
    const GRAY_LIGHT = '#e5e7eb';

    const sparkBars = this.sparkBars()?.nativeElement;
    if (sparkBars) {
      this.charts.push(new Chart(sparkBars, {
        type: 'bar',
        data: { labels: ['', '', '', '', '', '', ''], datasets: [{ data: s.daily_events_7d, backgroundColor: OH_TEAL, borderRadius: 3, barThickness: 6, maxBarThickness: 8 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
          animation: { duration: 800, easing: 'easeOutQuart' },
        },
      }));
    }

    const sparkLine = this.sparkLine()?.nativeElement;
    if (sparkLine) {
      const recentMonths = s.monthly_events.slice(-7);
      this.charts.push(new Chart(sparkLine, {
        type: 'line',
        data: { labels: recentMonths.map(() => ''), datasets: [{ data: recentMonths, borderColor: OH_TEAL, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 0, tension: 0.4, fill: false }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
          animation: { duration: 800, easing: 'easeOutQuart' },
        },
      }));
    }

    const trend = this.trendChart()?.nativeElement;
    if (trend) {
      this.charts.push(new Chart(trend, {
        type: 'line',
        data: {
          labels: s.month_labels,
          datasets: [
            { label: 'Events', data: s.monthly_events, borderColor: OH_TEAL, backgroundColor: OH_BG, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: OH_TEAL, pointBorderColor: '#fff', pointBorderWidth: 2, pointHoverRadius: 5, tension: 0.35, fill: true },
            { label: 'Directives', data: s.monthly_directives, borderColor: OH_TEAL_LT, backgroundColor: OH_BG2, borderWidth: 2, borderDash: [5, 4], pointRadius: 2, pointBackgroundColor: OH_TEAL_LT, pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 4, tension: 0.35, fill: true },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#fff', titleColor: '#111827', bodyColor: '#4b5563', borderColor: '#e5e7eb', borderWidth: 1, cornerRadius: 10, padding: 10, titleFont: { family: 'Inter', weight: '700', size: 12 }, bodyFont: { family: 'Inter', size: 11 }, boxPadding: 4, usePointStyle: true },
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Inter', size: 11, weight: '500' }, color: '#9ca3af', padding: 8 }, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, border: { display: false } },
            x: { ticks: { font: { family: 'Inter', size: 11, weight: '600' }, color: '#9ca3af', padding: 4 }, grid: { display: false }, border: { display: false } },
          },
          animation: { duration: 1000, easing: 'easeOutQuart' },
        },
      }));
    }

    const doughnut = this.statusDoughnut()?.nativeElement;
    if (doughnut) {
      const b = s.events_by_status;
      const activeSum = (b['Submitted'] ?? 0) + (b['Under Review'] ?? 0) + (b['Directive Issued'] ?? 0) + (b['Disseminated'] ?? 0);
      this.charts.push(new Chart(doughnut, {
        type: 'doughnut',
        data: { labels: ['Active', 'Monitoring', 'Closed'], datasets: [{ data: [activeSum, b['Monitoring'] ?? 0, b['Closed'] ?? 0], backgroundColor: [OH_TEAL, OH_TEAL_LT, OH_DARK], borderWidth: 0, hoverOffset: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#fff', titleColor: '#111827', bodyColor: '#4b5563', borderColor: '#e5e7eb', borderWidth: 1, cornerRadius: 8, padding: 8, titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' } },
          },
          animation: { animateRotate: true, duration: 800 },
        },
      }));
    }

    const gauge = this.resolutionGauge()?.nativeElement;
    if (gauge) {
      this.charts.push(new Chart(gauge, {
        type: 'doughnut',
        data: { labels: ['Resolved', 'Pending'], datasets: [{ data: [this.resolutionRate(), 100 - this.resolutionRate()], backgroundColor: [OH_TEAL, GRAY_LIGHT], borderWidth: 0, hoverOffset: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false, circumference: 180, rotation: -90, cutout: '75%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          animation: { animateRotate: true, duration: 1000, easing: 'easeOutQuart' },
        },
      }));
    }
  }

  // ── Tanzania regions map (verbatim behavior from the Blade script) ──

  private renderMap(s: DashboardStats): void {
    const el = this.regionsMap()?.nativeElement;
    if (!el || typeof L === 'undefined') { return; }
    this.map?.remove();

    const map = L.map(el, {
      center: [-6.5, 35.0], zoom: 6, minZoom: 5, maxZoom: 14,
      maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0,
      scrollWheelZoom: false, zoomControl: true, attributionControl: false,
    });
    this.map = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    addMapNav(this.map, { home: [-6.5, 35.0, 6] });

    map.createPane('maskPane');
    map.getPane('maskPane').style.zIndex = 250;
    map.getPane('maskPane').style.pointerEvents = 'none';

    fetch('/geojson/tz_boundary_simple.geojson')
      .then(r => r.json())
      .then(data => {
        const world = [[-90, -180], [90, -180], [90, 180], [-90, 180], [-90, -180]];
        const holes: any[] = [];
        data.features.forEach((f: any) => {
          const g = f.geometry;
          if (g.type === 'MultiPolygon') { g.coordinates.forEach((p: any) => holes.push(p[0].map((c: any) => [c[1], c[0]]))); }
          else if (g.type === 'Polygon') { holes.push(g.coordinates[0].map((c: any) => [c[1], c[0]])); }
        });
        L.polygon([world].concat(holes), { pane: 'maskPane', fillColor: '#e8edf2', fillOpacity: 0.7, stroke: false }).addTo(map);
      }).catch(() => {});

    fetch('/geojson/tz_lakes.geojson')
      .then(r => r.json())
      .then(data => {
        L.geoJSON(data, {
          style: () => ({ fillColor: '#1976D2', fillOpacity: 0.45, color: '#42A5F5', weight: 1.2, opacity: 0.8 }),
          onEachFeature: (f: any, layer: any) => {
            if (f.properties.name) { layer.bindTooltip(f.properties.name, { permanent: true, direction: 'center', className: 'lake-label' }); }
          },
        }).addTo(map);
      }).catch(() => {});

    const regionEventMap: Record<string, RegionStat> = {};
    s.region_stats.forEach(r => { regionEventMap[r.name.toUpperCase()] = r; });

    let districtLayer: any = null;
    let wardLayer: any = null;
    let selectedRegion: any = null;
    let selectedRegionName = '';

    const regionNormal = (rName: string) => {
      const st = regionEventMap[rName];
      if (st) {
        const intensity = Math.min(st.total_events / 5, 1);
        return { fillColor: '#0891b2', fillOpacity: 0.1 + intensity * 0.25, color: 'rgba(8,145,178,0.4)', weight: 1.5, opacity: 0.8 };
      }
      return { fillColor: '#003366', fillOpacity: 0.06, color: 'rgba(0,51,102,0.3)', weight: 1, opacity: 0.8 };
    };

    const safeName = (n: string) => n.replace(/ /g, '_').replace(/\//g, '_').replace(/'/g, '');

    const loadWards = (regionSafe: string, districtSafe: string) => {
      if (wardLayer) { map.removeLayer(wardLayer); wardLayer = null; }
      fetch(`/geojson/adm3_ward/by_district/${regionSafe}__${districtSafe}.geojson`)
        .then(r => r.json())
        .then(data => {
          wardLayer = L.geoJSON(data, {
            style: () => ({ fillColor: '#003366', fillOpacity: 0.03, color: 'rgba(0,51,102,0.2)', weight: 0.6, dashArray: '2 2' }),
            onEachFeature: (_f: any, layer: any) => {
              layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.08, weight: 1 }));
              layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.03, weight: 0.6 }));
            },
          }).addTo(map);
        }).catch(() => {});
    };

    const loadDistricts = (regionName: string) => {
      if (districtLayer) { map.removeLayer(districtLayer); districtLayer = null; }
      if (wardLayer) { map.removeLayer(wardLayer); wardLayer = null; }
      fetch(`/geojson/adm2_district/by_region/${safeName(regionName)}.geojson`)
        .then(r => r.json())
        .then(data => {
          districtLayer = L.geoJSON(data, {
            style: () => ({ fillColor: '#003366', fillOpacity: 0.04, color: 'rgba(0,51,102,0.25)', weight: 0.8, opacity: 0.6, dashArray: '4 3' }),
            onEachFeature: (f: any, layer: any) => {
              const dName = f.properties.dist_name || f.properties.ADM2_EN || f.properties.name || 'District';
              layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.1, weight: 1.5, dashArray: '' }));
              layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.04, weight: 0.8, dashArray: '4 3' }));
              layer.on('click', () => {
                map.fitBounds(layer.getBounds(), { padding: [30, 30], animate: true });
                loadWards(safeName(regionName), safeName(dName));
              });
            },
          }).addTo(map);
        }).catch(() => {});
    };

    fetch('/geojson/adm1_region/adm1.geojson')
      .then(r => r.json())
      .then(data => {
        let delay = 0;
        L.geoJSON(data, {
          style: (f: any) => {
            const rName = (f.properties.reg_name || f.properties.ADM1_EN || f.properties.name || '').toUpperCase();
            return { ...regionNormal(rName), fillOpacity: 0, opacity: 0 };
          },
          onEachFeature: (feature: any, layer: any) => {
            const rName = (feature.properties.reg_name || feature.properties.ADM1_EN || feature.properties.name || '').toUpperCase();
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.12, weight: 2 }));
            layer.on('mouseout', () => {
              if (!layer._selected) {
                const st = regionNormal(rName);
                layer.setStyle({ fillOpacity: st.fillOpacity, weight: st.weight });
              }
            });
            layer.on('click', () => {
              if (selectedRegion && selectedRegion !== layer) {
                selectedRegion._selected = false;
                const ps = regionNormal(selectedRegionName);
                selectedRegion.setStyle({ fillOpacity: ps.fillOpacity, weight: ps.weight });
              }
              layer._selected = true;
              selectedRegion = layer;
              selectedRegionName = rName;
              layer.setStyle({ fillOpacity: 0.15, weight: 2, opacity: 1 });
              map.fitBounds(layer.getBounds(), { padding: [40, 40], animate: true, duration: 0.5 });
              loadDistricts(feature.properties.reg_name || feature.properties.ADM1_EN || feature.properties.name || '');
            });
            setTimeout(() => {
              const st = regionNormal(rName);
              layer.setStyle({ fillOpacity: st.fillOpacity, opacity: st.opacity });
            }, 80 + delay);
            delay += 60;
          },
        }).addTo(map);
      }).catch(() => {});

    map.on('dblclick', () => {
      if (wardLayer) { map.removeLayer(wardLayer); wardLayer = null; }
      if (districtLayer) { map.removeLayer(districtLayer); districtLayer = null; }
      if (selectedRegion) {
        selectedRegion._selected = false;
        const st = regionNormal(selectedRegionName);
        selectedRegion.setStyle({ fillOpacity: st.fillOpacity, weight: st.weight });
        selectedRegion = null;
      }
      map.setView([-6.5, 35.0], 6, { animate: true });
    });

    s.region_stats.forEach(region => {
      const coords = this.regionCoords[region.name];
      if (!coords) { return; }
      const count = region.total_events;
      const radius = Math.max(12, Math.min(28, 10 + count * 2.5));
      const marker = L.circleMarker(coords, {
        radius, fillColor: region.active_count > 0 ? '#ff7800' : '#0891b2',
        color: '#fff', weight: 2.5, fillOpacity: 0.88,
      }).addTo(map);
      const label = L.divIcon({
        className: 'oh-map-label',
        html: `<div style="width:${radius * 2}px;height:${radius * 2}px;display:flex;align-items:center;justify-content:center;font-size:${count > 99 ? 10 : 11}px;font-weight:800;color:#fff;font-family:Inter,sans-serif;pointer-events:none;">${count}</div>`,
        iconSize: [radius * 2, radius * 2], iconAnchor: [radius, radius],
      });
      L.marker(coords, { icon: label, interactive: false }).addTo(map);
      marker.bindTooltip(`<strong>${region.name}</strong><br>${count} event${count !== 1 ? 's' : ''} (${region.active_count} active)`,
        { direction: 'top', offset: [0, -radius], className: 'oh-map-tooltip' });
    });

    setTimeout(() => map.invalidateSize(), 500);
  }

  // ── helpers ──

  categoryIcon(category: string | null): string {
    return ({ health: 'fa-heartbeat', environmental: 'fa-leaf', agriculture: 'fa-seedling', food_safety: 'fa-utensils' } as Record<string, string>)[category ?? ''] ?? 'fa-clipboard-list';
  }

  priorityFilled(priority: string | null): number {
    return ({ high: 4, medium: 3, low: 1 } as Record<string, number>)[priority ?? 'medium'] ?? 2;
  }

  statusPill(status: string): string {
    return ({
      submitted: 'st-active', under_review: 'st-pending', directive_issued: 'st-approved',
      disseminated: 'st-approved', monitoring: 'st-pending', closed: 'st-closed', archived: 'st-closed',
    } as Record<string, string>)[status] ?? 'st-pending';
  }

  statusIcon(status: string): string {
    return ({
      submitted: 'fa-paper-plane', under_review: 'fa-clock', directive_issued: 'fa-check-circle',
      disseminated: 'fa-check-circle', monitoring: 'fa-binoculars', closed: 'fa-lock', archived: 'fa-archive',
    } as Record<string, string>)[status] ?? 'fa-circle';
  }

  pct(part: number, total: number): number {
    return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
  }

  min(a: number, b: number): number {
    return Math.min(a, b);
  }

  limit(s: string | null | undefined, max: number): string {
    if (!s) { return ''; }
    return s.length <= max ? s : s.substring(0, max).trimEnd() + '...';
  }
}

/** Loads Chart.js 4.4.0 from the CDN the Blade layout pushes, once. */
let chartJsPromise: Promise<void> | null = null;
function ensureChartJs(): Promise<void> {
  if (typeof Chart !== 'undefined') {
    return Promise.resolve();
  }
  if (!chartJsPromise) {
    chartJsPromise = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}
