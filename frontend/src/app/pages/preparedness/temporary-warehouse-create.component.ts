import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit,
  computed, inject, signal, viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { addMapNav, addTanzaniaGisBase } from '../../core/tz-map';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';

declare const L: any;

/** Temporary Warehouses → New/Edit — POST/PUT to Spring Boot API. */
@Component({
    selector: 'page-temporary-warehouse-create',
    imports: [PageHeaderComponent, PanelComponent, RegionDistrictPickerComponent],
    template: `
    <dmis-page-header [title]="editId() ? 'Edit Temporary Warehouse' : 'New Temporary Warehouse'" icon="fa-warehouse"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Temporary Warehouses', url:'/m/preparedness/temporary-warehouses'}, {label: editId() ? 'Edit' : 'New'}]">
    </dmis-page-header>

    <div class="panel-row">
      <dmis-panel title="Temporary Warehouse Details" icon="fa-clipboard-list">
        <div class="form-body">
          <div class="form-grid">
            <div class="fg fg-wide">
              <label>Name <span class="req">*</span></label>
              <input type="text" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="e.g. Ilala District Emergency Store">
            </div>
            <div class="fg">
              <label>Level <span class="req">*</span></label>
              <select [value]="level()" (change)="level.set($any($event.target).value)">
                <option value="">Select level…</option>
                @for (l of levels; track l) { <option [value]="l">{{ l }}</option> }
              </select>
            </div>
            <div class="fg">
              <label>Operational Status</label>
              <select [value]="status()" (change)="status.set($any($event.target).value)">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <dmis-region-district class="fg-wide"
              [region]="region()" (regionChange)="region.set($event)"
              [district]="district()" (districtChange)="district.set($event)"
              [council]="council()" (councilChange)="council.set($event)" />
            <div class="fg fg-wide">
              <label>Location Description <span class="hint">(specific address / landmark)</span></label>
              <input type="text" [value]="location()" (input)="location.set($any($event.target).value)" placeholder="e.g. Vingunguti ward, near the market">
            </div>
            <div class="fg">
              <label>Contact Person</label>
              <input type="text" [value]="contactName()" (input)="contactName.set($any($event.target).value)" placeholder="Full name">
            </div>
            <div class="fg">
              <label>Contact Phone</label>
              <input type="text" [value]="contactPhone()" (input)="contactPhone.set($any($event.target).value)" placeholder="07XX XXX XXX">
            </div>

            <div class="fg fg-wide map-pick-block">
              <div class="map-pick-head">
                <div>
                  <label style="margin:0"><i class="fas fa-map-marked-alt"></i> Map location</label>
                  <div class="map-pick-hint">
                    <b>Click the map</b> (or drag the pin) to capture latitude / longitude.
                  </div>
                </div>
                <button type="button" class="btn-clear" [disabled]="!latitude() && !longitude()" (click)="clearPoint()">
                  <i class="fas fa-times"></i> Clear pin
                </button>
              </div>
              <div #pickerMap class="picker-map" role="application"
                   aria-label="Click map to set temporary warehouse coordinates"></div>
              @if (mapNote()) {
                <div class="map-note" [class.map-note-warn]="mapNoteWarn()">
                  <i class="fas" [class.fa-check-circle]="!mapNoteWarn()" [class.fa-exclamation-triangle]="mapNoteWarn()"></i>
                  {{ mapNote() }}
                </div>
              }
            </div>

            <div class="fg">
              <label>Latitude <span class="hint">(auto from map click)</span></label>
              <input type="number" step="0.000001" [value]="latitude()"
                     (input)="onLatInput($any($event.target).value)" placeholder="-6.8">
            </div>
            <div class="fg">
              <label>Longitude <span class="hint">(auto from map click)</span></label>
              <input type="number" step="0.000001" [value]="longitude()"
                     (input)="onLngInput($any($event.target).value)" placeholder="39.2">
            </div>
          </div>

          @if (error()) { <div class="form-error"><i class="fas fa-exclamation-circle"></i> {{ error() }}</div> }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancel()">Cancel</button>
            <button type="button" class="btn-add" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Saving…' : (editId() ? 'Update Temporary Warehouse' : 'Create Temporary Warehouse') }}
            </button>
          </div>
        </div>
      </dmis-panel>
    </div>
  `,
    styles: [`
    .form-body { padding: 1.1rem 1.2rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 1.1rem; }
    .fg { display: flex; flex-direction: column; gap: 0.3rem; }
    .fg-wide { grid-column: 1 / -1; }
    .fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-mid); }
    .hint { font-weight: 400; color: var(--text-light); font-size: 0.75rem; }
    .req { color: #dc2626; }
    .fg input, .fg select { border: 1px solid var(--border); border-radius: 9px; padding: 0.5rem 0.65rem; font-size: 0.86rem; font-family: inherit; background: #fff; }
    .fg input:focus, .fg select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,51,102,0.08); }
    .form-error { margin-top: 0.9rem; background: rgba(220,38,38,0.08); color: #dc2626; padding: 0.55rem 0.8rem; border-radius: 9px; font-size: 0.82rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-ghost { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 8px; padding: 0.5rem 1.1rem; font-size: 0.84rem; cursor: pointer; }
    .btn-ghost:hover { background: #f7f9fb; }
    .btn-add[disabled] { opacity: 0.55; cursor: not-allowed; }
    .map-pick-block { gap: 0.55rem; }
    .map-pick-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
    .map-pick-hint { margin-top: 0.25rem; font-size: 0.78rem; font-weight: 400; color: #475569; line-height: 1.4; }
    .btn-clear { border: 1px solid var(--border); background: #fff; color: #64748b; border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.78rem; cursor: pointer; white-space: nowrap; }
    .btn-clear:hover:not([disabled]) { background: #f8fafc; color: #0f172a; }
    .btn-clear[disabled] { opacity: 0.45; cursor: not-allowed; }
    .picker-map { height: 360px; width: 100%; border-radius: 10px; border: 1px solid var(--border); z-index: 1; cursor: crosshair; background: #eef2f5; }
    .map-note { font-size: 0.78rem; color: #166534; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 0.45rem 0.7rem; line-height: 1.4; }
    .map-note-warn { color: #9a3412; background: #fff7ed; border-color: #fdba74; }
  `]
})
export class TemporaryWarehouseCreateComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  pickerMapEl = viewChild<ElementRef<HTMLElement>>('pickerMap');
  editId = signal<number | null>(null);

  levels = ['District', 'Regional', 'National'];
  statuses = ['Active', 'Inactive', 'Closed'];

  name = signal('');
  level = signal('');
  status = signal('Active');
  region = signal('');
  district = signal('');
  council = signal('');
  location = signal('');
  contactName = signal('');
  contactPhone = signal('');
  latitude = signal('');
  longitude = signal('');
  saving = signal(false);
  error = signal('');
  mapNote = signal('Click anywhere on the map to place the temporary warehouse pin.');
  mapNoteWarn = signal(false);

  private map: any;
  private marker: any;
  private mapInitTimer: ReturnType<typeof setTimeout> | null = null;
  private mapInitAttempts = 0;

  private static readonly TZ_LAT_MIN = -12.0;
  private static readonly TZ_LAT_MAX = -0.8;
  private static readonly TZ_LNG_MIN = 29.0;
  private static readonly TZ_LNG_MAX = 41.0;

  valid = computed(() => this.name().trim().length > 0 && !!this.level());

  ngOnInit(): void {
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (!edit) { return; }
    this.editId.set(Number(edit));
    this.http.get<any>(`/api/v1/temporary-warehouses/${edit}`).subscribe({
      next: w => {
        this.name.set(w.name ?? '');
        this.level.set(w.level ?? '');
        this.status.set(w.operationalStatus ?? 'Active');
        this.region.set(w.region ?? '');
        this.district.set(w.district ?? '');
        this.council.set(w.council ?? '');
        this.location.set(w.locationDescription ?? '');
        this.contactName.set(w.contactPersonName ?? '');
        this.contactPhone.set(w.contactPersonPhone ?? '');
        this.latitude.set(w.latitude == null ? '' : String(w.latitude));
        this.longitude.set(w.longitude == null ? '' : String(w.longitude));
        this.syncMarkerFromFields(true);
      },
      error: () => this.error.set('Could not load the temporary warehouse for editing.'),
    });
  }

  ngAfterViewInit(): void {
    this.scheduleMapInit();
  }

  ngOnDestroy(): void {
    if (this.mapInitTimer != null) {
      clearTimeout(this.mapInitTimer);
      this.mapInitTimer = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
    }
  }

  onLatInput(value: string): void {
    this.latitude.set(value);
    this.syncMarkerFromFields(false);
  }

  onLngInput(value: string): void {
    this.longitude.set(value);
    this.syncMarkerFromFields(false);
  }

  clearPoint(): void {
    this.latitude.set('');
    this.longitude.set('');
    if (this.marker && this.map) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
    this.mapNote.set('Pin cleared. Click the map to place a new location.');
    this.mapNoteWarn.set(false);
  }

  submit(): void {
    if (!this.valid()) { this.error.set('Name and Level are required.'); return; }
    const latRaw = this.latitude().trim();
    const lngRaw = this.longitude().trim();
    if ((latRaw === '') !== (lngRaw === '')) {
      this.error.set('Provide both latitude and longitude, or leave both empty.');
      return;
    }
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (latRaw !== '' && lngRaw !== '') {
      latitude = Number(latRaw);
      longitude = Number(lngRaw);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        this.error.set('Latitude and longitude must be valid numbers.');
        return;
      }
      if (!this.inTanzania(latitude, longitude)) {
        this.error.set(
          'Coordinates must be inside Tanzania (lat about −12…−0.8, lng about 29…41). '
          + 'Click the map inside the country bounds, or clear the pin.');
        return;
      }
    }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      name: this.name().trim(), level: this.level(), operationalStatus: this.status(),
      region: this.region() || null, district: this.district() || null, council: this.council() || null,
      locationDescription: this.location() || null, contactPersonName: this.contactName() || null,
      contactPersonPhone: this.contactPhone() || null,
      latitude, longitude,
    };
    const id = this.editId();
    const req = id == null
      ? this.http.post('/api/v1/temporary-warehouses', payload)
      : this.http.put(`/api/v1/temporary-warehouses/${id}`, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/m/preparedness/temporary-warehouses']); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || e?.error?.detail || 'Could not save the temporary warehouse. Please try again.'); },
    });
  }

  cancel(): void { this.router.navigate(['/m/preparedness/temporary-warehouses']); }

  private scheduleMapInit(): void {
    this.mapInitAttempts = 0;
    const tick = () => {
      if (this.initMap()) {
        return;
      }
      this.mapInitAttempts += 1;
      if (this.mapInitAttempts < 40) {
        this.mapInitTimer = setTimeout(tick, 50);
      }
    };
    this.mapInitTimer = setTimeout(tick, 0);
  }

  private initMap(): boolean {
    const el = this.pickerMapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined') {
      return !!this.map;
    }
    this.map = L.map(el, {
      center: [-6.5, 35.0],
      zoom: 6,
      minZoom: 5,
      maxZoom: 16,
      maxBounds: [[TemporaryWarehouseCreateComponent.TZ_LAT_MIN, TemporaryWarehouseCreateComponent.TZ_LNG_MIN],
                  [TemporaryWarehouseCreateComponent.TZ_LAT_MAX, TemporaryWarehouseCreateComponent.TZ_LNG_MAX]],
      maxBoundsViscosity: 1.0,
      scrollWheelZoom: true,
      attributionControl: false,
    });
    addTanzaniaGisBase(this.map, this.http);
    addMapNav(this.map, { home: [-6.5, 35.0, 6] });
    this.map.on('click', (e: any) => this.setPoint(e.latlng.lat, e.latlng.lng, true));
    setTimeout(() => this.map?.invalidateSize(), 200);
    this.syncMarkerFromFields(true);
    return true;
  }

  private setPoint(lat: number, lng: number, fromMapClick: boolean): void {
    if (!this.inTanzania(lat, lng)) {
      this.mapNote.set(
        `That point (${lat.toFixed(5)}, ${lng.toFixed(5)}) is outside Tanzania. `
        + 'Click inside the country so the store can appear on the map.');
      this.mapNoteWarn.set(true);
      return;
    }
    this.latitude.set(lat.toFixed(6));
    this.longitude.set(lng.toFixed(6));
    this.placeMarker(lat, lng, fromMapClick);
    this.mapNote.set(`Pinned at ${lat.toFixed(6)}, ${lng.toFixed(6)}. Drag the pin to adjust.`);
    this.mapNoteWarn.set(false);
    this.error.set('');
  }

  private placeMarker(lat: number, lng: number, pan: boolean): void {
    if (!this.map) {
      return;
    }
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], { draggable: true, autoPan: true }).addTo(this.map);
      this.marker.on('dragend', () => {
        const p = this.marker.getLatLng();
        this.setPoint(p.lat, p.lng, false);
      });
    }
    if (pan) {
      this.map.setView([lat, lng], Math.max(this.map.getZoom(), 9));
    }
  }

  private syncMarkerFromFields(pan: boolean): void {
    if (!this.map) {
      return;
    }
    const lat = parseFloat(this.latitude());
    const lng = parseFloat(this.longitude());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    if (!this.inTanzania(lat, lng)) {
      this.mapNote.set('Entered coordinates are outside Tanzania and will be rejected on save.');
      this.mapNoteWarn.set(true);
      return;
    }
    this.placeMarker(lat, lng, pan);
    this.mapNote.set(`Pinned at ${lat.toFixed(6)}, ${lng.toFixed(6)}. Click map or drag pin to adjust.`);
    this.mapNoteWarn.set(false);
  }

  private inTanzania(lat: number, lng: number): boolean {
    return lat >= TemporaryWarehouseCreateComponent.TZ_LAT_MIN && lat <= TemporaryWarehouseCreateComponent.TZ_LAT_MAX
      && lng >= TemporaryWarehouseCreateComponent.TZ_LNG_MIN && lng <= TemporaryWarehouseCreateComponent.TZ_LNG_MAX;
  }
}
