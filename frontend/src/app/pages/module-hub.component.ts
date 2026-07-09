import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MODULES, Module, ModuleItem } from '../core/modules';
import { visibleModules } from '../core/module-access';
import { hasRequiredPermission, routePermission } from '../core/access';
import { qrcodegen } from '../shared/qrcodegen';

/** Exact reproduction of home-v2.blade.php — the module hub landing. */
@Component({
  selector: 'page-module-hub',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="module-card" style="margin-bottom:0.85rem;">
      <div class="module-card-left">
        <div class="module-card-icon"><i class="fas fa-th-large"></i></div>
        <div>
          <h1>Module Hub</h1>
          <div class="breadcrumb-trail">
            <span style="color:var(--module-color);font-weight:600;">Home</span>
          </div>
        </div>
      </div>
    </div>

    <div class="greeting" style="margin-bottom:1.5rem;animation:fadeUp 0.6s ease-out both;">
      <h1 style="font-size:1.6rem;font-weight:800;color:var(--text-dark);margin-bottom:0.5rem;letter-spacing:-0.5px;">
        {{ greeting }}, {{ auth.firstName() }}
      </h1>
      <span class="role-badge" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.75rem;border-radius:50px;font-size:0.8rem;font-weight:600;background:rgba(0,51,102,0.08);color:var(--primary);border:1px solid rgba(0,51,102,0.1);">
        <i class="fas fa-shield-halved"></i>
        {{ auth.primaryRole() }}
      </span>
    </div>

    @if (sectorQueue().length) {
      <div class="sector-queue" style="background:#fff;border:1px solid #e3e6ed;border-radius:10px;padding:14px 18px;margin-bottom:1.2rem;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <i class="fas fa-inbox" style="color:#0d3b66"></i>
          <b style="font-size:0.92rem;color:#1f2937">Sections awaiting your sector</b>
          <span style="font-size:0.78rem;font-weight:700;background:#fef3c7;color:#92400e;border-radius:10px;padding:1px 9px;">{{ sectorQueue().length }}</span>
        </div>
        @for (m of sectorQueue().slice(0, 5); track m.dlna_id + '-' + m.section_key) {
          <a [routerLink]="['/m/response/dlna', m.dlna_id]" [queryParams]="{section: m.section_key}"
             style="display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px dashed #eef1f5;font-size:0.84rem;text-decoration:none;color:#1f2937;">
            <b style="color:#0d3b66">{{ m.ref_no }}</b>
            <span style="flex:1">{{ m.incident_title }}</span>
            <span style="font-size:0.78rem;color:#6c757d">{{ m.sector_lead }}</span>
            <span style="font-size:0.78rem;font-weight:700;color:#0d3b66"><i class="fas fa-pen"></i> Key section</span>
          </a>
        }
        @if (sectorQueue().length > 5) {
          <a routerLink="/m/response/dlna" style="font-size:0.8rem;font-weight:600;color:#0d3b66;">View all {{ sectorQueue().length }} in the DLNA registry →</a>
        }
      </div>
    }

    <div class="module-grid">
      @for (module of modules; track module.slug) {
        <a [routerLink]="cardLink(module)" class="module-card-link">
          <div class="card-icon-wrap"><i class="fas {{ module.icon }}"></i></div>
          <div class="card-title">{{ module.name }}</div>
          <div class="card-desc">{{ module.description }}</div>
          <div class="card-footer">
            @if (visibleItems(module).length) {
              <span class="item-count"><i class="fas fa-layer-group"></i> {{ visibleItems(module).length }} items</span>
            } @else {
              <span class="item-count"><i class="fas fa-external-link-alt"></i> Direct access</span>
            }
            <i class="fas fa-arrow-right card-arrow"></i>
          </div>
        </a>
      }
    </div>

    <a [routerLink]="['/register-partner']" class="hub-qr" title="Scan with a phone to register as a partner — or click to open the registration page">
      <svg [attr.viewBox]="qr.vb" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
        <rect [attr.x]="-3" [attr.y]="-3" [attr.width]="qr.n + 6" [attr.height]="qr.n + 6" fill="#ffffff"/>
        @for (m of qr.dark; track $index) { <rect [attr.x]="m[0]" [attr.y]="m[1]" width="1" height="1" fill="#0d3b66"/> }
      </svg>
      <span class="hub-qr-cap">SCAN TO REGISTER</span>
    </a>
  `,
  styles: [`
    .module-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    /* In-flow outreach card after the grid (was position:fixed, which floated over the module cards) */
    .hub-qr { margin:1.5rem 0 0.5rem; display:inline-flex; flex-direction:column; align-items:center; gap:.45rem;
      background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:.7rem .7rem .55rem; text-decoration:none;
      box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:transform .2s ease, box-shadow .2s ease; }
    .hub-qr:hover { transform:translateY(-2px); box-shadow:0 10px 26px rgba(0,51,102,0.18); }
    .hub-qr svg { width:112px; height:112px; display:block; }
    .hub-qr-cap { font-size:0.75rem; font-weight:800; letter-spacing:.05em; color:#0d3b66; }
    @media (max-width:575px){ .hub-qr svg { width:88px; height:88px; } }
    .module-card-link {
      background: #fff;
      border-radius: 8px; padding: 1.5rem; border: 1px solid #e2e8f0; cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
      text-decoration: none; color: inherit; display: flex; flex-direction: column;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04); animation: cardIn 0.5s ease-out both;
    }
    @keyframes cardIn { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .module-card-link:nth-child(1) { animation-delay: 0.06s; } .module-card-link:nth-child(2) { animation-delay: 0.12s; }
    .module-card-link:nth-child(3) { animation-delay: 0.18s; } .module-card-link:nth-child(4) { animation-delay: 0.24s; }
    .module-card-link:nth-child(5) { animation-delay: 0.30s; } .module-card-link:nth-child(6) { animation-delay: 0.36s; }
    .module-card-link:nth-child(7) { animation-delay: 0.42s; } .module-card-link:nth-child(8) { animation-delay: 0.48s; }
    .module-card-link:nth-child(9) { animation-delay: 0.54s; }
    .module-card-link:hover {
      background: #fff; transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 51, 102, 0.10); border-color: #c8d2dd;
    }
    .card-icon-wrap { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; color: var(--primary); margin-bottom: 1.15rem; transition: transform 0.3s; }
    .module-card-link:hover .card-icon-wrap { transform: scale(1.1); }
    .card-title { font-size: 1.05rem; font-weight: 700; color: var(--text-dark); margin-bottom: 0.35rem; letter-spacing: -0.2px; }
    .card-desc { font-size: 0.86rem; color: var(--text-mid); line-height: 1.55; margin-bottom: 1.15rem; flex: 1; }
    .card-footer { display: flex; align-items: center; justify-content: space-between; }
    .item-count { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.22rem 0.6rem; border-radius: 50px; font-size: 0.76rem; font-weight: 600; background: #f8fafc; color: var(--text-light); border: 1px solid #e2e8f0; }
    .card-arrow { color: var(--text-light); font-size: 0.8rem; transition: all 0.25s; }
    .module-card-link:hover .card-arrow { color: var(--text-dark); transform: translateX(4px); }
    @media (max-width: 991px) { .module-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 575px) { .module-grid { grid-template-columns: 1fr; gap: 0.85rem; } .greeting h1 { font-size: 1.35rem; } }
  `],
})
export class ModuleHubComponent implements OnInit {
  auth = inject(AuthService);
  private http = inject(HttpClient);
  // Show each user only the modules their permissions grant (matches the backend ModuleGuardFilter).
  modules = visibleModules(MODULES, this.auth.user());
  /** DLNA sections assigned to this user's sector, still pending — the sector's feeding inbox. */
  readonly sectorQueue = signal<any[]>([]);

  ngOnInit(): void {
    if (this.auth.hasPermission('damage_assessment.view')) {
      this.http.get<any>('/api/v1/response/dlna/my-sections').subscribe({
        next: d => this.sectorQueue.set(d.sections ?? []),
        error: () => { /* hub stays clean if the queue is unavailable */ },
      });
    }
  }

  /** "Scan to register" QR for the hub — encodes the register page on the current origin (auto-targets
   *  localhost / LAN / live domain), rendered in-system via the vendored encoder. */
  qr = (() => {
    const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'http://localhost:4200';
    const q = qrcodegen.QrCode.encodeText(origin + '/register-partner', qrcodegen.QrCode.Ecc.MEDIUM);
    const n = q.size;
    const dark: [number, number][] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (q.getModule(x, y)) { dark.push([x, y]); }
      }
    }
    return { n, dark, vb: `-3 -3 ${n + 6} ${n + 6}` };
  })();

  constructor() {
    // home-v2.blade.php sets @section('module-color', '#003366') — the hub uses the navy accent.
    document.documentElement.style.setProperty('--module-color', '#003366');
  }

  get greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  cardLink(module: Module): string[] {
    if (module.directPath) {
      return ['/m', ...module.directPath.split('/')];
    }
    const first = this.visibleItems(module)[0] ?? module.items[0];
    return ['/m', module.slug, ...first.path.split('/')];
  }

  visibleItems(module: Module): ModuleItem[] {
    return module.items.filter(item => {
      const perm = routePermission(['/m', module.slug, ...item.path.split('/')].join('/'));
      return hasRequiredPermission(p => this.auth.hasPermission(p), perm);
    });
  }
}
