import { Component } from '@angular/core';

/** Fixed full-screen government emblem watermark — exact reproduction of components/dmis/watermark.blade.php. */
@Component({
  selector: 'app-watermark',
  standalone: true,
  template: `
    <div class="bg-watermark">
      <svg viewBox="0 0 600 660" xmlns="http://www.w3.org/2000/svg" style="width:680px;height:720px;opacity:0.11;">
        <defs>
          <path id="topArc" d="M 78,300 A 222,222 0 0,1 522,300"/>
          <path id="bottomArc" d="M 70,300 A 230,230 0 0,0 530,300"/>
        </defs>
        <circle cx="300" cy="300" r="250" fill="none" stroke="#003366" stroke-width="3"/>
        <circle cx="300" cy="300" r="210" fill="none" stroke="#003366" stroke-width="1.5"/>
        <circle cx="50" cy="300" r="5" fill="#003366"/>
        <circle cx="550" cy="300" r="5" fill="#003366"/>
        <image href="images/emblem.png" x="160" y="160" width="280" height="280"/>
        <text><textPath href="#topArc" startOffset="50%" text-anchor="middle" fill="#003366" font-size="19" font-weight="900" font-family="Inter,sans-serif" letter-spacing="3">JAMHURI YA MUUNGANO WA TANZANIA</textPath></text>
        <text><textPath href="#bottomArc" startOffset="50%" text-anchor="middle" fill="#003366" font-size="16" font-weight="800" font-family="Inter,sans-serif" letter-spacing="2">OFISI YA WAZIRI MKUU</textPath></text>
        <text x="300" y="585" text-anchor="middle" fill="#003366" font-size="22" font-weight="800" font-family="Inter,sans-serif" letter-spacing="2">MFUMO WA TAARIFA ZA USIMAMIZI WA MAAFA</text>
      </svg>
    </div>
  `,
})
export class WatermarkComponent {}
