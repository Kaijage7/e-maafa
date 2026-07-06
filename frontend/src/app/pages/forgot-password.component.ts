import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

/**
 * Self-service password reset — step 1: request the emailed link. The confirmation is
 * deliberately UNIFORM (the server answers identically whether or not the account exists),
 * so this page can never be used to probe which emails hold accounts.
 */
@Component({
  selector: 'page-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; padding: 20px; }
    .card { width: 420px; max-width: 94vw; background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 30px 34px; }
    h1 { font-size: 1.15rem; color: #0d3b66; margin: 0 0 6px; }
    p { font-size: 0.88rem; color: #475569; margin: 0 0 16px; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin: 10px 0 4px; }
    input { width: 100%; font-size: 0.92rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 9px 11px; font-family: inherit; box-sizing: border-box; }
    input:focus { outline: 2px solid #0d3b66; outline-offset: 1px; }
    .btn { width: 100%; margin-top: 16px; padding: 10px; background: #0d3b66; color: #fff; border: none; border-radius: 7px; font-size: 0.92rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .btn:disabled { opacity: 0.6; cursor: default; }
    .note { margin-top: 14px; font-size: 0.85rem; font-weight: 600; color: #065f46; background: #d1fae5; border-radius: 8px; padding: 10px 12px; }
    .back { display: inline-block; margin-top: 16px; font-size: 0.82rem; color: #0d3b66; font-weight: 600; text-decoration: none; }
    .back:hover { text-decoration: underline; }
  `],
  template: `
    <div class="wrap">
      <div class="card">
        <h1><i class="fas fa-key" style="opacity:0.6; margin-right:6px"></i> Reset your password</h1>
        <p>Enter the email address of your e-MAAFA account. If it exists, a reset link
           valid for 60 minutes will be sent to it.</p>
        @if (!sent()) {
          <form (ngSubmit)="submit()">
            <label>Email address</label>
            <input type="email" [(ngModel)]="email" name="email" autocomplete="email" [disabled]="busy()">
            <button type="submit" class="btn" [disabled]="busy() || !email.trim()">
              {{ busy() ? 'Sending…' : 'Send reset link' }}</button>
          </form>
        } @else {
          <div class="note"><i class="fas fa-envelope-circle-check"></i>
            If an account exists for that email, a password reset link has been sent.
            Check your inbox (and spam folder).</div>
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
  email = '';

  submit(): void {
    this.busy.set(true);
    this.http.post('/api/v1/auth/forgot-password', { email: this.email.trim() }).subscribe({
      next: () => { this.busy.set(false); this.sent.set(true); },
      // Uniform confirmation even on transient errors — this surface never reveals account state.
      error: () => { this.busy.set(false); this.sent.set(true); },
    });
  }
}
