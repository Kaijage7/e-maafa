import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// ---- INFORM backend REST contract (DMIS backend, base /api/v1/inform) ----
// Paths are stable; in DMIS the bearer token is
// attached automatically by the global authInterceptor (no per-call auth here).

export interface Indicator {
  id: string;
  dimension?: string;
  component?: string;
  owner?: string;
  keyedAt?: string;
  tier?: string | number;
  weight?: number;
  unit?: string;
  denominator?: string | null;
  outlier?: string | null;
  fenceLo?: number | null;
  fenceHi?: number | null;
  transform?: string | null;
  sign?: string | null;
  resolvedMin?: number | null;
  resolvedMax?: number | null;
  rangeMin?: number | null;
  rangeMax?: number | null;
  [k: string]: any;
}

export interface Area { code: string; name: string; level: string; parentCode?: string; councilCode?: string; region?: string; }

export interface IndicatorValue {
  id: number | string; indicatorId: string; areaCode: string; level?: string;
  rawValue: number; value0to10: number; owner?: string; status?: string; isLatest?: boolean; ts?: string;
}

export interface RiskComponents { [name: string]: number; }
export interface RiskResult {
  area: string; hazard: number | null; vulnerability: number | null; coping: number | null;
  risk: number | null; components: RiskComponents;
}

// ---- Operational product: decomposed, reliability-flagged Tanzania-EO hazard signals ----
export interface HazardSignalMember { id: string; name: string; score: number; owner: string; }
export interface HazardSignal {
  component: string; signal: number; status: string; coveragePct: number;
  membersPresent: number; membersDesigned: number; reliability: string; members: HazardSignalMember[];
}
export interface SignalsResponse { area: string; signals: HazardSignal[]; }

// Batch rows (one call for the whole council layer — avoids ~195 per-council requests).
export interface RiskRow { area: string; name: string; risk: number | null; }
export interface SignalsRow { area: string; name: string; signals: HazardSignal[]; }

export interface ValuePost { indicatorId: string; areaCode: string; raw?: number; value0to10?: number; by: string; }

export interface PendingValue {
  id: number; indicatorId: string; indicatorName: string; component: string | null; owner: string;
  areaCode: string; areaName: string; rawValue: number; value0to10: number; submittedBy: string; ts: string | null;
}

const BASE = '/api/v1/inform';

@Injectable({ providedIn: 'root' })
export class InformService {
  private http = inject(HttpClient);

  getIndicators(owner?: string, tier?: string): Observable<Indicator[]> {
    let params = new HttpParams();
    if (owner) params = params.set('owner', owner);
    if (tier) params = params.set('tier', tier);
    return this.http.get<Indicator[]>(`${BASE}/indicators`, { params });
  }

  getAreas(level?: string): Observable<Area[]> {
    let params = new HttpParams();
    if (level) params = params.set('level', level);
    return this.http.get<Area[]>(`${BASE}/areas`, { params });
  }

  postValue(body: ValuePost): Observable<IndicatorValue> {
    return this.http.post<IndicatorValue>(`${BASE}/values`, body);
  }

  getPending(owner?: string): Observable<PendingValue[]> {
    let params = new HttpParams();
    if (owner) params = params.set('owner', owner);
    return this.http.get<PendingValue[]>(`${BASE}/pending`, { params });
  }

  approveValue(id: number, by: string): Observable<IndicatorValue> {
    return this.http.post<IndicatorValue>(`${BASE}/values/${id}/approve`, { by });
  }

  rejectValue(id: number, by: string): Observable<IndicatorValue> {
    return this.http.post<IndicatorValue>(`${BASE}/values/${id}/reject`, { by });
  }

  getValues(area?: string): Observable<IndicatorValue[]> {
    let params = new HttpParams();
    if (area) params = params.set('area', area);
    return this.http.get<IndicatorValue[]>(`${BASE}/values`, { params });
  }

  /** STRATEGIC INFORM composite for one area. */
  getRisk(areaCode: string): Observable<RiskResult> {
    return this.http.get<RiskResult>(`${BASE}/risk/${encodeURIComponent(areaCode)}`);
  }

  /** OPERATIONAL EO hazard signals for one area. */
  getSignals(areaCode: string): Observable<SignalsResponse> {
    return this.http.get<SignalsResponse>(`${BASE}/signals/${encodeURIComponent(areaCode)}`);
  }

  /** BATCH strategic risk for a whole level — one call for the map layer. */
  getRiskAll(level: string = 'council'): Observable<RiskRow[]> {
    return this.http.get<RiskRow[]>(`${BASE}/risk`, { params: new HttpParams().set('level', level) });
  }

  /** BATCH operational signals for a whole level — one call for the hazard-signal layer. */
  getSignalsAll(level: string = 'council'): Observable<SignalsRow[]> {
    return this.http.get<SignalsRow[]>(`${BASE}/signals`, { params: new HttpParams().set('level', level) });
  }
}
