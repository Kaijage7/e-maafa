import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { addMapNav } from '../../core/tz-map';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const L: any;     // Leaflet, loaded on demand (map standard: CartoDB voyager + TZ mask)
declare const Swal: any;  // SweetAlert2

/** Severity palette from the enhanced EOCC board (merged board spec). */
const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#ff5252', Major: '#fb8c00', Moderate: '#43a047', Minor: '#2196f3',
};
const POLL_MS = 30_000; // verbatim source cadence

/**
 * Response overview dashboard — port of response/dashboard.blade.php:
 * stat cards, critical alerts, 24h incident feed (drives the map markers),
 * type bars and regional rollups, refreshed on the source's 30s poll.
 */
@Component({
  selector: 'page-response-dashboard',
  standalone: true,
  imports: [DecimalPipe, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.3rem; display: block; }
    .stat span { font-size: 0.66rem; color: #6c757d; text-transform: uppercase; }
    .split { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
    .map { height: 500px; border-radius: 10px; }
    .feed-item { padding: 7px 0; border-bottom: 1px dashed #e3e6ed; font-size: 0.8rem; }
    .sev { font-size: 0.64rem; font-weight: 700; border-radius: 8px; padding: 1px 7px; color: #fff; }
    .bar-row { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; align-items: center; font-size: 0.78rem; padding: 3px 0; }
    .bar { height: 10px; border-radius: 5px; background: #dc3545; min-width: 2px; }
    .crit { background: #fee2e2; border-left: 3px solid #dc2626; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; font-size: 0.8rem; }
    .pill { font-size: 0.7rem; color: #16a34a; font-weight: 700; }
  `],
  template: `
    <dmis-page-header title="Response Dashboard" icon="fa-tachometer-alt"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Dashboard'}]">
      <span class="pill" [style.color]="live() ? '#16a34a' : '#dc2626'"><i class="fas fa-circle" style="font-size:0.5rem"></i> {{ live() ? 'System Online' : 'Reconnecting…' }} — {{ clock() }}</span>
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ d().statistics?.active_incidents ?? 0 }}</b><span>Active Incidents</span></div>
      <div class="stat"><b>{{ d().statistics?.total_incidents_today ?? 0 }}</b><span>Reported Today</span></div>
      <div class="stat"><b>{{ d().statistics?.resources_deployed ?? 0 }}</b><span>Resources Deployed</span></div>
      <div class="stat"><b>{{ d().statistics?.pending_tasks ?? 0 }}</b><span>Pending Tasks</span></div>
      <div class="stat"><b style="color:#dc2626">{{ d().statistics?.critical_incidents ?? 0 }}</b><span>Critical</span></div>
      <div class="stat"><b>{{ d().statistics?.assessments_pending ?? 0 }}</b><span>Assessments Pending</span></div>
    </div>

    <div class="split">
      <dmis-panel title="Live Incident Map (24h)" icon="fa-map-location-dot">
        <div id="resp-map" class="map"></div>
      </dmis-panel>
      <div>
        <dmis-panel title="Critical Alerts" icon="fa-triangle-exclamation">
          @for (c of d().critical_alerts ?? []; track c.id) {
            <div class="crit"><a [routerLink]="['/m/response/incidents', c.id]"><b>{{ c.title }}</b></a><br>{{ c.location_description }}</div>
          } @empty { <div style="font-size:0.8rem; color:#94a3b8">No critical incidents in active response.</div> }
        </dmis-panel>
        <dmis-panel title="Incidents by Type" icon="fa-fire">
          @for (t of d().incidents_by_type ?? []; track t.hazard_name) {
            <div class="bar-row"><span>{{ t.hazard_name }}</span>
              <div class="bar" [style.width.%]="pct(t.total)"></div><b>{{ t.total }}</b></div>
          }
        </dmis-panel>
        <dmis-panel title="Top Regions" icon="fa-map">
          @for (r of (d().regional_data ?? []).slice(0, 5); track r.region_name) {
            <div class="bar-row"><span>{{ r.region_name }}</span>
              <div class="bar" style="background:#0d6efd" [style.width.%]="pctRegion(r.total)"></div><b>{{ r.total }}</b></div>
          }
        </dmis-panel>
      </div>
    </div>

    <dmis-panel title="Recent Incidents (24h)" icon="fa-clock-rotate-left">
      @for (i of d().recent_incidents ?? []; track i.id) {
        <div class="feed-item">
          <span class="sev" [style.background]="color(i.severity_level)">{{ i.severity_level }}</span>
          <a [routerLink]="['/m/response/incidents', i.id]" style="font-weight:600; margin-left:6px">{{ i.title }}</a>
          <span style="color:#6c757d"> — {{ i.hazard_name }} · {{ i.location_description }} · {{ i.status }}</span>
        </div>
      } @empty { <div style="font-size:0.8rem; color:#94a3b8; padding:10px 0">No incidents reported in the last 24 hours.</div> }
    </dmis-panel>
  `,
})
export class ResponseDashboardComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  readonly d = signal<any>({});
  readonly clock = signal('');
  readonly live = signal(true);
  private timers: any[] = [];
  private map: any;
  private markers: any[] = [];

  ngOnInit(): void {
    this.load();
    this.timers.push(setInterval(() => this.load(), POLL_MS));
    this.timers.push(setInterval(() => this.clock.set(new Date().toLocaleTimeString()), 1000));
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearInterval);
  }

  load(): void {
    this.http.get<any>('/api/v1/response/dashboard').subscribe({
      next: d => {
        this.live.set(true);
        this.d.set(d);
        ensureLeaflet().then(() => this.renderMap(d.recent_incidents ?? []));
      },
      error: () => this.live.set(false),   // poll failed — flag stale, keep last-good data on screen
    });
  }

  /** Standard Tanzania map; markers cleared and redrawn every poll (enhanced-board behavior). */
  private renderMap(incidents: any[]): void {
    if (!this.map) {
      const el = document.getElementById('resp-map');
      if (!el) { return; }
      this.map = buildTanzaniaMap('resp-map');
      addMapNav(this.map, { home: [-6.369028, 34.888822, 6] });
    }
    this.markers.forEach(m => m.remove());
    this.markers = incidents.filter(i => i.latitude && i.longitude).map(i =>
      L.circleMarker([i.latitude, i.longitude], {
        radius: 9, color: '#fff', weight: 2, fillColor: this.color(i.severity_level), fillOpacity: 0.9,
      }).addTo(this.map).bindTooltip(`<b>${i.title}</b><br>${i.severity_level} · ${i.status}`));
  }

  color(severity: string): string {
    return SEVERITY_COLORS[severity] ?? '#6c757d';
  }

  pct(total: number): number {
    const max = Math.max(1, ...(this.d().incidents_by_type ?? []).map((t: any) => t.total));
    return Math.max(3, (total / max) * 100);
  }

  pctRegion(total: number): number {
    const max = Math.max(1, ...(this.d().regional_data ?? []).map((t: any) => t.total));
    return Math.max(3, (total / max) * 100);
  }
}

/**
 * THE EOCC live board (merged) — dark command view: metric tiles, the
 * live severity map, severity/status rollups, today's alert dispatch stats
 * (fed by the R9 stream), the 24h feed, and quick actions including
 * "Activate Emergency Protocol" (dead in the source, wired to R11's
 * response_activations here). Full payload refresh every 30 seconds.
 */
@Component({
  selector: 'page-eocc-board',
  standalone: true,
  imports: [DecimalPipe, RouterLink, PageHeaderComponent],
  styles: [`
    :host { display: block; background: #0f172a; margin: -16px; padding: 16px; min-height: calc(100vh - 60px); }
    .tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px; }
    .tile { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 14px; color: #e2e8f0; }
    .tile b { font-size: 1.5rem; display: block; }
    .tile span { font-size: 0.64rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 14px; color: #e2e8f0; margin-bottom: 12px; }
    .card h4 { margin: 0 0 8px; font-size: 0.74rem; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; }
    .map { height: 500px; border-radius: 8px; }
    .bar-row { display: grid; grid-template-columns: 100px 1fr auto; gap: 8px; align-items: center; font-size: 0.78rem; padding: 3px 0; }
    .bar { height: 10px; border-radius: 5px; min-width: 2px; }
    .feed-item { padding: 6px 0; border-bottom: 1px dashed #334155; font-size: 0.78rem; }
    .sev { font-size: 0.62rem; font-weight: 700; border-radius: 8px; padding: 1px 7px; color: #fff; }
    .qa { display: flex; gap: 8px; }
    .qa button { flex: 1; background: #dc3545; color: #fff; border: none; border-radius: 8px; padding: 10px; font-family: inherit; font-weight: 700; font-size: 0.76rem; cursor: pointer; }
    .qa a { flex: 1; background: #334155; color: #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; font-weight: 700; font-size: 0.76rem; text-decoration: none; }
    .activation { background: #14532d; border: 1px solid #16a34a; border-radius: 10px; padding: 10px 14px; color: #dcfce7; font-size: 0.82rem; margin-bottom: 12px; }
    .clock { color: #4ade80; font-weight: 700; font-size: 0.8rem; }
  `],
  template: `
    <dmis-page-header title="EOCC Command Center — Live Board" icon="fa-terminal"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'EOCC'}]">
      <span class="clock" [style.color]="live() ? '#4ade80' : '#f87171'"><i class="fas fa-satellite-dish"></i> {{ live() ? 'LIVE' : 'RECONNECTING…' }} — {{ clock() }}</span>
    </dmis-page-header>

    @if (d().active_activation; as a) {
      <div class="activation"><i class="fas fa-circle-exclamation"></i>
        <b> EMERGENCY PROTOCOL ACTIVE:</b> {{ a.incident_title }} — activated by {{ a.activated_by_name }}
        ({{ a.activated_at?.substring(0, 16)?.replace('T', ' ') }})</div>
    }

    <div class="tiles">
      <div class="tile"><b>{{ d().statistics?.active_incidents ?? 0 }}</b><span>Active Incidents</span></div>
      <div class="tile"><b style="color:#ff5252">{{ d().statistics?.critical_count ?? 0 }}</b><span>Critical</span></div>
      <div class="tile"><b>{{ d().statistics?.new_today ?? 0 }}</b><span>New Today</span></div>
      <div class="tile"><b>{{ d().statistics?.personnel_deployed ?? 0 }}</b><span>Personnel Deployed</span></div>
      <div class="tile"><b style="color:#4ade80">{{ d().statistics?.resources_available | number }}</b><span>Stock Units Available</span></div>
    </div>

    <div class="grid">
      <div class="card"><h4>Live Situation Map</h4><div id="eocc-map" class="map"></div></div>
      <div>
        <div class="card"><h4>Incidents by Severity</h4>
          @for (s of d().incidents_by_severity ?? []; track s.severity_level) {
            <div class="bar-row"><span [style.color]="color(s.severity_level)">{{ s.severity_level }}</span>
              <div class="bar" [style.background]="color(s.severity_level)" [style.width.%]="pctSev(s.count)"></div><b>{{ s.count }}</b></div>
          }
        </div>
        <div class="card"><h4>By Status (all time)</h4>
          @for (s of d().incidents_by_status ?? []; track s.status) {
            <div class="bar-row"><span>{{ s.status }}</span>
              <div class="bar" style="background:#60a5fa" [style.width.%]="pctStatus(s.count)"></div><b>{{ s.count }}</b></div>
          }
        </div>
        <div class="card"><h4>Alert Dispatch Today</h4>
          <div class="bar-row"><span>SMS</span><div class="bar" style="background:#dc3545" [style.width.%]="30"></div><b>{{ d().alert_stats?.sms_sent ?? 0 }}</b></div>
          <div class="bar-row"><span>Email</span><div class="bar" style="background:#fb8c00" [style.width.%]="30"></div><b>{{ d().alert_stats?.email_sent ?? 0 }}</b></div>
          <div class="bar-row"><span>App</span><div class="bar" style="background:#2196f3" [style.width.%]="30"></div><b>{{ d().alert_stats?.app_notifications ?? 0 }}</b></div>
        </div>
        <div class="card"><h4>Recent Incidents (24h)</h4>
          @for (i of d().recent_incidents ?? []; track i.id) {
            <div class="feed-item"><span class="sev" [style.background]="color(i.severity_level)">{{ i.severity_level }}</span>
              <a [routerLink]="['/m/response/incidents', i.id]" style="color:#e2e8f0; font-weight:600; margin-left:6px">{{ i.title }}</a></div>
          } @empty { <div style="color:#64748b; font-size:0.78rem">Quiet — no incidents in 24h.</div> }
        </div>
        <div class="card"><h4>Quick Actions</h4>
          <div class="qa">
            <button (click)="activate()"><i class="fas fa-bolt"></i> Activate Protocol</button>
            <a routerLink="/m/response/communication"><i class="fas fa-bullhorn"></i> Mass Alert</a>
            @if (canCreate()) { <a routerLink="/m/response/incidents/create"><i class="fas fa-plus"></i> New Incident</a> }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EoccBoardComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly canCreate = computed(() => this.auth.hasPermission('incidents.create'));
  readonly d = signal<any>({});
  readonly clock = signal('');
  readonly live = signal(true);
  private timers: any[] = [];
  private map: any;
  private markers: any[] = [];

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
    this.timers.push(setInterval(() => this.load(), POLL_MS));
    this.timers.push(setInterval(() => this.clock.set(new Date().toLocaleTimeString()), 1000));
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearInterval);
  }

  load(): void {
    this.http.get<any>('/api/v1/response/eocc').subscribe({
      next: d => {
        this.live.set(true);
        this.d.set(d);
        ensureLeaflet().then(() => this.renderMap(d.map_incidents ?? []));
      },
      error: () => this.live.set(false),   // poll failed — flag stale, keep last-good data on screen
    });
  }

  private renderMap(incidents: any[]): void {
    if (!this.map) {
      const el = document.getElementById('eocc-map');
      if (!el) { return; }
      this.map = buildTanzaniaMap('eocc-map');
      addMapNav(this.map, { dark: true, home: [-6.369028, 34.888822, 6] });
    }
    this.markers.forEach(m => m.remove());
    this.markers = incidents.map(i =>
      L.circleMarker([i.latitude, i.longitude], {
        radius: 10, color: '#0f172a', weight: 2,
        fillColor: SEVERITY_COLORS[i.severity_level] ?? '#6c757d', fillOpacity: 0.95,
      }).addTo(this.map).bindTooltip(`<b>${i.title}</b><br>${i.severity_level} · ${i.status}`));
  }

  /** Quick Action #1 — pick an open incident and open the emergency protocol. */
  activate(): void {
    this.http.get<any>('/api/v1/response/tasks/form-data').subscribe(fd => {
      const options = fd.incidents.map((i: any) => `<option value="${i.id}">${i.title}</option>`).join('');
      ensureSweetAlert().then(() => Swal.fire({
        title: 'Activate Emergency Protocol',
        html: `<select id="ap-incident" class="swal2-select" style="width:85%">${options}</select>
               <input id="ap-notes" class="swal2-input" placeholder="Activation notes (optional)">`,
        showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Activate',
        preConfirm: () => ({
          incident_id: Number((document.getElementById('ap-incident') as HTMLSelectElement).value),
          notes: (document.getElementById('ap-notes') as HTMLInputElement).value || null,
        }),
      }).then((r: any) => {
        if (r.isConfirmed) {
          this.http.post<any>('/api/v1/response/eocc/activate', r.value).subscribe({
            next: res => ensureSweetAlert().then(() => Swal.fire({
              icon: 'success', title: 'Activated', text: res.message, timer: 2600, showConfirmButton: false,
            }).then(() => this.load())),
            error: err => ensureSweetAlert().then(() =>
              Swal.fire('Error', err?.error?.detail ?? 'Activation failed.', 'error')),
          });
        }
      }));
    });
  }

  color(severity: string): string {
    return SEVERITY_COLORS[severity] ?? '#94a3b8';
  }

  pctSev(count: number): number {
    const max = Math.max(1, ...(this.d().incidents_by_severity ?? []).map((s: any) => s.count));
    return Math.max(4, (count / max) * 100);
  }

  pctStatus(count: number): number {
    const max = Math.max(1, ...(this.d().incidents_by_status ?? []).map((s: any) => s.count));
    return Math.max(4, (count / max) * 100);
  }
}

// ── Shared loaders (map standard + SweetAlert), module-scoped like the other pages ──

let leafletPromise: Promise<void> | null = null;
function ensureLeaflet(): Promise<void> {
  if (typeof L !== 'undefined') {
    return Promise.resolve();
  }
  if (!leafletPromise) {
    leafletPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return leafletPromise;
}

/** The project map standard: voyager tiles, Tanzania maxBounds, country mask + lakes. */
function buildTanzaniaMap(elementId: string): any {
  const map = L.map(elementId, {
    center: [-6.369028, 34.888822], zoom: 6, minZoom: 5,
    maxBounds: [[-12.0, 29.0], [-0.8, 41.0]],
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO', maxZoom: 18,
  }).addTo(map);
  fetch('/geojson/tz_boundary_simple.geojson').then(r => r.json()).then(adm0 => {
    L.geoJSON(adm0, { style: { color: '#475569', weight: 2, fill: false } }).addTo(map);
  });
  fetch('/geojson/tz_lakes.geojson').then(r => r.json()).then(lakes => {
    L.geoJSON(lakes, { style: { color: '#7cb3d4', weight: 1, fillColor: '#a5cde3', fillOpacity: 1 } }).addTo(map);
  });
  return map;
}

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
