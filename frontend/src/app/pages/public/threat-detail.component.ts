import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addTanzaniaGisBase, addMapNav } from '../../core/tz-map';
import { escapeHtml } from '../../core/html';
import { PortalLabels } from './portal-i18n';

declare const L: any;

interface Threat {
  id: number; name: string; sourceAgency: string; trendLabel: string; severity: string;
  graphicPath: string | null; descriptionEn: string; descriptionSw: string;
  pastImpactsEn?: string; pastImpactsSw?: string;
}
interface ThreatUpdate { title: string; detail: string; status: 'UPCOMING' | 'NEW' | 'ONGOING' | 'COMPLETED' | 'POSTPONED'; startsOn: string | null; endsOn: string | null; }
interface ThreatPlan {
  planTitle: string; stakeholderType: string; stakeholderName: string; region: string;
  latitude: number | null; longitude: number | null; status: string; submittedOn: string;
}

const SEVERITY_COLORS: Record<string, string> = { Emergency: '#dc2626', Warning: '#d97706', Watch: '#2563eb' };
const UPDATE_COLORS: Record<string, string> = {
  UPCOMING: '#2563eb', NEW: '#dc2626', ONGOING: '#d97706', COMPLETED: '#059669', POSTPONED: '#64748b',
};
const STAKEHOLDER_TYPES = ['sector', 'region', 'lga', 'ras', 'partner'];

/**
 * Public threat page ("/threats/{id}") — opened from the THREATS strip beside live monitoring.
 * Shows: the threat (source agency, global trend, severity), the DMD intervention timeline
 * (UPCOMING/NEW → ONGOING → COMPLETED, or POSTPONED — managed in Content Management), the stakeholder-plan map
 * (sector/regional/LGA contingency plans submitted to PMO, geo-plotted and repository-tracked),
 * the plan-submission form, and the threat's PAST IMPACTS to Tanzania (per the National
 * Disaster Risk Financing and Implementation Plan 2025/26–2030/31).
 */
@Component({
  selector: 'public-threat-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 1080px; margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      <a routerLink="/portal" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_portal') }}</a>

      @if (threat(); as t) {
        <!-- ===== Threat header ===== -->
        <div style="display:flex;align-items:center;gap:16px;margin:1rem 0 0.5rem;flex-wrap:wrap;">
          <div style="width:58px;height:58px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#fff;" [style.background]="sevColor(t.severity)">
            <i class="fas fa-satellite-dish"></i>
          </div>
          <div style="flex:1;min-width:240px;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0;">{{ t.name }}</h1>
              <span [style.background]="sevColor(t.severity)" style="color:#fff;font-size:0.66rem;font-weight:800;padding:3px 12px;border-radius:12px;text-transform:uppercase;">{{ t.severity }}</span>
            </div>
            <p style="color:var(--text-secondary, #64748b);margin:0.25rem 0 0;font-size:0.88rem;">
              <i class="fas fa-broadcast-tower me-1"></i>Source: <strong>{{ t.sourceAgency }}</strong>
              <span class="ms-3"><i class="fas fa-chart-line me-1"></i>{{ t.trendLabel }}</span>
            </p>
          </div>
        </div>
        <p style="font-size:0.95rem;color:var(--text-secondary, #475569);line-height:1.8;max-width:820px;">
          {{ L.lang() === 'sw' ? t.descriptionSw : t.descriptionEn }}
        </p>

        <!-- Source-agency graphic (e.g. the TMA outlook chart — managed in CM, changeable) -->
        @if (t.graphicPath) {
          <figure style="margin:1rem 0 0;max-width:680px;">
            <img [src]="'/api/storage/' + t.graphicPath" [alt]="t.name + ' outlook graphic'"
                 style="width:100%;border-radius:14px;border:1px solid rgba(0,0,0,0.08);">
            <figcaption style="font-size:0.72rem;color:#94a3b8;margin-top:4px;">Source: {{ t.sourceAgency }}</figcaption>
          </figure>
        }

        <!-- ===== DMD interventions timeline ===== -->
        <h4 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:1.8rem 0 1rem;">
          <i class="fas fa-tasks me-2" style="color:#003366;"></i>DMD Interventions
        </h4>
        <div style="display:grid;gap:0.7rem;">
          @for (u of updates(); track u.title) {
            <div style="display:flex;gap:14px;align-items:flex-start;border:1px solid rgba(0,0,0,0.08);border-radius:14px;background:var(--card-bg, #fff);padding:1rem 1.1rem;">
              <span [style.background]="updateColor(u.status)" style="flex-shrink:0;color:#fff;font-size:0.62rem;font-weight:800;padding:3px 10px;border-radius:10px;margin-top:2px;">{{ u.status }}</span>
              <div>
                <div style="font-size:0.95rem;font-weight:700;color:var(--text-primary, #2C3E50);">{{ u.title }}</div>
                @if (u.detail) { <div style="font-size:0.84rem;color:var(--text-secondary, #64748b);line-height:1.6;margin-top:3px;">{{ u.detail }}</div> }
                @if (u.startsOn) {
                  <div style="font-size:0.74rem;color:#94a3b8;margin-top:4px;"><i class="fas fa-calendar me-1"></i>{{ u.startsOn }}@if (u.endsOn) { — {{ u.endsOn }} }</div>
                }
              </div>
            </div>
          } @empty {
            <p style="color:var(--text-secondary, #64748b);font-size:0.88rem;">Interventions will be announced here.</p>
          }
        </div>

        <!-- ===== Stakeholder plans: map + list + submission ===== -->
        <h4 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:2rem 0 0.4rem;">
          <i class="fas fa-map-marked-alt me-2" style="color:#003366;"></i>Stakeholder Plans
        </h4>
        <p style="color:var(--text-secondary, #64748b);font-size:0.85rem;margin-bottom:1rem;">
          Sector, regional and LGA contingency plans submitted to PMO under this threat — plotted below and tracked in the disaster repository.
        </p>
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:1rem;align-items:start;">
          <div #planMap style="height:500px;border-radius:16px;border:1px solid rgba(0,0,0,0.08);background:#d7e8f5;z-index:1;"></div>
          <div style="display:grid;gap:0.6rem;max-height:500px;overflow-y:auto;">
            @for (p of plans(); track p.planTitle + p.stakeholderName) {
              <div style="border:1px solid rgba(0,0,0,0.08);border-radius:12px;background:var(--card-bg, #fff);padding:0.8rem 0.9rem;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="background:rgba(0,51,102,0.08);color:#003366;font-size:0.62rem;font-weight:700;padding:2px 8px;border-radius:8px;text-transform:uppercase;">{{ p.stakeholderType }}</span>
                  <span [style.color]="planStatusColor(p.status)" style="font-size:0.68rem;font-weight:700;margin-left:auto;">{{ p.status }}</span>
                </div>
                <div style="font-size:0.86rem;font-weight:700;color:var(--text-primary, #2C3E50);margin:0.35rem 0 0.1rem;">{{ p.planTitle }}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary, #64748b);">{{ p.stakeholderName }}{{ p.region ? ' · ' + p.region : '' }} — {{ p.submittedOn }}</div>
              </div>
            } @empty {
              <div style="text-align:center;color:var(--text-secondary, #64748b);padding:1.6rem;border:1px dashed rgba(0,0,0,0.12);border-radius:12px;font-size:0.85rem;">
                No plans submitted yet — be the first stakeholder to respond.
              </div>
            }
          </div>
        </div>

        <!-- Plan submission (stakeholders) -->
        <div style="border:1px solid rgba(0,0,0,0.08);border-radius:16px;background:var(--card-bg, #fff);padding:1.3rem 1.4rem;margin-top:1.2rem;">
          <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0 0 0.9rem;"><i class="fas fa-file-upload me-2" style="color:#003366;"></i>Submit your plan to PMO</h5>
          @if (!planDone()) {
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
              <input class="form-control" placeholder="Plan title *" [value]="fTitle()" (input)="fTitle.set($any($event.target).value)">
              <input class="form-control" placeholder="Stakeholder / organisation *" [value]="fName()" (input)="fName.set($any($event.target).value)">
              <select class="form-control" [value]="fType()" (change)="fType.set($any($event.target).value)">
                @for (st of stakeholderTypes; track st) { <option [value]="st">{{ st.toUpperCase() }}</option> }
              </select>
              <select class="form-control" [value]="fRegion()" (change)="onRegion($any($event.target).value)">
                <option value="">Region (places the plan on the map)</option>
                @for (r of regions(); track r) { <option [value]="r">{{ r }}</option> }
              </select>
              <div style="display:flex;gap:0.5rem;align-items:center;grid-column:1 / -1;">
                <input class="form-control" style="flex:1;" placeholder="Plan document (PDF) — upload →" [value]="fFile()" readonly>
                <label class="btn-gold" style="cursor:pointer;margin:0;white-space:nowrap;">
                  <i class="fas" [class.fa-upload]="!uploading()" [class.fa-spinner]="uploading()" [class.fa-spin]="uploading()"></i>
                  <input type="file" accept=".pdf" hidden (change)="uploadPlan($any($event.target).files)">
                </label>
              </div>
            </div>
            @if (planError()) { <div style="color:#dc2626;font-size:0.82rem;margin-top:0.6rem;">{{ planError() }}</div> }
            <button class="btn-gold" style="margin-top:0.9rem;" [disabled]="!fTitle().trim() || !fName().trim() || planSaving()" (click)="submitPlan()">
              <i class="fas" [class.fa-paper-plane]="!planSaving()" [class.fa-spinner]="planSaving()" [class.fa-spin]="planSaving()"></i>
              {{ planSaving() ? 'Submitting…' : 'Submit to PMO' }}
            </button>
          } @else {
            <div style="display:flex;align-items:center;gap:12px;color:#059669;">
              <i class="fas fa-check-circle" style="font-size:1.6rem;"></i>
              <div style="font-size:0.9rem;font-weight:600;">Plan received — it now appears on the threat map and is tracked in the disaster repository.</div>
            </div>
          }
        </div>

        <!-- ===== Past impacts (NDRF-IP 2025/26–2030/31) ===== -->
        @if (t.pastImpactsEn || t.pastImpactsSw) {
          <h4 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:2rem 0 0.8rem;">
            <i class="fas fa-history me-2" style="color:#003366;"></i>{{ L.lang() === 'sw' ? 'Athari za Nyuma kwa Tanzania' : 'Past Impacts to Tanzania' }}
          </h4>
          <!-- white-space:pre-line keeps the episode paragraphs (1997/98, 2023/24, financing) separated -->
          <div style="border-left:4px solid #003366;background:rgba(0,51,102,0.04);border-radius:0 14px 14px 0;padding:1.1rem 1.3rem;font-size:0.9rem;color:var(--text-secondary, #475569);line-height:1.8;white-space:pre-line;">
            {{ L.lang() === 'sw' ? (t.pastImpactsSw || t.pastImpactsEn) : t.pastImpactsEn }}
          </div>
          <a routerLink="/education" style="display:inline-block;margin-top:0.8rem;color:#60a5fa;font-size:0.85rem;text-decoration:none;">
            {{ L.t('lbl_education') }} <i class="fas fa-arrow-right ms-1" style="font-size:0.7rem;"></i>
          </a>
        }
      }
    </div>
  `,
})
export class ThreatDetailComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('planMap');

  stakeholderTypes = STAKEHOLDER_TYPES;
  threat = signal<Threat | null>(null);
  updates = signal<ThreatUpdate[]>([]);
  plans = signal<ThreatPlan[]>([]);
  regions = signal<string[]>([]);
  /** Region-name → centroid, derived from the official GIS regions; auto-geolocates plans. */
  private centroids = new Map<string, [number, number]>();
  private threatId = 0;
  private map: any;
  private planLayer: any;

  // submission form
  fTitle = signal(''); fName = signal(''); fType = signal('sector'); fRegion = signal(''); fFile = signal('');
  planSaving = signal(false); planDone = signal(false); planError = signal(''); uploading = signal(false);
  private fLat: number | null = null;
  private fLng: number | null = null;

  constructor(route: ActivatedRoute) {
    // Region list + centroids from the official GIS layer (no hardcoding; always 31 regions)
    this.http.get<any>('/geojson/tz_regions_gis.geojson').subscribe(gj => {
      const names: string[] = [];
      for (const f of gj.features) {
        const name = f.properties.Region_Nam ?? f.properties.name;
        names.push(name);
        this.centroids.set(name, centroidOf(f.geometry));
      }
      this.regions.set(names.sort());
    });
    route.paramMap.subscribe(params => {
      this.threatId = Number(params.get('id'));
      this.reload();
    });
  }

  private reload(): void {
    this.http.get<{ threat: Threat; updates: ThreatUpdate[]; plans: ThreatPlan[] }>(
      `/api/v1/portal/threats/${this.threatId}`).subscribe(r => {
        this.threat.set(r.threat);
        this.updates.set(r.updates);
        this.plans.set(r.plans);
        document.title = `${r.threat.name} — Threats — e-MAAFA`;
        setTimeout(() => this.renderMap(), 0);
        window.scrollTo(0, 0);
      });
  }

  sevColor = (sev: string) => SEVERITY_COLORS[sev] ?? '#2563eb';
  updateColor = (status: string) => UPDATE_COLORS[status] ?? '#6b7280';
  planStatusColor = (status: string) =>
    status === 'Approved' ? '#059669' : status === 'Under review' ? '#d97706' : '#6b7280';

  onRegion(region: string): void {
    this.fRegion.set(region);
    const c = this.centroids.get(region);
    this.fLat = c?.[0] ?? null;
    this.fLng = c?.[1] ?? null;
  }

  uploadPlan(files: FileList | null): void {
    const file = files?.[0];
    if (!file) { return; }
    this.uploading.set(true);
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'plans');
    this.http.post<{ path: string }>('/api/v1/content/upload', form).subscribe({
      next: r => { this.uploading.set(false); this.fFile.set(r.path); },
      error: e => { this.uploading.set(false); this.planError.set(e?.error?.message || 'Upload failed.'); },
    });
  }

  submitPlan(): void {
    this.planSaving.set(true);
    this.planError.set('');
    this.http.post(`/api/v1/portal/threats/${this.threatId}/plans`, {
      planTitle: this.fTitle().trim(), stakeholderName: this.fName().trim(),
      stakeholderType: this.fType(), region: this.fRegion() || null,
      latitude: this.fLat, longitude: this.fLng, filePath: this.fFile() || null,
    }).subscribe({
      next: () => { this.planSaving.set(false); this.planDone.set(true); this.reload(); },
      error: e => { this.planSaving.set(false); this.planError.set(e?.error?.message || 'Could not submit the plan.'); },
    });
  }

  private renderMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || typeof L === 'undefined') { return; }
    if (!this.map) {
      this.map = L.map(el, { center: [-6.3, 35.0], zoom: 5, minZoom: 5, maxZoom: 10,
        maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0, attributionControl: false });
      addTanzaniaGisBase(this.map, this.http);
      addMapNav(this.map, { home: [-6.3, 35.0, 5] });
    }
    if (this.planLayer) { this.map.removeLayer(this.planLayer); }
    this.planLayer = L.layerGroup().addTo(this.map);
    for (const p of this.plans()) {
      if (p.latitude == null || p.longitude == null) { continue; }
      L.circleMarker([p.latitude, p.longitude],
        { radius: 9, fillColor: this.planStatusColor(p.status), color: '#fff', weight: 2, fillOpacity: 0.9 })
        .addTo(this.planLayer)
        .bindPopup(`<strong>${escapeHtml(p.planTitle)}</strong><br>${escapeHtml(p.stakeholderName)} (${escapeHtml((p.stakeholderType ?? '').toUpperCase())})`
          + `<br>${escapeHtml(p.region ?? '')} · ${escapeHtml(p.status)}`);
    }
  }
}

/** Rough polygon centroid (average of outer-ring vertices) — sufficient for map placement. */
function centroidOf(geometry: any): [number, number] {
  const ring: number[][] = geometry.type === 'MultiPolygon'
    ? geometry.coordinates[0][0]
    : geometry.coordinates[0];
  let lat = 0;
  let lng = 0;
  for (const [x, y] of ring) { lng += x; lat += y; }
  return [lat / ring.length, lng / ring.length];
}
