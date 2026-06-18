import { Component } from '@angular/core';
import { AgencyEventConsoleComponent, ConsoleConfig } from './agency-event-console.component';
import { AQI_LEVELS, POLLUTION_SOURCES, POLLUTANTS } from './ew-agency.model';

/** NEMC — National Environment Management Council. Distinct fields: source, AQI level/value, pollutants. */
@Component({
  selector: 'page-nemc-air',
  standalone: true,
  imports: [AgencyEventConsoleComponent],
  template: `<ew-agency-event-console [config]="config"></ew-agency-event-console>`,
})
export class NemcAirComponent {
  config: ConsoleConfig = {
    agency: 'nemc', collectionKey: 'events', fixedType: 'AIR_POLLUTION',
    fields: [
      { key: 'source', label: 'Pollution source', type: 'select', options: POLLUTION_SOURCES },
      { key: 'specify_source', label: 'Specify source', type: 'text', placeholder: 'Pollution source name', showIf: it => it.source === 'Other' },
      { key: 'aqi_level', label: 'AQI level', type: 'select', options: AQI_LEVELS.map(a => ({ value: a.key, label: a.label })) },
      { key: 'aqi_value', label: 'AQI value', type: 'number', min: 0, max: 500, step: 10 },
      { key: 'pollutants', label: 'Key pollutants', type: 'multiselect', options: POLLUTANTS },
      { key: 'health_advisory', label: 'Health advisory', type: 'textarea', placeholder: 'Health advisory…' },
    ],
    newItem: () => ({ source: 'Industrial Emissions', aqi_level: 'UNHEALTHY_SG', aqi_value: 120, pollutants: ['PM2.5', 'PM10'], health_advisory: '' }),
  };
}
