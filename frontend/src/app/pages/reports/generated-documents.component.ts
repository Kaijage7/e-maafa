import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SecureMediaService } from '../../core/secure-media.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

/**
 * Reports & Analytics — Generated Documents: the registry of official PDFs the system
 * produced from keyed data (NDRF Annex 1 DLNA filings, Annex 2 recovery plans). Each row
 * is a versioned filing linked to its incident; the file itself sits under the
 * auth-protected /storage/reports/ prefix and opens through the token.
 */
@Component({
    selector: 'page-generated-documents',
    imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
    styles: [`
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
    .chip { display: inline-block; font-size: 0.75rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; }
    .t-DLNA_ANNEX1 { background: #dbeafe; color: #1e40af; }
    .t-RECOVERY_PLAN_ANNEX2 { background: #d1fae5; color: #065f46; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; align-items: end; }
    .toolbar label { display: block; font-size: 0.75rem; text-transform: uppercase; color: #6c757d; margin-bottom: 2px; }
    .toolbar select { font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 5px 9px; font-family: inherit; }
    .btn-dl { font-size: 0.78rem; padding: 5px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #0d3b66; cursor: pointer; font-family: inherit; font-weight: 600; }
    .btn-dl:hover { background: #eef4fb; }
    .empty { text-align: center; color: #94a3b8; padding: 30px 0; font-size: 0.85rem; }
  `],
    template: `
    <dmis-page-header title="Generated Documents" icon="fa-file-pdf"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Reports & Analytics'}, {label:'Generated Documents'}]">
    </dmis-page-header>

    <dmis-panel title="Official Document Filings" icon="fa-box-archive">
      <div class="toolbar">
        <div>
          <label>Type</label>
          <select [(ngModel)]="typeFilter" (ngModelChange)="load()">
            <option value="">All types</option>
            <option value="DLNA_ANNEX1">DLNA (NDRF Annex 1)</option>
            <option value="RECOVERY_PLAN_ANNEX2">Recovery Plan (NDRF Annex 2)</option>
          </select>
        </div>
      </div>
      <table>
        <thead><tr><th>Ref</th><th>Document</th><th>Incident</th><th>Type</th><th>Size</th><th>Generated</th><th>By</th><th></th></tr></thead>
        <tbody>
          @for (r of reports(); track r.id) {
            <tr>
              <td style="font-weight:600">{{ r.ref_no ?? '—' }} <small style="color:#94a3b8">v{{ r.id }}</small></td>
              <td>{{ r.title }}</td>
              <td>@if (r.incident_id) { <a [routerLink]="['/m/response/incidents', r.incident_id]">{{ r.incident_title ?? ('#' + r.incident_id) }}</a> } @else { — }</td>
              <td><span class="chip t-{{ r.report_type }}">{{ r.report_type === 'DLNA_ANNEX1' ? 'Annex 1 — DLNA' : 'Annex 2 — Recovery Plan' }}</span></td>
              <td>{{ r.file_bytes ? ((r.file_bytes / 1024).toFixed(0) + ' KB') : '—' }}</td>
              <td>{{ r.generated_at?.substring(0, 16)?.replace('T', ' ') }}</td>
              <td>{{ r.generated_by_name ?? '—' }}</td>
              <td><button type="button" class="btn-dl" (click)="open(r)"><i class="fas fa-file-pdf"></i> Open PDF</button></td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="empty"><i class="fas fa-file-pdf"></i>
              No documents filed yet — finalize a DLNA or save a Recovery Plan, then use
              “Generate PDF → Reports &amp; Analytics” on its document view.</td></tr>
          }
        </tbody>
      </table>
    </dmis-panel>
  `
})
export class GeneratedDocumentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly media = inject(SecureMediaService);

  readonly reports = signal<any[]>([]);
  typeFilter = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const params: Record<string, string> = this.typeFilter ? { type: this.typeFilter } : {};
    this.http.get<any>('/api/v1/reports/generated', { params }).subscribe(d => this.reports.set(d.reports));
  }

  /** The file sits under the auth-protected storage prefix — fetch with the token, then open. */
  open(r: any): void {
    this.media.url(r.file_path).then(src => {
      if (src) { window.open(src, '_blank'); }
    });
  }
}
