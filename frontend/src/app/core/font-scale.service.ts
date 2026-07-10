import { Injectable, signal } from '@angular/core';

/**
 * System-wide font size controller.
 * Sets html root font-size + --fs-root so rem-based UI scales everywhere.
 * Preference is stored in localStorage (per browser / device).
 */
@Injectable({ providedIn: 'root' })
export class FontScaleService {
  static readonly STORAGE_KEY = 'dmis.fontRootPx';
  /** Default matches styles.scss --fs-root */
  static readonly DEFAULT_PX = 19;
  static readonly MIN_PX = 15;
  static readonly MAX_PX = 24;
  static readonly STEP = 1;

  /** Current root size in CSS pixels (reactive for the topbar label). */
  readonly rootPx = signal(FontScaleService.DEFAULT_PX);

  constructor() {
    this.apply(this.readStored(), false);
  }

  /** Human label e.g. "100%" relative to default. */
  percentLabel(): string {
    return Math.round((this.rootPx() / FontScaleService.DEFAULT_PX) * 100) + '%';
  }

  canDecrease(): boolean {
    return this.rootPx() > FontScaleService.MIN_PX;
  }

  canIncrease(): boolean {
    return this.rootPx() < FontScaleService.MAX_PX;
  }

  decrease(): void {
    this.apply(this.rootPx() - FontScaleService.STEP);
  }

  increase(): void {
    this.apply(this.rootPx() + FontScaleService.STEP);
  }

  reset(): void {
    this.apply(FontScaleService.DEFAULT_PX);
  }

  /**
   * Apply a root size. Clamped to MIN..MAX.
   * @param persist when false, skip localStorage write (initial bootstrap).
   */
  apply(px: number, persist = true): void {
    const next = Math.min(
      FontScaleService.MAX_PX,
      Math.max(FontScaleService.MIN_PX, Math.round(px)),
    );
    this.rootPx.set(next);
    const root = document.documentElement;
    root.style.setProperty('font-size', next + 'px');
    root.style.setProperty('--fs-root', next + 'px');
    // Keep body scale readable as root changes
    root.style.setProperty('--fs-body', '1.05rem');
    if (persist) {
      try {
        localStorage.setItem(FontScaleService.STORAGE_KEY, String(next));
      } catch {
        // private mode / blocked storage — still apply in-session
      }
    }
  }

  private readStored(): number {
    try {
      const raw = localStorage.getItem(FontScaleService.STORAGE_KEY);
      if (raw == null || raw === '') {
        return FontScaleService.DEFAULT_PX;
      }
      const n = Number(raw);
      return Number.isFinite(n) ? n : FontScaleService.DEFAULT_PX;
    } catch {
      return FontScaleService.DEFAULT_PX;
    }
  }
}
