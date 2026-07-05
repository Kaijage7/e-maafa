import { HttpClient } from '@angular/common/http';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

interface Level {
  id: number; level: number; name: string; roleRequired: string; order: number;
  isActive: boolean; canSkip: boolean; description: string | null;
}
interface Module {
  id: number; moduleCode: string; moduleName: string; modelClass: string | null;
  isActive: boolean; description: string | null; levels: Level[];
}
interface AutoTier {
  stage: string; label: string; role: string; scope: string; mode: string; officers: number;
}

/**
 * System Settings → Approval Workflows. The admin surface for the V24 generalized approval engine:
 * each module owns an ordered role-chain; editing it here changes who approves what across the
 * platform (the engine reads this configuration when it initializes a record's approval steps).
 */
@Component({
  selector: 'page-approval-workflows',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent],
  template: `
    <dmis-page-header title="Approval Workflows" icon="fa-sitemap"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'Approval Workflows'}]">
    </dmis-page-header>

    <p style="color:var(--text-mid);font-size:0.86rem;margin:0 0 1rem;">
      Each approval module below is wired into the platform's approval engine; configure its ordered
      chain of approval levels here. Reorder with the arrows; a level can require any role, be marked
      skippable, or be deactivated. Changes take effect on the next request the engine initialises.
    </p>

    <!-- Incident approval automation — the report→resolution ladder read by the incident engine -->
    <div class="panel-row">
      <dmis-panel title="Incident Approval Automation" icon="fa-robot" badge="Report → resolution chain">
        <div class="panel-body">
          <p style="font-size:0.86rem;color:var(--text-mid);margin:0 0 0.8rem;">
            How each tier of the incident chain behaves. <b>Manual</b> — an officer of that role &amp; area must approve.
            <b>Auto-advance</b> — the system approves it automatically. <b>Skip if unstaffed</b> — advance automatically
            only when no officer of that role serves the incident's own area, so a report never stalls in a district or
            region that has no coordinator for that tier.
          </p>
          <div style="display:grid;gap:0.5rem;">
            @for (t of tiers(); track t.stage) {
              <div class="autolvl">
                <div class="ord" [style.background]="t.scope==='National' ? '#7c3aed' : t.scope==='Region' ? '#0d6efd' : '#059669'">
                  <i class="fas fa-flag-checkered" style="font-size:0.68rem;"></i>
                </div>
                <div style="min-width:0;">
                  <div style="font-weight:700;font-size:0.9rem;">{{ t.label }}</div>
                  <div style="font-size:0.78rem;color:var(--text-light);">{{ t.scope }} · role {{ t.role }} ·
                    <span [style.color]="t.officers ? '#059669' : '#dc2626'">{{ t.officers }} officer{{ t.officers === 1 ? '' : 's' }} seeded</span>
                  </div>
                </div>
                <select class="form-select" [ngModel]="t.mode" (ngModelChange)="setMode(t, $event)">
                  <option value="manual">Manual approval</option>
                  <option value="auto">Auto-advance</option>
                  <option value="skip_if_unstaffed">Skip if unstaffed</option>
                </select>
              </div>
            } @empty { <div style="color:var(--text-light);font-size:0.85rem;padding:0.5rem 0;">Loading tiers…</div> }
          </div>
          @if (autoSaved()) { <div style="font-size:0.82rem;color:#059669;margin-top:0.7rem;"><i class="fas fa-check"></i> Saved — takes effect on the next incident action.</div> }
        </div>
      </dmis-panel>
    </div>

    @for (m of modules(); track m.id) {
      <div class="panel-row">
        <dmis-panel [title]="m.moduleName" icon="fa-diagram-project"
                    [badge]="m.levels.length + ' levels'">
          <div class="panel-body">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:0.8rem;">
              <div style="font-size:0.8rem;color:var(--text-light);">
                <code style="color:var(--text-mid);">{{ m.moduleCode }}</code>
                @if (m.modelClass) { · <span title="bound model">{{ m.modelClass }}</span> }
                @if (m.description) { · {{ m.description }} }
              </div>
              <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;">
                <input type="checkbox" [checked]="m.isActive" (change)="toggleModule(m)">
                <span [style.color]="m.isActive ? '#059669' : '#94a3b8'">{{ m.isActive ? 'Active' : 'Inactive' }}</span>
              </label>
            </div>

            <!-- the chain -->
            <div style="display:grid;gap:0.5rem;">
              @for (l of m.levels; track l.id; let i = $index) {
                <div class="lvl" [class.off]="!l.isActive">
                  <div class="ord">{{ i + 1 }}</div>
                  <input class="form-control nm" [ngModel]="l.name" (change)="saveLevel(l, { name: $any($event.target).value })">
                  <select class="form-select rl" [ngModel]="l.roleRequired" (ngModelChange)="saveLevel(l, { roleRequired: $event })">
                    @for (r of roles(); track r) { <option [value]="r">{{ r }}</option> }
                  </select>
                  <label class="chk" title="Can be skipped under conditions">
                    <input type="checkbox" [checked]="l.canSkip" (change)="saveLevel(l, { canSkip: $any($event.target).checked })"> skippable
                  </label>
                  <label class="chk" title="Level is active in the chain">
                    <input type="checkbox" [checked]="l.isActive" (change)="saveLevel(l, { isActive: $any($event.target).checked })"> active
                  </label>
                  <div class="ctl ctx-wrap">
                    <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + l.name" (click)="toggleMenu(l.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="ctx-menu" [class.open]="openMenu() === l.id">
                      @if (i > 0) { <a class="ctx-item" (click)="move(l, 'up')"><i class="fas fa-arrow-up"></i> Move up</a> }
                      @if (i < m.levels.length - 1) { <a class="ctx-item" (click)="move(l, 'down')"><i class="fas fa-arrow-down"></i> Move down</a> }
                      <a class="ctx-item danger" (click)="removeLevel(m, l)"><i class="fas fa-trash"></i> Remove level</a>
                    </div>
                  </div>
                </div>
              } @empty { <div style="color:var(--text-light);font-size:0.85rem;padding:0.5rem 0;">No levels yet — add the first approval step below.</div> }
            </div>

            <!-- add level -->
            <div class="addrow">
              <input class="form-control" style="flex:2;" placeholder="New level name (e.g. PMO Review)"
                     [(ngModel)]="newName[m.id]">
              <select class="form-select" style="flex:1;" [(ngModel)]="newRole[m.id]">
                <option value="">Select role…</option>
                @for (r of roles(); track r) { <option [value]="r">{{ r }}</option> }
              </select>
              <button class="btn-add" [disabled]="!newName[m.id]?.trim() || !newRole[m.id]" (click)="addLevel(m)">
                <i class="fas fa-plus"></i> Add level
              </button>
            </div>
          </div>
        </dmis-panel>
      </div>
    } @empty {
      <div class="panel-row"><dmis-panel title="Approval modules" icon="fa-sitemap">
        <div class="panel-body" style="text-align:center;color:var(--text-light);padding:2rem;">No approval modules configured yet.</div>
      </dmis-panel></div>
    }

  `,
  styles: [`
    .lvl { display:grid; grid-template-columns: 34px 2fr 1.3fr auto auto auto; gap:0.6rem; align-items:center;
           border:1px solid var(--border); border-radius:10px; padding:0.5rem 0.7rem; background:var(--card-bg,#fff); }
    .lvl.off { opacity:0.55; }
    .ord { width:30px; height:30px; border-radius:50%; background:#003366; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.82rem; }
    .lvl .nm { font-weight:600; } .lvl select.rl { font-size:0.82rem; }
    .chk { font-size:0.8rem; color:var(--text-mid); display:flex; align-items:center; gap:4px; white-space:nowrap; cursor:pointer; }
    .ctl { display:flex; gap:2px; justify-content:flex-end; }
    /* Anchor the row action menu under its trigger (the global .ctx-menu is position:fixed and detaches). */
    .ctx-menu { position: absolute; top: 100%; right: 0; }
    .addrow { display:flex; gap:0.6rem; align-items:center; margin-top:0.8rem; padding-top:0.8rem; border-top:1px dashed var(--border); }
    .autolvl { display:grid; grid-template-columns: 34px 1fr 210px; gap:0.7rem; align-items:center;
               border:1px solid var(--border); border-radius:10px; padding:0.5rem 0.7rem; background:var(--card-bg,#fff); }
  `],
})
export class ApprovalWorkflowsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/settings/approval-workflows';

  modules = signal<Module[]>([]);
  roles = signal<string[]>([]);
  tiers = signal<AutoTier[]>([]);
  autoSaved = signal(false);
  private autoBase = '/api/v1/response/settings/approval-automation';

  newName: Record<number, string> = {};
  newRole: Record<number, string> = {};

  openMenu = signal<number | null>(null);
  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }

  constructor() { this.reload(); this.loadAutomation(); }

  reload(): void {
    this.http.get<{ modules: Module[]; roles: string[] }>(this.base).subscribe(r => {
      this.modules.set(r.modules);
      this.roles.set(r.roles);
    });
  }

  /** Load the incident ladder-stage automation modes (+ how many officers staff each role). */
  loadAutomation(): void {
    this.http.get<{ tiers: AutoTier[] }>(this.autoBase).subscribe(r => this.tiers.set(r.tiers));
  }

  /** Change one tier's mode and persist immediately. */
  setMode(t: AutoTier, mode: string): void {
    t.mode = mode;
    this.http.post(this.autoBase, { [t.stage]: mode }).subscribe({
      next: () => { this.autoSaved.set(true); setTimeout(() => this.autoSaved.set(false), 1800); },
      error: err => { alert(err?.error?.message ?? 'Could not save the automation setting.'); this.loadAutomation(); },
    });
  }

  toggleModule(m: Module): void {
    this.http.post(`${this.base}/${m.id}/toggle`, {}).subscribe(() => this.reload());
  }

  saveLevel(l: Level, change: Partial<Record<string, any>>): void {
    this.http.put(`${this.base}/levels/${l.id}`, change).subscribe({
      next: () => this.reload(),
      error: err => { alert(err?.error?.message ?? 'Could not save the level.'); this.reload(); },
    });
  }

  move(l: Level, direction: 'up' | 'down'): void {
    this.http.post(`${this.base}/levels/${l.id}/move`, { direction }).subscribe(() => this.reload());
  }

  addLevel(m: Module): void {
    const name = this.newName[m.id]?.trim();
    const roleRequired = this.newRole[m.id];
    if (!name || !roleRequired) { return; }
    this.http.post(`${this.base}/${m.id}/levels`, { name, roleRequired }).subscribe({
      next: () => {
        this.newName[m.id] = ''; this.newRole[m.id] = '';
        this.reload();
      },
      error: err => alert(err?.error?.message ?? err?.error?.detail
        ?? 'Could not add the level. You may not have permission to edit approval workflows.'),
    });
  }

  removeLevel(m: Module, l: Level): void {
    if (!confirm(`Remove the "${l.name}" approval level from ${m.moduleName}?`)) { return; }
    this.http.delete(`${this.base}/levels/${l.id}`).subscribe(() => this.reload());
  }
}
