import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EwAgencyService } from './ew-agency.service';
import { AGENCIES, AgencyKey, AgencyEnvelope, alertColor } from './ew-agency.model';

/** Each entity's authoring console route, so the cross-agency panel doubles as a console switcher. */
const CONSOLE_ROUTE: Record<string, string> = { tma: 'new-bulletin', mow: 'mow', gst: 'gst', moh: 'moh', moa: 'moa', nemc: 'nemc', mlf: 'mlf' };

/**
 * Cross-agency reference panel — the interlinking surface. Given the current entity, it shows what
 * EVERY OTHER warning entity has submitted (latest), so e.g. MoW sees TMA's rainfall warning to inform
 * flood forecasting. Mirrors the Python render_agency_reference() panel, native + live.
 */
@Component({
  selector: 'ew-cross-agency-panel',
  standalone: true,
  imports: [NgClass, RouterLink],
  styles: [`
    .xa-wrap { border: 1px solid #e3e6ed; border-radius: 12px; background: #fff; margin-bottom: 14px; overflow: hidden; }
    .xa-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; cursor: pointer; border-bottom: 1px solid #eef1f5; }
    .xa-head b { font-size: 0.86rem; color: #1f2d3d; } .xa-head .sub { font-size: 0.72rem; color: #6c757d; }
    /* every warning entity fits in ONE row — equal flex columns, never wrap */
    .xa-grid { display: flex; gap: 8px; padding: 10px 12px; }
    .xa-card { flex: 1 1 0; min-width: 0; border: 1px solid #e8ebf0; border-left: 3px solid #ccc; border-radius: 9px; padding: 8px 9px; background: #fff; text-decoration: none; cursor: pointer; transition: box-shadow .15s ease, transform .15s ease; display: block; }
    .xa-card:hover { box-shadow: 0 5px 14px rgba(16,30,54,0.1); transform: translateY(-1px); border-color: #c7d0db; }
    .xa-card .top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .xa-card .top i { color: #607089; font-size: 0.82rem; } .xa-card .nm { font-weight: 800; font-size: 0.78rem; color: #1f2d3d; white-space: nowrap; }
    .pill { font-size: 0.56rem; font-weight: 800; border-radius: 7px; padding: 1px 6px; color: #1a1a1a; margin-left: auto; white-space: nowrap; }
    .xa-meta { font-size: 0.7rem; color: #475569; line-height: 1.45; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xa-meta .k { color: #94a3b8; } .xa-types { margin-top: 4px; white-space: nowrap; overflow: hidden; }
    .tchip { display: inline-block; font-size: 0.58rem; font-weight: 700; background: #eef2f7; color: #334155; border-radius: 6px; padding: 1px 6px; margin: 0 3px 0 0; }
    .xa-empty { padding: 14px; font-size: 0.78rem; color: #94a3b8; text-align: center; }
    .na { opacity: 0.5; } .na .xa-meta { font-style: italic; }
    @media (max-width: 1100px) { .xa-grid { flex-wrap: wrap; } .xa-card { flex: 1 1 140px; } }
  `],
  template: `
    <div class="xa-wrap">
      <div class="xa-head" (click)="open.set(!open())">
        <div><b><i class="fas fa-diagram-project"></i> What other warning entities have reported</b>
          <div class="sub">Live cross-agency picture — use it to inform your own assessment</div></div>
        <i class="fas" [ngClass]="open() ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
      </div>
      @if (open()) {
        @if (others().length) {
          <div class="xa-grid">
            @for (a of others(); track a.key) {
              <a class="xa-card" [class.na]="!a.env.available" [style.border-left-color]="a.def.color"
                 [routerLink]="routeFor(a.key)" [title]="'Open ' + a.def.fullName + ' console'">
                <div class="top">
                  <i class="fas" [ngClass]="a.def.icon"></i>
                  <span class="nm">{{ a.def.name }}</span>
                  <i class="fas fa-arrow-right-long" style="color:#cbd5e1;font-size:0.66rem;margin-left:4px"></i>
                  @if (a.env.available && a.env.top_alert) {
                    <span class="pill" [style.background]="alertColor(a.env.top_alert)">{{ label(a.env.top_alert) }}</span>
                  }
                </div>
                @if (a.env.available) {
                  <div class="xa-meta"><span class="k">{{ a.env.item_count }}</span> {{ a.def.unit.toLowerCase() }}{{ a.env.item_count === 1 ? '' : 's' }}
                    @if (a.env.districts?.length) { · {{ a.env.districts!.length }} district(s) }
                    @else if (a.env.regions?.length) { · {{ join(a.env.regions, 2) }} }
                  </div>
                  <div class="xa-types">
                    @for (t of (a.env.hazard_types ?? []).slice(0, 2); track t) { <span class="tchip">{{ t }}</span> }
                  </div>
                } @else {
                  <div class="xa-meta">No submission yet.</div>
                }
              </a>
            }
          </div>
        } @else { <div class="xa-empty">Loading other entities…</div> }
      }
    </div>
  `,
})
export class EwCrossAgencyPanelComponent implements OnInit {
  @Input() current: AgencyKey | '' = '';
  private svc = inject(EwAgencyService);
  open = signal(true);
  alertColor = alertColor;
  others = signal<{ key: string; def: any; env: AgencyEnvelope }[]>([]);

  ngOnInit(): void {
    this.svc.allLatest(this.current || undefined).subscribe({
      next: r => {
        const list: { key: string; def: any; env: AgencyEnvelope }[] = [];
        for (const key of Object.keys(AGENCIES) as AgencyKey[]) {
          if (key === this.current) continue;
          const env = r.agencies?.[key] ?? { agency: key, available: false };
          list.push({ key, def: AGENCIES[key], env });
        }
        this.others.set(list);
      },
      error: () => this.others.set([]),
    });
  }

  routeFor(key: string) { return '/m/preparedness/early-warnings/' + (CONSOLE_ROUTE[key] ?? key); }
  label(lvl?: string) { return (lvl ?? '').replace('_', ' '); }
  join(arr: string[] | undefined, n: number) {
    if (!arr?.length) return '';
    return arr.slice(0, n).join(', ') + (arr.length > n ? ` +${arr.length - n}` : '');
  }
  firstDesc(env: AgencyEnvelope): string {
    const d = env.data;
    const items = d?.days?.flatMap((x: any) => x.hazards ?? x.assessments ?? []) ?? d?.events ?? d?.outbreaks ?? d?.assessments ?? [];
    const first = items.find((i: any) => i?.description);
    return first?.description ? (first.description.length > 110 ? first.description.slice(0, 110) + '…' : first.description) : '';
  }
}
