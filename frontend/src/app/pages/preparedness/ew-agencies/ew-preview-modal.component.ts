import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';

/**
 * Professional bulletin preview — embeds the generated PDF inline (no popup blocker) and frames it as a
 * DRAFT the analyst can still edit: Edit (back to the console), Download, or Push to EOCC to commit.
 */
@Component({
  selector: 'ew-preview-modal',
  standalone: true,
  styles: [`
    .pm-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(2px); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .pm-panel { width: min(960px, 96vw); height: min(92vh, 1000px); background: #fff; border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.35); display: flex; flex-direction: column; overflow: hidden; }
    .pm-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #e8ebf0; background: #f8fafc; }
    .pm-head .ic { width: 36px; height: 36px; border-radius: 9px; background: #003366; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
    .pm-head b { font-size: 0.95rem; color: #14303a; display: block; line-height: 1.2; }
    .pm-head .sub { font-size: 0.74rem; color: #64748b; }
    .pm-x { margin-left: auto; border: none; background: #eef2f7; color: #475569; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 0.95rem; }
    .pm-x:hover { background: #e2e8f0; }
    .pm-frame { flex: 1; width: 100%; border: none; background: #525659; }
    .pm-foot { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-top: 1px solid #e8ebf0; background: #fff; }
    .pm-note { font-size: 0.76rem; color: #64748b; margin-right: auto; }
    .pm-btn { display: inline-flex; align-items: center; gap: 7px; font-size: 0.82rem; font-weight: 700; border-radius: 9px; padding: 9px 16px; cursor: pointer; font-family: inherit; text-decoration: none; border: 1px solid transparent; }
    .pm-btn.ghost { background: #fff; color: #1f2d3d; border-color: #cbd5e1; }
    .pm-btn.ghost:hover { background: #f1f5f9; }
    .pm-btn.primary { background: #4527a0; color: #fff; }
    .pm-btn.primary:hover { background: #3a1f8a; }
  `],
  template: `
    <div class="pm-backdrop" (click)="close.emit()">
      <div class="pm-panel" (click)="$event.stopPropagation()">
        <div class="pm-head">
          <div class="ic"><i class="fas fa-file-pdf"></i></div>
          <div><b>{{ title }}</b><span class="sub">Draft preview — review it, edit and regenerate as needed, then push to the EOCC.</span></div>
          <button class="pm-x" (click)="close.emit()" title="Close (keep editing)"><i class="fas fa-times"></i></button>
        </div>
        <iframe class="pm-frame" [src]="url" title="Bulletin preview"></iframe>
        <div class="pm-foot">
          <span class="pm-note"><i class="fas fa-circle-info"></i> This is not final — your inputs stay editable.</span>
          <button class="pm-btn ghost" (click)="close.emit()"><i class="fas fa-pen"></i> Edit</button>
          <a class="pm-btn ghost" [href]="rawUrl" [attr.download]="file"><i class="fas fa-download"></i> Download</a>
          <button class="pm-btn primary" (click)="push.emit()"><i class="fas fa-tower-broadcast"></i> {{ pushLabel }}</button>
        </div>
      </div>
    </div>
  `,
})
export class EwPreviewModalComponent {
  @Input() title = 'Bulletin Preview';
  @Input() url!: SafeResourceUrl;     // sanitized blob URL for the iframe
  @Input() rawUrl = '';               // raw blob URL for download
  @Input() file = 'bulletin.pdf';
  @Input() pushLabel = 'Push to EOCC';
  @Output() close = new EventEmitter<void>();
  @Output() push = new EventEmitter<void>();
}
