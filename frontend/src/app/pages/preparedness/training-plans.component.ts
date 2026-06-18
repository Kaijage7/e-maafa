import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface TrainingRow {
  id: number; trainingId: string; title: string; institution: string; scope: string[]; audience: string[];
  venue: string; period: string; status: string;
  published: boolean; drrPriority: string | null; supportRequested: boolean; sourceOfFund: string | null;
}
interface TrResponse {
  plans: TrainingRow[];
  stats: { total: number; planned: number; ongoing: number; completed: number };
}

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages
let swalPromise: Promise<void> | null = null;

@Component({
  selector: 'page-training-plans',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink],
  template: `
    <dmis-page-header title="Training Plans" icon="fa-chalkboard-teacher"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Training Plans'}]">
      <a class="btn-add" routerLink="/m/preparedness/trainings/create"><i class="fas fa-plus"></i> New Training Plan</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Plans" icon="fa-list" color="#198754" />
      <dmis-stat-card [value]="stats().planned" label="Planned" icon="fa-calendar-alt" color="#3b82f6" />
      <dmis-stat-card [value]="stats().ongoing" label="Ongoing" icon="fa-spinner" color="#f59e0b" />
      <dmis-stat-card [value]="stats().completed" label="Completed" icon="fa-check-double" color="#10b981" />
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search training plans..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="status()" (change)="status.set($any($event.target).value)">
        <option value="">All Statuses</option>
        <option value="planned">Planned</option>
        <option value="ongoing">Ongoing</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Training Plan Registry" icon="fa-database" [badge]="plans().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr>
                  <th>Training ID</th><th>Title</th><th>Scope</th><th>Target Audience</th><th>Period</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  @for (t of filtered(); track t.trainingId) {
                    <tr class="data-row">
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ t.trainingId }}</td>
                      <td><div class="r-title">{{ t.title }}</div><div class="r-subtitle">{{ t.institution }}</div></td>
                      <td>@for (s of t.scope; track s) { <span class="r-badge" style="background:rgba(59,130,246,0.1);color:#2563eb;margin:0.1rem;">{{ s }}</span> }
                        @if (!t.scope.length) { <span style="color:var(--text-light);">-</span> }</td>
                      <td>@for (a of t.audience; track a) { <span class="r-badge" style="background:rgba(25,135,84,0.1);color:#198754;margin:0.1rem;">{{ a }}</span> }
                        @if (!t.audience.length) { <span style="color:var(--text-light);">-</span> }</td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">{{ t.period }}</td>
                      <td>
                        <span class="r-badge {{ statusClass(t.status) }}">{{ t.status }}</span>
                        @if (t.published || t.drrPriority || t.supportRequested) {
                          <div class="link-badges">
                            @if (t.published) { <span class="lb lb-pub"><i class="fas fa-newspaper"></i> Published</span> }
                            @if (t.drrPriority) { <span class="lb lb-drr"><i class="fas fa-bullseye"></i> DRR: {{ t.drrPriority }}</span> }
                            @if (t.supportRequested) { <span class="lb lb-sup"><i class="fas fa-hand-holding-heart"></i> Support requested</span> }
                          </div>
                        }
                      </td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(t.trainingId, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === t.trainingId">
                            <a class="ctx-item" [routerLink]="['/m/preparedness/trainings/create']" [queryParams]="{edit: t.id}"><i class="fas fa-eye"></i> View Details</a>
                            <a class="ctx-item success" [routerLink]="['/m/preparedness/trainings/create']" [queryParams]="{edit: t.id}"><i class="fas fa-edit"></i> Edit</a>
                            <div class="ctx-sep"></div>
                            @if (!t.published) {
                              <a class="ctx-item" style="cursor:pointer;" (click)="publish(t)"><i class="fas fa-newspaper"></i> Publish to News &amp; Events</a>
                            }
                            @if (!t.drrPriority) {
                              <a class="ctx-item" style="cursor:pointer;" (click)="pushPriority(t)"><i class="fas fa-bullseye"></i> Push to DRR Priority</a>
                            }
                            @if (!t.sourceOfFund && !t.supportRequested) {
                              <a class="ctx-item warn" style="cursor:pointer;" (click)="requestSupport(t)"><i class="fas fa-hand-holding-heart"></i> Request Support</a>
                            }
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state"><i class="fas fa-chalkboard-teacher"></i>No training plans registered yet.</div>
          }
        </div>
      </dmis-panel>
    </div>
  `,
  styles: [`
    .badge-planned { background: rgba(59,130,246,0.12); color: #2563eb; }
    .badge-ongoing { background: rgba(245,158,11,0.12); color: #d97706; }
    .badge-completed { background: rgba(16,185,129,0.12); color: #059669; }
    .badge-cancelled { background: rgba(156,163,175,0.15); color: #6b7280; }
    .link-badges { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem; }
    .lb { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; font-weight: 600; padding: 0.12rem 0.5rem; border-radius: 20px; }
    .lb i { font-size: 0.68rem; }
    .lb-pub { background: rgba(37,99,235,0.1); color: #2563eb; }
    .lb-drr { background: rgba(0,51,102,0.1); color: #003366; }
    .lb-sup { background: rgba(217,119,6,0.12); color: #b45309; }
    .ctx-sep { height: 1px; background: var(--border); margin: 0.25rem 0; }
    .ctx-item.warn { color: #b45309; }
  `],
})
export class TrainingPlansComponent {
  private http = inject(HttpClient);
  plans = signal<TrainingRow[]>([]);
  stats = signal({ total: 0, planned: 0, ongoing: 0, completed: 0 });
  search = signal('');
  status = signal('');
  openMenu = signal<string | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.http.get<TrResponse>('/api/v1/training-plans').subscribe(r => {
      this.plans.set(r.plans);
      this.stats.set(r.stats);
    });
  }

  /** Publish an upcoming training as a public News/Event item. */
  publish(t: TrainingRow): void {
    ensureSweetAlert().then(() => Swal.fire({
      icon: 'question', title: 'Publish to News & Events?',
      html: `“${t.title}” will appear as a public event on the portal.`,
      showCancelButton: true, confirmButtonText: 'Publish', confirmButtonColor: '#198754',
    }).then((res: any) => {
      if (!res.isConfirmed) { return; }
      this.http.post<any>(`/api/v1/training-plans/${t.id}/publish`, {}).subscribe({
        next: r => { this.load(); Swal.fire({ icon: 'success', title: 'Published', text: r.message, timer: 2200, showConfirmButton: false }); },
        error: e => Swal.fire('Error', e?.error?.detail ?? e?.error?.message ?? 'Could not publish.', 'error'),
      });
    }));
  }

  /** Push a training to DRR priorities (creates a mitigation measure carrying the chosen priority). */
  pushPriority(t: TrainingRow): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Push to DRR Priority',
      input: 'select', inputOptions: { Low: 'Low', Medium: 'Medium', High: 'High' },
      inputPlaceholder: 'Select priority', inputValue: 'Medium',
      showCancelButton: true, confirmButtonText: 'Push', confirmButtonColor: '#003366',
      inputValidator: (v: string) => !v ? 'Please choose a priority' : null,
    }).then((res: any) => {
      if (!res.isConfirmed) { return; }
      this.http.post<any>(`/api/v1/training-plans/${t.id}/push-priority`, { priority: res.value }).subscribe({
        next: r => { this.load(); Swal.fire({ icon: 'success', title: 'Pushed to DRR Priorities', text: r.message, timer: 2400, showConfirmButton: false }); },
        error: e => Swal.fire('Error', e?.error?.detail ?? e?.error?.message ?? 'Could not push to priorities.', 'error'),
      });
    }));
  }

  /** Request stakeholder funding support for an unfunded training (notifies partners). */
  requestSupport(t: TrainingRow): void {
    ensureSweetAlert().then(() => Swal.fire({
      icon: 'warning', title: 'Request funding support?',
      html: `“${t.title}” has no funding source. Stakeholders/partners will be notified of the funding need.`,
      showCancelButton: true, confirmButtonText: 'Request Support', confirmButtonColor: '#d97706',
    }).then((res: any) => {
      if (!res.isConfirmed) { return; }
      this.http.post<any>(`/api/v1/training-plans/${t.id}/request-support`, {}).subscribe({
        next: r => { this.load(); Swal.fire({ icon: 'success', title: 'Support requested', text: r.message, timer: 2400, showConfirmButton: false }); },
        error: e => Swal.fire('Error', e?.error?.detail ?? e?.error?.message ?? 'Could not request support.', 'error'),
      });
    }));
  }

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const st = this.status().toLowerCase();
    return this.plans().filter(t => {
      const text = (t.trainingId + ' ' + t.title + ' ' + t.institution + ' ' + t.scope.join(' ')).toLowerCase();
      return (!q || text.includes(q)) && (!st || (t.status || '').toLowerCase() === st);
    });
  });

  statusClass(s: string): string { return 'badge-' + (s || '').toLowerCase().replace(/ /g, '-'); }
  toggleMenu(id: string, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}

function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return swalPromise;
}
