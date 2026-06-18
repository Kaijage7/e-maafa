import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * Communication & Alert Center — the consolidated UI over the merged alert
 * stream: compose with template substitution and live recipient reach,
 * multi-channel fan-out, delivery history with per-channel breakdown,
 * template management and analytics.
 */
@Component({
  selector: 'page-communication',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.25rem; display: block; }
    .stat span { font-size: 0.68rem; color: #6c757d; text-transform: uppercase; }
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    label { display: block; font-size: 0.74rem; font-weight: 600; color: #334155; margin: 10px 0 3px; }
    input, select, textarea { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
    .check-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .check { display: flex; gap: 6px; align-items: center; font-size: 0.8rem; border: 1px solid #e3e6ed; border-radius: 8px; padding: 7px 10px; cursor: pointer; }
    .check.sel { border-color: #dc3545; background: #fff5f5; }
    .check input { width: auto; }
    .reach { font-size: 0.68rem; color: #6c757d; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .chip { font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; background: #e2e8f0; color: #334155; }
    .c-sent { background: #d1fae5; color: #065f46; } .c-scheduled { background: #fef3c7; color: #92400e; }
    .sev-critical { color: #b91c1c; font-weight: 700; } .sev-high { color: #c2410c; font-weight: 600; }
    .btn-sm { font-size: 0.74rem; padding: 5px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .empty { text-align: center; color: #94a3b8; padding: 26px 0; font-size: 0.85rem; }
    .preview { background: #f8f9fb; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 12px; font-size: 0.8rem; margin-top: 8px; }
  `],
  template: `
    <dmis-page-header title="Communication & Alert Center" icon="fa-bullhorn"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Alert Dissemination'}]">
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ dash().stats?.total_alerts ?? 0 }}</b><span>Alerts</span></div>
      <div class="stat"><b>{{ dash().stats?.sent_today ?? 0 }}</b><span>Sent Today</span></div>
      <div class="stat"><b>{{ dash().stats?.scheduled ?? 0 }}</b><span>Scheduled</span></div>
      <div class="stat"><b>{{ dash().delivery?.total_deliveries ?? 0 }}</b><span>Deliveries</span></div>
      <div class="stat"><b>{{ dash().delivery?.delivery_rate ?? 0 }}%</b><span>Delivery Rate</span></div>
    </div>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'compose'" (click)="tab.set('compose')">Compose Alert</button>
      <button [class.active]="tab() === 'history'" (click)="tab.set('history')">Alert History</button>
      <button [class.active]="tab() === 'templates'" (click)="tab.set('templates')">Templates</button>
    </div>

    <!-- ── Compose ── -->
    @if (tab() === 'compose') {
      <dmis-panel title="Compose & Dispatch Alert" icon="fa-paper-plane">
        <div class="grid-2">
          <div><label>Template (optional)</label>
            <select [(ngModel)]="compose.template_id" (ngModelChange)="applyTemplate()">
              <option [ngValue]="null">— Custom message —</option>
              @for (t of fd()?.templates ?? []; track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
            </select></div>
          <div><label>Linked incident (drives template variables)</label>
            <select [(ngModel)]="compose.incident_id" (ngModelChange)="applyTemplate()">
              <option [ngValue]="null">None</option>
              @for (i of fd()?.incidents ?? []; track i.id) { <option [ngValue]="i.id">{{ i.title }}</option> }
            </select></div>
          <div><label>Alert type *</label>
            <select [(ngModel)]="compose.alert_type">
              @for (t of fd()?.alert_types ?? []; track t) { <option [value]="t">{{ t }}</option> }
            </select></div>
          <div><label>Severity *</label>
            <select [(ngModel)]="compose.severity">
              @for (s of fd()?.severities ?? []; track s) { <option [value]="s">{{ s }}</option> }
            </select></div>
        </div>
        <label>Title *</label><input maxlength="255" [(ngModel)]="compose.title">
        <label>Message * (max 1000)</label><textarea rows="4" maxlength="1000" [(ngModel)]="compose.message"></textarea>

        <label>Channels *</label>
        <div class="check-grid">
          @for (c of fd()?.channels ?? []; track c) {
            <div class="check" [class.sel]="compose.channels.includes(c)" (click)="toggle(compose.channels, c)">
              <input type="checkbox" [checked]="compose.channels.includes(c)"> {{ c.toUpperCase() }}
            </div>
          }
        </div>

        <label>Recipient groups * (live reach shown)</label>
        <div class="check-grid">
          @for (g of fd()?.recipient_groups ?? []; track g.key) {
            <div class="check" [class.sel]="compose.recipient_groups.includes(g.key)" (click)="toggle(compose.recipient_groups, g.key)">
              <input type="checkbox" [checked]="compose.recipient_groups.includes(g.key)">
              <span style="text-transform:capitalize">{{ g.label }} <span class="reach">({{ g.member_count }})</span></span>
            </div>
          }
        </div>

        <label>Schedule for later (optional)</label>
        <input type="datetime-local" [(ngModel)]="compose.scheduled_at" style="max-width:260px">

        @if (compose.title || compose.message) {
          <div class="preview"><b>{{ compose.title }}</b><br>{{ compose.message }}</div>
        }
        <button class="btn-sm b-red" style="margin-top:12px; padding:9px 22px" (click)="send()">
          <i class="fas fa-paper-plane"></i> {{ compose.scheduled_at ? 'Schedule Alert' : 'Send Alert Now' }}</button>
      </dmis-panel>
    }

    <!-- ── History ── -->
    @if (tab() === 'history') {
      <dmis-panel title="Alert History" icon="fa-clock-rotate-left">
        <table>
          <thead><tr><th>Alert</th><th>Type / Severity</th><th>Channels</th><th>Recipients</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (a of history(); track a.id) {
              <tr>
                <td><b>{{ a.title }}</b><br><small style="color:#6c757d">{{ a.incident_title ?? '' }} · {{ a.created_at?.substring(0, 16)?.replace('T', ' ') }}</small></td>
                <td>{{ a.alert_type }} · <span class="sev-{{ a.severity }}">{{ a.severity }}</span></td>
                <td>{{ parseChannels(a.channels) }}</td>
                <td>{{ a.delivered_count }}/{{ a.total_recipients }}
                  @if (a.failed_count > 0) { <span style="color:#b91c1c">({{ a.failed_count }} failed)</span> }</td>
                <td><span class="chip c-{{ a.status }}">{{ a.status }}</span></td>
                <td style="white-space:nowrap">
                  <button class="btn-sm b-outline" (click)="details(a.id)">Details</button>
                  @if (a.failed_count > 0) {
                    <button class="btn-sm b-red" style="margin-left:4px" (click)="resend(a.id)">Resend Failed</button>
                  }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No alerts dispatched yet.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Templates ── -->
    @if (tab() === 'templates') {
      <dmis-panel title="Alert Templates" icon="fa-file-lines">
        <button class="btn-sm b-red" style="margin-bottom:10px" (click)="editTemplate(null)"><i class="fas fa-plus"></i> New Template</button>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Title</th><th>Variables</th><th>Active</th><th></th></tr></thead>
          <tbody>
            @for (t of fd()?.templates ?? []; track t.id) {
              <tr>
                <td><b>{{ t.name }}</b></td>
                <td>{{ t.type }}</td>
                <td style="max-width:280px">{{ t.title }}</td>
                <td><small style="color:#6c757d">{{ t.variables }}</small></td>
                <td>{{ t.is_active ? 'Yes' : 'No' }}</td>
                <td style="white-space:nowrap">
                  <button class="btn-sm b-outline" (click)="editTemplate(t)">Edit</button>
                  <button class="btn-sm b-outline" style="margin-left:4px" (click)="toggleTemplate(t.id)">Toggle</button>
                  <button class="btn-sm b-outline" style="margin-left:4px" (click)="deleteTemplate(t.id)">Delete</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No templates.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }
  `,
})
export class CommunicationComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly tab = signal<'compose' | 'history' | 'templates'>('compose');
  readonly dash = signal<any>({});
  readonly fd = signal<any | null>(null);
  readonly history = signal<any[]>([]);

  compose = { template_id: null as number | null, incident_id: null as number | null,
    alert_type: 'warning', severity: 'high', title: '', message: '',
    channels: [] as string[], recipient_groups: [] as string[], scheduled_at: '' };

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
  }

  load(): void {
    this.http.get<any>('/api/v1/response/communication').subscribe(d => this.dash.set(d));
    this.http.get<any>('/api/v1/response/communication/form-data').subscribe(d => this.fd.set(d));
    this.http.get<any>('/api/v1/response/communication/alerts').subscribe(d => this.history.set(d.alerts));
  }

  toggle(list: string[], value: string): void {
    const i = list.indexOf(value);
    i >= 0 ? list.splice(i, 1) : list.push(value);
  }

  /** Server-side preview fills {placeholders} from the linked incident. */
  applyTemplate(): void {
    const t = (this.fd()?.templates ?? []).find((x: any) => x.id === this.compose.template_id);
    if (!t) { return; }
    this.compose.alert_type = ['evacuation', 'warning', 'update', 'all_clear', 'custom'].includes(t.type) ? t.type : 'custom';
    this.http.post<any>(`/api/v1/response/communication/templates/${t.id}/preview`,
      { incident_id: this.compose.incident_id }).subscribe(p => {
        this.compose.title = p.title;
        this.compose.message = p.message;
      });
  }

  send(): void {
    const body: any = { ...this.compose, scheduled_at: this.compose.scheduled_at || null };
    delete body.template_id;
    this.http.post<any>('/api/v1/response/communication/alerts', body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Dispatched', text: r.message, timer: 3000, showConfirmButton: false,
      }).then(() => { this.tab.set('history'); this.load(); })),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'Failed to send.', 'error')),
    });
  }

  details(id: number): void {
    this.http.get<any>(`/api/v1/response/communication/alerts/${id}`).subscribe(d => {
      const rows = d.channel_breakdown.map((c: any) =>
        `<tr><td style="padding:3px 10px">${c.channel.toUpperCase()}</td><td>${c.delivered}/${c.total} delivered</td><td>${c.failed} failed</td></tr>`).join('');
      ensureSweetAlert().then(() => Swal.fire({
        title: d.alert.title, width: 620,
        html: `<p style="font-size:0.85rem; text-align:left">${d.alert.message}</p>
               <table style="margin:auto; font-size:0.82rem"><tbody>${rows}</tbody></table>
               <p style="font-size:0.74rem; color:#6c757d">${d.recipients.length} recipient deliveries logged</p>`,
        confirmButtonColor: '#dc3545',
      }));
    });
  }

  resend(id: number): void {
    this.http.post<any>(`/api/v1/response/communication/alerts/${id}/resend-failed`, {}).subscribe(r =>
      ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Done', text: r.message, timer: 2200, showConfirmButton: false })
        .then(() => this.load())));
  }

  /** alerts.channels is a PG json column — it may arrive as a string, array, or PGobject {type,value}. */
  parseChannels(raw: any): string {
    try {
      const value = raw?.value ?? raw;
      return (typeof value === 'string' ? JSON.parse(value) : value).join(', ');
    } catch {
      return '';
    }
  }

  // ── Template management ──

  editTemplate(t: any | null): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: t ? 'Edit template' : 'New template', width: 640,
      html: `<input id="tp-name" class="swal2-input" placeholder="Name" value="${t?.name ?? ''}">
             <select id="tp-type" class="swal2-select" style="width:85%">
               ${['evacuation', 'warning', 'update', 'all_clear', 'custom'].map(x =>
                 `<option value="${x}" ${t?.type === x ? 'selected' : ''}>${x}</option>`).join('')}
             </select>
             <input id="tp-title" class="swal2-input" placeholder="Title (may use {placeholders})" value="${t?.title ?? ''}">
             <textarea id="tp-msg" class="swal2-textarea" placeholder="Message with {placeholders}">${t?.message ?? ''}</textarea>`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Save',
      preConfirm: () => {
        const get = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
        if (!get('tp-name') || !get('tp-title') || !get('tp-msg')) {
          Swal.showValidationMessage('Name, title and message are required');
          return false;
        }
        return { name: get('tp-name'), type: get('tp-type'), title: get('tp-title'), message: get('tp-msg') };
      },
    }).then((r: any) => {
      if (r.isConfirmed) {
        const url = t ? `/api/v1/response/communication/templates/${t.id}` : '/api/v1/response/communication/templates';
        this.http.post<any>(url, r.value).subscribe(() => this.load());
      }
    }));
  }

  toggleTemplate(id: number): void {
    this.http.post<any>(`/api/v1/response/communication/templates/${id}/toggle`, {}).subscribe(() => this.load());
  }

  deleteTemplate(id: number): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Delete this template?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
    }).then((r: any) => {
      if (r.isConfirmed) { this.http.delete<any>(`/api/v1/response/communication/templates/${id}`).subscribe(() => this.load()); }
    }));
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
