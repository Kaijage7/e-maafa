import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addTanzaniaGisBase, addAdminDrilldown, addMapNav, RegionFill, DistrictFill } from '../../core/tz-map';
import { PortalLabels } from './portal-i18n';
import { incidentLifecycle } from './incident-lifecycle';
import { PublicInformExplorerComponent } from './inform-explorer.component';

declare const L: any;

interface Shelter {
  name: string; region: string; district: string; capacity: number | null;
  status: string; accessibility: string; latitude: number; longitude: number;
}

interface PortalWarning {
  id: number; warningCode: string; hazardType: string; severityLevel: string;
  alertMessage: string; affectedRegions: string; affectedDistricts?: string | null; latitude: number; longitude: number; peopleAtRisk: number;
  bulletinUrl?: string | null; bulletinDescription?: string | null;
}

interface PortalIncident {
  id: number; title: string; severityLevel: string; status: string;
  latitude: number | null; longitude: number | null; regionName?: string | null;
  pinnedToMap?: boolean;
}
interface PortalAreaPoint { name: string; lat: number; lng: number; level: string; }
interface PortalBulletin {
  id: number; title: string; severity: string; centroidLat: number; centroidLng: number; pdfUrl: string;
  areaPoints?: PortalAreaPoint[]; hazardType?: string;
}

/**
 * Public live portal ("/portal") — reproduces public/portal.blade.php's core: a full-page
 * Tanzania situation map with all active warnings, the warnings list beside it, and the
 * citizen actions (report a hazard via the landing wizard, register as stakeholder).
 */
@Component({
  selector: 'public-live-portal',
  standalone: true,
  imports: [RouterLink, PublicInformExplorerComponent],
  template: `
    <div class="v2-page-content" style="max-width: 1280px; margin: 0 auto; padding: 6.5rem 1.5rem 3rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.8rem;margin-bottom:1rem;">
        <div>
          <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0;">{{ L.t('lbl_portal') }}</h1>
          <p style="color:var(--text-secondary, #64748b);margin:0.2rem 0 0;">{{ L.t('lbl_live_monitoring') }} — {{ warnings().length + bulletins().length }} {{ L.t('lbl_active_warnings') }}</p>
        </div>
        <div style="display:flex;gap:0.6rem;align-items:center;">
          @if (view() === 'live') {
          <div style="display:flex;border:1px solid rgba(0,51,102,0.25);border-radius:20px;overflow:hidden;">
            <button type="button" (click)="setLayer('warnings')" [style.background]="layer() === 'warnings' ? '#003366' : 'transparent'" [style.color]="layer() === 'warnings' ? '#fff' : '#475569'"
                    style="border:none;padding:0.45rem 1rem;font-size:0.8rem;font-weight:600;cursor:pointer;"><i class="fas fa-exclamation-triangle me-1"></i>{{ L.t('lbl_alerts') }}</button>
            <button type="button" (click)="setLayer('shelters')" [style.background]="layer() === 'shelters' ? '#059669' : 'transparent'" [style.color]="layer() === 'shelters' ? '#fff' : '#475569'"
                    style="border:none;padding:0.45rem 1rem;font-size:0.8rem;font-weight:600;cursor:pointer;"><i class="fas fa-house-user me-1"></i>{{ L.t('pp_evacuation_centers') }}</button>
          </div>
          }
          <a routerLink="/" fragment="report" class="btn-gold" style="text-decoration:none;"><i class="fas fa-flag"></i> {{ L.t('lbl_report_hazard') }}</a>
          <button class="btn-outline-gold" type="button" (click)="openRegister()"><i class="fas fa-handshake"></i> {{ L.t('pp_register_as_stakeholder') }}</button>
        </div>
      </div>

      <!-- Portal sub-view switch: live monitoring vs the INFORM subnational risk index (embedded in the portal, per request) -->
      <div style="display:flex;gap:0.3rem;border-bottom:2px solid rgba(0,0,0,0.08);margin-bottom:1.1rem;">
        <button type="button" (click)="view.set('live')" [style.color]="view()==='live' ? '#003366' : '#64748b'" [style.borderBottomColor]="view()==='live' ? '#003366' : 'transparent'"
                style="background:none;border:none;border-bottom:3px solid transparent;margin-bottom:-2px;padding:0.6rem 1.15rem;font-size:0.86rem;font-weight:700;cursor:pointer;"><i class="fas fa-satellite-dish me-1"></i>{{ L.t('pp_view_live') }}</button>
        <button type="button" (click)="view.set('inform')" [style.color]="view()==='inform' ? '#003366' : '#64748b'" [style.borderBottomColor]="view()==='inform' ? '#003366' : 'transparent'"
                style="background:none;border:none;border-bottom:3px solid transparent;margin-bottom:-2px;padding:0.6rem 1.15rem;font-size:0.86rem;font-weight:700;cursor:pointer;"><i class="fas fa-layer-group me-1"></i>{{ L.t('pp_view_inform') }}</button>
      </div>

      @if (view() === 'inform') {
        <public-inform-explorer [embedded]="true" />
      } @else {
      <div style="display:grid;grid-template-columns:1fr 440px;gap:1.2rem;align-items:start;">
        <!-- Live map -->
        <div style="position:relative;">
          <div #portalMap style="height:calc(100vh - 240px);min-height:480px;border-radius:16px;border:1px solid rgba(0,0,0,0.08);background:#d7e8f5;z-index:1;"></div>
          <div style="position:absolute;bottom:14px;right:14px;z-index:600;background:rgba(255,255,255,0.92);border:1px solid rgba(0,51,102,0.12);border-radius:10px;padding:0.5rem 0.7rem;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
            <div style="font-size:0.58rem;font-weight:700;color:#2C3E50;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">{{ L.t('pp_alert_level') }}</div>
            <div style="display:flex;flex-direction:column;gap:2px;font-size:0.66rem;font-weight:600;color:#475569;">
              <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#ef4444;margin-right:5px;"></span>{{ L.t('pp_emergency') }}</span>
              <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#f59e0b;margin-right:5px;"></span>{{ L.t('pp_warning') }}</span>
              <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#3b82f6;margin-right:5px;"></span>{{ L.t('pp_watch') }}</span>
              <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#eef2f5;border:1px solid #c2ccd6;margin-right:5px;"></span>{{ L.t('pp_no_alerts') }}</span>
            </div>
          </div>
          @if (drilled()) {
            <button (click)="resetMap()" style="position:absolute;top:14px;left:54px;z-index:600;background:rgba(255,255,255,0.92);border:1px solid rgba(0,51,102,0.2);color:#003366;border-radius:18px;padding:0.35rem 0.9rem;font-size:0.76rem;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
              <i class="fas fa-arrow-left me-1"></i> Tanzania
            </button>
          }
        </div>

        <!-- Side list: warnings or evacuation centers, following the map layer -->
        <div style="display:grid;gap:0.7rem;max-height:calc(100vh - 240px);overflow-y:auto;">
          @if (layer() === 'shelters') {
            @for (sh of shelters(); track sh.name) {
              <div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;background:var(--card-bg, #fff);padding:0.9rem 1rem;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="background:#059669;color:#fff;font-size:0.62rem;font-weight:800;padding:2px 9px;border-radius:9px;">{{ L.t('pp_center') }}</span>
                  <span style="font-size:0.7rem;color:#94a3b8;">{{ sh.status }}</span>
                </div>
                <div style="font-size:0.9rem;font-weight:700;color:var(--text-primary, #2C3E50);margin:0.4rem 0 0.2rem;">{{ sh.name }}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary, #64748b);">{{ sh.region }}{{ sh.district ? ' · ' + sh.district : '' }} — {{ L.t('pp_capacity') }} {{ sh.capacity ?? 'N/A' }}</div>
                <a target="_blank" [href]="'https://www.google.com/maps/dir/?api=1&destination=' + sh.latitude + ',' + sh.longitude"
                   style="font-size:0.74rem;color:#059669;font-weight:700;text-decoration:none;"><i class="fas fa-directions me-1"></i>{{ L.t('pp_directions') }}</a>
              </div>
            }
          } @else {
          @for (b of bulletins(); track b.id) {
            <div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;background:var(--card-bg, #fff);padding:1.1rem 1.25rem;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span [style.background]="sevColor(bulletinSev(b.severity))" style="color:#fff;font-size:0.72rem;font-weight:800;padding:3px 11px;border-radius:9px;text-transform:uppercase;">{{ bulletinSev(b.severity) }}</span>
                <span style="font-size:0.8rem;color:#64748b;font-weight:600;">{{ L.t('pp_pmo_dmd_bulletin') }}</span>
              </div>
              <div style="font-size:1.05rem;font-weight:700;color:var(--text-primary, #111827);margin:0.5rem 0 0.25rem;">{{ b.title }}</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:0.5rem;"><i class="fas fa-map-marker-alt me-1"></i>{{ bulletinAreas(b) }}</div>
              @if (b.pdfUrl) {
                <a [href]="b.pdfUrl" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;margin-top:0.6rem;font-size:0.82rem;font-weight:700;color:#1d4ed8;text-decoration:none;"><i class="fas fa-file-pdf"></i> {{ L.t('pp_view_bulletin_pdf') }}</a>
              }
            </div>
          }
          @for (w of warnings(); track w.id) {
            <div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;background:var(--card-bg, #fff);padding:1.1rem 1.25rem;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span [style.background]="sevColor(w.severityLevel)" style="color:#fff;font-size:0.72rem;font-weight:800;padding:3px 11px;border-radius:9px;text-transform:uppercase;">{{ w.severityLevel }}</span>
                <span style="font-size:0.8rem;color:#64748b;font-weight:600;">{{ w.warningCode }}</span>
              </div>
              <div style="font-size:1.05rem;font-weight:700;color:var(--text-primary, #111827);margin:0.5rem 0 0.25rem;">{{ w.hazardType }}</div>
              <div style="font-size:0.92rem;color:var(--text-primary, #111827);line-height:1.6;">{{ w.alertMessage }}</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:0.5rem;"><i class="fas fa-map-marker-alt me-1"></i>{{ w.affectedRegions }}</div>
              @if (w.bulletinDescription) {
                <div style="font-size:0.88rem;color:var(--text-secondary, #475569);line-height:1.65;margin-top:0.5rem;border-left:3px solid #cbd5e1;padding-left:10px;">{{ w.bulletinDescription }}</div>
              }
              @if (w.bulletinUrl) {
                <a [href]="w.bulletinUrl" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;margin-top:0.6rem;font-size:0.82rem;font-weight:700;color:#1d4ed8;text-decoration:none;"><i class="fas fa-file-pdf"></i> {{ L.t('pp_view_bulletin_pdf') }}</a>
              }
            </div>
          }
          @if (!warnings().length && !bulletins().length) {
            <div style="text-align:center;color:var(--text-secondary, #64748b);padding:2rem;border:1px dashed rgba(0,0,0,0.12);border-radius:14px;">
              <i class="fas fa-check-circle" style="font-size:1.8rem;color:#4ade80;"></i>
              <p style="margin:0.6rem 0 0;font-size:0.85rem;">{{ L.t('lbl_no_active_alerts') }}</p>
            </div>
          }
          }
        </div>
      </div>
      }
    </div>

    <!-- Register as Stakeholder modal (the landing/portal public registration) -->
    @if (registerOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="registerOpen.set(false)">
        <div style="background:var(--card-bg, #fff);border-radius:18px;max-width:560px;width:100%;padding:1.4rem 1.5rem;" (click)="$event.stopPropagation()">
          @if (!regDone()) {
            <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin-bottom:1rem;"><i class="fas fa-handshake me-2" style="color:#003366;"></i>{{ L.t('pp_register_as_stakeholder') }}</h5>
            <div style="display:grid;gap:0.8rem;">
              <input class="form-control" [placeholder]="L.t('pp_organization_required')" [value]="rOrg()" (input)="rOrg.set($any($event.target).value)">
              <input class="form-control" [placeholder]="L.t('pp_contact_person_required')" [value]="rName()" (input)="rName.set($any($event.target).value)">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                <select class="form-control" [value]="rType()" (change)="rType.set($any($event.target).value)">
                  <option value="Government">{{ L.t('pp_government') }}</option><option value="NGO">{{ L.t('pp_ngo') }}</option><option value="Private">{{ L.t('pp_private') }}</option><option value="International">{{ L.t('pp_international') }}</option><option value="Community">{{ L.t('pp_community') }}</option>
                </select>
                <select class="form-control" [value]="rCountry()" (change)="onCountry($any($event.target).value)">
                  <option value="Tanzania">{{ L.t('pp_tanzania') }}</option><option value="Other">{{ L.t('pp_other') }}</option>
                </select>
              </div>
              @if (rCountry() === 'Tanzania') {
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                  <select class="form-control" [value]="rRegion()" (change)="onRegion($any($event.target).value)">
                    <option value="">{{ L.t('pp_select_region') }}</option>
                    @for (rg of regions(); track rg.id) { <option [value]="rg.name">{{ rg.name }}</option> }
                  </select>
                  <select class="form-control" [value]="rDistrict()" (change)="rDistrict.set($any($event.target).value)" [disabled]="!districts().length">
                    <option value="">{{ L.t('pp_select_district') }}</option>
                    @for (ds of districts(); track ds.id) { <option [value]="ds.name">{{ ds.name }}</option> }
                  </select>
                </div>
              } @else {
                <input class="form-control" [placeholder]="L.t('pp_region_state_province')" [value]="rRegion()" (input)="rRegion.set($any($event.target).value)">
              }
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                <input class="form-control" [placeholder]="L.t('pp_email')" [value]="rEmail()" (input)="rEmail.set($any($event.target).value)">
                <input class="form-control" [placeholder]="L.t('pp_phone')" [value]="rPhone()" (input)="rPhone.set($any($event.target).value)">
              </div>
              @if (regError()) { <div style="color:#dc2626;font-size:0.82rem;">{{ regError() }}</div> }
              <button class="btn-gold" style="justify-content:center;" [disabled]="!rOrg().trim() || !rName().trim() || regSaving()" (click)="register()">
                <i class="fas" [class.fa-paper-plane]="!regSaving()" [class.fa-spinner]="regSaving()" [class.fa-spin]="regSaving()"></i>
                {{ regSaving() ? L.t('pp_submitting') : L.t('pp_submit_registration') }}
              </button>
            </div>
          } @else {
            <div style="text-align:center;padding:1.5rem 0.5rem;">
              <i class="fas fa-check-circle" style="font-size:3rem;color:#4ade80;"></i>
              <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:1rem 0 0.4rem;">{{ L.t('pp_registration_received') }}</h5>
              <p style="color:var(--text-secondary, #64748b);">{{ L.t('pp_pending_verification_pmo') }}</p>
              <button class="btn-outline-gold" style="margin-top:1rem;" (click)="registerOpen.set(false)">{{ L.t('pp_close') }}</button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class PublicLivePortalComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('portalMap');

  warnings = signal<PortalWarning[]>([]);
  bulletins = signal<PortalBulletin[]>([]);
  incidents = signal<PortalIncident[]>([]);
  shelters = signal<Shelter[]>([]);
  /** Map layer: live warnings or the evacuation-center finder (FEMA shelter-finder pattern). */
  layer = signal<'warnings' | 'shelters'>('warnings');
  view = signal<'live' | 'inform'>('live');   // portal sub-view: live monitoring vs the embedded INFORM risk explorer
  private shelterMarkers: any[] = [];
  private warningMarkers: any[] = [];
  registerOpen = signal(false);
  regDone = signal(false);
  regSaving = signal(false);
  regError = signal('');
  rOrg = signal(''); rName = signal(''); rType = signal('NGO');
  rRegion = signal(''); rEmail = signal(''); rPhone = signal('');
  rCountry = signal('Tanzania'); rDistrict = signal('');
  regions = signal<{ id: number; name: string }[]>([]);
  districts = signal<{ id: number; name: string }[]>([]);
  private map: any;
  private drill: { reset: () => void } | null = null;
  drilled = signal(false);

  constructor() {
    document.title = 'Live Portal — e-MAAFA';
    this.http.get<{ warnings: PortalWarning[]; bulletins?: PortalBulletin[]; incidents?: PortalIncident[] }>('/api/v1/portal/landing').subscribe(d => {
      this.warnings.set(d.warnings);
      this.bulletins.set(d.bulletins ?? []);
      this.incidents.set(d.incidents ?? []);
      setTimeout(() => this.initMap(), 0);
    });
    this.http.get<{ shelters: Shelter[] }>('/api/v1/portal/shelters').subscribe(d => this.shelters.set(d.shelters));
  }

  sevColor(sev: string): string {
    return sev === 'Emergency' ? '#ef4444' : sev === 'Warning' ? '#f59e0b' : '#3b82f6';
  }

  /** Map a PMO-DMD bulletin's engine level (MAJOR_WARNING/WARNING/ADVISORY) to the public alert vocabulary. */
  bulletinSev(level: string): string {
    return level === 'MAJOR_WARNING' ? 'Emergency' : level === 'WARNING' ? 'Warning' : 'Watch';
  }
  /** The distinct affected districts a bulletin covers, for its side-list card. */
  bulletinAreas(b: PortalBulletin): string {
    const names = [...new Set((b.areaPoints ?? []).map(a => a.name).filter(Boolean))];
    return names.slice(0, 6).join(', ') + (names.length > 6 ? ` +${names.length - 6}` : '');
  }

  /** Escape operator-authored bulletin text before injecting it into a Leaflet popup's innerHTML. */
  private escHtml(s: string | null | undefined): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  register(): void {
    this.regSaving.set(true);
    this.regError.set('');
    this.http.post('/api/v1/portal/register-stakeholder', {
      organization: this.rOrg().trim(), name: this.rName().trim(), type: this.rType(),
      country: this.rCountry() || null, region: this.rRegion() || null,
      district: this.rDistrict() || null, email: this.rEmail() || null, phone: this.rPhone() || null,
    }).subscribe({
      next: () => { this.regSaving.set(false); this.regDone.set(true); },
      error: e => { this.regSaving.set(false); this.regError.set(e?.error?.message || this.L.t('pp_could_not_register')); },
    });
  }

  openRegister(): void {
    this.regDone.set(false);
    this.registerOpen.set(true);
    if (this.rCountry() === 'Tanzania' && !this.regions().length) { this.loadRegions(); }
  }

  onCountry(c: string): void {
    this.rCountry.set(c);
    this.rRegion.set(''); this.rDistrict.set(''); this.districts.set([]);
    if (c === 'Tanzania' && !this.regions().length) { this.loadRegions(); }
  }

  onRegion(name: string): void {
    this.rRegion.set(name); this.rDistrict.set(''); this.districts.set([]);
    const rg = this.regions().find(x => x.name === name);
    if (rg) {
      this.http.get<{ id: number; name: string }[]>(`/api/v1/portal/regions/${rg.id}/districts`)
        .subscribe(d => this.districts.set(d || []));
    }
  }

  private loadRegions(): void {
    this.http.get<{ id: number; name: string }[]>('/api/v1/portal/regions')
      .subscribe(r => this.regions.set(r || []));
  }

  /**
   * Alert choropleth: a warning naming specific district(s) colours only those districts (not the whole
   * region); a region-level warning colours the region. Most-severe colour wins per area.
   */
  private buildAlertFills(): { regionFill: RegionFill; districtFill: DistrictFill; districtRegions: string[] } {
    const SEV_COLOR: Record<string, string> = { Emergency: '#ef4444', Warning: '#f59e0b', Watch: '#3b82f6' };
    const SEV_RANK: Record<string, number> = { Emergency: 3, Warning: 2, Watch: 1 };
    const norm = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '');
    // Strip admin-type suffixes ("Dodoma Urban" vs GIS "Dodoma") so an affected district matches its polygon.
    const normDist = (n: string) => norm(n.replace(/\s+(urban|rural|municipal|city|town|dc|mc|tc)\b/gi, ''));
    const clean = (n: string) => n.replace(/\(.*\)/, '').trim();
    const bestRegion = new Map<string, string>();
    const bestDistrict = new Map<string, string>();
    const districtRegions = new Set<string>();
    for (const w of this.warnings()) {
      if (!SEV_RANK[w.severityLevel]) { continue; }
      const district = clean(w.affectedDistricts ?? '');
      if (district) {
        const region = clean(w.affectedRegions ?? '');
        const key = norm(region) + '|' + normDist(district);
        if (!bestDistrict.has(key) || SEV_RANK[w.severityLevel] > SEV_RANK[bestDistrict.get(key)!]) { bestDistrict.set(key, w.severityLevel); }
        if (region) { districtRegions.add(region); }
      } else {
        for (const r of (w.affectedRegions ?? '').split(/[,;]/)) {
          const key = norm(clean(r));
          if (!key) { continue; }
          if (!bestRegion.has(key) || SEV_RANK[w.severityLevel] > SEV_RANK[bestRegion.get(key)!]) { bestRegion.set(key, w.severityLevel); }
        }
      }
    }
    return {
      regionFill: region => { const s = bestRegion.get(norm(region)); return s ? SEV_COLOR[s] : null; },
      districtFill: (region, district) => { const s = bestDistrict.get(norm(region) + '|' + normDist(district)); return s ? SEV_COLOR[s] : null; },
      districtRegions: [...districtRegions],
    };
  }

  /** Switch the map between live warnings and the evacuation-center finder. */
  setLayer(layer: 'warnings' | 'shelters'): void {
    this.layer.set(layer);
    this.warningMarkers.forEach(m => layer === 'warnings' ? m.addTo(this.map) : this.map.removeLayer(m));
    if (layer === 'shelters' && !this.shelterMarkers.length) {
      for (const sh of this.shelters()) {
        const marker = L.circleMarker([sh.latitude, sh.longitude],
          { radius: 9, fillColor: '#059669', color: '#fff', weight: 2, fillOpacity: 0.9 })
          .bindPopup(`<strong>${this.escHtml(sh.name)}</strong><br>${this.escHtml(sh.region ?? '')} ${sh.district ? '· ' + this.escHtml(sh.district) : ''}`
            + `<br>${this.L.t('pp_capacity_label')} ${sh.capacity ?? 'N/A'} · ${sh.status ?? ''}`
            + `<br><a target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${sh.latitude},${sh.longitude}">${this.L.t('pp_directions')}</a>`);
        this.shelterMarkers.push(marker);
      }
    }
    this.shelterMarkers.forEach(m => layer === 'shelters' ? m.addTo(this.map) : this.map.removeLayer(m));
  }

  resetMap(): void {
    this.drill?.reset();
    this.drilled.set(false);
  }

  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined') { return; }
    this.map = L.map(el, { center: [-6.3, 35.0], zoom: 6, minZoom: 5, maxZoom: 12,
      maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0, attributionControl: false });
    addTanzaniaGisBase(this.map, this.http);
    addMapNav(this.map, { home: [-6.3, 35.0, 6] });
    // Same drill-down as the admin GIS maps + alert choropleth (regions coloured by severity)
    const fills = this.buildAlertFills();
    this.drill = addAdminDrilldown(this.map, this.http, fills.regionFill,
      { districtFill: fills.districtFill, districtRegions: fills.districtRegions });
    this.map.on('zoomend', () => this.drilled.set(this.map.getZoom() > 6));
    for (const w of this.warnings()) {
      if (w.latitude == null || w.longitude == null) { continue; }
      const color = this.sevColor(w.severityLevel);
      // Blinking alert marker — pulsing rings so an active warning reads as a live alert, not a static dot.
      const icon = L.divIcon({
        className: 'warning-divicon', iconSize: [20, 20], iconAnchor: [10, 10],
        html: `<div class="warning-marker-icon" style="width:20px;height:20px;background:${color};color:${color};">`
            + `<span class="marker-pulse-ring"></span><span class="marker-pulse-ring-2"></span>`
            + `<i style="width:8px;height:8px;border-radius:50%;background:#fff;display:block;"></i></div>`,
      });
      const marker = L.marker([w.latitude, w.longitude], { icon })
        .addTo(this.map)
        .bindPopup(`<strong>${this.escHtml(w.severityLevel)}: ${this.escHtml(w.hazardType)}</strong><br>${this.escHtml(w.alertMessage ?? '')}<br><small>${this.escHtml(w.affectedRegions ?? '')}</small>`
          + (w.bulletinDescription ? `<div style="margin-top:6px;font-size:0.82rem;color:#334155;">${this.escHtml(w.bulletinDescription)}</div>` : '')
          + (w.bulletinUrl ? `<br><a href="${w.bulletinUrl}" target="_blank" rel="noopener">${this.L.t('pp_view_bulletin_pdf')}</a>` : ''));
      this.warningMarkers.push(marker);
    }
    // Incidents pushed to the portal map (Response → push-map) — purple dashed rings, distinct from warning
    // dots; the popup links to the live public snapshot (/incident/{id}). Toggles with the warnings layer.
    for (const inc of this.incidents()) {
      if (inc.latitude == null || inc.longitude == null) { continue; }
      const lc = incidentLifecycle(inc.status);
      const im = L.circleMarker([inc.latitude, inc.longitude],
          { radius: 7, fillColor: '#7c3aed', color: '#fff', weight: 2, fillOpacity: 0.85, dashArray: '3' })
        .addTo(this.map)
        .bindPopup(`<strong>${this.L.t('pp_incident_label')} ${this.escHtml(inc.title)}</strong>`
          + `<br>${this.escHtml(inc.severityLevel ?? '')} · <span style="color:${lc.color};font-weight:700;">${lc.label}</span>`
          + `<br><small>${this.escHtml(inc.regionName ?? '')}</small>`
          // the detailed public snapshot exists only for incidents an operator explicitly pushed to the map
          + (inc.pinnedToMap ? `<br><a href="/incident/${inc.id}">${this.L.t('pp_view_live_status')} →</a>` : ''));
      this.warningMarkers.push(im);
    }
    // Published bulletins (EOCC Bulletin → Publish → Map): BLINK each PMO-selected district (hotline
    // mechanism, coloured by level) + one document pin at the centroid; all toggle with the warnings layer.
    const bSev: Record<string, string> = { MAJOR_WARNING: '#ef4444', WARNING: '#f59e0b', ADVISORY: '#d4a900' };
    for (const b of this.bulletins()) {
      for (const a of b.areaPoints ?? []) {
        if (a.lat == null || a.lng == null) { continue; }
        const ac = bSev[a.level] ?? '#0d6efd';
        const pulse = L.divIcon({
          className: 'warning-divicon', iconSize: [18, 18], iconAnchor: [9, 9],
          html: `<div class="warning-marker-icon" style="width:18px;height:18px;background:${ac};color:${ac};">`
              + `<span class="marker-pulse-ring"></span><span class="marker-pulse-ring-2"></span>`
              + `<i style="width:7px;height:7px;border-radius:50%;background:#fff;display:block;"></i></div>`,
        });
        const pm = L.marker([a.lat, a.lng], { icon: pulse })
          .addTo(this.map)
          .bindPopup(`<strong>${this.escHtml(b.title)}</strong>`
            + `<br><small>${this.escHtml(a.name)} · ${this.escHtml((a.level ?? '').replace('_', ' '))}</small>`
            + `<br><a href="${b.pdfUrl}" target="_blank" rel="noopener">${this.L.t('pp_view_bulletin_pdf')}</a>`);
        this.warningMarkers.push(pm);
      }
      if (b.centroidLat == null || b.centroidLng == null) { continue; }
      const color = bSev[b.severity] ?? '#0d6efd';
      const icon = L.divIcon({
        className: 'bulletin-divicon', iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<div style="width:22px;height:22px;border-radius:6px;background:#fff;border:2px solid ${color};`
            + `display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.3);">`
            + `<i class="fas fa-file-pdf" style="color:${color};font-size:11px;"></i></div>`,
      });
      const marker = L.marker([b.centroidLat, b.centroidLng], { icon })
        .addTo(this.map)
        .bindPopup(`<strong>${this.escHtml(b.title)}</strong>`
          + `<br><a href="${b.pdfUrl}" target="_blank" rel="noopener">${this.L.t('pp_view_bulletin_pdf')}</a>`);
      this.warningMarkers.push(marker);
    }
  }
}
