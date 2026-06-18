import { Component } from '@angular/core';
import { AgencyEventConsoleComponent, ConsoleConfig } from './agency-event-console.component';
import { AGENCY_HAZARDS, LIVESTOCK_CONDITIONS, TRENDS } from './ew-agency.model';

/** MoLF — Ministry of Livestock and Fisheries. Flows like MoH (event-based outbreaks): livestock disease /
 * fisheries condition, affected animals, deaths, trend, response actions. */
@Component({
  selector: 'page-mlf-livestock',
  standalone: true,
  imports: [AgencyEventConsoleComponent],
  template: `<ew-agency-event-console [config]="config"></ew-agency-event-console>`,
})
export class MlfLivestockComponent {
  config: ConsoleConfig = {
    agency: 'mlf', collectionKey: 'outbreaks', typeOptions: AGENCY_HAZARDS['mlf'],
    fields: [
      { key: 'disease', label: 'Condition / disease', type: 'select', options: LIVESTOCK_CONDITIONS },
      { key: 'specify_disease', label: 'Specify', type: 'text', placeholder: 'Condition name', showIf: it => it.disease === 'Other' },
      { key: 'confirmed_cases', label: 'Affected animals', type: 'number', min: 0, step: 1 },
      { key: 'deaths', label: 'Deaths', type: 'number', min: 0, step: 1 },
      { key: 'trend', label: 'Trend', type: 'select', options: TRENDS },
      { key: 'response_actions', label: 'Response actions', type: 'textarea', placeholder: 'Veterinary / fisheries response actions taken…' },
    ],
    newItem: () => ({ disease: 'Foot and Mouth Disease', confirmed_cases: 0, deaths: 0, trend: 'Increasing', response_actions: '' }),
  };
}
