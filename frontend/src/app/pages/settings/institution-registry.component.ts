import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface InstitutionItem {
  kind: 'agency' | 'stakeholder';
  id: number;
  name: string;
  acronym: string | null;
  type: string | null;
  institution_class: string | null;
  institution_subclass: string | null;
  sector_tags: string | null;
  me_required: boolean;
  source_register: string | null;
  source_file: string | null;
  source_sheet: string | null;
  source_row: number | null;
  source_reference: string | null;
  policy_role_code: string | null;
  role_summary: string | null;
  is_active: boolean;
  contact_person_name?: string | null;
  contact_person_email?: string | null;
  contact_person_phone?: string | null;
  address?: string | null;
  website?: string | null;
}

interface PolicyRole {
  roleCode: string;
  actorLabelEn: string;
  actorLabelSw: string;
  institutionClass: string;
  sectorTags: string;
  responsibilityEn: string;
  defaultIndicatorCodes: string;
  sourceReference: string;
}

interface GlossaryTerm {
  termEn: string;
  termSw: string;
  definitionEn: string;
}

@Component({
    selector: 'page-institution-registry',
    imports: [RouterLink, PageHeaderComponent, PanelComponent, StatCardComponent],
    template: `
    <dmis-page-header title="Institution Registry" icon="fa-sitemap"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'Institution Registry'}]">
      @if (canManage()) {
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
          <button class="btn-add" type="button" (click)="openCreate('agency')">
            <i class="fas fa-plus"></i> Add agency / MDA
          </button>
          <button class="btn-add" type="button" style="background:#0f766e;" (click)="openCreate('stakeholder')">
            <i class="fas fa-plus"></i> Add partner
          </button>
        </div>
      }
    </dmis-page-header>

    <div class="honest-note">
      <strong>Registry note:</strong> Class totals are <em>active registry rows</em>, not a pure official gazette list.
      Use this screen to add, edit, remove (soft deactivate), restore, reclassify, and fix contacts.
      M&amp;E quarterly disaster reporting indicators apply to all institution classes (no class restriction).
    </div>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().agencies" label="Agencies / MDAs" icon="fa-landmark" color="#0d6efd" />
      <dmis-stat-card [value]="stats().governmentInstitutions || 0" label="Gov. institutions" icon="fa-building-columns" color="#0369a1" />
      <dmis-stat-card [value]="stats().ministries || 0" label="Ministries" icon="fa-flag" color="#7c3aed" />
      <dmis-stat-card [value]="stats().stakeholders" label="Partners / stakeholders" icon="fa-handshake" color="#198754" />
      <dmis-stat-card [value]="stats().meRequired" label="M&E required" icon="fa-chart-line" color="#0f766e" />
      <dmis-stat-card [value]="(stats().agencyIndicators || 0) + (stats().stakeholderIndicators || 0)" label="Role indicators" icon="fa-list-check" color="#b45309" />
    </div>

    <div class="path-grid">
      @for (p of reportingPaths(); track p['path']) {
        <div class="path-card">
          <div class="path-k">{{ p['titleEn'] }}</div>
          <div class="path-sw">{{ p['titleSw'] }}</div>
          <p><strong>Who:</strong> {{ p['who'] }}</p>
          <p><strong>Governed:</strong> {{ p['whereGoverned'] }}</p>
          <p><strong>Report M&amp;E:</strong> {{ p['whereReport'] }}</p>
          <div class="path-actions">
            <a class="btn-link" [routerLink]="routePath(p['routeRegistry'])" [queryParams]="routeQuery(p['routeRegistry'])">Open registry</a>
            <a class="btn-link primary" [routerLink]="routePath(p['routeWorkbench'])" [queryParams]="routeQuery(p['routeWorkbench'])">Open M&amp;E workbench</a>
          </div>
        </div>
      }
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search ministry, agency, UN, NGO…" [value]="search()" (input)="search.set($any($event.target).value); reload()">
      </div>
      <select [value]="kind()" (change)="kind.set($any($event.target).value); reload()">
        <option value="">All registries</option>
        <option value="agency">Agencies (MDAs)</option>
        <option value="stakeholder">Stakeholders (partners)</option>
      </select>
      <select [value]="klass()" (change)="klass.set($any($event.target).value); reload()">
        <option value="">All classes</option>
        @for (c of classOptions(); track c) { <option [value]="c">{{ c }}</option> }
      </select>
      <input class="form-control" style="max-width:210px;" placeholder="Sector tag" [value]="sector()" (input)="sector.set($any($event.target).value); reload()">
      <label class="checkline" style="white-space:nowrap;">
        <input type="checkbox" [checked]="includeInactive()" (change)="includeInactive.set($any($event.target).checked); reload()">
        Show removed
      </label>
    </div>

    <div class="seg-tabs">
      <button type="button" [class.active]="tab() === 'registry'" (click)="tab.set('registry')"><i class="fas fa-table"></i> Registry</button>
      <button type="button" [class.active]="tab() === 'breakdown'" (click)="tab.set('breakdown')"><i class="fas fa-layer-group"></i> Class breakdown</button>
      <button type="button" [class.active]="tab() === 'roles'" (click)="tab.set('roles')"><i class="fas fa-scale-balanced"></i> Policy Roles</button>
      <button type="button" [class.active]="tab() === 'glossary'" (click)="tab.set('glossary')"><i class="fas fa-language"></i> Glossary</button>
      <button type="button" [class.active]="tab() === 'duplicates'" (click)="tab.set('duplicates')"><i class="fas fa-code-merge"></i> Duplicates</button>
    </div>

    @if (tab() === 'registry') {
      <div class="panel-row" style="animation-delay:.25s;">
        <dmis-panel title="Governed Institutions" icon="fa-database" [badge]="items().length + ' shown'">
          <div class="panel-body" style="padding:0;">
            @if (items().length) {
              <div style="overflow-x:auto;">
                <table class="r-table">
                  <thead><tr><th>Institution</th><th>Class</th><th>Sector Tags</th><th>Source</th><th>M&E</th><th>Status</th>@if (canManage()) { <th>Actions</th> }</tr></thead>
                  <tbody>
                    @for (item of items(); track item.kind + ':' + item.id) {
                      <tr class="data-row" [style.opacity]="item.is_active === false ? '0.65' : '1'">
                        <td>
                          <div class="r-title">{{ item.name }}</div>
                          <div class="r-subtitle">
                            {{ item.kind === 'agency' ? 'MDA registry' : 'Partner registry' }}
                            {{ item.acronym ? ' · ' + item.acronym : '' }}
                            {{ item.type ? ' · ' + item.type : '' }}
                            {{ item.policy_role_code ? ' · ' + item.policy_role_code : '' }}
                          </div>
                          <div class="r-subtitle" style="color:#0f766e;">
                            M&amp;E path: {{ item.kind === 'agency' ? 'Workbench → Government institutions' : 'Workbench → Partners' }}
                          </div>
                        </td>
                        <td>
                          <span class="r-badge" style="background:rgba(15,118,110,0.1);color:#0f766e;">{{ item.institution_class || 'Unclassified' }}</span>
                          @if (item.institution_subclass) { <div class="r-subtitle" style="margin-top:0.25rem;">{{ item.institution_subclass }}</div> }
                        </td>
                        <td style="font-size:0.82rem;color:var(--text-mid);max-width:300px;">{{ item.sector_tags || '-' }}</td>
                        <td style="font-size:0.78rem;color:var(--text-mid);max-width:260px;">
                          <div>{{ item.source_register || '-' }}</div>
                          @if (item.source_file) { <div class="r-subtitle">{{ item.source_file }}{{ item.source_sheet ? ' / ' + item.source_sheet : '' }}</div> }
                        </td>
                        <td><span class="r-badge" [class.badge-approved]="item.me_required" [class.badge-pending]="!item.me_required">{{ item.me_required ? 'Required' : 'Optional' }}</span></td>
                        <td><span class="r-badge" [class.badge-approved]="item.is_active !== false" [class.badge-pending]="item.is_active === false">{{ item.is_active === false ? 'Removed' : 'Active' }}</span></td>
                        @if (canManage()) {
                          <td style="white-space:nowrap;">
                            <button class="icon-btn" type="button" title="Edit institution" (click)="openEditor(item, $event)"><i class="fas fa-sliders"></i></button>
                            @if (item.is_active !== false) {
                              <button class="icon-btn" type="button" title="Remove from registry" style="color:#b91c1c;margin-left:0.25rem;"
                                      (click)="removeInstitution(item, $event)"><i class="fas fa-trash-alt"></i></button>
                            } @else {
                              <button class="icon-btn" type="button" title="Restore institution" style="color:#0f766e;margin-left:0.25rem;"
                                      (click)="restoreInstitution(item, $event)"><i class="fas fa-undo"></i></button>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else { <div class="empty-state"><i class="fas fa-sitemap"></i>No institutions found.</div> }
          </div>
        </dmis-panel>
      </div>
    }

    @if (tab() === 'breakdown') {
      <dmis-panel title="Institutions by class (M&amp;E coverage)" icon="fa-layer-group" [badge]="classBreakdown().length + ' groups'">
        <div class="panel-body" style="padding:0;overflow-x:auto;">
          <table class="r-table">
            <thead><tr><th>Registry</th><th>Class</th><th>Total</th><th>M&amp;E required</th><th>With policy role</th></tr></thead>
            <tbody>
              @for (b of classBreakdown(); track b['kind'] + ':' + b['institutionClass']) {
                <tr class="data-row">
                  <td>{{ b['kind'] === 'agency' ? 'MDA / Agency' : 'Partner' }}</td>
                  <td><span class="r-badge" style="background:rgba(15,118,110,0.1);color:#0f766e;">{{ b['institutionClass'] || 'Unclassified' }}</span></td>
                  <td style="font-weight:800;">{{ b['total'] }}</td>
                  <td>{{ b['meRequired'] }}</td>
                  <td>{{ b['withPolicyRole'] }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty-state">No class breakdown yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    }

    @if (tab() === 'roles') {
      <div class="role-grid">
        @for (r of policyRoles(); track r.roleCode) {
          <div class="role-card">
            <div class="role-k">{{ r.actorLabelEn }}</div>
            <div class="role-sw">{{ r.actorLabelSw }}</div>
            <div class="role-tags">{{ r.institutionClass }} · {{ r.sectorTags }}</div>
            <p>{{ r.responsibilityEn }}</p>
            <div class="role-codes">{{ r.defaultIndicatorCodes }}</div>
          </div>
        }
      </div>
    }

    @if (tab() === 'glossary') {
      <div class="glossary-grid">
        @for (g of glossary(); track g.termEn) {
          <div class="glossary-row">
            <div><strong>{{ g.termEn }}</strong><span>{{ g.termSw }}</span></div>
            <p>{{ g.definitionEn }}</p>
          </div>
        }
      </div>
    }

    @if (tab() === 'duplicates') {
      <dmis-panel title="Duplicate Warnings" icon="fa-code-merge" [badge]="duplicates().length + ' groups'">
        <div class="panel-body">
          @if (duplicates().length) {
            @for (d of duplicates(); track d.normalized) {
              <div class="dup-row">
                <strong>{{ d.normalized }}</strong>
                <span>{{ d.total }} records</span>
                <p>{{ d.members }}</p>
              </div>
            }
          } @else { <div class="empty-state"><i class="fas fa-check-circle"></i>No duplicate warnings in the current registry.</div> }
        </div>
      </dmis-panel>
    }

    @if (editorOpen()) {
      <div class="modal-backdrop" (click)="editorOpen.set(false)">
        <div class="govern-modal wide" (click)="$event.stopPropagation()">
          <h5>{{ createMode() ? 'Add institution' : 'Edit institution' }} (System Settings)</h5>
          <div class="modal-sub">
            {{ createMode()
                ? (createKind() === 'agency' ? 'New MDA / Agency registry row' : 'New Partner / Stakeholder registry row')
                : ((selected()?.kind === 'agency' ? 'MDA / Agency registry' : 'Partner / Stakeholder registry')
                    + (selected()?.id ? ' · id ' + selected()?.id : '')) }}
            @if (!createMode() && selected()?.source_register) { · source: {{ selected()?.source_register }} }
          </div>
          @if (createMode()) {
            <label style="display:grid;gap:4px;font-size:0.72rem;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:0.6rem;">
              Registry
              <select class="form-control" [value]="createKind()" (change)="createKind.set($any($event.target).value)">
                <option value="agency">Agency / MDA</option>
                <option value="stakeholder">Stakeholder / Partner</option>
              </select>
            </label>
          }
          <div class="form-grid">
            <label class="wide">Official name
              <input class="form-control" [value]="fName()" (input)="fName.set($any($event.target).value)" placeholder="Name">
            </label>
            <label>Acronym
              <input class="form-control" [value]="fAcronym()" (input)="fAcronym.set($any($event.target).value)" placeholder="e.g. MoH, TMA">
            </label>
            <label>Record type
              <input class="form-control" [value]="fType()" (input)="fType.set($any($event.target).value)" placeholder="Government / NGO / International…">
            </label>
            <label>Institution class
              <select class="form-control" [value]="fClass()" (change)="fClass.set($any($event.target).value)">
                <option value="">—</option>
                @for (c of editClassOptions(); track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </label>
            <label>Subclass
              <input class="form-control" [value]="fSubclass()" (input)="fSubclass.set($any($event.target).value)">
            </label>
            <label>Sector tags
              <input class="form-control" [value]="fSectors()" (input)="fSectors.set($any($event.target).value)" placeholder="Health, Water/WASH…">
            </label>
            <label>Policy role code
              <input class="form-control" [value]="fRoleCode()" (input)="fRoleCode.set($any($event.target).value)" placeholder="POLICY_HEALTH">
            </label>
            <label>Contact person
              <input class="form-control" [value]="fContact()" (input)="fContact.set($any($event.target).value)">
            </label>
            <label>Contact email
              <input class="form-control" [value]="fEmail()" (input)="fEmail.set($any($event.target).value)">
            </label>
            <label>Contact phone
              <input class="form-control" [value]="fPhone()" (input)="fPhone.set($any($event.target).value)">
            </label>
            <label class="wide">Address
              <input class="form-control" [value]="fAddress()" (input)="fAddress.set($any($event.target).value)">
            </label>
            <label class="wide">Website
              <input class="form-control" [value]="fWebsite()" (input)="fWebsite.set($any($event.target).value)">
            </label>
          </div>
          <div class="check-row">
            <label class="checkline"><input type="checkbox" [checked]="fMeRequired()" (change)="fMeRequired.set($any($event.target).checked)"> M&amp;E required</label>
            @if (!createMode()) {
              <label class="checkline"><input type="checkbox" [checked]="fActive()" (change)="fActive.set($any($event.target).checked)"> Active</label>
            }
          </div>
          <textarea class="form-control" rows="3" placeholder="Role / mandate summary" [value]="fSummary()" (input)="fSummary.set($any($event.target).value)"></textarea>
          <textarea class="form-control" rows="2" placeholder="Source reference" [value]="fSourceReference()" (input)="fSourceReference.set($any($event.target).value)"></textarea>
          @if (error()) { <div class="error-line">{{ error() }}</div> }
          <div class="modal-actions">
            <button class="btn" type="button" (click)="editorOpen.set(false)">Cancel</button>
            @if (createMode()) {
              <button class="btn-add" type="button" [disabled]="saving() || !fName().trim()" (click)="createInstitution()">
                <i class="fas" [class.fa-plus]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Add institution
              </button>
            } @else {
              <button class="btn-add" type="button" [disabled]="saving() || !fName().trim()" (click)="saveProfile()">
                <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Save profile
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
    styles: [`
    .seg-tabs { display:flex; flex-wrap:wrap; gap:0.4rem; margin:0.8rem 0 1rem; }
    .seg-tabs button { border:1px solid var(--border); background:#fff; color:var(--text-mid); border-radius:6px; padding:0.45rem 0.75rem; font-weight:700; cursor:pointer; }
    .seg-tabs button.active { background:#003366; color:#fff; border-color:#003366; }
    .icon-btn { width:34px; height:34px; border:1px solid var(--border); border-radius:6px; background:#fff; color:#003366; cursor:pointer; }
    .role-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:0.75rem; }
    .role-card { border:1px solid var(--border); border-radius:8px; background:#fff; padding:0.9rem; }
    .role-k { font-weight:800; color:var(--text-dark); }
    .role-sw, .role-tags, .role-codes { font-size:0.78rem; color:var(--text-mid); margin-top:0.25rem; }
    .role-card p { font-size:0.84rem; color:var(--text-mid); margin:0.6rem 0; }
    .role-codes { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; color:#0f766e; }
    .glossary-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:0.65rem; }
    .glossary-row { border:1px solid var(--border); border-radius:8px; background:#fff; padding:0.75rem; }
    .glossary-row span { display:block; color:#0f766e; font-size:0.82rem; margin-top:0.2rem; }
    .glossary-row p, .dup-row p { color:var(--text-mid); font-size:0.82rem; margin:0.45rem 0 0; }
    .dup-row { border-bottom:1px solid var(--border); padding:0.75rem 0; }
    .dup-row span { margin-left:0.5rem; color:#b45309; font-size:0.8rem; font-weight:800; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:center; justify-content:center; padding:1rem; }
    .govern-modal { background:#fff; border-radius:8px; border:1px solid var(--border); max-width:720px; width:100%; padding:1.2rem; max-height:92vh; overflow:auto; }
    .govern-modal.wide { max-width:820px; }
    .govern-modal h5 { margin:0; font-weight:800; }
    .modal-sub { color:var(--text-mid); font-size:0.85rem; margin:0.2rem 0 0.9rem; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.65rem; }
    .form-grid label { display:grid; gap:4px; font-size:0.72rem; font-weight:800; color:#475569; text-transform:uppercase; }
    .form-grid label.wide { grid-column:1 / -1; }
    .check-row { display:flex; gap:1.2rem; flex-wrap:wrap; margin:0.75rem 0; }
    .checkline { display:flex; gap:0.45rem; align-items:center; font-weight:700; color:var(--text-mid); }
    .govern-modal textarea { width:100%; margin-top:0.6rem; }
    .honest-note { background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; border-radius:8px; padding:10px 12px; font-size:0.8rem; margin:0 0 12px; line-height:1.4; }
    .modal-actions { display:flex; justify-content:flex-end; gap:0.6rem; margin-top:0.9rem; }
    .error-line { color:#dc2626; font-size:0.82rem; margin-top:0.55rem; }
    .path-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:0.75rem; margin:0.5rem 0 1rem; }
    .path-card { border:1px solid #99f6e4; background:#f0fdfa; border-radius:8px; padding:0.9rem; }
    .path-k { font-weight:850; color:#0f172a; }
    .path-sw { font-size:0.78rem; color:#0f766e; margin-top:0.15rem; }
    .path-card p { font-size:0.8rem; color:#475569; margin:0.4rem 0 0; line-height:1.35; }
    .path-actions { display:flex; flex-wrap:wrap; gap:0.45rem; margin-top:0.7rem; }
    .btn-link { border:1px solid #cbd5e1; background:#fff; color:#334155; border-radius:6px; padding:0.35rem 0.65rem; font-size:0.75rem; font-weight:800; text-decoration:none; }
    .btn-link.primary { background:#0f766e; border-color:#0f766e; color:#fff; }
    @media (max-width: 680px) { .form-grid { grid-template-columns:1fr; } }
  `]
})
export class InstitutionRegistryComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = '/api/v1/settings/institutions';

  stats = signal<any>({ agencies: 0, stakeholders: 0, meRequired: 0, classGroups: 0, sourceRegisters: 0 });
  items = signal<InstitutionItem[]>([]);
  classes = signal<any[]>([]);
  sources = signal<any[]>([]);
  policyRoles = signal<PolicyRole[]>([]);
  glossary = signal<GlossaryTerm[]>([]);
  duplicates = signal<any[]>([]);
  reportingPaths = signal<any[]>([]);
  classBreakdown = signal<any[]>([]);
  search = signal('');
  kind = signal('');
  klass = signal('');
  sector = signal('');
  includeInactive = signal(false);
  tab = signal<'registry' | 'breakdown' | 'roles' | 'glossary' | 'duplicates'>('registry');
  editorOpen = signal(false);
  createMode = signal(false);
  createKind = signal<'agency' | 'stakeholder'>('agency');
  selected = signal<InstitutionItem | null>(null);
  fName = signal(''); fAcronym = signal(''); fType = signal('');
  fClass = signal(''); fSubclass = signal(''); fSectors = signal(''); fRoleCode = signal('');
  fContact = signal(''); fEmail = signal(''); fPhone = signal(''); fAddress = signal(''); fWebsite = signal('');
  fMeRequired = signal(true); fActive = signal(true); fSummary = signal(''); fSourceReference = signal('');
  saving = signal(false); error = signal('');
  canManage = computed(() => this.auth.hasPermission('user_management.manage'));
  classOptions = computed(() => [...new Set(this.classes().map(c => c.institutionClass).filter(Boolean))].sort());
  editClassOptions = computed(() => {
    const base = [
      'Ministry', 'Government Institution', 'Government Directorate', 'Regional Administration',
      'Local Government Authority', 'Security and Response Institution', 'Academic and Research Institution',
      'UN Agency', 'NGO', 'Private Sector', 'Faith-Based Organization', 'Media', 'Diplomatic Mission',
      'Development Partner', 'Community / Civic Group',
    ];
    return [...new Set([...base, ...this.classOptions()])].sort();
  });

  constructor() { this.reload(); }

  reload(): void {
    const params: any = { limit: 2000 };
    if (this.search().trim()) { params.search = this.search().trim(); }
    if (this.kind()) { params.kind = this.kind(); }
    if (this.klass()) { params.institutionClass = this.klass(); }
    if (this.sector().trim()) { params.sector = this.sector().trim(); }
    if (this.includeInactive()) { params.includeInactive = true; }
    this.http.get<any>(this.base, { params }).subscribe(r => {
      this.stats.set(r.stats ?? this.stats());
      this.items.set(r.items ?? []);
      this.classes.set(r.classes ?? []);
      this.sources.set(r.sources ?? []);
      this.policyRoles.set(r.policyRoles ?? []);
      this.glossary.set(r.glossary ?? []);
      this.duplicates.set(r.duplicates ?? []);
      this.reportingPaths.set(r.reportingPaths ?? []);
      this.classBreakdown.set(r.classBreakdown ?? []);
    });
  }

  openCreate(kind: 'agency' | 'stakeholder'): void {
    if (!this.canManage()) { return; }
    this.createMode.set(true);
    this.createKind.set(kind);
    this.selected.set(null);
    this.fName.set('');
    this.fAcronym.set('');
    this.fType.set(kind === 'agency' ? 'Government' : 'NGO');
    this.fClass.set(kind === 'agency' ? 'Government Institution' : 'NGO');
    this.fSubclass.set('');
    this.fSectors.set('');
    this.fRoleCode.set('');
    this.fContact.set('');
    this.fEmail.set('');
    this.fPhone.set('');
    this.fAddress.set('');
    this.fWebsite.set('');
    this.fMeRequired.set(true);
    this.fActive.set(true);
    this.fSummary.set('');
    this.fSourceReference.set('');
    this.error.set('');
    this.editorOpen.set(true);
  }

  createInstitution(): void {
    if (!this.canManage() || !this.fName().trim()) {
      this.error.set('Name is required.');
      return;
    }
    this.saving.set(true);
    this.http.post(`${this.base}/${this.createKind()}`, {
      name: this.fName().trim(),
      acronym: this.fAcronym().trim() || null,
      type: this.fType().trim() || null,
      institutionClass: this.fClass() || null,
      institutionSubclass: this.fSubclass() || null,
      sectorTags: this.fSectors() || null,
      policyRoleCode: this.fRoleCode() || null,
      roleSummary: this.fSummary() || null,
      sourceReference: this.fSourceReference() || null,
      contactPersonName: this.fContact() || null,
      contactPersonEmail: this.fEmail() || null,
      contactPersonPhone: this.fPhone() || null,
      address: this.fAddress() || null,
      website: this.fWebsite() || null,
      meRequired: this.fMeRequired(),
    }).subscribe({
      next: () => { this.saving.set(false); this.editorOpen.set(false); this.createMode.set(false); this.reload(); },
      error: e => {
        this.saving.set(false);
        this.error.set(e?.error?.detail || e?.error?.message || 'Could not add institution.');
      },
    });
  }

  removeInstitution(item: InstitutionItem, event: Event): void {
    event.stopPropagation();
    if (!this.canManage()) { return; }
    if (!confirm(`Remove "${item.name}" from the active registry?\n\nThis soft-deactivates the row (can be restored). It does not delete M&E history.`)) {
      return;
    }
    this.http.delete(`${this.base}/${item.kind}/${item.id}`).subscribe({
      next: () => this.reload(),
      error: e => alert(e?.error?.detail || e?.error?.message || 'Could not remove institution.'),
    });
  }

  restoreInstitution(item: InstitutionItem, event: Event): void {
    event.stopPropagation();
    if (!this.canManage()) { return; }
    this.http.post(`${this.base}/${item.kind}/${item.id}/restore`, {}).subscribe({
      next: () => this.reload(),
      error: e => alert(e?.error?.detail || e?.error?.message || 'Could not restore institution.'),
    });
  }

  routePath(url: string): string {
    return String(url || '').split('?')[0] || '/';
  }

  routeQuery(url: string): Record<string, string> {
    const q = String(url || '').split('?')[1] || '';
    const out: Record<string, string> = {};
    for (const part of q.split('&')) {
      if (!part) continue;
      const [k, v] = part.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return out;
  }

  openEditor(item: InstitutionItem, event: Event): void {
    event.stopPropagation();
    this.createMode.set(false);
    this.selected.set(item);
    this.fName.set(item.name ?? '');
    this.fAcronym.set(item.acronym ?? '');
    this.fType.set(item.type ?? '');
    this.fClass.set(item.institution_class ?? '');
    this.fSubclass.set(item.institution_subclass ?? '');
    this.fSectors.set(item.sector_tags ?? '');
    this.fRoleCode.set(item.policy_role_code ?? '');
    this.fContact.set(item.contact_person_name ?? '');
    this.fEmail.set(item.contact_person_email ?? '');
    this.fPhone.set(item.contact_person_phone ?? '');
    this.fAddress.set(item.address ?? '');
    this.fWebsite.set(item.website ?? '');
    this.fMeRequired.set(!!item.me_required);
    this.fActive.set(item.is_active !== false);
    this.fSummary.set(item.role_summary ?? '');
    this.fSourceReference.set(item.source_reference ?? '');
    this.error.set('');
    this.editorOpen.set(true);
  }

  saveProfile(): void {
    const item = this.selected();
    if (!item || !this.canManage()) { return; }
    if (!this.fName().trim()) {
      this.error.set('Name is required.');
      return;
    }
    this.saving.set(true);
    this.http.put(`${this.base}/${item.kind}/${item.id}`, {
      name: this.fName().trim(),
      acronym: this.fAcronym().trim() || null,
      type: this.fType().trim() || null,
      institutionClass: this.fClass() || null,
      institutionSubclass: this.fSubclass() || null,
      sectorTags: this.fSectors() || null,
      policyRoleCode: this.fRoleCode() || null,
      roleSummary: this.fSummary() || null,
      sourceReference: this.fSourceReference() || null,
      contactPersonName: this.fContact() || null,
      contactPersonEmail: this.fEmail() || null,
      contactPersonPhone: this.fPhone() || null,
      address: this.fAddress() || null,
      website: this.fWebsite() || null,
      meRequired: this.fMeRequired(),
      isActive: this.fActive(),
    }).subscribe({
      next: () => { this.saving.set(false); this.editorOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not save institution profile.'); },
    });
  }

  /** @deprecated kept for any residual callers — use saveProfile */
  saveGovernance(): void { this.saveProfile(); }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void { this.editorOpen.set(false); this.createMode.set(false); }
}
