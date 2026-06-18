import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { moduleBySlug } from '../core/modules';

/**
 * Generic module-screen host: renders the exact page-header (module-card) for the current module/item
 * and sets --module-color, matching layouts/dmis-v2.blade.php. The screen body for each item is
 * reproduced from the existing system next (per the blueprint), one screen at a time.
 */
@Component({
  selector: 'page-screen',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="module-card" style="margin-bottom:0.85rem;">
      <div class="module-card-left">
        <div class="module-card-icon"><i class="fas {{ item()?.icon || module()?.icon }}"></i></div>
        <div>
          <h1>{{ item()?.name || module()?.name }}</h1>
          <div class="breadcrumb-trail">
            <a routerLink="/home">Home</a>
            <span class="sep"><i class="fas fa-chevron-right" style="font-size:0.4rem;"></i></span>
            <span>{{ module()?.name }}</span>
            @if (item()) {
              <span class="sep"><i class="fas fa-chevron-right" style="font-size:0.4rem;"></i></span>
              <span style="color:var(--module-color);font-weight:600;">{{ item()?.name }}</span>
            }
          </div>
        </div>
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.72);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.7);border-radius:18px;padding:2.4rem;text-align:center;">
      <div style="width:54px;height:54px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:1.4rem;color:#fff;background:var(--module-color);margin-bottom:1rem;">
        <i class="fas {{ item()?.icon || module()?.icon }}"></i>
      </div>
      <div style="font-weight:700;color:var(--text-dark);margin-bottom:0.3rem;">{{ item()?.name || module()?.name }}</div>
      <div style="font-size:0.88rem;color:var(--text-mid);">{{ item()?.description }}</div>
    </div>
  `,
})
export class ScreenComponent {
  private route = inject(ActivatedRoute);
  private params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  module = computed(() => moduleBySlug(this.params().get('slug') ?? ''));
  item = computed(() => {
    const path = this.params().get('item');
    return this.module()?.items.find(i => i.path === path);
  });

  constructor() {
    effect(() => {
      document.documentElement.style.setProperty('--module-color', this.module()?.color ?? '#003366');
    });
  }
}
