import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

interface ItemLine {
  subcategory: string; description: string; quantity: number | null; unit: string;
  estimated_value: number | null; severity: string;
}
interface RequestLine { resource_id: number | null; quantity: number | null; priority: string; reason: string; }

/**
 * Disaster Needs Assessment form — port of response/assessment/create:
 * basic info + geolocation, the dynamic category→item damage grid (live
 * estimated-loss total), per-category needs, the direct resource-request
 * matrix (rides the standard allocation pipeline) and photo evidence.
 */
@Component({
  selector: 'page-assessment-form',
  standalone: true,
  imports: [DecimalPipe, FormsModule, PageHeaderComponent, PanelComponent],
  styles: [`
    label { display: block; font-size: 0.74rem; font-weight: 600; color: #334155; margin: 10px 0 3px; }
    input, select, textarea { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 14px; }
    .cat-block { border: 1px solid #e3e6ed; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
    .cat-head { display: flex; justify-content: space-between; align-items: center; background: #f8f9fb; padding: 8px 12px; font-size: 0.84rem; font-weight: 700; }
    .item-row { display: grid; grid-template-columns: 1.2fr 1.6fr 80px 90px 130px 110px auto; gap: 8px; padding: 8px 12px; border-top: 1px solid #f1f5f9; align-items: end; }
    .req-row { display: grid; grid-template-columns: 1.6fr 110px 130px 1.6fr auto; gap: 8px; padding: 6px 0; align-items: end; }
    .btn-sm { font-size: 0.72rem; padding: 4px 11px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .total-strip { background: #fff5f5; border: 1px solid #fecaca; color: #b91c1c; border-radius: 10px; padding: 10px 14px; font-size: 0.9rem; margin: 12px 0; }
    .photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .photo-chip { font-size: 0.72rem; background: #f1f5f9; border-radius: 8px; padding: 3px 9px; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
    .actions button { padding: 9px 22px; font-size: 0.85rem; }
  `],
  template: `
    <dmis-page-header title="Create Disaster Needs Assessment" icon="fa-clipboard-check"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Assessment', url:'/m/response/assessments'}, {label:'Create'}]">
    </dmis-page-header>

    <dmis-panel title="Basic Information" icon="fa-circle-info">
      <div class="grid-2">
        <div><label>Incident *</label>
          <select [(ngModel)]="form.incident_id">
            <option [ngValue]="null">Select incident…</option>
            @for (i of formData()?.incidents ?? []; track i.id) { <option [ngValue]="i.id">{{ i.title }} ({{ i.severity_level }})</option> }
          </select></div>
        <div><label>Assessment Type *</label>
          <select [(ngModel)]="form.assessment_type">
            @for (t of formData()?.assessment_types ?? []; track t) { <option [value]="t">{{ t }}</option> }
          </select></div>
        <div><label>Assessment Date *</label><input type="date" [(ngModel)]="form.assessment_date"></div>
        <div><label>Overall Damage Level *</label>
          <select [(ngModel)]="form.overall_damage_level">
            @for (l of formData()?.damage_levels ?? []; track l) { <option [value]="l">{{ l }}</option> }
          </select></div>
        <div><label>Location *</label><input maxlength="255" [(ngModel)]="form.location" placeholder="Ward / street / landmark"></div>
        <div><label>District *</label><input maxlength="255" [(ngModel)]="form.district"></div>
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

    <dmis-panel title="Direct Resource Requests" icon="fa-truck">
      <p style="font-size:0.78rem; color:#6c757d; margin:4px 0 8px">
        Requests enter the standard approval chain (DAS → … → Director) and the dispatch console.</p>
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

    <dmis-panel title="Photo Evidence" icon="fa-camera">
      <input type="file" accept="image/*" multiple (change)="onPhotos($event)">
      <div class="photos">
        @for (f of photos; track f.name) { <span class="photo-chip"><i class="fas fa-image"></i> {{ f.name }}</span> }
      </div>
      <small style="color:#6c757d">Up to 5MB per photo.</small>
    </dmis-panel>

    <div class="actions">
      <button type="button" class="btn-sm b-outline" (click)="router.navigate(['/m/response/assessments'])">Cancel</button>
      <button type="button" class="btn-sm b-red" [disabled]="saving()" (click)="save()">
        <i class="fas fa-save"></i> {{ saving() ? 'Saving…' : 'Save Assessment (Draft)' }}</button>
    </div>
  `,
})
export class AssessmentFormComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly router = inject(Router);

  readonly formData = signal<any | null>(null);
  readonly saving = signal(false);
  readonly categoryNames = computed<string[]>(() => Object.keys(this.formData()?.category_tree ?? {}));

  form = {
    incident_id: null as number | null, assessment_type: 'Initial',
    assessment_date: new Date().toISOString().substring(0, 10),
    location: '', district: '', latitude: null as number | null, longitude: null as number | null,
    overall_damage_level: 'Moderate', general_notes: '', resource_request_notes: '',
  };
  items: Record<string, ItemLine[]> = {};
  requests: RequestLine[] = [];
  photos: File[] = [];

  ngOnInit(): void {
    ensureSweetAlert();
    this.http.get<any>('/api/v1/response/assessments/form-data').subscribe(d => {
      this.formData.set(d);
      for (const cat of Object.keys(d.category_tree)) {
        this.items[cat] = [];
      }
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

  save(): void {
    const categories = Object.entries(this.items)
      .filter(([, list]) => list.length)
      .map(([category, list]) => ({ category, items: list }));
    if (!this.form.incident_id || !this.form.location || !this.form.district || !categories.length) {
      ensureSweetAlert().then(() => Swal.fire('Missing information',
        'Incident, location, district and at least one damage item are required.', 'warning'));
      return;
    }
    const fd = new FormData();
    fd.set('incident_id', String(this.form.incident_id));
    fd.set('assessment_type', this.form.assessment_type);
    fd.set('assessment_date', this.form.assessment_date);
    fd.set('location', this.form.location);
    fd.set('district', this.form.district);
    if (this.form.latitude != null) { fd.set('latitude', String(this.form.latitude)); }
    if (this.form.longitude != null) { fd.set('longitude', String(this.form.longitude)); }
    fd.set('overall_damage_level', this.form.overall_damage_level);
    fd.set('general_notes', this.form.general_notes);
    fd.set('categories', JSON.stringify(categories));
    fd.set('requirements', JSON.stringify([]));
    fd.set('resource_requests', JSON.stringify(this.requests.filter(r => r.resource_id && Number(r.quantity) > 0)));
    fd.set('resource_request_notes', this.form.resource_request_notes);
    for (const photo of this.photos) {
      fd.append('photos', photo, photo.name);
    }
    this.saving.set(true);
    this.http.post<any>('/api/v1/response/assessments', fd).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Saved', text: r.message, timer: 2200, showConfirmButton: false,
      }).then(() => this.router.navigate(['/m/response/assessments', r.id]))),
      error: err => {
        this.saving.set(false);
        ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'Could not save the assessment.', 'error'));
      },
    });
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
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
