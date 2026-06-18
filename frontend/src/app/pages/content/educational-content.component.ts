import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface EduItem {
  id: number; title: string; contentType: string; summary: string; author: string;
  targetAudience: string; isPublished: boolean; publicationDate: string | null;
}

/**
 * Content Management → Educational Content — admin CRUD over educational_contents.
 * Published items appear on the PUBLIC education portal (/education).
 */
@Component({
  selector: 'page-educational-content',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Educational Content" icon="fa-graduation-cap"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Educational Content'}]">
      <button class="btn-add" type="button" (click)="openCreate()"><i class="fas fa-plus"></i> New Content</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Items" icon="fa-list" color="#e83e8c" />
      <dmis-stat-card [value]="stats().published" label="Published" icon="fa-check-circle" color="#10b981" />
      <dmis-stat-card [value]="stats().drafts" label="Drafts" icon="fa-pen" color="#f59e0b" />
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search content..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="typeF()" (change)="typeF.set($any($event.target).value)">
        <option value="">All Types</option>
        @for (t of types(); track t) { <option [value]="t">{{ t }}</option> }
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Content Library" icon="fa-database" [badge]="items().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Title</th><th>Type</th><th>Audience</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (it of filtered(); track it.id) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ it.title }}</div><div class="r-subtitle">{{ it.author }}</div></td>
                      <td><span class="r-badge" style="background:rgba(0,51,102,0.08);color:#003366;">{{ it.contentType }}</span></td>
                      <td style="font-size:0.8rem;color:var(--text-mid);">{{ it.targetAudience || '-' }}</td>
                      <td style="font-size:0.8rem;color:var(--text-mid);">{{ it.publicationDate || '-' }}</td>
                      <td><span class="r-badge {{ it.isPublished ? 'badge-approved' : 'badge-pending' }}">{{ it.isPublished ? 'Published' : 'Draft' }}</span></td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(it.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === it.id">
                            <a class="ctx-item success" (click)="openEdit(it)"><i class="fas fa-edit"></i> Edit</a>
                            <a class="ctx-item" (click)="togglePublish(it)"><i class="fas" [class.fa-eye-slash]="it.isPublished" [class.fa-eye]="!it.isPublished"></i> {{ it.isPublished ? 'Unpublish' : 'Publish' }}</a>
                            <a class="ctx-item" style="color:#dc2626;" (click)="remove(it)"><i class="fas fa-trash"></i> Delete</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <div class="empty-state"><i class="fas fa-graduation-cap"></i>No educational content yet.</div> }
        </div>
      </dmis-panel>
    </div>

    @if (editorOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="editorOpen.set(false)">
        <div style="background:#fff;border-radius:16px;max-width:680px;width:100%;padding:1.3rem 1.4rem;max-height:90vh;overflow-y:auto;" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin-bottom:1rem;">{{ editId() ? 'Edit Content' : 'New Content' }}</h5>
          <div style="display:grid;gap:0.75rem;">
            <input class="form-control" placeholder="Title *" [value]="fTitle()" (input)="fTitle.set($any($event.target).value)">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
              <select class="form-control" [value]="fType()" (change)="fType.set($any($event.target).value)">
                <option>Guideline</option><option>Bulletin</option><option>Article</option><option>Poster</option>
              </select>
              <input class="form-control" placeholder="Author" [value]="fAuthor()" (input)="fAuthor.set($any($event.target).value)">
              <input class="form-control" placeholder="Audience (e.g. Community)" [value]="fAudience()" (input)="fAudience.set($any($event.target).value)">
            </div>
            <textarea class="form-control" rows="2" placeholder="Summary" [value]="fSummary()" (input)="fSummary.set($any($event.target).value)"></textarea>
            <textarea class="form-control" rows="7" placeholder="Full content" [value]="fBody()" (input)="fBody.set($any($event.target).value)"></textarea>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;align-items:center;">
              <input type="date" class="form-control" [value]="fDate()" (input)="fDate.set($any($event.target).value)">
              <label style="display:flex;gap:0.5rem;align-items:center;font-size:0.85rem;color:var(--text-mid);">
                <input type="checkbox" [checked]="fPublished()" (change)="fPublished.set($any($event.target).checked)"> Published (visible on the public portal)
              </label>
            </div>
            @if (error()) { <div style="color:#dc2626;font-size:0.82rem;">{{ error() }}</div> }
            <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
              <button type="button" style="border:1px solid var(--border);background:#fff;border-radius:9px;padding:0.5rem 1rem;cursor:pointer;" (click)="editorOpen.set(false)">Cancel</button>
              <button class="btn-add" type="button" [disabled]="!fTitle().trim() || saving()" (click)="save()">
                <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class EducationalContentComponent {
  private http = inject(HttpClient);
  items = signal<EduItem[]>([]);
  stats = signal({ total: 0, published: 0, drafts: 0 });
  search = signal(''); typeF = signal('');
  openMenu = signal<number | null>(null);
  editorOpen = signal(false);
  editId = signal<number | null>(null);
  fTitle = signal(''); fType = signal('Guideline'); fAuthor = signal(''); fAudience = signal('');
  fSummary = signal(''); fBody = signal(''); fDate = signal(''); fPublished = signal(false);
  saving = signal(false); error = signal('');

  constructor() { this.reload(); }

  types = computed(() => [...new Set(this.items().map(i => i.contentType).filter(Boolean))]);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const t = this.typeF();
    return this.items().filter(i => (!q || (i.title + ' ' + (i.author ?? '')).toLowerCase().includes(q))
      && (!t || i.contentType === t));
  });

  reload(): void {
    this.http.get<{ items: EduItem[]; stats: any }>('/api/v1/content/education')
      .subscribe(r => { this.items.set(r.items); this.stats.set(r.stats); });
  }

  openCreate(): void {
    this.editId.set(null);
    this.fTitle.set(''); this.fType.set('Guideline'); this.fAuthor.set(''); this.fAudience.set('');
    this.fSummary.set(''); this.fBody.set(''); this.fDate.set(''); this.fPublished.set(false);
    this.error.set('');
    this.editorOpen.set(true);
  }

  openEdit(it: EduItem): void {
    this.editId.set(it.id);
    this.fTitle.set(it.title); this.fType.set(it.contentType); this.fAuthor.set(it.author ?? '');
    this.fAudience.set(it.targetAudience ?? ''); this.fSummary.set(it.summary ?? '');
    this.fBody.set(''); this.fDate.set(''); this.fPublished.set(it.isPublished);
    this.error.set('');
    this.editorOpen.set(true);
  }

  save(): void {
    this.saving.set(true);
    const payload = { title: this.fTitle().trim(), contentType: this.fType(), author: this.fAuthor() || null,
      targetAudience: this.fAudience() || null, summary: this.fSummary() || null,
      fullContent: this.fBody() || null, publicationDate: this.fDate() || null, isPublished: this.fPublished() };
    const req = this.editId()
      ? this.http.put(`/api/v1/content/education/${this.editId()}`, payload)
      : this.http.post('/api/v1/content/education', payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.editorOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not save.'); },
    });
  }

  togglePublish(it: EduItem): void {
    this.http.put(`/api/v1/content/education/${it.id}`,
      { title: it.title, contentType: it.contentType, author: it.author, targetAudience: it.targetAudience,
        summary: it.summary, isPublished: !it.isPublished }).subscribe(() => this.reload());
  }

  remove(it: EduItem): void {
    if (!confirm(`Delete "${it.title}"?`)) { return; }
    this.http.delete(`/api/v1/content/education/${it.id}`).subscribe(() => this.reload());
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
