import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';

/** Evacuation Centers → New Center — a real create form that POSTs to the Spring Boot API. */
@Component({
  selector: 'page-evacuation-center-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RegionDistrictPickerComponent],
  template: `
    <dmis-page-header title="New Evacuation Center" icon="fa-house-user"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Evacuation Centers', url:'/m/preparedness/evacuation-centers'}, {label:'New Center'}]">
    </dmis-page-header>

    <div class="panel-row">
      <dmis-panel title="Center Details" icon="fa-clipboard-list">
        <div class="form-body">
          <div class="form-grid">
            <div class="fg fg-wide">
              <label>Center Name <span class="req">*</span></label>
              <input type="text" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="e.g. Moshi Church Hall">
            </div>
            <div class="fg">
              <label>Center Type <span class="req">*</span></label>
              <select [value]="type()" (change)="type.set($any($event.target).value)">
                <option value="">Select type…</option>
                @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
              </select>
            </div>
            <div class="fg">
              <label>Status <span class="req">*</span></label>
              <select [value]="status()" (change)="status.set($any($event.target).value)">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <dmis-region-district class="fg-wide"
              [region]="region()" (regionChange)="region.set($event)"
              [district]="district()" (districtChange)="district.set($event)"
              [council]="council()" (councilChange)="council.set($event)" />
            <div class="fg">
              <label>Capacity (People)</label>
              <input type="number" min="0" [value]="capacity()" (input)="capacity.set($any($event.target).value)" placeholder="0">
            </div>
            <div class="fg">
              <label>Accessibility</label>
              <select [value]="accessibility()" (change)="accessibility.set($any($event.target).value)">
                <option value="">Select…</option>
                @for (a of accessOpts; track a) { <option [value]="a">{{ a }}</option> }
              </select>
            </div>
            <div class="fg">
              <label>Latitude</label>
              <input type="number" step="0.000001" [value]="latitude()" (input)="latitude.set($any($event.target).value)" placeholder="-3.35">
            </div>
            <div class="fg">
              <label>Longitude</label>
              <input type="number" step="0.000001" [value]="longitude()" (input)="longitude.set($any($event.target).value)" placeholder="37.34">
            </div>
          </div>

          @if (error()) { <div class="form-error"><i class="fas fa-exclamation-circle"></i> {{ error() }}</div> }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancel()">Cancel</button>
            <button type="button" class="btn-add" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Saving…' : (editId() ? 'Update Center' : 'Create Center') }}
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
    .req { color: #dc2626; }
    .fg input, .fg select { border: 1px solid var(--border); border-radius: 9px; padding: 0.5rem 0.65rem; font-size: 0.86rem; font-family: inherit; background: #fff; }
    .fg input:focus, .fg select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,51,102,0.08); }
    .form-error { margin-top: 0.9rem; background: rgba(220,38,38,0.08); color: #dc2626; padding: 0.55rem 0.8rem; border-radius: 9px; font-size: 0.82rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-ghost { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 9px; padding: 0.5rem 1.1rem; font-size: 0.84rem; cursor: pointer; }
    .btn-add[disabled] { opacity: 0.55; cursor: not-allowed; }
  `],
})
export class EvacuationCenterCreateComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  editId = signal<number | null>(null);

  types = ['Church hall', 'Community center', 'School', 'Stadium', 'Government building', 'Religious facility', 'Open ground'];
  statuses = ['Active', 'Under renovation', 'Inactive', 'Full'];
  accessOpts = ['Vehicle accessible', 'Wheelchair accessible', 'Limited access', 'Foot access only'];

  name = signal('');
  type = signal('');
  status = signal('Active');
  region = signal('');
  district = signal('');
  council = signal('');
  capacity = signal('');
  accessibility = signal('');
  latitude = signal('');
  longitude = signal('');
  saving = signal(false);
  error = signal('');

  valid = computed(() => this.name().trim().length > 0 && !!this.type() && !!this.status());

  ngOnInit(): void {
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (!edit) { return; }
    this.editId.set(Number(edit));
    this.http.get<any>(`/api/v1/evacuation-centers/${edit}`).subscribe({
      next: c => {
        this.name.set(c.centreName ?? '');
        this.type.set(c.centreType ?? '');
        this.status.set(c.status ?? 'Active');
        this.region.set(c.region ?? '');
        this.district.set(c.district ?? '');
        this.council.set(c.council ?? '');
        this.capacity.set(c.capacityPeople == null ? '' : String(c.capacityPeople));
        this.accessibility.set(c.accessibility ?? '');
        this.latitude.set(c.latitude == null ? '' : String(c.latitude));
        this.longitude.set(c.longitude == null ? '' : String(c.longitude));
      },
      error: () => this.error.set('Could not load the center for editing.'),
    });
  }

  submit(): void {
    if (!this.valid()) { this.error.set('Center Name, Type and Status are required.'); return; }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      centreName: this.name().trim(), centreType: this.type(), status: this.status(),
      region: this.region() || null, district: this.district() || null, council: this.council() || null,
      capacityPeople: this.capacity() === '' ? null : Number(this.capacity()),
      accessibility: this.accessibility() || null,
      latitude: this.latitude() === '' ? null : Number(this.latitude()),
      longitude: this.longitude() === '' ? null : Number(this.longitude()),
    };
    const id = this.editId();
    const req = id == null
      ? this.http.post('/api/v1/evacuation-centers', payload)
      : this.http.put(`/api/v1/evacuation-centers/${id}`, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/m/preparedness/evacuation-centers']); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || e?.error?.detail || 'Could not save the center. Please try again.'); },
    });
  }

  cancel(): void { this.router.navigate(['/m/preparedness/evacuation-centers']); }
}
