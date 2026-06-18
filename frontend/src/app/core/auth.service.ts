import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

export interface AuthUser {
  name: string;
  email: string;
  roles: string[];
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

/** localStorage keys — single source so the interceptor and service never drift. */
export const AUTH_TOKEN_KEY = 'dmis.token';
export const AUTH_USER_KEY = 'dmis.user';

/** Local session against the existing users table (email/password → user + SRS roles). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly user = signal<AuthUser | null>(this.restore());

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<LoginResponse>('/api/v1/auth/login', { email, password }).pipe(
      tap(res => {
        localStorage.setItem(AUTH_TOKEN_KEY, res.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
        this.user.set(res.user);
      }),
      map(res => res.user),
    );
  }

  /** The signed bearer token from the last login, or null. */
  token(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    this.user.set(null);
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

  private restore(): AuthUser | null {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      // Corrupted localStorage must not crash the app at AuthService construction — self-heal.
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      return null;
    }
  }
}
