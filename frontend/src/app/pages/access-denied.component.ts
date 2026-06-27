import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

/** Shown when a signed-in user opens a module/screen their role is not permitted to access. */
@Component({
  selector: 'page-access-denied',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="min-height:70vh;display:flex;align-items:center;justify-content:center;padding:2rem;">
      <div style="max-width:520px;text-align:center;">
        <div style="font-size:3.4rem;color:#dc2626;margin-bottom:0.6rem;"><i class="fas fa-lock"></i></div>
        <h1 style="font-weight:800;color:var(--text-primary,#2C3E50);margin:0 0 0.5rem;">Access denied</h1>
        <p style="color:var(--text-secondary,#64748b);font-size:1.02rem;line-height:1.6;">
          Your role{{ roleLabel() }} does not have access to this area of e-MAAFA.
          If you need it, ask a System Administrator to grant the permission in
          <strong>User Management → Roles &amp; Permissions</strong>.
        </p>
        <div style="margin-top:1.4rem;display:flex;gap:0.6rem;justify-content:center;">
          <a routerLink="/home" class="btn-add" style="text-decoration:none;"><i class="fas fa-home"></i> Back to my modules</a>
        </div>
      </div>
    </div>
  `,
})
export class AccessDeniedComponent {
  private auth = inject(AuthService);
  roleLabel(): string {
    const roles = this.auth.user()?.roles ?? [];
    return roles.length ? ' (' + roles.join(', ') + ')' : '';
  }
}
