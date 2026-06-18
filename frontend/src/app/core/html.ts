/**
 * Escape text for safe interpolation into an innerHTML context (e.g. Leaflet popup HTML strings).
 * Public-portal map data can originate from anonymous citizen/agency submissions, so any value placed
 * into a popup template must be escaped to prevent stored/reflected XSS.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
