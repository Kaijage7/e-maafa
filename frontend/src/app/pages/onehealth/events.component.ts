import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { OhReportEventModalComponent } from './report-event-modal.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface EventRow {
  id: number; event_id: string; event_title: string | null; event_type: string;
  event_description: string | null; status: string; status_label: string;
  priority_level: string | null; risk_level: string | null; date_of_occurrence: string | null;
  area_of_concern_id: number | null; area_name: string | null;
  stakeholder_organization: string | null; stakeholder_name: string | null;
  region_name: string | null; district_name: string | null; ward_name: string | null;
  directives_count: number; disseminations_count: number; action_trackings_count: number;
  completed_actions: number; unacknowledged_directives: number; can_edit: boolean;
}
interface IndexResponse {
  data: EventRow[]; currentPage: number; lastPage: number; total: number;
  firstItem: number | null; lastItem: number | null;
  stats: { total: number; submitted: number; under_review: number; directive_issued: number; monitoring: number; closed: number; active: number };
}
interface FormData {
  areas: { id: number; name: string; code: string; category: string }[];
  regions: { id: number; name: string }[];
  statuses: Record<string, string>;
  institutions: { id: number; organization: string; name: string }[];
  hazards: { id: number; name: string; type: string }[];
}
/**
 * Reproduction of onehealth/events/index.blade.php (2406 lines): KPI strip, smart filter bar
 * with chips, events registry table with kebab menus, Quick Preview offcanvas, Issue Directive
 * modal. The 4-step Report Event modal lives in OhReportEventModalComponent (shared with the
 * dashboard, as the Blade partial is @included by both).
 *
 * OH-6 invariant kept: events lock after submission (no edit path).
 */
@Component({
  selector: 'page-oh-events',
  standalone: true,
  imports: [FormsModule, RouterLink, OhReportEventModalComponent],
  styles: [`
    :host { display: block; }
    /* Breadcrumb */
    .ohe-breadcrumb { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem; }
    .ohe-breadcrumb a { color: var(--text-mid); text-decoration: none; }
    .ohe-breadcrumb a:hover { color: var(--primary); }
    .ohe-breadcrumb .sep { font-size: 0.55rem; }
    .ohe-breadcrumb .current { color: var(--text-dark); font-weight: 600; }
    /* Page Header */
    .ohe-page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; gap: 1rem; flex-wrap: wrap; }
    .ohe-title { font-size: 1.4rem; font-weight: 800; color: var(--text-dark); letter-spacing: -0.5px; line-height: 1.2; margin: 0; }
    .ohe-subtitle { font-size: 0.82rem; color: var(--text-light); font-weight: 500; margin: 0.15rem 0 0; }
    .ohe-btn-primary { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.15rem; border-radius: 6px; background: #0891b2; color: #fff; font-size: 0.82rem; font-weight: 600; border: none; cursor: pointer; font-family: inherit; white-space: nowrap; }
    .ohe-btn-primary:hover { background: #0e7490; }
    .ohe-btn-primary i { font-size: 0.7rem; }
    /* KPI Strip */
    .ohe-kpi-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.65rem; margin-bottom: 1rem; }
    .ohe-kpi { display: flex; align-items: center; gap: 0.65rem; padding: 0.85rem 0.9rem; background: #fff; border-radius: 6px; border: 2px solid var(--line, #e2e8f0); text-decoration: none; position: relative; overflow: hidden; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .ohe-kpi:hover { background: #f8fafc; border-color: #cbd5e1; }
    .ohe-kpi.active { border-color: var(--kpi-color); background: #fff; }
    .ohe-kpi-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; background: color-mix(in srgb, var(--kpi-color) 12%, transparent); color: var(--kpi-color); transition: all 0.25s; }
    .ohe-kpi.active .ohe-kpi-icon { background: var(--kpi-color); color: #fff; box-shadow: 0 3px 10px color-mix(in srgb, var(--kpi-color) 30%, transparent); }
    .ohe-kpi-body { display: flex; flex-direction: column; min-width: 0; }
    .ohe-kpi-val { font-size: 1.35rem; font-weight: 800; color: var(--text-dark); line-height: 1; letter-spacing: -0.3px; }
    .ohe-kpi-label { font-size: 0.68rem; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.3px; margin-top: 0.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ohe-kpi-accent { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: var(--kpi-color); transform: scaleX(0); transform-origin: left; transition: transform 0.3s ease; }
    .ohe-kpi.active .ohe-kpi-accent { transform: scaleX(1); }
    .ohe-kpi:hover .ohe-kpi-accent { transform: scaleX(0.5); }
    .ohe-kpi.active:hover .ohe-kpi-accent { transform: scaleX(1); }
    /* Filter Card */
    .ohe-filter-card { background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 2px rgba(0,0,0,0.04); margin-bottom: 1rem; overflow: hidden; }
    .ohe-filter-main { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; }
    .ohe-search { flex: 1; display: flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.85rem; border-radius: 10px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.06); transition: all 0.2s; }
    .ohe-search:focus-within { background: #fff; border-color: #0891b2; box-shadow: 0 0 0 3px rgba(8,145,178,0.1); }
    .ohe-search i { font-size: 0.78rem; color: var(--text-light); flex-shrink: 0; }
    .ohe-search input { border: none; background: transparent; outline: none; width: 100%; font-size: 0.82rem; font-family: inherit; color: var(--text-dark); }
    .ohe-search input::placeholder { color: var(--text-light); }
    .ohe-search-clear { color: var(--text-light); font-size: 0.7rem; display: flex; align-items: center; padding: 2px; border-radius: 50%; transition: all 0.15s; cursor: pointer; background: none; border: none; }
    .ohe-search-clear:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
    .ohe-filter-toggle { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.85rem; border-radius: 10px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.06); font-size: 0.78rem; font-weight: 600; color: var(--text-mid); cursor: pointer; font-family: inherit; transition: all 0.2s; white-space: nowrap; }
    .ohe-filter-toggle:hover { background: rgba(0,0,0,0.06); color: var(--text-dark); }
    .ohe-filter-toggle.has-filters { color: #0891b2; border-color: rgba(8,145,178,0.2); background: rgba(8,145,178,0.05); }
    .ohe-filter-toggle i { font-size: 0.75rem; }
    .ohe-filter-badge { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #0891b2; color: #fff; font-size: 0.6rem; font-weight: 700; }
    .ohe-reset-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.75rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600; color: #ef4444; text-decoration: none; border: 1px solid rgba(239,68,68,0.15); background: rgba(239,68,68,0.04); transition: all 0.15s; white-space: nowrap; cursor: pointer; font-family: inherit; }
    .ohe-reset-btn:hover { background: rgba(239,68,68,0.1); }
    .ohe-reset-btn i { font-size: 0.65rem; }
    .ohe-advanced { max-height: 0; overflow: hidden; transition: max-height 0.35s ease, padding 0.35s ease; border-top: 1px solid transparent; padding: 0 0.85rem; }
    .ohe-advanced.open { max-height: 200px; padding: 0.65rem 0.85rem; border-top-color: rgba(0,0,0,0.05); }
    .ohe-filter-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem; }
    .ohe-filter-group { display: flex; flex-direction: column; gap: 0.2rem; }
    .ohe-filter-group label { font-size: 0.65rem; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.3px; display: flex; align-items: center; gap: 0.3rem; }
    .ohe-filter-group label i { font-size: 0.55rem; }
    .ohe-filter-group select, .ohe-filter-group input[type="date"] { padding: 0.38rem 0.55rem; border-radius: 8px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.08); font-size: 0.78rem; font-family: inherit; color: var(--text-dark); transition: border-color 0.2s; width: 100%; }
    .ohe-filter-group select:focus, .ohe-filter-group input[type="date"]:focus { outline: none; border-color: #0891b2; box-shadow: 0 0 0 2px rgba(8,145,178,0.1); }
    .ohe-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0 0.85rem 0.65rem; }
    .ohe-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.6rem; border-radius: 50px; background: rgba(8,145,178,0.08); border: 1px solid rgba(8,145,178,0.15); color: #0e7490; font-size: 0.72rem; font-weight: 600; text-decoration: none; transition: all 0.15s; cursor: pointer; font-family: inherit; }
    .ohe-chip:hover { background: rgba(8,145,178,0.15); }
    .ohe-chip i { font-size: 0.6rem; opacity: 0.6; }
    .ohe-chip .chip-x { font-size: 0.85rem; font-weight: 400; opacity: 0.5; margin-left: 0.15rem; transition: opacity 0.15s; }
    .ohe-chip:hover .chip-x { opacity: 1; color: #ef4444; }
    @media (max-width: 1200px) { .ohe-kpi-strip { grid-template-columns: repeat(3, 1fr); } .ohe-filter-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px) { .ohe-kpi-strip { grid-template-columns: repeat(2, 1fr); } .ohe-filter-grid { grid-template-columns: repeat(2, 1fr); } .ohe-page-head { flex-direction: column; align-items: flex-start; } .ohe-filter-main { flex-wrap: wrap; } }
    /* Panel + table (dmis-v2 r-table look) */
    .panel { background: #fff; border-radius: 14px; border: 1px solid var(--border, #e5e9f0); box-shadow: 0 1px 8px rgba(0,0,0,0.03); overflow: hidden; }
    .panel-head { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--border, #e5e9f0); }
    .panel-head .ph-title { font-size: 0.92rem; font-weight: 700; color: var(--text-dark); display: flex; align-items: center; gap: 0.5rem; }
    .panel-head .ph-title i { color: #0891b2; font-size: 0.85rem; }
    .panel-badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 50px; background: rgba(8,145,178,0.1); color: #0891b2; }
    .r-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .r-table thead th { text-align: left; padding: 0.6rem 0.9rem; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); border-bottom: 1px solid var(--border, #e5e9f0); background: #f8fafc; white-space: nowrap; }
    .r-table tbody td { padding: 0.65rem 0.9rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .r-table tbody tr:hover { background: #f8fafc; }
    .r-title { font-weight: 600; color: var(--text-dark); font-size: 0.83rem; }
    .r-subtitle { font-size: 0.72rem; color: var(--text-light); }
    .r-badge { display: inline-block; padding: 0.22rem 0.55rem; border-radius: 50px; font-size: 0.68rem; font-weight: 700; white-space: nowrap; }
    .badge-active { background: rgba(6,182,212,0.12); color: #0e7490; }
    .badge-pending { background: rgba(245,158,11,0.12); color: #b45309; }
    .badge-published { background: rgba(59,130,246,0.12); color: #1d4ed8; }
    .badge-approved { background: rgba(16,185,129,0.12); color: #047857; }
    .badge-inactive { background: rgba(100,116,139,0.12); color: #475569; }
    .badge-draft { background: rgba(30,41,59,0.1); color: #1e293b; }
    .badge-rejected { background: rgba(239,68,68,0.12); color: #b91c1c; }
    .empty-state { text-align: center; padding: 2.5rem 1rem; color: var(--text-light); font-size: 0.85rem; }
    .empty-state i { display: block; font-size: 1.8rem; margin-bottom: 0.5rem; opacity: 0.4; }
    .ew-row { border-left: 3px solid #f59e0b; background: rgba(245,158,11,0.03); }
    /* Context menu */
    .ctx-wrap { position: relative; display: inline-block; }
    .ctx-trigger { width: 28px; height: 28px; border: none; background: transparent; border-radius: 8px; color: var(--text-light); cursor: pointer; transition: all 0.15s; }
    .ctx-trigger:hover { background: rgba(0,0,0,0.05); color: var(--text-dark); }
    .ctx-menu { display: none; position: absolute; right: 0; top: 100%; z-index: 50; min-width: 200px; background: #fff; border-radius: 12px; border: 1px solid var(--border, #e5e9f0); box-shadow: 0 12px 36px rgba(0,0,0,0.12); padding: 4px; }
    .ctx-menu.open { display: block; }
    .ctx-menu-header { display: flex; align-items: center; justify-content: space-between; padding: 0.45rem 0.75rem; margin-bottom: 2px; border-bottom: 1px solid rgba(0,0,0,0.05); }
    .ctx-menu-label { font-size: 0.65rem; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; }
    .ctx-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; padding: 0.45rem 0.75rem; border: none; background: none; font-size: 0.78rem; font-family: inherit; color: var(--text-mid); border-radius: 8px; cursor: pointer; text-decoration: none; }
    .ctx-item:hover { background: rgba(8,145,178,0.06); color: var(--text-dark); }
    .ctx-item.warning { color: #b45309; }
    .ctx-item.warning:hover { background: rgba(245,158,11,0.08); }
    .ctx-item i { width: 14px; font-size: 0.7rem; }
    .ctx-divider { height: 1px; background: rgba(0,0,0,0.05); margin: 3px 6px; }
    /* Pagination */
    .pagination-wrap { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.1rem; font-size: 0.78rem; color: var(--text-light); }
    .page-links { display: flex; gap: 0.25rem; }
    .page-links a, .page-links span { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 8px; text-decoration: none; color: var(--text-mid); cursor: pointer; }
    .page-links a:hover { background: rgba(8,145,178,0.08); }
    .page-links span.active { background: #0891b2; color: #fff; font-weight: 700; }
    .page-links span.dim { opacity: 0.4; cursor: default; }
    /* Offcanvas (Quick Preview) */
    .ohe-oc-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 1090; opacity: 0; pointer-events: none; transition: opacity 0.25s; }
    .ohe-oc-backdrop.open { opacity: 1; pointer-events: auto; }
    .ohe-offcanvas { position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 100vw; background: #fff; z-index: 1095; box-shadow: -8px 0 40px rgba(0,0,0,0.08); display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.3s ease; }
    .ohe-offcanvas.open { transform: translateX(0); }
    .ohe-oc-header { background: #0e7490; padding: 1.15rem 1.25rem 0.85rem; color: #fff; }
    .ohe-oc-header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
    .ohe-oc-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; font-weight: 600; }
    .ohe-oc-title { font-size: 1rem; font-weight: 700; margin: 0.25rem 0 0; line-height: 1.3; }
    .ohe-oc-close { width: 32px; height: 32px; border-radius: 8px; border: none; background: rgba(255,255,255,0.15); color: #fff; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
    .ohe-oc-close:hover { background: rgba(255,255,255,0.3); }
    .ohe-oc-badges { display: flex; gap: 0.4rem; margin-top: 0.6rem; flex-wrap: wrap; }
    .ohe-oc-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.55rem; border-radius: 50px; font-size: 0.68rem; font-weight: 600; background: rgba(255,255,255,0.22); color: #fff; }
    .ohe-oc-badge i { font-size: 0.55rem; }
    .ohe-oc-badge.priority-critical { background: rgba(239,68,68,0.7); }
    .ohe-oc-badge.priority-high { background: rgba(245,158,11,0.7); }
    .ohe-oc-badge.priority-medium { background: rgba(59,130,246,0.5); }
    .ohe-oc-badge.priority-low { background: rgba(100,116,139,0.5); }
    .ohe-oc-body { flex: 1; overflow-y: auto; }
    .ohe-oc-section { padding: 1rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.05); }
    .ohe-oc-section:last-child { border-bottom: none; }
    .ohe-oc-section-head { font-size: 0.72rem; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.4px; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.65rem; }
    .ohe-oc-section-head i { font-size: 0.65rem; color: #0891b2; }
    .ohe-oc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .ohe-oc-info-label { font-size: 0.62rem; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.3px; display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.15rem; }
    .ohe-oc-info-label i { font-size: 0.55rem; color: #0891b2; }
    .ohe-oc-info-val { font-size: 0.82rem; font-weight: 600; color: var(--text-dark); }
    .ohe-oc-desc { font-size: 0.82rem; color: var(--text-mid); line-height: 1.65; max-height: 6em; overflow: hidden; position: relative; }
    .ohe-oc-desc.clamped::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2em; background: linear-gradient(transparent, #fff); }
    .ohe-oc-progress-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; margin-bottom: 0.65rem; }
    .ohe-oc-ring-wrap { position: relative; width: 60px; height: 60px; flex-shrink: 0; }
    .ohe-oc-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
    .ohe-oc-ring-bg { fill: none; stroke: #e2e8f0; stroke-width: 6; }
    .ohe-oc-ring-fg { fill: none; stroke: #0891b2; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 213.6; stroke-dashoffset: 213.6; transition: stroke-dashoffset 0.8s ease; }
    .ohe-oc-ring-val { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.75rem; font-weight: 800; color: var(--text-dark); }
    .ohe-oc-ring-label { font-size: 0.78rem; font-weight: 600; color: var(--text-mid); }
    .ohe-oc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
    .ohe-oc-stat { text-align: center; padding: 0.55rem 0.4rem; border-radius: 10px; background: rgba(0,0,0,0.025); border: 1px solid rgba(0,0,0,0.04); }
    .ohe-oc-stat-val { font-size: 1.15rem; font-weight: 800; color: var(--text-dark); line-height: 1; }
    .ohe-oc-stat-label { font-size: 0.6rem; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.3px; margin-top: 0.2rem; }
    .ohe-oc-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; border-radius: 50px; background: rgba(8,145,178,0.1); color: #0891b2; font-size: 0.6rem; font-weight: 700; padding: 0 5px; }
    .ohe-oc-list { display: flex; flex-direction: column; gap: 0.45rem; }
    .ohe-oc-list-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.65rem; border-radius: 10px; background: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.04); text-decoration: none; transition: all 0.2s; cursor: pointer; }
    .ohe-oc-list-item:hover { background: rgba(8,145,178,0.04); border-color: rgba(8,145,178,0.12); }
    .ohe-oc-list-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; flex-shrink: 0; }
    .ohe-oc-list-body { flex: 1; min-width: 0; }
    .ohe-oc-list-title { font-size: 0.78rem; font-weight: 600; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ohe-oc-list-meta { font-size: 0.65rem; color: var(--text-light); display: flex; align-items: center; gap: 0.4rem; }
    .ohe-oc-list-overdue { color: #ef4444; font-weight: 600; }
    .ohe-oc-minibar { width: 50px; height: 4px; border-radius: 2px; background: #e2e8f0; overflow: hidden; flex-shrink: 0; }
    .ohe-oc-minibar-fill { height: 100%; border-radius: 2px; background: #0891b2; transition: width 0.4s ease; }
    .ohe-oc-timeline { position: relative; padding-left: 1.2rem; }
    .ohe-oc-timeline::before { content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px; width: 2px; background: #e2e8f0; border-radius: 1px; }
    .ohe-oc-tl-item { position: relative; padding: 0 0 0.75rem; }
    .ohe-oc-tl-item:last-child { padding-bottom: 0; }
    .ohe-oc-tl-dot { position: absolute; left: -1.2rem; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid #cbd5e1; z-index: 1; }
    .ohe-oc-tl-dot.submitted { border-color: #3b82f6; background: #dbeafe; }
    .ohe-oc-tl-dot.under_review { border-color: #8b5cf6; background: #ede9fe; }
    .ohe-oc-tl-dot.directive_issued { border-color: #f59e0b; background: #fef3c7; }
    .ohe-oc-tl-dot.closed { border-color: #10b981; background: #d1fae5; }
    .ohe-oc-tl-action { font-size: 0.78rem; font-weight: 600; color: var(--text-dark); }
    .ohe-oc-tl-by { font-size: 0.68rem; color: var(--text-light); }
    .ohe-oc-tl-time { font-size: 0.62rem; color: var(--text-light); margin-top: 0.1rem; }
    .ohe-oc-footer { display: flex; gap: 0.5rem; padding: 0.85rem 1.25rem; border-top: 1px solid rgba(0,0,0,0.06); background: rgba(248,250,252,0.8); }
    .ohe-oc-btn-full { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.55rem 1rem; border-radius: 10px; background: #0891b2; color: #fff; font-size: 0.78rem; font-weight: 600; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s; }
    .ohe-oc-btn-full:hover { background: #0e7490; color: #fff; }
    /* Toast */
    .ohe-toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%) translateY(20px); padding: 0.5rem 1rem; border-radius: 10px; background: #1e293b; color: #fff; font-size: 0.78rem; font-weight: 600; box-shadow: 0 8px 30px rgba(0,0,0,0.15); opacity: 0; transition: all 0.3s ease; z-index: 9999; pointer-events: none; }
    .ohe-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    /* Modals (custom backdrop, same look as Bootstrap's) */
    .oh-modal-backdrop { display: none; position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,0.5); overflow-y: auto; }
    .oh-modal-backdrop.open { display: block; }
    .oh-modal { background: #fff; border-radius: 0.5rem; margin: 1.75rem auto; max-width: 1140px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: calc(100vh - 3.5rem); }
    .oh-modal.lg { max-width: 800px; }
    .oh-modal-header { background: var(--tz-primary-blue, #003366); color: #fff; border: 0; padding: 1rem 1.25rem; border-radius: 0.5rem 0.5rem 0 0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .oh-modal-header.warn { background: #d97706; }
    .oh-modal-header h5 { margin: 0; font-size: 1.05rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
    .oh-modal-close { background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer; line-height: 1; }
    .oh-modal-body { padding: 1.25rem; overflow-y: auto; }
    .oh-modal-footer { display: flex; justify-content: space-between; padding: 0.85rem 1.25rem; border-top: 1px solid #e9ecef; flex-shrink: 0; }
    /* Step tracker (verbatim from the modal partial) */
    .modal-progress-tracker { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; background: #f8f9fa; border-radius: 12px; margin-bottom: 1.5rem; }
    .modal-progress-step { display: flex; align-items: center; gap: 0.5rem; opacity: 0.4; transition: all 0.3s ease; }
    .modal-progress-step.active, .modal-progress-step.completed { opacity: 1; }
    .modal-step-num { width: 32px; height: 32px; border-radius: 50%; background: #dee2e6; color: #6c757d; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; transition: all 0.3s ease; }
    .modal-progress-step.active .modal-step-num { background: var(--tz-primary-blue, #003366); color: white; box-shadow: 0 3px 10px rgba(0, 51, 102, 0.3); }
    .modal-progress-step.completed .modal-step-num { background: #28a745; color: white; }
    .modal-progress-step span { font-size: 0.8rem; font-weight: 600; color: #6c757d; }
    .modal-progress-step.active span { color: var(--tz-primary-blue, #003366); }
    .modal-progress-step.completed span { color: #28a745; }
    .modal-progress-line { width: 40px; height: 3px; background: #dee2e6; border-radius: 2px; transition: all 0.3s ease; }
    .modal-progress-line.completed { background: #28a745; }
    /* Review summary */
    .m-review-section { border-left: 3px solid var(--tz-primary-blue, #003366); padding: 0.75rem 1rem; margin-bottom: 0.75rem; background: #f8f9fa; border-radius: 0 6px 6px 0; }
    .m-review-section h6 { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--tz-primary-blue, #003366); }
    .m-review-item { display: flex; justify-content: space-between; padding: 0.2rem 0; font-size: 0.85rem; border-bottom: 1px dashed #e9ecef; }
    .m-review-item:last-child { border-bottom: none; }
    .m-review-label { color: #6c757d; }
    .m-review-value { font-weight: 600; text-align: right; max-width: 55%; }
    .animal-entry { background: #fafafa; }
    .is-invalid { border-color: #dc3545 !important; }
    @media (max-width: 576px) { .ohe-offcanvas { width: 100%; } .ohe-oc-grid { grid-template-columns: 1fr; } .ohe-oc-stats { grid-template-columns: repeat(2, 1fr); } .modal-progress-step span { display: none; } .modal-progress-line { width: 20px; } }
  `],
  template: `
    <!-- ─── Page Header ─── -->
    <nav class="ohe-breadcrumb">
      <a routerLink="/home">Home</a>
      <span class="sep"><i class="fas fa-chevron-right"></i></span>
      <a routerLink="/m/one-health/dashboard">One Health</a>
      <span class="sep"><i class="fas fa-chevron-right"></i></span>
      <span class="current">Events</span>
    </nav>

    <div class="ohe-page-head">
      <div>
        <h1 class="ohe-title">One Health Events</h1>
        <p class="ohe-subtitle">Track, manage and respond to cross-sector health events</p>
      </div>
      <button type="button" class="ohe-btn-primary" (click)="openCreateModal()">
        <i class="fas fa-plus"></i> Report New Event
      </button>
    </div>

    <!-- ─── KPI Status Cards (clickable filters) ─── -->
    <div class="ohe-kpi-strip">
      @for (kpi of kpis(); track kpi.key) {
        <a class="ohe-kpi" [class.active]="filterStatus() === kpi.key" [style.--kpi-color]="kpi.color" (click)="setStatusFilter(kpi.key)">
          <div class="ohe-kpi-icon"><i class="fas" [class]="'fas ' + kpi.icon"></i></div>
          <div class="ohe-kpi-body">
            <span class="ohe-kpi-val">{{ kpi.display }}</span>
            <span class="ohe-kpi-label">{{ kpi.label }}</span>
          </div>
          <div class="ohe-kpi-accent"></div>
        </a>
      }
    </div>

    <!-- ─── Smart Filter Bar ─── -->
    <div class="ohe-filter-card">
      <div class="ohe-filter-main">
        <div class="ohe-search">
          <i class="fas fa-search"></i>
          <input type="text" placeholder="Search by event ID, title, or description..." autocomplete="off"
                 [ngModel]="searchText()" (ngModelChange)="onSearchInput($event)" (keydown.enter)="applySearch()">
          @if (filterSearch()) {
            <button class="ohe-search-clear" title="Clear search" (click)="clearFilter('search')"><i class="fas fa-times"></i></button>
          }
        </div>
        <button type="button" class="ohe-filter-toggle" [class.has-filters]="activeFilterCount() > 0" (click)="advancedOpen.set(!advancedOpen())">
          <i class="fas fa-sliders-h"></i>
          <span>Filters</span>
          @if (activeFilterCount() > 0) { <span class="ohe-filter-badge">{{ activeFilterCount() }}</span> }
        </button>
        @if (activeFilterCount() > 0) {
          <button class="ohe-reset-btn" title="Clear all filters" (click)="resetFilters()"><i class="fas fa-times"></i> Reset</button>
        }
      </div>

      <div class="ohe-advanced" [class.open]="advancedOpen() || activeFilterCount() > 0">
        <div class="ohe-filter-grid">
          <div class="ohe-filter-group">
            <label><i class="fas fa-crosshairs"></i> Area of Concern</label>
            <select [ngModel]="filterArea()" (ngModelChange)="filterArea.set($event); reload(1)">
              <option value="">All Areas</option>
              @for (a of formData()?.areas ?? []; track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select>
          </div>
          <div class="ohe-filter-group">
            <label><i class="fas fa-map-marker-alt"></i> Region</label>
            <select [ngModel]="filterRegion()" (ngModelChange)="filterRegion.set($event); reload(1)">
              <option value="">All Regions</option>
              @for (r of formData()?.regions ?? []; track r.id) { <option [value]="r.id">{{ r.name }}</option> }
            </select>
          </div>
          <div class="ohe-filter-group">
            <label><i class="fas fa-tag"></i> Event Type</label>
            <select [ngModel]="filterType()" (ngModelChange)="filterType.set($event); reload(1)">
              <option value="">All Types</option>
              <option value="outbreak">Outbreak</option>
              <option value="incident">Incident</option>
              <option value="ew_alert">EW Alert</option>
            </select>
          </div>
          <div class="ohe-filter-group">
            <label><i class="fas fa-flag"></i> Priority</label>
            <select [ngModel]="filterPriority()" (ngModelChange)="filterPriority.set($event); reload(1)">
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div class="ohe-filter-group">
            <label><i class="fas fa-calendar"></i> From</label>
            <input type="date" [ngModel]="filterDateFrom()" (ngModelChange)="filterDateFrom.set($event); reload(1)">
          </div>
          <div class="ohe-filter-group">
            <label><i class="fas fa-calendar-check"></i> To</label>
            <input type="date" [ngModel]="filterDateTo()" (ngModelChange)="filterDateTo.set($event); reload(1)">
          </div>
        </div>
      </div>

      @if (activeFilterCount() > 0) {
        <div class="ohe-chips">
          @if (filterSearch()) { <button class="ohe-chip" (click)="clearFilter('search')"><i class="fas fa-search"></i> "{{ limit(filterSearch(), 20) }}" <span class="chip-x">&times;</span></button> }
          @if (filterArea()) { <button class="ohe-chip" (click)="clearFilter('area')"><i class="fas fa-crosshairs"></i> {{ areaName(filterArea()) }} <span class="chip-x">&times;</span></button> }
          @if (filterRegion()) { <button class="ohe-chip" (click)="clearFilter('region')"><i class="fas fa-map-marker-alt"></i> {{ regionName(filterRegion()) }} <span class="chip-x">&times;</span></button> }
          @if (filterType()) { <button class="ohe-chip" (click)="clearFilter('type')"><i class="fas fa-tag"></i> {{ ucwords(filterType()) }} <span class="chip-x">&times;</span></button> }
          @if (filterPriority()) { <button class="ohe-chip" (click)="clearFilter('priority')"><i class="fas fa-flag"></i> {{ ucwords(filterPriority()) }} <span class="chip-x">&times;</span></button> }
          @if (filterDateFrom()) { <button class="ohe-chip" (click)="clearFilter('dateFrom')"><i class="fas fa-calendar"></i> From {{ filterDateFrom() }} <span class="chip-x">&times;</span></button> }
          @if (filterDateTo()) { <button class="ohe-chip" (click)="clearFilter('dateTo')"><i class="fas fa-calendar-check"></i> To {{ filterDateTo() }} <span class="chip-x">&times;</span></button> }
        </div>
      }
    </div>

    <!-- ─── Data Table ─── -->
    <div class="panel">
      <div class="panel-head">
        <div class="ph-title"><i class="fas fa-database"></i> Events Registry</div>
        <span class="panel-badge">{{ total() }} total</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="r-table">
          <thead>
            <tr>
              <th>Event ID</th><th>Title</th><th>Type</th><th>Area of Concern</th><th>Institution</th>
              <th>Region / District</th><th>Priority</th><th>Status</th><th>Date</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (event of visibleRows(); track event.id) {
              <tr [class.ew-row]="event.event_type === 'ew_alert'">
                <td><a [routerLink]="['/m/one-health/events', event.id]" style="color:#0891b2;font-weight:600;text-decoration:none;">{{ event.event_id }}</a></td>
                <td><div class="r-title">{{ limit(event.event_title ?? '', 35) }}</div></td>
                <td>
                  @if (event.event_type === 'ew_alert') { <span class="r-badge badge-pending"><i class="fas fa-satellite-dish" style="margin-right:3px;"></i>EW Alert</span> }
                  @else if (event.event_type === 'outbreak') { <span class="r-badge badge-rejected"><i class="fas fa-biohazard" style="margin-right:3px;"></i>Outbreak</span> }
                  @else { <span class="r-badge badge-active"><i class="fas fa-exclamation-circle" style="margin-right:3px;"></i>Incident</span> }
                </td>
                <td style="font-size:0.82rem;color:var(--text-mid);">{{ event.area_name ?? '-' }}</td>
                <td style="font-size:0.82rem;color:var(--text-mid);">{{ event.stakeholder_name ?? event.stakeholder_organization ?? '-' }}</td>
                <td>
                  <div class="r-title">{{ event.region_name ?? '' }}</div>
                  <div class="r-subtitle">{{ event.district_name ?? '' }}</div>
                </td>
                <td>
                  @if (event.priority_level) { <span class="r-badge" [class]="'r-badge ' + priorityBadge(event.priority_level)">{{ ucwords(event.priority_level) }}</span> }
                  @else { <span style="color:var(--text-light);">-</span> }
                </td>
                <td><span class="r-badge" [class]="'r-badge ' + statusBadge(event.status)">{{ event.status_label }}</span></td>
                <td style="font-size:0.82rem;color:var(--text-mid);">{{ event.date_of_occurrence }}</td>
                <td>
                  <div class="ctx-wrap">
                    <button class="ctx-trigger" type="button" (click)="toggleMenu(event.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="ctx-menu" [class.open]="openMenuId() === event.id">
                      <div class="ctx-menu-header">
                        <span class="ctx-menu-label">{{ event.event_id }}</span>
                        <span class="r-badge" [class]="'r-badge ' + statusBadge(event.status)" style="font-size:0.6rem;padding:0.15rem 0.4rem;">{{ event.status_label }}</span>
                      </div>
                      <button class="ctx-item" type="button" (click)="openQuickView(event)"><i class="fas fa-bolt"></i> Quick Preview</button>
                      <a class="ctx-item" [routerLink]="['/m/one-health/events', event.id]"><i class="fas fa-external-link-alt"></i> View Full Details</a>
                      @if (canIssueDirective()) {
                        <div class="ctx-divider"></div>
                        <button class="ctx-item warning" type="button" (click)="openDirectiveModal(event)"><i class="fas fa-gavel"></i> Issue Directive</button>
                      }
                      <div class="ctx-divider"></div>
                      <button class="ctx-item" type="button" (click)="copyEventId(event.event_id)"><i class="fas fa-copy"></i> Copy Event ID</button>
                      @if (event.status === 'submitted' && canIssueDirective()) {
                        <div class="ctx-divider"></div>
                        <button class="ctx-item warning" type="button" (click)="startReview(event)"><i class="fas fa-clipboard-check"></i> Start Review</button>
                      }
                    </div>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="10"><div class="empty-state"><i class="fas fa-biohazard"></i> No events found.</div></td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (lastPage() > 1) {
        <div class="pagination-wrap">
          <span>Showing {{ firstItem() }} to {{ lastItem() }} of {{ total() }}</span>
          <div class="page-links">
            @if (currentPage() === 1) { <span class="dim">&laquo;</span> } @else { <a (click)="reload(currentPage() - 1)">&laquo;</a> }
            @for (p of pageWindow(); track p) {
              @if (p === currentPage()) { <span class="active">{{ p }}</span> } @else { <a (click)="reload(p)">{{ p }}</a> }
            }
            @if (currentPage() < lastPage()) { <a (click)="reload(currentPage() + 1)">&raquo;</a> } @else { <span class="dim">&raquo;</span> }
          </div>
        </div>
      }
    </div>

    <!-- ═══ Quick Preview Offcanvas ═══ -->
    <div class="ohe-oc-backdrop" [class.open]="quickViewOpen()" (click)="quickViewOpen.set(false)"></div>
    <div class="ohe-offcanvas" [class.open]="quickViewOpen()">
      @if (qvEvent(); as ev) {
        <div class="ohe-oc-header">
          <div class="ohe-oc-header-top">
            <div>
              <div class="ohe-oc-label">Quick Preview</div>
              <h5 class="ohe-oc-title">{{ ev.event_title || '—' }}</h5>
            </div>
            <button type="button" class="ohe-oc-close" (click)="quickViewOpen.set(false)"><i class="fas fa-xmark"></i></button>
          </div>
          <div class="ohe-oc-badges">
            <span class="ohe-oc-badge"><i class="fas fa-circle"></i> {{ ev.status_label }}</span>
            @if (ev.priority_level) { <span class="ohe-oc-badge" [class]="'ohe-oc-badge priority-' + ev.priority_level"><i class="fas fa-flag"></i> {{ ucwords(ev.priority_level) }}</span> }
            @if (ev.event_type === 'ew_alert') { <span class="ohe-oc-badge" style="background:rgba(245,158,11,0.7);"><i class="fas fa-satellite-dish"></i> EW Alert</span> }
            @if (ev.risk_level) { <span class="ohe-oc-badge"><i class="fas fa-shield-halved"></i> {{ ucwords(ev.risk_level) }} Risk</span> }
          </div>
        </div>
        <div class="ohe-oc-body">
          <div class="ohe-oc-section">
            <div class="ohe-oc-grid">
              <div><div class="ohe-oc-info-label"><i class="fas fa-fingerprint"></i> Event ID</div><div class="ohe-oc-info-val">{{ ev.event_id }}</div></div>
              <div><div class="ohe-oc-info-label"><i class="fas fa-tag"></i> Type</div><div class="ohe-oc-info-val">{{ typeLabel(ev.event_type) }}</div></div>
              <div><div class="ohe-oc-info-label"><i class="fas fa-microscope"></i> Area of Concern</div><div class="ohe-oc-info-val">{{ ev.area_name ?? '—' }}</div></div>
              <div><div class="ohe-oc-info-label"><i class="fas fa-building"></i> Institution</div><div class="ohe-oc-info-val">{{ ev.stakeholder_organization ?? ev.stakeholder_name ?? '—' }}</div></div>
              <div><div class="ohe-oc-info-label"><i class="fas fa-map-marker-alt"></i> Location</div><div class="ohe-oc-info-val">{{ qvLocation(ev) }}</div></div>
              <div><div class="ohe-oc-info-label"><i class="fas fa-calendar"></i> Date</div><div class="ohe-oc-info-val">{{ ev.date_of_occurrence ?? '—' }}</div></div>
            </div>
          </div>
          <div class="ohe-oc-section">
            <div class="ohe-oc-section-head"><i class="fas fa-align-left"></i> Description</div>
            <div class="ohe-oc-desc" [class.clamped]="(ev.event_description ?? '').length > 320">{{ ev.event_description || '—' }}</div>
          </div>
          @if (qvOps(); as ops) {
            @if (ops.directives.length || ops.action_trackings.length || ops.event_completion > 0) {
              <div class="ohe-oc-section">
                <div class="ohe-oc-section-head"><i class="fas fa-chart-line"></i> Operational Summary</div>
                @if (ops.event_completion > 0) {
                  <div class="ohe-oc-progress-row">
                    <div class="ohe-oc-ring-wrap">
                      <svg class="ohe-oc-ring" viewBox="0 0 80 80">
                        <circle class="ohe-oc-ring-bg" cx="40" cy="40" r="34" />
                        <circle class="ohe-oc-ring-fg" cx="40" cy="40" r="34" [style.stroke-dashoffset]="213.6 - (ops.event_completion / 100) * 213.6" />
                      </svg>
                      <span class="ohe-oc-ring-val">{{ ops.event_completion }}%</span>
                    </div>
                    <div class="ohe-oc-ring-label">Event Completion</div>
                  </div>
                }
                <div class="ohe-oc-stats">
                  <div class="ohe-oc-stat"><div class="ohe-oc-stat-val">{{ ops.directives.length }}</div><div class="ohe-oc-stat-label">Directives</div></div>
                  <div class="ohe-oc-stat"><div class="ohe-oc-stat-val">{{ ops.action_trackings.length }}</div><div class="ohe-oc-stat-label">Actions</div></div>
                  <div class="ohe-oc-stat"><div class="ohe-oc-stat-val">{{ ops.dissemination_summary.sent }}</div><div class="ohe-oc-stat-label">Disseminated</div></div>
                </div>
              </div>
            }
            @if (ops.directives.length) {
              <div class="ohe-oc-section">
                <div class="ohe-oc-section-head"><i class="fas fa-gavel"></i> Directives <span class="ohe-oc-count">{{ ops.directives.length }}</span></div>
                <div class="ohe-oc-list">
                  @for (dir of ops.directives; track dir.id) {
                    <a class="ohe-oc-list-item" [routerLink]="['/m/one-health/directives', dir.id]">
                      <div class="ohe-oc-list-icon" [style.background]="dirIconBg(dir.priority_level)" [style.color]="dirIconColor(dir.priority_level)"><i class="fas fa-gavel"></i></div>
                      <div class="ohe-oc-list-body">
                        <div class="ohe-oc-list-title">{{ dir.directive_title }}</div>
                        <div class="ohe-oc-list-meta">
                          @if (dir.deadline) { <span>{{ dir.deadline }}</span> }
                          @if (dir.is_overdue) { <span class="ohe-oc-list-overdue"><i class="fas fa-clock"></i> Overdue</span> }
                        </div>
                      </div>
                      @if (dir.acknowledgement) {
                        <div class="ohe-oc-minibar"><div class="ohe-oc-minibar-fill" [style.width.%]="dir.acknowledgement.total > 0 ? (dir.acknowledgement.acknowledged / dir.acknowledgement.total) * 100 : 0"></div></div>
                      }
                    </a>
                  }
                </div>
              </div>
            }
            @if (ops.action_trackings.length) {
              <div class="ohe-oc-section">
                <div class="ohe-oc-section-head"><i class="fas fa-tasks"></i> Action Trackings <span class="ohe-oc-count">{{ ops.action_trackings.length }}</span></div>
                <div class="ohe-oc-list">
                  @for (act of ops.action_trackings; track act.id) {
                    <div class="ohe-oc-list-item">
                      <div class="ohe-oc-list-icon" [style.background]="actColor(act.status) + '15'" [style.color]="actColor(act.status)"><i class="fas fa-tasks"></i></div>
                      <div class="ohe-oc-list-body">
                        <div class="ohe-oc-list-title">{{ act.action_title }}</div>
                        <div class="ohe-oc-list-meta">
                          <span>{{ act.stakeholder_name }}</span>
                          @if (act.target_date) { <span>{{ act.target_date }}</span> }
                          @if (act.is_overdue) { <span class="ohe-oc-list-overdue"><i class="fas fa-clock"></i> Overdue</span> }
                        </div>
                      </div>
                      <div class="ohe-oc-minibar"><div class="ohe-oc-minibar-fill" [style.width.%]="act.completion_percentage" [style.background]="actColor(act.status)"></div></div>
                    </div>
                  }
                </div>
              </div>
            }
            @if (ops.workflow_history.length) {
              <div class="ohe-oc-section">
                <div class="ohe-oc-section-head"><i class="fas fa-history"></i> Recent Activity</div>
                <div class="ohe-oc-timeline">
                  @for (wh of ops.workflow_history.slice(0, 5); track $index) {
                    <div class="ohe-oc-tl-item">
                      <div class="ohe-oc-tl-dot" [class]="'ohe-oc-tl-dot ' + (wh.to_status || wh.action || '')"></div>
                      <div class="ohe-oc-tl-action">{{ wh.action_label || wh.action }}</div>
                      <div class="ohe-oc-tl-by">{{ wh.user_name }}@if (wh.performed_by_role) { ({{ wh.performed_by_role }})}</div>
                      @if (wh.comments) { <div class="ohe-oc-tl-by" style="font-style:italic;">"{{ limit(wh.comments, 80) }}"</div> }
                      <div class="ohe-oc-tl-time">{{ wh.created_at || '' }}</div>
                    </div>
                  }
                </div>
              </div>
            }
          }
        </div>
        <div class="ohe-oc-footer">
          <a class="ohe-oc-btn-full" [routerLink]="['/m/one-health/events', ev.id]" (click)="quickViewOpen.set(false)"><i class="fas fa-expand"></i> View Full Details</a>
        </div>
      }
    </div>

    <!-- ═══ Issue Directive Modal ═══ -->
    <div class="oh-modal-backdrop" [class.open]="directiveModalOpen()" (click)="backdropClose($event, 'directive')">
      <div class="oh-modal lg" (click)="$event.stopPropagation()">
        <div class="oh-modal-header warn">
          <h5><i class="fas fa-gavel"></i> Issue Directive — {{ dirEvent()?.event_id }}</h5>
          <button type="button" class="oh-modal-close" (click)="directiveModalOpen.set(false)">&times;</button>
        </div>
        <div class="oh-modal-body">
          @if (dirErrors().length) {
            <div class="alert alert-danger"><ul class="mb-0">@for (e of dirErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
          }
          <div class="row g-3">
            <div class="col-md-12">
              <label class="form-label">Directive Title <span class="text-danger">*</span></label>
              <input type="text" class="form-control" placeholder="Enter directive title" [(ngModel)]="dirForm.directive_title">
            </div>
            <div class="col-md-12">
              <label class="form-label">Action Description <span class="text-danger">*</span></label>
              <textarea rows="3" class="form-control" placeholder="Describe the required action" [(ngModel)]="dirForm.action_description"></textarea>
            </div>
            <div class="col-md-4">
              <label class="form-label">Deadline</label>
              <input type="date" class="form-control" [min]="today" [(ngModel)]="dirForm.deadline">
            </div>
            <div class="col-md-4">
              <label class="form-label">Priority Level <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="dirForm.priority_level">
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Risk Level</label>
              <select class="form-select" [(ngModel)]="dirForm.risk_level">
                <option value="">Select</option><option value="low">Low</option><option value="moderate">Moderate</option>
                <option value="high">High</option><option value="very_high">Very High</option>
              </select>
            </div>
            <div class="col-md-12">
              <label class="form-label">Coordination Notes</label>
              <textarea rows="2" class="form-control" placeholder="Any coordination notes" [(ngModel)]="dirForm.coordination_notes"></textarea>
            </div>
            <div class="col-md-12">
              <label class="form-label">Responsible Stakeholders <span class="text-danger">*</span></label>
              <div class="border rounded p-3" style="max-height: 200px; overflow-y: auto;">
                @if (dirStakeholdersLoading()) {
                  <div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Loading stakeholders...</div>
                } @else if (!dirStakeholders().length) {
                  <p class="text-muted mb-0">No stakeholders assigned to this area.</p>
                } @else {
                  <div class="form-check mb-2 pb-2" style="border-bottom:1px solid #e9ecef;">
                    <input class="form-check-input" type="checkbox" id="idmSelectAll" [checked]="allDirStakeholdersSelected()" (change)="toggleAllDirStakeholders($event)">
                    <label class="form-check-label" for="idmSelectAll"><strong>Select All ({{ dirStakeholders().length }})</strong></label>
                  </div>
                  @for (s of dirStakeholders(); track s.id) {
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" [id]="'idmSth' + s.id" [checked]="dirSelected().has(s.id)" (change)="toggleDirStakeholder(s.id)">
                      <label class="form-check-label" [for]="'idmSth' + s.id">
                        <strong>{{ s.organization || s.name }}</strong>
                        @if (s.name && s.organization) { ({{ s.name }}) }
                        @if (s.email) { <small class="text-muted d-block">{{ s.email }}@if (s.phone) { | {{ s.phone }}}</small> }
                      </label>
                    </div>
                  }
                }
              </div>
            </div>
          </div>
        </div>
        <div class="oh-modal-footer">
          <button type="button" class="btn btn-secondary" (click)="directiveModalOpen.set(false)">Cancel</button>
          <button type="button" class="btn btn-warning text-white" [disabled]="dirSubmitting()" (click)="submitDirective()">
            @if (dirSubmitting()) { <i class="fas fa-spinner fa-spin me-1"></i> Issuing... } @else { <i class="fas fa-gavel me-1"></i> Issue Directive }
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ Create Event Modal (4 steps) — shared component, also used by the dashboard ═══ -->
    <oh-report-event-modal #reportModal (created)="reload(1)" />
  `,
})
export class OhEventsComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  readonly today = new Date().toISOString().substring(0, 10);

  // index state
  rows = signal<EventRow[]>([]);
  total = signal(0);
  currentPage = signal(1);
  lastPage = signal(1);
  firstItem = signal<number | null>(null);
  lastItem = signal<number | null>(null);
  stats = signal<IndexResponse['stats'] | null>(null);
  formData = signal<FormData | null>(null);
  openMenuId = signal<number | null>(null);

  // filters
  filterStatus = signal('');
  filterArea = signal('');
  filterRegion = signal('');
  filterType = signal('');
  filterPriority = signal('');
  filterDateFrom = signal('');
  filterDateTo = signal('');
  filterSearch = signal('');
  searchText = signal('');     // live input (client-side filter, Enter = server search)
  advancedOpen = signal(false);

  activeFilterCount = computed(() =>
    [this.filterSearch(), this.filterArea(), this.filterRegion(), this.filterType(),
     this.filterPriority(), this.filterDateFrom(), this.filterDateTo()].filter(v => !!v).length);

  /** Client-side narrowing while typing, exactly like the Blade's input handler. */
  visibleRows = computed(() => {
    const q = this.searchText().toLowerCase();
    if (!q || q === this.filterSearch().toLowerCase()) { return this.rows(); }
    return this.rows().filter(r =>
      [r.event_id, r.event_title, r.area_name, r.stakeholder_organization, r.region_name]
        .join(' ').toLowerCase().includes(q));
  });

  kpis = computed(() => {
    const s = this.stats();
    return [
      { key: '', label: 'All Events', display: s?.total ?? 0, icon: 'fa-layer-group', color: '#0891b2' },
      { key: 'active', label: 'Active', display: s?.active ?? 0, icon: 'fa-bolt', color: '#f59e0b' },
      { key: 'submitted', label: 'Submitted', display: s?.submitted ?? 0, icon: 'fa-paper-plane', color: '#06b6d4' },
      { key: 'under_review', label: 'Under Review', display: s?.under_review ?? 0, icon: 'fa-magnifying-glass', color: '#8b5cf6' },
      { key: 'directive_issued', label: 'Directives', display: s?.directive_issued ?? 0, icon: 'fa-gavel', color: '#3b82f6' },
      { key: 'closed', label: 'Closed', display: s?.closed ?? 0, icon: 'fa-circle-check', color: '#64748b' },
    ];
  });

  // quick view
  quickViewOpen = signal(false);
  qvEvent = signal<EventRow | null>(null);
  qvOps = signal<any | null>(null);

  // directive modal
  directiveModalOpen = signal(false);
  dirEvent = signal<EventRow | null>(null);
  dirStakeholders = signal<{ id: number; organization: string; name: string; email: string; phone: string }[]>([]);
  dirStakeholdersLoading = signal(false);
  dirSelected = signal(new Set<number>());
  dirErrors = signal<string[]>([]);
  dirSubmitting = signal(false);
  dirForm = { directive_title: '', action_description: '', deadline: '', priority_level: 'medium', risk_level: '', coordination_notes: '' };

  // create modal (shared component)
  readonly reportModal = viewChild.required(OhReportEventModalComponent);

  ngOnInit(): void {
    ensureSweetAlert();
    this.http.get<FormData>('/api/v1/onehealth/events/form-data').subscribe(fd => this.formData.set(fd));
    // Deep-link filters (e.g. the dashboard's EW banner: ?event_type=ew_alert)
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('event_type')) { this.filterType.set(qp.get('event_type')!); }
    if (qp.get('status')) { this.filterStatus.set(qp.get('status')!); }
    this.reload(1);
    document.addEventListener('click', () => this.openMenuId.set(null));
    // /m/one-health/report-event lands here with the create modal open
    if (this.route.snapshot.data['openCreate'] || this.route.snapshot.queryParamMap.get('create') === '1') {
      setTimeout(() => this.openCreateModal(), 150);
    }
  }

  reload(page: number): void {
    const params: Record<string, string> = { page: String(page) };
    if (this.filterStatus()) { params['status'] = this.filterStatus(); }
    if (this.filterArea()) { params['area_of_concern_id'] = this.filterArea(); }
    if (this.filterRegion()) { params['region_id'] = this.filterRegion(); }
    if (this.filterType()) { params['event_type'] = this.filterType(); }
    if (this.filterPriority()) { params['priority_level'] = this.filterPriority(); }
    if (this.filterDateFrom()) { params['date_from'] = this.filterDateFrom(); }
    if (this.filterDateTo()) { params['date_to'] = this.filterDateTo(); }
    if (this.filterSearch()) { params['search'] = this.filterSearch(); }
    this.http.get<IndexResponse>('/api/v1/onehealth/events', { params }).subscribe(res => {
      this.rows.set(res.data);
      this.total.set(res.total);
      this.currentPage.set(res.currentPage);
      this.lastPage.set(res.lastPage);
      this.firstItem.set(res.firstItem);
      this.lastItem.set(res.lastItem);
      this.stats.set(res.stats);
    });
  }

  pageWindow(): number[] {
    const out: number[] = [];
    for (let p = Math.max(1, this.currentPage() - 2); p <= Math.min(this.lastPage(), this.currentPage() + 2); p++) { out.push(p); }
    return out;
  }

  setStatusFilter(key: string): void {
    this.filterStatus.set(key);
    this.reload(1);
  }

  onSearchInput(v: string): void {
    this.searchText.set(v);
  }

  applySearch(): void {
    this.filterSearch.set(this.searchText().trim());
    this.reload(1);
  }

  clearFilter(which: string): void {
    const map: Record<string, () => void> = {
      search: () => { this.filterSearch.set(''); this.searchText.set(''); },
      area: () => this.filterArea.set(''),
      region: () => this.filterRegion.set(''),
      type: () => this.filterType.set(''),
      priority: () => this.filterPriority.set(''),
      dateFrom: () => this.filterDateFrom.set(''),
      dateTo: () => this.filterDateTo.set(''),
    };
    map[which]?.();
    this.reload(1);
  }

  resetFilters(): void {
    this.filterStatus.set(''); this.filterArea.set(''); this.filterRegion.set(''); this.filterType.set('');
    this.filterPriority.set(''); this.filterDateFrom.set(''); this.filterDateTo.set('');
    this.filterSearch.set(''); this.searchText.set('');
    this.reload(1);
  }

  toggleMenu(id: number, ev: Event): void {
    ev.stopPropagation();
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  /** PMO roles per OhEvent::canIssueDirectiveBy (locally the admin has Super Admin). */
  canIssueDirective(): boolean {
    const roles = this.auth.user()?.roles ?? [];
    if (!roles.length) { return true; } // local sessions without role claims behave as admin
    return ['Super Admin', 'ICT Admin', 'EOCC', 'Director', 'Asst. Director'].some(r => roles.includes(r));
  }

  // ── quick view ──

  openQuickView(event: EventRow): void {
    this.openMenuId.set(null);
    this.qvEvent.set(event);
    this.qvOps.set(null);
    this.quickViewOpen.set(true);
    this.http.get<any>(`/api/v1/onehealth/events/${event.id}/quick-view`).subscribe({
      next: ops => this.qvOps.set(ops),
      error: () => { /* basic info is already showing, as in the source */ },
    });
  }

  qvLocation(ev: EventRow): string {
    let loc = [ev.region_name, ev.district_name].filter(v => v && v !== '-').join(', ');
    if (ev.ward_name && ev.ward_name !== '-') { loc += ' (' + ev.ward_name + ')'; }
    return loc || '—';
  }

  typeLabel(t: string): string {
    return ({ ew_alert: 'EW Alert', outbreak: 'Outbreak', incident: 'Incident' } as Record<string, string>)[t] ?? t ?? '—';
  }

  dirIconBg(p: string): string { return p === 'critical' ? '#fef2f2' : p === 'high' ? '#fffbeb' : '#f0f9ff'; }
  dirIconColor(p: string): string { return p === 'critical' ? '#ef4444' : p === 'high' ? '#f59e0b' : '#3b82f6'; }
  actColor(s: string): string { return s === 'completed' ? '#10b981' : s === 'in_progress' ? '#3b82f6' : '#94a3b8'; }

  // ── copy / toast ──

  copyEventId(id: string): void {
    this.openMenuId.set(null);
    navigator.clipboard.writeText(id).then(() => this.showToast('Copied: ' + id))
      .catch(() => this.showToast('Copied: ' + id));
  }

  private showToast(msg: string): void {
    document.querySelector('.ohe-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'ohe-toast';
    toast.innerHTML = '<i class="fas fa-check-circle" style="margin-right:0.4rem;color:#10b981;"></i>' + msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2000);
  }

  // ── review ──

  startReview(event: EventRow): void {
    this.openMenuId.set(null);
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Mark this event as Under Review?', icon: 'question',
        showCancelButton: true, confirmButtonColor: '#003366', confirmButtonText: 'Yes, start review',
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/onehealth/events/${event.id}/review`, {}).subscribe({
          next: r => Swal.fire({ icon: 'success', title: 'Success', text: r.message, timer: 2200, showConfirmButton: false })
            .then(() => this.reload(this.currentPage())),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  // ── directive modal ──

  openDirectiveModal(event: EventRow): void {
    this.openMenuId.set(null);
    this.dirEvent.set(event);
    this.dirForm = { directive_title: '', action_description: '', deadline: '', priority_level: 'medium', risk_level: '', coordination_notes: '' };
    this.dirErrors.set([]);
    this.dirSelected.set(new Set<number>());
    this.dirStakeholders.set([]);
    this.directiveModalOpen.set(true);
    if (event.area_of_concern_id) {
      this.dirStakeholdersLoading.set(true);
      this.http.get<any[]>(`/api/v1/onehealth/events/area-stakeholders/${event.area_of_concern_id}`).subscribe({
        next: list => { this.dirStakeholders.set(list as any); this.dirStakeholdersLoading.set(false); },
        error: () => this.dirStakeholdersLoading.set(false),
      });
    }
  }

  allDirStakeholdersSelected(): boolean {
    return this.dirStakeholders().length > 0 && this.dirSelected().size === this.dirStakeholders().length;
  }

  toggleAllDirStakeholders(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.dirSelected.set(checked ? new Set(this.dirStakeholders().map(s => s.id)) : new Set());
  }

  toggleDirStakeholder(id: number): void {
    const next = new Set(this.dirSelected());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.dirSelected.set(next);
  }

  submitDirective(): void {
    const errors: string[] = [];
    if (!this.dirForm.directive_title.trim()) { errors.push('Directive title is required.'); }
    if (!this.dirForm.action_description.trim()) { errors.push('Action description is required.'); }
    if (!this.dirForm.priority_level) { errors.push('Priority level is required.'); }
    if (this.dirSelected().size === 0) { errors.push('At least one stakeholder must be selected.'); }
    if (errors.length) { this.dirErrors.set(errors); return; }
    this.dirErrors.set([]);

    const payload: any = {
      directive_title: this.dirForm.directive_title.trim(),
      action_description: this.dirForm.action_description.trim(),
      priority_level: this.dirForm.priority_level,
      stakeholder_ids: [...this.dirSelected()],
    };
    if (this.dirForm.deadline) { payload.deadline = this.dirForm.deadline; }
    if (this.dirForm.risk_level) { payload.risk_level = this.dirForm.risk_level; }
    if (this.dirForm.coordination_notes.trim()) { payload.coordination_notes = this.dirForm.coordination_notes.trim(); }

    this.dirSubmitting.set(true);
    this.http.post<any>(`/api/v1/onehealth/events/${this.dirEvent()!.id}/directives`, payload).subscribe({
      next: res => {
        this.dirSubmitting.set(false);
        this.directiveModalOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({
          icon: 'success', title: 'Directive Issued!', text: res.message ?? 'Directive issued successfully.',
          timer: 2500, timerProgressBar: true,
        }).then(() => this.reload(this.currentPage())));
      },
      error: err => {
        this.dirSubmitting.set(false);
        if (err.status === 422 && err.error?.errors) {
          this.dirErrors.set(Object.values(err.error.errors as Record<string, string[]>).flat());
        } else {
          this.dirErrors.set([err.error?.message ?? 'An error occurred.']);
        }
      },
    });
  }

  // ── create modal (delegates to the shared component) ──

  openCreateModal(): void {
    this.reportModal().open();
  }

  backdropClose(ev: Event, which: 'directive'): void {
    if (ev.target === ev.currentTarget) {
      this.directiveModalOpen.set(false);
    }
  }

  // ── name lookups & formatting ──

  areaName(id: string | number): string { return this.formData()?.areas.find(a => String(a.id) === String(id))?.name ?? ''; }
  regionName(id: string | number): string { return this.formData()?.regions.find(r => String(r.id) === String(id))?.name ?? ''; }

  statusBadge(status: string): string {
    return ({
      submitted: 'badge-active', under_review: 'badge-pending', directive_issued: 'badge-published',
      disseminated: 'badge-approved', monitoring: 'badge-inactive', closed: 'badge-draft', archived: 'badge-draft',
    } as Record<string, string>)[status] ?? 'badge-inactive';
  }

  priorityBadge(priority: string): string {
    return ({
      critical: 'badge-rejected', high: 'badge-pending', medium: 'badge-published', low: 'badge-inactive',
    } as Record<string, string>)[priority] ?? 'badge-inactive';
  }

  limit(s: string | null | undefined, max: number): string {
    if (!s) { return ''; }
    return s.length <= max ? s : s.substring(0, max).trimEnd() + '...';
  }

  ucwords(s: string): string {
    return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

/** Loads SweetAlert2 from the same CDN the Blade page pushes, once. */
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return swalPromise;
}
