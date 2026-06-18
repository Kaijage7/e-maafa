import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { escapeHtml } from '../../core/html';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { addTanzaniaGisBase, addMapNav } from '../../core/tz-map';

declare const L: any;

interface TempWhRow {
  id: number; name: string; code: string; level: string; region: string; district: string; location: string;
  status: string; active: boolean; contactName: string; contactPhone: string;
  latitude: number | null; longitude: number | null; established: string | null;
}
interface TwResponse {
  warehouses: TempWhRow[];
  stats: { total: number; active: number; regional: number; national: number };
}

@Component({
  selector: 'page-temporary-warehouses',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink],
  template: `
    <dmis-page-header title="Temporary Warehouses" icon="fa-warehouse"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Temporary Warehouses'}]">
      <a class="btn-add" routerLink="/m/preparedness/temporary-warehouses/create"><i class="fas fa-plus"></i> New Temporary Warehouse</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total" icon="fa-list" color="#198754" />
      <dmis-stat-card [value]="stats().active" label="Active" icon="fa-check-circle" color="#10b981" />
      <dmis-stat-card [value]="stats().regional" label="Regional" icon="fa-map" color="#3b82f6" />
      <dmis-stat-card [value]="stats().national" label="National" icon="fa-flag" color="#f59e0b" />
    </div>

    <div class="panel-row" style="animation-delay:.2s;">
      <dmis-panel title="Temporary Warehouse Locations" icon="fa-map-marked-alt" badge="Tanzania">
        <div class="panel-body"><div #twMap id="twMap" style="height:500px;width:100%;z-index:1;"></div></div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search temporary warehouses..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="level()" (change)="level.set($any($event.target).value)">
        <option value="">All Levels</option>
        <option value="District">District</option>
        <option value="Regional">Regional</option>
        <option value="National">National</option>
      </select>
      <select [value]="status()" (change)="status.set($any($event.target).value)">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="closed">Closed</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.30s;">
      <dmis-panel title="Temporary Warehouse Registry" icon="fa-database" [badge]="warehouses().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr>
                  <th>Name</th><th>Code</th><th>Level</th><th>Location</th><th>Status</th><th>Contact</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  @for (w of filtered(); track w.code) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ w.name }}</div>
                        <div class="r-subtitle">{{ w.region !== '-' ? w.region : '' }}{{ w.district !== '-' ? ' · ' + w.district : '' }}</div></td>
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ w.code || '-' }}</td>
                      <td><span class="r-badge" style="background:rgba(59,130,246,0.1);color:#2563eb;">{{ w.level || '-' }}</span></td>
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ w.location || '-' }}</td>
                      <td><span class="r-badge {{ statusClass(w.status) }}">{{ w.status || 'Unknown' }}</span></td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">{{ w.contactName || '-' }}
                        @if (w.contactPhone) { <div class="r-subtitle">{{ w.contactPhone }}</div> }</td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(w.code, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === w.code">
                            <a class="ctx-item" [routerLink]="['/m/preparedness/temporary-warehouses/create']" [queryParams]="{edit: w.id}"><i class="fas fa-eye"></i> View Details</a>
                            <a class="ctx-item success" [routerLink]="['/m/preparedness/temporary-warehouses/create']" [queryParams]="{edit: w.id}"><i class="fas fa-edit"></i> Edit</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state"><i class="fas fa-warehouse"></i>No temporary warehouses registered yet.</div>
          }
        </div>
      </dmis-panel>
    </div>
  `,
  styles: [`
    .badge-active { background: rgba(16,185,129,0.12); color: #059669; }
    .badge-inactive { background: rgba(156,163,175,0.15); color: #6b7280; }
    .badge-closed { background: rgba(220,38,38,0.12); color: #dc2626; }
  `],
})
export class TemporaryWarehousesComponent {
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('twMap');
  warehouses = signal<TempWhRow[]>([]);
  stats = signal({ total: 0, active: 0, regional: 0, national: 0 });
  search = signal('');
  level = signal('');
  status = signal('');
  openMenu = signal<string | null>(null);
  private map: any;

  constructor() {
    this.http.get<TwResponse>('/api/v1/temporary-warehouses').subscribe(r => {
      this.warehouses.set(r.warehouses);
      this.stats.set(r.stats);
      this.renderMap();
    });
  }

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const lv = this.level().toLowerCase();
    const st = this.status().toLowerCase();
    return this.warehouses().filter(w => {
      const text = (w.name + ' ' + w.code + ' ' + w.location + ' ' + w.contactName).toLowerCase();
      return (!q || text.includes(q)) && (!lv || (w.level || '').toLowerCase() === lv)
        && (!st || (w.status || '').toLowerCase() === st);
    });
  });

  statusClass(s: string): string { return 'badge-' + (s || '').toLowerCase().replace(/ /g, '-'); }
  toggleMenu(id: string, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }

  private renderMap(): void {
    setTimeout(() => {
      const el = this.mapEl()?.nativeElement;
      if (!el || this.map || typeof L === 'undefined') { return; }
      this.map = L.map(el, { center: [-6.5, 35.0], zoom: 6, minZoom: 5, maxZoom: 12,
        maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0, attributionControl: false });
      this.map.createPane('siteMarkers');
      this.map.getPane('siteMarkers').style.zIndex = 650;
      addTanzaniaGisBase(this.map, this.http);
      addMapNav(this.map, { home: [-6.5, 35.0, 6] });
      for (const w of this.warehouses()) {
        if (w.latitude && w.longitude) {
          L.circleMarker([w.latitude, w.longitude], { pane: 'siteMarkers', radius: 8, fillColor: w.active ? '#198754' : '#9ca3af', color: '#fff', weight: 2, fillOpacity: 0.85 })
            .addTo(this.map)
            .bindPopup('<strong>' + escapeHtml(w.name) + '</strong><br>' + escapeHtml(w.level) + ' · ' + escapeHtml(w.status || 'N/A') + '<br>' + escapeHtml(w.location || ''));
        }
      }
    }, 0);
  }
}
