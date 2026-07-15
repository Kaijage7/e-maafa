import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { escapeHtml } from '../../core/html';
import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { addTanzaniaGisBase, addMapNav } from '../../core/tz-map';

declare const L: any;

interface WarehouseRow {
  id: number; name: string; cityOrRegion: string; address: string; zone: string; capacitySqm: number | null;
  status: string; stocks: number; contactName: string; contactPhone: string;
  latitude: number | null; longitude: number | null;
  region?: string | null; district?: string | null;
}
interface WhResponse {
  warehouses: WarehouseRow[];
  stats: { total: number; operational: number; underMaintenance: number; totalCapacity: number };
}

@Component({
    selector: 'page-warehouses',
    imports: [PageHeaderComponent, PanelComponent, StatCardComponent, DecimalPipe, RouterLink],
    template: `
    <dmis-page-header title="Warehouses" icon="fa-warehouse"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Warehouses'}]">
      <a class="btn-add" routerLink="/m/preparedness/warehouses/create"><i class="fas fa-plus"></i> New Warehouse</a>
    </dmis-page-header>

    <div style="margin:0 0 12px;padding:10px 12px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:0.8rem;color:#166534;line-height:1.4">
      <i class="fas fa-link"></i>
      <b>Area-specific stores.</b> Region/district officers only see (and create) warehouses in their own area.
      During incidents, resource requests auto-prefer a warehouse matching the incident district, then region.
      When there is no incident traffic, this registry is for <b>preparedness stocking</b> — use Warehouse Ops to intake/transfer stock.
      National/zonal shared stores require the <code>warehouse_and_stock.view_national</code> permission (System Settings → Roles).
    </div>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Warehouses" icon="fa-list" color="#198754" />
      <dmis-stat-card [value]="stats().operational" label="Operational" icon="fa-check-circle" color="#10b981" />
      <dmis-stat-card [value]="stats().underMaintenance" label="Under Renovation" icon="fa-tools" color="#f59e0b" />
      <dmis-stat-card [value]="stats().totalCapacity" label="Total Capacity (sqm)" icon="fa-ruler-combined" color="#3b82f6" />
    </div>

    <div class="panel-row" style="animation-delay:.2s;">
      <dmis-panel title="Warehouse Locations" icon="fa-map-marked-alt" [badge]="mapBadge()">
        <div class="panel-body">
          @if (unmappedCount() > 0) {
            <div style="margin:0 0 10px;padding:8px 10px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;font-size:0.78rem;color:#9a3412;line-height:1.4">
              <i class="fas fa-map-marker-alt"></i>
              <b>{{ unmappedCount() }} warehouse(s) not plotted</b> — missing coordinates or coordinates outside Tanzania.
              Edit the warehouse and set latitude/longitude inside Tanzania (lat ≈ −12…−0.8, lng ≈ 29…41),
              or set Region so the server can use the region centroid.
            </div>
          }
          <div #warehouseMap id="warehouseMap" style="height:500px;width:100%;z-index:1;"></div>
        </div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search warehouses..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="status()" (change)="status.set($any($event.target).value)">
        <option value="">All Statuses</option>
        <option value="operational">Operational</option>
        <option value="full">Full</option>
        <option value="under renovation">Under Renovation</option>
        <option value="under construction">Under Construction</option>
        <option value="decommissioned">Decommissioned</option>
        <option value="temporarily closed">Temporarily Closed</option>
        <option value="standby">Standby</option>
      </select>
      <select [value]="zone()" (change)="zone.set($any($event.target).value)">
        <option value="">All Zones</option>
        @for (z of zones(); track z) { <option [value]="z.toLowerCase()">{{ z }}</option> }
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.30s;">
      <dmis-panel title="Warehouse Registry" icon="fa-database" [badge]="warehouses().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr>
                  <th>Name</th><th>Area</th><th>Location</th><th>Zone</th><th>Capacity (sqm)</th>
                  <th>Status</th><th>Stock (units)</th><th>Contact</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  @for (w of filtered(); track w.name) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ w.name }}</div></td>
                      <td style="font-size:0.78rem;color:#475569">
                        @if (w.region || w.district) {
                          {{ w.region || '—' }}@if (w.district) { · {{ w.district }} }
                        } @else {
                          <span style="color:#94a3b8">National / shared</span>
                        }
                      </td>
                      <td>
                        <div style="font-size:0.82rem;color:var(--text-mid);">{{ w.cityOrRegion || '-' }}</div>
                        <div class="r-subtitle">{{ w.address }}</div>
                        @if (!hasMapCoords(w)) {
                          <div class="r-subtitle" style="color:#c2410c"><i class="fas fa-exclamation-triangle"></i> Not on map</div>
                        }
                      </td>
                      <td><span class="r-badge" style="background:rgba(25,135,84,0.1);color:#198754;">{{ w.zone || '-' }}</span></td>
                      <td style="font-size:0.85rem;font-weight:600;color:var(--text-dark);">{{ w.capacitySqm ? (w.capacitySqm | number) : '-' }}</td>
                      <td><span class="r-badge {{ statusClass(w.status) }}">{{ w.status || 'Unknown' }}</span></td>
                      <td><span class="r-badge badge-info">{{ w.stocks | number }}</span></td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">
                        {{ w.contactName || '-' }}
                        @if (w.contactPhone) { <div class="r-subtitle">{{ w.contactPhone }}</div> }
                      </td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(w.name, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === w.name">
                            <a class="ctx-item" [routerLink]="['/m/response/warehouse-ops']" [queryParams]="{warehouse: w.id, type: 'zonal'}"><i class="fas fa-boxes"></i> Manage Stock</a>
                            <a class="ctx-item" [routerLink]="['/m/response/warehouse-ops']" [queryParams]="{warehouse: w.id, type: 'zonal'}"><i class="fas fa-eye"></i> View Details</a>
                            <a class="ctx-item success" [routerLink]="['/m/preparedness/warehouses/create']" [queryParams]="{edit: w.id}"><i class="fas fa-edit"></i> Edit</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state"><i class="fas fa-warehouse"></i>No warehouses registered yet.</div>
          }
        </div>
      </dmis-panel>
    </div>
  `,
    styles: [`
    .badge-operational { background: rgba(16,185,129,0.12); color: #059669; }
    .badge-full { background: rgba(59,130,246,0.12); color: #2563eb; }
    .badge-under-renovation { background: rgba(245,158,11,0.12); color: #d97706; }
    .badge-under-construction { background: rgba(245,158,11,0.12); color: #d97706; }
    .badge-decommissioned { background: rgba(156,163,175,0.15); color: #6b7280; }
    .badge-temporarily-closed { background: rgba(220,38,38,0.12); color: #dc2626; }
    .badge-standby { background: rgba(0,77,102,0.12); color: #004d66; }
    .badge-info { background: rgba(59,130,246,0.12); color: #2563eb; }
  `]
})
export class WarehousesComponent {
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('warehouseMap');
  warehouses = signal<WarehouseRow[]>([]);
  stats = signal({ total: 0, operational: 0, underMaintenance: 0, totalCapacity: 0 });
  search = signal('');
  status = signal('');
  zone = signal('');
  openMenu = signal<string | null>(null);
  private map: any;
  private markersLayer: any;
  private mapRenderAttempts = 0;

  /** Same viewport as Leaflet maxBounds — markers outside never appear. */
  private static readonly TZ_LAT_MIN = -12.0;
  private static readonly TZ_LAT_MAX = -0.8;
  private static readonly TZ_LNG_MIN = 29.0;
  private static readonly TZ_LNG_MAX = 41.0;

  constructor() {
    this.http.get<WhResponse>('/api/v1/warehouses').subscribe(response => {
      this.warehouses.set(response.warehouses ?? []);
      this.stats.set(response.stats);
      this.scheduleMapRender();
    });
  }

  zones = computed(() => [...new Set(this.warehouses().map(w => w.zone).filter(Boolean))]);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const st = this.status().toLowerCase();
    const z = this.zone().toLowerCase();
    return this.warehouses().filter(w => {
      const text = (w.name + ' ' + w.zone + ' ' + w.cityOrRegion + ' ' + w.address + ' ' + w.contactName).toLowerCase();
      return (!q || text.includes(q)) && (!st || (w.status || '').toLowerCase() === st) && (!z || (w.zone || '').toLowerCase() === z);
    });
  });

  unmappedCount = computed(() => this.warehouses().filter(w => !this.hasMapCoords(w)).length);

  mapBadge = computed(() => {
    const plotted = this.warehouses().length - this.unmappedCount();
    return `${plotted} plotted`;
  });

  hasMapCoords(w: WarehouseRow): boolean {
    const lat = w.latitude;
    const lng = w.longitude;
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return false;
    }
    return lat >= WarehousesComponent.TZ_LAT_MIN && lat <= WarehousesComponent.TZ_LAT_MAX
      && lng >= WarehousesComponent.TZ_LNG_MIN && lng <= WarehousesComponent.TZ_LNG_MAX;
  }

  statusClass(status: string): string {
    return 'badge-' + (status || '').toLowerCase().replace(/ /g, '-');
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenu.update(c => (c === id ? null : id));
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.openMenu.set(null);
  }

  /** Retry until the map host exists (API can resolve before the view child is ready). */
  private scheduleMapRender(): void {
    this.mapRenderAttempts = 0;
    const tick = () => {
      if (this.renderMap()) {
        return;
      }
      this.mapRenderAttempts += 1;
      if (this.mapRenderAttempts < 40) {
        setTimeout(tick, 50);
      }
    };
    setTimeout(tick, 0);
  }

  private renderMap(): boolean {
    const el = this.mapEl()?.nativeElement;
    if (!el || typeof L === 'undefined') {
      return false;
    }
    if (!this.map) {
      this.map = L.map(el, {
        center: [-6.5, 35.0], zoom: 6, minZoom: 5, maxZoom: 12,
        maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0, attributionControl: false,
      });
      this.map.createPane('siteMarkers');
      this.map.getPane('siteMarkers').style.zIndex = 650;
      addTanzaniaGisBase(this.map, this.http);
      addMapNav(this.map, { home: [-6.5, 35.0, 6] });
      this.markersLayer = L.layerGroup().addTo(this.map);
    }
    if (this.markersLayer) {
      this.markersLayer.clearLayers();
    }
    const points: [number, number][] = [];
    for (const w of this.warehouses()) {
      if (!this.hasMapCoords(w)) {
        continue;
      }
      const lat = Number(w.latitude);
      const lng = Number(w.longitude);
      points.push([lat, lng]);
      L.circleMarker([lat, lng], {
        pane: 'siteMarkers', radius: 8, fillColor: '#198754', color: '#fff',
        weight: 2, opacity: 1, fillOpacity: 0.8,
      })
        .addTo(this.markersLayer)
        .bindPopup('<strong>' + escapeHtml(w.name) + '</strong><br>' + escapeHtml(w.zone || '')
          + '<br>Status: ' + escapeHtml(w.status || 'N/A')
          + (w.capacitySqm ? '<br>Capacity: ' + w.capacitySqm.toLocaleString() + ' sqm' : '')
          + (w.region || w.district
            ? '<br>' + escapeHtml([w.region, w.district].filter(Boolean).join(' · '))
            : ''));
    }
    if (points.length === 1) {
      this.map.setView(points[0], 8);
    } else if (points.length > 1) {
      this.map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 9 });
    }
    setTimeout(() => this.map?.invalidateSize(), 100);
    return true;
  }
}
