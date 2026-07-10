import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { FontScaleService } from './core/font-scale.service';
import { SidebarComponent } from './shell/sidebar.component';
import { TopbarComponent } from './shell/topbar.component';
import { WatermarkComponent } from './shell/watermark.component';

/** dmis-v2 layout. Early Warning is now fully native (the /engine route renders the flow hub and each
 *  entity has its own Angular console) — the old embedded Streamlit engine iframe has been retired. */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, WatermarkComponent, TopbarComponent, SidebarComponent],
  template: `
    @if (auth.user() && !isPublic()) {
      <app-watermark></app-watermark>
      <app-topbar></app-topbar>
      @if (!isHub()) {
        <app-sidebar [currentModule]="currentModule()" [activeItem]="activeItem()"></app-sidebar>
        <div class="sidebar-overlay" id="sidebarOverlay"></div>
      }
      <div class="main-area">
        <div class="main-content">
          <router-outlet></router-outlet>
        </div>
      </div>
    } @else {
      <router-outlet></router-outlet>
    }
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  /** Eager-init: restores saved font size for whole app (incl. login/public). */
  private readonly fontScale = inject(FontScaleService);
  private router = inject(Router);

  isHub = signal(true);
  currentModule = signal<string | null>(null);
  activeItem = signal<string | null>(null);
  /** Public portal routes render bare (their own layout), never inside the admin shell. */
  isPublic = signal(true);

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.sync());
    this.sync();
    // Reposition kebab (ctx) menus so edge rows / overflow tables never clip actions.
    if (typeof document !== 'undefined') {
      document.addEventListener('click', () => {
        // After Angular toggles .open on the same tick
        queueMicrotask(() => this.positionOpenCtxMenus());
      }, true);
      window.addEventListener('resize', () => this.positionOpenCtxMenus());
      window.addEventListener('scroll', () => this.positionOpenCtxMenus(), true);
    }
  }

  /**
   * Place every open .ctx-menu as position:fixed near its .ctx-trigger, flipping up/left
   * when near the viewport edges so action items stay fully visible.
   */
  private positionOpenCtxMenus(): void {
    document.querySelectorAll<HTMLElement>('.ctx-menu.open').forEach(menu => {
      const wrap = menu.closest('.ctx-wrap');
      const trigger = wrap?.querySelector('.ctx-trigger') as HTMLElement | null;
      if (!trigger) {
        return;
      }
      const r = trigger.getBoundingClientRect();
      const mw = Math.max(menu.offsetWidth || 180, 170);
      const mh = Math.max(menu.offsetHeight || 40, 40);
      let top = r.bottom + 4;
      let left = r.right - mw;
      if (left < 8) {
        left = 8;
      }
      if (left + mw > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - mw - 8);
      }
      if (top + mh > window.innerHeight - 8) {
        top = Math.max(8, r.top - mh - 4);
      }
      menu.style.top = `${Math.round(top)}px`;
      menu.style.left = `${Math.round(left)}px`;
    });
  }

  private sync(): void {
    const path = this.router.url.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    // The citizen-facing portal ('/', /about, /news/…, /publications/…) has its own layout
    this.isPublic.set(path === '/'
      || ['about', 'news', 'publications', 'portal', 'subscribe', 'education', 'threats'].includes(parts[0]));
    if (parts[0] === 'm' && parts[1]) {
      this.isHub.set(false);
      this.currentModule.set(parts[1]);
      this.activeItem.set(parts[2] ?? null);
      document.body.classList.remove('no-sidebar');
    } else {
      this.isHub.set(true);
      this.currentModule.set(null);
      this.activeItem.set(null);
      document.body.classList.add('no-sidebar');
    }
  }
}
