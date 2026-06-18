import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { moduleBySlug } from '../core/modules';

/** Exact reproduction of components/dmis/sidebar.blade.php (module mode: back-to-hub + current module). */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-scroll">
        <a routerLink="/home" class="sb-standalone" data-tip="All Modules">
          <div class="sb-section-icon"><i class="fas fa-arrow-left"></i></div>
          <div class="sb-section-text"><div class="sb-section-name">All Modules</div><div class="sb-section-count">Back to hub</div></div>
        </a>
        <div class="sb-divider"></div>
        @if (module(); as m) {
          <div class="sb-section" [attr.data-section]="m.slug">
            <div class="sb-section-header" style="cursor:default;" [attr.data-tip]="m.name">
              <div class="sb-section-icon"><i class="fas {{ m.icon }}"></i></div>
              <div class="sb-section-text"><div class="sb-section-name">{{ m.name }}</div><div class="sb-section-count">{{ m.items.length }} items</div></div>
            </div>
            <div class="sb-items">
              @for (item of m.items; track item.path) {
                <a [routerLink]="linkFor(m.slug, item.path)" class="sb-link" [class.active]="item.path === activeItem()">
                  <i class="fas {{ item.icon }} sb-link-icon"></i><span class="sb-link-text">{{ item.name }}</span>
                </a>
              }
            </div>
          </div>
        }
      </div>
      <div class="sidebar-footer">
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

  /** Build a routerLink segment array, splitting nested item paths (e.g. 'early-warnings/mow') into
   * real segments so RouterLink doesn't percent-encode the slash. */
  linkFor(slug: string, path: string): any[] {
    return ['/m', slug, ...(path ?? '').split('/')];
  }
}
