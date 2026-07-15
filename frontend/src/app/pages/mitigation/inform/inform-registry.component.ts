import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Indicator, InformService } from './inform.service';
import { INFORM_STYLES } from './inform-ui';

interface CompGroup { component: string; items: Indicator[] }
interface DimGroup { dimension: string; components: CompGroup[]; count: number }

/** INFORM tab — Indicator Registry grouped by dimension → component (not one flat wall of IDs). */
@Component({
    selector: 'page-inform-registry',
    imports: [FormsModule],
    styles: [INFORM_STYLES, `
    :host { display:block; }
    .tools { display:flex; flex-wrap:wrap; gap:.55rem; align-items:flex-end; margin-bottom:.85rem; }
    .tools .field { min-width:180px; }
    .tools input[type=search] { min-width:220px; font:inherit; padding:.4rem .6rem; border:1px solid var(--line,#cbd5e1); border-radius:8px; }
    .dim-block { border:1px solid var(--line,#e2e8f0); border-radius:10px; margin-bottom:.65rem; overflow:hidden; background:#fff; }
    .dim-head { width:100%; display:flex; justify-content:space-between; gap:.6rem; text-align:left; font:inherit; font-size:.9rem; font-weight:800;
      padding:.65rem .85rem; border:none; background:#f8fafc; color:#0f172a; cursor:pointer; }
    .dim-head:hover { background:#f1f5f9; }
    .dim-body { padding:.35rem .75rem .75rem; border-top:1px solid var(--line,#e2e8f0); }
    .comp-title { font-size:.78rem; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:.03em; margin:.55rem 0 .25rem; }
    table { width:100%; border-collapse:collapse; font-size:.82rem; }
    th, td { padding:.35rem .45rem; border-bottom:1px solid #f1f5f9; text-align:left; vertical-align:top; }
    th { font-size:.72rem; text-transform:uppercase; color:#64748b; }
    .id { font-family:ui-monospace,monospace; font-size:.75rem; }
  `],
    template: `
    <p class="muted">Standardised indicators that feed the INFORM risk model — grouped by dimension and component for a clear drill path. Owner/sector, tier, weight and source range shown per row.</p>

    <div class="tools">
      <div class="field">
        <label for="owner">Owner / sector</label>
        <select id="owner" [ngModel]="ownerFilter()" (ngModelChange)="ownerFilter.set($event)">
          <option value="">All owners</option>
          @for (o of owners(); track o) { <option [value]="o">{{ o }}</option> }
        </select>
      </div>
      <div class="field" style="flex:1;">
        <label for="q">Search</label>
        <input id="q" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Name, ID, component, owner…">
      </div>
      <button type="button" class="btn ghost" (click)="expandAll()">Expand all</button>
      <button type="button" class="btn ghost" (click)="collapseAll()">Collapse all</button>
    </div>

    @if (loading()) {
      <p class="muted">Loading indicators…</p>
    } @else if (error()) {
      <p class="error">Could not load indicators ({{ error() }}).</p>
    } @else {
      @for (g of groups(); track g.dimension) {
        <div class="dim-block">
          <button type="button" class="dim-head" (click)="toggle(g.dimension)">
            <span>{{ g.dimension || 'Unclassified' }} · {{ g.count }} indicators</span>
            <span>{{ open().has(g.dimension) ? '▾' : '▸' }}</span>
          </button>
          @if (open().has(g.dimension)) {
            <div class="dim-body">
              @for (cg of g.components; track cg.component) {
                <div class="comp-title">{{ cg.component || '—' }} ({{ cg.items.length }})</div>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th><th>Name</th><th>Owner</th>
                      <th>Keyed at</th><th>Tier</th><th class="num">Weight</th><th>Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (it of cg.items; track it.id) {
                      <tr>
                        <td class="id">{{ it.id }}</td>
                        <td><strong>{{ it.name || '—' }}</strong></td>
                        <td><span class="pill">{{ it.owner || '—' }}</span></td>
                        <td class="muted">{{ it.keyedAt || '—' }}</td>
                        <td>{{ it.tier ?? '—' }}</td>
                        <td class="num">{{ it.weight != null ? it.weight : '—' }}</td>
                        <td class="muted">{{ rangeOf(it) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          }
        </div>
      }
      @if (!groups().length) {
        <p class="muted">No indicators match this filter.</p>
      }
      <p class="muted" style="margin-top:.5rem;">{{ filteredCount() }} of {{ all().length }} indicators shown.</p>
    }
  `
})
export class InformRegistryComponent implements OnInit {
  private svc = inject(InformService);
  all = signal<Indicator[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  ownerFilter = signal('');
  query = signal('');
  open = signal<Set<string>>(new Set());

  owners = computed(() => {
    const set = new Set<string>();
    for (const it of this.all()) if (it.owner) set.add(it.owner);
    return Array.from(set).sort();
  });

  private filteredList = computed(() => {
    const f = this.ownerFilter();
    const q = this.query().trim().toLowerCase();
    return this.all().filter(it => {
      if (f && it.owner !== f) return false;
      if (!q) return true;
      const blob = [it.id, it.name, it.dimension, it.component, it.owner].map(x => (x || '').toLowerCase()).join(' ');
      return blob.includes(q);
    });
  });

  filteredCount = computed(() => this.filteredList().length);

  groups = computed<DimGroup[]>(() => {
    const byDim = new Map<string, Map<string, Indicator[]>>();
    for (const it of this.filteredList()) {
      const dim = it.dimension || 'Unclassified';
      const comp = it.component || '—';
      if (!byDim.has(dim)) byDim.set(dim, new Map());
      const cm = byDim.get(dim)!;
      if (!cm.has(comp)) cm.set(comp, []);
      cm.get(comp)!.push(it);
    }
    return [...byDim.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dimension, comps]) => {
        const components: CompGroup[] = [...comps.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([component, items]) => ({
            component,
            items: items.sort((a, b) => a.id.localeCompare(b.id)),
          }));
        return {
          dimension,
          components,
          count: components.reduce((n, c) => n + c.items.length, 0),
        };
      });
  });

  ngOnInit(): void {
    this.svc.getIndicators().subscribe({
      next: list => {
        this.all.set(list ?? []);
        this.loading.set(false);
        // Open first dimension by default for a guided start
        const first = this.groups()[0]?.dimension;
        if (first) this.open.set(new Set([first]));
      },
      error: err => { this.error.set(err?.status ? `HTTP ${err.status}` : 'offline'); this.loading.set(false); },
    });
  }

  toggle(dim: string): void {
    this.open.update(s => {
      const n = new Set(s);
      if (n.has(dim)) n.delete(dim); else n.add(dim);
      return n;
    });
  }
  expandAll(): void {
    this.open.set(new Set(this.groups().map(g => g.dimension)));
  }
  collapseAll(): void {
    this.open.set(new Set());
  }

  rangeOf(it: Indicator): string {
    const lo = it.rangeMin ?? it.resolvedMin;
    const hi = it.rangeMax ?? it.resolvedMax;
    if (lo == null || hi == null) return '—';
    return `${lo} – ${hi}`;
  }
}
