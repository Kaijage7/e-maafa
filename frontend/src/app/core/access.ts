/**
 * Frontend permission map — mirrors the backend ModuleGuardFilter so the menu and route guard hide
 * exactly what the API would deny (403). A module/route is shown only if the user holds its permission;
 * unmapped routes are open (the backend stays the real enforcement). Permission names are the snake-case
 * {@code module.action} from public.permissions, carried on the login user + JWT.
 */

/** Module (hub/menu card) slug -> the permission(s) that grant it. A string = that permission; an array =
 *  ANY of them (the card shows if the user holds at least one of its sub-area permissions). Slugs with no
 *  mapping are always shown. */
export const MODULE_PERMISSION: Record<string, string | string[]> = {
  'prevention-mitigation': 'prevention_and_mitigation.view',
  // Preparedness card appears if the user can see ANY of its sub-areas (EW-only logins still reach it).
  'preparedness': ['preparedness.view', 'early_warning.view', 'warehouse_and_stock.view',
    'anticipatory_action_plans.view', 'contingency_plans.view'],
  'response': 'incidents.view',
  'recovery': 'recovery.view',
  'budget-finance': 'budget_and_finance.view',
  'one-health': 'one_health.view',
  'reports-analytics': 'reports_and_analytics.view',
  'user-management': 'user_management.view',
  'content-management': 'content_management.view',
  // No dedicated stakeholder permission exists; gate the portal on resource_allocation.view (partner
  // donations/coordination + command/area-resource roles) so pure EW/comms logins don't see it.
  'stakeholder-portal': 'resource_allocation.view',
};

/** Route prefix -> required permission (longest match wins). Mirrors the backend ModuleGuardFilter. */
const ROUTE_PERMISSION: ReadonlyArray<readonly [string, string]> = [
  ['/m/budget-finance', 'budget_and_finance.view'],
  ['/m/response/incidents', 'incidents.view'],
  ['/m/response/approvals', 'resource_allocation.view'],
  ['/m/response/resource-approvals', 'resource_allocation.view'],
  ['/m/response/resource-dispatch', 'resource_allocation.view'],
  ['/m/response/dispatch', 'resource_allocation.view'],
  ['/m/response/dispatch-approvals', 'resource_allocation.view'],
  ['/m/response/procurement', 'resource_allocation.view'],
  ['/m/response/assessments', 'damage_assessment.view'],
  ['/m/response/declarations', 'disaster_declarations.view'],
  // Command Post is shared with area approvers; the EOCC Command Center + Executive Watch are command-tier
  // (higher command_post actions) so field/area approvers see Command Post but not the command dashboards.
  ['/m/response/coordination', 'command_post.view'],
  ['/m/response/eocc', 'command_post.activate'],
  ['/m/response/executive-watch', 'command_post.posture'],
  ['/m/response/public-reports', 'communication_and_alerts.view'],
  ['/m/response/donations', 'resource_allocation.view'],
  ['/m/response/support-needs', 'resource_allocation.view'],
  ['/m/response/tasks', 'tasks.view'],
  ['/m/response/communication', 'communication_and_alerts.send'],
  ['/m/response/dashboard', 'incidents.view'],
  ['/m/response/warehouse-ops', 'warehouse_and_stock.view'],
  ['/m/preparedness/early-warnings', 'early_warning.view'],
  ['/m/preparedness/anticipatory-plans', 'anticipatory_action_plans.view'],
  ['/m/preparedness/contingency-plans', 'contingency_plans.view'],
  ['/m/preparedness/warehouses', 'warehouse_and_stock.view'],
  ['/m/preparedness/temporary-warehouses', 'warehouse_and_stock.view'],
  ['/m/preparedness/inventory', 'warehouse_and_stock.view'],
  ['/m/preparedness', 'preparedness.view'],
  ['/m/one-health/directives', 'one_health.directive'],
  ['/m/one-health', 'one_health.view'],
  ['/m/recovery', 'recovery.view'],
  ['/m/reports-analytics', 'reports_and_analytics.view'],
  ['/m/prevention-mitigation', 'prevention_and_mitigation.view'],
  ['/m/user-management', 'user_management.view'],
  ['/m/content-management', 'content_management.view'],
];

/** The permission required to open a route URL, or null if the route is unguarded. */
export function routePermission(url: string): string | null {
  const path = (url || '').split('?')[0];
  let best = '';
  let perm: string | null = null;
  for (const [prefix, p] of ROUTE_PERMISSION) {
    if ((path === prefix || path.startsWith(prefix + '/')) && prefix.length > best.length) {
      best = prefix;
      perm = p;
    }
  }
  return perm;
}
