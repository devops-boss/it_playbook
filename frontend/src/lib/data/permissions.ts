/**
 * The permission catalogue.
 *
 * This file holds data only. It is deliberately separate from
 * `admin.ts`, which reads the database through the server client and
 * therefore depends on `next/headers`. A component that runs in the
 * browser (the roles panel, which shows the matrix of permissions) can
 * import this file without pulling the server-only modules into the
 * client bundle.
 */
export const PERMISSION_CATALOG = [
  { key: 'view_scenarios', label: 'View scenarios', group: 'Reading' },
  { key: 'feedback', label: 'Leave feedback', group: 'Reading' },
  { key: 'favorites', label: 'Favourites and pins', group: 'Reading' },
  { key: 'create_scenarios', label: 'Create scenarios', group: 'Authoring' },
  { key: 'edit_own_scenario', label: 'Edit own scenarios', group: 'Authoring' },
  { key: 'edit_any_scenario', label: 'Edit any scenarios', group: 'Authoring' },
  { key: 'publish_scenario', label: 'Publish scenarios', group: 'Authoring' },
  { key: 'review_scenario', label: 'Review and approve', group: 'Authoring' },
  { key: 'manage_criteria', label: 'Manage criteria and configuration', group: 'Administration' },
  { key: 'manage_accounts', label: 'Manage accounts', group: 'Administration' },
  { key: 'manage_users', label: 'Manage users and roles', group: 'Administration' },
  { key: 'manage_roles', label: 'Manage roles', group: 'Administration' },
  { key: 'view_analytics', label: 'View analytics', group: 'Administration' },
  { key: 'config_export_import', label: 'Export and import configuration', group: 'Administration' },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]['key'];
export type PermissionGroup = (typeof PERMISSION_CATALOG)[number]['group'];

/** The groups in the order they are shown in the matrix. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  'Reading',
  'Authoring',
  'Administration',
];
