import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

interface ItemLine {
  subcategory: string; description: string; quantity: number | null; unit: string;
  estimated_value: number | null; severity: string;
}
interface RequestLine { resource_id: number | null; quantity: number | null; priority: string; reason: string; }
/** One immediate-need line — the source contract: requirements[].{immediate_needs, recommendations}. */
interface NeedLine { immediate_needs: string; recommendations: string; }

/**
 * Disaster Needs Assessment form — port of response/assessment/create + edit:
 * basic info + geolocation, the dynamic category→item damage grid (live
 * estimated-loss total), the immediate-needs & recommendations register
 * (stored as the source's requirements[] contract), the direct resource-request
 * matrix (rides the standard allocation pipeline) and photo evidence.
 * Edit mode (/:id/edit) reloads a Draft/Pending assessment; Completed ones are immutable.
 */
@Component({
  selector: 'page-assessment-form',
  standalone: true,
  imports: [DecimalPipe, FormsModule, PageHeaderComponent, PanelComponent, RegionDistrictPickerComponent],
  styles: [`
    label { display: block; font-size: 0.75rem; font-weight: 600; color: #334155; margin: 10px 0 3px; }
    input, select, textarea { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    input:disabled, select:disabled { background: #f1f5f9; color: #64748b; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 14px; }
    .cat-block { border: 1px solid #e3e6ed; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
    .cat-head { display: flex; justify-content: space-between; align-items: center; background: #f8f9fb; padding: 8px 12px; font-size: 0.84rem; font-weight: 700; }
    .item-row { display: grid; grid-template-columns: 1.2fr 1.6fr 80px 90px 130px 110px auto; gap: 8px; padding: 8px 12px; border-top: 1px solid #f1f5f9; align-items: end; }
    .req-row { display: grid; grid-template-columns: 1.6fr 110px 130px 1.6fr auto; gap: 8px; padding: 6px 0; align-items: end; }
    .need-row { display: grid; grid-template-columns: 1.4fr 1.4fr auto; gap: 8px; padding: 6px 0; align-items: end; }
    .btn-sm { font-size: 0.78rem; padding: 6px 12px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .b-red:hover { background: #c82333; } .b-outline:hover { background: #f1f5f9; }
    .total-strip { background: #fff5f5; border: 1px solid #fecaca; color: #b91c1c; border-radius: 10px; padding: 10px 14px; font-size: 0.9rem; margin: 12px 0; }
    .photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .photo-chip { font-size: 0.75rem; background: #f1f5f9; border-radius: 8px; padding: 3px 9px; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
    .actions button { padding: 9px 22px; font-size: 0.85rem; }
    .hint { font-size: 0.78rem; color: #6c757d; margin: 4px 0 8px; }
    .current-val { font-size: 0.78rem; color: #475569; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 7px; padding: 5px 9px; margin-top: 4px; }
  `],
  template: `
    <dmis-page-header [title]="(editId ? 'Edit' : 'Create') + ' Disaster Needs Assessment'" icon="fa-clipboard-check"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Assessment', url:'/m/response/assessments'}, {label: editId ? ('#' + editId + ' — Edit') : 'Create'}]">
    </dmis-page-header>

    <dmis-panel title="Basic Information" icon="fa-circle-info">
      <div class="grid-2">
        <div><label>Incident *</label>
          <select [(ngModel)]="form.incident_id" [disabled]="!!editId">
            <option [ngValue]="null">Select incident…</option>
            @for (i of formData()?.incidents ?? []; track i.id) { <option [ngValue]="i.id">{{ i.title }} ({{ i.severity_level }})</option> }
            @if (editId && editIncidentTitle && !incidentInOptions()) { <option [ngValue]="form.incident_id">{{ editIncidentTitle }}</option> }
          </select>
          @if (editId) { <div class="hint">The surveyed incident is fixed after creation.</div> }
        </div>
        <div><label>Assessment Type *</label>
          <select [(ngModel)]="form.assessment_type" [disabled]="!!editId">
            @for (t of formData()?.assessment_types ?? []; track t) { <option [value]="t">{{ t }}</option> }
          </select>
          @if (editId) { <div class="hint">The assessment type is fixed after creation — file a new Detailed/Final assessment instead.</div> }
        </div>
        <div><label>Assessment Date *</label><input type="date" [(ngModel)]="form.assessment_date"></div>
        <div><label>Overall Damage Level *</label>
          <select [(ngModel)]="form.overall_damage_level">
            @for (l of formData()?.damage_levels ?? []; track l) { <option [value]="l">{{ l }}</option> }
          </select></div>
        <div><label>Location *</label><input maxlength="255" [(ngModel)]="form.location" placeholder="Ward / street / landmark"></div>
        <div>
          <label>District *</label>
          <dmis-region-district [region]="pickRegion()" (regionChange)="pickRegion.set($event)"
                                [district]="pickDistrict()" (districtChange)="pickDistrict.set($event)"
                                [showCouncil]="false" />
          @if (editId && form.district && !pickDistrict()) {
            <div class="current-val"><i class="fas fa-map-marker-alt"></i> Current: <b>{{ form.district }}</b> — pick a region &amp; district above only to change it.</div>
          }
        </div>
        <div><label>Latitude</label><input type="number" step="any" [(ngModel)]="form.latitude"></div>
        <div><label>Longitude</label><input type="number" step="any" [(ngModel)]="form.longitude"></div>
      </div>
      <button type="button" class="btn-sm b-outline" style="margin-top:8px" (click)="geolocate()">
        <i class="fas fa-location-crosshairs"></i> Use my location</button>
    </dmis-panel>

    <dmis-panel title="Damage Categories" icon="fa-layer-group">
      @for (cat of categoryNames(); track cat) {
        <div class="cat-block">
          <div class="cat-head">
            <span>{{ cat }} <small style="color:#6c757d; font-weight:400">({{ items[cat].length }} item(s))</small></span>
            <button type="button" class="btn-sm b-outline" (click)="addItem(cat)"><i class="fas fa-plus"></i> Add item</button>
          </div>
          @for (it of items[cat]; track $index; let idx = $index) {
            <div class="item-row">
              <div><label>Subcategory</label>
                <select [(ngModel)]="it.subcategory">
                  @for (s of formData()?.category_tree?.[cat] ?? []; track s) { <option [value]="s">{{ s }}</option> }
                </select></div>
              <div><label>Damage description</label><input [(ngModel)]="it.description"></div>
              <div><label>Qty</label><input type="number" min="0" [(ngModel)]="it.quantity"></div>
              <div><label>Unit</label><input [(ngModel)]="it.unit" placeholder="units"></div>
              <div><label>Estimated value (TZS)</label><input type="number" min="0" [(ngModel)]="it.estimated_value"></div>
              <div><label>Severity</label>
                <select [(ngModel)]="it.severity">
                  @for (s of formData()?.severities ?? []; track s) { <option [value]="s">{{ s }}</option> }
                </select></div>
              <button type="button" class="btn-sm b-outline" (click)="items[cat].splice(idx, 1)">✕</button>
            </div>
          }
        </div>
      }
      <div class="total-strip"><i class="fas fa-coins"></i>
        Total estimated loss: <b>{{ totalLoss() | number }}</b> TZS</div>
      <label>General notes / recommendations</label>
      <textarea rows="2" [(ngModel)]="form.general_notes"></textarea>
    </dmis-panel>

    <dmis-panel title="Immediate Needs &amp; Recommendations" icon="fa-hand-holding-medical">
      <p class="hint">The urgent needs observed on the ground (shelter, food, medical care, WASH…) and the
        recommended action for each. These appear on the assessment record and the printed report.</p>
      @for (n of needs; track $index; let idx = $index) {
        <div class="need-row">
          <div><label>Immediate need</label><input maxlength="500" [(ngModel)]="n.immediate_needs" placeholder="e.g. Emergency shelter for 40 displaced families"></div>
          <div><label>Recommendation</label><input maxlength="500" [(ngModel)]="n.recommendations" placeholder="e.g. Erect temporary shelters at the primary school grounds"></div>
          <button type="button" class="btn-sm b-outline" (click)="needs.splice(idx, 1)">✕</button>
        </div>
      } @empty { <div class="hint"><i class="fas fa-circle-info"></i> No needs recorded yet — add the first line below.</div> }
      <button type="button" class="btn-sm b-outline" (click)="addNeed()"><i class="fas fa-plus"></i> Add need</button>
    </dmis-panel>

    @if (!editId) {
      <dmis-panel title="Direct Resource Requests" icon="fa-truck">
        <p class="hint">Requests enter the standard approval chain (DAS → … → Director) and the dispatch console.</p>
        @for (req of requests; track $index; let idx = $index) {
          <div class="req-row">
            <div><label>Resource</label>
              <select [(ngModel)]="req.resource_id">
                <option [ngValue]="null">Select…</option>
                @for (r of formData()?.resources ?? []; track r.id) { <option [ngValue]="r.id">{{ r.name }} ({{ r.unit_of_measure }})</option> }
              </select></div>
            <div><label>Quantity</label><input type="number" min="0" [(ngModel)]="req.quantity"></div>
            <div><label>Priority</label>
              <select [(ngModel)]="req.priority">
                @for (p of formData()?.priorities ?? []; track p) { <option [value]="p">{{ p }}</option> }
              </select></div>
            <div><label>Reason</label><input maxlength="500" [(ngModel)]="req.reason"></div>
            <button type="button" class="btn-sm b-outline" (click)="requests.splice(idx, 1)">✕</button>
          </div>
        }
        <button type="button" class="btn-sm b-outline" (click)="addRequest()"><i class="fas fa-plus"></i> Add resource line</button>
        <label>Resource request notes</label>
        <textarea rows="2" [(ngModel)]="form.resource_request_notes"></textarea>
      </dmis-panel>
    } @else {
      <dmis-panel title="Direct Resource Requests" icon="fa-truck">
        <p class="hint"><i class="fas fa-circle-info"></i> Resource requests raised by this assessment already ride the
          approval chain and are managed from the assessment detail page — they cannot be edited here.</p>
      </dmis-panel>
    }

    <dmis-panel title="Photo Evidence" icon="fa-camera">
      <input type="file" accept="image/*" multiple (change)="onPhotos($event)">
      <div class="photos">
        @for (f of photos; track f.name) { <span class="photo-chip"><i class="fas fa-image"></i> {{ f.name }}</span> }
      </div>
      <small style="color:#6c757d">Up to 5MB per photo.{{ editId ? ' New photos are added to the existing gallery; remove photos from the detail page.' : '' }}</small>
    </dmis-panel>

    <div class="actions">
      <button type="button" class="btn-sm b-outline" (click)="cancel()">Cancel</button>
      <button type="button" class="btn-sm b-red" [disabled]="saving()" (click)="save()">
        <i class="fas fa-save"></i> {{ saving() ? 'Saving…' : (editId ? 'Save Changes' : 'Save Assessment (Draft)') }}</button>
    </div>
  `,
})
export class AssessmentFormComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);

  readonly formData = signal<any | null>(null);
  readonly saving = signal(false);
  readonly categoryNames = computed<string[]>(() => Object.keys(this.formData()?.category_tree ?? {}));

  /** Set when the route is /:id/edit — the form then updates instead of creating. */
  readonly editId: number | null = Number(this.route.snapshot.paramMap.get('id')) || null;
  editIncidentTitle = '';

  // Canonical Region → District cascade (the district NAME is what the API stores).
  readonly pickRegion = signal('');
  readonly pickDistrict = signal('');

  form = {
    incident_id: null as number | null, assessment_type: 'Initial',
    assessment_date: localToday(),
    location: '', district: '', latitude: null as number | null, longitude: null as number | null,
    overall_damage_level: 'Moderate', general_notes: '', resource_request_notes: '',
  };
  items: Record<string, ItemLine[]> = {};
  requests: RequestLine[] = [];
  needs: NeedLine[] = [];
  photos: File[] = [];

  ngOnInit(): void {
    ensureSweetAlert();
    this.http.get<any>('/api/v1/response/assessments/form-data').subscribe(d => {
      this.formData.set(d);
      for (const cat of Object.keys(d.category_tree)) {
        this.items[cat] = this.items[cat] ?? [];
      }
    });
    if (this.editId) {
      this.loadExisting(this.editId);
    }
  }

  incidentInOptions(): boolean {
    return (this.formData()?.incidents ?? []).some((i: any) => i.id === this.form.incident_id);
  }

  /** Edit mode: prefill from the show payload; Completed assessments bounce back (immutable). */
  private loadExisting(id: number): void {
    this.http.get<any>(`/api/v1/response/assessments/${id}`).subscribe({
      next: d => {
        const a = d.assessment;
        if (a.status === 'Completed') {
          ensureSweetAlert().then(() => Swal.fire('Not editable',
            'Completed assessments are immutable.', 'info')
            .then(() => this.router.navigate(['/m/response/assessments', id])));
          return;
        }
        this.editIncidentTitle = d.incident_title ?? '';
        this.form.incident_id = a.incident_id;
        this.form.assessment_type = a.assessment_type;
        this.form.assessment_date = String(a.assessment_date ?? '').substring(0, 10);
        this.form.location = a.location ?? '';
        this.form.district = a.district ?? '';
        this.form.latitude = a.latitude ?? null;
        this.form.longitude = a.longitude ?? null;
        this.form.overall_damage_level = a.damage_level ?? 'Moderate';
        this.form.general_notes = a.recommendations ?? '';
        this.needs = parseNeeds(a.immediate_needs);
        for (const item of d.items ?? []) {
          const cat = item.category;
          this.items[cat] = this.items[cat] ?? [];
          this.items[cat].push({
            subcategory: item.subcategory ?? '', description: item.damage_description ?? '',
            quantity: item.quantity_damaged ?? null, unit: item.unit ?? 'units',
            estimated_value: item.damage_value ?? null, severity: item.severity ?? 'Moderate',
          });
        }
      },
      error: () => ensureSweetAlert().then(() => Swal.fire('Not found',
        'The assessment could not be loaded.', 'error')
        .then(() => this.router.navigate(['/m/response/assessments']))),
    });
  }

  addItem(cat: string): void {
    const firstSub = this.formData()?.category_tree?.[cat]?.[0] ?? '';
    this.items[cat].push({ subcategory: firstSub, description: '', quantity: null, unit: 'units',
      estimated_value: null, severity: 'Moderate' });
  }

  addRequest(): void {
    this.requests.push({ resource_id: null, quantity: null, priority: 'Medium', reason: '' });
  }

  addNeed(): void {
    this.needs.push({ immediate_needs: '', recommendations: '' });
  }

  totalLoss(): number {
    return Object.values(this.items).flat()
      .reduce((sum, it) => sum + (Number(it.estimated_value) || 0), 0);
  }

  geolocate(): void {
    navigator.geolocation?.getCurrentPosition(pos => {
      this.form.latitude = Number(pos.coords.latitude.toFixed(6));
      this.form.longitude = Number(pos.coords.longitude.toFixed(6));
    });
  }

  onPhotos(event: Event): void {
    this.photos = Array.from((event.target as HTMLInputElement).files ?? []);
  }

  cancel(): void {
    this.router.navigate(this.editId ? ['/m/response/assessments', this.editId] : ['/m/response/assessments']);
  }

  save(): void {
    // The picker (canonical name) wins; in edit mode an untouched picker keeps the saved district.
    const district = this.pickDistrict() || this.form.district;
    const categories = Object.entries(this.items)
      .filter(([, list]) => list.length)
      .map(([category, list]) => ({ category, items: list }));
    if (!this.form.incident_id || !this.form.location || !district || !categories.length) {
      ensureSweetAlert().then(() => Swal.fire('Missing information',
        'Incident, location, district and at least one damage item are required.', 'warning'));
      return;
    }
    const fd = new FormData();
    fd.set('incident_id', String(this.form.incident_id));
    fd.set('assessment_type', this.form.assessment_type);
    fd.set('assessment_date', this.form.assessment_date);
    fd.set('location', this.form.location);
    fd.set('district', district);
    if (this.form.latitude != null) { fd.set('latitude', String(this.form.latitude)); }
    if (this.form.longitude != null) { fd.set('longitude', String(this.form.longitude)); }
    fd.set('overall_damage_level', this.form.overall_damage_level);
    fd.set('general_notes', this.form.general_notes);
    fd.set('categories', JSON.stringify(categories));
    fd.set('requirements', JSON.stringify(
      this.needs.filter(n => n.immediate_needs.trim() || n.recommendations.trim())));
    if (!this.editId) {
      fd.set('resource_requests', JSON.stringify(this.requests.filter(r => r.resource_id && Number(r.quantity) > 0)));
      fd.set('resource_request_notes', this.form.resource_request_notes);
    }
    for (const photo of this.photos) {
      fd.append('photos', photo, photo.name);
    }
    this.saving.set(true);
    const url = this.editId ? `/api/v1/response/assessments/${this.editId}` : '/api/v1/response/assessments';
    this.http.post<any>(url, fd).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Saved', text: r.message, timer: 2200, showConfirmButton: false,
      }).then(() => this.router.navigate(['/m/response/assessments', this.editId ?? r.id]))),
      error: err => {
        this.saving.set(false);
        ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'Could not save the assessment.', 'error'));
      },
    });
  }
}

/** immediate_needs is the source's requirements[] JSON; tolerate legacy shapes (plain string / '[]'). */
function parseNeeds(raw: any): NeedLine[] {
  if (!raw) { return []; }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed.map((n: any) => ({
        immediate_needs: String(n?.immediate_needs ?? ''), recommendations: String(n?.recommendations ?? ''),
      })).filter(n => n.immediate_needs || n.recommendations);
    }
    return [];
  } catch {
    return [{ immediate_needs: String(raw), recommendations: '' }];
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/vendor/sweetalert2/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = '/vendor/sweetalert2/sweetalert2.all.min.js';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}

/** Today's date in the operator's LOCAL timezone (UTC would be a day behind before 03:00 EAT). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
