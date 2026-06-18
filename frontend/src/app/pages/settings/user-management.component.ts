import { HttpClient } from '@angular/common/http';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface User {
  id: number; name: string; email: string; roles: string; roleList: string[];
  emailVerifiedAt: string | null; createdAt: string;
}

/**
 * System Settings → User Management. Administers accounts and their SRS roles — the access-control
 * front door (roles drive the module hub and every @PreAuthorize check). Passwords are BCrypt-hashed
 * by the backend; the last Super Admin cannot be stripped or deleted (a lockout rail).
 */
@Component({
  selector: 'page-user-management',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="User Management" icon="fa-users"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'User Management'}]">
      <button class="btn-add" type="button" (click)="openCreate()"><i class="fas fa-user-plus"></i> Add User</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Users" icon="fa-users" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['superAdmins'] ?? 0" label="Super Admins" icon="fa-user-shield" color="#dc2626" />
      <dmis-stat-card [value]="stats()['verified'] ?? 0" label="Verified" icon="fa-circle-check" color="#059669" />
    </div>

    <div class="panel-row">
      <dmis-panel title="System users" icon="fa-database" [badge]="users().length + ' users'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <input class="form-control" style="max-width:240px;" placeholder="Search name / email…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <select class="form-select" style="max-width:200px;" [(ngModel)]="fRole" (change)="reload()">
            <option value="">All roles</option>
            @for (r of roles(); track r) { <option [value]="r">{{ r }}</option> }
          </select>
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Verified</th><th>Created</th><th></th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr class="data-row">
                  <td class="r-title">{{ u.name }}</td>
                  <td style="font-size:0.84rem;color:var(--text-mid);">{{ u.email }}</td>
                  <td>
                    @for (r of u.roleList; track r) { <span class="role-chip">{{ r }}</span> }
                    @if (!u.roleList.length) { <span style="color:var(--text-light);font-size:0.8rem;">no roles</span> }
                  </td>
                  <td>@if (u.emailVerifiedAt) { <i class="fas fa-circle-check" style="color:#059669;"></i> } @else { <i class="fas fa-circle" style="color:#cbd5e1;"></i> }</td>
                  <td style="font-size:0.8rem;color:var(--text-light);">{{ u.createdAt }}</td>
                  <td style="text-align:right;white-space:nowrap;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + u.name" (click)="toggleMenu(u.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === u.id">
                        <a class="ctx-item" (click)="openEdit(u)"><i class="fas fa-pen"></i> Edit</a>
                        <a class="ctx-item warning" (click)="resetPassword(u)"><i class="fas fa-key"></i> Reset password</a>
                        <a class="ctx-item danger" (click)="remove(u)"><i class="fas fa-trash"></i> Delete</a>
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:2rem;">No users match.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-user me-2"></i>{{ editId ? 'Edit user' : 'New user' }}</h5>
          <label class="f-lbl">Full name <span class="text-danger">*</span></label>
          <input class="form-control" [(ngModel)]="m.name">
          <label class="f-lbl">Email <span class="text-danger">*</span></label>
          <input class="form-control" type="email" [(ngModel)]="m.email">
          @if (!editId) {
            <label class="f-lbl">Password <span class="text-danger">*</span></label>
            <input class="form-control" type="text" [(ngModel)]="m.password" placeholder="min 6 characters">
          }
          <label class="f-lbl">Roles</label>
          <div class="roles-grid">
            @for (r of roles(); track r) {
              <label class="role-opt">
                <input type="checkbox" [checked]="selectedRoles().includes(r)" (change)="toggleRole(r)"> {{ r }}
              </label>
            }
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!canSave() || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ editId ? 'Save changes' : 'Create user' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size:0.68rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-light); display:block; margin:0.7rem 0 3px; }
    .role-chip { font-size:0.66rem; font-weight:700; background:rgba(13,110,253,0.1); color:#0d6efd; border-radius:7px; padding:1px 8px; margin:0 4px 2px 0; display:inline-block; }
    .ctx-menu { position:absolute; top:100%; right:0; }
    .roles-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:0.3rem 0.8rem; margin-top:4px; }
    .role-opt { font-size:0.82rem; display:flex; align-items:center; gap:6px; cursor:pointer; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:flex-start; justify-content:center; padding:6vh 1rem; }
    .modal-card { background:var(--card-bg,#fff); border-radius:16px; max-width:560px; width:100%; padding:1.4rem 1.5rem; }
    .btn-cancel { border:1px solid var(--border); background:#fff; border-radius:9px; padding:0.5rem 1rem; cursor:pointer; }
  `],
})
export class UserManagementComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/settings/users';

  users = signal<User[]>([]);
  roles = signal<string[]>([]);
  stats = signal<Record<string, number>>({});
  formOpen = signal(false);
  saving = signal(false);
  selectedRoles = signal<string[]>([]);
  openMenu = signal<number | null>(null);

  fSearch = ''; fRole = '';
  editId: number | null = null;
  m: any = {};

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    if (this.fRole) { q.set('role', this.fRole); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.users.set(r.users);
      this.roles.set(r.roles);
      this.stats.set(r.stats);
    });
  }

  canSave(): boolean {
    return !!this.m.name?.trim() && !!this.m.email?.trim() && (!!this.editId || !!this.m.password?.trim());
  }

  toggleRole(r: string): void {
    this.selectedRoles.update(list => list.includes(r) ? list.filter(x => x !== r) : [...list, r]);
  }

  openCreate(): void {
    this.editId = null; this.m = {}; this.selectedRoles.set([]);
    this.formOpen.set(true);
  }

  openEdit(u: User): void {
    this.editId = u.id; this.m = { name: u.name, email: u.email };
    this.selectedRoles.set([...u.roleList]);
    this.formOpen.set(true);
  }

  save(): void {
    this.saving.set(true);
    if (this.editId) {
      // update name/email, then replace roles
      this.http.put(`${this.base}/${this.editId}`, { name: this.m.name, email: this.m.email }).subscribe({
        next: () => this.http.put(`${this.base}/${this.editId}/roles`, { roles: this.selectedRoles() }).subscribe({
          next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
          error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not update roles.'); this.reload(); },
        }),
        error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not update the user.'); },
      });
    } else {
      this.http.post(this.base, {
        name: this.m.name, email: this.m.email, password: this.m.password, roles: this.selectedRoles(),
      }).subscribe({
        next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
        error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not create the user.'); },
      });
    }
  }

  resetPassword(u: User): void {
    const pw = prompt(`Set a new password for ${u.name} (min 6 characters):`);
    if (!pw) { return; }
    this.http.post(`${this.base}/${u.id}/password`, { password: pw }).subscribe({
      next: () => alert('Password reset.'),
      error: err => alert(err?.error?.detail ?? 'Could not reset the password.'),
    });
  }

  remove(u: User): void {
    if (!confirm(`Delete the account "${u.name}" (${u.email})?`)) { return; }
    this.http.delete(`${this.base}/${u.id}`).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.error?.detail ?? 'Could not delete the user.'),
    });
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
