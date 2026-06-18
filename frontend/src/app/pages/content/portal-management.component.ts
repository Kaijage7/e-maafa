import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

interface Slide { id: number; title: string; slideType: string; sortOrder: number; isActive: boolean; }
interface GalleryImage { id: number; imagePath: string; caption: string; marqueeRow: number; sortOrder: number; isActive: boolean; }
interface Setting { id: number; group: string; key: string; value: string; }
interface HazardCard { id: number; name: string; icon: string; color: string; descriptionEn: string; descriptionSw: string; link: string; sortOrder: number; isActive: boolean; }
interface JsonItem { [k: string]: any; }

/**
 * Content Management → Portal Management — controls the PUBLIC landing page:
 * which hero slides show (About / Hazards / Alerts), which gallery photos run in
 * which marquee row, and the editable settings (hero stat tiles, counters).
 * Every change here is immediately visible on the public site ("/").
 */
@Component({
  selector: 'page-portal-management',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent],
  template: `
    <dmis-page-header title="Portal Management" icon="fa-globe"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Portal Management'}]">
      <a class="btn-add" href="/" target="_blank"><i class="fas fa-external-link-alt"></i> View Public Site</a>
    </dmis-page-header>

    <!-- Hero slides -->
    <div class="panel-row">
      <dmis-panel title="Hero Slides" icon="fa-images" [badge]="slides().length + ' slides'">
        <div class="panel-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin:0 0 0.8rem;">Toggle which slides rotate in the public hero. Order = position in the rotation.</p>
          <div style="display:grid;gap:0.6rem;">
            @for (s of slides(); track s.id) {
              <div style="display:flex;align-items:center;gap:0.8rem;border:1px solid var(--border);border-radius:12px;padding:0.7rem 0.9rem;">
                <span class="r-badge" style="background:rgba(0,51,102,0.08);color:#003366;min-width:64px;text-align:center;">{{ s.slideType }}</span>
                <div class="r-title" style="flex:1;">{{ s.title }}</div>
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:var(--text-mid);cursor:pointer;">
                  <input type="checkbox" [checked]="s.isActive" (change)="toggleSlide(s, $any($event.target).checked)"> Active
                </label>
              </div>
            }
          </div>
        </div>
      </dmis-panel>
    </div>

    <!-- Gallery -->
    <div class="panel-row" style="animation-delay:.15s;">
      <dmis-panel title="Photo Gallery (marquee)" icon="fa-photo-video" [badge]="gallery().length + ' images'">
        <div class="panel-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin:0 0 0.8rem;">Row 1 scrolls left, row 2 scrolls right on the public landing.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:0.8rem;">
            @for (g of gallery(); track g.id) {
              <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;" [style.opacity]="g.isActive ? 1 : 0.45">
                <img [src]="g.imagePath.startsWith('images/') ? '/' + g.imagePath : '/api/storage/' + g.imagePath" [alt]="g.caption" style="width:100%;height:96px;object-fit:cover;">
                <div style="padding:0.5rem 0.6rem;display:grid;gap:0.35rem;">
                  <div style="font-size:0.72rem;color:var(--text-mid);line-height:1.3;">{{ g.caption }}</div>
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <select style="font-size:0.72rem;border:1px solid var(--border);border-radius:6px;padding:0.15rem 0.3rem;"
                            [value]="g.marqueeRow" (change)="setRow(g, $any($event.target).value)">
                      <option [value]="1">Row 1</option><option [value]="2">Row 2</option>
                    </select>
                    <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.72rem;color:var(--text-mid);cursor:pointer;margin-left:auto;">
                      <input type="checkbox" [checked]="g.isActive" (change)="toggleGallery(g, $any($event.target).checked)"> Show
                    </label>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      </dmis-panel>
    </div>

    <!-- Settings -->
    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Portal Settings" icon="fa-sliders-h" [badge]="settings().length + ' keys'">
        <div class="panel-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin:0 0 0.8rem;">Hero stat tiles + animated counters. Save applies instantly to the public landing.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem 1rem;">
            @for (s of settings(); track s.key) {
              <div style="display:flex;align-items:center;gap:0.6rem;">
                <code style="font-size:0.72rem;color:var(--text-mid);flex:1;">{{ s.key }}</code>
                <input style="border:1px solid var(--border);border-radius:8px;padding:0.3rem 0.5rem;font-size:0.8rem;width:130px;"
                       [value]="s.value" (change)="saveSetting(s.key, $any($event.target).value)">
              </div>
            }
          </div>
          @if (saved()) { <div style="margin-top:0.8rem;color:#059669;font-size:0.8rem;"><i class="fas fa-check me-1"></i>{{ saved() }}</div> }
        </div>
      </dmis-panel>
    </div>

    <!-- "Know Your Hazards" cards (Fahamu Hatari Zako) -->
    <div class="panel-row" style="animation-delay:.4s;">
      <dmis-panel title="Hazard Education Cards (Know Your Hazards)" icon="fa-shield-alt" [badge]="hazardCards().length + ' cards'">
        <div class="panel-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin:0 0 0.8rem;">Each card on the public landing — name, bilingual description, colour and where it links on click.</p>
          <div style="display:grid;gap:0.55rem;">
            @for (c of hazardCards(); track c.id) {
              <div style="display:grid;grid-template-columns:34px 1.1fr 2fr 2fr 1fr auto;gap:0.5rem;align-items:center;border:1px solid var(--border);border-radius:10px;padding:0.5rem 0.7rem;" [style.opacity]="c.isActive ? 1 : 0.5">
                <div style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;" [style.background]="c.color + '1f'" [style.color]="c.color"><i class="fas {{ c.icon }}"></i></div>
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.78rem;" [value]="c.name" (change)="patchHazardCard(c, { name: $any($event.target).value })">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.74rem;" [value]="c.descriptionEn" (change)="patchHazardCard(c, { descriptionEn: $any($event.target).value })" placeholder="English description">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.74rem;" [value]="c.descriptionSw" (change)="patchHazardCard(c, { descriptionSw: $any($event.target).value })" placeholder="Maelezo (Kiswahili)">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.74rem;" [value]="c.link" (change)="patchHazardCard(c, { link: $any($event.target).value })" placeholder="/education">
                <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.72rem;color:var(--text-mid);cursor:pointer;">
                  <input type="checkbox" [checked]="c.isActive" (change)="patchHazardCard(c, { isActive: $any($event.target).checked })"> Show
                </label>
              </div>
            }
          </div>
        </div>
      </dmis-panel>
    </div>

    <!-- "Core System Features" cards (Huduma Kuu za Mfumo) -->
    <div class="panel-row" style="animation-delay:.5s;">
      <dmis-panel title="Capability Cards (Core System Features)" icon="fa-th-large" [badge]="capabilities().length + ' cards'">
        <div class="panel-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin:0 0 0.8rem;">Title, description and the click-through link of each feature card. Edit, then Save.</p>
          <div style="display:grid;gap:0.55rem;">
            @for (cap of capabilities(); track $index) {
              <div style="display:grid;grid-template-columns:1fr 2.4fr 0.9fr;gap:0.5rem;border:1px solid var(--border);border-radius:10px;padding:0.5rem 0.7rem;">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.78rem;font-weight:600;" [value]="cap['title'] ?? ''" (input)="patchItem('capabilities', $index, 'title', $any($event.target).value)">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.74rem;" [value]="cap['description'] ?? ''" (input)="patchItem('capabilities', $index, 'description', $any($event.target).value)">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.74rem;" [value]="cap['link'] ?? ''" (input)="patchItem('capabilities', $index, 'link', $any($event.target).value)" placeholder="/portal">
              </div>
            }
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:0.8rem;">
            <button class="btn-add" type="button" (click)="saveJsonList('capabilities')"><i class="fas fa-save"></i> Save Capabilities</button>
          </div>
        </div>
      </dmis-panel>
    </div>

    <!-- Emergency hotlines (topbar) -->
    <div class="panel-row" style="animation-delay:.6s;">
      <dmis-panel title="Emergency Hotlines (topbar)" icon="fa-phone-alt" [badge]="emergencyNumbers().length + ' numbers'">
        <div class="panel-body">
          <div style="display:grid;gap:0.55rem;">
            @for (n of emergencyNumbers(); track $index) {
              <div style="display:grid;grid-template-columns:0.7fr 1.3fr 1fr 0.8fr;gap:0.5rem;border:1px solid var(--border);border-radius:10px;padding:0.5rem 0.7rem;">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.82rem;font-weight:700;" [value]="n['number'] ?? ''" (input)="patchItem('emergencyNumbers', $index, 'number', $any($event.target).value)">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.78rem;" [value]="n['label'] ?? ''" (input)="patchItem('emergencyNumbers', $index, 'label', $any($event.target).value)">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.74rem;" [value]="n['icon'] ?? ''" (input)="patchItem('emergencyNumbers', $index, 'icon', $any($event.target).value)" placeholder="fa-fire">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.74rem;" [value]="n['color'] ?? ''" (input)="patchItem('emergencyNumbers', $index, 'color', $any($event.target).value)" placeholder="#ef4444">
              </div>
            }
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:0.8rem;">
            <button class="btn-add" type="button" (click)="saveJsonList('emergencyNumbers')"><i class="fas fa-save"></i> Save Hotlines</button>
          </div>
        </div>
      </dmis-panel>
    </div>

    <!-- Unsubscribe reasons (drives the public alert-unsubscribe form) -->
    <div class="panel-row" style="animation-delay:.7s;">
      <dmis-panel title="Unsubscribe Reasons (alert subscriptions)" icon="fa-bell-slash" [badge]="unsubscribeReasons().length + ' reasons'">
        <div class="panel-body">
          <p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 0.6rem;">Citizens pick one of these when they unsubscribe from alerts. Edit in both languages.</p>
          <div style="display:grid;gap:0.55rem;">
            @for (r of unsubscribeReasons(); track $index) {
              <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:0.5rem;align-items:center;border:1px solid var(--border);border-radius:10px;padding:0.5rem 0.7rem;">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.8rem;" [value]="r['en'] ?? ''" (input)="patchItem('unsubscribeReasons', $index, 'en', $any($event.target).value)" placeholder="Reason (English)">
                <input style="border:1px solid var(--border);border-radius:7px;padding:0.3rem 0.45rem;font-size:0.8rem;" [value]="r['sw'] ?? ''" (input)="patchItem('unsubscribeReasons', $index, 'sw', $any($event.target).value)" placeholder="Sababu (Kiswahili)">
                <button type="button" (click)="removeReason($index)" title="Remove" style="border:none;background:transparent;color:#dc2626;cursor:pointer;font-size:0.9rem;"><i class="fas fa-trash"></i></button>
              </div>
            }
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:0.8rem;">
            <button class="btn-add" type="button" (click)="addReason()"><i class="fas fa-plus"></i> Add Reason</button>
            <button class="btn-add" type="button" (click)="saveJsonList('unsubscribeReasons')"><i class="fas fa-save"></i> Save Reasons</button>
          </div>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class PortalManagementComponent {
  private http = inject(HttpClient);
  slides = signal<Slide[]>([]);
  gallery = signal<GalleryImage[]>([]);
  settings = signal<Setting[]>([]);
  hazardCards = signal<HazardCard[]>([]);
  capabilities = signal<JsonItem[]>([]);
  emergencyNumbers = signal<JsonItem[]>([]);
  unsubscribeReasons = signal<JsonItem[]>([]);
  saved = signal('');

  constructor() { this.reload(); }

  reload(): void {
    this.http.get<{ slides: Slide[]; gallery: GalleryImage[]; settings: Setting[] }>('/api/v1/content/portal')
      .subscribe(r => { this.slides.set(r.slides); this.gallery.set(r.gallery); this.settings.set(r.settings); });
    this.http.get<{ items: HazardCard[] }>('/api/v1/content/sections/hazard-cards')
      .subscribe(r => this.hazardCards.set(r.items));
    this.http.get<{ capabilities: JsonItem[]; emergencyNumbers: JsonItem[]; unsubscribeReasons: JsonItem[] }>('/api/v1/content/sections/json-settings')
      .subscribe(r => {
        this.capabilities.set(r.capabilities);
        this.emergencyNumbers.set(r.emergencyNumbers);
        this.unsubscribeReasons.set(r.unsubscribeReasons || []);
      });
  }

  // ----- Hazard cards ("Know Your Hazards") -----
  patchHazardCard(c: HazardCard, patch: Partial<HazardCard>): void {
    this.http.put(`/api/v1/content/sections/hazard-cards/${c.id}`, patch).subscribe(() => this.flash('Hazard card saved'));
  }

  // ----- JSON-list sections (capabilities / emergency numbers): edit locally, save the list -----
  private jsonSig(list: 'capabilities' | 'emergencyNumbers' | 'unsubscribeReasons') {
    return list === 'capabilities' ? this.capabilities
      : list === 'emergencyNumbers' ? this.emergencyNumbers : this.unsubscribeReasons;
  }

  patchItem(list: 'capabilities' | 'emergencyNumbers' | 'unsubscribeReasons', index: number, key: string, value: string): void {
    this.jsonSig(list).update(items => items.map((it, i) => i === index ? { ...it, [key]: value } : it));
  }

  saveJsonList(list: 'capabilities' | 'emergencyNumbers' | 'unsubscribeReasons'): void {
    const key = list === 'capabilities' ? 'capabilities.items'
      : list === 'emergencyNumbers' ? 'emergency.numbers' : 'unsubscribe.reasons';
    this.http.put(`/api/v1/content/sections/json-settings/${key}`, this.jsonSig(list)())
      .subscribe(() => this.flash(list === 'capabilities' ? 'Capabilities saved'
        : list === 'emergencyNumbers' ? 'Hotlines saved' : 'Unsubscribe reasons saved'));
  }

  addReason(): void {
    this.unsubscribeReasons.update(items => [...items, { en: '', sw: '' } as JsonItem]);
  }

  removeReason(index: number): void {
    this.unsubscribeReasons.update(items => items.filter((_, i) => i !== index));
  }

  toggleSlide(s: Slide, active: boolean): void {
    this.http.put(`/api/v1/content/portal/slides/${s.id}`, { isActive: active }).subscribe(() => this.flash('Slide saved'));
  }

  toggleGallery(g: GalleryImage, active: boolean): void {
    this.http.put(`/api/v1/content/portal/gallery/${g.id}`, { isActive: active }).subscribe(() => this.flash('Gallery saved'));
  }

  setRow(g: GalleryImage, row: string): void {
    this.http.put(`/api/v1/content/portal/gallery/${g.id}`, { marqueeRow: Number(row) }).subscribe(() => this.flash('Gallery saved'));
  }

  saveSetting(key: string, value: string): void {
    this.http.put(`/api/v1/content/portal/settings/${key}`, { value }).subscribe(() => this.flash(`Saved ${key}`));
  }

  private flash(msg: string): void {
    this.saved.set(msg);
    setTimeout(() => this.saved.set(''), 2500);
    this.reload();
  }
}
