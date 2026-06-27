import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InformService, PendingValue } from './inform.service';
import { INFORM_STYLES } from './inform-ui';
import { InformRefreshService } from './inform-refresh.service';

/** INFORM tab — PMO Approvals queue (live GET /pending, approve/reject).
 *  Keyed values await sign-off here before they feed the strategic composite or hazard signals. */
@Component({
  selector: 'page-inform-approvals',
  standalone: true,
  imports: [FormsModule],
  styles: [INFORM_STYLES, `:host { display:block; }`],
  template: `
    <p class="muted">PMO approval queue — keyed values await sign-off before they feed the strategic composite or hazard signals.</p>

    <div class="row-controls">
      <div class="field"><label>Approver</label><input [(ngModel)]="approver" placeholder="your name / role" /></div>
      <div class="field"><label>Sector</label>
        <select [(ngModel)]="owner" (ngModelChange)="load()">
          <option value="">All sectors</option>
          @for (o of owners(); track o) { <option [value]="o">{{ o }}</option> }
        </select>
      </div>
      <button class="btn" (click)="load()">Refresh</button>
      <span class="muted">{{ pending().length }} pending @if (msg()) { · {{ msg() }} }</span>
    </div>

    @if (pending().length) {
      <div class="card" style="padding:0; overflow:auto; max-height:65vh;">
        <table>
          <thead><tr><th>Indicator</th><th>Hazard</th><th>Sector</th><th>Area</th><th class="num">Raw</th><th class="num">0–10</th><th>By</th><th></th></tr></thead>
          <tbody>
            @for (p of pending(); track p.id) {
              <tr>
                <td>{{ p.indicatorName }} <span class="muted">({{ p.indicatorId }})</span></td>
                <td>{{ p.component || '—' }}</td>
                <td><span class="pill">{{ p.owner }}</span></td>
                <td>{{ p.areaName }} <span class="muted">({{ p.areaCode }})</span></td>
                <td class="num">{{ p.rawValue }}</td>
                <td class="num">{{ p.value0to10?.toFixed(1) }}</td>
                <td class="muted">{{ p.submittedBy }}</td>
                <td style="white-space:nowrap;">
                  <button class="btn" [disabled]="busy()===p.id" (click)="approve(p)">Approve</button>
                  <button class="btn no" style="margin-left:.35rem;" [disabled]="busy()===p.id" (click)="reject(p)">Reject</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="muted" style="padding:1.5rem 0;">No submissions pending approval.</p>
    }
  `,
})
export class InformApprovalsComponent implements OnInit {
  private svc = inject(InformService);
  private refresh = inject(InformRefreshService);
  approver = '';
  owner = '';
  pending = signal<PendingValue[]>([]);
  owners = signal<string[]>([]);
  busy = signal<number | null>(null);
  msg = signal<string | null>(null);

  ngOnInit(): void {
    try { this.approver = JSON.parse(localStorage.getItem('dmis.user') || '{}')?.name || ''; } catch { /* ignore */ }
    this.load();
  }

  load(): void {
    this.svc.getPending(this.owner || undefined).subscribe({
      next: rows => {
        this.pending.set(rows);
        const seen = new Set([...this.owners(), ...rows.map(r => r.owner)]);
        this.owners.set([...seen].filter(Boolean).sort());
      },
      error: () => this.msg.set('Could not load the queue — is the backend up?'),
    });
  }

  approve(p: PendingValue): void {
    this.busy.set(p.id);
    this.svc.approveValue(p.id, this.approver.trim()).subscribe({
      next: () => { this.msg.set(`Approved ${p.indicatorId} @ ${p.areaCode} — risk updated`); this.busy.set(null); this.load(); this.refresh.bump(); },
      error: () => { this.msg.set('Approve failed'); this.busy.set(null); },
    });
  }

  reject(p: PendingValue): void {
    this.busy.set(p.id);
    this.svc.rejectValue(p.id, this.approver.trim()).subscribe({
      next: () => { this.msg.set(`Rejected ${p.indicatorId} @ ${p.areaCode}`); this.busy.set(null); this.load(); },
      error: () => { this.msg.set('Reject failed'); this.busy.set(null); },
    });
  }
}
