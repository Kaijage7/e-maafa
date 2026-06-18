import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface FormData {
  hazards: { id: number; name: string }[];
  incident_types: { id: number; name: string; default_severity: string | null }[];
  regions: { id: number; name: string }[];
  assignable_users: { id: number; name: string }[];
  severity_levels: string[];
  statuses: string[];
  sources_of_report: string[];
  infrastructure_damage_options: Record<string, string>;
  emergency_needs_options: Record<string, string>;
}

/**
 * Reproduction of admin/incidents/create.blade.php + edit.blade.php — the full
 * SRS incident report: classification, location, reporting source, casualty
 * figures (M/F with auto-totals), vulnerable groups, infrastructure damage
 * checkboxes, emergency needs, action taken, multi-photo + video evidence.
 * Dual-mode create/edit by route param, save or save-and-new (source parity).
 */
@Component({
  selector: 'page-incident-form',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .section-title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #dc3545; margin: 1.1rem 0 0.6rem; }
    .section-title:first-child { margin-top: 0; }
    .form-label { font-size: 0.78rem; font-weight: 600; }
    .check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.25rem 1rem; }
    .photo-chip { display: inline-flex; align-items: center; gap: 0.4rem; background: #f1f5f9; border-radius: 8px; padding: 0.25rem 0.6rem; font-size: 0.72rem; margin: 0 0.3rem 0.3rem 0; }
    .photo-chip button { border: none; background: none; color: #dc3545; cursor: pointer; }
  `],
  template: `
    <dmis-page-header [title]="isEdit() ? 'Edit Incident' : 'Log New Incident'" icon="fa-exclamation-triangle"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'},
        {label:'Incidents', url:'/m/response/incidents'}, {label: isEdit() ? 'Edit' : 'Create'}]">
      <a routerLink="/m/response/incidents" class="btn-add" style="background:var(--text-mid);"><i class="fas fa-arrow-left"></i> Back</a>
    </dmis-page-header>

    <div class="panel-row full">
      <dmis-panel [title]="isEdit() ? 'Incident Details' : 'Incident Report Form'" icon="fa-file-alt">
        <div class="panel-body">
          @if (errors().length) {
            <div class="alert alert-danger"><ul class="mb-0">@for (e of errors(); track $index) { <li>{{ e }}</li> }</ul></div>
          }

          <div class="section-title"><i class="fas fa-clipboard-list me-1"></i> Classification</div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Title <span class="text-danger">*</span></label>
              <input type="text" class="form-control" [(ngModel)]="form.title">
            </div>
            <div class="col-md-3">
              <label class="form-label">Hazard <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="form.hazard_id">
                <option value="">Select Hazard</option>
                @for (h of fd()?.hazards ?? []; track h.id) { <option [value]="h.id">{{ h.name }}</option> }
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Incident Type</label>
              <select class="form-select" [(ngModel)]="form.incident_type_id" (ngModelChange)="applyDefaultSeverity($event)">
                <option value="">Select Type (optional)</option>
                @for (t of fd()?.incident_types ?? []; track t.id) { <option [value]="t.id">{{ t.name }}</option> }
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Severity <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="form.severity_level">
                @for (s of fd()?.severity_levels ?? []; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Operational Status <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="form.status">
                @for (s of fd()?.statuses ?? []; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Reported At <span class="text-danger">*</span></label>
              <input type="datetime-local" class="form-control" [(ngModel)]="form.reported_at">
            </div>
            <div class="col-md-3">
              <label class="form-label">Origin Level</label>
              <select class="form-select" [(ngModel)]="form.origin_level">
                <option value="district">District</option>
                <option value="regional">Regional</option>
              </select>
            </div>
            <div class="col-md-12">
              <label class="form-label">Description</label>
              <textarea rows="3" class="form-control" [(ngModel)]="form.description"></textarea>
            </div>
          </div>

          <div class="section-title"><i class="fas fa-map-marker-alt me-1"></i> Location</div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Location Description <span class="text-danger">*</span></label>
              <input type="text" class="form-control" [(ngModel)]="form.location_description">
            </div>
            <div class="col-md-3">
              <label class="form-label">Region</label>
              <select class="form-select" [(ngModel)]="form.region_id" (ngModelChange)="onRegionChange($event)">
                <option value="">Select Region</option>
                @for (r of fd()?.regions ?? []; track r.id) { <option [value]="r.id">{{ r.name }}</option> }
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">District</label>
              <select class="form-select" [(ngModel)]="form.district_id">
                <option value="">Select District</option>
                @for (d of districts(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
              </select>
            </div>
            <div class="col-md-3"><label class="form-label">Latitude</label><input type="number" step="0.0000001" class="form-control" [(ngModel)]="form.latitude"></div>
            <div class="col-md-3"><label class="form-label">Longitude</label><input type="number" step="0.0000001" class="form-control" [(ngModel)]="form.longitude"></div>
          </div>

          <div class="section-title"><i class="fas fa-user me-1"></i> Reporting Source</div>
          <div class="row g-3">
            <div class="col-md-3"><label class="form-label">Reported By</label><input type="text" class="form-control" [(ngModel)]="form.reported_by_name"></div>
            <div class="col-md-3"><label class="form-label">Contact</label><input type="text" class="form-control" [(ngModel)]="form.reported_by_contact"></div>
            <div class="col-md-3">
              <label class="form-label">Source of Report</label>
              <select class="form-select" [(ngModel)]="form.source_of_report">
                <option value="">Select Source</option>
                @for (s of fd()?.sources_of_report ?? []; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Assign To</label>
              <select class="form-select" [(ngModel)]="form.assigned_to_user_id">
                <option value="">Unassigned</option>
                @for (u of fd()?.assignable_users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }
              </select>
            </div>
          </div>

          <div class="section-title"><i class="fas fa-heartbeat me-1"></i> Human Impact</div>
          <div class="row g-3">
            @for (group of casualtyGroups; track group.prefix) {
              <div class="col-md-4">
                <label class="form-label">{{ group.label }}</label>
                <div class="d-flex gap-2">
                  <input type="number" min="0" class="form-control form-control-sm" placeholder="Male" [(ngModel)]="form[group.prefix + '_male']" (ngModelChange)="autoTotal(group.prefix)">
                  <input type="number" min="0" class="form-control form-control-sm" placeholder="Female" [(ngModel)]="form[group.prefix + '_female']" (ngModelChange)="autoTotal(group.prefix)">
                  <input type="number" min="0" class="form-control form-control-sm" placeholder="Total" [(ngModel)]="form[group.prefix + '_total']">
                </div>
              </div>
            }
            <div class="col-md-3"><label class="form-label">Displaced</label><input type="number" min="0" class="form-control" [(ngModel)]="form.displaced"></div>
            <div class="col-md-3"><label class="form-label">People with Disabilities</label><input type="number" min="0" class="form-control" [(ngModel)]="form.people_with_disabilities"></div>
            <div class="col-md-3"><label class="form-label">Pregnant Affected</label><input type="number" min="0" class="form-control" [(ngModel)]="form.pregnant_affected"></div>
            <div class="col-md-3"><label class="form-label">Children Affected</label><input type="number" min="0" class="form-control" [(ngModel)]="form.children_affected"></div>
          </div>

          <div class="section-title"><i class="fas fa-house-damage me-1"></i> Infrastructure Damage</div>
          <div class="check-grid">
            @for (entry of entries(fd()?.infrastructure_damage_options); track entry[0]) {
              <div class="form-check">
                <input class="form-check-input" type="checkbox" [id]="'inf' + entry[0]" [checked]="infrastructure().has(entry[0])" (change)="toggleSet(infrastructure, entry[0])">
                <label class="form-check-label" [for]="'inf' + entry[0]" style="font-size:0.82rem;">{{ entry[1] }}</label>
              </div>
            }
          </div>

          <div class="section-title"><i class="fas fa-hands-helping me-1"></i> Emergency Needs</div>
          <div class="check-grid">
            @for (entry of entries(fd()?.emergency_needs_options); track entry[0]) {
              <div class="form-check">
                <input class="form-check-input" type="checkbox" [id]="'need' + entry[0]" [checked]="needs().has(entry[0])" (change)="toggleSet(needs, entry[0])">
                <label class="form-check-label" [for]="'need' + entry[0]" style="font-size:0.82rem;">{{ entry[1] }}</label>
              </div>
            }
          </div>
          @if (needs().has('other')) {
            <div class="mt-2" style="max-width:420px;">
              <input type="text" class="form-control form-control-sm" placeholder="Specify other needs" [(ngModel)]="form.emergency_needs_other">
            </div>
          }

          <div class="section-title"><i class="fas fa-tools me-1"></i> Action Taken</div>
          <textarea rows="2" class="form-control" placeholder="Initial actions already taken on the ground" [(ngModel)]="form.action_taken"></textarea>

          <div class="section-title"><i class="fas fa-camera me-1"></i> Evidence</div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Photos (max 10, 5MB each)</label>
              <input type="file" class="form-control" multiple accept="image/jpeg,image/png,image/gif" (change)="onPhotos($event)">
              @if (isEdit() && existingPhotos().length) {
                <div class="mt-2">
                  @for (p of existingPhotos(); track p) {
                    <span class="photo-chip">{{ fileName(p) }}
                      <button type="button" title="Remove" (click)="removePhoto(p)"><i class="fas fa-times"></i></button>
                    </span>
                  }
                </div>
              }
            </div>
            <div class="col-md-6">
              <label class="form-label">Video (max 50MB)</label>
              <input type="file" class="form-control" accept="video/mp4,video/avi,video/quicktime" (change)="onVideo($event)">
            </div>
          </div>

          <div class="mt-4 d-flex gap-2">
            <button type="button" class="btn-add" [disabled]="submitting()" (click)="save(false)">
              <i class="fas fa-save"></i> {{ isEdit() ? 'Update Incident' : 'Save Incident' }}
            </button>
            @if (!isEdit()) {
              <button type="button" class="btn btn-outline-secondary" [disabled]="submitting()" (click)="save(true)">
                <i class="fas fa-plus me-1"></i> Save & Add Another
              </button>
            }
          </div>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class IncidentFormComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  fd = signal<FormData | null>(null);
  errors = signal<string[]>([]);
  submitting = signal(false);
  districts = signal<{ id: number; name: string }[]>([]);
  infrastructure = signal(new Set<string>());
  needs = signal(new Set<string>());
  existingPhotos = signal<string[]>([]);
  removedPhotos: string[] = [];
  photos: File[] = [];
  video: File | null = null;

  readonly casualtyGroups = [
    { prefix: 'deaths', label: 'Deaths (M / F / Total)' },
    { prefix: 'injured', label: 'Injured (M / F / Total)' },
    { prefix: 'missing', label: 'Missing (M / F / Total)' },
  ];

  form: any = {
    title: '', hazard_id: '', incident_type_id: '', severity_level: 'Moderate', status: 'Reported',
    reported_at: new Date().toISOString().substring(0, 16), origin_level: 'district', description: '',
    location_description: '', region_id: '', district_id: '', latitude: '', longitude: '',
    reported_by_name: '', reported_by_contact: '', source_of_report: '', assigned_to_user_id: '',
    deaths_male: 0, deaths_female: 0, deaths_total: 0, injured_male: 0, injured_female: 0, injured_total: 0,
    missing_male: 0, missing_female: 0, missing_total: 0, displaced: 0, people_with_disabilities: 0,
    pregnant_affected: 0, children_affected: 0, emergency_needs_other: '', action_taken: '',
  };

  isEdit = computed(() => !!this.route.snapshot.paramMap.get('id'));

  ngOnInit(): void {
    ensureSweetAlert();
    this.http.get<FormData>('/api/v1/response/incidents/form-data').subscribe(fd => this.fd.set(fd));
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.http.get<any>(`/api/v1/response/incidents/${id}`).subscribe(d => this.prefill(d.incident));
    }
  }

  private prefill(i: any): void {
    for (const key of Object.keys(this.form)) {
      if (i[key] !== undefined && i[key] !== null) { this.form[key] = i[key]; }
    }
    // datetime-local needs the trimmed ISO form
    if (i.reported_at) { this.form.reported_at = String(i.reported_at).substring(0, 16); }
    this.infrastructure.set(new Set(i.infrastructure_damage ?? []));
    this.needs.set(new Set(i.emergency_needs ?? []));
    this.existingPhotos.set(i.photo_paths ?? []);
    if (i.region_id) { this.onRegionChange(String(i.region_id), i.district_id); }
  }

  onRegionChange(regionId: string, keepDistrict?: number): void {
    if (!keepDistrict) { this.form.district_id = ''; }
    this.districts.set([]);
    if (regionId) {
      this.http.get<any[]>(`/api/v1/onehealth/events/districts/${regionId}`).subscribe(d => {
        this.districts.set(d as any);
        if (keepDistrict) { this.form.district_id = String(keepDistrict); }
      });
    }
  }

  applyDefaultSeverity(typeId: string): void {
    const t = this.fd()?.incident_types.find(x => String(x.id) === String(typeId));
    if (t?.default_severity && this.fd()?.severity_levels.includes(t.default_severity)) {
      this.form.severity_level = t.default_severity;
    }
  }

  /** Auto-fill the total when M/F change, still editable (source form behavior). */
  autoTotal(prefix: string): void {
    this.form[prefix + '_total'] = Number(this.form[prefix + '_male'] || 0) + Number(this.form[prefix + '_female'] || 0);
  }

  toggleSet(target: ReturnType<typeof signal<Set<string>>>, key: string): void {
    const next = new Set(target());
    if (next.has(key)) { next.delete(key); } else { next.add(key); }
    target.set(next);
  }

  onPhotos(ev: Event): void {
    this.photos = Array.from((ev.target as HTMLInputElement).files ?? []);
  }

  onVideo(ev: Event): void {
    this.video = (ev.target as HTMLInputElement).files?.[0] ?? null;
  }

  removePhoto(path: string): void {
    this.removedPhotos.push(path);
    this.existingPhotos.set(this.existingPhotos().filter(p => p !== path));
  }

  fileName(path: string): string {
    return path.split('/').pop() ?? path;
  }

  entries(map: Record<string, string> | undefined): [string, string][] {
    return Object.entries(map ?? {});
  }

  save(addAnother: boolean): void {
    const fd = new FormData();
    for (const [key, value] of Object.entries(this.form)) {
      if (value !== '' && value !== null && value !== undefined) { fd.set(key, String(value)); }
    }
    this.infrastructure().forEach(v => fd.append('infrastructure_damage', v));
    this.needs().forEach(v => fd.append('emergency_needs', v));
    this.photos.forEach(p => fd.append('photos', p));
    if (this.video) { fd.set('video', this.video); }
    this.removedPhotos.forEach(p => fd.append('remove_photos', p));

    const id = this.route.snapshot.paramMap.get('id');
    const req = id
        ? this.http.put<any>(`/api/v1/response/incidents/${id}`, fd)
        : this.http.post<any>('/api/v1/response/incidents', fd);

    this.submitting.set(true);
    this.errors.set([]);
    req.subscribe({
      next: res => {
        this.submitting.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Saved', text: res.message, timer: 2000, showConfirmButton: false })
          .then(() => {
            if (addAnother) { window.location.reload(); }
            else { this.router.navigate(['/m/response/incidents', id ?? res.id]); }
          }));
      },
      error: err => {
        this.submitting.set(false);
        this.errors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
        window.scrollTo({ top: 0 });
      },
    });
  }
}

/** Loads SweetAlert2 from the same CDN the Blade page pushes, once. */
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return swalPromise;
}
