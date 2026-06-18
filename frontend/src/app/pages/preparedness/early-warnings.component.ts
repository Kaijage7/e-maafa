import { Component } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { EwFlowPipelineComponent } from './ew-flow-pipeline.component';

/**
 * Early Warning Systems landing — the authoring entry. Shows the end-to-end process pipeline
 * (Hazard Information → Impact Analysis → Dissemination → Monitoring); issued bulletins are viewed and
 * published from the EOCC Bulletin within the Dissemination stage, so no separate warning registry here.
 */
@Component({
  selector: 'page-early-warnings',
  standalone: true,
  imports: [PageHeaderComponent, EwFlowPipelineComponent],
  template: `
    <dmis-page-header title="Early Warning Systems" icon="fa-exclamation-triangle"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Early Warning Systems'}]">
    </dmis-page-header>

    <ew-flow-pipeline></ew-flow-pipeline>
  `,
})
export class EarlyWarningsComponent {}
