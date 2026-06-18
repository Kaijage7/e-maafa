import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

/**
 * Reproduction of admin/hazards/edit.blade.php — Name*, Type*, dependent Category, Severity Scale,
 * Description. NOTE (source quirk, reproduced): the edit form does not post is_active, and the
 * controller sets it from $request->has('is_active'), so updating a hazard deactivates it.
 */
@Component({
  selector: 'page-hazard-edit',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  template: `
    <dmis-page-header title="Edit Hazard" icon="fa-exclamation-triangle"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Admin'}, {label:'Hazards', url:'/m/prevention-mitigation/hazards'}, {label: name()}, {label:'Edit'}]" />

    <div class="panel-row full">
      <dmis-panel title="Edit: {{ name() }}" icon="fa-edit">
        <div class="panel-body">
          <form (submit)="submit($event)">
            <div class="row g-3">
              <div class="col-md-6">
                <label for="name" class="form-label">Name <span class="text-danger">*</span></label>
                <input id="name" type="text" class="form-control" [class.is-invalid]="errors()['name']"
                       required [value]="name()" (input)="name.set($any($event.target).value)">
                @if (errors()['name']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['name'] }}</strong></span> }
              </div>

              <div class="col-md-6">
                <label for="type" class="form-label">Type <span class="text-danger">*</span></label>
                <select id="type" class="form-select" [class.is-invalid]="errors()['type']" required
                        [value]="type()" (change)="onTypeChange($any($event.target).value)">
                  <option value="">Select Type</option>
                  <option value="Natural">Natural</option>
                  <option value="Human_induced">Human Induced</option>
                </select>
                @if (errors()['type']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['type'] }}</strong></span> }
              </div>

              <div class="col-md-6">
                <label for="category" class="form-label">Category</label>
                <select id="category" class="form-select"
                        [value]="category()" (change)="category.set($any($event.target).value)">
                  @if (!type()) {
                    <option value="">Select Type first...</option>
                  } @else {
                    <option value="">Select Category</option>
                    @for (opt of categoryOptions[type()] || []; track opt) {
                      <option [value]="opt" [selected]="opt === category()">{{ opt }}</option>
                    }
                  }
                </select>
              </div>

              <div class="col-md-6">
                <label for="severity_scale" class="form-label">Severity Scale (Optional)</label>
                <input id="severity_scale" type="text" class="form-control" placeholder="e.g., Richter, Saffir-Simpson"
                       [value]="severityScale()" (input)="severityScale.set($any($event.target).value)">
              </div>

              <div class="col-md-12">
                <label for="description" class="form-label">Description</label>
                <textarea id="description" class="form-control" rows="3"
                          [value]="description()" (input)="description.set($any($event.target).value)"></textarea>
              </div>
            </div>

            <div class="mt-4 d-flex gap-2">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                <i class="fas fa-save me-1"></i> Update Hazard
              </button>
              <a routerLink="/m/prevention-mitigation/hazards" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class HazardEditComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private id: number;

  name = signal('');
  type = signal('');
  category = signal('');
  severityScale = signal('');
  description = signal('');
  saving = signal(false);
  errors = signal<Record<string, string>>({});

  /** Copied verbatim from edit.blade.php. */
  categoryOptions: Record<string, string[]> = {
    Natural: ['Hydrological', 'Geological', 'Meteorological', 'Climatological', 'Environmental'],
    Human_induced: ['Technological', 'Biological', 'Industrial', 'Structural', 'Transportation', 'Infrastructure', 'Epidemic', 'Pandemic', 'Pest', 'Animal'],
  };

  constructor(route: ActivatedRoute) {
    this.id = Number(route.snapshot.paramMap.get('id'));
    this.http.get<any>(`/api/v1/hazards/${this.id}`).subscribe(h => {
      this.name.set(h.name ?? '');
      this.type.set(h.type ?? '');
      this.category.set(h.category ?? '');
      this.severityScale.set(h.severityScale ?? '');
      this.description.set(h.description ?? '');
    });
  }

  onTypeChange(type: string): void {
    this.type.set(type);
    this.category.set('');
  }

  submit(event: Event): void {
    event.preventDefault();
    this.saving.set(true);
    this.errors.set({});
    // Same fields the Blade edit form posts — no is_active (see class doc).
    this.http.put(`/api/v1/hazards/${this.id}`, {
      name: this.name(),
      type: this.type(),
      category: this.category() || null,
      severityScale: this.severityScale() || null,
      description: this.description() || null,
    }).subscribe({
      next: () => this.router.navigate(['/m/prevention-mitigation/hazards'], { state: { success: 'Hazard updated successfully.' } }),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.errors.set({ name: err.error?.detail || 'The name has already been taken.' });
        } else {
          this.errors.set(err.error?.errors || { name: 'Failed to update hazard.' });
        }
      },
    });
  }
}
