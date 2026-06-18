import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface ThreatRow {
  id: number; name: string; sourceAgency: string; trendLabel: string;
  severity: string; isActive: boolean; updateCount: number; planCount: number;
}
interface ThreatUpdate {
  id: number; title: string; detail: string; status: string;
  startsOn: string | null; endsOn: string | null; isActive: boolean;
}
interface ThreatPlan {
  id: number; planTitle: string; stakeholderType: string; stakeholderName: string;
  region: string; status: string; submittedOn: string;
}

/**
 * Content Management → Hazard Monitor (Threat Monitoring) — DMD's control surface for the
 * national threats shown on the public front: register threats (source agency, trend,
 * severity), drive each threat's DMD-intervention timeline (UPCOMING/NEW → ONGOING → COMPLETED, or POSTPONED), and
 * review stakeholder plan submissions (Submitted → Under review → Approved). Everything here
 * is immediately reflected on the public threat strip, threat pages and Elimu.
 */
@Component({
  selector: 'page-threat-monitor',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Hazard Monitor — Threat Monitoring" icon="fa-satellite-dish"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Hazard Monitor'}]">
      <button class="btn-add" type="button" (click)="newThreatOpen.set(true)"><i class="fas fa-plus"></i> Register Threat</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="threats().length" label="Threats Tracked" icon="fa-satellite-dish" color="#e83e8c" />
      <dmis-stat-card [value]="totalUpdates()" label="Interventions" icon="fa-tasks" color="#3b82f6" />
      <dmis-stat-card [value]="totalPlans()" label="Plans Submitted" icon="fa-file-upload" color="#10b981" />
    </div>

    <!-- Threat list -->
    <div class="panel-row">
      <dmis-panel title="National Threats" icon="fa-database" [badge]="threats().length + ' tracked'">
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Threat</th><th>Source</th><th>Severity</th><th>Interventions</th><th>Plans</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (t of threats(); track t.id) {
                <tr class="data-row" [style.background]="selected()?.id === t.id ? 'rgba(0,51,102,0.04)' : ''">
                  <td><div class="r-title">{{ t.name }}</div><div class="r-subtitle">{{ t.trendLabel }}</div></td>
                  <td style="font-size:0.82rem;color:var(--text-mid);">{{ t.sourceAgency }}</td>
                  <td><span class="r-badge" [style.background]="sevBg(t.severity)" [style.color]="sevFg(t.severity)">{{ t.severity }}</span></td>
                  <td style="font-size:0.85rem;">{{ t.updateCount }}</td>
                  <td style="font-size:0.85rem;">{{ t.planCount }}</td>
                  <td><span class="r-badge {{ t.isActive ? 'badge-approved' : 'badge-rejected' }}">{{ t.isActive ? 'Live' : 'Hidden' }}</span></td>
                  <td><button class="btn-add" style="padding:0.3rem 0.8rem;font-size:0.74rem;" (click)="open(t)">Manage</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <!-- Selected threat: timeline + plans review -->
    @if (selected(); as t) {
      <div class="panel-row" style="animation-delay:.1s;">
        <dmis-panel [title]="t.name + ' — public graphic'" icon="fa-image" badge="changeable">
          <div class="panel-body" style="display:flex;align-items:center;gap:1rem;">
            @if (graphicUrl()) {
              <img [src]="graphicUrl()" alt="Threat graphic" style="height:90px;border-radius:10px;border:1px solid var(--border);object-fit:cover;">
            } @else {
              <div style="height:90px;width:150px;border:1px dashed var(--border);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--text-light);font-size:0.75rem;">No graphic yet</div>
            }
            <label class="btn-add" style="cursor:pointer;margin:0;">
              <i class="fas" [class.fa-upload]="!uploading()" [class.fa-spinner]="uploading()" [class.fa-spin]="uploading()"></i>
              {{ uploading() ? 'Uploading…' : 'Upload graphic' }}
              <input type="file" accept="image/*" hidden (change)="uploadGraphic($any($event.target).files)">
            </label>
            <span style="font-size:0.76rem;color:var(--text-mid);">Shown on the public threat page (e.g. the TMA El Niño outlook graphic — replace any time).</span>
          </div>
        </dmis-panel>
      </div>
      <div class="panel-row" style="animation-delay:.15s;">
        <dmis-panel [title]="t.name + ' — DMD intervention timeline'" icon="fa-tasks" [badge]="updates().length + ' entries'">
          <div class="panel-body">
            <div style="display:grid;gap:0.55rem;margin-bottom:1rem;">
              @for (u of updates(); track u.id) {
                <div style="display:grid;grid-template-columns:110px 1.4fr 2fr auto;gap:0.6rem;align-items:center;border:1px solid var(--border);border-radius:10px;padding:0.55rem 0.75rem;">
                  <select style="font-size:0.72rem;border:1px solid var(--border);border-radius:7px;padding:0.25rem;font-weight:700;"
                          [value]="u.status" (change)="setUpdateStatus(u, $any($event.target).value)">
                    <option value="UPCOMING">UPCOMING</option><option value="NEW">NEW</option><option value="ONGOING">ONGOING</option><option value="COMPLETED">COMPLETED</option><option value="POSTPONED">POSTPONED</option>
                  </select>
                  <div style="font-size:0.84rem;font-weight:700;color:var(--text-dark);">{{ u.title }}</div>
                  <div style="font-size:0.76rem;color:var(--text-mid);">{{ u.detail }}</div>
                  <div style="font-size:0.7rem;color:var(--text-light);white-space:nowrap;">{{ u.startsOn || '' }}{{ u.endsOn ? ' — ' + u.endsOn : '' }}</div>
                </div>
              }
            </div>
            <!-- Add timeline entry -->
            <div style="display:grid;grid-template-columns:1.4fr 2fr 0.8fr 0.8fr auto;gap:0.5rem;align-items:center;">
              <input class="form-control" placeholder="New intervention title" [value]="uTitle()" (input)="uTitle.set($any($event.target).value)">
              <input class="form-control" placeholder="Detail" [value]="uDetail()" (input)="uDetail.set($any($event.target).value)">
              <input type="date" class="form-control" [value]="uStart()" (input)="uStart.set($any($event.target).value)">
              <input type="date" class="form-control" [value]="uEnd()" (input)="uEnd.set($any($event.target).value)">
              <button class="btn-add" type="button" [disabled]="!uTitle().trim()" (click)="addUpdate()"><i class="fas fa-plus"></i> Add</button>
            </div>
          </div>
        </dmis-panel>
      </div>

      <div class="panel-row" style="animation-delay:.3s;">
        <dmis-panel [title]="t.name + ' — stakeholder plans review'" icon="fa-file-upload" [badge]="plans().length + ' plans'">
          <div class="panel-body" style="padding:0;">
            @if (plans().length) {
              <table class="r-table">
                <thead><tr><th>Plan</th><th>Stakeholder</th><th>Region</th><th>Submitted</th><th>Review</th></tr></thead>
                <tbody>
                  @for (p of plans(); track p.id) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ p.planTitle }}</div></td>
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ p.stakeholderName }} <span class="r-badge" style="background:rgba(0,51,102,0.08);color:#003366;margin-left:4px;">{{ p.stakeholderType }}</span></td>
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ p.region || '-' }}</td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">{{ p.submittedOn }}</td>
                      <td>
                        <select style="font-size:0.76rem;border:1px solid var(--border);border-radius:7px;padding:0.3rem;"
                                [value]="p.status" (change)="reviewPlan(p, $any($event.target).value)">
                          <option>Submitted</option><option>Under review</option><option>Approved</option>
                        </select>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <div class="empty-state"><i class="fas fa-file-upload"></i>No plans submitted under this threat yet.</div> }
          </div>
        </dmis-panel>
      </div>
    }

    <!-- Register threat drawer -->
    @if (newThreatOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="newThreatOpen.set(false)">
        <div style="background:#fff;border-radius:16px;max-width:640px;width:100%;padding:1.3rem 1.4rem;" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin-bottom:1rem;">Register Threat</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
            <input class="form-control" placeholder="Threat name * (e.g. Super El Niño)" [value]="tName()" (input)="tName.set($any($event.target).value)">
            <input class="form-control" placeholder="Source agency (e.g. TMA)" [value]="tSource()" (input)="tSource.set($any($event.target).value)">
            <input class="form-control" placeholder="Trend label (e.g. Trending from global centers)" [value]="tTrend()" (input)="tTrend.set($any($event.target).value)">
            <select class="form-control" [value]="tSeverity()" (change)="tSeverity.set($any($event.target).value)">
              <option>Watch</option><option>Warning</option><option>Emergency</option>
            </select>
          </div>
          <textarea class="form-control" rows="3" placeholder="Description (English)" style="margin-top:0.75rem;width:100%;" [value]="tDescEn()" (input)="tDescEn.set($any($event.target).value)"></textarea>
          <textarea class="form-control" rows="3" placeholder="Maelezo (Kiswahili)" style="margin-top:0.5rem;width:100%;" [value]="tDescSw()" (input)="tDescSw.set($any($event.target).value)"></textarea>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1rem;">
            <button type="button" style="border:1px solid var(--border);background:#fff;border-radius:9px;padding:0.5rem 1rem;cursor:pointer;" (click)="newThreatOpen.set(false)">Cancel</button>
            <button class="btn-add" type="button" [disabled]="!tName().trim()" (click)="createThreat()"><i class="fas fa-save"></i> Register</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ThreatMonitorComponent {
  private http = inject(HttpClient);

  threats = signal<ThreatRow[]>([]);
  selected = signal<ThreatRow | null>(null);
  updates = signal<ThreatUpdate[]>([]);
  plans = signal<ThreatPlan[]>([]);

  // add-update form
  uTitle = signal(''); uDetail = signal(''); uStart = signal(''); uEnd = signal('');
  // register-threat form
  newThreatOpen = signal(false);
  tName = signal(''); tSource = signal(''); tTrend = signal(''); tSeverity = signal('Watch');
  tDescEn = signal(''); tDescSw = signal('');

  uploading = signal(false);
  graphicUrl = signal<string | null>(null);

  constructor() { this.reload(); }

  /** Uploads the threat's public graphic (TMA outlook etc.) and saves it on the threat. */
  uploadGraphic(files: FileList | null): void {
    const file = files?.[0];
    const t = this.selected();
    if (!file || !t) { return; }
    this.uploading.set(true);
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'threats');
    this.http.post<{ path: string; url: string }>('/api/v1/content/upload', form).subscribe({
      next: r => {
        this.http.put(`/api/v1/content/threats/${t.id}`, { graphicPath: r.path }).subscribe(() => {
          this.uploading.set(false);
          this.graphicUrl.set(r.url);
        });
      },
      error: () => this.uploading.set(false),
    });
  }

  totalUpdates(): number { return this.threats().reduce((sum, t) => sum + Number(t.updateCount), 0); }
  totalPlans(): number { return this.threats().reduce((sum, t) => sum + Number(t.planCount), 0); }

  sevBg(sev: string): string {
    return sev === 'Emergency' ? 'rgba(220,38,38,0.12)' : sev === 'Warning' ? 'rgba(217,119,6,0.12)' : 'rgba(37,99,235,0.12)';
  }
  sevFg(sev: string): string {
    return sev === 'Emergency' ? '#dc2626' : sev === 'Warning' ? '#d97706' : '#2563eb';
  }

  reload(): void {
    this.http.get<{ threats: ThreatRow[] }>('/api/v1/content/threats').subscribe(r => {
      this.threats.set(r.threats);
      const sel = this.selected();
      if (sel) {
        const again = r.threats.find(t => t.id === sel.id);
        if (again) { this.open(again); }
      }
    });
  }

  open(t: ThreatRow): void {
    this.selected.set(t);
    this.http.get<{ threat: { graphicPath: string | null }; updates: ThreatUpdate[]; plans: ThreatPlan[] }>(
      `/api/v1/content/threats/${t.id}`).subscribe(r => {
        this.updates.set(r.updates);
        this.plans.set(r.plans);
        this.graphicUrl.set(r.threat.graphicPath ? '/api/storage/' + r.threat.graphicPath : null);
      });
  }

  addUpdate(): void {
    const t = this.selected();
    if (!t) { return; }
    this.http.post(`/api/v1/content/threats/${t.id}/updates`, {
      title: this.uTitle().trim(), detail: this.uDetail() || null, status: 'NEW',
      startsOn: this.uStart() || null, endsOn: this.uEnd() || null,
    }).subscribe(() => {
      this.uTitle.set(''); this.uDetail.set(''); this.uStart.set(''); this.uEnd.set('');
      this.reload();
    });
  }

  setUpdateStatus(u: ThreatUpdate, status: string): void {
    this.http.put(`/api/v1/content/threats/updates/${u.id}`, { status }).subscribe(() => this.reload());
  }

  reviewPlan(p: ThreatPlan, status: string): void {
    this.http.put(`/api/v1/content/threats/plans/${p.id}/status`, { status }).subscribe(() => this.reload());
  }

  createThreat(): void {
    this.http.post('/api/v1/content/threats', {
      name: this.tName().trim(), sourceAgency: this.tSource() || null, trendLabel: this.tTrend() || null,
      severity: this.tSeverity(), descriptionEn: this.tDescEn() || null, descriptionSw: this.tDescSw() || null,
    }).subscribe(() => { this.newThreatOpen.set(false); this.tName.set(''); this.reload(); });
  }
}
