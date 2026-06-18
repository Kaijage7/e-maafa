import { Component } from '@angular/core';
import { AgencyEventConsoleComponent, ConsoleConfig } from './agency-event-console.component';
import { DISEASES, TRENDS } from './ew-agency.model';

/** MoH — Ministry of Health. Distinct fields: disease, confirmed cases, deaths, trend, response actions. */
@Component({
  selector: 'page-moh-health',
  standalone: true,
  imports: [AgencyEventConsoleComponent],
  template: `<ew-agency-event-console [config]="config"></ew-agency-event-console>`,
})
export class MohHealthComponent {
  config: ConsoleConfig = {
    agency: 'moh', collectionKey: 'outbreaks', fixedType: 'DISEASE_OUTBREAK',
    fields: [
      { key: 'disease', label: 'Disease', type: 'select', options: DISEASES },
      { key: 'specify_disease', label: 'Specify disease', type: 'text', placeholder: 'Disease name', showIf: it => it.disease === 'Other' },
      { key: 'confirmed_cases', label: 'Confirmed cases', type: 'number', min: 0, step: 1 },
      { key: 'deaths', label: 'Deaths', type: 'number', min: 0, step: 1 },
      { key: 'trend', label: 'Trend', type: 'select', options: TRENDS },
      { key: 'response_actions', label: 'Response actions', type: 'textarea', placeholder: 'Response actions taken…' },
    ],
    newItem: () => ({ disease: 'Cholera', confirmed_cases: 0, deaths: 0, trend: 'Increasing', response_actions: '' }),
  };
}
