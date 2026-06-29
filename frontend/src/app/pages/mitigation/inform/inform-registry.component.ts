import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Indicator, InformService } from './inform.service';
import { INFORM_STYLES } from './inform-ui';

/** INFORM tab — Indicator Registry (consumes live GET /indicators). */
@Component({
  selector: 'page-inform-registry',
  standalone: true,
  imports: [FormsModule],
  styles: [INFORM_STYLES, `:host { display:block; }`],
  template: `
    <p class="muted">The standardised indicators that feed the INFORM risk model — owner/sector, tier, weight and source range.</p>

    <div class="row-controls">
      <div class="field" style="min-width:240px;">
        <label for="owner">Filter by owner / sector</label>
        <select id="owner" [ngModel]="ownerFilter()" (ngModelChange)="ownerFilter.set($event)">
          <option value="">All owners</option>
          @for (o of owners(); track o) { <option [value]="o">{{ o }}</option> }
        </select>
      </div>
    </div>

    @if (loading()) {
      <p class="muted">Loading indicators…</p>
    } @else if (error()) {
      <p class="error">Could not load indicators ({{ error() }}).</p>
    } @else {
      <div class="card" style="padding:0; overflow:auto; max-height:65vh;">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Dimension</th><th>Component</th><th>Owner</th>
              <th>Keyed at</th><th>Tier</th><th class="num">Weight</th><th>Range</th>
            </tr>
          </thead>
          <tbody>
            @for (it of filtered(); track it.id) {
              <tr>
                <td><strong>{{ it.id }}</strong></td>
                <td>{{ it.dimension || '—' }}</td>
                <td>{{ it.component || '—' }}</td>
                <td><span class="pill">{{ it.owner || '—' }}</span></td>
                <td class="muted">{{ it.keyedAt || '—' }}</td>
                <td>{{ it.tier ?? '—' }}</td>
                <td class="num">{{ it.weight != null ? it.weight : '—' }}</td>
                <td class="muted">{{ rangeOf(it) }}</td>
              </tr>
            }
            @if (filtered().length === 0) {
              <tr><td colspan="8" class="muted" style="padding:1rem;">No indicators match this filter.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:.5rem;">{{ filtered().length }} of {{ all().length }} indicators shown.</p>
    }
  `,
})
export class InformRegistryComponent implements OnInit {
  private svc = inject(InformService);
  all = signal<Indicator[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  ownerFilter = signal('');

  owners = computed(() => {
    const set = new Set<string>();
    for (const it of this.all()) if (it.owner) set.add(it.owner);
    return Array.from(set).sort();
  });
  filtered = computed(() => {
    const f = this.ownerFilter();
    return f ? this.all().filter(it => it.owner === f) : this.all();
  });

  ngOnInit(): void {
    this.svc.getIndicators().subscribe({
      next: list => { this.all.set(list ?? []); this.loading.set(false); },
      error: err => { this.error.set(err?.status ? `HTTP ${err.status}` : 'offline'); this.loading.set(false); },
    });
  }

  rangeOf(it: Indicator): string {
    const lo = it.rangeMin ?? it.resolvedMin;
    const hi = it.rangeMax ?? it.resolvedMax;
    if (lo == null || hi == null) return '—';
    return `${lo} – ${hi}`;
  }
}
