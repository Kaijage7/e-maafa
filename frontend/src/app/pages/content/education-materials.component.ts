import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Material {
  id: number; hazard: string; audience: string; materialType: string; title: string;
  body: string; videoUrl: string | null; filePath: string | null; sortOrder: number; isActive: boolean;
}

const AUDIENCES = [
  { key: 'children', label: 'Children' },
  { key: 'adults', label: 'Adults' },
  { key: 'disabilities', label: 'Persons with Disabilities' },
  { key: 'all', label: 'All audiences' },
];
const TYPES = [
  { key: 'action_guide', label: 'Action guide (statements)' },
  { key: 'video', label: 'Video' },
  { key: 'document', label: 'Document' },
  { key: 'poster', label: 'Poster' },
];

/**
 * Content Management → Public Awareness — the hazard education repository manager.
 * Every material here appears on the public hazard hubs (/education/hazard/{name}),
 * grouped by audience: Children / Adults / Persons with Disabilities. Action guides
 * carry one action statement per line; videos take a URL; documents/posters upload
 * to shared public storage.
 */
@Component({
  selector: 'page-education-materials',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Public Awareness — Hazard Education Materials" icon="fa-bullhorn"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Public Awareness'}]">
      <button class="btn-add" type="button" (click)="openCreate()"><i class="fas fa-plus"></i> New Material</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="items().length" label="Total Materials" icon="fa-list" color="#e83e8c" />
      <dmis-stat-card [value]="countBy('children')" label="For Children" icon="fa-child" color="#3b82f6" />
      <dmis-stat-card [value]="countBy('adults')" label="For Adults" icon="fa-users" color="#10b981" />
      <dmis-stat-card [value]="countBy('disabilities')" label="For Pers. w/ Disabilities" icon="fa-wheelchair" color="#a855f7" />
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search materials..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="hazardF()" (change)="hazardF.set($any($event.target).value)">
        <option value="">All Hazards</option>
        @for (hz of hazards(); track hz) { <option [value]="hz">{{ hz }}</option> }
      </select>
      <select [value]="audienceF()" (change)="audienceF.set($any($event.target).value)">
        <option value="">All Audiences</option>
        @for (a of audiences; track a.key) { <option [value]="a.key">{{ a.label }}</option> }
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Hazard Repositories" icon="fa-database" [badge]="items().length + ' materials'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Hazard</th><th>Audience</th><th>Type</th><th>Title</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (m of filtered(); track m.id) {
                    <tr class="data-row">
                      <td><span class="r-badge" style="background:rgba(0,51,102,0.08);color:#003366;">{{ m.hazard }}</span></td>
                      <td style="font-size:0.8rem;color:var(--text-mid);">{{ audienceLabel(m.audience) }}</td>
                      <td style="font-size:0.8rem;color:var(--text-mid);">{{ typeLabel(m.materialType) }}</td>
                      <td><div class="r-title">{{ m.title }}</div></td>
                      <td><span class="r-badge {{ m.isActive ? 'badge-approved' : 'badge-rejected' }}">{{ m.isActive ? 'Live' : 'Hidden' }}</span></td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(m.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === m.id">
                            <a class="ctx-item success" (click)="openEdit(m)"><i class="fas fa-edit"></i> Edit</a>
                            <a class="ctx-item" (click)="toggleActive(m)"><i class="fas" [class.fa-eye-slash]="m.isActive" [class.fa-eye]="!m.isActive"></i> {{ m.isActive ? 'Hide' : 'Show' }}</a>
                            <a class="ctx-item" style="color:#dc2626;" (click)="remove(m)"><i class="fas fa-trash"></i> Delete</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <div class="empty-state"><i class="fas fa-bullhorn"></i>No materials yet.</div> }
        </div>
      </dmis-panel>
    </div>

    <!-- Editor -->
    @if (editorOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="editorOpen.set(false)">
        <div style="background:#fff;border-radius:16px;max-width:680px;width:100%;padding:1.3rem 1.4rem;max-height:92vh;overflow-y:auto;" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin-bottom:1rem;">{{ editId() ? 'Edit Material' : 'New Material' }}</h5>
          <div style="display:grid;gap:0.75rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
              <select class="form-control" [value]="fHazard()" (change)="fHazard.set($any($event.target).value)">
                <option value="">Hazard *</option>
                @for (hz of hazards(); track hz) { <option [value]="hz">{{ hz }}</option> }
              </select>
              <select class="form-control" [value]="fAudience()" (change)="fAudience.set($any($event.target).value)">
                @for (a of audiences; track a.key) { <option [value]="a.key">{{ a.label }}</option> }
              </select>
              <select class="form-control" [value]="fType()" (change)="fType.set($any($event.target).value)">
                @for (t of types; track t.key) { <option [value]="t.key">{{ t.label }}</option> }
              </select>
            </div>
            <input class="form-control" placeholder="Title *" [value]="fTitle()" (input)="fTitle.set($any($event.target).value)">

            @if (fType() === 'action_guide') {
              <select class="form-control" [value]="fPhase()" (change)="fPhase.set($any($event.target).value)">
                <option value="before">Prepare BEFORE (Jiandae KABLA)</option>
                <option value="during">Stay Safe DURING (Wakati)</option>
                <option value="after">Recover AFTER (Baada)</option>
              </select>
              <textarea class="form-control" rows="7" placeholder="Action statements — ONE PER LINE; each renders as a checklist item on the public hub" [value]="fBody()" (input)="fBody.set($any($event.target).value)"></textarea>
            } @else if (fType() === 'video') {
              <input class="form-control" placeholder="Video URL (YouTube links embed automatically)" [value]="fVideo()" (input)="fVideo.set($any($event.target).value)">
              <textarea class="form-control" rows="2" placeholder="Short description (optional)" [value]="fBody()" (input)="fBody.set($any($event.target).value)"></textarea>
            } @else {
              <textarea class="form-control" rows="3" placeholder="Description" [value]="fBody()" (input)="fBody.set($any($event.target).value)"></textarea>
              <div style="display:flex;gap:0.5rem;align-items:center;">
                <input class="form-control" style="flex:1;" placeholder="File path or upload →" [value]="fFile()" (input)="fFile.set($any($event.target).value)">
                <label class="btn-add" style="cursor:pointer;margin:0;white-space:nowrap;">
                  <i class="fas" [class.fa-upload]="!uploading()" [class.fa-spinner]="uploading()" [class.fa-spin]="uploading()"></i>
                  <input type="file" accept="image/*,.pdf" hidden (change)="uploadFile($any($event.target).files)">
                </label>
              </div>
            }

            @if (error()) { <div style="color:#dc2626;font-size:0.82rem;">{{ error() }}</div> }
            <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
              <button type="button" style="border:1px solid var(--border);background:#fff;border-radius:9px;padding:0.5rem 1rem;cursor:pointer;" (click)="editorOpen.set(false)">Cancel</button>
              <button class="btn-add" type="button" [disabled]="!fHazard() || !fTitle().trim() || saving()" (click)="save()">
                <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class EducationMaterialsComponent {
  private http = inject(HttpClient);

  audiences = AUDIENCES;
  types = TYPES;
  items = signal<Material[]>([]);
  search = signal(''); hazardF = signal(''); audienceF = signal('');
  openMenu = signal<number | null>(null);
  editorOpen = signal(false);
  editId = signal<number | null>(null);
  fHazard = signal(''); fAudience = signal('adults'); fType = signal('action_guide');
  fTitle = signal(''); fBody = signal(''); fVideo = signal(''); fFile = signal('');
  fPhase = signal('before');
  saving = signal(false); uploading = signal(false); error = signal('');

  /** All managed hazards (from the hazard cards) — so new repositories can be started. */
  hazards = signal<string[]>([]);

  constructor() {
    this.reload();
    this.http.get<{ items: { name: string }[] }>('/api/v1/content/sections/hazard-cards')
      .subscribe(r => this.hazards.set(r.items.map(i => i.name).sort()));
  }

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const hz = this.hazardF();
    const au = this.audienceF();
    return this.items().filter(m => (!q || (m.title + ' ' + m.hazard).toLowerCase().includes(q))
      && (!hz || m.hazard === hz) && (!au || m.audience === au));
  });

  countBy(audience: string): number {
    return this.items().filter(m => m.audience === audience || m.audience === 'all').length;
  }

  audienceLabel(key: string): string { return AUDIENCES.find(a => a.key === key)?.label ?? key; }
  typeLabel(key: string): string { return TYPES.find(t => t.key === key)?.label ?? key; }

  reload(): void {
    this.http.get<{ items: Material[] }>('/api/v1/content/education-materials')
      .subscribe(r => this.items.set(r.items));
  }

  openCreate(): void {
    this.editId.set(null);
    this.fHazard.set(''); this.fAudience.set('adults'); this.fType.set('action_guide');
    this.fTitle.set(''); this.fBody.set(''); this.fVideo.set(''); this.fFile.set('');
    this.fPhase.set('before');
    this.error.set('');
    this.editorOpen.set(true);
  }

  openEdit(m: Material): void {
    this.editId.set(m.id);
    this.fHazard.set(m.hazard); this.fAudience.set(m.audience); this.fType.set(m.materialType);
    this.fTitle.set(m.title); this.fBody.set(m.body ?? ''); this.fVideo.set(m.videoUrl ?? '');
    this.fPhase.set((m as any).phase ?? 'before');
    this.fFile.set(m.filePath ?? '');
    this.error.set('');
    this.editorOpen.set(true);
  }

  uploadFile(files: FileList | null): void {
    const file = files?.[0];
    if (!file) { return; }
    this.uploading.set(true);
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'materials');
    this.http.post<{ path: string }>('/api/v1/content/upload', form).subscribe({
      next: r => { this.uploading.set(false); this.fFile.set(r.path); },
      error: e => { this.uploading.set(false); this.error.set(e?.error?.message || 'Upload failed.'); },
    });
  }

  save(): void {
    this.saving.set(true);
    const payload = {
      hazard: this.fHazard(), audience: this.fAudience(), materialType: this.fType(),
      title: this.fTitle().trim(), body: this.fBody() || null,
      videoUrl: this.fVideo() || null, filePath: this.fFile() || null, phase: this.fPhase(),
    };
    const req = this.editId()
      ? this.http.put(`/api/v1/content/education-materials/${this.editId()}`, payload)
      : this.http.post('/api/v1/content/education-materials', payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.editorOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not save.'); },
    });
  }

  toggleActive(m: Material): void {
    this.http.put(`/api/v1/content/education-materials/${m.id}`,
      { hazard: m.hazard, audience: m.audience, materialType: m.materialType, title: m.title,
        body: m.body, videoUrl: m.videoUrl, filePath: m.filePath, isActive: !m.isActive, phase: (m as any).phase ?? 'any' })
      .subscribe(() => this.reload());
  }

  remove(m: Material): void {
    if (!confirm(`Delete "${m.title}"?`)) { return; }
    this.http.delete(`/api/v1/content/education-materials/${m.id}`).subscribe(() => this.reload());
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
