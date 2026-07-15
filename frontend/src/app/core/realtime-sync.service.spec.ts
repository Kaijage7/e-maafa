import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RealtimeSyncService, SyncWakeup } from './realtime-sync.service';

describe('RealtimeSyncService', () => {
  let service: RealtimeSyncService;
  let received: SyncWakeup[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RealtimeSyncService,
        { provide: AuthService, useValue: { token: () => null, logout: jasmine.createSpy('logout') } },
        { provide: Router, useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') } },
      ],
    });
    service = TestBed.inject(RealtimeSyncService);
    received = [];
    service.wakeups$.subscribe(signal => received.push(signal));
  });

  afterEach(() => service.stop());

  it('keeps cursors beyond JavaScript safe integers exact and ignores duplicates', () => {
    consume(`event: sync\ndata: {"sequence":"9007199254740993","occurredAt":"2026-07-15T00:00:00Z"}`);
    consume(`event: sync\ndata: {"sequence":"9007199254740992","occurredAt":"2026-07-15T00:00:01Z"}`);

    expect(received).toEqual([
      { sequence: '9007199254740993', occurredAt: '2026-07-15T00:00:00Z' },
    ]);
  });

  it('does not advance or notify for malformed or non-numeric wake-ups', () => {
    consume('event: sync\ndata: not-json');
    consume('event: sync\ndata: {"sequence":"12x","occurredAt":"2026-07-15T00:00:00Z"}');
    consume(': keepalive');

    expect(received).toEqual([]);
  });

  function consume(frame: string): void {
    (service as unknown as { consumeFrame(value: string): void }).consumeFrame(frame);
  }
});
