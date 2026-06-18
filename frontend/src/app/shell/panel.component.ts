import { Component, input } from '@angular/core';

/** Exact reproduction of components/dmis/panel.blade.php (title + icon + badge + actions slot + body slot). */
@Component({
  selector: 'dmis-panel',
  standalone: true,
  template: `
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">
          @if (icon()) { <i class="fas {{ icon() }}" [style.color]="color() || null"></i> }
          {{ title() }}
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          @if (badge()) { <span class="panel-badge">{{ badge() }}</span> }
          <ng-content select="[actions]"></ng-content>
        </div>
      </div>
      <ng-content></ng-content>
    </div>
  `,
})
export class PanelComponent {
  title = input('');
  icon = input<string | null>(null);
  badge = input<string | null>(null);
  color = input<string | null>(null);
}
