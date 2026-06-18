import { DecimalPipe, KeyValuePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { escapeHtml } from '../../core/html';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { addMapNav, addTanzaniaGisBase } from '../../core/tz-map';

declare const L: any; // Leaflet loaded globally (index.html), as the Blade page pushes it per-page

interface InfraRow {
  id: number; name: string; type: string; locationDescription: string | null; address: string | null;
  capacity: number | null; status: string;
}
interface MapItem { id: number; name: string; type: string; latitude: number; longitude: number; status: string; }
interface InfraDetail extends InfraRow {
  latitude: number | null; longitude: number | null; contactPersonName: string | null;
  contactPersonPhone: string | null; contactPersonEmail: string | null; additionalInfo: string | null;
}
interface IndexResponse {
  infrastructureItems: InfraRow[];
  pagination: { currentPage: number; lastPage: number; total: number; firstItem: number; lastItem: number };
  stats: { total: number; operational: number; maintenance: number; atRisk: number };
  mapItems: MapItem[];
  typeGroups: Record<string, string[]>;
  statuses: string[];
}

/** Reproduction of admin/infrastructure_items/index-v2.blade.php (Prevention & Mitigation → Strategic Infrastructure). */
@Component({
  selector: 'page-infrastructure',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink, DecimalPipe, KeyValuePipe],
  styles: [`
    .st-operational { background: rgba(16,185,129,0.12); color: #059669; }
    .st-maintenance { background: rgba(245,158,11,0.12); color: #d97706; }
    .st-at-risk { background: rgba(220,38,38,0.12); color: #dc2626; }
    .st-closed { background: rgba(107,114,128,0.12); color: #6b7280; }
    .alert-container { position: fixed; top: calc(var(--topbar-h) + 12px); right: 12px; z-index: 9999; width: 320px; }
  `],
  template: `
    <dmis-page-header title="Strategic Infrastructure" icon="fa-road"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation', url:'/m/prevention-mitigation/dashboard'}, {label:'Strategic Infrastructure'}]">
      <a class="btn-add" routerLink="/m/prevention-mitigation/infrastructure/create"><i class="fas fa-plus"></i> Add New Item</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Items" icon="fa-building" color="#003366" />
      <dmis-stat-card [value]="stats().operational" label="Operational" icon="fa-check-circle" color="#059669" />
      <dmis-stat-card [value]="stats().maintenance" label="Under Maintenance" icon="fa-wrench" color="#d97706" />
      <dmis-stat-card [value]="stats().atRisk" label="At Risk" icon="fa-exclamation-triangle" color="#dc2626" />
    </div>

    <div class="panel-row full" style="animation-delay:.25s;">
      <dmis-panel title="Infrastructure Map" icon="fa-map-marked-alt" [badge]="mapItems().length + ' geo-located'">
        <div class="panel-body" style="padding:0.75rem;">
          @if (mapItems().length) {
            <div #infraMap id="infraMap" style="height:500px;border-radius:12px;z-index:1;"></div>
          } @else {
            <div style="display:flex;align-items:center;justify-content:center;height:500px;color:var(--text-light);font-size:0.82rem;">
              <div style="text-align:center;"><i class="fas fa-map-marked-alt" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:0.4rem;"></i>No geo-located infrastructure items</div>
            </div>
          }
        </div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search infrastructure..." [value]="search()" (input)="search.set($any($event.target).value)">
      </div>
      <select [value]="filterType()" (change)="filterType.set($any($event.target).value)">
        <option value="">All Types</option>
        @for (group of typeGroups() | keyvalue: keepOrder; track group.key) {
          <optgroup [label]="group.key">
            @for (t of group.value; track t) { <option [value]="t">{{ t }}</option> }
          </optgroup>
        }
      </select>
      <select [value]="filterStatus()" (change)="filterStatus.set($any($event.target).value)">
        <option value="">All Statuses</option>
        @for (s of statuses(); track s) { <option [value]="s">{{ s }}</option> }
      </select>
    </div>

    <div class="panel-row full" style="animation-delay:.30s;">
      <dmis-panel title="Infrastructure Registry" icon="fa-database" [badge]="pagination().total + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (items().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Capacity</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (item of items(); track item.id) {
                    <tr class="infra-row" [style.display]="rowVisible(item) ? '' : 'none'">
                      <td>
                        <div class="r-title">{{ item.name }}</div>
                        @if (item.address) { <div class="r-subtitle">{{ limit(item.address, 40) }}</div> }
                      </td>
                      <td><span class="r-badge" style="background:rgba(0,51,102,0.08);color:var(--primary);">{{ item.type }}</span></td>
                      <td style="color:var(--text-mid);font-size:0.72rem;">{{ limit(item.locationDescription, 30) || '-' }}</td>
                      <td style="color:var(--text-mid);">{{ item.capacity ? (item.capacity | number) : '-' }}</td>
                      <td><span class="r-badge {{ statusClass(item.status) }}">{{ item.status }}</span></td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(item.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === item.id">
                            <button class="ctx-item" (click)="viewItem(item.id)"><i class="fas fa-eye"></i> View</button>
                            <a class="ctx-item success" [routerLink]="['/m/prevention-mitigation/infrastructure', item.id, 'edit']"><i class="fas fa-edit"></i> Edit</a>
                            <div class="ctx-divider"></div>
                            <button class="ctx-item danger" (click)="askDelete(item)"><i class="fas fa-trash"></i> Delete</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <i class="fas fa-road"></i>
              No infrastructure items registered yet.<br>
              <a class="btn-add" routerLink="/m/prevention-mitigation/infrastructure/create" style="margin-top:0.6rem;display:inline-flex;">
                <i class="fas fa-plus"></i> Add First Item
              </a>
            </div>
          }
        </div>

        @if (pagination().lastPage > 1) {
          <div class="pagination-wrap">
            <span>Showing {{ pagination().firstItem }} to {{ pagination().lastItem }} of {{ pagination().total }}</span>
            <div class="page-links">
              @if (pagination().currentPage === 1) {
                <span style="opacity:0.4;">&laquo;</span>
              } @else {
                <a (click)="load(pagination().currentPage - 1)" style="cursor:pointer;">&laquo;</a>
              }
              @for (p of pageRange(); track p) {
                @if (p === pagination().currentPage) {
                  <span class="active">{{ p }}</span>
                } @else {
                  <a (click)="load(p)" style="cursor:pointer;">{{ p }}</a>
                }
              }
              @if (pagination().currentPage < pagination().lastPage) {
                <a (click)="load(pagination().currentPage + 1)" style="cursor:pointer;">&raquo;</a>
              } @else {
                <span style="opacity:0.4;">&raquo;</span>
              }
            </div>
          </div>
        }
      </dmis-panel>
    </div>

    <!-- View Modal -->
    <div class="v2-modal-backdrop" [class.open]="viewOpen()">
      <div class="v2-modal">
        <div class="v2-modal-header">
          <div class="modal-title"><i class="fas fa-eye"></i> Infrastructure Details</div>
          <button class="v2-modal-close" (click)="viewOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          @if (detail(); as d) {
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
              <div style="grid-column:1/-1;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Name</div><div style="font-weight:600;">{{ d.name || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Type</div><div><span class="r-badge" style="background:rgba(0,51,102,0.08);color:var(--primary);">{{ d.type || 'N/A' }}</span></div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Status</div><div style="color:var(--text-mid);">{{ d.status || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Capacity</div><div style="color:var(--text-mid);">{{ d.capacity || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Address</div><div style="color:var(--text-mid);">{{ d.address || 'N/A' }}</div></div>
              @if (d.contactPersonName) {
                <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Contact</div><div style="color:var(--text-mid);">{{ d.contactPersonName }}{{ d.contactPersonPhone ? ' (' + d.contactPersonPhone + ')' : '' }}</div></div>
              }
            </div>
            @if (d.locationDescription) {
              <div style="margin-top:0.8rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Location</div>
                <div style="font-size:0.78rem;color:var(--text-mid);line-height:1.5;">{{ d.locationDescription }}</div></div>
            }
          }
        </div>
      </div>
    </div>

    <!-- Delete Modal -->
    <div class="v2-modal-backdrop" [class.open]="deleteOpen()">
      <div class="v2-modal sm">
        <div class="v2-modal-header">
          <div class="modal-title danger"><i class="fas fa-exclamation-triangle"></i> Confirm Deletion</div>
          <button class="v2-modal-close" (click)="deleteOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin-bottom:1rem;">Are you sure you want to delete <strong>{{ deleteTarget()?.name }}</strong>?</p>
        </div>
        <div class="v2-modal-footer">
          <button class="btn-cancel" (click)="deleteOpen.set(false)">Cancel</button>
          <button class="btn-confirm danger" (click)="confirmDelete()"><i class="fas fa-trash"></i> Delete</button>
        </div>
      </div>
    </div>

    <div class="alert-container">
      @for (a of alerts(); track a.id) {
        <div class="v2-alert {{ a.type }}">
          <i class="fas fa-{{ a.type === 'success' ? 'check-circle' : 'exclamation-circle' }}"></i> {{ a.msg }}
          <button class="close-alert" (click)="dismissAlert(a.id)">&times;</button>
        </div>
      }
    </div>
  `,
})
export class InfrastructureComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('infraMap');

  items = signal<InfraRow[]>([]);
  pagination = signal({ currentPage: 1, lastPage: 1, total: 0, firstItem: 0, lastItem: 0 });
  stats = signal({ total: 0, operational: 0, maintenance: 0, atRisk: 0 });
  mapItems = signal<MapItem[]>([]);
  typeGroups = signal<Record<string, string[]>>({});
  statuses = signal<string[]>([]);
  search = signal('');
  filterType = signal('');
  filterStatus = signal('');
  openMenu = signal<number | null>(null);
  viewOpen = signal(false);
  detail = signal<InfraDetail | null>(null);
  deleteOpen = signal(false);
  deleteTarget = signal<InfraRow | null>(null);
  alerts = signal<{ id: number; type: string; msg: string }[]>([]);

  private map: any;
  private viewReady = false;
  private alertSeq = 0;

  /** Keeps the controller's optgroup order (keyvalue defaults to alphabetical). */
  keepOrder = () => 0;

  constructor() {
    this.load(1);
    const flash = history.state?.['success'];
    if (flash) {
      this.showAlert(flash, 'success');
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  load(page: number): void {
    this.http.get<IndexResponse>(`/api/v1/infrastructure-items?page=${page}`).subscribe(r => {
      this.items.set(r.infrastructureItems);
      this.pagination.set(r.pagination);
      this.stats.set(r.stats);
      this.mapItems.set(r.mapItems);
      this.typeGroups.set(r.typeGroups);
      this.statuses.set(r.statuses);
      this.renderMap();
    });
  }

  pageRange(): number[] {
    const p = this.pagination();
    const from = Math.max(1, p.currentPage - 2);
    const to = Math.min(p.lastPage, p.currentPage + 2);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  limit(value: string | null, max: number): string {
    if (!value) {
      return '';
    }
    return value.length > max ? value.slice(0, max) + '...' : value;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Operational': return 'st-operational';
      case 'Under Maintenance': return 'st-maintenance';
      case 'At Risk': return 'st-at-risk';
      case 'Closed': return 'st-closed';
      default: return '';
    }
  }

  rowVisible(item: InfraRow): boolean {
    const q = this.search().toLowerCase();
    const text = (item.name + ' ' + item.type + ' ' + (item.locationDescription ?? '') + ' ' + item.status).toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchType = !this.filterType() || item.type === this.filterType();
    const matchStatus = !this.filterStatus() || item.status === this.filterStatus();
    return matchSearch && matchType && matchStatus;
  }

  viewItem(id: number): void {
    this.http.get<InfraDetail>(`/api/v1/infrastructure-items/${id}`).subscribe({
      next: d => {
        this.detail.set(d);
        this.viewOpen.set(true);
      },
      error: () => this.showAlert('Error loading details', 'error'),
    });
  }

  askDelete(item: InfraRow): void {
    this.deleteTarget.set(item);
    this.deleteOpen.set(true);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.http.delete(`/api/v1/infrastructure-items/${target.id}`).subscribe({
      next: () => {
        this.deleteOpen.set(false);
        this.showAlert('Item deleted', 'success');
        setTimeout(() => this.load(this.pagination().currentPage), 1000);
      },
      error: err => {
        this.deleteOpen.set(false);
        this.showAlert(err.error?.detail || 'Error deleting item', 'error');
      },
    });
  }

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.openMenu.update(c => (c === id ? null : id));
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.openMenu.set(null);
  }

  showAlert(msg: string, type: 'success' | 'error'): void {
    const id = ++this.alertSeq;
    this.alerts.update(a => [...a, { id, type, msg }]);
    setTimeout(() => this.dismissAlert(id), 5000);
  }

  dismissAlert(id: number): void {
    this.alerts.update(a => a.filter(x => x.id !== id));
  }

  /** Map — copied from index-v2: Tanzania bounds, voyager tiles, status-colored circleMarkers. */
  private renderMap(): void {
    if (!this.viewReady) {
      return;
    }
    setTimeout(() => {
      const el = this.mapEl()?.nativeElement;
      if (!el || this.map || typeof L === 'undefined' || !this.mapItems().length) {
        return;
      }
      const tzBounds = L.latLngBounds(L.latLng(-12.0, 29.0), L.latLng(-0.8, 41.0));
      this.map = L.map(el, { maxBounds: tzBounds, maxBoundsViscosity: 1.0, minZoom: 5 }).fitBounds(tzBounds);
      addTanzaniaGisBase(this.map, this.http);   // shared Tanzania base (tiles + mask + lakes + region outlines)
      addMapNav(this.map, { home: [-6.4, 35.0, 6] });
      const statusColors: Record<string, string> = {
        Operational: '#059669', 'Under Maintenance': '#d97706', 'At Risk': '#dc2626',
        Closed: '#6b7280', Planned: '#004d66', Unknown: '#9ca3af',
      };
      for (const item of this.mapItems()) {
        const color = statusColors[item.status] || '#003366';
        L.circleMarker([item.latitude, item.longitude], { radius: 7, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85 })
          .addTo(this.map)
          .bindPopup('<div style="font-family:Inter,sans-serif;"><strong style="font-size:0.82rem;">' + escapeHtml(item.name)
            + '</strong><br><span style="font-size:0.7rem;color:#6b7280;">' + escapeHtml(item.type)
            + '</span><br><span style="font-size:0.65rem;font-weight:700;color:' + color + ';">' + escapeHtml(item.status) + '</span></div>');
      }
      setTimeout(() => this.map.invalidateSize(), 300);
    });
  }
}
