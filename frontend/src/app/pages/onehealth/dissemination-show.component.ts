import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface DissDetail {
  id: number; dissemination_type: string; alert_message: string; alert_message_sw: string | null;
  sector: string | null; directives: string | null; language: string;
  channels: string[]; target_audience: string[];
  approval_status: string; approval_remarks: string | null; status: string;
  sms_sent_count: number; email_sent_count: number;
  approved_by_name: string | null; approved_at: string | null;
  sent_by_name: string | null; sent_at: string | null;
  event: { id: number; event_id: string; status: string };
  stakeholders: { id: number; organization: string; name: string; email: string | null; phone: string | null; acknowledgement_status: string; acknowledged_at: string | null }[];
  logs: { channel: string; recipient: string; status: string; created_at: string }[];
  log_count: number;
  log_stats: { total: number; sent: number; delivered: number; failed: number; pending: number };
  can_approve: boolean;
}

/**
 * Reproduction of onehealth/dissemination/show.blade.php: track/approval/status
 * badges, log stat cards, dissemination details (bilingual messages, channels,
 * audience), delivery summary, target stakeholders, delivery logs (first 50) and
 * the sidebar Approve & Send / Reject / Resend actions.
 */
@Component({
  selector: 'page-oh-dissemination-show',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, PanelComponent, StatCardComponent],
  styles: [`
    .detail-label { font-size: 0.72rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem; }
    .detail-value { font-size: 0.85rem; color: var(--text-dark); }
  `],
  template: `
    @if (diss(); as d) {
      <dmis-page-header [title]="'Dissemination #' + d.id" icon="fa-bullhorn"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'One Health'},
          {label:'Events', url:'/m/one-health/events'},
          {label:d.event.event_id, url:'/m/one-health/events/' + d.event.id},
          {label:'Dissemination'}]">
        <a [routerLink]="['/m/one-health/events', d.event.id]" class="btn-add" style="background:var(--text-mid);font-size:0.78rem;"><i class="fas fa-arrow-left"></i> Back to Event</a>
      </dmis-page-header>

      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;">
        <span class="r-badge" [style]="d.dissemination_type === 'stakeholder' ? 'background:rgba(0,51,102,0.1);color:#003366;' : 'background:rgba(16,185,129,0.1);color:#10b981;'" style="font-size:0.82rem;padding:0.35rem 0.8rem;">{{ ucfirst(d.dissemination_type) }} Track</span>
        <span class="r-badge" [class]="'r-badge ' + approvalBadge(d.approval_status)" style="font-size:0.82rem;padding:0.35rem 0.8rem;">{{ ucfirst(d.approval_status) }}</span>
        <span class="r-badge" [class]="'r-badge ' + statusBadge(d.status)" style="font-size:0.82rem;padding:0.35rem 0.8rem;">{{ ucfirst(d.status) }}</span>
      </div>

      <div class="stats-row">
        <dmis-stat-card [value]="d.log_stats.total" label="Total Recipients" icon="fa-users" color="#0891b2" />
        <dmis-stat-card [value]="d.log_stats.sent" label="Sent" icon="fa-paper-plane" color="#10b981" />
        <dmis-stat-card [value]="d.log_stats.delivered" label="Delivered" icon="fa-check-double" color="#3b82f6" />
        <dmis-stat-card [value]="d.log_stats.failed" label="Failed" icon="fa-times-circle" color="#ef4444" />
      </div>

      <div class="row">
        <div class="col-lg-8">
          <div class="panel-row full" style="animation-delay:.20s;">
            <dmis-panel title="Dissemination Details" icon="fa-info-circle">
              <div class="panel-body">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;">
                  <div>
                    <div class="detail-label">Event</div>
                    <div class="detail-value"><a [routerLink]="['/m/one-health/events', d.event.id]" style="color:var(--primary);text-decoration:none;">{{ d.event.event_id }}</a></div>
                  </div>
                  <div>
                    <div class="detail-label">Type</div>
                    <div class="detail-value">{{ ucfirst(d.dissemination_type) }}</div>
                  </div>
                  <div>
                    <div class="detail-label">Language</div>
                    <div class="detail-value">{{ ucfirst(d.language) }}</div>
                  </div>
                  @if (d.sector) {
                    <div>
                      <div class="detail-label">Sector</div>
                      <div class="detail-value">{{ d.sector }}</div>
                    </div>
                  }
                  @if (d.target_audience.length) {
                    <div style="grid-column:1/-1;">
                      <div class="detail-label">Target Audience</div>
                      <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                        @for (a of d.target_audience; track a) { <span class="r-badge badge-active" style="font-size:0.7rem;">{{ ucfirst(a) }}</span> }
                      </div>
                    </div>
                  }
                </div>
                <div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid rgba(0,0,0,0.06);">
                  <div class="detail-label">Alert Message (English)</div>
                  <div class="detail-value" style="line-height:1.6;">{{ d.alert_message }}</div>
                </div>
                @if (d.alert_message_sw) {
                  <div style="margin-top:0.8rem;">
                    <div class="detail-label">Alert Message (Swahili)</div>
                    <div class="detail-value" style="line-height:1.6;">{{ d.alert_message_sw }}</div>
                  </div>
                }
                @if (d.directives) {
                  <div style="margin-top:0.8rem;">
                    <div class="detail-label">Directives</div>
                    <div class="detail-value" style="line-height:1.6;">{{ d.directives }}</div>
                  </div>
                }
                <div style="margin-top:0.8rem;">
                  <div class="detail-label">Channels</div>
                  <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    @for (c of d.channels; track c) { <span class="r-badge badge-inactive" style="font-size:0.7rem;">{{ ucfirst(c) }}</span> }
                    @empty { <span style="font-size:0.82rem;color:var(--text-mid);">-</span> }
                  </div>
                </div>
              </div>
            </dmis-panel>
          </div>

          <div class="panel-row full" style="animation-delay:.25s;">
            <dmis-panel title="Delivery Summary" icon="fa-chart-bar">
              <div class="panel-body">
                <div style="font-size:0.85rem;color:var(--text-dark);">
                  <i class="fas fa-sms" style="color:#0891b2;margin-right:0.3rem;"></i> {{ d.sms_sent_count }} SMS sent
                  <span style="margin:0 0.5rem;color:var(--text-light);">|</span>
                  <i class="fas fa-envelope" style="color:#003366;margin-right:0.3rem;"></i> {{ d.email_sent_count }} Emails sent
                </div>
              </div>
            </dmis-panel>
          </div>

          @if (d.dissemination_type === 'stakeholder' && d.stakeholders.length) {
            <div class="panel-row full" style="animation-delay:.30s;">
              <dmis-panel title="Target Stakeholders" icon="fa-users">
                <div class="panel-body">
                  <div style="overflow-x:auto;">
                    <table class="r-table">
                      <thead><tr><th>Institution</th><th>Email</th><th>Phone</th></tr></thead>
                      <tbody>
                        @for (s of d.stakeholders; track s.id) {
                          <tr class="data-row">
                            <td><div class="r-title">{{ s.organization }}</div><div class="r-subtitle">{{ s.name }}</div></td>
                            <td style="font-size:0.82rem;color:var(--text-mid);">{{ s.email }}</td>
                            <td style="font-size:0.82rem;color:var(--text-mid);">{{ s.phone }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </dmis-panel>
            </div>
          }

          @if (d.logs.length) {
            <div class="panel-row full" style="animation-delay:.35s;">
              <dmis-panel title="Delivery Logs" icon="fa-list-alt" [badge]="d.log_count + ' entries'">
                <div class="panel-body">
                  <div style="overflow-x:auto;max-height:300px;overflow-y:auto;">
                    <table class="r-table">
                      <thead><tr><th>Channel</th><th>Recipient</th><th>Status</th><th>Time</th></tr></thead>
                      <tbody>
                        @for (log of d.logs; track $index) {
                          <tr class="data-row">
                            <td><span class="r-badge badge-inactive" style="font-size:0.7rem;">{{ ucfirst(log.channel) }}</span></td>
                            <td style="font-size:0.82rem;color:var(--text-dark);">{{ log.recipient }}</td>
                            <td><span class="r-badge" [class]="'r-badge ' + logBadge(log.status)">{{ ucfirst(log.status) }}</span></td>
                            <td style="font-size:0.78rem;color:var(--text-mid);">{{ log.created_at }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </dmis-panel>
            </div>
          }
        </div>

        <div class="col-lg-4">
          <dmis-panel title="Actions" icon="fa-bolt">
            <div class="panel-body">
              <div class="d-grid gap-2">
                @if (d.approval_status === 'pending' && d.can_approve) {
                  <button type="button" class="btn-add w-100" style="background:#10b981;font-size:0.78rem;justify-content:center;" (click)="approve('approved')">
                    <i class="fas fa-check"></i> Approve & Send
                  </button>
                  <button type="button" class="btn-add w-100" style="background:#ef4444;font-size:0.78rem;justify-content:center;" (click)="approve('rejected')">
                    <i class="fas fa-times"></i> Reject
                  </button>
                }
                @if (d.status === 'sent' && d.can_approve) {
                  <button type="button" class="btn-add w-100" style="background:#f59e0b;font-size:0.78rem;justify-content:center;" (click)="resend()">
                    <i class="fas fa-redo"></i> Resend
                  </button>
                }
              </div>
            </div>
          </dmis-panel>

          <dmis-panel title="Approval Information" icon="fa-clipboard-check">
            <div class="panel-body">
              <div style="margin-bottom:0.6rem;">
                <div class="detail-label">Status</div>
                <span class="r-badge" [class]="'r-badge ' + approvalBadge(d.approval_status)">{{ ucfirst(d.approval_status) }}</span>
              </div>
              @if (d.approved_by_name) {
                <div style="margin-bottom:0.6rem;">
                  <div class="detail-label">Approved By</div>
                  <div class="detail-value">{{ d.approved_by_name }}</div>
                </div>
                <div style="margin-bottom:0.6rem;">
                  <div class="detail-label">Approved At</div>
                  <div class="detail-value">{{ d.approved_at }}</div>
                </div>
              }
              @if (d.approval_remarks) {
                <div>
                  <div class="detail-label">Remarks</div>
                  <div class="detail-value">{{ d.approval_remarks }}</div>
                </div>
              }
            </div>
          </dmis-panel>

          @if (d.sent_at) {
            <dmis-panel title="Dispatch Information" icon="fa-paper-plane">
              <div class="panel-body">
                <div style="margin-bottom:0.6rem;">
                  <div class="detail-label">Sent At</div>
                  <div class="detail-value">{{ d.sent_at }}</div>
                </div>
                <div>
                  <div class="detail-label">Sent By</div>
                  <div class="detail-value">{{ d.sent_by_name ?? '-' }}</div>
                </div>
              </div>
            </dmis-panel>
          }
        </div>
      </div>
    }
  `,
})
export class OhDisseminationShowComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  diss = signal<DissDetail | null>(null);

  private get id(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
  }

  load(): void {
    this.http.get<DissDetail>(`/api/v1/onehealth/disseminations/${this.id}`).subscribe(d => this.diss.set(d));
  }

  approve(action: 'approved' | 'rejected'): void {
    const confirmMsg = action === 'approved' ? 'Approve and send this dissemination?' : 'Reject this dissemination?';
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Confirm', text: confirmMsg, icon: 'question', showCancelButton: true,
        confirmButtonText: action === 'approved' ? 'Approve' : 'Reject',
        confirmButtonColor: action === 'approved' ? '#198754' : '#dc3545',
      }).then((result: any) => {
        if (!result.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/onehealth/disseminations/${this.id}/approve`, { approval_status: action }).subscribe({
          next: data => {
            if (data.success) {
              Swal.fire('Success', data.message, 'success').then(() => this.load());
            } else {
              Swal.fire('Error', data.message, 'error');
            }
          },
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  resend(): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Resend?', text: 'This will resend the dissemination to all recipients.',
        icon: 'question', showCancelButton: true,
      }).then((result: any) => {
        if (!result.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/onehealth/disseminations/${this.id}/resend`, {}).subscribe({
          next: data => Swal.fire('Success', data.message, 'success').then(() => this.load()),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  approvalBadge(s: string): string {
    return ({ pending: 'badge-pending', approved: 'badge-published', rejected: 'badge-rejected' } as Record<string, string>)[s] ?? 'badge-pending';
  }

  statusBadge(s: string): string {
    return ({
      draft: 'badge-inactive', pending_approval: 'badge-pending', approved: 'badge-active',
      sent: 'badge-published', failed: 'badge-rejected',
    } as Record<string, string>)[s] ?? 'badge-active';
  }

  logBadge(s: string): string {
    return ({ delivered: 'badge-published', sent: 'badge-active', failed: 'badge-rejected' } as Record<string, string>)[s] ?? 'badge-pending';
  }

  ucfirst(s: string): string {
    return (s ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }
}

/** Loads SweetAlert2 from the same CDN the Blade page pushes, once. */
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
      document.head.appendChild(script);
    });
  }
  return swalPromise;
}
