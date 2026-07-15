import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';

export interface SyncWakeup {
  sequence: string;
  occurredAt: string;
}

/** Authenticated REST/SSE wake-up. Business rows remain on the existing scoped REST APIs. */
@Injectable({ providedIn: 'root' })
export class RealtimeSyncService {
  private static readonly MAX_FRAME_BUFFER_CHARS = 65_536;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly wakeupSubject = new Subject<SyncWakeup>();
  readonly wakeups$ = this.wakeupSubject.asObservable();

  private controller: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private attempt = 0;
  private lastSignalSequence = '0';

  start(): void {
    if (this.running || !this.auth.token()) return;
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.controller = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.attempt = 0;
    this.lastSignalSequence = '0';
  }

  private async connect(): Promise<void> {
    const token = this.auth.token();
    if (!this.running || !token) return;
    this.controller = new AbortController();
    try {
      const response = await fetch(
        `/api/v1/sync/stream?after_sequence=${encodeURIComponent(this.lastSignalSequence)}`,
        {
          method: 'GET',
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
          cache: 'no-store',
          credentials: 'same-origin',
          signal: this.controller.signal,
        },
      );
      if (response.status === 401) {
        this.stop();
        this.auth.logout();
        await this.router.navigateByUrl('/login');
        return;
      }
      if (response.status === 403) {
        this.stop();
        return;
      }
      if (response.status === 409) {
        this.lastSignalSequence = '0';
        throw new Error('Live sync sequence is ahead of this server.');
      }
      if (!response.ok || !response.body) {
        throw new Error(`Live sync failed with HTTP ${response.status}.`);
      }
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
        throw new Error('Live sync returned an unexpected content type.');
      }
      this.attempt = 0;
      await this.readSse(response.body);
      if (this.running) this.scheduleReconnect();
    } catch (error) {
      if (this.running && !(error instanceof DOMException && error.name === 'AbortError')) {
        this.scheduleReconnect();
      }
    } finally {
      this.controller = null;
    }
  }

  private async readSse(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    while (this.running) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      if (pending.length > RealtimeSyncService.MAX_FRAME_BUFFER_CHARS) {
        throw new Error('Live sync frame exceeded the client buffer limit.');
      }
      let boundary = pending.indexOf('\n\n');
      while (boundary >= 0) {
        this.consumeFrame(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        boundary = pending.indexOf('\n\n');
      }
    }
  }

  private consumeFrame(frame: string): void {
    const data = frame.split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    try {
      const signal = JSON.parse(data) as SyncWakeup;
      if (/^\d+$/.test(signal.sequence) && this.isAfter(signal.sequence, this.lastSignalSequence)) {
        this.lastSignalSequence = signal.sequence;
        this.wakeupSubject.next(signal);
      }
    } catch {
      // Never advance on an invalid frame; reconnect and the durable server sequence recovers.
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    const base = Math.min(30_000, 1_000 * (2 ** Math.min(this.attempt++, 5)));
    const delay = base + Math.floor(Math.random() * Math.max(250, base / 4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private isAfter(candidate: string, previous: string): boolean {
    try {
      return BigInt(candidate) > BigInt(previous);
    } catch {
      return false;
    }
  }
}
