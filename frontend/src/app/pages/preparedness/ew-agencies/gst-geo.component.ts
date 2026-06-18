import { Component } from '@angular/core';
import { AgencyEventConsoleComponent, ConsoleConfig } from './agency-event-console.component';
import { AGENCY_HAZARDS, GST_SEVERITY, VOLCANO_INDEX, VOLCANO_ACTIVITY, LANDSLIDE_TRIGGER, LANDSLIDE_SUSCEPTIBILITY } from './ew-agency.model';

/** GST — Geological Survey. Distinct fields: magnitude/depth/severity (earthquake), volcanic index/activity. */
@Component({
  selector: 'page-gst-geo',
  standalone: true,
  imports: [AgencyEventConsoleComponent],
  template: `<ew-agency-event-console [config]="config"></ew-agency-event-console>`,
})
export class GstGeoComponent {
  config: ConsoleConfig = {
    agency: 'gst', collectionKey: 'events', typeOptions: AGENCY_HAZARDS['gst'],
    fields: [
      { key: 'magnitude', label: 'Magnitude (Mw)', type: 'number', min: 0, max: 10, step: 0.1, showIf: it => it.type === 'EARTHQUAKE' },
      { key: 'depth_km', label: 'Depth (km)', type: 'number', min: 0, max: 700, step: 1, showIf: it => it.type === 'EARTHQUAKE' },
      { key: 'severity', label: 'Severity', type: 'select', options: GST_SEVERITY.map(s => ({ value: s.key, label: s.label })), showIf: it => it.type === 'EARTHQUAKE' },
      { key: 'volcanic_hazard_index', label: 'Volcanic Hazard Index', type: 'select', options: VOLCANO_INDEX, showIf: it => it.type === 'VOLCANO' },
      { key: 'activity_type', label: 'Activity Type', type: 'select', options: VOLCANO_ACTIVITY, showIf: it => it.type === 'VOLCANO' },
      { key: 'landslide_trigger', label: 'Landslide trigger', type: 'select', options: LANDSLIDE_TRIGGER, showIf: it => it.type === 'LANDSLIDES' },
      { key: 'susceptibility', label: 'Susceptibility', type: 'select', options: LANDSLIDE_SUSCEPTIBILITY, showIf: it => it.type === 'LANDSLIDES' },
      { key: 'impacts_expected', label: 'Impacts expected', type: 'textarea', placeholder: 'Expected impacts…' },
    ],
    newItem: () => ({ type: 'EARTHQUAKE', magnitude: 4.0, depth_km: 10.0, severity: 'MODERATE', volcanic_hazard_index: 'Moderate', activity_type: 'Seismic Activity', landslide_trigger: 'Heavy Rainfall', susceptibility: 'High', impacts_expected: '' }),
  };
}
