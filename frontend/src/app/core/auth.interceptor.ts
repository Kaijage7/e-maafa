import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AUTH_TOKEN_KEY, AuthService } from './auth.service';

/**
 * Attaches the signed bearer token to our own API calls and reacts to 401s. Before this, the token
 * was stored on login but never sent, so every request went out unauthenticated (F2).
 *
 * <ul>
 *   <li>Adds {@code Authorization: Bearer <token>} to {@code /api/**} requests only — never to the
 *       EW Python services ({@code /ew-api}, {@code /ew-engine}) and not to the login call itself.</li>
 *   <li>On a 401 (expired/invalid session) it clears the session and routes to {@code /login} —
 *       except for the login request, whose 401 the login form handles as "bad credentials".</li>
 * </ul>
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith('/api');
  const isLogin = req.url.includes('/api/v1/auth/login');
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  const authReq =
    token && isApi && !isLogin
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Only react to a 401 from OUR API — a 401 from the EW Python services (/ew-api, /ew-engine)
      // must not log the DMIS user out.
      if (err.status === 401 && isApi && !isLogin) {
        auth.logout();
        router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};
