import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EwAgencyService, Consolidated } from './ew-agency.service';
import { EwCrossAgencyPanelComponent } from './ew-cross-agency-panel.component';
import { EwPreviewModalComponent } from './ew-preview-modal.component';
import { ALERT_LEVELS, alertColor, AGENCIES, AGENCY_HAZARDS, HAZ_ICON } from './ew-agency.model';

/** type-key -> icon file, flattened across all agencies' hazards (for the overlay markers). */
const ICON_BY_TYPE: Record<string, string> = Object.values(AGENCY_HAZARDS).flat()
  .reduce((m, h) => { m[h.key] = h.icon; return m; }, {} as Record<string, string>);

declare const L: any;

/**
 * PMO-DMD consolidated impact view — overlays ALL warning entities' submissions into one realistic
 * 3-day picture. The backend merges them highest-alert-wins per district (native rebuild of the Python
 * DMD auto-import/merge); this screen renders the merged tiers on the district map + every agency's
 * narrative. The Python DMD page remains the canonical authoring surface — this is the native overlay view.
 */
@Component({
  selector: 'page-dmd-consolidated',
  standalone: true,
  imports: [NgClass, RouterLink, EwCrossAgencyPanelComponent, EwPreviewModalComponent],
  styles: [`
    .wrap { padding: 14px 18px 40px; }
    .hd { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .hd .ic { width: 44px; height: 44px; border-radius: 11px; background: #ede7f6; color: #4527a0; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; }
    .hd h1 { font-size: 1.2rem; margin: 0; color: #14303a; } .hd .sub { font-size: 0.78rem; color: #6c757d; }
    .src { margin-left: auto; font-size: 0.74rem; color: #475569; text-align: right; }
    .src .chip { display: inline-block; font-size: 0.62rem; font-weight: 700; border-radius: 6px; padding: 1px 7px; margin: 2px 0 0 4px; color: #fff; }
    .grid { display: grid; grid-template-columns: 1fr 380px; gap: 14px; align-items: start; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .panel { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 12px 14px; }
    .day-tabs { display: flex; gap: 5px; margin-bottom: 10px; }
    .day-tabs button { flex: 1; font-size: 0.78rem; font-weight: 600; color: #607089; border: 1px solid #e3e6ed; background: #f8fafc; padding: 8px; border-radius: 8px; cursor: pointer; font-family: inherit; }
    .day-tabs button.on { background: #4527a0; color: #fff; border-color: #4527a0; }
    #dmdmap { height: 560px; border-radius: 12px; border: 1px solid #e3e6ed; }
    .legend { display: flex; gap: 14px; margin-top: 8px; font-size: 0.72rem; color: #475569; flex-wrap: wrap; }
    .legend .sw { display: inline-block; width: 13px; height: 13px; border-radius: 3px; margin-right: 4px; vertical-align: -2px; }
    .tier-counts { display: flex; gap: 8px; margin-bottom: 10px; }
    .tc { flex: 1; text-align: center; border-radius: 9px; padding: 8px; color: #1a1a1a; }
    .tc b { display: block; font-size: 1.2rem; } .tc span { font-size: 0.64rem; font-weight: 700; text-transform: uppercase; }
    .cmt { border-left: 3px solid #ccc; padding: 6px 10px; margin-bottom: 8px; background: #fbfcfe; border-radius: 0 8px 8px 0; }
    .cmt .ch { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; font-weight: 700; color: #1f2d3d; }
    .cmt .ch .pill { font-size: 0.58rem; font-weight: 800; border-radius: 6px; padding: 1px 6px; margin-left: auto; }
    .cmt .cd { font-size: 0.72rem; color: #475569; margin-top: 3px; }
    .cmt .ca { font-size: 0.66rem; color: #94a3b8; margin-top: 2px; }
    h3 { font-size: 0.82rem; color: #1f2d3d; margin: 4px 0 8px; }
    .pushbtn { font-size: 0.8rem; font-weight: 700; border-radius: 8px; padding: 9px 16px; border: none; cursor: pointer; font-family: inherit; color: #fff; background: #4527a0; }
    .pushbtn:disabled { opacity: 0.55; cursor: default; }
    .pushflash { padding: 9px 13px; border-radius: 9px; font-size: 0.82rem; margin-bottom: 12px; }
    .pushflash.ok { background: #ede7f6; color: #4527a0; border: 1px solid #b39ddb; }
    .pushflash.err { background: #fee2e2; color: #b91c1c; }
  `],
  template: `
    <div class="wrap">
      <a routerLink="/m/preparedness/early-warnings" style="display:inline-flex;align-items:center;gap:6px;font-size:0.76rem;color:#64748b;text-decoration:none;margin-bottom:10px"><i class="fas fa-arrow-left"></i> Early Warning Systems</a>
      <div class="hd">
        <div class="ic"><i class="fas fa-layer-group"></i></div>
        <div><h1>PMO-DMD — Consolidated Impact Overlay</h1>
          <div class="sub">Hydromet tiers (TMA + MoW, highest-alert-wins per district) with every other entity's hazards overlaid as markers</div></div>
        <div class="src">
          <div>Contributing entities</div>
          @for (s of sources(); track s) { <span class="chip" [style.background]="agColor(s)">{{ agName(s) }}</span> }
          @if (!sources().length) { <span style="color:#94a3b8">none yet — entities submit first</span> }
          <div style="margin-top:9px">
            <button class="pushbtn" [disabled]="pushing() || !layerReady()" (click)="generateImpact()">
              <i class="fas" [ngClass]="(pushing() || !layerReady()) ? 'fa-circle-notch fa-spin' : 'fa-file-export'"></i>
              {{ pushing() ? 'Working…' : (layerReady() ? 'Generate Impact Bulletin' : 'Preparing map…') }}
            </button>
          </div>
        </div>
      </div>

      @if (pushMsg(); as p) { <div class="pushflash" [ngClass]="p.err ? 'err' : 'ok'">{{ p.msg }}</div> }
      @if (previewUrl()) {
        <ew-preview-modal title="PMO-DMD — Multirisk Impact Bulletin" [url]="previewUrl()!" [rawUrl]="previewRaw()"
          file="pmo-dmd-impact-bulletin.pdf" pushLabel="Publish Impact Bulletin"
          (close)="previewUrl.set(null)" (push)="confirmPush()"></ew-preview-modal>
      }
      <ew-cross-agency-panel current=""></ew-cross-agency-panel>

      @if (loadError()) {
        <div style="padding:12px 14px; background:#fee2e2; color:#b91c1c; border-radius:10px; font-size:0.84rem; margin-bottom:12px">
          <i class="fas fa-triangle-exclamation"></i> Could not load the consolidated picture. Check your connection or sign-in and retry.
          <button (click)="reload()" style="margin-left:10px; border:none; background:#b91c1c; color:#fff; border-radius:6px; padding:4px 12px; cursor:pointer; font-family:inherit">Retry</button>
        </div>
      } @else if (loading()) {
        <div style="padding:12px 14px; background:#f1f5f9; color:#475569; border-radius:10px; font-size:0.84rem; margin-bottom:12px">
          <i class="fas fa-circle-notch fa-spin"></i> Loading the consolidated picture…
        </div>
      }

      <div class="grid">
        <div class="panel">
          <div class="day-tabs">
            @for (d of data()?.days ?? []; track d.day) {
              <button [class.on]="activeDay() === d.day" (click)="activeDay.set(d.day); restyle()">Day {{ d.day }}</button>
            }
          </div>
          @if (curDay()) {
            <div class="tier-counts">
              <div class="tc" style="background:#FF0000"><b>{{ curEffTiers().major_warning.length }}</b><span>Major</span></div>
              <div class="tc" style="background:#FFA500"><b>{{ curEffTiers().warning.length }}</b><span>Warning</span></div>
              <div class="tc" style="background:#FFFF00"><b>{{ curEffTiers().advisory.length }}</b><span>Advisory</span></div>
            </div>
          }
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.74rem;color:#475569">
            <i class="fas fa-fill-drip" style="color:#4527a0"></i> <b>Impact level</b> — click a district to set/reduce its impact, or draw zones with the toolbar (top-left):
            @for (lv of levels; track lv.key) {
              <button (click)="drawLevel.set(lv.key)" [style.background]="drawLevel()===lv.key ? lv.color : '#fff'"
                [style.border]="'1px solid '+lv.color" style="border-radius:6px;padding:2px 9px;font-size:0.68rem;font-weight:700;cursor:pointer;color:#1a1a1a">{{ lv.label }}</button>
            }
            @if (pmoShapes().length) { <span style="color:#4527a0;font-weight:700">· {{ pmoShapes().length }} drawn</span> }
          </div>
          <div id="dmdmap"></div>
          <div class="legend">
            <span style="font-weight:700;color:#1f2d3d">Hydromet tiers (TMA+MoW):</span>
            @for (lv of levels; track lv.key) { <span><span class="sw" [style.background]="lv.color"></span>{{ lv.label }}</span> }
            <span><span class="sw" style="background:#F5F5F5"></span>No alert</span>
            <span style="font-weight:700;color:#1f2d3d;margin-left:6px">· Other hazards:</span>
            <span><i class="fas fa-map-pin" style="color:#4527a0"></i> icon markers (earthquake, disease, drought, air quality)</span>
          </div>
        </div>

        <div class="panel">
          <h3><i class="fas fa-clipboard-list"></i> PMO directives and instructions · Day {{ activeDay() }}
            <span style="font-weight:500;color:#94a3b8;font-size:0.72rem">— shown beside the map</span></h3>
          <textarea rows="4" [value]="pmoDirectives()[activeDay()] || ''" (input)="setDirectives($any($event.target).value)"
            placeholder="PMO directives and instructions for this day — one per line (e.g. evacuate low-lying wards, pre-position relief stocks, activate district EOCs). Shown beside the map in the impact bulletin."
            style="width:100%;box-sizing:border-box;border:1px solid #e3e6ed;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:0.8rem;color:#1f2d3d;resize:vertical;margin-bottom:4px"></textarea>

          <h3 style="margin-top:10px"><i class="fas fa-feather-pointed"></i> PMO impact narrative · Day {{ activeDay() }}
            <span style="font-weight:500;color:#94a3b8;font-size:0.72rem">— shown as the comment below</span></h3>
          <textarea rows="4" [value]="pmoNarratives()[activeDay()] || ''" (input)="setNarrative($any($event.target).value)"
            placeholder="PMO-DMD's consolidated impact assessment for this day — one impact / guidance point per line. Appears as the DMD comment in the impact bulletin."
            style="width:100%;box-sizing:border-box;border:1px solid #e3e6ed;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:0.8rem;color:#1f2d3d;resize:vertical;margin-bottom:4px"></textarea>
          <h3 style="margin-top:10px"><i class="fas fa-comments"></i> Agency narratives (this day)</h3>
          @if (dayComments().length) {
            @for (c of dayComments(); track $index) {
              <div class="cmt" [style.border-left-color]="agColor(c.agency)">
                <div class="ch"><i class="fas" [ngClass]="agIcon(c.agency)"></i> {{ agName(c.agency) }}
                  @if (c.type) { · <span style="font-weight:600;color:#607089">{{ c.type }}</span> }
                  <span class="pill" [style.background]="alertColor(c.alert_level)">{{ label(c.alert_level) }}</span></div>
                <div class="cd">{{ c.description }}</div>
                @if (c.areas?.length) { <div class="ca"><i class="fas fa-map-marker-alt"></i> {{ join(c.areas) }}</div> }
              </div>
            }
          } @else { <div style="font-size:0.78rem;color:#94a3b8">No narratives for this day.</div> }
        </div>
      </div>
    </div>
  `,
})
export class DmdConsolidatedComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private svc = inject(EwAgencyService);
  levels = ALERT_LEVELS;
  alertColor = alertColor;

  data = signal<Consolidated | null>(null);
  sources = signal<string[]>([]);
  activeDay = signal(1);
  loading = signal(true);
  loadError = signal(false);
  pushing = signal(false);
  pushMsg = signal<{ msg: string; err: boolean } | null>(null);
  drawLevel = signal('WARNING');                 // active level/colour for PMO delineations
  pmoShapes = signal<any[]>([]);                  // PMO impact delineations [{id, kind, geojson, radius?, level}]
  pmoOverrides = signal<Record<string, string>>({}); // PMO impact analysis: district -> level ('NONE' = reduced to no-alert), overrides the consolidated tier
  pmoNarratives = signal<Record<number, string>>({}); // PMO impact narrative per day → the DMD comment (impact bullets) in the bulletin
  pmoDirectives = signal<Record<number, string>>({}); // PMO directives & instructions per day → rendered BESIDE the big map (engine recommendations slot)
  layerReady = signal(false);                     // the GADM district layer has loaded (per-district coords need it)
  private sanitizer = inject(DomSanitizer);
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewRaw = signal<string>('');
  private pendingPayload: any = null;
  private pendingMeta: any = null;
  private pendingBlob: Blob | null = null;
  private map: any;
  private districtLayer: any;
  private overlayLayer: any;
  private drawnGroup: any;
  private shapeSeq = 0;

  ngOnInit(): void {
    this.reload();
    setTimeout(() => this.initMap(), 0);
  }

  reload(): void {
    this.loading.set(true); this.loadError.set(false);
    this.svc.consolidated(5).subscribe({
      next: r => { this.data.set(r); this.sources.set(r.sources ?? []); this.loading.set(false); this.loadError.set(false); this.restyle(); },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }
  ngOnDestroy(): void { if (this.map) { this.map.remove(); this.map = null; } }

  /** PMO STEP 1 — generate the consolidated Multirisk IMPACT bulletin (every entity arrives as a layer) and
   * PREVIEW it. The PMO PDF is the one that goes onward to the other circles. */
  generateImpact(): void {
    const cons = this.data();
    const hasContent = (cons?.days ?? []).some(d => d.tiers.major_warning.length || d.tiers.warning.length || d.tiers.advisory.length);
    if (!hasContent) { this.pushMsg.set({ msg: 'Nothing to consolidate yet — entities must push to EOCC first.', err: true }); return; }
    // Per-district coordinates come from the GADM district layer. If it hasn't loaded yet, abort with a
    // clear message rather than silently storing a null centroid (which would hide the bulletin from the
    // public map permanently). The Generate button is also disabled until layerReady, so this is a backstop.
    if (!this.layerReady()) {
      this.pushMsg.set({ msg: 'The district map is still loading — please wait a moment and click Generate again.', err: true });
      return;
    }
    this.pushing.set(true);
    this.pushMsg.set({ msg: 'Generating the PMO-DMD multirisk impact bulletin…', err: false });
    const payload = this.buildMultirisk(cons!);
    const severity = this.topSeverity(cons!);
    const districts = this.allTierDistricts(cons!);
    // Resolve a coordinate for EACH selected district (from the GADM layer already on the map) so the
    // bulletin can (a) anchor on the public map and (b) blink at its specific districts. The single
    // centroid is the average of those points — without it the portal map query (centroid not null)
    // filters the PMO bulletin out entirely.
    const areaPoints = this.areaPoints(cons!);
    const ctr = this.centroidOf(areaPoints);
    if (districts.length && !areaPoints.length) {
      // Districts are selected but none matched the map layer (unexpected name mismatch) — don't push a
      // bulletin that can never anchor on the public map. The backend also has a region-centroid fallback.
      this.pushing.set(false);
      this.pushMsg.set({ msg: 'Could not match the selected districts to the map. Reload the page and try again.', err: true });
      return;
    }
    this.pendingPayload = payload;
    this.pendingMeta = {
      title: `PMO-DMD Multirisk Impact Bulletin — ${severity.replace('_', ' ')} (${districts.slice(0, 2).join(', ')}${districts.length > 2 ? '…' : ''})`,
      bulletin_type: 'GENERATED', warning_code: null,
      issue_date: payload.issue_date, issue_time: payload.issue_time,
      severity, regions: districts, centroid_lat: ctr?.lat ?? null, centroid_lng: ctr?.lng ?? null,
      envelope: { source: 'dmd-consolidated', payload, area_points: areaPoints },
    };
    this.svc.generate('multirisk', payload).subscribe({
      next: (blob) => {
        this.pushing.set(false);
        this.pendingBlob = blob;
        const url = URL.createObjectURL(blob);
        this.previewRaw.set(url);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        this.pushMsg.set({ msg: 'Impact bulletin preview ready — review it, then push it to Impact Analysis.', err: false });
      },
      error: () => { this.pushing.set(false); this.pushMsg.set({ msg: 'Could not generate the impact bulletin — the engine may be busy. Try again.', err: true }); },
    });
  }

  /** PMO STEP 2 — from the preview, push the impact bulletin onward: ingest (creates the pending national
   * warning EW-YYYY-NNNNN → approval → dissemination) + store the PDF. This is the only push that mints a warning. */
  confirmPush(): void {
    this.previewUrl.set(null);
    const payload = this.pendingPayload, meta = this.pendingMeta, blob = this.pendingBlob;
    if (!payload) return;
    this.pushing.set(true);
    this.pushMsg.set({ msg: 'Pushing the impact bulletin to Impact Analysis…', err: false });
    this.svc.ingestDmd(payload, blob).subscribe({
      next: (r: any) => {
        const code = r?.warning_code ?? '(created)';
        // The bulletin only reaches the EOCC Bulletin registry (and can then be published to the map and
        // disseminated) if storeProduct succeeds — so its outcome drives the final message rather than
        // being silently swallowed. A storeProduct failure is surfaced so the operator can re-push or
        // upload the PDF manually, instead of seeing a false success.
        if (blob && meta) {
          this.svc.storeProduct(blob, { ...meta, warning_code: r?.warning_code ?? null }).subscribe({
            next: () => { this.pushing.set(false); this.pushMsg.set({ msg: `Pushed — pending warning ${code} created and the impact bulletin saved to EOCC Bulletin. Open EOCC Bulletin to publish it to the map and disseminate.`, err: false }); },
            error: () => { this.pushing.set(false); this.pushMsg.set({ msg: `Warning ${code} was created, but saving the bulletin PDF to EOCC Bulletin failed. Re-generate and push again, or upload the PDF directly in EOCC Bulletin.`, err: true }); },
          });
        } else {
          this.pushing.set(false);
          this.pushMsg.set({ msg: `Pushed to Impact Analysis — pending national warning ${code} created; it now flows onward to approval & dissemination.`, err: false });
        }
      },
      error: (e: any) => { this.pushing.set(false); this.pushMsg.set({ msg: `Could not push — ${this.ingestErr(e)}`, err: true }); },
    });
  }

  /** Transform the consolidated overlay into the engine's Multirisk shape (exactly 3 days) — which is
   * ALSO what the DMD ingest (parseDmd) consumes: district_summaries[] per tier + days[].comments. */
  private buildMultirisk(cons: Consolidated): any {
    const issue = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const byDay = new Map<number, any>();
    for (const d of (cons.days ?? [])) { byDay.set(d.day, d); }
    const comments = cons.comments ?? {};
    const entriesFor = (agency: string, dayNo: number) =>
      (comments[agency] ?? []).filter((e: any) => e.day === dayNo)
        .map((e: any) => ({ alert_level: e.alert_level || 'ADVISORY', description: e.description || '', likelihood: e.likelihood || 'MEDIUM' }));

    const days: any[] = [];
    const districtSummaries: any[] = [];
    for (let n = 1; n <= 3; n++) {
      const cd = byDay.get(n);
      const tiers = this.effectiveTiers(cd?.tiers ?? { major_warning: [], warning: [], advisory: [] });
      const date = iso(new Date(issue.getTime() + (n - 1) * 86400000));
      const cmt: any = {};
      const tmaE = entriesFor('tma', n); if (tmaE.length) { cmt.tma = { entries: tmaE }; }
      const mowE = entriesFor('mow', n); if (mowE.length) { cmt.mow = { entries: mowE }; }
      const pmoN = (this.pmoNarratives()[n] ?? '').trim();
      if (pmoN) { cmt.dmd = { bullets: pmoN.split('\n').map(s => s.trim()).filter(Boolean) }; }
      const day: any = {
        date, day_number: n,
        alert_tiers: {
          major_warning: { text: `${tiers.major_warning.length} district(s) at major warning.` },
          warning: { text: `${tiers.warning.length} district(s) at warning.` },
          advisory: { text: `${tiers.advisory.length} district(s) at advisory.` },
        },
        comments: cmt,
      };
      // PMO directives & instructions → engine "recommendations" slot, rendered BESIDE the big summary map
      const pmoD = (this.pmoDirectives()[n] ?? '').trim();
      if (pmoD) {
        day.recommendation_intro = 'PMO Directives and Instructions';
        day.recommendations = pmoD.split('\n').map(s => s.trim()).filter(Boolean);
      }
      days.push(day);
      districtSummaries.push({ day_number: n, major_warning: tiers.major_warning ?? [], warning: tiers.warning ?? [], advisory: tiers.advisory ?? [] });
    }
    const num = `${String(issue.getFullYear()).slice(2)}${(issue.getMonth() + 1).toString().padStart(2, '0')}${issue.getDate().toString().padStart(2, '0')}`;
    return {
      bulletin_number: num, issue_date: iso(issue), issue_time: issue.toTimeString().slice(0, 5),
      drawn_shapes: this.pmoShapes().filter(s => s.level !== 'NONE').map(s => s.geojson),
      language: 'en', header_variant: 'new', days, district_summaries: districtSummaries,
    };
  }
  private topSeverity(cons: Consolidated): string {
    let best = 'ADVISORY';
    for (const d of (cons.days ?? [])) {
      const et = this.effectiveTiers(d.tiers ?? { major_warning: [], warning: [], advisory: [] });
      if (et.major_warning.length) { return 'MAJOR_WARNING'; }
      if (et.warning.length) { best = 'WARNING'; }
    }
    return best;
  }
  private allTierDistricts(cons: Consolidated): string[] {
    const s = new Set<string>();
    for (const d of (cons.days ?? [])) { const et = this.effectiveTiers(d.tiers ?? { major_warning: [], warning: [], advisory: [] }); for (const t of [et.major_warning, et.warning, et.advisory]) { for (const x of (t ?? [])) { s.add(x); } } }
    return [...s];
  }

  /** Polygon centre of a district by display_name (from the loaded GADM layer); null if unmatched/not yet loaded. */
  private districtCentre(name: string): { lat: number; lng: number } | null {
    if (!this.districtLayer) { return null; }
    let ly: any = null;
    this.districtLayer.eachLayer((l: any) => { if (l.feature?.properties?.display_name === name) { ly = l; } });
    if (!ly) { return null; }
    const c = ly.getBounds().getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  /** One point per selected district at its HIGHEST level across the 3 days — drives the per-district blinking
   *  markers on the public map. Districts whose name doesn't match the GADM layer are skipped (graceful). */
  private areaPoints(cons: Consolidated): Array<{ name: string; lat: number; lng: number; level: string }> {
    const rank = (l: string) => ['ADVISORY', 'WARNING', 'MAJOR_WARNING'].indexOf(l);
    const top = new Map<string, string>();
    for (const d of (cons.days ?? [])) {
      const et = this.effectiveTiers(d.tiers ?? { major_warning: [], warning: [], advisory: [] });
      const tiers: Array<[string[], string]> = [[et.major_warning, 'MAJOR_WARNING'], [et.warning, 'WARNING'], [et.advisory, 'ADVISORY']];
      for (const [arr, lvl] of tiers) { for (const name of (arr ?? [])) { if (!top.has(name) || rank(lvl) > rank(top.get(name)!)) { top.set(name, lvl); } } }
    }
    const out: Array<{ name: string; lat: number; lng: number; level: string }> = [];
    for (const [name, level] of top) { const c = this.districtCentre(name); if (c) { out.push({ name, lat: c.lat, lng: c.lng, level }); } }
    return out;
  }

  /** Average centre of the affected districts — the bulletin's single map-pin coordinate. */
  private centroidOf(pts: Array<{ lat: number; lng: number }>): { lat: number; lng: number } | null {
    if (!pts.length) { return null; }
    return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
  }
  private ingestErr(e: any): string { return e?.error?.message || e?.message || 'the impact bulletin could not be ingested.'; }

  curDay() { return this.data()?.days?.find(d => d.day === this.activeDay()); }
  dayComments(): any[] {
    const c = this.data()?.comments ?? {};
    const out: any[] = [];
    for (const agency of Object.keys(c)) {
      for (const e of c[agency]) if (e.day === this.activeDay()) out.push({ ...e, agency });
    }
    return out.sort((a, b) => (b.alert_level || '').localeCompare(a.alert_level || ''));
  }

  /** Store the PMO impact narrative for the active day (→ the DMD comment in the impact bulletin). */
  setNarrative(v: string): void {
    this.pmoNarratives.set({ ...this.pmoNarratives(), [this.activeDay()]: v });
  }
  setDirectives(v: string): void {
    this.pmoDirectives.set({ ...this.pmoDirectives(), [this.activeDay()]: v });
  }

  private districtTier(): Record<string, string> {
    const out: Record<string, string> = {};
    const cd = this.curDay(); if (!cd) return out;
    for (const d of cd.tiers.major_warning) out[d] = 'MAJOR_WARNING';
    for (const d of cd.tiers.warning) out[d] = 'WARNING';
    for (const d of cd.tiers.advisory) out[d] = 'ADVISORY';
    return out;
  }

  /** Effective level for a district on the CURRENT day: a PMO impact override (incl 'NONE') wins over the
   *  consolidated hazard tier. Returns undefined when neither applies (no alert). */
  private effectiveLevelNow(name: string): string | undefined {
    const ov = this.pmoOverrides()[name];
    return ov !== undefined ? ov : this.districtTier()[name];
  }

  /** Apply the PMO impact overrides to a day's consolidated tiers → the effective tier lists. An override of
   *  'NONE' reduces a district out; PMO may also paint a district that had no consolidated alert (impact adds it). */
  private effectiveTiers(t: { major_warning: string[]; warning: string[]; advisory: string[] }):
      { major_warning: string[]; warning: string[]; advisory: string[] } {
    const ov = this.pmoOverrides();
    const out: { major_warning: string[]; warning: string[]; advisory: string[] } = { major_warning: [], warning: [], advisory: [] };
    const key = (l?: string): 'major_warning' | 'warning' | 'advisory' | null =>
      l === 'MAJOR_WARNING' ? 'major_warning' : l === 'WARNING' ? 'warning' : l === 'ADVISORY' ? 'advisory' : null;
    const place = (name: string, lvl?: string) => { const k = key(lvl); if (k && !out[k].includes(name)) { out[k].push(name); } };
    const seen = new Set<string>();
    for (const [arr, lvl] of [[t.major_warning, 'MAJOR_WARNING'], [t.warning, 'WARNING'], [t.advisory, 'ADVISORY']] as Array<[string[], string]>) {
      for (const name of (arr ?? [])) { seen.add(name); place(name, ov[name] !== undefined ? ov[name] : lvl); }
    }
    for (const [name, lvl] of Object.entries(ov)) { if (!seen.has(name)) { place(name, lvl); } }
    return out;
  }

  /** Effective tiers for the current day — drives the tier counts (template). */
  curEffTiers(): { major_warning: string[]; warning: string[]; advisory: string[] } {
    return this.effectiveTiers(this.curDay()?.tiers ?? { major_warning: [], warning: [], advisory: [] });
  }

  /** PMO impact analysis: click a district to set its impact at the active level; click again at the same level
   *  to revert to the consolidated tier. The white "No alert" level reduces a district out of the impact. */
  private paintDistrict(name: string): void {
    const lvl = this.drawLevel();
    const cur = { ...this.pmoOverrides() };
    if (cur[name] === lvl) { delete cur[name]; } else { cur[name] = lvl; }
    this.pmoOverrides.set(cur);
    this.restyle();
  }

  /** PMO delineation toolbar — draw impact zones coloured by the active level; carried into the impact PDF. */
  private initDraw(): void {
    if (!(L.Control && L.Control.Draw)) return;
    const ctl = new L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: this.drawnGroup, edit: false, remove: true },
      draw: { polygon: { shapeOptions: { color: '#374151' } }, polyline: { shapeOptions: { color: '#374151' } },
        rectangle: { shapeOptions: { color: '#374151' } }, circle: { shapeOptions: { color: '#374151' } }, marker: false, circlemarker: false },
    });
    this.map.addControl(ctl);
    this.map.on(L.Draw.Event.CREATED, (e: any) => this.onPmoDraw(e));
    this.map.on(L.Draw.Event.DELETED, (e: any) => {
      const ids = new Set<number>(); e.layers.eachLayer((l: any) => { if (l._shapeId) ids.add(l._shapeId); });
      if (ids.size) { this.pmoShapes.set(this.pmoShapes().filter(s => !ids.has(s.id))); this.renderPmoShapes(); }
    });
  }
  private onPmoDraw(e: any): void {
    const layer = e.layer, type = e.layerType, lvl = this.drawLevel();
    let s: any;
    if (type === 'circle') { const c = layer.getLatLng(); s = { id: ++this.shapeSeq, kind: 'circle', level: lvl, radius: Math.round(layer.getRadius()), geojson: { type: 'Feature', properties: { kind: 'circle', radius: Math.round(layer.getRadius()), level: lvl }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } } }; }
    else { const gj = layer.toGeoJSON(); gj.properties = { ...(gj.properties || {}), kind: type, level: lvl }; s = { id: ++this.shapeSeq, kind: type, level: lvl, geojson: gj }; }
    this.pmoShapes.set([...this.pmoShapes(), s]); this.renderPmoShapes();
  }
  private renderPmoShapes(): void {
    if (!this.drawnGroup || typeof L === 'undefined') return;
    this.drawnGroup.clearLayers();
    for (const s of this.pmoShapes()) {
      const col = alertColor(s.level); const style = { color: col, weight: 2, fillColor: col, fillOpacity: 0.45, pane: 'ewshapes' };
      const geom = s.geojson?.geometry; let lyr: any = null;
      if (s.kind === 'circle' && geom?.type === 'Point') { const [lng, lat] = geom.coordinates; lyr = L.circle([lat, lng], { radius: s.radius ?? 10000, ...style }); }
      else if (geom?.type === 'Polygon') { lyr = L.polygon(geom.coordinates.map((r: any[]) => r.map(([lng, lat]: number[]) => [lat, lng])), style); }
      else if (geom?.type === 'LineString') { lyr = L.polyline(geom.coordinates.map(([lng, lat]: number[]) => [lat, lng]), style); }
      if (!lyr) continue; lyr._shapeId = s.id; this.drawnGroup.addLayer(lyr);
      const c = lyr.getBounds ? lyr.getBounds().getCenter() : null;
      if (c) { this.drawnGroup.addLayer(L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'pmo-haz', html: `<div style="width:28px;height:28px;border-radius:50%;border:3px solid ${col};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)"><i class="fas fa-triangle-exclamation" style="color:${col};font-size:13px"></i></div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })); }
    }
  }

  private initMap(): void {
    if (typeof L === 'undefined') return;
    this.map = L.map('dmdmap', { minZoom: 5, maxZoom: 9 }).setView([-6.4, 35.0], 6);
    this.map.setMaxBounds([[-12.5, 28.0], [1.0, 41.5]]);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      { attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd' }).addTo(this.map);
    this.map.createPane('overlayicons'); this.map.getPane('overlayicons').style.zIndex = 650;
    this.map.createPane('ewshapes'); this.map.getPane('ewshapes').style.zIndex = 550;  // PMO shapes above district fills
    this.overlayLayer = L.layerGroup().addTo(this.map);
    this.drawnGroup = L.featureGroup().addTo(this.map);
    this.initDraw();
    this.http.get<any>('/geojson/tz_districts_gadm.geojson').subscribe(gj => {
      this.districtLayer = L.geoJSON(gj, {
        style: (f: any) => this.styleDistrict(f.properties.display_name),
        onEachFeature: (f: any, lyr: any) => {
          const nm = f.properties.display_name;
          lyr.on('click', () => this.paintDistrict(nm));   // PMO impact analysis: click a district to set/reduce its level
          lyr.bindTooltip(() => {
            const eff = this.effectiveLevelNow(nm);
            const ov = this.pmoOverrides()[nm] !== undefined;
            const src = this.curDay()?.tier_sources?.[nm];
            return `<b>${nm}</b><br>${eff && eff !== 'NONE' ? this.label(eff) : 'No alert'}`
              + (ov ? ' <small>(PMO impact)</small>' : (src ? `<br><small>${this.srcLabel(src)}</small>` : ''));
          }, { sticky: true });
        },
      }).addTo(this.map);
      try { this.map.fitBounds(this.districtLayer.getBounds(), { padding: [8, 8] }); } catch {}
      this.renderOverlays();
      this.layerReady.set(true);   // per-district coordinate resolution (area_points/centroid) is now possible
    });
  }
  private styleDistrict(name: string): any {
    const lvl = this.effectiveLevelNow(name);
    const active = !!lvl && lvl !== 'NONE';
    const overridden = this.pmoOverrides()[name] !== undefined;
    return { fillColor: alertColor(lvl), fillOpacity: active ? 0.8 : 0.22,
      color: overridden ? '#4527a0' : '#5a6b7b', weight: overridden ? 1.4 : 0.45, opacity: 1 };
  }
  restyle(): void {
    if (this.districtLayer) this.districtLayer.eachLayer((l: any) => l.setStyle(this.styleDistrict(l.feature.properties.display_name)));
    this.renderOverlays();
  }

  /** Place the non-hydromet hazards (GST/MoH/MoA/NEMC) as exact hazard-icon markers ringed by their
   * alert colour — so PMO sees everything overlaid without conflating them with the rain/flood tiers. */
  private renderOverlays(): void {
    if (!this.overlayLayer || !this.districtLayer || typeof L === 'undefined') return;
    this.overlayLayer.clearLayers();
    const centre = (district: string): any => {
      let ly: any = null;
      this.districtLayer.eachLayer((l: any) => { if (l.feature.properties.display_name === district) ly = l; });
      return ly ? ly.getBounds().getCenter() : null;
    };
    for (const ov of this.curDay()?.overlays ?? []) {
      const target = (ov.districts ?? []).find(d => centre(d)) ?? (ov.districts ?? [])[0];
      const c = target ? centre(target) : null;
      if (!c) continue;
      const icon = L.divIcon({
        className: 'dmd-ov',
        html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${alertColor(ov.alert_level)};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">
                 <img src="${HAZ_ICON(ICON_BY_TYPE[ov.type] || 'heavy_rain.png')}" style="width:20px;height:20px"></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      L.marker([c.lat, c.lng], { icon, pane: 'overlayicons' })
        .bindTooltip(`<b>${this.agName(ov.agency)} · ${ov.type}</b><br>${this.label(ov.alert_level)}<br><small>${this.join(ov.areas)}</small>`, { sticky: true })
        .addTo(this.overlayLayer);
    }
    // Hydromet (TMA rainfall / MoW floods) live in the tier choropleth, not the overlays — give them a hazard
    // icon too (one per distinct hydromet hazard type) so PMO sees the rain/flood symbol like every other agency.
    const day = this.curDay();
    const tierSources: Record<string, string> = day?.tier_sources ?? {};
    const tiers = day?.tiers;
    const levelOf = (d: string): string =>
      tiers?.major_warning?.includes(d) ? 'MAJOR_WARNING' : tiers?.warning?.includes(d) ? 'WARNING' : 'ADVISORY';
    const hydro: Record<string, string[]> = {};   // "AGENCY:TYPE" -> districts
    for (const [district, src] of Object.entries(tierSources)) {
      const [ag, type] = String(src).split(':');
      if (!type || !['TMA', 'MOW'].includes((ag || '').toUpperCase())) { continue; }
      (hydro[`${ag}:${type}`] ??= []).push(district);
    }
    for (const [key, districts] of Object.entries(hydro)) {
      const [ag, type] = key.split(':');
      const target = districts.find(d => centre(d)) ?? districts[0];
      const c = target ? centre(target) : null;
      if (!c) { continue; }
      const lvl = levelOf(target);
      const icon = L.divIcon({
        className: 'dmd-ov',
        html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${alertColor(lvl)};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">
                 <img src="${HAZ_ICON(ICON_BY_TYPE[type] || 'heavy_rain.png')}" style="width:20px;height:20px"></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      L.marker([c.lat, c.lng], { icon, pane: 'overlayicons' })
        .bindTooltip(`<b>${this.agName(ag.toLowerCase())} · ${type}</b><br>${this.label(lvl)}<br><small>${this.join(districts)}</small>`, { sticky: true })
        .addTo(this.overlayLayer);
    }
  }
  srcLabel(src: string): string {
    const [ag, type] = src.split(':');
    return `Driver: ${this.agName(ag.toLowerCase())}${type ? ' · ' + type : ''}`;
  }

  label(lvl?: string) { return (lvl ?? '').replace('_', ' '); }
  join(arr: string[]) { return (arr ?? []).slice(0, 6).join(', ') + ((arr?.length ?? 0) > 6 ? ` +${arr.length - 6}` : ''); }
  agName(k: string) { return (AGENCIES as any)[k]?.name ?? k.toUpperCase(); }
  agColor(k: string) { return (AGENCIES as any)[k]?.color ?? '#888'; }
  agIcon(k: string) { return (AGENCIES as any)[k]?.icon ?? 'fa-circle'; }
}
