import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

/**
 * Self-service password reset — step 2: the emailed link lands here with the single-use
 * token; the new password must satisfy the shared policy (same rules as change-password).
 */
@Component({
    selector: 'page-reset-password',
    imports: [FormsModule, RouterLink],
    styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; padding: 20px; }
    .card { width: 440px; max-width: 94vw; background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 30px 34px; }
    h1 { font-size: 1.15rem; color: #0d3b66; margin: 0 0 6px; }
    p { font-size: 0.88rem; color: #475569; margin: 0 0 10px; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin: 10px 0 4px; }
    .field { position: relative; }
    .field input { width: 100%; font-size: 0.92rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 9px 4.5rem 9px 11px; font-family: inherit; box-sizing: border-box; }
    .field input:focus { outline: 2px solid #0d3b66; outline-offset: 1px; }
    .pwd-toggle { position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: #64748b; cursor: pointer; padding: 0.3rem 0.45rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.3rem; font-family: inherit; font-size: 0.75rem; font-weight: 700; }
    .pwd-toggle:hover { color: #0d3b66; background: #f0f3f7; }
    .hint { font-size: 0.78rem; color: #94a3b8; margin-top: 8px; }
    .btn { width: 100%; margin-top: 16px; padding: 10px; background: #0d3b66; color: #fff; border: none; border-radius: 7px; font-size: 0.92rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .btn:disabled { opacity: 0.6; cursor: default; }
    .note { margin-top: 14px; font-size: 0.85rem; font-weight: 600; border-radius: 8px; padding: 10px 12px; }
    .ok { color: #065f46; background: #d1fae5; }
    .err { color: #b91c1c; background: #fee2e2; }
    .back { display: inline-block; margin-top: 16px; font-size: 0.82rem; color: #0d3b66; font-weight: 600; text-decoration: none; }
    .back:hover { text-decoration: underline; }
  `],
    template: `
    <div class="wrap">
      <div class="card">
        <h1><i class="fas fa-key" style="opacity:0.6; margin-right:6px"></i> Set a new password</h1>
        @if (!token) {
          <div class="note err">This page must be opened from the reset link in your email.
            <a routerLink="/forgot-password">Request a new link</a>.</div>
        } @else if (done()) {
          <div class="note ok"><i class="fas fa-circle-check"></i> Password reset successfully.</div>
          <a class="back" routerLink="/login"><i class="fas fa-right-to-bracket"></i> Proceed to sign in</a>
        } @else {
          <form (ngSubmit)="submit()">
            <label for="rp-pw">New password</label>
            <div class="field">
              <input id="rp-pw" [type]="showPw() ? 'text' : 'password'" [(ngModel)]="pw" name="pw"
                     autocomplete="new-password" [disabled]="busy()">
              <button type="button" class="pwd-toggle" (click)="showPw.set(!showPw())"
                      [attr.aria-label]="showPw() ? 'Hide password' : 'Show password'"
                      [attr.title]="showPw() ? 'Hide password' : 'Show password'">
                <i class="fas" [class.fa-eye]="!showPw()" [class.fa-eye-slash]="showPw()"></i>
                <span>{{ showPw() ? 'Hide' : 'Show' }}</span>
              </button>
            </div>
            <label for="rp-confirm">Confirm new password</label>
            <div class="field">
              <input id="rp-confirm" [type]="showConfirm() ? 'text' : 'password'" [(ngModel)]="confirm" name="confirm"
                     autocomplete="new-password" [disabled]="busy()">
              <button type="button" class="pwd-toggle" (click)="showConfirm.set(!showConfirm())"
                      [attr.aria-label]="showConfirm() ? 'Hide password' : 'Show password'"
                      [attr.title]="showConfirm() ? 'Hide password' : 'Show password'">
                <i class="fas" [class.fa-eye]="!showConfirm()" [class.fa-eye-slash]="showConfirm()"></i>
                <span>{{ showConfirm() ? 'Hide' : 'Show' }}</span>
              </button>
            </div>
            <div class="hint">At least 10 characters, with uppercase, lowercase, a number and a special character.</div>
            @if (msg()) { <div class="note err">{{ msg() }}</div> }
            <button type="submit" class="btn" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Reset password' }}</button>
          </form>
          <a class="back" routerLink="/login"><i class="fas fa-arrow-left"></i> Back to sign in</a>
        }
      </div>
    </div>
  `
})
export class ResetPasswordComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly busy = signal(false);
  readonly done = signal(false);
  readonly msg = signal('');
  readonly showPw = signal(false);
  readonly showConfirm = signal(false);
  token = '';
  pw = '';
  confirm = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
  }

  submit(): void {
    if (!this.pw) { this.msg.set('Enter the new password.'); return; }
    if (this.pw !== this.confirm) { this.msg.set('The new passwords do not match.'); return; }
    this.busy.set(true); this.msg.set('');
    this.http.post<any>('/api/v1/auth/reset-password', { token: this.token, newPassword: this.pw }).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); },
      error: err => {
        this.busy.set(false);
        this.msg.set(err?.error?.detail ?? err?.error?.message ?? 'The password could not be reset — request a new link.');
      },
    });
  }
}
