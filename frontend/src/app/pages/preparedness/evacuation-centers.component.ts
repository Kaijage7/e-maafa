import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { escapeHtml } from '../../core/html';
import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { addTanzaniaGisBase, addMapNav } from '../../core/tz-map';

declare const L: any; // Leaflet loaded globally (CDN, same as the existing view)

interface CenterRow {
  id: number; ecentreId: string; centreName: string; types: string[]; region: string; district: string;
  capacityPeople: number | null; status: string; accessibility: string;
  latitude: number | null; longitude: number | null;
}
interface EcResponse {
  centers: CenterRow[];
  stats: { total: number; active: number; totalCapacity: number; regionsCovered: number };
}

@Component({
  selector: 'page-evacuation-centers',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, DecimalPipe, RouterLink],
  template: `
    <dmis-page-header title="Evacuation Centers" icon="fa-house-user"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Evacuation Centers'}]">
      <a class="btn-add" routerLink="/m/preparedness/evacuation-centers/create"><i class="fas fa-plus"></i> Add Center</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Centers" icon="fa-building" color="#198754" />
      <dmis-stat-card [value]="stats().active" label="Active" icon="fa-check-circle" color="#0d6efd" />
      <dmis-stat-card [value]="stats().totalCapacity" label="Total Capacity" icon="fa-users" color="#6f42c1" />
      <dmis-stat-card [value]="stats().regionsCovered" label="Regions Covered" icon="fa-map-marked-alt" color="#FFD700" />
    </div>

    <div class="panel-row" style="animation-delay:.2s;">
      <dmis-panel title="Center Locations" icon="fa-map-marked-alt" [badge]="centers().length + ' centers'">
        <div class="panel-body">
          <div #centerMap id="centerMap" style="height:520px;border-radius:0 0 16px 16px;z-index:1;"></div>
        </div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search centers..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="region()" (change)="region.set($any($event.target).value)">
        <option value="">All Regions</option>
        @for (r of regions(); track r) { <option [value]="r">{{ r }}</option> }
      </select>
      <select [value]="status()" (change)="status.set($any($event.target).value)">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="under renovation">Under Renovation</option>
        <option value="closed">Closed</option>
        <option value="planned">Planned</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.30s;">
      <dmis-panel title="Evacuation Centers" icon="fa-database" [badge]="centers().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr>
                  <th>Name</th><th>Region / District</th><th>Type</th><th>Capacity</th>
                  <th>Status</th><th>Accessibility</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  @for (c of filtered(); track c.ecentreId) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ c.centreName }}</div><div class="r-subtitle">{{ c.ecentreId }}</div></td>
                      <td><div>{{ c.region || '-' }}</div><div class="r-subtitle">{{ c.district }}</div></td>
                      <td>
                        @for (t of c.types; track t) {
                          <span class="r-badge" style="background:rgba(25,135,84,0.1);color:#198754;margin:0.1rem;">{{ t }}</span>
                        }
                        @if (!c.types.length) { <span style="color:var(--text-light);">-</span> }
                      </td>
                      <td style="font-weight:600;">{{ c.capacityPeople ? (c.capacityPeople | number) : '-' }}</td>
                      <td><span class="r-badge {{ statusClass(c.status) }}">{{ c.status || 'N/A' }}</span></td>
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ c.accessibility || '-' }}</td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(c.ecentreId, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === c.ecentreId">
                            <a class="ctx-item" [routerLink]="['/m/preparedness/evacuation-centers/create']" [queryParams]="{edit: c.id}"><i class="fas fa-eye"></i> View</a>
                            <a class="ctx-item success" [routerLink]="['/m/preparedness/evacuation-centers/create']" [queryParams]="{edit: c.id}"><i class="fas fa-edit"></i> Edit</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state"><i class="fas fa-house-user"></i>No evacuation centers registered yet.</div>
          }
        </div>
      </dmis-panel>
    </div>
  `,
})
export class EvacuationCentersComponent {
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('centerMap');
  centers = signal<CenterRow[]>([]);
  stats = signal({ total: 0, active: 0, totalCapacity: 0, regionsCovered: 0 });
  search = signal('');
  region = signal('');
  status = signal('');
  openMenu = signal<string | null>(null);
  private map: any;

  constructor() {
    this.http.get<EcResponse>('/api/v1/evacuation-centers').subscribe(response => {
      this.centers.set(response.centers);
      this.stats.set(response.stats);
      this.renderMap();
    });
  }

  regions = computed(() => [...new Set(this.centers().map(c => c.region).filter(Boolean))]);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const r = this.region();
    const st = this.status().toLowerCase();
    return this.centers().filter(c => {
      const text = (c.centreName + ' ' + c.region + ' ' + c.district + ' ' + c.ecentreId).toLowerCase();
      return (!q || text.includes(q)) && (!r || c.region === r) && (!st || (c.status || '').toLowerCase() === st);
    });
  });

  statusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'active': return 'badge-active';
      case 'under renovation': return 'badge-pending';
      case 'closed': return 'badge-closed';
      case 'planned': return 'badge-planned';
      default: return 'badge-draft';
    }
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenu.update(c => (c === id ? null : id));
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.openMenu.set(null);
  }

  private renderMap(): void {
    setTimeout(() => {
      const el = this.mapEl()?.nativeElement;
      if (!el || this.map || typeof L === 'undefined') {
        return;
      }
      this.map = L.map(el, { maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0, attributionControl: false, minZoom: 5 }).setView([-6.5, 35.0], 6);
      // Markers go in a dedicated pane ABOVE the GIS base: addTanzaniaGisBase loads its country/region
      // polygons asynchronously and would otherwise stack on top of the markers, leaving the map looking empty.
      this.map.createPane('siteMarkers');
      this.map.getPane('siteMarkers').style.zIndex = 650;
      addTanzaniaGisBase(this.map, this.http);
      addMapNav(this.map, { home: [-6.5, 35.0, 6] });
      for (const c of this.centers()) {
        if (c.latitude && c.longitude) {
          L.circleMarker([c.latitude, c.longitude], { pane: 'siteMarkers', radius: 8, fillColor: '#198754', color: '#fff', weight: 2, fillOpacity: 0.9 })
            .addTo(this.map)
            .bindPopup('<b>' + escapeHtml(c.centreName) + '</b><br>Capacity: ' + (c.capacityPeople ?? 'N/A') + '<br>Status: ' + escapeHtml(c.status ?? 'N/A'));
        }
      }
    }, 0);
  }
}
