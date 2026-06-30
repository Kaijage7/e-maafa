import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

const TYPES = ['Government Institution', 'Non-Governmental Organization (NGO)', 'Community-Based Organization (CBO)',
  'Faith-Based Organization', 'Private Sector', 'UN / International Agency', 'Academic / Research', 'Development Partner', 'Other'];

/**
 * Public partner / stakeholder self-registration ("/register-partner") — the page the outreach QR code
 * opens on a phone. Posts to the public portal API (no login); the backend records the partner as
 * pending-verification and sends a genuine confirmation SMS/email via the M-Gov gateway.
 */
@Component({
  selector: 'public-register-partner',
  standalone: true,
  imports: [RouterLink],
  styles: [`
    .rp-wrap { max-width: 780px; margin: 0 auto; padding: 6.5rem 1.25rem 4rem; }
    .rp-head { background: linear-gradient(135deg, #0d3b66 0%, #08243f 100%); color: #fff; border-radius: 18px 18px 0 0; padding: 1.6rem 1.6rem 1.4rem; position: relative; overflow: hidden; }
    .rp-head .seal { position:absolute; right:-18px; top:-18px; font-size:7rem; opacity:.08; }
    .rp-eyebrow { font-size:.68rem; font-weight:800; letter-spacing:.13em; text-transform:uppercase; color:#f0b429; }
    .rp-title { font-size:1.5rem; font-weight:800; margin:.35rem 0 .3rem; line-height:1.15; }
    .rp-sub { font-size:.86rem; opacity:.9; max-width:36rem; }
    .rp-card { background:#fff; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 18px 18px; padding:1.5rem 1.6rem 1.7rem; box-shadow:0 10px 30px rgba(13,59,102,.08); }
    .rp-section { font-size:.72rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#0d3b66; margin:.4rem 0 .65rem; padding-bottom:.35rem; border-bottom:2px solid #eef2f7; }
    .rp-grid { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; }
    @media (max-width:560px){ .rp-grid { grid-template-columns:1fr; } }
    .rp-field label { display:block; font-size:.74rem; font-weight:700; color:#334155; margin-bottom:.28rem; }
    .rp-field label .req { color:#dc2626; }
    .rp-field .form-control, .rp-field select.form-control { width:100%; }
    .rp-submit { width:100%; justify-content:center; margin-top:1.1rem; font-size:.95rem; padding:.7rem; }
    .rp-note { font-size:.72rem; color:#94a3b8; text-align:center; margin:.7rem 0 0; }
    .rp-steps { display:flex; gap:.5rem; justify-content:center; margin:1.2rem 0 .2rem; flex-wrap:wrap; }
    .rp-step { font-size:.74rem; color:#475569; background:#f1f5f9; border-radius:30px; padding:.3rem .8rem; }
    .rp-done { text-align:center; background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:2.6rem 1.6rem; box-shadow:0 10px 30px rgba(13,59,102,.08); }
  `],
  template: `
    <div class="rp-wrap">
      <a routerLink="/" style="color:#0d3b66;text-decoration:none;font-size:.82rem;font-weight:600;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>

      @if (!done()) {
        <div class="rp-head" style="margin-top:.7rem;">
          <i class="fas fa-landmark seal"></i>
          <div class="rp-eyebrow"><i class="fas fa-shield-halved me-1"></i> Prime Minister's Office · Disaster Management</div>
          <div class="rp-title">Partner &amp; Stakeholder Registration</div>
          <div class="rp-sub">Register your institution with the e-MAAFA national disaster-management platform to coordinate on preparedness, early warning and response. On submission you'll receive a confirmation SMS, and PMO will review and verify your details.</div>
        </div>
        <div class="rp-card">
          <div class="rp-section">Organization details</div>
          <div class="rp-field" style="margin-bottom:.85rem;">
            <label>Organization / group name <span class="req">*</span></label>
            <input class="form-control" placeholder="e.g. Tanzania Red Cross Society" [value]="orgName()" (input)="orgName.set($any($event.target).value)">
          </div>
          <div class="rp-field">
            <label>Type of organization <span class="req">*</span></label>
            <select class="form-control" [value]="type()" (change)="type.set($any($event.target).value)">
              @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </div>

          <div class="rp-section" style="margin-top:1.3rem;">Contact</div>
          <div class="rp-grid">
            <div class="rp-field">
              <label>Phone number <span class="req">*</span></label>
              <input class="form-control" placeholder="0712 345 678" inputmode="tel" [value]="phone()" (input)="phone.set($any($event.target).value)">
            </div>
            <div class="rp-field">
              <label>Email <span style="font-weight:500;color:#94a3b8;">(optional)</span></label>
              <input type="email" class="form-control" placeholder="name@organization.org" [value]="email()" (input)="email.set($any($event.target).value)">
            </div>
          </div>

          <div class="rp-section" style="margin-top:1.3rem;">Coverage area</div>
          <div class="rp-grid">
            <div class="rp-field">
              <label>Region</label>
              <select class="form-control" [value]="regionId()" (change)="onRegion($any($event.target).value)">
                <option value="">Select region…</option>
                @for (r of regions(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
              </select>
            </div>
            <div class="rp-field">
              <label>District / Council</label>
              <select class="form-control" [value]="districtName()" (change)="districtName.set($any($event.target).value)" [disabled]="!districts().length">
                <option value="">Select district…</option>
                @for (d of districts(); track d.id) { <option [value]="d.name">{{ d.name }}</option> }
              </select>
            </div>
          </div>

          @if (error()) { <div style="color:#dc2626;font-size:.84rem;margin-top:.9rem;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:.55rem .75rem;"><i class="fas fa-circle-exclamation me-1"></i>{{ error() }}</div> }
          <button class="btn-gold rp-submit" [disabled]="!valid() || saving()" (click)="submit()">
            <i class="fas" [class.fa-paper-plane]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
            {{ saving() ? 'Submitting registration…' : 'Submit registration' }}
          </button>
          <p class="rp-note"><i class="fas fa-lock me-1"></i>By registering you consent to PMO contacting you about disaster coordination. Your details are held securely under the national DMIS.</p>
        </div>
      } @else {
        <div class="rp-head" style="margin-top:.7rem;border-radius:18px;">
          <i class="fas fa-circle-check seal"></i>
          <div class="rp-eyebrow"><i class="fas fa-shield-halved me-1"></i> Prime Minister's Office · Disaster Management</div>
          <div class="rp-title">Registration received</div>
        </div>
        <div class="rp-done">
          <i class="fas fa-circle-check" style="font-size:3.1rem;color:#16a34a;"></i>
          <h3 style="font-weight:800;color:#0d3b66;margin:1rem 0 .35rem;">Congratulations, {{ orgName() }}!</h3>
          <p style="color:#475569;max-width:30rem;margin:0 auto;">{{ doneMsg() }}</p>
          <div class="rp-steps">
            <span class="rp-step"><i class="fas fa-1 me-1"></i> Submitted</span>
            <span class="rp-step"><i class="fas fa-2 me-1"></i> SMS confirmation sent</span>
            <span class="rp-step"><i class="fas fa-3 me-1"></i> PMO verification</span>
          </div>
          <a routerLink="/" class="btn-outline-gold" style="margin-top:1.3rem;justify-content:center;display:inline-flex;"><i class="fas fa-house me-1"></i> Back to home</a>
        </div>
      }
    </div>
  `,
})
export class RegisterPartnerComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  types = TYPES;
  orgName = signal(''); type = signal(TYPES[1]); phone = signal(''); email = signal('');
  regionId = signal(''); regionName = signal(''); districtName = signal('');
  regions = signal<{ id: number; name: string }[]>([]);
  districts = signal<{ id: number; name: string }[]>([]);
  saving = signal(false); error = signal(''); done = signal(false); doneMsg = signal('');

  constructor() {
    this.http.get<{ id: number; name: string }[]>('/api/v1/portal/regions')
      .subscribe({ next: r => this.regions.set(r || []), error: () => { /* form still works without the cascade */ } });
  }

  valid = computed(() => this.orgName().trim().length > 1 && this.phone().trim().length >= 9);

  onRegion(id: string): void {
    this.regionId.set(id);
    this.regionName.set(this.regions().find(x => String(x.id) === id)?.name || '');
    this.districtName.set('');
    this.districts.set([]);
    if (id) {
      this.http.get<{ id: number; name: string }[]>(`/api/v1/portal/regions/${id}/districts`)
        .subscribe({ next: d => this.districts.set(d || []), error: () => { /* district optional */ } });
    }
  }

  submit(): void {
    this.saving.set(true);
    this.error.set('');
    this.http.post<{ id: number; message: string }>('/api/v1/portal/register-stakeholder', {
      name: this.orgName().trim(), organization: this.orgName().trim(), type: this.type(),
      phone: this.phone().trim(), email: this.email().trim() || null,
      region: this.regionName() || null, district: this.districtName() || null, country: 'Tanzania',
    }).subscribe({
      next: r => { this.saving.set(false); this.done.set(true); this.doneMsg.set(r.message); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.detail || e?.error?.message || 'Could not register — please check your details and try again.'); },
    });
  }
}
