import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';

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
        <div class="bell-wrap">
          <button class="bell-btn" type="button" (click)="toggleBell($event)" aria-label="Notifications">
            <i class="fas fa-bell"></i>
            @if (unread() > 0) { <span class="bell-badge">{{ unread() > 99 ? '99+' : unread() }}</span> }
          </button>
          <div class="bell-dropdown" [class.show]="bellOpen()" (click)="$event.stopPropagation()">
            <div class="bell-head">
              <b>Notifications</b>
              @if (unread() > 0) { <a class="bell-readall" (click)="markAllRead()">Mark all read</a> }
            </div>
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
  `,
  styles: [`
    .bell-wrap { position: relative; display: flex; align-items: center; }
    .bell-btn { position: relative; background: none; border: none; color: inherit; cursor: pointer; font-size: 1.05rem; padding: 6px 9px; opacity: 0.85; }
    .bell-btn:hover { opacity: 1; }
    .bell-badge { position: absolute; top: -3px; right: -2px; background: #dc2626; color: #fff; font-size: 0.75rem; font-weight: 700; min-width: 18px; height: 18px; line-height: 18px; border-radius: 10px; padding: 0 5px; text-align: center; }
    .bell-dropdown { position: absolute; right: 0; top: calc(100% + 8px); width: 360px; max-width: 92vw; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.16); display: none; z-index: 1200; overflow: hidden; }
    .bell-dropdown.show { display: block; }
    .bell-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #eef1f5; color: #1f2937; font-size: 0.86rem; }
    .bell-readall { font-size: 0.78rem; color: #2563eb; cursor: pointer; font-weight: 600; }
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
  private router = inject(Router);
  private http = inject(HttpClient);
  menuOpen = signal(false);

  // Change-password modal (self-service, VAPT v).
  pwOpen = signal(false);
  pwBusy = signal(false);
  pwErr = signal(false);
  pwMsg = signal('');
  cur = ''; nw = ''; cf = '';

  // Notification bell — reads the per-user feed the one dispatcher writes (public.resource_notifications).
  bellOpen = signal(false);
  notifs = signal<any[]>([]);
  unread = signal(0);
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

  /** Open a notification: mark it read and follow its deep link. */
  open(n: any): void {
    if (!n.is_read) {
      this.http.post(`/api/v1/notifications/${n.id}/read`, {}).subscribe({ next: () => { }, error: () => { } });
      n.is_read = true;
      this.unread.update(v => Math.max(0, v - 1));
    }
    this.bellOpen.set(false);
    if (n.link) { this.router.navigateByUrl(n.link); }
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
  }
}
