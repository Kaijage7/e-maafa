import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Entity tasking inbox — the entity side of the scanner-dispatch round trip. Dropped into each agency
 * console: the entity RECEIVES a tasking dispatched to it (with the operator's source/urgency/instruction),
 * ACKNOWLEDGES it, WORKS on it (issues its official assessment), and RE-SENDS it for EOCC review. If EOCC
 * RETURNS it, the return note shows here and the entity revises & re-sends. All native e-MAAFA — no INFORM code.
 */
@Component({
  selector: 'dmis-entity-taskings',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    @if (open().length) {
      <div class="et-box">
        <div class="et-hd"><i class="fas fa-inbox"></i> Scanner tasking inbox <span class="et-n">{{ open().length }}</span>
          <span class="et-sub">— verify each signal and issue your official assessment; EOCC then accepts (→ Impact Analysis) or returns it</span></div>
        @for (t of open(); track t.id) {
          <div class="et-row" [class.ret]="t.status==='returned'">
            <div class="et-main">
              <span class="et-st" [attr.data-s]="t.status">{{ statusLabel(t.status) }}</span>
              @if (t.urgency) { <span class="et-urg" [class.imm]="t.urgency==='Immediate'">{{ t.urgency }}</span> }
              <span class="et-hz">{{ t.hazard_type }}</span>
              @if (t.region) { <span class="et-rg"><i class="fas fa-location-dot"></i> {{ t.region }}</span> }
              <a class="et-ti" [href]="t.url" target="_blank" rel="noopener">{{ t.title }}</a>
              <span class="et-tm">{{ t.requested_at | date:'dd MMM, HH:mm' }}</span>
            </div>
            @if (t.source) { <div class="et-meta">Source: <b>{{ t.source }}</b></div> }
            @if (t.instruction) { <div class="et-instr"><i class="fas fa-quote-left"></i> {{ t.instruction }}</div> }
            @if (t.status==='returned' && t.review_note) { <div class="et-retn"><i class="fas fa-rotate-left"></i> Returned by EOCC: {{ t.review_note }}</div> }
            @if (t.status==='responded') {
              <div class="et-sent"><i class="fas fa-clock"></i> Assessment submitted — awaiting EOCC review.
                @if (t.response_message) { <span class="et-asm"><b>{{ t.response_severity }}</b> — {{ t.response_message }}</span> }</div>
            } @else {
              <div class="et-actions">
                @if (t.status==='awaiting') { <button class="et-ack" (click)="acknowledge(t)"><i class="fas fa-eye"></i> Acknowledge</button> }
                <button class="et-resp" (click)="openForm(t)"><i class="fas fa-file-pen"></i> {{ t.status==='returned' ? 'Revise & re-send' : 'Issue assessment' }}</button>
              </div>
            }
            @if (formFor() === t.id) {
              <div class="et-form">
                <div class="et-frow">
                  <div><label>Assessed severity</label><select [(ngModel)]="fSeverity">@for (s of sevOpts; track s) { <option [value]="s">{{ s }}</option> }</select></div>
                  <div><label>Reference / bulletin (optional)</label><input [ngModel]="fAttachment()" (ngModelChange)="fAttachment.set($event)" placeholder="e.g. WRN-2026-014"></div>
                </div>
                <label>Official assessment</label>
                <textarea [ngModel]="fMessage()" (ngModelChange)="fMessage.set($event)" placeholder="Your verified assessment of the signal…"></textarea>
                <label>Recommended action (optional)</label>
                <textarea [ngModel]="fAction()" (ngModelChange)="fAction.set($event)" placeholder="What should be done / advised…"></textarea>
                <div class="et-fact">
                  <button class="et-cancel" (click)="formFor.set(null)">Cancel</button>
                  <button class="et-send" [disabled]="!fMessage().trim() || saving()" (click)="submit(t)">
                    <i class="fas" [class.fa-paper-plane]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Send to EOCC</button>
                </div>
              </div>
            }
          </div>
        }
        @if (flash()) { <div class="et-flash" [class.err]="flash()!.err">{{ flash()!.msg }}</div> }
      </div>
    }
  `,
  styles: [`
    .et-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:0.7rem 0.9rem; margin:0.3rem 0 0.9rem; }
    .et-hd { font-size:0.86rem; font-weight:800; color:#166534; display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.3rem; }
    .et-n { font-size:0.62rem; background:#16a34a; color:#fff; border-radius:20px; padding:0.1rem 0.55rem; }
    .et-sub { font-weight:500; font-size:0.7rem; color:#15803d; }
    .et-row { border-top:1px solid #dcfce7; padding:0.5rem 0; }
    .et-row.ret { background:#fff1f2; border-radius:8px; padding:0.5rem 0.6rem; }
    .et-main { display:flex; align-items:center; gap:0.55rem; flex-wrap:wrap; }
    .et-st { font-size:0.6rem; font-weight:800; text-transform:uppercase; border-radius:6px; padding:0.08rem 0.45rem; color:#475569; background:#e2e8f0; }
    .et-st[data-s=awaiting] { color:#92400e; background:#fef3c7; } .et-st[data-s=acknowledged] { color:#1d4ed8; background:#dbeafe; }
    .et-st[data-s=returned] { color:#9f1239; background:#ffe4e6; } .et-st[data-s=responded] { color:#166534; background:#dcfce7; }
    .et-urg { font-size:0.58rem; font-weight:800; text-transform:uppercase; color:#9a3412; background:#ffedd5; border-radius:6px; padding:0.08rem 0.4rem; }
    .et-urg.imm { color:#fff; background:#dc2626; }
    .et-hz { font-size:0.7rem; font-weight:700; color:#334155; text-transform:capitalize; }
    .et-rg { font-size:0.7rem; color:#475569; }
    .et-ti { font-size:0.8rem; color:#1e293b; text-decoration:none; flex:1; min-width:140px; } .et-ti:hover { text-decoration:underline; }
    .et-tm { font-size:0.68rem; color:#94a3b8; }
    .et-meta { font-size:0.7rem; color:#64748b; margin-top:0.2rem; }
    .et-instr { font-size:0.76rem; color:#334155; background:#fff; border:1px dashed #cbd5e1; border-radius:7px; padding:0.3rem 0.5rem; margin-top:0.3rem; }
    .et-instr i, .et-retn i { color:#94a3b8; margin-right:4px; }
    .et-retn { font-size:0.76rem; color:#9f1239; margin-top:0.3rem; font-weight:600; }
    .et-sent { font-size:0.76rem; color:#166534; margin-top:0.35rem; } .et-sent i { margin-right:4px; }
    .et-asm { display:block; color:#334155; margin-top:0.15rem; } .et-asm b { color:#166534; }
    .et-actions { display:flex; gap:0.4rem; margin-top:0.4rem; }
    .et-ack { font-size:0.72rem; font-weight:700; border:1px solid #93c5fd; background:#fff; color:#1d4ed8; border-radius:7px; padding:0.25rem 0.7rem; cursor:pointer; }
    .et-resp { font-size:0.72rem; font-weight:800; border:none; background:#16a34a; color:#fff; border-radius:7px; padding:0.25rem 0.8rem; cursor:pointer; }
    .et-form { background:#fff; border:1px solid #d1fae5; border-radius:9px; padding:0.6rem 0.7rem; margin-top:0.5rem; }
    .et-frow { display:grid; grid-template-columns:1fr 1fr; gap:0.6rem; }
    .et-form label { display:block; font-size:0.62rem; font-weight:800; color:#94a3b8; text-transform:uppercase; margin:0.4rem 0 0.15rem; }
    .et-form select, .et-form input, .et-form textarea { width:100%; box-sizing:border-box; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:7px; padding:0.35rem 0.5rem; font-family:inherit; }
    .et-form textarea { min-height:44px; resize:vertical; }
    .et-fact { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.6rem; }
    .et-cancel { background:#fff; border:1px solid #cbd5e1; color:#475569; border-radius:7px; padding:0.35rem 0.9rem; font-weight:700; font-size:0.78rem; cursor:pointer; }
    .et-send { background:#0d3b66; color:#fff; border:none; border-radius:7px; padding:0.35rem 1rem; font-weight:700; font-size:0.78rem; cursor:pointer; } .et-send:disabled { opacity:0.5; cursor:default; }
    .et-flash { margin-top:0.5rem; font-size:0.78rem; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:8px; padding:0.4rem 0.7rem; }
    .et-flash.err { background:#fef2f2; color:#991b1b; border-color:#fecaca; }
  `],
})
export class EntityTaskingsComponent implements OnInit {
  agency = input.required<string>();
  private http = inject(HttpClient);

  taskings = signal<any[]>([]);
  open = computed(() => this.taskings().filter(t => t.status !== 'accepted'));
  formFor = signal<number | null>(null);
  fSeverity = signal('Moderate'); fMessage = signal(''); fAction = signal(''); fAttachment = signal('');
  saving = signal(false);
  flash = signal<{ msg: string; err: boolean } | null>(null);
  sevOpts = ['Minor', 'Moderate', 'Major', 'Critical'];

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.http.get<any>(`/api/v1/ew/scanner/entity-taskings?agency=${this.agency()}`)
      .subscribe({ next: r => this.taskings.set(r.taskings ?? []), error: () => { /* console offline-tolerant */ } });
  }
  statusLabel(s: string): string {
    return ({ awaiting: 'New', acknowledged: 'In progress', returned: 'Returned', responded: 'Submitted', accepted: 'Accepted' } as Record<string, string>)[s] ?? s;
  }
  acknowledge(t: any): void {
    this.http.post<any>(`/api/v1/ew/scanner/taskings/${t.id}/acknowledge`, {})
      .subscribe({ next: () => this.load(), error: () => this.note('Could not acknowledge.', true) });
  }
  openForm(t: any): void {
    this.formFor.set(t.id);
    this.fSeverity.set(t.response_severity ?? 'Moderate');
    this.fMessage.set(t.response_message ?? '');
    this.fAction.set(t.response_action ?? '');
    this.fAttachment.set(t.response_attachment ?? '');
  }
  submit(t: any): void {
    if (!this.fMessage().trim()) { return; }
    this.saving.set(true);
    this.http.post<any>(`/api/v1/ew/scanner/taskings/${t.id}/respond`, {
      response_severity: this.fSeverity(), response_message: this.fMessage().trim(),
      response_action: this.fAction().trim() || null, response_attachment: this.fAttachment().trim() || null,
    }).subscribe({
      next: r => {
        this.saving.set(false);
        if (r?.success) { this.note('Assessment sent to EOCC for review.', false); this.formFor.set(null); this.load(); }
        else { this.note(r?.message || 'Could not send.', true); }
      },
      error: e => { this.saving.set(false); this.note(e?.error?.detail ?? e?.error?.message ?? 'Could not send.', true); },
    });
  }
  private note(msg: string, err: boolean): void {
    this.flash.set({ msg, err });
    setTimeout(() => this.flash.set(null), 4000);
  }
}
