import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { addTanzaniaGisBase, addAdminDrilldown, addMapNav, RegionFill, DistrictFill } from '../../core/tz-map';
import { PortalLabels } from './portal-i18n';
import { PortalDataService, HazardCard, CapabilityCard } from './portal-data.service';
import { incidentLifecycle } from './incident-lifecycle';
import { CountUpDirective, RevealDirective } from './fx';
import { qrcodegen } from '../../shared/qrcodegen';

declare const L: any; // Leaflet (global, loaded in index.html)

/* ---------- API payload shapes (mirrors PortalPublicService.landing()) ---------- */
interface PortalWarning {
  id: number; warningCode: string; hazardType: string; severityLevel: string;
  alertMessage: string; affectedRegions: string; affectedDistricts?: string | null; latitude: number; longitude: number; peopleAtRisk: number;
  bulletinUrl?: string | null; bulletinDescription?: string | null;
}
interface PortalIncident {
  id: number; title: string; severityLevel: string; status: string; workflowStatus?: string;
  latitude: number; longitude: number; regionName: string; pinnedToMap?: boolean;
}
interface ThreatChip { id: number; name: string; sourceAgency: string; trendLabel: string; severity: string; }
interface PortalAreaPoint { name: string; lat: number; lng: number; level: string; }
interface PortalBulletin {
  id: number; title: string; severity: string; centroidLat: number; centroidLng: number; pdfUrl: string;
  areaPoints?: PortalAreaPoint[]; hazardType?: string;
}
interface LandingPayload {
  warnings: PortalWarning[];
  incidents: PortalIncident[];
  bulletins?: PortalBulletin[];
  stats: { emergencyCount: number; warningCount: number; watchCount: number; peopleAtRisk: number };
  hazards: { id: number; name: string; type: string }[];
  slides: { title: string; slideType: string }[];
  gallery: { imagePath: string; caption: string; altText: string; marqueeRow: number }[];
  settings: Record<string, string>;
  latestNews: { title: string; slug: string; excerpt: string; image: string; category: string; publishedAt: string;
    title_sw?: string | null; excerpt_sw?: string | null }[];
  latestPublications: { id: number; documentName: string; documentType: string; yearOfApproval: number; narrativeDescription: string; attachmentPath: string }[];
  stakeholderCount: number;
  publicationCounts: Record<string, number>;
  hazardCards: HazardCard[];
  capabilities: CapabilityCard[];
}

/** Hazard icon/colour metadata — verbatim from the landing blade's $hazardMeta map. */
const HAZARD_META: Record<string, [string, string, string]> = {
  'Flood': ['fa-water', '#3b82f6', 'lbl_hz_flood'],
  'Drought': ['fa-sun', '#f59e0b', 'lbl_hz_drought'],
  'Earthquake': ['fa-house-damage', '#a855f7', 'lbl_hz_earthquake'],
  'Cyclone': ['fa-wind', '#0ea5e9', 'lbl_hz_cyclone'],
  'Epidemic/Disease Outbreak': ['fa-virus', '#059669', 'lbl_hz_epidemic'],
  'Landslide': ['fa-mountain', '#004d66', 'lbl_hz_landslide'],
  'Fire': ['fa-fire', '#ef4444', 'lbl_hz_fire'],
  'Domestic fire': ['fa-fire', '#ef4444', 'lbl_hz_fire'],
  'Tsunami': ['fa-water', '#06b6d4', 'lbl_hz_tsunami'],
  'Storm': ['fa-wind', '#6366f1', 'lbl_hz_cyclone'],
  'Large Waves': ['fa-water', '#0284c7', 'lbl_hz_tsunami'],
  'Building Collapse': ['fa-building', '#6b7280', 'lbl_hz_collapse'],
  'Extreme Heat/Heatwave': ['fa-temperature-high', '#f97316', 'lbl_hz_heatwave'],
  'Pandemic': ['fa-virus', '#10b981', 'lbl_hz_epidemic'],
  'Volcanic Eruption': ['fa-mountain', '#dc2626', 'lbl_hz_volcano'],
  'Heavy rainfall': ['fa-cloud-showers-heavy', '#3b82f6', 'lbl_hz_flood'],
  'Accident': ['fa-car-crash', '#f97316', 'lbl_hz_accident'],
};

/** The 12-card "Know Your Hazards" education grid — verbatim $hazardCards. */
const HAZARD_CARDS = [
  { name: 'Flood', icon: 'fa-water', color: '#3b82f6', key: 'lbl_hz_flood' },
  { name: 'Drought', icon: 'fa-sun', color: '#f59e0b', key: 'lbl_hz_drought' },
  { name: 'Earthquake', icon: 'fa-house-damage', color: '#a855f7', key: 'lbl_hz_earthquake' },
  { name: 'Cyclone', icon: 'fa-wind', color: '#0ea5e9', key: 'lbl_hz_cyclone' },
  { name: 'Epidemic', icon: 'fa-virus', color: '#059669', key: 'lbl_hz_epidemic' },
  { name: 'Landslide', icon: 'fa-mountain', color: '#004d66', key: 'lbl_hz_landslide' },
  { name: 'Fire', icon: 'fa-fire', color: '#ef4444', key: 'lbl_hz_fire' },
  { name: 'Tsunami', icon: 'fa-water', color: '#06b6d4', key: 'lbl_hz_tsunami' },
  { name: 'Building Collapse', icon: 'fa-building', color: '#6b7280', key: 'lbl_hz_collapse' },
  { name: 'Heatwave', icon: 'fa-temperature-high', color: '#f97316', key: 'lbl_hz_heatwave' },
  { name: 'Volcanic Eruption', icon: 'fa-mountain', color: '#dc2626', key: 'lbl_hz_volcano' },
  { name: 'Accident', icon: 'fa-car-crash', color: '#f97316', key: 'lbl_hz_accident' },
];

/** Capability cards — the welcomeV2 defaults (overridable later via portal_settings). */
const CAPABILITIES = [
  { title: 'Early Warning System', icon: 'fa-satellite-dish', color: '#ef4444', description: 'Multi-hazard early warning with SMS and email alerts to communities at risk (where gateways are configured).' },
  { title: 'GIS Mapping', icon: 'fa-map-marked-alt', color: '#60a5fa', description: 'Interactive geospatial mapping of hazards, risks, resources, and evacuation routes across all regions.' },
  { title: 'Incident Management', icon: 'fa-tasks', color: '#4ade80', description: 'End-to-end incident tracking from initial report through response coordination to recovery programs.' },
  { title: 'Resource Management', icon: 'fa-warehouse', color: '#60a5fa', description: 'Track warehouses, inventory, and allocated resources for rapid deployment during emergencies.' },
  { title: 'Risk Assessment', icon: 'fa-shield-alt', color: '#a78bfa', description: 'INFORM subnational risk index — hazard & exposure, vulnerability and coping capacity scored for every council, on the map and by dimension.', link: '/inform-risk' },
  { title: 'Stakeholder Coordination', icon: 'fa-hands-helping', color: '#fb923c', description: 'Multi-agency collaboration platform connecting government, NGOs, and international organizations.' },
];

/** Publication card thumbnails — verbatim $pubThumbs rotation. */
const PUB_THUMBS = [
  'images/events/rufiji_aerial_01.jpg', 'images/events/photo_03.jpg', 'images/events/rufiji_village_submerged.jpg',
  'images/events/photo_04.jpg', 'images/events/rufiji_aerial_destruction.jpg', 'images/events/photo_08.jpg',
];

/* Shared severity metadata + name normalisers — one source for the choropleth, the hover
 * tooltips and the rich map popups so all three always agree on colour and ranking. */
const SEV_COLOR: Record<string, string> = { Emergency: '#ef4444', Warning: '#f59e0b', Watch: '#3b82f6',
  Major: '#ef4444', Moderate: '#f59e0b', Minor: '#3b82f6' };
const SEV_RANK: Record<string, number> = { Emergency: 3, Major: 3, Warning: 2, Moderate: 2, Watch: 1, Minor: 1 };
const norm = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '');
// District names from the registry often carry an admin-type suffix the GIS layer omits
// ("Dodoma Urban" vs "Dodoma"); strip it so the affected district still matches its polygon.
const normDist = (n: string) => norm(n.replace(/\s+(urban|rural|municipal|city|town|dc|mc|tc)\b/gi, ''));
const cleanName = (n: string) => n.replace(/\(.*\)/, '').trim();

/**
 * Public landing page ("/") — 1:1 reproduction of portal/landing/v2.blade.php:
 * hero (brand + 3-slide slider + CTAs | live Tanzania map + status panel), then
 * News & Events, the photo-gallery marquee, Latest Publications, Know Your Hazards,
 * Core Features and the animated counters. The Report-Hazard wizard posts to the
 * public portal API. Styling comes from portal-landing.css (extracted verbatim).
 */
@Component({
  selector: 'public-landing',
  standalone: true,
  imports: [RouterLink, CountUpDirective, RevealDirective, DecimalPipe],
  templateUrl: './landing.component.html',
  styles: [`
    .ll-qr { position:fixed; left:18px; bottom:18px; z-index:40; display:flex; flex-direction:column; align-items:center; gap:.4rem;
      background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:.65rem .65rem .5rem; text-decoration:none;
      box-shadow:0 12px 30px rgba(0,51,102,0.20); transition:transform .2s ease, box-shadow .2s ease; }
    .ll-qr:hover { transform:translateY(-3px); box-shadow:0 18px 40px rgba(0,51,102,0.26); }
    .ll-qr svg { width:108px; height:108px; display:block; }
    .ll-qr-cap { font-size:.8rem; font-weight:800; letter-spacing:.05em; color:#0d3b66; }
    @media (max-width:575px){ .ll-qr { left:12px; bottom:12px; } .ll-qr svg { width:86px; height:86px; } }
    /* Landing-only placement for the shared popovers (classes live in portal-landing.css):
       the Live-Monitoring panel hugs the map's bottom edge, so its previews open UPWARD and
       right-align to stay inside .hero-right (overflow:hidden would clip any overhang). */
    .map-status-panel .pp-pop { top:auto; bottom:calc(100% + 12px); left:auto; right:-6px; }
    .map-status-panel .map-live-badge .pp-pop { left:-6px; right:auto; }
    /* ≤767px the hero restacks: .hero-right becomes a 45vh map BELOW .hero-left, no longer running
       under the fixed navbar (the 126px offsets would strand these mid-map), and .map-status-panel
       spans the full width and wraps taller. Re-anchor the top overlays and retire the summary chip
       (its totals + freshness are carried by the status-panel popovers) to avoid overlap. */
    @media (max-width: 767px) {
      .hero-map-back, .hero-threats-strip { top: 14px !important; }
      .hero-live-summary { display: none !important; }
    }
  `],
})
export class LandingComponent implements OnDestroy {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  private portalData = inject(PortalDataService);
  private router = inject(Router);
  mapEl = viewChild<ElementRef>('heroMap');

  /** "Scan to register" QR shown fixed at the foot of the arrival page — encodes the register page on the
   *  current origin (auto-targets localhost / LAN / live domain), rendered in-system via the vendored encoder. */
  qr = (() => {
    const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'http://localhost:4200';
    const q = qrcodegen.QrCode.encodeText(origin + '/register-partner', qrcodegen.QrCode.Ecc.MEDIUM);
    const n = q.size;
    const dark: [number, number][] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (q.getModule(x, y)) { dark.push([x, y]); }
      }
    }
    return { n, dark, vb: `-3 -3 ${n + 6} ${n + 6}` };
  })();

  /* ------------------------------ state ------------------------------ */
  data = signal<LandingPayload | null>(null);
  /** National threats under DMD watch (the strip beside live monitoring). */
  threats = signal<ThreatChip[]>([]);
  threatColor = (sev: string) => sev === 'Emergency' ? '#dc2626' : sev === 'Warning' ? '#d97706' : '#2563eb';

  /** Intro splash — shown once per session, skippable (source's intro overlay). */
  introVisible = signal(!sessionStorage.getItem('dmis-intro-seen'));
  slideIdx = signal(0);
  bgIdx = signal(0);
  galleryOpen = signal(false);
  galleryIdx = signal(0);
  reportOpen = signal(false);
  reportDone = signal('');
  reportSaving = signal(false);
  reportError = signal('');
  // Report-hazard form fields (the source wizard's essential inputs)
  rType = signal(''); rDesc = signal(''); rLocation = signal(''); rUrgency = signal('Medium');
  rName = signal(''); rPhone = signal(''); rEmail = signal('');
  rReportedBy = signal('public'); rOrg = signal('');   // public | institution | sector | ministry | region (official → straight to EOCC)
  // Structured Region → District (public location cascade) — routes the report to that district's officers.
  rRegionId = signal(''); rDistrictId = signal('');
  regions = signal<{ id: number; name: string }[]>([]);
  districts = signal<{ id: number; name: string }[]>([]);

  /** Managed cards from Content Management; built-in defaults if the API has none. */
  hazardCards = computed<HazardCard[]>(() => {
    const managed = this.data()?.hazardCards ?? [];
    if (managed.length) { return managed; }
    return HAZARD_CARDS.map(c => ({ name: c.name, icon: c.icon, color: c.color,
      descriptionEn: this.L.t(c.key), descriptionSw: this.L.t(c.key), link: '/education/hazard/' + c.name }));
  });
  capabilities = computed<CapabilityCard[]>(() => {
    const managed = this.data()?.capabilities ?? [];
    return managed.length ? managed : CAPABILITIES;
  });
  /** Capability "how it works" modal (for cards without a system link). */
  capabilityDetail = signal<CapabilityCard | null>(null);

  /** Navigate when the card has a link; otherwise show the how-it-works detail. */
  openCapability(card: CapabilityCard): void {
    if (card.link) {
      this.router.navigateByUrl(card.link);
    } else {
      this.capabilityDetail.set(card);
    }
  }

  /** Card description in the visitor's language. */
  cardDesc = (c: HazardCard) => (this.L.lang() === 'sw' ? c.descriptionSw : c.descriptionEn) || c.descriptionEn || '';
  /** Card hazard name in the visitor's language (English name is the fallback + route key). */
  cardName = (c: HazardCard) => (this.L.lang() === 'sw' && c.nameSw ? c.nameSw : c.name);

  /** Swahili value for Swahili visitors when present; otherwise the English fallback (used by news cards). */
  nl(en: string | null | undefined, sw?: string | null): string {
    return this.L.lang() === 'sw' && sw ? sw : (en ?? '');
  }
  private map: any;
  private drill: { reset: () => void } | null = null;
  /** True once the user has drilled below national level — shows the back control. */
  drilled = signal(false);
  private timers: number[] = [];
  /** Active map filter driven by the Live-Monitoring counters. */
  sevFilter = signal<'all' | 'Emergency' | 'Warning' | 'Watch' | 'Incidents'>('all');
  private alertMarkers: any[] = [];
  /** "HH:MM" of the last live payload — freshness chip + LIVE badge popover. */
  lastUpdated = signal('');
  /** Live per-area tallies feeding the map hover tooltips; renderAlerts() rebuilds them. */
  private regionTally = new Map<string, { sev: string | null; warnings: number; incidents: number }>();
  private districtTally = new Map<string, { sev: string | null; warnings: number }>();

  /** Live-Monitoring severity counters — drives the stat chips and their hover previews. */
  readonly statDefs: { k: 'Emergency' | 'Warning' | 'Watch'; lbl: string; color: string; sev: string }[] = [
    { k: 'Emergency', lbl: 'lbl_emergency', color: '#ef4444', sev: 'sev-emergency' },
    { k: 'Warning', lbl: 'lbl_warning', color: '#fb923c', sev: 'sev-warning' },
    { k: 'Watch', lbl: 'lbl_watch', color: '#f59e0b', sev: 'sev-watch' },
  ];
  lc = incidentLifecycle;

  statCount(k: 'Emergency' | 'Warning' | 'Watch'): number {
    const s = this.data()?.stats;
    return k === 'Emergency' ? (s?.emergencyCount ?? 0) : k === 'Warning' ? (s?.warningCount ?? 0) : (s?.watchCount ?? 0);
  }
  /** The REAL warnings behind a Live-Monitoring counter (the popover previews the first 5). */
  statWarnings(k: 'Emergency' | 'Warning' | 'Watch'): PortalWarning[] {
    return (this.data()?.warnings ?? []).filter(w => w.severityLevel === k);
  }
  /** Items behind the counter that the 5-row preview cannot show ("+N more"). */
  statMore(k: 'Emergency' | 'Warning' | 'Watch'): number {
    return Math.max(0, this.statCount(k) - Math.min(5, this.statWarnings(k).length));
  }
  incidentsMore(): number { return Math.max(0, (this.data()?.incidents?.length ?? 0) - 5); }

  /** Severity name in the visitor's language (popovers, tooltips, map popups). */
  sevName(sev: string): string {
    if (this.L.lang() !== 'sw') { return sev; }
    return sev === 'Emergency' ? 'Dharura' : sev === 'Warning' ? 'Onyo' : sev === 'Watch' ? 'Angalizo' : sev;
  }
  sevClass = (sev: string) => sev === 'Emergency' ? 'sev-emergency' : sev === 'Warning' ? 'sev-warning' : 'sev-watch';

  constructor() {
    document.title = 'e-MAAFA — Disaster Management Information System';
    if (this.introVisible()) {
      setTimeout(() => this.dismissIntro(), 2400);
    }
    this.http.get<{ threats: ThreatChip[] }>('/api/v1/portal/threats')
      .subscribe(r => this.threats.set(r.threats));
    this.portalData.landing$.subscribe((d: LandingPayload) => {
      this.data.set(d);
      this.stampUpdated();
      setTimeout(() => this.initMap(d), 0);
    });
    // Hero background crossfade + slider auto-advance (same cadence as the source page)
    this.timers.push(window.setInterval(() => this.bgIdx.update(i => (i + 1) % 2), 9000));
    this.timers.push(window.setInterval(() => this.nextSlide(), 8000));
    // Keep the live-monitoring panel + map current without a manual reload.
    this.timers.push(window.setInterval(() => this.refreshLive(), 60000));
  }

  /* ----------------------------- derived ----------------------------- */
  slideLabels = computed(() => {
    const labels: string[] = [];
    for (const s of this.data()?.slides ?? []) {
      if (s.slideType === 'about') { labels.push(this.L.t('lbl_about_emaafa')); }
      if (s.slideType === 'hazards') { labels.push(this.L.t('lbl_hazards')); }
      if (s.slideType === 'alerts') { labels.push(this.L.t('lbl_alerts')); }
    }
    return labels.length ? labels : [this.L.t('lbl_about_emaafa'), this.L.t('lbl_hazards'), this.L.t('lbl_alerts')];
  });

  /** Total active warnings (emergency + warning + watch) for the panel summary line. */
  liveTotal = computed(() => {
    const s = this.data()?.stats;
    return (s?.emergencyCount ?? 0) + (s?.warningCount ?? 0) + (s?.watchCount ?? 0);
  });

  /** Alert items for the alerts slide — top warnings shaped like the blade's $alertItems. */
  alertItems = computed(() => (this.data()?.warnings ?? []).slice(0, 4).map(w => ({
    tag: (w.severityLevel || 'Watch').toUpperCase(),
    icon: w.severityLevel === 'Emergency' ? 'fa-exclamation-circle' : w.severityLevel === 'Warning' ? 'fa-exclamation-triangle' : 'fa-eye',
    bg: w.severityLevel === 'Emergency' ? 'rgba(239,68,68,0.12)' : w.severityLevel === 'Warning' ? 'rgba(251,191,36,0.12)' : 'rgba(59,130,246,0.12)',
    color: w.severityLevel === 'Emergency' ? '#ef4444' : w.severityLevel === 'Warning' ? '#f59e0b' : '#3b82f6',
    msg: (w.alertMessage || '').slice(0, 90),
  })));

  galleryRow = (row: number) => (this.data()?.gallery ?? []).filter(g => g.marqueeRow === row);
  hazardMeta = (name: string) => HAZARD_META[name] ?? ['fa-exclamation-triangle', '#6b7280', ''];
  pubThumb = (i: number) => '/' + PUB_THUMBS[i % PUB_THUMBS.length];
  rgba = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  };
  setting = (key: string, fallback: string) => this.data()?.settings?.[key] ?? fallback;

  /* ------------------------------ slider ----------------------------- */
  nextSlide(): void { this.slideIdx.update(i => (i + 1) % this.slideLabels().length); }
  goSlide(i: number): void { this.slideIdx.set(i); }

  /* ------------------------------ gallery ----------------------------- */
  openGallery(i: number): void { this.galleryIdx.set(i); this.galleryOpen.set(true); }
  galleryNav(dir: number): void {
    const n = (this.data()?.gallery ?? []).length;
    if (n) { this.galleryIdx.update(i => (i + dir + n) % n); }
  }

  /* --------------------------- report hazard -------------------------- */
  submitReport(): void {
    if (!this.rType() || !this.rDesc().trim()) { return; }
    this.reportSaving.set(true); this.reportError.set('');
    this.http.post<{ reportCode: string }>('/api/v1/portal/report-hazard', {
      hazardType: this.rType(), description: this.rDesc().trim(), location: this.rLocation() || null,
      urgency: this.rUrgency(), reporterName: this.rName() || null, reporterPhone: this.rPhone() || null,
      reporterEmail: this.rEmail() || null,
      reporterType: this.rReportedBy(), reporterOrg: this.rReportedBy() === 'public' ? null : (this.rOrg() || null),
      regionId: this.rRegionId() || null, districtId: this.rDistrictId() || null,
    }).subscribe({
      next: r => { this.reportSaving.set(false); this.reportDone.set(r.reportCode); },
      error: (err) => {
        this.reportSaving.set(false);
        const remote = err?.error?.detail || err?.error?.message;
        this.reportError.set(this.L.lang() === 'en' && remote ? remote : this.L.t('lbl_could_not_submit_report'));
      },
    });
  }

  /** Load the region list the first time the report modal needs it (public location cascade). */
  loadRegions(): void {
    if (this.regions().length) { return; }
    this.http.get<{ id: number; name: string }[]>('/api/v1/portal/regions').subscribe(r => this.regions.set(r));
  }

  /** Region chosen → reset district and load that region's districts. */
  onRegionChange(regionId: string): void {
    this.rRegionId.set(regionId);
    this.rDistrictId.set('');
    this.districts.set([]);
    if (regionId) {
      this.http.get<{ id: number; name: string }[]>(`/api/v1/portal/regions/${regionId}/districts`)
        .subscribe(d => this.districts.set(d));
    }
  }

  closeReport(): void {
    this.reportOpen.set(false);
    this.reportDone.set('');
    this.rType.set(''); this.rDesc.set(''); this.rLocation.set(''); this.rUrgency.set('Medium');
    this.rReportedBy.set('public'); this.rOrg.set(''); this.rEmail.set(''); this.reportError.set('');
    this.rRegionId.set(''); this.rDistrictId.set(''); this.districts.set([]);
  }

  /* ------------------------------- map -------------------------------- */
  /** Hero map: official GIS base + warning markers coloured by severity (Tanzania-bounded). */
  private initMap(d: LandingPayload): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined') { return; }
    this.map = L.map(el, {
      center: [-6.3, 35.0], zoom: 6, minZoom: 5, maxZoom: 10, zoomControl: false,
      maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0, attributionControl: false,
    });
    addTanzaniaGisBase(this.map, this.http);
    addMapNav(this.map, { home: [-6.3, 35.0, 6] });
    // Region → district → ward drill-down + ALERT CHOROPLETH (P&M Risk-Mapping-style colouring):
    // each region is filled with the colour of the highest active alert affecting it.
    const fills = this.buildAlertFills(d);
    this.drill = addAdminDrilldown(this.map, this.http, fills.regionFill,
      { districtFill: fills.districtFill, districtRegions: fills.districtRegions,
        // Rich hover tooltips over the same live data as the choropleth (re-read on every hover).
        regionTip: (r: string) => this.regionTipHtml(r),
        districtTip: (r: string, dd: string) => this.districtTipHtml(r, dd) });
    this.map.on('zoomend', () => this.drilled.set(this.map.getZoom() > 6));
    this.renderAlerts();
  }

  /**
   * Draw the warning / incident / bulletin markers for the current data and active filter. Re-runnable:
   * clears the previous markers first, so it is called on first render, on auto-refresh, and when a
   * Live-Monitoring counter is clicked to filter the map by severity / incidents.
   */
  private renderAlerts(): void {
    if (!this.map || typeof L === 'undefined') { return; }
    this.alertMarkers.forEach(m => this.map.removeLayer(m));
    this.alertMarkers = [];
    this.rebuildAreaTallies();
    const d = this.data();
    if (!d) { return; }
    const f = this.sevFilter();
    const popOpts = { className: 'map-pop', maxWidth: 360 };
    if (f === 'all' || f === 'Emergency' || f === 'Warning' || f === 'Watch') {
      for (const w of d.warnings) {
        if (w.latitude == null || w.longitude == null) { continue; }
        if (f !== 'all' && w.severityLevel !== f) { continue; }
        const color = SEV_COLOR[w.severityLevel] ?? '#3b82f6';
        const icon = L.divIcon({
          className: 'warning-divicon', iconSize: [18, 18], iconAnchor: [9, 9],
          html: `<div class="warning-marker-icon" style="width:18px;height:18px;background:${color};color:${color};">`
              + `<span class="marker-pulse-ring"></span><span class="marker-pulse-ring-2"></span>`
              + `<i style="width:7px;height:7px;border-radius:50%;background:#fff;display:block;"></i></div>`,
        });
        this.alertMarkers.push(L.marker([w.latitude, w.longitude], { icon })
          .addTo(this.map)
          .bindPopup(this.popWarning(w, color), popOpts));
      }
    }
    if (f === 'all' || f === 'Incidents') {
      for (const inc of d.incidents ?? []) {
        if (inc.latitude == null || inc.longitude == null) { continue; }
        this.alertMarkers.push(L.circleMarker([inc.latitude, inc.longitude],
            { radius: 7, fillColor: '#7c3aed', color: '#fff', weight: 2, fillOpacity: 0.85, dashArray: '3' })
          .addTo(this.map)
          .bindPopup(this.popIncident(inc), popOpts));
      }
    }
    if (f === 'all') {
      const bSev: Record<string, string> = { MAJOR_WARNING: '#ef4444', WARNING: '#f59e0b', ADVISORY: '#d4a900' };
      for (const b of d.bulletins ?? []) {
        for (const a of b.areaPoints ?? []) {
          if (a.lat == null || a.lng == null) { continue; }
          const ac = bSev[a.level] ?? '#0d6efd';
          const pulse = L.divIcon({
            className: 'warning-divicon', iconSize: [18, 18], iconAnchor: [9, 9],
            html: `<div class="warning-marker-icon" style="width:18px;height:18px;background:${ac};color:${ac};">`
                + `<span class="marker-pulse-ring"></span><span class="marker-pulse-ring-2"></span>`
                + `<i style="width:7px;height:7px;border-radius:50%;background:#fff;display:block;"></i></div>`,
          });
          this.alertMarkers.push(L.marker([a.lat, a.lng], { icon: pulse })
            .addTo(this.map)
            .bindPopup(this.popBulletin(b, ac, a), popOpts));
        }
        if (b.centroidLat == null || b.centroidLng == null) { continue; }
        const color = bSev[b.severity] ?? '#0d6efd';
        const icon = L.divIcon({
          className: 'bulletin-divicon', iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<div style="width:22px;height:22px;border-radius:6px;background:#fff;border:2px solid ${color};`
              + `display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.3);">`
              + `<i class="fas fa-file-pdf" style="color:${color};font-size:12px;"></i></div>`,
        });
        this.alertMarkers.push(L.marker([b.centroidLat, b.centroidLng], { icon })
          .addTo(this.map)
          .bindPopup(this.popBulletin(b, color), popOpts));
      }
    }
  }

  /* --------------------- rich map popups (.map-pop cards) --------------------- */

  private fmtNum(n: number): string { return (n ?? 0).toLocaleString('en-US'); }

  /** Warning marker popup — severity-tinted banner, detail rows, bulletin action. */
  private popWarning(w: PortalWarning, color: string): string {
    const sw = this.L.lang() === 'sw';
    const esc = (s: string | null | undefined) => this.escHtml(s);
    const rows: string[] = [];
    const area = (w.affectedRegions ?? '') + (w.affectedDistricts ? ' · ' + w.affectedDistricts : '');
    if (area.trim()) { rows.push(`<div class="mp-row"><i class="fas fa-map-marker-alt"></i><span>${esc(area)}</span></div>`); }
    if ((w.peopleAtRisk ?? 0) > 0) {
      rows.push(`<div class="mp-row"><i class="fas fa-users"></i><span><b>${this.fmtNum(w.peopleAtRisk)}</b> ${sw ? 'watu hatarini' : 'people at risk'}</span></div>`);
    }
    if (w.alertMessage) { rows.push(`<div class="mp-row"><i class="fas fa-info-circle"></i><span>${esc(w.alertMessage)}</span></div>`); }
    if (w.bulletinDescription) { rows.push(`<div class="mp-row"><i class="fas fa-file-alt"></i><span>${esc(w.bulletinDescription)}</span></div>`); }
    const actions = w.bulletinUrl
      ? `<div class="mp-actions"><a class="mp-btn" href="${esc(w.bulletinUrl)}" target="_blank" rel="noopener">`
        + `<i class="fas fa-file-pdf"></i> ${sw ? 'Taarifa (PDF)' : 'Bulletin (PDF)'}</a></div>`
      : '';
    return `<div class="mp-head" style="background:${color};"><i class="fas fa-exclamation-triangle"></i> `
      + `${esc(this.sevName(w.severityLevel))} · ${esc(w.hazardType)}</div>`
      + `<div class="mp-body">${rows.join('')}</div>` + actions;
  }

  /** Incident marker popup — lifecycle + verification status, live-page action when pinned. */
  private popIncident(inc: PortalIncident): string {
    const sw = this.L.lang() === 'sw';
    const esc = (s: string | null | undefined) => this.escHtml(s);
    const lc = incidentLifecycle(inc.status);
    const wf = (inc.workflowStatus || '').toLowerCase();
    const vf = wf === 'draft' ? { t: sw ? 'Haijathibitishwa' : 'Unverified', c: '#b45309' }
      : wf === 'approved' ? { t: sw ? 'Imethibitishwa' : 'Verified', c: '#059669' }
      : { t: sw ? 'Inathibitishwa' : 'Being verified', c: '#2563eb' };
    const rows: string[] = [];
    if (inc.regionName) { rows.push(`<div class="mp-row"><i class="fas fa-map-marker-alt"></i><span>${esc(inc.regionName)}</span></div>`); }
    if (inc.severityLevel) {
      rows.push(`<div class="mp-row"><i class="fas fa-exclamation-triangle"></i><span>${esc(this.sevName(inc.severityLevel))}</span></div>`);
    }
    rows.push(`<div class="mp-row"><i class="fas fa-tasks"></i><span>`
      + `<span style="color:${lc.color};font-weight:700;">${lc.label}</span> · `
      + `<span style="color:${vf.c};font-weight:700;">${vf.t}</span></span></div>`);
    const actions = inc.pinnedToMap
      ? `<div class="mp-actions"><a class="mp-btn" href="/incident/${inc.id}">`
        + `<i class="fas fa-satellite-dish"></i> ${sw ? 'Hali ya sasa na majibu' : 'Live status & response'}</a></div>`
      : '';
    return `<div class="mp-head" style="background:#7c3aed;"><i class="fas fa-bullhorn"></i> `
      + `${sw ? 'TUKIO' : 'INCIDENT'} · ${esc(inc.title)}</div>`
      + `<div class="mp-body">${rows.join('')}</div>` + actions;
  }

  /** EOCC bulletin popup (centroid PDF pin or a blinking area point). */
  private popBulletin(b: PortalBulletin, color: string, area?: PortalAreaPoint): string {
    const sw = this.L.lang() === 'sw';
    const esc = (s: string | null | undefined) => this.escHtml(s);
    const rows: string[] = [];
    if (area) {
      rows.push(`<div class="mp-row"><i class="fas fa-map-marker-alt"></i><span>${esc(area.name)}`
        + ` · ${esc((area.level ?? '').replace('_', ' '))}</span></div>`);
    }
    if (b.hazardType) { rows.push(`<div class="mp-row"><i class="fas fa-exclamation-triangle"></i><span>${esc(b.hazardType)}</span></div>`); }
    rows.push(`<div class="mp-row"><i class="fas fa-broadcast-tower"></i><span>`
      + `${sw ? 'Taarifa rasmi ya EOCC/PMO' : 'Official EOCC/PMO bulletin'}</span></div>`);
    const actions = b.pdfUrl
      ? `<div class="mp-actions"><a class="mp-btn" href="${esc(b.pdfUrl)}" target="_blank" rel="noopener">`
        + `<i class="fas fa-file-pdf"></i> ${sw ? 'Taarifa (PDF)' : 'Bulletin (PDF)'}</a></div>`
      : '';
    return `<div class="mp-head" style="background:${color};"><i class="fas fa-file-pdf"></i> ${esc(b.title)}</div>`
      + `<div class="mp-body">${rows.join('')}</div>` + actions;
  }

  /* ---------------- choropleth hover tooltips (region / district) ---------------- */

  /** Recount active warnings/incidents per region + district for the hover tooltips. */
  private rebuildAreaTallies(): void {
    this.regionTally.clear();
    this.districtTally.clear();
    const d = this.data();
    if (!d) { return; }
    const bumpRegion = (name: string | null, sev: string | null, kind: 'warning' | 'incident') => {
      const key = norm(name ?? '');
      if (!key) { return; }
      const t = this.regionTally.get(key) ?? { sev: null, warnings: 0, incidents: 0 };
      if (kind === 'warning') { t.warnings++; } else { t.incidents++; }
      if (sev && (SEV_RANK[sev] ?? 0) > (t.sev ? (SEV_RANK[t.sev] ?? 0) : 0)) { t.sev = sev; }
      this.regionTally.set(key, t);
    };
    for (const w of d.warnings ?? []) {
      for (const r of (w.affectedRegions ?? '').split(/[,;]/)) {
        if (cleanName(r)) { bumpRegion(cleanName(r), w.severityLevel, 'warning'); }
      }
      const district = cleanName(w.affectedDistricts ?? '');
      if (district) {
        const key = norm(cleanName(w.affectedRegions ?? '')) + '|' + normDist(district);
        const t = this.districtTally.get(key) ?? { sev: null, warnings: 0 };
        t.warnings++;
        if (w.severityLevel && (SEV_RANK[w.severityLevel] ?? 0) > (t.sev ? (SEV_RANK[t.sev] ?? 0) : 0)) { t.sev = w.severityLevel; }
        this.districtTally.set(key, t);
      }
    }
    for (const inc of d.incidents ?? []) { bumpRegion(inc.regionName, inc.severityLevel, 'incident'); }
  }

  /** Bilingual "2 warnings · 1 incident" (or empty when nothing is active). */
  private tallyLine(warnings: number, incidents: number): string {
    const sw = this.L.lang() === 'sw';
    const parts: string[] = [];
    if (warnings) { parts.push(sw ? (warnings === 1 ? 'onyo 1' : `maonyo ${warnings}`) : `${warnings} warning${warnings === 1 ? '' : 's'}`); }
    if (incidents) { parts.push(sw ? (incidents === 1 ? 'tukio 1' : `matukio ${incidents}`) : `${incidents} incident${incidents === 1 ? '' : 's'}`); }
    return parts.join(' · ');
  }

  private tipHtml(name: string, sev: string | null, warnings: number, incidents: number): string {
    const sw = this.L.lang() === 'sw';
    const head = `<b style="font-size:0.95rem;">${this.escHtml(name)}</b>`;
    if (!warnings && !incidents) {
      return `${head}<br><span style="color:#64748b;font-weight:500;">${sw ? 'Hakuna tahadhari kwa sasa' : 'No active alerts'}</span>`;
    }
    const dot = sev ? `<span style="color:${SEV_COLOR[sev] ?? '#64748b'};">●</span> ${this.escHtml(this.sevName(sev))} · ` : '';
    return `${head}<br>${dot}${this.tallyLine(warnings, incidents)}`;
  }

  private regionTipHtml(region: string): string {
    const t = this.regionTally.get(norm(region));
    return this.tipHtml(region, t?.sev ?? null, t?.warnings ?? 0, t?.incidents ?? 0);
  }

  private districtTipHtml(region: string, district: string): string {
    const t = this.districtTally.get(norm(region) + '|' + normDist(district));
    return this.tipHtml(district, t?.sev ?? null, t?.warnings ?? 0, 0);
  }

  /** Click a Live-Monitoring counter to filter the map; click the active one again to clear. */
  setFilter(f: 'Emergency' | 'Warning' | 'Watch' | 'Incidents'): void {
    this.sevFilter.set(this.sevFilter() === f ? 'all' : f);
    this.renderAlerts();
  }

  /** Dim a counter that is filtered out so the active selection reads clearly. */
  statOpacity(f: 'Emergency' | 'Warning' | 'Watch' | 'Incidents'): number {
    const cur = this.sevFilter();
    return cur === 'all' || cur === f ? 1 : 0.4;
  }

  /** Clear any active map filter (show everything). */
  clearFilter(): void {
    this.sevFilter.set('all');
    this.renderAlerts();
  }

  /** Poll the portal so the counters, map markers and alerts stay live without a manual reload. */
  private refreshLive(): void {
    this.http.get<LandingPayload>('/api/v1/portal/landing').subscribe(d => {
      this.data.set(d);
      this.stampUpdated();
      this.renderAlerts();
    });
  }

  /** Records the live payload's arrival time as "HH:MM" for the freshness chip / LIVE popover. */
  private stampUpdated(): void {
    const now = new Date();
    this.lastUpdated.set(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  }

  dismissIntro(): void {
    this.introVisible.set(false);
    sessionStorage.setItem('dmis-intro-seen', '1');
  }

  /**
   * Builds the choropleth function: normalises region names and ranks severities so a region
   * affected by several alerts takes the most severe colour (Emergency > Warning > Watch).
   */
  /**
   * Builds the alert choropleth. A warning that names specific district(s) colours only those districts
   * (not the whole region); a region-level warning (no districts) colours the region. A region affected
   * by several alerts takes the most severe colour (Emergency > Warning > Watch).
   */
  private buildAlertFills(d: LandingPayload): { regionFill: RegionFill; districtFill: DistrictFill; districtRegions: string[] } {
    const clean = cleanName;
    const bestRegion = new Map<string, string>();        // normRegion -> severity (region-level only)
    const bestDistrict = new Map<string, string>();      // normRegion|normDistrict -> severity
    const districtRegions = new Set<string>();           // region names that carry a district-level alert
    const considerRegion = (regionName: string | null, severity: string | null) => {
      if (!regionName || !severity || !SEV_RANK[severity]) { return; }
      const key = norm(regionName);
      if (!bestRegion.has(key) || SEV_RANK[severity] > SEV_RANK[bestRegion.get(key)!]) { bestRegion.set(key, severity); }
    };
    const considerDistrict = (regionName: string, districtName: string, severity: string | null) => {
      if (!regionName || !districtName || !severity || !SEV_RANK[severity]) { return; }
      const key = norm(regionName) + '|' + normDist(districtName);
      if (!bestDistrict.has(key) || SEV_RANK[severity] > SEV_RANK[bestDistrict.get(key)!]) { bestDistrict.set(key, severity); }
      districtRegions.add(clean(regionName));
    };
    for (const w of d.warnings) {
      const district = clean(w.affectedDistricts ?? '');
      if (district) {
        considerDistrict(clean(w.affectedRegions ?? ''), district, w.severityLevel);
      } else {
        for (const r of (w.affectedRegions ?? '').split(/[,;]/)) { considerRegion(clean(r), w.severityLevel); }
      }
    }
    for (const inc of d.incidents ?? []) { considerRegion(inc.regionName, inc.severityLevel); }
    return {
      regionFill: (region: string) => { const s = bestRegion.get(norm(region)); return s ? SEV_COLOR[s] : null; },
      districtFill: (region: string, district: string) => { const s = bestDistrict.get(norm(region) + '|' + normDist(district)); return s ? SEV_COLOR[s] : null; },
      districtRegions: [...districtRegions],
    };
  }

  /** Back to the national view (clears district/ward layers). */
  resetMap(): void {
    this.drill?.reset();
    this.drilled.set(false);
  }

  /** Escape operator-authored bulletin text before injecting it into a Leaflet popup's innerHTML. */
  private escHtml(s: string | null | undefined): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  ngOnDestroy(): void {
    this.timers.forEach(t => clearInterval(t));
  }
}
