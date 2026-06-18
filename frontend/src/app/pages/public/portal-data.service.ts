import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

/** A clickable hazard education card ("Know Your Hazards"), managed in Content Management. */
export interface HazardCard {
  name: string; icon: string; color: string;
  descriptionEn: string; descriptionSw: string; link: string;
}

/** A capability card ("Core System Features"), managed as the capabilities.items JSON setting. */
export interface CapabilityCard {
  title: string; icon: string; color: string; description: string; link?: string; detail?: string;
}

/** A topbar hotline, managed as the emergency.numbers JSON setting. */
export interface EmergencyNumber {
  number: string; label: string; icon: string; color: string;
}

/**
 * One shared fetch of the public landing payload (warnings, incidents, slides, gallery, news,
 * publications, settings + the managed sections). shareReplay(1) means the layout's topbar, the
 * landing page and /portal all reuse a single request per session.
 */
@Injectable({ providedIn: 'root' })
export class PortalDataService {
  private http = inject(HttpClient);

  readonly landing$: Observable<any> = this.http.get('/api/v1/portal/landing').pipe(shareReplay(1));
}
