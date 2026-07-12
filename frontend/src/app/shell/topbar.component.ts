import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { FontScaleService } from '../core/font-scale.service';

/** Exact reproduction of components/dmis/topbar.blade.php + the dmis-v2.js topbar behaviors. */
@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="top-bar">
      <div class="top-bar-left">
        <button class="sidebar-toggle-btn" id="sidebarToggle" (click)="toggleSidebar()"><i class="fas fa-bars"></i></button>
        <div class="top-bar-brand">
          <img src="images/emblem.png" alt="Emblem">
          <div class="brand-text">
            <span class="brand-name">e-MAAFA</span>
          </div>
        </div>
      </div>
      <div class="top-bar-right">
        <!-- System-wide font size: A− / % / A+ (persists in this browser) -->
        <div class="font-scale" role="group" aria-label="Text size">
          <button type="button" class="fs-btn" (click)="font.decrease()" [disabled]="!font.canDecrease()"
            title="Decrease text size" aria-label="Decrease text size">A−</button>
          <button type="button" class="fs-label" (click)="font.reset()"
            title="Reset text size to default" aria-label="Reset text size to default">{{ font.percentLabel() }}</button>
          <button type="button" class="fs-btn" (click)="font.increase()" [disabled]="!font.canIncrease()"
            title="Increase text size" aria-label="Increase text size">A+</button>
        </div>
        <div class="bell-wrap">
          <button class="bell-btn" type="button" (click)="toggleBell($event)" aria-label="Notifications">
            <i class="fas fa-bell"></i>
            @if (unread() > 0) { <span class="bell-badge">{{ unread() > 99 ? '99+' : unread() }}</span> }
          </button>
          <div class="bell-dropdown" [class.show]="bellOpen()" (click)="$event.stopPropagation()">
            <div class="bell-head">
              <b>Notifications</b>
              <span style="display:flex;align-items:center;gap:10px;">
                <button type="button" class="bell-settings" (click)="togglePrefs()" title="Notification preferences" aria-label="Notification preferences">
                  <i class="fas fa-sliders"></i>
                </button>
                @if (unread() > 0) { <a class="bell-readall" (click)="markAllRead()">Mark all read</a> }
              </span>
            </div>
            @if (prefsOpen()) {
              <form class="bell-prefs" (ngSubmit)="savePrefs()">
                <div class="pref-title"><i class="fas fa-sliders"></i> Channel preferences</div>
                <label class="pref-row">
                  <span><b>In-app</b><em>Show notices in this bell</em></span>
                  <input type="checkbox" name="prefInApp" [(ngModel)]="pref.notify_in_app">
                </label>
                <label class="pref-row">
                  <span><b>Email</b><em>{{ pref.email || 'No email on account' }}</em></span>
                  <input type="checkbox" name="prefEmail" [(ngModel)]="pref.notify_email">
                </label>
                <label class="pref-row">
                  <span><b>SMS</b><em>Use the phone number below</em></span>
                  <input type="checkbox" name="prefSms" [(ngModel)]="pref.notify_sms">
                </label>
                <label class="pref-phone">
                  <span>Phone</span>
                  <input name="prefPhone" [(ngModel)]="pref.phone" placeholder="0712345678">
                </label>
                @if (prefMsg()) { <div class="pref-msg" [class.err]="prefErr()">{{ prefMsg() }}</div> }
                <div class="pref-actions">
                  <button type="button" class="pref-cancel" (click)="prefsOpen.set(false)">Close</button>
                  <button type="submit" class="pref-save" [disabled]="prefBusy()">{{ prefBusy() ? 'Saving...' : 'Save' }}</button>
                </div>
              </form>
            }
            <div class="bell-list">
              @for (n of notifs(); track n.id) {
                <a class="bell-item" [class.unread]="!n.is_read" (click)="open(n)">
                  <span class="bell-dot sev-{{ n.severity || 'info' }}"></span>
                  <span class="bell-body">
                    <span class="bell-title">{{ n.title }}</span>
                    <span class="bell-msg">{{ n.message }}</span>
                    <span class="bell-time">{{ ago(n.created_at) }}</span>
                  </span>
                </a>
              } @empty { <div class="bell-empty"><i class="fas fa-bell-slash"></i> No notifications yet</div> }
            </div>
          </div>
        </div>
        <div class="user-menu">
          <button class="user-menu-btn" id="userMenuBtn" (click)="toggleMenu($event)">
            <div class="user-avatar">{{ auth.initials() }}</div>
            <span>{{ auth.user()?.name }}</span>
            <i class="fas fa-chevron-down" style="font-size:0.7rem;opacity:0.4;"></i>
          </button>
          <div class="user-menu-dropdown" id="userMenuDropdown" [class.show]="menuOpen()">
            <a routerLink="/home"><i class="fas fa-th-large" style="width:14px;text-align:center;opacity:0.5;"></i> Module Hub</a>
            <a (click)="openPw()" style="cursor:pointer;"><i class="fas fa-key" style="width:14px;text-align:center;opacity:0.5;"></i> Change Password</a>
            <a (click)="open2fa()" style="cursor:pointer;"><i class="fas fa-shield-halved" style="width:14px;text-align:center;opacity:0.5;"></i> Two-factor auth</a>
            <div class="divider"></div>
            <button type="button" class="logout-btn" (click)="logout()"><i class="fas fa-sign-out-alt" style="width:14px;text-align:center;"></i> Logout</button>
          </div>
        </div>
      </div>
    </div>

    @if (pwOpen()) {
      <div class="pw-overlay" (click)="closePw()">
        <div class="pw-modal" (click)="$event.stopPropagation()">
          <div class="pw-head"><b><i class="fas fa-key" style="margin-right:6px;opacity:0.6;"></i> Change Password</b>
            <button type="button" class="pw-x" (click)="closePw()" aria-label="Close">&times;</button></div>
          <form class="pw-body" (ngSubmit)="submitPw()">
            <label>Current password</label>
            <input type="password" [(ngModel)]="cur" name="cur" autocomplete="current-password" [disabled]="pwBusy()">
            <label>New password</label>
            <input type="password" [(ngModel)]="nw" name="nw" autocomplete="new-password" [disabled]="pwBusy()">
            <label>Confirm new password</label>
            <input type="password" [(ngModel)]="cf" name="cf" autocomplete="new-password" [disabled]="pwBusy()">
            <div class="pw-hint">At least 10 characters, with uppercase, lowercase, a number and a special character.</div>
            @if (pwMsg()) { <div class="pw-note" [class.err]="pwErr()">{{ pwMsg() }}</div> }
            <div class="pw-actions">
              <button type="button" class="pw-cancel" (click)="closePw()">Cancel</button>
              <button type="submit" class="pw-save" [disabled]="pwBusy()">{{ pwBusy() ? 'Saving…' : 'Change Password' }}</button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (tfaOpen()) {
      <div class="pw-overlay" (click)="close2fa()">
        <div class="pw-modal" (click)="$event.stopPropagation()">
          <div class="pw-head"><b><i class="fas fa-shield-halved" style="margin-right:6px;opacity:0.6;"></i> Two-factor authentication</b>
            <button type="button" class="pw-x" (click)="close2fa()" aria-label="Close">&times;</button></div>
          <div class="pw-body">
            <div class="pw-hint" style="margin-top:0;">
              Status:
              <b [style.color]="tfaEnabled() ? '#16a34a' : '#64748b'">{{ tfaEnabled() ? 'Enabled' : 'Not enabled' }}</b>
            </div>
            @if (!tfaEnabled()) {
              @if (!tfaSecret()) {
                <p class="pw-hint">Protect your account with an authenticator app (Google Authenticator, FreeOTP, Microsoft Authenticator, etc.).</p>
                <div class="pw-actions">
                  <button type="button" class="pw-cancel" (click)="close2fa()">Cancel</button>
                  <button type="button" class="pw-save" [disabled]="tfaBusy()" (click)="start2faSetup()">{{ tfaBusy() ? '…' : 'Set up 2FA' }}</button>
                </div>
              } @else {
                <p class="pw-hint">Scan this otpauth URI in your app, or enter the secret manually:</p>
                <code style="display:block;word-break:break-all;font-size:0.78rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin:6px 0;">{{ tfaSecret() }}</code>
                <label>Enter a 6-digit code to confirm</label>
                <input type="text" inputmode="numeric" maxlength="8" [(ngModel)]="tfaCode" name="tfaCode" [disabled]="tfaBusy()">
                <div class="pw-actions">
                  <button type="button" class="pw-cancel" (click)="close2fa()">Cancel</button>
                  <button type="button" class="pw-save" [disabled]="tfaBusy()" (click)="confirm2fa()">{{ tfaBusy() ? '…' : 'Enable 2FA' }}</button>
                </div>
              }
            } @else {
              <p class="pw-hint">To disable 2FA, enter your password and a current authenticator code.</p>
              <label>Password</label>
              <input type="password" [(ngModel)]="tfaPwd" name="tfaPwd" autocomplete="current-password" [disabled]="tfaBusy()">
              <label>Authenticator code</label>
              <input type="text" inputmode="numeric" maxlength="8" [(ngModel)]="tfaCode" name="tfaCodeOff" [disabled]="tfaBusy()">
              <div class="pw-actions">
                <button type="button" class="pw-cancel" (click)="close2fa()">Cancel</button>
                <button type="button" class="pw-save" style="background:#b91c1c;border-color:#b91c1c;" [disabled]="tfaBusy()" (click)="disable2fa()">{{ tfaBusy() ? '…' : 'Disable 2FA' }}</button>
              </div>
            }
            @if (tfaMsg()) { <div class="pw-note" [class.err]="tfaErr()">{{ tfaMsg() }}</div> }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .font-scale {
      display: inline-flex; align-items: center; gap: 0;
      border: 1px solid rgba(0,0,0,0.08); border-radius: 999px;
      background: rgba(255,255,255,0.65); overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .fs-btn, .fs-label {
      border: none; background: transparent; cursor: pointer; font-family: inherit;
      color: #334155; font-weight: 800; line-height: 1;
      padding: 0.4rem 0.55rem;
    }
    .fs-btn { font-size: 0.95rem; min-width: 2rem; }
    .fs-btn:hover:not(:disabled) { background: rgba(0,51,102,0.08); color: #003366; }
    .fs-btn:disabled { opacity: 0.35; cursor: default; }
    .fs-label {
      font-size: 0.78rem; font-weight: 700; color: #003366;
      border-left: 1px solid rgba(0,0,0,0.06); border-right: 1px solid rgba(0,0,0,0.06);
      min-width: 2.8rem; text-align: center; padding: 0.4rem 0.45rem;
    }
    .fs-label:hover { background: rgba(0,51,102,0.06); }
    .bell-wrap { position: relative; display: flex; align-items: center; }
    .bell-btn { position: relative; background: none; border: none; color: inherit; cursor: pointer; font-size: 1.05rem; padding: 6px 9px; opacity: 0.85; }
    .bell-btn:hover { opacity: 1; }
    .bell-badge { position: absolute; top: -3px; right: -2px; background: #dc2626; color: #fff; font-size: 0.75rem; font-weight: 700; min-width: 18px; height: 18px; line-height: 18px; border-radius: 10px; padding: 0 5px; text-align: center; }
    .bell-dropdown { position: absolute; right: 0; top: calc(100% + 8px); width: 360px; max-width: 92vw; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.16); display: none; z-index: 1200; overflow: hidden; }
    .bell-dropdown.show { display: block; }
    .bell-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #eef1f5; color: #1f2937; font-size: 0.86rem; }
    .bell-readall { font-size: 0.78rem; color: #2563eb; cursor: pointer; font-weight: 600; }
    .bell-settings { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
    .bell-settings:hover { background: #eef2f7; color: #003366; }
    .bell-prefs { padding: 10px 14px 12px; border-bottom: 1px solid #eef1f5; background: #fbfdff; color: #1f2937; display: grid; gap: 8px; }
    .pref-title { font-size: 0.82rem; font-weight: 800; color: #334155; display: flex; align-items: center; gap: 7px; }
    .pref-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 0.82rem; margin: 0; }
    .pref-row span { display: flex; flex-direction: column; min-width: 0; }
    .pref-row b { color: #1f2937; font-size: 0.82rem; }
    .pref-row em { color: #64748b; font-size: 0.75rem; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px; }
    .pref-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #003366; flex-shrink: 0; }
    .pref-phone { display: grid; gap: 3px; font-size: 0.78rem; font-weight: 700; color: #475569; margin: 0; }
    .pref-phone input { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; font-size: 0.84rem; }
    .pref-msg { font-size: 0.78rem; color: #16a34a; font-weight: 700; }
    .pref-msg.err { color: #dc2626; }
    .pref-actions { display: flex; justify-content: flex-end; gap: 7px; }
    .pref-cancel, .pref-save { border-radius: 6px; padding: 7px 11px; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
    .pref-cancel { background: #fff; border: 1px solid #cbd5e1; color: #475569; }
    .pref-save { background: #003366; border: 1px solid #003366; color: #fff; }
    .pref-save:disabled { opacity: 0.6; cursor: default; }
    .bell-list { max-height: 380px; overflow-y: auto; }
    .bell-item { display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px dashed #eef1f5; text-decoration: none; color: #1f2937; cursor: pointer; }
    .bell-item:hover { background: #f8fafc; }
    .bell-item.unread { background: #eff6ff; }
    .bell-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; background: #94a3b8; }
    .bell-dot.sev-warning { background: #f59e0b; } .bell-dot.sev-critical, .bell-dot.sev-danger { background: #dc2626; } .bell-dot.sev-success { background: #16a34a; } .bell-dot.sev-info { background: #2563eb; }
    .bell-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .bell-title { font-size: 0.85rem; font-weight: 600; }
    .bell-msg { font-size: 0.78rem; color: #6b7280; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .bell-time { font-size: 0.75rem; color: #9ca3af; }
    .bell-empty { padding: 26px 14px; text-align: center; color: #9ca3af; font-size: 0.82rem; }
    .pw-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 2000; display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; }
    .pw-modal { width: 400px; max-width: 92vw; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.22); overflow: hidden; }
    .pw-head { display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; border-bottom: 1px solid #eef1f5; color: #1f2937; font-size: 0.95rem; }
    .pw-x { background: none; border: none; font-size: 1.3rem; line-height: 1; color: #94a3b8; cursor: pointer; }
    .pw-body { padding: 14px 16px 18px; display: flex; flex-direction: column; gap: 4px; }
    .pw-body label { font-size: 0.82rem; font-weight: 600; color: #475569; margin-top: 8px; }
    .pw-body input { padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.92rem; }
    .pw-body input:focus { outline: 2px solid #003366; outline-offset: 1px; border-color: #003366; }
    .pw-hint { font-size: 0.76rem; color: #94a3b8; margin-top: 8px; }
    .pw-note { font-size: 0.84rem; font-weight: 600; color: #16a34a; margin-top: 10px; }
    .pw-note.err { color: #dc2626; }
    .pw-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .pw-cancel { padding: 8px 14px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem; font-weight: 600; color: #475569; cursor: pointer; }
    .pw-save { padding: 8px 16px; background: #003366; border: 1px solid #003366; border-radius: 6px; font-size: 0.88rem; font-weight: 700; color: #fff; cursor: pointer; }
    .pw-save:disabled { opacity: 0.6; cursor: default; }
  `],
})
export class TopbarComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  font = inject(FontScaleService);
  private router = inject(Router);
  private http = inject(HttpClient);
  menuOpen = signal(false);

  // Change-password modal (self-service, VAPT v).
  pwOpen = signal(false);
  pwBusy = signal(false);
  pwErr = signal(false);
  pwMsg = signal('');
  cur = ''; nw = ''; cf = '';

  // Optional TOTP 2FA (PSA residual).
  tfaOpen = signal(false);
  tfaBusy = signal(false);
  tfaEnabled = signal(false);
  tfaErr = signal(false);
  tfaMsg = signal('');
  tfaSecret = signal('');
  tfaCode = '';
  tfaPwd = '';

  // Notification bell — reads the per-user feed the one dispatcher writes (public.resource_notifications).
  bellOpen = signal(false);
  notifs = signal<any[]>([]);
  unread = signal(0);
  prefsOpen = signal(false);
  prefBusy = signal(false);
  prefErr = signal(false);
  prefMsg = signal('');
  pref = { notify_in_app: true, notify_email: true, notify_sms: false, phone: '', email: '' };
  private pollTimer: any;

  ngOnInit(): void {
    this.loadNotifs();
    this.pollTimer = setInterval(() => this.refreshUnread(), 45_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.pollTimer);
  }

  private loadNotifs(): void {
    this.http.get<any>('/api/v1/notifications?limit=20').subscribe({
      next: r => { this.notifs.set(r.items ?? []); this.unread.set(r.unread_count ?? 0); },
      error: () => { /* bell stays quiet if the feed is briefly unavailable */ },
    });
  }

  private refreshUnread(): void {
    this.http.get<any>('/api/v1/notifications/unread-count').subscribe({
      next: r => this.unread.set(r.count ?? 0),
      error: () => { },
    });
  }

  toggleBell(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.bellOpen.update(v => !v);
    if (this.bellOpen()) { this.loadNotifs(); }
  }

  togglePrefs(): void {
    this.prefsOpen.update(v => !v);
    this.prefMsg.set('');
    if (this.prefsOpen()) { this.loadPrefs(); }
  }

  private loadPrefs(): void {
    this.http.get<any>('/api/v1/notifications/preferences').subscribe({
      next: r => {
        this.pref = {
          notify_in_app: r.notify_in_app ?? true,
          notify_email: r.notify_email ?? true,
          notify_sms: r.notify_sms ?? false,
          phone: r.phone ?? '',
          email: r.email ?? '',
        };
      },
      error: () => {
        this.prefErr.set(true);
        this.prefMsg.set('Could not load preferences.');
      },
    });
  }

  savePrefs(): void {
    this.prefBusy.set(true);
    this.prefMsg.set('');
    this.http.post('/api/v1/notifications/preferences', {
      notify_in_app: this.pref.notify_in_app,
      notify_email: this.pref.notify_email,
      notify_sms: this.pref.notify_sms,
      phone: this.pref.phone || null,
    }).subscribe({
      next: () => {
        this.prefBusy.set(false);
        this.prefErr.set(false);
        this.prefMsg.set('Preferences saved.');
      },
      error: err => {
        this.prefBusy.set(false);
        this.prefErr.set(true);
        this.prefMsg.set(err?.error?.message || err?.error?.detail || 'Could not save preferences.');
      },
    });
  }

  /**
   * Open a notification: mark it read and follow its deep link into the right
   * process screen (EW → Issued Alerts, generic response → Dashboard).
   */
  open(n: any): void {
    if (!n.is_read) {
      this.http.post(`/api/v1/notifications/${n.id}/read`, {}).subscribe({ next: () => { }, error: () => { } });
      n.is_read = true;
      this.unread.update(v => Math.max(0, v - 1));
    }
    this.bellOpen.set(false);
    const raw = String(n.link || n.url || '').trim();
    const path = this.resolveNotifLink(raw, n);
    if (path) {
      this.router.navigateByUrl(path);
    }
  }

  /** Map stored notification links onto stable Angular routes. */
  private resolveNotifLink(link: string, n: any): string {
    const type = String(n.type || n.entity_type || n.category || '').toLowerCase();
    if (!link || link === '/' || link === '/m/response') {
      if (type.includes('early_warning') || type.includes('warning') || type.includes('bulletin')) {
        return '/m/response/issued-alerts';
      }
      if (type.includes('incident') || type.includes('public_hazard') || type.includes('phr')) {
        return '/m/response/incidents';
      }
      if (type.includes('allocat') || type.includes('resource')) {
        return '/m/response/resource-approvals';
      }
      return '/m/response/dashboard';
    }
    // Normalise legacy / absolute paths
    if (link.startsWith('http')) {
      try {
        const u = new URL(link);
        return u.pathname + u.search;
      } catch { /* fall through */ }
    }
    if (link.includes('early-warning') || link.includes('issued-alert')) {
      return '/m/response/issued-alerts';
    }
    if (link.startsWith('/m/')) return link;
    if (link.startsWith('/')) return link;
    return '/m/response/dashboard';
  }

  markAllRead(): void {
    this.http.post('/api/v1/notifications/read-all', {}).subscribe({
      next: () => { this.notifs.update(list => list.map(x => ({ ...x, is_read: true }))); this.unread.set(0); },
      error: () => { },
    });
  }

  ago(ts: string): string {
    if (!ts) { return ''; }
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) { return 'just now'; }
    if (s < 3600) { return Math.floor(s / 60) + 'm ago'; }
    if (s < 86400) { return Math.floor(s / 3600) + 'h ago'; }
    return Math.floor(s / 86400) + 'd ago';
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.bellOpen.set(false);
    this.menuOpen.update(v => !v);
  }

  logout(): void {
    this.menuOpen.set(false);
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  toggleSidebar(): void {
    document.body.classList.toggle('sb-collapsed');
    localStorage.setItem('dmis_sb_collapsed', document.body.classList.contains('sb-collapsed') ? '1' : '0');
  }

  openPw(): void {
    this.menuOpen.set(false);
    this.cur = ''; this.nw = ''; this.cf = '';
    this.pwErr.set(false); this.pwMsg.set('');
    this.pwBusy.set(false);
    this.pwOpen.set(true);
  }

  open2fa(): void {
    this.menuOpen.set(false);
    this.tfaCode = '';
    this.tfaPwd = '';
    this.tfaSecret.set('');
    this.tfaMsg.set('');
    this.tfaErr.set(false);
    this.tfaOpen.set(true);
    this.tfaBusy.set(true);
    this.auth.twoFaStatus().subscribe({
      next: s => {
        this.tfaEnabled.set(!!s.enabled);
        this.tfaBusy.set(false);
      },
      error: () => {
        this.tfaBusy.set(false);
        this.tfaErr.set(true);
        this.tfaMsg.set('Could not load 2FA status.');
      },
    });
  }

  close2fa(): void {
    this.tfaOpen.set(false);
  }

  start2faSetup(): void {
    this.tfaBusy.set(true);
    this.tfaMsg.set('');
    this.auth.setupTotp().subscribe({
      next: r => {
        this.tfaSecret.set(r.secret);
        this.tfaBusy.set(false);
        this.tfaMsg.set('Scan the secret in your authenticator app, then enter a code.');
      },
      error: e => {
        this.tfaBusy.set(false);
        this.tfaErr.set(true);
        this.tfaMsg.set(e?.error?.message || e?.error?.detail || 'Could not start 2FA setup.');
      },
    });
  }

  confirm2fa(): void {
    this.tfaBusy.set(true);
    this.tfaMsg.set('');
    this.auth.enableTotp(this.tfaCode.trim()).subscribe({
      next: () => {
        this.tfaBusy.set(false);
        this.tfaEnabled.set(true);
        this.tfaSecret.set('');
        this.tfaCode = '';
        this.tfaErr.set(false);
        this.tfaMsg.set('Two-factor authentication is now required at sign-in.');
      },
      error: e => {
        this.tfaBusy.set(false);
        this.tfaErr.set(true);
        this.tfaMsg.set(e?.error?.message || e?.error?.detail || 'Invalid code — try again.');
      },
    });
  }

  disable2fa(): void {
    this.tfaBusy.set(true);
    this.tfaMsg.set('');
    this.auth.disableTotp(this.tfaPwd, this.tfaCode.trim()).subscribe({
      next: () => {
        this.tfaBusy.set(false);
        this.tfaEnabled.set(false);
        this.tfaCode = '';
        this.tfaPwd = '';
        this.tfaErr.set(false);
        this.tfaMsg.set('Two-factor authentication has been disabled.');
      },
      error: e => {
        this.tfaBusy.set(false);
        this.tfaErr.set(true);
        this.tfaMsg.set(e?.error?.message || e?.error?.detail || 'Could not disable 2FA.');
      },
    });
  }

  closePw(): void {
    this.pwOpen.set(false);
  }

  submitPw(): void {
    if (!this.cur || !this.nw) { this.pwErr.set(true); this.pwMsg.set('All fields are required.'); return; }
    if (this.nw !== this.cf) { this.pwErr.set(true); this.pwMsg.set('The new passwords do not match.'); return; }
    this.pwBusy.set(true); this.pwMsg.set('');
    this.auth.changePassword(this.cur, this.nw).subscribe({
      next: () => {
        this.pwBusy.set(false); this.pwErr.set(false);
        this.pwMsg.set('Password changed successfully.');
        this.cur = ''; this.nw = ''; this.cf = '';
      },
      error: (e) => {
        this.pwBusy.set(false); this.pwErr.set(true);
        this.pwMsg.set(e?.error?.detail || e?.error?.message || 'Could not change password. Check your current password and the policy.');
      },
    });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuOpen.set(false);
    this.bellOpen.set(false);
    this.prefsOpen.set(false);
  }
}
