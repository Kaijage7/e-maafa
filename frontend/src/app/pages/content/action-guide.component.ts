import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { AuthService } from '../../core/auth.service';

/**
 * Content Management → Action Guide Book.
 * Edit impact/action rows (EN/SW) by hazard and colour level used by PMO-DMD statement proposals.
 */
@Component({
  selector: 'page-action-guide',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent],
  styles: [`
    .filters { display:flex; flex-wrap:wrap; gap:10px; align-items:end; margin-bottom:12px; }
    .filters label { display:grid; gap:4px; font-size:0.72rem; font-weight:800; color:#475569; text-transform:uppercase; }
    .filters select, .filters input, .filters textarea { border:1px solid #cbd5e1; border-radius:7px; padding:7px 9px; font:inherit; font-size:0.82rem; min-width:160px; }
    .row-card { border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:10px; background:#fff; }
    .row-card h4 { margin:0 0 8px; font-size:0.86rem; color:#0f172a; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    @media (max-width:900px) { .grid2 { grid-template-columns:1fr; } }
    .grid2 label { display:grid; gap:3px; font-size:0.7rem; font-weight:750; color:#64748b; }
    .grid2 textarea { min-height:70px; resize:vertical; border:1px solid #cbd5e1; border-radius:7px; padding:7px; font:inherit; font-size:0.8rem; }
    .actions { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
    .btn { border:1px solid #cbd5e1; background:#fff; border-radius:7px; padding:7px 12px; font-size:0.78rem; font-weight:800; cursor:pointer; font-family:inherit; }
    .btn.primary { background:#0f766e; border-color:#0f766e; color:#fff; }
    .btn.warn { background:#b45309; border-color:#b45309; color:#fff; }
    .msg { padding:9px 12px; border-radius:8px; font-size:0.82rem; margin-bottom:10px; }
    .msg.ok { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; }
    .msg.err { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
    .meta { font-size:0.75rem; color:#64748b; margin-bottom:10px; }
    .level-pill { display:inline-block; font-size:0.68rem; font-weight:800; border-radius:999px; padding:2px 8px; margin-left:6px; }
  `],
  template: `
    <dmis-page-header title="Action Guide Book" icon="fa-book-open"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Action Guide'}]">
      @if (canManage()) {
        <button class="btn warn" type="button" (click)="seed(false)" [disabled]="busy()">Reload from package (if empty)</button>
        <button class="btn" type="button" (click)="seed(true)" [disabled]="busy()" title="Replace all editable rows from packaged guide">Force reseed</button>
      }
    </dmis-page-header>

    @if (message()) { <div class="msg" [class.ok]="!msgErr()" [class.err]="msgErr()">{{ message() }}</div> }

    <dmis-panel title="Common committee statement" icon="fa-landmark">
      <div class="panel-body" style="padding:12px">
        <p class="meta">Prefixed on operational directives. Used for all hazards.</p>
        <div class="grid2">
          <label>English
            <textarea [(ngModel)]="commonEn" [disabled]="!canManage()"></textarea>
          </label>
          <label>Kiswahili
            <textarea [(ngModel)]="commonSw" [disabled]="!canManage()"></textarea>
          </label>
        </div>
        @if (canManage()) {
          <div class="actions">
            <button class="btn primary" type="button" (click)="saveCommon()" [disabled]="busy()">Save common statement</button>
          </div>
        }
      </div>
    </dmis-panel>

    <dmis-panel title="Impact & action rows" icon="fa-list" [badge]="(rows().length || 0) + ''">
      <div class="panel-body" style="padding:12px">
        <div class="filters">
          <label>Hazard
            <select [(ngModel)]="filterHazard" (ngModelChange)="load()">
              <option value="">All hazards</option>
              @for (h of hazards(); track h.id) { <option [value]="h.id">{{ h.name }}</option> }
            </select>
          </label>
          <label>Level / colour
            <select [(ngModel)]="filterLevel" (ngModelChange)="load()">
              <option value="">All levels</option>
              <option value="ADVISORY">Yellow — Advisory</option>
              <option value="WARNING">Orange — Warning</option>
              <option value="MAJOR_WARNING">Red — Major Warning</option>
            </select>
          </label>
          <button class="btn" type="button" (click)="load()" [disabled]="busy()">Refresh</button>
        </div>
        <p class="meta">{{ rows().length }} row(s). Edits apply immediately to PMO-DMD statement proposals (active rows only).</p>

        @for (r of rows(); track r.id) {
          <div class="row-card">
            <h4>{{ r.hazardName }}
              <span class="level-pill" [style.background]="levelColor(r.impactLevel)" [style.color]="r.impactLevel==='ADVISORY' ? '#1a1a1a' : '#fff'">
                {{ r.impactLevel }}
              </span>
              <span style="font-weight:600;color:#94a3b8;font-size:0.75rem"> · #{{ r.id }} · order {{ r.sortOrder }}</span>
            </h4>
            <div class="grid2">
              <label>Impact (EN)
                <textarea [(ngModel)]="r.impactEn" [disabled]="!canManage()"></textarea>
              </label>
              <label>Impact (SW)
                <textarea [(ngModel)]="r.impactSw" [disabled]="!canManage()"></textarea>
              </label>
              <label>Action (EN)
                <textarea [(ngModel)]="r.actionEn" [disabled]="!canManage()"></textarea>
              </label>
              <label>Action (SW)
                <textarea [(ngModel)]="r.actionSw" [disabled]="!canManage()"></textarea>
              </label>
            </div>
            @if (canManage()) {
              <div class="actions">
                <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:700;color:#334155">
                  <input type="checkbox" [(ngModel)]="r.active"> Active
                </label>
                <button class="btn primary" type="button" (click)="saveRow(r)" [disabled]="busy()">Save row</button>
              </div>
            }
          </div>
        }
        @if (!rows().length && !busy()) {
          <div style="color:#94a3b8;padding:20px;text-align:center">No rows — use “Reload from package” to seed the guide.</div>
        }
      </div>
    </dmis-panel>
  `,
})
export class ActionGuideComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = '/api/v1/content/action-guide';

  rows = signal<any[]>([]);
  hazards = signal<{ id: string; name: string }[]>([]);
  filterHazard = '';
  filterLevel = '';
  commonEn = '';
  commonSw = '';
  busy = signal(false);
  message = signal('');
  msgErr = signal(false);

  canManage = () => this.auth.hasPermission('content_management.manage');

  ngOnInit(): void {
    this.load();
  }

  levelColor(level: string): string {
    if (level === 'MAJOR_WARNING') return '#FF0000';
    if (level === 'WARNING') return '#FFA500';
    return '#FFFF00';
  }

  load(): void {
    this.busy.set(true);
    const q = new URLSearchParams();
    if (this.filterHazard) q.set('hazardId', this.filterHazard);
    if (this.filterLevel) q.set('level', this.filterLevel);
    const qs = q.toString() ? '?' + q.toString() : '';
    this.http.get<any>(this.base + qs).subscribe({
      next: r => {
        this.busy.set(false);
        this.rows.set((r.rows || []).map((x: any) => ({ ...x })));
        this.hazards.set((r.hazards || []).map((h: any) => ({ id: h.id, name: h.name })));
        const c = r.common || {};
        this.commonEn = c.en || c.statement_en || '';
        this.commonSw = c.sw || c.statement_sw || '';
      },
      error: err => {
        this.busy.set(false);
        this.flash(err?.error?.message || 'Failed to load Action Guide.', true);
      },
    });
  }

  saveRow(r: any): void {
    this.busy.set(true);
    this.http.put(`${this.base}/${r.id}`, {
      impactEn: r.impactEn,
      impactSw: r.impactSw,
      actionEn: r.actionEn,
      actionSw: r.actionSw,
      active: r.active,
      sortOrder: r.sortOrder,
    }).subscribe({
      next: () => { this.busy.set(false); this.flash('Row saved.'); },
      error: err => { this.busy.set(false); this.flash(err?.error?.message || 'Save failed.', true); },
    });
  }

  saveCommon(): void {
    this.busy.set(true);
    this.http.put(`${this.base}/common`, { en: this.commonEn, sw: this.commonSw }).subscribe({
      next: () => { this.busy.set(false); this.flash('Common statement saved.'); },
      error: err => { this.busy.set(false); this.flash(err?.error?.message || 'Save failed.', true); },
    });
  }

  seed(force: boolean): void {
    if (force && !confirm('Replace ALL editable Action Guide rows from the packaged book?')) return;
    this.busy.set(true);
    this.http.post(`${this.base}/seed`, { force }).subscribe({
      next: (r: any) => {
        this.busy.set(false);
        this.flash(r?.message || (force ? 'Reseeded.' : 'Seeded.'));
        this.load();
      },
      error: err => { this.busy.set(false); this.flash(err?.error?.message || 'Seed failed.', true); },
    });
  }

  private flash(msg: string, err = false): void {
    this.message.set(msg);
    this.msgErr.set(err);
  }
}
