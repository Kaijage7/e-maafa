import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { PageHeaderComponent } from '../../../shell/page-header.component';
import { InformMapComponent } from './inform-map.component';
import { InformRegistryComponent } from './inform-registry.component';
import { InformEntryComponent } from './inform-entry.component';
import { InformApprovalsComponent } from './inform-approvals.component';
import { InformAnalyticsComponent } from './inform-analytics.component';

type Tab = 'map' | 'registry' | 'analytics' | 'entry' | 'approvals';

/**
 * INFORM Risk Index section — Prevention & Mitigation. A tabbed workbench for the validated INFORM
 * subnational RISK model: the national risk MAP (strategic composite + EO hazard signals, with click-to-drill),
 * the indicator REGISTRY, ANALYTICS (distribution + ranking), sector DATA ENTRY (raw / direct-0-10 / paste →
 * pending), and the PMO APPROVALS queue — the full index-governance loop against the live /api/v1/inform backend.
 *
 * NOTE: INFORM Severity is intentionally NOT part of v1 (deferred to version 2). v1 is Risk only.
 */
@Component({
  selector: 'page-inform-risk-index',
  standalone: true,
  imports: [PageHeaderComponent, InformMapComponent, InformRegistryComponent, InformEntryComponent, InformApprovalsComponent, InformAnalyticsComponent],
  styles: [`
    .tabbar { display:flex; gap:.25rem; flex-wrap:wrap; margin:.25rem 0 1.1rem; border-bottom:2px solid var(--line,#e2e8f0); }
    .tabbar button { font:inherit; font-size:.86rem; font-weight:700; padding:.6rem 1.1rem; border:none; background:transparent;
      color:var(--text-mid,#64748b); cursor:pointer; border-bottom:3px solid transparent; margin-bottom:-2px; display:flex; align-items:center; gap:.45rem; }
    .tabbar button:hover:not(.on) { color:var(--text-dark,#1e293b); background:#f8fafc; }
    .tabbar button.on { color:var(--module-color,#0d6efd); border-bottom-color:var(--module-color,#0d6efd); }
    .tabbar button i { font-size:.8rem; }
  `],
  template: `
    <dmis-page-header title="INFORM Risk Index" icon="fa-layer-group"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation', url:'/m/prevention-mitigation/dashboard'}, {label:'Risk Index'}]" />

    <div class="tabbar">
      @if (canView()) {
        <button [class.on]="tab()==='map'" (click)="setTab('map')"><i class="fas fa-map-marked-alt"></i> Risk Map</button>
        <button [class.on]="tab()==='registry'" (click)="setTab('registry')"><i class="fas fa-table-list"></i> Indicators</button>
        <button [class.on]="tab()==='analytics'" (click)="setTab('analytics')"><i class="fas fa-chart-column"></i> Analytics</button>
      }
      @if (canCreate()) {
        <button [class.on]="tab()==='entry'" (click)="setTab('entry')"><i class="fas fa-keyboard"></i> Data Entry</button>
      }
      @if (canApprove()) {
        <button [class.on]="tab()==='approvals'" (click)="setTab('approvals')"><i class="fas fa-check-double"></i> Approvals</button>
      }
    </div>

    @switch (tab()) {
      @case ('map') { <page-inform-map /> }
      @case ('registry') { <page-inform-registry /> }
      @case ('analytics') { <page-inform-analytics /> }
      @case ('entry') { <page-inform-entry /> }
      @case ('approvals') { <page-inform-approvals /> }
    }
  `,
})
export class RiskIndexComponent implements OnInit {
  private auth = inject(AuthService);
  tab = signal<Tab>('map');

  ngOnInit(): void {
    this.ensureAllowedTab();
  }

  canView(): boolean {
    return this.auth.hasPermission('risk_index.view');
  }

  canCreate(): boolean {
    return this.auth.hasPermission('risk_index.create');
  }

  canApprove(): boolean {
    return this.auth.hasPermission('risk_index.approve');
  }

  setTab(tab: Tab): void {
    if (!this.isAllowed(tab)) {
      return;
    }
    this.tab.set(tab);
  }

  private ensureAllowedTab(): void {
    if (this.isAllowed(this.tab())) {
      return;
    }
    const first = (['map', 'registry', 'analytics', 'entry', 'approvals'] as Tab[]).find(t => this.isAllowed(t));
    if (first) {
      this.tab.set(first);
    }
  }

  private isAllowed(tab: Tab): boolean {
    if (tab === 'entry') {
      return this.canCreate();
    }
    if (tab === 'approvals') {
      return this.canApprove();
    }
    return this.canView();
  }
}
