import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { escapeHtml } from '../../core/html';
import { addTanzaniaDarkBase, addMapNav } from '../../core/tz-map';
import { PageHeaderComponent } from '../../shell/page-header.component';

declare const L: any;   // Leaflet 1.9.4, loaded globally in index.html
declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/** Posture → alert colour (SWIO / Madagascar convention, mirrored in V41 posture_doctrine). */
const POSTURE_COLOUR: Record<string, string> = {
  monitoring: '#22c55e', emergency: '#eab308', disaster: '#ef4444', safeguard: '#3b82f6',
};
const POSTURE_ORDER = ['monitoring', 'emergency', 'disaster', 'safeguard'];

/**
 * Command Post — the R11b doctrine surface (NDPRP 2022 + Disaster Management Act 2022).
 *
 * One coordinated live environment with four operational components:
 *   • Virtual Simulation  — any activation flagged is_simulation; identical machinery, zero ops impact
 *   • During Monitoring   — posture 'monitoring' (TEPRP 1, Green): forecast received, all 15 DRFs on call
 *   • In Emergency        — posture 'emergency' (TEPRP 2, Yellow): direct threat, evacuations begin
 *   • In Disaster Events  — posture 'disaster' (TEPRP 3, Red): impact, full activation
 *   ( + 'safeguard' (Blue): post-passage de-escalation — never jump Red→stood-down )
 *
 * The marquee flow is anticipatory: a tropical cyclone is forecast → DMD opens the post from the
 * forecast (no incident yet) → the board animates the storm along its forecast track with a
 * landfall countdown → posture walks the ladder → on impact an incident is created and linked.
 * Builds on the R11 DRF-lane board (72-hour clock, lanes, critical tasks, challenges, timeline).
 */
@Component({
    selector: 'page-command-center',
    imports: [FormsModule, RouterLink, UpperCasePipe, DecimalPipe, PageHeaderComponent],
    styles: [`
    :host { display: block; background: #0f172a; margin: -16px; padding: 16px; min-height: calc(100vh - 60px); }
    .card { background: #1c2536; border: 1px solid #2c3a50; border-radius: 6px; padding: 13px 15px; color: #e2e8f0; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
    .card h4 { margin: 0 0 9px; font-size: 0.75rem; text-transform: uppercase; color: #93a7c4; letter-spacing: 0.9px; font-weight: 800; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .card h4 i { color: #557092; }
    .row-item { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px dashed #334155; font-size: 0.82rem; }
    .badge { font-size: 0.75rem; font-weight: 700; border-radius: 8px; padding: 1px 8px; }
    .b-live { background: #14532d; color: #4ade80; } .b-sim { background: #4c1d95; color: #c4b5fd; }
    .b-sev { background: #7f1d1d; color: #fecaca; } .b-fcast { background: #0c4a6e; color: #7dd3fc; }
    .btn { font-size: 0.78rem; padding: 6px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 700; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: transparent; border-color: #475569; color: #cbd5e1; }
    .b-amber { background: #d97706; color: #fff; } .b-blue { background: #2563eb; color: #fff; } .b-green { background: #16a34a; color: #fff; }
    .b-red:hover { background: #c82333; } .b-outline:hover { background: #1e293b; } .b-amber:hover { background: #b45309; } .b-blue:hover { background: #1d4ed8; } .b-green:hover { background: #15803d; }
    .clockbar { display: grid; grid-template-columns: 1fr auto auto auto; gap: 18px; align-items: center;
      background: #17263d; border-color: #33485f; padding: 12px 18px; }
    .clock { font-size: 1.75rem; font-weight: 800; color: #4ade80; font-variant-numeric: tabular-nums; }
    .clock.danger { color: #f87171; }
    .progress-rail { background: #334155; border-radius: 6px; height: 12px; overflow: hidden; }
    .progress-fill { background: #fb8c00; height: 100%; }
    .lanes { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    .lane { background: #1c2536; border: 1px solid #2c3a50; border-left: 4px solid var(--drf, #dc3545); border-radius: 6px; padding: 10px 12px; color: #e2e8f0; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.25); transition: border-color .14s ease; }
    .lane:hover { border-color: var(--drf, #dc3545); background: #222d40; }
    .lane b { font-size: 0.8rem; display: block; }
    .lane small { color: #94a3b8; font-size: 0.75rem; }
    .lane .mini-rail { background: #334155; border-radius: 4px; height: 7px; margin-top: 6px; overflow: hidden; }
    .lane .mini-fill { background: #4ade80; height: 100%; }
    .split { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
    .feed { font-size: 0.76rem; padding: 6px 0; border-bottom: 1px dashed #334155; }
    .feed b { color: #f1f5f9; }
    .drawer-back { position: fixed; inset: 0; background: rgba(2,6,23,0.7); z-index: 1100; display: flex; justify-content: flex-end; }
    .drawer { width: 600px; max-width: 95vw; background: #0f172a; border-left: 1px solid #334155; height: 100%; overflow-y: auto; color: #e2e8f0; }
    .drawer-head { background: #1e293b; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; border-bottom: 1px solid #334155; }
    .drawer-body { padding: 14px 18px; }
    .task { border: 1px solid #334155; border-radius: 8px; padding: 9px 11px; margin-bottom: 8px; font-size: 0.8rem; }
    .task .meta { color: #94a3b8; font-size: 0.75rem; margin: 3px 0; }
    select, input { background: #1e293b; border: 1px solid #475569; color: #e2e8f0; border-radius: 6px; font-size: 0.76rem; padding: 4px 8px; font-family: inherit; }
    .crit { border-left: 3px solid #f87171; background: #1e293b; border-radius: 6px; padding: 7px 10px; margin-bottom: 6px; font-size: 0.78rem; }
    .empty { color: #64748b; font-size: 0.8rem; text-align: center; padding: 18px 0; }
    .aar-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 8px 0 12px; }
    .aar-stat { background: #1e293b; border-radius: 9px; padding: 8px 10px; text-align: center; }
    .aar-stat b { display: block; font-size: 1.15rem; color: #c4b5fd; }
    .aar-stat small { color: #94a3b8; font-size: 0.75rem; }
    .aar-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .aar-cols h5 { font-size: 0.75rem; color: #a78bfa; text-transform: uppercase; margin: 0 0 4px; }
    @media (max-width: 900px) { .aar-cols { grid-template-columns: 1fr; } }
    .inj-st { font-size: 0.75rem; font-weight: 800; text-transform: uppercase; border-radius: 6px; padding: 1px 6px; background: #334155; color: #cbd5e1; }
    .inj-st[data-s=fired] { background: #7c2d12; color: #fdba74; }
    .inj-st[data-s=resolved] { background: #14532d; color: #4ade80; }
    .btn-xs { font-size: 0.75rem; font-weight: 700; border: 1px solid #475569; background: #1e293b; color: #cbd5e1; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
    .btn-xs:hover { background: #334155; }
    .btn-xs.go { background: #16a34a; border-color: #16a34a; color: #fff; }
    .btn-xs.go:hover { background: #15803d; }
    .inj-form { border-top: 1px dashed #334155; margin-top: 8px; padding-top: 8px; display: flex; flex-direction: column; gap: 5px; }
    .inj-form input, .inj-form select { background: #0f172a; border: 1px solid #334155; color: #e2e8f0; border-radius: 7px; padding: 5px 8px; font-size: 0.76rem; }
    .inj-row { display: flex; gap: 5px; align-items: center; }
    .inj-row input { width: 110px; }
    /* Index ops-status strip + richer active-response rows */
    .ops-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .ops-stat { background: #1c2536; border: 1px solid #2c3a50; border-radius: 6px; padding: 11px 14px; display: flex; flex-direction: column; gap: 3px; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
    .ops-n { font-size: 1.55rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .ops-l { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #8aa0bd; font-weight: 700; display: flex; align-items: center; gap: 5px; }
    .ops-l i { color: #557092; }
    .act-row { background: #1c2536; border: 1px solid #2c3a50; border-left: 3px solid #dc3545; border-radius: 6px; padding: 10px 13px; margin-bottom: 8px; }
    .act-head { display: flex; align-items: center; gap: 9px; }
    .act-title { flex: 1; font-size: 0.86rem; color: #f1f5f9; }
    .act-foot { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
    .act-bar { flex: 1; max-width: 340px; height: 7px; background: #334155; border-radius: 4px; overflow: hidden; }
    .act-fill { display: block; height: 100%; border-radius: 4px; transition: width .3s ease; }
    .act-num { font-size: 0.75rem; color: #cbd5e1; font-variant-numeric: tabular-nums; }
    .act-by { font-size: 0.75rem; color: #64748b; margin-left: auto; }
    /* Command Post doctrine */
    .doctrine { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .doc-step { border: 1px solid #334155; border-radius: 10px; padding: 9px 11px; position: relative; }
    .doc-step .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    .doc-step b { font-size: 0.75rem; } .doc-step small { color: #94a3b8; font-size: 0.75rem; display: block; margin-top: 2px; }
    .ladder { display: flex; gap: 6px; align-items: stretch; flex-wrap: wrap; }
    .rung { flex: 1; min-width: 150px; border: 1px solid #334155; border-radius: 9px; padding: 8px 10px; opacity: 0.45; transition: opacity .2s, box-shadow .2s, background .2s; }
    .rung.on { opacity: 1; border-width: 2px; background: color-mix(in srgb, currentColor 12%, transparent); box-shadow: 0 0 0 1px currentColor inset; }
    .rung b { font-size: 0.78rem; } .rung small { color: #94a3b8; font-size: 0.75rem; display: block; }
    .countdown { font-size: 2.3rem; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 1px; line-height: 1.1; }
    .stormmap { height: 500px; border-radius: 10px; overflow: hidden; border: 1px solid #334155; }
    .leaflet-container { background: #0b1220; }
    .ready-grp { margin-bottom: 10px; } .ready-grp .lbl { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
    .ready-item { font-size: 0.76rem; padding: 4px 0; border-bottom: 1px dashed #334155; display: flex; justify-content: space-between; gap: 8px; }
    .pill { font-size: 0.75rem; font-weight: 700; padding: 1px 7px; border-radius: 7px; background: #334155; color: #cbd5e1; }
    .area-chip { font-size: 0.75rem; background: #0c4a6e; color: #7dd3fc; border-radius: 8px; padding: 2px 10px; margin: 0 4px 4px 0; display: inline-block; }
    .scenario-row { border: 1px solid #334155; border-left: 3px solid #a78bfa; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; background: #17263d; }
    .scenario-title { color: #f1f5f9; font-size: 0.86rem; font-weight: 800; }
    .scenario-meta { color: #94a3b8; font-size: 0.75rem; display: flex; gap: 8px; flex-wrap: wrap; margin-top: 3px; }
    .scenario-tags { margin-top: 6px; display: flex; gap: 5px; flex-wrap: wrap; }
    .plan-card { border: 1px solid #334155; border-left: 3px solid #38bdf8; border-radius: 8px; padding: 7px 10px; margin-bottom: 6px; font-size: 0.76rem; }
    .plan-card .acts { margin: 4px 0; padding-left: 16px; color: #cbd5e1; }
    .plan-card .acts li { margin: 1px 0; }
    label.fld { display: block; font-size: 0.75rem; color: #94a3b8; margin: 8px 0 3px; }
    .track-pt { font-size: 0.75rem; color: #7dd3fc; }
    /* ICS org chart (F05) — flat command register: role cards in doctrine rows */
    .ics-row { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(195px, 1fr)); }
    .ics-row.ics-sec { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); margin-top: 8px; }
    .ics-card { background: #17263d; border: 1px solid #33485f; border-radius: 6px; padding: 9px 11px; display: flex; flex-direction: column; }
    .ics-card.ic { border-left: 3px solid #dc3545; }
    .ics-card.vacant { border-style: dashed; background: transparent; }
    .ics-role { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.6px; color: #8aa0bd; font-weight: 800; }
    .ics-holder { font-size: 0.85rem; color: #f1f5f9; font-weight: 700; margin-top: 3px; }
    .ics-holder i { color: #4ade80; margin-right: 4px; }
    .ics-meta { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
    .ics-vac { color: #f59e0b; font-weight: 800; font-size: 0.78rem; margin-top: 3px; }
    .ics-actions { display: flex; gap: 5px; margin-top: 7px; }
    .ics-lanes { border-top: 1px dashed #334155; margin-top: 8px; padding-top: 6px; display: flex; flex-direction: column; gap: 3px; }
    .ics-lane { font-size: 0.75rem; color: #cbd5e1; display: flex; gap: 6px; align-items: center; cursor: pointer; padding: 1px 0; }
    .ics-lane:hover { color: #7dd3fc; }
    .ics-lane .pc { margin-left: auto; color: #64748b; font-variant-numeric: tabular-nums; }
    .ics-dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
    .refresh-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #4ade80; margin-right: 5px; box-shadow: 0 0 0 4px rgba(74,222,128,0.12); }
    .mini-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 7px; margin-bottom: 9px; }
    .mini-stat { background: #17263d; border: 1px solid #33485f; border-radius: 6px; padding: 7px 9px; }
    .mini-stat b { display: block; font-size: 1.05rem; color: #f1f5f9; line-height: 1.1; }
    .mini-stat span { color: #8aa0bd; font-size: 0.7rem; text-transform: uppercase; font-weight: 800; }
    .logi-row, .sitrep-row { border: 1px solid #334155; border-radius: 6px; padding: 8px 10px; margin-bottom: 7px; background: #17263d; font-size: 0.77rem; }
    .logi-head { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
    .logi-title { flex: 1; font-weight: 800; color: #f1f5f9; }
    .logi-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 7px; }
    .qbar { background: #0f172a; border-radius: 5px; height: 7px; overflow: hidden; border: 1px solid #334155; }
    .qbar span { display: block; height: 100%; background: #38bdf8; }
    .qbar.delivered span { background: #4ade80; }
    .sitrep-row b { color: #f1f5f9; }
    .sitrep-meta { display: flex; gap: 8px; flex-wrap: wrap; margin: 5px 0; color: #cbd5e1; }
    .sitrep-remark { color: #94a3b8; margin-top: 4px; }
    /* Full Response Ops Hub — Command Post as entry to every Response function */
    .hub-snap { display: grid; grid-template-columns: repeat(auto-fit, minmax(108px, 1fr)); gap: 7px; margin-bottom: 12px; }
    .hub-snap .mini-stat b { font-size: 1.1rem; color: #7dd3fc; }
    .hub-snap .mini-stat.hot b { color: #fbbf24; }
    .hub-groups { display: flex; flex-direction: column; gap: 12px; }
    .hub-group-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.7px; color: #8aa0bd; font-weight: 800; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    .hub-group-label .pill { background: #334155; color: #cbd5e1; }
    .hub-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
    a.hub-tile { display: flex; flex-direction: column; gap: 4px; background: #17263d; border: 1px solid #33485f; border-radius: 8px; padding: 10px 12px; text-decoration: none; color: #e2e8f0; transition: border-color .14s, background .14s, transform .12s; min-height: 92px; }
    a.hub-tile:hover { border-color: #38bdf8; background: #1c2f4a; transform: translateY(-1px); }
    a.hub-tile.hot { border-color: #b45309; box-shadow: 0 0 0 1px rgba(251,191,36,0.15) inset; }
    a.hub-tile .hub-top { display: flex; align-items: flex-start; gap: 8px; }
    a.hub-tile .hub-ico { width: 28px; height: 28px; border-radius: 7px; background: #0f172a; border: 1px solid #334155; display: flex; align-items: center; justify-content: center; color: #7dd3fc; flex: 0 0 auto; }
    a.hub-tile.hot .hub-ico { color: #fbbf24; border-color: #92400e; }
    a.hub-tile .hub-name { font-size: 0.8rem; font-weight: 800; color: #f1f5f9; line-height: 1.25; flex: 1; }
    a.hub-tile .hub-count { font-size: 1.05rem; font-weight: 800; color: #7dd3fc; font-variant-numeric: tabular-nums; line-height: 1; }
    a.hub-tile.hot .hub-count { color: #fbbf24; }
    a.hub-tile .hub-cl { font-size: 0.68rem; color: #8aa0bd; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px; }
    a.hub-tile .hub-desc { font-size: 0.72rem; color: #94a3b8; line-height: 1.3; margin-top: 2px; }
    .hub-toggle { margin-left: auto; }
    .hub-quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .hub-quick a { font-size: 0.72rem; font-weight: 700; color: #7dd3fc; text-decoration: none; border: 1px solid #33485f; border-radius: 999px; padding: 3px 10px; background: #0f172a; }
    .hub-quick a:hover { border-color: #38bdf8; background: #1c2f4a; }
  `],
    template: `
    <dmis-page-header title="Command Post — Disaster Response Coordination" icon="fa-tower-broadcast"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Command Post'}]">
      <a routerLink="/m/response/eocc" class="btn-add"><i class="fas fa-terminal"></i> EOCC Board</a>
      <a routerLink="/m/response/executive-watch" class="btn-add"><i class="fas fa-binoculars"></i> Executive Watch</a>
      <a routerLink="/m/response/dashboard" class="btn-add"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
    </dmis-page-header>

    <!-- ══════════ ACTIVATIONS INDEX ══════════ -->
    @if (!board()) {
      <!-- Operations status — the command dashboard header -->
      <div class="ops-strip">
        <div class="ops-stat"><span class="ops-n" style="color:#4ade80">{{ activeCount() }}</span><span class="ops-l"><i class="fas fa-bolt"></i> Active responses</span></div>
        <div class="ops-stat"><span class="ops-n" style="color:#7dd3fc">{{ anticipatoryCount() }}</span><span class="ops-l"><i class="fas fa-hurricane"></i> Anticipatory (forecast)</span></div>
        <div class="ops-stat"><span class="ops-n" style="color:#c4b5fd">{{ simCount() }}</span><span class="ops-l"><i class="fas fa-vial"></i> Simulations</span></div>
        <div class="ops-stat"><span class="ops-n" style="color:#fbbf24">{{ awaitingCount() }}</span><span class="ops-l"><i class="fas fa-hourglass-half"></i> Awaiting activation</span></div>
        <div class="ops-stat"><span class="ops-n" [style.color]="highestPosture() ? colour(highestPosture()) : '#64748b'">{{ highestPosture() ? (highestPosture() | uppercase) : 'IDLE' }}</span><span class="ops-l"><i class="fas fa-gauge-high"></i> Highest posture</span></div>
      </div>

      <!-- Full Response Ops Hub — single entry to every Response function -->
      @if (index().response_hub; as hub) {
        <div class="card">
          <h4>
            <i class="fas fa-th-large"></i> {{ hub.title || 'Full Response Ops Hub' }}
            <button class="btn-xs hub-toggle" (click)="hubOpen.set(!hubOpen())">
              {{ hubOpen() ? 'Collapse' : 'Expand' }}
            </button>
          </h4>
          <div style="color:#94a3b8; font-size:0.78rem; margin:-4px 0 10px">{{ hub.subtitle }}</div>
          @if (hub.snapshot; as snap) {
            <div class="hub-snap">
              <div class="mini-stat" [class.hot]="num(snap.critical_incidents) > 0"><b>{{ snap.critical_incidents || 0 }}</b><span>critical</span></div>
              <div class="mini-stat"><b>{{ snap.active_incidents || 0 }}</b><span>incidents</span></div>
              <div class="mini-stat" [class.hot]="num(snap.issued_alerts) > 0"><b>{{ snap.issued_alerts || 0 }}</b><span>alerts out</span></div>
              <div class="mini-stat" [class.hot]="num(snap.public_reports_open) > 0"><b>{{ snap.public_reports_open || 0 }}</b><span>public queue</span></div>
              <div class="mini-stat" [class.hot]="num(snap.assessments_pending) > 0"><b>{{ snap.assessments_pending || 0 }}</b><span>assess pending</span></div>
              <div class="mini-stat" [class.hot]="num(snap.resource_approvals_pending) > 0"><b>{{ snap.resource_approvals_pending || 0 }}</b><span>res. approvals</span></div>
              <div class="mini-stat" [class.hot]="num(snap.dispatch_approvals_pending) > 0"><b>{{ snap.dispatch_approvals_pending || 0 }}</b><span>dispatch gate</span></div>
              <div class="mini-stat"><b>{{ snap.open_tasks || 0 }}</b><span>open tasks</span></div>
              <div class="mini-stat" [class.hot]="num(snap.declarations_in_chain) > 0"><b>{{ snap.active_declarations || 0 }}/{{ snap.declarations_in_chain || 0 }}</b><span>declarations</span></div>
              <div class="mini-stat"><b>{{ snap.stock_units || 0 }}</b><span>stock units</span></div>
            </div>
          }
          @if (hubOpen()) {
            <div class="hub-groups">
              @for (g of hub.groups ?? []; track g.key) {
                <div>
                  <div class="hub-group-label">{{ g.label }}
                    @if (num(g.attention_total) > 0) { <span class="pill">{{ g.attention_total }} in queue</span> }
                  </div>
                  <div class="hub-tiles">
                    @for (it of g.items ?? []; track it.key) {
                      <a class="hub-tile" [class.hot]="it.attention" [routerLink]="hubPath(it.path)" [queryParams]="hubQuery(it.path)">
                        <div class="hub-top">
                          <span class="hub-ico"><i class="fas {{ it.icon }}"></i></span>
                          <span class="hub-name">{{ it.name }}</span>
                          @if (it.count != null) {
                            <span style="text-align:right">
                              <div class="hub-count">{{ it.count }}</div>
                              <div class="hub-cl">{{ it.count_label }}</div>
                            </span>
                          }
                        </div>
                        <div class="hub-desc">{{ it.description }}</div>
                      </a>
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="hub-quick">
              @for (it of hubQuickLinks(); track it.key) {
                <a [routerLink]="hubPath(it.path)" [queryParams]="hubQuery(it.path)"><i class="fas {{ it.icon }}"></i> {{ it.name }}
                  @if (it.count != null && num(it.count) > 0) { ({{ it.count }}) }</a>
              }
            </div>
          }
        </div>
      }

      <!-- Doctrine: the four operational components (NDPRP 2022 / DM Act 2022) -->
      <div class="card">
        <h4><i class="fas fa-compass"></i> Command Post Doctrine — four operational components</h4>
        <div class="doctrine">
          <div class="doc-step" style="border-color:#4c1d95">
            <b><span class="dot" style="background:#a78bfa"></span>Virtual Simulation</b>
            <small>Any activation run as a flagged drill — identical board, zero impact on live operations.</small>
          </div>
          @for (p of doctrine(); track p.posture) {
            <div class="doc-step" [style.border-color]="colour(p.posture)">
              <b><span class="dot" [style.background]="colour(p.posture)"></span>{{ componentName(p.posture) }}</b>
              <small>{{ p.teprp_level }} · {{ p.alert_colour }} · {{ p.lead_time }} — {{ p.alert_label }}</small>
            </div>
          }
        </div>
        <div style="margin-top:10px">
          <button class="btn b-blue" (click)="toggleForecastForm()">
            <i class="fas fa-hurricane"></i> {{ showForecast() ? 'Close' : 'Open Anticipatory Activation (forecast)' }}
          </button>
        </div>
      </div>

      <div class="card">
        <h4><i class="fas fa-book-open"></i> Exercise Scenario Library
          <button class="btn-xs" style="margin-left:auto" (click)="loadScenarios()"><i class="fas fa-rotate"></i> Refresh</button></h4>
        @for (s of scenarios(); track s.id) {
          <div class="scenario-row">
            <div>
              <div class="scenario-title">{{ s.title }}</div>
              <div class="scenario-meta">
                <span>{{ s.hazard }}</span>
                <span>{{ s.incident_count }} incident templates</span>
                <span>{{ s.event_count }} MSEL events</span>
                <span>{{ s.participant_count }} rostered</span>
                <span>{{ s.default_time_compression }}x clock</span>
              </div>
              <div class="scenario-tags">
                @for (r of listText(s.regions); track r) { <span class="area-chip">{{ r }}</span> }
                @if (s.last_launched_at) { <span class="pill">last run {{ s.last_launched_at?.substring(0, 16)?.replace('T', ' ') }}</span> }
              </div>
            </div>
            <button class="btn b-blue" (click)="launchScenario(s)"><i class="fas fa-play"></i> Launch Exercise</button>
          </div>
        } @empty { <div class="empty">No exercise scenarios are available.</div> }
      </div>

      <!-- Anticipatory activation launcher (the cyclone-coming scenario) -->
      @if (showForecast()) {
        <div class="card">
          <h4><i class="fas fa-hurricane"></i> Open the Command Post from a forecast</h4>
          <div class="split">
            <div>
              <label class="fld">Issued warning</label>
              <select style="width:100%" [(ngModel)]="fWarningId" (ngModelChange)="applySelectedWarning()">
                <option value="">Manual / off-platform forecast</option>
                @for (w of issuedWarnings(); track w.warning_id) {
                  <option [value]="w.warning_id">{{ w.warning_code }} · {{ w.hazard || 'Warning' }} · {{ w.affected_areas || w.regions || 'area pending' }}</option>
                }
              </select>
              <label class="fld">Forecast hazard</label>
              <input style="width:100%" [(ngModel)]="fHazard" [readonly]="!!fWarningId" placeholder="e.g. Tropical Cyclone — heavy rain + destructive winds">
              <label class="fld">Forecast-impact areas (regions, comma-separated)</label>
              <input style="width:100%" [(ngModel)]="fAreas" [readonly]="!!fWarningId" placeholder="e.g. Mtwara, Lindi, Pwani">
              <label class="fld">Expected impact / landfall (ETA)</label>
              <input style="width:100%" type="datetime-local" [(ngModel)]="fEta">
              <label class="fld" style="display:flex; align-items:center; gap:8px; margin-top:10px">
                <input type="checkbox" [(ngModel)]="fSim" style="width:auto"> Run as a Virtual Simulation drill
                @if (fSim) {
                  <label style="display:block;margin-top:4px;font-weight:400">
                    <input type="checkbox" [(ngModel)]="fRealOps" style="width:auto"> Full-scale exercise — allow REAL operations (stock, dispatch, [DRILL]-marked comms)
                  </label>
                }
              </label>
              <label class="fld">Forecast track — click the map to drop track points (last = landfall)</label>
              <div class="track-pt">{{ fTrack().length }} point(s) plotted
                @if (fTrack().length) { · <a style="color:#f87171; cursor:pointer" (click)="clearTrack()">clear</a> }</div>
              <div style="margin-top:10px; display:flex; gap:6px">
                <button class="btn b-outline" (click)="loadCycloneDemo()"><i class="fas fa-wand-magic-sparkles"></i> Load SWIO cyclone demo</button>
                <button class="btn b-blue" [disabled]="!fWarningId && (!fHazard.trim() || !fAreas.trim())" (click)="submitForecast()">
                  <i class="fas fa-tower-broadcast"></i> Open Command Post
                </button>
              </div>
            </div>
            <div>
              <div id="forecastMap" class="stormmap" style="height:500px"></div>
            </div>
          </div>
        </div>
      }

      <div class="card"><h4><i class="fas fa-bolt"></i> Active Responses</h4>
        @for (a of index().active ?? []; track a.id) {
          <div class="act-row" [style.border-left-color]="colour(a.posture)">
            <div class="act-head">
              <span class="badge" [class]="a.is_simulation ? 'b-sim' : (a.trigger_type === 'forecast' ? 'b-fcast' : 'b-live')">
                {{ a.is_simulation ? 'SIMULATION' : (a.trigger_type === 'forecast' ? 'ANTICIPATORY' : 'LIVE') }}</span>
              <span class="pill" [style.color]="colour(a.posture)" [style.border]="'1px solid ' + colour(a.posture)" style="background:transparent">{{ (a.posture || 'disaster') | uppercase }}</span>
              @if (a.scenario_title) { <span class="pill" style="background:#2e1065;color:#c4b5fd">{{ a.run_code }}</span> }
              <b class="act-title">{{ a.incident_title }}</b>
              <button class="btn b-red" (click)="openBoard(a.id)">Open Post</button>
            </div>
            <div class="act-foot">
              <span class="act-bar"><span class="act-fill" [style.width.%]="pct(a)" [style.background]="colour(a.posture)"></span></span>
              <span class="act-num">{{ a.completed_tasks }}/{{ a.total_tasks }} tasks · {{ pct(a) }}%</span>
              <span class="act-by">by {{ a.activated_by_name }}</span>
            </div>
          </div>
        } @empty { <div class="empty">No active responses. Open an anticipatory activation above, or activate an approved incident.</div> }
      </div>

      <div class="card"><h4><i class="fas fa-hourglass-half"></i> Awaiting Activation (approved incidents)</h4>
        @for (i of index().awaiting ?? []; track i.id) {
          <div class="row-item">
            <span class="badge b-sev">{{ i.severity_level }}</span>
            <b style="flex:1">{{ i.title }}</b>
            <span style="color:#94a3b8">{{ i.region_name ?? '' }}</span>
            <button class="btn b-red" (click)="activate(i, false)"><i class="fas fa-bolt"></i> Activate LIVE</button>
            <button class="btn b-outline" (click)="activate(i, true)"><i class="fas fa-vial"></i> Run SIMULATION</button>
          </div>
        } @empty { <div class="empty">No approved incidents are awaiting activation.</div> }
      </div>

      <div class="card"><h4><i class="fas fa-flag-checkered"></i> Past Activations</h4>
        @for (a of index().completed ?? []; track a.id) {
          <div class="row-item">
            <span class="badge" [class]="a.is_simulation ? 'b-sim' : 'b-live'">{{ a.is_simulation ? 'SIMULATION' : 'LIVE' }}</span>
            <b style="flex:1">{{ a.incident_title }}</b>
            <span style="color:#94a3b8">{{ a.status }} · {{ a.deactivated_at?.substring(0, 16)?.replace('T', ' ') }}</span>
            <button class="btn b-outline" (click)="openBoard(a.id)">Review</button>
          </div>
        } @empty { <div class="empty">No completed activations yet.</div> }
      </div>
    }

    <!-- ══════════ COMMAND BOARD ══════════ -->
    @if (board(); as b) {
      <!-- Posture ladder + controls -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px">
          <h4 style="margin:0"><i class="fas fa-layer-group"></i> Posture — {{ doctrineFor(b.activation.posture)?.teprp_level }} ·
            {{ doctrineFor(b.activation.posture)?.alert_label }}</h4>
          <div>
            @if (b.activation.trigger_type === 'forecast' && !b.activation.incident_id) {
              @if (b.activation.posture === 'monitoring') { <button class="btn b-amber" (click)="setPosture('emergency')">Escalate → EMERGENCY</button> }
              @if (b.activation.posture === 'emergency') { <button class="btn b-red" (click)="setPosture('disaster')">Escalate → DISASTER</button>
                <button class="btn b-green" style="margin-left:6px" (click)="setPosture('monitoring')">De-escalate → MONITORING</button> }
              <button class="btn b-red" style="margin-left:6px" (click)="confirmImpact()"><i class="fas fa-burst"></i> Confirm Impact</button>
              <button class="btn b-outline" style="margin-left:6px" (click)="cancelForecast()">Stand down</button>
            } @else if (b.activation.posture === 'disaster') {
              <button class="btn b-blue" (click)="setPosture('safeguard')">De-escalate → SAFEGUARD</button>
            } @else if (b.activation.posture === 'safeguard') {
              <span style="color:#94a3b8; font-size:0.75rem">Post-passage watch — close the response when residual risk clears.</span>
            }
          </div>
        </div>
        <div class="ladder">
          @for (p of doctrine(); track p.posture) {
            <div class="rung" [class.on]="b.activation.posture === p.posture" [style.color]="colour(p.posture)"
                 [style.border-color]="colour(p.posture)">
              <b style="color:#e2e8f0">{{ p.posture | uppercase }}
                <span class="pill" [style.background]="colour(p.posture)" style="color:#0f172a">{{ p.alert_colour }}</span></b>
              <small>{{ p.teprp_level }} · {{ p.lead_time }}</small>
              <small style="color:#cbd5e1; margin-top:3px">{{ p.description }}</small>
              <small style="color:#64748b; margin-top:2px"><i class="fas fa-user-shield"></i> {{ p.authoriser }}</small>
            </div>
          }
        </div>
      </div>

      <!-- Storm map + landfall countdown (anticipatory) -->
      @if (b.activation.trigger_type === 'forecast') {
        <div class="split">
          <div class="card">
            <h4><i class="fas fa-hurricane"></i> Forecast track — {{ b.activation.hazard_description }}</h4>
            <div id="stormMap" class="stormmap"></div>
            <div style="margin-top:8px">
              @for (a of affectedAreas(b); track a) { <span class="area-chip"><i class="fas fa-location-dot"></i> {{ a }}</span> }
            </div>
          </div>
          <div>
            <div class="card" style="text-align:center">
              <h4><i class="fas fa-clock"></i> {{ landfallPassed() ? 'Impact window' : 'Landfall countdown' }}</h4>
              <div class="countdown" [style.color]="countdownColour()">{{ landfallCountdown() }}</div>
              <small style="color:#94a3b8">{{ b.activation.expected_impact_at ? 'ETA ' + b.activation.expected_impact_at.substring(0,16).replace('T',' ') : 'no ETA set' }}</small>
            </div>
            <div class="card">
              <h4><i class="fas fa-clipboard-check"></i> Area readiness</h4>
              @if (readiness(); as r) {
                <div class="ready-grp">
                  <div class="lbl"><i class="fas fa-house-flag"></i> Evacuation centres ({{ r.evacuation_centers.length }})</div>
                  @for (e of r.evacuation_centers; track e.centre_name) {
                    <div class="ready-item"><span>{{ e.centre_name }} <small style="color:#64748b">{{ e.district }}{{ e.council ? ' · ' + e.council : '' }}</small></span>
                      <span class="pill">{{ e.capacity_people }} people</span></div>
                  } @empty { <div class="ready-item" style="color:#64748b">none mapped in these areas</div> }
                </div>
                <div class="ready-grp">
                  <div class="lbl"><i class="fas fa-warehouse"></i> Stockpiles ({{ r.warehouses.length }})</div>
                  @for (w of r.warehouses; track w.name) {
                    <div class="ready-item"><span>{{ w.name }} <small style="color:#64748b">{{ w.location }}</small></span>
                      <span class="pill">{{ w.stock_units }} units</span></div>
                  } @empty { <div class="ready-item" style="color:#64748b">none in range</div> }
                </div>
                <div class="ready-grp">
                  <div class="lbl"><i class="fas fa-tower-broadcast"></i> Active warnings ({{ r.early_warnings.length }})</div>
                  @for (ew of r.early_warnings; track ew.warning_code) {
                    <div class="ready-item"><span>{{ ew.hazard_type }} <small style="color:#64748b">{{ ew.affected_regions }}</small></span>
                      <span class="pill" style="background:#7f1d1d; color:#fecaca">{{ ew.severity_level }}</span></div>
                  } @empty { <div class="ready-item" style="color:#64748b">no active warnings</div> }
                </div>
                <!-- The preparedness plans the Act requires be activated for the forecast-impact
                     areas — "it explicitly tells what to be done" (NDPRP 2022 / DM Act 2022). -->
                <div class="ready-grp">
                  <div class="lbl"><i class="fas fa-clipboard-list"></i> Preparedness plans activated ({{ r.anticipatory_plans?.length ?? 0 }})</div>
                  @for (p of r.anticipatory_plans ?? []; track p.id) {
                    <div class="plan-card">
                      <div style="display:flex; justify-content:space-between; gap:8px">
                        <b style="color:#7dd3fc">{{ p.hazard_type }} · {{ p.district_council }}</b>
                        <span class="pill">{{ p.affected_people | number }} people</span>
                      </div>
                      <ul class="acts">
                        @for (act of p.action_activities_type ?? []; track act) { <li>{{ act }}</li> }
                      </ul>
                      <small style="color:#64748b"><i class="fas fa-users"></i> {{ (p.responsible_actor ?? []).join(', ') }}</small>
                    </div>
                  } @empty { <div class="ready-item" style="color:#64748b">no anticipatory plan registered for these areas</div> }
                </div>
              } @else { <div class="empty">Loading readiness…</div> }
            </div>
          </div>
        </div>
      }

      <!-- Incident situation map + area readiness (the non-forecast activations' visuals) -->
      @if (b.activation.trigger_type !== 'forecast') {
        <div class="split">
          <div class="card">
            <h4><i class="fas fa-map-location-dot"></i> Incident Situation Map
              @if (b.activation.region_name) { <span style="color:#cbd5e1">· {{ b.activation.region_name }}</span> }</h4>
            @if (b.activation.latitude && b.activation.longitude) {
              <div id="incidentMap" class="stormmap"></div>
              <div style="margin-top:8px; color:#94a3b8; font-size:0.78rem">
                <i class="fas fa-location-dot"></i> {{ b.activation.location_description ?? b.activation.region_name }}
                @if (b.activation.severity_level) { · <b [style.color]="sevColour(b.activation.severity_level)">{{ b.activation.severity_level }}</b> }
              </div>
            } @else {
              <div class="empty"><i class="fas fa-location-dot"></i> No geolocation recorded for this incident — assign tasks via the DRF lanes below.</div>
            }
          </div>
          <div>
            <div class="card">
              <h4><i class="fas fa-clipboard-check"></i> Area readiness @if (b.activation.region_name) { — {{ b.activation.region_name }} }</h4>
              @if (readiness(); as r) {
                <div class="ready-grp">
                  <div class="lbl"><i class="fas fa-house-flag"></i> Evacuation centres ({{ r.evacuation_centers.length }})</div>
                  @for (e of r.evacuation_centers.slice(0, 6); track e.centre_name) {
                    <div class="ready-item"><span>{{ e.centre_name }} <small style="color:#64748b">{{ e.district }}{{ e.council ? ' · ' + e.council : '' }}</small></span>
                      <span class="pill">{{ e.capacity_people }} people</span></div>
                  } @empty { <div class="ready-item" style="color:#64748b">none mapped in this region</div> }
                </div>
                <div class="ready-grp">
                  <div class="lbl"><i class="fas fa-warehouse"></i> Stockpiles ({{ r.warehouses.length }})</div>
                  @for (w of r.warehouses.slice(0, 6); track w.name) {
                    <div class="ready-item"><span>{{ w.name }} <small style="color:#64748b">{{ w.location }}</small></span>
                      <span class="pill">{{ w.stock_units }} units</span></div>
                  } @empty { <div class="ready-item" style="color:#64748b">none in range</div> }
                </div>
                <div class="ready-grp">
                  <div class="lbl"><i class="fas fa-tower-broadcast"></i> Active warnings ({{ r.early_warnings.length }})</div>
                  @for (ew of r.early_warnings.slice(0, 5); track ew.warning_code) {
                    <div class="ready-item"><span>{{ ew.hazard_type }} <small style="color:#64748b">{{ ew.affected_regions }}</small></span>
                      <span class="pill" style="background:#7f1d1d; color:#fecaca">{{ ew.severity_level }}</span></div>
                  } @empty { <div class="ready-item" style="color:#64748b">no active warnings</div> }
                </div>
              } @else { <div class="empty">Loading readiness…</div> }
            </div>
          </div>
        </div>
      }

      <!-- 72-hour clock bar -->
      <div class="card clockbar">
        <div>
          <span class="badge" [class]="b.activation.is_simulation ? 'b-sim' : (b.activation.trigger_type === 'forecast' ? 'b-fcast' : 'b-live')">
            {{ b.activation.is_simulation ? (b.activation.allow_real_ops ? 'FULL-SCALE EXERCISE' : 'TABLE-TOP DRILL') : (b.activation.trigger_type === 'forecast' ? 'ANTICIPATORY' : 'LIVE RESPONSE') }}</span>
          @if (b.activation.is_simulation && b.activation.allow_real_ops) {
            <span class="badge" style="background:#7c2d12;color:#fdba74;margin-left:4px" title="This exercise may run real operations — its communications are [DRILL]-marked">REAL OPS ENABLED</span>
          }
          <b style="font-size:1rem; margin-left:8px">{{ b.activation.incident_title }}</b>
          <div style="color:#94a3b8; font-size:0.75rem; margin-top:2px">
            {{ b.activation.region_name ?? '' }} · activated {{ b.activation.activated_at?.substring(0, 16)?.replace('T', ' ') }}
            by {{ b.activation.activated_by_name }} · {{ b.summary.assigned_stakeholders }} agencies engaged
            @if (b.activation.scenario_title) { · {{ b.activation.scenario_title }} · {{ b.activation.run_code }} }
            @if (lastRefreshed()) { · <span class="refresh-dot"></span>updated {{ lastRefreshed() }} }</div>
        </div>
        <div style="text-align:center">
          <div class="clock" [class.danger]="clockDanger()">{{ clock72() }}</div>
          <small style="color:#94a3b8">72-HOUR CLOCK</small>
        </div>
        <div style="min-width:180px">
          <div style="font-size:0.75rem; color:#94a3b8">Overall progress — {{ b.summary.overall_progress }}%
            ({{ b.summary.completed_tasks }}/{{ b.summary.total_tasks }})</div>
          <div class="progress-rail"><div class="progress-fill" [style.width.%]="b.summary.overall_progress"></div></div>
        </div>
        <div>
          @if (b.activation.status === 'active') {
            <button class="btn b-outline" (click)="deactivate()"><i class="fas fa-flag-checkered"></i> Close Response</button>
          }
          <button class="btn b-outline" style="margin-left:6px" (click)="closeBoard()">← All Activations</button>
        </div>
      </div>

      <!-- Response Functions hub for this activation — every Response surface deep-linked -->
      @if (b.linked_ops; as ops) {
        <div class="card">
          <h4>
            <i class="fas fa-diagram-project"></i> {{ ops.title || 'Response Functions' }}
            <button class="btn-xs hub-toggle" (click)="boardHubOpen.set(!boardHubOpen())">
              {{ boardHubOpen() ? 'Collapse' : 'Expand' }}
            </button>
          </h4>
          <div style="color:#94a3b8; font-size:0.78rem; margin:-4px 0 10px">
            {{ ops.subtitle }}
            @if (!ops.has_incident) {
              <span style="color:#fbbf24"> · Forecast-only — logistics & assessments unlock after impact creates an incident.</span>
            }
          </div>
          @if (ops.snapshot; as snap) {
            <div class="hub-snap">
              <div class="mini-stat" [class.hot]="num(snap.tasks_open) > 0"><b>{{ snap.tasks_open || 0 }}</b><span>open tasks</span></div>
              <div class="mini-stat"><b>{{ snap.tasks_completed || 0 }}</b><span>completed</span></div>
              <div class="mini-stat" [class.hot]="num(snap.challenges) > 0"><b>{{ snap.challenges || 0 }}</b><span>challenges</span></div>
              <div class="mini-stat"><b>{{ snap.ics_roles_filled || 0 }}</b><span>ICS roles</span></div>
              <div class="mini-stat" [class.hot]="num(snap.resource_approvals_pending) > 0"><b>{{ snap.resource_approvals_pending || 0 }}</b><span>res. approvals</span></div>
              <div class="mini-stat" [class.hot]="num(snap.dispatch_approvals_pending) > 0"><b>{{ snap.dispatch_approvals_pending || 0 }}</b><span>dispatch gate</span></div>
              <div class="mini-stat"><b>{{ snap.allocations || 0 }}</b><span>allocations</span></div>
              <div class="mini-stat"><b>{{ snap.assessments || 0 }}</b><span>assessments</span></div>
              <div class="mini-stat"><b>{{ snap.situation_reports || 0 }}</b><span>SITREPs</span></div>
              <div class="mini-stat"><b>{{ snap.alerts || 0 }}</b><span>alerts</span></div>
            </div>
          }
          @if (boardHubOpen()) {
            <div class="hub-groups">
              @for (g of ops.groups ?? []; track g.key) {
                <div>
                  <div class="hub-group-label">{{ g.label }}
                    @if (num(g.attention_total) > 0) { <span class="pill">{{ g.attention_total }}</span> }
                  </div>
                  <div class="hub-tiles">
                    @for (it of g.items ?? []; track it.key) {
                      <a class="hub-tile" [class.hot]="it.attention" [routerLink]="hubPath(it.path)" [queryParams]="hubQuery(it.path)">
                        <div class="hub-top">
                          <span class="hub-ico"><i class="fas {{ it.icon }}"></i></span>
                          <span class="hub-name">{{ it.name }}</span>
                          @if (it.count != null) {
                            <span style="text-align:right">
                              <div class="hub-count">{{ it.count }}</div>
                              <div class="hub-cl">{{ it.count_label }}</div>
                            </span>
                          }
                        </div>
                        <div class="hub-desc">{{ it.description }}</div>
                      </a>
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="hub-quick">
              @for (it of boardHubQuickLinks(); track it.key) {
                <a [routerLink]="hubPath(it.path)" [queryParams]="hubQuery(it.path)"><i class="fas {{ it.icon }}"></i> {{ it.name }}
                  @if (it.count != null && num(it.count) > 0) { ({{ it.count }}) }</a>
              }
            </div>
          }
        </div>
      }

      <div class="split">
        <div class="card">
          <h4><i class="fas fa-truck-fast"></i> Logistics & Dispatch Picture
            @if (b.activation.incident_id) {
              <a class="btn-xs" style="margin-left:auto" [routerLink]="['/m/response/dispatch']" [queryParams]="{ incident_id: b.activation.incident_id }">
                <i class="fas fa-arrow-up-right-from-square"></i> Dispatch Console
              </a>
            }
          </h4>
          @if (b.logistics?.available) {
            <div class="mini-stats">
              <div class="mini-stat"><b>{{ b.logistics.summary.allocation_count || 0 }}</b><span>allocation lines</span></div>
              <div class="mini-stat"><b>{{ b.logistics.summary.resource_count || 0 }}</b><span>resources</span></div>
              <div class="mini-stat"><b>{{ b.logistics.summary.pending_dispatch || 0 }}</b><span>awaiting source</span></div>
              <div class="mini-stat"><b>{{ b.logistics.summary.pending_source_approvals || 0 }}</b><span>source approvals</span></div>
            </div>
            @for (r of b.logistics.resources; track r.id) {
              <div class="logi-row">
                <div class="logi-head">
                  <span class="pill">{{ r.status }}</span>
                  <span class="logi-title">{{ r.resource_name }}</span>
                  <span style="color:#94a3b8">{{ r.latest_source || 'source pending' }}</span>
                </div>
                <div style="margin-top:5px;color:#cbd5e1">
                  requested {{ num(r.quantity_requested) | number:'1.0-2' }} {{ r.unit_of_measure }}
                  @if (num(r.quantity_allocated) > 0) { · allocated {{ num(r.quantity_allocated) | number:'1.0-2' }} }
                  · dispatched {{ num(r.dispatched_quantity) | number:'1.0-2' }}
                  @if (num(r.pending_quantity) > 0) { · pending {{ num(r.pending_quantity) | number:'1.0-2' }} }
                </div>
                <div class="logi-bars">
                  <div>
                    <small style="color:#64748b">dispatch coverage</small>
                    <div class="qbar"><span [style.width.%]="coverage(r, 'dispatched_quantity')"></span></div>
                  </div>
                  <div>
                    <small style="color:#64748b">delivery coverage</small>
                    <div class="qbar delivered"><span [style.width.%]="coverage(r, 'delivered_quantity')"></span></div>
                  </div>
                </div>
              </div>
            } @empty {
              <div class="empty">No resource allocations are linked to this incident yet.</div>
            }
          } @else {
            <div class="empty">Forecast-only activations show logistics after impact creates an incident.</div>
          }
        </div>
        <div class="card">
          <h4><i class="fas fa-file-medical"></i> Situation Reports & Operational Cadence
            @if (b.activation.incident_id) {
              <a class="btn-xs" style="margin-left:auto" [routerLink]="['/m/response/incidents', b.activation.incident_id]">
                <i class="fas fa-arrow-up-right-from-square"></i> Incident
              </a>
            }
          </h4>
          @if (b.situation_reports?.available) {
            <div class="mini-stats">
              <div class="mini-stat"><b>{{ b.situation_reports.summary.reports_count || 0 }}</b><span>situation reports</span></div>
              <div class="mini-stat"><b>{{ b.situation_reports.cadence?.label || 'Period' }}</b><span>{{ b.situation_reports.cadence?.window || 'clock pending' }}</span></div>
            </div>
            @if (b.situation_reports.cadence?.objectives) {
              <div class="sitrep-remark" style="margin-bottom:0.5rem;"><b>IAP objectives:</b> {{ b.situation_reports.cadence.objectives }}</div>
            }
            @for (r of b.situation_reports.reports; track r.id) {
              <div class="sitrep-row">
                <b>{{ r.created_at?.substring(0, 16)?.replace('T', ' ') }}</b>
                <span style="color:#94a3b8"> · {{ r.reported_by_name || 'Officer' }}</span>
                <div class="sitrep-meta">
                  <span>Deaths {{ r.deaths_total || 0 }}</span>
                  <span>Injured {{ r.injured_total || 0 }}</span>
                  <span>Missing {{ r.missing_total || 0 }}</span>
                  <span>Displaced {{ r.displaced || 0 }}</span>
                </div>
                @if (services(r).length) {
                  <div style="color:#7dd3fc">Services: {{ services(r).join(', ') }}</div>
                }
                @if (r.remarks) { <div class="sitrep-remark">{{ r.remarks }}</div> }
              </div>
            } @empty {
              <div class="empty">No situation report has been filed for this incident yet.</div>
            }
          } @else {
            <div class="empty">Forecast-only activations start situation reporting after confirmed impact.</div>
          }

          <!-- F31: formal operational periods (open / close with handover) -->
          <div style="margin-top:0.85rem;padding-top:0.75rem;border-top:1px solid rgba(148,163,184,0.25);">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:0.5rem;">
              <b style="font-size:0.85rem;"><i class="fas fa-clock-rotate-left me-1"></i> Operational periods</b>
              @if (b.activation.status === 'active' && b.operational_periods?.available !== false) {
                <button type="button" class="btn-xs go" style="margin-left:auto" (click)="openPeriod()" [disabled]="periodBusy()">
                  {{ periodBusy() ? '…' : 'Open next period' }}
                </button>
              }
            </div>
            @if (periodMsg()) { <div class="empty" style="color:#7dd3fc;padding:0.3rem 0;">{{ periodMsg() }}</div> }
            @for (p of b.operational_periods?.periods || []; track p.id) {
              <div class="sitrep-row">
                <b>P{{ p.period_number }} · {{ p.label }}</b>
                <span class="pill" [style.background]="p.status==='open' ? '#14532d' : '#334155'"
                      [style.color]="p.status==='open' ? '#4ade80' : '#cbd5e1'" style="margin-left:6px;">{{ p.status }}</span>
                <div class="sitrep-meta">
                  <span>{{ p.hours_duration ?? '—' }}h</span>
                  @if (p.created_by_name) { <span>{{ p.created_by_name }}</span> }
                </div>
                @if (p.objectives) { <div class="sitrep-remark">{{ p.objectives }}</div> }
                @if (p.handover_notes) { <div class="sitrep-remark" style="color:#fde68a;">Handover: {{ p.handover_notes }}</div> }
                @if (p.task_rollup; as tr) {
                  <div class="sitrep-meta" style="margin-top:4px;flex-wrap:wrap;gap:6px;">
                    <span class="pill" style="background:#1e3a5f;color:#93c5fd;"
                          title="Tasks completed (status) in this period window">Done {{ tr.completed_in_window ?? 0 }}</span>
                    <span class="pill" style="background:#1e3a5f;color:#fde68a;"
                          title="In-progress tasks last updated in this window">In prog {{ tr.in_progress_in_window ?? 0 }}</span>
                    <span class="pill" style="background:#1e3a5f;color:#86efac;"
                          title="72-hr critical tasks completed in this window">Critical {{ tr.critical_completed_in_window ?? 0 }}</span>
                    <span class="pill" style="background:#1e3a5f;color:#cbd5e1;"
                          title="Distinct tasks with activity log entries in this window">Touched {{ tr.tasks_touched ?? 0 }}</span>
                  </div>
                }
                @if (p.status === 'open' && b.activation.status === 'active') {
                  <button type="button" class="btn-xs" style="margin-top:4px" (click)="closePeriod(p)" [disabled]="periodBusy()">Close period…</button>
                }
              </div>
            } @empty {
              <div class="empty" style="padding:0.4rem 0;">
                {{ b.operational_periods?.message || 'No formal periods yet — open Period 1 to start IAP cadence.' }}
              </div>
            }
          </div>
        </div>
      </div>

      <!-- ICS org chart (F05): who commands the incident — IC + command staff on top,
           General-Staff section chiefs below with their DRF lanes grouped underneath.
           Every appointment/relief is journalled, so handovers appear in the Activity
           Timeline and the After-Action Review. -->
      <div class="card">
        <h4><i class="fas fa-sitemap"></i> Incident Command (ICS)
          @if (roleEntry('IC'); as ic) {
            @if (ic.vacant) { <span class="pill" style="background:#7c2d12;color:#fdba74">NO INCIDENT COMMANDER APPOINTED</span> }
            @else { <span class="pill" style="background:#14532d;color:#4ade80">IC: {{ ic.user_name }}</span> }
          }
        </h4>
        <!-- Command row: Incident Commander + deputy + command staff -->
        <div class="ics-row">
          @for (r of commandRow(); track r.role) {
            <div class="ics-card" [class.vacant]="r.vacant" [class.ic]="r.role === 'IC'">
              <div class="ics-role">{{ r.role_title }}</div>
              @if (!r.vacant) {
                <div class="ics-holder"><i class="fas fa-user-shield"></i> {{ r.user_name }}</div>
                <div class="ics-meta">since {{ r.appointed_at?.substring(0, 16)?.replace('T', ' ') }}{{ r.appointed_by_name ? ' · by ' + r.appointed_by_name : '' }}</div>
                @if (r.note) { <div class="ics-meta" style="color:#7dd3fc">{{ r.note }}</div> }
                @if (b.activation.status === 'active') {
                  <div class="ics-actions">
                    <button class="btn-xs" (click)="appointRole(r)">Hand over…</button>
                    <button class="btn-xs" (click)="relieveRole(r)">Relieve</button>
                  </div>
                }
              } @else {
                <div class="ics-vac"><i class="fas fa-circle-exclamation"></i> VACANT</div>
                @if (b.activation.status === 'active') {
                  <div class="ics-actions"><button class="btn-xs go" (click)="appointRole(r)">Appoint…</button></div>
                }
              }
            </div>
          }
        </div>
        <!-- General Staff: section chiefs, each with the DRF lanes their section runs -->
        <div class="ics-row ics-sec">
          @for (r of sectionChiefs(); track r.role) {
            <div class="ics-card" [class.vacant]="r.vacant">
              <div class="ics-role">{{ r.role_title }}</div>
              @if (!r.vacant) {
                <div class="ics-holder"><i class="fas fa-user-shield"></i> {{ r.user_name }}</div>
                <div class="ics-meta">since {{ r.appointed_at?.substring(0, 16)?.replace('T', ' ') }}{{ r.appointed_by_name ? ' · by ' + r.appointed_by_name : '' }}</div>
                @if (b.activation.status === 'active') {
                  <div class="ics-actions">
                    <button class="btn-xs" (click)="appointRole(r)">Hand over…</button>
                    <button class="btn-xs" (click)="relieveRole(r)">Relieve</button>
                  </div>
                }
              } @else {
                <div class="ics-vac"><i class="fas fa-circle-exclamation"></i> VACANT</div>
                @if (b.activation.status === 'active') {
                  <div class="ics-actions"><button class="btn-xs go" (click)="appointRole(r)">Appoint…</button></div>
                }
              }
              @if (sectionLanes(r.role).length) {
                <div class="ics-lanes">
                  @for (d of sectionLanes(r.role); track d.id) {
                    <div class="ics-lane" (click)="openLane(d)" title="Open DRF lane">
                      <span class="ics-dot" [style.background]="d.color || '#dc3545'"></span>
                      <span>DRF {{ d.number }} — {{ d.name }}</span>
                      <span class="pc">{{ d.progress }}%</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="ics-lanes"><small style="color:#64748b">No DRF lanes — cost, compensation &amp; administration.</small></div>
              }
            </div>
          }
        </div>
      </div>

      <!-- After-Action Review — the scorecard of what actually happened (shown once closed) -->
      @if (b.aar; as aar) {
        <div class="card" style="border-color:#7c3aed">
          <h4><i class="fas fa-clipboard-list"></i> After-Action Review
            <span class="pill" style="background:#2e1065;color:#c4b5fd">{{ aar.duration.hours }}h ·
              {{ b.activation.is_simulation ? (b.activation.allow_real_ops ? 'full-scale exercise' : 'table-top drill') : 'live response' }}</span>
            <button class="btn b-outline" style="margin-left:auto" (click)="printAar()"><i class="fas fa-print"></i> Print / Export report</button></h4>
          <div class="aar-grid">
            <div class="aar-stat"><b>{{ aar.tasks.completed }}/{{ aar.tasks.total }}</b><small>tasks completed</small></div>
            <div class="aar-stat"><b>{{ aar.tasks.critical_completed }}/{{ aar.tasks.critical_total }}</b><small>72-hr critical done</small></div>
            <div class="aar-stat"><b>{{ aar.tasks.avg_progress }}%</b><small>average progress</small></div>
            <div class="aar-stat"><b>{{ aar.tasks.challenges }}</b><small>challenges raised</small></div>
            <div class="aar-stat"><b>{{ aar.tasks.agencies_engaged }}</b><small>agencies engaged</small></div>
            <div class="aar-stat"><b>{{ aar.injects.resolved }}/{{ aar.injects.total }}</b><small>injects resolved{{ aar.injects.avg_response_minutes > 0 ? ' · avg ' + aar.injects.avg_response_minutes + ' min' : '' }}</small></div>
          </div>
          <div class="aar-cols">
            <div>
              <h5>Escalation & decision timeline</h5>
              @for (e of aar.timeline; track $index) {
                <div class="feed"><b>{{ e.created_at?.substring(11, 16) }}</b> {{ e.created_at?.substring(0, 10) }} · {{ e.user_name ?? 'System' }}<br>{{ e.message }}</div>
              } @empty { <div class="empty">No journalled decisions.</div> }
            </div>
            <div>
              <h5>DRF lane performance</h5>
              @for (d of aar.drf_performance; track d.number) {
                <div class="feed"><b>DRF {{ d.number }}</b> — {{ d.name }}
                  <div class="mini-rail"><div class="mini-fill" [style.width.%]="d.progress"></div></div>
                  <small style="color:#94a3b8">{{ d.completed }}/{{ d.total }} done · {{ d.progress }}%</small></div>
              } @empty { <div class="empty">No lane data.</div> }
            </div>
          </div>
        </div>
      }

      <div class="split">
        <div>
          <div class="card"><h4>DRF Coordination Lanes (NDPRP 2022)
            @if (b.activation.posture === 'monitoring') { <span class="pill" style="background:#14532d; color:#4ade80">ALL ON CALL</span> }</h4>
            <div class="lanes">
              @for (d of b.drfs; track d.id) {
                <div class="lane" [style.--drf]="d.color || '#dc3545'" (click)="openLane(d)">
                  <b>DRF {{ d.number }} — {{ d.name }}</b>
                  <small>{{ d.stakeholder_organization ?? d.lead_agency_name ?? 'Unassigned' }}</small>
                  <div class="mini-rail"><div class="mini-fill" [style.width.%]="d.progress"></div></div>
                  <small>{{ d.completed }}/{{ d.total }} done · {{ d.in_progress }} in progress · {{ d.progress }}%</small>
                </div>
              }
            </div>
          </div>
        </div>
        <div>
          <div class="card"><h4><i class="fas fa-stopwatch"></i> 72-Hour Critical Tasks</h4>
            @for (t of b.critical_tasks; track t.id) {
              <div class="crit"><b>DRF {{ t.drf_number }}</b> · {{ t.title }}
                <div style="color:#94a3b8; font-size:0.75rem">{{ t.status }} · {{ t.progress_percent }}% · {{ t.stakeholder_organization ?? 'Unassigned' }}</div></div>
            } @empty { <div class="empty">No 72-hour critical tasks.</div> }
          </div>
          <div class="card"><h4><i class="fas fa-triangle-exclamation"></i> Challenges Reported</h4>
            @for (c of b.challenges; track c.id) {
              <div class="feed"><b>DRF {{ c.drf_number }}</b> — {{ c.challenge }}<br>
                <small style="color:#64748b">{{ c.title }} · {{ c.stakeholder_organization ?? '' }}</small></div>
            } @empty { <div class="empty">No challenges raised.</div> }
          </div>
          @if (b.activation.is_simulation) {
            <div class="card" style="border-color:#6d28d9"><h4><i class="fas fa-bolt"></i> Scenario Injects
              <span class="pill" style="background:#2e1065;color:#c4b5fd">{{ firedInjects() }} live</span></h4>
              @for (j of b.injects; track j.id) {
                <div class="feed" [style.opacity]="j.status === 'resolved' ? 0.6 : 1">
                  <span class="inj-st" [attr.data-s]="j.status">{{ j.status }}</span> <b>{{ j.title }}</b>
                  @if (j.detail) { <br><small>{{ j.detail }}</small> }
                  @if (j.target_drf_number) { <br><small style="color:#7dd3fc">DRF {{ j.target_drf_number }} — {{ j.target_drf_name }}</small> }
                  @if (j.expected_action) { <br><small style="color:#c4b5fd">Expected: {{ j.expected_action }}</small> }
                  @if (j.due_at && j.status === 'pending') { <br><small style="color:#f59e0b">fires {{ j.due_at?.substring(0, 16)?.replace('T', ' ') }}</small> }
                  @if (j.resolution) { <br><small style="color:#4ade80">↳ {{ j.resolution }}</small> }
                  <div style="margin-top:3px">
                    @if (j.status === 'pending') { <button class="btn-xs" (click)="fireInject(j)">Fire now</button> }
                    @if (j.status === 'fired') { <button class="btn-xs go" (click)="resolveInject(j)">Resolve…</button> }
                  </div>
                </div>
              } @empty { <div class="empty">No injects scripted. Add scenario events below.</div> }
              @if (b.activation.status === 'active') {
                <div class="inj-form">
                  <input [(ngModel)]="injTitle" placeholder="Inject title (e.g. Bridge washed out at Ruvu)">
                  <input [(ngModel)]="injDetail" placeholder="Detail for the commander (optional)">
                  <div class="inj-row">
                    <select [(ngModel)]="injType"><option value="event">Event</option><option value="decision">Decision point</option><option value="message">Message</option></select>
                    <input type="number" [(ngModel)]="injDueMin" min="0" placeholder="Fire in (min)" title="Minutes from now; empty = manual fire">
                    <button class="btn-xs go" [disabled]="!injTitle.trim()" (click)="addInject()">Script inject</button>
                  </div>
                </div>
              }
            </div>
          }
          <div class="card"><h4><i class="fas fa-list-ul"></i> Activity Timeline</h4>
            @for (l of b.recent_activity; track l.id) {
              <div class="feed"><b>{{ l.user_name ?? 'System' }}</b> · {{ l.action }}<br>{{ l.message }}
                <br><small style="color:#64748b">{{ l.created_at?.substring(0, 16)?.replace('T', ' ') }}</small></div>
            } @empty { <div class="empty">No activity yet.</div> }
          </div>
        </div>
      </div>
    }

    <!-- ── Lane drawer ── -->
    @if (lane(); as ln) {
      <div class="drawer-back" (click)="lane.set(null)">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-head">
            <div><b>DRF {{ ln.drf.number }} — {{ ln.drf.name }}</b>
              <div style="color:#94a3b8; font-size:0.75rem">Lead: {{ ln.drf.lead_agency_name ?? '—' }}</div></div>
            <button class="btn b-outline" (click)="lane.set(null)">✕</button>
          </div>
          <div class="drawer-body">
            <div style="display:flex; gap:6px; margin-bottom:10px">
              <button class="btn b-red" (click)="assignLane(ln.drf)"><i class="fas fa-handshake"></i> Assign Lane to Agency</button>
              <button class="btn b-outline" (click)="addTask(ln.drf)"><i class="fas fa-plus"></i> Add Task</button>
            </div>
            @for (t of ln.tasks; track t.id) {
              <div class="task">
                <b>{{ t.title }} @if (t.is_72hr_critical) { <span class="badge b-sev">72HR</span> }</b>
                <div class="meta">{{ t.priority }} · {{ t.stakeholder_organization ?? 'Unassigned' }} · {{ t.progress_percent }}%</div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
                  <select [ngModel]="t.status" (ngModelChange)="updateTask(t, { status: $event })">
                    @for (s of board()?.task_statuses ?? []; track s) { <option [value]="s">{{ s }}</option> }
                  </select>
                  <input type="number" min="0" max="100" style="width:70px" [ngModel]="t.progress_percent"
                         (change)="updateTask(t, { progress_percent: $any($event.target).value })" title="Progress %">
                  <select [ngModel]="t.stakeholder_id" (ngModelChange)="updateTask(t, { stakeholder_id: $event })">
                    <option [ngValue]="null">Assign agency…</option>
                    @for (s of board()?.stakeholders ?? []; track s.id) { <option [ngValue]="s.id">{{ s.organization ?? s.name }}</option> }
                  </select>
                  <button class="btn b-outline" (click)="reportChallenge(t)">Challenge</button>
                  <button class="btn b-outline" (click)="removeTask(t)">✕</button>
                </div>
                @if (t.challenge) { <div class="meta" style="color:#fca5a5"><i class="fas fa-triangle-exclamation"></i> {{ t.challenge }}</div> }
              </div>
            } @empty { <div class="empty">No tasks in this lane.</div> }
          </div>
        </div>
      </div>
    }
  `
})
export class CommandCenterComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly index = signal<any>({});
  readonly scenarios = signal<any[]>([]);
  readonly board = signal<any | null>(null);
  readonly lane = signal<any | null>(null);
  readonly readiness = signal<any | null>(null);
  readonly now = signal(Date.now());
  readonly lastRefreshed = signal('');
  /** Index hub expanded by default so Command Post shows all Response functions immediately. */
  readonly hubOpen = signal(true);
  /** Board-level linked ops hub — expanded by default on open. */
  readonly boardHubOpen = signal(true);
  private timer: any;
  private boardRefresh: any;
  private boardRefreshing = false;

  // Anticipatory-activation form state
  readonly showForecast = signal(false);
  readonly issuedWarnings = signal<any[]>([]);
  fWarningId = '';
  fHazard = '';
  fAreas = '';
  fEta = '';
  fSim = false;
  fRealOps = false;   // full-scale exercise: allow real operations (only meaningful when fSim)
  readonly fTrack = signal<[number, number][]>([]);
  private formMap: any = null;
  private formLayer: any = null;
  private stormMap: any = null;
  private stormAnim: any = null;
  private incidentMap: any = null;

  /** Posture doctrine reference (V41), in ladder order. */
  readonly doctrine = computed(() => {
    const d = (this.index().posture_doctrine ?? []) as any[];
    return [...d].sort((a, b) => POSTURE_ORDER.indexOf(a.posture) - POSTURE_ORDER.indexOf(b.posture));
  });

  // ── Operations-status strip (the index "command dashboard" header) ──
  private readonly activeList = computed(() => (this.index().active ?? []) as any[]);
  readonly activeCount = computed(() => this.activeList().length);
  readonly anticipatoryCount = computed(() => this.activeList().filter(a => a.trigger_type === 'forecast' && !a.is_simulation).length);
  readonly simCount = computed(() => this.activeList().filter(a => a.is_simulation).length);
  readonly awaitingCount = computed(() => (this.index().awaiting ?? []).length);
  /** The most urgent posture currently live (disaster > emergency > monitoring > safeguard), or '' if idle. */
  readonly highestPosture = computed(() => {
    const rank: Record<string, number> = { disaster: 3, emergency: 2, monitoring: 1, safeguard: 0 };
    return this.activeList().filter(a => !a.is_simulation)
      .map(a => a.posture || 'disaster')
      .sort((x, y) => (rank[y] ?? 0) - (rank[x] ?? 0))[0] ?? '';
  });
  /** Task-completion percent for an activation row. */
  pct(a: any): number {
    const t = a.total_tasks || 0;
    return t ? Math.round(((a.completed_tasks || 0) / t) * 100) : 0;
  }

  /** Coerce API numeric-ish values for templates. */
  num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /** Split hub deep-link path from optional query string for routerLink. */
  hubPath(path: string | null | undefined): string {
    if (!path) { return '/m/response/coordination'; }
    const q = path.indexOf('?');
    return q >= 0 ? path.slice(0, q) : path;
  }

  hubQuery(path: string | null | undefined): Record<string, string> {
    if (!path) { return {}; }
    const q = path.indexOf('?');
    if (q < 0) { return {}; }
    const out: Record<string, string> = {};
    new URLSearchParams(path.slice(q + 1)).forEach((v, k) => { out[k] = v; });
    return out;
  }

  /** Collapsed-mode quick chips: first item of each hub group (or attention items). */
  hubQuickLinks(): any[] {
    const groups = (this.index()?.response_hub?.groups ?? []) as any[];
    const hot: any[] = [];
    const first: any[] = [];
    for (const g of groups) {
      const items = (g.items ?? []) as any[];
      for (const it of items) {
        if (it.attention && Number(it.count) > 0) { hot.push(it); }
      }
      if (items[0]) { first.push(items[0]); }
    }
    return (hot.length ? hot : first).slice(0, 12);
  }

  boardHubQuickLinks(): any[] {
    const groups = (this.board()?.linked_ops?.groups ?? []) as any[];
    const hot: any[] = [];
    const first: any[] = [];
    for (const g of groups) {
      const items = (g.items ?? []) as any[];
      for (const it of items) {
        if (it.attention && Number(it.count) > 0) { hot.push(it); }
      }
      if (items[0]) { first.push(items[0]); }
    }
    return (hot.length ? hot : first).slice(0, 12);
  }

  /** hh:mm:ss remaining of the 72-hour window (counts up past zero as overrun). */
  readonly clock72 = computed(() => {
    const b = this.board();
    if (!b?.activation?.activated_at) { return '—'; }
    const elapsed = this.now() - new Date(b.activation.activated_at).getTime();
    const remaining = 72 * 3600_000 - elapsed;
    return this.hms(remaining);
  });
  readonly clockDanger = computed(() => {
    const b = this.board();
    if (!b?.activation?.activated_at) { return false; }
    return Date.now() - new Date(b.activation.activated_at).getTime() > 60 * 3600_000; // last 12h or overrun
  });

  /** Countdown to forecast landfall (expected_impact_at). */
  readonly landfallCountdown = computed(() => {
    const eta = this.board()?.activation?.expected_impact_at;
    if (!eta) { return '— : — : —'; }
    const remaining = new Date(eta).getTime() - this.now();
    return remaining <= 0 ? 'IMPACT WINDOW' : this.hms(remaining);
  });
  readonly landfallPassed = computed(() => {
    const eta = this.board()?.activation?.expected_impact_at;
    return eta ? new Date(eta).getTime() - this.now() <= 0 : false;
  });
  readonly countdownColour = computed(() => {
    const eta = this.board()?.activation?.expected_impact_at;
    if (!eta) { return '#94a3b8'; }
    const hrs = (new Date(eta).getTime() - this.now()) / 3600_000;
    if (hrs <= 0) { return '#ef4444'; }
    if (hrs <= 24) { return '#f87171'; }
    if (hrs <= 72) { return '#eab308'; }
    return '#22c55e';
  });

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
    const activationId = Number(this.route.snapshot.queryParamMap.get('activation'));
    if (Number.isFinite(activationId) && activationId > 0) {
      setTimeout(() => this.openBoard(activationId), 0);
    }
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.stopBoardRefresh();
    this.stopStorm();
    this.stopIncidentMap();
    this.destroyFormMap();
  }

  // ── doctrine helpers ──
  colour(posture: string): string { return POSTURE_COLOUR[posture] ?? '#94a3b8'; }
  doctrineFor(posture: string): any { return this.doctrine().find(p => p.posture === posture); }
  componentName(posture: string): string {
    return { monitoring: 'During Monitoring', emergency: 'In Emergency', disaster: 'In Disaster Events', safeguard: 'Safeguard (de-escalation)' }[posture] ?? posture;
  }
  affectedAreas(b: any): string[] {
    return this.parseAreas(b?.activation?.affected_areas);
  }
  private parseAreas(raw: any): string[] {
    if (!raw) { return []; }
    if (Array.isArray(raw)) { return raw; }
    try { return JSON.parse(raw); } catch { return String(raw).split(',').map(s => s.trim()).filter(Boolean); }
  }
  listText(raw: any): string[] {
    return this.parseAreas(raw).slice(0, 5);
  }
  private hms(ms: number): string {
    const neg = ms < 0; const abs = Math.abs(ms);
    const h = Math.floor(abs / 3600_000), m = Math.floor((abs % 3600_000) / 60_000), s = Math.floor((abs % 60_000) / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${neg ? '-' : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // ── index / board lifecycle ──
  load(): void {
    this.http.get<any>('/api/v1/response/coordination').subscribe(d => this.index.set(d));
    this.loadScenarios();
  }

  loadScenarios(): void {
    this.http.get<any>('/api/v1/response/coordination/scenarios').subscribe({
      next: d => this.scenarios.set(d.scenarios ?? []),
      error: () => this.scenarios.set([]),
    });
  }

  openBoard(id: number): void {
    this.stopBoardRefresh();
    this.http.get<any>(`/api/v1/response/coordination/${id}`).subscribe(d => {
      this.board.set(d);
      this.markRefreshed();
      this.readiness.set(null);
      // Readiness (evac centres / stockpiles / warnings) is relevant to BOTH the forecast areas and an
      // incident's region, so load it for every activation.
      this.http.get<any>(`/api/v1/response/coordination/${id}/readiness`).subscribe(r => this.readiness.set(r));
      if (d.activation?.trigger_type === 'forecast') {
        setTimeout(() => this.initStormMap(d.activation), 60);
      } else if (d.activation?.latitude && d.activation?.longitude) {
        setTimeout(() => this.initIncidentMap(d.activation), 60);
      }
      this.startBoardRefresh();
    });
  }

  closeBoard(): void {
    this.stopBoardRefresh();
    this.stopStorm();
    this.stopIncidentMap();
    this.board.set(null);
    this.readiness.set(null);
    this.load();
  }

  /** Severity → colour for the incident situation marker (matches the dashboard severity palette). */
  sevColour(sev: string): string {
    return { Critical: '#ef4444', Major: '#fb8c00', Moderate: '#eab308', Minor: '#3b82f6' }[sev] ?? '#94a3b8';
  }

  /** Situation map for an incident-triggered activation: the disaster's location + affected-area ring. */
  private initIncidentMap(activation: any): void {
    const el = document.getElementById('incidentMap');
    if (!el || typeof L === 'undefined') { return; }
    this.stopIncidentMap();
    const lat = Number(activation.latitude), lng = Number(activation.longitude);
    if (isNaN(lat) || isNaN(lng)) { return; }
    const map = L.map(el, { center: [lat, lng], zoom: 9, zoomControl: true, attributionControl: false });
    this.incidentMap = map;
    addTanzaniaDarkBase(map, this.http);
    addMapNav(map, { dark: true, home: [lat, lng, 9] });
    map.createPane('inc');
    map.getPane('inc').style.zIndex = '650';
    const colour = this.sevColour(String(activation.severity_level ?? ''));
    L.circle([lat, lng], { pane: 'inc', radius: 8000, color: colour, weight: 1, fillColor: colour, fillOpacity: 0.12, interactive: false }).addTo(map);
	    L.circleMarker([lat, lng], { pane: 'inc', radius: 10, color: '#fff', weight: 2, fillColor: colour, fillOpacity: 0.95 })
	      .addTo(map)
	      .bindTooltip(
	        `<b>${escapeHtml(activation.incident_title ?? 'Incident')}</b><br>`
	          + `${escapeHtml(activation.severity_level)} · ${escapeHtml(activation.region_name)}<br>`
	          + escapeHtml(activation.location_description),
	        { sticky: true },
	      )
	      .openTooltip();
    setTimeout(() => map.invalidateSize(), 80);
  }

  private stopIncidentMap(): void {
    if (this.incidentMap) { this.incidentMap.remove(); this.incidentMap = null; }
  }

  openLane(drf: any): void {
    this.http.get<any>(`/api/v1/response/coordination/${this.board()!.activation.id}/drf/${drf.id}`)
      .subscribe(d => this.lane.set(d));
  }

  private refresh(): void {
    const id = this.board()?.activation?.id;
    if (id) {
      if (this.boardRefreshing) { return; }
      this.boardRefreshing = true;
      this.http.get<any>(`/api/v1/response/coordination/${id}`).subscribe({
        next: d => {
          this.board.set(d);   // refresh data WITHOUT re-initialising maps (avoid flicker)
          this.markRefreshed();
          const drf = this.lane()?.drf;
          if (drf) { this.openLane(drf); }
        },
        error: () => {},
        complete: () => { this.boardRefreshing = false; },
      });
    } else {
      this.load();
    }
  }

  private startBoardRefresh(): void {
    this.stopBoardRefresh();
    this.boardRefresh = setInterval(() => this.refresh(), 30_000);
  }

  private stopBoardRefresh(): void {
    if (this.boardRefresh) {
      clearInterval(this.boardRefresh);
      this.boardRefresh = null;
    }
  }

  private markRefreshed(): void {
    this.lastRefreshed.set(new Date().toTimeString().slice(0, 8));
  }

  /** F31 — open next IAP operational period. */
  periodBusy = signal(false);
  periodMsg = signal('');

  openPeriod(): void {
    const id = this.board()?.activation?.id;
    if (!id) return;
    const objectives = window.prompt('IAP objectives for the new operational period (optional):', '') ?? undefined;
    if (objectives === undefined) return; // cancelled
    this.periodBusy.set(true);
    this.periodMsg.set('');
    this.http.post(`/api/v1/response/coordination/${id}/periods`, { objectives: objectives || null }).subscribe({
      next: () => {
        this.periodBusy.set(false);
        this.periodMsg.set('Period opened.');
        this.refresh();
      },
      error: e => {
        this.periodBusy.set(false);
        this.periodMsg.set(e?.error?.message || e?.error?.detail || 'Could not open period.');
      },
    });
  }

  closePeriod(p: { id: number; label?: string }): void {
    const id = this.board()?.activation?.id;
    if (!id || !p?.id) return;
    const notes = window.prompt(`Handover notes for closing ${p.label || 'period'} (optional):`, '') ?? undefined;
    if (notes === undefined) return;
    this.periodBusy.set(true);
    this.periodMsg.set('');
    this.http.post(`/api/v1/response/coordination/${id}/periods/${p.id}/close`, { handover_notes: notes || null }).subscribe({
      next: () => {
        this.periodBusy.set(false);
        this.periodMsg.set('Period closed.');
        this.refresh();
      },
      error: e => {
        this.periodBusy.set(false);
        this.periodMsg.set(e?.error?.message || e?.error?.detail || 'Could not close period.');
      },
    });
  }

  coverage(row: any, key: string): number {
    const need = this.num(row.quantity_allocated) || this.num(row.quantity_requested);
    return need > 0 ? Math.max(0, Math.min(100, Math.round((this.num(row[key]) / need) * 100))) : 0;
  }

  services(report: any): string[] {
    const raw = report?.services_unavailable;
    if (!raw) { return []; }
    if (Array.isArray(raw)) { return raw.map(String).filter(Boolean); }
    try {
      const parsed = JSON.parse(String(raw));
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return String(raw).split(',').map(x => x.trim()).filter(Boolean);
    }
  }

  // ── posture transitions (R11b doctrine) ──
  setPosture(posture: string): void {
    this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/posture`, { posture });
  }

  confirmImpact(): void {
    ensureSweetAlert().then(() => this.swal({
      title: 'Confirm impact / landfall?',
      text: 'A disaster incident is created from the forecast and linked; posture jumps to DISASTER and the response phase begins.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'text', inputLabel: 'Impact details (optional)',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/impact`,
          { details: r.value || null }, () => this.openBoard(this.board()!.activation.id));
      }
    }));
  }

  cancelForecast(): void {
    ensureSweetAlert().then(() => this.swal({
      title: 'Stand down the post?', text: 'Use when the forecast misses or weakens. All DRFs are stood down.',
      icon: 'question', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'text', inputLabel: 'Reason (required)',
      inputValidator: (v: string) => (!v?.trim() ? 'A reason is required' : null),
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/cancel-forecast`,
          { reason: r.value }, () => this.closeBoard());
      }
    }));
  }

  // ── anticipatory activation form ──
  toggleForecastForm(): void {
    this.showForecast.update(v => !v);
    if (this.showForecast()) {
      this.loadIssuedWarnings();
      setTimeout(() => this.initFormMap(), 60);
    } else {
      this.destroyFormMap();
    }
  }

  clearTrack(): void {
    this.fTrack.set([]);
    if (this.formLayer) { this.formLayer.clearLayers(); }
  }

  private loadIssuedWarnings(): void {
    this.http.get<any>('/api/v1/response/coordination/warnings').subscribe({
      next: r => this.issuedWarnings.set(r.warnings ?? []),
      error: () => this.issuedWarnings.set([]),
    });
  }

  applySelectedWarning(): void {
    const w = this.issuedWarnings().find(x => String(x.warning_id) === String(this.fWarningId));
    if (!w) { return; }
    this.fHazard = `${w.hazard || 'Issued warning'} — ${w.warning_code}`;
    this.fAreas = w.affected_areas || w.districts || w.regions || '';
    this.fEta = this.localInputValue(w.validity_start);
  }

  loadCycloneDemo(): void {
    this.fWarningId = '';
    this.fHazard = 'Tropical Cyclone — heavy rain + destructive winds';
    this.fAreas = 'Mtwara, Lindi, Pwani';
    const eta = new Date(this.now() + 30 * 3600_000);          // ~30h to landfall
    // datetime-local expects LOCAL wall-clock; shift off the tz offset so it round-trips correctly.
    this.fEta = new Date(eta.getTime() - eta.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    // A plausible SW-Indian-Ocean track curving in toward the southern coast.
    this.fTrack.set([[-12.6, 42.0], [-11.4, 41.2], [-10.4, 40.3], [-9.6, 39.8], [-8.9, 39.4]]);
    this.redrawFormTrack();
  }

  submitForecast(): void {
    const areas = this.fAreas.split(',').map(s => s.trim()).filter(Boolean);
    if (!areas.length) { return; }
    const eta = this.fEta ? new Date(this.fEta) : null;
    const pts = this.fTrack();
    // Distribute timestamps from now → ETA across the track (last point = landfall).
    const start = this.now();
    const end = eta ? eta.getTime() : start + 24 * 3600_000;
    const track = pts.map((p, i) => {
      const t = pts.length <= 1 ? end : start + (end - start) * (i / (pts.length - 1));
      return [p[0], p[1], new Date(t).toISOString()];
    });
    const body = {
      warning_id: this.fWarningId || null,
      hazard_description: this.fHazard.trim(),
      affected_areas: areas,
      expected_impact_at: eta ? eta.toISOString() : null,
      forecast_track: track.length ? track : null,
      mode: this.fSim ? 'simulation' : 'live',
      allow_real_ops: this.fSim && this.fRealOps,
    };
    this.http.post<any>('/api/v1/response/coordination/forecast', body).subscribe({
      next: res => {
        this.showForecast.set(false);
        this.destroyFormMap();
        this.fWarningId = ''; this.fHazard = ''; this.fAreas = ''; this.fEta = ''; this.fSim = false; this.fRealOps = false; this.fTrack.set([]);
        this.openBoard(res.activation_id);
      },
      error: err => ensureSweetAlert().then(() => this.swal({ title: 'Error', text: err?.error?.detail ?? 'Could not open the post.', icon: 'error' })),
    });
  }

	  launchScenario(s: any): void {
	    ensureSweetAlert().then(() => this.swal({
	      titleText: `Launch exercise: ${s.title ?? 'scenario'}`,
      html: `<label style="display:block;text-align:left;font-size:0.78rem;color:#94a3b8;margin:4px 0 3px">Time compression</label>
             <input id="scFactor" type="number" min="0.1" step="0.1" class="swal2-input" value="${Number(s.default_time_compression) || 1}">
             <label style="display:block;text-align:left;font-size:0.82rem;margin:8px 0">
               <input id="scRealOps" type="checkbox"> Full-scale exercise — allow real operations
             </label>
             <input id="scNotes" class="swal2-input" placeholder="Launch note (optional)">`,
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const factor = Number((document.getElementById('scFactor') as HTMLInputElement).value);
        if (!factor || factor <= 0) { Swal.showValidationMessage('Enter a positive compression factor'); return false; }
        return {
          time_compression_factor: factor,
          allow_real_ops: (document.getElementById('scRealOps') as HTMLInputElement).checked,
          notes: (document.getElementById('scNotes') as HTMLInputElement).value.trim() || null,
        };
      },
    }).then((r: any) => {
      if (!r.isConfirmed) { return; }
      this.http.post<any>(`/api/v1/response/coordination/scenarios/${s.id}/launch`, r.value).subscribe({
        next: res => {
          this.load();
          const first = res.activations?.[0]?.activation_id;
          if (first) { this.openBoard(first); }
        },
        error: err => this.swal({ title: 'Error', text: err?.error?.detail ?? 'Could not launch exercise.', icon: 'error' }),
      });
    }));
  }

  // ── maps (Leaflet) ──
  private initFormMap(): void {
    const el = document.getElementById('forecastMap');
    if (!el || typeof L === 'undefined') { return; }
    this.destroyFormMap();
    this.formMap = L.map(el, { center: [-8.5, 39.5], zoom: 6, zoomControl: true, attributionControl: false });
    addTanzaniaDarkBase(this.formMap, this.http);
    addMapNav(this.formMap, { dark: true, home: [-8.5, 39.5, 6] });
    // High-z-index pane so plotted points sit above the opaque (async) water layer.
    this.formMap.createPane('storm');
    this.formMap.getPane('storm').style.zIndex = '650';
    this.formLayer = L.layerGroup().addTo(this.formMap);
    this.formMap.on('click', (e: any) => {
      this.fTrack.update(t => [...t, [+e.latlng.lat.toFixed(2), +e.latlng.lng.toFixed(2)]]);
      this.redrawFormTrack();
    });
    setTimeout(() => this.formMap?.invalidateSize(), 80);
    this.redrawFormTrack();
  }

  private localInputValue(value: string | null | undefined): string {
    if (!value) { return ''; }
    const d = new Date(value);
    if (isNaN(d.getTime())) { return ''; }
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  private redrawFormTrack(): void {
    if (!this.formLayer) { return; }
    this.formLayer.clearLayers();
    const pts = this.fTrack();
    if (pts.length > 1) { L.polyline(pts, { pane: 'storm', color: '#38bdf8', weight: 3, dashArray: '6 6' }).addTo(this.formLayer); }
    pts.forEach((p, i) => {
      const landfall = i === pts.length - 1;
      L.circleMarker(p, {
        pane: 'storm', radius: landfall ? 8 : 5, color: landfall ? '#ef4444' : '#38bdf8',
        fillColor: landfall ? '#ef4444' : '#0ea5e9', fillOpacity: 0.9,
      }).bindTooltip(landfall ? 'Forecast landfall' : `Track point ${i + 1}`).addTo(this.formLayer);
    });
  }

  private destroyFormMap(): void {
    if (this.formMap) { this.formMap.remove(); this.formMap = null; this.formLayer = null; }
  }

  /**
   * Storm-track board map: forecast path, cone of uncertainty, and an animated storm eye with
   * wind-field rings sweeping toward landfall (RSMC La Réunion / NHC cyclone-graphic conventions).
   *
   * The cyclone forms over the Indian Ocean, so most of the track is over WATER. The shared
   * Tanzania GIS base paints an OPAQUE water layer that loads asynchronously and would cover the
   * storm. We therefore draw every storm layer into a dedicated high-z-index Leaflet pane that
   * always sits ABOVE the water — without modifying the shared base (so other maps are unaffected).
   */
  private initStormMap(activation: any): void {
    const el = document.getElementById('stormMap');
    if (!el || typeof L === 'undefined') { return; }
    this.stopStorm();
    const track = this.parseTrack(activation.forecast_track);
    const map = L.map(el, { center: track.length ? track[Math.floor(track.length / 2)] : [-8.5, 39.5], zoom: 6, zoomControl: true, attributionControl: false });
    this.stormMap = map;
    addTanzaniaDarkBase(map, this.http);
    addMapNav(map, { dark: true, home: [-8.5, 39.5, 6] });
    // Dedicated pane above the overlay/water panes (overlayPane z-index is 400).
    map.createPane('storm');
    map.getPane('storm').style.zIndex = '650';
    const pane = 'storm';
    if (track.length) {
      const line = track.map(p => [p[0], p[1]]);
      // Cone of uncertainty — widens from the storm's current position to forecast landfall.
      const cone = this.buildCone(track);
      if (cone.length) {
        L.polygon(cone, { pane, color: '#38bdf8', weight: 1, opacity: 0.5, fillColor: '#38bdf8', fillOpacity: 0.12, dashArray: '4 4', interactive: false })
          .addTo(map);
      }
      // Forecast track + forecast-position markers (labelled by +6h forecast step)
      L.polyline(line, { pane, color: '#7dd3fc', weight: 3, dashArray: '6 6', interactive: true }).addTo(map);
      track.forEach((p, i) => {
        const landfall = i === track.length - 1;
        L.circleMarker([p[0], p[1]], {
          pane, radius: landfall ? 8 : 4, color: '#ffffff', weight: landfall ? 2 : 1,
          fillColor: landfall ? '#ef4444' : '#0ea5e9', fillOpacity: 1,
        }).bindTooltip(landfall ? 'Forecast landfall' : `+${i * 6}h`, { sticky: true }).addTo(map);
      });
      try { map.fitBounds(L.latLngBounds(cone.length ? cone : line).pad(0.15)); } catch { /* single point */ }
      // Animated eye + wind-field rings (outer = tropical-storm-force, inner = destructive winds)
      const outer = L.circle(line[0], { pane, radius: 95000, color: '#f59e0b', weight: 1, opacity: 0.6, fillColor: '#f59e0b', fillOpacity: 0.10, interactive: false }).addTo(map);
      const inner = L.circle(line[0], { pane, radius: 42000, color: '#ef4444', weight: 1, opacity: 0.7, fillColor: '#ef4444', fillOpacity: 0.18, interactive: false }).addTo(map);
      const eye = L.circleMarker(line[0], { pane, radius: 7, color: '#ffffff', weight: 2, fillColor: '#b91c1c', fillOpacity: 1 }).addTo(map).bindTooltip('Storm centre', { sticky: true });
      const segs = (track.length - 1) || 1;
      let step = 0;
      this.stormAnim = setInterval(() => {
        step = (step + 1) % (segs * 18);
        const seg = Math.floor(step / 18), f = (step % 18) / 18;
        const a = track[seg], b = track[Math.min(seg + 1, track.length - 1)];
        const pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        eye.setLatLng(pos); outer.setLatLng(pos); inner.setLatLng(pos);
      }, 110);
    }
    setTimeout(() => map.invalidateSize(), 80);
  }

  /** Cone of uncertainty polygon — perpendicular offsets growing from current position to landfall. */
  private buildCone(track: number[][]): [number, number][] {
    const n = track.length;
    if (n < 2) { return []; }
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = track[Math.max(0, i - 1)], b = track[Math.min(n - 1, i + 1)];
      let dlat = b[0] - a[0], dlng = b[1] - a[1];
      const len = Math.hypot(dlat, dlng) || 1;
      dlat /= len; dlng /= len;
      const r = 0.15 + (0.7 - 0.15) * (i / (n - 1));   // ° offset, widening with forecast time
      const plat = -dlng * r, plng = dlat * r;          // perpendicular to track
      left.push([track[i][0] + plat, track[i][1] + plng]);
      right.push([track[i][0] - plat, track[i][1] - plng]);
    }
    return [...left, ...right.reverse()];
  }

  private parseTrack(raw: any): number[][] {
    if (!raw) { return []; }
    let arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch { return []; } }
    return Array.isArray(arr) ? arr.map((p: any) => [Number(p[0]), Number(p[1])]).filter(p => !isNaN(p[0]) && !isNaN(p[1])) : [];
  }

  private stopStorm(): void {
    if (this.stormAnim) { clearInterval(this.stormAnim); this.stormAnim = null; }
    if (this.stormMap) { this.stormMap.remove(); this.stormMap = null; }
  }

  // ── existing R11 activation + lane operations ──
  activate(incident: any, simulation: boolean): void {
    ensureSweetAlert().then(() => this.swal({
      titleText: simulation ? `Run a SIMULATION exercise for "${incident.title}"?` : `Activate LIVE response for "${incident.title}"?`,
      ...(simulation ? {
        html: 'A flagged drill copy of the incident is created — the board is identical.<br><br>'
          + '<b>Table-top</b>: real logistics, money and communications are blocked.<br>'
          + '<b>Full-scale</b>: real operations are permitted; all alerts are [DRILL]-marked.',
        input: 'select',
        inputOptions: { tabletop: 'Table-top drill (board only)', fullscale: 'Full-scale exercise (real operations)' },
        inputValue: 'tabletop',
      } : {
        text: 'All 15 DRFs and their default tasks will be created and the 72-hour clock starts.',
        input: 'text', inputLabel: 'Activation notes (optional)',
      }),
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/activate/${incident.id}`,
          { mode: simulation ? 'simulation' : 'live',
            allow_real_ops: simulation && r.value === 'fullscale',
            notes: simulation ? null : (r.value || null) },
          (res: any) => this.openBoard(res.activation_id));
      }
    }));
  }

  // ── ICS command roles (F05) ──

  /** User picker options — lazily loaded once from the task modal's form-data endpoint. */
  readonly icsUsers = signal<any[]>([]);

  roleEntry(role: string): any {
    return (this.board()?.command_roles ?? []).find((r: any) => r.role === role);
  }
  /** IC + command staff (top row of the org chart). */
  commandRow(): any[] {
    return ['IC', 'Deputy IC', 'PIO', 'Safety', 'Liaison'].map(r => this.roleEntry(r)).filter(Boolean);
  }
  /** General-Staff section chiefs (second row). */
  sectionChiefs(): any[] {
    return ['Operations', 'Planning', 'Logistics', 'Finance/Admin'].map(r => this.roleEntry(r)).filter(Boolean);
  }
  /** The DRF lanes a section chief runs — board drfs resolved through the static section map. */
  sectionLanes(section: string): any[] {
    const b = this.board();
    const nums: number[] = b?.drf_sections?.[section] ?? [];
    return nums.map(n => (b?.drfs ?? []).find((d: any) => Number(d.number) === Number(n))).filter(Boolean);
  }

	  appointRole(entry: any): void {
	    const id = this.board()!.activation.id;
	    const open = (users: any[]) => {
	      const options = users.map((u: any) => `<option value="${Number(u.id)}">${escapeHtml(u.name)}</option>`).join('');
	      ensureSweetAlert().then(() => this.swal({
	        titleText: `Appoint ${entry.role_title ?? 'role'}`,
	        html: `<select id="icsUser" class="swal2-select" style="width:85%"><option value="">Select officer…</option>${options}</select>
               <input id="icsNote" class="swal2-input" placeholder="Appointment / handover note (optional)">`,
        showCancelButton: true, confirmButtonColor: '#dc3545',
        preConfirm: () => {
          const uid = (document.getElementById('icsUser') as HTMLSelectElement).value;
          if (!uid) { Swal.showValidationMessage('Select the officer to appoint'); return false; }
          return { role: entry.role, user_id: Number(uid),
            note: (document.getElementById('icsNote') as HTMLInputElement).value.trim() || null };
        },
      }).then((r: any) => {
        if (r.isConfirmed) { this.post(`/api/v1/response/coordination/${id}/command-roles`, r.value); }
      }));
    };
    if (this.icsUsers().length) {
      open(this.icsUsers());
    } else {
      this.http.get<any>('/api/v1/response/tasks/form-data').subscribe(d => {
        this.icsUsers.set(d.users ?? []);
        open(d.users ?? []);
      });
    }
  }

  relieveRole(entry: any): void {
    ensureSweetAlert().then(() => this.swal({
      titleText: `Relieve ${entry.user_name} as ${entry.role_title}?`,
      text: 'The role goes vacant until a replacement is appointed. The relief is journalled for the After-Action Review.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'text', inputLabel: 'Relief note (optional)',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/command-roles/${entry.id}/relieve`, { note: r.value || null });
      }
    }));
  }

  // ── Scenario injects (exercise director tools) ──

  injTitle = ''; injDetail = ''; injType = 'event'; injDueMin: number | null = null;
  firedInjects(): number {
    return (this.board()?.injects ?? []).filter((j: any) => j.status === 'fired').length;
  }
  addInject(): void {
    const id = this.board()!.activation.id;
    const due = this.injDueMin != null && this.injDueMin > 0
      ? new Date(Date.now() + this.injDueMin * 60000).toISOString().substring(0, 19) : null;
    this.post(`/api/v1/response/coordination/${id}/injects`,
      { title: this.injTitle.trim(), detail: this.injDetail.trim() || null, inject_type: this.injType, due_at: due },
      () => { this.injTitle = ''; this.injDetail = ''; this.injDueMin = null; this.openBoard(id); });
  }
  fireInject(j: any): void {
    const id = this.board()!.activation.id;
    this.post(`/api/v1/response/coordination/${id}/injects/${j.id}/fire`, {}, () => this.openBoard(id));
  }
  resolveInject(j: any): void {
    const id = this.board()!.activation.id;
    ensureSweetAlert().then(() => this.swal({
      titleText: `Resolve inject: ${j.title}`, input: 'text', inputLabel: 'Decision / response taken',
      showCancelButton: true, confirmButtonColor: '#16a34a',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/${id}/injects/${j.id}/resolve`,
          { resolution: r.value || null }, () => this.openBoard(id));
      }
    }));
  }

  /** Formal printable After-Action Report (print → Save as PDF). Built entirely from the board's
   *  real data — journal timeline, task completion, DRF performance, injects, challenges. */
  printAar(): void {
    const b = this.board();
    const aar = b?.aar;
    if (!b || !aar) { return; }
    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const dt = (s: any) => s ? String(s).substring(0, 16).replace('T', ' ') : '—';
    const a = b.activation;
    const kind = a.is_simulation ? (a.allow_real_ops ? 'FULL-SCALE EXERCISE' : 'TABLE-TOP DRILL') : 'LIVE RESPONSE';
    const rows = (list: any[], f: (x: any) => string, empty: string) =>
      list?.length ? list.map(f).join('') : `<tr><td colspan="9" class="mut">${empty}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>After-Action Report — ${esc(a.incident_title)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 34px 44px; font-size: 12px; }
  .hd { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0d3b66; padding-bottom: 10px; }
  .hd h1 { font-size: 17px; color: #0d3b66; margin: 2px 0 0; } .hd .gov { font-size: 10px; letter-spacing: 1.5px; color: #64748b; text-transform: uppercase; font-weight: 700; }
  .kind { font-size: 11px; font-weight: 800; color: #6d28d9; border: 2px solid #6d28d9; border-radius: 6px; padding: 3px 10px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #0d3b66; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin: 20px 0 7px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 4px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #475569; }
  .meta td:first-child { font-weight: 700; width: 170px; color: #475569; }
  .score { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0; }
  .sc { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 13px; text-align: center; min-width: 96px; }
  .sc b { display: block; font-size: 17px; color: #0d3b66; } .sc small { color: #64748b; font-size: 9.5px; }
  .mut { color: #94a3b8; font-style: italic; } .bar { background: #e2e8f0; border-radius: 4px; height: 7px; width: 110px; }
  .fill { background: #0d3b66; height: 7px; border-radius: 4px; }
  .sign { display: flex; gap: 60px; margin-top: 46px; } .sign div { flex: 1; border-top: 1px solid #334155; padding-top: 5px; font-size: 11px; color: #475569; }
  @media print { body { margin: 12mm 14mm; } }
</style></head><body>
<div class="hd">
  <div><div class="gov">The United Republic of Tanzania — Prime Minister's Office · Disaster Management</div>
    <h1>After-Action Report — ${esc(a.incident_title)}</h1></div>
  <div class="kind">${kind}</div>
</div>
<h2>Exercise / response summary</h2>
<table class="meta">
  <tr><td>Activated</td><td>${dt(aar.duration.activated_at)} — by ${esc(a.activated_by_name ?? '—')}</td></tr>
  <tr><td>Closed</td><td>${dt(aar.duration.deactivated_at)} (${esc(aar.duration.status)})</td></tr>
  <tr><td>Duration</td><td>${esc(aar.duration.hours)} hours</td></tr>
  <tr><td>Final posture</td><td>${esc(aar.duration.posture)}</td></tr>
  <tr><td>Area</td><td>${esc(a.region_name ?? a.location_description ?? '—')}</td></tr>
</table>
<h2>Scorecard</h2>
<div class="score">
  <div class="sc"><b>${aar.tasks.completed}/${aar.tasks.total}</b><small>tasks completed</small></div>
  <div class="sc"><b>${aar.tasks.critical_completed}/${aar.tasks.critical_total}</b><small>72-hr critical done</small></div>
  <div class="sc"><b>${aar.tasks.avg_progress}%</b><small>average progress</small></div>
  <div class="sc"><b>${aar.tasks.challenges}</b><small>challenges raised</small></div>
  <div class="sc"><b>${aar.tasks.agencies_engaged}</b><small>agencies engaged</small></div>
  <div class="sc"><b>${aar.injects.resolved}/${aar.injects.total}</b><small>injects resolved</small></div>
  <div class="sc"><b>${aar.injects.avg_response_minutes} min</b><small>avg inject response</small></div>
</div>
<h2>Escalation &amp; decision timeline</h2>
<table><tr><th style="width:120px">Time</th><th style="width:130px">Actor</th><th>Event</th></tr>
${rows(aar.timeline, (e: any) => `<tr><td>${dt(e.created_at)}</td><td>${esc(e.user_name ?? 'System')}</td><td>${esc(e.message)}</td></tr>`, 'No journalled decisions.')}
</table>
<h2>Scenario injects</h2>
<table><tr><th>Inject</th><th style="width:70px">Type</th><th style="width:105px">Fired</th><th style="width:105px">Resolved</th><th>Decision / response</th></tr>
${rows(b.injects, (j: any) => `<tr><td><b>${esc(j.title)}</b>${j.detail ? '<br>' + esc(j.detail) : ''}${j.expected_action ? '<br><small>Expected: ' + esc(j.expected_action) + '</small>' : ''}</td><td>${esc(j.target_drf_number ? 'DRF ' + j.target_drf_number : j.inject_type)}</td><td>${dt(j.fired_at)}</td><td>${dt(j.resolved_at)}</td><td>${esc(j.resolution ?? '—')}</td></tr>`, 'No injects were scripted.')}
</table>
<h2>DRF lane performance (NDPRP 2022)</h2>
<table><tr><th style="width:40px">DRF</th><th>Function</th><th style="width:90px">Completed</th><th style="width:130px">Progress</th></tr>
${rows(aar.drf_performance, (d: any) => `<tr><td>${d.number}</td><td>${esc(d.name)}</td><td>${d.completed}/${d.total}</td><td><div class="bar"><div class="fill" style="width:${d.progress}%"></div></div> ${d.progress}%</td></tr>`, 'No lane data.')}
</table>
<h2>Challenges reported</h2>
<table><tr><th style="width:55px">DRF</th><th>Challenge</th><th style="width:170px">Agency</th></tr>
${rows(b.challenges, (c: any) => `<tr><td>DRF ${c.drf_number}</td><td>${esc(c.challenge)}<br><small class="mut">${esc(c.title)}</small></td><td>${esc(c.stakeholder_organization ?? '—')}</td></tr>`, 'No challenges were raised.')}
</table>
<div class="sign">
  <div>Exercise Director / Incident Commander<br><br>Name &amp; signature · date</div>
  <div>Director, Disaster Management Department<br><br>Name &amp; signature · date</div>
</div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  deactivate(): void {
    ensureSweetAlert().then(() => this.swal({
      title: 'Close this response?', icon: 'question', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'select', inputOptions: { completed: 'Completed (mission accomplished)', deactivated: 'Deactivated (stood down)' },
      inputValue: 'completed',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/deactivate`,
          { status: r.value }, () => this.closeBoard());
      }
    }));
  }

	  assignLane(drf: any): void {
	    const options = (this.board()?.stakeholders ?? [])
	      .map((s: any) => `<option value="${Number(s.id)}">${escapeHtml(s.organization ?? s.name)}</option>`).join('');
	    ensureSweetAlert().then(() => this.swal({
	      titleText: `Assign DRF ${drf.number} to an agency`,
      html: `<select id="ag" class="swal2-select" style="width:85%">${options}</select>`,
      showCancelButton: true, confirmButtonColor: '#dc3545',
      preConfirm: () => ({ stakeholder_id: Number((document.getElementById('ag') as HTMLSelectElement).value) }),
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/drf/${drf.id}/assign`, r.value);
      }
    }));
  }

  addTask(drf: any): void {
    ensureSweetAlert().then(() => this.swal({
      titleText: `Add task to DRF ${drf.number}`,
      html: `<input id="tt" class="swal2-input" placeholder="Task title">
             <select id="tp" class="swal2-select" style="width:85%">
               <option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
             <label style="font-size:0.8rem"><input id="tc" type="checkbox"> 72-hour critical</label>`,
      showCancelButton: true, confirmButtonColor: '#dc3545',
      preConfirm: () => {
        const title = (document.getElementById('tt') as HTMLInputElement).value.trim();
        if (!title) { Swal.showValidationMessage('Title is required'); return false; }
        return { title, priority: (document.getElementById('tp') as HTMLSelectElement).value,
          is_72hr_critical: (document.getElementById('tc') as HTMLInputElement).checked };
      },
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/drf/${drf.id}/task`, r.value);
      }
    }));
  }

  updateTask(task: any, change: any): void {
    this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/task/${task.id}`, change);
  }

  reportChallenge(task: any): void {
    ensureSweetAlert().then(() => this.swal({
      title: 'Report a challenge', input: 'textarea', inputLabel: `Task: ${task.title}`,
      showCancelButton: true, confirmButtonColor: '#dc3545',
      preConfirm: (v: string) => {
        if (!v?.trim()) { Swal.showValidationMessage('Describe the challenge'); return false; }
        return v;
      },
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/${this.board()!.activation.id}/task/${task.id}`, { challenge: r.value });
      }
    }));
  }

	  removeTask(task: any): void {
	    ensureSweetAlert().then(() => this.swal({
	      titleText: `Remove "${task.title ?? 'task'}"?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.http.delete<any>(`/api/v1/response/coordination/${this.board()!.activation.id}/task/${task.id}`)
          .subscribe(() => this.refresh());
      }
    }));
  }

  /** Dark-themed SweetAlert wrapper — keeps every confirmation/form on the command console's palette. */
  private swal(opts: any): Promise<any> {
    return Swal.fire({ background: '#1a2333', color: '#e2e8f0',
      customClass: { popup: 'swal-dark' }, confirmButtonColor: '#dc3545', ...opts });
  }

  private post(url: string, body: any, after?: (res: any) => void): void {
    this.http.post<any>(url, body).subscribe({
      next: res => {
        if (after) { after(res); } else { this.refresh(); }
      },
      error: err => ensureSweetAlert().then(() =>
        this.swal({ title: 'Error', text: err?.error?.detail ?? 'Action failed.', icon: 'error' })),
    });
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/vendor/sweetalert2/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = '/vendor/sweetalert2/sweetalert2.all.min.js';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
