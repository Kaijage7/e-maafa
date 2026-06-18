import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';

/** Warehouses → New Warehouse — a real create form that POSTs to the Spring Boot warehouses API. */
@Component({
  selector: 'page-warehouse-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RegionDistrictPickerComponent],
  template: `
    <dmis-page-header title="New Warehouse" icon="fa-warehouse"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Warehouses', url:'/m/preparedness/warehouses'}, {label:'New Warehouse'}]">
    </dmis-page-header>

    <div class="panel-row">
      <dmis-panel title="Warehouse Details" icon="fa-clipboard-list">
        <div class="form-body">
          <div class="form-grid">
            <div class="fg">
              <label>Name <span class="req">*</span></label>
              <input type="text" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="e.g. Coastal Relief Hub">
            </div>
            <div class="fg">
              <label>Zone <span class="req">*</span></label>
              <select [value]="zone()" (change)="zone.set($any($event.target).value)">
                <option value="">Select zone…</option>
                @for (z of zones; track z) { <option [value]="z">{{ z }}</option> }
              </select>
            </div>
            <dmis-region-district class="fg-wide" [showCouncil]="false"
              [region]="region()" (regionChange)="region.set($event)"
              [district]="district()" (districtChange)="district.set($event)" />
            <div class="fg">
              <label>City / Area <span class="hint">(specific town / landmark)</span></label>
              <input type="text" [value]="cityOrRegion()" (input)="cityOrRegion.set($any($event.target).value)" placeholder="e.g. Vingunguti">
            </div>
            <div class="fg">
              <label>Storage Capacity (sqm)</label>
              <input type="number" min="0" [value]="capacity()" (input)="capacity.set($any($event.target).value)" placeholder="0">
            </div>
            <div class="fg fg-wide">
              <label>Location Address</label>
              <input type="text" [value]="address()" (input)="address.set($any($event.target).value)" placeholder="e.g. Vingunguti, Ilala">
            </div>
            <div class="fg">
              <label>Contact Person</label>
              <input type="text" [value]="contactName()" (input)="contactName.set($any($event.target).value)" placeholder="Full name">
            </div>
            <div class="fg">
              <label>Contact Phone</label>
              <input type="text" [value]="contactPhone()" (input)="contactPhone.set($any($event.target).value)" placeholder="07XX XXX XXX">
            </div>
            <div class="fg">
              <label>Operational Status</label>
              <select [value]="status()" (change)="status.set($any($event.target).value)">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <div class="fg"></div>
            <div class="fg">
              <label>Latitude</label>
              <input type="number" step="0.000001" [value]="latitude()" (input)="latitude.set($any($event.target).value)" placeholder="-6.8">
            </div>
            <div class="fg">
              <label>Longitude</label>
              <input type="number" step="0.000001" [value]="longitude()" (input)="longitude.set($any($event.target).value)" placeholder="39.2">
            </div>
          </div>

          @if (error()) { <div class="form-error"><i class="fas fa-exclamation-circle"></i> {{ error() }}</div> }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancel()">Cancel</button>
            <button type="button" class="btn-add" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Saving…' : 'Create Warehouse' }}
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
    .hint { font-weight: 400; color: var(--text-light); font-size: 0.72rem; }
    .req { color: #dc2626; }
    .fg input, .fg select { border: 1px solid var(--border); border-radius: 9px; padding: 0.5rem 0.65rem; font-size: 0.86rem; font-family: inherit; background: #fff; }
    .fg input:focus, .fg select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,51,102,0.08); }
    .form-error { margin-top: 0.9rem; background: rgba(220,38,38,0.08); color: #dc2626; padding: 0.55rem 0.8rem; border-radius: 9px; font-size: 0.82rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-ghost { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 9px; padding: 0.5rem 1.1rem; font-size: 0.84rem; cursor: pointer; }
    .btn-add[disabled] { opacity: 0.55; cursor: not-allowed; }
  `],
})
export class WarehouseCreateComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  editId = signal<number | null>(null);

  zones = ['Central Zone', 'Coastal Zone', 'Lake Zone', 'Northern Zone', 'Southern Highlands Zone', 'Western Zone', 'Zanzibar'];
  statuses = ['Operational', 'Full', 'Under renovation', 'Under construction', 'Decommissioned', 'Temporarily closed', 'Standby'];

  name = signal('');
  zone = signal('');
  region = signal('');
  district = signal('');
  cityOrRegion = signal('');
  address = signal('');
  capacity = signal('');
  contactName = signal('');
  contactPhone = signal('');
  status = signal('Operational');
  latitude = signal('');
  longitude = signal('');
  saving = signal(false);
  error = signal('');

  valid = computed(() => this.name().trim().length > 0 && !!this.zone());

  ngOnInit(): void {
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (!edit) { return; }
    this.editId.set(Number(edit));
    this.http.get<any>(`/api/v1/warehouses/${edit}`).subscribe({
      next: w => {
        this.name.set(w.name ?? '');
        this.zone.set(w.zone ?? '');
        this.region.set(w.region ?? '');
        this.district.set(w.district ?? '');
        this.cityOrRegion.set(w.cityOrRegion ?? '');
        this.address.set(w.locationAddress ?? '');
        this.capacity.set(w.storageCapacitySqm == null ? '' : String(w.storageCapacitySqm));
        this.contactName.set(w.contactPersonName ?? '');
        this.contactPhone.set(w.contactPersonPhone ?? '');
        this.status.set(w.operationalStatus ?? 'Operational');
        this.latitude.set(w.latitude == null ? '' : String(w.latitude));
        this.longitude.set(w.longitude == null ? '' : String(w.longitude));
      },
      error: () => this.error.set('Could not load the warehouse for editing.'),
    });
  }

  submit(): void {
    if (!this.valid()) { this.error.set('Name and Zone are required.'); return; }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      name: this.name().trim(), zone: this.zone(), cityOrRegion: this.cityOrRegion() || null,
      region: this.region() || null, district: this.district() || null,
      locationAddress: this.address() || null, storageCapacitySqm: this.capacity() === '' ? null : Number(this.capacity()),
      contactPersonName: this.contactName() || null, contactPersonPhone: this.contactPhone() || null,
      operationalStatus: this.status(), latitude: this.latitude() === '' ? null : Number(this.latitude()),
      longitude: this.longitude() === '' ? null : Number(this.longitude()),
    };
    const id = this.editId();
    const req = id == null
      ? this.http.post('/api/v1/warehouses', payload)
      : this.http.put(`/api/v1/warehouses/${id}`, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/m/preparedness/warehouses']); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || e?.error?.detail || 'Could not save the warehouse. Please try again.'); },
    });
  }

  cancel(): void { this.router.navigate(['/m/preparedness/warehouses']); }
}
