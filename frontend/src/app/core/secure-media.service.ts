import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Loader for PROTECTED storage files (assessment/incident evidence under the restricted
 * /storage prefixes, which require authentication). A plain <img src="/api/storage/...">
 * cannot carry the Bearer token, so the browser gets a 401; this service fetches the bytes
 * through HttpClient (the auth interceptor attaches the token) and hands back an object URL
 * the template can bind. URLs are cached per path for the SPA's lifetime; a failed fetch
 * resolves to null so callers can show an honest "unavailable" state instead of a broken icon.
 */
@Injectable({ providedIn: 'root' })
export class SecureMediaService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Promise<string | null>>();

  /** Object URL for a protected storage file (path as stored, e.g. "assessments/4/x.png"), or null. */
  url(path: string | null | undefined): Promise<string | null> {
    if (!path) {
      return Promise.resolve(null);
    }
    let pending = this.cache.get(path);
    if (!pending) {
      pending = firstValueFrom(this.http.get(`/api/storage/${path}`, { responseType: 'blob' }))
        .then(blob => URL.createObjectURL(blob))
        .catch(() => null);
      this.cache.set(path, pending);
    }
    return pending;
  }
}
