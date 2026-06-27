// TS port of the INFORM engine standardiser, for the LIVE 0-10 preview during data entry.
// Matches the DMIS backend standardiser so the value shown beside each raw input matches what
// POST /api/v1/inform/values computes. Keep consistent with the backend Standardiser.

export function round1(x: number): number { return Math.floor(x * 10 + 0.5) / 10; }

export function standardise(raw: number | null, s: any, denom: number | null = null): number | null {
  if (raw == null || !isFinite(raw) || !s) return null;
  let x = raw;
  if (s.denominator && s.denominator !== 'None') {
    if (denom == null || !isFinite(denom) || denom === 0) return null;
    x = x / denom;
  }
  if (s.outlier === 'Yes' && s.fenceLo != null && s.fenceHi != null) {
    x = Math.max(Math.min(x, s.fenceHi), s.fenceLo);
  }
  if (s.transform === 'Logarithm') x = Math.log(0.001 + x);
  else if (s.transform === 'Exponential') x = Math.exp(x);
  const mn = s.resolvedMin, mx = s.resolvedMax;
  if (!isFinite(mn) || !isFinite(mx) || mx === mn) return null;
  let sc = 10 * (x - mn) / (mx - mn);
  if (s.sign && String(s.sign).startsWith('Decrease')) sc = 10 - sc;
  sc = Math.max(0, Math.min(10, sc));
  return round1(sc);
}
