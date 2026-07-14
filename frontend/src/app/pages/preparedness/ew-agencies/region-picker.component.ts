import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { escapeHtml } from '../../../core/html';
import {
  alertColor, HAZ_ICON, leafletDrawControlOptions, leafletDrawShapeOptions,
  shapeLeafletStyle, leafletLayerFromDelineation, forceLayerStyle, tagShapeForPdf,
} from './ew-agency.model';
import { addDmisBaseLayer } from '../../../core/tz-map';

declare const L: any;

/**
 * Shared Tanzania map for every warning entity (GST / MoH / MoA / NEMC / MLF / …).
 * - Region paint at per-area level colours
 * - Drawn shapes shaded by level (PDF-matching fill + black edge)
 * - Hazard icon on painted regions and shape centroids
 * Never rewrites another item's work — parent owns multi-item isolation.
 */
@Component({
  selector: 'ew-region-picker',
  standalone: true,
  styles: [`
    .rp { height: 540px; border-radius: 12px; border: 1px solid #e3e6ed; }
    .hint { font-size: 0.8rem; color: #94a3b8; margin-top: 6px; line-height: 1.4; }
    :host ::ng-deep .leaflet-pane path { pointer-events: auto; }
  `],
  template: `<div [id]="mapId" class="rp"></div>
    <div class="hint"><i class="fas fa-hand-pointer"></i> Click a region to paint it, or use the draw tools (top-left)
      for circle / polygon / rectangle — they shade in the <b>selected alert colour</b>
      (yellow / orange / red) with a black edge, matching the bulletin PDF.
      Trash removes shapes only for this item. Click a painted region again to clear it.</div>`,
})
export class RegionPickerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selected: string[] = [];
  @Input() levels: Record<string, string> = {};   // region -> its OWN alert level
  @Input() level = 'WARNING';                       // active paint/draw level
  @Input() hazardIcon = '';                         // THIS item's hazard icon file
  @Input() shapes: any[] = [];                      // [{id, kind, geojson, radius?, level}]
  @Input() refMarkers: { name: string; color: string; faIcon: string; entity: string; level?: string }[] = [];
  @Output() toggle = new EventEmitter<string>();
  @Output() shapesChange = new EventEmitter<any[]>();
  private http = inject(HttpClient);
  private static seq = 0;
  mapId = 'rp-' + (RegionPickerComponent.seq++);
  private map: any;
  private layer: any;
  private icons: any;       // region + shape hazard icons (not in draw feature group)
  private drawnGroup: any;  // shapes only — Leaflet.Draw edit/trash target
  private refGroup: any;
  private drawControl: any;
  private shapeSeq = 0;
  private lastDrawLevel = '';

  ngOnInit(): void { setTimeout(() => this.init(), 0); }
  ngOnChanges(): void {
    this.restyle();
    this.renderRef();
    if (this.map && this.level !== this.lastDrawLevel) {
      this.rebuildDrawControl();
    }
  }
  ngOnDestroy(): void { if (this.map) { this.map.remove(); this.map = null; } }

  private init(): void {
    if (typeof L === 'undefined') return;
    this.map = L.map(this.mapId, { minZoom: 5, maxZoom: 9, zoomControl: true }).setView([-6.4, 35.0], 6);
    this.map.setMaxBounds([[-12.5, 28.0], [1.0, 41.5]]);
    addDmisBaseLayer(this.map, this.http, 'light');
    this.map.createPane('ewshapes');
    this.map.getPane('ewshapes').style.zIndex = 550;
    this.icons = L.layerGroup().addTo(this.map);
    this.drawnGroup = L.featureGroup().addTo(this.map);
    this.refGroup = L.layerGroup().addTo(this.map);
    this.http.get<any>('/geojson/tz_regions_gis.geojson').subscribe({
      next: gj => {
        this.layer = L.geoJSON(gj, {
          style: (f: any) => this.styleOf(this.nameOf(f)),
          onEachFeature: (f: any, lyr: any) => {
            const nm = this.nameOf(f);
            lyr.on('click', () => this.toggle.emit(nm));
            lyr.bindTooltip(
              () => escapeHtml(`${nm}${this.selected.includes(nm) ? ' · ' + this.levelOf(nm).replace('_', ' ') : ''}`),
              { sticky: true },
            );
          },
        }).addTo(this.map);
        try { this.map.fitBounds(this.layer.getBounds(), { padding: [8, 8] }); } catch { /* ignore */ }
        this.renderIcons();
        this.renderShapes();
        this.renderRef();
      },
      error: () => { /* map still usable for freehand shapes */ },
    });
    this.initDraw();
  }

  private initDraw(): void {
    if (!(L.Control && L.Control.Draw)) return;
    this.rebuildDrawControl();
    this.map.on(L.Draw.Event.CREATED, (e: any) => this.onDrawCreated(e));
    this.map.on(L.Draw.Event.DELETED, (e: any) => {
      const ids = new Set<number>();
      e.layers.eachLayer((l: any) => { if (l._shapeId) ids.add(l._shapeId); });
      if (ids.size) {
        const next = (this.shapes ?? []).filter(s => !ids.has(s.id));
        this.shapes = next;
        this.renderShapes();
        this.shapesChange.emit(next);
      }
    });
  }

  private rebuildDrawControl(): void {
    if (!this.map || !(L.Control && L.Control.Draw) || !this.drawnGroup) return;
    if (this.drawControl) {
      try { this.map.removeControl(this.drawControl); } catch { /* ignore */ }
      this.drawControl = null;
    }
    this.lastDrawLevel = this.level;
    this.drawControl = new L.Control.Draw(leafletDrawControlOptions(this.drawnGroup, this.level));
    this.map.addControl(this.drawControl);
  }

  private onDrawCreated(e: any): void {
    const layer = e.layer, type = e.layerType, lvl = this.level;
    const style = shapeLeafletStyle(lvl, { pane: 'ewshapes', kind: type });
    try { if (layer.setStyle) { layer.setStyle(style); } } catch { /* ignore */ }
    const col = alertColor(lvl);
    let s: any;
    if (type === 'circle') {
      const c = layer.getLatLng();
      const radius = Math.round(layer.getRadius());
      s = {
        id: ++this.shapeSeq, kind: 'circle', level: lvl, radius,
        geojson: tagShapeForPdf(
          { type: 'Feature', properties: { kind: 'circle', radius }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } },
          lvl, { kind: 'circle', radius },
        ),
      };
    } else if (type === 'circlemarker' || type === 'marker') {
      const c = layer.getLatLng();
      s = {
        id: ++this.shapeSeq, kind: 'point', level: lvl,
        geojson: tagShapeForPdf(
          { type: 'Feature', properties: { kind: 'point' }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } },
          lvl, { kind: 'point' },
        ),
      };
    } else {
      const gj = layer.toGeoJSON();
      s = {
        id: ++this.shapeSeq, kind: type, level: lvl,
        geojson: tagShapeForPdf(gj, lvl, { kind: type }),
      };
    }
    // Ensure level always stored even if tag failed
    if (!s.geojson) {
      s.geojson = {
        type: 'Feature',
        properties: { kind: type, level: lvl, fill: col, fillColor: col, color: col },
        geometry: layer.toGeoJSON?.()?.geometry ?? null,
      };
    }
    const next = [...(this.shapes ?? []), s];
    this.shapes = next;
    this.renderShapes();
    this.shapesChange.emit(next);
  }

  private nameOf(f: any): string {
    const p = f.properties || {};
    return p.Region_Nam ?? p.reg_name ?? p.region ?? p.NAME_1 ?? p.name ?? '';
  }
  private levelOf(name: string): string { return this.levels[name] || this.level; }
  private styleOf(name: string): any {
    const on = this.selected.includes(name);
    if (on) {
      return {
        fill: true,
        fillColor: alertColor(this.levelOf(name)),
        fillOpacity: 0.82,
        color: '#5a6b7b',
        weight: 0.7,
        opacity: 1,
      };
    }
    const ref = this.refLevelOf(name);
    if (ref) {
      return {
        fill: true,
        fillColor: alertColor(ref),
        fillOpacity: 0.18,
        color: alertColor(ref),
        weight: 1.3,
        opacity: 0.85,
        dashArray: '4',
      };
    }
    return { fill: true, fillColor: '#cfd8e3', fillOpacity: 0.18, color: '#5a6b7b', weight: 0.7, opacity: 1 };
  }
  private refLevelOf(name: string): string | null {
    const rank: Record<string, number> = { ADVISORY: 1, WARNING: 2, MAJOR_WARNING: 3 };
    let best: string | null = null;
    for (const r of (this.refMarkers ?? [])) {
      if (r.name === name && r.level && (!best || (rank[r.level] ?? 0) > (rank[best] ?? 0))) { best = r.level; }
    }
    return best;
  }
  private iconMarker(lat: number, lng: number, level: string): any {
    return L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'rp-haz',
        html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${alertColor(level)};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">`
          + `<img src="${HAZ_ICON(this.hazardIcon)}" style="width:20px;height:20px" alt=""></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      }),
      interactive: false,
      keyboard: false,
    });
  }
  private renderIcons(): void {
    if (!this.icons || !this.layer || typeof L === 'undefined') return;
    this.icons.clearLayers();
    if (!this.hazardIcon) return;
    this.layer.eachLayer((l: any) => {
      const nm = this.nameOf(l.feature);
      if (!this.selected.includes(nm)) return;
      const c = l.getBounds().getCenter();
      this.iconMarker(c.lat, c.lng, this.levelOf(nm)).addTo(this.icons);
    });
  }
  private renderRef(): void {
    if (!this.refGroup || !this.layer || typeof L === 'undefined') { return; }
    this.refGroup.clearLayers();
    for (const r of (this.refMarkers ?? [])) {
      let ly: any = null;
      this.layer.eachLayer((l: any) => { if (this.nameOf(l.feature) === r.name) { ly = l; } });
      if (!ly) { continue; }
      const c = ly.getBounds().getCenter();
      const m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: 'rp-ref',
          html: '<div style="width:18px;height:18px;border-radius:50%;border:1.5px solid ' + r.color + ';background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,.2)"><i class="fas ' + r.faIcon + '" style="color:' + r.color + ';font-size:12px"></i></div>',
          iconSize: [18, 18], iconAnchor: [9, 9],
        }),
        interactive: false,
      });
      m.bindTooltip(
        escapeHtml(r.entity + (r.level ? ' · ' + String(r.level).replace('_', ' ') : '')),
        { sticky: true },
      );
      this.refGroup.addLayer(m);
    }
  }

  /** Shapes only in drawnGroup; icons in icons layer so trash never drops wrong layers. */
  private renderShapes(): void {
    if (!this.drawnGroup || typeof L === 'undefined') return;
    this.drawnGroup.clearLayers();
    // Re-render region icons first, then add shape-centroid icons.
    this.renderIcons();
    for (const s of (this.shapes ?? [])) {
      const style = shapeLeafletStyle(s.level, { pane: 'ewshapes', kind: s.kind });
      const lyr = leafletLayerFromDelineation(L, s, style);
      if (!lyr) continue;
      lyr._shapeId = s.id;
      this.drawnGroup.addLayer(lyr);
      forceLayerStyle(lyr, style);
      try {
        const c = lyr.getBounds ? lyr.getBounds().getCenter() : (lyr.getLatLng ? lyr.getLatLng() : null);
        if (c && this.hazardIcon) {
          this.icons.addLayer(this.iconMarker(c.lat, c.lng, s.level));
        }
      } catch { /* ignore */ }
    }
    try { this.drawnGroup.bringToFront?.(); } catch { /* ignore */ }
  }
  private restyle(): void {
    if (this.layer) this.layer.eachLayer((l: any) => l.setStyle(this.styleOf(this.nameOf(l.feature))));
    this.renderShapes();
  }
}
