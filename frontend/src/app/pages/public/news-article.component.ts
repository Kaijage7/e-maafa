import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

interface NewsArticle {
  title: string; slug: string; excerpt: string; body: string; image: string; category: string; publishedAt: string;
  title_sw?: string | null; excerpt_sw?: string | null; body_sw?: string | null;
}

/** Public news article ("/news/{slug}") — reproduces portal/news-show.blade.php (article + related). */
@Component({
  selector: 'public-news-article',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 900px; margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      @if (article(); as a) {
        <a routerLink="/" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>
        <div style="margin: 1rem 0 0.5rem;">
          <span [style.background]="a.category === 'event' ? '#f59e0b' : '#3b82f6'" style="color:#fff;font-size:0.7rem;font-weight:700;padding:3px 12px;border-radius:10px;text-transform:uppercase;letter-spacing:0.5px;">{{ a.category }}</span>
        </div>
        <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);line-height:1.25;margin:0.6rem 0;">{{ nl(a.title, a.title_sw) }}</h1>
        <div style="color:var(--text-secondary, #64748b);font-size:0.85rem;margin-bottom:1.4rem;"><i class="fas fa-clock me-1"></i>{{ a.publishedAt }}</div>
        @if (a.image) { <img [src]="a.image" [alt]="nl(a.title, a.title_sw)" style="width:100%;border-radius:16px;margin-bottom:1.6rem;max-height:420px;object-fit:cover;"> }
        @if (nl(a.excerpt, a.excerpt_sw)) { <p style="font-size:1.05rem;font-weight:600;color:var(--text-primary, #2C3E50);line-height:1.7;">{{ nl(a.excerpt, a.excerpt_sw) }}</p> }
        <div style="font-size:0.95rem;color:var(--text-secondary, #475569);line-height:1.9;white-space:pre-line;">{{ nl(a.body, a.body_sw) }}</div>

        @if (related().length) {
          <h4 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:3rem 0 1rem;">{{ L.t('lbl_latest_news') }}</h4>
          <div class="row g-3">
            @for (r of related(); track r.slug) {
              <div class="col-md-4">
                <a [routerLink]="['/news', r.slug]" style="display:block;text-decoration:none;border:1px solid rgba(0,0,0,0.08);border-radius:14px;overflow:hidden;background:var(--card-bg, #fff);">
                  @if (r.image) { <img [src]="r.image" [alt]="nl(r.title, r.title_sw)" style="width:100%;height:120px;object-fit:cover;"> }
                  <div style="padding:0.8rem 0.9rem;">
                    <div style="font-size:0.7rem;color:#94a3b8;">{{ r.publishedAt }}</div>
                    <div style="font-size:0.86rem;font-weight:700;color:var(--text-primary, #2C3E50);line-height:1.35;">{{ nl(r.title, r.title_sw).slice(0, 70) }}</div>
                  </div>
                </a>
              </div>
            }
          </div>
        }
      } @else if (notFound()) {
        <div style="text-align:center;padding:5rem 1rem;color:var(--text-secondary, #64748b);">
          <i class="fas fa-newspaper" style="font-size:3rem;opacity:0.3;"></i>
          <h4 style="margin-top:1rem;">{{ L.t('news_not_found') }}</h4>
          <a routerLink="/" style="color:#60a5fa;">{{ L.t('lbl_home') }}</a>
        </div>
      }
    </div>
  `,
})
export class NewsArticleComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);

  /** Swahili value for Swahili visitors when present; otherwise the English fallback. */
  nl(en: string | null | undefined, sw?: string | null): string {
    return this.L.lang() === 'sw' && sw ? sw : (en ?? '');
  }

  article = signal<NewsArticle | null>(null);
  related = signal<NewsArticle[]>([]);
  notFound = signal(false);

  constructor(route: ActivatedRoute) {
    // Re-fetch whenever the slug changes (related-article links navigate within this page)
    route.paramMap.subscribe(params => {
      const slug = params.get('slug');
      this.http.get<{ article: NewsArticle; related: NewsArticle[] }>(`/api/v1/portal/news/${slug}`).subscribe({
        next: r => { this.article.set(r.article); this.related.set(r.related); this.notFound.set(false); window.scrollTo(0, 0); },
        error: () => { this.article.set(null); this.notFound.set(true); },
      });
    });
  }
}
