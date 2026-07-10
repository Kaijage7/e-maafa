import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DecimalPipe, NgClass } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EwAgencyService, Consolidated } from './ew-agency.service';
import { EwCrossAgencyPanelComponent } from './ew-cross-agency-panel.component';
import { EwPreviewModalComponent } from './ew-preview-modal.component';
import { ALERT_LEVELS, alertColor, AGENCIES, AGENCY_HAZARDS, HAZ_ICON } from './ew-agency.model';
import { escapeHtml } from '../../../core/html';
import { addDmisBaseLayer } from '../../../core/tz-map';

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
    .day-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
    .day-tabs button { flex: 1; font-size: 0.78rem; font-weight: 600; color: #607089; border: 1px solid #e3e6ed; background: #f8fafc; padding: 7px; border-radius: 8px; cursor: pointer; font-family: inherit; }
    .day-tabs button.on { background: #4527a0; color: #fff; border-color: #4527a0; }
    #dmdmap { height: min(68vh, 640px); min-height: 420px; border-radius: 10px; border: 1px solid #e3e6ed; }
    .legend { display: flex; gap: 10px; margin-top: 6px; font-size: 0.75rem; color: #475569; flex-wrap: wrap; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 3px; vertical-align: -2px; }
    .tier-counts { display: flex; gap: 6px; margin-bottom: 8px; }
    .tc { flex: 1; text-align: center; border-radius: 8px; padding: 6px 4px; color: #1a1a1a; }
    .tc b { display: block; font-size: 1.25rem; } .tc span { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; }
    .tool-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 0.74rem; color: #475569; flex-wrap: wrap; }
    .chip-btn { border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid #cbd5e1; background: #fff; color: #334155; }
    .chip-btn.on { color: #fff; }
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
    <div class="wrap">
      <a routerLink="/m/preparedness/early-warnings" style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;color:#64748b;text-decoration:none;margin-bottom:10px"><i class="fas fa-arrow-left"></i> Early Warning Systems</a>
      <div class="hd">
        <div class="ic"><i class="fas fa-layer-group"></i></div>
        <div><h1>PMO-DMD — Consolidated Impact Overlay</h1>
          <div class="sub">Entity consolidation unchanged (highest-alert-wins). Decision-support layers help PMO paint red / orange / yellow more realistically using INFORM + ops context.</div></div>
        <div class="src">
          <div>Contributing entities</div>
          @for (s of sources(); track s) { <span class="chip" [style.background]="agColor(s)">{{ agName(s) }}</span> }
          @if (!sources().length) { <span style="color:#94a3b8">None yet — awaiting entity submissions</span> }
          <div style="margin-top:9px">
            <button class="pushbtn" [disabled]="pushing() || !layerReady()" (click)="generateImpact()">
              <i class="fas" [ngClass]="(pushing() || !layerReady()) ? 'fa-circle-notch fa-spin' : 'fa-file-export'"></i>
              {{ pushing() ? 'Working…' : (layerReady() ? 'Generate Impact Bulletin' : 'Preparing map…') }}
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
          <i class="fas fa-triangle-exclamation"></i> Could not load the consolidated picture. Check your connection or sign-in and retry.
          <button (click)="reload()" style="margin-left:10px; border:none; background:#b91c1c; color:#fff; border-radius:6px; padding:4px 12px; cursor:pointer; font-family:inherit">Retry</button>
        </div>
      } @else if (loading()) {
        <div style="padding:12px 14px; background:#f1f5f9; color:#475569; border-radius:10px; font-size:0.84rem; margin-bottom:12px">
          <i class="fas fa-circle-notch fa-spin"></i> Loading the consolidated picture…
        </div>
      }

      <div class="main-grid">
        <!-- MAP (primary) -->
        <div class="panel map-panel">
          <div class="day-tabs">
            @for (d of data()?.days ?? []; track d.day) {
              <button [class.on]="activeDay() === d.day" (click)="setActiveDay(d.day)">Day {{ d.day }}</button>
            }
          </div>
          @if (curDay()) {
            <div class="tier-counts">
              <div class="tc" style="background:#FF0000"><b>{{ curEffTiers().major_warning.length }}</b><span>Major</span></div>
              <div class="tc" style="background:#FFA500"><b>{{ curEffTiers().warning.length }}</b><span>Warning</span></div>
              <div class="tc" style="background:#FFFF00"><b>{{ curEffTiers().advisory.length }}</b><span>Advisory</span></div>
            </div>
          }
          <div class="tool-row">
            <i class="fas fa-fill-drip" style="color:#4527a0"></i> <b>Paint</b>
            @for (lv of levels; track lv.key) {
              <button type="button" class="chip-btn" [class.on]="drawLevel()===lv.key" (click)="drawLevel.set(lv.key)"
                [style.background]="drawLevel()===lv.key ? lv.color : '#fff'"
                [style.borderColor]="lv.color" [style.color]="drawLevel()===lv.key ? '#1a1a1a' : '#334155'">{{ lv.label }}</button>
            }
            @if (pmoShapes().length) { <span style="color:#4527a0;font-weight:700">· {{ pmoShapes().length }} drawn</span> }
          </div>
          <div class="tool-row">
            <i class="fas fa-layer-group" style="color:#0d6efd"></i> <b>View</b>
            <button type="button" class="chip-btn" [class.on]="mapMode()==='entity'" (click)="mapMode.set('entity'); restyle()"
              [style.background]="mapMode()==='entity' ? '#4527a0' : '#fff'" [style.color]="mapMode()==='entity' ? '#fff' : '#334155'" [style.borderColor]="'#c4b5fd'">Entity</button>
            <button type="button" class="chip-btn" [class.on]="mapMode()==='support'" (click)="mapMode.set('support'); restyle()"
              [style.background]="mapMode()==='support' ? '#0d6efd' : '#fff'" [style.color]="mapMode()==='support' ? '#fff' : '#334155'" [style.borderColor]="'#93c5fd'">Support</button>
            <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-h'" (click)="mapMode.set('inform-h'); restyle()"
              [style.background]="mapMode()==='inform-h' ? '#b45309' : '#fff'" [style.color]="mapMode()==='inform-h' ? '#fff' : '#334155'" [style.borderColor]="'#fcd34d'">H</button>
            <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-v'" (click)="mapMode.set('inform-v'); restyle()"
              [style.background]="mapMode()==='inform-v' ? '#0f766e' : '#fff'" [style.color]="mapMode()==='inform-v' ? '#fff' : '#334155'" [style.borderColor]="'#5eead4'">V</button>
            <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-c'" (click)="mapMode.set('inform-c'); restyle()"
              [style.background]="mapMode()==='inform-c' ? '#7c3aed' : '#fff'" [style.color]="mapMode()==='inform-c' ? '#fff' : '#334155'" [style.borderColor]="'#c4b5fd'">C</button>
            <button type="button" class="chip-btn" [class.on]="mapMode()==='inform-risk'" (click)="mapMode.set('inform-risk'); restyle()"
              [style.background]="mapMode()==='inform-risk' ? '#be123c' : '#fff'" [style.color]="mapMode()==='inform-risk' ? '#fff' : '#334155'" [style.borderColor]="'#fda4af'">Risk</button>
            <button type="button" class="chip-btn" [class.on]="mapMode()==='focus-hazard'" (click)="mapMode.set('focus-hazard'); restyle()"
              [style.background]="mapMode()==='focus-hazard' ? '#0369a1' : '#fff'" [style.color]="mapMode()==='focus-hazard' ? '#fff' : '#334155'" [style.borderColor]="'#7dd3fc'">Focus</button>
            <button type="button" class="pushbtn" style="padding:4px 10px;font-size:0.72rem;background:#0d6efd"
              [disabled]="!supportRows().length" (click)="applyAllSuggestions()">Apply all suggestions</button>
          </div>
          <div class="tool-row">
            <i class="fas fa-crosshairs" style="color:#0369a1"></i> <b>Hazard focus</b>
            @for (opt of hazardFocusOptions(); track opt.key) {
              <button type="button" class="chip-btn" [class.on]="hazardFocus()===opt.key" (click)="setHazardFocus(opt.key)"
                [title]="opt.hint || opt.label"
                [style.background]="hazardFocus()===opt.key ? '#0369a1' : '#fff'" [style.color]="hazardFocus()===opt.key ? '#fff' : '#334155'" [style.borderColor]="'#7dd3fc'">{{ opt.label }}</button>
            }
            @if (hazardFocusResolved()) { <span style="font-weight:700;color:#0369a1">· {{ hazardFocusResolved() }}</span> }
          </div>
          <div id="dmdmap"></div>
          <div class="legend">
            <span style="font-weight:700;color:#1f2d3d">Impact:</span>
            @for (lv of levels; track lv.key) { <span><span class="sw" [style.background]="lv.color"></span>{{ lv.label }}</span> }
            <span><span class="sw" style="background:#F5F5F5"></span>None</span>
            <span style="font-weight:700;margin-left:4px">· Purple border = PMO paint · Icons = other hazards</span>
          </div>
        </div>

        <!-- SLIM RIGHT RAIL — tools in dropdowns -->
        <div class="side-rail">
          <div class="panel" style="padding:8px 10px">
            <div style="font-weight:800;font-size:0.82rem;color:#4527a0;margin-bottom:6px">
              <i class="fas fa-compass-drafting"></i> Impact tools · Day {{ activeDay() }}
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
                  @if (sel.suggestedDirectives?.length) {
                    <button type="button" class="mini-btn" style="margin-top:6px;border:1px solid #c4b5fd;background:#ede7f6;color:#4527a0"
                      (click)="applyDirectives(sel)">Insert model directives</button>
                  }
                } @else {
                  <span style="color:#94a3b8">Select a district in the table.</span>
                }
              </div>
            </details>

            <details class="acc" style="margin-bottom:6px">
              <summary>Design &amp; exposure notes</summary>
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

            <div class="evac-panel">
              <h4><i class="fas fa-house-user"></i> Evacuation centres · routes</h4>
              <p style="margin:0 0 6px;font-size:0.68rem;color:#047857;line-height:1.35">
                From the warned-area centroid (or selected district) to registered centres.
                Straight-line km — use road directions for navigation.
              </p>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
                <button type="button" class="mini-btn" style="border:1px solid #6ee7b7;background:#059669;color:#fff"
                  [disabled]="evacLoading()" (click)="loadEvacRoutes()">
                  <i class="fas" [class.fa-route]="!evacLoading()" [class.fa-circle-notch]="evacLoading()" [class.fa-spin]="evacLoading()"></i>
                  {{ evacLoading() ? '…' : 'Estimate routes' }}
                </button>
                <label style="font-size:0.68rem;font-weight:700;color:#065f46;display:flex;align-items:center;gap:4px;cursor:pointer">
                  <input type="checkbox" [checked]="showEvacOnMap()" (change)="toggleEvacOnMap($any($event.target).checked)"> Map
                </label>
                <a routerLink="/m/preparedness/evacuation-centers" style="font-size:0.68rem;font-weight:700;color:#047857;margin-left:auto">Registry →</a>
              </div>
              @if (evacOrigin(); as o) {
                <div style="font-size:0.65rem;color:#64748b;margin-bottom:4px">
                  Origin: {{ o.label }} ({{ o.lat | number:'1.2-2' }}, {{ o.lng | number:'1.2-2' }})
                </div>
              }
              @if (evacError()) { <div style="color:#b91c1c;font-size:0.7rem">{{ evacError() }}</div> }
              @for (c of evacCenters(); track c.id; let i = $index) {
                <div class="evac-row">
                  <div><b>{{ i + 1 }}. {{ c.centreName }}</b>
                    <span style="color:#64748b"> · {{ c.distanceKm }} km · ~{{ c.driveMinutesEstimate }} min</span>
                  </div>
                  <div style="color:#64748b">{{ c.district || '—' }} / {{ c.region || '—' }}
                    @if (c.capacityPeople) { · cap {{ c.capacityPeople }} }</div>
                  <div style="display:flex;gap:8px;margin-top:2px">
                    <a [href]="c.gmapsDirectionsUrl" target="_blank" rel="noopener"><i class="fas fa-directions"></i> Road</a>
                    <a [routerLink]="['/m/preparedness/evacuation-centers/create']" [queryParams]="{edit: c.id}"><i class="fas fa-house-user"></i> Centre</a>
                  </div>
                </div>
              }
              @if (!evacLoading() && !evacCenters().length && !evacError() && evacOrigin()) {
                <div style="font-size:0.7rem;color:#94a3b8">No active centres with coordinates. Register under Evacuation Centers.</div>
              }
              @if (!evacOrigin() && !evacLoading()) {
                <div style="font-size:0.7rem;color:#94a3b8">Paint or wait for entity tiers so a warned-area origin can be computed, then Estimate routes.</div>
              }
            </div>

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

      <!-- FULL WIDTH BELOW MAP: composition boxes -->
      <div class="compose-grid">
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <h3 style="margin:0"><i class="fas fa-clipboard-list"></i> PMO directives · Day {{ activeDay() }}</h3>
            <button type="button" class="clear-btn" (click)="clearDirectives()">Clear</button>
          </div>
          <p class="hint">Shown beside the map in the impact bulletin · SMS/ops ready after edit</p>
          <textarea rows="6" [value]="pmoDirectives()[activeDay()] || ''" (input)="setDirectives($any($event.target).value)"
            placeholder="Operational directives for this day (one per line)…"></textarea>
        </div>
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <h3 style="margin:0"><i class="fas fa-feather-pointed"></i> PMO impact narrative · Day {{ activeDay() }}</h3>
            <button type="button" class="clear-btn" (click)="clearNarrative()">Clear</button>
          </div>
          <p class="hint">Appears as the DMD comment in the multirisk impact bulletin PDF</p>
          <textarea rows="6" [value]="pmoNarratives()[activeDay()] || ''" (input)="setNarrative($any($event.target).value)"
            placeholder="Impact assessment narrative for this day…"></textarea>
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

  data = signal<Consolidated | null>(null);
  sources = signal<string[]>([]);
  activeDay = signal(1);
  loading = signal(true);
  loadError = signal(false);
  pushing = signal(false);
  pushMsg = signal<{ msg: string; err: boolean } | null>(null);
  drawLevel = signal('WARNING');                 // active level/colour for PMO delineations
  pmoShapes = signal<any[]>([]);                  // PMO impact delineations [{id, kind, geojson, radius?, level}]
  pmoOverrides = signal<Record<string, string>>({}); // PMO impact analysis: district -> level ('NONE' = reduced to no-alert), overrides the consolidated tier
  pmoNarratives = signal<Record<number, string>>({}); // PMO impact narrative per day → the DMD comment (impact bullets) in the bulletin
  pmoDirectives = signal<Record<number, string>>({}); // PMO directives & instructions per day → rendered BESIDE the big map (engine recommendations slot)
  layerReady = signal(false);                     // the GADM district layer has loaded (per-district coords need it)
  /**
   * entity = hydromet fill; support = suggested paint;
   * inform-h/v/c/risk = INFORM dimensions; focus-hazard = selected natural hazard lens.
   */
  mapMode = signal<'entity' | 'support' | 'inform' | 'inform-h' | 'inform-v' | 'inform-c' | 'inform-risk' | 'focus-hazard'>('entity');
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
  evacLoading = signal(false);
  evacError = signal('');
  evacOrigin = signal<{ lat: number; lng: number; label: string } | null>(null);
  showEvacOnMap = signal(true);
  private evacLayerGroup: any = null;

  ngOnInit(): void {
    this.reload();
    this.loadActionGuideMeta();
    setTimeout(() => this.initMap(), 0);
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

  loadEvacRoutes(): void {
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
    this.evacLoading.set(true);
    this.http.get<any>('/api/v1/evacuation-centers/nearest', {
      params: { lat: String(origin.lat), lng: String(origin.lng), limit: '8' },
    }).subscribe({
      next: r => {
        this.evacCenters.set(r.centers ?? []);
        this.evacLoading.set(false);
        if (this.showEvacOnMap()) { this.drawEvacOnMap(); }
      },
      error: () => {
        this.evacCenters.set([]);
        this.evacLoading.set(false);
        this.evacError.set('Could not load nearest centres.');
        this.clearEvacLayers();
      },
    });
  }

  toggleEvacOnMap(on: boolean): void {
    this.showEvacOnMap.set(on);
    if (on) {
      if (this.evacCenters().length) { this.drawEvacOnMap(); }
      else { this.loadEvacRoutes(); }
    } else {
      this.clearEvacLayers();
    }
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
    const origin = this.evacOrigin();
    const centers = this.evacCenters();
    if (!origin || !centers.length) { return; }
    const g = L.layerGroup();
    const originMk = L.circleMarker([origin.lat, origin.lng], {
      radius: 9, fillColor: '#4527a0', color: '#fff', weight: 2, fillOpacity: 1,
    }).bindPopup(`<b>EW origin</b><br>${escapeHtml(origin.label)}`);
    g.addLayer(originMk);
    const colors = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
    centers.forEach((c: any, i: number) => {
      if (c.latitude == null || c.longitude == null) { return; }
      const line = L.polyline(
        [[origin.lat, origin.lng], [c.latitude, c.longitude]],
        { color: colors[i % colors.length], weight: i === 0 ? 4 : 2.5, opacity: 0.85, dashArray: i === 0 ? undefined : '7 5' },
      ).bindPopup(
        `<b>${escapeHtml(c.centreName)}</b><br>${c.distanceKm} km · ~${c.driveMinutesEstimate} min`
        + `<br><a href="${c.gmapsDirectionsUrl}" target="_blank" rel="noopener">Road directions</a>`,
      );
      const dest = L.circleMarker([c.latitude, c.longitude], {
        radius: i === 0 ? 9 : 7, fillColor: '#059669', color: '#fff', weight: 2, fillOpacity: 0.95,
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
    this.activeDay.set(day);
    this.loadSupport();
    this.restyle();
    if (this.showEvacOnMap() || this.evacCenters().length) {
      this.loadEvacRoutes();
    }
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
    const ov = this.pmoOverrides();
    // PMO paint first
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
   * Apply a (possibly edited) proposal into directive and/or narrative boxes only.
   * Replaces prior content for that target (no duplicate stacking). Does not generate PDF or send.
   */
  applyProposal(p: any, target: 'directives' | 'narrative' | 'both'): void {
    const text = (p?.text || '').trim();
    if (!text) return;
    if (target === 'directives' || target === 'both') {
      this.setDirectives(text);
    }
    if (target === 'narrative' || target === 'both') {
      // Prefer true narrative proposal for narrative box; public_sms is ok as short headline
      this.setNarrative(text);
    }
    this.pushMsg.set({
      msg: `Set ${target === 'both' ? 'directives and narrative' : target} from “${p.title}” (replaced previous). Edit freely, then Generate Impact Bulletin.`,
      err: false,
    });
  }

  clearDirectives(): void {
    this.setDirectives('');
    this.pushMsg.set({ msg: 'Directives cleared for Day ' + this.activeDay() + '.', err: false });
  }

  clearNarrative(): void {
    this.setNarrative('');
    this.pushMsg.set({ msg: 'Narrative cleared for Day ' + this.activeDay() + '.', err: false });
  }

  /** One-click: copy support suggestions into PMO paint (still editable by click). */
  applyAllSuggestions(): void {
    const next = { ...this.pmoOverrides() };
    for (const r of this.supportRows()) {
      if (r.suggestedLevel && r.suggestedLevel !== 'NONE') {
        next[r.district] = r.suggestedLevel;
      }
    }
    this.pmoOverrides.set(next);
    this.mapMode.set('entity');
    this.restyle();
    this.pushMsg.set({ msg: 'Suggested colours applied as PMO paint — review and adjust by clicking districts. Generate/push flow unchanged.', err: false });
  }

  applyOneSuggestion(r: any): void {
    if (!r?.district || !r.suggestedLevel || r.suggestedLevel === 'NONE') return;
    this.pmoOverrides.set({ ...this.pmoOverrides(), [r.district]: r.suggestedLevel });
    this.restyle();
  }
  ngOnDestroy(): void {
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
    this.pushing.set(true);
    this.pushMsg.set({ msg: 'Generating the PMO-DMD multirisk impact bulletin…', err: false });
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

  /** Transform the consolidated overlay into the engine's Multirisk shape (exactly 3 days) — which is
   * ALSO what the DMD ingest (parseDmd) consumes: district_summaries[] per tier + days[].comments. */
  private buildMultirisk(cons: Consolidated): any {
    const issue = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const byDay = new Map<number, any>();
    for (const d of (cons.days ?? [])) { byDay.set(d.day, d); }
    const comments = cons.comments ?? {};
    const entriesFor = (agency: string, dayNo: number) =>
      (comments[agency] ?? []).filter((e: any) => e.day === dayNo)
        .map((e: any) => ({ alert_level: e.alert_level || 'ADVISORY', description: e.description || '', likelihood: e.likelihood || 'MEDIUM' }));

    const days: any[] = [];
    const districtSummaries: any[] = [];
    for (let n = 1; n <= 3; n++) {
      const cd = byDay.get(n);
      const tiers = this.effectiveTiers(cd?.tiers ?? { major_warning: [], warning: [], advisory: [] });
      const date = iso(new Date(issue.getTime() + (n - 1) * 86400000));
      const cmt: any = {};
      const tmaE = entriesFor('tma', n); if (tmaE.length) { cmt.tma = { entries: tmaE }; }
      const mowE = entriesFor('mow', n); if (mowE.length) { cmt.mow = { entries: mowE }; }
      const pmoN = (this.pmoNarratives()[n] ?? '').trim();
      if (pmoN) { cmt.dmd = { bullets: pmoN.split('\n').map(s => s.trim()).filter(Boolean) }; }
      const day: any = {
        date, day_number: n,
        alert_tiers: {
          major_warning: { text: `${tiers.major_warning.length} district(s) at major warning.` },
          warning: { text: `${tiers.warning.length} district(s) at warning.` },
          advisory: { text: `${tiers.advisory.length} district(s) at advisory.` },
        },
        comments: cmt,
      };
      // PMO directives & instructions → engine "recommendations" slot, rendered BESIDE the big summary map
      const pmoD = (this.pmoDirectives()[n] ?? '').trim();
      if (pmoD) {
        day.recommendation_intro = 'PMO Directives and Instructions';
        day.recommendations = pmoD.split('\n').map(s => s.trim()).filter(Boolean);
      }
      days.push(day);
      districtSummaries.push({ day_number: n, major_warning: tiers.major_warning ?? [], warning: tiers.warning ?? [], advisory: tiers.advisory ?? [] });
    }
    const num = `${String(issue.getFullYear()).slice(2)}${(issue.getMonth() + 1).toString().padStart(2, '0')}${issue.getDate().toString().padStart(2, '0')}`;
    return {
      bulletin_number: num, issue_date: iso(issue), issue_time: issue.toTimeString().slice(0, 5),
      drawn_shapes: this.pmoShapes().filter(s => s.level !== 'NONE').map(s => s.geojson),
      language: 'en', header_variant: 'new', days, district_summaries: districtSummaries,
    };
  }
  private topSeverity(cons: Consolidated): string {
    let best = 'ADVISORY';
    for (const d of (cons.days ?? [])) {
      const et = this.effectiveTiers(d.tiers ?? { major_warning: [], warning: [], advisory: [] });
      if (et.major_warning.length) { return 'MAJOR_WARNING'; }
      if (et.warning.length) { best = 'WARNING'; }
    }
    return best;
  }
  private allTierDistricts(cons: Consolidated): string[] {
    const s = new Set<string>();
    for (const d of (cons.days ?? [])) { const et = this.effectiveTiers(d.tiers ?? { major_warning: [], warning: [], advisory: [] }); for (const t of [et.major_warning, et.warning, et.advisory]) { for (const x of (t ?? [])) { s.add(x); } } }
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

  /** One point per selected district at its HIGHEST level across the 3 days — drives the per-district blinking
   *  markers on the public map. Districts whose name doesn't match the GADM layer are skipped (graceful). */
  private areaPoints(cons: Consolidated): Array<{ name: string; lat: number; lng: number; level: string }> {
    const rank = (l: string) => ['ADVISORY', 'WARNING', 'MAJOR_WARNING'].indexOf(l);
    const top = new Map<string, string>();
    for (const d of (cons.days ?? [])) {
      const et = this.effectiveTiers(d.tiers ?? { major_warning: [], warning: [], advisory: [] });
      const tiers: Array<[string[], string]> = [[et.major_warning, 'MAJOR_WARNING'], [et.warning, 'WARNING'], [et.advisory, 'ADVISORY']];
      for (const [arr, lvl] of tiers) { for (const name of (arr ?? [])) { if (!top.has(name) || rank(lvl) > rank(top.get(name)!)) { top.set(name, lvl); } } }
    }
    const out: Array<{ name: string; lat: number; lng: number; level: string }> = [];
    for (const [name, level] of top) { const c = this.districtCentre(name); if (c) { out.push({ name, lat: c.lat, lng: c.lng, level }); } }
    return out;
  }

  /** Average centre of the affected districts — the bulletin's single map-pin coordinate. */
  private centroidOf(pts: Array<{ lat: number; lng: number }>): { lat: number; lng: number } | null {
    if (!pts.length) { return null; }
    return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
  }
  private ingestErr(e: any): string { return e?.error?.message || e?.message || 'the impact bulletin could not be ingested.'; }

  curDay() { return this.data()?.days?.find(d => d.day === this.activeDay()); }
  dayComments(): any[] {
    const c = this.data()?.comments ?? {};
    const out: any[] = [];
    for (const agency of Object.keys(c)) {
      for (const e of c[agency]) if (e.day === this.activeDay()) out.push({ ...e, agency });
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
    const ov = this.pmoOverrides()[name];
    return ov !== undefined ? ov : this.districtTier()[name];
  }

  /** Apply the PMO impact overrides to a day's consolidated tiers → the effective tier lists. An override of
   *  'NONE' reduces a district out; PMO may also paint a district that had no consolidated alert (impact adds it). */
  private effectiveTiers(t: { major_warning: string[]; warning: string[]; advisory: string[] }):
      { major_warning: string[]; warning: string[]; advisory: string[] } {
    const ov = this.pmoOverrides();
    const out: { major_warning: string[]; warning: string[]; advisory: string[] } = { major_warning: [], warning: [], advisory: [] };
    const key = (l?: string): 'major_warning' | 'warning' | 'advisory' | null =>
      l === 'MAJOR_WARNING' ? 'major_warning' : l === 'WARNING' ? 'warning' : l === 'ADVISORY' ? 'advisory' : null;
    const place = (name: string, lvl?: string) => { const k = key(lvl); if (k && !out[k].includes(name)) { out[k].push(name); } };
    const seen = new Set<string>();
    for (const [arr, lvl] of [[t.major_warning, 'MAJOR_WARNING'], [t.warning, 'WARNING'], [t.advisory, 'ADVISORY']] as Array<[string[], string]>) {
      for (const name of (arr ?? [])) { seen.add(name); place(name, ov[name] !== undefined ? ov[name] : lvl); }
    }
    for (const [name, lvl] of Object.entries(ov)) { if (!seen.has(name)) { place(name, lvl); } }
    return out;
  }

  /** Effective tiers for the current day — drives the tier counts (template). */
  curEffTiers(): { major_warning: string[]; warning: string[]; advisory: string[] } {
    return this.effectiveTiers(this.curDay()?.tiers ?? { major_warning: [], warning: [], advisory: [] });
  }

  /** PMO impact analysis: click a district to set its impact at the active level; click again at the same level
   *  to revert to the consolidated tier. The white "No alert" level reduces a district out of the impact. */
  private paintDistrict(name: string): void {
    this.selectedDistrict.set(name);
    const lvl = this.drawLevel();
    const cur = { ...this.pmoOverrides() };
    if (cur[name] === lvl) { delete cur[name]; } else { cur[name] = lvl; }
    this.pmoOverrides.set(cur);
    // Keep Action Guide colour selector in sync with the paint brush (no-harm level)
    if (lvl === 'MAJOR_WARNING' || lvl === 'WARNING' || lvl === 'ADVISORY') {
      this.stmtLevel.set(lvl);
    }
    this.restyle();
    // Refresh EC routes when operator focuses a district on the impact map
    if (this.showEvacOnMap() || this.evacCenters().length) {
      this.loadEvacRoutes();
    }
  }

  /** PMO delineation toolbar — draw impact zones coloured by the active level; carried into the impact PDF. */
  private initDraw(): void {
    if (!(L.Control && L.Control.Draw)) return;
    const ctl = new L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: this.drawnGroup, edit: false, remove: true },
      draw: { polygon: { shapeOptions: { color: '#374151' } }, polyline: { shapeOptions: { color: '#374151' } },
        rectangle: { shapeOptions: { color: '#374151' } }, circle: { shapeOptions: { color: '#374151' } }, marker: false, circlemarker: false },
    });
    this.map.addControl(ctl);
    this.map.on(L.Draw.Event.CREATED, (e: any) => this.onPmoDraw(e));
    this.map.on(L.Draw.Event.DELETED, (e: any) => {
      const ids = new Set<number>(); e.layers.eachLayer((l: any) => { if (l._shapeId) ids.add(l._shapeId); });
      if (ids.size) { this.pmoShapes.set(this.pmoShapes().filter(s => !ids.has(s.id))); this.renderPmoShapes(); }
    });
  }
  private onPmoDraw(e: any): void {
    const layer = e.layer, type = e.layerType, lvl = this.drawLevel();
    let s: any;
    if (type === 'circle') { const c = layer.getLatLng(); s = { id: ++this.shapeSeq, kind: 'circle', level: lvl, radius: Math.round(layer.getRadius()), geojson: { type: 'Feature', properties: { kind: 'circle', radius: Math.round(layer.getRadius()), level: lvl }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } } }; }
    else { const gj = layer.toGeoJSON(); gj.properties = { ...(gj.properties || {}), kind: type, level: lvl }; s = { id: ++this.shapeSeq, kind: type, level: lvl, geojson: gj }; }
    this.pmoShapes.set([...this.pmoShapes(), s]); this.renderPmoShapes();
  }
  private renderPmoShapes(): void {
    if (!this.drawnGroup || typeof L === 'undefined') return;
    this.drawnGroup.clearLayers();
    for (const s of this.pmoShapes()) {
      const col = alertColor(s.level); const style = { color: col, weight: 2, fillColor: col, fillOpacity: 0.45, pane: 'ewshapes' };
      const geom = s.geojson?.geometry; let lyr: any = null;
      if (s.kind === 'circle' && geom?.type === 'Point') { const [lng, lat] = geom.coordinates; lyr = L.circle([lat, lng], { radius: s.radius ?? 10000, ...style }); }
      else if (geom?.type === 'Polygon') { lyr = L.polygon(geom.coordinates.map((r: any[]) => r.map(([lng, lat]: number[]) => [lat, lng])), style); }
      else if (geom?.type === 'LineString') { lyr = L.polyline(geom.coordinates.map(([lng, lat]: number[]) => [lat, lng]), style); }
      if (!lyr) continue; lyr._shapeId = s.id; this.drawnGroup.addLayer(lyr);
      const c = lyr.getBounds ? lyr.getBounds().getCenter() : null;
      if (c) { this.drawnGroup.addLayer(L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'pmo-haz', html: `<div style="width:28px;height:28px;border-radius:50%;border:3px solid ${col};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)"><i class="fas fa-triangle-exclamation" style="color:${col};font-size:13px"></i></div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })); }
    }
  }

  private initMap(): void {
    if (typeof L === 'undefined') return;
    this.map = L.map('dmdmap', { minZoom: 5, maxZoom: 9 }).setView([-6.4, 35.0], 6);
    this.map.setMaxBounds([[-12.5, 28.0], [1.0, 41.5]]);
    addDmisBaseLayer(this.map, this.http, 'light');
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
	            const eff = this.effectiveLevelNow(nm);
	            const ov = this.pmoOverrides()[nm] !== undefined;
	            const src = this.curDay()?.tier_sources?.[nm];
	            const sup = this.supportByName()[nm];
	            let html = `<b>${escapeHtml(nm)}</b><br>${escapeHtml(eff && eff !== 'NONE' ? this.label(eff) : 'No alert')}`
	              + (ov ? ' <small>(PMO paint)</small>' : (src ? `<br><small>${escapeHtml(this.srcLabel(src))}</small>` : ''));
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
        setTimeout(() => this.loadEvacRoutes(), 50);
      }
      // Layout is map-first / tall — force Leaflet to remeasure after DOM settles
      setTimeout(() => { try { this.map?.invalidateSize(); } catch {} }, 200);
    });
  }
  private styleDistrict(name: string): any {
    const overridden = this.pmoOverrides()[name] !== undefined;
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
      const sug = overridden ? this.pmoOverrides()[name] : (sup?.suggestedLevel || this.effectiveLevelNow(name));
      const active = !!sug && sug !== 'NONE';
      return {
        fillColor: alertColor(sug), fillOpacity: active ? 0.8 : 0.18,
        color: overridden ? '#4527a0' : (sup && sup.suggestedLevel !== sup.entityLevel ? '#0d6efd' : '#5a6b7b'),
        weight: overridden ? 1.4 : (sup && sup.suggestedLevel !== sup.entityLevel ? 1.2 : 0.45),
        opacity: 1, dashArray: (!overridden && sup && sup.suggestedLevel !== sup.entityLevel) ? '4 3' : undefined,
      };
    }

    // Default: entity consolidation + PMO effective paint (unchanged behaviour)
    const lvl = this.effectiveLevelNow(name);
    const active = !!lvl && lvl !== 'NONE';
    return {
      fillColor: alertColor(lvl), fillOpacity: active ? 0.8 : 0.22,
      color: overridden ? '#4527a0' : '#5a6b7b', weight: overridden ? 1.4 : 0.45, opacity: 1,
    };
  }

  private choroplethStyle(v: number | null | undefined, overridden: boolean, kind: string): any {
    const fill = this.informColor(v, kind);
    return {
      fillColor: fill, fillOpacity: v != null ? 0.75 : 0.12,
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
