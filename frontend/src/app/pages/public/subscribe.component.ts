import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

const CHANNELS = ['SMS', 'Email', 'WhatsApp'];
const HAZARDS = ['Floods', 'Heavy Rainfall', 'Strong Winds', 'Drought', 'Large Waves', 'Earthquake', 'Disease Outbreak'];

/**
 * Public alert subscription ("/subscribe") — reproduces public/alert-subscription.blade.php:
 * subscribe form (channels, hazards, priority, consent) + the unsubscribe flow, both posting
 * to the public portal API (no login needed — citizens use this from the landing CTA).
 */
@Component({
  selector: 'public-subscribe',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 760px; margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      <a routerLink="/" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>
      <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0.8rem 0 0.3rem;">{{ L.t('lbl_subscribe_to_alerts') }}</h1>
      <p style="color:var(--text-secondary, #64748b);margin-bottom:1.4rem;">Receive official early warnings for your area — free of charge.</p>

      <!-- Tabs: subscribe / unsubscribe -->
      <div style="display:flex;gap:0.5rem;margin-bottom:1.4rem;">
        <button type="button" (click)="tab.set('sub')" [style.background]="tab() === 'sub' ? '#003366' : 'transparent'" [style.color]="tab() === 'sub' ? '#fff' : '#475569'"
                style="border:1px solid rgba(0,51,102,0.25);border-radius:20px;padding:0.45rem 1.2rem;font-size:0.85rem;font-weight:600;cursor:pointer;">Subscribe</button>
        <button type="button" (click)="tab.set('unsub')" [style.background]="tab() === 'unsub' ? '#003366' : 'transparent'" [style.color]="tab() === 'unsub' ? '#fff' : '#475569'"
                style="border:1px solid rgba(0,51,102,0.25);border-radius:20px;padding:0.45rem 1.2rem;font-size:0.85rem;font-weight:600;cursor:pointer;">Unsubscribe</button>
      </div>

      @if (tab() === 'sub') {
        @if (!doneId()) {
          <div style="background:var(--card-bg, #fff);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:1.4rem;display:grid;gap:0.9rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.9rem;">
              <input class="form-control" placeholder="Full name *" [value]="fullName()" (input)="fullName.set($any($event.target).value)">
              <input class="form-control" placeholder="Location (region / district)" [value]="location()" (input)="location.set($any($event.target).value)">
              <input class="form-control" placeholder="Phone number" [value]="phone()" (input)="phone.set($any($event.target).value)">
              <input type="email" class="form-control" placeholder="Email" [value]="email()" (input)="email.set($any($event.target).value)">
            </div>
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:var(--text-primary, #2C3E50);margin-bottom:0.4rem;">How should we reach you? *</div>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                @for (c of channelOpts; track c) {
                  <button type="button" (click)="toggle(channels, c)" [style.background]="channels().includes(c) ? '#003366' : 'transparent'" [style.color]="channels().includes(c) ? '#fff' : '#475569'"
                          style="border:1px solid rgba(0,51,102,0.3);border-radius:18px;padding:0.32rem 0.9rem;font-size:0.8rem;cursor:pointer;">{{ c }}</button>
                }
              </div>
            </div>
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:var(--text-primary, #2C3E50);margin-bottom:0.4rem;">Hazards of interest</div>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                @for (h of hazardOpts; track h) {
                  <button type="button" (click)="toggle(hazards, h)" [style.background]="hazards().includes(h) ? '#d97706' : 'transparent'" [style.color]="hazards().includes(h) ? '#fff' : '#475569'"
                          style="border:1px solid rgba(217,119,6,0.4);border-radius:18px;padding:0.32rem 0.9rem;font-size:0.8rem;cursor:pointer;">{{ h }}</button>
                }
              </div>
            </div>
            <select class="form-control" [value]="priority()" (change)="priority.set($any($event.target).value)">
              <option value="All Levels">All alert levels</option><option value="Advisory">Advisory and above</option>
              <option value="Warning">Warning and above</option><option value="Major Warning">Major Warning only</option>
            </select>
            <label style="display:flex;gap:0.5rem;align-items:flex-start;font-size:0.82rem;color:var(--text-secondary, #475569);">
              <input type="checkbox" [checked]="consent()" (change)="consent.set($any($event.target).checked)" style="margin-top:3px;">
              I consent to receive emergency alerts from the Prime Minister's Office through the channels selected above.
            </label>
            @if (error()) { <div style="color:#dc2626;font-size:0.82rem;">{{ error() }}</div> }
            <button class="btn-gold" style="justify-content:center;" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-bell]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Subscribing…' : 'Subscribe' }}
            </button>
          </div>
        } @else {
          <div style="text-align:center;background:var(--card-bg, #fff);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:2.5rem 1.5rem;">
            <i class="fas fa-check-circle" style="font-size:3rem;color:#4ade80;"></i>
            <h4 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:1rem 0 0.4rem;">You are subscribed</h4>
            <p style="color:var(--text-secondary, #64748b);">Subscription reference:</p>
            <div style="font-weight:800;font-size:1.15rem;color:#60a5fa;letter-spacing:1px;">{{ doneId() }}</div>
          </div>
        }
      } @else {
        @if (unsubStep() === 'done') {
          <div style="background:var(--card-bg, #fff);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:1.6rem;text-align:center;">
            <i class="fas fa-check-circle" style="font-size:2.6rem;color:#059669;"></i>
            <h4 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0.8rem 0 0.3rem;">Unsubscribed</h4>
            <p style="font-size:0.88rem;color:var(--text-secondary, #475569);margin:0;">{{ unsubMsg() }}</p>
          </div>
        } @else {
          <div style="background:var(--card-bg, #fff);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:1.4rem;display:grid;gap:0.9rem;">
            @if (unsubStep() === 'request') {
              <p style="font-size:0.88rem;color:var(--text-secondary, #475569);margin:0;">Enter the phone number or email you subscribed with. We send you a one-time confirmation code so only you can stop your own alerts.</p>
              <input class="form-control" placeholder="Phone or email" [value]="unsubContact()" (input)="unsubContact.set($any($event.target).value)">
              <label style="font-size:0.82rem;font-weight:700;color:var(--text-primary, #2C3E50);">Why are you unsubscribing? <span style="font-weight:500;color:var(--text-secondary,#94a3b8);">(optional)</span></label>
              <select class="form-control" [value]="unsubReason()" (change)="unsubReason.set($any($event.target).value)">
                <option value="">Select a reason…</option>
                @for (r of unsubReasons(); track r.en) { <option [value]="r.en">{{ L.lang() === 'sw' ? (r.sw || r.en) : r.en }}</option> }
                <option value="__other">Other (please specify)</option>
              </select>
              @if (unsubReason() === '__other') {
                <textarea rows="2" class="form-control" placeholder="Tell us why…" [value]="unsubReasonOther()" (input)="unsubReasonOther.set($any($event.target).value)"></textarea>
              }
              @if (unsubMsg()) { <div [style.color]="unsubOk() ? '#059669' : '#dc2626'" style="font-size:0.84rem;">{{ unsubMsg() }}</div> }
              <button class="btn-outline-gold" style="justify-content:center;" [disabled]="!unsubContact().trim() || saving()" (click)="requestUnsub()">
                <i class="fas fa-paper-plane"></i> {{ saving() ? 'Sending…' : 'Send confirmation code' }}
              </button>
            } @else {
              <p style="font-size:0.88rem;color:var(--text-secondary, #475569);margin:0;">{{ unsubMsg() }}</p>
              <input class="form-control" placeholder="6-digit code" inputmode="numeric" maxlength="6" [value]="unsubCode()" (input)="unsubCode.set($any($event.target).value)">
              @if (unsubErr()) { <div style="color:#dc2626;font-size:0.84rem;">{{ unsubErr() }}</div> }
              <div style="display:flex;gap:0.6rem;">
                <button class="btn-outline-gold" style="flex:1;justify-content:center;" [disabled]="unsubCode().trim().length < 4 || saving()" (click)="confirmUnsub()">
                  <i class="fas fa-bell-slash"></i> {{ saving() ? 'Confirming…' : 'Confirm unsubscribe' }}
                </button>
                <button type="button" (click)="unsubStep.set('request'); unsubErr.set('')" style="background:transparent;border:1px solid rgba(0,0,0,0.15);border-radius:8px;padding:0 0.9rem;font-size:0.8rem;color:#475569;cursor:pointer;">Back</button>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class SubscribeComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);

  channelOpts = CHANNELS;
  hazardOpts = HAZARDS;
  tab = signal<'sub' | 'unsub'>('sub');
  fullName = signal(''); location = signal(''); phone = signal(''); email = signal('');
  channels = signal<string[]>(['SMS']); hazards = signal<string[]>([]);
  priority = signal('All Levels'); consent = signal(false);
  saving = signal(false); error = signal(''); doneId = signal('');
  unsubContact = signal(''); unsubMsg = signal(''); unsubOk = signal(false);
  // Two-step unsubscribe (ownership proof) + an optional CMS-controlled reason.
  unsubStep = signal<'request' | 'confirm' | 'done'>('request');
  unsubCode = signal(''); unsubErr = signal('');
  unsubReason = signal(''); unsubReasonOther = signal('');
  unsubReasons = signal<{ en: string; sw: string }[]>([]);

  constructor() {
    // Reason options are managed in Content Management → Portal Management (the unsubscribe.reasons setting).
    this.http.get<{ reasons: { en: string; sw: string }[] }>('/api/v1/portal/unsubscribe-reasons')
      .subscribe({ next: d => this.unsubReasons.set(d.reasons || []), error: () => { /* form falls back to free-text */ } });
  }

  valid = computed(() => this.fullName().trim().length > 0 && this.channels().length > 0
    && (this.phone().trim().length > 0 || this.email().trim().length > 0) && this.consent());

  toggle(sig: ReturnType<typeof signal<string[]>>, v: string): void {
    sig.update(list => list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  }

  submit(): void {
    this.saving.set(true);
    this.error.set('');
    this.http.post<{ subscriptionId: string }>('/api/v1/portal/subscribe', {
      fullName: this.fullName().trim(), location: this.location() || null,
      phone: this.phone() || null, email: this.email() || null,
      channels: this.channels(), hazards: this.hazards(), priority: this.priority(),
      languages: ['English', 'Swahili'], consent: this.consent(),
    }).subscribe({
      next: r => { this.saving.set(false); this.doneId.set(r.subscriptionId); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not subscribe.'); },
    });
  }

  /** Step 1 — request a one-time code to the claimed contact (nothing is deactivated yet). */
  requestUnsub(): void {
    this.saving.set(true);
    this.unsubMsg.set('');
    this.unsubOk.set(false);
    this.http.post<{ message: string }>('/api/v1/portal/unsubscribe', { contact: this.unsubContact().trim() }).subscribe({
      next: r => { this.saving.set(false); this.unsubOk.set(true); this.unsubStep.set('confirm'); this.unsubMsg.set(r.message); },
      error: e => { this.saving.set(false); this.unsubOk.set(false); this.unsubMsg.set(e?.error?.message || 'No subscription found for that contact.'); },
    });
  }

  /** Step 2 — confirm with the code (+ optional reason); this is what actually stops the alerts. */
  confirmUnsub(): void {
    this.saving.set(true);
    this.unsubErr.set('');
    const reason = this.unsubReason() === '__other' ? this.unsubReasonOther().trim() : this.unsubReason();
    this.http.post<{ message: string }>('/api/v1/portal/unsubscribe-confirm', {
      contact: this.unsubContact().trim(), code: this.unsubCode().trim(), reason: reason || null,
    }).subscribe({
      next: r => { this.saving.set(false); this.unsubStep.set('done'); this.unsubMsg.set(r.message); },
      error: e => { this.saving.set(false); this.unsubErr.set(e?.error?.message || 'Incorrect or expired code.'); },
    });
  }
}
