import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** EW console route -> the agency code it belongs to (TMA authors via the 722E-4 "new-bulletin" screen). */
const ROUTE_AGENCY: Record<string, string> = {
  'new-bulletin': 'tma', mow: 'mow', gst: 'gst', moh: 'moh', moa: 'moa', nemc: 'nemc', mlf: 'mlf',
};

/**
 * Early-Warning per-entity isolation guard. An agency-bound login (e.g. MoH) may open ONLY its own
 * authoring console; any attempt to open another entity's console or a PMO-DMD-only screen
 * (consolidated / EOCC bulletin / monitoring) is redirected to its own console. PMO/national/admin
 * logins (no agency) are unrestricted. Apply to the EW agency-console + PMO-only routes only — NOT the
 * Early-Warning landing, which already shows just the caller's own console. Mirrors the backend read scope.
 */
export const ewAgencyGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const mine = (auth.user()?.agency ?? '').toLowerCase();
  if (!mine) {
    return true; // PMO / national / admin — sees every entity + the consolidation
  }
  const seg = state.url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
  if (ROUTE_AGENCY[seg] === mine) {
    return true; // the entity's own console
  }
  // another entity's console, or a PMO-only EW screen → send the entity back to its own console
  const ownRoute = mine === 'tma' ? 'new-bulletin' : mine;
  return router.createUrlTree(['/m/preparedness/early-warnings/' + ownRoute]);
};
