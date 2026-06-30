import { Component } from '@angular/core';
import { qrcodegen } from '../../shared/qrcodegen';
import { PageHeaderComponent } from '../../shell/page-header.component';

interface Action { key: string; title: string; desc: string; icon: string; color: string; path: string; }
const ACTIONS: Action[] = [
  { key: 'register', title: 'Register as a Partner', icon: 'fa-handshake', color: '#0d3b66', path: '/register-partner',
    desc: 'Organizations scan to self-register as a stakeholder. They get a confirmation SMS and PMO verifies them.' },
  { key: 'report', title: 'Report a Hazard', icon: 'fa-triangle-exclamation', color: '#dc2626', path: '/',
    desc: 'Citizens scan to open the portal and report a hazard from their phone — no login.' },
  { key: 'subscribe', title: 'Subscribe to Alerts', icon: 'fa-bell', color: '#d97706', path: '/subscribe',
    desc: 'Citizens scan to subscribe to early-warning SMS alerts for their area.' },
];

/**
 * QR Outreach — generates printable QR codes (in-system, no external service) that open the public
 * Register / Report / Subscribe pages. Codes encode the CURRENT origin, so the same page yields the
 * right links whether served locally or from the live domain. Print them for posters, banners, ID cards.
 */
@Component({
  selector: 'page-qr-outreach',
  standalone: true,
  imports: [PageHeaderComponent],
  styles: [`
    .qr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1.1rem; margin-top:.4rem; }
    .qr-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1.3rem; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,.05); }
    .qr-card svg { width:210px; height:210px; }
    .qr-title { font-weight:800; font-size:1.02rem; margin-bottom:.5rem; }
    .qr-url { font-size:.72rem; color:#64748b; word-break:break-all; margin-top:.55rem; font-family:monospace; }
    .qr-desc { font-size:.76rem; color:#94a3b8; margin-top:.35rem; }
    @media print {
      .no-print { display:none !important; }
      .qr-card { break-inside:avoid; box-shadow:none; border:1px solid #d1d5db; }
      .qr-grid { grid-template-columns:1fr 1fr; }
    }
  `],
  template: `
    <dmis-page-header title="QR Outreach" icon="fa-qrcode"
      [breadcrumbs]="[{label:'Home',url:'/home'},{label:'Content Management'},{label:'QR Outreach'}]">
      <button class="btn-add no-print" type="button" (click)="print()"><i class="fas fa-print"></i> Print</button>
    </dmis-page-header>
    <div class="panel-row"><div style="padding:0 0 1.2rem;">
      <p class="no-print" style="color:var(--text-mid);font-size:.88rem;max-width:48rem;">
        Print these and display them on posters, banners, ID cards and at events — anyone scans with a phone
        camera to open the service (no app needed). The codes point at <b>{{ origin }}</b> and will
        automatically encode your live domain once the platform is deployed there.
      </p>
      <div class="qr-grid">
        @for (q of qrs; track q.key) {
          <div class="qr-card">
            <div class="qr-title" [style.color]="q.color"><i class="fas {{ q.icon }} me-1"></i> {{ q.title }}</div>
            <svg [attr.viewBox]="q.vb" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
              <rect x="-4" y="-4" [attr.width]="q.n + 8" [attr.height]="q.n + 8" fill="#ffffff"/>
              @for (m of q.dark; track $index) { <rect [attr.x]="m[0]" [attr.y]="m[1]" width="1.02" height="1.02" [attr.fill]="q.color"/> }
            </svg>
            <div class="qr-url">{{ q.url }}</div>
            <button class="no-print" type="button" (click)="download(q)"
                    style="margin-top:.65rem;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:.4rem 1rem;font-size:.8rem;font-weight:700;cursor:pointer;" [style.color]="q.color">
              <i class="fas fa-download me-1"></i> Download PNG
            </button>
            <div class="qr-desc no-print">{{ q.desc }}</div>
          </div>
        }
      </div>
    </div></div>
  `,
})
export class QrOutreachComponent {
  origin = window.location.origin;
  qrs = ACTIONS.map(a => {
    const url = this.origin + a.path;
    const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
    const n = qr.size;
    const dark: [number, number][] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.getModule(x, y)) { dark.push([x, y]); }
      }
    }
    return { ...a, url, n, dark, vb: `-4 -4 ${n + 8} ${n + 8}` };
  });

  print(): void { window.print(); }

  /** Render the QR matrix to a high-res PNG and download it (no external service). */
  download(q: { key: string; color: string; n: number; dark: [number, number][] }): void {
    const scale = 16, border = 4, px = (q.n + 2 * border) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = px; canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = q.color;
    for (const [x, y] of q.dark) {
      ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
    }
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `emaafa-qr-${q.key}.png`;
    a.click();
  }
}
