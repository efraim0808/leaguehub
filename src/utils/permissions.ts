export type RoleName = 'Super Admin' | 'Admin' | 'Team Manager' | 'Visitor'

export type PermissionAction =
  | 'canAddPlayer'
  | 'canDeletePlayer'
  | 'canEditPlayer'
  | 'canApplyTournament'
  | 'canManageSystem'

export type PermissionRules = Record<PermissionAction, boolean>

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
  const normalized = typeof role === 'string' ? role.trim() : ''
  const rules = ROLE_PERMISSION_RULES[normalized as RoleName]
  return Boolean(rules?.[action])
}

export function getRolePermissionSummary(role: RoleName | string | null | undefined): PermissionRules | null {
  const normalized = typeof role === 'string' ? role.trim() : ''
  const rules = ROLE_PERMISSION_RULES[normalized as RoleName]
  return rules ? { ...rules } : null
}
