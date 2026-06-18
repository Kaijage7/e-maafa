import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Row {
  id: number; title: string; description: string | null; content_type: string; hazard_type: string | null;
  published_on: string | null; location: string | null; region: string | null; contributor: string | null;
  organization: string | null; approval_status: string; downloads_count: number;
}

const TYPE_COLOR: Record<string, string> = {
  'Lesson Learned': '#dc2626', 'Best Practice': '#059669', 'Case Study': '#0d6efd',
  'Technical Guide': '#7c3aed', Guideline: '#d97706', 'Research Report': '#0891b2', Bulletin: '#64748b',
};

/**
 * Lessons Learned / Knowledge Repository (Recovery) — searchable library of case studies, best
 * practices, lessons learned and technical guides captured after disasters, with a Pending →
 * Approved review. Closes the cycle: learning feeds the next mitigation/preparedness round.
 */
@Component({
  selector: 'page-knowledge-repository',
  standalone: true,
  imports: [FormsModule, DatePipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Lessons Learned" icon="fa-book"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Recovery'}, {label:'Lessons Learned'}]">
      <button class="btn-add" type="button" (click)="openForm()"><i class="fas fa-plus"></i> Add Entry</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total'] ?? 0" label="Knowledge entries" icon="fa-book" color="#6f42c1" />
      <dmis-stat-card [value]="s()['lessons'] ?? 0" label="Lessons learned" icon="fa-lightbulb" color="#dc2626" />
      <dmis-stat-card [value]="s()['approved'] ?? 0" label="Approved" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="s()['pending'] ?? 0" label="Pending review" icon="fa-hourglass-half" color="#d97706" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Knowledge Repository" icon="fa-database" [badge]="rows().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:180px;" [(ngModel)]="fType" (change)="reload()">
            <option value="">All types</option>@for (t of types(); track t) { <option [value]="t">{{ t }}</option> }
          </select>
          <select class="form-select" style="max-width:160px;" [(ngModel)]="fApproval" (change)="reload()">
            <option value="">All statuses</option><option value="Approved">Approved</option><option value="Pending">Pending</option>
          </select>
          <input class="form-control" style="max-width:260px;" placeholder="Search title / hazard…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Title</th><th>Type</th><th>Hazard</th><th>Contributor</th><th>Published</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="data-row">
                  <td class="r-title" style="max-width:300px;">{{ r.title }}
                    <div class="r-subtitle">{{ (r.description || '').slice(0,90) }}{{ (r.description || '').length > 90 ? '…' : '' }}</div></td>
                  <td><span class="r-badge" [style.background]="color(r.content_type) + '1a'" [style.color]="color(r.content_type)">{{ r.content_type }}</span></td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.hazard_type || '—' }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.organization || r.contributor || '—' }}</td>
                  <td style="font-size:0.78rem;color:var(--text-mid);">{{ r.published_on | date:'dd MMM yyyy' }}</td>
                  <td><span class="r-badge {{ r.approval_status === 'Approved' ? 'badge-approved' : 'badge-pending' }}">{{ r.approval_status }}</span></td>
                  <td style="text-align:right;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === r.id">
                        <a class="ctx-item" (click)="view(r)"><i class="fas fa-eye"></i> Read</a>
                        @if (r.approval_status !== 'Approved') { <a class="ctx-item success" (click)="approve(r)"><i class="fas fa-check-double"></i> Approve & publish</a> }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:2.5rem;">No knowledge entries yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-book me-2"></i>Add Knowledge Entry</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div style="grid-column:1/3;"><label class="f-lbl">Title *</label><input class="form-control" [(ngModel)]="m.title"></div>
            <div><label class="f-lbl">Type</label><select class="form-select" [(ngModel)]="m.content_type">@for (t of types(); track t) { <option [value]="t">{{ t }}</option> }</select></div>
            <div><label class="f-lbl">Hazard</label><input class="form-control" [(ngModel)]="m.hazard_type" placeholder="Floods / Cyclone…"></div>
            <div><label class="f-lbl">Region</label><input class="form-control" [(ngModel)]="m.region"></div>
            <div><label class="f-lbl">Contributor org</label><input class="form-control" [(ngModel)]="m.organization"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Summary / lesson *</label><textarea class="form-control" rows="4" [(ngModel)]="m.description"></textarea></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.title || !m.description || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Submit
            </button>
          </div>
        </div>
      </div>
    }

    @if (detail(); as r) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.6rem;gap:1rem;">
            <h5 style="font-weight:800;margin:0;">{{ r.title }}</h5>
            <span class="r-badge" [style.background]="color(r.content_type) + '1a'" [style.color]="color(r.content_type)">{{ r.content_type }}</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-mid);margin-bottom:0.6rem;">
            {{ r.hazard_type }} · {{ r.region }} · {{ r.organization || r.contributor }} · {{ r.published_on | date:'dd MMM yyyy' }}</div>
          <p style="font-size:0.88rem;line-height:1.55;">{{ r.description }}</p>
          <div style="text-align:right;margin-top:1rem;"><button class="btn-cancel" (click)="detail.set(null)">Close</button></div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); display: block; margin-bottom: 3px; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1500; display: flex; align-items: flex-start; justify-content: center; padding: 3vh 1rem; overflow-y: auto; }
    .modal-card { background: #fff; border-radius: 16px; max-width: 680px; width: 100%; padding: 1.4rem 1.5rem; }
    .btn-cancel { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 0.5rem 1rem; cursor: pointer; }
    .r-subtitle { font-size: 0.74rem; color: var(--text-light); }
  `],
})
export class KnowledgeRepositoryComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/recovery/knowledge';

  data = signal<any | null>(null);
  formOpen = signal(false);
  detail = signal<Row | null>(null);
  saving = signal(false);
  openMenu = signal<number | null>(null);
  fType = ''; fApproval = ''; fSearch = '';
  m: any = {};

  s = computed<Record<string, number>>(() => this.data()?.stats ?? {});
  rows = computed<Row[]>(() => this.data()?.entries ?? []);
  types = computed<string[]>(() => this.data()?.types ?? []);

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fType) { q.set('type', this.fType); }
    if (this.fApproval) { q.set('approval', this.fApproval); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(d => this.data.set(d));
  }

  color(t: string): string { return TYPE_COLOR[t] ?? '#64748b'; }
  view(r: Row): void { this.detail.set(r); }
  openForm(): void { this.m = { content_type: 'Lesson Learned' }; this.formOpen.set(true); }

  save(): void {
    this.saving.set(true);
    this.http.post<any>(this.base, this.m).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); alert(e?.error?.detail ?? 'Could not submit entry.'); },
    });
  }

  approve(r: Row): void { this.http.post(`${this.base}/${r.id}/approve`, {}).subscribe({ next: () => this.reload() }); }

  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
