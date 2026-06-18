import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

interface AssessmentRow {
  id: number; assessment_type: string; assessment_date: string; location: string; district: string;
  damage_level: string; estimated_loss: number; status: string; created_at: string;
  incident_title: string | null; assessor_name: string | null; item_count: number; photo_count: number;
}

/**
 * Disaster Needs Assessment registry + dashboard — port of
 * response/assessment index/dashboard: status stats, damage-level and
 * district loss summaries, and the filterable list.
 */
@Component({
  selector: 'page-assessments',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.25rem; display: block; }
    .stat span { font-size: 0.7rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .mini { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 12px 14px; }
    .mini h4 { margin: 0 0 8px; font-size: 0.78rem; text-transform: uppercase; color: #6c757d; }
    .bar-row { display: grid; grid-template-columns: 130px 1fr auto; gap: 8px; align-items: center; font-size: 0.78rem; padding: 3px 0; }
    .bar { height: 10px; border-radius: 5px; background: #dc3545; min-width: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
    .chip { display: inline-block; font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; }
    .c-Draft { background: #e2e8f0; color: #334155; }
    .c-PendingVerification { background: #fef3c7; color: #92400e; }
    .c-Completed { background: #d1fae5; color: #065f46; }
    .lvl-Minor { color: #65a30d; } .lvl-Moderate { color: #d97706; }
    .lvl-Severe { color: #dc2626; font-weight: 700; } .lvl-TotalLoss { color: #7f1d1d; font-weight: 700; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; }
    .toolbar select { font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 5px 9px; font-family: inherit; }
    .empty { text-align: center; color: #94a3b8; padding: 30px 0; font-size: 0.85rem; }
  `],
  template: `
    <dmis-page-header [title]="headerTitle" icon="fa-clipboard-check"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:headerCrumb}, {label:headerTitle}]">
      @if (mode !== 'report') {
        <a routerLink="/m/response/assessments/create" class="btn-add"><i class="fas fa-plus"></i> New Assessment</a>
      }
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ stats().total ?? 0 }}</b><span>Assessments</span></div>
      <div class="stat"><b>{{ stats().draft ?? 0 }}</b><span>Draft</span></div>
      <div class="stat"><b>{{ stats().pending_verification ?? 0 }}</b><span>Pending Verification</span></div>
      <div class="stat"><b>{{ stats().completed ?? 0 }}</b><span>Completed</span></div>
      <div class="stat"><b>{{ stats().total_estimated_loss | number }}</b><span>Est. Loss (TZS)</span></div>
    </div>

    <div class="split">
      <div class="mini">
        <h4>By damage level</h4>
        @for (l of byLevel(); track l.damage_level) {
          <div class="bar-row">
            <span class="lvl-{{ l.damage_level?.replace(' ', '') }}">{{ l.damage_level }}</span>
            <div class="bar" [style.width.%]="barWidth(l.count, maxLevel())"></div>
            <b>{{ l.count }}</b>
          </div>
        } @empty { <div class="empty" style="padding:10px 0">No data yet</div> }
      </div>
      <div class="mini">
        <h4>Top districts by estimated loss</h4>
        @for (d of byDistrict(); track d.district) {
          <div class="bar-row">
            <span>{{ d.district }}</span>
            <div class="bar" style="background:#0d6efd" [style.width.%]="barWidth(d.estimated_loss, maxDistrict())"></div>
            <b>{{ d.estimated_loss | number }}</b>
          </div>
        } @empty { <div class="empty" style="padding:10px 0">No data yet</div> }
      </div>
    </div>

    <dmis-panel title="Assessment Registry" icon="fa-list">
      <div class="toolbar">
        <select [(ngModel)]="statusFilter" (ngModelChange)="load()">
          <option value="">All statuses</option>
          @for (s of ['Draft','Pending Verification','Completed']; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </div>
      <table>
        <thead><tr><th>#</th><th>Incident</th><th>Type / Date</th><th>Location</th><th>Damage</th><th>Est. Loss</th><th>Items</th><th>Status</th></tr></thead>
        <tbody>
          @for (a of assessments(); track a.id) {
            <tr>
              <td><a [routerLink]="['/m/response/assessments', a.id]" style="font-weight:600">#{{ a.id }}</a></td>
              <td>{{ a.incident_title ?? '—' }}</td>
              <td>{{ a.assessment_type }}<br><small style="color:#6c757d">{{ a.assessment_date?.substring(0, 10) }}</small></td>
              <td>{{ a.location }}<br><small style="color:#6c757d">{{ a.district }}</small></td>
              <td><span class="lvl-{{ a.damage_level?.replace(' ', '') }}">{{ a.damage_level }}</span></td>
              <td>{{ a.estimated_loss | number }}</td>
              <td>{{ a.item_count }} <small style="color:#6c757d">({{ a.photo_count }} photos)</small></td>
              <td><span class="chip c-{{ a.status?.replace(' ', '') }}">{{ a.status }}</span></td>
            </tr>
          } @empty { <tr><td colspan="8" class="empty">No assessments recorded yet.</td></tr> }
        </tbody>
      </table>
    </dmis-panel>
  `,
})
export class AssessmentsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  // 'needs' (Recovery needs-assessment desk), 'report' (read-only completed reports), or '' (Response damage assessments).
  readonly mode: string = inject(ActivatedRoute).snapshot.data['mode'] ?? '';
  readonly headerTitle = this.mode === 'needs' ? 'Disaster Needs Assessment'
    : this.mode === 'report' ? 'Assessment Reports' : 'Damage Assessments';
  readonly headerCrumb = this.mode ? 'Recovery' : 'Response';

  readonly assessments = signal<AssessmentRow[]>([]);
  readonly stats = signal<any>({});
  readonly byLevel = signal<any[]>([]);
  readonly byDistrict = signal<any[]>([]);
  readonly maxLevel = signal(1);
  readonly maxDistrict = signal(1);
  statusFilter = '';

  ngOnInit(): void {
    if (this.mode === 'report') { this.statusFilter = 'Completed'; }
    this.load();
  }

  load(): void {
    const params: Record<string, string> = this.statusFilter ? { status: this.statusFilter } : {};
    this.http.get<any>('/api/v1/response/assessments', { params }).subscribe(d => {
      this.assessments.set(d.assessments);
      this.stats.set(d.stats);
      this.byLevel.set(d.by_damage_level);
      this.byDistrict.set(d.by_district);
      this.maxLevel.set(Math.max(1, ...d.by_damage_level.map((l: any) => l.count)));
      this.maxDistrict.set(Math.max(1, ...d.by_district.map((x: any) => x.estimated_loss)));
    });
  }

  barWidth(value: number, max: number): number {
    return Math.max(2, (value / max) * 100);
  }
}
