import { Module } from './modules';

/**
 * Role → which top-level MODULES appear on the hub/menu. This is a FRONTEND FOCUS aid only — it shows
 * each role the areas they actually work in (it is NOT a security control; the backend @PreAuthorize
 * gates remain the real enforcement). Tune freely; '*' = see every module. Keys are the SRS role names
 * (public.roles.name). Unknown role or no role => fail-open (see all), so nobody is ever locked out by
 * a mapping gap. Module keys are Module.slug from core/modules.ts.
 *
 * Derived from the backend Authz role-group gates + the operational intent:
 *  - EW / One-Health sector focal (MDA Focal) -> Preparedness(EW) + One Health + planning + assess
 *  - response roles (RAS/Reg DC/DAS/Dist DC/EOCC) -> Response + One Health + Preparedness
 *  - stakeholders (Partners) -> Stakeholder Portal + Response (incidents/donations) + One Health
 *  - admins (Super Admin/ICT Admin) -> everything; senior leadership -> broad operational set
 */
const ALL = '*' as const;

const MODULE_ACCESS: Record<string, '*' | string[]> = {
  'Super Admin': ALL,
  'ICT Admin': ALL,
  'Director': ['prevention-mitigation', 'preparedness', 'response', 'recovery', 'one-health', 'reports-analytics', 'content-management', 'stakeholder-portal'],
  'Secretary': ['response', 'recovery', 'one-health', 'reports-analytics'],
  'Asst. Director': ['prevention-mitigation', 'preparedness', 'response', 'recovery', 'one-health', 'reports-analytics'],
  'EOCC': ['prevention-mitigation', 'preparedness', 'response', 'recovery', 'one-health', 'reports-analytics'],
  'Comms Officer': ['content-management', 'one-health', 'response', 'preparedness', 'reports-analytics'],
  'MDA Focal': ['preparedness', 'one-health', 'prevention-mitigation', 'response', 'recovery', 'reports-analytics'],
  'RAS': ['response', 'one-health', 'preparedness', 'prevention-mitigation', 'reports-analytics'],
  'Reg DC': ['response', 'one-health', 'preparedness', 'prevention-mitigation', 'reports-analytics'],
  'DAS': ['response', 'one-health', 'preparedness', 'reports-analytics'],
  'Dist DC': ['response', 'one-health', 'preparedness', 'reports-analytics'],
  'Partners': ['stakeholder-portal', 'response', 'one-health', 'reports-analytics'],
};

/** Filter the module list to those the user's role(s) should see. Fail-open (unknown/empty role -> all). */
export function visibleModules(all: Module[], roles: string[] | null | undefined): Module[] {
  if (!roles || roles.length === 0) {
    return all;
  }
  const allowed = new Set<string>();
  for (const role of roles) {
    const access = MODULE_ACCESS[role];
    if (access === undefined || access === ALL) {
      return all; // unknown role or full-access role -> show everything (fail-open)
    }
    access.forEach(slug => allowed.add(slug));
  }
  return all.filter(m => allowed.has(m.slug));
}
