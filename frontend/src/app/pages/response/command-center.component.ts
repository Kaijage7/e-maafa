import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  standalone: true,
  imports: [FormsModule, RouterLink, UpperCasePipe, DecimalPipe, PageHeaderComponent],
  styles: [`
    :host { display: block; background: #0f172a; margin: -16px; padding: 16px; min-height: calc(100vh - 60px); }
    .card { background: #1c2536; border: 1px solid #2c3a50; border-radius: 6px; padding: 13px 15px; color: #e2e8f0; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
    .card h4 { margin: 0 0 9px; font-size: 0.7rem; text-transform: uppercase; color: #93a7c4; letter-spacing: 0.9px; font-weight: 800; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .card h4 i { color: #557092; }
    .row-item { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px dashed #334155; font-size: 0.82rem; }
    .badge { font-size: 0.62rem; font-weight: 700; border-radius: 8px; padding: 1px 8px; }
    .b-live { background: #14532d; color: #4ade80; } .b-sim { background: #4c1d95; color: #c4b5fd; }
    .b-sev { background: #7f1d1d; color: #fecaca; } .b-fcast { background: #0c4a6e; color: #7dd3fc; }
    .btn { font-size: 0.74rem; padding: 5px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 700; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: transparent; border-color: #475569; color: #cbd5e1; }
    .b-amber { background: #d97706; color: #fff; } .b-blue { background: #2563eb; color: #fff; } .b-green { background: #16a34a; color: #fff; }
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
    .lane small { color: #94a3b8; font-size: 0.68rem; }
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
    .task .meta { color: #94a3b8; font-size: 0.7rem; margin: 3px 0; }
    select, input { background: #1e293b; border: 1px solid #475569; color: #e2e8f0; border-radius: 6px; font-size: 0.76rem; padding: 4px 8px; font-family: inherit; }
    .crit { border-left: 3px solid #f87171; background: #1e293b; border-radius: 6px; padding: 7px 10px; margin-bottom: 6px; font-size: 0.78rem; }
    .empty { color: #64748b; font-size: 0.8rem; text-align: center; padding: 18px 0; }
    /* Index ops-status strip + richer active-response rows */
    .ops-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .ops-stat { background: #1c2536; border: 1px solid #2c3a50; border-radius: 6px; padding: 11px 14px; display: flex; flex-direction: column; gap: 3px; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
    .ops-n { font-size: 1.55rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .ops-l { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.5px; color: #8aa0bd; font-weight: 700; display: flex; align-items: center; gap: 5px; }
    .ops-l i { color: #557092; }
    .act-row { background: #1c2536; border: 1px solid #2c3a50; border-left: 3px solid #dc3545; border-radius: 6px; padding: 10px 13px; margin-bottom: 8px; }
    .act-head { display: flex; align-items: center; gap: 9px; }
    .act-title { flex: 1; font-size: 0.86rem; color: #f1f5f9; }
    .act-foot { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
    .act-bar { flex: 1; max-width: 340px; height: 7px; background: #334155; border-radius: 4px; overflow: hidden; }
    .act-fill { display: block; height: 100%; border-radius: 4px; transition: width .3s ease; }
    .act-num { font-size: 0.72rem; color: #cbd5e1; font-variant-numeric: tabular-nums; }
    .act-by { font-size: 0.72rem; color: #64748b; margin-left: auto; }
    /* Command Post doctrine */
    .doctrine { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .doc-step { border: 1px solid #334155; border-radius: 10px; padding: 9px 11px; position: relative; }
    .doc-step .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    .doc-step b { font-size: 0.74rem; } .doc-step small { color: #94a3b8; font-size: 0.66rem; display: block; margin-top: 2px; }
    .ladder { display: flex; gap: 6px; align-items: stretch; flex-wrap: wrap; }
    .rung { flex: 1; min-width: 150px; border: 1px solid #334155; border-radius: 9px; padding: 8px 10px; opacity: 0.45; transition: opacity .2s, box-shadow .2s, background .2s; }
    .rung.on { opacity: 1; border-width: 2px; background: color-mix(in srgb, currentColor 12%, transparent); box-shadow: 0 0 0 1px currentColor inset, 0 0 22px -6px currentColor; }
    .rung b { font-size: 0.78rem; } .rung small { color: #94a3b8; font-size: 0.64rem; display: block; }
    .countdown { font-size: 2.3rem; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 1px; line-height: 1.1; text-shadow: 0 0 18px currentColor; }
    .stormmap { height: 500px; border-radius: 10px; overflow: hidden; border: 1px solid #334155; }
    .leaflet-container { background: #0b1220; }
    .ready-grp { margin-bottom: 10px; } .ready-grp .lbl { font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
    .ready-item { font-size: 0.76rem; padding: 4px 0; border-bottom: 1px dashed #334155; display: flex; justify-content: space-between; gap: 8px; }
    .pill { font-size: 0.6rem; font-weight: 700; padding: 1px 7px; border-radius: 7px; background: #334155; color: #cbd5e1; }
    .area-chip { font-size: 0.7rem; background: #0c4a6e; color: #7dd3fc; border-radius: 8px; padding: 2px 10px; margin: 0 4px 4px 0; display: inline-block; }
    .plan-card { border: 1px solid #334155; border-left: 3px solid #38bdf8; border-radius: 8px; padding: 7px 10px; margin-bottom: 6px; font-size: 0.76rem; }
    .plan-card .acts { margin: 4px 0; padding-left: 16px; color: #cbd5e1; }
    .plan-card .acts li { margin: 1px 0; }
    label.fld { display: block; font-size: 0.68rem; color: #94a3b8; margin: 8px 0 3px; }
    .track-pt { font-size: 0.66rem; color: #7dd3fc; }
  `],
  template: `
    <dmis-page-header title="Command Post — Disaster Response Coordination" icon="fa-tower-broadcast"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Command Post'}]">
      <a routerLink="/m/response/eocc" class="btn-add"><i class="fas fa-terminal"></i> EOCC Board</a>
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

      <!-- Anticipatory activation launcher (the cyclone-coming scenario) -->
      @if (showForecast()) {
        <div class="card">
          <h4><i class="fas fa-hurricane"></i> Open the Command Post from a forecast</h4>
          <div class="split">
            <div>
              <label class="fld">Forecast hazard</label>
              <input style="width:100%" [(ngModel)]="fHazard" placeholder="e.g. Tropical Cyclone — heavy rain + destructive winds">
              <label class="fld">Forecast-impact areas (regions, comma-separated)</label>
              <input style="width:100%" [(ngModel)]="fAreas" placeholder="e.g. Mtwara, Lindi, Pwani">
              <label class="fld">Expected impact / landfall (ETA)</label>
              <input style="width:100%" type="datetime-local" [(ngModel)]="fEta">
              <label class="fld" style="display:flex; align-items:center; gap:8px; margin-top:10px">
                <input type="checkbox" [(ngModel)]="fSim" style="width:auto"> Run as a Virtual Simulation drill
              </label>
              <label class="fld">Forecast track — click the map to drop track points (last = landfall)</label>
              <div class="track-pt">{{ fTrack().length }} point(s) plotted
                @if (fTrack().length) { · <a style="color:#f87171; cursor:pointer" (click)="clearTrack()">clear</a> }</div>
              <div style="margin-top:10px; display:flex; gap:6px">
                <button class="btn b-outline" (click)="loadCycloneDemo()"><i class="fas fa-wand-magic-sparkles"></i> Load SWIO cyclone demo</button>
                <button class="btn b-blue" [disabled]="!fHazard.trim() || !fAreas.trim()" (click)="submitForecast()">
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
              <span style="color:#94a3b8; font-size:0.74rem">Post-passage watch — close the response when residual risk clears.</span>
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
                      <span class="pill">{{ e.capacity_people }} ppl</span></div>
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
                        <span class="pill">{{ p.affected_people | number }} ppl</span>
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
                      <span class="pill">{{ e.capacity_people }} ppl</span></div>
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
            {{ b.activation.is_simulation ? 'SIMULATION DRILL' : (b.activation.trigger_type === 'forecast' ? 'ANTICIPATORY' : 'LIVE RESPONSE') }}</span>
          <b style="font-size:1rem; margin-left:8px">{{ b.activation.incident_title }}</b>
          <div style="color:#94a3b8; font-size:0.74rem; margin-top:2px">
            {{ b.activation.region_name ?? '' }} · activated {{ b.activation.activated_at?.substring(0, 16)?.replace('T', ' ') }}
            by {{ b.activation.activated_by_name }} · {{ b.summary.assigned_stakeholders }} agencies engaged</div>
        </div>
        <div style="text-align:center">
          <div class="clock" [class.danger]="clockDanger()">{{ clock72() }}</div>
          <small style="color:#94a3b8">72-HOUR CLOCK</small>
        </div>
        <div style="min-width:180px">
          <div style="font-size:0.72rem; color:#94a3b8">Overall progress — {{ b.summary.overall_progress }}%
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
                <div style="color:#94a3b8; font-size:0.7rem">{{ t.status }} · {{ t.progress_percent }}% · {{ t.stakeholder_organization ?? 'Unassigned' }}</div></div>
            } @empty { <div class="empty">No 72-hour critical tasks.</div> }
          </div>
          <div class="card"><h4><i class="fas fa-triangle-exclamation"></i> Challenges Reported</h4>
            @for (c of b.challenges; track c.id) {
              <div class="feed"><b>DRF {{ c.drf_number }}</b> — {{ c.challenge }}<br>
                <small style="color:#64748b">{{ c.title }} · {{ c.stakeholder_organization ?? '' }}</small></div>
            } @empty { <div class="empty">No challenges raised.</div> }
          </div>
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
              <div style="color:#94a3b8; font-size:0.72rem">Lead: {{ ln.drf.lead_agency_name ?? '—' }}</div></div>
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
                @if (t.challenge) { <div class="meta" style="color:#fca5a5">⚠ {{ t.challenge }}</div> }
              </div>
            } @empty { <div class="empty">No tasks in this lane.</div> }
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandCenterComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);

  readonly index = signal<any>({});
  readonly board = signal<any | null>(null);
  readonly lane = signal<any | null>(null);
  readonly readiness = signal<any | null>(null);
  readonly now = signal(Date.now());
  private timer: any;

  // Anticipatory-activation form state
  readonly showForecast = signal(false);
  fHazard = '';
  fAreas = '';
  fEta = '';
  fSim = false;
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
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
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
  private hms(ms: number): string {
    const neg = ms < 0; const abs = Math.abs(ms);
    const h = Math.floor(abs / 3600_000), m = Math.floor((abs % 3600_000) / 60_000), s = Math.floor((abs % 60_000) / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${neg ? '-' : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // ── index / board lifecycle ──
  load(): void {
    this.http.get<any>('/api/v1/response/coordination').subscribe(d => this.index.set(d));
  }

  openBoard(id: number): void {
    this.http.get<any>(`/api/v1/response/coordination/${id}`).subscribe(d => {
      this.board.set(d);
      this.readiness.set(null);
      // Readiness (evac centres / stockpiles / warnings) is relevant to BOTH the forecast areas and an
      // incident's region, so load it for every activation.
      this.http.get<any>(`/api/v1/response/coordination/${id}/readiness`).subscribe(r => this.readiness.set(r));
      if (d.activation?.trigger_type === 'forecast') {
        setTimeout(() => this.initStormMap(d.activation), 60);
      } else if (d.activation?.latitude && d.activation?.longitude) {
        setTimeout(() => this.initIncidentMap(d.activation), 60);
      }
    });
  }

  closeBoard(): void {
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
      .bindTooltip(`<b>${activation.incident_title ?? 'Incident'}</b><br>${activation.severity_level ?? ''} · ${activation.region_name ?? ''}<br>${activation.location_description ?? ''}`, { sticky: true })
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
      this.http.get<any>(`/api/v1/response/coordination/${id}`).subscribe(d => {
        this.board.set(d);   // refresh data WITHOUT re-initialising the storm map (avoid flicker)
        const drf = this.lane()?.drf;
        if (drf) { this.openLane(drf); }
      });
    } else {
      this.load();
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
      setTimeout(() => this.initFormMap(), 60);
    } else {
      this.destroyFormMap();
    }
  }

  clearTrack(): void {
    this.fTrack.set([]);
    if (this.formLayer) { this.formLayer.clearLayers(); }
  }

  loadCycloneDemo(): void {
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
      hazard_description: this.fHazard.trim(),
      affected_areas: areas,
      expected_impact_at: eta ? eta.toISOString() : null,
      forecast_track: track.length ? track : null,
      mode: this.fSim ? 'simulation' : 'live',
    };
    this.http.post<any>('/api/v1/response/coordination/forecast', body).subscribe({
      next: res => {
        this.showForecast.set(false);
        this.destroyFormMap();
        this.fHazard = ''; this.fAreas = ''; this.fEta = ''; this.fSim = false; this.fTrack.set([]);
        this.openBoard(res.activation_id);
      },
      error: err => ensureSweetAlert().then(() => this.swal({ title: 'Error', text: err?.error?.detail ?? 'Could not open the post.', icon: 'error' })),
    });
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
      title: simulation ? `Run a SIMULATION drill for "${incident.title}"?` : `Activate LIVE response for "${incident.title}"?`,
      text: simulation
        ? 'A flagged drill copy of the incident is created — live operations are not touched.'
        : 'All 15 DRFs and their default tasks will be created and the 72-hour clock starts.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'text', inputLabel: 'Activation notes (optional)',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/coordination/activate/${incident.id}`,
          { mode: simulation ? 'simulation' : 'live', notes: r.value || null },
          (res: any) => this.openBoard(res.activation_id));
      }
    }));
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
      .map((s: any) => `<option value="${s.id}">${s.organization ?? s.name}</option>`).join('');
    ensureSweetAlert().then(() => this.swal({
      title: `Assign DRF ${drf.number} to an agency`,
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
      title: `Add task to DRF ${drf.number}`,
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
      title: `Remove "${task.title}"?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
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
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
