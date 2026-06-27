import { Injectable, signal } from '@angular/core';

/**
 * Cross-tab refresh signal for the INFORM section. Any action that changes the authoritative model
 * (a PMO approval / rejection) bumps {@link rev}; the Risk Map and Analytics tabs react to it and re-fetch,
 * so an approved value is reflected in the display immediately — no page reload. Manual refresh bumps it too.
 */
@Injectable({ providedIn: 'root' })
export class InformRefreshService {
  /** Revision counter — increments whenever approved/authoritative data may have changed. */
  readonly rev = signal(0);
  bump(): void { this.rev.update(v => v + 1); }
}
