import { HttpClient } from '@angular/common/http';
import { Component, OnInit, effect, inject, input, model, signal } from '@angular/core';

interface Opt { id: number; name: string; }

/**
 * Reusable Tanzania location cascade — Region → District → Council (LGA) → Ward — DB-driven from the
 * canonical public endpoints (/portal/regions, /regions/{id}/districts, /districts/{id}/councils,
 * /councils/{id}/wards). Guarantees EVERY consumer offers all 31 regions (incl. the 5 Zanzibar
 * regions), all 156 districts, all 195 councils (184 mainland + 11 Zanzibar) and all 4081 wards —
 * never a partial hardcoded list and never free-text. Two-way bound via model() signals:
 *
 *   <dmis-region-district [region]="region()" (regionChange)="region.set($event)"
 *                         [district]="district()" (districtChange)="district.set($event)"
 *                         [council]="council()" (councilChange)="council.set($event)"
 *                         [requiredRegion]="true" />
 *
 * Council shows by default; pass [showCouncil]="false" to hide it, [showWard]="true" to add wards.
 * Edit mode works: setting region/district/council asynchronously re-resolves the child lists so the
 * saved values stay selected.
 */
@Component({
  selector: 'dmis-region-district',
  standalone: true,
  template: `
    <div class="rd-grid">
      <div class="rd-fg">
        <label>Region @if (requiredRegion()) { <span class="rd-req">*</span> }</label>
        <select [value]="region()" (change)="onRegion($any($event.target).value)">
          <option value="">Select region…</option>
          @for (r of regions(); track r.id) { <option [value]="r.name">{{ r.name }}</option> }
        </select>
      </div>
      <div class="rd-fg">
        <label>District</label>
        <select [value]="district()" (change)="onDistrict($any($event.target).value)" [disabled]="!region() || loadingD()">
          <option value="">{{ loadingD() ? 'Loading…' : (region() ? 'Select district…' : 'Select a region first') }}</option>
          @for (d of districts(); track d.id) { <option [value]="d.name">{{ d.name }}</option> }
        </select>
      </div>
      @if (showCouncil()) {
        <div class="rd-fg">
          <label>Council (LGA)</label>
          <select [value]="council()" (change)="onCouncil($any($event.target).value)" [disabled]="!district() || loadingC()">
            <option value="">{{ loadingC() ? 'Loading…' : (district() ? 'Select council…' : 'Select a district first') }}</option>
            @for (c of councils(); track c.id) { <option [value]="c.name">{{ c.name }}</option> }
          </select>
        </div>
      }
      @if (showWard()) {
        <div class="rd-fg">
          <label>Ward</label>
          <select [value]="ward()" (change)="ward.set($any($event.target).value)" [disabled]="!council() || loadingW()">
            <option value="">{{ loadingW() ? 'Loading…' : (council() ? 'Select ward…' : 'Select a council first') }}</option>
            @for (w of wards(); track w.id) { <option [value]="w.name">{{ w.name }}</option> }
          </select>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .rd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.9rem 1.1rem; }
    .rd-fg { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
    .rd-fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-mid); }
    .rd-req { color: #dc2626; }
    .rd-fg select { border: 1px solid var(--border); border-radius: 9px; padding: 0.5rem 0.65rem; font-size: 0.86rem; font-family: inherit; background: #fff; }
    .rd-fg select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,51,102,0.08); }
    .rd-fg select:disabled { background: #f3f4f6; color: var(--text-light); cursor: not-allowed; }
  `],
})
export class RegionDistrictPickerComponent implements OnInit {
  private http = inject(HttpClient);

  region = model<string>('');
  district = model<string>('');
  council = model<string>('');
  ward = model<string>('');
  requiredRegion = input<boolean>(false);
  showCouncil = input<boolean>(true);
  showWard = input<boolean>(false);

  regions = signal<Opt[]>([]);
  districts = signal<Opt[]>([]);
  councils = signal<Opt[]>([]);
  wards = signal<Opt[]>([]);
  loadingD = signal(false);
  loadingC = signal(false);
  loadingW = signal(false);
  private dFor = '';
  private cFor = '';
  private wFor = '';

  constructor() {
    // region -> districts (re-resolves in edit mode once regions are loaded)
    effect(() => {
      const name = this.region();
      const ready = this.regions().length > 0;
      if (ready && name && name !== this.dFor) { this.loadDistricts(name); }
      else if (!name && this.dFor) { this.districts.set([]); this.dFor = ''; }
    }, { allowSignalWrites: true });
    // district -> councils
    effect(() => {
      const name = this.district();
      const ready = this.districts().length > 0;
      if (this.showCouncil() && ready && name && name !== this.cFor) { this.loadCouncils(name); }
      else if (!name && this.cFor) { this.councils.set([]); this.cFor = ''; }
    }, { allowSignalWrites: true });
    // council -> wards
    effect(() => {
      const name = this.council();
      const ready = this.councils().length > 0;
      if (this.showWard() && ready && name && name !== this.wFor) { this.loadWards(name); }
      else if (!name && this.wFor) { this.wards.set([]); this.wFor = ''; }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.http.get<Opt[]>('/api/v1/portal/regions').subscribe({
      next: rs => this.regions.set(rs ?? []),
      error: () => this.regions.set([]),
    });
  }

  onRegion(name: string): void {
    if (name !== this.region()) { this.district.set(''); this.council.set(''); this.ward.set(''); }
    this.region.set(name);
  }

  onDistrict(name: string): void {
    if (name !== this.district()) { this.council.set(''); this.ward.set(''); }
    this.district.set(name);
  }

  onCouncil(name: string): void {
    if (name !== this.council()) { this.ward.set(''); }
    this.council.set(name);
  }

  private loadDistricts(region: string): void {
    const r = this.regions().find(x => x.name === region);
    if (!r) { this.districts.set([]); return; }
    this.dFor = region;
    this.loadingD.set(true);
    this.http.get<Opt[]>(`/api/v1/portal/regions/${r.id}/districts`).subscribe({
      next: ds => { this.districts.set(ds ?? []); this.loadingD.set(false); },
      error: () => { this.districts.set([]); this.loadingD.set(false); },
    });
  }

  private loadCouncils(district: string): void {
    const d = this.districts().find(x => x.name === district);
    if (!d) { this.councils.set([]); return; }
    this.cFor = district;
    this.loadingC.set(true);
    this.http.get<Opt[]>(`/api/v1/portal/districts/${d.id}/councils`).subscribe({
      next: cs => { this.councils.set(cs ?? []); this.loadingC.set(false); },
      error: () => { this.councils.set([]); this.loadingC.set(false); },
    });
  }

  private loadWards(council: string): void {
    const c = this.councils().find(x => x.name === council);
    if (!c) { this.wards.set([]); return; }
    this.wFor = council;
    this.loadingW.set(true);
    this.http.get<Opt[]>(`/api/v1/portal/councils/${c.id}/wards`).subscribe({
      next: ws => { this.wards.set(ws ?? []); this.loadingW.set(false); },
      error: () => { this.wards.set([]); this.loadingW.set(false); },
    });
  }
}
