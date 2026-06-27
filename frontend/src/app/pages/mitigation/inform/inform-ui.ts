// Shared scoped styles for the INFORM tab components, so each renders consistently inside DMIS
// without depending on any external global CSS.
export const INFORM_STYLES = `
  .muted { color: var(--text-mid, #64748b); font-size: .9rem; }
  .error { color: #b91c1c; font-weight: 600; }
  .success { color: #047857; font-weight: 600; }
  .field { display: flex; flex-direction: column; gap: .25rem; }
  .field label { font-size: .72rem; font-weight: 700; color: var(--text-mid, #475569); text-transform: uppercase; letter-spacing: .04em; }
  .field select, .field input, input.cell { font: inherit; font-size: .85rem; padding: .4rem .55rem; border: 1px solid var(--line, #cbd5e1); border-radius: 6px; color: var(--text-dark, #1e293b); background: #fff; }
  .card { background: #fff; border: 1px solid var(--line, #e2e8f0); border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: .84rem; }
  th, td { text-align: left; padding: .5rem .65rem; border-bottom: 1px solid var(--line, #e2e8f0); white-space: nowrap; }
  th { color: var(--text-mid, #475569); font-weight: 700; background: #f8fafc; position: sticky; top: 0; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill { font-size: .72rem; font-weight: 700; padding: .1rem .5rem; border-radius: 999px; background: #eef2ff; color: #3730a3; }
  .score { display: inline-block; min-width: 2.2rem; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; padding: .12rem .4rem; border-radius: 6px; background: #eff6ff; color: #1d4ed8; }
  .score.empty { background: transparent; color: #94a3b8; font-weight: 500; }
  .btn { font: inherit; font-size: .82rem; font-weight: 700; padding: .4rem .9rem; border-radius: 6px; cursor: pointer; border: 1.5px solid var(--module-color, #0d6efd); background: var(--module-color, #0d6efd); color: #fff; }
  .btn:disabled { opacity: .55; cursor: default; }
  .btn.ghost { background: #fff; color: var(--module-color, #0d6efd); }
  .btn.no { background: #fff; color: #b91c1c; border-color: #fca5a5; }
  .row-controls { display: flex; gap: .8rem; align-items: flex-end; flex-wrap: wrap; margin-bottom: 1rem; }
`;
