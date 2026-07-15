import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { escapeHtml } from '../../core/html';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { EwAgencyService } from './ew-agencies/ew-agency.service';
import { loadCrossAgencyRef, renderCrossAgencyRef, RefMarker } from './ew-agencies/cross-agency-ref';
import { EwCrossAgencyPanelComponent } from './ew-agencies/ew-cross-agency-panel.component';
import { EwPreviewModalComponent } from './ew-agencies/ew-preview-modal.component';
import { EntityTaskingsComponent } from './ew-agencies/entity-taskings.component';
import { leafletDrawControlOptions, leafletDrawShapeOptions } from './ew-agencies/ew-agency.model';

declare const L: any;

interface AlertLevel { key: string; label: string; color: string; text: string; }
interface HazardType { key: string; label: string; labelSw: string; icon: string; agency: string; }
/** Each painted area OWNS its level (captured at click time) — changing the active painting level
 * must never recolour areas painted earlier. This is the fix for the cross-contamination bug. */
interface HazardArea { name: string; level: string; }
/** A hazard delineation product (cyclone cone/track, epicentre point, flood polygon, radius circle, …)
 * drawn on the map and kept persistently. Serialised as GeoJSON (+ radius for circles). */
interface Delineation { id: number; kind: string; geojson: any; radius?: number; level: string; }
interface Hazard {
  id: number; type: string; areas: HazardArea[]; delineations: Delineation[];
  description: string; likelihood: string; impact: string; impactsExpected: string;
}
interface DayData { date: string; hazards: Hazard[]; }

// Engine-exact: ALERT colors (dmd_page) + TMA hazard types (config.py).
const LEVELS: AlertLevel[] = [
  { key: 'NONE', label: 'No warning', color: '#E5E7EB', text: '#374151' },
  { key: 'ADVISORY', label: 'Advisory', color: '#FFFF00', text: '#000' },
  { key: 'WARNING', label: 'Warning', color: '#FFA500', text: '#000' },
  { key: 'MAJOR_WARNING', label: 'Major', color: '#FF0000', text: '#FFF' },
];
// Include "No warning" (white/clear) as a selectable paint level, kept last — lets the operator clear/mark an area as no-alert.
const PAINT_LEVELS = [...LEVELS.filter(l => l.key !== 'NONE'), ...LEVELS.filter(l => l.key === 'NONE')];
// Full hazard set + EXACT engine icons (ew/assets/icons → /ew-icons), distributed across agencies as
// config.py does. TMA markers are not the only hazards — GST/MoH/MoA/MoW/NEMC contribute their own.
const HAZARD_TYPES: HazardType[] = [
  { key: 'HEAVY_RAIN', label: 'Heavy Rain', labelSw: 'Mvua Kubwa', icon: 'heavy_rain.png', agency: 'TMA' },
  { key: 'LARGE_WAVES', label: 'Large Waves', labelSw: 'Mawimbi Makubwa', icon: 'large_waves.png', agency: 'TMA' },
  { key: 'STRONG_WIND', label: 'Strong Wind', labelSw: 'Upepo Mkali', icon: 'strong_wind.png', agency: 'TMA' },
  { key: 'EXTREME_TEMPERATURE', label: 'Extreme Temperature', labelSw: 'Joto/Baridi Kali', icon: 'extreme_temperature.png', agency: 'TMA' },
  { key: 'FLOODS', label: 'Floods', labelSw: 'Mafuriko', icon: 'floods.png', agency: 'MoW' },
  { key: 'EARTHQUAKE', label: 'Earthquake', labelSw: 'Tetemeko la Ardhi', icon: 'earthquake.png', agency: 'GST' },
  { key: 'LANDSLIDES', label: 'Landslide', labelSw: 'Maporomoko ya Ardhi', icon: 'landslides.png', agency: 'GST' },
  { key: 'VOLCANO', label: 'Volcano', labelSw: 'Volkano', icon: 'volcano.png', agency: 'GST' },
  { key: 'DISEASE_OUTBREAK', label: 'Disease Outbreak', labelSw: 'Mlipuko wa Magonjwa', icon: 'disease_outbreak.png', agency: 'MoH' },
  { key: 'DROUGHT', label: 'Drought', labelSw: 'Ukame', icon: 'drought.png', agency: 'MoA' },
  { key: 'AIR_POLLUTION', label: 'Air Pollution', labelSw: 'Uchafuzi wa Hewa', icon: 'air_pollution.png', agency: 'NEMC' },
];
const HAZ_ICON = (type: string) => '/ew-icons/' + (HAZARD_TYPES.find(t => t.key === type)?.icon ?? 'heavy_rain.png');
const LIK = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * Native EW bulletin builder; the Python 722E_4 generate service produces the PDF.
 * Per the user's required behaviour: on ONE map you pick an active painting level (Advisory/Warning/Major),
 * click areas to paint EACH area at that level (every area owns its own level — changing the active level
 * never repaints earlier selections), and DRAW hazard delineation products (point/circle/polygon/line) that
 * persist on the map. "Generate" splits each hazard's areas by level into the 722E_4 JSON (+ delineations)
 * and posts to /ew-api which calls the UNCHANGED engine and returns the identical PDF.
 */
@Component({
    selector: 'page-ew-alert-map',
    imports: [PageHeaderComponent, DatePipe, EwCrossAgencyPanelComponent, EwPreviewModalComponent, RouterLink, EntityTaskingsComponent],
    template: `
    <dmis-page-header title="Early Warning — New Bulletin" icon="fa-satellite-dish"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Early Warning Systems', url:'/m/preparedness/early-warnings'}, {label:'New Bulletin'}]">
      <button class="btn-add" type="button" [disabled]="generating()" (click)="generate()">
        <i class="fas" [class.fa-file-pdf]="!generating()" [class.fa-spinner]="generating()" [class.fa-spin]="generating()"></i>
        {{ generating() ? 'Generating…' : 'Generate Warning' }}
      </button>
      <button class="btn-add" type="button" style="background:#4527a0; margin-left:8px" [disabled]="pushing()" (click)="pushToEocc()">
        <i class="fas" [class.fa-tower-broadcast]="!pushing()" [class.fa-spinner]="pushing()" [class.fa-spin]="pushing()"></i>
        {{ pushing() ? 'Pushing…' : 'Push to EOCC' }}
      </button>
      <button class="btn-add" type="button" style="background:#fff;color:#b91c1c;border:1px solid #fecaca; margin-left:8px" [disabled]="clearing()" (click)="clearMine()" title="Remove TMA's currently-issued warning from the cross-agency map and PMO-DMD">
        <i class="fas" [class.fa-eraser]="!clearing()" [class.fa-spinner]="clearing()" [class.fa-spin]="clearing()"></i>
        {{ clearing() ? 'Clearing…' : 'Clear my warning' }}
      </button>
    </dmis-page-header>

    <dmis-entity-taskings agency="tma"></dmis-entity-taskings>

    <a routerLink="/m/preparedness/early-warnings" style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;color:#64748b;text-decoration:none;margin:4px 0 10px"><i class="fas fa-arrow-left"></i> Early Warning Systems</a>

    <!-- TMA also sees what every other warning entity has pushed -->
    <ew-cross-agency-panel current="tma"></ew-cross-agency-panel>

    @if (previewUrl()) {
      <ew-preview-modal title="Tanzania Meteorological Authority — 722E_4 Bulletin" [url]="previewUrl()!" [rawUrl]="previewRaw()"
        file="tma-722e4.pdf" (close)="previewUrl.set(null)" (push)="pushFromPreview()"></ew-preview-modal>
    }

    <!-- Day tabs -->
    <div class="day-tabs">
      @for (d of days(); track d.date; let i = $index) {
        <button type="button" class="day-tab" [class.active]="activeDay() === i" (click)="switchDay(i)">
          <span class="day-n">Day {{ i + 1 }}</span>
          <span class="day-d">{{ d.date | date:'EEE dd MMM' }}</span>
          @if (d.hazards.length) { <span class="day-badge">{{ d.hazards.length }}</span> }
        </button>
      }
    </div>

    <div class="ew-grid">
      <div class="haz-panel">
        <div class="haz-head">
          <span><i class="fas fa-layer-group"></i> Day {{ activeDay() + 1 }} hazards</span>
          <button class="haz-add" type="button" (click)="addHazard()"><i class="fas fa-plus"></i> Add hazard</button>
        </div>
        <div class="haz-help">
          Each card is <b>one hazard type</b> with its own areas. Rain on Dodoma stays rain — pick another type or
          <b>Add hazard</b> for wind elsewhere. Changing type never rewrites a card that already has areas.
        </div>
        @for (h of activeHazards(); track h.id) {
          <div class="haz-card" [class.active]="h.id === activeId()" (click)="selectHazard(h.id)">
            <div class="haz-card-top">
              <span class="haz-ico" [style.border-color]="topColor(h)"><img [src]="hazIcon(h.type)" [alt]="h.type"></span>
              <div class="haz-type-wrap" (click)="$event.stopPropagation()">
                <div class="haz-type-name">{{ typeLabel(h.type) }}</div>
                <select class="haz-type-select" [value]="h.type"
                  [title]="hazardHasWork(h) ? 'Has areas/shapes — choosing another type opens a new card and keeps this one' : 'Hazard type for this card'"
                  (change)="onHazardTypeChange(h.id, $any($event.target).value, $any($event.target))">
                  @for (g of hazardGroups; track g.agency) {
                    <optgroup [label]="g.agency">
                      @for (t of g.types; track t.key) { <option [value]="t.key">{{ t.label }} · {{ t.labelSw }}</option> }
                    </optgroup>
                  }
                </select>
                @if (hazardHasWork(h)) {
                  <div class="haz-lock">Areas locked to this type — new type = new card</div>
                }
              </div>
              <button class="haz-del" type="button" (click)="removeHazard(h.id,$event)" title="Remove this hazard card only"><i class="fas fa-times"></i></button>
            </div>
            <div class="haz-foot">
              <i class="fas fa-map-marker-alt"></i> {{ h.areas.length }} area(s){{ h.delineations.length ? ' · ' + h.delineations.length + ' shape(s)' : '' }}
              @if (h.id === activeId()) { <span class="haz-active-tag">painting {{ activeLevelLabel() }}</span> }
            </div>
            @if (h.areas.length) {
              <div class="haz-regions">
                @for (a of h.areas; track a.name) {
                  <span class="haz-region" [style.background]="colorOf(a.level) + '33'" [style.border]="'1px solid ' + colorOf(a.level)">
                    {{ a.name }} · {{ typeLabel(h.type) }}
                    <i class="fas fa-times" (click)="unassign(h.id,a.name,$event)"></i>
                  </span>
                }
              </div>
            }
            <textarea class="haz-input" rows="2" placeholder="Description (e.g. 'of heavy rain is issued over …')"
              [value]="h.description" (click)="$event.stopPropagation()" (input)="patch(h.id,{description:$any($event.target).value})"></textarea>
            <div class="haz-two">
              <label>Likelihood
                <select [value]="h.likelihood" (click)="$event.stopPropagation()" (change)="patch(h.id,{likelihood:$any($event.target).value})">
                  @for (k of lik; track k) { <option [value]="k">{{ k }}</option> }
                </select>
              </label>
              <label>Impact
                <select [value]="h.impact" (click)="$event.stopPropagation()" (change)="patch(h.id,{impact:$any($event.target).value})">
                  @for (k of lik; track k) { <option [value]="k">{{ k }}</option> }
                </select>
              </label>
            </div>
            <input class="haz-input" placeholder="Impacts expected (optional)" [value]="h.impactsExpected"
              (click)="$event.stopPropagation()" (input)="patch(h.id,{impactsExpected:$any($event.target).value})">
          </div>
        }
        @if (!activeHazards().length) {
          <div class="haz-empty">No hazards for this day — it will read <b>NO WARNING</b>. Click <b>Add hazard</b> to issue one.</div>
        }
        <div class="legend">
          @for (l of levels; track l.key) { <div class="legend-row"><span class="legend-swatch" [style.background]="l.color"></span>{{ l.label }}</div> }
        </div>
      </div>

      <div class="map-wrap">
        @if (crossRef().length) {
          <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:#475569;margin-bottom:6px;cursor:pointer">
            <input type="checkbox" [checked]="refOn()" (change)="refOn.set($any($event.target).checked); applyRef()">
            <i class="fas fa-diagram-project" style="color:#94a3b8"></i> Show what other entities issued — reference only
          </label>
        }
        <!-- Level drives BOTH region paint and drawn shape shade (yellow / orange / red). -->
        <div class="paint-bar">
          <span class="paint-lbl">Alert level (areas + shapes):</span>
          @for (l of paintLevels; track l.key) {
            <button type="button" class="paint-btn" [class.on]="activeLevel() === l.key"
              [style.background]="activeLevel() === l.key ? l.color : 'transparent'"
              [style.color]="activeLevel() === l.key ? l.text : 'var(--text-mid)'" [style.border-color]="l.color"
              (click)="setPaintLevel(l.key)">{{ l.label }}</button>
          }
          <span class="paint-swatch" [style.background]="colorOf(activeLevel())" title="Shape fill colour"></span>
          <span class="paint-hint-inline">Shapes shade this colour</span>
        </div>
        <div #alertMap class="alert-map"></div>
        <div class="map-hint"><i class="fas fa-hand-pointer"></i>
          Active: <b>{{ activeTypeLabel() }}</b> · level <b>{{ activeLevelLabel() }}</b>
          (regions + drawn shapes). Other hazard cards keep their own colours. Day {{ activeDay() + 1 }}.
        </div>
        @if (status()) { <div class="map-status" [class.err]="statusErr()">{{ status() }}</div> }
      </div>
    </div>
  `,
    styles: [`
    .day-tabs { display: flex; gap: 0.4rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
    .day-tab { display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem; border: 1px solid var(--border); background: #fff; border-radius: 10px; padding: 0.4rem 0.8rem; cursor: pointer; position: relative; min-width: 96px; }
    .day-tab.active { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(0,51,102,0.1); }
    .day-n { font-weight: 700; font-size: 0.8rem; color: var(--text-dark); }
    .day-d { font-size: 0.75rem; color: var(--text-mid); }
    .day-badge { position: absolute; top: -6px; right: -6px; background: var(--primary); color: #fff; border-radius: 50%; width: 18px; height: 18px; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; }
    .ew-grid { display: grid; grid-template-columns: 360px 1fr; gap: 1rem; align-items: start; }
    .haz-panel { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 0.9rem; max-height: calc(100vh - 230px); overflow-y: auto; }
    .haz-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; color: var(--text-dark); margin-bottom: 0.7rem; font-size: 0.9rem; }
    .haz-add { border: 0; background: var(--primary); color: #fff; border-radius: 8px; padding: 0.3rem 0.6rem; font-size: 0.78rem; cursor: pointer; }
    .haz-card { border: 1px solid var(--border); border-radius: 12px; padding: 0.6rem; margin-bottom: 0.6rem; cursor: pointer; }
    .haz-card.active { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(0,51,102,0.1); }
    .haz-help { font-size: 0.75rem; color: var(--text-mid); line-height: 1.35; margin: -0.2rem 0 0.65rem; padding: 0.45rem 0.55rem; background: #f0f7ff; border: 1px solid #d0e4f7; border-radius: 8px; }
    .haz-card-top { display: flex; align-items: flex-start; gap: 0.4rem; }
    .haz-type-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
    .haz-type-name { font-size: 0.78rem; font-weight: 700; color: var(--text-dark); }
    .haz-type-select { width: 100%; border: 1px solid var(--border); border-radius: 7px; padding: 0.3rem; font-size: 0.8rem; }
    .haz-lock { font-size: 0.68rem; color: #0f766e; font-weight: 600; }
    .haz-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); flex-shrink: 0; }
    .haz-ico { width: 30px; height: 30px; border-radius: 8px; border: 2px solid; background: #fff; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 2px; margin-top: 2px; }
    .haz-ico img { width: 100%; height: 100%; object-fit: contain; }
    .haz-map-icon { filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4)); pointer-events: none; }
    .haz-del { border: 0; background: transparent; color: var(--text-light); cursor: pointer; margin-top: 2px; }
    .haz-foot { font-size: 0.75rem; color: var(--text-mid); margin-top: 0.5rem; display: flex; align-items: center; gap: 0.35rem; }
    .haz-active-tag { background: rgba(0,51,102,0.08); color: var(--primary); padding: 0.1rem 0.4rem; border-radius: 20px; font-size: 0.75rem; margin-left: auto; }
    .haz-regions { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.5rem; }
    .haz-region { border-radius: 6px; padding: 0.12rem 0.4rem; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.3rem; }
    .haz-region i { cursor: pointer; color: var(--text-light); font-size: 0.6rem; }
    .haz-input { width: 100%; border: 1px solid var(--border); border-radius: 7px; padding: 0.35rem 0.5rem; font-size: 0.8rem; margin-top: 0.5rem; font-family: inherit; resize: vertical; }
    .haz-two { display: flex; gap: 0.4rem; margin-top: 0.5rem; }
    .haz-two label { flex: 1; font-size: 0.75rem; color: var(--text-mid); display: flex; flex-direction: column; gap: 0.2rem; }
    .haz-two select { border: 1px solid var(--border); border-radius: 7px; padding: 0.3rem; font-size: 0.78rem; }
    .haz-empty { font-size: 0.8rem; color: var(--text-mid); padding: 0.6rem; background: rgba(0,0,0,0.02); border-radius: 8px; }
    .legend { border-top: 1px solid var(--border); margin-top: 0.6rem; padding-top: 0.6rem; }
    .legend-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-mid); padding: 0.15rem 0; }
    .legend-swatch { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.12); }
    .map-wrap { position: relative; }
    .paint-bar { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 0.4rem 0.6rem; margin-bottom: 0.5rem; }
    .paint-lbl { font-size: 0.75rem; color: var(--text-mid); font-weight: 600; }
    .paint-btn { border: 1.5px solid; border-radius: 7px; padding: 0.28rem 0.7rem; font-size: 0.78rem; font-weight: 700; cursor: pointer; background: transparent; }
    .paint-swatch { width: 18px; height: 18px; border-radius: 4px; border: 2px solid #000; flex-shrink: 0; }
    .paint-hint-inline { font-size: 0.72rem; color: var(--text-mid); }
    .alert-map { height: calc(100vh - 285px); min-height: 480px; border-radius: 16px; border: 1px solid var(--border); background: #eef2f5; z-index: 1; }
    /* Ensure Leaflet vector fills are not stripped by global SVG rules */
    :host ::ng-deep .leaflet-overlay-pane path,
    :host ::ng-deep .leaflet-pane path { pointer-events: auto; }
    .map-hint { position: absolute; bottom: 12px; left: 12px; background: rgba(255,255,255,0.92); border-radius: 10px; padding: 0.5rem 0.8rem; font-size: 0.8rem; color: var(--text-mid); z-index: 500; box-shadow: 0 2px 8px rgba(0,0,0,0.08); max-width: 70%; }
    .map-status { position: absolute; top: 56px; left: 50%; transform: translateX(-50%); background: var(--primary); color: #fff; padding: 0.45rem 0.9rem; border-radius: 20px; font-size: 0.78rem; z-index: 600; box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
    .map-status.err { background: #dc2626; }
    .leaflet-pane.delineation-pane { z-index: 650; }
  `]
})
export class EwAlertMapComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private agencyBus = inject(EwAgencyService);
  mapEl = viewChild<ElementRef>('alertMap');

  levels = LEVELS;
  paintLevels = PAINT_LEVELS;
  // TMA authors ONLY its own hazards (heavy rain, large waves, strong wind, extreme temperature) — each
  // entity issues its own hazards, so the selector is scoped to TMA rather than every agency's hazards.
  hazardTypes = HAZARD_TYPES.filter(t => t.agency === 'TMA');
  hazardGroups = [{ agency: 'TMA', types: HAZARD_TYPES.filter(t => t.agency === 'TMA') }];
  hazIcon(type: string): string { return HAZ_ICON(type); }
  lik = LIK;
  issueTime = '15:30';
  days = signal<DayData[]>(this.buildDays());
  activeDay = signal(0);
  activeId = signal(0);
  activeLevel = signal('ADVISORY');   // level for region paint AND new drawn shapes (shared pen)
  drawLevel = signal('ADVISORY');     // kept in sync with activeLevel — shape fill uses this
  generating = signal(false);
  pushing = signal(false);
  clearing = signal(false);
  status = signal('');
  statusErr = signal(false);
  private sanitizer = inject(DomSanitizer);
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewRaw = signal<string>('');
  private seq = 0;
  private shapeSeq = 0;
  private map: any;
  private regionLayers = new Map<string, any>();
  private drawnGroup: any;            // persistent delineation FeatureGroup (edit/trash target — shapes only)
  private hazIconLayer: any;          // hazard icon markers on regions + shapes (not in draw edit group)
  private hazIconMarkers = new Map<string, any>();   // keyed hazardId|area|type or shape|hazardId|dlnId
  refOn = signal(true);                              // overlay what OTHER entities issued (reference, like PMO)
  crossRef = signal<RefMarker[]>([]);
  private refLayer: any;

  constructor() {
    setTimeout(() => this.initMap(), 0);
    loadCrossAgencyRef(this.http, ex => this.agencyBus.allLatest(ex), 'tma', m => { this.crossRef.set(m); this.applyRef(); });
  }

  /** Add / refresh / remove the cross-agency reference overlay on this map. */
  applyRef(): void {
    if (!this.map) { return; }
    if (this.refLayer) { this.map.removeLayer(this.refLayer); this.refLayer = null; }
    if (!this.refOn() || !this.crossRef().length) { return; }
    renderCrossAgencyRef(this.http, this.crossRef(), layer => { this.refLayer = layer; if (this.map && this.refOn()) { layer.addTo(this.map); } });
  }

  private buildDays(): DayData[] {
    const out: DayData[] = [];
    const base = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push({ date: d.toISOString().slice(0, 10), hazards: [] });
    }
    return out;
  }

  activeHazards = computed(() => this.days()[this.activeDay()]?.hazards ?? []);
  activeHazard = computed(() => this.activeHazards().find(h => h.id === this.activeId()) ?? null);
  activeLevelLabel = computed(() => LEVELS.find(l => l.key === this.activeLevel())?.label ?? '');
  activeTypeLabel = computed(() => this.typeLabel(this.activeHazard()?.type ?? 'HEAVY_RAIN'));

  typeLabel(type: string): string {
    return this.hazardTypes.find(t => t.key === type)?.label
      ?? HAZARD_TYPES.find(t => t.key === type)?.label
      ?? type;
  }

  /** True when this card already owns map work that must not be retyped in place. */
  hazardHasWork(h: Hazard | null | undefined): boolean {
    if (!h) { return false; }
    return (h.areas?.length ?? 0) > 0 || (h.delineations?.length ?? 0) > 0;
  }

  /** Deep-clone so cards never share area/shape arrays or GeoJSON by reference. */
  private cloneHazard(h: Hazard): Hazard {
    return {
      id: h.id,
      type: h.type,
      description: h.description,
      likelihood: h.likelihood,
      impact: h.impact,
      impactsExpected: h.impactsExpected,
      areas: (h.areas ?? []).map(a => ({ name: a.name, level: a.level })),
      delineations: (h.delineations ?? []).map(d => ({
        id: d.id,
        kind: d.kind,
        level: d.level,
        radius: d.radius,
        geojson: d.geojson ? JSON.parse(JSON.stringify(d.geojson)) : d.geojson,
      })),
    };
  }

  private emptyHazard(type = 'HEAVY_RAIN'): Hazard {
    return {
      id: ++this.seq,
      type,
      areas: [],
      delineations: [],
      description: '',
      likelihood: 'MEDIUM',
      impact: 'MEDIUM',
      impactsExpected: '',
    };
  }

  colorOf(level: string): string {
    // Normalize so "warning" / "MAJOR WARNING" still resolve to palette colours.
    const key = String(level || 'NONE').trim().toUpperCase().replace(/\s+/g, '_');
    return LEVELS.find(l => l.key === key)?.color
      ?? ({ ADVISORY: '#FFFF00', WARNING: '#FFA500', MAJOR_WARNING: '#FF0000', NONE: '#E5E7EB' } as Record<string, string>)[key]
      ?? '#E5E7EB';
  }

  /**
   * Severity rank — MUST put NONE at 0. PAINT_LEVELS ends with NONE, so findIndex(NONE)
   * is highest and wrongly beats every real alert (regions never took yellow/orange/red).
   */
  private levelRank(level: string): number {
    const key = String(level || 'NONE').trim().toUpperCase().replace(/\s+/g, '_');
    const rank: Record<string, number> = { NONE: 0, ADVISORY: 1, WARNING: 2, MAJOR_WARNING: 3 };
    return rank[key] ?? 0;
  }

  /** Highest level among a hazard's areas — card icon ring colour. */
  topColor(h: Hazard): string {
    let best = 'NONE';
    for (const a of h.areas) {
      if (this.levelRank(a.level) > this.levelRank(best)) { best = a.level; }
    }
    return this.colorOf(best);
  }

  /**
   * Composite level for a region across ALL hazards on the active day (highest wins).
   * Matches the PDF engine: rain @ X and wind @ Y both stay visible; same region with two
   * hazards uses the stronger alert colour.
   */
  private compositeAreaLevel(name: string): string {
    let best = 'NONE';
    for (const h of this.activeHazards()) {
      const a = h.areas.find(x => x.name === name);
      if (a && this.levelRank(a.level) > this.levelRank(best)) { best = a.level; }
    }
    return best;
  }

  /** Level the ACTIVE hazard card assigned to this area (for paint toggle / emphasis). */
  private activeCardAreaLevel(name: string): string | null {
    return this.activeHazard()?.areas.find(a => a.name === name)?.level ?? null;
  }

  private mutateActiveHazard(fn: (h: Hazard) => Hazard, restyle = true): void {
    const id = this.activeId();
    this.days.update(days => days.map((d, i) => {
      if (i !== this.activeDay()) { return d; }
      return {
        ...d,
        // Clone every card so non-active hazards cannot share mutable nested state.
        hazards: d.hazards.map(h => h.id === id ? this.cloneHazard(fn(this.cloneHazard(h))) : this.cloneHazard(h)),
      };
    }));
    if (restyle) { this.restyle(); }
  }
  private mutateDay(fn: (hz: Hazard[]) => Hazard[]): void {
    this.days.update(days => days.map((d, i) => {
      if (i !== this.activeDay()) { return d; }
      const next = fn(d.hazards.map(h => this.cloneHazard(h)));
      return { ...d, hazards: next.map(h => this.cloneHazard(h)) };
    }));
    this.restyle();
  }

  addHazard(type = 'HEAVY_RAIN'): void {
    const h = this.emptyHazard(type);
    this.mutateDay(hz => [...hz, h]);
    this.activeId.set(h.id);
    this.renderDelineations();
  }
  removeHazard(id: number, e: Event): void {
    e.stopPropagation();
    this.mutateDay(hz => hz.filter(h => h.id !== id));
    if (this.activeId() === id) { this.activeId.set(this.activeHazards()[0]?.id ?? 0); }
    this.renderDelineations();
  }

  /**
   * Hazard type change — critical isolation rule:
   * - Empty card: retype in place.
   * - Card with areas/shapes: NEVER rewrite type (would convert rain areas into wind).
   *   Instead open/focus another card for the new type; keep the earlier work intact.
   */
  onHazardTypeChange(id: number, newType: string, selectEl?: HTMLSelectElement): void {
    const h = this.activeHazards().find(x => x.id === id);
    if (!h || !newType || h.type === newType) { return; }

    const oldLabel = this.typeLabel(h.type);
    const newLabel = this.typeLabel(newType);

    if (!this.hazardHasWork(h)) {
      // In-place retype only when the card has no areas/shapes yet.
      this.days.update(days => days.map((d, i) => {
        if (i !== this.activeDay()) { return d; }
        return {
          ...d,
          hazards: d.hazards.map(x => {
            const c = this.cloneHazard(x);
            if (c.id === id) { c.type = newType; }
            return c;
          }),
        };
      }));
      this.selectHazard(id);
      this.restyle();
      this.renderDelineations();
      return;
    }

    // Revert the <select> UI to the locked type (work stays on this card).
    if (selectEl) { selectEl.value = h.type; }

    // Prefer an existing card of the requested type (same day).
    const existing = this.activeHazards().find(x => x.id !== id && x.type === newType);
    if (existing) {
      this.selectHazard(existing.id);
      this.flash(
        `Kept ${oldLabel} on its areas. Switched to the existing ${newLabel} card — paint more areas there.`,
        false,
      );
      return;
    }

    // Fork a brand-new empty card for the new type; do not touch the old card.
    const created = this.emptyHazard(newType);
    this.days.update(days => days.map((d, i) => {
      if (i !== this.activeDay()) { return d; }
      return {
        ...d,
        hazards: [...d.hazards.map(x => this.cloneHazard(x)), created],
      };
    }));
    this.activeId.set(created.id);
    this.restyle();
    this.renderDelineations();
    this.flash(
      `Kept ${oldLabel} unchanged. New card for ${newLabel} — click regions for ${newLabel} only.`,
      false,
    );
  }

  /** Non-type field updates only. Type must go through onHazardTypeChange (never rewrite via patch). */
  patch(id: number, p: Partial<Hazard>): void {
    if (p.type !== undefined) {
      this.onHazardTypeChange(id, String(p.type));
      return;
    }
    this.days.update(days => days.map((d, i) => {
      if (i !== this.activeDay()) { return d; }
      return {
        ...d,
        hazards: d.hazards.map(h => {
          if (h.id !== id) { return this.cloneHazard(h); }
          const next = this.cloneHazard(h);
          if (p.description !== undefined) { next.description = p.description; }
          if (p.likelihood !== undefined) { next.likelihood = p.likelihood; }
          if (p.impact !== undefined) { next.impact = p.impact; }
          if (p.impactsExpected !== undefined) { next.impactsExpected = p.impactsExpected; }
          return next;
        }),
      };
    }));
  }
  unassign(id: number, name: string, e: Event): void {
    e.stopPropagation();
    this.days.update(days => days.map((d, i) => {
      if (i !== this.activeDay()) { return d; }
      return {
        ...d,
        hazards: d.hazards.map(h => {
          const c = this.cloneHazard(h);
          if (c.id === id) { c.areas = c.areas.filter(a => a.name !== name); }
          return c;
        }),
      };
    }));
    this.restyle();
  }

  switchDay(i: number): void {
    this.activeDay.set(i);
    this.activeId.set(this.activeHazards()[0]?.id ?? 0);
    this.restyle();
    this.renderDelineations();
  }

  /** Select a hazard card — map keeps ALL hazards' areas/shapes visible; selected card is the only paint target. */
  selectHazard(id: number): void {
    this.activeId.set(id);
    this.restyle();
    this.renderDelineations();
  }

  /**
   * Paint an area onto the ACTIVE hazard card only.
   * Other cards' areas are never read-modified-written — each type keeps its own list.
   */
  private paintArea(name: string): void {
    if (!this.activeHazard()) { this.addHazard(); }
    const targetId = this.activeId();
    const lvl = this.activeLevel();
    this.days.update(days => days.map((d, i) => {
      if (i !== this.activeDay()) { return d; }
      return {
        ...d,
        hazards: d.hazards.map(h => {
          const c = this.cloneHazard(h);
          if (c.id !== targetId) { return c; } // leave every other hazard untouched
          const existing = c.areas.find(a => a.name === name);
          if (existing && existing.level === lvl) {
            c.areas = c.areas.filter(a => a.name !== name);
          } else if (existing) {
            c.areas = c.areas.map(a => a.name === name ? { name, level: lvl } : a);
          } else {
            c.areas = [...c.areas, { name, level: lvl }];
          }
          return c;
        }),
      };
    }));
    this.restyle();
  }

  private styleFor(name: string): any {
    const lvl = this.compositeAreaLevel(name);
    const key = String(lvl || 'NONE').trim().toUpperCase().replace(/\s+/g, '_');
    const onActiveCard = this.activeCardAreaLevel(name) != null;
    const painted = key !== 'NONE';
    return {
      fill: true,
      fillColor: this.colorOf(key),
      fillOpacity: painted ? 0.82 : 0.14,
      color: onActiveCard ? '#0b3d5c' : '#5a6b7b',
      weight: onActiveCard ? 2.4 : 0.8,
      opacity: 1,
    };
  }
  private restyle(): void {
    for (const [n, layer] of this.regionLayers) {
      // Reset path options fully so Leaflet never keeps a stale grey fill.
      layer.setStyle(this.styleFor(n));
      if (typeof layer.bringToFront === 'function' && this.compositeAreaLevel(n) !== 'NONE') {
        try { layer.bringToFront(); } catch { /* ignore */ }
      }
    }
    this.renderHazardIcons();
  }

  /**
   * Hazard icons for every painted area + every drawn shape on every hazard card.
   * Multi-hazard on one region: icons are nudged (PDF map_generator style).
   * Shape icons live here (not in drawnGroup) so Leaflet.Draw trash/edit only hits geometries.
   */
  private renderHazardIcons(): void {
    if (!this.hazIconLayer || typeof L === 'undefined') { return; }
    for (const [, m] of this.hazIconMarkers) { this.hazIconLayer.removeLayer(m); }
    this.hazIconMarkers.clear();

    const byRegion = new Map<string, { key: string; type: string; level: string }[]>();
    for (const h of this.activeHazards()) {
      for (const a of h.areas) {
        if (!a.level || a.level === 'NONE') { continue; }
        const key = `area|${h.id}|${a.name}|${h.type}`;
        const list = byRegion.get(a.name) ?? [];
        list.push({ key, type: h.type, level: a.level });
        byRegion.set(a.name, list);
      }
    }
    const nudges: [number, number][] = [
      [0, 0], [0.18, 0.12], [-0.18, 0.12], [0.18, -0.12], [-0.18, -0.12], [0, 0.22],
    ];
    for (const [name, items] of byRegion) {
      const ly = this.regionLayers.get(name);
      if (!ly) { continue; }
      const c = ly.getBounds().getCenter();
      items.forEach((w, i) => {
        const [dLat, dLng] = nudges[i % nudges.length];
        const m = this.makeHazardMarker(c.lat + dLat, c.lng + dLng, w.type, w.level, false);
        m.addTo(this.hazIconLayer);
        this.hazIconMarkers.set(w.key, m);
      });
    }
    // Shape centroids — same icon ring as PDF hazard_icons on drawn_shapes.
    for (const h of this.activeHazards()) {
      for (const dln of h.delineations) {
        const c = this.delineationCentroid(dln);
        if (!c) { continue; }
        const key = `shape|${h.id}|${dln.id}|${h.type}`;
        const m = this.makeHazardMarker(c.lat, c.lng, h.type, dln.level, false);
        m.addTo(this.hazIconLayer);
        this.hazIconMarkers.set(key, m);
      }
    }
  }

  private delineationCentroid(dln: Delineation): { lat: number; lng: number } | null {
    const geom = dln.geojson?.geometry;
    if (!geom) { return null; }
    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      return { lat, lng };
    }
    if (geom.type === 'Polygon' && geom.coordinates?.[0]?.length) {
      let slat = 0, slng = 0, n = 0;
      for (const [lng, lat] of geom.coordinates[0]) { slat += lat; slng += lng; n++; }
      return n ? { lat: slat / n, lng: slng / n } : null;
    }
    if (geom.type === 'LineString' && geom.coordinates?.length) {
      let slat = 0, slng = 0, n = 0;
      for (const [lng, lat] of geom.coordinates) { slat += lat; slng += lng; n++; }
      return n ? { lat: slat / n, lng: slng / n } : null;
    }
    return null;
  }

  /** Ringed hazard icon (engine PNG) — used on regions and on drawn shapes. */
  private makeHazardMarker(lat: number, lng: number, type: string, level: string, interactive: boolean): any {
    const ring = this.colorOf(level);
    return L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'haz-map-icon',
        html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${ring};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35)"><img src="${HAZ_ICON(type)}" style="width:18px;height:18px;object-fit:contain" alt=""></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
      pane: 'delineation-pane',
      interactive,
      keyboard: false,
    });
  }

  // ── delineation (draw) layer ──
  /**
   * Render shapes for ALL hazards on the day (PDF day map shows every hazard's
   * drawn_shapes). Active card's shapes are full opacity; others slightly faded.
   * Icons are re-applied via renderHazardIcons (shape centroids).
   */
  private renderDelineations(): void {
    if (!this.drawnGroup) { return; }
    this.drawnGroup.clearLayers();
    for (const h of this.activeHazards()) {
      const isActive = h.id === this.activeId();
      for (const dln of h.delineations) {
        const lyr = this.layerFromDelineation(dln, isActive);
        if (lyr) {
          this.drawnGroup.addLayer(lyr);
          // Force style after add — some Leaflet builds ignore fill at construct time on custom panes.
          try { lyr.setStyle(this.shapeStyle(dln.level, isActive, dln.kind)); } catch { /* ignore */ }
        }
      }
    }
    try { this.drawnGroup.bringToFront?.(); } catch { /* ignore */ }
    this.renderHazardIcons();
  }

  /** PDF-like level shade for a shape: yellow/orange/red fill + black edge. */
  private shapeStyle(level: string, isActive = true, kind = 'polygon'): any {
    const base = leafletDrawShapeOptions(level);
    const isLine = kind === 'polyline' || kind === 'line' || kind === 'LineString';
    if (isLine) {
      return {
        pane: 'delineation-pane',
        color: this.colorOf(level),
        weight: isActive ? 4 : 3,
        opacity: isActive ? 1 : 0.75,
        fill: false,
        dashArray: isActive ? null : '6 4',
      };
    }
    return {
      pane: 'delineation-pane',
      fill: true,
      fillColor: base.fillColor,
      // Active shapes: full PDF alpha; other cards slightly quieter but still clearly coloured.
      fillOpacity: isActive ? 0.58 : 0.38,
      color: '#000000',
      weight: isActive ? 2.2 : 1.6,
      opacity: 1,
      dashArray: isActive ? null : '5 3',
    };
  }

  private layerFromDelineation(dln: Delineation, isActive = true): any {
    const style = this.shapeStyle(dln.level, isActive, dln.kind);
    const geom = dln.geojson?.geometry;
    let lyr: any = null;
    if ((dln.kind === 'circle' || dln.geojson?.properties?.kind === 'circle') && geom?.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      const radius = dln.radius ?? dln.geojson?.properties?.radius ?? 10000;
      lyr = L.circle([lat, lng], { radius, ...style });
    } else if (dln.kind === 'point' && geom?.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      lyr = L.circleMarker([lat, lng], { radius: 8, ...style, fillOpacity: isActive ? 0.9 : 0.55 });
    } else if (geom?.type === 'Polygon' || dln.kind === 'polygon' || dln.kind === 'rectangle') {
      const rings = geom?.type === 'Polygon'
        ? geom.coordinates.map((ring: any[]) => ring.map(([lng, lat]: number[]) => [lat, lng]))
        : [];
      if (rings.length) { lyr = L.polygon(rings, style); }
    } else if (geom?.type === 'LineString' || dln.kind === 'polyline') {
      const pts = (geom?.coordinates ?? []).map(([lng, lat]: number[]) => [lat, lng]);
      if (pts.length) { lyr = L.polyline(pts, style); }
    }
    if (lyr) {
      lyr._dlnId = dln.id;
      lyr._dlnLevel = dln.level;
    }
    return lyr;
  }
  private drawControl: any;

  /** One pen for regions and shapes — keeps shape shade in lockstep with the level buttons. */
  setPaintLevel(key: string): void {
    this.activeLevel.set(key);
    this.drawLevel.set(key);
    this.rebuildDrawControl();
  }
  setDrawLevel(key: string): void {
    this.setPaintLevel(key);
  }
  private rebuildDrawControl(): void {
    if (!this.map || !this.drawnGroup || !(L.Control && L.Control.Draw)) return;
    if (this.drawControl) { try { this.map.removeControl(this.drawControl); } catch { /* ignore */ } }
    this.drawControl = new L.Control.Draw(leafletDrawControlOptions(this.drawnGroup, this.drawLevel()));
    this.map.addControl(this.drawControl);
  }

  private onDrawCreated(e: any): void {
    const layer = e.layer;
    const type = e.layerType;
    // Use the shared paint level so shape shade always matches the selected Advisory/Warning/Major button.
    const lvl = this.activeLevel() || this.drawLevel();
    const style = this.shapeStyle(lvl, true, type);
    try { if (layer.setStyle) { layer.setStyle(style); } } catch { /* ignore */ }
    const col = this.colorOf(lvl);
    let dln: Delineation;
    if (type === 'circle') {
      const c = layer.getLatLng();
      dln = { id: ++this.shapeSeq, kind: 'circle', level: lvl, radius: Math.round(layer.getRadius()),
        geojson: { type: 'Feature', properties: { kind: 'circle', radius: Math.round(layer.getRadius()), level: lvl, fill: col, color: col, fillColor: col }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } } };
    } else if (type === 'marker' || type === 'circlemarker') {
      const c = layer.getLatLng();
      dln = { id: ++this.shapeSeq, kind: 'point', level: lvl,
        geojson: { type: 'Feature', properties: { kind: 'point', level: lvl, fill: col, color: col, fillColor: col }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } } };
    } else {
      const gj = layer.toGeoJSON();
      gj.properties = { ...(gj.properties || {}), kind: type, level: lvl, fill: col, color: col, fillColor: col };
      dln = { id: ++this.shapeSeq, kind: type, level: lvl, geojson: gj };
    }
    if (!this.activeHazard()) { this.addHazard(); }
    const targetId = this.activeId();
    const dlnCopy: Delineation = {
      id: dln.id,
      kind: dln.kind,
      level: dln.level,
      radius: dln.radius,
      geojson: dln.geojson ? JSON.parse(JSON.stringify(dln.geojson)) : dln.geojson,
    };
    this.days.update(days => days.map((d, i) => {
      if (i !== this.activeDay()) { return d; }
      return {
        ...d,
        hazards: d.hazards.map(h => {
          const c = this.cloneHazard(h);
          if (c.id === targetId) {
            c.delineations = [...c.delineations, dlnCopy];
          }
          return c;
        }),
      };
    }));
    this.renderDelineations();
    const lvlLabel = LEVELS.find(l => l.key === lvl)?.label ?? lvl;
    this.flash(`${dln.kind} on ${this.typeLabel(this.activeHazard()?.type ?? '')} (${lvlLabel}) — other hazards unchanged.`, false);
  }

  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined') { return; }
    this.map = L.map(el, { center: [-6.3, 35.0], zoom: 6, minZoom: 5, maxZoom: 11,
      maxBounds: [[-12.2, 28.5], [-0.8, 41.2]], maxBoundsViscosity: 1.0, attributionControl: false });
    // dedicated top pane so delineations sit above the opaque water layer and never get occluded
    this.map.createPane('delineation-pane');
    this.map.getPane('delineation-pane').style.zIndex = 650;
    this.drawnGroup = L.featureGroup().addTo(this.map);
    this.hazIconLayer = L.layerGroup().addTo(this.map);
    this.applyRef();

    // Local GIS layers only — no online tiles (production/offline-safe, matches the PDF map style)
    this.http.get<any>('/geojson/tz_boundary_gis.geojson').subscribe(b =>
      L.geoJSON(b, { style: { color: '#9aa7b2', weight: 1, fill: false }, interactive: false }).addTo(this.map));
    this.http.get<any>('/geojson/tz_water_gis.geojson').subscribe(w =>
      L.geoJSON(w, { style: { fillColor: '#a5cde8', fillOpacity: 0.7, color: '#7EB8DA', weight: 0.5 }, interactive: false }).addTo(this.map));
    this.http.get<any>('/geojson/tz_regions_gis.geojson').subscribe(r => {
      const layer = L.geoJSON(r, {
        style: (f: any) => this.styleFor(this.rn(f)),
        onEachFeature: (f: any, lyr: any) => {
	          const name = this.rn(f);
	          this.regionLayers.set(name, lyr);
	          lyr.bindTooltip(() => escapeHtml(this.regionTooltip(name)), { sticky: true, direction: 'top' });
          lyr.on({
            click: () => this.paintArea(name),
            // Keep fill colours on hover — only bump stroke weight.
            mouseover: () => {
              const s = this.styleFor(name);
              lyr.setStyle({ ...s, weight: Math.max(s.weight, 2.6) });
            },
            mouseout: () => lyr.setStyle(this.styleFor(name)),
          });
        },
      }).addTo(this.map);
      this.map.fitBounds(layer.getBounds(), { padding: [10, 10] });
      // build-on-push: if opened with ?product=<id>, pre-load that bulletin's envelope to build upon
      const pid = this.route.snapshot.queryParamMap.get('product');
      if (pid) {
        this.http.get<any>(`/api/v1/ew/products/${pid}`).subscribe({
          next: r => { this.loadEnvelope(r?.product?.envelope ?? null); this.flash('Loaded the pushed bulletin — adjust levels or add on top.', false); },
          error: () => this.flash('Could not load that bulletin to build upon.', true),
        });
      }
    });

    // Draw toolbar — stroke/fill = active Advisory/Warning/Major colour; trash removes for clean PDF.
    if (L.Control && L.Control.Draw) {
      this.rebuildDrawControl();
      this.map.on(L.Draw.Event.CREATED, (e: any) => this.onDrawCreated(e));
      this.map.on(L.Draw.Event.DELETED, (e: any) => {
        const ids = new Set<number>();
        e.layers.eachLayer((l: any) => { if (l._dlnId) { ids.add(l._dlnId); } });
        if (ids.size) {
          // Shapes from any hazard card may be on the map — remove matching ids only; clone every card.
          this.days.update(days => days.map((d, i) => {
            if (i !== this.activeDay()) { return d; }
            return {
              ...d,
              hazards: d.hazards.map(h => {
                const c = this.cloneHazard(h);
                c.delineations = c.delineations.filter(x => !ids.has(x.id));
                return c;
              }),
            };
          }));
          this.renderDelineations();
          this.flash(`${ids.size} shape(s) removed — other hazards unchanged.`, false);
        }
      });
    }
  }
  private rn(f: any): string { return f.properties.Region_Nam ?? f.properties.name; }

  /** Tooltip lists every hazard card that painted this region (multi-hazard / multi-incident). */
  private regionTooltip(name: string): string {
    const parts: string[] = [name];
    for (const h of this.activeHazards()) {
      const a = h.areas.find(x => x.name === name);
      if (!a || a.level === 'NONE') { continue; }
      const label = this.hazardTypes.find(t => t.key === h.type)?.label ?? h.type;
      const lv = LEVELS.find(l => l.key === a.level)?.label ?? a.level;
      parts.push(`${label} · ${lv}`);
    }
    return parts.join(' · ');
  }

  /** PUBLIC build-on-push hook (Phase 1 foundation): load a serialized envelope (areas+levels+delineations)
   * into the map so a downstream view (e.g. PMO impact) can build upon what was pushed. */
  loadEnvelope(env: { days?: { date?: string; hazards?: any[] }[] } | null): void {
    if (!env?.days?.length) { return; }
    this.days.update(cur => cur.map((d, i) => {
      const src = env.days![i];
      if (!src?.hazards?.length) { return d; }
      const hazards: Hazard[] = src.hazards.map((sh: any) => ({
        id: ++this.seq, type: sh.type ?? 'HEAVY_RAIN',
        areas: (sh.areas ?? (sh.regions ?? []).map((n: string) => ({ name: n, level: sh.alert_level ?? 'ADVISORY' }))) as HazardArea[],
        delineations: (sh.delineations ?? []).map((g: any) => ({ id: ++this.shapeSeq, kind: g.properties?.kind ?? 'polygon', level: g.properties?.level ?? 'WARNING', radius: g.properties?.radius, geojson: g })),
        description: sh.description ?? '', likelihood: sh.likelihood ?? 'MEDIUM', impact: sh.impact ?? 'MEDIUM', impactsExpected: sh.impacts_expected ?? '',
      }));
      return { ...d, hazards };
    }));
    this.activeId.set(this.activeHazards()[0]?.id ?? 0);
    this.restyle();
    this.renderDelineations();
  }

  /**
   * Build the 722E_4 engine payload.
   * - One engine entry per (hazard type × alert level) so Heavy Rain @ X and Strong Wind @ Y
   *   both survive as independent multi-hazard rows on the same day map.
   * - Drawn shapes go as `drawn_shapes` (GeoJSON Features with level/fill colour) — the PDF
   *   map_generator renders them with per-shape colour + hazard icons, matching the authoring map.
   * - Shape-only hazards (no region paint) are valid.
   */
  private buildPayload(): any {
    const days = this.days().map(d => {
      const hazards: any[] = [];
      for (const h of d.hazards) {
        type Bucket = { regions: string[]; shapes: any[] };
        const byLevel = new Map<string, Bucket>();
        const bucket = (lv: string): Bucket => {
          if (!byLevel.has(lv)) { byLevel.set(lv, { regions: [], shapes: [] }); }
          return byLevel.get(lv)!;
        };
        for (const a of h.areas) {
          if (a.level && a.level !== 'NONE') { bucket(a.level).regions.push(a.name); }
        }
        for (const dln of h.delineations) {
          const lv = (dln.level && dln.level !== 'NONE') ? dln.level : null;
          if (!lv) { continue; }
          // Ensure GeoJSON properties carry colour/level so PDF _resolve_shape_color works.
          const feat = dln.geojson ? { ...dln.geojson } : null;
          if (!feat) { continue; }
          const col = this.colorOf(lv);
          feat.properties = {
            ...(feat.properties || {}),
            kind: dln.kind,
            level: lv,
            fill: col,
            color: col,
            radius: dln.radius,
            hazard_type: h.type,
          };
          bucket(lv).shapes.push(feat);
        }
        const label = this.hazardTypes.find(t => t.key === h.type)?.label.toLowerCase() ?? 'hazard';
        for (const [level, grp] of byLevel) {
          if (!grp.regions.length && !grp.shapes.length) { continue; }
          hazards.push({
            type: h.type,
            alert_level: level,
            regions: grp.regions,
            drawn_shapes: grp.shapes,
            description: h.description || `of ${label} is issued over these areas.`,
            likelihood: h.likelihood,
            impact: h.impact,
            impacts_expected: h.impactsExpected || 'Localized impacts over few areas.',
          });
        }
      }
      return { date: d.date, hazards };
    });
    return { issue_date: this.days()[0].date, issue_time: this.issueTime, days };
  }

  /** The full map state for the EW-DB / build-on-push envelope (areas+levels+delineations) — used by the
   * persistence + PMO impact-map phases, NOT by the PDF engine. */
  envelope(): any {
    return {
      issue_date: this.days()[0].date, issue_time: this.issueTime,
      days: this.days().map(d => ({
        date: d.date,
        hazards: d.hazards.map(h => ({
          type: h.type, areas: h.areas, description: h.description,
          likelihood: h.likelihood, impact: h.impact, impacts_expected: h.impactsExpected,
          delineations: h.delineations.map(x => x.geojson),
        })),
      })),
    };
  }

  /** Generate Warning: build the 722E_4 PDF via the Python engine, open it, and add it to the registry. */
  generate(): void {
    const payload = this.buildPayload();
    if (!payload.days.some((d: any) => d.hazards.length)) {
      this.flash('Paint at least one area or draw a shape for a hazard first.', true);
      return;
    }
    this.generating.set(true);
    this.flash('Generating the 722E_4 bulletin…', false);
    // Health-check the PDF engine first so operators get a clear message if :8600 is down.
    this.http.get('/ew-api/health').subscribe({
      next: () => this.postGenerate(payload),
      error: () => {
        this.generating.set(false);
        this.flash(
          'Bulletin engine is not running (port 8600). Start it with start-all.sh or: cd extracted/maafa.pmo.go.tz/ew && EWS_PDF_PORT=8600 python pdf_service.py',
          true,
        );
      },
    });
  }

  private postGenerate(payload: any): void {
    this.http.post('/ew-api/generate/722e4', payload, { responseType: 'blob', observe: 'response' }).subscribe({
      next: (res) => {
        const blob = res.body!;
        // Engine returns JSON error bodies as application/json — never treat those as a PDF.
        const ctype = res.headers.get('Content-Type') || blob.type || '';
        if (ctype.includes('json') || blob.type.includes('json')) {
          this.generating.set(false);
          blob.text().then(t => {
            let msg = 'Generation failed — check the bulletin and try again.';
            try { msg = JSON.parse(t)?.error || msg; } catch { /* keep default */ }
            this.flash(msg, true);
          });
          return;
        }
        this.generating.set(false);
        const url = URL.createObjectURL(blob);
        this.previewRaw.set(url);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        this.storeProduct(blob);
        this.flash('Preview ready — review it, edit and regenerate as needed, then push to the EOCC. Saved to Dissemination.', false);
      },
      error: (err) => {
        this.generating.set(false);
        const body = err?.error;
        if (body instanceof Blob) {
          body.text().then(t => {
            let msg = 'Generation failed — check the bulletin and try again.';
            try {
              const j = JSON.parse(t);
              if (j?.error) { msg = String(j.error).slice(0, 400); }
            } catch { /* keep default */ }
            if (err?.status === 0) {
              msg = 'Cannot reach the bulletin engine (port 8600). Ensure the EW PDF service is running.';
            }
            this.flash(msg, true);
          });
          return;
        }
        const msg = err?.status === 0
          ? 'Cannot reach the bulletin engine (port 8600). Ensure the EW PDF service is running.'
          : (err?.error?.error || err?.message || 'Generation failed — check the bulletin and try again.');
        this.flash(msg, true);
      },
    });
  }
  pushFromPreview(): void { this.previewUrl.set(null); this.pushToEocc(); }

  /** Push to EOCC: share this warning with the cross-agency bus so PMO-DMD consolidates it for Impact
   * Analysis and every other entity can see it as input. Independent of the PDF engine. */
  pushToEocc(): void {
    const payload = this.buildPayload();
    if (!payload.days.some((d: any) => d.hazards.length)) {
      this.flash('Paint at least one area or draw a shape for a hazard first.', true);
      return;
    }
    this.pushing.set(true);
    this.agencyBus.submit('tma', payload).subscribe({
      next: () => { this.pushing.set(false); this.flash('Pushed to EOCC — shared with PMO-DMD for impact analysis and visible to all entities.', false); },
      error: () => { this.pushing.set(false); this.flash('Push to EOCC failed — try again.', true); },
    });
  }

  /** Clear TMA's currently-issued warning — it leaves the cross-agency map + PMO-DMD at once. */
  clearMine(): void {
    this.clearing.set(true);
    this.agencyBus.withdraw('tma').subscribe({
      next: (r: any) => { this.clearing.set(false);
        this.flash(r?.withdrawn ? 'Your warning was cleared — it has left the cross-agency map and PMO-DMD.' : 'No active warning to clear.', false);
        loadCrossAgencyRef(this.http, ex => this.agencyBus.allLatest(ex), 'tma', m => { this.crossRef.set(m); this.applyRef(); }); },
      error: () => { this.clearing.set(false); this.flash('Could not clear the warning — check your permissions and try again.', true); },
    });
  }

  /** Phase 2: store the generated PDF + its geo so it is appended on the Generated-Bulletins map. */
  private storeProduct(blob: Blob): void {
    const areas: HazardArea[] = [];
    for (const d of this.days()) { for (const h of d.hazards) { areas.push(...h.areas); } }
    if (!areas.length) { return; }
    const regions = [...new Set(areas.map(a => a.name))];
    let best = 'ADVISORY';
    for (const a of areas) { if (this.levelRank(a.level) > this.levelRank(best)) { best = a.level; } }
    // centroid = average of the painted regions' layer centres (the map already holds the geometry)
    let lat = 0, lng = 0, n = 0;
    for (const r of regions) { const ly = this.regionLayers.get(r); if (ly) { const c = ly.getBounds().getCenter(); lat += c.lat; lng += c.lng; n++; } }
    // Title lists every hazard type actually present (not always Heavy Rain).
    const typeKeys = [...new Set(this.days().flatMap(d => d.hazards.map(h => h.type)).filter(Boolean))];
    const typeLabels = typeKeys.map(k => this.typeLabel(k));
    const typeTitle = typeLabels.length === 0 ? 'Multi-hazard'
      : typeLabels.length === 1 ? typeLabels[0]
      : typeLabels.slice(0, 3).join(' + ') + (typeLabels.length > 3 ? '…' : '');
    const title = `${typeTitle} — ${LEVELS.find(l => l.key === best)?.label} (${regions.slice(0, 2).join(', ')}${regions.length > 2 ? '…' : ''})`;
    const fd = new FormData();
    fd.append('pdf', blob, 'bulletin.pdf');
    fd.append('payload', JSON.stringify({
      title, bulletin_type: '722E_4', issue_date: this.days()[0].date, issue_time: this.issueTime,
      severity: best, regions, centroid_lat: n ? lat / n : null, centroid_lng: n ? lng / n : null, envelope: this.envelope(),
    }));
    this.http.post('/api/v1/ew/products', fd).subscribe({ next: () => {}, error: () => {} });
  }

  private flash(msg: string, err: boolean): void {
    this.status.set(msg); this.statusErr.set(err);
    if (!err) { setTimeout(() => this.status.set(''), 4000); }
  }
}
