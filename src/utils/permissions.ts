import { normalizeRoleKey } from '../lib/leaguehub-data'

export type RoleName = 'Super Admin' | 'Admin' | 'Team Manager' | 'Visitor'

export type PermissionAction =
  | 'canAddPlayer'
  | 'canDeletePlayer'
  | 'canEditPlayer'
  | 'canApplyTournament'
  | 'canManageSystem'

export type PermissionRules = Record<PermissionAction, boolean>

const normalizePermissionRole = (role: RoleName | string | null | undefined): RoleName | null => {
  const normalized = normalizeRoleKey(role)
  if (normalized === 'super_admin' || normalized === 'superadmin') return 'Super Admin'
  if (normalized === 'admin' || normalized === 'yonetici') return 'Admin'
  if (normalized === 'team_manager' || normalized === 'takim_yoneticisi') return 'Team Manager'
  if (normalized === 'visitor' || normalized === 'user') return 'Visitor'
  return null
}

export const ROLE_PERMISSION_RULES: Record<RoleName, PermissionRules> = {
  'Super Admin': {
    canAddPlayer: true,
    canDeletePlayer: true,
    canEditPlayer: true,
    canApplyTournament: true,
    canManageSystem: true,
  },
  Admin: {
    canAddPlayer: true,
    canDeletePlayer: true,
    canEditPlayer: true,
    canApplyTournament: true,
    canManageSystem: true,
  },
  'Team Manager': {
    canAddPlayer: true,
    canDeletePlayer: false,
    canEditPlayer: false,
    canApplyTournament: true,
    canManageSystem: false,
  },
  Visitor: {
    canAddPlayer: false,
    canDeletePlayer: false,
    canEditPlayer: false,
    canApplyTournament: false,
    canManageSystem: false,
  },
}

export function checkPermission(role: RoleName | string | null | undefined, action: PermissionAction): boolean {
  const normalized = normalizePermissionRole(role)
  const rules = normalized ? ROLE_PERMISSION_RULES[normalized] : undefined
  return Boolean(rules?.[action])
}

export function getRolePermissionSummary(role: RoleName | string | null | undefined): PermissionRules | null {
  const normalized = normalizePermissionRole(role)
  const rules = normalized ? ROLE_PERMISSION_RULES[normalized] : undefined
  return rules ? { ...rules } : null
}
