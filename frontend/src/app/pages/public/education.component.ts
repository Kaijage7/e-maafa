import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';
import { PortalDataService, HazardCard } from './portal-data.service';

interface EduItem {
  id: number; title: string; contentType: string; summary: string; fullContent?: string;
  author: string; targetAudience: string; publicationDate: string; keywords?: string;
  // Optional Swahili authoring from educational_contents.title_sw / summary_sw / full_content_sw.
  titleSw?: string; summarySw?: string; fullContentSw?: string;
}

/**
 * Public education portal ("/education", "/education/:id") — reproduces
 * portal/educational_contents (index + show): published guidelines, bulletins and
 * articles managed in Content Management → Educational Content.
 */
@Component({
  selector: 'public-education',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 1320px; margin: 0 auto; padding: 7rem 2rem 4rem;">
      <a routerLink="/" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>

      @if (item(); as it) {
        <!-- ===== Detail view ===== -->
        <div style="margin-top:1rem;">
          <span style="background:rgba(0,51,102,0.08);color:#003366;font-size:0.72rem;font-weight:700;padding:3px 12px;border-radius:10px;text-transform:uppercase;">{{ it.contentType }}</span>
          <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0.7rem 0 0.4rem;">{{ eduTitle(it) }}</h1>
          <div style="color:var(--text-secondary, #64748b);font-size:0.84rem;margin-bottom:1.4rem;">
            @if (it.author) { <span><i class="fas fa-user me-1"></i>{{ it.author }}</span> }
            @if (it.publicationDate) { <span class="ms-3"><i class="fas fa-clock me-1"></i>{{ it.publicationDate }}</span> }
            @if (it.targetAudience) { <span class="ms-3"><i class="fas fa-users me-1"></i>{{ it.targetAudience }}</span> }
          </div>
          @if (eduSummary(it)) { <p style="font-size:1.02rem;font-weight:600;color:var(--text-primary, #2C3E50);line-height:1.7;">{{ eduSummary(it) }}</p> }
          <div style="font-size:1.05rem;color:var(--text-secondary, #475569);line-height:1.85;white-space:pre-line;">{{ eduBody(it) }}</div>
          <a routerLink="/education" style="display:inline-block;margin-top:2rem;color:#60a5fa;text-decoration:none;font-size:0.88rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_education') }}</a>
        </div>
      } @else {
        <!-- ===== List view ===== -->
        <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0.8rem 0 0.3rem;">{{ L.t('lbl_education') }}</h1>
        <p style="color:var(--text-secondary, #64748b);margin-bottom:1.6rem;">{{ L.t('lbl_hazards_education_subtitle') }}</p>

        <!-- INFORM Framework guided course (interactive, 6 sections, a quiz each) -->
        <a routerLink="/inform-education" style="display:flex;align-items:center;gap:1rem;background:linear-gradient(135deg,#0d3b66,#1f6feb);color:#fff;border-radius:16px;padding:1.3rem 1.5rem;text-decoration:none;margin-bottom:2rem;box-shadow:0 4px 16px rgba(13,59,102,0.25);">
          <div style="width:54px;height:54px;border-radius:14px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex:none;"><i class="fas fa-graduation-cap"></i></div>
          <div style="min-width:0;flex:1;">
            <div style="font-size:0.7rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">{{ L.t('edu_inform_course_eyebrow') }}</div>
            <div style="font-size:1.15rem;font-weight:800;margin:0.15rem 0;">{{ L.t('edu_inform_course_title') }}</div>
            <div style="font-size:0.82rem;opacity:0.92;">{{ L.t('edu_inform_course_desc') }}</div>
          </div>
          <span style="background:#fff;color:#0d3b66;font-weight:800;font-size:0.82rem;padding:0.5rem 1.1rem;border-radius:50px;white-space:nowrap;flex:none;">{{ L.t('edu_inform_course_cta') }} <i class="fas fa-arrow-right ms-1"></i></span>
        </a>

        <!-- National threats under watch — with their past impacts to Tanzania -->
        @if (threats().length) {
          <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0 0 0.9rem;">{{ L.t('edu_national_threats') }}</h5>
          <div class="row g-2" style="margin-bottom:2rem;">
            @for (th of threats(); track th.id) {
              <div class="col-md-6">
                <a [routerLink]="['/threats', th.id]" style="display:flex;align-items:center;gap:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px;background:var(--card-bg, #fff);padding:0.9rem 1rem;text-decoration:none;">
                  <div [style.background]="th.severity === 'Emergency' ? '#dc2626' : th.severity === 'Warning' ? '#d97706' : '#2563eb'"
                       style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;"><i class="fas fa-satellite-dish"></i></div>
                  <div style="min-width:0;">
                    <div style="font-size:0.9rem;font-weight:700;color:var(--text-primary, #2C3E50);">{{ th.name }}</div>
                    <div style="font-size:0.72rem;color:var(--text-secondary, #64748b);">{{ th.sourceAgency }} — {{ L.t('edu_see_past_impacts') }}</div>
                  </div>
                  <i class="fas fa-chevron-right" style="margin-left:auto;font-size:0.6rem;color:#94a3b8;"></i>
                </a>
              </div>
            }
          </div>
        }

        <!-- Hazard guide hubs: one repository per hazard (action guides, videos, materials by audience) -->
        <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0 0 0.9rem;">{{ L.t('lbl_know_your_hazards') }}</h5>
        <div class="row g-2" style="margin-bottom:2rem;">
          @for (hz of hazardCards(); track hz.name) {
            <div class="col-6 col-md-4 col-lg-3">
              <a [routerLink]="['/education/hazard', hz.name]"
                 style="display:flex;align-items:center;gap:10px;border:1px solid rgba(0,0,0,0.08);border-radius:12px;background:var(--card-bg, #fff);padding:0.7rem 0.85rem;text-decoration:none;height:100%;">
                <div style="flex-shrink:0;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"
                     [style.background]="hz.color + '1a'" [style.color]="hz.color">
                  <i class="fas {{ hz.icon }}"></i>
                </div>
                <div style="font-size:0.94rem;font-weight:700;color:var(--text-primary, #2C3E50);">{{ hazardName(hz) }}</div>
                <i class="fas fa-chevron-right" style="margin-left:auto;font-size:0.6rem;color:#94a3b8;"></i>
              </a>
            </div>
          }
        </div>

        <h5 style="font-weight:800;color:var(--text-primary, #2C3E50);margin:0 0 0.9rem;">{{ L.t('edu_guides_articles') }}</h5>
        <div class="row g-3">
          @for (c of contents(); track c.id) {
            <div class="col-md-6 col-lg-4">
              <a [routerLink]="['/education', c.id]" style="display:flex;flex-direction:column;gap:8px;height:100%;text-decoration:none;border:1px solid rgba(0,0,0,0.08);border-radius:14px;background:var(--card-bg, #fff);padding:1.1rem 1.2rem;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:38px;height:38px;border-radius:10px;background:rgba(0,51,102,0.08);color:#003366;display:flex;align-items:center;justify-content:center;"><i class="fas fa-graduation-cap"></i></div>
                  <span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">{{ c.contentType }}</span>
                </div>
                <div style="font-size:1.05rem;font-weight:700;color:var(--text-primary, #2C3E50);line-height:1.35;">{{ eduTitle(c) }}</div>
                @if (eduSummary(c)) { <p style="font-size:0.9rem;color:var(--text-secondary, #64748b);line-height:1.6;margin:0;flex:1;">{{ eduSummary(c).slice(0, 130) }}</p> }
                <div style="font-size:0.72rem;color:#94a3b8;">{{ c.author }} @if (c.publicationDate) { · {{ c.publicationDate }} }</div>
              </a>
            </div>
          } @empty {
            <div class="col-12 text-center" style="color:var(--text-secondary, #64748b);padding:3rem;">
              <i class="fas fa-graduation-cap" style="font-size:2.5rem;opacity:0.3;"></i>
              <p style="margin-top:0.8rem;">{{ L.t('edu_no_content_yet') }}</p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class EducationComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);

  /** Swahili value when the visitor is on Swahili AND the _sw field is non-empty; otherwise English. */
  eduTitle(c: EduItem): string { return this.pick(c.titleSw, c.title); }
  eduSummary(c: EduItem): string { return this.pick(c.summarySw, c.summary); }
  eduBody(c: EduItem): string { return this.pick(c.fullContentSw, c.fullContent ?? ''); }
  hazardName(hz: HazardCard): string { return this.pick(hz.nameSw, hz.name); }
  private pick(sw: string | undefined | null, en: string): string {
    return this.L.lang() === 'sw' && sw != null && sw.trim() !== '' ? sw : en;
  }

  contents = signal<EduItem[]>([]);
  item = signal<EduItem | null>(null);
  /** Hazard hubs surfaced at the top of Elimu (managed in Content Management). */
  hazardCards = signal<HazardCard[]>([]);
  /** National threats — Elimu reflects their past impacts (threat pages carry NDRF-IP figures). */
  threats = signal<{ id: number; name: string; sourceAgency: string; severity: string }[]>([]);

  constructor(route: ActivatedRoute) {
    document.title = 'Education — e-MAAFA';
    inject(PortalDataService).landing$.subscribe((d: { hazardCards?: HazardCard[] }) =>
      this.hazardCards.set(d.hazardCards ?? []));
    this.http.get<{ threats: any[] }>('/api/v1/portal/threats').subscribe(r => this.threats.set(r.threats));
    route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.http.get<EduItem>(`/api/v1/portal/education/${id}`).subscribe({
          next: it => { this.item.set(it); window.scrollTo(0, 0); },
          error: () => this.item.set(null),
        });
      } else {
        this.item.set(null);
        this.http.get<{ contents: EduItem[] }>('/api/v1/portal/education').subscribe(r => this.contents.set(r.contents));
      }
    });
  }
}
