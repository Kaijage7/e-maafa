import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * The Early Warning process pipeline (Hazard Information → Impact Analysis → Dissemination → Monitoring),
 * as a guided timeline of console shortcuts. PER-ENTITY ISOLATION: an agency-bound warning entity (e.g.
 * MoH) sees ONLY its own authoring console; the PMO-DMD stages (consolidation / dissemination / monitoring,
 * which span every entity) are shown only to PMO/national/admin logins. Mirrors the backend read scoping.
 */
@Component({
  selector: 'ew-flow-pipeline',
  standalone: true,
  imports: [RouterLink],
  styles: [`
    :host { display: block; }
    .flow { padding: 4px 2px 18px; max-width: 1100px; }
    .lead { display: flex; align-items: flex-start; gap: 0.6rem; background: var(--surface, #f8fafc);
      border: 1px solid var(--border, #e3e6ed); border-left: 3px solid var(--primary, #003366);
      border-radius: 10px; padding: 0.7rem 0.95rem; font-size: 0.8rem; color: var(--text-mid, #475569);
      line-height: 1.5; margin-bottom: 22px; }
    .lead i { color: var(--primary, #003366); margin-top: 0.15rem; flex-shrink: 0; }
    .pipeline { position: relative; }
    .stage { position: relative; padding-left: 58px; padding-bottom: 26px; }
    .stage:last-child { padding-bottom: 0; }
    .stage::before { content: ''; position: absolute; left: 19px; top: 6px; bottom: -6px;
      width: 2px; background: var(--border, #e3e6ed); }
    .stage:last-child::before { display: none; }
    .node { position: absolute; left: 4px; top: 0; width: 32px; height: 32px; border-radius: 50%;
      background: var(--primary, #003366); color: #fff; font-size: 0.82rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center; z-index: 1; }
    .stage-hd h3 { margin: 0; font-size: 0.95rem; color: var(--text-dark, #14303a); font-weight: 700; line-height: 1.7; }
    .stage-hd .sub { font-size: 0.76rem; color: var(--text-light, #6c757d); margin-top: 1px; line-height: 1.4; }
    .cards { display: flex; flex-wrap: wrap; gap: 11px; margin-top: 13px; }
    .card { flex: 1 1 234px; max-width: 322px; min-width: 0; display: flex; align-items: center; gap: 12px;
      background: #fff; border: 1px solid var(--border, #e3e6ed); border-left: 3px solid var(--c, #003366);
      border-radius: 12px; padding: 12px 14px; text-decoration: none;
      transition: box-shadow .16s ease, transform .16s ease, border-color .16s ease; }
    .card:hover { box-shadow: 0 6px 16px rgba(16,30,54,0.08); transform: translateY(-2px); }
    .card .ic { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; display: flex;
      align-items: center; justify-content: center; font-size: 1.02rem;
      background: #f1f5f9; background: color-mix(in srgb, var(--c, #003366) 12%, #fff); color: var(--c, #003366); }
    .card .nm { font-size: 0.83rem; font-weight: 700; color: var(--text-dark, #1f2d3d); line-height: 1.25; }
    .card .ds { font-size: 0.71rem; color: var(--text-light, #64748b); margin-top: 2px; line-height: 1.35; }
  `],
  template: `
    <div class="flow">
      <div class="lead"><i class="fas fa-circle-info"></i>
        <span>The early-warning process runs top to bottom: each entity authors its bulletin and pushes to the EOCC; PMO-DMD consolidates every entity as a layer into one impact bulletin; the bulletin is disseminated to the affected areas; and Monitoring tracks it through to verification.</span>
      </div>

      <div class="pipeline">
        <section class="stage">
          <span class="node">1</span>
          <div class="stage-hd"><h3>Hazard Information</h3><div class="sub">{{ isPmo ? 'Each warning entity authors its bulletin (map + delineation), then pushes to the EOCC.' : 'Author your entity bulletin (map + delineation), then push to the EOCC.' }}</div></div>
          <div class="cards">
            @for (c of visibleCards; track c.route) {
              <a class="card" [style.--c]="c.c" [routerLink]="'/m/preparedness/early-warnings/' + c.route"><span class="ic"><i class="fas {{ c.icon }}"></i></span><div><div class="nm">{{ c.nm }}</div><div class="ds">{{ c.ds }}</div></div></a>
            } @empty {
              <div class="sub">No warning-entity console is linked to your login. Contact PMO-DMD.</div>
            }
          </div>
        </section>

        @if (isPmo) {
          <section class="stage">
            <span class="node">2</span>
            <div class="stage-hd"><h3>Impact Analysis</h3><div class="sub">PMO-DMD consolidates every entity's push as a layer and generates the impact bulletin.</div></div>
            <div class="cards">
              <a class="card" style="--c:#4527A0" routerLink="/m/preparedness/early-warnings/consolidated"><span class="ic"><i class="fas fa-layer-group"></i></span><div><div class="nm">PMO-DMD Consolidated Impact</div><div class="ds">Overlay layers → multirisk impact bulletin → push</div></div></a>
            </div>
          </section>

          <section class="stage">
            <span class="node">3</span>
            <div class="stage-hd"><h3>Dissemination</h3><div class="sub">Publish the bulletin to the map and send it to people in the affected areas.</div></div>
            <div class="cards">
              <a class="card" style="--c:#0D6EFD" routerLink="/m/preparedness/early-warnings/eocc-bulletin"><span class="ic"><i class="fas fa-tower-broadcast"></i></span><div><div class="nm">EOCC Bulletin</div><div class="ds">View · publish to map · disseminate (SMS / email)</div></div></a>
            </div>
          </section>

          <section class="stage">
            <span class="node">4</span>
            <div class="stage-hd"><h3>Monitoring (EOCC)</h3><div class="sub">Situational awareness and verification before and after issuance.</div></div>
            <div class="cards">
              <a class="card" style="--c:#7C3AED" routerLink="/m/preparedness/early-warnings/scanner"><span class="ic"><i class="fas fa-satellite-dish"></i></span><div><div class="nm">EW Monitoring</div><div class="ds">Scanner · regional / sectorial · entity updates · focal / DRRC</div></div></a>
            </div>
          </section>
        }
      </div>
    </div>
  `,
})
export class EwFlowPipelineComponent {
  private readonly auth = inject(AuthService);

  /** code -> console route (TMA's authoring console is the 722E-4 "new-bulletin" screen). */
  private readonly cards = [
    { agency: 'tma',  route: 'new-bulletin', c: '#1E88E5', icon: 'fa-cloud-sun-rain', nm: 'Tanzania Meteorological Authority',     ds: 'Severe weather — 722E-4' },
    { agency: 'mow',  route: 'mow',          c: '#00ACC1', icon: 'fa-water',          nm: 'Ministry of Water',                      ds: 'Basin / flood risk' },
    { agency: 'gst',  route: 'gst',          c: '#7B1FA2', icon: 'fa-mountain',       nm: 'Geological Survey of Tanzania',          ds: 'Earthquake / landslide / volcano' },
    { agency: 'moh',  route: 'moh',          c: '#388E3C', icon: 'fa-virus',          nm: 'Ministry of Health',                     ds: 'Disease outbreaks' },
    { agency: 'moa',  route: 'moa',          c: '#F57C00', icon: 'fa-wheat-awn',      nm: 'Ministry of Agriculture',                ds: 'Drought / food security' },
    { agency: 'nemc', route: 'nemc',         c: '#D32F2F', icon: 'fa-smog',           nm: 'National Environment Mgmt Council',      ds: 'Pollution / air quality' },
    { agency: 'mlf',  route: 'mlf',          c: '#6D4C41', icon: 'fa-cow',            nm: 'Ministry of Livestock & Fisheries',      ds: 'Livestock disease / fisheries' },
  ];

  /** PMO / national / admin = not bound to a single entity → sees the whole pipeline and every console. */
  get isPmo(): boolean { return !this.myAgency; }
  private get myAgency(): string { return (this.auth.user()?.agency ?? '').toLowerCase(); }

  /** An agency-bound entity sees only its own authoring console; PMO sees all. */
  get visibleCards() { return this.isPmo ? this.cards : this.cards.filter(c => c.agency === this.myAgency); }
}
