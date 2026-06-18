import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { alertColor, HAZ_ICON } from './ew-agency.model';

declare const L: any;

/**
 * Reusable Tanzania map selector for the warning entities. Two capture modes, both carrying their own
 * colour + the institution's hazard icon (per-area, like the TMA map):
 *   • SELECT — click a region to paint it at the active level.
 *   • DELINEATE — draw circles / polygons / lines (Leaflet Draw); each drawn shape keeps the active
 *     level's colour and shows the institution's hazard icon, exactly like a selected region.
 */
@Component({
  selector: 'ew-region-picker',
  standalone: true,
  styles: [`
    .rp { height: 540px; border-radius: 12px; border: 1px solid #e3e6ed; }
    .hint { font-size: 0.72rem; color: #94a3b8; margin-top: 6px; }
  `],
  template: `<div [id]="mapId" class="rp"></div>
    <div class="hint"><i class="fas fa-hand-pointer"></i> Click a region to paint it, or use the draw tools (top-left) to delineate a circle/polygon — each keeps the active level's colour + your hazard icon. Click a region again to remove it.</div>`,
})
export class RegionPickerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selected: string[] = [];
  @Input() levels: Record<string, string> = {};   // region -> its OWN alert level (per-area colouring)
  @Input() level = 'WARNING';                       // active paint/draw level
  @Input() hazardIcon = '';                         // THIS institution's hazard icon file
  @Input() shapes: any[] = [];                      // drawn delineations [{id, kind, geojson, radius?, level}]
  @Input() refMarkers: { name: string; color: string; faIcon: string; entity: string; level?: string }[] = []; // other entities' issued areas (reference overlay)
  @Output() toggle = new EventEmitter<string>();
  @Output() shapesChange = new EventEmitter<any[]>();
  private http = inject(HttpClient);
  private static seq = 0;
  mapId = 'rp-' + (RegionPickerComponent.seq++);
  private map: any;
  private layer: any;
  private icons: any;       // region hazard icons
  private drawnGroup: any;  // delineation layer (shapes + their icons)
  private refGroup: any;    // reference overlay — what OTHER entities issued (read-only markers)
  private shapeSeq = 0;

  ngOnInit(): void { setTimeout(() => this.init(), 0); }
  ngOnChanges(): void { this.restyle(); this.renderRef(); }
  ngOnDestroy(): void { if (this.map) { this.map.remove(); this.map = null; } }

  private init(): void {
    if (typeof L === 'undefined') return;
    this.map = L.map(this.mapId, { minZoom: 5, maxZoom: 9, zoomControl: true }).setView([-6.4, 35.0], 6);
    this.map.setMaxBounds([[-12.5, 28.0], [1.0, 41.5]]);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      { attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd' }).addTo(this.map);
    // dedicated pane so drawn delineations sit ABOVE the region fills (else they are occluded → look blank);
    // z 550 keeps them under the marker pane (600) so the hazard icon stays on top of its shape.
    this.map.createPane('ewshapes'); this.map.getPane('ewshapes').style.zIndex = 550;
    this.icons = L.layerGroup().addTo(this.map);
    this.drawnGroup = L.featureGroup().addTo(this.map);
    this.refGroup = L.layerGroup().addTo(this.map);
    this.http.get<any>('/geojson/tz_regions_gis.geojson').subscribe(gj => {
      this.layer = L.geoJSON(gj, {
        style: (f: any) => this.styleOf(this.nameOf(f)),
        onEachFeature: (f: any, lyr: any) => {
          const nm = this.nameOf(f);
          lyr.on('click', () => this.toggle.emit(nm));
          lyr.bindTooltip(() => `${nm}${this.selected.includes(nm) ? ' · ' + this.levelOf(nm).replace('_', ' ') : ''}`, { sticky: true });
        },
      }).addTo(this.map);
      try { this.map.fitBounds(this.layer.getBounds(), { padding: [8, 8] }); } catch {}
      this.renderIcons();
      this.renderShapes();
      this.renderRef();
    });
    this.initDraw();
  }

  /** Leaflet Draw toolbar — delineate circles / polygons / rectangles / lines, coloured by the active level. */
  private initDraw(): void {
    if (!(L.Control && L.Control.Draw)) return;
    const ctl = new L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: this.drawnGroup, edit: false, remove: true },
      draw: { polygon: { shapeOptions: { color: '#374151' } }, polyline: { shapeOptions: { color: '#374151' } },
        rectangle: { shapeOptions: { color: '#374151' } }, circle: { shapeOptions: { color: '#374151' } },
        marker: false, circlemarker: { color: '#374151' } },
    });
    this.map.addControl(ctl);
    this.map.on(L.Draw.Event.CREATED, (e: any) => this.onDrawCreated(e));
    this.map.on(L.Draw.Event.DELETED, (e: any) => {
      const ids = new Set<number>();
      e.layers.eachLayer((l: any) => { if (l._shapeId) ids.add(l._shapeId); });
      if (ids.size) { const next = (this.shapes ?? []).filter(s => !ids.has(s.id)); this.shapes = next; this.renderShapes(); this.shapesChange.emit(next); }
    });
  }
  private onDrawCreated(e: any): void {
    const layer = e.layer, type = e.layerType, lvl = this.level;
    let s: any;
    if (type === 'circle') {
      const c = layer.getLatLng();
      s = { id: ++this.shapeSeq, kind: 'circle', level: lvl, radius: Math.round(layer.getRadius()),
        geojson: { type: 'Feature', properties: { kind: 'circle', radius: Math.round(layer.getRadius()), level: lvl }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } } };
    } else if (type === 'circlemarker' || type === 'marker') {
      const c = layer.getLatLng();
      s = { id: ++this.shapeSeq, kind: 'point', level: lvl,
        geojson: { type: 'Feature', properties: { kind: 'point', level: lvl }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } } };
    } else {
      const gj = layer.toGeoJSON();
      gj.properties = { ...(gj.properties || {}), kind: type, level: lvl };
      s = { id: ++this.shapeSeq, kind: type, level: lvl, geojson: gj };
    }
    const next = [...(this.shapes ?? []), s];
    this.shapes = next;          // update locally so the shape renders immediately (not after the input round-trip)
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
    if (on) { return { fillColor: alertColor(this.levelOf(name)), fillOpacity: 0.82, color: '#5a6b7b', weight: 0.7, opacity: 1 }; }
    // Reference fill — what OTHER entities issued here, coloured by their level (lighter + dashed so it
    // reads as reference, not your own selection). Mirrors PMO seeing the colours, not just icons.
    const ref = this.refLevelOf(name);
    if (ref) { return { fillColor: alertColor(ref), fillOpacity: 0.18, color: alertColor(ref), weight: 1.3, opacity: 0.85, dashArray: '4' }; }
    return { fillColor: '#cfd8e3', fillOpacity: 0.18, color: '#5a6b7b', weight: 0.7, opacity: 1 };
  }
  /** Highest level among the OTHER entities that issued this region (for the reference fill), or null. */
  private refLevelOf(name: string): string | null {
    const rank: Record<string, number> = { ADVISORY: 1, WARNING: 2, MAJOR_WARNING: 3 };
    let best: string | null = null;
    for (const r of (this.refMarkers ?? [])) {
      if (r.name === name && r.level && (!best || (rank[r.level] ?? 0) > (rank[best] ?? 0))) { best = r.level; }
    }
    return best;
  }
  /** A 30px hazard-icon marker for THIS institution, ringed by a level colour. */
  private iconMarker(lat: number, lng: number, level: string): any {
    return L.marker([lat, lng], {
      icon: L.divIcon({ className: 'rp-haz',
        html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${alertColor(level)};background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)">`
            + `<img src="${HAZ_ICON(this.hazardIcon)}" style="width:20px;height:20px"></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15] }),
    });
  }
  /** Institution icon on each painted region. */
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
  /** Reference overlay — the regions OTHER entities have issued, as dashed entity-coloured markers (read-only). */
  private renderRef(): void {
    if (!this.refGroup || !this.layer || typeof L === 'undefined') { return; }
    this.refGroup.clearLayers();
    for (const r of (this.refMarkers ?? [])) {
      let ly: any = null;
      this.layer.eachLayer((l: any) => { if (this.nameOf(l.feature) === r.name) { ly = l; } });
      if (!ly) { continue; }
      const c = ly.getBounds().getCenter();
      const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'rp-ref',
        html: '<div style="width:18px;height:18px;border-radius:50%;border:1.5px solid ' + r.color + ';background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,.2)"><i class="fas ' + r.faIcon + '" style="color:' + r.color + ';font-size:8px"></i></div>',
        iconSize: [18, 18], iconAnchor: [9, 9] }) });
      m.bindTooltip(r.entity + (r.level ? ' · ' + String(r.level).replace('_', ' ') : ''), { sticky: true });
      this.refGroup.addLayer(m);
    }
  }

  /** Drawn delineations — each shape in its level colour + the institution's icon at its centroid. */
  private renderShapes(): void {
    if (!this.drawnGroup || typeof L === 'undefined') return;
    this.drawnGroup.clearLayers();
    for (const s of (this.shapes ?? [])) {
      const lyr = this.layerFromShape(s);
      if (!lyr) continue;
      lyr._shapeId = s.id;
      this.drawnGroup.addLayer(lyr);
      const c = lyr.getBounds ? lyr.getBounds().getCenter() : (lyr.getLatLng ? lyr.getLatLng() : null);
      if (c && this.hazardIcon) { this.drawnGroup.addLayer(this.iconMarker(c.lat, c.lng, s.level)); }
    }
  }
  private layerFromShape(s: any): any {
    const col = alertColor(s.level);
    const style = { color: col, weight: 2, fillColor: col, fillOpacity: 0.45, pane: 'ewshapes' };
    const geom = s.geojson?.geometry;
    if (s.kind === 'circle' && geom?.type === 'Point') { const [lng, lat] = geom.coordinates; return L.circle([lat, lng], { radius: s.radius ?? 10000, ...style }); }
    if (geom?.type === 'Point') { const [lng, lat] = geom.coordinates; return L.circleMarker([lat, lng], { radius: 7, ...style, fillOpacity: 0.9 }); }
    if (geom?.type === 'Polygon') { return L.polygon(geom.coordinates.map((ring: any[]) => ring.map(([lng, lat]: number[]) => [lat, lng])), style); }
    if (geom?.type === 'LineString') { return L.polyline(geom.coordinates.map(([lng, lat]: number[]) => [lat, lng]), style); }
    return null;
  }
  private restyle(): void {
    if (this.layer) this.layer.eachLayer((l: any) => l.setStyle(this.styleOf(this.nameOf(l.feature))));
    this.renderIcons();
    this.renderShapes();
  }
}
