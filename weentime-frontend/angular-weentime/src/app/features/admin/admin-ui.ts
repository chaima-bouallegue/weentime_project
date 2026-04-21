export interface AdminBreadcrumb {
  label: string;
  route?: string;
}

export interface AdminPermissionGroup {
  label: string;
  permissions: string[];
}

export const ADMIN_ROLE_OPTIONS = [
  { value: 'ROLE_ADMIN', label: 'Admin' },
  { value: 'ROLE_RH', label: 'RH' },
  { value: 'ROLE_MANAGER', label: 'Manager' },
  { value: 'ROLE_EMPLOYEE', label: 'Employee' }
] as const;

export const ADMIN_ROLE_BADGES: Record<string, { label: string; tone: string }> = {
  ROLE_ADMIN: { label: 'Admin', tone: 'danger' },
  ROLE_RH: { label: 'RH', tone: 'info' },
  ROLE_MANAGER: { label: 'Manager', tone: 'success' },
  ROLE_EMPLOYEE: { label: 'Employee', tone: 'neutral' }
};

export const ADMIN_PERMISSION_GROUPS: AdminPermissionGroup[] = [
  {
    label: 'Organisation',
    permissions: [
      'users.read',
      'users.write',
      'roles.manage',
      'organisation.manage'
    ]
  },
  {
    label: 'Workflow RH',
    permissions: [
      'requests.read',
      'requests.approve',
      'telework.manage',
      'leave.manage'
    ]
  },
  {
    label: 'Analytics',
    permissions: [
      'analytics.read',
      'presence.read',
      'settings.manage'
    ]
  }
];

export const REQUEST_STATUS_TABS = [
  { label: 'Pending', value: 'EN_ATTENTE' },
  { label: 'Approved', value: 'VALIDEE' },
  { label: 'Rejected', value: 'REJETEE' }
] as const;

export const REQUEST_STATUS_META: Record<string, { label: string; tone: string }> = {
  EN_ATTENTE: { label: 'Pending', tone: 'warning' },
  VALIDEE: { label: 'Approved', tone: 'success' },
  REJETEE: { label: 'Rejected', tone: 'danger' }
};

export function formatRoleLabel(role: string): string {
  return ADMIN_ROLE_BADGES[role]?.label ?? role.replace('ROLE_', '');
}

export function buildInitials(label?: string | null): string {
  return (label ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'WT';
}
