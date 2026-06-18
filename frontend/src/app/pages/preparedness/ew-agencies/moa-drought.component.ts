import { Component } from '@angular/core';
import { AgencyEventConsoleComponent, ConsoleConfig } from './agency-event-console.component';
import { DROUGHT_SEVERITY, AFFECTED_SECTORS } from './ew-agency.model';

/** MoA — Ministry of Agriculture. Distinct fields: drought severity (D0–D4), rainfall %, NDVI, sectors. */
@Component({
  selector: 'page-moa-drought',
  standalone: true,
  imports: [AgencyEventConsoleComponent],
  template: `<ew-agency-event-console [config]="config"></ew-agency-event-console>`,
})
export class MoaDroughtComponent {
  config: ConsoleConfig = {
    agency: 'moa', collectionKey: 'assessments', fixedType: 'DROUGHT', reportPeriod: true,
    fields: [
      { key: 'severity', label: 'Drought severity', type: 'select', options: DROUGHT_SEVERITY },
      { key: 'rainfall_pct_normal', label: 'Rainfall (% of normal)', type: 'number', min: 0, max: 200, step: 5 },
      { key: 'vegetation_ndvi', label: 'Vegetation index (NDVI, 0–1)', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'affected_sectors', label: 'Affected sectors', type: 'multiselect', options: AFFECTED_SECTORS },
      { key: 'recommended_actions', label: 'Recommended actions', type: 'textarea', placeholder: 'Recommended actions…' },
    ],
    newItem: () => ({ severity: 'D1 — Moderate Drought', rainfall_pct_normal: 60, vegetation_ndvi: 0.31, affected_sectors: ['Crops', 'Livestock'], recommended_actions: '' }),
  };
}
