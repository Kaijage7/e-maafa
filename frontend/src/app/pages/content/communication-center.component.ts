import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { EmailManagementComponent } from './email-management.component';
import { SmsManagementComponent } from './sms-management.component';

const CH_COLOR: Record<string, string> = {
  SMS: '#e83e8c', Email: '#7c3aed', 'In-App': '#0d6efd', Alerts: '#d97706',
};
const STATUS_BADGE: Record<string, string> = {
  delivered: 'badge-approved', sent: 'badge-approved', read: 'badge-approved',
  pending: 'badge-pending', unread: 'badge-pending', failed: 'badge-rejected',
};

/**
 * Communication Center — the single home for all outbound messaging. One screen, three tabs:
 *  • Overview — cross-channel rollup (SMS / email / in-app / alerts), success rates, by-corner + recent feed.
 *  • SMS / Email — compose & send (manual / bulk / by audience) + the filterable delivery log, embedded
 *    from the dedicated components so there are no duplicate standalone screens.
 * Overview backed by GET /v1/communication/overview.
 */
@Component({
  selector: 'page-communication-center',
  standalone: true,
  imports: [FormsModule, DatePipe, PageHeaderComponent, PanelComponent, StatCardComponent,
    SmsManagementComponent, EmailManagementComponent],
  template: `
    <dmis-page-header title="Communication Center" icon="fa-tower-broadcast"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Communication Center'}]">
    </dmis-page-header>

    <div style="display:flex;gap:0.4rem;border-bottom:1px solid var(--border);margin-bottom:1rem;">
      @for (t of tabs; track t.key) {
        <button (click)="tab.set(t.key)"
          style="background:none;border:none;padding:0.7rem 1.1rem;cursor:pointer;font-size:0.9rem;font-weight:600;"
          [style.color]="tab() === t.key ? t.color : 'var(--text-mid)'"
          [style.border-bottom]="tab() === t.key ? ('3px solid ' + t.color) : '3px solid transparent'">
          <i class="fas {{ t.icon }}"></i> {{ t.label }}
        </button>
      }
    </div>

    @if (tab() === 'overview') {
      <div class="panel-body" style="display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;margin-bottom:0.4rem;">
        <span style="color:var(--text-mid);font-size:0.85rem;">Period:</span>
        <select class="form-select" style="max-width:180px;" [(ngModel)]="range" (change)="reload()">
          <option value="today">Today</option><option value="week">Last 7 days</option>
          <option value="month">This month</option><option value="all">All time</option>
        </select>
      </div>

      <div class="stats-row">
        <dmis-stat-card [value]="sms()['total'] ?? 0" label="SMS Sent" icon="fa-sms" color="#e83e8c" />
        <dmis-stat-card [value]="email()['total'] ?? 0" label="Emails Sent" icon="fa-envelope" color="#7c3aed" />
        <dmis-stat-card [value]="inapp()['total'] ?? 0" label="In-App" icon="fa-bell" color="#0d6efd" />
        <dmis-stat-card [value]="alerts()['today'] ?? 0" label="Alerts Today" icon="fa-tower-broadcast" color="#d97706" />
      </div>

      <div class="panel-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <dmis-panel title="Delivery by Channel" icon="fa-chart-simple">
          <div class="panel-body" style="display:flex;flex-direction:column;gap:0.8rem;">
            @for (c of byChannel(); track c.channel) {
              <div>
                <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.2rem;">
                  <span style="font-weight:600;">{{ c.channel }}</span><span style="color:var(--text-mid);">{{ c.count }}</span>
                </div>
                <div style="height:8px;background:var(--surface-2, #f1f5f9);border-radius:4px;overflow:hidden;">
                  <div [style.width.%]="pct(c.count)" [style.background]="color(c.channel)" style="height:100%;"></div>
                </div>
              </div>
            } @empty { <div style="color:var(--text-light);padding:1rem;text-align:center;">No activity in this period.</div> }
          </div>
          <div class="panel-body" style="display:flex;gap:1.4rem;flex-wrap:wrap;border-top:1px solid var(--border);font-size:0.82rem;">
            <div><span style="color:var(--text-mid);">SMS success</span><br><strong style="color:#059669;">{{ sms()['success_rate'] ?? 0 }}%</strong></div>
            <div><span style="color:var(--text-mid);">Email success</span><br><strong style="color:#059669;">{{ email()['success_rate'] ?? 0 }}%</strong></div>
            <div><span style="color:var(--text-mid);">SMS failed</span><br><strong style="color:#dc2626;">{{ sms()['failed'] ?? 0 }}</strong></div>
            <div><span style="color:var(--text-mid);">Email failed</span><br><strong style="color:#dc2626;">{{ email()['failed'] ?? 0 }}</strong></div>
            <div><span style="color:var(--text-mid);">Unread in-app</span><br><strong style="color:#d97706;">{{ inapp()['unread'] ?? 0 }}</strong></div>
          </div>
        </dmis-panel>

        <dmis-panel title="By Corner" icon="fa-sitemap" [badge]="byCorner().length + ' sources'">
          <div class="panel-body" style="display:flex;flex-direction:column;gap:0.7rem;">
            @for (c of byCorner(); track c.corner) {
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;">
                <span>{{ c.corner }}</span>
                <span class="r-badge" style="background:rgba(13,110,253,0.08);color:#0d6efd;">{{ c.count }}</span>
              </div>
            } @empty { <div style="color:var(--text-light);padding:1rem;text-align:center;">No corner activity yet.</div> }
          </div>
        </dmis-panel>
      </div>

      <div class="panel-row">
        <dmis-panel title="Recent Activity" icon="fa-clock-rotate-left" [badge]="recent().length + ' events'">
          <div class="panel-body" style="padding:0;">
            <table class="r-table">
              <thead><tr><th>Channel</th><th>Type</th><th>Recipient</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                @for (r of recent(); track $index) {
                  <tr class="data-row">
                    <td><span class="r-badge" [style.background]="color(r.channel) + '14'" [style.color]="color(r.channel)">{{ r.channel }}</span></td>
                    <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.type }}</td>
                    <td style="font-family:monospace;font-size:0.78rem;max-width:240px;overflow:hidden;text-overflow:ellipsis;">{{ r.recipient }}</td>
                    <td><span class="r-badge {{ badge(r.status) }}">{{ r.status }}</span></td>
                    <td style="font-size:0.78rem;color:var(--text-mid);">{{ r.created_at | date:'dd MMM, HH:mm' }}</td>
                  </tr>
                } @empty { <tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:2.5rem;">No recent communication activity.</td></tr> }
              </tbody>
            </table>
          </div>
        </dmis-panel>
      </div>
    } @else if (tab() === 'sms') {
      <page-sms-management [embedded]="true" />
    } @else {
      <page-email-management [embedded]="true" />
    }
  `,
})
export class CommunicationCenterComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/communication/overview';

  readonly tabs = [
    { key: 'overview', label: 'Overview', icon: 'fa-chart-line', color: '#0d6efd' },
    { key: 'sms', label: 'SMS', icon: 'fa-sms', color: '#e83e8c' },
    { key: 'email', label: 'Email', icon: 'fa-envelope', color: '#7c3aed' },
  ] as const;
  tab = signal<'overview' | 'sms' | 'email'>('overview');

  data = signal<any | null>(null);
  range = 'month';

  sms = computed<Record<string, number>>(() => this.data()?.sms ?? {});
  email = computed<Record<string, number>>(() => this.data()?.email ?? {});
  inapp = computed<Record<string, number>>(() => this.data()?.inapp ?? {});
  alerts = computed<Record<string, number>>(() => this.data()?.alerts ?? {});
  byChannel = computed<any[]>(() => this.data()?.by_channel ?? []);
  byCorner = computed<any[]>(() => this.data()?.by_corner ?? []);
  recent = computed<any[]>(() => this.data()?.recent ?? []);

  private maxChannel = computed<number>(() => Math.max(1, ...this.byChannel().map(c => Number(c.count) || 0)));

  constructor() { this.reload(); }

  reload(): void {
    this.http.get<any>(`${this.base}?range=${this.range}`).subscribe(d => this.data.set(d));
  }

  pct(count: number): number { return Math.round((Number(count) || 0) / this.maxChannel() * 100); }
  color(ch: string): string { return CH_COLOR[ch] ?? '#64748b'; }
  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
}
