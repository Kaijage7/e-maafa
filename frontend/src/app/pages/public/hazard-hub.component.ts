import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PortalLabels } from './portal-i18n';

interface HubHazard { name: string; icon: string; color: string; descriptionEn: string; descriptionSw: string; }
interface HubMaterial {
  audience: 'children' | 'adults' | 'disabilities' | 'all';
  materialType: 'action_guide' | 'video' | 'document' | 'poster' | 'other';
  phase: 'before' | 'during' | 'after' | 'any';
  title: string; body: string; videoUrl: string | null; fileUrl: string | null;
}

/** FEMA-pattern timeline framing (Ready.gov: Prepare NOW / Survive DURING / Be Safe AFTER). */
const PHASES = [
  { key: 'before', en: 'Prepare BEFORE', sw: 'Jiandae KABLA', icon: 'fa-clipboard-check', color: '#0d6efd' },
  { key: 'during', en: 'Stay Safe DURING', sw: 'Kuwa Salama WAKATI', icon: 'fa-exclamation-triangle', color: '#d97706' },
  { key: 'after', en: 'Recover AFTER', sw: 'Rejea BAADA', icon: 'fa-hand-holding-heart', color: '#059669' },
] as const;
interface HubRelated { id: number; title: string; contentType: string; summary: string; }

/** The three audience tabs of every hub (an 'all' material appears under each). */
const AUDIENCES = [
  { key: 'children', en: 'Children', sw: 'Watoto', icon: 'fa-child' },
  { key: 'adults', en: 'Adults', sw: 'Watu Wazima', icon: 'fa-users' },
  { key: 'disabilities', en: 'Persons with Disabilities', sw: 'Watu wenye Ulemavu', icon: 'fa-wheelchair' },
] as const;

/**
 * Hazard education hub ("/education/hazard/{name}") — the repository each "Know Your Hazards"
 * card opens. Materials are grouped by audience (Children / Adults / Persons with Disabilities);
 * each audience gets its action statements (rendered as a checklist), videos and downloadable
 * materials — all managed in Content Management → Public Awareness.
 */
@Component({
  selector: 'public-hazard-hub',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 980px; margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      <a routerLink="/education" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_education') }}</a>

      @if (hazard(); as hz) {
        <!-- Hub header: the hazard's identity + safety summary -->
        <div style="display:flex;align-items:center;gap:16px;margin:1rem 0 0.4rem;">
          <div style="width:58px;height:58px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;" [style.background]="hz.color + '1a'" [style.color]="hz.color">
            <i class="fas {{ hz.icon }}"></i>
          </div>
          <div>
            <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0;">{{ hz.name }}</h1>
            <p style="color:var(--text-secondary, #64748b);margin:0.2rem 0 0;">{{ L.lang() === 'sw' ? hz.descriptionSw : hz.descriptionEn }}</p>
          </div>
        </div>

        <!-- Audience tabs -->
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin:1.4rem 0;">
          @for (a of audiences; track a.key) {
            <button type="button" (click)="tab.set(a.key)"
                    [style.background]="tab() === a.key ? hz.color : 'transparent'"
                    [style.color]="tab() === a.key ? '#fff' : 'var(--text-secondary, #475569)'"
                    [style.border-color]="hz.color"
                    style="border:1.5px solid;border-radius:20px;padding:0.45rem 1.1rem;font-size:0.85rem;font-weight:600;cursor:pointer;">
              <i class="fas {{ a.icon }} me-1"></i>{{ L.lang() === 'sw' ? a.sw : a.en }}
            </button>
          }
        </div>

        <!-- Materials for the selected audience: action guides grouped Before → During → After -->
        @if (tabMaterials().length) {
          @for (ph of phases; track ph.key) {
            @if (phaseGuides(ph.key).length) {
              <div style="display:flex;align-items:center;gap:10px;margin:1.3rem 0 0.7rem;">
                <div style="width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:#fff;" [style.background]="ph.color">
                  <i class="fas {{ ph.icon }}"></i>
                </div>
                <h5 style="font-weight:800;margin:0;font-size:0.98rem;" [style.color]="ph.color">{{ L.lang() === 'sw' ? ph.sw : ph.en }}</h5>
                <div style="flex:1;height:2px;border-radius:2px;opacity:0.25;" [style.background]="ph.color"></div>
              </div>
              <div style="display:grid;gap:0.8rem;">
                @for (m of phaseGuides(ph.key); track m.title) {
                  <div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;background:var(--card-bg, #fff);padding:1.1rem 1.2rem;" [style.border-left]="'4px solid ' + ph.color">
                    <h6 style="font-weight:700;color:var(--text-primary, #2C3E50);margin:0 0 0.6rem;font-size:0.92rem;">{{ m.title }}</h6>
                    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:0.45rem;">
                      @for (statement of statements(m); track statement) {
                        <li style="display:flex;gap:10px;align-items:flex-start;font-size:0.88rem;color:var(--text-secondary, #475569);line-height:1.6;">
                          <i class="fas fa-check-circle" [style.color]="ph.color" style="margin-top:3px;"></i>{{ statement }}
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>
            }
          }

          <!-- Videos, documents and other resources -->
          @if (otherMaterials().length) {
            <div style="display:flex;align-items:center;gap:10px;margin:1.3rem 0 0.7rem;">
              <div style="width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:0.85rem;color:#fff;background:#6366f1;">
                <i class="fas fa-photo-video"></i>
              </div>
              <h5 style="font-weight:800;margin:0;font-size:0.98rem;color:#6366f1;">{{ L.lang() === 'sw' ? 'Video na Nyenzo' : 'Videos & Resources' }}</h5>
              <div style="flex:1;height:2px;border-radius:2px;opacity:0.25;background:#6366f1;"></div>
            </div>
          }
          <div style="display:grid;gap:1rem;">
            @for (m of otherMaterials(); track m.title) {
              <div style="border:1px solid rgba(0,0,0,0.08);border-radius:16px;background:var(--card-bg, #fff);padding:1.2rem 1.3rem;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:0.7rem;">
                  <i class="fas {{ typeIcon(m.materialType) }}" [style.color]="hz.color"></i>
                  <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0;font-size:1rem;">{{ m.title }}</h5>
                  <span style="margin-left:auto;font-size:0.66rem;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">{{ typeLabel(m.materialType) }}</span>
                </div>

                <!-- Action guides render as a checklist of action statements -->
                @if (m.materialType === 'action_guide') {
                  <ul style="list-style:none;padding:0;margin:0;display:grid;gap:0.5rem;">
                    @for (statement of statements(m); track statement) {
                      <li style="display:flex;gap:10px;align-items:flex-start;font-size:0.9rem;color:var(--text-secondary, #475569);line-height:1.6;">
                        <i class="fas fa-check-circle" [style.color]="hz.color" style="margin-top:3px;"></i>{{ statement }}
                      </li>
                    }
                  </ul>
                } @else if (m.materialType === 'video' && m.videoUrl) {
                  @if (m.body) { <p style="font-size:0.85rem;color:var(--text-secondary, #64748b);">{{ m.body }}</p> }
                  @if (embedUrl(m.videoUrl); as src) {
                    <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;">
                      <iframe [src]="src" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allowfullscreen [title]="m.title"></iframe>
                    </div>
                  } @else {
                    <a [href]="m.videoUrl" target="_blank" rel="noopener" style="color:#60a5fa;font-weight:600;font-size:0.88rem;"><i class="fas fa-play-circle me-1"></i>Watch video</a>
                  }
                } @else {
                  @if (m.body) { <p style="font-size:0.88rem;color:var(--text-secondary, #475569);line-height:1.7;white-space:pre-line;margin:0;">{{ m.body }}</p> }
                  @if (m.fileUrl) {
                    <a [href]="m.fileUrl" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:0.6rem;color:#4ade80;font-weight:600;font-size:0.85rem;text-decoration:none;">
                      <i class="fas fa-download"></i> Download material
                    </a>
                  }
                }
              </div>
            }
          </div>
        } @else {
          <div style="text-align:center;padding:2.5rem;border:1px dashed rgba(0,0,0,0.12);border-radius:16px;color:var(--text-secondary, #64748b);">
            <i class="fas fa-folder-open" style="font-size:2rem;opacity:0.3;"></i>
            <p style="margin:0.7rem 0 0;font-size:0.9rem;">Materials for this audience are being prepared.</p>
          </div>
        }

        <!-- Related published articles -->
        @if (related().length) {
          <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:2.4rem 0 0.9rem;">Related guides & articles</h5>
          <div class="row g-3">
            @for (r of related(); track r.id) {
              <div class="col-md-6">
                <a [routerLink]="['/education', r.id]" style="display:block;text-decoration:none;border:1px solid rgba(0,0,0,0.08);border-radius:12px;background:var(--card-bg, #fff);padding:0.9rem 1rem;">
                  <div style="font-size:0.66rem;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">{{ r.contentType }}</div>
                  <div style="font-size:0.9rem;font-weight:700;color:var(--text-primary, #2C3E50);margin-top:2px;">{{ r.title }}</div>
                </a>
              </div>
            }
          </div>
        }
      } @else if (notFound()) {
        <div style="text-align:center;padding:5rem 1rem;color:var(--text-secondary, #64748b);">
          <i class="fas fa-shield-alt" style="font-size:3rem;opacity:0.3;"></i>
          <h4 style="margin-top:1rem;">Hazard not found</h4>
          <a routerLink="/education" style="color:#60a5fa;">{{ L.t('lbl_education') }}</a>
        </div>
      }
    </div>
  `,
})
export class HazardHubComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);

  audiences = AUDIENCES;
  hazard = signal<HubHazard | null>(null);
  materials = signal<HubMaterial[]>([]);
  related = signal<HubRelated[]>([]);
  tab = signal<'children' | 'adults' | 'disabilities'>('adults');
  notFound = signal(false);

  constructor(route: ActivatedRoute) {
    route.paramMap.subscribe(params => {
      const name = params.get('name');
      document.title = `${name} — Education — e-MAAFA`;
      this.http.get<{ hazard: HubHazard; materials: HubMaterial[]; related: HubRelated[] }>(
        `/api/v1/portal/hazard-hub/${encodeURIComponent(name ?? '')}`).subscribe({
          next: r => {
            this.hazard.set(r.hazard);
            this.materials.set(r.materials);
            this.related.set(r.related);
            this.notFound.set(false);
            window.scrollTo(0, 0);
          },
          error: () => { this.hazard.set(null); this.notFound.set(true); },
        });
    });
  }

  phases = PHASES;

  /** Materials for the open tab — audience-specific first, then the shared 'all' items. */
  tabMaterials = computed(() => {
    const t = this.tab();
    const all = this.materials();
    return [...all.filter(m => m.audience === t), ...all.filter(m => m.audience === 'all')];
  });

  /** Action guides for one timeline phase ('any'-phase guides count as BEFORE, the default). */
  phaseGuides(phase: string): HubMaterial[] {
    return this.tabMaterials().filter(m => m.materialType === 'action_guide'
      && (m.phase === phase || (phase === 'before' && (!m.phase || m.phase === 'any'))));
  }

  /** Everything that is not an action guide: videos, documents, posters. */
  otherMaterials = computed(() => this.tabMaterials().filter(m => m.materialType !== 'action_guide'));

  /** Action statements: one per line in the material body. */
  statements(m: HubMaterial): string[] {
    return (m.body ?? '').split('\n').map(line => line.trim()).filter(Boolean);
  }

  /** YouTube links become privacy-friendly embeds; other URLs fall back to an external link. */
  embedUrl(url: string): SafeResourceUrl | null {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
    return match
      ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${match[1]}`)
      : null;
  }

  typeIcon(type: string): string {
    return { action_guide: 'fa-tasks', video: 'fa-play-circle', document: 'fa-file-alt', poster: 'fa-image' }[type] ?? 'fa-folder';
  }

  typeLabel(type: string): string {
    return { action_guide: 'Action guide', video: 'Video', document: 'Document', poster: 'Poster' }[type] ?? 'Material';
  }
}
