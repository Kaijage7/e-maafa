import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface SubRow {
  id: number; subscriptionId: string; fullName: string; location: string; channels: string[];
  phone: string; email: string; hazards: string[]; priority: string; active: boolean; subscribed: string;
}
interface AsResponse {
  subscriptions: SubRow[];
  stats: { total: number; active: number; sms: number; email: number };
}

@Component({
  selector: 'page-alert-subscriptions',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink],
  template: `
    <dmis-page-header title="Alert Subscriptions" icon="fa-bell"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Alert Subscriptions'}]">
      <a class="btn-add" routerLink="/m/preparedness/alert-subscriptions/create"><i class="fas fa-plus"></i> New Subscriber</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Subscribers" icon="fa-users" color="#198754" />
      <dmis-stat-card [value]="stats().active" label="Active" icon="fa-check-circle" color="#10b981" />
      <dmis-stat-card [value]="stats().sms" label="SMS" icon="fa-sms" color="#3b82f6" />
      <dmis-stat-card [value]="stats().email" label="Email" icon="fa-envelope" color="#f59e0b" />
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search subscribers..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="status()" (change)="status.set($any($event.target).value)">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Subscriber Registry" icon="fa-database" [badge]="subscriptions().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr>
                  <th>Subscriber</th><th>Contact</th><th>Channels</th><th>Hazards of Interest</th><th>Priority</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  @for (s of filtered(); track s.subscriptionId) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ s.fullName }}</div><div class="r-subtitle">{{ s.location || s.subscriptionId }}</div></td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">
                        @if (s.phone) { <div>{{ s.phone }}</div> }
                        @if (s.email) { <div class="r-subtitle">{{ s.email }}</div> }
                        @if (!s.phone && !s.email) { - }</td>
                      <td>@for (c of s.channels; track c) { <span class="r-badge" style="background:rgba(59,130,246,0.1);color:#2563eb;margin:0.1rem;">{{ c }}</span> }</td>
                      <td>@for (h of s.hazards; track h) { <span class="r-badge" style="background:rgba(245,158,11,0.12);color:#d97706;margin:0.1rem;">{{ h }}</span> }</td>
                      <td style="font-size:0.8rem;color:var(--text-mid);">{{ s.priority || '-' }}</td>
                      <td><span class="r-badge {{ s.active ? 'badge-approved' : 'badge-rejected' }}">{{ s.active ? 'Active' : 'Inactive' }}</span></td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(s.subscriptionId, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === s.subscriptionId">
                            <a class="ctx-item" [routerLink]="['/m/preparedness/alert-subscriptions/create']" [queryParams]="{edit: s.id}"><i class="fas fa-eye"></i> View Details</a>
                            <a class="ctx-item success" [routerLink]="['/m/preparedness/alert-subscriptions/create']" [queryParams]="{edit: s.id}"><i class="fas fa-edit"></i> Edit</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state"><i class="fas fa-bell"></i>No alert subscribers yet.</div>
          }
        </div>
      </dmis-panel>
    </div>
  `,
})
export class AlertSubscriptionsComponent {
  private http = inject(HttpClient);
  subscriptions = signal<SubRow[]>([]);
  stats = signal({ total: 0, active: 0, sms: 0, email: 0 });
  search = signal('');
  status = signal('');
  openMenu = signal<string | null>(null);

  constructor() {
    this.http.get<AsResponse>('/api/v1/alert-subscriptions').subscribe(r => {
      this.subscriptions.set(r.subscriptions);
      this.stats.set(r.stats);
    });
  }

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const st = this.status().toLowerCase();
    return this.subscriptions().filter(s => {
      const text = (s.fullName + ' ' + s.location + ' ' + s.phone + ' ' + s.email + ' ' + s.hazards.join(' ')).toLowerCase();
      const stMatch = !st || (st === 'active' ? s.active : !s.active);
      return (!q || text.includes(q)) && stMatch;
    });
  });

  toggleMenu(id: string, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
