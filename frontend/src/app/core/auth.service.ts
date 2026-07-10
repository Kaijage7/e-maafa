import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap, throwError } from 'rxjs';

export interface AuthUser {
  name: string;
  email: string;
  roles: string[];
  permissions?: string[];
  /** The EW/agency code this login is bound to (tma/mow/gst/…), or null for national logins. */
  agency?: string | null;
  totpEnabled?: boolean;
  mustChangePassword?: boolean;
}

/** Full login API shape (OK | MFA_REQUIRED | MFA_ENROLL_REQUIRED | PASSWORD_CHANGE_REQUIRED). */
export interface LoginApiResponse {
  status: 'OK' | 'MFA_REQUIRED' | 'MFA_ENROLL_REQUIRED' | 'PASSWORD_CHANGE_REQUIRED' | string;
  token?: string | null;
  challengeToken?: string | null;
  user?: AuthUser | null;
  message?: string | null;
}

/** localStorage keys — single source so the interceptor and service never drift. */
export const AUTH_TOKEN_KEY = 'dmis.token';
export const AUTH_USER_KEY = 'dmis.user';

/**
 * Local session against the existing users table.
 * Supports optional TOTP 2FA and mandatory password-change after admin-set secrets.
 * VAPT iii: client-side idle timeout clears the token after inactivity.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly user = signal<AuthUser | null>(this.restore());

  private static readonly IDLE_MS = 30 * 60 * 1000;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleBound = false;

  constructor() {
    if (this.user()) {
      this.armIdleWatch();
    }
  }

  /**
   * Step 1: email + password. May return MFA_REQUIRED (no token yet),
   * MFA_ENROLL_REQUIRED (token issued; privileged role must enable 2FA), or
   * PASSWORD_CHANGE_REQUIRED (token issued; client must change password).
   */
  login(email: string, password: string): Observable<LoginApiResponse> {
    return this.http.post<LoginApiResponse>('/api/v1/auth/login', { email, password }).pipe(
      tap(res => this.applyLoginResult(res)),
    );
  }

  /** Step 2 after MFA_REQUIRED: verify TOTP and receive full session. */
  verifyMfa(challengeToken: string, code: string): Observable<LoginApiResponse> {
    return this.http.post<LoginApiResponse>('/api/v1/auth/2fa/verify', { challengeToken, code }).pipe(
      tap(res => this.applyLoginResult(res)),
    );
  }

  twoFaStatus(): Observable<{ enabled: boolean; confirmedAt?: string }> {
    return this.http.get<{ enabled: boolean; confirmedAt?: string }>('/api/v1/auth/2fa/status');
  }

  setupTotp(): Observable<{ secret: string; otpauthUri: string; message?: string }> {
    return this.http.post<{ secret: string; otpauthUri: string; message?: string }>('/api/v1/auth/2fa/setup', {});
  }

  enableTotp(code: string): Observable<unknown> {
    return this.http.post<{ token?: string; user?: AuthUser }>('/api/v1/auth/2fa/enable', { code }).pipe(
      tap(res => {
        if (res?.token && res?.user) {
          this.applyLoginResult({ status: 'OK', token: res.token, user: { ...res.user, totpEnabled: true } });
        } else {
          this.markTotpEnabled();
        }
      }),
    );
  }

  disableTotp(password: string, code: string): Observable<unknown> {
    return this.http.post('/api/v1/auth/2fa/disable', { password, code });
  }

  /** Self-service password change (VAPT v). Clears must_change_password; may return a full JWT. */
  changePassword(currentPassword: string, newPassword: string): Observable<unknown> {
    return this.http.post<{ token?: string; user?: AuthUser; mustChangePassword?: boolean }>(
      '/api/v1/auth/change-password',
      { currentPassword, newPassword },
    ).pipe(
      tap(res => {
        if (res?.token && res?.user) {
          this.applyLoginResult({ status: 'OK', token: res.token, user: res.user });
          return;
        }
        const u = this.user();
        if (u) {
          const next = { ...u, mustChangePassword: false };
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
          this.user.set(next);
        }
      }),
    );
  }

  token(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  logout(): void {
    const tok = this.token();
    this.clearIdleWatch();
    // Best-effort server denylist (jti); always clear local storage.
    if (tok) {
      this.http.post('/api/v1/auth/logout', {}).subscribe({ error: () => undefined });
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    this.user.set(null);
  }

  private applyLoginResult(res: LoginApiResponse): void {
    if (res.status === 'MFA_REQUIRED') {
      // No session yet — keep storage clean.
      return;
    }
    if (res.status === 'OK' || res.status === 'PASSWORD_CHANGE_REQUIRED' || res.status === 'MFA_ENROLL_REQUIRED') {
      if (!res.token || !res.user) {
        return;
      }
      const user: AuthUser = {
        ...res.user,
        permissions: res.user.permissions ?? [],
        mustChangePassword: res.status === 'PASSWORD_CHANGE_REQUIRED' || !!res.user.mustChangePassword,
        totpEnabled: res.status === 'MFA_ENROLL_REQUIRED' ? false : !!res.user.totpEnabled,
      };
      localStorage.setItem(AUTH_TOKEN_KEY, res.token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      this.user.set(user);
      this.armIdleWatch();
    }
  }

  /** After forced 2FA enrollment succeeds, mark totpEnabled so shell treats session as complete. */
  markTotpEnabled(): void {
    const u = this.user();
    if (!u) {
      return;
    }
    const next = { ...u, totpEnabled: true };
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
    this.user.set(next);
  }

  private armIdleWatch(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (!this.idleBound) {
      this.idleBound = true;
      const bump = () => this.resetIdleTimer();
      for (const ev of ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'] as const) {
        window.addEventListener(ev, bump, { passive: true });
      }
    }
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    if (!this.token()) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      this.logout();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?reason=idle';
      }
    }, AuthService.IDLE_MS);
  }

  private clearIdleWatch(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  initials(): string {
    return (this.user()?.name ?? '').substring(0, 2).toUpperCase();
  }

  firstName(): string {
    return (this.user()?.name ?? '').split(' ')[0];
  }

  primaryRole(): string {
    return this.user()?.roles?.[0] ?? 'User';
  }

  hasRole(role: string): boolean {
    return this.user()?.roles?.includes(role) ?? false;
  }

  hasPermission(permission: string): boolean {
    return this.user()?.permissions?.includes(permission) ?? false;
  }

  private restore(): AuthUser | null {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      const stored = JSON.parse(raw) as AuthUser;
      if (!Array.isArray(stored?.permissions)) {
        localStorage.removeItem(AUTH_USER_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        return null;
      }
      return stored;
    } catch {
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      return null;
    }
  }
}
