import { DLNA_SECTIONS, DlnaField, dlnaDisplay } from './dlna-schema';

/**
 * Self-contained HTML builders for the PDF filings (NDRF Annex 1 + Annex 2). They walk the
 * SAME schema as the keying form and the on-screen document, so the filed PDF can never
 * drift from what was keyed. Every data value is HTML-escaped; CSS is inline (the server
 * converter resolves no external resources).
 */

const DOC_CSS = `
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5px; color: #1f2937; margin: 28px 34px; }
  .head { text-align: center; border-bottom: 2px solid #0d3b66; padding-bottom: 10px; margin-bottom: 14px; }
  .head .gov { font-weight: bold; letter-spacing: 0.5px; font-size: 11.5px; }
  .head .office { font-size: 10px; color: #475569; }
  .head h1 { font-size: 13.5px; margin: 8px 0 2px; color: #0d3b66; }
  .head .ref { font-size: 10px; color: #475569; }
  .final { color: #065f46; font-weight: bold; } .progress { color: #92400e; font-weight: bold; }
  h2 { font-size: 12px; color: #0d3b66; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin: 16px 0 6px; page-break-after: avoid; }
  h3 { font-size: 10px; text-transform: uppercase; color: #475569; margin: 10px 0 3px; }
  .kv { width: 100%; border-collapse: collapse; }
  .kv td { padding: 2.5px 4px; border-bottom: 0.5px dotted #e2e8f0; vertical-align: top; }
  .kv td.k { color: #475569; width: 46%; }
  .kv td.v { font-weight: bold; }
  table.rows { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
  table.rows th { text-align: left; border: 0.5px solid #cbd5e1; background: #f1f5f9; padding: 3px 6px; font-size: 9px; text-transform: uppercase; color: #475569; }
  table.rows td { border: 0.5px solid #e2e8f0; padding: 3px 6px; }
  .attr { font-size: 9px; color: #6c757d; font-style: italic; margin: 1px 0 6px; }
  .foot { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e3e6ed; font-size: 9px; color: #6c757d; }
  p { white-space: pre-wrap; margin: 4px 0; }
`;

function esc(v: any): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function docShell(title: string, refLine: string, body: string, footRight: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body>
    <div class="head">
      <div class="gov">THE UNITED REPUBLIC OF TANZANIA</div>
      <div class="office">PRIME MINISTER'S OFFICE — DISASTER MANAGEMENT DEPARTMENT</div>
      <h1>${title}</h1>
      <div class="ref">${refLine}</div>
    </div>
    ${body}
    <div class="foot">Generated from e-MAAFA (DMIS) — keyed data, section-attributed. &nbsp;&nbsp;${esc(footRight)}</div>
  </body></html>`;
}

function kvRows(pairs: Array<[string, any]>): string {
  return `<table class="kv">${pairs.map(([k, v]) =>
    `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v ?? '—') || '—'}</td></tr>`).join('')}</table>`;
}

function rowsTable(columns: Array<{ key: string; label: string }>, rows: any[]): string {
  if (!rows?.length) { return '<table class="kv"><tr><td class="v">—</td></tr></table>'; }
  return `<table class="rows"><thead><tr>${columns.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${columns.map(c => `<td>${esc(r?.[c.key] ?? '—') || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** Annex 1 — the DLNA document from the keyed sections (same visibility rules as the screen). */
export function buildAnnex1Html(a: any, incident: any, sections: any[], covered: any[] = []): string {
  const team = safeArr(a.team_members);
  const interviewees = safeArr(a.interviewees);
  let body = '';
  if (covered.length > 1) {
    body += `<h2>Incidents Covered (${a.scope === 'SAME_HAZARD' ? 'combined — same hazard' : 'combined — multi-hazard'})</h2>` +
      rowsTable([{ key: 'title', label: 'Incident' }, { key: 'hazard', label: 'Hazard' }, { key: 'severity_level', label: 'Severity' }],
        covered.map(ci => ({ ...ci, title: ci.id === a.incident_id ? `${ci.title} (lead)` : ci.title })));
  }
  body += '<h2>1. General Information</h2>' + kvRows([
    ['Date of visit', (a.date_of_visit ?? '').toString().substring(0, 10)],
    ['Region', a.region], ['District', a.district], ['Ward', a.ward], ['Village / Mtaa', a.village],
    ['GPS coordinates', a.gps_coordinates],
    ['Type of disaster', [a.disaster_type, a.disaster_type_other].filter(Boolean).join(' — ')],
    ['Name(s) of affected villages / mitaa', a.affected_villages],
  ]);
  if (team.length) {
    body += '<h3>Assessment team</h3>' + rowsTable(
      [{ key: 'name', label: 'Name' }, { key: 'organization', label: 'Organization' }], team);
  }
  if (interviewees.length) {
    body += '<h3>Person(s) interviewed</h3>' + rowsTable(
      [{ key: 'name', label: 'Name' }, { key: 'position', label: 'Position' }], interviewees);
  }
  for (const sec of sections) {
    const schema = DLNA_SECTIONS.find(s => s.key === sec.section_key);
    if (!schema) { continue; }
    const data = sec.data ?? {};
    body += `<h2>${schema.no}. ${esc(schema.title)}</h2>`;
    body += `<div class="attr">Sector: ${esc(sec.sector_lead)}` +
      (sec.status === 'Submitted'
        ? ` · keyed by ${esc(sec.filled_by_name ?? '—')} on ${esc((sec.filled_at ?? '').toString().substring(0, 10))}`
        : ' · <b>section not yet submitted</b>') + '</div>';
    const pairs: Array<[string, any]> = [];
    const flush = () => { if (pairs.length) { body += kvRows(pairs.splice(0)); } };
    for (const f of schema.fields) {
      if (f.showIf && data?.[f.showIf.key] !== f.showIf.equals) { continue; }
      if (f.type === 'heading') {
        flush();
        body += `<h3>${esc(f.label)}</h3>`;
      } else if (f.type === 'rows') {
        flush();
        body += `<h3 style="text-transform:none">${esc(f.label)}</h3>` + rowsTable(f.columns ?? [], data?.[f.key] ?? []);
      } else {
        pairs.push([f.label, displayValue(f, data?.[f.key])]);
      }
    }
    flush();
  }
  const statusLine = a.status === 'Final'
    ? '<span class="final">FINAL</span>' : '<span class="progress">IN PROGRESS — working copy</span>';
  return docShell('DAMAGE, LOSS AND NEEDS ASSESSMENT (NDRF 2026 — ANNEX 1)',
    `Ref: <b>${esc(a.ref_no ?? 'DLNA #' + a.id)}</b> · Incident: <b>${esc(incident?.title ?? '')}</b> · ${statusLine}`,
    body,
    a.status === 'Final' ? `Finalized ${(a.finalized_at ?? '').toString().substring(0, 10)}` : 'Working copy');
}

/** Annex 2 — the Recovery Implementation Plan document from the chapter data. */
export function buildAnnex2Html(incident: any, dlna: any, ch: any, seedSummary: string): string {
  let body = `<h2>Chapter 1 — Introduction</h2><p>${esc(ch.introduction) || '—'}</p>`;
  body += `<h2>Chapter 2 — Rationale, Objectives and Scope</h2><p>${esc(ch.rationale) || '—'}</p>`;
  body += `<h2>Chapter 3 — Situation Analysis</h2><p><b>Incident record:</b> ${esc(seedSummary)}</p><p>${esc(ch.situation_overview) || '—'}</p>`;
  if (ch.sector_findings?.length) {
    body += rowsTable([{ key: 'sector', label: 'Sector' }, { key: 'findings', label: 'Assessment findings' }], ch.sector_findings);
  }
  body += `<h2>Chapter 4 — Measures Taken to Address the Disaster</h2><p><b>Fiscal and monetary measures:</b> ${esc(ch.measures_fiscal) || '—'}</p>`;
  if (ch.sector_measures?.length) {
    body += rowsTable([{ key: 'sector', label: 'Sector' }, { key: 'measures', label: 'Measures taken' }], ch.sector_measures);
  }
  body += '<h2>Chapter 5 — Proposed Priority Areas in Need of Additional Financing</h2>' +
    rowsTable([{ key: 'sector', label: 'Sector' }, { key: 'relevance', label: 'Relevance' },
      { key: 'activities', label: 'Proposed activities' }], ch.priorities ?? []);
  body += `<h2>Chapter 6 — Monitoring, Evaluation, Accountability and Learning</h2>` +
    `<p><b>Risk and sustainability:</b> ${esc(ch.risk_sustainability) || '—'}</p>` +
    rowsTable([{ key: 'indicator', label: 'Indicator' }, { key: 'baseline', label: 'Baseline' },
      { key: 'target', label: 'Target' }, { key: 'method', label: 'Method' }, { key: 'verification', label: 'Verification' },
      { key: 'frequency', label: 'Frequency' }, { key: 'responsible', label: 'Responsible' }], ch.monitoring ?? []) +
    '<p><b>Reporting timeline:</b> Weekly (Early Recovery) · Monthly (Rehabilitation) · Quarterly (Reconstruction) · Bi-annual/Annual consolidated national reporting · Final Report.</p>';
  const total = (ch.budget ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  body += '<h2>Chapter 7 — Budget, Action Plan and Implementation Matrix</h2>' +
    rowsTable([{ key: 'sector', label: 'Sector' }, { key: 'activity', label: 'Activity' },
      { key: 'amount', label: 'Amount (TZS)' }], ch.budget ?? []) +
    `<p><b>Total proposed budget:</b> ${total.toLocaleString('en-US')} TZS</p>` +
    rowsTable([{ key: 'objective', label: 'Objective' }, { key: 'strategies', label: 'Strategies' },
      { key: 'target', label: 'Target' }, { key: 'timeframe', label: 'Timeframe' },
      { key: 'responsible', label: 'Responsible entity' }, { key: 'output_indicator', label: 'Output indicator' },
      { key: 'outcome_indicator', label: 'Outcome indicator' }], ch.matrix ?? []);
  const dlnaLine = dlna ? ` · informed by ${esc(dlna.ref_no)} (${esc(dlna.status)})` : '';
  return docShell('DISASTER RECOVERY IMPLEMENTATION PLAN (NDRF 2026 — ANNEX 2)',
    `Incident: <b>${esc(incident?.title ?? '')}</b>${dlnaLine}`,
    body, `Incident #${incident?.id ?? ''}`);
}

function displayValue(f: DlnaField, value: any): string {
  return dlnaDisplay(f, value);
}

function safeArr(v: any): any[] {
  if (Array.isArray(v)) { return v; }
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
