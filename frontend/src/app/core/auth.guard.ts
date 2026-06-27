import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { routePermission } from './access';

/**
 * Sends unauthenticated users to /login, and users who lack the route's module permission to
 * /access-denied — so the UI matches the backend ModuleGuardFilter (no screen reachable that the API
 * would 403). Unguarded routes pass; legacy sessions without a permission set fail open (see AuthService).
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.user()) {
    return router.parseUrl('/login');
  }
  const required = routePermission(state.url);
  if (required && !auth.hasPermission(required)) {
    return router.parseUrl('/access-denied');
  }
  return true;
};
