import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Row {
  id: number; notification_type: string | null; recipient_phone: string; message: string; status: string;
  external_id: string | null; error_message: string | null; sent_at: string | null; delivered_at: string | null;
  retry_count: number; created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  delivered: 'badge-approved', sent: 'badge-approved', pending: 'badge-pending', failed: 'badge-rejected',
};

/**
 * SMS Management — compose & send (manual / bulk / by audience) and the delivery log of every SMS sent
 * through the M-Gov gateway. Shown inside the Communication Center via [embedded]="true" (which hides its
 * own page header). Port of the Laravel sms_logs module.
 */
@Component({
  selector: 'page-sms-management',
  standalone: true,
  imports: [FormsModule, DatePipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    @if (!embedded) {
      <dmis-page-header title="SMS Management" icon="fa-sms"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'SMS Management'}]">
      </dmis-page-header>
    }

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total'] ?? 0" label="Messages" icon="fa-sms" color="#e83e8c" />
      <dmis-stat-card [value]="s()['delivered'] ?? 0" label="Delivered" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="s()['sent'] ?? 0" label="Sent" icon="fa-paper-plane" color="#0d6efd" />
      <dmis-stat-card [value]="s()['pending'] ?? 0" label="Pending" icon="fa-hourglass-half" color="#d97706" />
      <dmis-stat-card [value]="s()['failed'] ?? 0" label="Failed" icon="fa-triangle-exclamation" color="#dc2626" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Compose & Send SMS" icon="fa-paper-plane">
        <div class="panel-body" style="display:flex;flex-direction:column;gap:0.6rem;">
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;">
            <span style="color:var(--text-mid);font-size:0.85rem;">Send to:</span>
            <select class="form-select" style="max-width:260px;" [(ngModel)]="aud" (change)="onAud()">
              <option value="">Manual / pasted numbers</option>
              <option value="all_subscribers">All public subscribers ({{ audCount('all_subscribers') }})</option>
              <option value="subscribers_by_hazard">Subscribers by hazard…</option>
              <option value="stakeholders">Stakeholders / partners ({{ audCount('stakeholders') }})</option>
              <option value="ew_leaders">Early Warning leaders ({{ audCount('ew_leaders') }})</option>
              <option value="role">By role…</option>
              <option value="all_users">All system users ({{ audCount('all_users') }})</option>
            </select>
            @if (aud === 'subscribers_by_hazard') {
              <select class="form-select" style="max-width:220px;" [(ngModel)]="hazard">
                <option value="">Select hazard…</option>
                @for (h of hazards(); track h.hazard) { <option [value]="h.hazard">{{ h.hazard }} ({{ h.count }})</option> }
              </select>
            }
            @if (aud === 'role') {
              <select class="form-select" style="max-width:240px;" [(ngModel)]="role">
                <option value="">Select role…</option>
                @for (r of roles(); track r.role) { <option [value]="r.role">{{ r.role }} ({{ r.phones }} with phone)</option> }
              </select>
            }
            <label class="btn-add" style="background:#64748b;cursor:pointer;" title="Import numbers from a CSV/text file (one per line or comma-separated)">
              <i class="fas fa-file-csv"></i> Import CSV
              <input type="file" accept=".csv,.txt" (change)="importFile($event)" hidden>
            </label>
          </div>
          <textarea class="form-control" rows="2" placeholder="Recipient number(s) — e.g. 0719592997; comma or new-line separated, or paste a column from Excel. Combined with any audience picked above." [(ngModel)]="cTo"></textarea>
          <textarea class="form-control" rows="3" placeholder="Message…" [(ngModel)]="cMessage"></textarea>
          <div style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;">
            <button class="btn-add" (click)="send()" [disabled]="sending()">
              <i class="fas" [class.fa-paper-plane]="!sending()" [class.fa-spinner]="sending()" [class.fa-spin]="sending()"></i>
              {{ sending() ? 'Sending…' : 'Send SMS' }}
            </button>
            @if (sendMsg()) { <span [style.color]="sendOk() ? '#059669' : '#dc2626'" style="font-size:0.85rem;">{{ sendMsg() }}</span> }
            @if (configured() === false) { <span style="color:#d97706;font-size:0.8rem;"><i class="fas fa-circle-info"></i> Gateway not configured — sends are logged as pending.</span> }
          </div>
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row">
      <dmis-panel title="SMS Delivery Log" icon="fa-list" [badge]="rows().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--border);">
          <button class="btn-add" style="background:#64748b;" (click)="showLog.set(!showLog())">
            <i class="fas" [class.fa-eye-slash]="showLog()" [class.fa-eye]="!showLog()"></i> {{ showLog() ? 'Hide log' : 'Show log' }}
          </button>
          @if (showLog()) {
            <select class="form-select" style="max-width:150px;" [(ngModel)]="fStatus" (change)="reload()">
              <option value="">All statuses</option>
              <option value="delivered">Delivered</option><option value="sent">Sent</option>
              <option value="pending">Pending</option><option value="failed">Failed</option>
            </select>
            <span style="color:var(--text-light);font-size:0.8rem;">From</span>
            <input type="date" class="form-control" style="max-width:160px;" [(ngModel)]="fFrom" (change)="reload()">
            <span style="color:var(--text-light);font-size:0.8rem;">to</span>
            <input type="date" class="form-control" style="max-width:160px;" [(ngModel)]="fTo" (change)="reload()">
            <input class="form-control" style="max-width:220px;" placeholder="Search phone / message…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
            <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
            @if (fStatus || fFrom || fTo || fSearch) { <button class="btn-add" style="background:#94a3b8;" (click)="clearFilters()"><i class="fas fa-xmark"></i> Clear</button> }
          }
        </div>
        @if (showLog()) {
          <div class="panel-body" style="padding:0;">
            <table class="r-table">
              <thead><tr><th>Recipient</th><th>Type</th><th>Message</th><th>Gateway ID</th><th>Status</th><th>Sent</th></tr></thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr class="data-row">
                    <td style="font-family:monospace;font-size:0.8rem;">{{ r.recipient_phone }}</td>
                    <td><span class="r-badge" style="background:rgba(13,110,253,0.08);color:#0d6efd;">{{ r.notification_type || 'other' }}</span></td>
                    <td style="font-size:0.8rem;max-width:360px;color:var(--text-mid);">{{ r.message }}
                      @if (r.status === 'failed' && r.error_message) { <div style="color:#dc2626;font-size:0.72rem;">{{ r.error_message }}</div> }</td>
                    <td style="font-family:monospace;font-size:0.72rem;color:var(--text-light);">{{ r.external_id || '—' }}</td>
                    <td><span class="r-badge {{ badge(r.status) }}">{{ r.status }}</span>
                      @if (r.retry_count > 0) { <div style="font-size:0.7rem;color:var(--text-light);">{{ r.retry_count }} retries</div> }</td>
                    <td style="font-size:0.78rem;color:var(--text-mid);">{{ (r.sent_at || r.created_at) | date:'dd MMM, HH:mm' }}</td>
                  </tr>
                } @empty { <tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:2.5rem;">No SMS messages logged for this filter.</td></tr> }
              </tbody>
            </table>
          </div>
        }
      </dmis-panel>
    </div>
  `,
})
export class SmsManagementComponent {
  @Input() embedded = false;

  private http = inject(HttpClient);
  private base = '/api/v1/content/sms-logs';

  data = signal<any | null>(null);
  fStatus = ''; fSearch = ''; fFrom = ''; fTo = '';
  showLog = signal(true);

  cTo = ''; cMessage = '';
  aud = ''; hazard = ''; role = '';
  audData = signal<any | null>(null);
  sending = signal(false);
  sendMsg = signal('');
  sendOk = signal(false);

  s = computed<Record<string, number>>(() => this.data()?.stats ?? {});
  rows = computed<Row[]>(() => this.data()?.logs ?? []);
  configured = computed<boolean | null>(() => this.data()?.configured ?? null);
  private auds = computed<any[]>(() => this.audData()?.audiences ?? []);
  hazards = computed<any[]>(() => this.audData()?.hazards ?? []);
  roles = computed<any[]>(() => this.audData()?.roles ?? []);

  constructor() {
    this.reload();
    this.http.get<any>('/api/v1/communication/audiences').subscribe(d => this.audData.set(d));
  }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    if (this.fFrom) { q.set('from', this.fFrom); }
    if (this.fTo) { q.set('to', this.fTo); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(d => this.data.set(d));
  }

  clearFilters(): void { this.fStatus = ''; this.fSearch = ''; this.fFrom = ''; this.fTo = ''; this.reload(); }

  audCount(key: string): number { const a = this.auds().find(x => x.key === key); return a ? a.sms : 0; }
  onAud(): void { this.hazard = ''; this.role = ''; }

  importFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      this.cTo = (this.cTo.trim() ? this.cTo.trim() + '\n' : '') + text;
    };
    reader.readAsText(file);
    input.value = '';
  }

  send(): void {
    if (this.sending()) { return; }
    this.sendMsg.set('');
    this.sending.set(true);
    const audience = this.aud ? { type: this.aud, hazard: this.hazard, role: this.role } : null;
    this.http.post<any>(`${this.base}/send`, { recipients: this.cTo, message: this.cMessage, audience })
      .subscribe({
        next: r => {
          this.sending.set(false);
          this.sendOk.set(!!r?.success);
          this.sendMsg.set(r?.success ? `Sent to ${r.sent} recipient(s)${r.invalid ? `, ${r.invalid} invalid` : ''}.` : (r?.message || 'Send failed.'));
          if (r?.success) { this.cMessage = ''; }
          this.reload();
        },
        error: () => { this.sending.set(false); this.sendOk.set(false); this.sendMsg.set('Send failed (server error).'); },
      });
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
}
