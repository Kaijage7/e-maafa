import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * Assessment detail hub — port of response/assessment/show + report:
 * header stats, the Draft → Pending Verification → Completed workflow
 * actions, per-category damage summary with severity breakdown, photo
 * gallery, and the resource requests this assessment pushed into the
 * allocation pipeline.
 */
@Component({
  selector: 'page-assessment-show',
  standalone: true,
  imports: [DecimalPipe, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.1rem; display: block; }
    .stat span { font-size: 0.7rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .wf-strip { display: flex; gap: 8px; align-items: center; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem; }
    .step { padding: 3px 12px; border-radius: 12px; background: #e2e8f0; color: #334155; font-weight: 600; font-size: 0.74rem; }
    .step.done { background: #d1fae5; color: #065f46; }
    .step.now { background: #dc3545; color: #fff; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
    .sev-Minor { color: #65a30d; } .sev-Moderate { color: #d97706; } .sev-Severe { color: #dc2626; font-weight: 700; }
    .btn-sm { font-size: 0.74rem; padding: 5px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-green { background: #198754; color: #fff; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    .photo img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #e3e6ed; }
    .photo small { font-size: 0.68rem; color: #6c757d; display: block; }
    .empty { text-align: center; color: #94a3b8; padding: 22px 0; font-size: 0.85rem; }
    .chip { display: inline-block; font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; background: #e2e8f0; color: #334155; }
  `],
  template: `
    @if (assessment(); as a) {
      <dmis-page-header [title]="'Assessment #' + a.id + ' — ' + (a.incident_title ?? '')" icon="fa-clipboard-check"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Assessment', url:'/m/response/assessments'}, {label:'#' + a.id}]">
      </dmis-page-header>

      <div class="wf-strip">
        <span class="step" [class.done]="a.status !== 'Draft'" [class.now]="a.status === 'Draft'">Draft</span>
        <i class="fas fa-arrow-right" style="color:#cbd5e1"></i>
        <span class="step" [class.done]="a.status === 'Completed'" [class.now]="a.status === 'Pending Verification'">Pending Verification</span>
        <i class="fas fa-arrow-right" style="color:#cbd5e1"></i>
        <span class="step" [class.now]="a.status === 'Completed'">Completed</span>
        <span style="flex:1"></span>
        @if (a.status === 'Draft') {
          <button class="btn-sm b-red" (click)="submit()"><i class="fas fa-paper-plane"></i> Submit for Verification</button>
        }
        @if (a.status === 'Pending Verification') {
          <button class="btn-sm b-green" (click)="verify()"><i class="fas fa-check-double"></i> Verify & Complete</button>
        }
        @if (a.status === 'Completed') {
          <span class="chip">Verified by {{ a.verified_by_name ?? '—' }}</span>
        }
      </div>

      <div class="stat-strip">
        <div class="stat"><b>{{ a.assessment_type }}</b><span>{{ a.assessment_date?.substring(0, 10) }}</span></div>
        <div class="stat"><b>{{ a.location }}</b><span>{{ a.district }}</span></div>
        <div class="stat"><b class="sev-Severe">{{ a.damage_level }}</b><span>Overall damage</span></div>
        <div class="stat"><b>{{ a.estimated_loss | number }}</b><span>Estimated loss (TZS)</span></div>
      </div>

      <dmis-panel title="Damage by Category" icon="fa-layer-group">
        <table>
          <thead><tr><th>Category</th><th>Subcategory</th><th>Description</th><th>Qty</th><th>Value (TZS)</th><th>Severity</th></tr></thead>
          <tbody>
            @for (i of items(); track i.id) {
              <tr>
                <td><b>{{ i.category }}</b></td>
                <td>{{ i.subcategory }}</td>
                <td>{{ i.damage_description ?? '—' }}</td>
                <td>{{ i.quantity_damaged ?? '—' }} {{ i.unit ?? '' }}</td>
                <td>{{ i.damage_value | number }}</td>
                <td><span class="sev-{{ i.severity }}">{{ i.severity }}</span></td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No damage items.</td></tr> }
          </tbody>
        </table>
        @if (summary().length) {
          <table style="margin-top:10px; max-width:520px">
            <thead><tr><th>Category subtotal</th><th>Items</th><th>Damage (TZS)</th></tr></thead>
            <tbody>
              @for (s of summary(); track s.category) {
                <tr><td><b>{{ s.category }}</b></td><td>{{ s.total_items }}</td><td>{{ s.total_damage | number }}</td></tr>
              }
            </tbody>
          </table>
        }
      </dmis-panel>

      <dmis-panel title="Resource Requests from this Assessment" icon="fa-truck">
        <table>
          <thead><tr><th>Resource</th><th>Quantity</th><th>Justification</th><th>Status</th></tr></thead>
          <tbody>
            @for (r of resourceRequests(); track r.id) {
              <tr>
                <td><b>{{ r.resource_name }}</b></td>
                <td>{{ r.quantity_requested }} {{ r.unit_of_measure }}</td>
                <td>{{ r.justification_for_request }}</td>
                <td><span class="chip">{{ r.status }} · {{ r.workflow_status }}</span></td>
              </tr>
            } @empty { <tr><td colspan="4" class="empty">No resource requests were raised.</td></tr> }
          </tbody>
        </table>
        @if (resourceRequests().length) {
          <a routerLink="/m/response/approvals" style="font-size:0.78rem">Track them in Resource Approvals →</a>
        }
      </dmis-panel>

      <dmis-panel title="Photo Evidence" icon="fa-camera">
        <div class="photos">
          @for (p of photos(); track p.id) {
            <div class="photo">
              <img [src]="'/api/storage/' + p.photo_path" [alt]="p.caption ?? 'photo'">
              <small>{{ p.caption ?? p.photo_path }} — {{ p.uploaded_by_name ?? '' }}</small>
            </div>
          } @empty { <div class="empty">No photos uploaded.</div> }
        </div>
      </dmis-panel>

      @if (a.recommendations || a.verification_notes) {
        <dmis-panel title="Notes" icon="fa-note-sticky">
          @if (a.recommendations) { <p style="font-size:0.84rem"><b>Recommendations:</b> {{ a.recommendations }}</p> }
          @if (a.verification_notes) { <p style="font-size:0.84rem"><b>Verification notes:</b> {{ a.verification_notes }}</p> }
        </dmis-panel>
      }
    }
  `,
})
export class AssessmentShowComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly assessment = signal<any | null>(null);
  readonly items = signal<any[]>([]);
  readonly summary = signal<any[]>([]);
  readonly photos = signal<any[]>([]);
  readonly resourceRequests = signal<any[]>([]);

  private id = 0;

  ngOnInit(): void {
    ensureSweetAlert();
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  load(): void {
    this.http.get<any>(`/api/v1/response/assessments/${this.id}`).subscribe(d => {
      this.assessment.set(d.assessment ? { ...d.assessment, ...pickHeader(d) } : null);
      this.items.set(d.items);
      this.summary.set(d.category_summary);
      this.photos.set(d.photos);
      this.resourceRequests.set(d.resource_requests);
    });
  }

  submit(): void {
    this.act('Submit this assessment for verification?', `/api/v1/response/assessments/${this.id}/submit`, {});
  }

  verify(): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Verify & complete this assessment?', icon: 'question', showCancelButton: true,
      confirmButtonColor: '#198754', input: 'textarea', inputLabel: 'Verification notes (optional)',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.act(null, `/api/v1/response/assessments/${this.id}/verify`, { verification_notes: r.value || null });
      }
    }));
  }

  private act(confirmTitle: string | null, url: string, body: any): void {
    const run = () => this.http.post<any>(url, body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Done', text: r.message, timer: 2200, showConfirmButton: false,
      }).then(() => this.load())),
      error: err => ensureSweetAlert().then(() =>
        Swal.fire('Error', err?.error?.detail ?? 'An error occurred.', 'error')),
    });
    if (!confirmTitle) {
      run();
      return;
    }
    ensureSweetAlert().then(() => Swal.fire({
      title: confirmTitle, icon: 'question', showCancelButton: true, confirmButtonColor: '#dc3545',
    }).then((r: any) => {
      if (r.isConfirmed) { run(); }
    }));
  }
}

/** The show payload mixes the row with joined names; surface the extras the template uses. */
function pickHeader(d: any): any {
  const { incident_title, assessor_name, verified_by_name } = d;
  return { incident_title, assessor_name, verified_by_name };
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
