/**
 * The module-hub structure, ported verbatim from HomeController::adminModules() in the existing system.
 * Each module = the disaster-management-cycle area; items are its screens. `path` is the Angular route
 * (slug-scoped); the existing Laravel route name is kept in `legacyRoute` for traceability when wiring.
 */
export interface ModuleItem {
  name: string;
  path: string;
  icon: string;
  description: string;
  legacyRoute: string;
  /** Optional sidebar dropdown group (e.g. "Operations", "Resources"). */
  group?: string;
}

export interface Module {
  slug: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  items: ModuleItem[];
  directPath?: string;
}

export const MODULES: Module[] = [
  {
    slug: 'prevention-mitigation', name: 'Prevention & Mitigation', icon: 'fa-shield-alt', color: '#0d6efd',
    description: 'Risk frameworks, hazard management and mitigation measures',
    items: [
      { name: 'Dashboard', path: 'dashboard', icon: 'fa-tachometer-alt', description: 'Prevention & mitigation overview', legacyRoute: 'mitigation.index', group: '1. Overview' },
      { name: 'Hazard Management', path: 'hazards', icon: 'fa-fire', description: 'Manage hazard types and records', legacyRoute: 'admin.hazards.index', group: '2. Hazards & risk' },
      { name: 'Risk Assessments', path: 'risk-assessments', icon: 'fa-search-location', description: 'Hazard risk assessments — likelihood/impact scoring, approval & publishing', legacyRoute: 'admin.risk-assessments.index', group: '2. Hazards & risk' },
      { name: 'Risk Mapping', path: 'risk-mapping', icon: 'fa-map-marked-alt', description: 'Risk assessment and GIS mapping', legacyRoute: 'admin.gis.map', group: '2. Hazards & risk' },
      { name: 'INFORM Risk Index', path: 'risk-index', icon: 'fa-layer-group', description: 'INFORM subnational risk index — hazard, vulnerability & coping by council', legacyRoute: '', group: '2. Hazards & risk' },
      { name: 'Mitigation Measures', path: 'measures', icon: 'fa-shield-virus', description: 'Risk mitigation strategies and measures', legacyRoute: 'mitigation.measures.index', group: '3. Measures by institution' },
      { name: 'Strategic Infrastructure', path: 'infrastructure', icon: 'fa-building', description: 'Critical infrastructure inventory and resilience status', legacyRoute: 'admin.infrastructure-items.index', group: '3. Measures by institution' },
      { name: 'Disaster Repository', path: 'past-disasters', icon: 'fa-history', description: 'Historical disaster records', legacyRoute: 'admin.past-disasters.index', group: '4. History' },
    ],
  },
  {
    slug: 'preparedness', name: 'Preparedness', icon: 'fa-hard-hat', color: '#198754',
    description: 'Preparedness planning, logistics readiness and emergency supplies',
    items: [
      { name: 'Early Warning Systems', path: 'early-warnings', icon: 'fa-exclamation-triangle', description: 'Monitor and manage early warnings', legacyRoute: 'admin.early-warnings.index' },
      { name: 'Anticipatory Action Plans', path: 'anticipatory-plans', icon: 'fa-clipboard-list', description: 'Per-area forecast-triggered preparedness plans', legacyRoute: 'admin.anticipatory-plans.index' },
      { name: 'Contingency Plans', path: 'contingency-plans', icon: 'fa-folder-tree', description: 'Strategic multi-region, multi-sector standing plans', legacyRoute: 'admin.contingency-plans.index' },
      { name: 'Evacuation Centers', path: 'evacuation-centers', icon: 'fa-house-user', description: 'Manage evacuation facilities', legacyRoute: 'admin.evacuation-centers.index' },
      { name: 'Training Plans', path: 'trainings', icon: 'fa-chalkboard-teacher', description: 'Disaster preparedness training', legacyRoute: 'mitigation.trainings.index' },
      { name: 'Warehouses', path: 'warehouses', icon: 'fa-warehouse', description: 'Warehouse locations and capacity', legacyRoute: 'admin.warehouses.index' },
      { name: 'Temporary Warehouses', path: 'temporary-warehouses', icon: 'fa-truck-loading', description: 'Emergency staging areas', legacyRoute: 'admin.temporary-warehouses.index' },
      { name: 'Emergency Supplies', path: 'inventory', icon: 'fa-boxes', description: 'Emergency inventory and stock levels', legacyRoute: 'admin.inventory-items.index' },
      { name: 'Alert Subscriptions', path: 'alert-subscriptions', icon: 'fa-bell', description: 'Manage alert subscriptions', legacyRoute: 'admin.alert-subscriptions.index' },
    ],
  },
  {
    slug: 'response', name: 'Response', icon: 'fa-bolt', color: '#dc3545',
    description: 'EOCC command center, incident management and coordination',
    items: [
      { name: 'Dashboard', path: 'dashboard', icon: 'fa-tachometer-alt', description: 'Response overview dashboard', legacyRoute: 'response.dashboard', group: '1. Command' },
      { name: 'EOCC Command Center', path: 'eocc', icon: 'fa-terminal', description: 'Emergency Operations Command Center', legacyRoute: 'response.eocc.dashboard', group: '1. Command' },
      { name: 'Executive Watch', path: 'executive-watch', icon: 'fa-binoculars', description: 'National situation picture for PM / PS / Directors / President', legacyRoute: 'response.executive.index', group: '1. Command' },
      { name: 'Command Post', path: 'coordination', icon: 'fa-tower-broadcast', description: 'DRF coordination — anticipatory, live & simulation; posture ladder', legacyRoute: 'response.coordination.index', group: '1. Command' },
      { name: 'Disaster Declarations', path: 'declarations', icon: 'fa-file-contract', description: 'Disaster Area (s.32) & State of Emergency (s.33) declarations', legacyRoute: 'response.declarations.index', group: '1. Command' },
      { name: 'Issued Alerts', path: 'issued-alerts', icon: 'fa-bell', description: 'Read-only government warnings and bulletins issued for action', legacyRoute: 'stakeholders.warnings.index', group: '2. Alerts & intake' },
      { name: 'Public Reports', path: 'public-reports', icon: 'fa-flag', description: 'Citizen-submitted hazard reports', legacyRoute: 'admin.public-hazard-reports.index', group: '2. Alerts & intake' },
      { name: 'Active Incidents', path: 'incidents', icon: 'fa-exclamation-triangle', description: 'Manage and track active incidents', legacyRoute: 'admin.incidents.index', group: '3. Incidents & assessment' },
      { name: 'Damage Assessments', path: 'assessments', icon: 'fa-clipboard-check', description: 'File and verify per-incident damage & needs assessments', legacyRoute: 'response.assessment.index', group: '3. Incidents & assessment' },
      { name: 'DLNA & Recovery Plans', path: 'dlna', icon: 'fa-file-lines', description: 'NDRF Annex 1 sector-keyed DLNA and Annex 2 recovery implementation plans', legacyRoute: 'ndrf.annex (new — no Laravel counterpart)', group: '3. Incidents & assessment' },
      { name: 'Resource Approvals', path: 'resource-approvals', icon: 'fa-truck', description: 'Deploy and track resources', legacyRoute: 'admin.resource-approvals.index', group: '4. Resources & logistics' },
      { name: 'Resource Dispatch', path: 'resource-dispatch', icon: 'fa-shipping-fast', description: 'Dispatch resources from sources', legacyRoute: 'admin.resource-dispatch.index', group: '4. Resources & logistics' },
      { name: 'Dispatch Approvals', path: 'dispatch-approvals', icon: 'fa-clipboard-check', description: 'Approve/reject dispatch requests', legacyRoute: 'admin.resource-dispatch.pending-approvals', group: '4. Resources & logistics' },
      { name: 'Procurement Requests', path: 'procurement', icon: 'fa-shopping-cart', description: 'Manage procurement', legacyRoute: 'admin.resource-dispatch.procurement-requests', group: '4. Resources & logistics' },
      { name: 'Warehouse Operations', path: 'warehouse-ops', icon: 'fa-warehouse', description: 'Stock intake, removals, transfers and stock taking', legacyRoute: 'admin.inventory-items.index', group: '4. Resources & logistics' },
      { name: 'Stakeholder Donations', path: 'donations', icon: 'fa-hand-holding-heart', description: 'Manage stakeholder donations', legacyRoute: 'admin.resource-dispatch.stakeholder-donations', group: '4. Resources & logistics' },
      { name: 'Task Assignment', path: 'tasks', icon: 'fa-tasks', description: 'Assign and monitor response tasks', legacyRoute: 'response.tasks.index', group: '5. Coordination' },
      { name: 'Alert Dissemination', path: 'communication', icon: 'fa-comments', description: 'Multi-channel alert distribution', legacyRoute: 'response.communication.index', group: '5. Coordination' },
    ],
  },
  {
    slug: 'recovery', name: 'Recovery', icon: 'fa-hands-helping', color: '#6f42c1',
    description: 'Damage assessment, relief distribution and reconstruction',
    items: [
      { name: 'Disaster Needs Assessment', path: 'needs-assessment', icon: 'fa-clipboard-check', description: 'Assess and document disaster needs', legacyRoute: 'response.assessment.index' },
      { name: 'Assessment Reports', path: 'damage-assessments', icon: 'fa-file-alt', description: 'View detailed assessment reports', legacyRoute: 'admin.damage-assessments.index' },
      { name: 'Relief Distribution', path: 'relief-distributions', icon: 'fa-hand-holding-heart', description: 'Track relief aid distribution', legacyRoute: 'admin.relief-distributions.index' },
      { name: 'Recovery Programs', path: 'recovery-programs', icon: 'fa-tools', description: 'Long-term recovery initiatives', legacyRoute: 'admin.recovery-programs.index' },
      { name: 'Reconstruction Projects', path: 'projects', icon: 'fa-hammer', description: 'Infrastructure reconstruction tracking', legacyRoute: 'mitigation.projects.index' },
      { name: 'Lessons Learned', path: 'lessons', icon: 'fa-book', description: 'Knowledge repository and lessons', legacyRoute: 'mitigation.repository.index' },
    ],
  },
  {
    slug: 'budget-finance', name: 'Budget & Finance', icon: 'fa-coins', color: '#fd7e14',
    description: 'Disaster budgets, NDMF, and interlinked economics of disaster (cash, resources, DRR, forecast)',
    items: [
      { name: 'Disaster Budgets', path: 'budgets', icon: 'fa-wallet', description: 'Tier budgets, line allocations, commitments (commit≠expenditure) and reconciliation', legacyRoute: '' },
      { name: 'Economics of Disaster', path: 'economics', icon: 'fa-chart-line', description: 'Interlinked cash, resources, DRR, threats; annual/seasonal/per-incident deterministic forecast', legacyRoute: '' },
    ],
  },
  {
    slug: 'one-health', name: 'One Health', icon: 'fa-heartbeat', color: '#20c997',
    description: 'Cross-sector disease surveillance and event management',
    items: [
      { name: 'Dashboard', path: 'dashboard', icon: 'fa-tachometer-alt', description: 'One Health overview and statistics', legacyRoute: 'onehealth.dashboard' },
      { name: 'Events', path: 'events', icon: 'fa-calendar-check', description: 'View and manage health events', legacyRoute: 'onehealth.events.index' },
      { name: 'Report Event', path: 'report-event', icon: 'fa-plus-circle', description: 'Report a new health event', legacyRoute: 'onehealth.events.index' },
      { name: 'Directives', path: 'directives', icon: 'fa-clipboard-list', description: 'Issue and track directives', legacyRoute: 'onehealth.directives.index' },
      { name: 'Dissemination', path: 'dissemination', icon: 'fa-broadcast-tower', description: 'Alert dissemination channels', legacyRoute: 'onehealth.dissemination.index' },
    ],
  },
  {
    slug: 'reports-analytics', name: 'Reports & Analytics', icon: 'fa-chart-bar', color: '#fd7e14',
    description: 'Analytics dashboards, incident and resource reports',
    items: [
      { name: 'Disaster Repository', path: 'repository', icon: 'fa-database', description: 'National disaster loss database — Sendai event cards (EOCC data entry)', legacyRoute: 'admin.knowledge-repository.index' },
      { name: 'Sendai Analytics', path: 'analytics', icon: 'fa-chart-pie', description: 'Sendai targets A–G progress, loss trends and DMD intervention insights', legacyRoute: 'admin.dashboard' },
      { name: 'Early Warning Management', path: 'early-warning-management', icon: 'fa-bullseye', description: 'Warning ⇄ incident ⇄ preparedness linkage and early-warning effectiveness', legacyRoute: '' },
      { name: 'Incident Reports', path: 'incident-reports', icon: 'fa-file-alt', description: 'Comprehensive incident reporting', legacyRoute: 'admin.incidents.index' },
      { name: 'Resource Reports', path: 'resource-reports', icon: 'fa-boxes', description: 'Resource allocation reports', legacyRoute: 'response.resource-allocation.report' },
      { name: 'Generated Documents', path: 'documents', icon: 'fa-file-pdf', description: 'Official PDFs generated from keyed data — NDRF DLNA and recovery plan filings', legacyRoute: 'ndrf.filings (new — no Laravel counterpart)' },
      { name: 'GIS Map', path: 'gis-map', icon: 'fa-globe-africa', description: 'Interactive GIS risk map', legacyRoute: 'admin.gis.map' },
    ],
  },
  {
    slug: 'monitoring-evaluation', name: 'Monitoring & Evaluation', icon: 'fa-chart-line', color: '#0f766e',
    description: 'PMO sees the national picture; MDAs and partners enter only their own reporting slice',
    items: [
      { name: 'M&E Dashboard', path: 'dashboard', icon: 'fa-gauge-high', description: 'Scoped indicators — national for PMO, own institution for MDA/partner', legacyRoute: '' },
      { name: 'Data Workbench', path: 'workbench', icon: 'fa-table-cells', description: 'Enter period values for your level only (region/LGA/MDA/partner)', legacyRoute: '' },
    ],
  },
  {
    slug: 'user-management', name: 'System Settings', icon: 'fa-users-cog', color: '#6c757d',
	    description: 'Users, roles, permissions and system registries',
	    items: [
	      { name: 'User Management', path: 'users', icon: 'fa-users', description: 'Manage system users and accounts', legacyRoute: 'admin.users.index' },
	      { name: 'Roles & Permissions', path: 'roles', icon: 'fa-user-shield', description: 'Configure roles and access control', legacyRoute: 'admin.roles.index' },
	      { name: 'Approval Workflows', path: 'approval-workflows', icon: 'fa-tasks', description: 'Configure approval workflows for modules', legacyRoute: 'admin.approval-workflow.index' },
	      { name: 'Location Management', path: 'locations', icon: 'fa-map-marker-alt', description: 'Manage regions, districts and wards', legacyRoute: 'admin.locations.index' },
	      { name: 'Resource Management', path: 'resource-settings', icon: 'fa-cubes', description: 'Configure resources, types, units and approval settings', legacyRoute: 'admin.resource-settings.index' },
	      { name: 'Incident Types', path: 'incident-types', icon: 'fa-triangle-exclamation', description: 'Manage the incident/hazard type catalogue used across Response', legacyRoute: 'admin.incident-types.index' },
	      { name: 'Translations', path: 'translations', icon: 'fa-language', description: 'Bilingual (English / Kiswahili) portal labels and UI strings', legacyRoute: 'admin.translations.index' },
	      { name: 'Institution Registry', path: 'institutions', icon: 'fa-sitemap', description: 'Govern MDAs, partners, policy roles, sectors and M&E obligations', legacyRoute: '' },
	      { name: 'Agencies', path: 'agencies', icon: 'fa-building', description: 'Manage partner agency registry', legacyRoute: 'admin.agencies.index' },
	    ],
	  },
  {
    slug: 'content-management', name: 'Content Management', icon: 'fa-edit', color: '#e83e8c',
    description: 'Manage public portal content and educational materials',
    items: [
      { name: 'Portal Management', path: 'portal-management', icon: 'fa-globe', description: 'Manage landing page content', legacyRoute: 'admin.portal-management.index' },
      { name: 'Educational Content', path: 'educational-content', icon: 'fa-graduation-cap', description: 'Public education materials', legacyRoute: 'admin.educational-content.index' },
	      { name: 'Communication Center', path: 'communication-center', icon: 'fa-tower-broadcast', description: 'SMS, email & alerts — compose, send and delivery logs in one place', legacyRoute: 'admin.sms-management.index' },
      { name: 'QR Outreach', path: 'qr-outreach', icon: 'fa-qrcode', description: 'Printable QR codes that open the public Register / Report / Subscribe pages', legacyRoute: '' },
      { name: 'Publications', path: 'publications', icon: 'fa-file-pdf', description: 'Manage public portal publications', legacyRoute: 'admin.disaster-risk-frameworks.index' },
      { name: 'Risk Frameworks', path: 'frameworks', icon: 'fa-file-contract', description: 'Disaster risk reduction frameworks', legacyRoute: 'mitigation.frameworks.index' },
      { name: 'News & Events', path: 'news', icon: 'fa-newspaper', description: 'Manage news articles and events', legacyRoute: 'admin.portal-news.index' },
      { name: 'Hazard Monitor', path: 'hazard-monitor', icon: 'fa-radar', description: 'Stakeholder hazard monitoring', legacyRoute: 'admin.hazard-monitor.index' },
      { name: 'Action Guide Book', path: 'action-guide', icon: 'fa-book-open', description: 'Edit PMO impact statements by hazard and colour (EN/SW) for EW proposals', legacyRoute: '' },
      { name: 'Public Awareness', path: 'awareness', icon: 'fa-bullhorn', description: 'Public education and awareness campaigns', legacyRoute: 'mitigation.awareness.index' },
    ],
  },
  {
    slug: 'stakeholder-portal', name: 'Stakeholder Portal', icon: 'fa-building', color: '#343a40',
    description: 'Partner-facing portal — coordination, donations, bulletins and One Health reporting',
    items: [
      { name: 'Coordination Hub', path: 'coordination', icon: 'fa-users-between-lines', description: '360° linkage — each partner across response, recovery & warehouse', legacyRoute: 'stakeholders.coordination.index' },
      { name: 'Partner Directory', path: 'directory', icon: 'fa-address-book', description: 'Register, verify and manage partner organizations', legacyRoute: 'admin.stakeholders.index' },
      { name: 'Resource Donations', path: 'donations', icon: 'fa-hand-holding-heart', description: 'Open calls to donate, partner bids and NDMF cash donations', legacyRoute: 'stakeholder.resource-donations.index' },
      { name: 'Open Needs', path: 'open-needs', icon: 'fa-bullhorn', description: 'PMO worklist for open donation calls and unfunded training-support requests', legacyRoute: '' },
      { name: 'Fund a Measure or Training', path: 'support-needs', icon: 'fa-seedling', description: 'Mitigation measures (DRR priorities) and trainings needing support — pledge your contribution', legacyRoute: '' },
      { name: 'Issued Alerts & Active Warnings', path: 'issued-alerts', icon: 'fa-bell', description: 'Read-only: warnings and bulletins issued by the Government', legacyRoute: 'stakeholders.warnings.index' },
      { name: 'One Health Reporting', path: 'one-health', icon: 'fa-notes-medical', description: 'Report One Health events from the field', legacyRoute: 'stakeholders.one-health.events.index' },
    ],
  },
];

export function moduleBySlug(slug: string): Module | undefined {
  return MODULES.find(m => m.slug === slug);
}
