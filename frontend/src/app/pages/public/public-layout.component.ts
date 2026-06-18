import { Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { PortalLabels } from './portal-i18n';
import { PortalDataService, EmergencyNumber } from './portal-data.service';

/**
 * Public portal shell — reproduces layouts/v2-public.blade.php:
 * emergency topbar + glass navbar (with the SVG government seal) + page outlet + footer,
 * plus the dark-mode toggle (html[data-theme] + localStorage, same keys as the source)
 * and the EN/SW language toggle.
 *
 * The heavy portal stylesheets (v2-shared.css + portal-landing.css, extracted verbatim from
 * the Laravel views) are attached as <link> tags while a public page is open and removed on
 * destroy, so they can never bleed into the authenticated admin shell.
 */
@Component({
  selector: 'public-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <!-- Emergency hotlines topbar -->
    <div class="emergency-topbar" id="emergencyTopbar">
      <div class="emergency-topbar-inner">
        <div class="emergency-label">
          <i class="fas fa-circle" style="color: var(--status-danger); font-size: 0.5rem;"></i>
          <span>{{ L.t('lbl_emergency_hotlines') }}</span>
        </div>
        <div class="emergency-divider"></div>
        <div class="emergency-numbers">
          @for (n of emergencyNumbers(); track n.number) {
            <a [href]="'tel:' + n.number" class="emergency-num" [title]="n.label" [style.--em-color]="n.color">
              <i class="fas {{ n.icon }}"></i>
              <span class="num-digits">{{ n.number }}</span>
              <span class="num-label">{{ n.label }}</span>
            </a>
          }
        </div>
      </div>
    </div>

    <!-- Glass navbar with the government seal -->
    <header class="v2-navbar" id="v2Navbar" [class.scrolled]="scrolled()">
      <div class="container-fluid px-4">
        <div class="d-flex justify-content-between align-items-center">
          <a class="brand" routerLink="/">
            <div class="brand-seal">
              <svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <path id="navTopArc" d="M 68,300 A 232,232 0 0,1 532,300"/>
                  <path id="navBottomArc" d="M 60,300 A 240,240 0 0,0 540,300"/>
                </defs>
                <circle class="seal-outer" cx="300" cy="300" r="270"/>
                <circle class="seal-outer" cx="300" cy="300" r="252" style="stroke-width:2; opacity:0.3;"/>
                <circle class="seal-inner" cx="300" cy="300" r="200"/>
                <circle class="seal-dot" cx="30" cy="300" r="9"/>
                <circle class="seal-dot" cx="570" cy="300" r="9"/>
                <circle class="seal-dot" cx="300" cy="30" r="5" style="opacity:0.4;"/>
                <circle class="seal-dot" cx="300" cy="570" r="5" style="opacity:0.4;"/>
                <image href="/images/emblem.png" x="150" y="150" width="300" height="300"/>
                <text class="seal-text"><textPath href="#navTopArc" startOffset="50%" text-anchor="middle" font-size="36" font-weight="900" font-family="Inter,sans-serif" letter-spacing="4">JAMHURI YA MUUNGANO</textPath></text>
                <text class="seal-text"><textPath href="#navBottomArc" startOffset="50%" text-anchor="middle" font-size="32" font-weight="800" font-family="Inter,sans-serif" letter-spacing="3">OFISI YA WAZIRI MKUU</textPath></text>
              </svg>
            </div>
            <div class="brand-info"><div class="brand-title">e-MAAFA</div></div>
          </a>
          <div class="nav-links">
            <a routerLink="/" [class.active]="active === 'home'"><i class="fas fa-home me-1"></i> {{ L.t('lbl_home') }}</a>
            <a routerLink="/about" [class.active]="active === 'about'"><i class="fas fa-info-circle me-1"></i> {{ L.t('lbl_about') }}</a>
            <a routerLink="/portal" [class.active]="active === 'portal'"><i class="fas fa-globe-africa me-1"></i> {{ L.t('lbl_portal') }}</a>
            <a routerLink="/publications/Policies" [class.active]="active === 'publications'"><i class="fas fa-book-open me-1"></i> {{ L.t('lbl_publication') }}</a>
            <a routerLink="/education" [class.active]="active === 'education'"><i class="fas fa-graduation-cap me-1"></i> {{ L.t('lbl_education') }}</a>
            <button (click)="L.toggle()"><i class="fas fa-language me-1"></i> {{ L.lang() === 'en' ? 'Swahili' : 'English' }}</button>
            <button (click)="toggleTheme()" class="theme-toggle" title="Toggle dark mode"><i class="fas" [class.fa-moon]="!dark()" [class.fa-sun]="dark()"></i></button>
            <a routerLink="/login" class="btn-glass"><i class="fas fa-sign-in-alt me-1"></i> {{ L.t('lbl_login') }}</a>
          </div>
          <button class="mobile-toggle btn p-0" (click)="mobileOpen.set(true)" style="color: var(--navbar-text); font-size: 1.4rem; border: none; background: none;">
            <i class="fas fa-bars"></i>
          </button>
        </div>
      </div>
    </header>

    <!-- Sitewide live-alert banner (every public page; links to the live portal) -->
    @if (alertBanner(); as ab) {
      <a routerLink="/portal" style="display:flex;align-items:center;gap:10px;padding:0.5rem 1.2rem;text-decoration:none;color:#fff;font-size:0.85rem;" [style.background]="ab.color">
        <i class="fas fa-exclamation-triangle"></i>
        <strong>{{ ab.severity.toUpperCase() }}</strong>
        <span style="opacity:0.95;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{{ ab.message }}</span>
        <span style="white-space:nowrap;font-weight:700;">{{ ab.count }} {{ L.t('lbl_active_warnings') }} <i class="fas fa-arrow-right ms-1"></i></span>
      </a>
    }

    <!-- Mobile menu (the source's #mobileMenu overlay) -->
    @if (mobileOpen()) {
      <div style="position:fixed;inset:0;background:rgba(6,13,31,0.96);z-index:3000;display:flex;flex-direction:column;padding:1.4rem;">
        <button (click)="mobileOpen.set(false)" style="align-self:flex-end;background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;"><i class="fas fa-times"></i></button>
        <nav style="display:grid;gap:0.4rem;margin-top:1rem;">
          @for (link of mobileLinks; track link.path) {
            <a [routerLink]="link.path" (click)="mobileOpen.set(false)"
               style="color:#fff;text-decoration:none;font-size:1.05rem;font-weight:600;padding:0.8rem 1rem;border-radius:12px;background:rgba(255,255,255,0.06);">
              <i class="fas {{ link.icon }} me-2" style="color:#60a5fa;"></i>{{ L.t(link.label) }}
            </a>
          }
          <button (click)="L.toggle()" style="color:#fff;text-align:left;font-size:1.05rem;font-weight:600;padding:0.8rem 1rem;border-radius:12px;background:rgba(255,255,255,0.06);border:none;cursor:pointer;">
            <i class="fas fa-language me-2" style="color:#60a5fa;"></i>{{ L.lang() === 'en' ? 'Swahili' : 'English' }}
          </button>
        </nav>
      </div>
    }

    <!-- Routed public page -->
    <router-outlet></router-outlet>

    <!-- Footer -->
    <footer class="v2-footer">
      <div class="container">
        <div class="row g-4">
          <div class="col-lg-4 col-md-6">
            <div class="footer-brand">
              <img src="/images/emblem.png" alt="Emblem">
              <div>
                <div style="font-weight: 700; font-size: 1.15rem; color: #fff;">e-MAAFA</div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">{{ L.t('lbl_prime_ministers_office') }}</div>
              </div>
            </div>
            <p style="font-size: 0.85rem; color: rgba(255,255,255,0.55); line-height: 1.7; margin-bottom: 0;">{{ L.t('lbl_footer_description') }}</p>
          </div>
          <div class="col-lg-3 col-md-6">
            <h6 style="font-weight: 700; font-size: 0.95rem; margin-bottom: 1.2rem; color: #60a5fa;">{{ L.t('lbl_quick_links') }}</h6>
            <ul class="footer-links">
              <li><a href="https://www.pmo.go.tz" target="_blank" rel="noopener"><i class="fas fa-landmark me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>{{ L.t('lbl_ql_pmo') }}</a></li>
              <li><a href="https://www.tanzania.go.tz" target="_blank" rel="noopener"><i class="fas fa-globe-africa me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>{{ L.t('lbl_ql_govt_portal') }}</a></li>
              <li><a href="https://www.undrr.org" target="_blank" rel="noopener"><i class="fas fa-shield-alt me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>{{ L.t('lbl_ql_undrr') }}</a></li>
              <li><a href="https://www.meteo.go.tz" target="_blank" rel="noopener"><i class="fas fa-cloud-sun me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>{{ L.t('lbl_ql_tma') }}</a></li>
              <li><a href="https://www.maji.go.tz" target="_blank" rel="noopener"><i class="fas fa-water me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>{{ L.t('lbl_ql_water') }}</a></li>
              <li><a href="https://www.nemc.or.tz" target="_blank" rel="noopener"><i class="fas fa-leaf me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>{{ L.t('lbl_ql_nemc') }}</a></li>
            </ul>
          </div>
          <div class="col-lg-3 col-md-6">
            <h6 style="font-weight: 700; font-size: 0.95rem; margin-bottom: 1.2rem; color: #60a5fa;">{{ L.t('lbl_contact_information') }}</h6>
            <ul class="footer-links">
              <li><a href="tel:190" style="color: #fbbf24; font-weight: 700;"><i class="fas fa-phone-alt me-2"></i>{{ L.t('lbl_emergency_phone') }}</a></li>
              <li><a href="mailto:Maafa@pmo.go.tz"><i class="fas fa-envelope me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>Maafa&#64;pmo.go.tz</a></li>
              <li><a href="mailto:eocctz@pmo.go.tz"><i class="fas fa-envelope me-2" style="font-size: 0.7rem; opacity: 0.6;"></i>eocctz&#64;pmo.go.tz</a></li>
            </ul>
            <div class="footer-social" style="margin-top: 1.2rem; display: flex; gap: 10px;">
              <a href="https://www.instagram.com/eocc_tz" target="_blank" rel="noopener" class="social-icon" title="Instagram"><i class="fab fa-instagram"></i></a>
              <a href="https://wa.me/255222113598" target="_blank" rel="noopener" class="social-icon" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
              <a href="https://x.com/eocc_tz" target="_blank" rel="noopener" class="social-icon" title="X (Twitter)"><i class="fab fa-x-twitter"></i></a>
            </div>
          </div>
          <div class="col-lg-2 col-md-6">
            <h6 style="font-weight: 700; font-size: 0.95rem; margin-bottom: 1.2rem; color: #60a5fa;">{{ L.t('lbl_address') }}</h6>
            <p style="font-size: 0.82rem; color: rgba(255,255,255,0.55); line-height: 1.8; margin: 0;">
              {{ L.t('lbl_permanent_secretary') }},<br>
              {{ L.t('lbl_prime_ministers_office') }},<br>
              {{ L.t('lbl_govt_city_mtumba') }},<br>
              {{ L.t('lbl_po_box_dodoma') }}
            </p>
          </div>
        </div>
        <div class="footer-bottom">&copy; {{ year }} e-MAAFA — {{ L.t('lbl_prime_ministers_office') }}, {{ L.t('lbl_united_republic_of_tanzania') }}</div>
      </div>
    </footer>
  `,
})
export class PublicLayoutComponent implements OnDestroy {
  L = inject(PortalLabels);

  /** Page key for the navbar active state — children set it via the router data below. */
  active = 'home';
  year = new Date().getFullYear();
  dark = signal(document.documentElement.getAttribute('data-theme') === 'dark');
  scrolled = signal(false);
  mobileOpen = signal(false);

  /** Mobile menu links (same set as the desktop navbar). */
  mobileLinks = [
    { path: '/', icon: 'fa-home', label: 'lbl_home' },
    { path: '/about', icon: 'fa-info-circle', label: 'lbl_about' },
    { path: '/portal', icon: 'fa-globe-africa', label: 'lbl_portal' },
    { path: '/publications/Policies', icon: 'fa-book-open', label: 'lbl_publication' },
    { path: '/education', icon: 'fa-graduation-cap', label: 'lbl_education' },
    { path: '/subscribe', icon: 'fa-bell', label: 'lbl_subscribe_to_alerts' },
    { path: '/login', icon: 'fa-sign-in-alt', label: 'lbl_login' },
  ];

  /** Topbar hotlines — managed via Content Management (emergency.numbers); defaults until loaded. */
  emergencyNumbers = signal([
    { number: '190', label: 'Disaster', icon: 'fa-exclamation-triangle', color: '#ef4444' },
    { number: '112', label: 'Police', icon: 'fa-shield-alt', color: '#f59e0b' },
    { number: '114', label: 'Fire', icon: 'fa-fire', color: '#f97316' },
    { number: '115', label: 'Medical', icon: 'fa-ambulance', color: '#3b82f6' },
    { number: '116', label: 'Child Helpline', icon: 'fa-child', color: '#10b981' },
  ]);

  private links: HTMLLinkElement[] = [];
  private onScroll = () => this.scrolled.set(window.scrollY > 60);

  private portalData = inject(PortalDataService);

  /** Sitewide alert banner (USWDS Site-Alert pattern): highest-severity active warning, every page. */
  alertBanner = signal<{ count: number; severity: string; color: string; message: string } | null>(null);

  constructor() {
    // Managed hotlines (emergency.numbers JSON setting) replace the defaults once loaded
    this.portalData.landing$.subscribe((d: { emergencyNumbers?: EmergencyNumber[]; warnings?: any[] }) => {
      if (d.emergencyNumbers?.length) { this.emergencyNumbers.set(d.emergencyNumbers); }
      const warnings = d.warnings ?? [];
      if (warnings.length) {
        const rank: Record<string, number> = { Emergency: 3, Warning: 2, Watch: 1 };
        const top = [...warnings].sort((a, b) => (rank[b.severityLevel] ?? 0) - (rank[a.severityLevel] ?? 0))[0];
        const color = top.severityLevel === 'Emergency' ? '#dc2626' : top.severityLevel === 'Warning' ? '#d97706' : '#2563eb';
        this.alertBanner.set({ count: warnings.length, severity: top.severityLevel, color, message: top.alertMessage ?? '' });
      }
    });
    // Attach the portal stylesheets only while public pages are open (removed on destroy)
    for (const href of ['/css/v2-shared.css', '/css/portal-landing.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href + '?v=20260617';   // cache-buster: bump when the portal CSS changes so browsers re-fetch
      document.head.appendChild(link);
      this.links.push(link);
    }
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  /** Dark mode — same html[data-theme] + localStorage('dmis-theme') contract as the source. */
  toggleTheme(): void {
    const next = !this.dark();
    this.dark.set(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('dmis-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('dmis-theme', 'light');
    }
  }

  ngOnDestroy(): void {
    this.links.forEach(l => l.remove());
    window.removeEventListener('scroll', this.onScroll);
  }
}
