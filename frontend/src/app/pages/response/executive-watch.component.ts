import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';

/**
 * Executive Watch — the national situation picture for the PM / PS / Directors / President.
 * Two states (DHS NOC common-operating-picture doctrine): NORMAL MONITORING (the watch picture)
 * and NATIONAL RESPONSE ACTIVATED (incident COP + FEMA Community Lifelines + a decisions-pending
 * queue of declarations awaiting the executive's signature). Refreshes on a 30-second poll.
 */
@Component({
  selector: 'page-executive-watch',
  standalone: true,
  imports: [DecimalPipe, UpperCasePipe, RouterLink, PageHeaderComponent],
  styles: [`
    .mode { border-radius: 12px; padding: 14px 18px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
    .mode.monitoring { background: #065f46; color: #d1fae5; }
    .mode.activated { background: #7f1d1d; color: #fee2e2; }
    .mode b { font-size: 1.5rem; display: block; }
    .mode .sub { font-size: 0.8rem; opacity: 0.9; }
    .mode .clock { font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .tiles { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 14px; }
    .tile { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 11px 13px; }
    .tile b { font-size: 1.45rem; display: block; color: #0f172a; }
    .tile span { font-size: 0.64rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .split { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; }
    .card { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 13px 15px; margin-bottom: 12px; }
    .card h4 { margin: 0 0 10px; font-size: 0.78rem; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
    /* FEMA Community Lifelines board */
    .lifelines { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .ll { border-radius: 10px; padding: 10px 12px; color: #fff; }
    .ll.green { background: #15803d; }
    .ll.yellow { background: #b45309; }
    .ll.red { background: #b91c1c; }
    .ll b { font-size: 0.82rem; display: block; }
    .ll .st { font-size: 0.62rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; opacity: 0.95; }
    .ll small { font-size: 0.66rem; opacity: 0.92; display: block; margin-top: 3px; }
    .row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px dashed #e3e6ed; font-size: 0.82rem; }
    .pill { font-size: 0.62rem; font-weight: 700; border-radius: 8px; padding: 1px 8px; }
    .p-disaster { background: #fee2e2; color: #b91c1c; } .p-emergency { background: #fef3c7; color: #92400e; }
    .p-monitoring { background: #d1fae5; color: #065f46; } .p-safeguard { background: #dbeafe; color: #1e40af; }
    .p-fcast { background: #e0f2fe; color: #075985; } .p-sim { background: #f3e8ff; color: #6b21a8; }
    .decision { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 9px 11px; margin-bottom: 7px; font-size: 0.8rem; }
    .decision b { color: #92400e; }
    .empty { color: #94a3b8; font-size: 0.82rem; text-align: center; padding: 16px 0; }
    .decl { background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 8px; padding: 9px 11px; margin-bottom: 7px; font-size: 0.8rem; }
  `],
  template: `
    <dmis-page-header title="Executive Watch — National Situation Picture" icon="fa-binoculars"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Executive Watch'}]">
      <a routerLink="/m/response/coordination" class="btn-add"><i class="fas fa-tower-broadcast"></i> Command Post</a>
    </dmis-page-header>

    @if (d(); as data) {
      <div class="mode" [class.monitoring]="data.mode === 'monitoring'" [class.activated]="data.mode === 'activated'">
        <div>
          <b>{{ data.mode === 'activated' ? 'NATIONAL RESPONSE ACTIVATED' : 'NORMAL — NATIONAL MONITORING' }}</b>
          <span class="sub">{{ data.mode === 'activated'
            ? 'One or more disaster-posture activations or declarations are in force — executive coordination engaged.'
            : 'No active disaster. Watch desk monitoring hazards, early warnings and national situation 24/7.' }}</span>
        </div>
        <div style="text-align:right">
          <div class="clock">{{ clock() }}</div>
          <span class="sub">PMO · Disaster Management Division · EOCC</span>
          @if (data.simulations_running > 0) {
            <div class="sub" style="margin-top:4px"><i class="fas fa-vial"></i>
              {{ data.simulations_running }} exercise(s) in progress (excluded from this picture)</div>
          }
        </div>
      </div>

      <div class="tiles">
        <div class="tile"><b>{{ data.national.active_incidents }}</b><span>Active Incidents</span></div>
        <div class="tile"><b style="color:#dc2626">{{ data.national.critical_incidents }}</b><span>Critical</span></div>
        <div class="tile"><b>{{ data.national.active_activations }}</b><span>Activations ({{ data.national.anticipatory_activations }} anticipatory)</span></div>
        <div class="tile"><b>{{ data.national.stock_units | number }}</b><span>Stock Units</span></div>
        <div class="tile"><b>{{ data.national.people_under_aap | number }}</b><span>People under AAP</span></div>
        <div class="tile"><b>{{ data.alerts_today.total }}</b><span>Alerts Today</span></div>
      </div>

      <!-- FEMA Community Lifelines — the executive at-a-glance -->
      <div class="card">
        <h4><i class="fas fa-heart-pulse"></i> Community Lifelines — national status</h4>
        <div class="lifelines">
          @for (l of data.lifelines; track l.name) {
            <div class="ll" [class]="l.status">
              <span class="st">{{ l.status }}</span>
              <b>{{ l.name }}</b>
              <small>{{ l.basis }}</small>
              <small style="opacity:0.75">{{ l.lead }}</small>
            </div>
          }
        </div>
      </div>

      <div class="split">
        <div>
          <div class="card">
            <h4><i class="fas fa-tower-broadcast"></i> Active Activations</h4>
            @for (a of data.activations; track a.id) {
              <div class="row">
                <span class="pill" [class]="'p-' + a.posture">{{ a.posture | uppercase }}</span>
                @if (a.is_simulation) { <span class="pill p-sim">SIM</span> }
                @if (a.trigger_type === 'forecast') { <span class="pill p-fcast">ANTICIPATORY</span> }
                <b style="flex:1">{{ a.title }}</b>
                <span style="color:#6c757d">{{ a.completed_tasks }}/{{ a.total_tasks }} tasks</span>
                <a [routerLink]="['/m/response/coordination']" style="font-size:0.74rem">open</a>
              </div>
            } @empty { <div class="empty">No active activations — steady state.</div> }
          </div>
        </div>
        <div>
          <!-- The decisions only the executive can make -->
          <div class="card">
            <h4><i class="fas fa-gavel"></i> Decisions Pending (executive)</h4>
            @for (x of data.decisions_pending; track x.id) {
              <div class="decision">
                <b>{{ x.declaration_type === 'disaster_area' ? 'Disaster Area (s.32)' : 'State of Emergency (s.33)' }}</b>
                — {{ x.area_scope }}<br>
                <small><i class="fas fa-hourglass-half"></i> {{ x.awaiting }}</small>
              </div>
            } @empty { <div class="empty">No declarations awaiting decision.</div> }
          </div>
          <div class="card">
            <h4><i class="fas fa-file-contract"></i> Declarations in Force</h4>
            @for (x of data.active_declarations; track x.id) {
              <div class="decl">
                <b>{{ x.declaration_type === 'disaster_area' ? 'Disaster Area' : 'State of Emergency' }}</b>
                · {{ x.authority }}<br>{{ x.area_scope }}
                <small style="color:#6c757d; display:block">Until {{ x.effective_until ?? 'further notice' }}
                  {{ x.gazette_reference ? '· ' + x.gazette_reference : '' }}</small>
              </div>
            } @empty { <div class="empty">No declarations in force.</div> }
          </div>
          <div class="card">
            <h4><i class="fas fa-bullhorn"></i> Public Alerting Today</h4>
            <div class="row"><span style="flex:1">SMS</span><b>{{ data.alerts_today.sms }}</b></div>
            <div class="row"><span style="flex:1">Email</span><b>{{ data.alerts_today.email }}</b></div>
            <div class="row"><span style="flex:1">App push</span><b>{{ data.alerts_today.app }}</b></div>
          </div>
        </div>
      </div>
    } @else { <div class="empty">Loading national picture…</div> }
  `,
})
export class ExecutiveWatchComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  readonly d = signal<any | null>(null);
  readonly clock = signal('');
  private timers: any[] = [];

  ngOnInit(): void {
    this.load();
    this.timers.push(setInterval(() => this.load(), 30_000));
    this.timers.push(setInterval(() => this.clock.set(new Date().toLocaleString()), 1000));
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearInterval);
  }

  load(): void {
    this.http.get<any>('/api/v1/response/executive').subscribe(d => this.d.set(d));
  }
}
