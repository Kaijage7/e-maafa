import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PortalLabels } from './portal-i18n';

interface HubHazard { name: string; nameSw?: string; icon: string; color: string; descriptionEn: string; descriptionSw: string; }
interface HubMaterial {
  audience: 'children' | 'adults' | 'disabilities' | 'all';
  materialType: 'action_guide' | 'video' | 'document' | 'poster' | 'other';
  phase: 'before' | 'during' | 'after' | 'any';
  title: string; body: string; titleSw?: string | null; bodySw?: string | null;
  videoUrl: string | null; fileUrl: string | null;
}

/** FEMA-pattern timeline framing (Ready.gov: Prepare NOW / Survive DURING / Be Safe AFTER). */
const PHASES = [
  { key: 'before', en: 'Prepare BEFORE', sw: 'Jiandae KABLA', icon: 'fa-clipboard-check', color: '#0d6efd' },
  { key: 'during', en: 'Stay Safe DURING', sw: 'Kuwa Salama WAKATI', icon: 'fa-exclamation-triangle', color: '#d97706' },
  { key: 'after', en: 'Recover AFTER', sw: 'Rejea BAADA', icon: 'fa-hand-holding-heart', color: '#059669' },
] as const;
interface HubRelated { id: number; title: string; contentType: string; summary: string; titleSw?: string; summarySw?: string; }

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
    <div class="v2-page-content hub-wrap">
      <a routerLink="/education" class="hub-back"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_education') }}</a>

      @if (hazard(); as hz) {
        <!-- Hazard-branded header band: flat tint of the hazard colour (no gradient) -->
        <header class="hub-head" [style.background]="hz.color + '14'" [style.border-color]="hz.color + '3d'">
          <div class="hub-head-icon" [style.background]="hz.color">
            <i class="fas {{ hz.icon }}"></i>
          </div>
          <div style="min-width:0;">
            <h1 class="hub-title">{{ L.lang() === 'sw' && hz.nameSw ? hz.nameSw : hz.name }}</h1>
            <p class="hub-desc">{{ L.lang() === 'sw' ? hz.descriptionSw : hz.descriptionEn }}</p>
          </div>
        </header>

        <!-- Audience segmented control: who is this guidance for? -->
        <p class="hub-seg-label">{{ L.lang() === 'sw' ? 'Mwongozo huu ni kwa ajili ya nani?' : 'Who is this guidance for?' }}</p>
        <div class="hub-seg" role="tablist">
          @for (a of audiences; track a.key) {
            <button type="button" role="tab" class="hub-seg-btn" (click)="tab.set(a.key)"
                    [attr.aria-selected]="tab() === a.key"
                    [style.background]="tab() === a.key ? hz.color : 'transparent'"
                    [style.color]="tab() === a.key ? '#fff' : 'var(--text-secondary, #475569)'">
              <i class="fas {{ a.icon }} me-2"></i>{{ L.lang() === 'sw' ? a.sw : a.en }}
            </button>
          }
        </div>

        <!-- Materials for the selected audience: action guides grouped Before → During → After -->
        @if (tabMaterials().length) {
          @for (ph of phases; track ph.key) {
            @if (phaseGuides(ph.key).length) {
              <section class="hub-phase">
                <div class="hub-phase-head">
                  <div class="hub-phase-icon" [style.background]="ph.color"><i class="fas {{ ph.icon }}"></i></div>
                  <h2 class="hub-phase-title" [style.color]="ph.color">{{ L.lang() === 'sw' ? ph.sw : ph.en }}</h2>
                  <div class="hub-phase-rule" [style.background]="ph.color"></div>
                </div>
                <div class="hub-guide-grid">
                  @for (m of phaseGuides(ph.key); track m.title) {
                    <div class="hub-guide" [style.border-left]="'4px solid ' + ph.color">
                      <h3 class="hub-guide-title">{{ mTitle(m) }}</h3>
                      <ul class="hub-checklist">
                        @for (statement of statements(m); track statement) {
                          <li><i class="fas fa-check-circle" [style.color]="ph.color"></i>{{ statement }}</li>
                        }
                      </ul>
                    </div>
                  }
                </div>
              </section>
            }
          }

          <!-- Videos in a responsive grid -->
          @if (videos().length) {
            <section class="hub-phase">
              <div class="hub-phase-head">
                <div class="hub-phase-icon" style="background:#6366f1;"><i class="fas fa-photo-video"></i></div>
                <h2 class="hub-phase-title" style="color:#6366f1;">{{ L.t('hub_videos_resources') }}</h2>
                <div class="hub-phase-rule" style="background:#6366f1;"></div>
              </div>
              <div class="hub-video-grid">
                @for (m of videos(); track m.title) {
                  <div class="hub-video">
                    @if (embedUrl(m.videoUrl!); as src) {
                      <div class="hub-video-frame">
                        <iframe [src]="src" allowfullscreen [title]="mTitle(m)"></iframe>
                      </div>
                    }
                    <div class="hub-video-body">
                      <h3 class="hub-video-title"><i class="fas fa-play-circle" [style.color]="hz.color"></i> {{ mTitle(m) }}</h3>
                      @if (mBody(m)) { <p class="hub-video-desc">{{ mBody(m) }}</p> }
                      @if (!embedUrl(m.videoUrl!)) {
                        <a [href]="m.videoUrl" target="_blank" rel="noopener" class="hub-ext-link">
                          <i class="fas fa-play-circle me-1"></i>{{ L.t('hub_watch_video') }}
                        </a>
                      }
                    </div>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Documents, posters and other downloads -->
          @if (docs().length) {
            <section class="hub-phase">
              <div class="hub-phase-head">
                <div class="hub-phase-icon" style="background:#0d3b66;"><i class="fas fa-folder-open"></i></div>
                <h2 class="hub-phase-title" style="color:#0d3b66;">{{ L.lang() === 'sw' ? 'Nyaraka na Vipakuliwa' : 'Documents & Downloads' }}</h2>
                <div class="hub-phase-rule" style="background:#0d3b66;"></div>
              </div>
              <div class="hub-doc-list">
                @for (m of docs(); track m.title) {
                  <div class="hub-doc">
                    <div class="hub-doc-icon" [style.color]="hz.color"><i class="fas {{ typeIcon(m.materialType) }}"></i></div>
                    <div class="hub-doc-body">
                      <div class="hub-doc-top">
                        <h3 class="hub-doc-title">{{ mTitle(m) }}</h3>
                        <span class="hub-doc-type">{{ typeLabel(m.materialType) }}</span>
                      </div>
                      @if (mBody(m)) { <p class="hub-doc-desc">{{ mBody(m) }}</p> }
                      @if (m.fileUrl) {
                        <a [href]="m.fileUrl" target="_blank" class="hub-dl-btn">
                          <i class="fas fa-download"></i> {{ L.t('hub_download_material') }}
                        </a>
                      }
                    </div>
                  </div>
                }
              </div>
            </section>
          }
        } @else {
          <div class="hub-empty">
            <i class="fas fa-folder-open"></i>
            <p>{{ L.t('hub_materials_being_prepared') }}</p>
            <a routerLink="/education" class="hub-ext-link">{{ L.t('lbl_education') }}</a>
          </div>
        }

        <!-- Related published articles -->
        @if (related().length) {
          <h2 class="hub-related-head">{{ L.t('hub_related_guides') }}</h2>
          <div class="hub-related-grid">
            @for (r of related(); track r.id) {
              <a [routerLink]="['/education', r.id]" class="hub-related-card">
                <div class="hub-related-type">{{ r.contentType }}</div>
                <div class="hub-related-title">{{ relatedTitle(r) }}</div>
              </a>
            }
          </div>
        }
      } @else if (notFound()) {
        <div class="hub-empty" style="border:none;padding:5rem 1rem;">
          <i class="fas fa-shield-alt" style="font-size:3rem;"></i>
          <h4 style="margin-top:1rem;">{{ L.t('hub_hazard_not_found') }}</h4>
          <a routerLink="/education" style="color:#60a5fa;">{{ L.t('lbl_education') }}</a>
        </div>
      }
    </div>
  `,
  styles: [`
    .hub-wrap { max-width: min(1560px, 94vw); margin: 0 auto; padding: 7rem 2rem 4rem; }
    .hub-back { color: #60a5fa; text-decoration: none; font-size: 0.9rem; }

    /* --- Hazard-branded header --- */
    .hub-head { display: flex; align-items: center; gap: 1.2rem; margin: 1.2rem 0 0;
      border: 1px solid; border-radius: 12px; padding: 1.4rem 1.6rem; }
    .hub-head-icon { width: 64px; height: 64px; border-radius: 14px; color: #fff;
      display: flex; align-items: center; justify-content: center; font-size: 1.7rem; flex: none; }
    .hub-title { font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0; }
    .hub-desc { font-size: 1.05rem; color: var(--text-secondary, #64748b); line-height: 1.6; margin: 0.3rem 0 0; }

    /* --- Audience segmented control --- */
    .hub-seg-label { font-size: 0.9rem; font-weight: 700; color: var(--text-secondary, #64748b);
      text-transform: uppercase; letter-spacing: 0.05em; margin: 1.8rem 0 0.5rem; }
    .hub-seg { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 2.2rem; padding: 6px; width: fit-content;
      border: 1px solid rgba(13, 43, 77, 0.12); border-radius: 12px; background: var(--card-bg, #fff);
      box-shadow: 0 2px 8px rgba(9, 30, 58, 0.06); }
    .hub-seg-btn { border: none; border-radius: 8px; min-height: 44px; padding: 0 1.3rem; font-size: 1rem;
      font-weight: 700; cursor: pointer; display: inline-flex; align-items: center;
      transition: background 0.15s ease, color 0.15s ease; }

    /* --- Phase sections --- */
    .hub-phase { margin: 0 0 2.4rem; }
    .hub-phase-head { display: flex; align-items: center; gap: 12px; margin: 0 0 1rem; }
    .hub-phase-icon { width: 38px; height: 38px; border-radius: 10px; color: #fff; flex: none;
      display: flex; align-items: center; justify-content: center; font-size: 1rem; }
    .hub-phase-title { font-weight: 800; margin: 0; font-size: 1.2rem; }
    .hub-phase-rule { flex: 1; height: 2px; border-radius: 2px; opacity: 0.25; }

    .hub-guide-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: 1rem; }
    .hub-guide { border: 1px solid rgba(13, 43, 77, 0.12); border-radius: 12px;
      background: var(--card-bg, #fff); padding: 1.2rem 1.3rem; box-shadow: 0 2px 8px rgba(9, 30, 58, 0.05); }
    .hub-guide-title { font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0 0 0.8rem; font-size: 1.1rem; }
    .hub-checklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
    .hub-checklist li { display: flex; gap: 12px; align-items: flex-start; font-size: 1rem;
      color: var(--text-secondary, #475569); line-height: 1.7; }
    .hub-checklist li i { margin-top: 5px; flex: none; }

    /* --- Videos --- */
    .hub-video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 1.1rem; }
    .hub-video { border: 1px solid rgba(13, 43, 77, 0.12); border-radius: 12px; overflow: hidden;
      background: var(--card-bg, #fff); box-shadow: 0 2px 8px rgba(9, 30, 58, 0.05); }
    .hub-video-frame { position: relative; padding-top: 56.25%; }
    .hub-video-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .hub-video-body { padding: 0.9rem 1.1rem 1.1rem; }
    .hub-video-title { font-size: 1.05rem; font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0; }
    .hub-video-desc { font-size: 0.95rem; color: var(--text-secondary, #64748b); line-height: 1.6; margin: 0.4rem 0 0; }
    .hub-ext-link { display: inline-block; margin-top: 0.5rem; color: #0d6efd; font-weight: 700;
      font-size: 0.95rem; text-decoration: none; }

    /* --- Documents & downloads --- */
    .hub-doc-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(460px, 100%), 1fr)); gap: 1rem; }
    .hub-doc { display: flex; gap: 14px; border: 1px solid rgba(13, 43, 77, 0.12); border-radius: 12px;
      background: var(--card-bg, #fff); padding: 1.1rem 1.2rem; box-shadow: 0 2px 8px rgba(9, 30, 58, 0.05); }
    .hub-doc-icon { font-size: 1.5rem; flex: none; margin-top: 2px; }
    .hub-doc-body { min-width: 0; flex: 1; }
    .hub-doc-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .hub-doc-title { font-size: 1.05rem; font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0; }
    .hub-doc-type { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8;
      border: 1px solid rgba(13, 43, 77, 0.14); border-radius: 999px; padding: 1px 10px; }
    .hub-doc-desc { font-size: 0.95rem; color: var(--text-secondary, #475569); line-height: 1.7;
      white-space: pre-line; margin: 0.5rem 0 0; }
    .hub-dl-btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 0.8rem; height: 42px;
      padding: 0 1.1rem; border: 1.5px solid #0d3b66; border-radius: 8px; color: #0d3b66;
      font-size: 0.95rem; font-weight: 700; text-decoration: none; }
    .hub-dl-btn:hover { background: rgba(13, 59, 102, 0.06); }

    /* --- Empty state --- */
    .hub-empty { text-align: center; padding: 3rem 1.5rem; border: 1px dashed rgba(13, 43, 77, 0.18);
      border-radius: 12px; color: var(--text-secondary, #64748b); }
    .hub-empty i { font-size: 2.4rem; opacity: 0.3; }
    .hub-empty p { margin: 0.8rem 0 0.6rem; font-size: 1rem; }

    /* --- Related articles --- */
    .hub-related-head { font-size: 1.45rem; font-weight: 800; color: var(--text-primary, #2C3E50); margin: 2.6rem 0 1rem; }
    .hub-related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 1rem; }
    .hub-related-card { display: block; text-decoration: none; border: 1px solid rgba(13, 43, 77, 0.12);
      border-radius: 12px; background: var(--card-bg, #fff); padding: 1rem 1.1rem;
      box-shadow: 0 2px 8px rgba(9, 30, 58, 0.05); transition: transform 0.18s ease, box-shadow 0.18s ease; }
    .hub-related-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(9, 30, 58, 0.14); }
    .hub-related-type { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
    .hub-related-title { font-size: 1.05rem; font-weight: 800; color: var(--text-primary, #2C3E50); margin-top: 3px; }

    @media (max-width: 640px) {
      .hub-wrap { padding: 6rem 1rem 2.5rem; }
      .hub-head { flex-direction: column; align-items: flex-start; }
    }
  `],
})
export class HazardHubComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);

  audiences = AUDIENCES;

  /** Swahili related-guide title when on Swahili AND a _sw title exists; otherwise English. */
  relatedTitle(r: HubRelated): string {
    return this.L.lang() === 'sw' && r.titleSw != null && r.titleSw.trim() !== '' ? r.titleSw : r.title;
  }

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

  /** Videos with a link — the responsive video grid (embed when YouTube, external link otherwise). */
  videos = computed(() => this.otherMaterials().filter(m => m.materialType === 'video' && m.videoUrl));

  /** Documents, posters and link-less video entries — the downloads list. */
  docs = computed(() => this.otherMaterials().filter(m => !(m.materialType === 'video' && m.videoUrl)));

  /** Title in the visitor's language — Swahili when selected AND non-empty, else English. */
  mTitle(m: HubMaterial): string {
    return this.L.lang() === 'sw' && m.titleSw ? m.titleSw : m.title;
  }

  /** Body in the visitor's language — Swahili when selected AND non-empty, else English. */
  mBody(m: HubMaterial): string {
    return this.L.lang() === 'sw' && m.bodySw ? m.bodySw : (m.body ?? '');
  }

  /** Action statements: one per line in the material body (in the visitor's language). */
  statements(m: HubMaterial): string[] {
    return this.mBody(m).split('\n').map(line => line.trim()).filter(Boolean);
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
