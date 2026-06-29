import type { Role } from './user.js'

export type Permission =
  | 'clients:read_all'
  | 'clients:read_assigned'
  | 'clients:create'
  | 'clients:edit'
  | 'matters:read_all'
  | 'matters:read_assigned'
  | 'matters:create'
  | 'matters:edit'
  | 'matters:close'
  | 'calendar:read_all'
  | 'calendar:read_assigned'
  | 'calendar:create'
  | 'users:manage'
  | 'settings:manage'
  | 'audit:view'
  | 'audit:export'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'clients:read_all', 'clients:create', 'clients:edit',
    'matters:read_all', 'matters:create', 'matters:edit', 'matters:close',
    'calendar:read_all', 'calendar:create',
    'users:manage', 'settings:manage',
    'audit:view', 'audit:export',
  ],
  partner: [
    'clients:read_all', 'clients:create', 'clients:edit',
    'matters:read_all', 'matters:create', 'matters:edit', 'matters:close',
    'calendar:read_all', 'calendar:create',
    'audit:view',
  ],
  associate: [
    'clients:read_assigned', 'clients:create', 'clients:edit',
    'matters:read_assigned', 'matters:create', 'matters:edit',
    'calendar:read_assigned', 'calendar:create',
  ],
  clerk: [
    'clients:read_assigned',
    'matters:read_assigned',
    'calendar:read_assigned', 'calendar:create',
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
