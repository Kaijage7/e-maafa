import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Breadcrumb {
  label: string;
  url?: string;
}

/** Exact reproduction of components/dmis/page-header.blade.php (module-card + breadcrumbs + action slot). */
@Component({
  selector: 'dmis-page-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="module-card" style="margin-bottom:0.85rem;">
      <div class="module-card-left">
        <div class="module-card-icon"><i class="fas {{ icon() }}"></i></div>
        <div>
          <h1>{{ title() }}</h1>
          @if (breadcrumbs().length) {
            <div class="breadcrumb-trail">
              @for (crumb of breadcrumbs(); track $index; let last = $last) {
                @if ($index > 0) {
                  <span class="sep"><i class="fas fa-chevron-right" style="font-size:0.4rem;"></i></span>
                }
                @if (crumb.url) {
                  <a [routerLink]="crumb.url">{{ crumb.label }}</a>
                } @else if (last) {
                  <span style="color:var(--module-color);font-weight:600;">{{ crumb.label }}</span>
                } @else {
                  <span>{{ crumb.label }}</span>
                }
              }
            </div>
          }
        </div>
      </div>
      <ng-content></ng-content>
    </div>
  `,
})
export class PageHeaderComponent {
  title = input('');
  icon = input('');
  breadcrumbs = input<Breadcrumb[]>([]);
}
