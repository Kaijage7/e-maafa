import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';
import { DLNA_SECTIONS, DlnaField, DlnaSection } from './dlna-schema';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * NDRF Annex 1 — the DLNA keying screen. General information (section 1) sits on the
 * assessment itself; the 11 thematic sections are keyed and submitted one by one by the
 * assigned sectors (attribution recorded per section). When all sections are submitted
 * a verifier finalizes the DLNA, and the Annex 1 document is generated from the keyed data.
 */
@Component({
    selector: 'page-dlna-form',
    imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent, RegionDistrictPickerComponent],
    styles: [`
    label { display: block; font-size: 0.75rem; font-weight: 600; color: #334155; margin: 10px 0 3px; }
    input, select, textarea { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    input:disabled, select:disabled, textarea:disabled { background: #f1f5f9; color: #64748b; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 14px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
    .wf-strip { display: flex; gap: 10px; align-items: center; background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem; flex-wrap: wrap; }
    .chip { display: inline-block; font-size: 0.75rem; font-weight: 600; border-radius: 10px; padding: 2px 10px; background: #e2e8f0; color: #334155; }
    .chip.final { background: #d1fae5; color: #065f46; }
    .chip.progress { background: #fef3c7; color: #92400e; }
    .prog-bar { flex: 0 0 160px; height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; }
    .prog-fill { height: 100%; background: #0d6efd; }
    .btn-sm { font-size: 0.78rem; padding: 6px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .b-red { background: #dc3545; color: #fff; } .b-red:hover { background: #c82333; }
    .b-green { background: #198754; color: #fff; } .b-green:hover { background: #157347; }
    .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; } .b-outline:hover { background: #f1f5f9; }
    .b-blue { background: #0d3b66; color: #fff; }
    .sec { border: 1px solid #e3e6ed; border-radius: 10px; margin-bottom: 10px; background: #fff; overflow: hidden; }
    .sec-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; background: #f8f9fb; }
    .sec-head:hover { background: #f1f5f9; }
    .sec-no { font-weight: 800; color: #0d3b66; min-width: 26px; }
    .sec-title { font-size: 0.88rem; font-weight: 700; flex: 1; }
    .sec-lead { font-size: 0.75rem; color: #6c757d; }
    .sec-filled { font-size: 0.75rem; color: #6c757d; }
    .sec-body { padding: 4px 16px 14px; border-top: 1px solid #eef1f5; }
    .f-heading { font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #0d3b66; margin: 16px 0 2px; border-bottom: 1px solid #e3e6ed; padding-bottom: 3px; }
    .f-hint { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
    .multi { display: flex; flex-wrap: wrap; gap: 4px 18px; padding: 4px 0; }
    .multi label { display: inline-flex; align-items: center; gap: 6px; margin: 2px 0; font-weight: 500; font-size: 0.8rem; }
    .multi input { width: auto; }
    .rows-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    .rows-table th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #6c757d; padding: 4px 6px; }
    .rows-table td { padding: 3px 6px; }
    .sec-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .hint { font-size: 0.78rem; color: #6c757d; }
    .rowline { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end; padding: 3px 0; }
  `],
    template: `
    @if (assessment(); as a) {
      <dmis-page-header [title]="(a.ref_no ?? 'DLNA #' + a.id) + ' — ' + (incident()?.title ?? '')" icon="fa-file-lines"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'DLNA', url:'/m/response/dlna'}, {label: a.ref_no ?? ('#' + a.id)}]">
      </dmis-page-header>

      <div class="wf-strip">
        <span class="chip" [class.final]="a.status === 'Final'" [class.progress]="a.status !== 'Final'">{{ a.status }}</span>
        <span class="prog-bar"><span class="prog-fill" [style.width.%]="progressTotal() ? (progressSubmitted() / progressTotal()) * 100 : 0"></span></span>
        <span>{{ progressSubmitted() }}/{{ progressTotal() }} sections submitted</span>
        <span style="flex:1"></span>
        @if (covered().length > 1) {
          <span class="chip" style="background:#eef4fb;color:#0d3b66">{{ a.scope === 'SAME_HAZARD' ? 'Combined — same hazard' : 'Combined — multi-hazard' }} · {{ covered().length }} incidents</span>
        }
        <a class="btn-sm b-outline" [routerLink]="['/m/response/incidents', a.incident_id]"><i class="fas fa-exclamation-triangle"></i> Incident</a>
        <a class="btn-sm b-outline" [routerLink]="['/m/response/dlna', a.id, 'output']"><i class="fas fa-file-export"></i> Annex 1 Output</a>
        <a class="btn-sm b-outline" [routerLink]="['/m/response/recovery-plan', a.incident_id]"><i class="fas fa-diagram-project"></i> Recovery Plan (Annex 2)</a>
        @if (a.status !== 'Final' && canVerify()) {
          <button class="btn-sm b-green" [disabled]="submittedCount() < sections().length" (click)="finalize()"
            [title]="submittedCount() < sections().length ? 'Every section must be submitted first' : ''">
            <i class="fas fa-check-double"></i> Finalize DLNA</button>
        }
        @if (a.status === 'Final' && canVerify()) {
          <button class="btn-sm b-outline" (click)="reopen()"><i class="fas fa-rotate-left"></i> Reopen</button>
        }
      </div>

      @if (covered().length > 1) {
        <dmis-panel title="Incidents Covered" icon="fa-layer-group">
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            @for (ci of covered(); track ci.id) {
              <a class="btn-sm b-outline" [routerLink]="['/m/response/incidents', ci.id]">
                <i class="fas fa-exclamation-triangle" style="opacity:0.5"></i> {{ ci.title }}
                <span style="font-size:0.75rem; font-weight:600; color:#0d3b66; background:#eef4fb; border-radius:8px; padding:1px 8px">{{ ci.hazard ?? '—' }}</span>
                @if (ci.id === assessment()?.incident_id) { <span style="font-size:0.75rem; color:#6c757d">(lead)</span> }
              </a>
            }
          </div>
        </dmis-panel>
      }

      @if (!isSectorRestricted()) {
        <dmis-panel title="1. General Information" icon="fa-circle-info">
          <div class="grid-3">
            <div><label>Date of visit</label><input type="date" [(ngModel)]="header.date_of_visit" [disabled]="locked()"></div>
            <div><label>Type of disaster</label>
              <select [(ngModel)]="header.disaster_type" [disabled]="locked()">
                <option value="">Select…</option>
                @for (t of disasterTypes(); track t) { <option [value]="t">{{ t }}</option> }
              </select></div>
            <div><label>If Epidemics / Other — specify</label><input maxlength="160" [(ngModel)]="header.disaster_type_other" [disabled]="locked()"></div>
          </div>
          <label>Region &amp; District</label>
          <dmis-region-district [region]="pickRegion()" (regionChange)="pickRegion.set($event)"
                                [district]="pickDistrict()" (districtChange)="pickDistrict.set($event)"
                                [showCouncil]="false" />
          @if (header.district && !pickDistrict()) {
            <div class="hint"><i class="fas fa-map-marker-alt"></i> Current: <b>{{ header.region }} / {{ header.district }}</b> — pick again only to change.</div>
          }
          <div class="grid-3">
            <div><label>Ward</label><input maxlength="120" [(ngModel)]="header.ward" [disabled]="locked()"></div>
            <div><label>Village / Mtaa</label><input maxlength="160" [(ngModel)]="header.village" [disabled]="locked()"></div>
            <div><label>GPS coordinates</label><input maxlength="120" [(ngModel)]="header.gps_coordinates" [disabled]="locked()"></div>
          </div>
          <label>Name(s) of affected villages / mitaa</label>
          <textarea rows="2" [(ngModel)]="header.affected_villages" [disabled]="locked()"></textarea>

          <div class="grid-2">
            <div>
              <label>Assessment team members</label>
              @for (m of header.team_members; track $index; let idx = $index) {
                <div class="rowline">
                  <input placeholder="Name" [(ngModel)]="m.name" [ngModelOptions]="{standalone: true}" [disabled]="locked()">
                  <input placeholder="Organization" [(ngModel)]="m.organization" [ngModelOptions]="{standalone: true}" [disabled]="locked()">
                  @if (!locked()) { <button type="button" class="btn-sm b-outline" (click)="header.team_members.splice(idx, 1)">✕</button> }
                </div>
              }
              @if (!locked()) { <button type="button" class="btn-sm b-outline" (click)="header.team_members.push({name:'', organization:''})"><i class="fas fa-plus"></i> Add member</button> }
            </div>
            <div>
              <label>Person(s) interviewed</label>
              @for (p of header.interviewees; track $index; let idx = $index) {
                <div class="rowline">
                  <input placeholder="Name" [(ngModel)]="p.name" [ngModelOptions]="{standalone: true}" [disabled]="locked()">
                  <input placeholder="Position" [(ngModel)]="p.position" [ngModelOptions]="{standalone: true}" [disabled]="locked()">
                  @if (!locked()) { <button type="button" class="btn-sm b-outline" (click)="header.interviewees.splice(idx, 1)">✕</button> }
                </div>
              }
              @if (!locked()) { <button type="button" class="btn-sm b-outline" (click)="header.interviewees.push({name:'', position:''})"><i class="fas fa-plus"></i> Add interviewee</button> }
            </div>
          </div>
          @if (!locked() && canCreate()) {
            <div class="sec-actions">
              <button type="button" class="btn-sm b-blue" (click)="saveHeader()"><i class="fas fa-save"></i> Save General Information</button>
            </div>
          }
        </dmis-panel>
      }

      @for (sec of visibleSections(); track sec.section_key) {
        @if (schemaFor(sec.section_key); as schema) {
          <div class="sec">
            <div class="sec-head" (click)="toggle(sec.section_key)">
              <span class="sec-no">{{ schema.no }}.</span>
              <span class="sec-title">{{ schema.title }}
                <div class="sec-lead"><i class="fas fa-building-columns" style="opacity:0.5"></i> {{ sec.sector_lead }}</div>
              </span>
              @if (myAgency() && isMySection(sec.section_key)) {
                <span class="chip" style="background:#0d3b66;color:#fff">Your sector</span>
              }
              @if (sec.status === 'Submitted') {
                <span class="sec-filled">keyed by {{ sec.filled_by_name ?? '—' }} · {{ sec.filled_at?.substring(0, 10) }}</span>
                <span class="chip final">Submitted</span>
              } @else {
                <span class="chip progress">Pending</span>
              }
              <i class="fas" [class.fa-chevron-down]="open() !== sec.section_key" [class.fa-chevron-up]="open() === sec.section_key" style="color:#94a3b8"></i>
            </div>
            @if (open() === sec.section_key) {
              <div class="sec-body">
                @for (f of schema.fields; track f.key) {
                  @if (visible(f)) {
                    @switch (f.type) {
                      @case ('heading') { <div class="f-heading">{{ f.label }}</div> }
                      @case ('yn') {
                        <label>{{ f.label }}</label>
                        <select [(ngModel)]="edit[f.key]" [ngModelOptions]="{standalone: true}" [disabled]="secLocked(sec)" style="max-width:220px">
                          <option value="">—</option><option value="Yes">Yes</option><option value="No">No</option>
                        </select>
                      }
                      @case ('ynp') {
                        <label>{{ f.label }}</label>
                        <select [(ngModel)]="edit[f.key]" [ngModelOptions]="{standalone: true}" [disabled]="secLocked(sec)" style="max-width:220px">
                          <option value="">—</option><option value="Yes">Yes</option><option value="No">No</option><option value="Partial">Partial</option>
                        </select>
                      }
                      @case ('number') {
                        <label>{{ f.label }}</label>
                        <input type="number" min="0" [(ngModel)]="edit[f.key]" [ngModelOptions]="{standalone: true}" [disabled]="secLocked(sec)" style="max-width:220px">
                      }
                      @case ('text') {
                        <label>{{ f.label }}</label>
                        <input maxlength="500" [(ngModel)]="edit[f.key]" [ngModelOptions]="{standalone: true}" [disabled]="secLocked(sec)">
                      }
                      @case ('textarea') {
                        <label>{{ f.label }}</label>
                        <textarea rows="2" [(ngModel)]="edit[f.key]" [ngModelOptions]="{standalone: true}" [disabled]="secLocked(sec)"></textarea>
                      }
                      @case ('select') {
                        <label>{{ f.label }}</label>
                        <select [(ngModel)]="edit[f.key]" [ngModelOptions]="{standalone: true}" [disabled]="secLocked(sec)" style="max-width:360px">
                          <option value="">—</option>
                          @for (o of f.options ?? []; track o) { <option [value]="o">{{ o }}</option> }
                        </select>
                      }
                      @case ('multi') {
                        <label>{{ f.label }}</label>
                        <div class="multi">
                          @for (o of f.options ?? []; track o) {
                            <label><input type="checkbox" [checked]="multiHas(f.key, o)" (change)="multiToggle(f.key, o)" [disabled]="secLocked(sec)"> {{ o }}</label>
                          }
                        </div>
                      }
                      @case ('rows') {
                        <label>{{ f.label }}</label>
                        @if (f.hint) { <div class="f-hint">{{ f.hint }}</div> }
                        <table class="rows-table">
                          @if (rowsOf(f.key).length) {
                            <thead><tr>@for (c of f.columns ?? []; track c.key) { <th>{{ c.label }}</th> }<th></th></tr></thead>
                          }
                          <tbody>
                            @for (row of rowsOf(f.key); track $index; let idx = $index) {
                              <tr>
                                @for (c of f.columns ?? []; track c.key) {
                                  <td><input [type]="c.type === 'number' ? 'number' : 'text'" [(ngModel)]="row[c.key]" [ngModelOptions]="{standalone: true}" [disabled]="secLocked(sec)"></td>
                                }
                                <td>@if (!secLocked(sec)) { <button type="button" class="btn-sm b-outline" (click)="rowsOf(f.key).splice(idx, 1)">✕</button> }</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                        @if (!secLocked(sec)) {
                          <button type="button" class="btn-sm b-outline" style="margin-top:4px" (click)="addRow(f)"><i class="fas fa-plus"></i> Add row</button>
                        }
                      }
                    }
                    @if (f.hint && f.type !== 'rows') { <div class="f-hint">{{ f.hint }}</div> }
                  }
                }
                @if (!secLocked(sec) && isOverrideKeying(sec.section_key)) {
                  <div class="hint" style="margin-top:10px"><i class="fas fa-shield-halved"></i>
                    You are keying this section under the <b>EOCC/PMO override</b> (sector late or unable to respond)
                    — the record will attribute it to you by name.</div>
                }
                <div class="sec-actions">
                  @if (sec.status === 'Submitted' && !locked() && canKeySection()) {
                    <button type="button" class="btn-sm b-outline" (click)="reopenSection(sec)"><i class="fas fa-rotate-left"></i> Reopen section</button>
                  }
                  @if (!secLocked(sec) && canKeySection()) {
                    <button type="button" class="btn-sm b-blue" (click)="saveSection(sec, false)"><i class="fas fa-save"></i> Save</button>
                    <button type="button" class="btn-sm b-green" (click)="saveSection(sec, true)"><i class="fas fa-check"></i> Save &amp; Submit Section</button>
                  }
                </div>
              </div>
            }
          </div>
        }
      }
    }
  `
})
export class DlnaFormComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly assessment = signal<any | null>(null);
  readonly incident = signal<any | null>(null);
  readonly sections = signal<any[]>([]);
  readonly covered = signal<any[]>([]);
  readonly sectionSectors = signal<Record<string, string[]>>({});
  readonly myAgency = signal<string | null>(null);
  readonly open = signal<string>('');
  readonly submittedCount = computed(() => this.sections().filter(s => s.status === 'Submitted').length);
  readonly visibleSections = computed(() => this.sections().filter(s => this.canSeeSection(s.section_key)));
  readonly visibleSubmittedCount = computed(() => this.visibleSections().filter(s => s.status === 'Submitted').length);
  readonly progressSubmitted = computed(() => this.isSectorRestricted() ? this.visibleSubmittedCount() : this.submittedCount());
  readonly progressTotal = computed(() => this.isSectorRestricted() ? this.visibleSections().length : this.sections().length);
  readonly pickRegion = signal('');
  readonly pickDistrict = signal('');

  /** Editable copy of the currently open section's answers. */
  edit: Record<string, any> = {};
  /** Snapshot at open/save — guards against silently discarding unsaved keying. */
  private editSnapshot = '{}';
  header: any = { team_members: [], interviewees: [] };

  private id = 0;

  ngOnInit(): void {
    ensureSweetAlert();
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  disasterTypes(): string[] {
    return ['Flood', 'Tsunami', 'Mudslide', 'Earthquake', 'Epidemics', 'Displacement', 'Drought', 'Other'];
  }

  canCreate(): boolean { return this.auth.hasPermission('damage_assessment.create'); }
  canKeySection(): boolean {
    return this.auth.hasPermission('damage_assessment.key_section') || this.canCreate();
  }

  /** Mirrors the server rule: agency logins key only their sections; PMO-DMD and the
   *  EOCC override tier (verify / command_post.activate) key all — for late sectors. */
  sectorMayKey(key: string): boolean {
    const agency = this.myAgency();
    if (!agency || agency === 'pmo-dmd' || this.hasOverride()) { return true; }
    return (this.sectionSectors()[key] ?? []).includes(agency);
  }

  hasOverride(): boolean {
    return this.auth.hasPermission('damage_assessment.verify') || this.auth.hasPermission('command_post.activate');
  }

  isSectorRestricted(): boolean {
    const agency = this.myAgency();
    return !!agency && agency !== 'pmo-dmd' && !this.hasOverride();
  }

  canSeeSection(key: string): boolean {
    return !this.isSectorRestricted() || this.sectorMayKey(key);
  }

  /** True when keying a section that belongs to another sector under the EOCC/PMO override. */
  isOverrideKeying(key: string): boolean {
    if (!this.hasOverride()) { return false; }
    const mine = this.myAgency();
    const owners = this.sectionSectors()[key] ?? [];
    return !mine ? true : (mine !== 'pmo-dmd' && !owners.includes(mine));
  }

  isMySection(key: string): boolean {
    const agency = this.myAgency();
    if (!agency) { return false; }
    return agency === 'pmo-dmd' || (this.sectionSectors()[key] ?? []).includes(agency);
  }
  canVerify(): boolean { return this.auth.hasPermission('damage_assessment.verify'); }
  locked(): boolean { return this.assessment()?.status === 'Final'; }
  secLocked(sec: any): boolean {
    return this.locked() || sec.status === 'Submitted' || !this.canKeySection() || !this.sectorMayKey(sec.section_key);
  }

  schemaFor(key: string) {
    return DLNA_SECTIONS.find(s => s.key === key);
  }

  load(): void {
    this.http.get<any>(`/api/v1/response/dlna/${this.id}`).subscribe(d => {
      this.assessment.set(d.assessment);
      this.incident.set(d.incident);
      this.covered.set(d.covered_incidents ?? []);
      this.sectionSectors.set(d.section_sectors ?? {});
      this.myAgency.set(d.my_agency ?? null);
      this.sections.set(d.sections.map((s: any) => ({ ...s, data: parseJson(s.data) })));
      const wanted = this.route.snapshot.queryParamMap.get('section');
      if (wanted && !this.open() && this.visibleSections().some(s => s.section_key === wanted)) {
        this.toggle(wanted);
      } else if (!this.open() && this.isSectorRestricted() && this.visibleSections().length === 1) {
        this.toggle(this.visibleSections()[0].section_key);
      }
      if (this.open() && !this.canSeeSection(this.open())) {
        this.open.set('');
        this.edit = {};
        this.editSnapshot = '{}';
      }
      const a = d.assessment;
      this.header = {
        date_of_visit: (a.date_of_visit ?? '').toString().substring(0, 10),
        region: a.region ?? '', district: a.district ?? '', ward: a.ward ?? '', village: a.village ?? '',
        gps_coordinates: a.gps_coordinates ?? '', disaster_type: a.disaster_type ?? '',
        disaster_type_other: a.disaster_type_other ?? '', affected_villages: a.affected_villages ?? '',
        team_members: parseJson(a.team_members) ?? [], interviewees: parseJson(a.interviewees) ?? [],
      };
      if (this.open() && !this.dirty()) {
        // Refresh the open section from the server ONLY when the officer has no unsaved keying.
        const sec = this.sections().find(s => s.section_key === this.open());
        this.edit = structuredClone(sec?.data ?? {});
        this.editSnapshot = JSON.stringify(this.edit);
      }
    });
  }

  private dirty(): boolean {
    return JSON.stringify(this.edit) !== this.editSnapshot;
  }

  toggle(key: string): void {
    if (!this.canSeeSection(key)) {
      return;
    }
    const doToggle = () => {
      if (this.open() === key) {
        this.open.set('');
        this.edit = {};
        this.editSnapshot = '{}';
        return;
      }
      const sec = this.sections().find(s => s.section_key === key);
      this.edit = structuredClone(sec?.data ?? {});
      this.editSnapshot = JSON.stringify(this.edit);
      this.open.set(key);
    };
    if (this.open() && this.open() !== key && this.dirty()) {
      ensureSweetAlert().then(() => Swal.fire({
        title: 'Discard unsaved keying?',
        text: 'The open section has unsaved answers — save it first, or discard them.',
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545',
        confirmButtonText: 'Discard', cancelButtonText: 'Keep editing',
      }).then((r: any) => { if (r.isConfirmed) { doToggle(); } }));
      return;
    }
    doToggle();
  }

  visible(f: DlnaField): boolean {
    if (!f.showIf) { return true; }
    return this.edit[f.showIf.key] === f.showIf.equals;
  }

  rowsOf(key: string): any[] {
    if (!Array.isArray(this.edit[key])) { this.edit[key] = []; }
    return this.edit[key];
  }

  addRow(f: DlnaField): void {
    const row: any = {};
    for (const c of f.columns ?? []) { row[c.key] = c.type === 'number' ? null : ''; }
    this.rowsOf(f.key).push(row);
  }

  multiHas(key: string, option: string): boolean {
    return Array.isArray(this.edit[key]) && this.edit[key].includes(option);
  }

  multiToggle(key: string, option: string): void {
    const list: string[] = Array.isArray(this.edit[key]) ? this.edit[key] : (this.edit[key] = []);
    const i = list.indexOf(option);
    if (i >= 0) { list.splice(i, 1); } else { list.push(option); }
  }

  saveHeader(): void {
    // The picker overrides ONLY as a pair — a region picked without its district must not
    // re-pair the new region with the stale saved district.
    const pickedBoth = !!(this.pickRegion() && this.pickDistrict());
    const body = {
      ...this.header,
      region: pickedBoth ? this.pickRegion() : this.header.region,
      district: pickedBoth ? this.pickDistrict() : this.header.district,
    };
    this.http.post<any>(`/api/v1/response/dlna/${this.id}/header`, body).subscribe({
      next: r => this.toastAnd(r.message),
      error: err => this.err(err),
    });
  }

  saveSection(sec: any, submit: boolean): void {
    // Answers whose "If yes…" condition no longer holds are dropped, so a flipped parent
    // answer cannot leave stale dependents in the record or the printed annex.
    const schema = this.schemaFor(sec.section_key);
    const data: Record<string, any> = { ...this.edit };
    for (const f of schema?.fields ?? []) {
      if (f.showIf && data[f.showIf.key] !== f.showIf.equals) { delete data[f.key]; }
    }
    const run = () => this.http.post<any>(`/api/v1/response/dlna/${this.id}/sections/${sec.section_key}`,
      { data, submit }).subscribe({
        next: r => { this.edit = data; this.editSnapshot = JSON.stringify(data); this.toastAnd(r.message); },
        error: err => this.err(err),
      });
    if (!submit) { run(); return; }
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Submit this section?', text: 'It locks for keying (a reopen is possible until the DLNA is finalized).',
      icon: 'question', showCancelButton: true, confirmButtonColor: '#198754',
    }).then((r: any) => { if (r.isConfirmed) { run(); } }));
  }

  reopenSection(sec: any): void {
    this.http.post<any>(`/api/v1/response/dlna/${this.id}/sections/${sec.section_key}/reopen`, {}).subscribe({
      next: r => this.toastAnd(r.message),
      error: err => this.err(err),
    });
  }

  finalize(): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Finalize this DLNA?', text: 'The Annex 1 output becomes the official record; sections lock.',
      icon: 'question', showCancelButton: true, confirmButtonColor: '#198754',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.http.post<any>(`/api/v1/response/dlna/${this.id}/finalize`, {}).subscribe({
          next: res => this.toastAnd(res.message),
          error: err => this.err(err),
        });
      }
    }));
  }

  reopen(): void {
    this.http.post<any>(`/api/v1/response/dlna/${this.id}/reopen`, {}).subscribe({
      next: r => this.toastAnd(r.message),
      error: err => this.err(err),
    });
  }

  private toastAnd(message: string): void {
    ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Done', text: message, timer: 1800, showConfirmButton: false })
      .then(() => this.load()));
  }

  private err(err: any): void {
    ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'The action could not be completed.', 'error'));
  }
}

function parseJson(v: any): any {
  if (v == null) { return null; }
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
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
      link.href = '/vendor/sweetalert2/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = '/vendor/sweetalert2/sweetalert2.all.min.js';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
