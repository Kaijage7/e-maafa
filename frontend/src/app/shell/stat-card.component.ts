import { Component, input } from '@angular/core';

/** Exact reproduction of components/dmis/stat-card.blade.php. */
@Component({
  selector: 'dmis-stat-card',
  standalone: true,
  template: `
    <div class="stat-card">
      <div class="sc-icon" [style.background]="color()">
        <i class="fas {{ icon() }}"></i>
      </div>
      <div>
        <div class="sc-value">{{ value() }}</div>
        <div class="sc-label">{{ label() }}</div>
      </div>
    </div>
  `,
})
export class StatCardComponent {
  value = input<number | string>(0);
  label = input('');
  icon = input('');
  color = input('#198754');
}
