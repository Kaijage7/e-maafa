import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

/**
 * Self-service password reset — step 1: request the emailed link. The confirmation is
 * deliberately UNIFORM about whether the account exists, so this page can never be used
 * to probe which emails hold accounts. Mail-gateway configuration is reported honestly
 * so ops are not misled when SMTP is not wired.
 */
@Component({
  selector: 'page-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; padding: 20px; }
    .card { width: 420px; max-width: 94vw; background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 30px 34px; }
    h1 { font-size: 1.15rem; color: #0d3b66; margin: 0 0 6px; }
    p { font-size: 0.88rem; color: #475569; margin: 0 0 16px; line-height: 1.45; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin: 10px 0 4px; }
    input { width: 100%; font-size: 0.92rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 9px 11px; font-family: inherit; box-sizing: border-box; }
    input:focus { outline: 2px solid #0d3b66; outline-offset: 1px; }
    .btn { width: 100%; margin-top: 16px; padding: 10px; background: #0d3b66; color: #fff; border: none; border-radius: 7px; font-size: 0.92rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .btn:disabled { opacity: 0.6; cursor: default; }
    .note { margin-top: 14px; font-size: 0.85rem; font-weight: 600; border-radius: 8px; padding: 10px 12px; line-height: 1.45; }
    .ok { color: #065f46; background: #d1fae5; }
    .warn { color: #92400e; background: #fef3c7; }
    .err { color: #b91c1c; background: #fee2e2; }
    .back { display: inline-block; margin-top: 16px; font-size: 0.82rem; color: #0d3b66; font-weight: 600; text-decoration: none; }
    .back:hover { text-decoration: underline; }
  `],
  template: `
    <div class="wrap">
      <div class="card">
        <h1><i class="fas fa-key" style="opacity:0.6; margin-right:6px"></i> Reset your password</h1>
        <p>Enter the email address of your e-MAAFA account. If it exists, a reset link
           valid for 60 minutes will be emailed to it.</p>
        @if (!sent()) {
          <form (ngSubmit)="submit()">
            <label for="fp-email">Email address</label>
            <input id="fp-email" type="email" [(ngModel)]="email" name="email" autocomplete="email"
                   [disabled]="busy()" required>
            @if (err()) {
              <div class="note err">{{ err() }}</div>
            }
            <button type="submit" class="btn" [disabled]="busy() || !email.trim()">
              {{ busy() ? 'Sending…' : 'Send reset link' }}</button>
          </form>
        } @else {
          <div class="note" [class.ok]="mailConfigured() !== false" [class.warn]="mailConfigured() === false">
            <i class="fas" [class.fa-envelope-circle-check]="mailConfigured() !== false"
               [class.fa-triangle-exclamation]="mailConfigured() === false"></i>
            {{ note() }}
          </div>
          @if (mailConfigured() === false) {
            <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">
              An administrator must set <code>MAIL_HOST</code>, <code>MAIL_USERNAME</code> and
              <code>MAIL_PASSWORD</code> on the API server. On local profile the reset link is also
              written to the backend log for operators.
            </p>
          }
        }
        <a class="back" routerLink="/login"><i class="fas fa-arrow-left"></i> Back to sign in</a>
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private readonly http = inject(HttpClient);
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly err = signal('');
  readonly note = signal('');
  /** null = unknown (network); true/false from API when available */
  readonly mailConfigured = signal<boolean | null>(null);
  email = '';

  submit(): void {
    const value = this.email.trim();
    if (!value) {
      this.err.set('Enter your email address.');
      return;
    }
    this.busy.set(true);
    this.err.set('');
    this.http.post<{ success?: boolean; message?: string; mailConfigured?: boolean }>(
      '/api/v1/auth/forgot-password',
      { email: value },
    ).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.sent.set(true);
        this.mailConfigured.set(typeof res?.mailConfigured === 'boolean' ? res.mailConfigured : null);
        this.note.set(res?.message
          || 'If an account exists for that email, a password reset link has been sent. Check inbox and spam.');
      },
      // Uniform confirmation even on transient errors — never reveal account state.
      error: () => {
        this.busy.set(false);
        this.sent.set(true);
        this.mailConfigured.set(null);
        this.note.set(
          'If an account exists for that email, a password reset link has been sent. Check inbox and spam. '
          + 'If nothing arrives, contact your administrator — the mail gateway may be offline.',
        );
      },
    });
  }
}
