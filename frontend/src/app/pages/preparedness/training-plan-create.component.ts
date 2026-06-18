import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

const AUDIENCE = ['Community', 'Volunteers', 'LGAs', 'Staff', 'DRR Coordinators', 'Ward Officers', 'Partners'];

/** Training Plans → New — a real create form that POSTs to the Spring Boot API (json scope/audience). */
@Component({
  selector: 'page-training-plan-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent],
  template: `
    <dmis-page-header title="New Training Plan" icon="fa-chalkboard-teacher"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Training Plans', url:'/m/preparedness/trainings'}, {label:'New'}]">
    </dmis-page-header>

    <div class="panel-row">
      <dmis-panel title="Training Details" icon="fa-clipboard-list">
        <div class="form-body">
          <div class="form-grid">
            <div class="fg fg-wide">
              <label>Training Title <span class="req">*</span></label>
              <input type="text" [value]="title()" (input)="title.set($any($event.target).value)" placeholder="e.g. Community Flood Response Training">
            </div>
            <div class="fg">
              <label>Implementing Institution <span class="req">*</span></label>
              <input type="text" [value]="institution()" (input)="institution.set($any($event.target).value)" placeholder="e.g. PMO-DMD">
            </div>
            <div class="fg">
              <label>Venue</label>
              <input type="text" [value]="venue()" (input)="venue.set($any($event.target).value)" placeholder="e.g. Ilala Community Hall">
            </div>
            <div class="fg">
              <label>Start Date</label>
              <input type="date" [value]="startDate()" (input)="startDate.set($any($event.target).value)">
            </div>
            <div class="fg">
              <label>End Date</label>
              <input type="date" [value]="endDate()" (input)="endDate.set($any($event.target).value)">
            </div>
            <div class="fg">
              <label>Source of Fund</label>
              <select [value]="fund()" (change)="fund.set($any($event.target).value)">
                <option value="">Select…</option>
                <option value="Government">Government</option>
                <option value="Non-Government Agencies">Non-Government Agencies</option>
              </select>
            </div>
            <div class="fg">
              <label>Status</label>
              <select [value]="status()" (change)="status.set($any($event.target).value)">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <div class="fg fg-wide">
              <label>Geographical Scope <span class="hint">(select regions)</span></label>
              <div class="chips">
                @for (r of regionOpts(); track r) {
                  <button type="button" class="chip" [class.on]="scope().includes(r)" (click)="toggleScope(r)">{{ r }}</button>
                }
              </div>
            </div>
            <div class="fg fg-wide">
              <label>Target Audience</label>
              <div class="chips">
                @for (a of audienceOpts; track a) {
                  <button type="button" class="chip" [class.on]="audience().includes(a)" (click)="toggleAudience(a)">{{ a }}</button>
                }
              </div>
            </div>
            <div class="fg fg-wide">
              <label>Objective</label>
              <textarea rows="2" [value]="objective()" (input)="objective.set($any($event.target).value)" placeholder="Statement of objectives / goals"></textarea>
            </div>
          </div>

          @if (error()) { <div class="form-error"><i class="fas fa-exclamation-circle"></i> {{ error() }}</div> }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancel()">Cancel</button>
            <button type="button" class="btn-add" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Saving…' : (editId() ? 'Update Training Plan' : 'Create Training Plan') }}
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
    .hint { font-weight: 400; color: var(--text-light); }
    .req { color: #dc2626; }
    .fg input, .fg select, .fg textarea { border: 1px solid var(--border); border-radius: 9px; padding: 0.5rem 0.65rem; font-size: 0.86rem; font-family: inherit; background: #fff; resize: vertical; }
    .fg input:focus, .fg select:focus, .fg textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,51,102,0.08); }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chip { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 20px; padding: 0.3rem 0.8rem; font-size: 0.78rem; cursor: pointer; }
    .chip.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .form-error { margin-top: 0.9rem; background: rgba(220,38,38,0.08); color: #dc2626; padding: 0.55rem 0.8rem; border-radius: 9px; font-size: 0.82rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-ghost { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 9px; padding: 0.5rem 1.1rem; font-size: 0.84rem; cursor: pointer; }
    .btn-add[disabled] { opacity: 0.55; cursor: not-allowed; }
  `],
})
export class TrainingPlanCreateComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  editId = signal<number | null>(null);

  audienceOpts = AUDIENCE;
  statuses = ['planned', 'ongoing', 'completed', 'cancelled'];

  title = signal('');
  institution = signal('');
  venue = signal('');
  startDate = signal('');
  endDate = signal('');
  fund = signal('');
  status = signal('planned');
  scope = signal<string[]>([]);
  regionOpts = signal<string[]>([]);
  audience = signal<string[]>([]);
  objective = signal('');
  saving = signal(false);
  error = signal('');

  valid = computed(() => this.title().trim().length > 0 && this.institution().trim().length > 0);

  ngOnInit(): void {
    this.http.get<any[]>('/api/v1/portal/regions').subscribe(rs => this.regionOpts.set((rs ?? []).map(r => r.name)));
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (!edit) { return; }
    this.editId.set(Number(edit));
    this.http.get<any>(`/api/v1/training-plans/${edit}`).subscribe({
      next: t => {
        this.title.set(t.title ?? '');
        this.institution.set(t.institution ?? '');
        this.objective.set(t.objective ?? '');
        this.scope.set(t.scope ?? []);
        this.audience.set(t.audience ?? []);
        this.venue.set(t.venue ?? '');
        this.startDate.set(t.startDate ?? '');
        this.endDate.set(t.endDate ?? '');
        this.fund.set(t.sourceOfFund ?? '');
        this.status.set(t.status ?? 'planned');
      },
      error: () => this.error.set('Could not load the training plan for editing.'),
    });
  }

  toggleAudience(a: string): void {
    this.audience.update(list => list.includes(a) ? list.filter(x => x !== a) : [...list, a]);
  }

  toggleScope(r: string): void {
    this.scope.update(list => list.includes(r) ? list.filter(x => x !== r) : [...list, r]);
  }

  submit(): void {
    if (!this.valid()) { this.error.set('Title and Implementing Institution are required.'); return; }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      title: this.title().trim(), institution: this.institution().trim(), objective: this.objective() || null,
      scope: this.scope(),
      audience: this.audience(), venue: this.venue() || null,
      startDate: this.startDate() || null, endDate: this.endDate() || null,
      sourceOfFund: this.fund() || null, status: this.status(),
    };
    const id = this.editId();
    const req = id == null
      ? this.http.post('/api/v1/training-plans', payload)
      : this.http.put(`/api/v1/training-plans/${id}`, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/m/preparedness/trainings']); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || e?.error?.detail || 'Could not save the training plan. Please try again.'); },
    });
  }

  cancel(): void { this.router.navigate(['/m/preparedness/trainings']); }
}
