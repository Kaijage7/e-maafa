import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'page-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="min-height:70vh;display:flex;align-items:center;justify-content:center;padding:2rem;">
      <div style="max-width:560px;text-align:center;">
        <div style="font-size:3.2rem;color:#475569;margin-bottom:0.7rem;"><i class="fas fa-map-signs"></i></div>
        <h1 style="font-weight:800;color:var(--text-primary,#2C3E50);margin:0 0 0.5rem;">Page not found</h1>
        <p style="color:var(--text-secondary,#64748b);font-size:1.02rem;line-height:1.6;">
          This DMIS page is not registered for your current application build.
        </p>
        <div style="margin-top:1.4rem;display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap;">
          <a routerLink="/home" class="btn-add" style="text-decoration:none;"><i class="fas fa-home"></i> Back to my modules</a>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundComponent {
  constructor() {
    document.documentElement.style.setProperty('--module-color', '#003366');
  }
}
