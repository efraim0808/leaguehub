import { supabase } from './supabase'
import type {
  AppState,
  ContactMessage,
  Fixture,
  Match,
  MatchEvent,
  PermissionSet,
  Player,
  Role,
  SessionUser,
  Team,
  Tournament,
  User,
} from '../types'

export const defaultPermissions: PermissionSet = {
  fikstur: true,
  puanDurumu: true,
  canliSkor: true,
  disiplin: true,
  takimOnaylari: true,
  takimYonetimi: true,
  galeri: true,
  duyurular: true,
  ayarlar: true,
}

export const createPermissionSet = (overrides: Partial<PermissionSet> = {}): PermissionSet => ({
  ...defaultPermissions,
  ...overrides,
})

export const normalizeRoleKey = (role?: string | null): string =>
  (role ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

export const canManageMatchControls = (role?: string | null): boolean => {
  const normalized = normalizeRoleKey(role)
  return normalized === 'super_admin' || normalized === 'admin'
}

export const normalizeNumberInput = (value: number | string | null | undefined, fallbackValue = 0): number => {
  if (value === '' || value === null || value === undefined) return fallbackValue
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : fallbackValue
}

export const sanitizeDisciplinePatch = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'yellow_cards',
    'red_cards',
    'is_suspended',
  ])

  return Object.entries(payload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined && value !== null) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

const normalizeSingleUuidValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return null

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const matches = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? []

  if (matches.length !== 1 || !uuidPattern.test(trimmed)) {
    return null
  }

  return trimmed
}

export const sanitizeMatchEventPayload = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'id',
    'match_id',
    'team_id',
    'player_id',
    'type',
    'minute',
    'description',
    'created_at',
  ])

  const uuidKeys = new Set(['id', 'match_id', 'team_id', 'player_id'])

  return Object.entries(payload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (!allowedKeys.has(key) || value === undefined) {
      return accumulator
    }

    if (uuidKeys.has(key)) {
      const normalizedValue = normalizeSingleUuidValue(value)
      accumulator[key] = normalizedValue
      return accumulator
    }

    if (value !== null && value !== '') {
      accumulator[key] = value
    }

    return accumulator
  }, {})
}

export const filterSelectablePlayers = <T extends Pick<Player, 'id' | 'isSuspended' | 'suspensionMatches'>>(players: T[]): T[] =>
  players.filter((player) => !player.isSuspended && Number(player.suspensionMatches ?? 0) <= 0)

export const decrementSuspensionTimers = <T extends Pick<Player, 'id' | 'isSuspended' | 'suspensionMatches'>>(players: T[]): T[] =>
  players.map((player) => {
    const currentSuspensionMatches = Math.max(0, Number(player.suspensionMatches ?? 0))
    if (currentSuspensionMatches <= 0) {
      return {
        ...player,
        isSuspended: false,
        suspensionMatches: 0,
      }
    }

    const nextSuspensionMatches = currentSuspensionMatches - 1
    return {
      ...player,
      suspensionMatches: nextSuspensionMatches,
      isSuspended: nextSuspensionMatches > 0,
    }
  })

export const applyCompletedMatchSuspensions = <T extends Team>(teams: T[]): T[] =>
  teams.map((team) => {
    const activeSuspensionPlayers = team.players.filter((player) => Boolean(player.isSuspended) || Number(player.suspensionMatches ?? 0) > 0)
    if (activeSuspensionPlayers.length === 0) {
      return team
    }

    return {
      ...team,
      players: team.players.map((player) => {
        const currentSuspensionMatches = Math.max(0, Number(player.suspensionMatches ?? 0))
        const hasSuspension = Boolean(player.isSuspended) || currentSuspensionMatches > 0
        if (!hasSuspension) {
          return player
        }

        const nextSuspensionMatches = Math.max(0, currentSuspensionMatches - 1)
        return {
          ...player,
          suspensionMatches: nextSuspensionMatches,
          isSuspended: nextSuspensionMatches > 0,
        }
      }),
    }
  })

const normalizeToAscii = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')

export const normalizeUsername = (fullName: string): string =>
  fullName.trim().replace(/\s+/g, '').toLocaleUpperCase('tr-TR')

export const buildHiddenAuthEmail = (username: string): string => {
  const cleanUsername = normalizeToAscii(username.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '')
  return `${cleanUsername || 'user'}@leaguehub.local`
}

export const buildUniqueAuthEmail = (username: string): string => {
  const cleanUsername = normalizeToAscii(username.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '')
  const suffix = Math.random().toString(36).substring(2, 8)
  return `${(cleanUsername || 'user')}_${suffix}@leaguehub.local`
}

export const isTournamentRegistrationOpen = (tournament: Pick<Tournament, 'status'>): boolean => tournament.status === 'Kayıt Açık'

export const createTeamDraftFromName = (teamName: string, managerId: string, overrides: Partial<Pick<Team, 'city' | 'status' | 'logoUrl'>> = {}): Team => ({
  id: `team-${crypto.randomUUID()}`,
  name: teamName.trim(),
  shortName: teamName.trim().slice(0, 3).toUpperCase() || 'TKM',
  city: overrides.city ?? 'Belirtilmedi',
  status: overrides.status ?? 'Onaylı',
  managerId,
  logoUrl: overrides.logoUrl,
  players: [],
})

export const canRegisterTeamToTournament = (tournament: Pick<Tournament, 'status' | 'teams' | 'registeredTeamIds'>, teamId: string): boolean => {
  if (!isTournamentRegistrationOpen(tournament)) return false
  const registeredIds = tournament.registeredTeamIds ?? tournament.teams ?? []
  return !registeredIds.includes(teamId)
}

export const registerTeamForTournament = (
  tournament: Partial<Tournament> & Pick<Tournament, 'status' | 'teams' | 'registeredTeamIds'>,
  teamId: string,
): Tournament => {
  const baseTournament: Tournament = createTournamentDraft({
    id: tournament.id ?? crypto.randomUUID(),
    name: tournament.name ?? 'Turnuva',
    status: tournament.status ?? 'Kayıt Açık',
    startDate: tournament.startDate ?? new Date().toISOString().slice(0, 10),
    scoring: tournament.scoring ?? DEFAULT_TOURNAMENT_SCORING,
    yellowCardRule: tournament.yellowCardRule ?? 2,
    teams: tournament.teams ?? [],
    registeredTeamIds: tournament.registeredTeamIds ?? tournament.teams ?? [],
    fixtures: tournament.fixtures ?? [],
  })

  if (!canRegisterTeamToTournament(baseTournament, teamId)) return baseTournament

  const existing = baseTournament.registeredTeamIds ?? baseTournament.teams ?? []
  const nextRegistered = Array.from(new Set([...existing, teamId]))
  const nextTeams = Array.from(new Set([...baseTournament.teams, teamId]))

  return {
    ...baseTournament,
    teams: nextTeams,
    registeredTeamIds: nextRegistered,
  }
}

export const createUserFromRegistration = (payload: {
  fullName: string
  email: string
  password: string
  phone: string
  tc: string
  acceptKvkk: boolean
}): User => ({
  id: `user-${crypto.randomUUID()}`,
  fullName: payload.fullName.trim(),
  email: payload.email.trim().toLowerCase(),
  password: payload.password,
  username: normalizeUsername(payload.fullName),
  role: 'Visitor',
  isActive: true,
  kvkkAccepted: payload.acceptKvkk,
  phone: payload.phone.trim(),
  tc: payload.tc.trim(),
  teamManagerRequest: false,
  permissions: createPermissionSet({
    fikstur: false,
    puanDurumu: false,
    canliSkor: false,
    disiplin: false,
    takimOnaylari: false,
    takimYonetimi: false,
    galeri: false,
    duyurular: false,
    ayarlar: false,
  }),
  createdAt: new Date().toISOString(),
})

export const getVisitorTestUsers = () => [
  {
    id: 'visitor-seed-1',
    fullName: 'Ziyaretçi Test 1',
    email: 'visitor1@leaguehub.com',
    password: 'VisitorTest123!',
    username: 'ZIYARETCITEST1',
    role: 'Visitor' as const,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: false,
      canliSkor: false,
      disiplin: false,
      takimOnaylari: false,
      takimYonetimi: false,
      galeri: false,
      duyurular: false,
      ayarlar: false,
    }),
  },
  {
    id: 'visitor-seed-2',
    fullName: 'Ziyaretçi Test 2',
    email: 'visitor2@leaguehub.com',
    password: 'VisitorTest456!',
    username: 'ZIYARETCITEST2',
    role: 'Visitor' as const,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: false,
      canliSkor: false,
      disiplin: false,
      takimOnaylari: false,
      takimYonetimi: false,
      galeri: false,
      duyurular: false,
      ayarlar: false,
    }),
  },
  {
    id: 'visitor-seed-3',
    fullName: 'Ziyaretçi Test 3',
    email: 'visitor3@leaguehub.com',
    password: 'VisitorTest789!',
    username: 'ZIYARETCITEST3',
    role: 'Visitor' as const,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: false,
      canliSkor: false,
      disiplin: false,
      takimOnaylari: false,
      takimYonetimi: false,
      galeri: false,
      duyurular: false,
      ayarlar: false,
    }),
  },
  {
    id: 'visitor-seed-4',
    fullName: 'Ziyaretçi Test 4',
    email: 'visitor4@leaguehub.com',
    password: 'VisitorTest101!',
    username: 'ZIYARETCITEST4',
    role: 'Visitor' as const,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: false,
      canliSkor: false,
      disiplin: false,
      takimOnaylari: false,
      takimYonetimi: false,
      galeri: false,
      duyurular: false,
      ayarlar: false,
    }),
  },
]

export const createVisitorTestUsers = async (): Promise<{ created: string[]; existing: string[]; failed: string[] }> => {
  const visitors = getVisitorTestUsers()
  const result = { created: [] as string[], existing: [] as string[], failed: [] as string[] }

  for (const visitor of visitors) {
    const { data, error } = await supabase.auth.signUp({
      email: visitor.email,
      password: visitor.password,
      options: {
        data: {
          full_name: visitor.fullName,
          username: visitor.username,
        },
      },
    })

    if (error) {
      const isDuplicate = /already registered|already exists|duplicate/i.test(error.message)
      if (isDuplicate) {
        result.existing.push(visitor.email)
        continue
      }

      result.failed.push(`${visitor.email}: ${error.message}`)
      continue
    }

    const userId = data.user?.id
    if (!userId) {
      result.failed.push(`${visitor.email}: auth user id dönmedi.`)
      continue
    }

    const usersUpsertResult = await supabase.from('users').upsert({
      id: userId,
      full_name: visitor.fullName,
      email: visitor.email,
      password: visitor.password,
      username: visitor.username,
      role: 'Visitor',
      is_active: true,
      kvkk_accepted: true,
      phone: '',
      tc: '',
      team_id: null,
      team_manager_request: false,
      permissions: visitor.permissions,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    if (usersUpsertResult.error) {
      result.failed.push(`${visitor.email}: ${usersUpsertResult.error.message}`)
      continue
    }

    result.created.push(visitor.email)
  }

  return result
}

export const approveTeamManagerRequest = (users: User[], userId: string): User[] =>
  users.map((user) =>
    user.id === userId
      ? {
          ...user,
          role: 'Team Manager',
          teamManagerRequest: false,
          permissions: {
            ...user.permissions,
            canliSkor: false,
            takimYonetimi: false,
          },
        }
      : user,
  )

export const rejectTeamManagerRequest = (users: User[], userId: string): User[] =>
  users.map((user) =>
    user.id === userId
      ? {
          ...user,
          teamManagerRequest: false,
          permissions: {
            ...user.permissions,
            takimYonetimi: false,
          },
        }
      : user,
  )

export const DEFAULT_TOURNAMENT_SCORING = { win: 3, draw: 1, loss: 0 }

export const createTournamentDraft = (
  overrides: Partial<Tournament> & Pick<Tournament, 'name'> = { name: 'Turnuva' },
): Tournament => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: overrides.name.trim() || 'Turnuva',
  status: overrides.status ?? 'Kayıt Açık',
  startDate: overrides.startDate ?? new Date().toISOString().slice(0, 10),
  scoring: overrides.scoring ?? DEFAULT_TOURNAMENT_SCORING,
  rules: overrides.rules ?? '',
  yellowCardRule: Number(overrides.yellowCardRule ?? 2),
  teams: overrides.teams ?? [],
  registeredTeamIds: overrides.registeredTeamIds ?? overrides.teams ?? [],
  fixtures: overrides.fixtures ?? [],
})

export const removeTournamentById = (tournaments: Tournament[], tournamentId: string): Tournament[] =>
  tournaments.filter((tournament) => tournament.id !== tournamentId)

export const buildTournamentUpdatePayload = (tournament: Tournament) => {
  const nameValue = (tournament.name ?? '').trim() || 'Turnuva'
  const titleValue = (tournament.name ?? '').trim() || 'Turnuva'
  const winPoints = Number(tournament.scoring?.win ?? 3)
  const drawPoints = Number(tournament.scoring?.draw ?? 1)
  const lossPoints = Number(tournament.scoring?.loss ?? 0)

  return {
    id: tournament.id,
    name: nameValue,
    title: titleValue,
    season: new Date(tournament.startDate).getFullYear() || new Date().getFullYear(),
    status: tournament.status,
    start_date: tournament.startDate,
    rules: tournament.rules ?? '',
    points_config: {
      win: winPoints,
      draw: drawPoints,
      loss: lossPoints,
    },
    win_points: winPoints,
    draw_points: drawPoints,
    loss_points: lossPoints,
    yellow_card_limit: Number(tournament.yellowCardRule ?? 2),
    yellow_card_rule: Number(tournament.yellowCardRule ?? 2),
    registered_team_ids: tournament.registeredTeamIds ?? tournament.teams ?? [],
    scoring: {
      win: winPoints,
      draw: drawPoints,
      loss: lossPoints,
    },
    teams: tournament.teams ?? [],
    matches: [],
  }
}

export const createPlayer = (
  name: string,
  unit: string,
  phone: string,
  tc: string,
  options: Partial<Omit<Player, 'id' | 'name' | 'unit' | 'phone' | 'tc'>> = {},
): Player => ({
  id: `player-${crypto.randomUUID()}`,
  name: name.trim(),
  unit: unit.trim(),
  phone: phone.trim(),
  tc: tc.trim(),
  photoUrl: options.photoUrl,
  position: options.position ?? '',
  yellowCards: options.yellowCards ?? 0,
  redCards: options.redCards ?? 0,
  isSuspended: options.isSuspended ?? false,
  isCaptain: options.isCaptain ?? false,
})

export const addPlayerToTeam = (team: Team, player: Player): Team => ({
  ...team,
  players: [...team.players, player],
})

export const buildBenchLineup = (players: Player[], captainId?: string): { starters: Player[]; bench: Player[] } => {
  const starters = players.filter((player) => player.id === captainId || player.isCaptain)
  const bench = players.filter((player) => !starters.some((starter) => starter.id === player.id))
  return { starters, bench }
}

export const toggleSuspension = (team: Team, playerId: string, value: boolean): Team => ({
  ...team,
  players: team.players.map((player) =>
    player.id === playerId
      ? { ...player, isSuspended: value }
      : player,
  ),
})

export const authenticateUser = (
  user: Pick<User, 'email' | 'password'> | null | undefined,
  email: string,
  password: string,
): boolean => {
  if (!user) return false
  return user.email.trim().toLowerCase() === email.trim().toLowerCase() && String(user.password ?? '') === String(password)
}

export const createSeedUsers = (): User[] => [
  {
    id: 'user-super-admin',
    fullName: 'Efraim Yılmaz',
    email: 'sagliksk@gmail.com',
    password: 'Efraim+08',
    username: 'EFRAIMYILMAZ',
    role: 'Super Admin',
    isActive: true,
    kvkkAccepted: true,
    phone: '+905551234567',
    tc: '11111111111',
    teamManagerRequest: false,
    permissions: createPermissionSet(),
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 'user-admin',
    fullName: 'Merve Demir',
    email: 'admin@leaguehub.com',
    password: 'admin123',
    username: 'MERVEDemir',
    role: 'Admin',
    isActive: true,
    kvkkAccepted: true,
    phone: '+905556667788',
    tc: '22222222222',
    teamManagerRequest: false,
    permissions: createPermissionSet({
      fikstur: true,
      puanDurumu: true,
      canliSkor: true,
      disiplin: true,
      takimOnaylari: true,
      takimYonetimi: false,
      galeri: true,
      duyurular: true,
      ayarlar: true,
    }),
    createdAt: '2026-08-02T10:00:00.000Z',
  },
  {
    id: 'user-manager-saglik',
    fullName: 'Ali Kaya',
    email: 'saglik.manager@leaguehub.com',
    password: 'team123',
    username: 'ALIKAYA',
    role: 'Team Manager',
    isActive: true,
    kvkkAccepted: true,
    phone: '+905559998877',
    tc: '33333333333',
    teamId: 'team-saglik-sk',
    teamManagerRequest: false,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: true,
      canliSkor: true,
      disiplin: true,
      takimOnaylari: false,
      takimYonetimi: true,
      galeri: false,
      duyurular: true,
      ayarlar: false,
    }),
    createdAt: '2026-08-03T10:00:00.000Z',
  },
  {
    id: 'user-manager-mediterra',
    fullName: 'Bora Aydın',
    email: 'mediterra.manager@leaguehub.com',
    password: 'team123',
    username: 'BORAAYDIN',
    role: 'Team Manager',
    isActive: true,
    kvkkAccepted: true,
    phone: '+905554443322',
    tc: '44444444444',
    teamId: 'team-mediterra',
    teamManagerRequest: false,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: true,
      canliSkor: true,
      disiplin: true,
      takimOnaylari: false,
      takimYonetimi: true,
      galeri: false,
      duyurular: true,
      ayarlar: false,
    }),
    createdAt: '2026-08-04T10:00:00.000Z',
  },
  {
    id: 'user-manager-asist',
    fullName: 'Cem Reşit',
    email: 'asist.manager@leaguehub.com',
    password: 'team123',
    username: 'CEMRESIT',
    role: 'Team Manager',
    isActive: true,
    kvkkAccepted: true,
    phone: '+905553332211',
    tc: '55555555555',
    teamId: 'team-asist-fk',
    teamManagerRequest: false,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: true,
      canliSkor: true,
      disiplin: true,
      takimOnaylari: false,
      takimYonetimi: true,
      galeri: false,
      duyurular: true,
      ayarlar: false,
    }),
    createdAt: '2026-08-05T10:00:00.000Z',
  },
  {
    id: 'user-manager-imed',
    fullName: 'Deniz Koral',
    email: 'imed.manager@leaguehub.com',
    password: 'team123',
    username: 'DENIZKORAL',
    role: 'Team Manager',
    isActive: true,
    kvkkAccepted: true,
    phone: '+905552221100',
    tc: '66666666666',
    teamId: 'team-imed-fc',
    teamManagerRequest: false,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: true,
      canliSkor: true,
      disiplin: true,
      takimOnaylari: false,
      takimYonetimi: true,
      galeri: false,
      duyurular: true,
      ayarlar: false,
    }),
    createdAt: '2026-08-06T10:00:00.000Z',
  },
  {
    id: 'user-visitor',
    fullName: 'Nur Şahin',
    email: 'visitor@leaguehub.com',
    password: 'visitor123',
    username: 'NURSahin',
    role: 'Visitor',
    isActive: true,
    kvkkAccepted: true,
    phone: '+905554445566',
    tc: '77777777777',
    teamManagerRequest: true,
    permissions: createPermissionSet({
      fikstur: false,
      puanDurumu: false,
      canliSkor: false,
      disiplin: false,
      takimOnaylari: false,
      takimYonetimi: false,
      galeri: false,
      duyurular: false,
      ayarlar: false,
    }),
    createdAt: '2026-08-07T10:00:00.000Z',
  },
]

export const createSeedTeams = (): Team[] => {
  const teamOne = {
    id: 'team-saglik-sk',
    name: 'Sağlık SK',
    shortName: 'SK',
    city: 'İstanbul',
    status: 'Onaylı' as const,
    managerId: 'user-manager-saglik',
    logoUrl: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=300&q=80',
    players: [
      createPlayer('Ali Yılmaz', 'Futbolcu', '+905550000001', '10000000001', { isCaptain: true }),
      createPlayer('Kerem Demir', 'Forvet', '+905550000002', '10000000002'),
      createPlayer('Emre Çelik', 'Defans', '+905550000003', '10000000003'),
      createPlayer('Musa Şen', 'Orta Saha', '+905550000004', '10000000004'),
      createPlayer('Ömer Koca', 'Kaleci', '+905550000005', '10000000005'),
    ],
  }

  const teamTwo = {
    id: 'team-mediterra',
    name: 'Mediterra',
    shortName: 'MED',
    city: 'Antalya',
    status: 'Onaylı' as const,
    managerId: 'user-manager-mediterra',
    logoUrl: 'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=300&q=80',
    players: [
      createPlayer('Baran Korkmaz', 'Kaleci', '+905550000011', '10000000011', { isCaptain: true }),
      createPlayer('Mert Ozan', 'Orta Saha', '+905550000012', '10000000012'),
      createPlayer('Serhat Aydin', 'Kanat', '+905550000013', '10000000013'),
      createPlayer('Tayfun Erol', 'Defans', '+905550000014', '10000000014'),
      createPlayer('Kaan Düz', 'Forvet', '+905550000015', '10000000015'),
    ],
  }

  const teamThree = {
    id: 'team-asist-fk',
    name: 'Asist FK',
    shortName: 'ASİ',
    city: 'Ankara',
    status: 'Onaylı' as const,
    managerId: 'user-manager-asist',
    logoUrl: 'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=300&q=80',
    players: [
      createPlayer('Cenk Arslan', 'Forvet', '+905550000021', '10000000021', { isCaptain: true }),
      createPlayer('Yusuf Kaplan', 'Orta Saha', '+905550000022', '10000000022'),
      createPlayer('Mehmet Taş', 'Defans', '+905550000023', '10000000023'),
      createPlayer('İsmail Kılıç', 'Kanat', '+905550000024', '10000000024'),
      createPlayer('Doğan Yalçın', 'Kaleci', '+905550000025', '10000000025'),
    ],
  }

  const teamFour = {
    id: 'team-imed-fc',
    name: 'İmed FC',
    shortName: 'İMED',
    city: 'İzmir',
    status: 'Onaylı' as const,
    managerId: 'user-manager-imed',
    logoUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=300&q=80',
    players: [
      createPlayer('Levent Şimşek', 'Kanat', '+905550000031', '10000000031', { isCaptain: true }),
      createPlayer('Rıza Bulut', 'Defans', '+905550000032', '10000000032'),
      createPlayer('Eren Topal', 'Orta Saha', '+905550000033', '10000000033'),
      createPlayer('Gökalp Uçar', 'Forvet', '+905550000034', '10000000034'),
      createPlayer('Volkan Kıran', 'Kaleci', '+905550000035', '10000000035'),
    ],
  }

  return [teamOne, teamTwo, teamThree, teamFour]
}

export const createFixtureCalendar = (tournamentId: string, teamIds: string[]): Fixture[] => {
  const fixtures: Fixture[] = []
  for (let index = 0; index < teamIds.length; index += 1) {
    for (let next = index + 1; next < teamIds.length; next += 1) {
      const homeTeamId = teamIds[index]
      const awayTeamId = teamIds[next]
      fixtures.push({
        id: `${tournamentId}-fixture-${fixtures.length + 1}`,
        tournamentId,
        homeTeamId,
        awayTeamId,
        date: '2026-09-02',
        time: `${18 + fixtures.length}:00`,
        venue: 'Spor Kompleksi',
        status: 'Planlandı',
        homeScore: 0,
        awayScore: 0,
      })
    }
  }
  return fixtures
}

export const createSeedTournaments = (): Tournament[] => {
  const teamIds = ['team-saglik-sk', 'team-mediterra', 'team-asist-fk', 'team-imed-fc']
  return [
    {
      id: 'tourney-1',
      name: 'Sağlıkçılar Süper Lig',
      status: 'Turnuva Başladı',
      startDate: '2026-09-02T18:00:00.000Z',
      scoring: { ...DEFAULT_TOURNAMENT_SCORING },
      rules: 'Sportmenlik kuralları uygulanır. Kural dışı davranışlarda disiplin kuruluna bildirilir.',
      yellowCardRule: 2,
      teams: teamIds,
      fixtures: createFixtureCalendar('tourney-1', teamIds),
    },
    {
      id: 'tourney-2',
      name: 'Şehirlerarası Kupası',
      status: 'Kayıt Açık',
      startDate: '2026-10-10T18:00:00.000Z',
      scoring: { ...DEFAULT_TOURNAMENT_SCORING },
      rules: 'Maç öncesi kadro listesi teslim edilir. Oyuncu değişiklikleri kurallar dahilindedir.',
      yellowCardRule: 2,
      teams: teamIds,
      fixtures: createFixtureCalendar('tourney-2', teamIds),
    },
  ]
}

export const createSeedAnnouncements = () => [
  { id: 'announcement-1', title: 'Açık Kayıt Dönemi', body: 'Yeni turnuva açıldı.', date: '2026-08-25T10:00:00.000Z' },
  { id: 'announcement-2', title: 'Canlı Yayın', body: 'Perşembe akşamı canlı yayın başlıyor.', date: '2026-08-26T10:00:00.000Z' },
]

export const createSeedMessages = (users: User[]): ContactMessage[] => [
  {
    id: 'message-1',
    senderId: users[0].id,
    senderName: users[0].fullName,
    title: 'Turnuva bilgisi',
    body: 'Haftalık düzenleme e-postaya gönderilecek.',
    read: false,
    createdAt: '2026-08-25T10:00:00.000Z',
  },
]

export const createInitialAppState = (): AppState => {
  const users = createSeedUsers()
  return {
    users,
    teams: createSeedTeams(),
    tournaments: createSeedTournaments(),
    matches: [],
    announcements: createSeedAnnouncements(),
    gallery: [
      { id: 'gallery-1', title: 'Kupa Töreni', image: 'https://example.com/image1.jpg', category: 'Turnuva' },
    ],
    messages: createSeedMessages(users),
    passwordResetRequests: [],
    tournamentApplications: [],
    disciplineRecords: [],
  }
}

export const createSessionUser = (user: User): SessionUser => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  teamId: user.teamId,
  username: user.username,
})

export const saveSession = (session: SessionUser | null, storage: Pick<Storage, 'setItem' | 'removeItem'>): void => {
  if (session) {
    storage.setItem('leaguehub-session', JSON.stringify(session))
    return
  }
  storage.removeItem('leaguehub-session')
}

export const restoreSession = (storage: Pick<Storage, 'getItem'>): SessionUser | null => {
  const raw = storage.getItem('leaguehub-session')
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export const hasPermission = (user: User | SessionUser | null, permissionKey: keyof PermissionSet): boolean => {
  if (!user || 'permissions' in user === false) return false
  const permissions = 'permissions' in user ? user.permissions : defaultPermissions
  return Boolean(permissions[permissionKey])
}

export interface MatchStatisticRow {
  id: string
  tournamentId: string
  matchId: string
  teamId: string | null
  playerId: string | null
  playerName: string
  goals: number
  yellowCards: number
  redCards: number
  substitutions: number
}

export const buildMatchStatistics = (
  match: Pick<Match, 'id' | 'homeTeamId' | 'awayTeamId' | 'events'>,
  tournamentId: string,
  players: Array<{ id: string; name: string; teamId: string }> = [],
): MatchStatisticRow[] => {
  const playerMap = new Map(players.map((player) => [player.id, player]))
  const rows = new Map<string, MatchStatisticRow>()

  for (const event of match.events) {
    if (!event.teamId || !event.playerId) continue

    const key = `${event.teamId}:${event.playerId}`
    const existing = rows.get(key) ?? {
      id: `${match.id}-${event.teamId}-${event.playerId}`,
      tournamentId,
      matchId: match.id,
      teamId: event.teamId,
      playerId: event.playerId,
      playerName: playerMap.get(event.playerId)?.name ?? 'Oyuncu',
      goals: 0,
      yellowCards: 0,
      redCards: 0,
      substitutions: 0,
    }

    if (event.type === 'goal') existing.goals += 1
    if (event.type === 'yellow') existing.yellowCards += 1
    if (event.type === 'red') existing.redCards += 1
    if (event.type === 'substitution') existing.substitutions += 1

    rows.set(key, existing)
  }

  return Array.from(rows.values())
}

export const buildDisciplineRows = (
  teams: Team[],
  matches: Array<Pick<Match, 'events'>> = [],
  disciplineRecords: Array<{ playerId: string; teamId?: string; yellowCards?: number; redCards?: number; suspensionMatches?: number; cardType?: string; description?: string; isSuspended?: boolean }> = [],
): Array<{ team: Team; player: Player; yellowCards: number; redCards: number; suspensionMatches: number; isSuspended: boolean }> => {
  const disciplineMap = new Map<string, { team: Team; player: Player; yellowCards: number; redCards: number; suspensionMatches: number; isSuspended: boolean }>()

  for (const team of teams) {
    for (const player of team.players ?? []) {
      const matchingRecords = disciplineRecords.filter((entry) => entry.playerId === player.id && (!entry.teamId || entry.teamId === team.id))
      const fallbackYellowCards = Number(player.yellowCards ?? 0)
      const fallbackRedCards = Number(player.redCards ?? 0)
      const fallbackSuspensionMatches = Number((player as any).suspensionMatches ?? 0)

      let yellowCards = fallbackYellowCards
      let redCards = fallbackRedCards
      let suspensionMatches = fallbackSuspensionMatches

      for (const record of matchingRecords) {
        const normalizedCardType = (record.cardType ?? '').toString().trim().toLowerCase()
        yellowCards = Math.max(yellowCards, Number(record.yellowCards ?? 0))
        redCards = Math.max(redCards, Number(record.redCards ?? 0))
        suspensionMatches = Math.max(suspensionMatches, Number(record.suspensionMatches ?? 0))

        if (normalizedCardType === 'sarı') yellowCards = Math.max(yellowCards, 1)
        if (normalizedCardType === 'kırmızı') redCards = Math.max(redCards, 1)
        if (normalizedCardType === 'maç cezası') suspensionMatches = Math.max(suspensionMatches, 1)
      }

      const isSuspended = Boolean(
        matchingRecords.some((record) => record.isSuspended) ||
          player.isSuspended ||
          suspensionMatches > 0 ||
          redCards > 0 ||
          yellowCards >= 2,
      )

      disciplineMap.set(`${team.id}:${player.id}`, {
        team,
        player: { ...player, yellowCards, redCards, suspensionMatches, isSuspended },
        yellowCards,
        redCards,
        suspensionMatches,
        isSuspended,
      })
    }
  }

  for (const match of matches) {
    for (const event of match.events ?? []) {
      const team = teams.find((candidate) => candidate.id === event.teamId)
      const player = team?.players.find((candidate) => candidate.id === event.playerId)
      if (!team || !player) continue

      const key = `${team.id}:${player.id}`
      const current = disciplineMap.get(key) ?? {
        team,
        player,
        yellowCards: 0,
        redCards: 0,
        suspensionMatches: 0,
        isSuspended: false,
      }

      const storedYellowCards = Number(player.yellowCards ?? current.yellowCards ?? 0)
      const storedRedCards = Number(player.redCards ?? current.redCards ?? 0)
      const storedSuspensionMatches = Number((player as any).suspensionMatches ?? current.suspensionMatches ?? 0)

      if (event.type === 'yellow' && storedYellowCards === 0) current.yellowCards += 1
      if (event.type === 'red' && storedRedCards === 0) current.redCards += 1

      const eventSuspension = current.redCards > 0 || current.yellowCards >= 2 ? 1 : 0
      current.suspensionMatches = Math.max(storedSuspensionMatches, eventSuspension)
      current.isSuspended = Boolean(player.isSuspended) || current.suspensionMatches > 0 || current.redCards > 0 || current.yellowCards >= 2

      disciplineMap.set(key, current)
    }
  }

  return Array.from(disciplineMap.values())
    .filter((entry) => entry.yellowCards > 0 || entry.redCards > 0 || entry.isSuspended || entry.suspensionMatches > 0)
    .sort((left, right) => {
      const teamDiff = left.team.name.localeCompare(right.team.name)
      if (teamDiff !== 0) return teamDiff
      return left.player.name.localeCompare(right.player.name)
    })
}

export const buildStandings = (
  teams: Team[],
  results: Array<{ teamId: string; played: number; won: number; draw: number; lost: number; gf: number; ga: number; pts?: number }>,
  scoring: { win: number; draw: number; loss: number } = DEFAULT_TOURNAMENT_SCORING,
) => {
  const map = new Map(results.map((result) => [result.teamId, result]))

  return teams
    .map((team) => {
      const result = map.get(team.id) ?? { teamId: team.id, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 }
      const computedPts = result.won * scoring.win + result.draw * scoring.draw + result.lost * scoring.loss

      return {
        teamId: team.id,
        name: team.name,
        played: result.played,
        won: result.won,
        draw: result.draw,
        lost: result.lost,
        gf: result.gf,
        ga: result.ga,
        pts: Number.isFinite(computedPts) ? computedPts : 0,
      }
    })
    .sort((first, second) => second.pts - first.pts || second.gf - first.gf)
}

export const applyMatchEvent = (match: Match, event: MatchEvent): Match => {
  const nextEvents = [...match.events, event]
  const nextMatch: Match = {
    ...match,
    events: nextEvents,
  }

  if (event.type === 'goal') {
    if (event.teamId === match.homeTeamId) {
      nextMatch.homeScore += 1
    } else {
      nextMatch.awayScore += 1
    }
  }

  return nextMatch
}

export const finalizeMatch = (
  match: Match,
  winnerTeamId?: string,
  mvpPlayerId?: string,
): Match => {
  const nextMatch: Match = {
    ...match,
    status: 'Bitti',
    mvpPlayerId: mvpPlayerId ?? match.mvpPlayerId,
  }

  if (winnerTeamId && match.homeScore === 0 && match.awayScore === 0) {
    if (winnerTeamId === match.homeTeamId) {
      nextMatch.homeScore = 1
    }
    if (winnerTeamId === match.awayTeamId) {
      nextMatch.awayScore = 1
    }
  }

  return nextMatch
}

export const getRoleLabel = (role: Role): string => role

export const createManualFixture = (
  tournamentId: string,
  homeTeamId: string,
  awayTeamId: string,
  date: string,
  time: string,
  venue: string,
): Fixture => ({
  id: `${tournamentId}-fixture-${crypto.randomUUID()}`,
  tournamentId,
  homeTeamId,
  awayTeamId,
  date,
  time,
  venue,
  status: 'Planlandı',
  homeScore: 0,
  awayScore: 0,
})

export const FULL_WEEK_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const
export const DEFAULT_FIXTURE_TIMES = ['18:00', '19:00', '20:00', '21:00'] as const

const DAY_ORDER = [...FULL_WEEK_DAYS]

const generateRoundRobinRounds = (teamIds: string[]): Array<Array<[string, string]>> => {
  const rotation = [...teamIds]
  if (rotation.length % 2 === 1) rotation.push('BYE')

  const rounds: Array<Array<[string, string]>> = []
  for (let round = 0; round < rotation.length - 1; round += 1) {
    const pairings: Array<[string, string]> = []
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const home = rotation[index]
      const away = rotation[rotation.length - 1 - index]
      if (home === 'BYE' || away === 'BYE') continue
      pairings.push(round % 2 === 0 ? [home, away] : [away, home])
    }

    rounds.push(pairings)
    const lastItem = rotation.pop()
    if (lastItem) rotation.splice(1, 0, lastItem)
  }

  return rounds
}

export const generateAutoFixtures = (
  tournamentId: string,
  teamIds: string[],
  selectedDays: ReadonlyArray<string>,
  selectedTimes: ReadonlyArray<string>,
  venue: string,
  startDate?: string,
): Fixture[] => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const uniqueTeamIds = Array.from(new Set(teamIds.filter((teamId) => uuidPattern.test(teamId.trim()))))
  if (uniqueTeamIds.length < 2) return []

  const dayPool = selectedDays.length ? [...selectedDays] : [...FULL_WEEK_DAYS]
  const timePool = selectedTimes.length ? [...selectedTimes] : [...DEFAULT_FIXTURE_TIMES]
  const rounds = generateRoundRobinRounds(uniqueTeamIds)
  const slotPool = dayPool.flatMap((dayName) => timePool.map((time) => ({ dayName, time })))

  const fixtures: Fixture[] = []
  let fixtureIndex = 0
  const baseDate = startDate ? new Date(startDate) : new Date('2026-09-01T00:00:00.000Z')

  rounds.forEach((roundPairings, roundIndex) => {
    const usedSlots = new Set<string>()
    const teamDayMap = new Map<string, Set<string>>()
    const roundDayUsage = new Map<string, number>()
    const roundTimeUsage = new Map<string, number>()

    roundPairings.forEach((pair) => {
      const [homeTeamId, awayTeamId] = pair
      const homeDayEntries = teamDayMap.get(homeTeamId) ?? new Set<string>()
      const awayDayEntries = teamDayMap.get(awayTeamId) ?? new Set<string>()

      const selectedSlot = slotPool
        .filter(({ dayName, time }) => {
          const isHomeAvailable = !homeDayEntries.has(dayName)
          const isAwayAvailable = !awayDayEntries.has(dayName)
          const isTimeFree = !usedSlots.has(`${dayName}:${time}`)
          return isHomeAvailable && isAwayAvailable && isTimeFree
        })
        .sort((left, right) => {
          const leftDayCount = roundDayUsage.get(left.dayName) ?? 0
          const rightDayCount = roundDayUsage.get(right.dayName) ?? 0
          const leftTimeCount = roundTimeUsage.get(left.time) ?? 0
          const rightTimeCount = roundTimeUsage.get(right.time) ?? 0

          if (leftDayCount !== rightDayCount) return leftDayCount - rightDayCount
          if (leftTimeCount !== rightTimeCount) return leftTimeCount - rightTimeCount
          return timePool.indexOf(left.time) - timePool.indexOf(right.time)
        })[0]

      if (!selectedSlot) {
        return
      }

      const { dayName, time } = selectedSlot
      const weekStart = new Date(baseDate)
      weekStart.setDate(baseDate.getDate() + roundIndex * 7)
      const dayOffset = DAY_ORDER.indexOf(dayName as (typeof FULL_WEEK_DAYS)[number])
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + (dayOffset >= 0 ? dayOffset : 0))

      const weekLabel = `${roundIndex + 1}. Hafta`

      fixtures.push({
        id: crypto.randomUUID(),
        tournamentId,
        homeTeamId,
        awayTeamId,
        date: `${date.toISOString().slice(0, 10)} (${dayName})`,
        time,
        venue,
        status: 'Planlandı',
        homeScore: 0,
        awayScore: 0,
        week: weekLabel,
      })

      usedSlots.add(`${dayName}:${time}`)
      roundDayUsage.set(dayName, (roundDayUsage.get(dayName) ?? 0) + 1)
      roundTimeUsage.set(time, (roundTimeUsage.get(time) ?? 0) + 1)
      homeDayEntries.add(dayName)
      awayDayEntries.add(dayName)
      teamDayMap.set(homeTeamId, homeDayEntries)
      teamDayMap.set(awayTeamId, awayDayEntries)
      fixtureIndex += 1
    })
  })

  return fixtures
}

export const createAdminDemoSeedState = (): AppState => {
  const adminManagerId = 'user-demo-manager'
  const teamIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  ]

  const demoUsers: User[] = [
    {
      id: 'user-demo-manager',
      fullName: 'Test Takım Sorumlusu',
      email: 'demo.manager@leaguehub.test',
      password: 'demo123',
      username: 'TESTTAKSORUMLUSU',
      role: 'Team Manager',
      isActive: true,
      kvkkAccepted: true,
      phone: '+905550000099',
      tc: '55555555555',
      teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      teamManagerRequest: false,
      permissions: createPermissionSet({
        fikstur: true,
        puanDurumu: true,
        canliSkor: true,
        disiplin: true,
        takimOnaylari: true,
        takimYonetimi: true,
        galeri: true,
        duyurular: true,
        ayarlar: true,
      }),
      createdAt: '2026-08-20T10:00:00.000Z',
    },
    {
      id: 'user-demo-admin',
      fullName: 'Demo Admin',
      email: 'demo.admin@leaguehub.test',
      password: 'admin123',
      username: 'DEMOADMIN',
      role: 'Admin',
      isActive: true,
      kvkkAccepted: true,
      phone: '+905550000100',
      tc: '66666666666',
      teamManagerRequest: false,
      permissions: createPermissionSet(),
      createdAt: '2026-08-20T11:00:00.000Z',
    },
  ]

  const demoTeams: Team[] = teamIds.map((teamId, index) => ({
    id: teamId,
    name: ['Alfa', 'Beta', 'Gamma', 'Delta'][index],
    shortName: ['ALF', 'BET', 'GAM', 'DEL'][index],
    city: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'][index],
    status: 'Onaylı',
    managerId: adminManagerId,
    logoUrl: 'https://images.unsplash.com/photo-1543351611-58f69d7c1781?auto=format&fit=crop&w=200&q=80',
    players: [
      createPlayer(`${['Ali', 'Baran', 'Cem', 'Deniz'][index]} ${['Yılmaz', 'Kaya', 'Aydın', 'Şahin'][index]}`, 'Forvet', `+9055500000${index + 1}`, `1000000000${index + 1}`, { isCaptain: true }),
      createPlayer(`${['Murat', 'Ozan', 'Serdar', 'Taylan'][index]} ${['Demir', 'Korkmaz', 'Yıldız', 'Arslan'][index]}`, 'Orta Saha', `+905550000${index + 10}`, `100000001${index + 1}`, { yellowCards: index % 2 }),
    ],
  }))

  const demoTournaments: Tournament[] = [
    {
      id: 'demo-tour-1',
      name: 'Demo Lig',
      status: 'Turnuva Başladı',
      startDate: '2026-09-10T18:00:00.000Z',
      scoring: { ...DEFAULT_TOURNAMENT_SCORING },
      rules: 'Takım temsilcileri maç öncesi konaklama ve ekipman kontrolünü sağlar.',
      yellowCardRule: 2,
      teams: teamIds,
      fixtures: generateAutoFixtures('demo-tour-1', teamIds, ['Salı', 'Perşembe'], ['19:00', '20:00'], 'Merkez Stadyum'),
    },
  ]

  const demoFinishedMatch: Match = {
    id: 'demo-match-finished',
    fixtureId: demoTournaments[0].fixtures[0]?.id ?? 'demo-fixture-1',
    homeTeamId: demoTeams[0].id,
    awayTeamId: demoTeams[1].id,
    homeScore: 2,
    awayScore: 1,
    status: 'Bitti',
    events: [
      { id: 'demo-event-1', type: 'goal', minute: 18, teamId: demoTeams[0].id, playerId: demoTeams[0].players[0].id, description: 'Alfa golü' },
      { id: 'demo-event-2', type: 'goal', minute: 41, teamId: demoTeams[1].id, playerId: demoTeams[1].players[0].id, description: 'Beta golü' },
      { id: 'demo-event-3', type: 'goal', minute: 76, teamId: demoTeams[0].id, playerId: demoTeams[0].players[1].id, description: 'Alfa galibiyet golü' },
    ],
    mvpPlayerId: demoTeams[0].players[0].id,
  }

  const demoLiveMatch: Match = {
    id: 'demo-match-live',
    fixtureId: demoTournaments[0].fixtures[1]?.id ?? 'demo-fixture-2',
    homeTeamId: demoTeams[2].id,
    awayTeamId: demoTeams[3].id,
    homeScore: 1,
    awayScore: 0,
    status: 'Başlatıldı',
    events: [
      { id: 'demo-event-live-1', type: 'goal', minute: 33, teamId: demoTeams[2].id, playerId: demoTeams[2].players[0].id, description: 'Gamma öne geçti' },
    ],
    mvpPlayerId: demoTeams[2].players[0].id,
  }

  return {
    users: demoUsers,
    teams: demoTeams,
    tournaments: demoTournaments,
    matches: [demoFinishedMatch, demoLiveMatch],
    announcements: [
      { id: 'demo-announcement-1', title: 'Demo Duyurusu', body: 'Test turnuvası için otomatik veri hazırlandı.', date: '2026-08-29T10:00:00.000Z' },
      { id: 'demo-announcement-2', title: 'Canlı Maç', body: 'Gamma vs Delta canlı skor ekranında izleniyor.', date: '2026-08-29T12:00:00.000Z' },
    ],
    gallery: [{ id: 'demo-gallery-1', title: 'Demo Galeri', image: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=900&q=80', category: 'Turnuva' }],
    messages: [{ id: 'demo-message-1', senderId: demoUsers[0].id, senderName: demoUsers[0].fullName, title: 'Demo Mesaj', body: 'Test verisi aktif.', read: false, createdAt: '2026-08-29T09:00:00.000Z' }],
    passwordResetRequests: [],
    tournamentApplications: [],
    disciplineRecords: [],
  }
}
