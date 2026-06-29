import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface DirStakeholder {
  id: number; organization: string; name: string;
  acknowledgement_status: string; acknowledged_at: string | null; response_notes: string | null;
  implementation_status: string | null; implementation_percentage: number | null;
  implementation_notes: string | null; last_update_at: string | null;
}
interface HubDirective {
  id: number; directive_title: string; action_description: string | null; coordination_notes: string | null;
  deadline: string | null; deadline_display: string | null; is_overdue: boolean;
  priority_level: string; risk_level: string | null; status: string;
  stakeholders: DirStakeholder[]; ack_count: number; total_stakeholders: number; impl_avg_percentage: number;
}
interface HubDissemination {
  id: number; dissemination_type: string; alert_message: string; approval_status: string;
  status: string; sms_sent_count: number; email_sent_count: number; created_at: string;
}
interface HubAction {
  id: number; directive_id: number | null; action_title: string; action_description: string | null;
  status: string; completion_percentage: number; target_date: string | null; target_date_display: string | null;
  is_overdue: boolean; stakeholder_organization: string | null;
}
interface HubHistory {
  action: string; action_label: string; action_icon: string; from_status: string | null;
  to_status: string | null; user_name: string; performed_by_role: string | null;
  comments: string | null; created_at: string;
}
interface ShowResponse {
  event: any;
  environmental_detail: any; health_detail: any; agricultural_detail: any; food_safety_detail: any;
  animal_entries: any[];
  directives: HubDirective[]; disseminations: HubDissemination[]; action_trackings: HubAction[];
  workflow_histories: HubHistory[];
  area_stakeholders: { id: number; organization: string; name: string }[];
  has_directives: boolean; can_issue_directive: boolean; can_review: boolean;
}

const WORKFLOW_STEPS = [
  { key: 'submitted', label: 'Submitted', icon: 'fa-paper-plane', desc: 'Event reported' },
  { key: 'under_review', label: 'Under Review', icon: 'fa-search', desc: 'Being assessed' },
  { key: 'directive_issued', label: 'Directive Issued', icon: 'fa-bullhorn', desc: 'Actions assigned' },
  { key: 'disseminated', label: 'Disseminated', icon: 'fa-share-alt', desc: 'Info shared' },
  { key: 'monitoring', label: 'Monitoring', icon: 'fa-chart-line', desc: 'Tracking progress' },
  { key: 'closed', label: 'Closed', icon: 'fa-check-circle', desc: 'Event resolved' },
];

/**
 * Reproduction of onehealth/events/show.blade.php (2927 lines) — the One Health
 * coordination hub: gradient banner, 6-step workflow stepper, tabbed layout
 * (Overview / Cases / Directives / Disseminations / Actions) with inline creation
 * panels, expandable directive matrices, the dual-track dissemination panel and a
 * timeline-focused sidebar with the review and closure forms.
 *
 * OH-6 invariant kept (no edit after submission); OH-11 fix: the closure form is
 * reachable for PMO sessions when progress hits 100%.
 */
@Component({
  selector: 'page-oh-event-show',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet],
  styles: [`
    /* ── Gradient header ── */
    .oh-show-header { background: #0891b2; border-radius: 12px; padding: 1.25rem 1.5rem; color: #fff; margin-bottom: 1.5rem; }
    .oh-show-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; opacity: 0.8; }
    .oh-show-breadcrumb a { color: rgba(255,255,255,0.85); text-decoration: none; }
    .oh-show-breadcrumb a:hover { color: #fff; }
    .oh-show-breadcrumb span { color: #fff; font-weight: 600; }
    .oh-show-breadcrumb i.fa-chevron-right { font-size: 0.55rem; opacity: 0.5; }
    .oh-show-title { color: #fff; font-weight: 700; font-size: 1.2rem; line-height: 1.3; }
    .oh-show-badge { display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; background: rgba(255,255,255,0.2); color: #fff; }
    .oh-show-header-btn { display: inline-flex; align-items: center; padding: 6px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; color: #fff; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); text-decoration: none; transition: all 0.2s; cursor: pointer; }
    .oh-show-header-btn:hover { background: rgba(255,255,255,0.22); color: #fff; }
    /* ── Stepper ── */
    .oh-stepper-card { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 1rem 1.5rem; margin-bottom: 1.5rem; }
    .oh-stepper-row { display: flex; align-items: flex-start; justify-content: space-between; position: relative; }
    .oh-stepper-line { position: absolute; top: 22px; left: 8%; right: 8%; height: 3px; background: #dee2e6; z-index: 0; }
    .oh-stepper-fill { position: absolute; top: 0; left: 0; height: 100%; background: #198754; transition: width 0.5s ease; }
    .oh-step { flex: 1; text-align: center; position: relative; z-index: 1; }
    .oh-step-icon { width: 44px; height: 44px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; margin-bottom: 0.4rem; transition: all 0.3s ease; position: relative; }
    .oh-step.pending .oh-step-icon { background: #f0f0f0; color: #adb5bd; border: 2px solid #dee2e6; }
    .oh-step.pending .oh-step-label { color: #adb5bd; font-size: 0.75rem; font-weight: 500; }
    .oh-step.pending .oh-step-desc { color: #ced4da; font-size: 0.65rem; }
    .oh-step.active .oh-step-icon { background: #0891b2; color: #fff; border: 2px solid #0891b2; box-shadow: 0 0 0 4px rgba(8, 145, 178, 0.15); }
    .oh-step.active .oh-step-label { color: #0891b2; font-size: 0.75rem; font-weight: 700; }
    .oh-step.active .oh-step-desc { color: #0891b2; font-size: 0.65rem; font-weight: 500; }
    .oh-step.completed .oh-step-icon { background: #198754; color: #fff; border: 2px solid #198754; }
    .oh-step.completed .oh-step-label { color: #198754; font-size: 0.75rem; font-weight: 600; }
    .oh-step.completed .oh-step-desc { color: #6c757d; font-size: 0.65rem; }
    @media (max-width: 768px) { .oh-step-desc { display: none; } .oh-step-icon { width: 36px; height: 36px; font-size: 0.85rem; } .oh-stepper-line { top: 18px; } }
    /* ── Tabs ── */
    .oh-show-tabs { background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; display: flex; list-style: none; margin: 0; }
    .oh-show-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 18px; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s ease; cursor: pointer; font-family: inherit; }
    .oh-show-tabs button:hover { color: #0891b2; }
    .oh-show-tabs button.active { color: #0891b2; border-bottom-color: #0891b2; }
    .oh-show-tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 0.68rem; font-weight: 700; background: rgba(8,145,178,0.1); color: #0891b2; margin-left: 6px; }
    .oh-show-tab-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 0 12px; }
    /* ── Cards / fields ── */
    .oh-show-card { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
    .oh-show-card-bordered { border-left: 4px solid; }
    .oh-show-card-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #f0f2f5; }
    .oh-show-card-header h6 { font-size: 0.88rem; color: #222834; margin: 0; }
    .oh-show-card-body { padding: 16px; }
    .oh-show-card-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; }
    .icon-primary { background: rgba(8,145,178,0.1); color: #0891b2; }
    .icon-success { background: rgba(25,135,84,0.1); color: #198754; }
    .icon-danger { background: rgba(220,53,69,0.1); color: #dc3545; }
    .icon-warning { background: rgba(255,193,7,0.12); color: #e6a200; }
    .icon-info { background: rgba(13,202,240,0.1); color: #0dcaf0; }
    .oh-show-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
    @media (max-width: 991px) { .oh-show-grid-3 { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 576px) { .oh-show-grid-3 { grid-template-columns: 1fr; } }
    .oh-show-field { display: flex; flex-direction: column; gap: 2px; }
    .oh-show-label { font-size: 0.7rem; color: #9ca3af; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
    .oh-show-value { font-size: 0.85rem; font-weight: 600; color: #222834; }
    .oh-show-desc { font-size: 0.84rem; color: #4a5568; line-height: 1.6; background: #f9fafb; padding: 10px 12px; border-radius: 8px; border-left: 3px solid #0891b2; }
    .oh-show-coords { font-size: 0.78rem; color: #6e7891; background: #f8f9fb; display: inline-block; padding: 4px 10px; border-radius: 6px; }
    /* ── Stat row ── */
    .oh-show-stat-row { display: flex; gap: 0; border: 1px solid #e3e6ed; border-radius: 10px; overflow: hidden; }
    .oh-show-stat { flex: 1; text-align: center; padding: 10px 6px; border-right: 1px solid #e3e6ed; }
    .oh-show-stat:last-child { border-right: none; }
    .oh-show-stat-num { font-size: 1.3rem; font-weight: 700; color: #222834; }
    .oh-show-stat-label { font-size: 0.65rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 500; }
    .oh-show-stat-accent .oh-show-stat-num { color: #0891b2; }
    .oh-show-stat-danger .oh-show-stat-num { color: #dc3545; }
    /* ── Directive / dissemination cards ── */
    .oh-show-dir-card, .oh-show-dis-card { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; transition: border-color 0.2s; }
    .oh-show-dir-card:hover, .oh-show-dis-card:hover { border-color: #0891b2; }
    .oh-show-dir-title { font-weight: 600; font-size: 0.88rem; color: #222834; text-decoration: none; display: flex; align-items: center; gap: 4px; }
    .oh-show-dir-title:hover { color: #0891b2; }
    .oh-show-dir-meta { font-size: 0.72rem; color: #9ca3af; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .oh-show-dir-progress-label { font-size: 0.7rem; color: #6e7891; margin-bottom: 3px; display: flex; justify-content: space-between; }
    .oh-show-dis-meta { font-size: 0.72rem; color: #6e7891; }
    .oh-dir-chevron { transition: transform 0.2s; font-size: 0.65rem; }
    .oh-dir-chevron.expanded { transform: rotate(90deg); }
    .oh-dir-detail-panel { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e3e6ed; }
    .oh-dir-section { background: #f9fafb; border: 1px solid #e3e6ed; border-radius: 8px; padding: 12px; }
    .oh-dir-section-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #6e7891; margin-bottom: 8px; }
    .oh-dir-admin-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .oh-dir-admin-bar .btn-sm { font-size: 0.72rem; padding: 3px 10px; border-radius: 6px; }
    /* ── Inline panels ── */
    .oh-show-inline-panel { background: #fff; border: 1px solid rgba(8,145,178,0.3); border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
    .oh-show-inline-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(8,145,178,0.04); border-bottom: 1px solid #e3e6ed; }
    .oh-show-inline-close { background: none; border: none; color: #9ca3af; font-size: 1rem; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: all 0.2s; }
    .oh-show-inline-close:hover { background: rgba(0,0,0,0.05); color: #222834; }
    .oh-show-inline-panel-body { padding: 16px; }
    .oh-show-inline-panel-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f9fafb; border-top: 1px solid #e3e6ed; flex-wrap: wrap; gap: 8px; }
    .oh-show-form-label { font-size: 0.75rem; font-weight: 600; color: #4a5568; margin-bottom: 2px; }
    .oh-show-inline-checklist { border: 1px solid #e3e6ed; border-radius: 8px; padding: 10px 12px; max-height: 160px; overflow-y: auto; background: #f9fafb; }
    .oh-show-inline-checklist .form-check { padding-top: 2px; padding-bottom: 2px; }
    .oh-show-inline-checklist .form-check-label { font-size: 0.8rem; }
    .oh-show-action-btn { background: #0891b2; color: #fff !important; border: none; border-radius: 8px; font-weight: 600; font-size: 0.8rem; transition: all 0.2s; }
    .oh-show-action-btn:hover { opacity: 0.9; color: #fff; }
    /* Track selector */
    .oh-show-track-selector { display: flex; gap: 8px; padding: 4px; background: #f0f2f5; border-radius: 10px; }
    .oh-show-track-btn { flex: 1; padding: 8px 16px; border: none; border-radius: 8px; font-size: 0.8rem; font-weight: 600; color: #6e7891; background: transparent; cursor: pointer; transition: all 0.2s; font-family: inherit; }
    .oh-show-track-btn.active { background: #fff; color: #0891b2; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .oh-show-track-btn:hover:not(.active) { color: #0891b2; }
    /* Success banner */
    .oh-show-success-banner { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 16px; background: rgba(25,135,84,0.06); border: 1px solid rgba(25,135,84,0.2); border-radius: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    /* Action items */
    .oh-show-action-item { padding: 12px 16px; border-bottom: 1px solid #f0f2f5; }
    .oh-show-action-item:last-child { border-bottom: none; }
    .oh-show-action-item:hover { background: #f9fafb; }
    .oh-show-action-slider { width: 70px !important; height: 4px; accent-color: #0891b2; }
    /* Sidebar */
    .oh-show-sidebar-divider { height: 1px; background: #f0f2f5; margin: 0 16px; }
    .oh-show-sidebar-section { padding: 12px 16px; }
    .oh-show-sidebar-section-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6e7891; margin-bottom: 10px; }
    .oh-show-review-box { border: 2px dashed #e3e6ed; border-radius: 10px; padding: 14px; background: #f9fafb; }
    .oh-show-contact { display: flex; align-items: center; gap: 12px; }
    .oh-show-contact-avatar { width: 40px; height: 40px; border-radius: 50%; background: rgba(8,145,178,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .oh-show-contact-avatar i { font-size: 1.3rem; color: #0891b2; }
    .oh-show-contact-name { font-weight: 700; font-size: 0.85rem; color: #222834; }
    .oh-show-contact-detail { font-size: 0.75rem; color: #6e7891; margin-top: 1px; }
    .oh-show-review-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f0f2f5; }
    .oh-show-review-row:last-child { border-bottom: none; }
    .oh-show-review-icon { width: 26px; height: 26px; border-radius: 50%; background: rgba(8,145,178,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #0891b2; font-size: 0.7rem; }
    /* Timeline */
    .oh-show-tl { position: relative; padding-left: 24px; }
    .oh-show-tl-line { position: absolute; left: 10px; top: 4px; bottom: 4px; width: 2px; background: #e3e6ed; }
    .oh-show-tl-item { position: relative; padding-bottom: 18px; }
    .oh-show-tl-item:last-child { padding-bottom: 0; }
    .oh-show-tl-dot { position: absolute; left: -20px; top: 2px; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.55rem; z-index: 1; }
    .oh-show-tl-body { background: #f9fafb; border: 1px solid #e3e6ed; border-radius: 8px; padding: 10px 12px; }
    .oh-show-tl-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
    .oh-show-tl-actor { font-size: 0.8rem; font-weight: 600; color: #222834; }
    .oh-show-tl-role { font-weight: 400; color: #9ca3af; font-size: 0.75rem; }
    .oh-show-tl-time { font-size: 0.7rem; color: #9ca3af; }
    .oh-show-tl-transition { font-size: 0.7rem; color: #6e7891; }
    .oh-show-tl-comment { margin-top: 6px; font-size: 0.8rem; color: #4a5568; padding: 6px 8px; background: #fff; border-radius: 6px; border-left: 2px solid #0891b2; }
    /* Empty / table */
    .oh-show-empty-state { text-align: center; padding: 3rem 1rem; }
    .oh-show-empty-state i { font-size: 2.5rem; color: #d1d5db; margin-bottom: 0.75rem; display: block; }
    .oh-show-empty-state p { font-size: 0.88rem; color: #9ca3af; margin: 0; }
    .oh-show-table { width: 100%; border-collapse: collapse; }
    .oh-show-table thead tr { background: #f8f9fb; }
    .oh-show-table th { font-size: 0.72rem; font-weight: 600; color: #6e7891; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 16px; border-bottom: 1px solid #e3e6ed; text-align: left; }
    .oh-show-table td { font-size: 0.84rem; padding: 10px 16px; border-bottom: 1px solid #f0f2f5; }
    .progress { background: #e9ecef; border-radius: 4px; overflow: hidden; display: flex; }
    .progress-bar { background: #0d6efd; color: #fff; font-size: 0.6rem; display: flex; align-items: center; justify-content: center; transition: width 0.6s ease; }
    .progress-bar.bg-success { background: #198754; }
    .badge { display: inline-block; padding: 0.3em 0.55em; border-radius: 0.375rem; font-size: 0.68rem; font-weight: 700; }
    .badge.bg-success { background: #198754; color: #fff; }
    .badge.bg-warning { background: #ffc107; color: #1e293b; }
    .badge.bg-danger { background: #dc3545; color: #fff; }
    .badge.bg-dark { background: #212529; color: #fff; }
    .badge.bg-secondary { background: #6c757d; color: #fff; }
    .badge.bg-primary { background: #0d6efd; color: #fff; }
    .badge.bg-info { background: #0dcaf0; color: #1e293b; }
  `],
  template: `
    @if (data(); as d) {
      <!-- ═══ Gradient Banner Header ═══ -->
      <div class="oh-show-header">
        <div class="oh-show-breadcrumb">
          <a routerLink="/m/one-health/dashboard"><i class="fas fa-home"></i> One Health</a>
          <i class="fas fa-chevron-right"></i>
          <a routerLink="/m/one-health/events">Events</a>
          <i class="fas fa-chevron-right"></i>
          <span>{{ d.event.event_id }}</span>
        </div>
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mt-2">
          <div>
            <h4 class="oh-show-title mb-2">{{ d.event.event_id }} — {{ d.event.concern_item_name ?? d.event.area_name ?? 'Event' }}</h4>
            <div class="d-flex flex-wrap gap-2">
              <span class="oh-show-badge" [style.background]="typeBg(d.event.event_type)" [style.color]="typeColor(d.event.event_type)">
                <i class="fas fa-tag me-1"></i>{{ ucfirst(d.event.event_type) }}
              </span>
              <span class="oh-show-badge"><i class="fas fa-circle me-1" style="font-size: 0.5rem; vertical-align: middle;"></i>{{ d.event.status_label }}</span>
              @if (d.event.priority_level) {
                <span class="oh-show-badge" [style.color]="prioColor(d.event.priority_level)" style="background: rgba(255,255,255,0.15);">
                  <i class="fas fa-flag me-1"></i>{{ ucfirst(d.event.priority_level) }} Priority
                </span>
              }
            </div>
          </div>
          <div class="d-flex gap-2 mt-1">
            <a routerLink="/m/one-health/events" class="oh-show-header-btn"><i class="fas fa-arrow-left me-1"></i> Back</a>
          </div>
        </div>
      </div>

      <!-- ═══ Coordination of Actions Flow ═══ -->
      <div class="oh-stepper-card">
        <div class="oh-stepper-row">
          <div class="oh-stepper-line"><div class="oh-stepper-fill" [style.width.%]="stepperFill()"></div></div>
          @for (step of steps; track step.key; let i = $index) {
            <div class="oh-step" [class]="'oh-step ' + stepClass(i)" [title]="step.desc">
              <div class="oh-step-icon">
                @if (stepClass(i) === 'completed') { <i class="fas fa-check"></i> }
                @else { <i class="fas" [class]="'fas ' + step.icon"></i> }
              </div>
              <div class="oh-step-label">{{ step.label }}</div>
              <div class="oh-step-desc">{{ step.desc }}</div>
            </div>
          }
        </div>
        @if (d.event.status === 'archived') {
          <div class="text-center mt-2"><span class="badge bg-light text-dark border"><i class="fas fa-archive me-1"></i> This event has been archived</span></div>
        }
        @if (d.has_directives) {
          <div class="text-center mt-2"><small class="text-muted"><i class="fas fa-lock me-1"></i> Event is locked from editing — directives have been issued</small></div>
        }
      </div>

      <div class="row g-3">
        <!-- ═══ Main Content — Tabbed ═══ -->
        <div class="col-lg-8">
          <ul class="oh-show-tabs">
            <li><button [class.active]="tab() === 'overview'" (click)="tab.set('overview')"><i class="fas fa-info-circle me-1"></i> Overview</button></li>
            @if (casesCount() > 0) {
              <li><button [class.active]="tab() === 'cases'" (click)="tab.set('cases')"><i class="fas fa-notes-medical me-1"></i> Cases <span class="oh-show-tab-badge">{{ casesCount() }}</span></button></li>
            }
            <li><button [class.active]="tab() === 'directives'" (click)="tab.set('directives')"><i class="fas fa-bullhorn me-1"></i> Directives @if (d.directives.length) { <span class="oh-show-tab-badge">{{ d.directives.length }}</span> }</button></li>
            <li><button [class.active]="tab() === 'disseminations'" (click)="tab.set('disseminations')"><i class="fas fa-share-alt me-1"></i> Disseminations @if (d.disseminations.length) { <span class="oh-show-tab-badge">{{ d.disseminations.length }}</span> }</button></li>
            <li><button [class.active]="tab() === 'actions'" (click)="tab.set('actions')"><i class="fas fa-tasks me-1"></i> Actions @if (d.action_trackings.length) { <span class="oh-show-tab-badge">{{ d.action_trackings.length }}</span> }</button></li>
          </ul>

          <!-- ══ Tab: Overview ══ -->
          @if (tab() === 'overview') {
            <div class="oh-show-card" style="border-radius: 0 0 12px 12px; margin-top: 0;">
              <div class="oh-show-card-header">
                <div class="oh-show-card-icon icon-primary"><i class="fas fa-clipboard-list"></i></div>
                <h6 class="fw-bold">Event Details</h6>
              </div>
              <div class="oh-show-card-body">
                <div class="oh-show-grid-3">
                  <div class="oh-show-field"><span class="oh-show-label">Reporting Institution</span><span class="oh-show-value">{{ d.event.stakeholder_organization ?? '-' }} <small class="text-muted">({{ d.event.stakeholder_name ?? '' }})</small></span></div>
                  <div class="oh-show-field"><span class="oh-show-label">Area of Concern</span><span class="oh-show-value">{{ d.event.area_name ?? '-' }}</span></div>
                  <div class="oh-show-field"><span class="oh-show-label">Concern Item</span><span class="oh-show-value">{{ d.event.concern_item_name ?? '-' }}</span></div>
                  <div class="oh-show-field"><span class="oh-show-label">Event Type</span><span class="oh-show-value">{{ ucfirst(d.event.event_type) }}</span></div>
                  <div class="oh-show-field"><span class="oh-show-label">Date of Occurrence</span><span class="oh-show-value">{{ formatDate(d.event.date_of_occurrence) }}</span></div>
                  <div class="oh-show-field"><span class="oh-show-label">Risk Level</span><span class="oh-show-value">{{ d.event.risk_level ? ucfirst(d.event.risk_level) : '-' }}</span></div>
                </div>
                @if (d.event.event_description) {
                  <div class="oh-show-desc mt-3"><div class="oh-show-label mb-1">Description</div>{{ d.event.event_description }}</div>
                }
                @if (d.event.recommendation) {
                  <div class="oh-show-desc mt-2" style="border-left-color: #198754;"><div class="oh-show-label mb-1">Recommendation</div>{{ d.event.recommendation }}</div>
                }
              </div>
            </div>

            <div class="oh-show-card">
              <div class="oh-show-card-header">
                <div class="oh-show-card-icon icon-success"><i class="fas fa-map-marker-alt"></i></div>
                <h6 class="fw-bold">Location</h6>
              </div>
              <div class="oh-show-card-body">
                <div class="oh-show-grid-3">
                  <div class="oh-show-field"><span class="oh-show-label">Region</span><span class="oh-show-value">{{ d.event.region_name ?? '-' }}</span></div>
                  <div class="oh-show-field"><span class="oh-show-label">District</span><span class="oh-show-value">{{ d.event.district_name ?? '-' }}</span></div>
                  <div class="oh-show-field"><span class="oh-show-label">Ward</span><span class="oh-show-value">{{ d.event.ward_name ?? d.event.ward_village ?? '-' }}</span></div>
                </div>
                @if (d.event.latitude && d.event.longitude) {
                  <div class="oh-show-coords mt-2"><i class="fas fa-crosshairs me-1"></i> {{ d.event.latitude }}, {{ d.event.longitude }}</div>
                }
              </div>
            </div>

            <div class="oh-show-card">
              <div class="oh-show-card-header">
                <div class="oh-show-card-icon icon-info"><i class="fas fa-user"></i></div>
                <h6 class="fw-bold">Contact Person</h6>
              </div>
              <div class="oh-show-card-body">
                @if (d.event.submitted_by_name) {
                  <div class="oh-show-contact">
                    <div class="oh-show-contact-avatar"><i class="fas fa-user-circle"></i></div>
                    <div>
                      <div class="oh-show-contact-name">{{ d.event.submitted_by_name }}</div>
                    </div>
                  </div>
                } @else {
                  <span class="text-muted" style="font-size: 0.85rem;">No contact information available.</span>
                }
                @if (d.event.reviewed_by_name) {
                  <div class="oh-show-sidebar-section-title mt-3"><i class="fas fa-clipboard-check me-1"></i> Review</div>
                  <div class="oh-show-review-row">
                    <div class="oh-show-review-icon"><i class="fas fa-user-check"></i></div>
                    <div><div class="oh-show-label">Reviewed by</div><div class="oh-show-value">{{ d.event.reviewed_by_name }}</div></div>
                  </div>
                  @if (d.event.review_comments) {
                    <div class="oh-show-review-row">
                      <div class="oh-show-review-icon"><i class="fas fa-comment-dots"></i></div>
                      <div><div class="oh-show-label">Comments</div><div class="oh-show-value">{{ d.event.review_comments }}</div></div>
                    </div>
                  }
                }
              </div>
            </div>
          }

          <!-- ══ Tab: Cases ══ -->
          @if (tab() === 'cases') {
            @if (d.health_detail) {
              <div class="oh-show-card oh-show-card-bordered" style="border-left-color: #dc3545;">
                <div class="oh-show-card-header">
                  <div class="oh-show-card-icon icon-danger"><i class="fas fa-heartbeat"></i></div>
                  <h6 class="fw-bold">Human Cases</h6>
                </div>
                <div class="oh-show-card-body">
                  @if (d.health_detail.disease_name || d.health_detail.disease_status || d.health_detail.transmission_type) {
                    <div class="oh-show-grid-3 mb-3">
                      <div class="oh-show-field"><span class="oh-show-label">Disease</span><span class="oh-show-value">{{ d.health_detail.disease_name ?? '-' }}</span></div>
                      <div class="oh-show-field"><span class="oh-show-label">Status</span><span class="oh-show-value">{{ ucfirst(d.health_detail.disease_status ?? '-') }}</span></div>
                      <div class="oh-show-field"><span class="oh-show-label">Transmission</span><span class="oh-show-value">{{ d.health_detail.transmission_type ?? '-' }}</span></div>
                    </div>
                  }
                  <div class="oh-show-stat-row">
                    <div class="oh-show-stat"><div class="oh-show-stat-num">{{ d.health_detail.cases_male }}</div><div class="oh-show-stat-label">Male</div></div>
                    <div class="oh-show-stat"><div class="oh-show-stat-num">{{ d.health_detail.cases_female }}</div><div class="oh-show-stat-label">Female</div></div>
                    <div class="oh-show-stat"><div class="oh-show-stat-num">{{ d.health_detail.cases_children }}</div><div class="oh-show-stat-label">Children</div></div>
                    <div class="oh-show-stat oh-show-stat-accent"><div class="oh-show-stat-num">{{ d.health_detail.cases_total }}</div><div class="oh-show-stat-label">Total</div></div>
                    <div class="oh-show-stat oh-show-stat-danger"><div class="oh-show-stat-num">{{ d.health_detail.deaths }}</div><div class="oh-show-stat-label">Deaths</div></div>
                    <div class="oh-show-stat"><div class="oh-show-stat-num">{{ d.health_detail.admitted }}</div><div class="oh-show-stat-label">Admitted</div></div>
                  </div>
                  @if (d.health_detail.lab_results) {
                    <div class="oh-show-desc mt-3"><div class="oh-show-label mb-1">Lab Results</div>{{ d.health_detail.lab_results }}</div>
                  }
                </div>
              </div>
            }

            @if (d.animal_entries.length) {
              <div class="oh-show-card oh-show-card-bordered" style="border-left-color: #ffc107;">
                <div class="oh-show-card-header">
                  <div class="oh-show-card-icon icon-warning"><i class="fas fa-paw"></i></div>
                  <h6 class="fw-bold">Animal Cases</h6>
                </div>
                <div class="oh-show-card-body p-0">
                  <table class="oh-show-table">
                    <thead><tr><th>Species</th><th>Cases</th><th>Deaths</th><th>Notes</th></tr></thead>
                    <tbody>
                      @for (animal of d.animal_entries; track animal.id) {
                        <tr>
                          <td class="fw-medium">{{ animal.species === 'other' ? (animal.species_other ?? 'Other') : ucfirst(animal.species) }}</td>
                          <td>{{ animal.cases }}</td>
                          <td>{{ animal.deaths }}</td>
                          <td class="text-muted">{{ animal.notes ?? '-' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            @if (d.environmental_detail) {
              <div class="oh-show-card oh-show-card-bordered" style="border-left-color: #0dcaf0;">
                <div class="oh-show-card-header">
                  <div class="oh-show-card-icon icon-info"><i class="fas fa-cloud-sun"></i></div>
                  <h6 class="fw-bold">Environmental Details</h6>
                </div>
                <div class="oh-show-card-body">
                  <div class="oh-show-grid-3">
                    @if (d.environmental_detail.hazard_name) {
                      <div class="oh-show-field"><span class="oh-show-label">Hazard</span><span class="oh-show-value">{{ d.environmental_detail.hazard_name }}</span></div>
                    }
                    @if (d.environmental_detail.temperature) {
                      <div class="oh-show-field"><span class="oh-show-label">Temperature</span><span class="oh-show-value">{{ d.environmental_detail.temperature }}</span></div>
                    }
                    @if (d.environmental_detail.rainfall) {
                      <div class="oh-show-field"><span class="oh-show-label">Rainfall</span><span class="oh-show-value">{{ d.environmental_detail.rainfall }}</span></div>
                    }
                    @if (d.environmental_detail.wind_speed) {
                      <div class="oh-show-field"><span class="oh-show-label">Wind Speed</span><span class="oh-show-value">{{ d.environmental_detail.wind_speed }}</span></div>
                    }
                  </div>
                  @if (d.environmental_detail.weather_data) {
                    <div class="oh-show-desc mt-2"><div class="oh-show-label mb-1">Weather Data</div>{{ d.environmental_detail.weather_data }}</div>
                  }
                  @if (d.environmental_detail.environmental_impact) {
                    <div class="oh-show-desc mt-2"><div class="oh-show-label mb-1">Environmental Impact</div>{{ d.environmental_detail.environmental_impact }}</div>
                  }
                </div>
              </div>
            }

            @if (d.agricultural_detail) {
              <div class="oh-show-card oh-show-card-bordered" style="border-left-color: #198754;">
                <div class="oh-show-card-header">
                  <div class="oh-show-card-icon icon-success"><i class="fas fa-seedling"></i></div>
                  <h6 class="fw-bold">Agricultural Details</h6>
                </div>
                <div class="oh-show-card-body">
                  <div class="oh-show-grid-3">
                    <div class="oh-show-field"><span class="oh-show-label">Crop/Livestock</span><span class="oh-show-value">{{ d.agricultural_detail.crop_livestock_type ?? '-' }}</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">Pest/Disease</span><span class="oh-show-value">{{ d.agricultural_detail.pest_disease_name ?? '-' }}</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">Area Affected</span><span class="oh-show-value">{{ d.agricultural_detail.area_affected_ha ?? 0 }} ha</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">Severity</span><span class="oh-show-value">{{ ucfirst(d.agricultural_detail.severity_level ?? '-') }}</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">Farmers Affected</span><span class="oh-show-value">{{ d.agricultural_detail.farmers_affected }}</span></div>
                  </div>
                  @if (d.agricultural_detail.impact_description) {
                    <div class="oh-show-desc mt-2"><div class="oh-show-label mb-1">Impact</div>{{ d.agricultural_detail.impact_description }}</div>
                  }
                </div>
              </div>
            }

            @if (d.food_safety_detail) {
              <div class="oh-show-card oh-show-card-bordered" style="border-left-color: #fd7e14;">
                <div class="oh-show-card-header">
                  <div class="oh-show-card-icon icon-warning"><i class="fas fa-utensils"></i></div>
                  <h6 class="fw-bold">Food Safety Details</h6>
                </div>
                <div class="oh-show-card-body">
                  <div class="oh-show-grid-3">
                    <div class="oh-show-field"><span class="oh-show-label">Product</span><span class="oh-show-value">{{ d.food_safety_detail.food_product_name ?? '-' }}</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">Source</span><span class="oh-show-value">{{ d.food_safety_detail.source_producer ?? '-' }}</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">People Affected</span><span class="oh-show-value">{{ d.food_safety_detail.people_affected }}</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">Qty Destroyed</span><span class="oh-show-value">{{ d.food_safety_detail.quantity_destroyed ?? '-' }}</span></div>
                    <div class="oh-show-field"><span class="oh-show-label">Qty Seized</span><span class="oh-show-value">{{ d.food_safety_detail.quantity_seized ?? '-' }}</span></div>
                  </div>
                  @if (d.food_safety_detail.reason_for_confiscation) {
                    <div class="oh-show-desc mt-2"><div class="oh-show-label mb-1">Reason for Confiscation</div>{{ d.food_safety_detail.reason_for_confiscation }}</div>
                  }
                </div>
              </div>
            }
          }

          <!-- ══ Tab: Directives ══ -->
          @if (tab() === 'directives') {
            <div class="oh-show-tab-header">
              <h6 class="mb-0 fw-bold text-muted"><i class="fas fa-bullhorn me-1"></i> Directives ({{ d.directives.length }})</h6>
              <button type="button" class="btn btn-sm oh-show-action-btn" (click)="dirPanelOpen.set(!dirPanelOpen())"><i class="fas fa-plus me-1"></i> Issue Directive</button>
            </div>

            @if (dirPanelOpen()) {
              <div class="oh-show-inline-panel">
                <div class="oh-show-inline-panel-header">
                  <div class="d-flex align-items-center gap-2">
                    <div class="oh-show-card-icon icon-primary"><i class="fas fa-gavel"></i></div>
                    <h6 class="mb-0 fw-bold" style="font-size: 0.88rem;">New Directive</h6>
                  </div>
                  <button type="button" class="oh-show-inline-close" (click)="dirPanelOpen.set(false)"><i class="fas fa-times"></i></button>
                </div>
                <div class="oh-show-inline-panel-body">
                  @if (dirErrors().length) {
                    <div class="alert alert-danger mb-3" style="font-size: 0.82rem;"><ul class="mb-0">@for (e of dirErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
                  }
                  <div class="row g-3">
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Directive Title <span class="text-danger">*</span></label>
                      <input type="text" class="form-control form-control-sm" placeholder="Enter directive title" [(ngModel)]="dirForm.directive_title">
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Action Description <span class="text-danger">*</span></label>
                      <textarea rows="2" class="form-control form-control-sm" placeholder="Describe the required action" [(ngModel)]="dirForm.action_description"></textarea>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label oh-show-form-label">Priority <span class="text-danger">*</span></label>
                      <select class="form-select form-select-sm" [(ngModel)]="dirForm.priority_level">
                        <option value="low">Low</option><option value="medium">Medium</option>
                        <option value="high">High</option><option value="critical">Critical</option>
                      </select>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label oh-show-form-label">Risk Level</label>
                      <select class="form-select form-select-sm" [(ngModel)]="dirForm.risk_level">
                        <option value="">Select</option><option value="low">Low</option><option value="moderate">Moderate</option>
                        <option value="high">High</option><option value="very_high">Very High</option>
                      </select>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label oh-show-form-label">Deadline</label>
                      <input type="date" class="form-control form-control-sm" [(ngModel)]="dirForm.deadline">
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Coordination Notes</label>
                      <textarea rows="2" class="form-control form-control-sm" placeholder="Any coordination notes" [(ngModel)]="dirForm.coordination_notes"></textarea>
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Responsible Stakeholders <span class="text-danger">*</span></label>
                      <div class="oh-show-inline-checklist">
                        @for (s of d.area_stakeholders; track s.id) {
                          <div class="form-check">
                            <input class="form-check-input" type="checkbox" [id]="'ipDirSh' + s.id" [checked]="dirSelected().has(s.id)" (change)="toggleDirStakeholder(s.id)">
                            <label class="form-check-label" [for]="'ipDirSh' + s.id"><strong>{{ s.organization }}</strong> <small class="text-muted">({{ s.name }})</small></label>
                          </div>
                        } @empty { <p class="text-muted mb-0 small">No stakeholders assigned.</p> }
                      </div>
                    </div>
                  </div>
                </div>
                <div class="oh-show-inline-panel-footer">
                  <div class="form-check mb-0">
                    <input class="form-check-input" type="checkbox" id="alsoAddActions" [(ngModel)]="alsoAddActions">
                    <label class="form-check-label" for="alsoAddActions" style="font-size: 0.78rem; color: #6e7891;"><i class="fas fa-tasks me-1"></i> Also add action items after issuing</label>
                  </div>
                  <div class="d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-light" (click)="dirPanelOpen.set(false)">Cancel</button>
                    <button type="button" class="btn btn-sm oh-show-action-btn" [disabled]="dirSubmitting()" (click)="submitDirective()"><i class="fas fa-gavel me-1"></i> Issue Directive</button>
                  </div>
                </div>
              </div>
            }

            @if (dirSuccess()) {
              <div class="oh-show-success-banner">
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                  <i class="fas fa-check-circle text-success"></i>
                  <span style="font-size: 0.82rem;">{{ dirSuccess() }}</span>
                </div>
                <div class="d-flex gap-2 flex-shrink-0">
                  <button type="button" class="btn btn-sm btn-outline-primary" (click)="goToActionsPanel()"><i class="fas fa-tasks me-1"></i> Add Actions</button>
                  <button type="button" class="btn btn-sm btn-outline-success" (click)="dirSuccess.set(''); tab.set('disseminations')"><i class="fas fa-share-alt me-1"></i> Disseminate</button>
                  <button type="button" class="btn btn-sm btn-light" (click)="dirSuccess.set('')"><i class="fas fa-times"></i></button>
                </div>
              </div>
            }

            @for (dir of d.directives; track dir.id) {
              <div class="oh-show-dir-card">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <div class="oh-show-dir-title" style="cursor: pointer;" (click)="toggleDirDetail(dir.id)">
                    <i class="fas fa-chevron-right me-1 text-muted oh-dir-chevron" [class.expanded]="expandedDir() === dir.id"></i>
                    {{ dir.directive_title }}
                  </div>
                  <div class="d-flex gap-1 flex-shrink-0">
                    <span class="badge" [class]="'badge ' + prioBadge(dir.priority_level)">{{ ucfirst(dir.priority_level) }}</span>
                    <span class="badge" [class]="'badge ' + dirStatusBadge(dir.status)">{{ ucfirst(dir.status) }}</span>
                  </div>
                </div>
                <div class="oh-show-dir-meta">
                  @if (dir.deadline_display) {
                    <span [class.text-danger]="dir.is_overdue" [class.fw-semibold]="dir.is_overdue">
                      <i class="fas fa-calendar-alt me-1"></i> {{ dir.deadline_display }} @if (dir.is_overdue) { <small>(overdue)</small> }
                    </span>
                  }
                  <span><i class="fas fa-users me-1"></i> {{ dir.total_stakeholders }} stakeholder{{ dir.total_stakeholders !== 1 ? 's' : '' }}</span>
                  <span><i class="fas fa-check-double me-1"></i> {{ dir.ack_count }}/{{ dir.total_stakeholders }} ack</span>
                  <span><i class="fas fa-chart-line me-1"></i> {{ dir.impl_avg_percentage }}% impl.</span>
                </div>
                @if (dir.total_stakeholders > 0) {
                  <div class="mt-2">
                    <div class="oh-show-dir-progress-label">
                      <span>Acknowledgement</span>
                      <span>{{ dir.ack_count }}/{{ dir.total_stakeholders }} ({{ ackPct(dir) }}%)</span>
                    </div>
                    <div class="progress" style="height: 5px;">
                      <div class="progress-bar" [style.width.%]="ackPct(dir)" style="background: #0891b2;"></div>
                    </div>
                  </div>
                }

                @if (expandedDir() === dir.id) {
                  <div class="oh-dir-detail-panel">
                    @if (dir.action_description) { <div class="oh-show-desc mt-1" style="font-size: 0.82rem;">{{ dir.action_description }}</div> }
                    @if (dir.coordination_notes) { <div class="mt-2" style="font-size: 0.78rem; color: #6e7891;"><strong>Coordination:</strong> {{ dir.coordination_notes }}</div> }

                    <div class="oh-dir-admin-bar mt-3">
                      @if (dir.total_stakeholders - dir.ack_count > 0) {
                        <button type="button" class="btn btn-sm btn-outline-warning" (click)="escalateDirective(dir)"><i class="fas fa-bell me-1"></i> Escalate ({{ dir.total_stakeholders - dir.ack_count }} pending)</button>
                      }
                      <a class="btn btn-sm btn-outline-secondary" [routerLink]="['/m/one-health/directives', dir.id]"><i class="fas fa-edit me-1"></i> Edit</a>
                    </div>

                    @if (dir.total_stakeholders > 0) {
                      <div class="oh-dir-section mt-3">
                        <div class="oh-dir-section-title"><i class="fas fa-check-double me-1"></i> Acknowledgement Status</div>
                        <table class="oh-show-table">
                          <thead><tr><th>Institution</th><th>Status</th><th>Date</th><th>Notes</th></tr></thead>
                          <tbody>
                            @for (s of dir.stakeholders; track s.id) {
                              <tr>
                                <td><strong style="font-size: 0.8rem;">{{ s.organization }}</strong><br><small class="text-muted">{{ s.name }}</small></td>
                                <td>
                                  @if (s.acknowledgement_status === 'acknowledged') { <span class="badge bg-success">Acknowledged</span> }
                                  @else if (s.acknowledgement_status === 'declined') { <span class="badge bg-danger">Declined</span> }
                                  @else { <span class="badge bg-warning">Pending</span> }
                                </td>
                                <td style="font-size: 0.78rem;">{{ s.acknowledged_at ?? '-' }}</td>
                                <td style="font-size: 0.78rem;">{{ s.response_notes ?? '-' }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>

                      <div class="oh-dir-section mt-3">
                        <div class="oh-dir-section-title"><i class="fas fa-chart-line me-1"></i> Implementation Progress — {{ dir.impl_avg_percentage }}% overall</div>
                        <table class="oh-show-table">
                          <thead><tr><th>Institution</th><th>Status</th><th>Progress</th><th>Last Update</th><th>Notes</th></tr></thead>
                          <tbody>
                            @for (s of dir.stakeholders; track s.id) {
                              <tr>
                                <td><strong style="font-size: 0.8rem;">{{ s.organization }}</strong></td>
                                <td><span class="badge" [class]="'badge ' + implBadge(s.implementation_status)">{{ ucfirst(s.implementation_status ?? 'not_started') }}</span></td>
                                <td style="min-width: 90px;">
                                  <div class="progress" style="height: 12px;">
                                    <div class="progress-bar" [class.bg-success]="(s.implementation_percentage ?? 0) >= 100" [style.width.%]="s.implementation_percentage ?? 0">{{ s.implementation_percentage ?? 0 }}%</div>
                                  </div>
                                </td>
                                <td style="font-size: 0.78rem;">{{ s.last_update_at ?? '-' }}</td>
                                <td style="font-size: 0.78rem;">{{ limit(s.implementation_notes ?? '-', 40) }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }
                  </div>
                }
              </div>
            } @empty {
              <div class="oh-show-empty-state"><i class="fas fa-bullhorn"></i><p>No directives have been issued for this event.</p></div>
            }
          }

          <!-- ══ Tab: Disseminations ══ -->
          @if (tab() === 'disseminations') {
            <div class="oh-show-tab-header">
              <h6 class="mb-0 fw-bold text-muted"><i class="fas fa-share-alt me-1"></i> Disseminations ({{ d.disseminations.length }})</h6>
              <button type="button" class="btn btn-sm oh-show-action-btn" (click)="dissPanelOpen.set(!dissPanelOpen())"><i class="fas fa-plus me-1"></i> Create Dissemination</button>
            </div>

            @if (dissPanelOpen()) {
              <div class="oh-show-inline-panel">
                <div class="oh-show-inline-panel-header">
                  <div class="d-flex align-items-center gap-2">
                    <div class="oh-show-card-icon icon-success"><i class="fas fa-broadcast-tower"></i></div>
                    <h6 class="mb-0 fw-bold" style="font-size: 0.88rem;">New Dissemination</h6>
                  </div>
                  <button type="button" class="oh-show-inline-close" (click)="dissPanelOpen.set(false)"><i class="fas fa-times"></i></button>
                </div>
                <div class="oh-show-inline-panel-body">
                  @if (dissErrors().length) {
                    <div class="alert alert-danger mb-3" style="font-size: 0.82rem;"><ul class="mb-0">@for (e of dissErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
                  }
                  <div class="oh-show-track-selector mb-3">
                    <button type="button" class="oh-show-track-btn" [class.active]="dissTrack() === 'stakeholder'" (click)="dissTrack.set('stakeholder')"><i class="fas fa-building me-1"></i> Stakeholder Alert</button>
                    <button type="button" class="oh-show-track-btn" [class.active]="dissTrack() === 'public'" (click)="dissTrack.set('public')"><i class="fas fa-users me-1"></i> Public Alert</button>
                  </div>

                  <div class="row g-3">
                    @if (dissTrack() === 'stakeholder') {
                      <div class="col-md-6">
                        <label class="form-label oh-show-form-label">Sector <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" placeholder="e.g., Health, Agriculture" [(ngModel)]="dissForm.sector">
                      </div>
                    } @else {
                      <div class="col-md-6">
                        <label class="form-label oh-show-form-label">Target Audience <span class="text-danger">*</span></label>
                        <div class="d-flex flex-wrap gap-2">
                          @for (aud of audiences; track aud.value) {
                            <div class="form-check">
                              <input class="form-check-input" type="checkbox" [id]="'ipTa' + aud.value" [checked]="dissAudience().has(aud.value)" (change)="toggleAudience(aud.value)">
                              <label class="form-check-label small" [for]="'ipTa' + aud.value">{{ aud.label }}</label>
                            </div>
                          }
                        </div>
                      </div>
                    }
                    <div class="col-md-6">
                      <label class="form-label oh-show-form-label">Language</label>
                      <select class="form-select form-select-sm" [(ngModel)]="dissForm.language">
                        <option value="both">Both (English & Swahili)</option>
                        <option value="en">English Only</option>
                        <option value="sw">Swahili Only</option>
                      </select>
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Alert Message (English) <span class="text-danger">*</span></label>
                      <textarea rows="2" class="form-control form-control-sm" placeholder="Enter the alert message" [(ngModel)]="dissForm.alert_message"></textarea>
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Alert Message (Swahili)</label>
                      <textarea rows="2" class="form-control form-control-sm" placeholder="Swahili version (optional)" [(ngModel)]="dissForm.alert_message_sw"></textarea>
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Directives <span class="text-danger">*</span></label>
                      <textarea rows="2" class="form-control form-control-sm" maxlength="500" placeholder="Key directives" [(ngModel)]="dissForm.directives"></textarea>
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Channels <span class="text-danger">*</span></label>
                      <div class="d-flex gap-3 flex-wrap">
                        @for (ch of (dissTrack() === 'stakeholder' ? stakeholderChannels : publicChannels); track ch.value) {
                          <div class="form-check">
                            <input class="form-check-input" type="checkbox" [id]="'ipCh' + ch.value" [checked]="dissChannels().has(ch.value)" (change)="toggleChannel(ch.value)">
                            <label class="form-check-label small" [for]="'ipCh' + ch.value">{{ ch.label }}</label>
                          </div>
                        }
                      </div>
                    </div>
                    @if (dissTrack() === 'stakeholder') {
                      <div class="col-md-12">
                        <label class="form-label oh-show-form-label">Select Stakeholders <span class="text-danger">*</span></label>
                        <div class="oh-show-inline-checklist">
                          @for (s of d.area_stakeholders; track s.id) {
                            <div class="form-check">
                              <input class="form-check-input" type="checkbox" [id]="'ipDStk' + s.id" [checked]="dissSelected().has(s.id)" (change)="toggleDissStakeholder(s.id)">
                              <label class="form-check-label" [for]="'ipDStk' + s.id"><strong>{{ s.organization }}</strong> <small class="text-muted">({{ s.name }})</small></label>
                            </div>
                          }
                        </div>
                        <div class="mt-1">
                          <button type="button" class="btn btn-sm btn-link p-0 text-muted" style="font-size: 0.72rem;" (click)="selectAllDissStakeholders(true)">Select All</button>
                          <button type="button" class="btn btn-sm btn-link p-0 text-muted ms-2" style="font-size: 0.72rem;" (click)="selectAllDissStakeholders(false)">Clear</button>
                        </div>
                      </div>
                    }
                    <div class="col-12 border-top pt-2">
                      <label class="form-label oh-show-form-label"><i class="fas fa-file-excel me-1 text-success"></i> Or Upload Recipients (CSV/Excel)</label>
                      <input type="file" class="form-control form-control-sm" accept=".xlsx,.xls,.csv" (change)="onDissFile($event)">
                      <small class="text-muted" style="font-size: 0.72rem;">Columns: Name, Phone, Email, Organization.</small>
                    </div>
                  </div>
                </div>
                <div class="oh-show-inline-panel-footer">
                  <div></div>
                  <div class="d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-light" (click)="dissPanelOpen.set(false)">Cancel</button>
                    <button type="button" class="btn btn-sm oh-show-action-btn" [disabled]="dissSubmitting()" (click)="submitDissemination()">
                      <i class="fas fa-paper-plane me-1"></i> {{ dissTrack() === 'stakeholder' ? 'Send Stakeholder Alert' : 'Send Public Alert' }}
                    </button>
                  </div>
                </div>
              </div>
            }

            @for (dis of d.disseminations; track dis.id) {
              <div class="oh-show-dis-card">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <a [routerLink]="['/m/one-health/dissemination', dis.id]" class="oh-show-dir-title">{{ dis.alert_message }}</a>
                  <span class="badge" [class]="'badge ' + (dis.dissemination_type === 'stakeholder' ? 'bg-primary' : 'bg-success')">{{ ucfirst(dis.dissemination_type) }}</span>
                </div>
                <div class="d-flex flex-wrap gap-2 align-items-center">
                  <span class="badge" [class]="'badge ' + approvalBadge(dis.approval_status)">{{ ucfirst(dis.approval_status) }}</span>
                  <span class="badge" [class]="'badge ' + dissStatusBadge(dis.status)">{{ ucfirst(dis.status) }}</span>
                  <span class="oh-show-dis-meta"><i class="fas fa-sms me-1"></i>{{ dis.sms_sent_count }} SMS <i class="fas fa-envelope ms-2 me-1"></i>{{ dis.email_sent_count }} Email</span>
                  <span class="oh-show-dis-meta ms-auto"><i class="fas fa-calendar me-1"></i>{{ dis.created_at }}</span>
                </div>
              </div>
            } @empty {
              <div class="oh-show-empty-state"><i class="fas fa-share-alt"></i><p>No disseminations have been created for this event.</p></div>
            }
          }

          <!-- ══ Tab: Actions ══ -->
          @if (tab() === 'actions') {
            <div class="oh-show-tab-header">
              <h6 class="mb-0 fw-bold text-muted"><i class="fas fa-tasks me-1"></i> Action Items ({{ d.action_trackings.length }})</h6>
              <div class="d-flex gap-2">
                <a class="btn btn-sm btn-outline-secondary" [routerLink]="['/m/one-health/events', d.event.id, 'actions']" style="font-size: 0.75rem;"><i class="fas fa-external-link-alt me-1"></i> Tracking Board</a>
                <button type="button" class="btn btn-sm oh-show-action-btn" (click)="actionPanelOpen.set(!actionPanelOpen())"><i class="fas fa-plus me-1"></i> Add Action</button>
              </div>
            </div>

            @if (actionPanelOpen()) {
              <div class="oh-show-inline-panel">
                <div class="oh-show-inline-panel-header">
                  <div class="d-flex align-items-center gap-2">
                    <div class="oh-show-card-icon" style="background: rgba(102,16,242,0.1); color: #6610f2;"><i class="fas fa-clipboard-check"></i></div>
                    <h6 class="mb-0 fw-bold" style="font-size: 0.88rem;">New Action Item</h6>
                  </div>
                  <button type="button" class="oh-show-inline-close" (click)="actionPanelOpen.set(false)"><i class="fas fa-times"></i></button>
                </div>
                <div class="oh-show-inline-panel-body">
                  @if (actionErrors().length) {
                    <div class="alert alert-danger mb-3" style="font-size: 0.82rem;"><ul class="mb-0">@for (e of actionErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
                  }
                  <div class="row g-3">
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Action Title <span class="text-danger">*</span></label>
                      <input type="text" class="form-control form-control-sm" placeholder="Enter action title" [(ngModel)]="actionForm.action_title">
                    </div>
                    <div class="col-md-12">
                      <label class="form-label oh-show-form-label">Description</label>
                      <textarea rows="2" class="form-control form-control-sm" placeholder="Describe the action item" [(ngModel)]="actionForm.action_description"></textarea>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label oh-show-form-label">Link to Directive</label>
                      <select class="form-select form-select-sm" [(ngModel)]="actionForm.directive_id">
                        <option value="">-- No specific directive --</option>
                        @for (dir of d.directives; track dir.id) { <option [value]="dir.id">{{ dir.directive_title }}</option> }
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label oh-show-form-label">Responsible Stakeholder</label>
                      <select class="form-select form-select-sm" [(ngModel)]="actionForm.stakeholder_id">
                        <option value="">-- Select stakeholder --</option>
                        @for (s of d.area_stakeholders; track s.id) { <option [value]="s.id">{{ s.organization }}</option> }
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label oh-show-form-label">Target Date</label>
                      <input type="date" class="form-control form-control-sm" [(ngModel)]="actionForm.target_date">
                    </div>
                    <div class="col-md-6">
                      <label class="form-label oh-show-form-label">Remarks</label>
                      <input type="text" class="form-control form-control-sm" placeholder="Any remarks" [(ngModel)]="actionForm.remarks">
                    </div>
                  </div>
                </div>
                <div class="oh-show-inline-panel-footer">
                  <div style="font-size: 0.78rem; color: #198754;" [style.display]="actionAddCount() > 0 ? 'block' : 'none'">
                    <i class="fas fa-check me-1"></i> {{ actionAddCount() }} action{{ actionAddCount() > 1 ? 's' : '' }} added
                  </div>
                  <div class="d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-light" (click)="closeActionPanel()">Done</button>
                    <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="actionSubmitting()" (click)="submitAction(true)"><i class="fas fa-plus me-1"></i> Add & Continue</button>
                    <button type="button" class="btn btn-sm oh-show-action-btn" [disabled]="actionSubmitting()" (click)="submitAction(false)"><i class="fas fa-check me-1"></i> Add Action</button>
                  </div>
                </div>
              </div>
            }

            @for (dir of d.directives; track dir.id) {
              @if (actionsFor(dir.id).length) {
                <div class="oh-show-card oh-show-card-bordered" style="border-left-color: #6610f2;">
                  <div class="oh-show-card-header">
                    <div class="oh-show-card-icon" style="background: rgba(102,16,242,0.1); color: #6610f2;"><i class="fas fa-bullhorn"></i></div>
                    <div>
                      <h6 class="fw-bold" style="font-size: 0.85rem;">{{ limit(dir.directive_title, 50) }}</h6>
                      <small class="text-muted">{{ actionsFor(dir.id).length }} action{{ actionsFor(dir.id).length !== 1 ? 's' : '' }} &middot; Deadline: {{ dir.deadline_display ?? 'None' }}</small>
                    </div>
                  </div>
                  <div class="oh-show-card-body p-0">
                    @for (action of actionsFor(dir.id); track action.id) {
                      <ng-container *ngTemplateOutlet="hubAction; context: { action }" />
                    }
                  </div>
                </div>
              }
            }

            @if (unlinkedActions().length) {
              <div class="oh-show-card oh-show-card-bordered" style="border-left-color: #6c757d;">
                <div class="oh-show-card-header">
                  <div class="oh-show-card-icon" style="background: rgba(108,117,125,0.1); color: #6c757d;"><i class="fas fa-clipboard-list"></i></div>
                  <h6 class="fw-bold" style="font-size: 0.85rem;">General Actions</h6>
                </div>
                <div class="oh-show-card-body p-0">
                  @for (action of unlinkedActions(); track action.id) {
                    <ng-container *ngTemplateOutlet="hubAction; context: { action }" />
                  }
                </div>
              </div>
            }

            @if (!d.action_trackings.length) {
              <div class="oh-show-empty-state">
                <i class="fas fa-tasks"></i>
                <p>No action items yet.</p>
                <button type="button" class="btn btn-sm oh-show-action-btn mt-2" (click)="actionPanelOpen.set(true)"><i class="fas fa-plus me-1"></i> Add First Action</button>
              </div>
            }
          }
        </div>

        <!-- ═══ Sidebar ═══ -->
        <div class="col-lg-4">
          <div class="oh-show-card">
            <div class="oh-show-sidebar-section">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-semibold" style="color: #222834; font-size: 0.82rem;">Event Progress</span>
                <span class="fw-bold" [style.color]="gaugeColor()" style="font-size: 0.88rem;">{{ d.event.completion_percentage }}%</span>
              </div>
              <div class="progress" style="height: 6px;">
                <div class="progress-bar" [style.width.%]="d.event.completion_percentage" [style.background]="gaugeColor()"></div>
              </div>
              <div class="oh-show-label mt-1" style="font-size: 0.7rem;">Submitted by {{ d.event.submitted_by_name ?? '-' }}</div>
            </div>

            @if (d.event.status === 'submitted' && d.can_review) {
              <div class="oh-show-sidebar-divider"></div>
              <div class="oh-show-sidebar-section">
                <div class="oh-show-sidebar-section-title"><i class="fas fa-search me-1"></i> Review This Event</div>
                <div class="oh-show-review-box">
                  <div class="mb-2">
                    <textarea rows="2" class="form-control form-control-sm" placeholder="Add review notes..." [(ngModel)]="reviewForm.review_comments"></textarea>
                  </div>
                  <div class="row g-2 mb-2">
                    <div class="col-6">
                      <select class="form-select form-select-sm" [(ngModel)]="reviewForm.priority_level">
                        <option value="">Priority</option><option value="low">Low</option><option value="medium">Medium</option>
                        <option value="high">High</option><option value="critical">Critical</option>
                      </select>
                    </div>
                    <div class="col-6">
                      <select class="form-select form-select-sm" [(ngModel)]="reviewForm.risk_level">
                        <option value="">Risk Level</option><option value="low">Low</option><option value="moderate">Moderate</option>
                        <option value="high">High</option><option value="very_high">Very High</option>
                      </select>
                    </div>
                  </div>
                  <button type="button" class="btn btn-sm w-100 oh-show-action-btn" (click)="submitReview()"><i class="fas fa-check-circle me-1"></i> Mark Under Review</button>
                </div>
              </div>
            }

            @if (d.event.status !== 'closed' && d.event.status !== 'archived' && d.event.completion_percentage >= 100) {
              <div class="oh-show-sidebar-divider"></div>
              <div class="oh-show-sidebar-section">
                <div class="oh-show-sidebar-section-title"><i class="fas fa-flag-checkered me-1"></i> Close Event</div>
                <div class="oh-show-review-box">
                  <div class="mb-2"><textarea rows="2" class="form-control form-control-sm" placeholder="Outcome summary..." [(ngModel)]="closeForm.outcome_summary"></textarea></div>
                  <div class="mb-2"><textarea rows="2" class="form-control form-control-sm" placeholder="Lessons learned (optional)..." [(ngModel)]="closeForm.lessons_learned"></textarea></div>
                  <div class="row g-2 mb-2">
                    <div class="col-6"><input type="date" class="form-control form-control-sm" [(ngModel)]="closeForm.closure_date"></div>
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Comments" [(ngModel)]="closeForm.comments"></div>
                  </div>
                  <button type="button" class="btn btn-sm w-100 btn-success" (click)="submitClose()"><i class="fas fa-flag-checkered me-1"></i> Close Event</button>
                </div>
              </div>
            } @else if (d.event.status === 'closed') {
              <div class="oh-show-sidebar-divider"></div>
              <div class="oh-show-sidebar-section">
                <div class="d-flex align-items-center gap-2" style="font-size: 0.8rem;">
                  <i class="fas fa-check-circle text-success"></i>
                  <span><strong>Closed</strong>@if (d.event.closure_date) { on {{ formatDate(d.event.closure_date) }}}</span>
                </div>
                @if (d.event.outcome_summary) {
                  <div class="oh-show-desc mt-2" style="font-size: 0.78rem;">{{ limit(d.event.outcome_summary, 120) }}</div>
                }
                <button type="button" class="btn btn-sm w-100 btn-outline-secondary mt-2" (click)="submitArchive()"><i class="fas fa-archive me-1"></i> Archive Event</button>
              </div>
            }
          </div>

          <div class="oh-show-card">
            <div class="oh-show-card-header">
              <div class="oh-show-card-icon icon-primary"><i class="fas fa-history"></i></div>
              <h6 class="fw-bold">Workflow Timeline</h6>
              @if (d.workflow_histories.length) { <span class="oh-show-tab-badge ms-auto">{{ d.workflow_histories.length }}</span> }
            </div>
            <div class="oh-show-card-body">
              @if (d.workflow_histories.length) {
                <div class="oh-show-tl">
                  <div class="oh-show-tl-line"></div>
                  @for (h of d.workflow_histories; track $index) {
                    <div class="oh-show-tl-item">
                      <div class="oh-show-tl-dot" [style.background]="tlColor(h.action)"><i [class]="h.action_icon" style="font-size: 0.55rem;"></i></div>
                      <div class="oh-show-tl-body">
                        <div class="oh-show-tl-header">
                          <span class="badge bg-secondary">{{ h.action_label }}</span>
                          @if (h.from_status && h.to_status) {
                            <span class="oh-show-tl-transition">{{ ucfirst(h.from_status) }} &rarr; {{ ucfirst(h.to_status) }}</span>
                          }
                        </div>
                        <div class="oh-show-tl-actor">{{ h.user_name }} @if (h.performed_by_role) { <span class="oh-show-tl-role">({{ h.performed_by_role }})</span> }</div>
                        <div class="oh-show-tl-time">{{ h.created_at }}</div>
                        @if (h.comments) { <div class="oh-show-tl-comment">{{ h.comments }}</div> }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="oh-show-empty-state" style="padding: 1.5rem 0;"><i class="fas fa-history"></i><p>No workflow history yet.</p></div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Hub action item template -->
      <ng-template #hubAction let-action="action">
        <div class="oh-show-action-item">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1 me-3">
              <div class="fw-semibold" style="font-size: 0.85rem; color: #222834;">{{ action.action_title }}</div>
              @if (action.action_description) { <div class="text-muted" style="font-size: 0.78rem;">{{ limit(action.action_description, 100) }}</div> }
              <div class="oh-show-dir-meta mt-1">
                @if (action.stakeholder_organization) { <span><i class="fas fa-building me-1"></i>{{ action.stakeholder_organization }}</span> }
                @if (action.target_date_display) {
                  <span [class.text-danger]="action.is_overdue">
                    <i class="fas fa-calendar-alt me-1"></i>{{ action.target_date_display }} @if (action.is_overdue) { <small>(overdue)</small> }
                  </span>
                }
              </div>
            </div>
            <div class="text-end" style="min-width: 130px;">
              <span class="badge mb-1" [class]="'badge ' + actionBadgeClass(action.status)">{{ ucfirst(action.status) }}</span>
              <div class="d-flex align-items-center gap-2">
                <input type="range" class="form-range flex-grow-1 oh-show-action-slider" min="0" max="100" step="5"
                  [value]="action.completion_percentage" (change)="updateActionProgress(action, $event)">
                <span class="badge bg-secondary" style="min-width: 36px;">{{ action.completion_percentage }}%</span>
              </div>
            </div>
          </div>
        </div>
      </ng-template>
    }
  `,
})
export class OhEventShowComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  readonly steps = WORKFLOW_STEPS;
  readonly audiences = [
    { value: 'public', label: 'General Public' }, { value: 'mdas', label: 'MDAs' },
    { value: 'ert', label: 'Emergency Response' }, { value: 'partners', label: 'Partners' },
  ];
  readonly stakeholderChannels = [{ value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }];
  readonly publicChannels = [
    { value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' },
    { value: 'media', label: 'Media' }, { value: 'social', label: 'Social' },
  ];

  data = signal<ShowResponse | null>(null);
  tab = signal<'overview' | 'cases' | 'directives' | 'disseminations' | 'actions'>('overview');
  expandedDir = signal<number | null>(null);

  // directive inline panel
  dirPanelOpen = signal(false);
  dirErrors = signal<string[]>([]);
  dirSubmitting = signal(false);
  dirSelected = signal(new Set<number>());
  dirSuccess = signal('');
  alsoAddActions = false;
  dirForm = { directive_title: '', action_description: '', deadline: '', priority_level: 'medium', risk_level: '', coordination_notes: '' };

  // dissemination inline panel
  dissPanelOpen = signal(false);
  dissTrack = signal<'stakeholder' | 'public'>('stakeholder');
  dissErrors = signal<string[]>([]);
  dissSubmitting = signal(false);
  dissSelected = signal(new Set<number>());
  dissAudience = signal(new Set<string>(['public']));
  dissChannels = signal(new Set<string>(['sms', 'email']));
  dissFile: File | null = null;
  dissForm = { sector: '', language: 'both', alert_message: '', alert_message_sw: '', directives: '' };

  // action inline panel
  actionPanelOpen = signal(false);
  actionErrors = signal<string[]>([]);
  actionSubmitting = signal(false);
  actionAddCount = signal(0);
  actionForm = { action_title: '', action_description: '', directive_id: '', stakeholder_id: '', target_date: '', remarks: '' };

  reviewForm = { review_comments: '', priority_level: '', risk_level: '' };
  closeForm = { outcome_summary: '', lessons_learned: '', closure_date: new Date().toISOString().substring(0, 10), comments: '' };

  casesCount = computed(() => {
    const d = this.data();
    if (!d) { return 0; }
    return [d.health_detail, d.animal_entries.length > 0 ? true : null, d.environmental_detail,
      d.agricultural_detail, d.food_safety_detail].filter(Boolean).length;
  });

  unlinkedActions = computed(() => (this.data()?.action_trackings ?? []).filter(a => !a.directive_id));

  private get id(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    ensureSweetAlert();
    // #tabDirectives-style deep links from other screens
    const fragment = this.route.snapshot.fragment;
    if (fragment?.startsWith('tab')) {
      const t = fragment.substring(3).toLowerCase();
      if (['overview', 'cases', 'directives', 'disseminations', 'actions'].includes(t)) { this.tab.set(t as any); }
    }
    this.load();
  }

  load(): void {
    this.http.get<ShowResponse>(`/api/v1/onehealth/events/${this.id}`).subscribe(d => this.data.set(d));
  }

  actionsFor(directiveId: number): HubAction[] {
    return (this.data()?.action_trackings ?? []).filter(a => a.directive_id === directiveId);
  }

  // ── stepper ──

  currentStepIndex(): number {
    const status = this.data()?.event.status;
    return this.steps.findIndex(s => s.key === status);
  }

  stepClass(i: number): string {
    if (this.data()?.event.status === 'archived') { return 'completed'; }
    const cur = this.currentStepIndex();
    if (cur === -1) { return 'pending'; }
    return i < cur ? 'completed' : i === cur ? 'active' : 'pending';
  }

  stepperFill(): number {
    if (this.data()?.event.status === 'archived') { return 100; }
    const cur = this.currentStepIndex();
    return cur >= 0 ? (cur / (this.steps.length - 1)) * 100 : 0;
  }

  // ── directives ──

  toggleDirDetail(id: number): void {
    this.expandedDir.set(this.expandedDir() === id ? null : id);
  }

  toggleDirStakeholder(id: number): void {
    const next = new Set(this.dirSelected());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.dirSelected.set(next);
  }

  ackPct(dir: HubDirective): number {
    return dir.total_stakeholders > 0 ? Math.round((dir.ack_count / dir.total_stakeholders) * 100) : 0;
  }

  submitDirective(): void {
    const payload: any = {
      directive_title: this.dirForm.directive_title.trim(),
      action_description: this.dirForm.action_description.trim(),
      deadline: this.dirForm.deadline || null,
      priority_level: this.dirForm.priority_level,
      risk_level: this.dirForm.risk_level || null,
      coordination_notes: this.dirForm.coordination_notes.trim() || null,
      stakeholder_ids: [...this.dirSelected()],
    };
    this.dirSubmitting.set(true);
    this.dirErrors.set([]);
    this.http.post<any>(`/api/v1/onehealth/events/${this.id}/directives`, payload).subscribe({
      next: res => {
        this.dirSubmitting.set(false);
        this.dirPanelOpen.set(false);
        this.dirForm = { directive_title: '', action_description: '', deadline: '', priority_level: 'medium', risk_level: '', coordination_notes: '' };
        this.dirSelected.set(new Set());
        if (this.alsoAddActions) {
          this.load();
          this.goToActionsPanel();
        } else {
          this.dirSuccess.set(res.message ?? 'Directive issued successfully!');
          this.load();
        }
      },
      error: err => {
        this.dirSubmitting.set(false);
        this.dirErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  goToActionsPanel(): void {
    this.dirSuccess.set('');
    this.tab.set('actions');
    setTimeout(() => this.actionPanelOpen.set(true), 300);
  }

  escalateDirective(dir: HubDirective): void {
    const pending = dir.total_stakeholders - dir.ack_count;
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Escalate Directive?', text: `Send reminder to ${pending} unacknowledged stakeholder(s)?`,
        icon: 'warning', showCancelButton: true, confirmButtonText: 'Send Reminders', confirmButtonColor: '#e6a200',
      }).then((result: any) => {
        if (!result.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/onehealth/directives/${dir.id}/escalate`, {}).subscribe({
          next: data => Swal.fire({ icon: data.info ? 'info' : (data.success === false ? 'warning' : 'success'), title: data.info ? 'Already acknowledged' : (data.success === false ? 'Not sent' : 'Reminders sent'), text: data.message ?? data.info, timer: 3500, timerProgressBar: true }),
          error: err => Swal.fire('Error', err?.error?.message ?? 'Failed to escalate.', 'error'),
        });
      });
    });
  }

  // ── disseminations ──

  toggleDissStakeholder(id: number): void {
    const next = new Set(this.dissSelected());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.dissSelected.set(next);
  }

  selectAllDissStakeholders(all: boolean): void {
    this.dissSelected.set(all ? new Set((this.data()?.area_stakeholders ?? []).map(s => s.id)) : new Set());
  }

  toggleAudience(v: string): void {
    const next = new Set(this.dissAudience());
    if (next.has(v)) { next.delete(v); } else { next.add(v); }
    this.dissAudience.set(next);
  }

  toggleChannel(v: string): void {
    const next = new Set(this.dissChannels());
    if (next.has(v)) { next.delete(v); } else { next.add(v); }
    this.dissChannels.set(next);
  }

  onDissFile(ev: Event): void {
    this.dissFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
  }

  submitDissemination(): void {
    const isStakeholder = this.dissTrack() === 'stakeholder';
    const channels = [...this.dissChannels()];
    if (!channels.length) {
      ensureSweetAlert().then(() => Swal.fire('Error', 'Please select at least one channel.', 'error'));
      return;
    }
    if (isStakeholder && !this.dissSelected().size && !this.dissFile) {
      ensureSweetAlert().then(() => Swal.fire('Error', 'Select at least one stakeholder or upload a file.', 'error'));
      return;
    }
    if (!isStakeholder && !this.dissAudience().size && !this.dissFile) {
      ensureSweetAlert().then(() => Swal.fire('Error', 'Select at least one target audience or upload a file.', 'error'));
      return;
    }
    const fd = new FormData();
    fd.set('alert_message', this.dissForm.alert_message.trim());
    if (this.dissForm.alert_message_sw.trim()) { fd.set('alert_message_sw', this.dissForm.alert_message_sw.trim()); }
    fd.set('directives', this.dissForm.directives.trim());
    fd.set('language', this.dissForm.language);
    channels.forEach(c => fd.append('channels', c));
    if (isStakeholder) {
      fd.set('sector', this.dissForm.sector.trim());
      [...this.dissSelected()].forEach(id => fd.append('stakeholder_ids', String(id)));
    } else {
      [...this.dissAudience()].forEach(a => fd.append('target_audience', a));
    }
    if (this.dissFile) { fd.set('recipient_file', this.dissFile); }

    const url = `/api/v1/onehealth/events/${this.id}/disseminations/${isStakeholder ? 'stakeholder' : 'public'}`;
    this.dissSubmitting.set(true);
    this.dissErrors.set([]);
    this.http.post<any>(url, fd).subscribe({
      next: res => {
        this.dissSubmitting.set(false);
        this.dissPanelOpen.set(false);
        this.dissForm = { sector: '', language: 'both', alert_message: '', alert_message_sw: '', directives: '' };
        this.dissSelected.set(new Set());
        this.dissFile = null;
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Sent!', text: res.message, timer: 2500, timerProgressBar: true })
          .then(() => this.load()));
      },
      error: err => {
        this.dissSubmitting.set(false);
        this.dissErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  // ── actions ──

  submitAction(keepOpen: boolean): void {
    const payload = {
      action_title: this.actionForm.action_title.trim(),
      action_description: this.actionForm.action_description.trim() || null,
      directive_id: this.actionForm.directive_id || null,
      stakeholder_id: this.actionForm.stakeholder_id || null,
      target_date: this.actionForm.target_date || null,
      remarks: this.actionForm.remarks.trim() || null,
    };
    this.actionSubmitting.set(true);
    this.actionErrors.set([]);
    this.http.post<any>(`/api/v1/onehealth/events/${this.id}/actions`, payload).subscribe({
      next: () => {
        this.actionSubmitting.set(false);
        this.actionAddCount.set(this.actionAddCount() + 1);
        const keepDirective = this.actionForm.directive_id;
        this.actionForm = { action_title: '', action_description: '', directive_id: keepOpen ? keepDirective : '', stakeholder_id: '', target_date: '', remarks: '' };
        if (!keepOpen) {
          this.actionPanelOpen.set(false);
          this.actionAddCount.set(0);
          this.load();
        }
      },
      error: err => {
        this.actionSubmitting.set(false);
        this.actionErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  closeActionPanel(): void {
    this.actionPanelOpen.set(false);
    if (this.actionAddCount() > 0) {
      this.actionAddCount.set(0);
      this.load();
    }
  }

  updateActionProgress(action: HubAction, ev: Event): void {
    const value = Number((ev.target as HTMLInputElement).value);
    this.http.post<any>(`/api/v1/onehealth/actions/${action.id}/progress`, { completion_percentage: value }).subscribe({
      next: () => this.load(),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  // ── sidebar forms ──

  submitReview(): void {
    const payload = {
      review_comments: this.reviewForm.review_comments.trim() || null,
      priority_level: this.reviewForm.priority_level || null,
      risk_level: this.reviewForm.risk_level || null,
    };
    this.http.post<any>(`/api/v1/onehealth/events/${this.id}/review`, payload).subscribe({
      next: res => ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Success', text: res.message, timer: 2000, showConfirmButton: false }).then(() => this.load())),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  submitClose(): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Close this event?', text: 'This action marks the event as resolved.', icon: 'question',
        showCancelButton: true, confirmButtonColor: '#198754', confirmButtonText: 'Close Event',
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        const payload = {
          outcome_summary: this.closeForm.outcome_summary.trim(),
          lessons_learned: this.closeForm.lessons_learned.trim() || null,
          closure_date: this.closeForm.closure_date || null,
          comments: this.closeForm.comments.trim() || null,
        };
        this.http.post<any>(`/api/v1/onehealth/events/${this.id}/close`, payload).subscribe({
          next: r => Swal.fire({ icon: 'success', title: 'Closed!', text: r.message, timer: 2500, timerProgressBar: true }).then(() => this.load()),
          error: err => Swal.fire('Error', err?.error?.errors ? Object.values(err.error.errors as Record<string, string[]>).flat().join(' ') : err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  submitArchive(): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Archive this event?', text: 'Closed events can be archived to remove them from active workflows.', icon: 'question',
        showCancelButton: true, confirmButtonColor: '#6c757d', confirmButtonText: 'Archive Event',
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/onehealth/events/${this.id}/archive`, {}).subscribe({
          next: r => Swal.fire({ icon: 'success', title: 'Archived!', text: r.message, timer: 2500, timerProgressBar: true }).then(() => this.load()),
          error: err => Swal.fire('Error', err?.error?.errors ? Object.values(err.error.errors as Record<string, string[]>).flat().join(' ') : err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  // ── formatting (verbatim maps from the Blade) ──

  typeColor(t: string): string {
    return ({ outbreak: '#c62828', incident: '#e65100', surveillance: '#2e7d32' } as Record<string, string>)[t] ?? '#fff';
  }

  typeBg(t: string): string {
    return ({ outbreak: 'rgba(198,40,40,0.18)', incident: 'rgba(230,81,0,0.18)', surveillance: 'rgba(46,125,50,0.18)' } as Record<string, string>)[t] ?? 'rgba(255,255,255,0.18)';
  }

  prioColor(p: string): string {
    return ({ critical: '#dc3545', high: '#fd7e14', medium: '#0d6efd', low: '#6c757d' } as Record<string, string>)[p] ?? '#fff';
  }

  prioBadge(p: string): string {
    return ({ critical: 'bg-danger', high: 'bg-warning', medium: 'bg-primary', low: 'bg-secondary' } as Record<string, string>)[p] ?? 'bg-secondary';
  }

  dirStatusBadge(s: string): string {
    return ({ issued: 'bg-primary', acknowledged: 'bg-info', in_progress: 'bg-warning', completed: 'bg-success', overdue: 'bg-danger' } as Record<string, string>)[s] ?? 'bg-secondary';
  }

  implBadge(s: string | null): string {
    return ({ in_progress: 'bg-warning', completed: 'bg-success', delayed: 'bg-danger', blocked: 'bg-dark' } as Record<string, string>)[s ?? ''] ?? 'bg-secondary';
  }

  approvalBadge(s: string): string {
    return ({ pending: 'bg-warning', approved: 'bg-success', rejected: 'bg-danger' } as Record<string, string>)[s] ?? 'bg-secondary';
  }

  dissStatusBadge(s: string): string {
    return ({ pending_approval: 'bg-warning', approved: 'bg-info', sent: 'bg-success', failed: 'bg-danger' } as Record<string, string>)[s] ?? 'bg-secondary';
  }

  actionBadgeClass(s: string): string {
    return ({ completed: 'bg-success', in_progress: 'bg-warning', overdue: 'bg-danger', pending: 'bg-secondary' } as Record<string, string>)[s] ?? 'bg-secondary';
  }

  tlColor(action: string): string {
    return ({
      submitted: '#0891b2', reviewed: '#0d6efd', directive_issued: '#6610f2', disseminated: '#20c997',
      monitoring: '#fd7e14', closed: '#198754', archived: '#6c757d', status_change: '#0dcaf0',
    } as Record<string, string>)[action] ?? '#0891b2';
  }

  gaugeColor(): string {
    const pct = this.data()?.event.completion_percentage ?? 0;
    return pct < 25 ? '#dc3545' : pct < 50 ? '#fd7e14' : pct < 75 ? '#ffc107' : '#198754';
  }

  formatDate(iso: string | null): string {
    if (!iso) { return '-'; }
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  ucfirst(s: string): string {
    return (s ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }

  limit(s: string | null | undefined, max: number): string {
    if (!s) { return ''; }
    return s.length <= max ? s : s.substring(0, max).trimEnd() + '...';
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
