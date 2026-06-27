import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EwAgencyService } from './ew-agency.service';
import { EwCrossAgencyPanelComponent } from './ew-cross-agency-panel.component';
import { RegionPickerComponent } from './region-picker.component';
import { EwPreviewModalComponent } from './ew-preview-modal.component';
import { ALERT_LEVELS, ALERT_RANK, AGENCIES, AGENCY_HAZARDS, AgencyKey, HazardDef, HAZ_ICON, alertColor, LIKELIHOOD, IMPACT, REPORT_PERIODS } from './ew-agency.model';

export type FieldType = 'select' | 'multiselect' | 'number' | 'textarea' | 'text';
export interface FieldDef {
  key: string; label: string; type: FieldType;
  options?: (string | { value: string; label: string })[];
  min?: number; max?: number; step?: number; placeholder?: string;
  showIf?: (it: any) => boolean;
}
export interface ConsoleConfig {
  agency: AgencyKey;
  collectionKey: 'events' | 'outbreaks' | 'assessments';
  typeOptions?: HazardDef[];   // GST hazard selector (with icons)
  fixedType?: string;          // single hazard key for the others
  reportPeriod?: boolean;      // MoA
  fields: FieldDef[];          // agency-specific fields
  newItem: () => any;
}

/**
 * Config-driven authoring console for the event-based warning entities (GST / MoH / MoA / NEMC). Each
 * stays DISTINCT through its own field config (magnitude, disease, drought severity, AQI…) while sharing
 * the region picker, cross-agency panel and the submit-to-bus plumbing. Native rebuild of the Python
 * event pages; the Python pages are untouched. Every submission is shared with all entities + PMO-DMD.
 */
@Component({
  selector: 'ew-agency-event-console',
  standalone: true,
  imports: [FormsModule, NgClass, RouterLink, EwCrossAgencyPanelComponent, RegionPickerComponent, EwPreviewModalComponent],
  styles: [`
    .wrap { padding: 14px 18px 40px; }
    .hd { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .hd .ic { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; color: #fff; }
    .hd h1 { font-size: 1.18rem; margin: 0; color: #14303a; } .hd .sub { font-size: 0.78rem; color: #6c757d; }
    .toolbar { margin-left: auto; display: flex; gap: 8px; }
    .btn { font-size: 0.8rem; font-weight: 600; border-radius: 8px; padding: 8px 16px; border: 1px solid transparent; cursor: pointer; font-family: inherit; color: #fff; }
    .btn.ghost { background: #fff; color: #1f2d3d; border-color: #cbd5e1; }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .grid { display: grid; grid-template-columns: 440px 1fr; gap: 14px; align-items: start; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .panel { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 12px 14px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
    .tabs button { font-size: 0.76rem; font-weight: 600; color: #607089; border: 1px solid #e3e6ed; background: #f8fafc; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-family: inherit; }
    .tabs button.on { color: #fff; }
    .tabs .add { color: #0f766e; background: #ccfbf1; border-color: #0f766e; }
    .lbl { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin: 9px 0 4px; letter-spacing: 0.3px; }
    select, textarea, input { font-size: 0.78rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 8px; font-family: inherit; width: 100%; box-sizing: border-box; }
    textarea { resize: vertical; min-height: 42px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .alvl { display: flex; gap: 5px; } .alvl button { flex: 1; font-size: 0.68rem; font-weight: 700; border: 1px solid #cbd5e1; background: #fff; border-radius: 7px; padding: 5px; cursor: pointer; font-family: inherit; color: #475569; }
    .alvl button.on { color: #1a1a1a; border-color: #1a1a1a; }
    .types { display: flex; flex-wrap: wrap; gap: 6px; }
    .tbtn { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; font-weight: 600; border: 1px solid #cbd5e1; background: #fff; border-radius: 9px; padding: 5px 10px; cursor: pointer; font-family: inherit; color: #475569; }
    .tbtn.on { border-color: #1f2d3d; background: #eef2f7; color: #1f2d3d; }
    .tbtn img { width: 20px; height: 20px; }
    .ms { display: flex; flex-wrap: wrap; gap: 5px; } .mschip { font-size: 0.68rem; font-weight: 600; border: 1px solid #cbd5e1; background: #fff; color: #475569; border-radius: 14px; padding: 3px 10px; cursor: pointer; font-family: inherit; }
    .mschip.on { background: #0f766e; color: #fff; border-color: #0f766e; }
    .sel-regions { font-size: 0.72rem; color: #475569; margin-top: 6px; }
    .rchip { display: inline-block; background: #eef2f7; border-radius: 6px; padding: 1px 7px; margin: 2px 3px 0 0; }
    .flash { padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; margin-bottom: 10px; }
    .flash.ok { background: #d1fae5; color: #065f46; } .flash.err { background: #fee2e2; color: #b91c1c; }
    .x { border: none; background: none; color: #b91c1c; cursor: pointer; }
  `],
  template: `
    <div class="wrap">
      <a routerLink="/m/preparedness/early-warnings" style="display:inline-flex;align-items:center;gap:6px;font-size:0.76rem;color:#64748b;text-decoration:none;margin-bottom:10px"><i class="fas fa-arrow-left"></i> Early Warning Systems</a>
      <div class="hd">
        <div class="ic" [style.background]="def.color"><i class="fas" [ngClass]="def.icon"></i></div>
        <div><h1>{{ def.name }} — {{ def.bulletin }}</h1><div class="sub">{{ def.fullName }}</div></div>
        <div class="toolbar">
          <button class="btn ghost" [disabled]="generating()" (click)="generateWarning()">
            <i class="fas fa-file-pdf"></i> {{ generating() ? 'Generating…' : 'Generate Warning' }}
          </button>
          <button class="btn" [style.background]="def.color" [disabled]="submitting()" (click)="pushToEocc()">
            <i class="fas fa-tower-broadcast"></i> {{ submitting() ? 'Pushing…' : 'Push to EOCC' }}
          </button>
          <button class="btn" style="background:#fff;color:#b91c1c;border:1px solid #fecaca" [disabled]="clearing()" (click)="clearMine()" title="Remove this entity's current warning from the cross-agency map and PMO-DMD">
            <i class="fas fa-eraser"></i> {{ clearing() ? 'Clearing…' : 'Clear my warning' }}
          </button>
        </div>
      </div>

      @if (flash(); as f) { <div class="flash" [ngClass]="f.err ? 'err' : 'ok'">{{ f.msg }}</div> }
      @if (previewUrl()) {
        <ew-preview-modal [title]="def.name + ' — ' + def.bulletin" [url]="previewUrl()!" [rawUrl]="previewRaw()"
          [file]="previewFile()" (close)="previewUrl.set(null)" (push)="pushFromPreview()"></ew-preview-modal>
      }
      <ew-cross-agency-panel [current]="config.agency"></ew-cross-agency-panel>

      @if (config.reportPeriod) {
        <div class="panel" style="margin-bottom:12px; max-width:320px">
          <div class="lbl">Report period</div>
          <select [(ngModel)]="reportPeriod">@for (p of periods; track p) { <option [value]="p">{{ p }}</option> }</select>
        </div>
      }

      <div class="grid">
        <div class="panel">
          <div class="tabs">
            @for (it of items(); track $index; let i = $index) {
              <button [class.on]="active() === i" [style.background]="active() === i ? def.color : ''" (click)="active.set(i)">{{ def.unit }} {{ i + 1 }}</button>
            }
            <button class="add" (click)="addItem()"><i class="fas fa-plus"></i> Add {{ def.unit.toLowerCase() }}</button>
          </div>

          @if (cur(); as it) {
            @if (config.typeOptions) {
              <div class="lbl">{{ def.unit }} type</div>
              <div class="types">
                @for (t of config.typeOptions; track t.key) {
                  <button class="tbtn" [class.on]="it.type === t.key" (click)="it.type = t.key">
                    <img [src]="hazIcon(t.icon)" [alt]="t.label">{{ t.label }}</button>
                }
              </div>
            }

            <div class="lbl">Active paint level <span style="font-weight:500;text-transform:none;color:#94a3b8">— colours new regions you click; existing ones keep their colour</span></div>
            <div class="alvl">
              @for (lv of levels; track lv.key) {
                <button [class.on]="it.alert_level === lv.key" [style.background]="it.alert_level === lv.key ? lv.color : '#fff'"
                        (click)="it.alert_level = lv.key">{{ lv.label }}</button>
              }
            </div>

            @for (f of config.fields; track f.key) {
              @if (!f.showIf || f.showIf(it)) {
                <div class="lbl">{{ f.label }}</div>
                @switch (f.type) {
                  @case ('select') {
                    <select [(ngModel)]="it[f.key]">
                      @for (o of f.options ?? []; track opt(o).value) { <option [value]="opt(o).value">{{ opt(o).label }}</option> }
                    </select>
                  }
                  @case ('number') {
                    <input type="number" [(ngModel)]="it[f.key]" [min]="f.min ?? null" [max]="f.max ?? null" [step]="f.step ?? 1">
                  }
                  @case ('textarea') { <textarea [(ngModel)]="it[f.key]" [placeholder]="f.placeholder ?? ''"></textarea> }
                  @case ('text') { <input type="text" [(ngModel)]="it[f.key]" [placeholder]="f.placeholder ?? ''"> }
                  @case ('multiselect') {
                    <div class="ms">
                      @for (o of f.options ?? []; track opt(o).value) {
                        <button class="mschip" [class.on]="(it[f.key] ?? []).includes(opt(o).value)" (click)="toggleMulti(it, f.key, opt(o).value)">{{ opt(o).label }}</button>
                      }
                    </div>
                  }
                }
              }
            }

            <div class="lbl">Description</div>
            <textarea [(ngModel)]="it.description" placeholder="Situation summary…"></textarea>
            <div class="row2" style="margin-top:8px">
              <div><div class="lbl">Likelihood</div><select [(ngModel)]="it.likelihood">@for (l of likelihood; track l) { <option [value]="l">{{ l }}</option> }</select></div>
              <div><div class="lbl">Impact</div><select [(ngModel)]="it.impact">@for (l of impact; track l) { <option [value]="l">{{ l }}</option> }</select></div>
            </div>

            <div class="sel-regions">
              <div class="lbl">Affected regions ({{ (it.regions ?? []).length }})</div>
              @for (r of it.regions ?? []; track r) {
                <span class="rchip" [style.border-left]="'4px solid ' + alertColor(it.regionLevels?.[r] || it.alert_level)">{{ r }}</span>
              }
              @if ((it.delineations ?? []).length) {
                <span class="rchip" style="border-left:4px solid #4527a0"><i class="fas fa-draw-polygon"></i> {{ it.delineations.length }} delineation(s)</span>
              }
              @if (!(it.regions ?? []).length && !(it.delineations ?? []).length) { <span style="color:#94a3b8">Click regions or draw on the map →</span> }
            </div>
            @if (items().length > 1) {
              <button class="x" style="margin-top:10px; font-size:0.76rem" (click)="removeItem(active())"><i class="fas fa-trash"></i> Remove this {{ def.unit.toLowerCase() }}</button>
            }
          }
        </div>

        <div class="panel">
          @if (crossRef().length) {
            <label style="display:flex;align-items:center;gap:6px;font-size:0.76rem;color:#475569;margin-bottom:8px;cursor:pointer">
              <input type="checkbox" [checked]="refOn()" (change)="refOn.set($any($event.target).checked)">
              <i class="fas fa-diagram-project" style="color:#94a3b8"></i> Show what other entities issued ({{ crossRef().length }} area(s)) — reference only
            </label>
          }
          @if (cur(); as it) {
            <ew-region-picker [selected]="it.regions ?? []" [levels]="it.regionLevels ?? {}" [level]="it.alert_level"
                              [hazardIcon]="iconFor(it)" [shapes]="it.delineations ?? []"
                              [refMarkers]="refOn() ? crossRef() : []"
                              (toggle)="toggleRegion($event)" (shapesChange)="onShapes($event)"></ew-region-picker>
          }
        </div>
      </div>
    </div>
  `,
})
export class AgencyEventConsoleComponent implements OnInit {
  @Input() config!: ConsoleConfig;
  private svc = inject(EwAgencyService);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewRaw = signal<string>('');
  previewFile = signal<string>('bulletin.pdf');

  def: any;
  levels = ALERT_LEVELS;
  likelihood = LIKELIHOOD;
  impact = IMPACT;
  periods = REPORT_PERIODS;
  hazIcon = HAZ_ICON;
  reportPeriod = 'Monthly';

  items = signal<any[]>([]);
  active = signal(0);
  refOn = signal(true);             // overlay what OTHER entities issued on this map (reference, like PMO) — on by default
  crossRef = signal<any[]>([]);     // [{ name, color, faIcon, entity, level }]
  submitting = signal(false);
  clearing = signal(false);
  generating = signal(false);
  flash = signal<{ msg: string; err: boolean; href?: string; file?: string } | null>(null);

  ngOnInit(): void {
    this.def = AGENCIES[this.config.agency];
    this.items.set([this.make()]);
    this.loadCrossRef();
  }
  cur(): any { return this.items()[this.active()]; }

  /** Other entities' latest issued areas → reference markers (interlinking, like PMO sees all). Entities that
   *  report DISTRICTS (e.g. MoW) are mapped up to their parent region so they show on this region map too. */
  private loadCrossRef(): void {
    this.http.get<any>('/geojson/tz_districts_gadm.geojson').subscribe({
      next: gj => {
        const d2r: Record<string, string> = {};
        for (const f of (gj.features ?? [])) { const p = f.properties || {}; if (p.display_name && p.region) { d2r[p.display_name] = p.region; } }
        this.buildCrossRef(d2r);
      },
      error: () => this.buildCrossRef({}),
    });
  }

  private buildCrossRef(d2r: Record<string, string>): void {
    this.svc.allLatest(this.config.agency).subscribe({
      next: (r: any) => {
        const out: any[] = [];
        const seen = new Set<string>();
        for (const key of Object.keys(AGENCIES)) {
          if (key === this.config.agency) { continue; }
          const env = r.agencies?.[key];
          if (!env?.available) { continue; }
          const def = (AGENCIES as any)[key];
          const regions = new Set<string>(env.regions ?? []);
          for (const d of (env.districts ?? [])) { const rg = d2r[d]; if (rg) { regions.add(rg); } }
          for (const rn of regions) {
            const k = key + '|' + rn; if (seen.has(k)) { continue; } seen.add(k);
            out.push({ name: rn, color: def.color, faIcon: def.icon, entity: def.name, level: env.top_alert });
          }
        }
        this.crossRef.set(out);
      },
      error: () => this.crossRef.set([]),
    });
  }

  private make(): any {
    const it = this.config.newItem();
    it.type = this.config.typeOptions ? (it.type ?? this.config.typeOptions[0].key) : (this.config.fixedType ?? '');
    it.alert_level = it.alert_level ?? 'ADVISORY';   // now the ACTIVE PAINT LEVEL (applied to newly-clicked regions)
    it.regions = it.regions ?? [];
    it.regionLevels = it.regionLevels ?? {};         // region -> its own level, so per-area colours survive
    it.delineations = it.delineations ?? [];         // drawn shapes [{id, kind, geojson, radius?, level}]
    it.likelihood = it.likelihood ?? 'MEDIUM';
    it.impact = it.impact ?? 'MEDIUM';
    it.description = it.description ?? '';
    return it;
  }
  addItem(): void { this.items.set([...this.items(), this.make()]); this.active.set(this.items().length - 1); }
  removeItem(i: number): void { const a = [...this.items()]; a.splice(i, 1); this.items.set(a); this.active.set(Math.max(0, i - 1)); }

  toggleRegion(name: string): void {
    const it = this.cur(); if (!it) return;
    const regs: string[] = it.regions ?? [];
    const lv = { ...(it.regionLevels ?? {}) };
    // assign NEW references so the picker's @Inputs change by reference and ngOnChanges → restyle() fires.
    if (regs.includes(name)) { it.regions = regs.filter(r => r !== name); delete lv[name]; }
    else { it.regions = [...regs, name]; lv[name] = it.alert_level; }   // paint the new region at the ACTIVE level
    it.regionLevels = lv;
    this.items.set([...this.items()]);
  }

  /** Drawn delineations changed on the map for the active item. */
  onShapes(shapes: any[]): void {
    const it = this.cur(); if (!it) return;
    it.delineations = shapes;
    this.items.set([...this.items()]);
  }

  /** This institution's hazard icon (its OWN hazard only) for the current item's type — shown on the map. */
  iconFor(it: any): string {
    const list = this.config.typeOptions ?? AGENCY_HAZARDS[this.config.agency] ?? [];
    const key = it?.type || this.config.fixedType;
    return list.find(h => h.key === key)?.icon ?? list[0]?.icon ?? '';
  }
  alertColor = alertColor;
  toggleMulti(it: any, key: string, val: string): void {
    const arr: string[] = it[key] ?? (it[key] = []);
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
  }
  opt(o: any): { value: string; label: string } { return typeof o === 'string' ? { value: o, label: o } : o; }

  /** Build the entity payload (areas split by per-region level), or null if nothing is selected. */
  private buildPayload(): { payload: any; valid: any[] } | null {
    const valid = this.items().filter(it => (it.regions ?? []).length || (it.delineations ?? []).length);
    if (!valid.length) { this.flash.set({ msg: 'Select a region or draw a delineation for one item first.', err: true }); return null; }
    const now = new Date();
    const payload: any = {
      agency: this.def.name,
      issue_date: now.toISOString().slice(0, 10),
      issue_time: now.toTimeString().slice(0, 5),
    };
    if (this.config.reportPeriod) payload.report_period = this.reportPeriod;
    // Split each item BY per-region level so areas painted at different levels keep their own colour/severity
    // in the bulletin — one UI item → one engine item per distinct level (mirrors the TMA per-area model).
    const out: any[] = [];
    for (const it of valid) {
      // group BOTH regions and drawn shapes by their own level → one engine item per level, each carrying
      // its regions + its delineations (so per-shape colour survives into the bulletin, like the TMA map).
      const byLevel = new Map<string, { regions: string[]; shapes: any[] }>();
      const bucket = (lv: string) => { if (!byLevel.has(lv)) byLevel.set(lv, { regions: [], shapes: [] }); return byLevel.get(lv)!; };
      const real = (lv?: string) => (lv && lv !== 'NONE') ? lv : null;   // white / "No alert" = cleared, never a tier
      for (const r of (it.regions ?? [])) { const lv = real((it.regionLevels?.[r]) || it.alert_level); if (lv) { bucket(lv).regions.push(r); } }
      for (const s of (it.delineations ?? [])) { const lv = real(s.level || it.alert_level); if (lv) { bucket(lv).shapes.push(s.geojson); } }
      for (const [lv, grp] of byLevel) {
        if (!grp.regions.length && !grp.shapes.length) { continue; }
        const o: any = { ...it, alert_level: lv, regions: grp.regions, districts: it.districts ?? [], drawn_shapes: grp.shapes };
        delete o.regionLevels; delete o.delineations;
        // collapse the "Other" free-text into the base field (matches Python), then drop the helper key
        if (o.disease === 'Other' && o.specify_disease) o.disease = o.specify_disease;
        if (o.source === 'Other' && o.specify_source) o.source = o.specify_source;
        delete o.specify_disease; delete o.specify_source;
        // GST landslides carry no engine-specific row — fold their trigger/susceptibility into the
        // engine-rendered "Impacts Expected" so they reach the bulletin (no engine change, no data loss).
        if (o.type === 'LANDSLIDES' && (o.landslide_trigger || o.susceptibility)) {
          const bits: string[] = [];
          if (o.landslide_trigger) bits.push('Trigger: ' + o.landslide_trigger);
          if (o.susceptibility) bits.push('Susceptibility: ' + o.susceptibility);
          o.impacts_expected = [bits.join('; '), o.impacts_expected].filter(Boolean).join(' — ');
        }
        delete o.landslide_trigger; delete o.susceptibility;
        out.push(o);
      }
    }
    if (!out.length) { this.flash.set({ msg: 'All selected areas are set to "No alert" — paint at least one Advisory/Warning/Major area to disseminate.', err: true }); return null; }
    payload[this.config.collectionKey] = out;
    return { payload, valid };
  }

  /** Generate Warning: build the bulletin PDF via the engine, show it in the inline preview modal (still
   *  editable), and save it to the Dissemination registry. */
  generateWarning(): void {
    const b = this.buildPayload(); if (!b) return;
    this.generating.set(true);
    this.flash.set({ msg: 'Generating the warning bulletin…', err: false });
    this.svc.generate(this.config.agency, b.payload).subscribe({
      next: (blob) => {
        this.generating.set(false);
        const url = URL.createObjectURL(blob);
        this.previewRaw.set(url);
        this.previewFile.set(`${this.config.agency}-bulletin.pdf`);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));   // inline preview (no popup blocker)
        this.svc.storeProduct(blob, this.productMeta(b.valid, b.payload)).subscribe({ next: () => {}, error: () => {} });
        this.flash.set({ msg: 'Preview ready — review it below, edit and regenerate as needed, then push to the EOCC. Saved to Dissemination.', err: false });
      },
      error: () => { this.generating.set(false); this.flash.set({ msg: 'Generation failed — check the inputs / engine.', err: true }); },
    });
  }

  /** From the preview: commit to the EOCC. */
  pushFromPreview(): void { this.previewUrl.set(null); this.pushToEocc(); }

  /** Push to EOCC: share with the cross-agency bus → PMO consolidates for Impact Analysis; all entities see it. */
  pushToEocc(): void {
    const b = this.buildPayload(); if (!b) return;
    this.submitting.set(true);
    this.svc.submit(this.config.agency, b.payload).subscribe({
      next: (r: any) => { this.submitting.set(false); this.flash.set({ msg: `Pushed to EOCC — ${r.items} ${this.def.unit.toLowerCase()}(s) shared; PMO will consolidate for impact analysis, and all entities can see it.`, err: false }); },
      error: () => { this.submitting.set(false); this.flash.set({ msg: 'Push to EOCC failed.', err: true }); },
    });
  }

  /** Clear this entity's currently-issued warning — it leaves the cross-agency map + PMO-DMD at once. */
  clearMine(): void {
    this.clearing.set(true);
    this.svc.withdraw(this.config.agency).subscribe({
      next: (r: any) => { this.clearing.set(false);
        this.flash.set({ msg: r?.withdrawn ? 'Your warning was cleared — it has left the cross-agency map and PMO-DMD.' : 'No active warning to clear.', err: false });
        this.loadCrossRef(); },
      error: () => { this.clearing.set(false); this.flash.set({ msg: 'Could not clear it — check your permissions and try again.', err: true }); },
    });
  }

  /** Product-registry metadata for the generated bulletin: top alert across items + the affected regions. */
  private productMeta(valid: any[], payload: any): any {
    let best = 'ADVISORY';
    for (const it of valid) {
      const lvls = [it.alert_level, ...Object.values((it.regionLevels ?? {}) as Record<string, string>),
                    ...((it.delineations ?? []) as any[]).map(s => s.level)];
      for (const lv of lvls) { if ((ALERT_RANK[lv as string] ?? 0) > (ALERT_RANK[best] ?? 0)) best = lv as string; }
    }
    const regions = [...new Set<string>(valid.flatMap((it: any) => (it.regions ?? []) as string[]))];
    return {
      title: `${this.def.name} ${this.def.bulletin} (${regions.slice(0, 2).join(', ')}${regions.length > 2 ? '…' : ''})`,
      bulletin_type: this.config.agency.toUpperCase(),
      issue_date: payload.issue_date, issue_time: payload.issue_time,
      severity: best, regions, centroid_lat: null, centroid_lng: null,
      envelope: { agency: this.config.agency, payload },
    };
  }
}
