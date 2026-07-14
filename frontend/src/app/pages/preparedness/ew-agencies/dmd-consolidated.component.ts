import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DecimalPipe, NgClass } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EwAgencyService, Consolidated } from './ew-agency.service';
import { EwCrossAgencyPanelComponent } from './ew-cross-agency-panel.component';
import { EwPreviewModalComponent } from './ew-preview-modal.component';
import {
  ALERT_LEVELS, alertColor, AGENCIES, AGENCY_HAZARDS, HAZ_ICON,
  leafletDrawControlOptions, leafletDrawShapeOptions, shapeLeafletStyle,
  leafletLayerFromDelineation, forceLayerStyle, tagShapeForPdf,
} from './ew-agency.model';
import { escapeHtml } from '../../../core/html';
import { addLocalVectorBase } from '../../../core/tz-map';


/** type-key -> icon file, flattened across all agencies' hazards (for the overlay markers). */
const ICON_BY_TYPE: Record<string, string> = Object.values(AGENCY_HAZARDS).flat()
  .reduce((m, h) => { m[h.key] = h.icon; return m; }, {} as Record<string, string>);

declare const L: any;

/**
 * PMO-DMD consolidated impact view — overlays ALL warning entities' submissions into one realistic
 * 3-day picture. The backend merges them highest-alert-wins per district (native rebuild of the Python
 * DMD auto-import/merge); this screen renders the merged tiers on the district map + every agency's
 * narrative. The Python DMD page remains the canonical authoring surface — this is the native overlay view.
 */
@Component({
  selector: 'page-dmd-consolidated',
  standalone: true,
  imports: [NgClass, DecimalPipe, RouterLink, EwCrossAgencyPanelComponent, EwPreviewModalComponent],
  styles: [`
    .wrap { padding: 12px 16px 36px; max-width: 1600px; margin: 0 auto; }
    .hd { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
    .hd .ic { width: 42px; height: 42px; border-radius: 11px; background: #ede7f6; color: #4527a0; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0; }
    .hd h1 { font-size: 1.2rem; margin: 0; color: #14303a; } .hd .sub { font-size: 0.78rem; color: #6c757d; max-width: 520px; }
    .src { margin-left: auto; font-size: 0.78rem; color: #475569; text-align: right; }
    .src .chip { display: inline-block; font-size: 0.75rem; font-weight: 700; border-radius: 6px; padding: 1px 7px; margin: 2px 0 0 4px; color: #fff; }
    /* Map-first layout: wide map + slim tools rail */
    .main-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 340px); gap: 12px; align-items: start; }
    @media (max-width: 1100px) { .main-grid { grid-template-columns: 1fr; } }
    .panel { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 10px 12px; }
    .panel.map-panel { padding: 10px; }
    .side-rail { display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 120px); overflow: auto; position: sticky; top: 8px; }
    .day-tabs { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
    .day-tabs button { flex: 1; min-width: 4.5rem; font-size: 0.78rem; font-weight: 600; color: #607089; border: 1px solid #e3e6ed; background: #f8fafc; padding: 7px 4px; border-radius: 8px; cursor: pointer; font-family: inherit; line-height: 1.2; }
    .day-tabs button.on { background: #4527a0; color: #fff; border-color: #4527a0; }
    .day-tabs button .subtag { display: block; font-size: 0.62rem; font-weight: 600; opacity: 0.85; margin-top: 2px; }
    .day-tabs button.pdf-out { opacity: 0.85; border-style: dashed; }
    .ready-panel { margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #f8fafc; font-size: 0.72rem; color: #334155; }
    .ready-panel h4 { margin: 0 0 6px; font-size: 0.78rem; color: #4527a0; }
    .ready-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
    .ready-ok { color: #166534; font-weight: 700; }
    .ready-miss { color: #b91c1c; font-weight: 700; }
    .ready-na { color: #94a3b8; font-weight: 600; }
    .sw-sm { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 3px; vertical-align: -1px; }
    #dmdmap { height: min(68vh, 640px); min-height: 420px; border-radius: 10px; border: 1px solid #e3e6ed; }
    .legend { display: flex; gap: 10px; margin-top: 6px; font-size: 0.75rem; color: #475569; flex-wrap: wrap; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 3px; vertical-align: -2px; }
    .tier-counts { display: flex; gap: 6px; margin-bottom: 8px; }
    .tc { flex: 1; text-align: center; border-radius: 8px; padding: 6px 4px; color: #1a1a1a; }
    .tc b { display: block; font-size: 1.25rem; } .tc span { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; }
    .tool-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 0.74rem; color: #475569; flex-wrap: wrap; }
    .chip-btn { border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid #cbd5e1; background: #fff; color: #334155; }
    .chip-btn.on { color: #fff; }
    /* Impact Analysis command bars — View / Paint-Edit / Compose / Context */
    .ia-bar {
      display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 12px;
      padding: 8px 10px; margin-bottom: 6px; border-radius: 10px;
      border: 1px solid #e2e8f0; background: linear-gradient(180deg, #fafbfc 0%, #f1f5f9 100%);
    }
    .ia-bar.view { border-color: #bfdbfe; background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%); }
    .ia-bar.paint { border-color: #ddd6fe; background: linear-gradient(180deg, #f5f3ff 0%, #fafafa 100%); }
    .ia-bar.compose { border-color: #bbf7d0; background: linear-gradient(180deg, #ecfdf5 0%, #f8fafc 100%); }
    .ia-bar.context { border-color: #fcd34d; background: linear-gradient(180deg, #fffbeb 0%, #f8fafc 100%); }
    .ia-bar.context .ia-label { color: #b45309; }
    .ia-bar.eo { border-color: #5eead4; background: linear-gradient(180deg, #f0fdfa 0%, #f8fafc 100%); }
    .ia-bar.eo .ia-label { color: #0f766e; }
    .ia-status-strip {
      display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center;
      padding: 6px 10px; margin-bottom: 8px; border-radius: 8px;
      border: 1px solid #e2e8f0; background: #fff; font-size: 0.7rem; color: #475569;
    }
    .ia-status-strip b { color: #0f172a; }
    .compose-anchor { scroll-margin-top: 12px; }
    /* Satellite EO time-slice workspace */
    .eo-panel {
      margin-top: 8px; border: 1px solid #99f6e4; border-radius: 12px;
      background: linear-gradient(180deg, #f0fdfa 0%, #fff 40%);
      padding: 10px 12px; box-shadow: 0 1px 3px rgba(15, 118, 110, 0.08);
    }
    .eo-panel h3 {
      margin: 0 0 6px; font-size: 0.88rem; color: #0f766e;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .eo-panel h3 .sub { font-size: 0.68rem; font-weight: 600; color: #64748b; }
    .eo-row { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; margin-bottom: 8px; }
    .eo-row .fld-inline {
      display: flex; align-items: center; gap: 5px; font-size: 0.68rem; font-weight: 700; color: #0f766e;
    }
    .eo-row select, .eo-row input[type="date"], .eo-row input[type="range"] {
      border: 1px solid #5eead4; border-radius: 6px; padding: 3px 6px; font: inherit; font-size: 0.74rem; font-weight: 600; color: #134e4a; background: #fff;
    }
    .eo-row input[type="range"] { width: min(220px, 100%); accent-color: #0f766e; }
    .eo-chip {
      border-radius: 6px; padding: 3px 8px; font-size: 0.7rem; font-weight: 700; cursor: pointer;
      font-family: inherit; border: 1px solid #99f6e4; background: #fff; color: #0f766e;
    }
    .eo-chip.on { background: #0f766e; color: #fff; border-color: #0f766e; }
    .eo-chip.day { min-width: 4.2rem; text-align: center; line-height: 1.15; padding: 4px 6px; }
    .eo-chip.day .d { display: block; font-size: 0.62rem; opacity: 0.85; font-weight: 600; }
    .eo-timeline {
      display: flex; gap: 4px; overflow-x: auto; padding: 4px 0 8px; scrollbar-width: thin;
    }
    .eo-film {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; margin-top: 6px;
    }
    .eo-frame {
      border: 2px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #0f172a;
      cursor: pointer; position: relative; aspect-ratio: 4/3;
    }
    .eo-frame.on { border-color: #0f766e; box-shadow: 0 0 0 2px #99f6e4; }
    .eo-frame img { width: 100%; height: 100%; object-fit: cover; display: block; background: #1e293b; }
    .eo-frame .cap {
      position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 5px;
      background: linear-gradient(transparent, rgba(15,23,42,.88)); color: #f8fafc;
      font-size: 0.62rem; font-weight: 700; text-align: center;
    }
    .eo-frame .err-cap { color: #fca5a5; font-size: 0.6rem; padding: 8px; text-align: center; }
    .eo-links { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 6px; font-size: 0.72rem; }
    .eo-links a { color: #0f766e; font-weight: 700; text-decoration: none; }
    .eo-links a:hover { text-decoration: underline; }
    .eo-badge-live {
      font-size: 0.6rem; font-weight: 800; background: #ccfbf1; color: #0f766e;
      border: 1px solid #5eead4; border-radius: 999px; padding: 1px 7px;
    }
    /* Exposure overlays — grouped, no flow distortion */
    .exp-section { margin-top: 8px; }
    .exp-section-hd {
      font-size: 0.65rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;
      color: #64748b; margin: 0 0 5px; display: flex; align-items: center; gap: 6px;
    }
    .exp-quick {
      display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 8px;
    }
    .exp-quick .chip-btn { font-size: 0.7rem; }
    .struct-bar {
      width: 100%; display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center;
      margin-top: 6px; padding-top: 6px; border-top: 1px dashed #fde68a;
    }
    .struct-bar a, .struct-bar button.struct-link {
      font-size: 0.72rem; font-weight: 700; color: #0f766e; text-decoration: none;
      border: 1px solid #99f6e4; background: #f0fdfa; border-radius: 6px; padding: 3px 8px;
      cursor: pointer; font-family: inherit;
    }
    .struct-bar a:hover, .struct-bar button.struct-link:hover { background: #ccfbf1; }
    .struct-bar .hint-s { font-size: 0.65rem; color: #78716c; width: 100%; margin: 2px 0 0; line-height: 1.35; }
    /* Systematic command console */
    .ia-shell { display: flex; flex-direction: column; gap: 0; }
    .workflow {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 10px;
    }
    @media (max-width: 900px) { .workflow { grid-template-columns: repeat(3, 1fr); } }
    .workflow button {
      border: 1px solid #e2e8f0; background: #fff; border-radius: 10px; padding: 8px 6px;
      cursor: pointer; font-family: inherit; text-align: center; transition: border-color .15s, box-shadow .15s;
    }
    .workflow button:hover { border-color: #94a3b8; }
    .workflow button.on {
      border-color: #4527a0; box-shadow: 0 0 0 2px rgba(69,39,160,.12); background: #f5f3ff;
    }
    .workflow button .wn {
      display: block; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.08em;
      text-transform: uppercase; color: #94a3b8; margin-bottom: 2px;
    }
    .workflow button.on .wn { color: #5b21b6; }
    .workflow button .wt { display: block; font-size: 0.78rem; font-weight: 800; color: #0f172a; }
    .workflow button .ws { display: block; font-size: 0.62rem; color: #64748b; margin-top: 2px; line-height: 1.25; }
    .cmd-dock {
      border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; margin-bottom: 8px; overflow: hidden;
    }
    .cmd-dock .dock-tabs {
      display: flex; flex-wrap: wrap; gap: 0; border-bottom: 1px solid #f1f5f9; background: #f8fafc;
    }
    .cmd-dock .dock-tabs button {
      flex: 1; min-width: 5.5rem; border: none; border-bottom: 2px solid transparent;
      background: transparent; padding: 9px 8px; font-family: inherit; font-size: 0.74rem;
      font-weight: 800; color: #64748b; cursor: pointer;
    }
    .cmd-dock .dock-tabs button.on {
      color: #0f172a; border-bottom-color: #4527a0; background: #fff;
    }
    .cmd-dock .dock-body { padding: 10px 12px; }
    .cmd-dock .dock-body.hidden { display: none; }
    .sat24-frame {
      width: 100%; height: min(52vh, 480px); min-height: 320px; border: 0; border-radius: 10px;
      background: #0f172a;
    }
    .sat24-toolbar {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px;
    }
    .seg {
      display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;
    }
    .seg button {
      border: none; background: #fff; padding: 5px 10px; font-size: 0.72rem; font-weight: 700;
      font-family: inherit; color: #334155; cursor: pointer; border-right: 1px solid #e2e8f0;
    }
    .seg button:last-child { border-right: none; }
    .seg button.on { background: #0f766e; color: #fff; }
    .map-stack { position: relative; }
    .map-chrome {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: space-between;
      margin-bottom: 6px;
    }
    .rail-hd {
      font-weight: 800; font-size: 0.8rem; color: #4527a0; margin-bottom: 8px;
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
    }
    .rail-section { margin-bottom: 8px; }
    .ia-group { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; }
    .ia-label {
      font-size: 0.65rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
      color: #64748b; margin-right: 2px; white-space: nowrap;
    }
    .ia-bar.view .ia-label { color: #1d4ed8; }
    .ia-bar.paint .ia-label { color: #5b21b6; }
    .ia-bar.compose .ia-label { color: #047857; }
    .ia-sep { width: 1px; height: 22px; background: #cbd5e1; margin: 0 2px; flex-shrink: 0; }
    .ia-note { font-size: 0.68rem; color: #64748b; width: 100%; margin: 2px 0 0; line-height: 1.35; }
    .ia-badge {
      font-size: 0.62rem; font-weight: 800; border-radius: 999px; padding: 1px 7px;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .ia-badge.live { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .ia-badge.ready { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .ia-badge.deferred { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
    .ia-badge.planned { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .exp-grid { display: grid; gap: 6px; }
    .exp-row {
      display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: start;
      padding: 7px 8px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; font-size: 0.72rem;
    }
    .exp-row.on { border-color: #93c5fd; background: #eff6ff; }
    .exp-row.disabled { opacity: 0.72; background: #f8fafc; }
    .exp-row b { color: #0f172a; font-size: 0.76rem; display: block; }
    .exp-row .meta { color: #64748b; margin-top: 2px; line-height: 1.35; }
    .exp-row label { display: flex; align-items: center; gap: 4px; cursor: pointer; margin-top: 2px; }
    .ia-cmd {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: space-between;
      margin-bottom: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff;
    }
    .ia-cmd h1 { font-size: 1.05rem; margin: 0; color: #0f172a; }
    .ia-cmd .tagline { font-size: 0.72rem; color: #64748b; margin: 2px 0 0; max-width: 52rem; line-height: 1.4; }
    /* Collapsible sections */
    details.acc { border: 1px solid #e2e8f0; border-radius: 8px; background: #fafafa; font-size: 0.74rem; color: #334155; }
    details.acc > summary { cursor: pointer; font-weight: 800; padding: 8px 10px; list-style: none; display: flex; align-items: center; gap: 6px; color: #1e293b; }
    details.acc > summary::-webkit-details-marker { display: none; }
    details.acc > summary::before { content: '▸'; color: #94a3b8; font-size: 0.7rem; }
    details.acc[open] > summary::before { content: '▾'; }
    details.acc .acc-body { padding: 0 10px 10px; line-height: 1.4; border-top: 1px solid #f1f5f9; }
    details.acc.warm { background: #fffbeb; border-color: #fcd34d; }
    details.acc.warm > summary { color: #92400e; }
    details.acc.violet { background: #faf5ff; border-color: #c4b5fd; }
    details.acc.violet > summary { color: #4527a0; }
    details.acc.evac-acc { background: #ecfdf5; border-color: #a7f3d0; }
    details.acc.evac-acc > summary { color: #065f46; }
    /* Below map: full-width composition */
    .compose-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
    @media (max-width: 900px) { .compose-grid { grid-template-columns: 1fr; } }
    .compose-grid .panel h3 { font-size: 0.86rem; margin: 0 0 6px; color: #1f2d3d; }
    .compose-grid textarea { width: 100%; box-sizing: border-box; border: 1px solid #e3e6ed; border-radius: 8px; padding: 8px 10px; font-family: inherit; font-size: 0.8rem; color: #1f2d3d; resize: vertical; min-height: 110px; }
    .compose-grid .hint { font-size: 0.72rem; color: #94a3b8; margin: 0 0 6px; }
    .cmt { border-left: 3px solid #ccc; padding: 6px 10px; margin-bottom: 8px; background: #fbfcfe; border-radius: 0 8px 8px 0; }
    .cmt .ch { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: #1f2d3d; }
    .cmt .ch .pill { font-size: 0.75rem; font-weight: 800; border-radius: 6px; padding: 1px 6px; margin-left: auto; }
    .cmt .cd { font-size: 0.85rem; color: #475569; margin-top: 3px; }
    .cmt .ca { font-size: 0.8rem; color: #94a3b8; margin-top: 2px; }
    h3 { font-size: 0.88rem; color: #1f2d3d; margin: 4px 0 8px; }
    .pushbtn { font-size: 0.8rem; font-weight: 700; border-radius: 8px; padding: 8px 14px; border: none; cursor: pointer; font-family: inherit; color: #fff; background: #4527a0; }
    .pushbtn:hover:not(:disabled) { filter: brightness(0.94); }
    .pushbtn:disabled { opacity: 0.55; cursor: default; }
    .pushflash { padding: 9px 13px; border-radius: 9px; font-size: 0.82rem; margin-bottom: 10px; }
    .pushflash.ok { background: #ede7f6; color: #4527a0; border: 1px solid #b39ddb; }
    .pushflash.err { background: #fee2e2; color: #b91c1c; }
    .sup-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
    .sup-table th { background: #f8fafc; padding: 4px; position: sticky; top: 0; }
    .sup-table td { padding: 4px; border-top: 1px solid #f1f5f9; }
    .sup-wrap { max-height: 180px; overflow: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 6px; }
    .fld { display: grid; gap: 2px; font-weight: 800; color: #92400e; font-size: 0.68rem; }
    .fld select { border: 1px solid #fcd34d; border-radius: 6px; padding: 4px 6px; font: inherit; font-size: 0.75rem; font-weight: 600; color: #1c1917; }
    .mini-btn { font-size: 0.68rem; font-weight: 700; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-family: inherit; }
    .prop-card { background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; padding: 8px; margin-top: 6px; }
    .prop-card textarea { width: 100%; box-sizing: border-box; margin-top: 4px; border: 1px solid #e7e5e4; border-radius: 6px; padding: 6px; font: inherit; font-size: 0.72rem; resize: vertical; min-height: 56px; }
    .clear-btn { font-size: 0.7rem; font-weight: 700; border: 1px solid #fecaca; background: #fff; color: #b91c1c; border-radius: 6px; padding: 3px 8px; cursor: pointer; font-family: inherit; }
    .evac-panel { border: 1px solid #a7f3d0; background: #ecfdf5; border-radius: 8px; padding: 8px 10px; margin-top: 6px; }
    .evac-panel h4 { margin: 0 0 4px; font-size: 0.8rem; color: #065f46; display: flex; align-items: center; gap: 6px; }
    .evac-row { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; border-top: 1px solid #d1fae5; font-size: 0.72rem; color: #134e4a; }
    .evac-row:first-of-type { border-top: none; }
    .evac-row b { color: #064e3b; font-size: 0.76rem; }
    .evac-row a { color: #047857; font-weight: 700; text-decoration: none; }
    .evac-row a:hover { text-decoration: underline; }
  `],
  template: `
    <div class="wrap ia-shell">
      <a routerLink="/m/preparedness/early-warnings" style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;color:#64748b;text-decoration:none;margin-bottom:10px"><i class="fas fa-arrow-left"></i> Early Warning Systems</a>

      <!-- ══ 1. HEADER ══ -->
      <div class="hd">
        <div class="ic"><i class="fas fa-layer-group"></i></div>
        <div>
          <h1>PMO-DMD — Impact Analysis</h1>
          <div class="sub">National impact console · five stages · highest-alert-wins entity bus · dual-proved layers only</div>
        </div>
        <div class="src">
          <div>Contributing entities</div>
          @for (s of sources(); track s) { <span class="chip" [style.background]="agColor(s)">{{ agName(s) }}</span> }
          @if (!sources().length) { <span style="color:#94a3b8">None yet</span> }
          <div style="margin-top:9px">
            <button class="pushbtn" [disabled]="pushing() || !layerReady()" (click)="setWorkspace('compose'); generateImpact()">
              <i class="fas" [ngClass]="(pushing() || !layerReady()) ? 'fa-circle-notch fa-spin' : 'fa-file-export'"></i>
              {{ pushing() ? 'Working…' : (layerReady() ? 'Generate bulletin' : 'Preparing map…') }}
            </button>
          </div>
        </div>
      </div>

      @if (pushMsg(); as p) { <div class="pushflash" [ngClass]="p.err ? 'err' : 'ok'">{{ p.msg }}</div> }
      @if (previewUrl()) {
        <ew-preview-modal title="PMO-DMD — Multirisk Impact Bulletin" [url]="previewUrl()!" [rawUrl]="previewRaw()"
          file="pmo-dmd-impact-bulletin.pdf" pushLabel="Publish Impact Bulletin"
          (close)="previewUrl.set(null)" (push)="confirmPush()"></ew-preview-modal>
      }
      <ew-cross-agency-panel current=""></ew-cross-agency-panel>

      @if (loadError()) {
        <div style="padding:12px 14px; background:#fee2e2; color:#b91c1c; border-radius:10px; font-size:0.84rem; margin-bottom:12px">
          <i class="fas fa-triangle-exclamation"></i> Could not load the consolidated picture.
          <button (click)="reload()" style="margin-left:10px; border:none; background:#b91c1c; color:#fff; border-radius:6px; padding:4px 12px; cursor:pointer; font-family:inherit">Retry</button>
        </div>
      } @else if (loading()) {
        <div style="padding:12px 14px; background:#f1f5f9; color:#475569; border-radius:10px; font-size:0.84rem; margin-bottom:12px">
          <i class="fas fa-circle-notch fa-spin"></i> Loading…
        </div>
      }

      <!-- ══ 2. WORKFLOW STAGES ══ -->
      <div class="workflow" role="tablist" aria-label="Impact Analysis stages">
        <button type="button" [class.on]="workspace()==='map'" (click)="setWorkspace('map')">
          <span class="wn">1 · View</span>
          <span class="wt">Map &amp; analysis</span>
          <span class="ws">Basemap · entity · INFORM</span>
        </button>
        <button type="button" [class.on]="workspace()==='paint'" (click)="setWorkspace('paint')">
          <span class="wn">2 · Paint</span>
          <span class="wt">Human decision</span>
          <span class="ws">Colour · shapes · per day</span>
        </button>
        <button type="button" [class.on]="workspace()==='imagery'" (click)="setWorkspace('imagery')">
          <span class="wn">3 · Imagery</span>
          <span class="wt">SAT24 · EO · Earth</span>
          <span class="ws">Real-time &amp; structures</span>
        </button>
        <button type="button" [class.on]="workspace()==='compose'" (click)="setWorkspace('compose')">
          <span class="wn">4 · Compose</span>
          <span class="wt">Directives · PDF</span>
          <span class="ws">@if (composeReadySummary(); as crs) { {{ crs.ok ? 'Ready' : crs.msg }} } @else { Narrative }</span>
        </button>
        <button type="button" [class.on]="workspace()==='context'" (click)="setWorkspace('context')">
          <span class="wn">5 · Context</span>
          <span class="wt">Exposure &amp; EC</span>
          <span class="ws">Links · centres · overlays</span>
        </button>
      </div>

      <div class="main-grid">
        <!-- MAP COLUMN -->
        <div class="panel map-panel">
          <div class="map-chrome">
            <div class="day-tabs" style="margin:0;flex:1">
              @for (d of data()?.days ?? []; track d.day) {
                <button type="button" [class.on]="activeDay() === +d.day" [class.pdf-out]="!isPdfDay(+d.day)"
                        (click)="setActiveDay(+d.day)"
                        [title]="isPdfDay(+d.day) ? 'In Multirisk PDF as Day ' + +d.day : 'Map only — PDF is Days 1–3'">
                  Day {{ d.day }}
                  <span class="subtag">{{ isPdfDay(+d.day) ? 'PDF' : 'map' }}</span>
                </button>
              }
            </div>
            @if (curDay()) {
              <div class="tier-counts" style="margin:0;min-width:11rem">
                <div class="tc" style="background:#FF0000;padding:4px 6px"><b style="font-size:1rem">{{ curEffTiers().major_warning.length }}</b><span>Maj</span></div>
                <div class="tc" style="background:#FFA500;padding:4px 6px"><b style="font-size:1rem">{{ curEffTiers().warning.length }}</b><span>Warn</span></div>
                <div class="tc" style="background:#FFFF00;padding:4px 6px"><b style="font-size:1rem">{{ curEffTiers().advisory.length }}</b><span>Adv</span></div>
              </div>
            }
          </div>

          <!-- Stage-specific command dock -->
          <div class="cmd-dock">
            <div class="dock-tabs">
              <button type="button" [class.on]="workspace()==='map'" (click)="setWorkspace('map')"><i class="fas fa-eye"></i> View</button>
              <button type="button" [class.on]="workspace()==='paint'" (click)="setWorkspace('paint')"><i class="fas fa-fill-drip"></i> Paint</button>
              <button type="button" [class.on]="workspace()==='imagery'" (click)="setWorkspace('imagery')"><i class="fas fa-satellite"></i> Imagery</button>
              <button type="button" [class.on]="workspace()==='compose'" (click)="setWorkspace('compose')"><i class="fas fa-file-lines"></i> Compose</button>
              <button type="button" [class.on]="workspace()==='context'" (click)="setWorkspace('context')"><i class="fas fa-globe"></i> Context</button>
            </div>

            <!-- VIEW -->
            @if (workspace()==='map') {
              <div class="dock-body">
                <div class="ia-group" style="margin-bottom:6px">
                  <span class="ia-label">Basemap</span>
                  <button type="button" class="chip-btn" [class.on]="basemap()==='map'" (click)="setBasemap('map')"
                    [style.background]="basemap()==='map' ? '#1d4ed8' : '#fff'" [style.color]="basemap()==='map' ? '#fff' : '#1e3a8a'" [style.borderColor]="'#93c5fd'"><i class="fas fa-map"></i> Map</button>
                  <button type="button" class="chip-btn" [class.on]="basemap()==='satellite'" (click)="setBasemap('satellite')"
                    [style.background]="basemap()==='satellite' ? '#0f766e' : '#fff'" [style.color]="basemap()==='satellite' ? '#fff' : '#115e59'" [style.borderColor]="'#5eead4'"><i class="fas fa-satellite"></i> Satellite</button>
                  @if (basemap()==='satellite') {
                    <button type="button" class="chip-btn" [class.on]="satLabels()" (click)="toggleSatLabels()"
                      [style.background]="satLabels() ? '#0f766e' : '#fff'" [style.color]="satLabels() ? '#fff' : '#115e59'" [style.borderColor]="'#5eead4'"><i class="fas fa-font"></i> Labels</button>
                  }
                </div>
                <div class="ia-group" style="margin-bottom:6px">
                  <span class="ia-label">Analysis</span>
                  <button type="button" class="chip-btn" [class.on]="mapMode()==='entity'" (click)="setMapMode('entity')"
                    [style.background]="mapMode()==='entity' ? '#4527a0' : '#fff'" [style.color]="mapMode()==='entity' ? '#fff' : '#334155'" [style.borderColor]="'#c4b5fd'">Entity</button>
                  <button type="button" class="chip-btn" [class.on]="mapMode()==='support'" (click)="setMapMode('support')"
                    [style.background]="mapMode()==='support' ? '#0d6efd' : '#fff'" [style.color]="mapMode()==='support' ? '#fff' : '#334155'" [style.borderColor]="'#93c5fd'">Support</button>
                  <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-h'" (click)="setMapMode('inform-h')"
                    [style.background]="mapMode()==='inform-h' ? '#b45309' : '#fff'" [style.color]="mapMode()==='inform-h' ? '#fff' : '#334155'" [style.borderColor]="'#fcd34d'" title="INFORM Hazard">H</button>
                  <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-v'" (click)="setMapMode('inform-v')"
                    [style.background]="mapMode()==='inform-v' ? '#0f766e' : '#fff'" [style.color]="mapMode()==='inform-v' ? '#fff' : '#334155'" [style.borderColor]="'#5eead4'" title="INFORM Vulnerability">V</button>
                  <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-c'" (click)="setMapMode('inform-c')"
                    [style.background]="mapMode()==='inform-c' ? '#7c3aed' : '#fff'" [style.color]="mapMode()==='inform-c' ? '#fff' : '#334155'" [style.borderColor]="'#c4b5fd'" title="INFORM Coping">C</button>
                  <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-risk'" (click)="setMapMode('inform-risk')"
                    [style.background]="mapMode()==='inform-risk' ? '#be123c' : '#fff'" [style.color]="mapMode()==='inform-risk' ? '#fff' : '#334155'" [style.borderColor]="'#fda4af'" title="INFORM Risk">Risk</button>
                  <button type="button" class="chip-btn" [class.on]="mapMode()==='focus-hazard'" (click)="setMapMode('focus-hazard')"
                    [style.background]="mapMode()==='focus-hazard' ? '#0369a1' : '#fff'" [style.color]="mapMode()==='focus-hazard' ? '#fff' : '#334155'" [style.borderColor]="'#7dd3fc'">Focus</button>
                  <button type="button" class="pushbtn" style="padding:4px 10px;font-size:0.72rem;background:#0d6efd"
                    [disabled]="!supportRows().length" (click)="applyAllSuggestions()">Apply suggestions</button>
                </div>
                <div class="ia-group">
                  <span class="ia-label">Hazard focus</span>
                  @for (opt of hazardFocusOptions(); track opt.key) {
                    <button type="button" class="chip-btn" [class.on]="hazardFocus()===opt.key" (click)="setHazardFocus(opt.key)"
                      [title]="opt.hint || opt.label"
                      [style.background]="hazardFocus()===opt.key ? '#0369a1' : '#fff'" [style.color]="hazardFocus()===opt.key ? '#fff' : '#334155'" [style.borderColor]="'#7dd3fc'">{{ opt.label }}</button>
                  }
                </div>
              </div>
            }

            <!-- PAINT -->
            @if (workspace()==='paint') {
              <div class="dock-body">
                <div class="ia-group">
                  <span class="ia-label">Alert colour</span>
                  @for (lv of levels; track lv.key) {
                    <button type="button" class="chip-btn" [class.on]="drawLevel()===lv.key" (click)="setDrawLevel(lv.key)"
                      [style.background]="drawLevel()===lv.key ? lv.color : '#fff'"
                      [style.borderColor]="lv.color" [style.color]="drawLevel()===lv.key ? '#1a1a1a' : '#334155'">{{ lv.label }}</button>
                  }
                  @if (pmoShapes().length) {
                    <span style="color:#5b21b6;font-weight:700;font-size:0.72rem">· {{ pmoShapes().length }} drawn</span>
                    <button type="button" class="chip-btn" style="border-color:#fca5a5;color:#b91c1c" (click)="clearAllDrawnShapes()">Clear shapes</button>
                  }
                </div>
                <p class="ia-note" style="margin-top:6px">Click districts · draw circle/polygon in selected colour · trash deletes · Day tabs keep paint separate.</p>
              </div>
            }

            <!-- IMAGERY: SAT24 · GIBS · Structures -->
            @if (workspace()==='imagery') {
              <div class="dock-body">
                <div class="sat24-toolbar">
                  <span class="ia-label" style="color:#0f766e"><i class="fas fa-broadcast-tower"></i> Live weather satellite</span>
                  <div class="seg">
                    <button type="button" [class.on]="imageryTab()==='sat24'" (click)="setImageryTab('sat24')">SAT24 real-time</button>
                    <button type="button" [class.on]="imageryTab()==='eo'" (click)="setImageryTab('eo')">GIBS daily EO</button>
                    <button type="button" [class.on]="imageryTab()==='structures'" (click)="setImageryTab('structures')">Structures</button>
                  </div>
                </div>

                @if (imageryTab()==='sat24') {
                  <div class="sat24-toolbar">
                    <div class="seg">
                      <button type="button" [class.on]="sat24Region()==='tz'" (click)="setSat24Region('tz')">Tanzania</button>
                      <button type="button" [class.on]="sat24Region()==='af'" (click)="setSat24Region('af')">Africa</button>
                    </div>
                    <span class="ia-badge live">real-time loop</span>
                    <a class="chip-btn" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px"
                      [href]="sat24Url()" target="_blank" rel="noopener noreferrer">
                      <i class="fas fa-external-link-alt"></i> Open full SAT24</a>
                    <button type="button" class="chip-btn" (click)="reloadSat24()"><i class="fas fa-rotate"></i> Refresh</button>
                  </div>
                  <p class="ia-note" style="margin-bottom:6px">
                    <b>SAT24</b> = live cloud / rain satellite animation (real-time weather updates for operators).
                    Third-party service — not DMIS AI. Use with paint &amp; entity tiers for situational awareness.
                  </p>
                  <iframe class="sat24-frame" [src]="sat24SafeUrl()" title="SAT24 real-time satellite" loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
                }

                @if (imageryTab()==='eo') {
                  <div class="ia-group" style="margin-bottom:6px">
                    @for (p of eoProducts; track p.id) {
                      <button type="button" class="eo-chip" [class.on]="eoProduct()===p.id" (click)="setEoProduct(p.id)" [title]="p.hint">{{ p.label }}</button>
                    }
                  </div>
                  <div class="ia-group" style="margin-bottom:6px">
                    <label class="fld-inline"><input type="checkbox" [checked]="eoOnMap()" (change)="setEoOnMap($any($event.target).checked)"> On map</label>
                    <label class="fld-inline">Opacity <input type="range" min="20" max="100" step="5" [value]="eoOpacity()" (input)="setEoOpacity(+$any($event.target).value)"> {{ eoOpacity() }}%</label>
                    <label class="fld-inline">Date <input type="date" [value]="eoDate()" [max]="eoToday()" (change)="setEoDate($any($event.target).value)"></label>
                    <button type="button" class="eo-chip" (click)="setEoPreset('y1')">−1d</button>
                    <button type="button" class="eo-chip" (click)="setEoPreset('y7')">−7d</button>
                    <button type="button" class="eo-chip" [class.on]="eoPlaying()" (click)="toggleEoPlay()">{{ eoPlaying() ? 'Stop' : 'Play 14d' }}</button>
                    <button type="button" class="eo-chip" (click)="eoStep(-1)">◀</button>
                    <button type="button" class="eo-chip" (click)="eoStep(1)">▶</button>
                  </div>
                  <div class="eo-timeline">
                    @for (d of eoDayList(); track d) {
                      <button type="button" class="eo-chip day" [class.on]="eoDate()===d" (click)="setEoDate(d)">{{ d.slice(5) }}<span class="d">{{ eoWeekday(d) }}</span></button>
                    }
                  </div>
                  <div class="eo-film" style="margin-top:8px">
                    @for (f of eoFilmstrip(); track f.date) {
                      <div class="eo-frame" [class.on]="eoDate()===f.date" (click)="setEoDate(f.date); setEoOnMap(true)">
                        @if (f.url) { <img [src]="f.url" [alt]="f.date" loading="lazy" (error)="onEoFilmError(f.date)"> }
                        @else { <div class="err-cap">No preview</div> }
                        <div class="cap">{{ f.date }}</div>
                      </div>
                    }
                  </div>
                  <div class="eo-links">
                    @for (l of eoExternalLinks(); track l.key) {
                      <a [href]="l.url" target="_blank" rel="noopener noreferrer" [title]="l.note">{{ l.title }}</a>
                    }
                  </div>
                }

                @if (imageryTab()==='structures') {
                  <div class="ia-group" style="margin-bottom:6px">
                    <button type="button" class="chip-btn" [class.on]="structureMode()" (click)="activateStructuresView()"
                      [style.background]="structureMode() ? '#b45309' : '#fff'" [style.color]="structureMode() ? '#fff' : '#92400e'" [style.borderColor]="'#fcd34d'">
                      <i class="fas fa-city"></i> {{ structureMode() ? 'Structures on map' : 'Show structures (Esri)' }}</button>
                    <button type="button" class="chip-btn" style="border-color:#5eead4;color:#0f766e" (click)="openStructureViewer('earth')"><i class="fas fa-globe-americas"></i> Google Earth</button>
                    <button type="button" class="chip-btn" style="border-color:#93c5fd;color:#1d4ed8" (click)="openStructureViewer('gmaps_sat')"><i class="fas fa-map"></i> Maps satellite</button>
                    <button type="button" class="chip-btn" (click)="openStructureViewer('street')">Street View</button>
                  </div>
                  <div class="struct-bar" style="border:none;padding:0;margin:0">
                    @for (l of structureLinks(); track l.key) {
                      <a [href]="l.url" target="_blank" rel="noopener noreferrer" [title]="l.note">{{ l.title }}</a>
                    }
                    <p class="hint-s"><b>Esri</b> on map for roofs at zoom 12–18. <b>Google Earth</b> for near-current buildings (external ToS). Not DMIS AI.</p>
                  </div>
                }
              </div>
            }

            <!-- COMPOSE -->
            @if (workspace()==='compose') {
              <div class="dock-body">
                <div class="ready-panel" style="margin:0 0 8px">
                  <h4><i class="fas fa-list-check"></i> Bulletin readiness (Days 1–3)</h4>
                  @for (r of bulletinReadiness(); track r.day) {
                    <div class="ready-row">
                      <b>Day {{ r.day }}</b>
                      @if (!r.hasColours) { <span class="ready-na">no colours</span> }
                      @else {
                        @for (c of r.colours; track c) { <span><span class="sw-sm" [style.background]="alertColor(c)"></span>{{ label(c) }}</span> }
                        <span [class.ready-ok]="r.directivesOk" [class.ready-miss]="!r.directivesOk">{{ r.directivesOk ? '✓ dir' : '✗ dir' }}</span>
                        <span [class.ready-ok]="r.impactsOk" [class.ready-miss]="!r.impactsOk">{{ r.impactsOk ? '✓ imp' : '✗ imp' }}</span>
                      }
                    </div>
                  }
                </div>
                <div class="ia-group">
                  <button type="button" class="chip-btn" style="border-color:#6ee7b7;color:#065f46;background:#ecfdf5" (click)="scrollToCompose()">
                    <i class="fas fa-arrow-down"></i> Edit directives &amp; impacts</button>
                  <button type="button" class="pushbtn" style="padding:4px 12px;font-size:0.72rem"
                    [disabled]="pushing() || !layerReady()" (click)="generateImpact()">
                    <i class="fas fa-file-export"></i> Generate Multirisk PDF</button>
                </div>
              </div>
            }

            <!-- CONTEXT -->
            @if (workspace()==='context') {
              <div class="dock-body">
                <div class="ia-group" style="margin-bottom:6px">
                  <button type="button" class="chip-btn" style="border-color:#fcd34d;color:#92400e"
                    [disabled]="!selectedDistrict()" (click)="loadAreaContext(selectedDistrict()!)">
                    <i class="fas fa-link"></i> Load full context{{ selectedDistrict() ? ' · ' + selectedDistrict() : '' }}</button>
                  <button type="button" class="chip-btn" style="border-color:#5eead4;color:#0f766e" (click)="openStructureViewer('earth')">Google Earth</button>
                  <button type="button" class="chip-btn" (click)="setWorkspace('imagery'); setImageryTab('sat24')">SAT24 live</button>
                </div>
                @if (areaContext(); as ctx) {
                  <div style="display:flex;flex-wrap:wrap;gap:6px 10px;font-size:0.72rem">
                    @for (l of (ctx['contextLinks'] || []); track l['key']) {
                      <a [href]="l['url']" target="_blank" rel="noopener noreferrer" style="color:#0f766e;font-weight:700;text-decoration:none"
                        [title]="l['note']">{{ l['title'] }}</a>
                    }
                  </div>
                } @else {
                  <p class="ia-note">Select a district (paint or support table), then load context. SAT24 / Earth / EO live under <b>Imagery</b>.</p>
                }
              </div>
            }
          </div>

          <div class="map-stack">
            <div id="dmdmap"></div>
          </div>
          <div class="legend">
            <span style="font-weight:700;color:#1f2d3d">Impact:</span>
            @for (lv of levels; track lv.key) { <span><span class="sw" [style.background]="lv.color"></span>{{ lv.label }}</span> }
            <span><span class="sw" style="background:#F5F5F5"></span>None</span>
            <span style="font-weight:700;margin-left:4px">· Purple = PMO paint</span>
            <span style="margin-left:8px;font-weight:700;color:#0f766e">· {{ basemap() === 'satellite' ? 'Esri satellite' : 'Map' }}{{ structureMode() ? ' · structures' : '' }}{{ eoOnMap() ? ' · GIBS ' + eoDate() : '' }}</span>
          </div>
        </div>

        <!-- RIGHT RAIL -->
        <div class="side-rail">
          <div class="panel" style="padding:8px 10px">
            <div class="rail-hd">
              <span><i class="fas fa-compass-drafting"></i> Day {{ activeDay() }} tools</span>
              <span class="ia-badge ready" style="font-size:0.58rem">{{ workspace() }}</span>
            </div>
            @if (supportRows().length) {
              <div class="sup-wrap">
                <table class="sup-table">
                  <thead><tr>
                    <th style="text-align:left">District</th>
                    <th>Ent</th><th>Sug</th><th>Sc</th><th>H</th><th>V</th><th>C</th><th></th>
                  </tr></thead>
                  <tbody>
                    @for (r of supportRows(); track r.district) {
                      <tr style="cursor:pointer" [style.background]="selectedDistrict()===r.district ? '#eff6ff' : ''"
                          (click)="selectedDistrict.set(r.district)" [title]="(r.reasons || []).join(' · ')">
                        <td style="font-weight:600">{{ r.district }}</td>
                        <td style="text-align:center"><span class="sw" [style.background]="alertColor(r.entityLevel)"></span></td>
                        <td style="text-align:center"><span class="sw" [style.background]="alertColor(r.suggestedLevel)"></span></td>
                        <td style="text-align:center;font-weight:700">{{ r.supportScore ?? '—' }}</td>
                        <td style="text-align:center">{{ r.informHazard ?? '—' }}</td>
                        <td style="text-align:center">{{ r.informVulnerability ?? '—' }}</td>
                        <td style="text-align:center">{{ r.informCoping ?? '—' }}</td>
                        <td><button type="button" class="mini-btn" style="border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8"
                          (click)="applyOneSuggestion(r); $event.stopPropagation()">Paint</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div style="font-size:0.74rem;color:#94a3b8;margin-bottom:6px">Support loads when entities push hydromet tiers.</div>
            }

            <details class="acc violet" style="margin-bottom:6px">
              <summary>Justification @if (selectedRow(); as s) { · {{ s.district }} }</summary>
              <div class="acc-body">
                @if (selectedRow(); as sel) {
                  <div style="font-variant-numeric:tabular-nums;margin-bottom:4px">
                    H {{ sel.informHazard ?? '—' }} · V {{ sel.informVulnerability ?? '—' }} · C {{ sel.informCoping ?? '—' }}
                    · Risk {{ sel.informRisk ?? '—' }} · Score {{ sel.supportScore }}
                  </div>
                  <ul style="margin:0;padding-left:16px">
                    @for (reason of (sel.reasons || []).slice(0, 6); track $index) { <li>{{ reason }}</li> }
                  </ul>
                  <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #e2e8f0">
                    <div style="font-size:0.7rem;font-weight:800;color:#64748b;margin-bottom:4px">Exposure context (external links)</div>
                    <div style="font-size:0.68rem;color:#94a3b8;margin-bottom:6px">No satellite AI in DMIS — opens OSM / aerial / Street View for human review.</div>
                    <button type="button" class="mini-btn" style="border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46"
                      (click)="loadAreaContext(sel.district); $event.stopPropagation()">
                      <i class="fas fa-globe"></i> Load context links
                    </button>
                    @if (areaContext(); as ctx) {
                      <ul style="margin:6px 0 0;padding-left:14px;font-size:0.72rem">
                        @for (l of (ctx['contextLinks'] || []); track l['key']) {
                          <li style="margin-bottom:3px">
                            <a [href]="l['url']" target="_blank" rel="noopener noreferrer">{{ l['title'] }}</a>
                            <span style="color:#94a3b8"> — {{ l['note'] }}</span>
                          </li>
                        }
                      </ul>
                      @if (ctx['centroidWarning']) {
                        <div style="font-size:0.68rem;color:#b45309;margin-top:4px">{{ ctx['centroidWarning'] }}</div>
                      }
                    }
                  </div>
                  @if (sel.suggestedDirectives?.length) {
                    <button type="button" class="mini-btn" style="margin-top:6px;border:1px solid #c4b5fd;background:#ede7f6;color:#4527a0"
                      (click)="applyDirectives(sel)">Insert model directives</button>
                  }
                } @else {
                  <span style="color:#94a3b8">Select a district in the table.</span>
                }
              </div>
            </details>

            <details class="acc" style="margin-bottom:6px" open>
              <summary><i class="fas fa-layer-group" style="color:#1d4ed8;margin-right:4px"></i> Exposure overlays · working layers</summary>
              <div class="acc-body">
                <p style="margin:6px 0;color:#475569;line-height:1.4">
                  Organised so the main flow (View → Paint → Compose) stays clean.
                  Toggle only <span class="ia-badge ready">ready</span> map layers;
                  structures/buildings use Esri in-map + Google Earth externally.
                </p>
                <div class="exp-section">
                  <div class="exp-section-hd"><i class="fas fa-broadcast-tower" style="color:#0f766e"></i> Imagery shortcuts</div>
                  <div class="exp-quick">
                    <button type="button" class="chip-btn" style="border-color:#5eead4;color:#0f766e"
                      (click)="setWorkspace('imagery'); setImageryTab('sat24'); $event.stopPropagation()">
                      <i class="fas fa-cloud-sun-rain"></i> SAT24 live</button>
                    <button type="button" class="chip-btn" style="border-color:#99f6e4;color:#115e59"
                      (click)="setWorkspace('imagery'); setImageryTab('eo'); $event.stopPropagation()">
                      <i class="fas fa-clock-rotate-left"></i> GIBS EO</button>
                    <button type="button" class="chip-btn" [class.on]="structureMode()"
                      (click)="setWorkspace('imagery'); setImageryTab('structures'); $event.stopPropagation()"
                      [style.background]="structureMode() ? '#b45309' : '#fff'" [style.color]="structureMode() ? '#fff' : '#92400e'"
                      [style.borderColor]="'#fcd34d'"><i class="fas fa-city"></i> Structures</button>
                    <button type="button" class="chip-btn" style="border-color:#5eead4;color:#0f766e"
                      (click)="openStructureViewer('earth'); $event.stopPropagation()">
                      <i class="fas fa-globe-americas"></i> Google Earth</button>
                  </div>
                </div>
                <div class="exp-section">
                  <div class="exp-section-hd">Toggle on map</div>
                  <div class="exp-grid">
                    @for (x of exposureToggleable(); track x.id) {
                      <div class="exp-row" [class.on]="x.enabled" [class.disabled]="false">
                        <label (click)="$event.stopPropagation()">
                          <input type="checkbox"
                            [checked]="x.enabled"
                            (change)="toggleExposure(x.id, $any($event.target).checked)">
                        </label>
                        <div>
                          <b>{{ x.title }}</b>
                          <div class="meta">{{ x.detail }}</div>
                        </div>
                        <span class="ia-badge" [class.live]="x.status==='live'" [class.ready]="x.status==='ready'">{{ x.status }}</span>
                      </div>
                    }
                  </div>
                </div>
                <div class="exp-section">
                  <div class="exp-section-hd">Always on (system)</div>
                  <div class="exp-grid">
                    @for (x of exposureLiveFixed(); track x.id) {
                      <div class="exp-row on disabled">
                        <div style="width:14px;text-align:center;color:#16a34a"><i class="fas fa-check" style="font-size:0.65rem"></i></div>
                        <div>
                          <b>{{ x.title }}</b>
                          <div class="meta">{{ x.detail }}</div>
                        </div>
                        <span class="ia-badge live">live</span>
                      </div>
                    }
                  </div>
                </div>
                <details class="acc" style="margin-top:8px;border-style:dashed">
                  <summary style="font-size:0.72rem;color:#64748b">Deferred / planned (not dual-proved)</summary>
                  <div class="acc-body" style="padding-top:6px">
                    <div class="exp-grid">
                      @for (x of exposureDeferred(); track x.id) {
                        <div class="exp-row disabled">
                          <div style="width:14px"></div>
                          <div>
                            <b>{{ x.title }}</b>
                            <div class="meta">{{ x.detail }}</div>
                            <div class="meta" style="margin-top:2px"><i class="fas fa-database"></i> {{ x.source }}</div>
                          </div>
                          <span class="ia-badge" [class.deferred]="x.status==='deferred'" [class.planned]="x.status==='planned'">{{ x.status }}</span>
                        </div>
                      }
                    </div>
                  </div>
                </details>
              </div>
            </details>

            <details class="acc" style="margin-bottom:6px">
              <summary>Design &amp; exposure notes (model)</summary>
              <div class="acc-body">
                @if (designCapture(); as dc) {
                  <p style="margin:6px 0">{{ dc.purpose }}</p>
                  <p style="margin:0 0 6px;font-family:ui-monospace,Menlo,monospace;font-size:0.65rem;color:#64748b">{{ dc.formula }}</p>
                }
                @if (institutionNote(); as inst) {
                  <div style="font-weight:800;margin:6px 0 2px;color:#0f766e">Institutions</div>
                  <ul style="margin:0;padding-left:16px">
                    @for (k of instKeys(inst); track k) { <li><b>{{ k }}:</b> {{ inst[k] }}</li> }
                  </ul>
                }
                @if (supportNote()) { <p style="margin:6px 0 0;color:#64748b">{{ supportNote() }}</p> }
              </div>
            </details>

            <details class="acc evac-acc" style="margin-bottom:6px">
              <summary>
                <i class="fas fa-house-user" style="color:#059669;margin-right:4px"></i>
                Evacuation centres · routes
                @if (evacCenters().length) {
                  <span style="font-weight:600;color:#047857;margin-left:6px">{{ evacCenters().length }}</span>
                }
                @if (showEvacOnMap()) {
                  <span style="font-weight:600;color:#94a3b8;margin-left:4px;font-size:0.68rem">· map on</span>
                }
              </summary>
              <div class="acc-body">
                <div class="evac-panel" style="margin-top:0;border:none;background:transparent;padding:0">
                  <p style="margin:0 0 6px;font-size:0.68rem;color:#047857;line-height:1.35">
                    Auto-refreshes from the registry when the map origin changes (new centres appear automatically).
                    Check / uncheck centres on the map; use the dropdown to focus one.
                  </p>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
                    <button type="button" class="mini-btn" style="border:1px solid #6ee7b7;background:#059669;color:#fff"
                      [disabled]="evacLoading()" (click)="loadEvacRoutes(true); $event.stopPropagation()">
                      <i class="fas" [class.fa-route]="!evacLoading()" [class.fa-circle-notch]="evacLoading()" [class.fa-spin]="evacLoading()"></i>
                      {{ evacLoading() ? '…' : 'Refresh' }}
                    </button>
                    <label style="font-size:0.68rem;font-weight:700;color:#065f46;display:flex;align-items:center;gap:4px;cursor:pointer"
                           title="Master: show / hide all checked centres on the map"
                           (click)="$event.stopPropagation()">
                      <input type="checkbox" [checked]="showEvacOnMap()" (change)="toggleEvacOnMap($any($event.target).checked)"> Show on map
                    </label>
                    <button type="button" class="mini-btn" style="border:1px solid #a7f3d0;background:#fff;color:#065f46"
                      (click)="setAllEvacVisible(true); $event.stopPropagation()" [disabled]="!evacCenters().length">All</button>
                    <button type="button" class="mini-btn" style="border:1px solid #a7f3d0;background:#fff;color:#065f46"
                      (click)="setAllEvacVisible(false); $event.stopPropagation()" [disabled]="!evacCenters().length">None</button>
                    <a routerLink="/m/preparedness/evacuation-centers"
                       style="font-size:0.68rem;font-weight:700;color:#047857;margin-left:auto"
                       (click)="$event.stopPropagation()">Registry →</a>
                  </div>
                  <label style="display:grid;gap:2px;font-size:0.68rem;font-weight:800;color:#065f46;margin-bottom:6px"
                         (click)="$event.stopPropagation()">
                    Focus centre (dropdown)
                    <select style="border:1px solid #6ee7b7;border-radius:6px;padding:4px 6px;font:inherit;font-size:0.75rem;font-weight:600;color:#134e4a"
                            [value]="evacFocusId() ?? ''"
                            (change)="onEvacFocusChange($any($event.target).value)">
                      <option value="">— all checked centres —</option>
                      @for (c of evacCenters(); track c.id) {
                        <option [value]="c.id">{{ c.centreName }} ({{ c.distanceKm }} km)</option>
                      }
                    </select>
                  </label>
                  @if (evacOrigin(); as o) {
                    <div style="font-size:0.65rem;color:#64748b;margin-bottom:4px">
                      Origin: {{ o.label }} ({{ o.lat | number:'1.2-2' }}, {{ o.lng | number:'1.2-2' }})
                      @if (evacLastRefresh()) { · updated {{ evacLastRefresh() }} }
                    </div>
                  }
                  @if (evacError()) { <div style="color:#b91c1c;font-size:0.7rem">{{ evacError() }}</div> }
                  @for (c of evacCenters(); track c.id; let i = $index) {
                    <div class="evac-row" [style.background]="evacFocusId() === c.id ? '#d1fae5' : ''">
                      <div style="display:flex;align-items:flex-start;gap:6px">
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;margin-top:1px"
                               title="Show / hide this centre on the map"
                               (click)="$event.stopPropagation()">
                          <input type="checkbox" [checked]="isEvacVisible(c.id)"
                                 (change)="toggleEvacCentre(c.id, $any($event.target).checked)">
                        </label>
                        <div style="flex:1;min-width:0">
                          <div><b>{{ i + 1 }}. {{ c.centreName }}</b>
                            <span style="color:#64748b"> · {{ c.distanceKm }} km · ~{{ c.driveMinutesEstimate }} min</span>
                          </div>
                          <div style="color:#64748b">{{ c.district || '—' }} / {{ c.region || '—' }}
                            @if (c.capacityPeople) { · cap {{ c.capacityPeople }} }</div>
                          <div style="display:flex;gap:8px;margin-top:2px;flex-wrap:wrap">
                            <a [href]="c.gmapsDirectionsUrl" target="_blank" rel="noopener"
                               (click)="$event.stopPropagation()"><i class="fas fa-directions"></i> Road</a>
                            <a [routerLink]="['/m/preparedness/evacuation-centers/create']" [queryParams]="{edit: c.id}"
                               (click)="$event.stopPropagation()"><i class="fas fa-house-user"></i> Centre</a>
                            <button type="button" class="mini-btn" style="border:1px solid #6ee7b7;background:#fff;color:#047857;padding:1px 6px"
                              (click)="focusEvacCentre(c.id); $event.stopPropagation()">Focus map</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                  @if (!evacLoading() && !evacCenters().length && !evacError() && evacOrigin()) {
                    <div style="font-size:0.7rem;color:#94a3b8">No active centres with coordinates. Register under Evacuation Centers — they will appear here automatically.</div>
                  }
                  @if (!evacOrigin() && !evacLoading()) {
                    <div style="font-size:0.7rem;color:#94a3b8">Paint districts or wait for entity tiers so a warned-area origin can be computed.</div>
                  }
                </div>
              </div>
            </details>

            <details class="acc warm" [open]="stmtProposals().length > 0" style="margin-top:6px">
              <summary>Action Guide statements</summary>
              <div class="acc-body">
                <p style="margin:6px 0;color:#78716c">Proposes ~3 statements from the official guide by colour + hazard. Apply fills boxes below only — edit guide content in
                  <a routerLink="/m/content-management/action-guide" style="color:#b45309;font-weight:700">Content Management → Action Guide</a>.</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
                  <label class="fld">Colour
                    <select [value]="stmtLevel()" (change)="stmtLevel.set($any($event.target).value)">
                      <option value="ADVISORY">Yellow — Advisory</option>
                      <option value="WARNING">Orange — Warning</option>
                      <option value="MAJOR_WARNING">Red — Major</option>
                    </select>
                  </label>
                  <label class="fld">Language
                    <select [value]="stmtLang()" (change)="stmtLang.set($any($event.target).value)">
                      <option value="en">English</option>
                      <option value="sw">Kiswahili</option>
                      <option value="both">Both</option>
                    </select>
                  </label>
                  <label class="fld" style="grid-column:1 / -1">Hazard
                    <select [value]="stmtHazard()" (change)="stmtHazard.set($any($event.target).value)">
                      @for (h of stmtHazards(); track h.id) { <option [value]="h.id">{{ h.name }}</option> }
                    </select>
                  </label>
                </div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
                  <button type="button" class="pushbtn" style="padding:6px 12px;font-size:0.74rem;background:#b45309"
                    [disabled]="stmtLoading()" (click)="proposeStatements()">
                    <i class="fas" [class.fa-wand-magic-sparkles]="!stmtLoading()" [class.fa-circle-notch]="stmtLoading()" [class.fa-spin]="stmtLoading()"></i>
                    {{ stmtLoading() ? '…' : 'Propose' }}
                  </button>
                  <span style="font-size:0.68rem;color:#78716c">Areas: <b>{{ stmtAreasPreview() }}</b></span>
                </div>
                @if (stmtError()) { <div style="color:#b91c1c;font-size:0.72rem">{{ stmtError() }}</div> }
                @for (p of stmtProposals(); track p.id) {
                  <div class="prop-card">
                    <div style="display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap">
                      <div style="font-weight:800;font-size:0.74rem">{{ p.title }}</div>
                      <div style="display:flex;gap:3px">
                        @if (p.id === 'operational_directives' || p.id === 'public_sms') {
                          <button type="button" class="mini-btn" style="border:1px solid #fcd34d;background:#fef3c7;color:#92400e"
                            (click)="applyProposal(p, 'directives')">Directives</button>
                        }
                        @if (p.id === 'bulletin_narrative' || p.id === 'public_sms' || p.id === 'bilingual_pack') {
                          <button type="button" class="mini-btn" style="border:1px solid #c4b5fd;background:#ede7f6;color:#4527a0"
                            (click)="applyProposal(p, 'narrative')">Narrative</button>
                        }
                      </div>
                    </div>
                    <textarea rows="3" [value]="p.text" (input)="editProposal(p.id, $any($event.target).value)"></textarea>
                  </div>
                }
              </div>
            </details>
          </div>
        </div>
      </div>

      <!-- FULL WIDTH BELOW MAP: composition boxes (Compose command surface) -->
      <div id="ia-compose" class="compose-grid compose-anchor">
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <h3 style="margin:0"><i class="fas fa-clipboard-list"></i> PMO directives · Day {{ activeDay() }}
              @if (!isPdfDay(activeDay())) { <span style="font-weight:600;color:#b45309;font-size:0.75rem">· not in PDF</span> }
            </h3>
            <button type="button" class="clear-btn" (click)="clearDirectives()">Clear</button>
          </div>
          <p class="hint">Per day · PDF paints section headers as coloured chips (not “###”). One bullet per line — do not type “•” (added automatically).
            Example sections: <code>### MAJOR_WARNING</code> / <code>### WARNING</code> / <code>### ADVISORY</code>.</p>
          <textarea rows="6" [value]="pmoDirectives()[activeDay()] || ''" (input)="setDirectives($any($event.target).value)"
            placeholder="### MAJOR_WARNING&#10;Evacuate low-lying wards&#10;### WARNING&#10;Open EOCs&#10;### ADVISORY&#10;Monitor river levels"></textarea>
        </div>
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <h3 style="margin:0"><i class="fas fa-feather-pointed"></i> PMO impact narrative · Day {{ activeDay() }}
              @if (!isPdfDay(activeDay())) { <span style="font-weight:600;color:#b45309;font-size:0.75rem">· not in PDF</span> }
            </h3>
            <button type="button" class="clear-btn" (click)="clearNarrative()">Clear</button>
          </div>
          <p class="hint">Per day · impact narrative in the Multirisk PDF. Headers become yellow/orange/red chips; body lines are single bullets.</p>
          <textarea rows="6" [value]="pmoNarratives()[activeDay()] || ''" (input)="setNarrative($any($event.target).value)"
            placeholder="### MAJOR_WARNING&#10;Flash flood risk for low-lying wards&#10;### WARNING&#10;River levels rising&#10;### ADVISORY&#10;Stay alert"></textarea>
        </div>
      </div>

      <details class="acc" style="margin-top:12px" [open]="dayComments().length > 0">
        <summary style="background:#fff;border:1px solid #e3e6ed;border-radius:10px;padding:10px 12px">
          <i class="fas fa-comments" style="color:#64748b"></i> Agency narratives (this day)
          <span style="font-weight:600;color:#94a3b8;margin-left:6px">{{ dayComments().length || 0 }}</span>
        </summary>
        <div class="panel" style="margin-top:8px">
          @if (dayComments().length) {
            @for (c of dayComments(); track $index) {
              <div class="cmt" [style.border-left-color]="agColor(c.agency)">
                <div class="ch"><i class="fas" [ngClass]="agIcon(c.agency)"></i> {{ agName(c.agency) }}
                  @if (c.type) { · <span style="font-weight:600;color:#607089">{{ c.type }}</span> }
                  <span class="pill" [style.background]="alertColor(c.alert_level)">{{ label(c.alert_level) }}</span></div>
                <div class="cd">{{ c.description }}</div>
                @if (c.areas?.length) { <div class="ca"><i class="fas fa-map-marker-alt"></i> {{ join(c.areas) }}</div> }
              </div>
            }
          } @else { <div style="font-size:0.8rem;color:#94a3b8">No narratives for this day.</div> }
        </div>
      </details>
    </div>
  `,
})
export class DmdConsolidatedComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private svc = inject(EwAgencyService);
  levels = ALERT_LEVELS;
  alertColor = alertColor;

  /** Multirisk PDF engine requires exactly 3 day entries (product Days 1–3). Map may show TMA 5-day horizon. */
  readonly pdfDayCount = 3;

  data = signal<Consolidated | null>(null);
  sources = signal<string[]>([]);
  activeDay = signal(1);
  loading = signal(true);
  loadError = signal(false);
  pushing = signal(false);
  pushMsg = signal<{ msg: string; err: boolean } | null>(null);
  drawLevel = signal('WARNING');                 // active level/colour for PMO delineations
  pmoShapes = signal<any[]>([]);                  // PMO impact delineations [{id, kind, geojson, radius?, level}]
  /** Per-day PMO paint: day → (district → level). Day 1 paint must not bleed into Day 5. */
  pmoOverridesByDay = signal<Record<number, Record<string, string>>>({});
  pmoNarratives = signal<Record<number, string>>({}); // PMO impact narrative per day → the DMD comment (impact bullets) in the bulletin
  pmoDirectives = signal<Record<number, string>>({}); // PMO directives & instructions per day → rendered BESIDE the big map (engine recommendations slot)
  layerReady = signal(false);                     // the GADM district layer has loaded (per-district coords need it)
  /**
   * entity = hydromet fill; support = suggested paint;
   * inform-h/v/c/risk = INFORM dimensions; focus-hazard = selected natural hazard lens.
   */
  mapMode = signal<'entity' | 'support' | 'inform' | 'inform-h' | 'inform-v' | 'inform-c' | 'inform-risk' | 'focus-hazard'>('entity');
  /** Basemap under analysis: street/admin map vs open aerial (Esri World Imagery). */
  basemap = signal<'map' | 'satellite'>('map');
  basemapNote = signal('');
  /** Where Map basemap is coming from: tiles (Carto/OSM-style) or local TZ vectors. */
  basemapSource = signal<'tiles' | 'local' | 'satellite'>('tiles');
  /** Hybrid labels over satellite (international practice for readability). */
  satLabels = signal(true);
  /**
   * Structures mode: Esri high-res basemap + translucent paint so buildings/roofs read clearly.
   * Near-current building detail opens via Google Earth / Maps (external ToS) — not embedded.
   */
  structureMode = signal(false);

  /**
   * Systematic console stage: map | paint | imagery | compose | context
   * Only one stage dock body is active — keeps the surface clean.
   */
  workspace = signal<'map' | 'paint' | 'imagery' | 'compose' | 'context'>('map');
  /** Inside Imagery stage: SAT24 real-time weather sat | GIBS daily | structures/buildings */
  imageryTab = signal<'sat24' | 'eo' | 'structures'>('sat24');
  /** SAT24 region: Tanzania country loop or Africa continent loop */
  sat24Region = signal<'tz' | 'af'>('tz');
  sat24Key = signal(0); // bump to remount iframe

  /**
   * NASA GIBS EO time-slice (Imagery · GIBS daily).
   * Dual-proved open WMTS — daily true-colour MODIS/VIIRS. Human review only.
   */
  eoPanelOpen = signal(false);
  eoOnMap = signal(false);
  eoDate = signal(this.isoDateOffset(1)); // default yesterday (more complete than today)
  eoOpacity = signal(75);
  eoProduct = signal('modis_terra');
  eoPlaying = signal(false);
  eoFilmstrip = signal<Array<{ date: string; url: string | null }>>([]);
  readonly eoWindowDays = 14;
  readonly eoProducts: Array<{ id: string; label: string; layer: string; matrix: string; ext: string; hint: string }> = [
    {
      id: 'modis_terra', label: 'MODIS Terra',
      layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      matrix: 'GoogleMapsCompatible_Level9', ext: 'jpg',
      hint: 'Daily true-colour · ~250 m · NASA Terra (best general day view)',
    },
    {
      id: 'modis_aqua', label: 'MODIS Aqua',
      layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor',
      matrix: 'GoogleMapsCompatible_Level9', ext: 'jpg',
      hint: 'Daily true-colour · afternoon overpass · NASA Aqua',
    },
    {
      id: 'viirs_n20', label: 'VIIRS NOAA-20',
      layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
      matrix: 'GoogleMapsCompatible_Level9', ext: 'jpg',
      hint: 'Daily true-colour · higher detail · NOAA-20 VIIRS',
    },
    {
      id: 'viirs_n21', label: 'VIIRS NOAA-21',
      layer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
      matrix: 'GoogleMapsCompatible_Level9', ext: 'jpg',
      hint: 'Daily true-colour · NOAA-21 VIIRS',
    },
  ];
  private gibsLayer: any = null;
  private eoPlayTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Exposure / integration catalogue for Impact Analysis — full national + international capture.
   * status: live = on map now; ready = can toggle / open without inventing; deferred/planned = not dual-proved.
   * Honesty: never invent green lights for MoU-bound national APIs.
   */
  exposureCatalog = signal<Array<{
    id: string; title: string; detail: string; source: string;
    status: 'live' | 'ready' | 'deferred' | 'planned';
    toggleable: boolean; enabled: boolean;
  }>>([
    {
      id: 'basemap_sat', title: 'Satellite basemap (Esri World Imagery)',
      detail: 'Open aerial tiles under paint/overlays. Human review only — not DMIS AI damage classification.',
      source: 'Esri World Imagery tiles · third-party ToS', status: 'ready', toggleable: true, enabled: false,
    },
    {
      id: 'basemap_map', title: 'Administrative map basemap',
      detail: 'OSM-style Carto tiles with automatic fallback to local Tanzania vectors (offline-capable).',
      source: 'Carto light / local GeoJSON', status: 'live', toggleable: true, enabled: true,
    },
    {
      id: 'sat_labels', title: 'Place labels on satellite (hybrid)',
      detail: 'Carto labels-only overlay when Satellite is active — international hybrid basemap practice.',
      source: 'Carto labels_only tiles', status: 'ready', toggleable: true, enabled: true,
    },
    {
      id: 'sat24', title: 'SAT24 real-time weather satellite',
      detail: 'Live cloud/rain animation for Tanzania or Africa — real-time updates (third-party SAT24).',
      source: 'sat24.com · country/tz · continent/af', status: 'ready', toggleable: false, enabled: true,
    },
    {
      id: 'gibs_timeslice', title: 'NASA GIBS daily EO (MODIS / VIIRS)',
      detail: 'Daily true-colour on the Impact map: product picker, 14-day scrubber, play, filmstrip. Human review only.',
      source: 'NASA GIBS WMTS (EPSG:3857) · dual-proved open', status: 'ready', toggleable: true, enabled: false,
    },
    {
      id: 'structures', title: 'Structures mode (buildings on map)',
      detail: 'Esri high-res aerial + translucent paint — roofs/buildings at zoom 12–18. Not damage AI.',
      source: 'Esri World Imagery · in-map', status: 'ready', toggleable: true, enabled: false,
    },
    {
      id: 'google_earth', title: 'Google Earth (buildings · near-current)',
      detail: 'Opens Google Earth Web at selected district — best building/structure detail (external ToS).',
      source: 'Google Earth Web · external', status: 'ready', toggleable: false, enabled: true,
    },
    {
      id: 'google_maps_sat', title: 'Google Maps satellite (high zoom)',
      detail: 'Opens Google Maps satellite basemap at high zoom for roofs/structures (external ToS).',
      source: 'Google Maps · external', status: 'ready', toggleable: false, enabled: true,
    },
    {
      id: 'entity_bus', title: 'Entity EW bus (TMA / MoW / Fire / …)',
      detail: 'Highest-alert-wins consolidation already on map (Entity mode). Per-agency narrative rail.',
      source: 'ew_agency_submissions · dual-proved', status: 'live', toggleable: false, enabled: true,
    },
    {
      id: 'inform', title: 'INFORM risk dimensions (H / V / C / Risk)',
      detail: 'Choropleths via Support modes — decision support only; never rewrites entity SoR.',
      source: 'INFORM tables in DMIS', status: 'live', toggleable: false, enabled: true,
    },
    {
      id: 'support_score', title: 'Impact-support score + suggestions',
      detail: 'Model score, suggested paint, reasons, Action Guide statements — human must apply.',
      source: 'impact-support API', status: 'live', toggleable: false, enabled: true,
    },
    {
      id: 'evac', title: 'Evacuation centres + road links',
      detail: 'Nearest registered centres; map checkboxes, focus dropdown, GMaps directions.',
      source: 'evacuation_centers', status: 'live', toggleable: false, enabled: true,
    },
    {
      id: 'pmo_draw', title: 'PMO freehand delineations',
      detail: 'Circle/polygon in alert colour; trash deletes; PDF carries shapes with level colour.',
      source: 'Leaflet.Draw · session', status: 'live', toggleable: false, enabled: true,
    },
    {
      id: 'ctx_links', title: 'Street View / EO / NASA / Copernicus links',
      detail: 'External context per district — Google ToS · Sentinel EO Browser · NASA Worldview · Copernicus.',
      source: 'GET /v1/ops/hazard-area-context', status: 'ready', toggleable: false, enabled: true,
    },
    {
      id: 'tma_values', title: 'TMA quantitative fields (mm / colour)',
      detail: 'Rain values + official colours from agency payload when present on bus.',
      source: 'TMA submission · partial live via entity bus', status: 'ready', toggleable: false, enabled: true,
    },
    {
      id: 'cap_feed', title: 'WMO CAP / public alerting feed',
      detail: 'Common Alerting Protocol export/import when national CAP channel is dual-proved.',
      source: 'WMO CAP — planned', status: 'planned', toggleable: false, enabled: false,
    },
    {
      id: 'copernicus_ems', title: 'Copernicus EMS rapid mapping',
      detail: 'EU emergency mapping activations — external products only until MoU + adapter.',
      source: 'Copernicus EMS — planned (links ready via context)', status: 'planned', toggleable: false, enabled: false,
    },
    {
      id: 'worldpop', title: 'Population density (WorldPop / open)',
      detail: 'Open population grids for exposure estimates — not a national census substitute.',
      source: 'WorldPop open data — planned', status: 'planned', toggleable: false, enabled: false,
    },
    {
      id: 'nbs_pop', title: 'Population / census exposure (NBS)',
      detail: 'Official population at risk when national adapter is dual-proved live.',
      source: 'NBS — deferred (no fake live endpoint)', status: 'deferred', toggleable: false, enabled: false,
    },
    {
      id: 'nida', title: 'Identity / household verify (NIDA)',
      detail: 'Verify-only identity path — not a bulk household layer until MoU + dual-proof.',
      source: 'NIDA — deferred', status: 'deferred', toggleable: false, enabled: false,
    },
    {
      id: 'latra', title: 'Transport / logistics (LATRA)',
      detail: 'Corridors and fleets when logistics adapter is dual-proved.',
      source: 'LATRA — deferred', status: 'deferred', toggleable: false, enabled: false,
    },
    {
      id: 'tanesco', title: 'Power infrastructure (TANESCO)',
      detail: 'Critical energy exposure when infrastructure MoU + dual-proof complete.',
      source: 'TANESCO — deferred', status: 'deferred', toggleable: false, enabled: false,
    },
    {
      id: 'basin_gauges', title: 'River / basin gauges (MoW / WRMA)',
      detail: 'Live stage/discharge beyond MoW entity push — adapter after dual-proof.',
      source: 'MoW/WRMA national — deferred (entity bus partial)', status: 'deferred', toggleable: false, enabled: false,
    },
    {
      id: 'idsr', title: 'Health surveillance (e-IDSR / One Health)',
      detail: 'Health event density when HIS link is dual-proved into OH bus.',
      source: 'e-IDSR / MoH — planned', status: 'planned', toggleable: false, enabled: false,
    },
    {
      id: 'sat_ai', title: 'Satellite damage AI — out of scope',
      detail: 'Not a DMIS feature. Explicitly deferred until dual-proved model + legal review. Use EO Browser / Worldview links for human review only.',
      source: 'F105/F114 deferred — never green-lit without proof', status: 'deferred', toggleable: false, enabled: false,
    },
  ]);
  supportRows = signal<any[]>([]);
  supportNote = signal('');
  designCapture = signal<any | null>(null);
  institutionNote = signal<Record<string, string> | null>(null);
  hazardFocus = signal('auto');
  hazardFocusResolved = signal('');
  hazardFocusOptions = signal<{ key: string; label: string; hint?: string }[]>([
    { key: 'auto', label: 'Auto', hint: 'From entity product type (heavy rain → Flood)' },
    { key: 'flood', label: 'Flood', hint: 'Heavy rainfall / riverine / flash flood' },
    { key: 'drought', label: 'Drought' },
    { key: 'landslide', label: 'Landslide' },
    { key: 'storm', label: 'Storm' },
    { key: 'earthquake', label: 'Quake' },
    { key: 'coastal', label: 'Coastal' },
    { key: 'overall', label: 'Overall', hint: 'Full INFORM only — no single-hazard boost' },
  ]);
  selectedDistrict = signal<string | null>(null);
  areaContext = signal<Record<string, any> | null>(null);
  private supportByName = signal<Record<string, any>>({});

  // Action Guide Book statement assist
  stmtLevel = signal<'ADVISORY' | 'WARNING' | 'MAJOR_WARNING'>('ADVISORY');
  stmtHazard = signal('heavy_rainfall');
  stmtLang = signal('en');
  stmtLoading = signal(false);
  stmtError = signal('');
  stmtProposals = signal<any[]>([]);
  stmtHazards = signal<{ id: string; name: string }[]>([
    { id: 'heavy_rainfall', name: 'Heavy rainfall' },
    { id: 'floods', name: 'FLOODS' },
    { id: 'landslide', name: 'LANDSLIDE' },
    { id: 'strong_winds', name: 'STRONG WINDS' },
    { id: 'large_waves', name: 'LARGE WAVES' },
    { id: 'wildfire', name: 'WILDFIRE' },
    { id: 'drought', name: 'DROUGHT' },
    { id: 'earthquake_and_tsunami', name: 'EARTHQUAKE AND TSUNAMI' },
    { id: 'public_health', name: 'PUBLIC HEALTH' },
  ]);
  private sanitizer = inject(DomSanitizer);
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewRaw = signal<string>('');
  private pendingPayload: any = null;
  private pendingMeta: any = null;
  private pendingBlob: Blob | null = null;
  private map: any;
  private districtLayer: any;
  private overlayLayer: any;
  private drawnGroup: any;
  private shapeSeq = 0;
  /** Registered evacuation centres nearest to warned-area centroid (EW ↔ EC link). */
  evacCenters = signal<any[]>([]);
  /** Centre ids currently checked for map display. */
  evacVisibleIds = signal<Record<number, boolean>>({});
  /** Dropdown focus — highlight + pan to one centre (null = all checked). */
  evacFocusId = signal<number | null>(null);
  evacLoading = signal(false);
  evacError = signal('');
  evacOrigin = signal<{ lat: number; lng: number; label: string } | null>(null);
  showEvacOnMap = signal(true);
  evacLastRefresh = signal('');
  private evacLayerGroup: any = null;
  private evacPollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.reload();
    this.loadActionGuideMeta();
    setTimeout(() => this.initMap(), 0);
    // Auto-refresh nearest centres so newly registered ECs appear without manual click.
    this.evacPollTimer = setInterval(() => {
      if (this.layerReady()) {
        this.loadEvacRoutes(false);
      }
    }, 45000);
  }

  /** Resolve origin: selected district centre, else average of Day's painted/entity warned districts. */
  private resolveEvacOrigin(): { lat: number; lng: number; label: string } | null {
    const sel = this.selectedDistrict();
    if (sel) {
      const c = this.districtCentre(sel);
      if (c) { return { ...c, label: sel }; }
    }
    const et = this.curEffTiers();
    const names = [...(et.major_warning || []), ...(et.warning || []), ...(et.advisory || [])];
    const pts: Array<{ lat: number; lng: number }> = [];
    for (const n of names) {
      const c = this.districtCentre(n);
      if (c) { pts.push(c); }
    }
    const avg = this.centroidOf(pts);
    if (avg) {
      return { ...avg, label: names.length ? `Day ${this.activeDay()} warned centroid (${names.length} areas)` : 'Map centroid' };
    }
    // Fallback: map centre if layers not ready
    if (this.map) {
      const c = this.map.getCenter();
      return { lat: c.lat, lng: c.lng, label: 'Map view centre' };
    }
    return null;
  }

  /**
   * Load nearest evacuation centres for the current origin.
   * @param forceUi when true, show the loading spinner (manual Refresh); silent on auto-poll.
   */
  loadEvacRoutes(forceUi = true): void {
    const origin = this.resolveEvacOrigin();
    this.evacError.set('');
    if (!origin) {
      this.evacCenters.set([]);
      this.evacOrigin.set(null);
      this.evacError.set('No origin yet — load the map and wait for district tiers or select a district.');
      this.clearEvacLayers();
      return;
    }
    this.evacOrigin.set(origin);
    if (forceUi) { this.evacLoading.set(true); }
    this.http.get<any>('/api/v1/evacuation-centers/nearest', {
      params: { lat: String(origin.lat), lng: String(origin.lng), limit: '12' },
    }).subscribe({
      next: r => {
        const centers = r.centers ?? [];
        this.evacCenters.set(centers);
        // Preserve checks for known ids; new centres default to visible.
        const vis = { ...this.evacVisibleIds() };
        for (const c of centers) {
          const id = Number(c.id);
          if (vis[id] === undefined) { vis[id] = true; }
        }
        // Drop ids no longer in the list
        const keep = new Set(centers.map((c: any) => Number(c.id)));
        for (const k of Object.keys(vis)) {
          if (!keep.has(Number(k))) { delete vis[Number(k)]; }
        }
        this.evacVisibleIds.set(vis);
        if (this.evacFocusId() != null && !keep.has(this.evacFocusId()!)) {
          this.evacFocusId.set(null);
        }
        this.evacLoading.set(false);
        this.evacLastRefresh.set(new Date().toLocaleTimeString());
        if (this.showEvacOnMap()) { this.drawEvacOnMap(); }
      },
      error: () => {
        if (forceUi) {
          this.evacCenters.set([]);
          this.evacError.set('Could not load nearest centres.');
          this.clearEvacLayers();
        }
        this.evacLoading.set(false);
      },
    });
  }

  toggleEvacOnMap(on: boolean): void {
    this.showEvacOnMap.set(on);
    if (on) {
      if (this.evacCenters().length) { this.drawEvacOnMap(); }
      else { this.loadEvacRoutes(true); }
    } else {
      this.clearEvacLayers();
    }
  }

  isEvacVisible(id: number): boolean {
    return this.evacVisibleIds()[Number(id)] !== false;
  }

  toggleEvacCentre(id: number, on: boolean): void {
    const vis = { ...this.evacVisibleIds(), [Number(id)]: on };
    this.evacVisibleIds.set(vis);
    if (this.showEvacOnMap()) { this.drawEvacOnMap(); }
  }

  setAllEvacVisible(on: boolean): void {
    const vis: Record<number, boolean> = {};
    for (const c of this.evacCenters()) { vis[Number(c.id)] = on; }
    this.evacVisibleIds.set(vis);
    if (this.showEvacOnMap()) { this.drawEvacOnMap(); }
  }

  onEvacFocusChange(raw: string): void {
    if (!raw) {
      this.evacFocusId.set(null);
      if (this.showEvacOnMap()) { this.drawEvacOnMap(); }
      return;
    }
    this.focusEvacCentre(Number(raw));
  }

  focusEvacCentre(id: number): void {
    const cid = Number(id);
    this.evacFocusId.set(cid);
    // Ensure focused centre is checked visible
    if (!this.isEvacVisible(cid)) {
      this.toggleEvacCentre(cid, true);
    }
    const c = this.evacCenters().find(x => Number(x.id) === cid);
    if (c?.latitude != null && c?.longitude != null && this.map) {
      try { this.map.setView([c.latitude, c.longitude], Math.max(this.map.getZoom(), 8)); } catch { /* ignore */ }
    }
    if (this.showEvacOnMap()) { this.drawEvacOnMap(); }
  }

  private clearEvacLayers(): void {
    if (this.evacLayerGroup && this.map) {
      try { this.map.removeLayer(this.evacLayerGroup); } catch { /* ignore */ }
    }
    this.evacLayerGroup = null;
  }

  private drawEvacOnMap(): void {
    if (!this.map || typeof L === 'undefined') { return; }
    this.clearEvacLayers();
    if (!this.showEvacOnMap()) { return; }
    const origin = this.evacOrigin();
    const focus = this.evacFocusId();
    const centers = this.evacCenters().filter(c => this.isEvacVisible(c.id));
    if (!origin) { return; }
    const g = L.layerGroup();
    const originMk = L.circleMarker([origin.lat, origin.lng], {
      radius: 9, fillColor: '#4527a0', color: '#fff', weight: 2, fillOpacity: 1,
    }).bindPopup(`<b>EW origin</b><br>${escapeHtml(origin.label)}`);
    g.addLayer(originMk);
    const colors = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
    centers.forEach((c: any, i: number) => {
      if (c.latitude == null || c.longitude == null) { return; }
      const isFocus = focus != null && Number(c.id) === focus;
      const line = L.polyline(
        [[origin.lat, origin.lng], [c.latitude, c.longitude]],
        {
          color: isFocus ? '#047857' : colors[i % colors.length],
          weight: isFocus ? 5 : (i === 0 ? 4 : 2.5),
          opacity: 0.9,
          dashArray: isFocus ? undefined : (i === 0 ? undefined : '7 5'),
        },
      ).bindPopup(
        `<b>${escapeHtml(c.centreName)}</b><br>${c.distanceKm} km · ~${c.driveMinutesEstimate} min`
        + `<br><a href="${c.gmapsDirectionsUrl}" target="_blank" rel="noopener">Road directions</a>`,
      );
      const dest = L.circleMarker([c.latitude, c.longitude], {
        radius: isFocus ? 11 : (i === 0 ? 9 : 7),
        fillColor: isFocus ? '#047857' : '#059669',
        color: '#fff', weight: 2, fillOpacity: 0.95,
      }).bindPopup(`<b>${escapeHtml(c.centreName)}</b><br>${escapeHtml(c.district || '')} / ${escapeHtml(c.region || '')}`);
      g.addLayer(line);
      g.addLayer(dest);
    });
    g.addTo(this.map);
    this.evacLayerGroup = g;
  }

  loadActionGuideMeta(): void {
    this.svc.actionGuideMeta().subscribe({
      next: m => {
        if (Array.isArray(m?.hazards) && m.hazards.length) {
          this.stmtHazards.set(m.hazards.map((h: any) => ({ id: h.id, name: h.name })));
        }
      },
      error: () => { /* guide optional — defaults remain */ },
    });
  }

  reload(): void {
    this.loading.set(true); this.loadError.set(false);
    this.svc.consolidated(5).subscribe({
      next: r => {
        this.data.set(r);
        this.sources.set(r.sources ?? []);
        // Keep active day on a real horizon day (never drift to a stale index).
        const days = (r.days ?? []).map((d: any) => +d.day).filter((n: number) => Number.isFinite(n));
        if (days.length && !days.includes(this.activeDay())) {
          this.activeDay.set(days[0]);
        }
        this.loading.set(false);
        this.loadError.set(false);
        this.loadSupport();
        this.restyle();
      },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  /** Additive INFORM + hazard focus + exposures — never mutates consolidated payload or bulletin path. */
  loadSupport(): void {
    this.svc.impactSupport(this.activeDay(), 5, this.hazardFocus()).subscribe({
      next: r => {
        this.supportNote.set(r?.note || '');
        this.designCapture.set(r?.designCapture ?? null);
        this.institutionNote.set(r?.institutionExposureNote ?? null);
        this.hazardFocusResolved.set(r?.hazardFocusResolved || r?.hazardFocus || '');
        if (Array.isArray(r?.hazardFocusOptions) && r.hazardFocusOptions.length) {
          this.hazardFocusOptions.set(r.hazardFocusOptions.map((o: any) => ({
            key: o.key, label: o.label, hint: o.hint,
          })));
        }
        const rows = r?.districts ?? [];
        this.supportRows.set(rows);
        const by: Record<string, any> = {};
        for (const row of rows) { by[row.district] = row; }
        this.supportByName.set(by);
        if (rows.length && !this.selectedDistrict()) {
          this.selectedDistrict.set(rows[0].district);
        }
        this.restyle();
      },
      error: () => {
        this.supportRows.set([]);
        this.supportByName.set({});
        this.designCapture.set(null);
        this.institutionNote.set(null);
      },
    });
  }

  setHazardFocus(key: string): void {
    this.hazardFocus.set(key);
    this.loadSupport();
  }

  /** Day tabs — reload support + restyle + EC routes for that day's warned centroid. */
  setActiveDay(day: number): void {
    const d = Number(day);
    if (!Number.isFinite(d) || d < 1) return;
    this.activeDay.set(d);
    this.loadSupport();
    this.restyle();
    if (this.showEvacOnMap() || this.evacCenters().length || this.layerReady()) {
      this.loadEvacRoutes(false);
    }
  }

  /** True when this horizon day is included in the Multirisk PDF (product days 1–3). */
  isPdfDay(day: number): boolean {
    return day >= 1 && day <= this.pdfDayCount;
  }

  /** Current day's PMO paint map (never shares paint with other days). */
  private overridesFor(day: number): Record<string, string> {
    return { ...(this.pmoOverridesByDay()[day] || {}) };
  }

  private setOverridesFor(day: number, ov: Record<string, string>): void {
    this.pmoOverridesByDay.set({ ...this.pmoOverridesByDay(), [day]: ov });
  }

  /**
   * Readiness for PDF Days 1–3: each day with red/orange/yellow districts needs directives + impact
   * narrative; when more than one colour is present, each colour needs a marked section.
   */
  bulletinReadiness(): Array<{
    day: number;
    hasColours: boolean;
    colours: string[];
    directivesOk: boolean;
    impactsOk: boolean;
    colourGaps: string[];
  }> {
    const cons = this.data();
    const out: Array<{
      day: number; hasColours: boolean; colours: string[];
      directivesOk: boolean; impactsOk: boolean; colourGaps: string[];
    }> = [];
    for (let n = 1; n <= this.pdfDayCount; n++) {
      const cd = cons?.days?.find(d => +d.day === n);
      const tiers = this.effectiveTiersFor(
        cd?.tiers ?? { major_warning: [], warning: [], advisory: [] },
        this.overridesFor(n),
      );
      const colours: string[] = [];
      if (tiers.major_warning.length) colours.push('MAJOR_WARNING');
      if (tiers.warning.length) colours.push('WARNING');
      if (tiers.advisory.length) colours.push('ADVISORY');
      const dir = (this.pmoDirectives()[n] || '').trim();
      const nar = (this.pmoNarratives()[n] || '').trim();
      const gaps: string[] = [];
      if (colours.length > 1) {
        for (const c of colours) {
          const okDir = this.colourSectionPresent(dir, c);
          const okNar = this.colourSectionPresent(nar, c);
          if (!okDir || !okNar) gaps.push(this.label(c));
        }
      }
      out.push({
        day: n,
        hasColours: colours.length > 0,
        colours,
        directivesOk: !colours.length || (dir.length > 0 && (colours.length <= 1 || gaps.length === 0 || colours.every(c => this.colourSectionPresent(dir, c)))),
        impactsOk: !colours.length || (nar.length > 0 && (colours.length <= 1 || colours.every(c => this.colourSectionPresent(nar, c)))),
        colourGaps: colours.length > 1
          ? colours.filter(c => !this.colourSectionPresent(dir, c) || !this.colourSectionPresent(nar, c)).map(c => this.label(c))
          : [],
      });
    }
    return out;
  }

  /** Markers accepted for multi-colour sections in directives / impact boxes. */
  private colourSectionPresent(text: string, level: string): boolean {
    if (!text) return false;
    const patterns: Record<string, RegExp> = {
      MAJOR_WARNING: /###\s*MAJOR_WARNING\b|###\s*Red\b|\[MAJOR_WARNING\]|\[Red\]/i,
      WARNING: /###\s*WARNING\b|###\s*Orange\b|\[WARNING\]|\[Orange\]/i,
      ADVISORY: /###\s*ADVISORY\b|###\s*Yellow\b|\[ADVISORY\]|\[Yellow\]/i,
    };
    return patterns[level]?.test(text) ?? false;
  }

  private validateBulletinComposition(): string | null {
    const rows = this.bulletinReadiness();
    const problems: string[] = [];
    for (const r of rows) {
      if (!r.hasColours) continue;
      if (!r.directivesOk) problems.push(`Day ${r.day}: add directives${r.colours.length > 1 ? ' (section per colour)' : ''}`);
      if (!r.impactsOk) problems.push(`Day ${r.day}: add impact narrative${r.colours.length > 1 ? ' (section per colour)' : ''}`);
    }
    if (!problems.length) return null;
    return 'Complete composition before PDF: ' + problems.join('; ') + '.';
  }

  selectedRow(): any | null {
    const name = this.selectedDistrict();
    if (!name) return null;
    return this.supportByName()[name] || this.supportRows().find((r: any) => r.district === name) || null;
  }

  instKeys(obj: any): string[] {
    return obj && typeof obj === 'object' ? Object.keys(obj) : [];
  }

  /** Copy model-suggested directives into the day's PMO directives box (replaces previous). */
  applyDirectives(row: any): void {
    const lines = (row?.suggestedDirectives || []) as string[];
    if (!lines.length) return;
    this.setDirectives(lines.join('\n'));
    this.pushMsg.set({ msg: 'Model directives set for Day ' + this.activeDay() + ' — edit before publishing.', err: false });
  }

  /** External basemap / Street View links for exposure context — no satellite AI. */
  loadAreaContext(district: string): void {
    if (!district) return;
    this.areaContext.set(null);
    const ctr = this.districtCentre(district);
    const params: Record<string, string> = { areaName: district };
    if (ctr) {
      params['lat'] = String(ctr.lat);
      params['lng'] = String(ctr.lng);
    }
    this.http.get<Record<string, any>>('/api/v1/ops/hazard-area-context', { params }).subscribe({
      next: res => this.areaContext.set(res),
      error: () => this.pushMsg.set({
        msg: 'Could not load exposure context links.',
        err: true,
      }),
    });
  }

  /** Areas currently painted at the selected statement colour (or all painted / entity tiers). */
  stmtAreasPreview(): string {
    const areas = this.areasForLevel(this.stmtLevel());
    if (!areas.length) return 'none painted at this colour yet (will use all warned districts)';
    if (areas.length <= 4) return areas.join(', ');
    return areas.slice(0, 3).join(', ') + ` +${areas.length - 3} more`;
  }

  private areasForLevel(level: string): string[] {
    const want = level;
    const out: string[] = [];
    const ov = this.overridesFor(this.activeDay());
    // PMO paint first (this day only)
    for (const [name, lvl] of Object.entries(ov)) {
      if (lvl === want) out.push(name);
    }
    // Entity effective tiers for the day when no paint yet for that colour
    if (!out.length) {
      const t = this.curEffTiers();
      if (want === 'MAJOR_WARNING') out.push(...(t.major_warning || []));
      else if (want === 'WARNING') out.push(...(t.warning || []));
      else out.push(...(t.advisory || []));
    }
    return [...new Set(out)];
  }

  /** Sync hazard select from current impact focus when possible. */
  private hazardFromFocus(): string {
    const f = (this.hazardFocusResolved() || this.hazardFocus() || '').toLowerCase();
    if (f.includes('flood')) return 'floods';
    if (f.includes('drought')) return 'drought';
    if (f.includes('landslide')) return 'landslide';
    if (f.includes('storm') || f.includes('wind')) return 'strong_winds';
    if (f.includes('coastal') || f.includes('wave')) return 'large_waves';
    if (f.includes('earth') || f.includes('quake')) return 'earthquake_and_tsunami';
    if (f.includes('fire')) return 'wildfire';
    if (f.includes('health')) return 'public_health';
    return this.stmtHazard() || 'heavy_rainfall';
  }

  proposeStatements(): void {
    this.stmtLoading.set(true);
    this.stmtError.set('');
    // Prefer hazard focus from impact analysis when user left default
    const hazard = this.stmtHazard() || this.hazardFromFocus();
    this.stmtHazard.set(hazard);
    const areas = this.areasForLevel(this.stmtLevel());
    // Fallback: all districts currently on the support/entity map for the day
    const allAreas = areas.length ? areas : [
      ...this.curEffTiers().major_warning,
      ...this.curEffTiers().warning,
      ...this.curEffTiers().advisory,
    ];
    this.svc.actionStatements({
      impactLevel: this.stmtLevel(),
      hazard,
      hazardFocus: this.hazardFocusResolved() || this.hazardFocus(),
      areas: allAreas,
      language: this.stmtLang(),
      limit: 3,
    }).subscribe({
      next: r => {
        this.stmtLoading.set(false);
        if (!r?.success) {
          this.stmtError.set(r?.message || 'Could not load Action Guide proposals.');
          this.stmtProposals.set([]);
          return;
        }
        this.stmtProposals.set((r.proposals || []).map((p: any) => ({ ...p })));
        this.pushMsg.set({
          msg: `Action Guide proposed ${(r.proposals || []).length} statements for ${r.impactLevel} / ${r.hazard?.name || hazard}. Edit, then apply — nothing is sent until you publish via EOCC.`,
          err: false,
        });
      },
      error: err => {
        this.stmtLoading.set(false);
        this.stmtError.set(err?.error?.message || 'Action Guide assist unavailable.');
        this.stmtProposals.set([]);
      },
    });
  }

  editProposal(id: string, text: string): void {
    this.stmtProposals.set(this.stmtProposals().map(p => p.id === id ? { ...p, text } : p));
  }

  /**
   * Apply a (possibly edited) proposal under the active statement colour section for this day.
   * Multi-colour days keep other sections; does not generate PDF or send.
   */
  applyProposal(p: any, target: 'directives' | 'narrative' | 'both'): void {
    const text = (p?.text || '').trim();
    if (!text) return;
    const colour = this.stmtLevel();
    if (target === 'directives' || target === 'both') {
      this.setDirectives(this.mergeColourSection(this.pmoDirectives()[this.activeDay()] || '', colour, text));
    }
    if (target === 'narrative' || target === 'both') {
      this.setNarrative(this.mergeColourSection(this.pmoNarratives()[this.activeDay()] || '', colour, text));
    }
    this.pushMsg.set({
      msg: `Updated ${target === 'both' ? 'directives and narrative' : target} for Day ${this.activeDay()} · ${this.label(colour)}. Edit freely, then Generate Impact Bulletin.`,
      err: false,
    });
  }

  /** Upsert a ### LEVEL section block inside a multi-colour composition text. */
  private mergeColourSection(existing: string, level: string, body: string): string {
    const header = `### ${level}`;
    const block = `${header}\n${body.trim()}`;
    const re = new RegExp(`###\\s*${level}\\b[\\s\\S]*?(?=###\\s*(?:MAJOR_WARNING|WARNING|ADVISORY)\\b|$)`, 'i');
    const trimmed = (existing || '').trim();
    if (!trimmed) return block;
    if (re.test(trimmed)) return trimmed.replace(re, block + '\n').trim();
    // Single free-form block and only one colour overall → replace entirely
    const t = this.curEffTiers();
    const nCol = [t.major_warning.length, t.warning.length, t.advisory.length].filter(x => x > 0).length;
    if (nCol <= 1 && !/###\s*(MAJOR_WARNING|WARNING|ADVISORY)\b/i.test(trimmed)) {
      return block;
    }
    return (trimmed + '\n\n' + block).trim();
  }

  clearDirectives(): void {
    this.setDirectives('');
    this.pushMsg.set({ msg: 'Directives cleared for Day ' + this.activeDay() + '.', err: false });
  }

  clearNarrative(): void {
    this.setNarrative('');
    this.pushMsg.set({ msg: 'Narrative cleared for Day ' + this.activeDay() + '.', err: false });
  }

  /** One-click: copy support suggestions into PMO paint for the active day only. */
  applyAllSuggestions(): void {
    const day = this.activeDay();
    const next = this.overridesFor(day);
    for (const r of this.supportRows()) {
      if (r.suggestedLevel && r.suggestedLevel !== 'NONE') {
        next[r.district] = r.suggestedLevel;
      }
    }
    this.setOverridesFor(day, next);
    this.mapMode.set('entity');
    this.restyle();
    this.pushMsg.set({
      msg: `Suggested colours applied as Day ${day} paint — review and adjust. Days 1–3 with colours need directives + impacts before PDF.`,
      err: false,
    });
  }

  applyOneSuggestion(r: any): void {
    if (!r?.district || !r.suggestedLevel || r.suggestedLevel === 'NONE') return;
    const day = this.activeDay();
    const next = this.overridesFor(day);
    next[r.district] = r.suggestedLevel;
    this.setOverridesFor(day, next);
    this.restyle();
  }
  ngOnDestroy(): void {
    if (this.evacPollTimer) {
      clearInterval(this.evacPollTimer);
      this.evacPollTimer = null;
    }
    this.stopEoPlay();
    this.removeGibsLayer();
    this.clearEvacLayers();
    if (this.map) { this.map.remove(); this.map = null; }
  }

  /** PMO STEP 1 — generate the consolidated Multirisk IMPACT bulletin (every entity arrives as a layer) and
   * PREVIEW it. The PMO PDF is the one that goes onward to the other circles. */
  generateImpact(): void {
    const cons = this.data();
    const hasContent = (cons?.days ?? []).some(d => d.tiers.major_warning.length || d.tiers.warning.length || d.tiers.advisory.length);
    if (!hasContent) { this.pushMsg.set({ msg: 'Nothing to consolidate yet — entities must push to EOCC first.', err: true }); return; }
    // Per-district coordinates come from the GADM district layer. If it hasn't loaded yet, abort with a
    // clear message rather than silently storing a null centroid (which would hide the bulletin from the
    // public map permanently). The Generate button is also disabled until layerReady, so this is a backstop.
    if (!this.layerReady()) {
      this.pushMsg.set({ msg: 'The district map is still loading — please wait a moment and click Generate again.', err: true });
      return;
    }
    const compositionErr = this.validateBulletinComposition();
    if (compositionErr) {
      this.pushMsg.set({ msg: compositionErr, err: true });
      return;
    }
    if (this.activeDay() > this.pdfDayCount) {
      this.pushMsg.set({
        msg: `You are viewing map Day ${this.activeDay()}. The Multirisk PDF always covers product Days 1–3 (engine format) — not Day ${this.activeDay()}. Composition for Days 1–3 will be used.`,
        err: false,
      });
    }
    this.pushing.set(true);
    this.pushMsg.set({ msg: 'Generating the PMO-DMD multirisk impact bulletin (Days 1–3)…', err: false });
    const payload = this.buildMultirisk(cons!);
    const severity = this.topSeverity(cons!);
    const districts = this.allTierDistricts(cons!);
    // Resolve a coordinate for EACH selected district (from the GADM layer already on the map) so the
    // bulletin can (a) anchor on the public map and (b) blink at its specific districts. The single
    // centroid is the average of those points — without it the portal map query (centroid not null)
    // filters the PMO bulletin out entirely.
    const areaPoints = this.areaPoints(cons!);
    const ctr = this.centroidOf(areaPoints);
    if (districts.length && !areaPoints.length) {
      // Districts are selected but none matched the map layer (unexpected name mismatch) — don't push a
      // bulletin that can never anchor on the public map. The backend also has a region-centroid fallback.
      this.pushing.set(false);
      this.pushMsg.set({ msg: 'Could not match the selected districts to the map. Reload the page and try again.', err: true });
      return;
    }
    this.pendingPayload = payload;
    this.pendingMeta = {
      title: `PMO-DMD Multirisk Impact Bulletin — ${severity.replace('_', ' ')} (${districts.slice(0, 2).join(', ')}${districts.length > 2 ? '…' : ''})`,
      bulletin_type: 'GENERATED', warning_code: null,
      issue_date: payload.issue_date, issue_time: payload.issue_time,
      severity, regions: districts, centroid_lat: ctr?.lat ?? null, centroid_lng: ctr?.lng ?? null,
      envelope: { source: 'dmd-consolidated', payload, area_points: areaPoints },
    };
    this.svc.generate('multirisk', payload).subscribe({
      next: (blob) => {
        this.pushing.set(false);
        this.pendingBlob = blob;
        const url = URL.createObjectURL(blob);
        this.previewRaw.set(url);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        this.pushMsg.set({ msg: 'Impact bulletin preview ready — review it, then push it to Impact Analysis.', err: false });
      },
      error: () => { this.pushing.set(false); this.pushMsg.set({ msg: 'Could not generate the impact bulletin — the engine may be busy. Try again.', err: true }); },
    });
  }

  /** PMO STEP 2 — from the preview, push the impact bulletin onward: ingest (creates the pending national
   * warning EW-YYYY-NNNNN → approval → dissemination) + store the PDF. This is the only push that mints a warning. */
  confirmPush(): void {
    this.previewUrl.set(null);
    const payload = this.pendingPayload, meta = this.pendingMeta, blob = this.pendingBlob;
    if (!payload) return;
    this.pushing.set(true);
    this.pushMsg.set({ msg: 'Pushing the impact bulletin to Impact Analysis…', err: false });
    this.svc.ingestDmd(payload, blob).subscribe({
      next: (r: any) => {
        const code = r?.warning_code ?? '(created)';
        // The bulletin only reaches the EOCC Bulletin registry (and can then be published to the map and
        // disseminated) if storeProduct succeeds — so its outcome drives the final message rather than
        // being silently swallowed. A storeProduct failure is surfaced so the operator can re-push or
        // upload the PDF manually, instead of seeing a false success.
        if (blob && meta) {
          this.svc.storeProduct(blob, { ...meta, warning_code: r?.warning_code ?? null }).subscribe({
            next: () => { this.pushing.set(false); this.pushMsg.set({ msg: `Pushed — pending warning ${code} created and the impact bulletin saved to EOCC Bulletin. Open EOCC Bulletin to publish it to the map and disseminate.`, err: false }); },
            error: () => { this.pushing.set(false); this.pushMsg.set({ msg: `Warning ${code} was created, but saving the bulletin PDF to EOCC Bulletin failed. Re-generate and push again, or upload the PDF directly in EOCC Bulletin.`, err: true }); },
          });
        } else {
          this.pushing.set(false);
          this.pushMsg.set({ msg: `Pushed to Impact Analysis — pending national warning ${code} created; it now flows onward to approval & dissemination.`, err: false });
        }
      },
      error: (e: any) => { this.pushing.set(false); this.pushMsg.set({ msg: `Could not push — ${this.ingestErr(e)}`, err: true }); },
    });
  }

  /**
   * Split composition textarea into lines for the PDF engine.
   * Keeps ### LEVEL headers (engine paints them yellow/orange/red — never prints "###").
   * Strips leading "- " / "• " so the PDF never shows double bullets.
   */
  private compositionLines(text: string): string[] {
    return (text || '')
      .split(/\r?\n/)
      .map(s => s.replace(/^\s*[-*\u2022•]+\s+/, '').trim())
      .filter(Boolean);
  }

  /**
   * Transform the consolidated overlay into the engine's Multirisk shape (exactly 3 days).
   * Product Days 1–3 only — never remaps Day 5 content into Day 1. Day-specific paint/directives/impacts.
   */
  private buildMultirisk(cons: Consolidated): any {
    const issue = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const byDay = new Map<number, any>();
    for (const d of (cons.days ?? [])) { byDay.set(+d.day, d); }
    const comments = cons.comments ?? {};
    const entriesFor = (agency: string, dayNo: number) =>
      (comments[agency] ?? []).filter((e: any) => +e.day === dayNo)
        .map((e: any) => ({ alert_level: e.alert_level || 'ADVISORY', description: e.description || '', likelihood: e.likelihood || 'MEDIUM' }));

    const days: any[] = [];
    const districtSummaries: any[] = [];
    for (let n = 1; n <= this.pdfDayCount; n++) {
      const cd = byDay.get(n);
      // Use THIS product day's paint only — never Day 5 overrides on Day 1.
      const tiers = this.effectiveTiersFor(
        cd?.tiers ?? { major_warning: [], warning: [], advisory: [] },
        this.overridesFor(n),
      );
      const date = iso(new Date(issue.getTime() + (n - 1) * 86400000));
      const cmt: any = {};
      const tmaE = entriesFor('tma', n); if (tmaE.length) { cmt.tma = { entries: tmaE }; }
      const mowE = entriesFor('mow', n); if (mowE.length) { cmt.mow = { entries: mowE }; }
      // One line list per box — engine turns ### WARNING into coloured chips (not printed as "###").
      // Do not prefix with "•" here (engine adds a single bullet for content lines only).
      const pmoN = (this.pmoNarratives()[n] ?? '').trim();
      if (pmoN) {
        cmt.dmd = {
          header: 'PMO impact assessment',
          bullets: this.compositionLines(pmoN),
        };
      }
      const day: any = {
        date, day_number: n, // engine slot = product day (1..3), not TMA day 5
        alert_tiers: {
          major_warning: { text: `${tiers.major_warning.length} district(s) at major warning.` },
          warning: { text: `${tiers.warning.length} district(s) at warning.` },
          advisory: { text: `${tiers.advisory.length} district(s) at advisory.` },
        },
        comments: cmt,
      };
      const pmoD = (this.pmoDirectives()[n] ?? '').trim();
      if (pmoD) {
        day.recommendation_intro = 'PMO Directives and Instructions';
        day.recommendations = this.compositionLines(pmoD);
      }
      days.push(day);
      districtSummaries.push({
        day_number: n,
        major_warning: tiers.major_warning ?? [],
        warning: tiers.warning ?? [],
        advisory: tiers.advisory ?? [],
      });
    }
    const num = `${String(issue.getFullYear()).slice(2)}${(issue.getMonth() + 1).toString().padStart(2, '0')}${issue.getDate().toString().padStart(2, '0')}`;
    return {
      bulletin_number: num, issue_date: iso(issue), issue_time: issue.toTimeString().slice(0, 5),
      drawn_shapes: this.pmoShapes()
        .filter(s => s.level && s.level !== 'NONE')
        .map(s => tagShapeForPdf(s.geojson, s.level, {
          kind: s.kind, radius: s.radius, hazard_type: this.stmtHazard() || 'multi_risk',
        }))
        .filter(Boolean),
      language: 'en', header_variant: 'new', days, district_summaries: districtSummaries,
    };
  }
  private topSeverity(cons: Consolidated): string {
    let best = 'ADVISORY';
    for (const d of (cons.days ?? []).filter(x => +x.day <= this.pdfDayCount)) {
      const et = this.effectiveTiersFor(
        d.tiers ?? { major_warning: [], warning: [], advisory: [] },
        this.overridesFor(+d.day),
      );
      if (et.major_warning.length) { return 'MAJOR_WARNING'; }
      if (et.warning.length) { best = 'WARNING'; }
    }
    return best;
  }
  private allTierDistricts(cons: Consolidated): string[] {
    const s = new Set<string>();
    for (const d of (cons.days ?? []).filter(x => +x.day <= this.pdfDayCount)) {
      const et = this.effectiveTiersFor(
        d.tiers ?? { major_warning: [], warning: [], advisory: [] },
        this.overridesFor(+d.day),
      );
      for (const t of [et.major_warning, et.warning, et.advisory]) {
        for (const x of (t ?? [])) { s.add(x); }
      }
    }
    return [...s];
  }

  /** Polygon centre of a district by display_name (from the loaded GADM layer); null if unmatched/not yet loaded. */
  private districtCentre(name: string): { lat: number; lng: number } | null {
    if (!this.districtLayer) { return null; }
    let ly: any = null;
    this.districtLayer.eachLayer((l: any) => { if (l.feature?.properties?.display_name === name) { ly = l; } });
    if (!ly) { return null; }
    const c = ly.getBounds().getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  /** One point per selected district at its HIGHEST level across PDF Days 1–3 — public map blink markers. */
  private areaPoints(cons: Consolidated): Array<{ name: string; lat: number; lng: number; level: string }> {
    const rank = (l: string) => ['ADVISORY', 'WARNING', 'MAJOR_WARNING'].indexOf(l);
    const top = new Map<string, string>();
    for (const d of (cons.days ?? []).filter(x => +x.day <= this.pdfDayCount)) {
      const et = this.effectiveTiersFor(
        d.tiers ?? { major_warning: [], warning: [], advisory: [] },
        this.overridesFor(+d.day),
      );
      const tiers: Array<[string[], string]> = [[et.major_warning, 'MAJOR_WARNING'], [et.warning, 'WARNING'], [et.advisory, 'ADVISORY']];
      for (const [arr, lvl] of tiers) {
        for (const name of (arr ?? [])) {
          if (!top.has(name) || rank(lvl) > rank(top.get(name)!)) { top.set(name, lvl); }
        }
      }
    }
    const out: Array<{ name: string; lat: number; lng: number; level: string }> = [];
    for (const [name, level] of top) {
      const c = this.districtCentre(name);
      if (c) { out.push({ name, lat: c.lat, lng: c.lng, level }); }
    }
    return out;
  }

  /** Average centre of the affected districts — the bulletin's single map-pin coordinate. */
  private centroidOf(pts: Array<{ lat: number; lng: number }>): { lat: number; lng: number } | null {
    if (!pts.length) { return null; }
    return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
  }
  private ingestErr(e: any): string { return e?.error?.message || e?.message || 'the impact bulletin could not be ingested.'; }

  curDay() { return this.data()?.days?.find(d => +d.day === this.activeDay()); }
  dayComments(): any[] {
    const c = this.data()?.comments ?? {};
    const out: any[] = [];
    for (const agency of Object.keys(c)) {
      for (const e of c[agency]) if (+e.day === this.activeDay()) out.push({ ...e, agency });
    }
    return out.sort((a, b) => (b.alert_level || '').localeCompare(a.alert_level || ''));
  }

  /** Store the PMO impact narrative for the active day (→ the DMD comment in the impact bulletin). */
  setNarrative(v: string): void {
    this.pmoNarratives.set({ ...this.pmoNarratives(), [this.activeDay()]: v });
  }
  setDirectives(v: string): void {
    this.pmoDirectives.set({ ...this.pmoDirectives(), [this.activeDay()]: v });
  }

  private districtTier(): Record<string, string> {
    const out: Record<string, string> = {};
    const cd = this.curDay(); if (!cd) return out;
    for (const d of cd.tiers.major_warning) out[d] = 'MAJOR_WARNING';
    for (const d of cd.tiers.warning) out[d] = 'WARNING';
    for (const d of cd.tiers.advisory) out[d] = 'ADVISORY';
    return out;
  }

  /** Effective level for a district on the CURRENT day: a PMO impact override (incl 'NONE') wins over the
   *  consolidated hazard tier. Returns undefined when neither applies (no alert). */
  private effectiveLevelNow(name: string): string | undefined {
    const ov = this.overridesFor(this.activeDay());
    return ov[name] !== undefined ? ov[name] : this.districtTier()[name];
  }

  /**
   * Apply day-specific PMO paint overrides to a day's consolidated tiers.
   * 'NONE' drops a district; paint may add districts that had no entity alert.
   */
  private effectiveTiersFor(
    t: { major_warning: string[]; warning: string[]; advisory: string[] },
    ov: Record<string, string>,
  ): { major_warning: string[]; warning: string[]; advisory: string[] } {
    const out: { major_warning: string[]; warning: string[]; advisory: string[] } = {
      major_warning: [], warning: [], advisory: [],
    };
    const key = (l?: string): 'major_warning' | 'warning' | 'advisory' | null =>
      l === 'MAJOR_WARNING' ? 'major_warning' : l === 'WARNING' ? 'warning' : l === 'ADVISORY' ? 'advisory' : null;
    const place = (name: string, lvl?: string) => {
      const k = key(lvl);
      if (k && !out[k].includes(name)) { out[k].push(name); }
    };
    const seen = new Set<string>();
    for (const [arr, lvl] of [
      [t.major_warning, 'MAJOR_WARNING'],
      [t.warning, 'WARNING'],
      [t.advisory, 'ADVISORY'],
    ] as Array<[string[], string]>) {
      for (const name of (arr ?? [])) {
        seen.add(name);
        place(name, ov[name] !== undefined ? ov[name] : lvl);
      }
    }
    for (const [name, lvl] of Object.entries(ov)) {
      if (!seen.has(name)) { place(name, lvl); }
    }
    return out;
  }

  /** Effective tiers for the current day — drives the tier counts (template). */
  curEffTiers(): { major_warning: string[]; warning: string[]; advisory: string[] } {
    return this.effectiveTiersFor(
      this.curDay()?.tiers ?? { major_warning: [], warning: [], advisory: [] },
      this.overridesFor(this.activeDay()),
    );
  }

  /** PMO impact analysis: paint is stored for the active day only. */
  private paintDistrict(name: string): void {
    this.selectedDistrict.set(name);
    // Soft-load exposure context for the painted district (does not block paint)
    if (name && this.areaContext()?.['label'] !== name) {
      this.loadAreaContext(name);
    }
    if (this.eoPanelOpen()) this.refreshEoFilmstrip();
    const day = this.activeDay();
    const lvl = this.drawLevel();
    const cur = this.overridesFor(day);
    if (cur[name] === lvl) { delete cur[name]; } else { cur[name] = lvl; }
    this.setOverridesFor(day, cur);
    if (lvl === 'MAJOR_WARNING' || lvl === 'WARNING' || lvl === 'ADVISORY') {
      this.stmtLevel.set(lvl as 'ADVISORY' | 'WARNING' | 'MAJOR_WARNING');
    }
    this.restyle();
    if (this.showEvacOnMap() || this.evacCenters().length) {
      this.loadEvacRoutes(false);
    }
  }

  /** Switch paint/draw palette and rebuild Leaflet.Draw so the next stroke uses that colour. */
  setDrawLevel(key: string): void {
    this.drawLevel.set(key);
    if (key === 'MAJOR_WARNING' || key === 'WARNING' || key === 'ADVISORY') {
      this.stmtLevel.set(key as 'ADVISORY' | 'WARNING' | 'MAJOR_WARNING');
    }
    this.rebuildDrawControl();
  }

  setMapMode(mode: 'entity' | 'support' | 'inform' | 'inform-h' | 'inform-v' | 'inform-c' | 'inform-risk' | 'focus-hazard'): void {
    this.mapMode.set(mode);
    this.restyle();
  }

  /** Basemap switch: Map (admin/OSM or local vectors) vs Satellite (Esri World Imagery — open tiles, human review). */
  setBasemap(mode: 'map' | 'satellite'): void {
    this.basemap.set(mode);
    if (mode === 'map') {
      this.structureMode.set(false);
      this.exposureCatalog.update(list => list.map(x =>
        x.id === 'structures' ? { ...x, enabled: false } : x));
    }
    this.applyBasemap();
    this.syncCatalogBasemap();
    this.restyle();
    this.basemapNote.set(mode === 'satellite'
      ? 'Satellite basemap active (Esri World Imagery)'
        + (this.satLabels() ? ' + place labels' : '')
        + (this.structureMode() ? ' · structures mode' : '')
        + '. Human exposure context only — not damage AI.'
      : this.basemapSource() === 'local'
        ? 'Administrative map basemap active (local Tanzania vectors — offline-capable).'
        : 'Administrative map basemap active (Carto/OSM-style tiles).');
    this.pushMsg.set({ msg: this.basemapNote(), err: false });
  }

  toggleSatLabels(): void {
    this.satLabels.update(v => !v);
    this.exposureCatalog.update(list => list.map(x =>
      x.id === 'sat_labels' ? { ...x, enabled: this.satLabels() } : x));
    this.applyBasemap();
    if (this.basemap() === 'satellite') {
      this.pushMsg.set({
        msg: this.satLabels() ? 'Place labels on over satellite.' : 'Place labels off — imagery only.',
        err: false,
      });
    }
  }

  // ── Systematic workspace (5 stages) ───────────────────────────────────

  setWorkspace(stage: 'map' | 'paint' | 'imagery' | 'compose' | 'context'): void {
    this.workspace.set(stage);
    if (stage === 'imagery') {
      if (this.imageryTab() === 'eo') {
        this.eoPanelOpen.set(true);
        this.refreshEoFilmstrip();
      }
      if (this.imageryTab() === 'structures' && !this.structureMode()) {
        // leave off until user enables — no auto-toggle
      }
    }
    if (stage === 'compose') {
      setTimeout(() => this.scrollToCompose(), 80);
    }
    setTimeout(() => { try { this.map?.invalidateSize(); } catch { /* ignore */ } }, 120);
  }

  setImageryTab(tab: 'sat24' | 'eo' | 'structures'): void {
    this.imageryTab.set(tab);
    this.workspace.set('imagery');
    if (tab === 'eo') {
      this.eoPanelOpen.set(true);
      this.refreshEoFilmstrip();
    }
    if (tab === 'structures') {
      // optional: keep structure mode as user set
    }
  }

  /** SAT24 real-time weather satellite — Tanzania or Africa loop (third-party). */
  sat24Url(): string {
    // Official SAT24 country / continent cloud-radar pages
    return this.sat24Region() === 'tz'
      ? 'https://www.sat24.com/en-gb/country/tz'
      : 'https://www.sat24.com/en-gb/continent/af';
  }

  sat24SafeUrl(): SafeResourceUrl {
    // key query forces iframe remount on refresh
    const url = this.sat24Url() + (this.sat24Key() ? `?_r=${this.sat24Key()}` : '');
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  setSat24Region(r: 'tz' | 'af'): void {
    this.sat24Region.set(r);
    this.sat24Key.update(k => k + 1);
    this.pushMsg.set({
      msg: r === 'tz'
        ? 'SAT24 · Tanzania real-time weather satellite loop.'
        : 'SAT24 · Africa real-time weather satellite loop.',
      err: false,
    });
  }

  reloadSat24(): void {
    this.sat24Key.update(k => k + 1);
    this.pushMsg.set({ msg: 'SAT24 frame refreshed.', err: false });
  }

  // ── Exposure catalogue helpers (grouped UI — no flow distortion) ──────

  exposureToggleable(): Array<{
    id: string; title: string; detail: string; source: string;
    status: 'live' | 'ready' | 'deferred' | 'planned'; toggleable: boolean; enabled: boolean;
  }> {
    return this.exposureCatalog().filter(x => x.toggleable && (x.status === 'live' || x.status === 'ready'));
  }

  exposureLiveFixed(): Array<{
    id: string; title: string; detail: string; source: string;
    status: 'live' | 'ready' | 'deferred' | 'planned'; toggleable: boolean; enabled: boolean;
  }> {
    return this.exposureCatalog().filter(x => !x.toggleable && x.status === 'live');
  }

  exposureDeferred(): Array<{
    id: string; title: string; detail: string; source: string;
    status: 'live' | 'ready' | 'deferred' | 'planned'; toggleable: boolean; enabled: boolean;
  }> {
    return this.exposureCatalog().filter(x => x.status === 'deferred' || x.status === 'planned');
  }

  // ── Structures / Google Earth (buildings · near-current) ──────────────

  /** Point for structure viewers: selected district centre, or national fallback. */
  structurePoint(): { lat: number; lng: number; label: string } | null {
    const name = this.selectedDistrict();
    if (name) {
      const c = this.districtCentre(name);
      if (c) return { lat: c.lat, lng: c.lng, label: name };
    }
    // Tanzania geographic centre — still allows Earth open without selection
    return { lat: -6.3690, lng: 34.8888, label: name || 'Tanzania' };
  }

  structureLinks(): Array<{ key: string; title: string; url: string; note: string }> {
    const p = this.structurePoint();
    if (!p) return [];
    const { lat, lng, label } = p;
    const place = encodeURIComponent(label);
    return [
      {
        key: 'earth',
        title: 'Google Earth',
        url: `https://earth.google.com/web/@${lat.toFixed(6)},${lng.toFixed(6)},600a,2500d,35y,0h,45t,0r`,
        note: 'Best buildings/3D structures — near-current Google imagery (external ToS)',
      },
      {
        key: 'gmaps_sat',
        title: 'Maps satellite',
        url: `https://www.google.com/maps/@${lat.toFixed(6)},${lng.toFixed(6)},18z/data=!3m1!1e3`,
        note: 'Google Maps satellite basemap high zoom (external ToS)',
      },
      {
        key: 'gmaps_search',
        title: 'Maps search',
        url: `https://www.google.com/maps/search/?api=1&query=${place}`,
        note: 'Search by district name when coordinates are approximate',
      },
      {
        key: 'street',
        title: 'Street View',
        url: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`,
        note: 'Street-level if available (rural gaps common)',
      },
      {
        key: 'esri',
        title: 'Esri aerial',
        url: `https://www.arcgis.com/home/webmap/viewer.html?center=${lng},${lat}&level=16`
          + '&basemapUrl=https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
        note: 'Esri World Imagery viewer — same family as in-map basemap',
      },
    ];
  }

  /**
   * Structures mode: Esri satellite + labels + translucent paint + zoom to district.
   * Does not open external windows unless operator clicks Google Earth.
   */
  activateStructuresView(): void {
    const turningOn = !this.structureMode();
    if (turningOn) {
      // GIBS is coarse for buildings — prefer high-res Esri under paint
      if (this.eoOnMap()) this.setEoOnMap(false);
      this.satLabels.set(true);
      if (this.basemap() !== 'satellite') {
        this.setBasemap('satellite');
      } else {
        this.applyBasemap();
      }
      this.structureMode.set(true);
      this.syncCatalogBasemap();
      this.zoomToStructureFocus();
      this.restyle();
      this.pushMsg.set({
        msg: 'Structures mode: Esri high-res on map (buildings at zoom 12–18). '
          + 'For near-current roofs/3D open Google Earth (external).',
        err: false,
      });
    } else {
      this.structureMode.set(false);
      this.syncCatalogBasemap();
      this.restyle();
      this.pushMsg.set({ msg: 'Structures mode off.', err: false });
    }
  }

  openStructureViewer(kind: 'earth' | 'gmaps_sat' | 'street' | 'esri' | 'gmaps_search'): void {
    const links = this.structureLinks();
    const hit = links.find(l => l.key === kind);
    if (!hit) return;
    try {
      window.open(hit.url, '_blank', 'noopener,noreferrer');
    } catch { /* ignore */ }
    this.pushMsg.set({
      msg: `Opened ${hit.title} externally (Google/Esri ToS). Not embedded in DMIS.`,
      err: false,
    });
  }

  /** Zoom map to selected district (or national) for structure inspection. */
  private zoomToStructureFocus(): void {
    if (!this.map || typeof L === 'undefined') return;
    const name = this.selectedDistrict();
    if (name && this.districtLayer) {
      let found: any = null;
      try {
        this.districtLayer.eachLayer((ly: any) => {
          const n = ly?.feature?.properties?.display_name;
          if (n === name) found = ly;
        });
      } catch { /* ignore */ }
      if (found?.getBounds) {
        try {
          this.map.fitBounds(found.getBounds(), { padding: [24, 24], maxZoom: 13 });
          return;
        } catch { /* fall through */ }
      }
    }
    const p = this.structurePoint();
    if (p) {
      try { this.map.setView([p.lat, p.lng], Math.max(this.map.getZoom(), 12)); } catch { /* ignore */ }
    }
  }

  // ── NASA GIBS EO time-slice (View · EO time-slice) ──────────────────────

  private isoDateOffset(daysBack: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d.toISOString().slice(0, 10);
  }

  eoToday(): string {
    return this.isoDateOffset(0);
  }

  eoProductLabel(): string {
    return this.eoProducts.find(p => p.id === this.eoProduct())?.label || this.eoProduct();
  }

  private eoProductDef() {
    return this.eoProducts.find(p => p.id === this.eoProduct()) || this.eoProducts[0];
  }

  /** Days from oldest → newest for timeline chips (window ending at today). */
  eoDayList(): string[] {
    const out: string[] = [];
    for (let i = this.eoWindowDays - 1; i >= 0; i--) {
      out.push(this.isoDateOffset(i));
    }
    return out;
  }

  eoScrubIndex(): number {
    const list = this.eoDayList();
    const idx = list.indexOf(this.eoDate());
    return idx >= 0 ? idx : list.length - 1;
  }

  eoWeekday(iso: string): string {
    try {
      const d = new Date(iso + 'T12:00:00Z');
      return d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    } catch {
      return '';
    }
  }

  toggleEoPanel(): void {
    this.setWorkspace('imagery');
    this.setImageryTab('eo');
  }

  setEoProduct(id: string): void {
    if (!this.eoProducts.some(p => p.id === id)) return;
    this.eoProduct.set(id);
    this.applyGibsLayer();
    this.refreshEoFilmstrip();
  }

  setEoOnMap(on: boolean): void {
    this.eoOnMap.set(on);
    this.exposureCatalog.update(list => list.map(x =>
      x.id === 'gibs_timeslice' ? { ...x, enabled: on } : x));
    if (on) {
      this.applyGibsLayer();
      this.restyle(); // translucent district fills so GIBS shows under paint
      this.pushMsg.set({
        msg: `GIBS ${this.eoProductLabel()} · ${this.eoDate()} on map (NASA open imagery — human review).`,
        err: false,
      });
    } else {
      this.stopEoPlay();
      this.removeGibsLayer();
      this.restyle();
    }
  }

  /**
   * Keep alert colour but let imagery (GIBS or high-res Structures) read through.
   * Structures mode is more transparent so roofs/buildings stay visible under paint.
   */
  private eoAwareFill(activeOpacity: number, idleOpacity: number, active: boolean): number {
    if (this.structureMode()) {
      return active ? Math.min(activeOpacity, 0.32) : Math.min(idleOpacity, 0.08);
    }
    if (!this.eoOnMap()) return active ? activeOpacity : idleOpacity;
    return active ? Math.min(activeOpacity, 0.42) : Math.min(idleOpacity, 0.12);
  }

  setEoOpacity(pct: number): void {
    const v = Math.max(20, Math.min(100, pct));
    this.eoOpacity.set(v);
    if (this.gibsLayer?.setOpacity) {
      this.gibsLayer.setOpacity(v / 100);
    }
  }

  setEoDate(iso: string): void {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    if (iso > this.eoToday()) return;
    this.eoDate.set(iso);
    if (this.eoOnMap()) this.applyGibsLayer();
  }

  setEoPreset(key: string): void {
    const map: Record<string, number> = {
      today: 0, y1: 1, y2: 2, y7: 7, y14: 14, y30: 30,
    };
    const back = map[key];
    if (back === undefined) return;
    this.setEoDate(this.isoDateOffset(back));
    if (!this.eoOnMap()) this.setEoOnMap(true);
  }

  setEoScrub(index: number): void {
    const list = this.eoDayList();
    const i = Math.max(0, Math.min(list.length - 1, index));
    this.setEoDate(list[i]);
    if (!this.eoOnMap()) this.setEoOnMap(true);
  }

  eoStep(delta: number): void {
    const list = this.eoDayList();
    let i = list.indexOf(this.eoDate());
    if (i < 0) i = list.length - 1;
    i = Math.max(0, Math.min(list.length - 1, i + delta));
    this.setEoDate(list[i]);
    if (!this.eoOnMap()) this.setEoOnMap(true);
  }

  toggleEoPlay(): void {
    if (this.eoPlaying()) {
      this.stopEoPlay();
      return;
    }
    if (!this.eoOnMap()) this.setEoOnMap(true);
    // Start from oldest in window
    this.setEoDate(this.eoDayList()[0]);
    this.eoPlaying.set(true);
    this.eoPlayTimer = setInterval(() => {
      const list = this.eoDayList();
      const i = list.indexOf(this.eoDate());
      if (i < 0 || i >= list.length - 1) {
        this.stopEoPlay();
        return;
      }
      this.setEoDate(list[i + 1]);
    }, 900);
  }

  private stopEoPlay(): void {
    if (this.eoPlayTimer) {
      clearInterval(this.eoPlayTimer);
      this.eoPlayTimer = null;
    }
    this.eoPlaying.set(false);
  }

  private removeGibsLayer(): void {
    this.removeLayerSafe(this.gibsLayer);
    this.gibsLayer = null;
  }

  /** Build / refresh NASA GIBS WMTS XYZ layer for current product + date. */
  private applyGibsLayer(): void {
    if (!this.map || typeof L === 'undefined' || !this.eoOnMap()) {
      this.removeGibsLayer();
      return;
    }
    if (!this.map.getPane('dmisGibsPane')) {
      this.map.createPane('dmisGibsPane');
      this.map.getPane('dmisGibsPane').style.zIndex = '320'; // above basemap, under district paint (~400)
      this.map.getPane('dmisGibsPane').style.pointerEvents = 'none';
    }
    const p = this.eoProductDef();
    const time = this.eoDate();
    // GIBS REST: .../{layer}/default/{time}/{matrix}/{z}/{y}/{x}.{ext}
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${p.layer}/default/${time}/${p.matrix}/{z}/{y}/{x}.${p.ext}`;
    this.removeGibsLayer();
    this.gibsLayer = L.tileLayer(url, {
      attribution: 'Imagery © NASA GIBS / EOSDIS — time-enabled true-colour (not DMIS AI)',
      maxNativeZoom: 9,
      maxZoom: 18,
      minZoom: 4,
      opacity: this.eoOpacity() / 100,
      pane: 'dmisGibsPane',
      crossOrigin: true,
      errorTileUrl: '', // blank on missing day (partial NRT)
    });
    this.gibsLayer.addTo(this.map);
  }

  /** AOI for filmstrip / external tools — selected district centre or TZ national. */
  private eoAoi(): { lat: number; lng: number; bbox: [number, number, number, number]; label: string } {
    const name = this.selectedDistrict();
    if (name) {
      const c = this.districtCentre(name);
      if (c) {
        const pad = 0.55;
        return {
          lat: c.lat, lng: c.lng, label: name,
          bbox: [c.lng - pad, c.lat - pad, c.lng + pad, c.lat + pad],
        };
      }
    }
    // Tanzania core frame
    return {
      lat: -6.4, lng: 35.0, label: 'Tanzania',
      bbox: [29.0, -12.0, 41.0, 0.5],
    };
  }

  /**
   * Worldview Snapshots (public) — small recent frames for the AOI.
   * Not an AI product; static image previews for human comparison.
   */
  refreshEoFilmstrip(): void {
    const aoi = this.eoAoi();
    const p = this.eoProductDef();
    const frames: Array<{ date: string; url: string | null }> = [];
    // 8 most recent days (newest first for scanning)
    for (let i = 0; i < 8; i++) {
      const date = this.isoDateOffset(i);
      const [minLon, minLat, maxLon, maxLat] = aoi.bbox;
      // Worldview Snapshots API — BBOX=minLon,minLat,maxLon,maxLat
      const url = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?'
        + 'REQUEST=GetSnapshot'
        + `&TIME=${encodeURIComponent(date)}`
        + `&BBOX=${minLon},${minLat},${maxLon},${maxLat}`
        + '&CRS=EPSG:4326'
        + `&LAYERS=${encodeURIComponent(p.layer)}`
        + '&FORMAT=image/jpeg'
        + '&WIDTH=240&HEIGHT=180'
        + '&AUTOSCALE=TRUE';
      frames.push({ date, url });
    }
    this.eoFilmstrip.set(frames);
  }

  onEoFilmError(date: string): void {
    this.eoFilmstrip.update(list => list.map(f => f.date === date ? { ...f, url: null } : f));
  }

  /** Deep links into full international EO tools, locked to current AOI + date. */
  eoExternalLinks(): Array<{ key: string; title: string; url: string; note: string }> {
    const aoi = this.eoAoi();
    const t = this.eoDate();
    const p = this.eoProductDef();
    const [minLon, minLat, maxLon, maxLat] = aoi.bbox;
    const v = `${minLon},${minLat},${maxLon},${maxLat}`;
    return [
      {
        key: 'worldview',
        title: 'NASA Worldview (timeline)',
        url: `https://worldview.earthdata.nasa.gov/?v=${v}&t=${t}&l=${p.layer},Coastlines_15m`,
        note: 'Full NASA timeline, compare, animate, download — best open temporal browser',
      },
      {
        key: 'worldview_compare',
        title: 'Worldview swipe compare',
        url: `https://worldview.earthdata.nasa.gov/?v=${v}&t=${t}&l=${p.layer},Coastlines_15m&ca=true`,
        note: 'Side-by-side / swipe date comparison in Worldview',
      },
      {
        key: 'copernicus',
        title: 'Copernicus Browser (Sentinel)',
        url: `https://browser.dataspace.copernicus.eu/?lat=${aoi.lat}&lng=${aoi.lng}&zoom=10&fromTime=${t}T00%3A00%3A00.000Z&toTime=${t}T23%3A59%3A59.999Z`,
        note: 'Higher-resolution Sentinel-2 scenes — external EU open data',
      },
      {
        key: 'eo_browser',
        title: 'EO Browser (Sentinel Hub)',
        url: `https://apps.sentinel-hub.com/eo-browser/?lat=${aoi.lat}&lng=${aoi.lng}&zoom=11&time=${t}`,
        note: 'Sentinel Hub browser — may require free login',
      },
      {
        key: 'esri_viewer',
        title: 'Esri World Imagery',
        url: `https://www.arcgis.com/home/webmap/viewer.html?center=${aoi.lng},${aoi.lat}&level=12`
          + '&basemapUrl=https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
        note: 'High-res aerial basemap (not daily time-series)',
      },
    ];
  }

  private syncCatalogBasemap(): void {
    const mode = this.basemap();
    this.exposureCatalog.update(list => list.map(x => {
      if (x.id === 'basemap_sat') return { ...x, enabled: mode === 'satellite' };
      if (x.id === 'basemap_map') return { ...x, enabled: mode === 'map' };
      if (x.id === 'sat_labels') return { ...x, enabled: this.satLabels() && mode === 'satellite' };
      if (x.id === 'structures') return { ...x, enabled: this.structureMode() && mode === 'satellite' };
      if (x.id === 'gibs_timeslice') return { ...x, enabled: this.eoOnMap() };
      return x;
    }));
  }

  toggleExposure(id: string, on: boolean): void {
    const row = this.exposureCatalog().find(x => x.id === id);
    if (!row?.toggleable) return;
    if (id === 'basemap_sat') { this.setBasemap(on ? 'satellite' : 'map'); return; }
    if (id === 'basemap_map') { this.setBasemap(on ? 'map' : 'satellite'); return; }
    if (id === 'sat_labels') {
      this.satLabels.set(on);
      this.exposureCatalog.update(list => list.map(x => x.id === id ? { ...x, enabled: on } : x));
      this.applyBasemap();
      return;
    }
    if (id === 'gibs_timeslice') {
      if (on) {
        this.eoPanelOpen.set(true);
        this.setEoOnMap(true);
        this.refreshEoFilmstrip();
      } else {
        this.setEoOnMap(false);
      }
      return;
    }
    if (id === 'structures') {
      if (on && !this.structureMode()) this.activateStructuresView();
      else if (!on && this.structureMode()) this.activateStructuresView();
      return;
    }
    this.exposureCatalog.update(list => list.map(x => x.id === id ? { ...x, enabled: on } : x));
  }

  clearAllDrawnShapes(): void {
    if (!this.pmoShapes().length) return;
    this.pmoShapes.set([]);
    this.renderPmoShapes();
    this.pushMsg.set({ msg: 'All PMO delineations cleared for this session.', err: false });
  }

  scrollToCompose(): void {
    try {
      document.getElementById('ia-compose')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* ignore */ }
  }

  /** Summary of Multirisk composition readiness for the Compose bar. */
  composeReadySummary(): { ok: boolean; msg: string } {
    const rows = this.bulletinReadiness();
    const need = rows.filter(r => r.hasColours && (!r.directivesOk || !r.impactsOk));
    if (!need.length) {
      const any = rows.some(r => r.hasColours);
      return { ok: true, msg: any ? 'ready' : 'no colours yet' };
    }
    return {
      ok: false,
      msg: need.map(r => `Day ${r.day}`).join(', ') + ' incomplete',
    };
  }

  private baseTileMap: any = null;
  private baseTileSat: any = null;
  private baseLabels: any = null;
  private baseLocalGroup: any = null;
  private mapTileFailed = false;

  private removeLayerSafe(ly: any): void {
    if (!this.map || !ly) return;
    try {
      if (this.map.hasLayer(ly)) this.map.removeLayer(ly);
    } catch { /* ignore */ }
  }

  private ensureLocalBase(): void {
    if (!this.map || this.baseLocalGroup) return;
    this.baseLocalGroup = addLocalVectorBase(this.map, this.http, 'light', {
      panePrefix: 'iaLocal',
      addToMap: false,
    });
  }

  /** Exclusive basemap: Map tiles | Map local vectors | Satellite (+ optional labels). Never double-stack. */
  private applyBasemap(): void {
    if (!this.map || typeof L === 'undefined') return;
    const mode = this.basemap();

    this.removeLayerSafe(this.baseTileMap);
    this.removeLayerSafe(this.baseTileSat);
    this.removeLayerSafe(this.baseLabels);
    this.removeLayerSafe(this.baseLocalGroup);

    if (mode === 'map') {
      if (this.mapTileFailed || !this.baseTileMap) {
        this.ensureLocalBase();
        if (this.baseLocalGroup) {
          this.baseLocalGroup.addTo(this.map);
          try { this.baseLocalGroup.eachLayer((ly: any) => ly.bringToBack?.()); } catch { /* ignore */ }
        }
        this.basemapSource.set('local');
      } else {
        this.baseTileMap.addTo(this.map);
        try { this.baseTileMap.bringToBack(); } catch { /* ignore */ }
        this.basemapSource.set('tiles');
      }
    } else {
      if (this.baseTileSat) {
        this.baseTileSat.addTo(this.map);
        try { this.baseTileSat.bringToBack(); } catch { /* ignore */ }
      }
      if (this.satLabels() && this.baseLabels) {
        this.baseLabels.addTo(this.map);
      }
      this.basemapSource.set('satellite');
    }
  }

  /** PMO draw toolbar — yellow/orange/red match paint palette; trash deletes unwanted shapes (PDF too). */
  private drawControl: any;
  private lastDrawLevel = '';
  private initDraw(): void {
    if (!(L.Control && L.Control.Draw)) return;
    this.rebuildDrawControl();
    this.map.on(L.Draw.Event.CREATED, (e: any) => this.onPmoDraw(e));
    this.map.on(L.Draw.Event.DELETED, (e: any) => {
      const ids = new Set<number>(); e.layers.eachLayer((l: any) => { if (l._shapeId) ids.add(l._shapeId); });
      if (ids.size) { this.pmoShapes.set(this.pmoShapes().filter(s => !ids.has(s.id))); this.renderPmoShapes(); }
    });
  }
  private rebuildDrawControl(): void {
    if (!this.map || !this.drawnGroup || !(L.Control && L.Control.Draw)) return;
    if (this.drawControl) { try { this.map.removeControl(this.drawControl); } catch { /* ignore */ } }
    this.lastDrawLevel = this.drawLevel();
    this.drawControl = new L.Control.Draw(leafletDrawControlOptions(this.drawnGroup, this.drawLevel()));
    this.map.addControl(this.drawControl);
  }
  private onPmoDraw(e: any): void {
    const layer = e.layer, type = e.layerType, lvl = this.drawLevel();
    const style = shapeLeafletStyle(lvl, { pane: 'ewshapes', kind: type });
    try { if (layer.setStyle) layer.setStyle(style); } catch { /* ignore */ }
    let s: any;
    if (type === 'circle') {
      const c = layer.getLatLng();
      const radius = Math.round(layer.getRadius());
      s = {
        id: ++this.shapeSeq, kind: 'circle', level: lvl, radius,
        geojson: tagShapeForPdf(
          { type: 'Feature', properties: { kind: 'circle', radius }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } },
          lvl, { kind: 'circle', radius, hazard_type: this.stmtHazard() || 'multi_risk' },
        ),
      };
    } else {
      const gj = layer.toGeoJSON();
      s = {
        id: ++this.shapeSeq, kind: type, level: lvl,
        geojson: tagShapeForPdf(gj, lvl, { kind: type, hazard_type: this.stmtHazard() || 'multi_risk' }),
      };
    }
    this.pmoShapes.set([...this.pmoShapes(), s]); this.renderPmoShapes();
  }
  private renderPmoShapes(): void {
    if (!this.drawnGroup || typeof L === 'undefined') return;
    this.drawnGroup.clearLayers();
    for (const s of this.pmoShapes()) {
      const col = alertColor(s.level);
      const style = shapeLeafletStyle(s.level, { pane: 'ewshapes', kind: s.kind });
      const lyr = leafletLayerFromDelineation(L, s, style);
      if (!lyr) continue;
      lyr._shapeId = s.id;
      this.drawnGroup.addLayer(lyr);
      forceLayerStyle(lyr, style);
      try {
        const c = lyr.getBounds ? lyr.getBounds().getCenter() : null;
        if (c) {
          this.drawnGroup.addLayer(L.marker([c.lat, c.lng], {
            icon: L.divIcon({
              className: 'pmo-haz',
              html: `<div style="width:28px;height:28px;border-radius:50%;border:3px solid ${col};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)"><i class="fas fa-triangle-exclamation" style="color:${col};font-size:13px"></i></div>`,
              iconSize: [28, 28], iconAnchor: [14, 14],
            }),
            interactive: false,
          }));
        }
      } catch { /* ignore */ }
    }
  }

  private initMap(): void {
    if (typeof L === 'undefined') return;
    this.map = L.map('dmdmap', { minZoom: 5, maxZoom: 18 }).setView([-6.4, 35.0], 6);
    this.map.setMaxBounds([[-12.5, 28.0], [1.0, 41.5]]);

    // Basemap panes under district fills (View · Map / Satellite / Labels)
    const ensurePane = (name: string, z: number) => {
      if (!this.map.getPane(name)) this.map.createPane(name);
      this.map.getPane(name).style.zIndex = String(z);
      this.map.getPane(name).style.pointerEvents = 'none';
    };
    ensurePane('dmisBasemapPane', 200);
    ensurePane('dmisLabelsPane', 250);

    // Map tiles (Carto light) — human-chosen basemap; local TZ vectors on tile failure
    this.mapTileFailed = false;
    this.baseTileMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
      pane: 'dmisBasemapPane',
    });
    this.baseTileMap.on('tileerror', () => {
      if (this.mapTileFailed) return;
      this.mapTileFailed = true;
      this.basemapNote.set('Map tiles unavailable — local Tanzania vector basemap active.');
      if (this.basemap() === 'map') this.applyBasemap();
    });

    // Satellite — Esri World Imagery (open basemap tiles; third-party ToS; not DMIS AI)
    this.baseTileSat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles © Esri — World Imagery (third-party ToS; human review only)',
        maxZoom: 19,
        pane: 'dmisBasemapPane',
      },
    );
    let satErrNotified = false;
    this.baseTileSat.on('tileerror', () => {
      if (satErrNotified) return;
      satErrNotified = true;
      this.basemapNote.set('Satellite tiles unavailable (network/firewall). Switch to Map basemap.');
      this.pushMsg.set({ msg: this.basemapNote(), err: true });
    });

    // Hybrid labels over imagery (international readability practice)
    this.baseLabels = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
      {
        attribution: '© OpenStreetMap © CARTO labels',
        subdomains: 'abcd',
        maxZoom: 19,
        pane: 'dmisLabelsPane',
        opacity: 0.92,
      },
    );

    // Default Map basemap — exclusive apply (no double-stack with addDmisBaseLayer)
    this.applyBasemap();
    this.syncCatalogBasemap();

    this.map.createPane('overlayicons'); this.map.getPane('overlayicons').style.zIndex = 650;
    this.map.createPane('ewshapes'); this.map.getPane('ewshapes').style.zIndex = 550;  // PMO shapes above district fills
    this.overlayLayer = L.layerGroup().addTo(this.map);
    this.drawnGroup = L.featureGroup().addTo(this.map);
    this.initDraw();
    this.http.get<any>('/geojson/tz_districts_gadm.geojson').subscribe(gj => {
      this.districtLayer = L.geoJSON(gj, {
        style: (f: any) => this.styleDistrict(f.properties.display_name),
        onEachFeature: (f: any, lyr: any) => {
          const nm = f.properties.display_name;
          lyr.on('click', () => this.paintDistrict(nm));   // PMO impact analysis: click a district to set/reduce its level
          lyr.bindTooltip(() => {
            const dayOv = this.overridesFor(this.activeDay());
            const eff = this.effectiveLevelNow(nm);
            const ov = dayOv[nm] !== undefined;
            const src = this.curDay()?.tier_sources?.[nm];
            const sup = this.supportByName()[nm];
            let html = `<b>${escapeHtml(nm)}</b><br>${escapeHtml(eff && eff !== 'NONE' ? this.label(eff) : 'No alert')}`
              + (ov ? ' <small>(PMO paint · Day ' + this.activeDay() + ')</small>'
                : (src ? `<br><small>${escapeHtml(this.srcLabel(src))}</small>` : ''));
            if (sup) {
              html += `<br><small>Support suggest: ${escapeHtml(this.label(sup.suggestedLevel))} · score ${escapeHtml(String(sup.supportScore ?? '—'))}</small>`;
              html += `<br><small>INFORM H ${escapeHtml(String(sup.informHazard ?? '—'))} · V ${escapeHtml(String(sup.informVulnerability ?? '—'))} · C ${escapeHtml(String(sup.informCoping ?? '—'))} · risk ${escapeHtml(String(sup.informRisk ?? '—'))}</small>`;
              if (sup.hazardFocus) {
                html += `<br><small>Focus ${escapeHtml(String(sup.hazardFocus))}: struct ${escapeHtml(String(sup.focusedStructuralHazard ?? '—'))} · EO ${escapeHtml(String(sup.focusedEoSignal ?? '—'))}</small>`;
              }
              const why = (sup.reasons || []).slice(0, 2).map((x: string) => escapeHtml(x)).join('; ');
              if (why) { html += `<br><small>${why}</small>`; }
            }
            return html;
          }, { sticky: true });
        },
      }).addTo(this.map);
      try { this.map.fitBounds(this.districtLayer.getBounds(), { padding: [8, 8] }); } catch {}
      this.renderOverlays();
      this.layerReady.set(true);   // per-district coordinate resolution (area_points/centroid) is now possible
      // Once district geometry is ready, estimate routes to registered evacuation centres
      if (this.showEvacOnMap()) {
        setTimeout(() => this.loadEvacRoutes(false), 50);
      }
      // Layout is map-first / tall — force Leaflet to remeasure after DOM settles
      setTimeout(() => { try { this.map?.invalidateSize(); } catch {} }, 200);
    });
  }
  private styleDistrict(name: string): any {
    const dayOv = this.overridesFor(this.activeDay());
    const overridden = dayOv[name] !== undefined;
    const mode = this.mapMode();
    const sup = this.supportByName()[name];

    // INFORM dimension / focus-hazard choropleths (support only — do not change painted levels)
    if (mode === 'inform' || mode === 'inform-v') {
      return this.choroplethStyle(sup?.informVulnerability, overridden, 'v');
    }
    if (mode === 'inform-h') {
      return this.choroplethStyle(sup?.informHazard, overridden, 'h');
    }
    if (mode === 'inform-c') {
      return this.choroplethStyle(sup?.informCoping, overridden, 'c');
    }
    if (mode === 'inform-risk') {
      return this.choroplethStyle(sup?.informRisk, overridden, 'risk');
    }
    if (mode === 'focus-hazard') {
      // Prefer EO signal, fall back to structural focused hazard component
      const v = sup?.focusedEoSignal ?? sup?.focusedStructuralHazard;
      return this.choroplethStyle(v, overridden, 'focus');
    }

    // Support-suggested red/orange/yellow (preview); PMO paint still wins if set
    if (mode === 'support') {
      const sug = overridden ? dayOv[name] : (sup?.suggestedLevel || this.effectiveLevelNow(name));
      const active = !!sug && sug !== 'NONE';
      return {
        fillColor: alertColor(sug), fillOpacity: this.eoAwareFill(0.8, 0.18, active),
        color: overridden ? '#4527a0' : (sup && sup.suggestedLevel !== sup.entityLevel ? '#0d6efd' : '#5a6b7b'),
        weight: overridden ? 1.4 : (sup && sup.suggestedLevel !== sup.entityLevel ? 1.2 : 0.45),
        opacity: 1, dashArray: (!overridden && sup && sup.suggestedLevel !== sup.entityLevel) ? '4 3' : undefined,
      };
    }

    // Default: entity consolidation + PMO effective paint for THIS day only
    const lvl = this.effectiveLevelNow(name);
    const active = !!lvl && lvl !== 'NONE';
    return {
      fillColor: alertColor(lvl), fillOpacity: this.eoAwareFill(0.8, 0.22, active),
      color: overridden ? '#4527a0' : '#5a6b7b', weight: overridden ? 1.4 : 0.45, opacity: 1,
    };
  }

  private choroplethStyle(v: number | null | undefined, overridden: boolean, kind: string): any {
    const fill = this.informColor(v, kind);
    return {
      fillColor: fill, fillOpacity: this.eoAwareFill(0.75, 0.12, v != null),
      color: overridden ? '#4527a0' : '#5a6b7b', weight: overridden ? 1.4 : 0.45, opacity: 1,
    };
  }

  /** 0–10 choropleth; tint by dimension kind so H/V/C/focus are visually distinct. */
  private informColor(v: number | null | undefined, kind: string = 'v'): string {
    if (v == null || Number.isNaN(Number(v))) return '#e2e8f0';
    const x = Math.max(0, Math.min(10, Number(v))) / 10;
    if (kind === 'h') {
      // amber → deep orange
      return `rgb(${Math.round(255 - x * 40)},${Math.round(220 - x * 140)},${Math.round(100 - x * 60)})`;
    }
    if (kind === 'c') {
      // purple scale
      return `rgb(${Math.round(240 - x * 80)},${Math.round(230 - x * 150)},${Math.round(255 - x * 40)})`;
    }
    if (kind === 'risk' || kind === 'focus') {
      // rose / blue depending
      if (kind === 'focus') {
        return `rgb(${Math.round(220 - x * 100)},${Math.round(240 - x * 80)},${Math.round(255 - x * 30)})`;
      }
      return `rgb(${Math.round(255 - x * 30)},${Math.round(200 - x * 150)},${Math.round(200 - x * 120)})`;
    }
    // vulnerability: teal
    const r = Math.round(240 - x * 180);
    const g = Math.round(253 - x * 80);
    const b = Math.round(250 - x * 40);
    return `rgb(${r},${g},${b})`;
  }
  restyle(): void {
    if (this.districtLayer) this.districtLayer.eachLayer((l: any) => l.setStyle(this.styleDistrict(l.feature.properties.display_name)));
    this.renderOverlays();
  }

  /** Place the non-hydromet hazards (GST/MoH/MoA/NEMC) as exact hazard-icon markers ringed by their
   * alert colour — so PMO sees everything overlaid without conflating them with the rain/flood tiers. */
  private renderOverlays(): void {
    if (!this.overlayLayer || !this.districtLayer || typeof L === 'undefined') return;
    this.overlayLayer.clearLayers();
    const centre = (district: string): any => {
      let ly: any = null;
      this.districtLayer.eachLayer((l: any) => { if (l.feature.properties.display_name === district) ly = l; });
      return ly ? ly.getBounds().getCenter() : null;
    };
    for (const ov of this.curDay()?.overlays ?? []) {
      const target = (ov.districts ?? []).find(d => centre(d)) ?? (ov.districts ?? [])[0];
      const c = target ? centre(target) : null;
      if (!c) continue;
      const icon = L.divIcon({
        className: 'dmd-ov',
        html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${alertColor(ov.alert_level)};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">
                 <img src="${HAZ_ICON(ICON_BY_TYPE[ov.type] || 'heavy_rain.png')}" style="width:20px;height:20px"></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
	      });
	      L.marker([c.lat, c.lng], { icon, pane: 'overlayicons' })
	        .bindTooltip(
	          `<b>${escapeHtml(this.agName(ov.agency))} · ${escapeHtml(ov.type)}</b><br>`
	            + `${escapeHtml(this.label(ov.alert_level))}<br><small>${escapeHtml(this.join(ov.areas))}</small>`,
	          { sticky: true },
	        )
	        .addTo(this.overlayLayer);
    }
    // Hydromet (TMA rainfall / MoW floods) live in the tier choropleth, not the overlays — give them a hazard
    // icon too (one per distinct hydromet hazard type) so PMO sees the rain/flood symbol like every other agency.
    const day = this.curDay();
    const tierSources: Record<string, string> = day?.tier_sources ?? {};
    const tiers = day?.tiers;
    const levelOf = (d: string): string =>
      tiers?.major_warning?.includes(d) ? 'MAJOR_WARNING' : tiers?.warning?.includes(d) ? 'WARNING' : 'ADVISORY';
    const hydro: Record<string, string[]> = {};   // "AGENCY:TYPE" -> districts
    for (const [district, src] of Object.entries(tierSources)) {
      const [ag, type] = String(src).split(':');
      if (!type || !['TMA', 'MOW'].includes((ag || '').toUpperCase())) { continue; }
      (hydro[`${ag}:${type}`] ??= []).push(district);
    }
    for (const [key, districts] of Object.entries(hydro)) {
      const [ag, type] = key.split(':');
      const target = districts.find(d => centre(d)) ?? districts[0];
      const c = target ? centre(target) : null;
      if (!c) { continue; }
      const lvl = levelOf(target);
      const icon = L.divIcon({
        className: 'dmd-ov',
        html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${alertColor(lvl)};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">
                 <img src="${HAZ_ICON(ICON_BY_TYPE[type] || 'heavy_rain.png')}" style="width:20px;height:20px"></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
	      });
	      L.marker([c.lat, c.lng], { icon, pane: 'overlayicons' })
	        .bindTooltip(
	          `<b>${escapeHtml(this.agName(ag.toLowerCase()))} · ${escapeHtml(type)}</b><br>`
	            + `${escapeHtml(this.label(lvl))}<br><small>${escapeHtml(this.join(districts))}</small>`,
	          { sticky: true },
	        )
	        .addTo(this.overlayLayer);
    }
  }
  srcLabel(src: string): string {
    const [ag, type] = src.split(':');
    return `Driver: ${this.agName(ag.toLowerCase())}${type ? ' · ' + type : ''}`;
  }

  label(lvl?: string) { return (lvl ?? '').replace('_', ' '); }
  join(arr: string[]) { return (arr ?? []).slice(0, 6).join(', ') + ((arr?.length ?? 0) > 6 ? ` +${arr.length - 6}` : ''); }
  agName(k: string) { return (AGENCIES as any)[k]?.name ?? k.toUpperCase(); }
  agColor(k: string) { return (AGENCIES as any)[k]?.color ?? '#888'; }
  agIcon(k: string) { return (AGENCIES as any)[k]?.icon ?? 'fa-circle'; }
}
