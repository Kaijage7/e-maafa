import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SecureMediaService } from '../../core/secure-media.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * Assessment detail hub — port of response/assessment/show + report:
 * header stats, the Draft → Pending Verification → Completed workflow
 * actions (permission-gated), immediate needs & recommendations, per-category
 * damage summary with the severity breakdown from the report endpoint, photo
 * gallery (authenticated fetch + delete while editable), and the resource
 * requests this assessment pushed into the allocation pipeline.
 */
@Component({
  selector: 'page-assessment-show',
  standalone: true,
  imports: [DecimalPipe, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.1rem; display: block; }
    .stat span { font-size: 0.75rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .wf-strip { display: flex; gap: 8px; align-items: center; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem; flex-wrap: wrap; }
    .step { padding: 3px 12px; border-radius: 12px; background: #e2e8f0; color: #334155; font-weight: 600; font-size: 0.75rem; }
    .step.done { background: #d1fae5; color: #065f46; }
    .step.now { background: #dc3545; color: #fff; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
    .sev-Minor { color: #65a30d; } .sev-Moderate { color: #d97706; } .sev-Severe { color: #dc2626; font-weight: 700; }
    .btn-sm { font-size: 0.78rem; padding: 6px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .b-red { background: #dc3545; color: #fff; } .b-green { background: #198754; color: #fff; }
    .b-red:hover { background: #c82333; } .b-green:hover { background: #157347; }
    .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; } .b-outline:hover { background: #f1f5f9; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    .photo { position: relative; }
    .photo img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #e3e6ed; cursor: pointer; }
    .photo small { font-size: 0.75rem; color: #6c757d; display: block; }
    .photo-x { position: absolute; top: 4px; right: 4px; background: rgba(15,23,42,0.65); color: #fff; border: none; border-radius: 6px; font-size: 0.75rem; padding: 2px 7px; cursor: pointer; }
    .photo-x:hover { background: #b91c1c; }
    .photo-wait { height: 120px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; color: #94a3b8; font-size: 0.78rem; }
    .empty { text-align: center; color: #94a3b8; padding: 22px 0; font-size: 0.85rem; }
    .chip { display: inline-block; font-size: 0.75rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; background: #e2e8f0; color: #334155; }
    .need-item { display: grid; grid-template-columns: 22px 1fr; gap: 8px; padding: 8px 4px; border-bottom: 1px dashed #eef1f5; font-size: 0.84rem; }
    .need-item i { color: #b45309; margin-top: 2px; }
    .need-rec { color: #475569; font-size: 0.8rem; margin-top: 2px; }
    .need-rec b { color: #334155; }
    @media print { .wf-strip button, .wf-strip a, .photo-x { display: none !important; } }
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
        @if (a.status !== 'Completed' && canCreate()) {
          <a class="btn-sm b-outline" [routerLink]="['/m/response/assessments', a.id, 'edit']"><i class="fas fa-pen"></i> Edit</a>
        }
        @if (a.status === 'Draft' && canCreate()) {
          <button class="btn-sm b-red" (click)="submit()"><i class="fas fa-paper-plane"></i> Submit for Verification</button>
        }
        @if (a.status === 'Pending Verification' && canVerify()) {
          <button class="btn-sm b-green" (click)="verify()"><i class="fas fa-check-double"></i> Verify & Complete</button>
        }
        @if (a.status === 'Completed') {
          <span class="chip">Verified by {{ a.verified_by_name ?? '—' }}</span>
        }
        <button class="btn-sm b-outline" (click)="print()"><i class="fas fa-print"></i> Print</button>
      </div>

      <div class="stat-strip">
        <div class="stat"><b>{{ a.assessment_type }}</b><span>{{ a.assessment_date?.substring(0, 10) }}</span></div>
        <div class="stat"><b>{{ a.location }}</b><span>{{ a.district }}</span></div>
        <div class="stat"><b class="sev-Severe">{{ a.damage_level }}</b><span>Overall damage</span></div>
        <div class="stat"><b>{{ a.estimated_loss | number }}</b><span>Estimated loss (TZS)</span></div>
        <div class="stat"><b>{{ a.assessor_name ?? '—' }}</b><span>Assessor</span></div>
      </div>

      <dmis-panel title="Immediate Needs &amp; Recommendations" icon="fa-hand-holding-medical">
        @for (n of needsList(); track $index) {
          <div class="need-item">
            <i class="fas fa-triangle-exclamation"></i>
            <div>
              {{ n.immediate_needs || '—' }}
              @if (n.recommendations) { <div class="need-rec"><b>Recommended:</b> {{ n.recommendations }}</div> }
            </div>
          </div>
        } @empty {
          <div class="empty"><i class="fas fa-hand-holding-medical"></i> No immediate needs recorded.
            @if (a.status !== 'Completed' && canCreate()) {
              <a [routerLink]="['/m/response/assessments', a.id, 'edit']" style="font-size:0.8rem"> Record them in Edit →</a>
            }
          </div>
        }
      </dmis-panel>

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
        <div style="display:flex; gap:24px; flex-wrap:wrap; margin-top:10px">
          @if (summary().length) {
            <table style="max-width:460px">
              <thead><tr><th>Category subtotal</th><th>Items</th><th>Damage (TZS)</th></tr></thead>
              <tbody>
                @for (s of summary(); track s.category) {
                  <tr><td><b>{{ s.category }}</b></td><td>{{ s.total_items }}</td><td>{{ s.total_damage | number }}</td></tr>
                }
              </tbody>
            </table>
          }
          @if (severityBreakdown().length) {
            <table style="max-width:460px">
              <thead><tr><th>Severity breakdown</th><th>Severity</th><th>Items</th><th>Damage (TZS)</th></tr></thead>
              <tbody>
                @for (s of severityBreakdown(); track $index) {
                  <tr><td><b>{{ s.category }}</b></td>
                    <td><span class="sev-{{ s.severity }}">{{ s.severity }}</span></td>
                    <td>{{ s.items }}</td><td>{{ s.damage | number }}</td></tr>
                }
              </tbody>
            </table>
          }
        </div>
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
              @if (p.src) {
                <img [src]="p.src" [alt]="p.caption ?? 'photo'" (click)="openPhoto(p)">
              } @else if (p.src === null) {
                <div class="photo-wait"><i class="fas fa-image-slash"></i>&nbsp;Unavailable</div>
              } @else {
                <div class="photo-wait">Loading…</div>
              }
              @if (a.status !== 'Completed' && canCreate()) {
                <button type="button" class="photo-x" title="Delete photo" (click)="deletePhoto(p)"><i class="fas fa-trash"></i></button>
              }
              <small>{{ p.caption ?? p.photo_path }} — {{ p.uploaded_by_name ?? '' }}</small>
            </div>
          } @empty { <div class="empty"><i class="fas fa-camera"></i> No photos uploaded.</div> }
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
  private readonly auth = inject(AuthService);
  private readonly media = inject(SecureMediaService);

  readonly assessment = signal<any | null>(null);
  readonly items = signal<any[]>([]);
  readonly summary = signal<any[]>([]);
  readonly photos = signal<any[]>([]);
  readonly resourceRequests = signal<any[]>([]);
  readonly severityBreakdown = signal<any[]>([]);
  readonly needsList = signal<Array<{ immediate_needs: string; recommendations: string }>>([]);

  private id = 0;

  ngOnInit(): void {
    ensureSweetAlert();
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  canCreate(): boolean {
    return this.auth.hasPermission('damage_assessment.create');
  }

  canVerify(): boolean {
    return this.auth.hasPermission('damage_assessment.verify');
  }

  load(): void {
    // The report payload is the show payload + the per-severity rollup — one call serves both.
    this.http.get<any>(`/api/v1/response/assessments/${this.id}/report`).subscribe(d => {
      this.assessment.set(d.assessment ? { ...d.assessment, ...pickHeader(d) } : null);
      this.items.set(d.items);
      this.summary.set(d.category_summary);
      this.resourceRequests.set(d.resource_requests);
      this.severityBreakdown.set(d.severity_breakdown ?? []);
      this.needsList.set(parseNeeds(d.assessment?.immediate_needs));
      // Photos live under the authenticated /storage/assessments prefix — fetch through the token.
      this.photos.set((d.photos ?? []).map((p: any) => ({ ...p, src: undefined })));
      for (const p of this.photos()) {
        this.media.url(p.photo_path).then(src =>
          this.photos.update(list => list.map(x => x.id === p.id ? { ...x, src } : x)));
      }
    });
  }

  openPhoto(p: any): void {
    if (p.src) { window.open(p.src, '_blank'); }
  }

  deletePhoto(p: any): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Delete this photo?', text: 'The file is removed from the assessment record.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
    }).then((r: any) => {
      if (!r.isConfirmed) { return; }
      this.http.delete<any>(`/api/v1/response/assessments/${this.id}/photos/${p.id}`).subscribe({
        next: () => this.photos.update(list => list.filter(x => x.id !== p.id)),
        error: (err: any) => ensureSweetAlert().then(() =>
          Swal.fire('Error', err?.error?.detail ?? 'Could not delete the photo.', 'error')),
      });
    }));
  }

  print(): void {
    window.print();
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

/** immediate_needs holds the source's requirements[] JSON; tolerate legacy shapes. */
function parseNeeds(raw: any): Array<{ immediate_needs: string; recommendations: string }> {
  if (!raw) { return []; }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed.map((n: any) => ({
        immediate_needs: String(n?.immediate_needs ?? ''), recommendations: String(n?.recommendations ?? ''),
      })).filter(n => n.immediate_needs || n.recommendations);
    }
    return [];
  } catch {
    return [{ immediate_needs: String(raw), recommendations: '' }];
  }
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
      link.href = '/vendor/sweetalert2/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = '/vendor/sweetalert2/sweetalert2.all.min.js';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
