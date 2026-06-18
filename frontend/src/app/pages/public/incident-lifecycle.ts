/** Maps an incident status to a public-facing lifecycle label + colour for map popups and the snapshot. */
export function incidentLifecycle(status: string | null | undefined): { label: string; color: string } {
  switch ((status || '').toLowerCase()) {
    case 'active response':
    case 'escalated':
      return { label: 'Active response', color: '#dc2626' };
    case 'resolved':
    case 'closed':
      return { label: 'Resolved · closed', color: '#059669' };
    default:
      return { label: 'Open · monitoring', color: '#d97706' };
  }
}
