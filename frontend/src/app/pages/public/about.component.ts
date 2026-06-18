import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';
import { ABOUT_LABELS } from './about-i18n';

/**
 * Public About page ("/about") — reproduces portal/about.blade.php:
 * Background (history paragraphs + milestone timeline 1961→2025), Functions of the
 * Disaster Management Department (the lettered list), and the Organisation Structure
 * (PM → PS → DMD → sections, plus support units). All texts come verbatim from the
 * Laravel TranslationSeeder via ABOUT_LABELS (en/sw).
 */
@Component({
  selector: 'public-about',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content" style="max-width: 1000px; margin: 0 auto; padding: 7rem 1.5rem 4rem;">
      <a routerLink="/" style="color:#60a5fa;text-decoration:none;font-size:0.85rem;"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>

      <!-- ===== Background ===== -->
      <section id="background" style="margin-top:1rem;">
        <h1 style="font-weight:800;color:var(--text-primary, #2C3E50);">{{ a('lbl_about_bg_heading') }}</h1>
        <p style="color:var(--text-secondary, #64748b);margin-bottom:1.6rem;">{{ a('lbl_about_bg_subheading') }}</p>
        @for (p of ['lbl_about_bg_p1','lbl_about_bg_p2','lbl_about_bg_p3']; track p) {
          <p style="font-size:1.05rem;color:var(--text-primary, #111827);line-height:1.9;text-align:justify;">{{ a(p) }}</p>
        }

        <!-- Milestones timeline -->
        <div style="margin:2rem 0;display:grid;gap:0.7rem;">
          @for (m of milestones; track m.year) {
            <div style="display:flex;gap:14px;align-items:flex-start;">
              <div style="flex-shrink:0;width:64px;text-align:right;font-weight:800;color:#003366;">{{ m.year }}</div>
              <div style="flex-shrink:0;width:12px;height:12px;border-radius:50%;background:#60a5fa;margin-top:5px;"></div>
              <div style="font-size:0.96rem;color:var(--text-secondary, #475569);line-height:1.6;">{{ a(m.key) }}</div>
            </div>
          }
        </div>
      </section>

      <!-- ===== Functions of the Department ===== -->
      <section id="functions" style="margin-top:2.5rem;">
        <h2 style="font-weight:800;color:var(--text-primary, #2C3E50);">{{ a('lbl_about_fn_heading') }}</h2>
        <p style="color:var(--text-secondary, #64748b);margin-bottom:1.2rem;">{{ a('lbl_about_fn_subheading') }}</p>
        <ol type="a" style="display:grid;gap:0.6rem;font-size:1.02rem;color:var(--text-primary, #111827);line-height:1.75;padding-left:1.4rem;">
          @for (k of functionKeys; track k) { <li>{{ a(k) }}</li> }
        </ol>
      </section>

      <!-- ===== Organisation structure ===== -->
      <section id="org-structure" style="margin-top:2.5rem;">
        <h2 style="font-weight:800;color:var(--text-primary, #2C3E50);margin-bottom:1.2rem;">{{ a('lbl_about_org_heading') }}</h2>
        <div style="display:flex;flex-direction:column;align-items:center;gap:0.7rem;">
          <div style="background:#003366;color:#fff;border-radius:14px;padding:0.8rem 1.6rem;font-weight:700;"><i class="fas fa-landmark me-2"></i>{{ a('lbl_about_org_pm') }}</div>
          <div style="width:2px;height:18px;background:rgba(0,51,102,0.3);"></div>
          <div style="border:2px solid #003366;color:#003366;border-radius:14px;padding:0.7rem 1.4rem;font-weight:700;background:var(--card-bg, #fff);"><i class="fas fa-user-tie me-2"></i>{{ a('lbl_about_org_ps') }}</div>
          <div style="width:2px;height:18px;background:rgba(0,51,102,0.3);"></div>
          <div style="background:#1a6fc4;color:#fff;border-radius:14px;padding:0.7rem 1.4rem;font-weight:700;"><i class="fas fa-shield-alt me-2"></i>{{ a('lbl_about_org_dmd') }}</div>
          <div style="width:2px;height:18px;background:rgba(0,51,102,0.3);"></div>
          <div style="display:flex;gap:0.7rem;flex-wrap:wrap;justify-content:center;">
            @for (s of sectionKeys; track s.key) {
              <div style="border:1px solid rgba(26,111,196,0.35);color:#1a6fc4;border-radius:12px;padding:0.55rem 1rem;font-weight:600;font-size:0.84rem;background:var(--card-bg, #fff);">
                <i class="fas {{ s.icon }} me-1"></i>{{ a(s.key) }}
              </div>
            }
          </div>
          <div style="margin-top:0.8rem;display:flex;gap:0.6rem;flex-wrap:wrap;justify-content:center;">
            @for (u of unitKeys; track u) {
              <div style="border:1px dashed rgba(75,101,132,0.4);color:#4b6584;border-radius:10px;padding:0.45rem 0.9rem;font-size:0.78rem;background:var(--card-bg, #fff);">{{ a(u) }}</div>
            }
          </div>
        </div>
      </section>
    </div>
  `,
})
export class AboutComponent {
  L = inject(PortalLabels);

  constructor() {
    document.title = 'About — e-MAAFA';
  }

  /** label('lbl_about_…') in the current language, verbatim from the seeder. */
  a(key: string): string {
    return ABOUT_LABELS[key]?.[this.L.lang()] ?? ABOUT_LABELS[key]?.en ?? key;
  }

  milestones = [
    { year: 1961, key: 'lbl_about_bg_m1961' }, { year: 1990, key: 'lbl_about_bg_m1990' },
    { year: 2003, key: 'lbl_about_bg_m2003' }, { year: 2004, key: 'lbl_about_bg_m2004' },
    { year: 2015, key: 'lbl_about_bg_m2015' }, { year: 2017, key: 'lbl_about_bg_m2017' },
    { year: 2022, key: 'lbl_about_bg_m2022' }, { year: 2025, key: 'lbl_about_bg_m2025' },
  ];

  functionKeys = 'abcdefghilmnu'.split('').map(c => `lbl_about_fn_${c}`).filter(k => k in ABOUT_LABELS);

  sectionKeys = [
    { key: 'lbl_about_org_dmc', icon: 'fa-sitemap' },
    { key: 'lbl_about_org_eocc', icon: 'fa-headset' },
    { key: 'lbl_about_org_onehealth', icon: 'fa-heartbeat' },
    { key: 'lbl_about_org_ops', icon: 'fa-tasks' },
  ].filter(s => s.key in ABOUT_LABELS);

  unitKeys = ['lbl_about_org_admin', 'lbl_about_org_finance', 'lbl_about_org_legal',
    'lbl_about_org_ict', 'lbl_about_org_comms_unit'].filter(k => k in ABOUT_LABELS);
}
