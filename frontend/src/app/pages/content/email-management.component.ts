import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Row {
  id: number; notification_type: string | null; recipient_email: string; subject: string | null; message: string;
  status: string; error_message: string | null; sent_at: string | null; delivered_at: string | null;
  retry_count: number; created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  delivered: 'badge-approved', sent: 'badge-approved', pending: 'badge-pending', failed: 'badge-rejected',
};

/**
 * Email Management — compose & send (manual / bulk / by audience, with an optional document attachment)
 * and the delivery log of every email sent through the SMTP gateway. Shown inside the Communication
 * Center via [embedded]="true". Mirror of SMS Management over email_logs.
 */
@Component({
  selector: 'page-email-management',
  standalone: true,
  imports: [FormsModule, DatePipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    @if (!embedded) {
      <dmis-page-header title="Email Management" icon="fa-envelope"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Email Management'}]">
      </dmis-page-header>
    }

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total'] ?? 0" label="Messages" icon="fa-envelope" color="#7c3aed" />
      <dmis-stat-card [value]="s()['delivered'] ?? 0" label="Delivered" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="s()['sent'] ?? 0" label="Sent" icon="fa-paper-plane" color="#0d6efd" />
      <dmis-stat-card [value]="s()['pending'] ?? 0" label="Pending" icon="fa-hourglass-half" color="#d97706" />
      <dmis-stat-card [value]="s()['failed'] ?? 0" label="Failed" icon="fa-triangle-exclamation" color="#dc2626" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Compose & Send Email" icon="fa-paper-plane">
        <div class="panel-body" style="display:flex;flex-direction:column;gap:0.6rem;">
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;">
            <span style="color:var(--text-mid);font-size:0.85rem;">Send to:</span>
            <select class="form-select" style="max-width:260px;" [(ngModel)]="aud" (change)="onAud()">
              <option value="">Manual / pasted addresses</option>
              <option value="all_subscribers">All public subscribers ({{ audCount('all_subscribers') }})</option>
              <option value="subscribers_by_hazard">Subscribers by hazard…</option>
              <option value="stakeholders">Stakeholders / partners ({{ audCount('stakeholders') }})</option>
              <option value="ew_leaders">Early Warning leaders ({{ audCount('ew_leaders') }})</option>
              <option value="role">By role…</option>
              <option value="agency">By agency…</option>
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
                @for (r of roles(); track r.role) { <option [value]="r.role">{{ r.role }} ({{ r.users }})</option> }
              </select>
            }
            @if (aud === 'agency') {
              <div style="display:flex;flex-wrap:wrap;gap:6px;max-width:560px;align-items:center;">
                @for (a of agencies(); track a.id) {
                  <label style="display:inline-flex;align-items:center;gap:4px;font-size:0.76rem;border:1px solid var(--border,#d1d5db);border-radius:6px;padding:3px 8px;cursor:pointer;" [style.background]="agencySel.includes(a.id) ? '#dbeafe' : '#fff'">
                    <input type="checkbox" [checked]="agencySel.includes(a.id)" (change)="toggleAgency(a.id)"> {{ a.acronym || a.name }}
                  </label>
                }
                @if (!agencies().length) { <span style="font-size:0.76rem;color:var(--text-light);">No active agencies.</span> }
              </div>
            }
            <label class="btn-add" style="background:#64748b;cursor:pointer;" title="Import addresses from a CSV/text file">
              <i class="fas fa-file-csv"></i> Import CSV
              <input type="file" accept=".csv,.txt" (change)="importFile($event)" hidden>
            </label>
          </div>
          <textarea class="form-control" rows="2" placeholder="Recipient email(s) — comma or new-line separated, or paste a column from Excel. Combined with any audience picked above." [(ngModel)]="cTo"></textarea>
          <input class="form-control" placeholder="Subject" [(ngModel)]="cSubject">
          <textarea class="form-control" rows="3" placeholder="Message…" [(ngModel)]="cMessage"></textarea>
          <div style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;">
            <label class="btn-add" style="background:#64748b;cursor:pointer;" title="Attach a document (optional, max 10MB)">
              <i class="fas fa-paperclip"></i> Attach
              <input type="file" (change)="onAttach($event)" hidden>
            </label>
            @if (attach()) {
              <span style="font-size:0.82rem;color:var(--text-mid);"><i class="fas fa-file"></i> {{ attach()!.filename }}
                <i class="fas fa-xmark" style="cursor:pointer;color:#dc2626;margin-left:0.3rem;" (click)="clearAttach()"></i></span>
            }
          </div>
          <div style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;">
            <button class="btn-add" (click)="send()" [disabled]="sending()">
              <i class="fas" [class.fa-paper-plane]="!sending()" [class.fa-spinner]="sending()" [class.fa-spin]="sending()"></i>
              {{ sending() ? 'Sending…' : 'Send Email' }}
            </button>
            @if (sendMsg()) { <span [style.color]="sendOk() ? '#059669' : '#dc2626'" style="font-size:0.85rem;">{{ sendMsg() }}</span> }
            @if (configured() === false) { <span style="color:#d97706;font-size:0.8rem;"><i class="fas fa-circle-info"></i> Gateway not configured — sends are logged as pending.</span> }
          </div>
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row">
      <dmis-panel title="Email Delivery Log" icon="fa-list" [badge]="rows().length + ' shown'">
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
            <input class="form-control" style="max-width:220px;" placeholder="Search address / subject…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
            <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
            @if (fStatus || fFrom || fTo || fSearch) { <button class="btn-add" style="background:#94a3b8;" (click)="clearFilters()"><i class="fas fa-xmark"></i> Clear</button> }
          }
        </div>
        @if (showLog()) {
          <div class="panel-body" style="padding:0;">
            <table class="r-table">
              <thead><tr><th>Recipient</th><th>Type</th><th>Subject / Message</th><th>Status</th><th>Sent</th></tr></thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr class="data-row">
                    <td style="font-family:monospace;font-size:0.8rem;">{{ r.recipient_email }}</td>
                    <td><span class="r-badge" style="background:rgba(124,58,237,0.08);color:#7c3aed;">{{ r.notification_type || 'other' }}</span></td>
                    <td style="font-size:0.8rem;max-width:380px;color:var(--text-mid);">
                      <div style="font-weight:600;color:var(--text-dark);">{{ r.subject || '—' }}</div>{{ text(r.message) }}
                      @if (r.status === 'failed' && r.error_message) { <div style="color:#dc2626;font-size:0.72rem;">{{ r.error_message }}</div> }</td>
                    <td><span class="r-badge {{ badge(r.status) }}">{{ r.status }}</span>
                      @if (r.retry_count > 0) { <div style="font-size:0.7rem;color:var(--text-light);">{{ r.retry_count }} retries</div> }</td>
                    <td style="font-size:0.78rem;color:var(--text-mid);">{{ (r.sent_at || r.created_at) | date:'dd MMM, HH:mm' }}</td>
                  </tr>
                } @empty { <tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:2.5rem;">No emails logged for this filter.</td></tr> }
              </tbody>
            </table>
          </div>
        }
      </dmis-panel>
    </div>
  `,
})
export class EmailManagementComponent {
  @Input() embedded = false;

  private http = inject(HttpClient);
  private base = '/api/v1/content/email-logs';

  data = signal<any | null>(null);
  fStatus = ''; fSearch = ''; fFrom = ''; fTo = '';
  showLog = signal(true);

  cTo = ''; cSubject = ''; cMessage = '';
  aud = ''; hazard = ''; role = ''; agencySel: number[] = [];
  attach = signal<{ filename: string; contentType: string; content: string } | null>(null);
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
  agencies = computed<any[]>(() => this.audData()?.agencies ?? []);

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

  audCount(key: string): number { const a = this.auds().find(x => x.key === key); return a ? a.email : 0; }
  onAud(): void { this.hazard = ''; this.role = ''; this.agencySel = []; }
  toggleAgency(id: number): void { const i = this.agencySel.indexOf(id); if (i >= 0) { this.agencySel.splice(i, 1); } else { this.agencySel.push(id); } }

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

  onAttach(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { return; }
    if (file.size > 10 * 1024 * 1024) { this.sendOk.set(false); this.sendMsg.set('Attachment too large (max 10MB).'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      this.attach.set({ filename: file.name, contentType: file.type || 'application/octet-stream', content: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearAttach(): void { this.attach.set(null); }

  send(): void {
    if (this.sending()) { return; }
    this.sendMsg.set('');
    this.sending.set(true);
    const audience = this.aud ? { type: this.aud, hazard: this.hazard, role: this.role, agencyIds: this.agencySel } : null;
    const attachments = this.attach() ? [this.attach()] : [];
    this.http.post<any>(`${this.base}/send`, { recipients: this.cTo, subject: this.cSubject, message: this.cMessage, audience, attachments })
      .subscribe({
        next: r => {
          this.sending.set(false);
          this.sendOk.set(!!r?.success);
          this.sendMsg.set(r?.success ? `Sent: ${r.sent} ok, ${r.failed} failed.` : (r?.message || 'Send failed.'));
          if (r?.success) { this.cMessage = ''; this.clearAttach(); }
          this.reload();
        },
        error: () => { this.sending.set(false); this.sendOk.set(false); this.sendMsg.set('Send failed (server error).'); },
      });
  }

  /** Strip HTML so the log shows readable text even for older rows that stored the branded wrapper. */
  text(s: string): string {
    if (!s) { return ''; }
    return s.replace(/<[^>]*>/g, ' ')
      .replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
}
