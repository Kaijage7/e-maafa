import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';

const CHANNELS = ['SMS', 'Email', 'WhatsApp', 'Push'];
const HAZARDS = ['Floods', 'Heavy Rainfall', 'Strong Winds', 'Drought', 'Large Waves', 'Earthquake', 'Disease Outbreak'];

/** Alert Subscriptions → New Subscriber — a real create form that POSTs to the Spring Boot API. */
@Component({
  selector: 'page-alert-subscription-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RegionDistrictPickerComponent],
  template: `
    <dmis-page-header title="New Subscriber" icon="fa-bell"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Alert Subscriptions', url:'/m/preparedness/alert-subscriptions'}, {label:'New Subscriber'}]">
    </dmis-page-header>

    <div class="panel-row">
      <dmis-panel title="Subscriber Details" icon="fa-clipboard-list">
        <div class="form-body">
          <div class="form-grid">
            <div class="fg">
              <label>Full Name <span class="req">*</span></label>
              <input type="text" [value]="fullName()" (input)="fullName.set($any($event.target).value)" placeholder="Subscriber full name">
            </div>
            <dmis-region-district class="fg-wide" [showCouncil]="false"
              [region]="region()" (regionChange)="region.set($event)"
              [district]="district()" (districtChange)="district.set($event)" />
            <div class="fg">
              <label>Phone Number</label>
              <input type="text" [value]="phone()" (input)="phone.set($any($event.target).value)" placeholder="07XX XXX XXX">
            </div>
            <div class="fg">
              <label>Email</label>
              <input type="email" [value]="email()" (input)="email.set($any($event.target).value)" placeholder="email@example.com">
            </div>
            <div class="fg">
              <label>Alert Level Priority</label>
              <select [value]="priority()" (change)="priority.set($any($event.target).value)">
                <option value="All Levels">All Levels</option>
                <option value="Advisory">Advisory</option>
                <option value="Warning">Warning</option>
                <option value="Major Warning">Major Warning</option>
              </select>
            </div>
            <div class="fg"></div>
            <div class="fg fg-wide">
              <label>Communication Channels <span class="req">*</span></label>
              <div class="chips">
                @for (c of channelOpts; track c) {
                  <button type="button" class="chip" [class.on]="channels().includes(c)" (click)="toggle(channels, c)">{{ c }}</button>
                }
              </div>
            </div>
            <div class="fg fg-wide">
              <label>Hazards of Interest</label>
              <div class="chips">
                @for (h of hazardOpts; track h) {
                  <button type="button" class="chip chip-amber" [class.on]="hazards().includes(h)" (click)="toggle(hazards, h)">{{ h }}</button>
                }
              </div>
            </div>
            <div class="fg fg-wide">
              <label class="consent"><input type="checkbox" [checked]="consent()" (change)="consent.set($any($event.target).checked)"> Subscriber consents to receive alerts</label>
            </div>
          </div>

          @if (error()) { <div class="form-error"><i class="fas fa-exclamation-circle"></i> {{ error() }}</div> }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancel()">Cancel</button>
            <button type="button" class="btn-add" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Saving…' : (editId() ? 'Update Subscriber' : 'Create Subscriber') }}
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
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chip { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 20px; padding: 0.3rem 0.8rem; font-size: 0.78rem; cursor: pointer; }
    .chip.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .chip-amber.on { background: #d97706; border-color: #d97706; }
    .consent { display: flex; align-items: center; gap: 0.5rem; flex-direction: row; font-weight: 400; }
    .consent input { width: auto; }
    .form-error { margin-top: 0.9rem; background: rgba(220,38,38,0.08); color: #dc2626; padding: 0.55rem 0.8rem; border-radius: 9px; font-size: 0.82rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-ghost { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 9px; padding: 0.5rem 1.1rem; font-size: 0.84rem; cursor: pointer; }
    .btn-add[disabled] { opacity: 0.55; cursor: not-allowed; }
  `],
})
export class AlertSubscriptionCreateComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  editId = signal<number | null>(null);

  channelOpts = CHANNELS;
  hazardOpts = HAZARDS;

  fullName = signal('');
  region = signal('');
  district = signal('');
  phone = signal('');
  email = signal('');
  priority = signal('All Levels');
  channels = signal<string[]>(['SMS']);
  hazards = signal<string[]>([]);
  consent = signal(true);
  saving = signal(false);
  error = signal('');

  valid = computed(() => this.fullName().trim().length > 0 && this.channels().length > 0
    && (this.phone().trim().length > 0 || this.email().trim().length > 0));

  ngOnInit(): void {
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (!edit) { return; }
    this.editId.set(Number(edit));
    this.http.get<any>(`/api/v1/alert-subscriptions/${edit}`).subscribe({
      next: s => {
        this.fullName.set(s.fullName ?? '');
        // subscriberLocation is stored as "District, Region" (from the cascade picker) — split it back.
        const loc = String(s.subscriberLocation ?? '').split(',').map((x: string) => x.trim()).filter(Boolean);
        if (loc.length >= 2) { this.district.set(loc[0]); this.region.set(loc[1]); }
        else if (loc.length === 1) { this.region.set(loc[0]); }
        this.phone.set(s.phone ?? '');
        this.email.set(s.email ?? '');
        this.priority.set(s.priority ?? 'All Levels');
        this.channels.set(s.channels ?? ['SMS']);
        this.hazards.set(s.hazards ?? []);
        this.consent.set(s.consent ?? true);
      },
      error: () => this.error.set('Could not load the subscriber for editing.'),
    });
  }

  toggle(sig: ReturnType<typeof signal<string[]>>, v: string): void {
    sig.update(list => list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  }

  submit(): void {
    if (!this.valid()) { this.error.set('Full Name, at least one Channel, and a Phone or Email are required.'); return; }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      fullName: this.fullName().trim(),
      subscriberLocation: [this.district(), this.region()].filter(Boolean).join(', ') || null,
      channels: this.channels(), phone: this.phone() || null, email: this.email() || null,
      hazards: this.hazards(), priority: this.priority(), languages: ['English', 'Swahili'], consent: this.consent(),
    };
    const id = this.editId();
    const req = id == null
      ? this.http.post('/api/v1/alert-subscriptions', payload)
      : this.http.put(`/api/v1/alert-subscriptions/${id}`, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/m/preparedness/alert-subscriptions']); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || e?.error?.detail || 'Could not save the subscriber. Please try again.'); },
    });
  }

  cancel(): void { this.router.navigate(['/m/preparedness/alert-subscriptions']); }
}
