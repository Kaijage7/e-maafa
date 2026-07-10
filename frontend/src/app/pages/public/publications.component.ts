import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

interface Publication {
  id: number; documentName: string; documentType: string; yearOfApproval: number;
  narrativeDescription: string; attachmentPath: string | null;
  externalLink: string | null; language: 'en' | 'sw';
}

/**
 * Public publications ("/publications/{type}") — the official DMD document library
 * (disaster_risk_frameworks). Language isolation: only the active portal language
 * (EN or SW via the topbar toggle) is listed — never English and Kiswahili side by side.
 * Switch language to see the other edition.
 */
@Component({
  selector: 'public-publications',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: min(1560px, 94vw); margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      <a routerLink="/" style="color:#60a5fa;text-decoration:none;font-size:0.9rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>
      <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0.8rem 0 0.3rem;">{{ L.t('lbl_publication') }}</h1>
      <p style="color:var(--text-secondary, #64748b);font-size:1.05rem;margin-bottom:0.55rem;">
        {{ L.lang() === 'sw'
          ? 'Nyaraka rasmi za Idara ya Usimamizi wa Maafa — matoleo ya lugha uliyochagua (Kiswahili). Badilisha lugha juu kuona matoleo ya Kiingereza.'
          : 'Official DMD documents in the language you selected (English). Switch language in the top bar to see Kiswahili editions.' }}
      </p>
      <p style="color:#94a3b8;font-size:0.88rem;margin-bottom:1.4rem;">
        <i class="fas fa-language me-1"></i>
        {{ L.lang() === 'sw' ? 'Inaonyesha Kiswahili pekee' : 'Showing English only' }}
        · {{ visibleDocs().length }}
        {{ L.lang() === 'sw' ? 'nyaraka' : (visibleDocs().length === 1 ? 'document' : 'documents') }}
      </p>

      <!-- Type tabs driven by the live per-type counts (all languages) for navigation -->
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.6rem;">
        @for (t of types(); track t) {
          <a [routerLink]="['/publications', t]"
             [style.background]="t === activeType() ? '#003366' : 'transparent'"
             [style.color]="t === activeType() ? '#fff' : '#475569'"
             style="border:1px solid rgba(0,51,102,0.25);border-radius:21px;padding:0 1.1rem;min-height:42px;display:inline-flex;align-items:center;font-size:0.95rem;font-weight:600;text-decoration:none;">
            {{ t }} <span style="opacity:0.7;">({{ counts()[t] }})</span>
          </a>
        }
      </div>

      @if (visibleDocs().length) {
        <div class="row g-3" style="margin-bottom:1.8rem;">
          @for (pub of visibleDocs(); track pub.id) {
            <div class="col-md-6 col-lg-4">
              <div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;background:var(--card-bg, #fff);padding:1.1rem 1.2rem;height:100%;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:38px;height:38px;border-radius:10px;background:rgba(239,68,68,0.1);color:#ef4444;display:flex;align-items:center;justify-content:center;"><i class="fas fa-file-pdf"></i></div>
                  <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">{{ pub.documentType }} @if (pub.yearOfApproval) { · {{ pub.yearOfApproval }} }</div>
                  <span [style.background]="(pub.language || 'en') === 'sw' ? '#1eb53a' : '#003366'"
                        style="margin-left:auto;color:#fff;font-size:0.8rem;font-weight:800;padding:2px 9px;border-radius:9px;">{{ (pub.language || 'en').toUpperCase() }}</span>
                </div>
                <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary, #2C3E50);line-height:1.35;">{{ pub.documentName }}</div>
                @if (pub.narrativeDescription) { <p style="font-size:0.9rem;color:var(--text-secondary, #64748b);line-height:1.55;margin:0;flex:1;">{{ pub.narrativeDescription.slice(0, 160) }}</p> }
                <div style="display:flex;align-items:center;gap:1rem;margin-top:auto;">
                  @if (pub.attachmentPath) {
                    <a [href]="'/api/storage/' + pub.attachmentPath" target="_blank" style="font-size:0.9rem;color:#059669;font-weight:700;text-decoration:none;"><i class="fas fa-download me-1"></i>{{ L.t('lbl_pdf') }}</a>
                  }
                  @if (pub.externalLink) {
                    <a [href]="pub.externalLink" target="_blank" rel="noopener" style="font-size:0.9rem;color:#94a3b8;text-decoration:none;"><i class="fas fa-external-link-alt me-1"></i>{{ L.t('pubs_source') }}</a>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="col-12 text-center" style="color:var(--text-secondary, #64748b);padding:3rem;">
          <i class="fas fa-book-open" style="font-size:2.5rem;opacity:0.3;"></i>
          <p style="margin-top:0.8rem;">
            {{ L.lang() === 'sw'
              ? 'Hakuna nyaraka za Kiswahili katika kundi hili. Badilisha lugha kuona matoleo ya Kiingereza, au chagua kundi lingine.'
              : 'No English documents in this type. Switch language to see Kiswahili editions, or pick another type.' }}
          </p>
        </div>
      }
    </div>
  `,
})
export class PublicationsComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  publications = signal<Publication[]>([]);
  counts = signal<Record<string, number>>({});
  activeType = signal('');
  types = signal<string[]>([]);

  /**
   * Active portal language only (EN or SW). Language toggle is the switch —
   * never render both language editions in one view.
   */
  visibleDocs = computed(() => {
    const lang = this.L.lang();
    return this.publications().filter(d => (d.language ?? 'en') === lang);
  });

  constructor(route: ActivatedRoute) {
    document.title = 'Publications — e-MAAFA';
    route.paramMap.subscribe(params => {
      const type = params.get('type') ?? '';
      this.activeType.set(type);
      this.http.get<{ publications: Publication[]; counts: Record<string, number> }>(
        `/api/v1/portal/publications?type=${encodeURIComponent(type)}`).subscribe(r => {
          this.publications.set(r.publications);
          this.counts.set(r.counts);
          this.types.set(Object.keys(r.counts));
          // If the route's type doesn't exist (e.g. /publications/Policy with no Policy docs), show all
          if (type && !r.counts[type] && r.publications.length === 0 && this.types().length) {
            this.activeType.set('');
            this.http.get<{ publications: Publication[]; counts: Record<string, number> }>(
              '/api/v1/portal/publications').subscribe(all => this.publications.set(all.publications));
          }
          window.scrollTo(0, 0);
        });
    });
  }
}
