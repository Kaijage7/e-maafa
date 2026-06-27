import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface NewsItem {
  id: number; title: string; slug: string; excerpt: string; body?: string; image: string;
  category: string; isActive: boolean; publishedAt: string | null;
  title_sw?: string | null; excerpt_sw?: string | null; body_sw?: string | null;
}

/**
 * Content Management → News & Events — admin CRUD for portal_news
 * (what the PUBLIC landing's News section and /news/{slug} pages show).
 * List + stats reproduce admin/portal_news/index; the editor drawer covers
 * create-v2/edit (title, category, excerpt, body, image path, active toggle).
 */
@Component({
  selector: 'page-portal-news',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="News & Events" icon="fa-newspaper"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'News & Events'}]">
      <button class="btn-add" type="button" (click)="openCreate()"><i class="fas fa-plus"></i> New Article</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Items" icon="fa-newspaper" color="#e83e8c" />
      <dmis-stat-card [value]="stats().news" label="News" icon="fa-rss" color="#3b82f6" />
      <dmis-stat-card [value]="stats().events" label="Events" icon="fa-calendar-alt" color="#f59e0b" />
      <dmis-stat-card [value]="stats().published" label="Published" icon="fa-check-circle" color="#10b981" />
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search articles..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="category()" (change)="category.set($any($event.target).value)">
        <option value="">All Categories</option><option value="news">News</option><option value="event">Event</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Articles" icon="fa-database" [badge]="items().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Title</th><th>Category</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (it of filtered(); track it.id) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ it.title }}</div><div class="r-subtitle">/news/{{ it.slug }}</div></td>
                      <td><span class="r-badge" [style.background]="it.category === 'event' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)'"
                            [style.color]="it.category === 'event' ? '#d97706' : '#2563eb'">{{ it.category }}</span></td>
                      <td style="font-size:0.8rem;color:var(--text-mid);">{{ it.publishedAt || '-' }}</td>
                      <td><span class="r-badge {{ it.isActive ? 'badge-approved' : 'badge-rejected' }}">{{ it.isActive ? 'Published' : 'Hidden' }}</span></td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(it.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === it.id">
                            <a class="ctx-item success" (click)="openEdit(it)"><i class="fas fa-edit"></i> Edit</a>
                            <a class="ctx-item" (click)="toggleActive(it)"><i class="fas" [class.fa-eye-slash]="it.isActive" [class.fa-eye]="!it.isActive"></i> {{ it.isActive ? 'Hide' : 'Publish' }}</a>
                            <a class="ctx-item" style="color:#dc2626;" (click)="remove(it)"><i class="fas fa-trash"></i> Delete</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <div class="empty-state"><i class="fas fa-newspaper"></i>No articles yet.</div> }
        </div>
      </dmis-panel>
    </div>

    <!-- Editor drawer (create + edit share it) -->
    @if (editorOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="editorOpen.set(false)">
        <div style="background:#fff;border-radius:16px;max-width:640px;width:100%;padding:1.3rem 1.4rem;max-height:90vh;overflow-y:auto;" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin-bottom:1rem;">{{ editId() ? 'Edit Article' : 'New Article' }}</h5>
          <div style="display:grid;gap:0.75rem;">
            <input class="form-control" placeholder="Title *" [value]="fTitle()" (input)="fTitle.set($any($event.target).value)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
              <select class="form-control" [value]="fCategory()" (change)="fCategory.set($any($event.target).value)">
                <option value="news">News</option><option value="event">Event</option>
              </select>
              <div style="display:flex;gap:0.5rem;align-items:center;">
                <input class="form-control" style="flex:1;" placeholder="Image path or upload →" [value]="fImage()" (input)="fImage.set($any($event.target).value)">
                <label class="btn-add" style="cursor:pointer;margin:0;white-space:nowrap;">
                  <i class="fas" [class.fa-upload]="!uploading()" [class.fa-spinner]="uploading()" [class.fa-spin]="uploading()"></i>
                  <input type="file" accept="image/*" hidden (change)="uploadImage($any($event.target).files)">
                </label>
              </div>
            </div>
            <textarea class="form-control" rows="2" placeholder="Excerpt (short summary, shown on cards)" [value]="fExcerpt()" (input)="fExcerpt.set($any($event.target).value)"></textarea>
            <textarea class="form-control" rows="6" placeholder="Body" [value]="fBody()" (input)="fBody.set($any($event.target).value)"></textarea>

            <!-- Optional Swahili translation: the public portal shows it for Swahili visitors, else falls back to English -->
            <div style="border:1px solid var(--border);border-radius:10px;padding:0.85rem 0.9rem;display:grid;gap:0.75rem;background:#fafafa;">
              <div style="font-weight:700;font-size:0.85rem;color:var(--text-mid);display:flex;align-items:center;gap:0.4rem;">
                <i class="fas fa-language"></i> Kiswahili (Swahili) <span style="font-weight:500;font-size:0.75rem;opacity:0.7;">— optional, falls back to English</span>
              </div>
              <input class="form-control" placeholder="Kichwa cha habari (Title)" [value]="fTitleSw()" (input)="fTitleSw.set($any($event.target).value)">
              <textarea class="form-control" rows="2" placeholder="Muhtasari (Excerpt)" [value]="fExcerptSw()" (input)="fExcerptSw.set($any($event.target).value)"></textarea>
              <textarea class="form-control" rows="6" placeholder="Maudhui (Body)" [value]="fBodySw()" (input)="fBodySw.set($any($event.target).value)"></textarea>
            </div>

            <label style="display:flex;gap:0.5rem;align-items:center;font-size:0.85rem;color:var(--text-mid);">
              <input type="checkbox" [checked]="fActive()" (change)="fActive.set($any($event.target).checked)"> Published (visible on the public portal)
            </label>
            @if (error()) { <div style="color:#dc2626;font-size:0.82rem;">{{ error() }}</div> }
            <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
              <button class="btn-ghost" type="button" style="border:1px solid var(--border);background:#fff;border-radius:9px;padding:0.5rem 1rem;cursor:pointer;" (click)="editorOpen.set(false)">Cancel</button>
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
export class PortalNewsComponent {
  private http = inject(HttpClient);

  items = signal<NewsItem[]>([]);
  stats = signal({ total: 0, news: 0, events: 0, published: 0 });
  search = signal('');
  category = signal('');
  openMenu = signal<number | null>(null);

  // Editor state (shared by create + edit)
  editorOpen = signal(false);
  editId = signal<number | null>(null);
  fTitle = signal(''); fCategory = signal('news'); fImage = signal('');
  fExcerpt = signal(''); fBody = signal(''); fActive = signal(true);
  // Optional Swahili authoring (public portal falls back to English when empty)
  fTitleSw = signal(''); fExcerptSw = signal(''); fBodySw = signal('');
  saving = signal(false);
  uploading = signal(false);
  error = signal('');

  constructor() { this.reload(); }

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const c = this.category();
    return this.items().filter(i => (!q || (i.title + ' ' + i.slug).toLowerCase().includes(q))
      && (!c || i.category === c));
  });

  reload(): void {
    this.http.get<{ items: NewsItem[]; stats: any }>('/api/v1/content/news').subscribe(r => {
      this.items.set(r.items);
      this.stats.set(r.stats);
    });
  }

  openCreate(): void {
    this.editId.set(null);
    this.fTitle.set(''); this.fCategory.set('news'); this.fImage.set('');
    this.fExcerpt.set(''); this.fBody.set(''); this.fActive.set(true);
    this.fTitleSw.set(''); this.fExcerptSw.set(''); this.fBodySw.set('');
    this.error.set('');
    this.editorOpen.set(true);
  }

  openEdit(it: NewsItem): void {
    this.editId.set(it.id);
    this.fTitle.set(it.title); this.fCategory.set(it.category); this.fImage.set(it.image ?? '');
    this.fExcerpt.set(it.excerpt ?? ''); this.fBody.set(it.body ?? ''); this.fActive.set(it.isActive);
    this.fTitleSw.set(it.title_sw ?? ''); this.fExcerptSw.set(it.excerpt_sw ?? ''); this.fBodySw.set(it.body_sw ?? '');
    this.error.set('');
    this.editorOpen.set(true);
  }

  /** Uploads the picked image to shared public storage and fills the path field (D3). */
  uploadImage(files: FileList | null): void {
    const file = files?.[0];
    if (!file) { return; }
    this.uploading.set(true);
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'news');
    this.http.post<{ path: string }>('/api/v1/content/upload', form).subscribe({
      next: r => { this.uploading.set(false); this.fImage.set(r.path); },
      error: e => { this.uploading.set(false); this.error.set(e?.error?.message || 'Upload failed.'); },
    });
  }

  save(): void {
    this.saving.set(true);
    const payload = { title: this.fTitle().trim(), category: this.fCategory(), image: this.fImage() || null,
      excerpt: this.fExcerpt() || null, body: this.fBody() || null, isActive: this.fActive(),
      title_sw: this.fTitleSw().trim() || null, excerpt_sw: this.fExcerptSw().trim() || null, body_sw: this.fBodySw().trim() || null };
    const req = this.editId()
      ? this.http.put(`/api/v1/content/news/${this.editId()}`, payload)
      : this.http.post('/api/v1/content/news', payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.editorOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not save.'); },
    });
  }

  toggleActive(it: NewsItem): void {
    this.http.put(`/api/v1/content/news/${it.id}`,
      { title: it.title, category: it.category, image: it.image, excerpt: it.excerpt, body: it.body,
        title_sw: it.title_sw, excerpt_sw: it.excerpt_sw, body_sw: it.body_sw, isActive: !it.isActive })
      .subscribe(() => this.reload());
  }

  remove(it: NewsItem): void {
    if (!confirm(`Delete "${it.title}"?`)) { return; }
    this.http.delete(`/api/v1/content/news/${it.id}`).subscribe(() => this.reload());
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
