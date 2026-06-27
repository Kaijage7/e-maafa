import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';
import { incidentLifecycle } from './incident-lifecycle';

interface SnapshotIncident {
  id: number; title: string; severityLevel: string; status: string; workflowStatus: string;
  latitude: number | null; longitude: number | null; regionName: string; districtName: string;
  locationDescription: string; description: string; actionTaken: string | null; emergencyNeeds: string | null;
  deathsTotal: number; injuredTotal: number; missingTotal: number; displaced: number; childrenAffected: number;
  reportedAt: string; updatedAt: string; hazardName: string; incidentType: string;
}
interface SnapResource { resource: string; quantity: number; unit: string; status: string; }
interface SnapUpdate { detail: string; type: string; at: string; }

/**
 * Public LIVE incident snapshot ("/incident/{id}") — the page the portal map markers and the
 * News & Events article link to. Read-only public view served by GET /v1/portal/incidents/{id},
 * which only returns incidents an operator has explicitly pushed to the portal map. Shows the
 * situation, the response resources allocated to it, and the live updates timeline; it reflects the
 * system as it is updated (re-fetched on each visit).
 */
@Component({
  selector: 'public-incident-snapshot',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 980px; margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      @if (snap(); as s) {
        <a routerLink="/portal" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_portal') }}</a>

        <!-- Header card -->
        <div style="margin-top:1rem;border:1px solid rgba(0,0,0,0.08);border-radius:16px;overflow:hidden;background:var(--card-bg,#fff);">
          <div [style.background]="sevColor(s.incident.severityLevel)" style="padding:1.2rem 1.4rem;color:#fff;">
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
              <span style="background:rgba(255,255,255,0.25);font-size:0.7rem;font-weight:700;padding:3px 12px;border-radius:10px;text-transform:uppercase;letter-spacing:0.5px;">
                <i class="fas fa-circle" style="font-size:0.6rem;"></i> {{ L.t('snap_live_incident') }}
              </span>
              <span style="background:rgba(255,255,255,0.25);font-size:0.7rem;font-weight:700;padding:3px 12px;border-radius:10px;">{{ s.incident.severityLevel || L.t('snap_unknown') }}</span>
              <span style="font-size:0.78rem;opacity:0.92;">{{ s.incident.hazardName }}{{ s.incident.incidentType ? ' · ' + s.incident.incidentType : '' }}</span>
            </div>
            <h1 style="font-weight:800;line-height:1.25;margin:0.7rem 0 0.3rem;font-size:1.6rem;">{{ s.incident.title }}</h1>
            <div style="font-size:0.86rem;opacity:0.95;">
              <i class="fas fa-map-marker-alt me-1"></i>{{ areaLine(s.incident) }}
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:1.2rem;padding:0.9rem 1.4rem;font-size:0.8rem;color:var(--text-secondary,#64748b);">
            <span><i class="fas fa-flag me-1"></i><span [style.color]="lc(s.incident.status).color" style="font-weight:700;">{{ lc(s.incident.status).label }}</span> · {{ s.incident.status || '—' }}</span>
            <span><i class="fas fa-clock me-1"></i>{{ L.t('snap_reported') }} {{ fmt(s.incident.reportedAt) }}</span>
            <span><i class="fas fa-sync me-1"></i>{{ L.t('snap_updated') }} {{ fmt(s.incident.updatedAt) }}</span>
          </div>
        </div>

        <!-- Human impact -->
        <h4 style="font-weight:800;color:var(--text-primary,#2C3E50);margin:1.8rem 0 0.8rem;">{{ L.t('snap_human_impact') }}</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.8rem;">
          @for (k of impactCards(s.incident); track k.label) {
            <div style="border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:0.8rem 1rem;background:var(--card-bg,#fff);">
              <div style="font-size:1.5rem;font-weight:800;" [style.color]="k.color">{{ k.value }}</div>
              <div style="font-size:0.76rem;color:var(--text-secondary,#64748b);">{{ k.label }}</div>
            </div>
          }
        </div>

        <!-- Situation -->
        @if (s.incident.description) {
          <h4 style="font-weight:800;color:var(--text-primary,#2C3E50);margin:1.8rem 0 0.6rem;">{{ L.t('snap_situation') }}</h4>
          <p style="font-size:0.95rem;color:var(--text-secondary,#475569);line-height:1.8;white-space:pre-line;">{{ s.incident.description }}</p>
        }
        @if (s.incident.actionTaken) {
          <div style="margin-top:0.8rem;background:rgba(16,185,129,0.08);border-radius:12px;padding:0.8rem 1rem;">
            <div style="font-size:0.74rem;font-weight:700;color:#059669;text-transform:uppercase;">{{ L.t('snap_action_taken') }}</div>
            <div style="font-size:0.9rem;color:var(--text-primary,#2C3E50);">{{ s.incident.actionTaken }}</div>
          </div>
        }

        <!-- Response & resources -->
        <h4 style="font-weight:800;color:var(--text-primary,#2C3E50);margin:1.8rem 0 0.8rem;">{{ L.t('snap_response_resources') }}</h4>
        @if (s.resources.length) {
          <div style="overflow-x:auto;border:1px solid rgba(0,0,0,0.08);border-radius:12px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.86rem;">
              <thead><tr style="background:rgba(0,51,102,0.05);text-align:left;">
                <th style="padding:0.6rem 0.9rem;">{{ L.t('snap_th_resource') }}</th><th style="padding:0.6rem 0.9rem;">{{ L.t('snap_th_quantity') }}</th><th style="padding:0.6rem 0.9rem;">{{ L.t('snap_th_status') }}</th>
              </tr></thead>
              <tbody>
                @for (r of s.resources; track $index) {
                  <tr style="border-top:1px solid rgba(0,0,0,0.06);">
                    <td style="padding:0.55rem 0.9rem;">{{ r.resource }}</td>
                    <td style="padding:0.55rem 0.9rem;">{{ r.quantity }} {{ r.unit || '' }}</td>
                    <td style="padding:0.55rem 0.9rem;">{{ r.status || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p style="font-size:0.88rem;color:var(--text-secondary,#64748b);"><i class="fas fa-box-open me-1"></i>{{ L.t('snap_no_resources') }}</p>
        }

        <!-- Live updates -->
        <h4 style="font-weight:800;color:var(--text-primary,#2C3E50);margin:1.8rem 0 0.8rem;">{{ L.t('snap_live_updates') }}</h4>
        @if (s.updates.length) {
          @for (u of s.updates; track $index) {
            <div style="display:flex;gap:0.8rem;padding:0.6rem 0;border-bottom:1px solid rgba(0,0,0,0.06);">
              <div style="color:#7c3aed;"><i class="fas fa-circle" style="font-size:0.5rem;"></i></div>
              <div>
                <div style="font-size:0.9rem;color:var(--text-primary,#2C3E50);">{{ u.detail }}</div>
                <div style="font-size:0.72rem;color:#94a3b8;">{{ u.type }} · {{ fmt(u.at) }}</div>
              </div>
            </div>
          }
        } @else {
          <p style="font-size:0.88rem;color:var(--text-secondary,#64748b);"><i class="fas fa-stream me-1"></i>{{ L.t('snap_no_updates') }}</p>
        }
      } @else if (notFound()) {
        <div style="text-align:center;padding:6rem 1rem;color:var(--text-secondary,#64748b);">
          <i class="fas fa-shield-alt" style="font-size:3rem;opacity:0.3;"></i>
          <h4 style="margin-top:1rem;">{{ L.t('snap_not_available') }}</h4>
          <p style="font-size:0.88rem;">{{ L.t('snap_not_available_detail') }}</p>
          <a routerLink="/portal" style="color:#60a5fa;">{{ L.t('lbl_portal') }}</a>
        </div>
      }
    </div>
  `,
})
export class IncidentSnapshotComponent {
  L = inject(PortalLabels);
  protected readonly lc = incidentLifecycle;
  private http = inject(HttpClient);
  snap = signal<{ incident: SnapshotIncident; resources: SnapResource[]; updates: SnapUpdate[] } | null>(null);
  notFound = signal(false);

  constructor(route: ActivatedRoute) {
    route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.http.get<{ incident: SnapshotIncident; resources: SnapResource[]; updates: SnapUpdate[] }>(`/api/v1/portal/incidents/${id}`)
        .subscribe({
          next: r => { this.snap.set(r); this.notFound.set(false); window.scrollTo(0, 0); },
          error: () => { this.snap.set(null); this.notFound.set(true); },
        });
    });
  }

  sevColor(sev: string): string {
    switch ((sev || '').toLowerCase()) {
      case 'critical': return '#b91c1c';
      case 'major': return '#dc2626';
      case 'moderate': return '#d97706';
      case 'minor': return '#2563eb';
      default: return '#475569';
    }
  }

  areaLine(i: SnapshotIncident): string {
    const seen = new Set<string>();
    const parts = [i.locationDescription, i.districtName, i.regionName]
      .filter(Boolean)
      .filter(p => { const k = p!.trim().toLowerCase(); return seen.has(k) ? false : (seen.add(k), true); });
    return parts.join(', ') || 'Tanzania';
  }

  impactCards(i: SnapshotIncident) {
    return [
      { label: this.L.t('snap_deaths'), value: i.deathsTotal ?? 0, color: '#dc2626' },
      { label: this.L.t('snap_injured'), value: i.injuredTotal ?? 0, color: '#d97706' },
      { label: this.L.t('snap_missing'), value: i.missingTotal ?? 0, color: '#7c3aed' },
      { label: this.L.t('snap_displaced'), value: i.displaced ?? 0, color: '#0ea5e9' },
      { label: this.L.t('snap_children_affected'), value: i.childrenAffected ?? 0, color: '#059669' },
    ];
  }

  fmt(s: string): string {
    if (!s) { return '—'; }
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  }
}
