/**
 * Frontend permission map — mirrors the backend ModuleGuardFilter so the menu and route guard hide
 * exactly what the API would deny (403). A module/route is shown only if the user holds its permission;
 * unmapped routes are open (the backend stays the real enforcement). Permission names are the snake-case
 * {@code module.action} from public.permissions, carried on the login user + JWT.
 */

export type PermissionRequirement = string | string[];

/** Module (hub/menu card) slug -> the permission(s) that grant it. A string = that permission; an array =
 *  ANY of them (the card shows if the user holds at least one of its sub-area permissions). Slugs with no
 *  mapping are always shown. */
export const MODULE_PERMISSION: Record<string, PermissionRequirement> = {
  'prevention-mitigation': [
    'prevention_dashboard.view',
    'hazards.view',
    'mitigation_measures.view',
    'risk_assessment.view',
    'strategic_infrastructure.view',
    'disaster_repository.view',
    'risk_mapping.view',
    'risk_index.view',
  ],
  // Preparedness card appears if the user can see any operational preparedness sub-area. The EW workbench
  // is authoring-tier; area officers receive issued warnings through Response, not this module.
  'preparedness': ['preparedness.view', 'early_warning.view', 'early_warning.create',
    'warehouse_and_stock.view', 'anticipatory_action_plans.view', 'contingency_plans.view'],
  'response': 'incidents.view',
  'recovery': 'recovery.view',
  'budget-finance': 'budget_and_finance.view',
  'one-health': 'one_health.view',
  'reports-analytics': 'reports_and_analytics.view',
  'monitoring-evaluation': ['monitoring_evaluation.view', 'monitoring_evaluation.enter', 'monitoring_evaluation.manage'],
  'user-management': [
    'user_management.view',
    'roles_and_permissions.view',
    'location_management.view',
    'resource_catalogue.view',
    'approval_workflows.view',
    'translations.view',
  ],
  'content-management': ['content_management.view', 'communication_and_alerts.view', 'hazards.view'],
  // Portal shell is separate from internal response/resource controls. Partner donation/support pages use
  // stakeholder_portal.donate; the Open Needs worklist remains a PMO resource-allocation surface.
  'stakeholder-portal': [
    'stakeholder_portal.view',
    'stakeholder_portal.donate',
    'command_post.view',
    'stakeholders.view',
    'resource_allocation.view',
    'one_health.view',
  ],
};

/** Route prefix -> required permission (longest match wins). Mirrors the backend ModuleGuardFilter. */
const ROUTE_PERMISSION: ReadonlyArray<readonly [string, PermissionRequirement]> = [
  ['/m/budget-finance', 'budget_and_finance.view'],
  ['/m/response/issued-alerts', 'incidents.view'],
  ['/m/response/incidents', 'incidents.view'],
  ['/m/response/approvals', 'resource_allocation.view'],
  ['/m/response/resource-approvals', 'resource_allocation.view'],
  ['/m/response/resource-dispatch', 'resource_allocation.view'],
  ['/m/response/dispatch', 'resource_allocation.view'],
  ['/m/response/dispatch-approvals', 'resource_allocation.view'],
  ['/m/response/procurement', 'resource_allocation.view'],
  ['/m/response/assessments', 'damage_assessment.view'],
  ['/m/response/dlna', 'damage_assessment.view'],
  ['/m/response/recovery-plan', 'damage_assessment.view'],
  ['/m/response/declarations', 'disaster_declarations.view'],
  // Command Post is shared with area approvers; the EOCC Command Center + Executive Watch are command-tier
  // (higher command_post actions) so field/area approvers see Command Post but not the command dashboards.
  ['/m/response/coordination', 'command_post.view'],
  ['/m/response/eocc', 'command_post.activate'],
  ['/m/response/executive-watch', 'command_post.posture'],
  ['/m/response/public-reports', 'incidents.view'],
  ['/m/response/donations', 'resource_allocation.view'],
  ['/m/response/support-needs', 'resource_allocation.view'],
  ['/m/response/tasks', 'tasks.view'],
  ['/m/response/communication', 'communication_and_alerts.send'],
  ['/m/response/dashboard', 'incidents.view'],
  ['/m/response/warehouse-ops', 'warehouse_and_stock.view'],
  // EW is the authoring/operations workbench (EW entities / PMO / EOCC). Area officers receive issued
  // warnings through the read-only Response issued-alerts surface, not the Preparedness EW console.
  ['/m/preparedness/early-warnings/scanner', 'early_warning.create'],
  ['/m/preparedness/early-warnings/new-bulletin', 'early_warning.create'],
  ['/m/preparedness/early-warnings/eocc-bulletin', 'early_warning.create'],
  ['/m/preparedness/early-warnings/consolidated', 'early_warning.create'],
  ['/m/preparedness/early-warnings/mow', 'early_warning.create'],
  ['/m/preparedness/early-warnings/gst', 'early_warning.create'],
  ['/m/preparedness/early-warnings/moh', 'early_warning.create'],
  ['/m/preparedness/early-warnings/moa', 'early_warning.create'],
  ['/m/preparedness/early-warnings/nemc', 'early_warning.create'],
  ['/m/preparedness/early-warnings/mlf', 'early_warning.create'],
  ['/m/preparedness/early-warnings', 'early_warning.create'],
  ['/m/preparedness/anticipatory-plans', 'anticipatory_action_plans.view'],
  ['/m/preparedness/contingency-plans', 'contingency_plans.view'],
  // Create/edit form — manage only (must be longer prefix than the registry path below)
  ['/m/preparedness/evacuation-centers/create', 'preparedness.manage'],
  // Registry is read-usable for EW / incident route support (writes still API-gated to manage)
  ['/m/preparedness/evacuation-centers', ['preparedness.view', 'early_warning.view', 'incidents.view']],
  ['/m/preparedness/trainings', 'preparedness.view'],
  ['/m/preparedness/alert-subscriptions', 'preparedness.view'],
  ['/m/preparedness/warehouses', 'warehouse_and_stock.view'],
  ['/m/preparedness/temporary-warehouses', 'warehouse_and_stock.view'],
  ['/m/preparedness/inventory', 'warehouse_and_stock.view'],
  ['/m/preparedness', 'preparedness.view'],
  ['/m/one-health/directives', 'one_health.directive'],
  ['/m/one-health/dissemination', ['one_health.disseminate', 'one_health.approve', 'one_health.manage']],
  ['/m/one-health', 'one_health.view'],
  // The two Recovery desks over the assessment registry require the same permission as the API they call.
  ['/m/recovery/needs-assessment', 'damage_assessment.view'],
  ['/m/recovery/damage-assessments', 'damage_assessment.view'],
  ['/m/recovery', 'recovery.view'],
  ['/m/reports-analytics/early-warning-management', 'early_warning.view'],
  // F119: registry readable by .view holders; authoring actions stay enter-gated in the API.
  ['/m/reports-analytics/repository', ['disaster_repository.view', 'disaster_repository.enter']],
  ['/m/reports-analytics/incident-reports', 'incidents.view'],
  ['/m/reports-analytics/resource-reports', 'resource_allocation.view'],
  ['/m/reports-analytics/documents', 'damage_assessment.view'],
  ['/m/reports-analytics/analytics', 'reports_and_analytics.view'],
  ['/m/reports-analytics/gis-map', 'reports_and_analytics.view'],
  ['/m/reports-analytics', 'reports_and_analytics.view'],
  ['/m/monitoring-evaluation/workbench', ['monitoring_evaluation.enter', 'monitoring_evaluation.manage']],
  ['/m/monitoring-evaluation', 'monitoring_evaluation.view'],
  ['/m/prevention-mitigation/dashboard', 'prevention_dashboard.view'],
  ['/m/prevention-mitigation/hazards/create', 'hazards.manage'],
  ['/m/prevention-mitigation/hazards/:id/edit', 'hazards.manage'],
  ['/m/prevention-mitigation/hazards', 'hazards.view'],
  ['/m/prevention-mitigation/measures/create', 'mitigation_measures.manage'],
  ['/m/prevention-mitigation/measures/:id/edit', 'mitigation_measures.manage'],
  ['/m/prevention-mitigation/measures', 'mitigation_measures.view'],
  ['/m/prevention-mitigation/risk-assessments/create', 'risk_assessment.create'],
  ['/m/prevention-mitigation/risk-assessments/:id/edit', 'risk_assessment.create'],
  ['/m/prevention-mitigation/risk-assessments', 'risk_assessment.view'],
  ['/m/prevention-mitigation/infrastructure/create', 'strategic_infrastructure.manage'],
  ['/m/prevention-mitigation/infrastructure/:id/edit', 'strategic_infrastructure.manage'],
  ['/m/prevention-mitigation/infrastructure', 'strategic_infrastructure.view'],
  ['/m/prevention-mitigation/past-disasters/create', 'disaster_repository.enter'],
  ['/m/prevention-mitigation/past-disasters/:id/edit', 'disaster_repository.enter'],
  ['/m/prevention-mitigation/past-disasters', 'disaster_repository.view'],
  ['/m/prevention-mitigation/risk-mapping', 'risk_mapping.view'],
  ['/m/prevention-mitigation/risk-index', 'risk_index.view'],
  ['/m/prevention-mitigation', [
    'prevention_dashboard.view',
    'hazards.view',
    'mitigation_measures.view',
    'risk_assessment.view',
    'strategic_infrastructure.view',
    'disaster_repository.view',
    'risk_mapping.view',
    'risk_index.view',
  ]],
  ['/m/user-management/approval-workflows', 'approval_workflows.view'],
  ['/m/user-management/resource-settings', 'resource_catalogue.view'],
  ['/m/user-management/incident-types', 'resource_catalogue.view'],
  ['/m/user-management/institutions', 'user_management.view'],
  ['/m/user-management/agencies', 'user_management.view'],
  ['/m/user-management/translations', 'translations.view'],
  ['/m/user-management/users', 'user_management.view'],
  ['/m/user-management/locations', 'location_management.view'],
  ['/m/user-management/roles', 'roles_and_permissions.view'],
  ['/m/user-management', [
    'user_management.view',
    'roles_and_permissions.view',
    'location_management.view',
    'resource_catalogue.view',
    'approval_workflows.view',
    'translations.view',
  ]],
  ['/m/content-management/frameworks/create', 'content_management.manage'],
  ['/m/content-management/frameworks/:id/edit', 'content_management.manage'],
  ['/m/content-management/communication-center', 'communication_and_alerts.view'],
  ['/m/content-management/hazard-monitor', 'hazards.view'],
  ['/m/content-management', ['content_management.view', 'communication_and_alerts.view', 'hazards.view']],
  ['/m/stakeholder-portal/coordination', 'command_post.view'],
  ['/m/stakeholder-portal/directory', 'stakeholders.view'],
  ['/m/stakeholder-portal/donations', ['stakeholder_portal.donate', 'resource_allocation.view']],
  ['/m/stakeholder-portal/open-needs', 'resource_allocation.view'],
  ['/m/stakeholder-portal/support-needs', ['stakeholder_portal.donate', 'resource_allocation.view']],
  ['/m/stakeholder-portal/issued-alerts', 'stakeholder_portal.view'],
  ['/m/stakeholder-portal/one-health', 'one_health.view'],
  ['/m/stakeholder-portal', [
    'stakeholder_portal.view',
    'stakeholder_portal.donate',
    'command_post.view',
    'stakeholders.view',
    'resource_allocation.view',
    'one_health.view',
  ]],
];

/** The permission required to open a route URL, or null if the route is unguarded. */
export function routePermission(url: string): PermissionRequirement | null {
  const path = (url || '').split('?')[0];
  let best = '';
  let perm: PermissionRequirement | null = null;
  for (const [prefix, p] of ROUTE_PERMISSION) {
    if (routeMatches(prefix, path) && prefix.length > best.length) {
      best = prefix;
      perm = p;
    }
  }
  return perm;
}

function routeMatches(pattern: string, path: string): boolean {
  if (!pattern.includes(':')) {
    return path === pattern || path.startsWith(pattern + '/');
  }
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) {
    return false;
  }
  return patternParts.every((part, idx) => part.startsWith(':') || part === pathParts[idx]);
}

export function hasRequiredPermission(
  hasPermission: (permission: string) => boolean,
  required: PermissionRequirement | null,
): boolean {
  if (!required) {
    return true;
  }
  return Array.isArray(required) ? required.some(p => hasPermission(p)) : hasPermission(required);
}
