import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

interface Publication {
  id: number; documentName: string; documentType: string; yearOfApproval: number;
  narrativeDescription: string; attachmentPath: string;
}

/** Public publication detail ("/publications/:type/:id") — reproduces portal/publications/show. */
@Component({
  selector: 'public-publication-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 860px; margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      @if (pub(); as p) {
        <a [routerLink]="['/publications', p.documentType]" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_publication') }}</a>
        <div style="margin-top:1rem;display:flex;align-items:center;gap:12px;">
          <div style="width:52px;height:52px;border-radius:14px;background:rgba(239,68,68,0.1);color:#ef4444;display:flex;align-items:center;justify-content:center;font-size:1.4rem;"><i class="fas fa-file-pdf"></i></div>
          <div>
            <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">{{ p.documentType }} @if (p.yearOfApproval) { · {{ p.yearOfApproval }} }</div>
            <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0.2rem 0 0;font-size:1.5rem;">{{ p.documentName }}</h1>
          </div>
        </div>
        @if (p.narrativeDescription) {
          <p style="font-size:0.96rem;color:var(--text-secondary, #475569);line-height:1.9;margin-top:1.4rem;text-align:justify;">{{ p.narrativeDescription }}</p>
        }
        @if (p.attachmentPath) {
          <a [href]="'/api/storage/' + p.attachmentPath" target="_blank" class="btn-gold" style="display:inline-flex;margin-top:1.2rem;text-decoration:none;">
            <i class="fas fa-download"></i> Download PDF
          </a>
        }
        @if (related().length) {
          <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:2.5rem 0 0.8rem;">Related {{ p.documentType }}</h5>
          <div class="row g-3">
            @for (r of related(); track r.id) {
              <div class="col-md-6">
                <a [routerLink]="['/publications', r.documentType, r.id]" style="display:block;text-decoration:none;border:1px solid rgba(0,0,0,0.08);border-radius:12px;background:var(--card-bg, #fff);padding:0.9rem 1rem;">
                  <div style="font-size:0.88rem;font-weight:700;color:var(--text-primary, #2C3E50);">{{ r.documentName }}</div>
                  <div style="font-size:0.72rem;color:#94a3b8;margin-top:2px;">{{ r.yearOfApproval || '' }}</div>
                </a>
              </div>
            }
          </div>
        }
      } @else if (notFound()) {
        <div style="text-align:center;padding:5rem 1rem;color:var(--text-secondary, #64748b);">
          <i class="fas fa-file-pdf" style="font-size:3rem;opacity:0.3;"></i>
          <h4 style="margin-top:1rem;">Publication not found</h4>
          <a routerLink="/publications/Policies" style="color:#60a5fa;">{{ L.t('lbl_publication') }}</a>
        </div>
      }
    </div>
  `,
})
export class PublicationDetailComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  pub = signal<Publication | null>(null);
  related = signal<Publication[]>([]);
  notFound = signal(false);

  constructor(route: ActivatedRoute) {
    route.paramMap.subscribe(params => {
      const type = params.get('type') ?? '';
      const id = Number(params.get('id'));
      this.http.get<{ publications: Publication[] }>(`/api/v1/portal/publications?type=${encodeURIComponent(type)}`)
        .subscribe(r => {
          const found = r.publications.find(p => p.id === id) ?? null;
          this.pub.set(found);
          this.notFound.set(!found);
          this.related.set(r.publications.filter(p => p.id !== id).slice(0, 4));
          window.scrollTo(0, 0);
        });
    });
  }
}
