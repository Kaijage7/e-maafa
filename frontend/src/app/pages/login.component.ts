import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { FontScaleService } from '../core/font-scale.service';

interface Showcase { src: string; tag: string; icon: string; title: string; desc: string; }

/**
 * e-MAAFA local login. Reworked to the platform's flat, government-grade theme (no gradients,
 * glassmorphism or decorative animations) per the de-AI-footprint direction — uses the navy/green/
 * surface tokens from styles.scss. The original Laravel login-v2 was glassmorphism-heavy; this is a
 * deliberate, sanctioned deviation toward a standard system look.
 */
@Component({
  selector: 'page-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <a href="/" class="back-home"><i class="fas fa-arrow-left"></i> Home</a>
    <div class="font-scale-login" role="group" aria-label="Text size">
      <button type="button" class="fs-btn" (click)="font.decrease()" [disabled]="!font.canDecrease()" title="Smaller text">A−</button>
      <button type="button" class="fs-label" (click)="font.reset()" title="Reset text size">{{ font.percentLabel() }}</button>
      <button type="button" class="fs-btn" (click)="font.increase()" [disabled]="!font.canIncrease()" title="Larger text">A+</button>
    </div>

    <div class="login-page">
      <div class="login-card">
        <div class="card-left">
          @for (img of showcase; track img.src; let i = $index) {
            <div class="showcase-slide" [class.active]="slide() === i"><img [src]="img.src" [alt]="img.title"></div>
          }
          <div class="left-overlay"></div>
          <div class="left-brand">
            <svg class="mini-seal" viewBox="0 0 600 600">
              <circle class="s-ring" cx="300" cy="300" r="270"/>
              <image href="images/emblem.png" x="140" y="140" width="320" height="320"/>
            </svg>
            <div class="lb-text"><div class="lb-title">e-MAAFA</div><div class="lb-sub">Prime Minister's Office</div></div>
          </div>
          <div class="showcase-captions">
            @for (img of showcase; track img.src; let i = $index) {
              <div class="cap-item" [class.active]="slide() === i">
                <div class="cap-tag"><i class="fas {{ img.icon }}"></i> {{ img.tag }}</div>
                <div class="cap-title">{{ img.title }}</div>
                <div class="cap-desc">{{ img.desc }}</div>
              </div>
            }
          </div>
          <div class="slide-dots">
            @for (img of showcase; track img.src; let i = $index) {
              <div class="dot" [class.active]="slide() === i" (click)="slide.set(i)"></div>
            }
          </div>
        </div>

        <div class="card-right">
          <div class="card-seal">
            <svg viewBox="0 0 600 600">
              <defs>
                <path id="topArc" d="M 68,300 A 232,232 0 0,1 532,300"/>
                <path id="bottomArc" d="M 60,300 A 240,240 0 0,0 540,300"/>
              </defs>
              <circle class="seal-outer" cx="300" cy="300" r="270"/>
              <circle class="seal-inner" cx="300" cy="300" r="200"/>
              <image href="images/emblem.png" x="150" y="150" width="300" height="300"/>
              <text class="seal-text"><textPath href="#topArc" startOffset="50%" text-anchor="middle" font-size="32" font-weight="900" font-family="Inter,sans-serif" letter-spacing="4">JAMHURI YA MUUNGANO WA TANZANIA</textPath></text>
              <text class="seal-text"><textPath href="#bottomArc" startOffset="50%" text-anchor="middle" font-size="28" font-weight="800" font-family="Inter,sans-serif" letter-spacing="3">OFISI YA WAZIRI MKUU</textPath></text>
            </svg>
          </div>

          <div class="brand-text">
            <div class="brand-org">United Republic of Tanzania</div>
            <div class="brand-office">Prime Minister's Office</div>
          </div>
          <div class="brand-divider"></div>
          <h2 class="brand-title">e-MAAFA Tanzania</h2>
          <p class="brand-subtitle">Disaster Management Information System</p>

          <div class="card-divider"></div>

          @if (error()) {
            <div class="alert-card"><i class="fas fa-exclamation-circle"></i><span>{{ error() }}</span></div>
          }
          @if (info()) {
            <div class="alert-card info"><i class="fas fa-shield-halved"></i><span>{{ info() }}</span></div>
          }

          @if (step() === 'credentials') {
            <form (ngSubmit)="onSubmit()">
              <div class="field-group">
                <input type="email" name="email" [(ngModel)]="email" placeholder=" " required autocomplete="email">
                <i class="fas fa-envelope f-icon"></i>
                <span class="f-label">Email Address</span>
              </div>
              <div class="field-group has-pwd-toggle">
                <input [type]="showPwd() ? 'text' : 'password'" name="password" [(ngModel)]="password" placeholder=" " required autocomplete="current-password">
                <i class="fas fa-lock f-icon"></i>
                <span class="f-label">Password</span>
                <button type="button" class="pwd-toggle" (click)="showPwd.set(!showPwd())"
                        [attr.aria-label]="showPwd() ? 'Hide password' : 'Show password'"
                        [attr.title]="showPwd() ? 'Hide password' : 'Show password'">
                  <i class="fas" [class.fa-eye]="!showPwd()" [class.fa-eye-slash]="showPwd()"></i>
                  <span class="pwd-toggle-text">{{ showPwd() ? 'Hide' : 'Show' }}</span>
                </button>
              </div>
              <div class="options-row">
                <span class="options-hint">Need help signing in?</span>
                <a class="forgot-link" routerLink="/forgot-password">
                  <i class="fas fa-key"></i> Forgot password?
                </a>
              </div>
              <button type="submit" class="btn-primary-tz" [class.is-loading]="loading()">
                <span class="btn-text"><i class="fas fa-right-to-bracket"></i> Sign In</span>
                <span class="spinner"></span>
              </button>
              <div class="register-row"><span>Accounts are issued by your system administrator.</span></div>
            </form>
          }

          @if (step() === 'mfa') {
            <form (ngSubmit)="onMfa()">
              <p class="step-help">Enter the 6-digit code from your authenticator app.</p>
              <div class="field-group">
                <input type="text" name="mfaCode" inputmode="numeric" pattern="[0-9]*" maxlength="8"
                       [(ngModel)]="mfaCode" placeholder=" " required autocomplete="one-time-code">
                <i class="fas fa-mobile-screen-button f-icon"></i>
                <span class="f-label">Authenticator code</span>
              </div>
              <button type="submit" class="btn-primary-tz" [class.is-loading]="loading()">
                <span class="btn-text"><i class="fas fa-shield-halved"></i> Verify &amp; continue</span>
                <span class="spinner"></span>
              </button>
              <button type="button" class="btn-link" (click)="backToCredentials()">← Back to email / password</button>
            </form>
          }

          @if (step() === 'password') {
            <form (ngSubmit)="onForcedPassword()">
              <p class="step-help">Your administrator set a temporary password. Choose a new one before using the system.</p>
              <div class="field-group has-pwd-toggle">
                <input [type]="showCurPwd() ? 'text' : 'password'" name="curPwd" [(ngModel)]="curPwd" placeholder=" " required autocomplete="current-password">
                <i class="fas fa-key f-icon"></i>
                <span class="f-label">Current (temporary) password</span>
                <button type="button" class="pwd-toggle" (click)="showCurPwd.set(!showCurPwd())"
                        [attr.aria-label]="showCurPwd() ? 'Hide password' : 'Show password'"
                        [attr.title]="showCurPwd() ? 'Hide password' : 'Show password'">
                  <i class="fas" [class.fa-eye]="!showCurPwd()" [class.fa-eye-slash]="showCurPwd()"></i>
                </button>
              </div>
              <div class="field-group has-pwd-toggle">
                <input [type]="showNewPwd() ? 'text' : 'password'" name="newPwd" [(ngModel)]="newPwd" placeholder=" " required autocomplete="new-password">
                <i class="fas fa-lock f-icon"></i>
                <span class="f-label">New password</span>
                <button type="button" class="pwd-toggle" (click)="showNewPwd.set(!showNewPwd())"
                        [attr.aria-label]="showNewPwd() ? 'Hide password' : 'Show password'"
                        [attr.title]="showNewPwd() ? 'Hide password' : 'Show password'">
                  <i class="fas" [class.fa-eye]="!showNewPwd()" [class.fa-eye-slash]="showNewPwd()"></i>
                </button>
              </div>
              <div class="field-group has-pwd-toggle">
                <input [type]="showNewPwd2() ? 'text' : 'password'" name="newPwd2" [(ngModel)]="newPwd2" placeholder=" " required autocomplete="new-password">
                <i class="fas fa-lock f-icon"></i>
                <span class="f-label">Confirm new password</span>
                <button type="button" class="pwd-toggle" (click)="showNewPwd2.set(!showNewPwd2())"
                        [attr.aria-label]="showNewPwd2() ? 'Hide password' : 'Show password'"
                        [attr.title]="showNewPwd2() ? 'Hide password' : 'Show password'">
                  <i class="fas" [class.fa-eye]="!showNewPwd2()" [class.fa-eye-slash]="showNewPwd2()"></i>
                </button>
              </div>
              <p class="policy-hint">Min 10 characters · upper · lower · number · special · not a common password.</p>
              <button type="submit" class="btn-primary-tz" [class.is-loading]="loading()">
                <span class="btn-text"><i class="fas fa-check"></i> Save new password</span>
                <span class="spinner"></span>
              </button>
            </form>
          }

          @if (step() === 'enroll') {
            <div>
              <p class="step-help">
                Your role requires two-factor authentication. Set up an authenticator app
                (Google Authenticator, Microsoft Authenticator, FreeOTP, etc.) before continuing.
              </p>
              @if (!enrollSecret()) {
                <button type="button" class="btn-primary-tz" [class.is-loading]="loading()" (click)="startEnroll()">
                  <span class="btn-text"><i class="fas fa-shield-halved"></i> Generate authenticator secret</span>
                  <span class="spinner"></span>
                </button>
                <button type="button" class="btn-link" (click)="backToCredentials()">← Back to email / password</button>
              } @else {
                <div class="alert-card info" style="flex-direction:column;align-items:flex-start;gap:0.35rem;">
                  <span style="font-weight:700;">Manual entry secret</span>
                  <code style="font-size:0.85rem;word-break:break-all;user-select:all;">{{ enrollSecret() }}</code>
                  <span style="font-size:0.78rem;opacity:0.9;">Add this key in your app, then enter the 6-digit code below.</span>
                </div>
                <form (ngSubmit)="confirmEnroll()">
                  <div class="field-group">
                    <input type="text" name="enrollCode" inputmode="numeric" pattern="[0-9]*" maxlength="8"
                           [(ngModel)]="enrollCode" placeholder=" " required autocomplete="one-time-code">
                    <i class="fas fa-mobile-screen-button f-icon"></i>
                    <span class="f-label">Authenticator code</span>
                  </div>
                  <button type="submit" class="btn-primary-tz" [class.is-loading]="loading()">
                    <span class="btn-text"><i class="fas fa-check"></i> Enable 2FA &amp; continue</span>
                    <span class="spinner"></span>
                  </button>
                </form>
              }
            </div>
          }

          <div class="card-footer-text">&copy; {{ year }} Prime Minister's Office &mdash; United Republic of Tanzania</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display:block; min-height:100vh; background:var(--bg); }
    .login-page { width:100vw; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem; }
    .back-home { position:fixed; top:1.25rem; left:1.5rem; z-index:50; display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:6px; font-size:0.8rem; font-weight:600; color:var(--ink); text-decoration:none; background:var(--surface); border:1px solid var(--line); }
    .font-scale-login {
      position: fixed; top: 1.25rem; right: 1.5rem; z-index: 50;
      display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px;
      background: var(--surface); overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .font-scale-login .fs-btn, .font-scale-login .fs-label {
      border: none; background: transparent; cursor: pointer; font-family: inherit;
      color: #334155; font-weight: 800; line-height: 1; padding: 0.45rem 0.6rem;
    }
    .font-scale-login .fs-btn { font-size: 0.95rem; min-width: 2rem; }
    .font-scale-login .fs-btn:hover:not(:disabled) { background: #eef4fb; color: var(--navy); }
    .font-scale-login .fs-btn:disabled { opacity: 0.35; cursor: default; }
    .font-scale-login .fs-label {
      font-size: 0.78rem; font-weight: 700; color: var(--navy);
      border-left: 1px solid var(--line); border-right: 1px solid var(--line); min-width: 2.8rem; text-align: center;
    }
    .font-scale-login .fs-label:hover { background: #eef4fb; }
    .back-home:hover { background:#f7f9fb; border-color:var(--navy); color:var(--navy); }
    .login-card { width:100%; max-width:880px; background:var(--surface); border-radius:10px; border:1px solid var(--line); box-shadow:0 6px 24px rgba(11,61,107,0.10); display:flex; overflow:hidden; }

    .card-left { width:400px; min-width:360px; position:relative; overflow:hidden; background:var(--navy); }
    .showcase-slide { position:absolute; inset:0; opacity:0; transition:opacity .6s ease; }
    .showcase-slide.active { opacity:1; }
    .showcase-slide img { width:100%; height:100%; object-fit:cover; }
    .left-overlay { position:absolute; inset:0; z-index:2; background:rgba(11,61,107,0.62); pointer-events:none; }
    .left-brand { position:absolute; top:1.1rem; left:1.15rem; z-index:10; display:flex; align-items:center; gap:10px; }
    .left-brand .mini-seal { width:38px; height:38px; }
    .left-brand .mini-seal .s-ring { fill:none; stroke:rgba(255,255,255,0.7); stroke-width:6; }
    .lb-text { display:flex; flex-direction:column; }
    .lb-text .lb-title { font-size:0.78rem; font-weight:800; color:#fff; }
    .lb-text .lb-sub { font-size:0.75rem; font-weight:600; color:rgba(255,255,255,0.7); letter-spacing:1px; text-transform:uppercase; }
    .showcase-captions { position:absolute; bottom:0; left:0; right:0; z-index:10; padding:0 1.25rem 3rem; }
    .cap-item { position:absolute; bottom:2.6rem; left:1.25rem; right:1.25rem; opacity:0; transition:opacity .5s ease; }
    .cap-item.active { opacity:1; }
    .cap-tag { display:inline-flex; align-items:center; gap:5px; background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.25); border-radius:4px; padding:3px 9px; font-size:0.75rem; font-weight:700; color:#fff; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:0.5rem; }
    .cap-tag i { font-size:0.7rem; }
    .cap-title { font-size:0.95rem; font-weight:700; color:#fff; line-height:1.3; margin-bottom:0.25rem; }
    .cap-desc { font-size:0.8rem; color:rgba(255,255,255,0.78); line-height:1.45; }
    .slide-dots { position:absolute; bottom:1.1rem; left:1.25rem; z-index:10; display:flex; gap:6px; }
    .slide-dots .dot { width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,0.3); transition:background .2s; cursor:pointer; }
    .slide-dots .dot.active { background:#fff; }

    .card-right { flex:1; padding:2rem 2.25rem; display:flex; flex-direction:column; justify-content:center; }
    .card-seal { width:78px; height:78px; margin:0 auto 0.55rem; }
    .card-seal svg { width:100%; height:100%; }
    .card-seal .seal-outer { fill:none; stroke:var(--navy); stroke-width:6; opacity:0.85; }
    .card-seal .seal-inner { fill:none; stroke:var(--navy); stroke-width:2.5; opacity:0.4; }
    .card-seal .seal-text { fill:var(--navy); stroke:none; opacity:0.9; }
    .brand-text { text-align:center; margin-bottom:0.15rem; }
    .brand-org { font-size:0.75rem; font-weight:800; color:var(--navy); letter-spacing:2px; text-transform:uppercase; }
    .brand-office { font-size:0.75rem; color:var(--muted); letter-spacing:1.2px; text-transform:uppercase; font-weight:700; }
    .brand-divider { width:40px; height:2px; background:var(--navy); opacity:0.5; margin:0.5rem auto; }
    .brand-title { text-align:center; font-size:1.2rem; font-weight:800; color:var(--navy); margin-bottom:0.05rem; }
    .brand-subtitle { text-align:center; font-size:0.78rem; color:var(--muted); font-weight:400; margin-bottom:0.1rem; }
    .status-row { display:flex; justify-content:center; gap:0.4rem; margin:0.6rem 0 0.8rem; }
    .s-pill { display:flex; align-items:center; gap:5px; padding:3px 10px; border-radius:999px; font-size:0.75rem; font-weight:650; }
    .s-pill .dot { width:6px; height:6px; border-radius:50%; }
    .s-pill.emergency { background:#fde3e3; color:#b51c1c; } .s-pill.emergency .dot { background:var(--emergency); }
    .s-pill.warning { background:#ffeede; color:#a85607; } .s-pill.warning .dot { background:var(--warning); }
    .s-pill.watch { background:#fff7d6; color:#8a6d00; } .s-pill.watch .dot { background:var(--watch); }
    .card-divider { height:1px; background:var(--line); margin-bottom:1rem; }
    .alert-card { padding:0.55rem 0.75rem; background:#fde3e3; border:1px solid #f3c4c4; border-left:3px solid var(--emergency); border-radius:6px; margin-bottom:0.85rem; display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:#b51c1c; }
    .alert-card.info { background:#e8f0fe; border-color:#c5d4f5; border-left-color:var(--navy); color:#0b3d6b; }
    .step-help { font-size:0.88rem; color:var(--muted); margin:0 0 0.85rem; line-height:1.45; }
    .policy-hint { font-size:0.75rem; color:var(--muted); margin:0 0 0.75rem; }
    .btn-link { display:block; width:100%; margin-top:0.75rem; background:none; border:none; color:var(--navy); font-size:0.85rem; font-weight:600; cursor:pointer; text-align:center; }

    .field-group { position:relative; margin-bottom:0.85rem; }
    .field-group input { width:100%; padding:0.6rem 0.85rem 0.6rem 2.4rem; background:var(--surface); border:1px solid var(--line); border-radius:6px; font-size:0.9rem; font-weight:500; color:var(--ink); outline:none; transition:border-color .15s, box-shadow .15s; }
    .field-group.has-pwd-toggle input { padding-right:4.6rem; }
    .field-group input::placeholder { color:transparent; }
    .field-group input:hover { border-color:#c8d2dd; }
    .field-group input:focus { border-color:var(--navy); box-shadow:0 0 0 3px rgba(11,61,107,0.10); }
    .field-group .f-icon { position:absolute; left:0.8rem; top:50%; transform:translateY(-50%); color:var(--muted); font-size:0.75rem; pointer-events:none; }
    .field-group input:focus ~ .f-icon { color:var(--navy); }
    .field-group .f-label { position:absolute; left:2.4rem; top:50%; transform:translateY(-50%); font-size:0.9rem; font-weight:500; color:var(--muted); pointer-events:none; transition:all .15s ease; }
    .field-group input:focus ~ .f-label, .field-group input:not(:placeholder-shown) ~ .f-label { top:-9px; left:0.7rem; font-size:0.75rem; font-weight:700; color:var(--navy); background:var(--surface); padding:0 6px; letter-spacing:0.4px; text-transform:uppercase; }
    .pwd-toggle { position:absolute; right:0.4rem; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--muted); cursor:pointer; padding:0.3rem 0.45rem; border-radius:4px; display:inline-flex; align-items:center; gap:0.3rem; font-family:inherit; font-size:0.75rem; font-weight:700; z-index:2; }
    .pwd-toggle:hover { color:var(--navy); background:#f0f3f7; }
    .pwd-toggle-text { letter-spacing:0.02em; }
    .options-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; gap:0.75rem; }
    .options-hint { font-size:0.78rem; color:var(--muted); font-weight:500; }
    .remember-label { display:flex; align-items:center; gap:0.45rem; cursor:pointer; }
    .remember-label input[type="checkbox"] { appearance:none; width:14px; height:14px; border:1.5px solid var(--line); border-radius:3px; cursor:pointer; position:relative; }
    .remember-label input:checked { background:var(--navy); border-color:var(--navy); }
    .remember-label span { font-size:0.8rem; color:var(--muted); font-weight:500; }
    .forgot-link { font-size:0.82rem; font-weight:700; color:var(--navy); text-decoration:none; display:inline-flex; align-items:center; gap:0.35rem; padding:0.2rem 0; }
    .forgot-link:hover { text-decoration:underline; }
    .btn-primary-tz { width:100%; padding:0.65rem; border:1px solid var(--navy); border-radius:6px; font-size:0.9rem; font-weight:650; color:#fff; background:var(--navy); cursor:pointer; position:relative; display:flex; align-items:center; justify-content:center; gap:0.5rem; transition:background .15s; }
    .btn-primary-tz:hover { background:var(--navy-700); }
    .btn-primary-tz.is-loading .btn-text { visibility:hidden; }
    .btn-primary-tz .spinner { display:none; width:18px; height:18px; border:2.5px solid rgba(255,255,255,0.35); border-top-color:#fff; border-radius:50%; animation:spin 0.65s linear infinite; position:absolute; }
    .btn-primary-tz.is-loading .spinner { display:block; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .register-row { text-align:center; margin-top:0.85rem; }
    .register-row span { font-size:0.8rem; color:var(--muted); }
    .register-row a { font-size:0.8rem; font-weight:600; color:var(--navy); text-decoration:none; margin-left:4px; }
    .register-row a:hover { text-decoration:underline; }
    .card-footer-text { text-align:center; margin-top:0.85rem; padding-top:0.65rem; border-top:1px solid var(--line); font-size:0.75rem; color:var(--muted); }
    @media (max-width:780px) { .login-card { flex-direction:column; max-width:440px; } .card-left { width:100%; min-width:unset; height:200px; } .card-right { padding:1.5rem 1.75rem; } }
  `],
})
export class LoginComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);

  font = inject(FontScaleService);
  email = '';
  password = '';
  mfaCode = '';
  enrollCode = '';
  curPwd = '';
  newPwd = '';
  newPwd2 = '';
  private challengeToken = '';
  showPwd = signal(false);
  showCurPwd = signal(false);
  showNewPwd = signal(false);
  showNewPwd2 = signal(false);
  loading = signal(false);
  error = signal('');
  info = signal('');
  enrollSecret = signal('');
  step = signal<'credentials' | 'mfa' | 'password' | 'enroll'>('credentials');
  slide = signal(0);
  year = 2026;

  showcase: Showcase[] = [
    { src: 'images/events/rufiji_aerial_destruction.jpg', tag: 'Disaster Response', icon: 'fa-helicopter', title: 'Aerial View — Rufiji Flood Destruction', desc: 'PMO-DMD coordinates multi-agency response to devastating floods across affected communities.' },
    { src: 'images/events/rufiji_village_submerged.jpg', tag: 'Early Warning', icon: 'fa-exclamation-triangle', title: 'Submerged Villages — Rufiji Basin', desc: 'Early warning systems enable timely evacuation before rising waters engulf settlements.' },
    { src: 'images/events/rufiji_aerial_02.jpg', tag: 'Assessment', icon: 'fa-map-marked-alt', title: 'Damage Assessment Operations', desc: 'GIS-enabled rapid damage assessment guides resource allocation across all 31 regions.' },
    { src: 'images/events/rufiji_debris_aftermath.jpg', tag: 'Recovery', icon: 'fa-hands-helping', title: 'Post-Disaster Recovery & Rebuilding', desc: 'Coordinated recovery restores critical infrastructure with partners and local communities.' },
    { src: 'images/events/rufiji_truck_mudflow.jpg', tag: 'Preparedness', icon: 'fa-shield-alt', title: 'Infrastructure Resilience Planning', desc: 'Data-driven preparedness strategies strengthen transport corridors against natural hazards.' },
  ];

  private timers: any[] = [];

  ngOnInit(): void {
    this.timers.push(setInterval(() => this.slide.set((this.slide() + 1) % this.showcase.length), 5000));
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearInterval);
  }

  onSubmit(): void {
    this.error.set('');
    this.info.set('');
    this.loading.set(true);
    this.auth.login(this.email, this.password).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'MFA_REQUIRED') {
          this.challengeToken = res.challengeToken || '';
          this.info.set(res.message || 'Enter your authenticator code.');
          this.step.set('mfa');
          return;
        }
        if (res.status === 'PASSWORD_CHANGE_REQUIRED') {
          this.info.set(res.message || 'You must set a new password before continuing.');
          this.curPwd = this.password;
          this.step.set('password');
          return;
        }
        if (res.status === 'MFA_ENROLL_REQUIRED') {
          this.info.set(res.message || 'Your role requires two-factor authentication.');
          this.enrollSecret.set('');
          this.enrollCode = '';
          this.step.set('enroll');
          return;
        }
        if (res.status === 'OK') {
          this.router.navigateByUrl('/home');
          return;
        }
        this.error.set(res.message || 'Sign-in could not be completed.');
      },
      error: () => {
        this.error.set('These credentials do not match our records.');
        this.loading.set(false);
      },
    });
  }

  startEnroll(): void {
    this.error.set('');
    this.loading.set(true);
    this.auth.setupTotp().subscribe({
      next: r => {
        this.loading.set(false);
        this.enrollSecret.set(r.secret || '');
        this.info.set(r.message || 'Enter the secret in your authenticator app, then confirm with a code.');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || err?.error?.detail || 'Could not start 2FA setup.');
      },
    });
  }

  confirmEnroll(): void {
    this.error.set('');
    this.loading.set(true);
    this.auth.enableTotp(this.enrollCode.trim()).subscribe({
      next: () => {
        this.loading.set(false);
        this.auth.markTotpEnabled();
        this.router.navigateByUrl('/home');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || err?.error?.detail || 'Invalid authenticator code.');
      },
    });
  }

  onMfa(): void {
    this.error.set('');
    this.loading.set(true);
    this.auth.verifyMfa(this.challengeToken, this.mfaCode.trim()).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'OK') {
          this.router.navigateByUrl('/home');
          return;
        }
        this.error.set(res.message || 'Verification failed.');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || err?.error?.detail || 'Invalid authenticator code.');
      },
    });
  }

  onForcedPassword(): void {
    this.error.set('');
    if (this.newPwd !== this.newPwd2) {
      this.error.set('New password and confirmation do not match.');
      return;
    }
    this.loading.set(true);
    this.auth.changePassword(this.curPwd, this.newPwd).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/home');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || err?.error?.detail || 'Could not change password.');
      },
    });
  }

  backToCredentials(): void {
    this.step.set('credentials');
    this.mfaCode = '';
    this.enrollCode = '';
    this.enrollSecret.set('');
    this.challengeToken = '';
    this.info.set('');
    this.error.set('');
    // Drop partial session from MFA_ENROLL / password-change so a different account can sign in.
    this.auth.logout();
  }
}
