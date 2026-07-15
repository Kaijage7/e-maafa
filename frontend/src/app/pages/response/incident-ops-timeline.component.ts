import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { PanelComponent } from '../../shell/panel.component';

/**
 * Audit F12 — the unified per-incident OPERATIONS TIMELINE (master ops log).
 * Renders GET /v1/response/incidents/{id}/ops-timeline: one merged, time-descending
 * register of every trail that genuinely carries incident linkage — workflow actions,
 * task activity, situation reports, resource allocations, dispatches (incl. the
 * source_details fulfilment journal), warehouse stock movements, incident-workflow
 * SMS/email dispatches and budget commitments. Per-source filter chips + load-more;
 * classic flat enterprise register per DMIS-DESIGN-STANDARD.md.
 */
const SOURCE_META: Record<string, { label: string; icon: string; color: string }> = {
  workflow: { label: 'Workflow', icon: 'fa-route', color: '#0d6efd' },
  task: { label: 'Tasks', icon: 'fa-list-check', color: '#6f42c1' },
  situation_report: { label: 'Situation Reports', icon: 'fa-file-medical', color: '#d63384' },
  allocation: { label: 'Allocations', icon: 'fa-boxes-stacked', color: '#fd7e14' },
  dispatch: { label: 'Dispatch', icon: 'fa-truck-fast', color: '#198754' },
  warehouse: { label: 'Warehouse', icon: 'fa-warehouse', color: '#6c584c' },
  sms: { label: 'SMS', icon: 'fa-comment-sms', color: '#20a08a' },
  email: { label: 'Email', icon: 'fa-envelope', color: '#0d7fa5' },
  budget: { label: 'Budget', icon: 'fa-coins', color: '#a07908' },
};

const PAGE_SIZE = 30;

@Component({
    selector: 'dmis-incident-ops-timeline',
    imports: [PanelComponent],
    styles: [`
    .ot-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0.75rem 0.85rem; border-bottom: 1px solid #eef1f5; }
    .ot-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d7dce3; background: #fff;
               color: #3b4658; border-radius: 999px; padding: 4px 12px; font-size: 0.78rem; font-weight: 600;
               cursor: pointer; transition: background 0.15s, color 0.15s; }
    .ot-chip:hover { background: #eef4fb; }
    .ot-chip.active { background: #0d3b66; border-color: #0d3b66; color: #fff; }
    .ot-chip .ot-count { font-weight: 700; opacity: 0.75; }
    .ot-src { display: inline-flex; align-items: center; gap: 7px; font-size: 0.78rem; font-weight: 700;
              text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
    .ot-src i { width: 16px; text-align: center; }
    .ot-when { font-size: 0.8rem; color: var(--text-mid); white-space: nowrap; }
    .ot-title { font-size: 0.85rem; font-weight: 600; color: var(--text-dark); }
    .ot-detail { font-size: 0.78rem; color: var(--text-light); margin-top: 2px; line-height: 1.45; }
    .ot-actor { font-size: 0.8rem; color: var(--text-mid); white-space: nowrap; }
    .ot-ref { font-size: 0.75rem; color: var(--text-light); white-space: nowrap; }
    .ot-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
               padding: 0.6rem 0.85rem; border-top: 1px solid #eef1f5; font-size: 0.78rem; color: var(--text-light); }
    .ot-empty { padding: 1.4rem 1rem; text-align: center; color: var(--text-light); font-size: 0.85rem; }
    .ot-empty i { display: block; font-size: 1.4rem; margin-bottom: 0.4rem; color: #b8c2cf; }
  `],
    template: `
    <dmis-panel title="Operations Timeline" icon="fa-timeline" [badge]="allCount() + ' entries'">
      <div class="panel-body" style="padding:0;">
        @if (allCount() > 0) {
          <div class="ot-chips">
            <button type="button" class="ot-chip" [class.active]="activeSource() === ''" (click)="setSource('')">
              <i class="fas fa-layer-group"></i> All <span class="ot-count">{{ allCount() }}</span></button>
            @for (c of chips(); track c.key) {
              <button type="button" class="ot-chip" [class.active]="activeSource() === c.key" (click)="setSource(c.key)">
                <i class="fas" [class]="'fas ' + c.icon"></i> {{ c.label }} <span class="ot-count">{{ c.count }}</span></button>
            }
          </div>
        }
        @if (failed()) {
          <div class="ot-empty"><i class="fas fa-triangle-exclamation"></i>
            The operations timeline could not be loaded. Reload the page to try again.</div>
        } @else if (entries().length === 0 && !loading()) {
          <div class="ot-empty"><i class="fas fa-timeline"></i>
            No operations recorded for this incident yet — workflow actions, dispatches, warehouse
            movements, communications and budget commitments will appear here as they happen.</div>
        } @else {
          <div style="overflow-x:auto;">
            <table class="r-table">
              <thead>
                <tr><th style="width:130px;">Time</th><th style="width:150px;">Source</th>
                    <th>Event</th><th style="width:170px;">Actor</th><th style="width:70px;">Ref.</th></tr>
              </thead>
              <tbody>
                @for (e of entries(); track $index) {
                  <tr>
                    <td class="ot-when">{{ e.at_display ?? '—' }}</td>
                    <td><span class="ot-src" [style.color]="meta(e.source).color">
                      <i class="fas" [class]="'fas ' + meta(e.source).icon"></i> {{ meta(e.source).label }}</span></td>
                    <td>
                      <div class="ot-title">{{ e.title }}</div>
                      @if (e.detail) { <div class="ot-detail">{{ e.detail }}</div> }
                    </td>
                    <td class="ot-actor">{{ e.actor ?? '—' }}</td>
                    <td class="ot-ref">#{{ e.ref_id }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="ot-foot">
            <span>Showing {{ entries().length }} of {{ total() }}{{ activeSource() ? ' ' + meta(activeSource()).label.toLowerCase() : '' }} entries</span>
            @if (entries().length < total()) {
              <button type="button" class="btn btn-sm btn-outline-secondary" style="font-size:0.78rem;" (click)="loadMore()">
                <i class="fas fa-angles-down"></i> Load more</button>
            }
          </div>
        }
      </div>
    </dmis-panel>
  `
})
export class IncidentOpsTimelineComponent {
  private readonly http = inject(HttpClient);

  readonly incidentId = input.required<number>();

  readonly entries = signal<any[]>([]);
  readonly sources = signal<Record<string, number>>({});
  readonly total = signal(0);
  readonly activeSource = signal('');
  readonly shown = signal(PAGE_SIZE);
  readonly loading = signal(false);
  readonly failed = signal(false);

  readonly allCount = computed(() =>
    Object.values(this.sources()).reduce((a: number, b: any) => a + Number(b ?? 0), 0));
  readonly chips = computed(() =>
    Object.entries(this.sources())
      .filter(([, n]) => Number(n) > 0)
      .map(([key, n]) => ({ key, count: Number(n), ...this.meta(key) })));

  constructor() {
    // Refetch whenever the incident, the source filter or the page window changes.
    effect(() => {
      this.incidentId();
      this.activeSource();
      this.shown();
      untracked(() => this.fetch());
    });
  }

  meta(source: string): { label: string; icon: string; color: string } {
    return SOURCE_META[source] ?? { label: source, icon: 'fa-circle-info', color: '#6c757d' };
  }

  setSource(source: string): void {
    this.activeSource.set(source);
    this.shown.set(PAGE_SIZE);
  }

  loadMore(): void {
    this.shown.update(v => v + PAGE_SIZE);
  }

  private fetch(): void {
    const params: Record<string, string> = { limit: String(this.shown()) };
    if (this.activeSource()) { params['source'] = this.activeSource(); }
    this.loading.set(true);
    this.http.get<any>(`/api/v1/response/incidents/${this.incidentId()}/ops-timeline`, { params }).subscribe({
      next: r => {
        this.entries.set(r.entries ?? []);
        this.sources.set(r.sources ?? {});
        this.total.set(r.total ?? 0);
        this.loading.set(false);
        this.failed.set(false);
      },
      error: () => { this.loading.set(false); this.failed.set(true); },
    });
  }
}
