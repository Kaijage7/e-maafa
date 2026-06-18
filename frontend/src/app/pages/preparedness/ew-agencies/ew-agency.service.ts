import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AgencyEnvelope } from './ew-agency.model';

export interface OverlayItem { agency: string; type: string; alert_level: string; areas: string[]; districts: string[]; description: string; }
export interface ConsolidatedDay {
  day: number;
  tiers: { major_warning: string[]; warning: string[]; advisory: string[] };   // HYDROMET (TMA+MoW)
  tier_sources: Record<string, string>;   // district -> "AGENCY:TYPE" driving the tier
  overlays: OverlayItem[];                 // non-hydromet hazards (GST/MoH/MoA/NEMC)
  area_count: number;
}
export interface Consolidated { days: ConsolidatedDay[]; comments: Record<string, any[]>; sources: string[]; }

/**
 * Cross-agency Early Warning integration client. Mirrors the Python file-bus as REST:
 *  - submit: every warning entity posts its bulletin here (so all the others can see it).
 *  - latest / allLatest: read one or all entities' latest submissions (interlinking).
 *  - consolidated: PMO-DMD overlay of all inputs (highest-alert-wins per area).
 */
@Injectable({ providedIn: 'root' })
export class EwAgencyService {
  private http = inject(HttpClient);
  private base = '/api/v1/ew';

  submit(agency: string, payload: any): Observable<any> {
    return this.http.post(`${this.base}/agency/${agency}/submission`, payload);
  }
  latest(agency: string): Observable<AgencyEnvelope> {
    return this.http.get<AgencyEnvelope>(`${this.base}/agency/${agency}/latest`);
  }
  allLatest(exclude?: string): Observable<{ agencies: Record<string, AgencyEnvelope>; count: number }> {
    const q = exclude ? `?exclude=${exclude}` : '';
    return this.http.get<{ agencies: Record<string, AgencyEnvelope>; count: number }>(`${this.base}/agency/latest${q}`);
  }
  consolidated(days = 5): Observable<Consolidated> {
    return this.http.get<Consolidated>(`${this.base}/dmd/consolidated?days=${days}`);
  }

  /** Generate the entity's PDF via the UNCHANGED Python engine (kind = agency key, 722e4 or multirisk).
   * Returns the application/pdf blob; the engine answers 500 (→ error callback) when it cannot build it,
   * so a caller only ever stores a real PDF. */
  generate(kind: string, payload: any): Observable<Blob> {
    return this.http.post(`/ew-api/generate/${kind}`, payload, { responseType: 'blob' });
  }

  /** Store a generated bulletin (PDF + geo/envelope metadata) in the national EW product registry —
   * the SAME endpoint TMA uses, so every entity's product lands on the Generated-Bulletins map/list. */
  storeProduct(blob: Blob, meta: any): Observable<any> {
    const fd = new FormData();
    fd.append('pdf', blob, 'bulletin.pdf');
    fd.append('payload', JSON.stringify(meta));
    return this.http.post(`${this.base}/products`, fd);
  }

  /** PMO-DMD → Impact Analysis: push the consolidated multirisk bulletin into the national warning
   * pipeline (creates a pending warning EW-YYYY-NNNNN). bulletin_type='dmd'; PDF is optional. */
  ingestDmd(payload: any, blob?: Blob | null): Observable<any> {
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    fd.append('bulletin_type', 'dmd');
    if (blob) { fd.append('pdf_file', blob, 'impact-bulletin.pdf'); }
    return this.http.post(`/api/ew/bulletins/ingest`, fd);
  }
}
