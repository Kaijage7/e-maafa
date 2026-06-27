import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MODULES, Module } from '../core/modules';
import { visibleModules } from '../core/module-access';

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

    <div class="module-grid">
      @for (module of modules; track module.slug) {
        <a [routerLink]="cardLink(module)" class="module-card-link">
          <div class="card-icon-wrap"><i class="fas {{ module.icon }}"></i></div>
          <div class="card-title">{{ module.name }}</div>
          <div class="card-desc">{{ module.description }}</div>
          <div class="card-footer">
            @if (module.items.length) {
              <span class="item-count"><i class="fas fa-layer-group"></i> {{ module.items.length }} items</span>
            } @else {
              <span class="item-count"><i class="fas fa-external-link-alt"></i> Direct access</span>
            }
            <i class="fas fa-arrow-right card-arrow"></i>
          </div>
        </a>
      }
    </div>
  `,
  styles: [`
    .module-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    .module-card-link {
      background: rgba(255, 255, 255, 0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border-radius: 18px; padding: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.7); cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
      text-decoration: none; color: inherit; display: flex; flex-direction: column;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03); animation: cardIn 0.5s ease-out both;
    }
    @keyframes cardIn { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .module-card-link:nth-child(1) { animation-delay: 0.06s; } .module-card-link:nth-child(2) { animation-delay: 0.12s; }
    .module-card-link:nth-child(3) { animation-delay: 0.18s; } .module-card-link:nth-child(4) { animation-delay: 0.24s; }
    .module-card-link:nth-child(5) { animation-delay: 0.30s; } .module-card-link:nth-child(6) { animation-delay: 0.36s; }
    .module-card-link:nth-child(7) { animation-delay: 0.42s; } .module-card-link:nth-child(8) { animation-delay: 0.48s; }
    .module-card-link:nth-child(9) { animation-delay: 0.54s; }
    .module-card-link:hover {
      background: rgba(255, 255, 255, 0.78); transform: translateY(-5px);
      box-shadow: 0 20px 50px rgba(0, 51, 102, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.8); border-color: rgba(255, 255, 255, 0.9);
    }
    .card-icon-wrap { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; color: var(--primary); margin-bottom: 1.15rem; transition: transform 0.3s; }
    .module-card-link:hover .card-icon-wrap { transform: scale(1.1); }
    .card-title { font-size: 1.05rem; font-weight: 700; color: var(--text-dark); margin-bottom: 0.35rem; letter-spacing: -0.2px; }
    .card-desc { font-size: 0.86rem; color: var(--text-mid); line-height: 1.55; margin-bottom: 1.15rem; flex: 1; }
    .card-footer { display: flex; align-items: center; justify-content: space-between; }
    .item-count { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.22rem 0.6rem; border-radius: 50px; font-size: 0.76rem; font-weight: 600; background: rgba(255, 255, 255, 0.5); color: var(--text-light); border: 1px solid rgba(0, 0, 0, 0.04); }
    .card-arrow { color: var(--text-light); font-size: 0.8rem; transition: all 0.25s; }
    .module-card-link:hover .card-arrow { color: var(--text-dark); transform: translateX(4px); }
    @media (max-width: 991px) { .module-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 575px) { .module-grid { grid-template-columns: 1fr; gap: 0.85rem; } .greeting h1 { font-size: 1.35rem; } }
  `],
})
export class ModuleHubComponent {
  auth = inject(AuthService);
  // Show each user only the modules their permissions grant (matches the backend ModuleGuardFilter).
  modules = visibleModules(MODULES, this.auth.user());

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
    return ['/m', module.slug, module.items[0].path];
  }
}
