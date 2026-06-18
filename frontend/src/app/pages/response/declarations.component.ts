import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * Disaster declarations — the DM Act 2022 instruments (s.32 Disaster Area by the Minister,
 * s.33 State of Emergency by the President) and their statutory escalation chain:
 * propose → National Technical Committee review → National Steering Committee endorsement →
 * the authority declares → extend / revoke. Each step is journaled (declaration_events).
 */
@Component({
  selector: 'page-declarations',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.3rem; display: block; }
    .stat span { font-size: 0.68rem; color: #6c757d; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .chip { font-size: 0.64rem; font-weight: 700; border-radius: 8px; padding: 1px 8px; }
    .s-proposed { background: #e2e8f0; color: #334155; } .s-technical_review { background: #fef3c7; color: #92400e; }
    .s-steering_endorsed { background: #dbeafe; color: #1e40af; } .s-declared { background: #fee2e2; color: #b91c1c; }
    .s-revoked, .s-expired { background: #f3f4f6; color: #6b7280; }
    .btn-sm { font-size: 0.72rem; padding: 4px 11px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .chain { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; font-size: 0.66rem; }
    .step { padding: 1px 7px; border-radius: 6px; background: #e2e8f0; color: #475569; }
    .step.done { background: #d1fae5; color: #065f46; } .step.now { background: #dc3545; color: #fff; }
    .empty { text-align: center; color: #94a3b8; padding: 26px 0; font-size: 0.85rem; }
    .drawer-back { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 1100; display: flex; justify-content: flex-end; }
    .drawer { width: 520px; max-width: 95vw; background: #fff; height: 100%; overflow-y: auto; box-shadow: -12px 0 40px rgba(0,0,0,0.25); }
    .drawer-head { background: #b91c1c; color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; position: sticky; top: 0; }
    .drawer-body { padding: 16px 18px; }
    .ev { font-size: 0.78rem; padding: 8px 0; border-bottom: 1px dashed #e3e6ed; }
  `],
  template: `
    <dmis-page-header title="Disaster Declarations" icon="fa-file-contract"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Declarations'}]">
      <button type="button" class="btn-add" (click)="propose()"><i class="fas fa-plus"></i> Propose Declaration</button>
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ stats().total ?? 0 }}</b><span>Total</span></div>
      <div class="stat"><b style="color:#b91c1c">{{ stats().active ?? 0 }}</b><span>In Force</span></div>
      <div class="stat"><b style="color:#d97706">{{ stats().in_chain ?? 0 }}</b><span>In Approval Chain</span></div>
      <div class="stat"><b>{{ stats().ended ?? 0 }}</b><span>Ended</span></div>
    </div>

    <dmis-panel title="Declarations (DM Act 2022 ss.32–33)" icon="fa-gavel">
      <table>
        <thead><tr><th>Type / Authority</th><th>Area</th><th>Chain</th><th>Status</th><th>Effective</th><th></th></tr></thead>
        <tbody>
          @for (x of declarations(); track x.id) {
            <tr>
              <td><b>{{ x.type_label }}</b>
                @if (x.is_simulation) { <span class="chip" style="background:#f3e8ff; color:#6b21a8">SIMULATION</span> }
                <br><small style="color:#6c757d">{{ x.authority }} · {{ x.legal_basis }}</small></td>
              <td>{{ x.area_scope }}</td>
              <td><div class="chain">
                @for (s of chainSteps; track s.key) {
                  <span class="step" [class.done]="chainIndex(x.status) > s.i" [class.now]="x.status === s.key">{{ s.label }}</span>
                }
              </div></td>
              <td><span class="chip s-{{ x.status }}">{{ x.status.replace('_', ' ') }}</span>
                @if (x.is_expired) { <br><small style="color:#b91c1c">expired</small> }</td>
              <td>{{ x.effective_from ? (x.effective_from + ' → ' + (x.effective_until ?? '…')) : '—' }}</td>
              <td style="white-space:nowrap">
                <button class="btn-sm b-outline" (click)="open(x.id)">Open</button>
                @if (x.status === 'proposed') { <button class="btn-sm b-red" (click)="act(x.id, 'technical-review', 'Forward to National Technical Committee review?')">Review</button> }
                @if (x.status === 'technical_review') { <button class="btn-sm b-red" (click)="act(x.id, 'endorse', 'National Steering Committee endorses?')">Endorse</button> }
                @if (x.status === 'steering_endorsed') { <button class="btn-sm b-red" (click)="declare(x)">Declare</button> }
                @if (x.status === 'declared') { <button class="btn-sm b-outline" (click)="extend(x)">Extend</button>
                  <button class="btn-sm b-outline" (click)="revoke(x.id)">Revoke</button> }
              </td>
            </tr>
          } @empty { <tr><td colspan="6" class="empty">No declarations. Propose one when a hazard exceeds local coping capacity (s.3).</td></tr> }
        </tbody>
      </table>
    </dmis-panel>

    @if (detail(); as x) {
      <div class="drawer-back" (click)="detail.set(null)">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-head"><b>{{ x.type_label }}</b><button class="btn-sm b-outline" (click)="detail.set(null)">✕</button></div>
          <div class="drawer-body">
            <p style="font-size:0.84rem"><b>Authority:</b> {{ x.authority }} · {{ x.legal_basis }}<br>
              <b>Area:</b> {{ x.area_scope }}<br>
              <b>Hazard:</b> {{ x.hazard ?? '—' }}<br>
              @if (x.gazette_reference) { <b>Gazette:</b> {{ x.gazette_reference }}<br> }
              @if (x.effective_from) { <b>Effective:</b> {{ x.effective_from }} → {{ x.effective_until ?? 'further notice' }} }</p>
            @if (x.justification) { <p style="font-size:0.8rem; color:#475569"><b>Justification:</b> {{ x.justification }}</p> }
            <h4 style="font-size:0.74rem; text-transform:uppercase; color:#475569; margin:14px 0 6px">Chain journal</h4>
            @for (e of x.events; track e.id) {
              <div class="ev"><b>{{ e.action.replace('_', ' ') }}</b> — {{ e.actor_role }}
                @if (e.note) { <br><span style="color:#6c757d">{{ e.note }}</span> }
                <br><small style="color:#94a3b8">{{ e.created_at?.substring(0, 16)?.replace('T', ' ') }} · {{ e.user_name ?? 'System' }}</small></div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DeclarationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly declarations = signal<any[]>([]);
  readonly stats = signal<any>({});
  readonly detail = signal<any | null>(null);

  readonly chainSteps = [
    { key: 'proposed', label: 'Proposed', i: 0 },
    { key: 'technical_review', label: 'Technical', i: 1 },
    { key: 'steering_endorsed', label: 'Steering', i: 2 },
    { key: 'declared', label: 'Declared', i: 3 },
  ];

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
  }

  load(): void {
    this.http.get<any>('/api/v1/response/declarations').subscribe(d => {
      this.declarations.set(d.declarations);
      this.stats.set(d.stats);
    });
  }

  chainIndex(status: string): number {
    const m: Record<string, number> = { proposed: 0, technical_review: 1, steering_endorsed: 2, declared: 3 };
    return m[status] ?? -1;
  }

  open(id: number): void {
    this.http.get<any>(`/api/v1/response/declarations/${id}`).subscribe(d => this.detail.set(d.declaration));
  }

  propose(): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Propose a declaration',
      html: `<select id="dt" class="swal2-select" style="width:90%">
               <option value="disaster_area">Disaster Area (Minister, s.32)</option>
               <option value="state_of_emergency">State of Emergency (President, s.33)</option></select>
             <input id="area" class="swal2-input" placeholder="Area scope (e.g. Mtwara and Lindi regions)">
             <input id="hz" class="swal2-input" placeholder="Hazard (optional)">
             <textarea id="just" class="swal2-textarea" placeholder="Justification (s.3 — exceeds local coping capacity)"></textarea>`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Propose',
      preConfirm: () => {
        const area = (document.getElementById('area') as HTMLInputElement).value.trim();
        if (!area) { Swal.showValidationMessage('Area scope is required'); return false; }
        return {
          declaration_type: (document.getElementById('dt') as HTMLSelectElement).value,
          area_scope: area,
          hazard: (document.getElementById('hz') as HTMLInputElement).value || null,
          justification: (document.getElementById('just') as HTMLTextAreaElement).value || null,
        };
      },
    }).then((r: any) => { if (r.isConfirmed) { this.post('/api/v1/response/declarations', r.value); } }));
  }

  act(id: number, action: string, title: string): void {
    ensureSweetAlert().then(() => Swal.fire({
      title, icon: 'question', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'textarea', inputLabel: 'Note (optional)',
    }).then((r: any) => { if (r.isConfirmed) { this.post(`/api/v1/response/declarations/${id}/${action}`, { note: r.value || null }); } }));
  }

  declare(x: any): void {
    const disasterArea = x.declaration_type === 'disaster_area';
    ensureSweetAlert().then(() => Swal.fire({
      title: disasterArea ? 'Minister declares Disaster Area (s.32)?' : 'President proclaims State of Emergency (s.33)?',
      html: disasterArea
        ? `<input id="gz" class="swal2-input" placeholder="Government Gazette reference (e.g. GN No. 412 of 2026)">
           <p style="font-size:0.78rem;color:#6c757d">Directs the NDPRP for the area for up to 3 months (extendable).</p>`
        : `<input id="eu" type="date" class="swal2-input" title="Effective until">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Declare',
      preConfirm: () => disasterArea
        ? { gazette_reference: (document.getElementById('gz') as HTMLInputElement).value || null }
        : { effective_until: (document.getElementById('eu') as HTMLInputElement).value || null },
    }).then((r: any) => { if (r.isConfirmed) { this.post(`/api/v1/response/declarations/${x.id}/declare`, r.value); } }));
  }

  extend(x: any): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Extend this declaration (s.32)?',
      html: `<input id="eu" type="date" class="swal2-input" title="Effective until" value="${x.effective_until ?? ''}">
             <p style="font-size:0.78rem;color:#6c757d">A Disaster Area may be extended for a further period (s.32).</p>`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Extend',
      preConfirm: () => {
        const until = (document.getElementById('eu') as HTMLInputElement).value;
        if (!until) { Swal.showValidationMessage('A new effective-until date is required'); return false; }
        return { effective_until: until };
      },
    }).then((r: any) => { if (r.isConfirmed) { this.post(`/api/v1/response/declarations/${x.id}/extend`, r.value); } }));
  }

  revoke(id: number): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Revoke / lift this declaration?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'textarea', inputLabel: 'Reason (required)',
      inputValidator: (v: string) => (!v?.trim() ? 'A reason is required' : null),
    }).then((r: any) => { if (r.isConfirmed) { this.post(`/api/v1/response/declarations/${id}/revoke`, { reason: r.value }); } }));
  }

  private post(url: string, body: any): void {
    this.http.post<any>(url, body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Done', text: r.message, timer: 2400, showConfirmButton: false }).then(() => this.load())),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'An error occurred.', 'error')),
    });
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') { return Promise.resolve(); }
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
