import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Detection {
  id: number; source_id: string; title: string; summary: string; url: string;
  hazard_type: string; severity: string; reliability: string; region: string | null; district: string | null;
  latitude: number | null; longitude: number | null; published_at: string | null; detected_at: string;
  status: string; dispatched_as: string | null; assigned_entity: string | null; incident_id: number | null;
}
interface Tasking {
  id: number; agency: string; hazard_type: string; region: string | null; status: string; message: string;
  requested_at: string; detection_id: number; title: string; url: string; source_id: string; severity: string;
}
interface Update {
  id: number; agency: string; warning_code: string; revision: number; top_alert: string;
  regions: string; hazard_types: string; issue_date: string; issue_time: string; is_latest: boolean; created_at: string;
}
interface FocalReport {
  id: number; warning_code: string; bulletin_number: string; focal_point_name: string; role: string;
  location: string; status: string; report_details: string; actions_taken: string; actions_planned: string;
  bulletin_received: boolean; impact_verified: boolean; people_affected: number; households_evacuated: number; created_at: string;
}

const HAZ: Record<string, { icon: string; color: string }> = {
  flood: { icon: 'fa-water', color: '#3b82f6' }, fire: { icon: 'fa-fire', color: '#ef4444' },
  drought: { icon: 'fa-sun', color: '#f59e0b' }, earthquake: { icon: 'fa-house-crack', color: '#a855f7' },
  landslide: { icon: 'fa-mountain', color: '#92400e' }, cyclone: { icon: 'fa-wind', color: '#0ea5e9' },
  disease: { icon: 'fa-virus', color: '#059669' }, heavy_rain: { icon: 'fa-cloud-showers-heavy', color: '#2563eb' },
  strong_wind: { icon: 'fa-wind', color: '#6366f1' }, lightning: { icon: 'fa-bolt', color: '#eab308' },
  pollution: { icon: 'fa-smog', color: '#64748b' }, other: { icon: 'fa-triangle-exclamation', color: '#64748b' },
};
const SEV: Record<string, string> = { critical: '#dc2626', high: '#f97316', medium: '#f59e0b', low: '#3b82f6' };
const AGENCY_NAMES: Record<string, string> = {
  tma: 'Tanzania Meteorological Authority', mow: 'Ministry of Water', gst: 'Geological Survey of Tanzania',
  moh: 'Ministry of Health', moa: 'Ministry of Agriculture', nemc: 'National Environment Management Council',
};
const HAZARD_OPTS = ['flood', 'heavy_rain', 'strong_wind', 'cyclone', 'earthquake', 'landslide', 'volcano', 'disease', 'drought', 'fire', 'pollution'];

/**
 * MONITORING (EOCC) — the situational-awareness + verification hub. Four components, each with its own
 * inbound flow; all feed the responsible Early Warning Entity to verify/own a signal BEFORE PMO does the
 * Impact Analysis. Incidents are the parallel escalation lane (approval flow). See EW-MONITORING-FLOW.md.
 */
@Component({
  selector: 'page-disaster-scanner',
  standalone: true,
  imports: [PageHeaderComponent, StatCardComponent, DatePipe, FormsModule],
  template: `
    <dmis-page-header title="Monitoring — EOCC" icon="fa-tower-broadcast"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Early Warning Systems', url:'/m/preparedness/early-warnings'}, {label:'Monitoring'}]">
    </dmis-page-header>

    <!-- Verification inbox: signals dispatched to entities, awaiting their official assessment -->
    @if (taskings().length) {
      <div class="vbox">
        <div class="vbox-hd"><i class="fas fa-clipboard-check"></i> Entity verification inbox <span class="vn">{{ taskings().length }} awaiting</span>
          <span class="vsub">— dispatched from the scanner / regional reports; the entity verifies &amp; issues its assessment → feeds Impact Analysis</span></div>
        @for (t of taskings(); track t.id) {
          <div class="vrow">
            <span class="vag">{{ agencyName(t.agency) }}</span>
            <span class="vhz">{{ t.hazard_type }}</span>
            @if (t.region) { <span class="vrg"><i class="fas fa-location-dot"></i> {{ t.region }}</span> }
            <a class="vti" [href]="t.url" target="_blank" rel="noopener">{{ t.title }}</a>
            <a class="vgo" [href]="'/m/preparedness/early-warnings/' + t.agency">Open {{ t.agency.toUpperCase() }} console →</a>
            <button class="vdone" (click)="resolveTasking(t)" title="Mark as responded"><i class="fas fa-check"></i> Responded</button>
          </div>
        }
      </div>
    }

    <div class="tabs">
      <button [class.on]="tab()==='scanner'" (click)="tab.set('scanner')"><i class="fas fa-satellite-dish"></i> Disaster Scanner</button>
      <button [class.on]="tab()==='regional'" (click)="tab.set('regional')"><i class="fas fa-building-flag"></i> Regional &amp; Sectorial</button>
      <button [class.on]="tab()==='updates'" (click)="tab.set('updates'); loadUpdates()"><i class="fas fa-rotate"></i> EW Entities Update</button>
      <button [class.on]="tab()==='focal'" (click)="tab.set('focal'); loadFocal()"><i class="fas fa-user-shield"></i> Focal / DRRC Verification</button>
    </div>

    @if (flash()) { <div class="sc-flash" [class.err]="flash()!.err">{{ flash()!.msg }}</div> }

    @switch (tab()) {
      <!-- ① DISASTER SCANNER -->
      @case ('scanner') {
        <div class="flow"><b>Flow:</b> online sources (USGS · GDACS · ReliefWeb · GDELT · TZ news · SHOC/IGAD/AU) → classified &amp; deduped → triage each:
          <b>→ Entity</b> routes the hazard to its owner (earthquake→GST, El&nbsp;Niño→MoA…) to verify &amp; issue an assessment;
          <b>→ Incident</b> creates a draft incident that follows the DAS→RAS→Director approval flow.
          <span class="ep">POST /v1/ew/scanner/scan · GET /detections · POST /:id/dispatch as=entity|incident</span></div>
        <div class="stats-row">
          <dmis-stat-card [value]="stats()['total'] ?? 0" label="Total detections" icon="fa-radar" color="#0d6efd" />
          <dmis-stat-card [value]="stats()['new'] ?? 0" label="Awaiting triage" icon="fa-bell" color="#f59e0b" />
          <dmis-stat-card [value]="stats()['high_severity'] ?? 0" label="High / critical" icon="fa-triangle-exclamation" color="#dc2626" />
          <dmis-stat-card [value]="stats()['dispatched'] ?? 0" label="Dispatched" icon="fa-paper-plane" color="#7c3aed" />
        </div>
        <div class="sc-bar">
          <div class="sc-filters">
            @for (f of statusFilters; track f.key) { <button class="sc-chip" [class.on]="status()===f.key" (click)="status.set(f.key); load()">{{ f.label }}</button> }
          </div>
          <button class="sc-scan" [disabled]="scanning()" (click)="runScan()">
            <i class="fas" [class.fa-spinner]="scanning()" [class.fa-spin]="scanning()" [class.fa-magnifying-glass-chart]="!scanning()"></i>
            {{ scanning() ? 'Scanning sources…' : 'Run scan now' }}</button>
        </div>
        <div class="sc-list">
          @for (d of scannerDetections(); track d.id) {
            <div class="sc-card" [class.dim]="d.status!=='new'">
              <span class="sc-icon" [style.background]="haz(d.hazard_type).color"><i class="fas" [class]="haz(d.hazard_type).icon"></i></span>
              <div class="sc-body">
                <div class="sc-top">
                  <span class="sc-sev" [style.background]="sevColor(d.severity)">{{ d.severity }}</span>
                  <span class="sc-haz">{{ d.hazard_type }}</span>
                  @if (d.region) { <span class="sc-region"><i class="fas fa-location-dot"></i> {{ d.region }}</span> }
                  <span class="sc-src" [class.official]="d.reliability==='official'">{{ sourceLabel(d.source_id) }}</span>
                  <span class="sc-time">{{ (d.published_at || d.detected_at) | date:'dd MMM, HH:mm' }}</span>
                </div>
                <a class="sc-title" [href]="d.url" target="_blank" rel="noopener">{{ d.title }}</a>
                @if (d.summary) { <div class="sc-sum">{{ d.summary }}</div> }
              </div>
              <div class="sc-actions">
                @if (d.status==='new') {
                  <button class="sc-act ent" (click)="dispatch(d,'entity')" title="Route to the responsible warning entity">→ Entity</button>
                  <button class="sc-act inc" (click)="dispatch(d,'incident')" title="Create a draft incident (approval flow)">→ Incident</button>
                  <button class="sc-act dis" (click)="dismiss(d)">Dismiss</button>
                } @else {
                  <span class="sc-status disp">{{ d.status }}@if (d.dispatched_as) { · {{ d.dispatched_as }} }</span>
                  @if (d.incident_id) { <a class="sc-ref" href="/m/response/incidents">incident #{{ d.incident_id }}</a> }
                }
              </div>
            </div>
          } @empty { <div class="sc-empty"><i class="fas fa-satellite-dish"></i> No online detections. Click <b>Run scan now</b>.</div> }
        </div>
      }

      <!-- ② REGIONAL & SECTORIAL INFORMATION -->
      @case ('regional') {
        <div class="flow"><b>Flow:</b> regional disaster-management centers &amp; sector leads file field reports here → an operator <b>dispatches each to the responsible entity</b> to verify &amp; issue an official assessment <b>before Impact Analysis</b> (or raises it as an incident).
          <span class="ep">POST /v1/ew/scanner/report → POST /:id/dispatch as=entity</span></div>
        <div class="rep-form">
          <div class="rf-grid">
            <div><label>Title</label><input [(ngModel)]="rep.title" placeholder="e.g. River rising in Rufiji basin"></div>
            <div><label>Source</label>
              <select [(ngModel)]="rep.source_id"><option value="regional_center">Regional Center</option><option value="sectoral">Sector Lead</option></select></div>
            <div><label>Hazard</label><select [(ngModel)]="rep.hazard_type">@for (h of hazardOpts; track h) { <option [value]="h">{{ h }}</option> }</select></div>
            <div><label>Region</label><input [(ngModel)]="rep.region" placeholder="e.g. Pwani"></div>
            <div><label>Severity</label><select [(ngModel)]="rep.severity"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></div>
          </div>
          <textarea [(ngModel)]="rep.summary" placeholder="Situation details…"></textarea>
          <button class="rf-add" [disabled]="!rep.title" (click)="addReport()"><i class="fas fa-plus"></i> Log report</button>
        </div>
        <div class="sc-list">
          @for (d of regionalReports(); track d.id) {
            <div class="sc-card" [class.dim]="d.status!=='new'">
              <span class="sc-icon" [style.background]="haz(d.hazard_type).color"><i class="fas" [class]="haz(d.hazard_type).icon"></i></span>
              <div class="sc-body">
                <div class="sc-top"><span class="sc-sev" [style.background]="sevColor(d.severity)">{{ d.severity }}</span>
                  <span class="sc-haz">{{ d.hazard_type }}</span>
                  @if (d.region) { <span class="sc-region"><i class="fas fa-location-dot"></i> {{ d.region }}</span> }
                  <span class="sc-src official">{{ d.source_id==='sectoral' ? 'Sector Lead' : 'Regional Center' }}</span>
                  <span class="sc-time">{{ d.detected_at | date:'dd MMM, HH:mm' }}</span></div>
                <div class="sc-title">{{ d.title }}</div>
                @if (d.summary) { <div class="sc-sum">{{ d.summary }}</div> }
              </div>
              <div class="sc-actions">
                @if (d.status==='new') {
                  <button class="sc-act ent" (click)="dispatch(d,'entity')">→ Entity</button>
                  <button class="sc-act inc" (click)="dispatch(d,'incident')">→ Incident</button>
                  <button class="sc-act dis" (click)="dismiss(d)">Dismiss</button>
                } @else { <span class="sc-status disp">{{ d.status }}@if (d.dispatched_as) { · {{ d.dispatched_as }} }</span> }
              </div>
            </div>
          } @empty { <div class="sc-empty"><i class="fas fa-building-flag"></i> No regional/sectorial reports yet. Log one above.</div> }
        </div>
      }

      <!-- ③ EARLY WARNING ENTITIES UPDATE -->
      @case ('updates') {
        <div class="flow"><b>Flow:</b> an entity posts an <b>update on a hazard it already issued</b>, under that warning's index (warning_code). It supersedes the entity's latest layer and is received here so <b>PMO can re-consolidate / revise</b> the same warning.
          <span class="ep">POST /v1/ew/agency/:agency/update?warningCode=EW-YYYY-NNNNN · GET /v1/ew/agency/updates</span></div>
        <div class="rep-form">
          <div class="rf-grid">
            <div><label>Entity</label><select [(ngModel)]="upd.agency">@for (a of agencyKeys; track a) { <option [value]="a">{{ a.toUpperCase() }}</option> }</select></div>
            <div><label>Warning code</label><input [(ngModel)]="upd.warning_code" placeholder="EW-2026-00048"></div>
            <div><label>Hazard</label><input [(ngModel)]="upd.type" placeholder="HEAVY_RAIN"></div>
            <div><label>Region</label><input [(ngModel)]="upd.region" placeholder="Morogoro"></div>
            <div><label>Level</label><select [(ngModel)]="upd.alert_level"><option>ADVISORY</option><option>WARNING</option><option>MAJOR_WARNING</option></select></div>
          </div>
          <textarea [(ngModel)]="upd.description" placeholder="What changed since the issued warning…"></textarea>
          <button class="rf-add" [disabled]="!upd.warning_code || !upd.region" (click)="postUpdate()"><i class="fas fa-rotate"></i> Record update</button>
        </div>
        <div class="sc-list">
          @for (u of updates(); track u.id) {
            <div class="sc-card">
              <span class="sc-icon" style="background:#7c3aed"><i class="fas fa-rotate"></i></span>
              <div class="sc-body">
                <div class="sc-top"><span class="sc-sev" [style.background]="sevColor(levelToSev(u.top_alert))">{{ (u.top_alert||'').replace('_',' ') }}</span>
                  <span class="sc-haz">{{ agencyName(u.agency) }}</span>
                  <span class="sc-region"><i class="fas fa-hashtag"></i> {{ u.warning_code }}</span>
                  <span class="sc-src">rev {{ u.revision }}</span>
                  <span class="sc-time">{{ u.created_at | date:'dd MMM, HH:mm' }}</span></div>
                <div class="sc-title">Update to {{ u.warning_code }} — {{ parseList(u.hazard_types) }} over {{ parseList(u.regions) }}</div>
              </div>
              <div class="sc-actions"><span class="sc-status disp">received</span></div>
            </div>
          } @empty { <div class="sc-empty"><i class="fas fa-rotate"></i> No entity updates yet.</div> }
        </div>
      }

      <!-- ④ FOCAL / DRRC VERIFICATION -->
      @case ('focal') {
        <div class="flow"><b>Flow:</b> focal points &amp; <b>DRRC</b> (Disaster Risk Reduction Coordinators) at the local level confirm, against an issued warning: <b>received warning</b>, <b>preparedness activation</b>, <b>readiness</b> and the ground situation. This comes <b>straight to Monitoring (EOCC)</b> — no approval flow.
          <span class="ep">POST /ew/monitoring/reports · GET /ew/monitoring/reports</span></div>
        <div class="rep-form">
          <div class="rf-grid">
            <div><label>Warning code</label><input [(ngModel)]="foc.warning_code" placeholder="EW-2026-00048"></div>
            <div><label>Focal / DRRC name</label><input [(ngModel)]="foc.focal_point_name" placeholder="J. Mushi"></div>
            <div><label>Role</label><input [(ngModel)]="foc.role" placeholder="DRRC"></div>
            <div><label>Location</label><input [(ngModel)]="foc.location" placeholder="Kilombero DC"></div>
            <div><label>Status</label><select [(ngModel)]="foc.status"><option>received</option><option>preparedness_activated</option><option>ready</option><option>responding</option></select></div>
          </div>
          <div class="chk"><label><input type="checkbox" [(ngModel)]="foc.bulletin_received"> Warning received</label>
            <label><input type="checkbox" [(ngModel)]="foc.impact_verified"> Impact verified on ground</label></div>
          <textarea [(ngModel)]="foc.report_details" placeholder="Situation / preparedness activation / readiness…"></textarea>
          <button class="rf-add" [disabled]="!foc.warning_code || !foc.focal_point_name" (click)="addFocal()"><i class="fas fa-paper-plane"></i> Submit verification</button>
        </div>
        <div class="sc-list">
          @for (r of focal(); track r.id) {
            <div class="sc-card">
              <span class="sc-icon" style="background:#0ea5e9"><i class="fas fa-user-shield"></i></span>
              <div class="sc-body">
                <div class="sc-top">
                  @if (r.bulletin_received) { <span class="sc-sev" style="background:#059669">received</span> }
                  @if (r.impact_verified) { <span class="sc-sev" style="background:#dc2626">impact verified</span> }
                  <span class="sc-haz">{{ r.focal_point_name }}@if (r.role) { · {{ r.role }} }</span>
                  <span class="sc-region"><i class="fas fa-hashtag"></i> {{ r.warning_code || r.bulletin_number }}</span>
                  @if (r.location) { <span class="sc-src">{{ r.location }}</span> }
                  <span class="sc-time">{{ r.created_at | date:'dd MMM, HH:mm' }}</span></div>
                @if (r.report_details) { <div class="sc-sum">{{ r.report_details }}</div> }
              </div>
              <div class="sc-actions"><span class="sc-status disp">{{ r.status }}</span></div>
            </div>
          } @empty { <div class="sc-empty"><i class="fas fa-user-shield"></i> No focal/DRRC verifications yet. Submit one above.</div> }
        </div>
      }
    }
  `,
  styles: [`
    .vbox { background:#f5f3ff; border:1px solid #ddd6fe; border-radius:12px; padding:0.7rem 0.9rem; margin:0.3rem 0 0.8rem; }
    .vbox-hd { font-size:0.84rem; font-weight:800; color:#5b21b6; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .vn { font-size:0.62rem; background:#7c3aed; color:#fff; border-radius:20px; padding:0.1rem 0.55rem; }
    .vsub { font-weight:500; font-size:0.7rem; color:#7c3aed; }
    .vrow { display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; padding:0.4rem 0; border-top:1px solid #ede9fe; }
    .vag { font-size:0.74rem; font-weight:800; color:#4c1d95; } .vhz { font-size:0.68rem; font-weight:700; color:#6d28d9; background:#ede9fe; border-radius:6px; padding:0.08rem 0.45rem; text-transform:capitalize; }
    .vrg { font-size:0.72rem; color:#475569; } .vti { font-size:0.78rem; color:#1e293b; text-decoration:none; flex:1; min-width:140px; } .vti:hover { text-decoration:underline; }
    .vgo { font-size:0.72rem; font-weight:700; color:#7c3aed; text-decoration:none; } .vgo:hover { text-decoration:underline; }
    .vdone { font-size:0.7rem; font-weight:700; border:1px solid #c4b5fd; background:#fff; color:#6d28d9; border-radius:7px; padding:0.2rem 0.55rem; cursor:pointer; }
    .tabs { display:flex; gap:0.4rem; flex-wrap:wrap; margin:0.2rem 0 0.7rem; border-bottom:2px solid var(--border); }
    .tabs button { border:none; background:none; color:var(--text-mid); font-size:0.82rem; font-weight:700; padding:0.55rem 0.9rem; cursor:pointer; border-bottom:3px solid transparent; display:inline-flex; align-items:center; gap:6px; }
    .tabs button.on { color:#003366; border-bottom-color:#003366; }
    .flow { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:0.6rem 0.85rem; font-size:0.78rem; color:#1e3a8a; line-height:1.5; margin-bottom:0.8rem; }
    .flow .ep { display:block; margin-top:0.3rem; font-size:0.68rem; color:#475569; font-family:ui-monospace,monospace; }
    .rep-form { background:#fff; border:1px solid var(--border); border-radius:12px; padding:0.8rem 0.9rem; margin-bottom:0.9rem; }
    .rf-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:0.6rem; margin-bottom:0.5rem; }
    .rep-form label { display:block; font-size:0.66rem; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:0.15rem; }
    .rep-form input, .rep-form select, .rep-form textarea { width:100%; box-sizing:border-box; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:7px; padding:0.35rem 0.5rem; font-family:inherit; }
    .rep-form textarea { min-height:42px; resize:vertical; margin-bottom:0.5rem; }
    .chk { display:flex; gap:1.2rem; margin-bottom:0.5rem; } .chk label { font-size:0.78rem; color:#475569; font-weight:600; text-transform:none; display:flex; align-items:center; gap:5px; }
    .rf-add { background:#003366; color:#fff; border:none; border-radius:8px; padding:0.4rem 1rem; font-size:0.8rem; font-weight:700; cursor:pointer; }
    .rf-add:disabled { opacity:0.5; cursor:default; }
    .stats-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:0.7rem; margin-bottom:0.8rem; }
    .sc-bar { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin:0.2rem 0 0.9rem; }
    .sc-filters { display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap; }
    .sc-chip { border:1px solid var(--border); background:#fff; color:var(--text-mid); border-radius:18px; padding:0.32rem 0.9rem; font-size:0.78rem; font-weight:600; cursor:pointer; }
    .sc-chip.on { background:#003366; color:#fff; border-color:#003366; }
    .sc-scan { background:#003366; color:#fff; border:none; border-radius:9px; padding:0.45rem 1.1rem; font-size:0.82rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:7px; }
    .sc-scan:disabled { opacity:0.7; cursor:default; }
    .sc-flash { background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:9px; padding:0.5rem 0.8rem; font-size:0.82rem; margin-bottom:0.8rem; }
    .sc-flash.err { background:#fef2f2; color:#991b1b; border-color:#fecaca; }
    .sc-list { display:flex; flex-direction:column; gap:0.55rem; }
    .sc-card { display:flex; gap:0.8rem; align-items:flex-start; background:#fff; border:1px solid var(--border); border-radius:12px; padding:0.75rem 0.9rem; }
    .sc-card.dim { opacity:0.6; }
    .sc-icon { width:38px; height:38px; border-radius:9px; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0; }
    .sc-body { flex:1; min-width:0; }
    .sc-top { display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.25rem; }
    .sc-sev { color:#fff; font-size:0.62rem; font-weight:800; text-transform:uppercase; padding:0.1rem 0.5rem; border-radius:20px; }
    .sc-haz { font-size:0.72rem; font-weight:700; color:var(--text-dark); text-transform:capitalize; }
    .sc-region { font-size:0.72rem; color:#475569; }
    .sc-src { font-size:0.66rem; font-weight:700; color:#64748b; background:rgba(0,0,0,0.05); padding:0.08rem 0.45rem; border-radius:6px; }
    .sc-src.official { background:rgba(5,150,105,0.12); color:#059669; }
    .sc-time { font-size:0.7rem; color:#94a3b8; margin-left:auto; }
    .sc-title { display:block; font-size:0.86rem; font-weight:600; color:var(--text-dark); text-decoration:none; line-height:1.35; }
    .sc-title:hover { color:#003366; }
    .sc-sum { font-size:0.76rem; color:var(--text-mid); margin-top:0.2rem; line-height:1.4; }
    .sc-actions { display:flex; flex-direction:column; gap:0.3rem; align-items:flex-end; flex-shrink:0; }
    .sc-act { border:1px solid var(--border); background:#fff; border-radius:7px; padding:0.25rem 0.6rem; font-size:0.72rem; font-weight:600; cursor:pointer; white-space:nowrap; }
    .sc-act.ent { background:rgba(124,58,237,0.1); color:#6d28d9; border-color:rgba(124,58,237,0.3); }
    .sc-act.inc { background:rgba(2,132,199,0.1); color:#0369a1; border-color:rgba(2,132,199,0.3); }
    .sc-act.dis { color:#64748b; }
    .sc-status { font-size:0.72rem; font-weight:700; color:#64748b; text-transform:capitalize; }
    .sc-status.disp { color:#7c3aed; }
    .sc-ref { font-size:0.68rem; font-weight:700; color:#0369a1; text-decoration:none; } .sc-ref:hover { text-decoration:underline; }
    .sc-empty { text-align:center; color:var(--text-mid); padding:2rem 1rem; font-size:0.86rem; }
    .sc-empty i { font-size:1.8rem; display:block; margin-bottom:0.6rem; color:#cbd5e1; }
  `],
})
export class DisasterScannerComponent {
  private http = inject(HttpClient);

  tab = signal<'scanner' | 'regional' | 'updates' | 'focal'>('scanner');
  detections = signal<Detection[]>([]);
  taskings = signal<Tasking[]>([]);
  updates = signal<Update[]>([]);
  focal = signal<FocalReport[]>([]);
  stats = signal<Record<string, number>>({});
  status = signal('new');
  scanning = signal(false);
  flash = signal<{ msg: string; err: boolean } | null>(null);

  // split the single detections feed into the two streams that share the scanner pipeline
  private MANUAL = ['regional_center', 'sectoral'];
  scannerDetections = computed(() => this.detections().filter(d => !this.MANUAL.includes(d.source_id)));
  regionalReports = computed(() => this.detections().filter(d => this.MANUAL.includes(d.source_id)));

  rep: any = { title: '', source_id: 'regional_center', hazard_type: 'flood', region: '', severity: 'medium', summary: '' };
  upd: any = { agency: 'tma', warning_code: '', type: 'HEAVY_RAIN', region: '', alert_level: 'WARNING', description: '' };
  foc: any = { warning_code: '', focal_point_name: '', role: 'DRRC', location: '', status: 'received', bulletin_received: true, impact_verified: false, report_details: '' };

  statusFilters = [{ key: '', label: 'All' }, { key: 'new', label: 'Awaiting triage' }, { key: 'dispatched', label: 'Dispatched' }, { key: 'dismissed', label: 'Dismissed' }];
  hazardOpts = HAZARD_OPTS;
  agencyKeys = Object.keys(AGENCY_NAMES);

  constructor() { this.load(); }

  haz(t: string) { return HAZ[t] ?? HAZ['other']; }
  sevColor(s: string) { return SEV[s] ?? '#64748b'; }
  agencyName(k: string) { return AGENCY_NAMES[k] ?? (k || '').toUpperCase(); }
  levelToSev(l: string) { return ({ MAJOR_WARNING: 'critical', WARNING: 'high', ADVISORY: 'low' } as any)[l] ?? 'medium'; }
  parseList(s: string): string { try { return (JSON.parse(s) as string[]).join(', '); } catch { return s || ''; } }
  sourceLabel(s: string): string {
    const m: Record<string, string> = { usgs: 'USGS', gdacs: 'GDACS', reliefweb: 'ReliefWeb', gdelt: 'GDELT',
      dailynews: 'Daily News', allafrica_tz: 'allAfrica', allafrica_disaster: 'allAfrica', bbcswahili: 'BBC Swahili', bbcafrica: 'BBC Africa' };
    return m[s] ?? s;
  }

  load(): void {
    const q = new URLSearchParams();
    if (this.status()) q.set('status', this.status());
    q.set('limit', '300');
    this.http.get<any>('/api/v1/ew/scanner/detections?' + q.toString()).subscribe(r => {
      this.detections.set(r.detections ?? []); this.stats.set(r.stats ?? {});
    });
    this.http.get<any>('/api/v1/ew/scanner/entity-taskings?status=awaiting').subscribe({ next: r => this.taskings.set(r.taskings ?? []), error: () => {} });
  }
  loadUpdates(): void { this.http.get<any>('/api/v1/ew/agency/updates').subscribe({ next: r => this.updates.set(r.updates ?? []), error: () => {} }); }
  loadFocal(): void { this.http.get<any>('/api/ew/monitoring/reports').subscribe({ next: r => this.focal.set(r.reports ?? r.data ?? []), error: () => {} }); }

  runScan(): void {
    this.scanning.set(true); this.flash.set(null);
    this.http.post<any>('/api/v1/ew/scanner/scan?days=21', {}).subscribe({
      next: r => { this.scanning.set(false); this.notify(`Scan complete — ${r.scanned} checked, ${r.new} new.`, false); },
      error: () => { this.scanning.set(false); this.notify('Scan failed — check source connectivity.', true); },
    });
  }
  dispatch(d: Detection, as: 'incident' | 'entity'): void {
    this.http.post<any>(`/api/v1/ew/scanner/${d.id}/dispatch`, { as }).subscribe({
      next: r => { this.notify(r?.message ?? `Dispatched.`, !r?.success); if (r?.success) { this.load(); } },
      error: e => this.notify(e?.error?.detail ?? e?.error?.message ?? 'Could not dispatch.', true),
    });
  }
  dismiss(d: Detection): void {
    this.http.post<any>(`/api/v1/ew/scanner/${d.id}/dismiss`, {}).subscribe({ next: () => { this.notify('Dismissed.', false); this.load(); }, error: () => this.notify('Could not dismiss.', true) });
  }
  resolveTasking(t: Tasking): void {
    this.http.post<any>(`/api/v1/ew/scanner/taskings/${t.id}/respond`, {}).subscribe({ next: () => { this.notify('Marked as responded.', false); this.load(); }, error: () => this.notify('Could not update.', true) });
  }
  addReport(): void {
    this.http.post<any>('/api/v1/ew/scanner/report', this.rep).subscribe({
      next: r => { this.rep = { title: '', source_id: this.rep.source_id, hazard_type: 'flood', region: '', severity: 'medium', summary: '' }; this.notify(r?.message ?? 'Report logged.', !r?.success); this.load(); },
      error: e => this.notify(e?.error?.message ?? 'Could not log the report.', true),
    });
  }
  postUpdate(): void {
    const now = new Date();
    const payload = { issue_date: now.toISOString().slice(0, 10), issue_time: now.toTimeString().slice(0, 5),
      events: [{ type: this.upd.type, alert_level: this.upd.alert_level, regions: [this.upd.region], description: this.upd.description }] };
    this.http.post<any>(`/api/v1/ew/agency/${this.upd.agency}/update?warningCode=${encodeURIComponent(this.upd.warning_code)}`, payload).subscribe({
      next: r => { this.notify(`Update recorded for ${r.warning_code} (rev ${r.revision}).`, false); this.upd.description = ''; this.loadUpdates(); },
      error: e => this.notify(e?.error?.message ?? 'Could not record the update.', true),
    });
  }
  addFocal(): void {
    this.http.post<any>('/api/ew/monitoring/reports', this.foc).subscribe({
      next: () => { this.notify('Verification submitted to Monitoring.', false); this.foc.report_details = ''; this.loadFocal(); },
      error: e => this.notify(e?.error?.message ?? 'Could not submit.', true),
    });
  }

  private notify(msg: string, err: boolean): void {
    this.flash.set({ msg, err });
    this.load();
    if (this.tab() === 'updates') this.loadUpdates();
    if (this.tab() === 'focal') this.loadFocal();
    if (!err) { setTimeout(() => this.flash.set(null), 4000); }
  }
}
