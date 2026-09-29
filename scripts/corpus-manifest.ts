/**
 * The docs this server indexes: governance pages from Microsoft's public
 * Power Platform documentation (github.com/MicrosoftDocs/power-platform,
 * CC BY 4.0). Pinned to one commit so the index is reproducible; bump
 * COMMIT and re-run `npm run setup` to pick up doc changes.
 */
export const REPO = 'MicrosoftDocs/power-platform';
export const COMMIT = '9c3eda67de8a57bde78c21021f30029daca66e1d';
export const LICENSE = 'CC-BY-4.0';
/** Paths below are relative to this folder in the repo... */
export const REPO_ROOT = 'power-platform';
/** ...and this site root on Microsoft Learn. */
export const BASE_URL = 'https://learn.microsoft.com/power-platform/';

export const DOCS: string[] = [
  // Data policies (DLP) and connectors
  'admin/prevent-data-loss.md',
  'admin/dlp-connector-classification.md',
  'admin/dlp-policy-scope.md',
  'admin/dlp-combined-effect-multiple-policies.md',
  'admin/dlp-impact-policies-apps-flows.md',
  'admin/dlp-custom-connector-parity.md',
  'admin/dlp-known-issues.md',
  'admin/connector-action-control.md',
  'admin/connector-endpoint-filtering.md',
  'admin/advanced-connector-policies.md',
  'admin/connector-off-by-default.md',
  'admin/cross-tenant-restrictions.md',
  // Environments and Managed Environments
  'admin/environments-overview.md',
  'admin/environment-management-overview.md',
  'admin/create-environment.md',
  'admin/control-environment-creation.md',
  'admin/environment-groups.md',
  'admin/environment-groups-rules.md',
  'admin/default-environment-routing.md',
  'admin/move-apps-from-default-environment.md',
  'admin/automatic-environment-cleanup.md',
  'admin/backup-restore-environments.md',
  'admin/copy-environment.md',
  'admin/managed-environment-overview.md',
  'admin/managed-environment-enable.md',
  'admin/managed-environment-sharing-limits.md',
  'admin/managed-environment-solution-checker.md',
  'admin/managed-environment-usage-insights.md',
  'admin/managed-environment-data-policies.md',
  'admin/managed-governance.md',
  'admin/governance-considerations.md',
  'admin/list-tenantsettings.md',
  'admin/content-security-policy.md',
  'admin/control-app-access-environment.md',
  // Security and auditing
  'admin/database-security.md',
  'admin/assign-security-roles.md',
  'admin/create-edit-security-role.md',
  'admin/field-level-security.md',
  'admin/hierarchy-security.md',
  'admin/manage-dataverse-auditing.md',
  // CoE Starter Kit
  'guidance/coe/starter-kit.md',
  'guidance/coe/overview.md',
  'guidance/coe/starter-kit-explained.md',
  'guidance/coe/before-setup-gov.md',
  'guidance/coe/setup.md',
  'guidance/coe/setup-core-components.md',
  'guidance/coe/setup-governance-components.md',
  'guidance/coe/core-components.md',
  'guidance/coe/governance-components.md',
  'guidance/coe/nurture-components.md',
  'guidance/coe/env-mgmt.md',
  'guidance/coe/after-setup.md',
  'guidance/coe/after-setup-tenant-hygiene.md',
  'guidance/coe/admin-tasks-component.md',
  'guidance/coe/teams-governance.md',
  'guidance/coe/limitations.md',
  'guidance/coe/faq.md',
  // ALM
  'alm/basics-alm.md',
  'alm/environment-strategy-alm.md',
  'alm/implement-healthy-alm.md',
  'alm/block-unmanaged-customizations.md',
  'alm/how-managed-solutions-merged.md',
  'alm/conn-ref-env-variables-build-tools.md',
  'alm/dependency-tracking-solution-components.md',
  'alm/create-patches-simplify-solution-updates.md',
  'alm/delegated-deployments-setup.md',
  'alm/custom-host-pipelines.md',
  'alm/devops-github-actions.md',
];
