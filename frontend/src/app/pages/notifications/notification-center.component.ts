import { DatePipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

type Notif = {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  entity_type: string | null;
  entity_id: number | null;
  severity: string | null;
  severity_norm?: string;
  is_read: boolean;
  created_at: string;
  category?: string;
  category_label?: string;
  category_icon?: string;
};

type CategoryChip = { key: string; label: string; unread: number; total: number };

/**
 * Next-level Notification Centre — full personal inbox over the unified feed.
 * Productive filters (unread / category / severity / search) hit the server.
 */
@Component({
  selector: 'page-notification-center',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, PageHeaderComponent, PanelComponent],
  styles: [`
    .toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:14px; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; flex:1; }
    .chip { border:1px solid #e2e8f0; background:#fff; color:#334155; border-radius:999px; padding:5px 12px; font-size:0.78rem; font-weight:700; cursor:pointer; font-family:inherit; }
    .chip:hover { border-color:#94a3b8; }
    .chip.on { background:#0b3d6b; color:#fff; border-color:#0b3d6b; }
    .chip .n { opacity:0.85; font-weight:600; margin-left:4px; }
    .search { display:flex; gap:6px; align-items:center; border:1px solid #e2e8f0; border-radius:10px; padding:4px 10px; background:#fff; min-width:220px; }
    .search input { border:0; outline:0; font:inherit; font-size:0.85rem; width:160px; }
    .stat-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; }
    .stat { background:#fff; border:1px solid #e3e6ed; border-radius:10px; padding:10px 12px; }
    .stat b { display:block; font-size:1.25rem; color:#0b3d6b; font-variant-numeric:tabular-nums; }
    .stat span { font-size:0.72rem; color:#64748b; text-transform:uppercase; letter-spacing:0.3px; font-weight:700; }
    .list { display:flex; flex-direction:column; gap:0; }
    .row { display:grid; grid-template-columns:36px 1fr auto; gap:12px; padding:12px 14px; border-bottom:1px solid #f1f5f9; cursor:pointer; background:#fff; }
    .row:hover { background:#f8fafc; }
    .row.unread { background:#eff6ff; border-left:3px solid #2563eb; }
    .ico { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#475569; font-size:0.9rem; }
    .ico.critical { background:#fee2e2; color:#b91c1c; }
    .ico.high, .ico.warning { background:#ffedd5; color:#c2410c; }
    .ico.info { background:#dbeafe; color:#1d4ed8; }
    .title { font-weight:700; font-size:0.9rem; color:#0f172a; }
    .msg { font-size:0.82rem; color:#64748b; margin-top:2px; line-height:1.4; }
    .meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; font-size:0.72rem; color:#94a3b8; }
    .tag { background:#f1f5f9; color:#475569; border-radius:6px; padding:1px 7px; font-weight:600; }
    .actions { display:flex; flex-direction:column; gap:4px; align-items:flex-end; }
    .actions button { border:1px solid #e2e8f0; background:#fff; border-radius:6px; padding:4px 8px; font-size:0.72rem; cursor:pointer; color:#475569; font-family:inherit; }
    .actions button:hover { background:#f8fafc; color:#0b3d6b; }
    .empty { text-align:center; padding:2.5rem 1rem; color:#94a3b8; }
    .foot { display:flex; justify-content:center; padding:14px; }
    .foot button { border:1px solid #0b3d6b; background:#0b3d6b; color:#fff; border-radius:8px; padding:8px 16px; font-weight:700; cursor:pointer; font-family:inherit; }
    .foot button:disabled { opacity:0.5; cursor:default; }
    .err { background:#fee2e2; color:#991b1b; padding:10px 12px; border-radius:8px; margin-bottom:12px; }
    .sev-row { display:flex; gap:6px; flex-wrap:wrap; }
  `],
  template: `
    <dmis-page-header title="Notification Centre" icon="fa-bell"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Notifications'}]">
    </dmis-page-header>

    @if (error()) {
      <div class="err"><i class="fas fa-triangle-exclamation me-1"></i> {{ error() }}</div>
    }

    <div class="stat-strip">
      <div class="stat"><b>{{ unread() }}</b><span>Unread</span></div>
      <div class="stat"><b>{{ bySev().critical }}</b><span>Critical / high</span></div>
      <div class="stat"><b>{{ bySev().warning }}</b><span>Warning</span></div>
      <div class="stat"><b>{{ items().length }}</b><span>Loaded</span></div>
    </div>

    <div class="toolbar">
      <div class="chips">
        <button type="button" class="chip" [class.on]="!category() && !unreadOnly()" (click)="setFilter({category:'', unread:false})">All</button>
        <button type="button" class="chip" [class.on]="unreadOnly()" (click)="setFilter({unread:true})">
          Unread<span class="n">{{ unread() }}</span>
        </button>
        @for (c of categories(); track c.key) {
          <button type="button" class="chip" [class.on]="category()===c.key" (click)="setFilter({category:c.key})">
            {{ c.label }}@if (c.unread) { <span class="n">{{ c.unread }}</span> }
          </button>
        }
      </div>
      <div class="sev-row">
        <button type="button" class="chip" [class.on]="severity()==='critical'" (click)="toggleSev('critical')">Critical</button>
        <button type="button" class="chip" [class.on]="severity()==='warning'" (click)="toggleSev('warning')">Warning</button>
        <button type="button" class="chip" [class.on]="severity()==='info'" (click)="toggleSev('info')">Info</button>
      </div>
      <div class="search">
        <i class="fas fa-search" style="color:#94a3b8;font-size:0.8rem;"></i>
        <input [(ngModel)]="qDraft" placeholder="Search title or message…" (keydown.enter)="applySearch()">
        @if (q()) {
          <button type="button" class="chip" style="padding:2px 8px;" (click)="clearSearch()">Clear</button>
        }
      </div>
      <button type="button" class="chip" (click)="markAll()" [disabled]="!unread()">Mark all read</button>
      <a class="chip" routerLink="/m/content-management/communication-center" style="text-decoration:none;">Ops centre</a>
    </div>

    <dmis-panel title="Inbox" icon="fa-inbox" [badge]="items().length + (hasMore() ? '+' : '')">
      <div class="list">
        @for (n of items(); track n.id) {
          <div class="row" [class.unread]="!n.is_read" (click)="open(n)">
            <div class="ico" [class]="n.severity_norm || 'info'"><i class="fas" [class]="n.category_icon || 'fa-bell'"></i></div>
            <div>
              <div class="title">{{ n.title }}</div>
              <div class="msg">{{ n.message }}</div>
              <div class="meta">
                <span class="tag">{{ n.category_label || n.type }}</span>
                @if (n.severity_norm) { <span class="tag">{{ n.severity_norm }}</span> }
                <span>{{ n.created_at | date:'medium' }}</span>
                <span>{{ ago(n.created_at) }}</span>
              </div>
            </div>
            <div class="actions" (click)="$event.stopPropagation()">
              @if (!n.is_read) {
                <button type="button" (click)="markRead(n)">Mark read</button>
              } @else {
                <button type="button" (click)="markUnread(n)">Mark unread</button>
              }
              <button type="button" (click)="dismiss(n)">Dismiss</button>
            </div>
          </div>
        } @empty {
          <div class="empty"><i class="fas fa-bell-slash" style="font-size:1.4rem;display:block;margin-bottom:8px;"></i>
            No notifications match these filters.</div>
        }
      </div>
      @if (hasMore()) {
        <div class="foot">
          <button type="button" (click)="loadMore()" [disabled]="loading()">{{ loading() ? 'Loading…' : 'Load older' }}</button>
        </div>
      }
    </dmis-panel>
  `,
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);

  items = signal<Notif[]>([]);
  categories = signal<CategoryChip[]>([]);
  unread = signal(0);
  bySev = signal({ critical: 0, warning: 0, info: 0 });
  hasMore = signal(false);
  loading = signal(false);
  error = signal('');

  unreadOnly = signal(false);
  category = signal('');
  severity = signal('');
  q = signal('');
  qDraft = '';

  private poll: ReturnType<typeof setInterval> | null = null;
  private latestId: number | null = null;

  ngOnInit(): void {
    this.reload();
    this.poll = setInterval(() => this.pollBadge(), 30_000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  setFilter(p: { category?: string; unread?: boolean }): void {
    if (p.category !== undefined) this.category.set(p.category);
    if (p.unread !== undefined) this.unreadOnly.set(p.unread);
    if (p.unread === false && p.category === '') {
      this.category.set('');
      this.unreadOnly.set(false);
    }
    this.reload();
  }

  toggleSev(s: string): void {
    this.severity.set(this.severity() === s ? '' : s);
    this.reload();
  }

  applySearch(): void {
    this.q.set(this.qDraft.trim());
    this.reload();
  }

  clearSearch(): void {
    this.qDraft = '';
    this.q.set('');
    this.reload();
  }

  private buildParams(beforeId?: number | null): HttpParams {
    let p = new HttpParams().set('limit', '40');
    if (this.unreadOnly()) p = p.set('unread', 'true');
    if (this.category()) p = p.set('category', this.category());
    if (this.severity()) p = p.set('severity', this.severity());
    if (this.q()) p = p.set('q', this.q());
    if (beforeId) p = p.set('before_id', String(beforeId));
    return p;
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<any>('/api/v1/notifications', { params: this.buildParams() }).subscribe({
      next: r => {
        this.items.set(r.items ?? []);
        this.unread.set(r.unread_count ?? 0);
        this.categories.set(r.categories ?? []);
        this.hasMore.set(!!r.has_more);
        this.latestId = r.latest_id ?? null;
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.error.set(e?.error?.detail || e?.error?.message || 'Could not load notifications.');
      },
    });
    this.pollBadge();
  }

  loadMore(): void {
    const list = this.items();
    if (!list.length || !this.hasMore()) return;
    const before = list[list.length - 1].id;
    this.loading.set(true);
    this.http.get<any>('/api/v1/notifications', { params: this.buildParams(before) }).subscribe({
      next: r => {
        this.items.update(cur => [...cur, ...(r.items ?? [])]);
        this.hasMore.set(!!r.has_more);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private pollBadge(): void {
    this.http.get<any>('/api/v1/notifications/unread-count').subscribe({
      next: r => {
        this.unread.set(r.count ?? 0);
        this.bySev.set({
          critical: r.by_severity?.critical ?? 0,
          warning: r.by_severity?.warning ?? 0,
          info: r.by_severity?.info ?? 0,
        });
        const lid = r.latest_id ?? null;
        if (lid != null && this.latestId != null && lid > this.latestId) {
          this.latestId = lid;
          this.reload();
        } else if (lid != null) {
          this.latestId = lid;
        }
      },
      error: () => {},
    });
  }

  open(n: Notif): void {
    if (!n.is_read) this.markRead(n, false);
    const path = this.resolveLink(n);
    if (path) this.router.navigateByUrl(path);
  }

  markRead(n: Notif, stop = true): void {
    this.http.post(`/api/v1/notifications/${n.id}/read`, {}).subscribe({
      next: () => {
        this.items.update(list => list.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        this.unread.update(u => Math.max(0, u - 1));
      },
    });
  }

  markUnread(n: Notif): void {
    this.http.post(`/api/v1/notifications/${n.id}/unread`, {}).subscribe({
      next: () => {
        this.items.update(list => list.map(x => x.id === n.id ? { ...x, is_read: false } : x));
        this.unread.update(u => u + 1);
      },
    });
  }

  dismiss(n: Notif): void {
    this.http.delete(`/api/v1/notifications/${n.id}`).subscribe({
      next: () => {
        const wasUnread = !n.is_read;
        this.items.update(list => list.filter(x => x.id !== n.id));
        if (wasUnread) this.unread.update(u => Math.max(0, u - 1));
      },
    });
  }

  markAll(): void {
    this.http.post('/api/v1/notifications/read-all', {}).subscribe({
      next: () => {
        this.items.update(list => list.map(x => ({ ...x, is_read: true })));
        this.unread.set(0);
      },
    });
  }

  ago(ts: string): string {
    if (!ts) return '';
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  private resolveLink(n: Notif): string {
    const link = String(n.link || '').trim();
    const type = String(n.type || n.entity_type || '').toLowerCase();
    if (!link || link === '/' || link === '/m/response') {
      if (type.includes('early_warning') || type.includes('bulletin') || type.includes('warning')) return '/m/response/issued-alerts';
      if (type.includes('incident') || type.includes('task')) return '/m/response/incidents';
      if (type.includes('allocat') || type.includes('approval') || type.includes('dispatch')) return '/m/response/resource-approvals';
      return '/m/response/dashboard';
    }
    if (link.startsWith('http')) {
      try { const u = new URL(link); return u.pathname + u.search; } catch { /* */ }
    }
    if (link.startsWith('/m/')) return link;
    if (link.startsWith('/')) return link;
    return '/m/response/dashboard';
  }
}
