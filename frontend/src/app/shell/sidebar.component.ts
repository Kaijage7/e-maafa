import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ModuleItem, moduleBySlug } from '../core/modules';
import { hasRequiredPermission, routePermission } from '../core/access';
import { qrcodegen } from '../shared/qrcodegen';

/**
 * Module sidebar: items grouped into collapsible process categories
 * (Command → Alerts → Incidents → Resources → Coordination) so a long
 * Response list is not one flat wall of links.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
  styles: [`
    .sb-group { border-bottom: 1px solid rgba(255,255,255,0.06); }
    .sb-group-head {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 0.45rem 0.85rem 0.35rem; background: transparent; border: none;
      color: rgba(255,255,255,0.55); font-size: 0.68rem; font-weight: 800;
      letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; text-align: left;
    }
    .sb-group-head:hover { color: rgba(255,255,255,0.85); }
    .sb-group-head .cnt {
      margin-left: auto; background: rgba(255,255,255,0.12); color: #fff;
      border-radius: 999px; font-size: 0.65rem; padding: 0 6px; font-weight: 800;
    }
    .sb-group-head .ch { font-size: 0.65rem; opacity: 0.6; transition: transform .15s; }
    .sb-group.open .sb-group-head .ch { transform: rotate(180deg); }
    .sb-group-body { padding-bottom: 0.25rem; }
  `],
  template: `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-scroll">
        <a routerLink="/home" class="sb-standalone sb-hub-panel" data-tip="All Modules">
          <div class="sb-section-icon"><i class="fas fa-th-large"></i></div>
          <div class="sb-section-text">
            <div class="sb-section-name">All Modules</div>
            <div class="sb-section-count">Back to hub</div>
          </div>
        </a>
        <div class="sb-divider"></div>
        @if (module(); as m) {
          <div class="sb-section sb-module-panel" [attr.data-section]="m.slug">
            <div class="sb-section-header" style="cursor:default;" [attr.data-tip]="m.name">
              <div class="sb-section-icon" [style.color]="m.color"><i class="fas {{ m.icon }}"></i></div>
              <div class="sb-section-text">
                <div class="sb-section-name">{{ m.name }}</div>
                <div class="sb-section-count">{{ items().length }} screens · by process step</div>
              </div>
            </div>
            <div class="sb-items">
              @for (g of groups(); track g.name) {
                <div class="sb-group" [class.open]="isOpen(g.name)">
                  <button type="button" class="sb-group-head" (click)="toggle(g.name)">
                    {{ g.name }}
                    <span class="cnt">{{ g.items.length }}</span>
                    <i class="fas fa-chevron-down ch"></i>
                  </button>
                  @if (isOpen(g.name)) {
                    <div class="sb-group-body">
                      @for (item of g.items; track item.path) {
                        <a [routerLink]="linkFor(m.slug, item.path)" class="sb-link"
                           [class.active]="item.path === activeItem()"
                           [attr.title]="item.name + ' — ' + item.description">
                          <i class="fas {{ item.icon }} sb-link-icon"></i>
                          <span class="sb-link-text">{{ item.name }}</span>
                        </a>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
      <div class="sidebar-footer">
        @if (auth.hasPermission('content_management.view')) {
          <a [routerLink]="['/m/content-management/qr-outreach']" class="sb-qr" title="Scan to register a partner — or click to open QR Outreach"
             style="display:block;text-align:center;padding:.55rem .5rem .6rem;text-decoration:none;">
            <svg [attr.viewBox]="qr.vb" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"
                 style="width:94px;height:94px;background:#fff;border-radius:7px;padding:5px;box-sizing:border-box;">
              <rect [attr.x]="-3" [attr.y]="-3" [attr.width]="qr.n + 6" [attr.height]="qr.n + 6" fill="#ffffff"/>
              @for (m of qr.dark; track $index) { <rect [attr.x]="m[0]" [attr.y]="m[1]" width="1" height="1" fill="#0d3b66"/> }
            </svg>
            <div class="sb-qr-cap" style="font-size:.75rem;color:var(--text-mid);margin-top:.3rem;font-weight:700;letter-spacing:.04em;">SCAN TO REGISTER</div>
          </a>
        }
        <div class="sb-user">
          <div class="sb-user-avatar">{{ auth.initials() }}</div>
          <div class="sb-user-info"><div class="sb-user-name">{{ auth.user()?.name }}</div><div class="sb-user-role">{{ auth.primaryRole() }}</div></div>
        </div>
      </div>
    </div>
  `,
})
export class SidebarComponent {
  auth = inject(AuthService);
  currentModule = input<string | null>(null);
  activeItem = input<string | null>(null);
  module = computed(() => moduleBySlug(this.currentModule() ?? ''));
  /** Which process groups are expanded (first open by default). */
  private openGroups = signal<Set<string>>(new Set());

  qr = (() => {
    const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'http://localhost:4200';
    const q = qrcodegen.QrCode.encodeText(origin + '/register-partner', qrcodegen.QrCode.Ecc.MEDIUM);
    const n = q.size;
    const dark: [number, number][] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (q.getModule(x, y)) { dark.push([x, y]); }
      }
    }
    return { n, dark, vb: `-3 -3 ${n + 6} ${n + 6}` };
  })();

  items = computed(() => {
    const m = this.module();
    if (!m) return [];
    return m.items.filter(item => {
      const perm = routePermission(this.linkFor(m.slug, item.path).join('/'));
      return hasRequiredPermission(p => this.auth.hasPermission(p), perm);
    });
  });

  groups = computed(() => {
    const list = this.items();
    const map = new Map<string, ModuleItem[]>();
    for (const item of list) {
      const g = item.group || 'Screens';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  isOpen(name: string): boolean {
    const groups = this.groups();
    const s = this.openGroups();
    if (s.size === 0) {
      if (!groups.length) return true;
      if (name === groups[0].name) return true;
      const active = this.activeItem();
      return groups.some(g => g.name === name && g.items.some(i => i.path === active));
    }
    return s.has(name);
  }

  toggle(name: string): void {
    this.openGroups.update(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  linkFor(slug: string, path: string): any[] {
    return ['/m', slug, ...(path ?? '').split('/')];
  }
}
