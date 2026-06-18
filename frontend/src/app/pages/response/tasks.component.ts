import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

interface TaskRow {
  id: number; title: string; priority: string; status: string; due_date: string | null;
  completed_at: string | null; progress_percent: number | null; incident_title: string | null;
  incident_id: number | null; assigned_to_name: string | null; created_by_name: string | null;
  is_overdue: boolean;
}

/**
 * Incident task management — port of response/tasks (index, create, show,
 * my-tasks, calendar): statistics board, priority-ranked task table, the
 * assignment/status workflow with an activity log, dependency tracking and
 * a due-date calendar feed.
 */
@Component({
  selector: 'page-tasks',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.25rem; display: block; }
    .stat span { font-size: 0.68rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .pr { font-size: 0.66rem; font-weight: 700; border-radius: 8px; padding: 1px 8px; }
    .pr-Critical { background: #fee2e2; color: #b91c1c; } .pr-High { background: #ffedd5; color: #c2410c; }
    .pr-Medium { background: #fef3c7; color: #92400e; } .pr-Low { background: #d1fae5; color: #065f46; }
    .st { font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; background: #e2e8f0; color: #334155; }
    .st-InProgress { background: #dbeafe; color: #1e40af; } .st-Completed { background: #d1fae5; color: #065f46; }
    .st-OnHold { background: #fef3c7; color: #92400e; } .st-Cancelled { background: #f3e8ff; color: #6b21a8; }
    .overdue { color: #b91c1c; font-weight: 700; }
    .btn-sm { font-size: 0.72rem; padding: 4px 11px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; }
    .toolbar select { font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 5px 9px; font-family: inherit; }
    .cal-day { border: 1px solid #e3e6ed; border-radius: 10px; margin-bottom: 8px; overflow: hidden; }
    .cal-date { background: #f8f9fb; padding: 6px 12px; font-size: 0.78rem; font-weight: 700; }
    .cal-event { display: flex; gap: 8px; align-items: center; padding: 6px 12px; border-top: 1px solid #f1f5f9; font-size: 0.8rem; }
    .cal-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .drawer-back { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 1100; display: flex; justify-content: flex-end; }
    .drawer { width: 540px; max-width: 95vw; background: #fff; height: 100%; overflow-y: auto; box-shadow: -12px 0 40px rgba(0,0,0,0.25); }
    .drawer-head { background: #dc3545; color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; }
    .drawer-body { padding: 16px 18px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; font-size: 0.8rem; margin-bottom: 12px; }
    .meta b { display: block; font-size: 0.7rem; color: #6c757d; text-transform: uppercase; }
    .log { font-size: 0.78rem; padding: 7px 0; border-bottom: 1px dashed #e3e6ed; }
    label { display: block; font-size: 0.74rem; font-weight: 600; color: #334155; margin: 10px 0 3px; }
    input, select, textarea { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    .empty { text-align: center; color: #94a3b8; padding: 28px 0; font-size: 0.85rem; }
    .modal-back { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1100; overflow-y: auto; }
    .modal-card { background: #fff; border-radius: 0.5rem; margin: 2rem auto; max-width: 680px; padding: 1.25rem; }
  `],
  template: `
    <dmis-page-header title="Task Management" icon="fa-tasks"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Task Assignment'}]">
      <button type="button" class="btn-add" (click)="openCreate()"><i class="fas fa-plus"></i> New Task</button>
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ stats().total_tasks ?? 0 }}</b><span>Total</span></div>
      <div class="stat"><b>{{ stats().pending_tasks ?? 0 }}</b><span>To Do</span></div>
      <div class="stat"><b>{{ stats().in_progress_tasks ?? 0 }}</b><span>In Progress</span></div>
      <div class="stat"><b>{{ stats().completed_tasks ?? 0 }}</b><span>Completed</span></div>
      <div class="stat"><b class="overdue">{{ stats().overdue_tasks ?? 0 }}</b><span>Overdue</span></div>
      <div class="stat"><b>{{ stats().completion_rate ?? 0 }}%</b><span>Completion</span></div>
    </div>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'board'" (click)="setTab('board')">All Tasks</button>
      <button [class.active]="tab() === 'mine'" (click)="setTab('mine')">My Tasks</button>
      <button [class.active]="tab() === 'calendar'" (click)="setTab('calendar')">Calendar</button>
    </div>

    @if (tab() !== 'calendar') {
      <dmis-panel [title]="tab() === 'mine' ? 'Tasks Assigned to Me' : 'All Tasks'" icon="fa-list-check">
        <div class="toolbar">
          <select [(ngModel)]="statusFilter" (ngModelChange)="load()">
            <option value="">All statuses</option>
            @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
          </select>
        </div>
        <table>
          <thead><tr><th>Task</th><th>Incident</th><th>Assigned To</th><th>Priority</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (t of tasks(); track t.id) {
              <tr>
                <td><b>{{ t.title }}</b></td>
                <td>@if (t.incident_id) { <a [routerLink]="['/m/response/incidents', t.incident_id]">{{ t.incident_title }}</a> } @else { — }</td>
                <td>{{ t.assigned_to_name ?? 'Unassigned' }}</td>
                <td><span class="pr pr-{{ t.priority }}">{{ t.priority }}</span></td>
                <td [class.overdue]="t.is_overdue">{{ t.due_date?.substring(0, 10) ?? '—' }}
                  @if (t.is_overdue) { <i class="fas fa-triangle-exclamation"></i> }</td>
                <td><span class="st st-{{ t.status.replaceAll(' ', '') }}">{{ t.status }}</span></td>
                <td><button class="btn-sm b-outline" (click)="open(t.id)">Open</button></td>
              </tr>
            } @empty { <tr><td colspan="7" class="empty">No tasks match the filter.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    @if (tab() === 'calendar') {
      <dmis-panel title="Task Calendar (by due date)" icon="fa-calendar-days">
        @for (day of calendarDays(); track day.date) {
          <div class="cal-day">
            <div class="cal-date">{{ day.date }}</div>
            @for (e of day.events; track e.id) {
              <div class="cal-event">
                <span class="cal-dot" [style.background]="e.color"></span>
                <b>{{ e.title }}</b>
                <span style="color:#6c757d">{{ e.incident_title ?? '' }} · {{ e.assigned_to_name ?? 'Unassigned' }} · {{ e.status }}</span>
                <span style="flex:1"></span>
                <button class="btn-sm b-outline" (click)="open(e.id)">Open</button>
              </div>
            }
          </div>
        } @empty { <div class="empty">No scheduled tasks.</div> }
      </dmis-panel>
    }

    <!-- ── Task drawer: details, workflow, dependencies, activity log ── -->
    @if (detail(); as d) {
      <div class="drawer-back" (click)="detail.set(null)">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-head">
            <b>Task #{{ d.task.id }} — {{ d.task.title }}</b>
            <button class="btn-sm b-outline" (click)="detail.set(null)">✕</button>
          </div>
          <div class="drawer-body">
            <div class="meta">
              <div><b>Incident</b>{{ d.task.incident_title ?? '—' }}</div>
              <div><b>Priority</b><span class="pr pr-{{ d.task.priority }}">{{ d.task.priority }}</span></div>
              <div><b>Assigned to</b>{{ d.task.assigned_to_name ?? 'Unassigned' }}</div>
              <div><b>Created by</b>{{ d.task.created_by_name ?? '—' }}</div>
              <div><b>Due</b>{{ d.task.due_date?.substring(0, 16)?.replace('T', ' ') ?? '—' }}</div>
              <div><b>Status</b><span class="st st-{{ d.task.status.replaceAll(' ', '') }}">{{ d.task.status }}</span></div>
            </div>
            <p style="font-size:0.83rem">{{ d.task.description }}</p>
            @if (d.task.notes) { <p style="font-size:0.78rem; color:#6c757d"><b>Notes:</b> {{ d.task.notes }}</p> }

            <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0">
              @for (s of statuses; track s) {
                @if (s !== d.task.status) {
                  <button class="btn-sm b-outline" (click)="setStatus(d.task.id, s)">→ {{ s }}</button>
                }
              }
              <button class="btn-sm b-red" (click)="reassign(d.task.id)"><i class="fas fa-user"></i> Reassign</button>
            </div>

            @if (d.dependencies.length) {
              <b style="font-size:0.8rem">Depends on</b>
              @for (dep of d.dependencies; track dep.id) {
                <div class="log">#{{ dep.id }} {{ dep.title }} — <span class="st">{{ dep.status }}</span></div>
              }
            }
            @if (d.dependent_tasks.length) {
              <b style="font-size:0.8rem">Blocks</b>
              @for (dep of d.dependent_tasks; track dep.id) {
                <div class="log">#{{ dep.id }} {{ dep.title }} — <span class="st">{{ dep.status }}</span></div>
              }
            }

            <b style="font-size:0.8rem; display:block; margin-top:12px">Activity log</b>
            @for (u of d.updates; track u.id) {
              <div class="log"><b>{{ u.user_name ?? 'System' }}</b> — {{ u.message }}
                @if (u.details) { <br><span style="color:#6c757d">{{ u.details }}</span> }
                <br><small style="color:#94a3b8">{{ u.created_at?.substring(0, 16)?.replace('T', ' ') }}</small></div>
            } @empty { <div class="empty" style="padding:10px 0">No activity yet.</div> }
          </div>
        </div>
      </div>
    }

    <!-- ── Create modal ── -->
    @if (creating()) {
      <div class="modal-back" (click)="creating.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h3 style="margin:0 0 4px"><i class="fas fa-plus" style="color:#dc3545"></i> New Task</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 14px">
            <div><label>Incident *</label>
              <select [(ngModel)]="form.incident_id" (ngModelChange)="loadDependencies()">
                <option [ngValue]="null">Select…</option>
                @for (i of formData()?.incidents ?? []; track i.id) { <option [ngValue]="i.id">{{ i.title }}</option> }
              </select></div>
            <div><label>Assign to *</label>
              <select [(ngModel)]="form.assigned_to_user_id">
                <option [ngValue]="null">Select…</option>
                @for (u of formData()?.users ?? []; track u.id) { <option [ngValue]="u.id">{{ u.name }}</option> }
              </select></div>
            <div><label>Priority *</label>
              <select [(ngModel)]="form.priority">
                @for (p of formData()?.priorities ?? []; track p) { <option [value]="p">{{ p }}</option> }
              </select></div>
            <div><label>Due date *</label><input type="datetime-local" [(ngModel)]="form.due_date"></div>
          </div>
          <label>Title *</label><input maxlength="255" [(ngModel)]="form.task_title">
          <label>Description *</label><textarea rows="3" [(ngModel)]="form.task_description"></textarea>
          @if (dependencyOptions().length) {
            <label>Dependencies (same incident)</label>
            <select multiple [(ngModel)]="form.dependencies" size="3">
              @for (t of dependencyOptions(); track t.id) { <option [ngValue]="t.id">#{{ t.id }} {{ t.title }}</option> }
            </select>
          }
          <label>Notes</label><textarea rows="2" [(ngModel)]="form.notes"></textarea>
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px">
            <button class="btn-sm b-outline" (click)="creating.set(false)">Cancel</button>
            <button class="btn-sm b-red" (click)="create()"><i class="fas fa-save"></i> Create & Assign</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TasksComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly tab = signal<'board' | 'mine' | 'calendar'>('board');
  readonly tasks = signal<TaskRow[]>([]);
  readonly stats = signal<any>({});
  readonly calendarDays = signal<{ date: string; events: any[] }[]>([]);
  readonly detail = signal<any | null>(null);
  readonly creating = signal(false);
  readonly formData = signal<any | null>(null);
  readonly dependencyOptions = signal<any[]>([]);

  readonly statuses = ['To Do', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
  statusFilter = '';
  form = { incident_id: null as number | null, assigned_to_user_id: null as number | null,
    priority: 'Medium', due_date: '', task_title: '', task_description: '', notes: '',
    dependencies: [] as number[] };

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
  }

  setTab(tab: 'board' | 'mine' | 'calendar'): void {
    this.tab.set(tab);
    tab === 'calendar' ? this.loadCalendar() : this.load();
  }

  load(): void {
    const params: Record<string, string> = {};
    if (this.statusFilter) { params['status'] = this.statusFilter; }
    if (this.tab() === 'mine') { params['mine'] = 'true'; }
    this.http.get<any>('/api/v1/response/tasks', { params }).subscribe(d => {
      this.tasks.set(d.tasks);
      this.stats.set(d.statistics);
    });
  }

  loadCalendar(): void {
    this.http.get<any>('/api/v1/response/tasks/calendar').subscribe(d => {
      const byDate = new Map<string, any[]>();
      for (const e of d.events) {
        const key = String(e.start).substring(0, 10);
        (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(e);
      }
      this.calendarDays.set([...byDate.entries()].map(([date, events]) => ({ date, events })));
    });
  }

  open(id: number): void {
    this.http.get<any>(`/api/v1/response/tasks/${id}`).subscribe(d => this.detail.set(d));
  }

  openCreate(): void {
    this.http.get<any>('/api/v1/response/tasks/form-data').subscribe(d => {
      this.formData.set(d);
      this.creating.set(true);
    });
  }

  loadDependencies(): void {
    if (!this.form.incident_id) {
      this.dependencyOptions.set([]);
      return;
    }
    this.http.get<any>('/api/v1/response/tasks/form-data', { params: { incident_id: String(this.form.incident_id) } })
      .subscribe(d => this.dependencyOptions.set(d.available_dependencies));
  }

  create(): void {
    this.post('/api/v1/response/tasks', { ...this.form }, () => {
      this.creating.set(false);
      this.load();
    });
  }

  setStatus(id: number, status: string): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: `Move task to "${status}"?`, icon: 'question', showCancelButton: true,
      confirmButtonColor: '#dc3545', input: 'textarea', inputLabel: 'Notes (optional)',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.post(`/api/v1/response/tasks/${id}/status`, { status, notes: r.value || null }, () => this.open(id));
      }
    }));
  }

  reassign(id: number): void {
    this.http.get<any>('/api/v1/response/tasks/form-data').subscribe(fd => {
      const options = fd.users.map((u: any) => `<option value="${u.id}">${u.name}</option>`).join('');
      ensureSweetAlert().then(() => Swal.fire({
        title: 'Reassign task',
        html: `<select id="as-user" class="swal2-select" style="width:85%">${options}</select>
               <input id="as-notes" class="swal2-input" placeholder="Notes (optional)">`,
        showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Reassign',
        preConfirm: () => ({
          assigned_to_user_id: Number((document.getElementById('as-user') as HTMLSelectElement).value),
          notes: (document.getElementById('as-notes') as HTMLInputElement).value || null,
        }),
      }).then((r: any) => {
        if (r.isConfirmed) { this.post(`/api/v1/response/tasks/${id}/assign`, r.value, () => this.open(id)); }
      }));
    });
  }

  private post(url: string, body: any, after: () => void): void {
    this.http.post<any>(url, body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Done', text: r.message, timer: 2200, showConfirmButton: false,
      }).then(() => { after(); this.load(); })),
      error: err => ensureSweetAlert().then(() =>
        Swal.fire('Error', err?.error?.detail ?? 'An error occurred.', 'error')),
    });
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
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
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
