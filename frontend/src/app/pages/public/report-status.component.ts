import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

interface ReportStatus {
  reportCode: string;
  hazardType: string | null;
  locationDescription: string | null;
  urgencyLevel: string | null;
  status: string;
  statusLabel: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  area: { regionName: string; districtName: string };
  linkedIncident: {
    id: number;
    title: string;
    status: string;
    workflowStatus: string;
    publicUrl: string;
  } | null;
}

@Component({
    selector: 'public-report-status',
    imports: [FormsModule, RouterLink],
    template: `
    <div class="v2-page-content" style="max-width:min(980px,94vw);margin:0 auto;padding:7rem 1.5rem 4rem;">
      <a routerLink="/" style="color:#60a5fa;text-decoration:none;font-size:0.9rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>

      <section style="margin-top:1rem;background:var(--card-bg,#fff);border:1px solid rgba(15,23,42,0.1);border-radius:8px;padding:1.3rem;">
        <div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;margin-bottom:1rem;">
          <div style="width:42px;height:42px;border-radius:8px;background:rgba(13,59,102,0.1);color:#0d3b66;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-magnifying-glass-location"></i>
          </div>
          <div>
            <h1 style="font-size:1.45rem;font-weight:800;margin:0;color:var(--text-primary,#2C3E50);">{{ L.t('lbl_track_report') }}</h1>
            <div style="font-size:0.92rem;color:var(--text-secondary,#64748b);">{{ L.t('lbl_track_report_hint') }}</div>
          </div>
        </div>

        <form (ngSubmit)="lookup()" style="display:flex;gap:0.7rem;flex-wrap:wrap;">
          <input class="form-control" style="flex:1;min-width:230px;text-transform:uppercase;"
                 name="code" [(ngModel)]="code" placeholder="PHR-2026-00001" autocomplete="off">
          <button class="btn-gold" type="submit" [disabled]="loading() || !code.trim()">
            <i class="fas" [class.fa-search]="!loading()" [class.fa-spinner]="loading()" [class.fa-spin]="loading()"></i>
            {{ loading() ? L.t('lbl_checking') : L.t('lbl_track_report') }}
          </button>
        </form>

        @if (error()) {
          <div style="margin-top:1rem;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:0.75rem;font-size:0.92rem;">
            {{ error() }}
          </div>
        }
      </section>

      @if (result(); as r) {
        <section style="margin-top:1rem;background:var(--card-bg,#fff);border:1px solid rgba(15,23,42,0.1);border-radius:8px;overflow:hidden;">
          <div [style.background]="statusColor(r.status)" style="color:#fff;padding:1rem 1.2rem;">
            <div style="font-size:0.82rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">{{ r.reportCode }}</div>
            <h2 style="font-size:1.25rem;font-weight:800;margin:0.25rem 0 0;">{{ reportStatusLabel(r.status) }}</h2>
          </div>
          <div style="padding:1.1rem 1.2rem;display:grid;gap:0.8rem;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.8rem;">
              <div><div class="f-lbl">{{ L.t('lbl_hazard') }}</div>{{ r.hazardType || '-' }}</div>
              <div><div class="f-lbl">{{ L.t('lbl_urgency') }}</div>{{ urgencyLabel(r.urgencyLevel) }}</div>
              <div><div class="f-lbl">{{ L.t('lbl_submitted') }}</div>{{ fmtDate(r.submittedAt) }}</div>
              <div><div class="f-lbl">{{ L.t('lbl_last_review') }}</div>{{ r.reviewedAt ? fmtDate(r.reviewedAt) : L.t('lbl_pending') }}</div>
            </div>
            <div>
              <div class="f-lbl">{{ L.t('lbl_area') }}</div>
              {{ areaLine(r) }}
            </div>
            <div>
              <div class="f-lbl">{{ L.t('lbl_location') }}</div>
              {{ r.locationDescription || '-' }}
            </div>
            @if (r.reviewNotes) {
              <div style="background:#f8fafc;border:1px solid rgba(15,23,42,0.08);border-radius:8px;padding:0.75rem;">
                <div class="f-lbl">{{ L.t('lbl_review_note') }}</div>
                <div style="white-space:pre-line;">{{ r.reviewNotes }}</div>
              </div>
            }
            @if (r.linkedIncident) {
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:0.75rem;">
                <div class="f-lbl">{{ L.t('lbl_linked_incident') }}</div>
                <div style="font-weight:700;color:#0f172a;">{{ r.linkedIncident.title || (L.t('lbl_incident_number') + r.linkedIncident.id) }}</div>
                <div style="font-size:0.9rem;color:#475569;">{{ incidentStatusLabel(r.linkedIncident.status) }}</div>
                @if (r.linkedIncident.publicUrl) {
                  <a [routerLink]="r.linkedIncident.publicUrl" style="display:inline-flex;margin-top:0.5rem;color:#0d3b66;font-weight:700;text-decoration:none;">
                    {{ L.t('lbl_open_public_incident') }} <i class="fas fa-arrow-right ms-2" style="font-size:0.8rem;margin-top:0.22rem;"></i>
                  </a>
                } @else {
                  <div style="font-size:0.9rem;color:#64748b;margin-top:0.4rem;">{{ L.t('lbl_incident_not_published') }}</div>
                }
              </div>
            }
          </div>
        </section>
      }
    </div>
  `
})
export class ReportStatusComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  private router = inject(Router);

  code = '';
  loading = signal(false);
  error = signal('');
  result = signal<ReportStatus | null>(null);

  constructor(route: ActivatedRoute) {
    route.queryParamMap.subscribe(params => {
      const code = params.get('code');
      if (code) {
        this.code = code.toUpperCase();
        this.lookup(false);
      }
    });
  }

  lookup(updateUrl = true): void {
    const code = this.code.trim().toUpperCase();
    if (!code) { return; }
    this.code = code;
    this.loading.set(true);
    this.error.set('');
    this.http.get<ReportStatus>(`/api/v1/portal/report-status/${encodeURIComponent(code)}`).subscribe({
      next: r => {
        this.loading.set(false);
        this.result.set(r);
        if (updateUrl) {
          this.router.navigate([], { queryParams: { code }, replaceUrl: true });
        }
      },
      error: () => {
        this.loading.set(false);
        this.result.set(null);
        this.error.set(this.L.t('lbl_report_reference_not_found'));
      },
    });
  }

  areaLine(r: ReportStatus): string {
    return [r.area?.districtName, r.area?.regionName].filter(Boolean).join(', ') || this.L.t('lbl_not_assigned_yet');
  }

  reportStatusLabel(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'reviewing': return this.L.t('lbl_report_status_reviewing');
      case 'converted': return this.L.t('lbl_report_status_converted');
      case 'dismissed': return this.L.t('lbl_report_status_dismissed');
      default: return this.L.t('lbl_report_status_received');
    }
  }

  urgencyLabel(value: string | null): string {
    const key = (value || '').toLowerCase();
    switch (key) {
      case 'low': return this.L.t('lbl_urgency_low');
      case 'medium': return this.L.t('lbl_urgency_medium');
      case 'high': return this.L.t('lbl_urgency_high');
      case 'critical': return this.L.t('lbl_urgency_critical');
      default: return value || '-';
    }
  }

  incidentStatusLabel(value: string | null): string {
    const key = (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    switch (key) {
      case 'reported': return this.L.t('lbl_status_reported');
      case 'pending_verification': return this.L.t('lbl_status_pending_verification');
      case 'verified': return this.L.t('lbl_status_verified');
      case 'active_response': return this.L.t('lbl_status_active_response');
      case 'monitoring': return this.L.t('lbl_status_monitoring');
      case 'escalated': return this.L.t('lbl_status_escalated');
      case 'resolved': return this.L.t('lbl_status_resolved');
      case 'closed': return this.L.t('lbl_status_closed');
      case 'information_only': return this.L.t('lbl_status_information_only');
      default: return value || '-';
    }
  }

  fmtDate(value: string | null): string {
    if (!value) { return this.L.t('lbl_pending'); }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) { return value; }
    return new Intl.DateTimeFormat(this.L.lang() === 'sw' ? 'sw-TZ' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  }

  statusColor(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'converted': return '#059669';
      case 'reviewing': return '#2563eb';
      case 'dismissed': return '#64748b';
      default: return '#d97706';
    }
  }
}
