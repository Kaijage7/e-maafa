import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

/**
 * Reproduction of admin/hazards/create.blade.php — the minimal page-form (Name*, Type*, dependent
 * Category; every other field posted empty, is_active=1). Category options are JS-driven by type,
 * lists copied verbatim.
 */
@Component({
  selector: 'page-hazard-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  template: `
    <dmis-page-header title="Register New Hazard" icon="fa-plus-circle"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Hazard Management', url:'/m/prevention-mitigation/hazards'}, {label:'Register New Hazard'}]">
      <a routerLink="/m/prevention-mitigation/hazards" class="btn-add" style="background:var(--text-mid);">
        <i class="fas fa-arrow-left"></i> Back to Hazards
      </a>
    </dmis-page-header>

    <div class="panel-row full" style="animation-delay:.15s;">
      <dmis-panel title="Hazard Information" icon="fa-exclamation-triangle">
        <div class="panel-body">
          <form (submit)="submit($event)">
            <div class="row g-3">
              <div class="col-12">
                <label for="name" class="form-label" style="font-weight:600;color:var(--primary);">
                  Hazard Name <span class="text-danger">*</span>
                </label>
                <input type="text" class="form-control" [class.is-invalid]="errors()['name']"
                       id="name" placeholder="Enter hazard name" required
                       [value]="name()" (input)="name.set($any($event.target).value)">
                @if (errors()['name']) { <div class="invalid-feedback">{{ errors()['name'] }}</div> }
              </div>

              <div class="col-md-6">
                <label for="type" class="form-label" style="font-weight:600;color:var(--primary);">
                  Hazard Type <span class="text-danger">*</span>
                </label>
                <select class="form-select" [class.is-invalid]="errors()['type']" id="type" required
                        [value]="type()" (change)="onTypeChange($any($event.target).value)">
                  <option value="">Select Type</option>
                  <option value="Natural">Natural</option>
                  <option value="Human_induced">Human Induced</option>
                </select>
                @if (errors()['type']) { <div class="invalid-feedback">{{ errors()['type'] }}</div> }
              </div>

              <div class="col-md-6">
                <label for="category" class="form-label" style="font-weight:600;color:var(--primary);">Category</label>
                <select class="form-select" id="category"
                        [value]="category()" (change)="category.set($any($event.target).value)">
                  @if (!type()) {
                    <option value="">Select Type first...</option>
                  } @else {
                    <option value="">Select Category</option>
                    @for (opt of categoryOptions[type()] || []; track opt) {
                      <option [value]="opt">{{ opt }}</option>
                    }
                  }
                </select>
              </div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(0,0,0,0.06);">
              <a routerLink="/m/prevention-mitigation/hazards" class="btn-add" style="background:var(--text-mid);">
                <i class="fas fa-times"></i> Cancel
              </a>
              <button type="submit" class="btn-add" [disabled]="saving()">
                <i class="fas fa-save"></i> Create Hazard
              </button>
            </div>
          </form>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class HazardCreateComponent {
  private http = inject(HttpClient);
  private router = inject(Router);

  name = signal('');
  type = signal('');
  category = signal('');
  saving = signal(false);
  errors = signal<Record<string, string>>({});

  /** Copied verbatim from create.blade.php. */
  categoryOptions: Record<string, string[]> = {
    Natural: ['Hydrological', 'Geological', 'Meteorological', 'Climatological', 'Environmental'],
    Human_induced: ['Technological', 'Biological', 'Industrial', 'Structural', 'Transportation', 'Infrastructure', 'Epidemic', 'Pandemic', 'Pest', 'Animal'],
  };

  onTypeChange(type: string): void {
    this.type.set(type);
    this.category.set('');
  }

  submit(event: Event): void {
    event.preventDefault();
    this.saving.set(true);
    this.errors.set({});
    // The Blade form posts the optional fields as hidden empty strings (-> null) and is_active=1.
    this.http.post('/api/v1/hazards', {
      name: this.name(),
      type: this.type(),
      category: this.category() || null,
      description: null, severity: null, frequency: null,
      typicalDuration: null, seasonalPattern: null, severityScale: null,
      isActive: true,
    }).subscribe({
      next: () => this.router.navigate(['/m/prevention-mitigation/hazards'], { state: { success: 'Hazard registered successfully.' } }),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.errors.set({ name: err.error?.detail || 'The name has already been taken.' });
        } else {
          this.errors.set(err.error?.errors || { name: 'Failed to register hazard.' });
        }
      },
    });
  }
}
