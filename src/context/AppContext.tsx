import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  applyCompletedMatchSuspensions,
  buildMatchStatistics,
  buildUniqueAuthEmail,
  canRegisterTeamToTournament,
  sanitizeDisciplinePatch,
  sanitizeMatchEventPayload,
} from '../lib/leaguehub-data'
import { subscribeToLeaguehubRealtime, supabase } from '../lib/supabase'
import type {
  AppState,
  ContactMessage,
  Fixture,
  Match,
  MatchEvent,
  PasswordResetRequest,
  PermissionSet,
  Player,
  PlayerInput,
  SessionUser,
  Team,
  Tournament,
  TournamentApplication,
  User,
} from '../types'

const SESSION_KEY = 'leaguehub-session'
const LOCAL_FALLBACK_STATE_KEY = 'leaguehub-app-state-fallback'
const EMPTY_APP_STATE: AppState = {
  users: [],
  teams: [],
  tournaments: [],
  matches: [],
  announcements: [],
  gallery: [],
  messages: [],
  passwordResetRequests: [],
  tournamentApplications: [],
  disciplineRecords: [],
}

const usersSelectColumns = '*'

const defaultPermissions: PermissionSet = {
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

export const TEAM_MANAGER_PERMISSION_LIST = ['oyuncu_ekleme', 'turnuva_basvurusu', 'izleme'] as const
export const ADMIN_PERMISSION_LIST = ['Tüm modüller'] as const

export const getRolePermissionList = (role: 'Super Admin' | 'Admin' | 'Team Manager' | 'Visitor' | 'USER'): string[] => {
  if (role === 'Team Manager') return [...TEAM_MANAGER_PERMISSION_LIST]
  if (role === 'Super Admin' || role === 'Admin') return [...ADMIN_PERMISSION_LIST]
  return []
}

const normalizePermissionListFlags = (entries: readonly string[] | string[] | null | undefined): PermissionSet => {
  const set = new Set((entries ?? []).map((entry) => String(entry).trim().toLowerCase()))
  const readOnlyEnabled = set.has('izleme') || set.has('tüm modüller') || set.has('tum moduller')

  return {
    fikstur: readOnlyEnabled,
    puanDurumu: readOnlyEnabled,
    canliSkor: readOnlyEnabled,
    disiplin: readOnlyEnabled,
    takimOnaylari: readOnlyEnabled,
    takimYonetimi: readOnlyEnabled,
    galeri: readOnlyEnabled,
    duyurular: readOnlyEnabled,
    ayarlar: readOnlyEnabled,
  }
}

const safePermissions = (value: Record<string, unknown> | string[] | null | undefined): PermissionSet => {
  if (Array.isArray(value)) {
    return normalizePermissionListFlags(value)
  }

  return {
    ...defaultPermissions,
    ...(value ?? {}),
  }
}

const getInitialSession = (): SessionUser | null => {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

const isSchemaMismatchError = (error: { code?: string; message?: string; details?: string } | null | undefined): boolean => {
  if (!error) return false

  const messageText = `${error.message ?? ''} ${error.details ?? ''} ${error.code ?? ''}`.toLowerCase()
  return /bad request|column .* does not exist|no such column|42703|42p01|42501|invalid input|unsupported column|property .* does not exist/i.test(messageText)
}

const persistLocalFallbackState = (state: AppState) => {
  try {
    localStorage.setItem(LOCAL_FALLBACK_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore storage quota issues and continue in memory
  }
}

const clearLocalFallbackState = () => {
  try {
    localStorage.removeItem(LOCAL_FALLBACK_STATE_KEY)
  } catch {
    // ignore storage errors while clearing stale fallback data
  }
}

const getPersistedPlayerPayload = (player: Player, teamId: string) => {
  const basePayload = {
    id: player.id,
    team_id: teamId,
    name: player.name,
    unit: player.unit,
    phone: player.phone,
    tc: player.tc,
    photo_url: player.photoUrl ?? null,
    position: player.position ?? null,
    created_at: new Date().toISOString(),
  }

  const validPayload = Object.fromEntries(Object.entries(basePayload).filter(([, value]) => value !== undefined && value !== null))

  return Object.keys(validPayload).reduce<Record<string, unknown>>((accumulator, key) => {
    if (['id', 'team_id', 'name', 'unit', 'phone', 'tc', 'photo_url', 'position', 'created_at'].includes(key)) {
      accumulator[key] = validPayload[key]
    }
    return accumulator
  }, {})
}

export const sanitizeUserPayload = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'id',
    'name',
    'email',
    'password',
    'username',
    'role',
    'permissions',
    'status',
    'team_id',
    'team_manager_request',
    'is_active',
    'kvkk_accepted',
    'phone',
    'tc',
    'created_at',
  ])

  return Object.entries(payload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

export const sanitizeTeamPayload = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'id',
    'name',
    'short_name',
    'city',
    'status',
    'manager_id',
    'logo_url',
    'created_at',
  ])

  return Object.entries(payload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined && value !== null) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

export const sanitizeTeamRegistrationPayload = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'name',
    'tournament_id',
    'manager_id',
    'status',
    'logo_url',
  ])

  return Object.entries(payload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined && value !== null) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

export const sanitizePlayerPayload = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'id',
    'team_id',
    'tournament_id',
    'name',
    'unit',
    'phone',
    'tc',
    'photo_url',
    'position',
    'created_at',
  ])

  return Object.entries(payload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined && value !== null) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

export const sanitizeDisciplineRecordPayload = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'id',
    'player_id',
    'team_id',
    'tournament_id',
    'match_id',
    'yellow_cards',
    'red_cards',
    'suspension_matches',
    'match_suspension_count',
    'description',
    'reason',
    'created_at',
  ])

  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    if (!allowedKeys.has(key)) continue
    normalized[key] = value
  }

  const yellowCards = Number((payload as any).yellow_cards ?? 0)
  const redCards = Number((payload as any).red_cards ?? 0)
  const suspensionMatches = Number((payload as any).suspension_matches ?? (payload as any).match_suspension_count ?? 0)

  if (!normalized.yellow_cards && yellowCards > 0) {
    normalized.yellow_cards = yellowCards
  }
  if (!normalized.red_cards && redCards > 0) {
    normalized.red_cards = redCards
  }
  if (!normalized.suspension_matches && suspensionMatches > 0) {
    normalized.suspension_matches = suspensionMatches
  }

  if (!normalized.description && (yellowCards > 0 || redCards > 0 || suspensionMatches > 0)) {
    normalized.description = redCards > 0
      ? 'Kırmızı kart'
      : suspensionMatches > 0
        ? `${suspensionMatches} maç cezası`
        : `${yellowCards} sarı kart`
  }

  delete (normalized as Record<string, unknown>).card_type
  delete (normalized as Record<string, unknown>).is_suspended
  return normalized
}

export const buildDisciplineRecordWritePayload = (payload: Record<string, unknown>) => {
  const filteredPayload = sanitizeDisciplineRecordPayload(payload)

  delete (filteredPayload as Record<string, unknown>).card_type
  delete (filteredPayload as Record<string, unknown>).match_suspension_count
  delete (filteredPayload as Record<string, unknown>).is_suspended
  delete (filteredPayload as Record<string, unknown>).reason
  delete (filteredPayload as Record<string, unknown>).created_at

  return filteredPayload
}

export { sanitizeDisciplinePatch }

export const sanitizeFixturePayload = (payload: Record<string, unknown>) => {
  const allowedKeys = new Set([
    'id',
    'tournament_id',
    'home_team_id',
    'away_team_id',
    'fixture_date',
    'fixture_time',
    'venue',
    'status',
    'home_score',
    'away_score',
    'notes',
    'week',
    'created_at',
  ])

  return Object.entries(payload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined && value !== null) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

export const sanitizeMatchPayload = (payload: Record<string, unknown>) => {
  const safePayload = { ...payload }
  delete safePayload.manager_request
  delete safePayload.managerRequest
  delete safePayload.created_at
  delete safePayload.createdAt

  const allowedKeys = new Set([
    'id',
    'tournament_id',
    'fixture_id',
    'home_team_id',
    'away_team_id',
    'home_score',
    'away_score',
    'status',
    'elapsed_minutes',
    'mvp_player_id',
    'week',
    'match_date',
    'match_time',
    'venue',
  ])

  return Object.entries(safePayload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined && value !== null) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

const isValidUuid = (value: unknown): boolean => {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export const sanitizeTournamentPayload = (payload: Record<string, unknown>) => {
  const safePayload = { ...payload }
  delete safePayload.manager_request
  delete safePayload.managerRequest

  const allowedKeys = new Set([
    'id',
    'name',
    'title',
    'status',
    'start_date',
    'rules',
    'scoring',
    'points_config',
    'win_points',
    'draw_points',
    'loss_points',
    'yellow_card_rule',
    'yellow_card_limit',
    'registered_team_ids',
    'teams',
  ])

  return Object.entries(safePayload).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (allowedKeys.has(key) && value !== undefined && value !== null) {
      accumulator[key] = value
    }
    return accumulator
  }, {})
}

const mapUserRow = (row: any): User => ({
  id: row.id,
  fullName: row.name ?? row.full_name ?? row.fullName ?? '',
  email: row.email ?? '',
  password: row.password ?? '',
  username: row.username ?? (row.name ?? row.full_name ?? '').replace(/\s+/g, '').toUpperCase() ?? '',
  role: row.role ?? 'USER',
  isActive: row.is_active ?? true,
  kvkkAccepted: row.kvkk_accepted ?? false,
  phone: row.phone ?? '',
  tc: row.tc ?? '',
  teamId: row.team_id ?? undefined,
  teamManagerRequest: row.team_manager_request ?? false,
  permissions: safePermissions(row.permissions ?? {}),
  createdAt: row.created_at ?? new Date().toISOString(),
})

const mapTeamRow = (row: any, players: Player[] = []): Team => ({
  id: row.id,
  name: row.name ?? '',
  shortName: row.short_name ?? '',
  city: row.city ?? '',
  status: row.status ?? 'Beklemede',
  managerId: row.manager_id ?? '',
  tournamentId: row.tournament_id ?? row.tournamentId ?? undefined,
  logoUrl: row.logo_url ?? row.logoUrl ?? undefined,
  players,
})

const mapTournamentRow = (row: any, fixtures: Fixture[]): Tournament => {
  const scoringValue = row.points_config ?? row.scoring ?? { win: 3, draw: 1, loss: 0 }

  return {
    id: row.id,
    name: row.name ?? row.title ?? '',
    status: row.status ?? 'Kayıt Açık',
    startDate: row.start_date ?? row.startDate ?? new Date().toISOString(),
    scoring: {
      win: Number(scoringValue?.win ?? row.win_points ?? 3),
      draw: Number(scoringValue?.draw ?? row.draw_points ?? 1),
      loss: Number(scoringValue?.loss ?? row.loss_points ?? 0),
    },
    rules: typeof row.rules === 'string' ? row.rules : '',
    yellowCardRule: Number(row.yellow_card_rule ?? row.yellow_card_limit ?? row.yellowCardRule ?? 2),
    teams: Array.isArray(row.teams) ? row.teams : [],
    registeredTeamIds: Array.isArray(row.registered_team_ids)
      ? row.registered_team_ids
      : (Array.isArray(row.registeredTeamIds) ? row.registeredTeamIds : []),
    fixtures,
  }
}

export const mapFixtureRow = (row: any): Fixture => ({
  id: row.id,
  tournamentId: row.tournament_id ?? '',
  homeTeamId: row.home_team_id ?? '',
  awayTeamId: row.away_team_id ?? '',
  date: row.fixture_date ?? row.date ?? '',
  time: row.fixture_time ?? row.time ?? '00:00',
  venue: row.venue ?? '',
  status: row.status ?? 'Planlandı',
  homeScore: Number(row.home_score ?? 0),
  awayScore: Number(row.away_score ?? 0),
  notes: row.notes ?? undefined,
  week: row.week ?? row.fixture_week ?? undefined,
})

export const mapMatchRow = (row: any, events: MatchEvent[] = []): Match => {
  const homeTeam = row.home_team ?? row.homeTeam ?? null
  const awayTeam = row.away_team ?? row.awayTeam ?? null

  return {
    id: row.id,
    tournamentId: row.tournament_id ?? row.tournamentId ?? undefined,
    fixtureId: row.fixture_id ?? '',
    homeTeamId: row.home_team_id ?? '',
    awayTeamId: row.away_team_id ?? '',
    homeTeamName: (homeTeam?.name ?? row.home_team_name ?? row.homeTeamName ?? undefined) || undefined,
    awayTeamName: (awayTeam?.name ?? row.away_team_name ?? row.awayTeamName ?? undefined) || undefined,
    home_team: homeTeam && typeof homeTeam === 'object' ? { id: homeTeam.id, name: homeTeam.name } : undefined,
    away_team: awayTeam && typeof awayTeam === 'object' ? { id: awayTeam.id, name: awayTeam.name } : undefined,
    homeScore: Number(row.home_score ?? 0),
    awayScore: Number(row.away_score ?? 0),
    status: row.status ?? 'Başlatıldı',
    events,
    elapsedMinutes: Number(row.elapsed_minutes ?? 0),
    mvpPlayerId: row.mvp_player_id ?? undefined,
    week: row.week ?? undefined,
    matchDate: row.match_date ?? row.fixture_date ?? undefined,
    matchTime: row.match_time ?? row.fixture_time ?? undefined,
    venue: row.venue ?? undefined,
  }
}

const mapMessageRow = (row: any): ContactMessage => ({
  id: row.id,
  senderId: row.sender_id ?? '',
  senderName: row.sender_name ?? '',
  title: row.title ?? '',
  body: row.body ?? '',
  read: row.read ?? false,
  createdAt: row.created_at ?? new Date().toISOString(),
})

const loadFixturesWithFallback = async () => {
  const candidates = ['fixture_date', 'date', 'created_at']

  for (const column of candidates) {
    const response = await supabase.from('fixtures').select('*').order(column, { ascending: true })
    if (!response.error) {
      return response
    }

    if (response.error.code !== '42703' && response.error.code !== '42P01') {
      break
    }
  }

  return supabase.from('fixtures').select('*')
}

const selectTableWithFallback = async (table: string, select = '*', dateColumns: string[] = ['created_at', 'date']) => {
  const baseQuery = supabase.from(table).select(select)

  for (const column of dateColumns) {
    const response = await baseQuery.order(column, { ascending: false })
    if (!response.error) return response
    if (!['42P01', '42703', '42501', '404'].includes(response.error.code ?? '')) return response
  }

  const noOrderResponse = await supabase.from(table).select(select)
  if (!noOrderResponse.error) return noOrderResponse

  if (['42P01', '42703', '42501', '404'].includes(noOrderResponse.error.code ?? '')) {
    return { data: [], error: null } as { data: any[]; error: null }
  }

  return noOrderResponse
}

const loadPasswordResetRequests = async () => {
  const response = await selectTableWithFallback('password_reset_requests', '*', ['created_at', 'requested_at'])
  if (!response.error) {
    return response
  }

  if (['42P01', '42703', '42501', '404'].includes(response.error?.code ?? '')) {
    return { data: [], error: null } as { data: any[]; error: null }
  }

  return response
}

const loadUsersSafely = async () => {
  try {
    const response = await supabase
      .from('users')
      .select('*')
    if (response.error && ['42P01', '42703', '42501', '404'].includes(response.error.code ?? '')) {
      return { data: [], error: null } as { data: any[]; error: null }
    }
    return response
  } catch {
    return { data: [], error: null } as { data: any[]; error: null }
  }
}

const applyDisciplineRecordsToPlayers = (teams: Team[], records: any[] = []): Team[] => {
  const byPlayer = new Map<string, { yellowCards: number; redCards: number; suspensionMatches: number; isSuspended: boolean }>()

  for (const record of records) {
    const playerId = record.player_id ?? record.playerId
    if (!playerId) continue

    const nextYellow = Number(record.yellow_cards ?? record.yellowCards ?? 0)
    const nextRed = Number(record.red_cards ?? record.redCards ?? 0)
    const nextSuspensionMatches = Number(record.suspension_matches ?? record.match_suspension_count ?? record.suspensionMatches ?? 0)

    byPlayer.set(playerId, {
      yellowCards: nextYellow,
      redCards: nextRed,
      suspensionMatches: nextSuspensionMatches,
      isSuspended: Boolean(record.is_suspended ?? record.isSuspended ?? (nextRed > 0 || nextYellow >= 2 || nextSuspensionMatches > 0)),
    })
  }

  return teams.map((team) => ({
    ...team,
    players: (team.players ?? []).map((player) => {
      const discipline = byPlayer.get(player.id)
      if (!discipline) return player
      return {
        ...player,
        yellowCards: discipline.yellowCards,
        redCards: discipline.redCards,
        suspensionMatches: discipline.suspensionMatches,
        isSuspended: discipline.isSuspended,
      }
    }),
  }))
}

const loadAppState = async (): Promise<AppState> => {
  try {
    const [usersRes, teamsRes, playersRes, tournamentsRes, matchesRes, matchEventsRes, announcementsRes, galleryRes, messagesRes, passwordResetRequestsRes, disciplineRecordsRes] = await Promise.all([
      loadUsersSafely(),
      selectTableWithFallback('teams', '*', ['created_at', 'updated_at']),
      selectTableWithFallback('players', '*', ['created_at', 'updated_at']),
      selectTableWithFallback('tournaments', '*', ['created_at', 'updated_at']),
      selectTableWithFallback('matches', '*', ['created_at', 'updated_at']),
      selectTableWithFallback('match_events', '*', ['minute', 'created_at']),
      selectTableWithFallback('announcements', '*', ['created_at', 'published_at']),
      selectTableWithFallback('gallery_items', '*', ['created_at', 'published_at']),
      selectTableWithFallback('messages', '*', ['created_at', 'sent_at']),
      loadPasswordResetRequests(),
      selectTableWithFallback('discipline_records', '*', ['created_at']),
    ])
    const fixturesRes = await loadFixturesWithFallback()

    if (usersRes.error && !['42P01', '42703', '42501', '404'].includes(usersRes.error.code ?? '')) {
      console.warn('[LeagueHub AppState] users query failed, continuing without user records', usersRes.error)
    }
    if (teamsRes.error) throw teamsRes.error
    if (playersRes.error) throw playersRes.error
    if (tournamentsRes.error) throw tournamentsRes.error
    if (fixturesRes.error) throw fixturesRes.error
    if (matchesRes.error) throw matchesRes.error
    if (matchEventsRes.error) throw matchEventsRes.error
    if (announcementsRes.error) throw announcementsRes.error
    if (galleryRes.error) throw galleryRes.error
    if (messagesRes.error) throw messagesRes.error
    if (passwordResetRequestsRes.error && !['42P01', '42703', '42501'].includes(passwordResetRequestsRes.error.code ?? '')) {
      throw passwordResetRequestsRes.error
    }

    const playersByTeam = new Map<string, Player[]>()
    for (const row of playersRes.data ?? []) {
      const teamId = row.team_id ?? 'unknown'
      const item: Player = {
        id: row.id,
        name: row.name ?? '',
        unit: row.unit ?? '',
        phone: row.phone ?? '',
        tc: row.tc ?? '',
        photoUrl: row.photo_url ?? undefined,
        position: row.position ?? row.mevki ?? '',
        yellowCards: Number(row.yellow_cards ?? 0),
        redCards: Number(row.red_cards ?? 0),
        isSuspended: Boolean(row.is_suspended),
        isCaptain: Boolean(row.is_captain),
      }
      const list = playersByTeam.get(teamId) ?? []
      list.push(item)
      playersByTeam.set(teamId, list)
    }

    const disciplineRows = Array.isArray(disciplineRecordsRes.data) ? disciplineRecordsRes.data : []
    const shouldResetDisciplineState = Boolean(disciplineRecordsRes.error) || !disciplineRows.length

    if (shouldResetDisciplineState) {
      clearLocalFallbackState()
    }

    const disciplineRecords = shouldResetDisciplineState
      ? []
      : disciplineRows.map((row: any) => ({
        id: row.id ?? row.uuid ?? row._id ?? row.record_id ?? '',
        playerId: row.player_id ?? '',
        teamId: row.team_id ?? undefined,
        tournamentId: row.tournament_id ?? '',
        cardType: row.card_type ?? (row.red_cards > 0 ? 'kırmızı' : row.yellow_cards > 0 ? 'sarı' : 'maç cezası'),
        description: row.description ?? row.reason ?? '',
        yellowCards: Number(row.yellow_cards ?? 0),
        redCards: Number(row.red_cards ?? 0),
        suspensionMatches: Number(row.suspension_matches ?? row.match_suspension_count ?? 0),
        reason: row.reason ?? row.description ?? '',
        createdAt: row.created_at ?? new Date().toISOString(),
      }))

    const teams: Team[] = applyDisciplineRecordsToPlayers((teamsRes.data ?? []).map((row: any) => mapTeamRow(row, playersByTeam.get(row.id) ?? [])), disciplineRecords)
    const teamNameMap = new Map<string, string>((teamsRes.data ?? []).map((row: any) => [row.id, row.name ?? '']))

    const fixturesByTournament = new Map<string, Fixture[]>()
    for (const row of fixturesRes.data ?? []) {
      const list = fixturesByTournament.get(row.tournament_id) ?? []
      list.push(mapFixtureRow(row))
      fixturesByTournament.set(row.tournament_id, list)
    }

    const tournaments: Tournament[] = (tournamentsRes.data ?? []).map((row: any) => {
      const fixtureList = fixturesByTournament.get(row.id) ?? []
      return mapTournamentRow(row, fixtureList)
    })

    const eventsByMatch = new Map<string, MatchEvent[]>()
    for (const row of matchEventsRes.data ?? []) {
      const list = eventsByMatch.get(row.match_id) ?? []
      list.push({
        id: row.id,
        type: row.type ?? 'goal',
        minute: Number(row.minute ?? 0),
        teamId: row.team_id ?? '',
        playerId: row.player_id ?? '',
        description: row.description ?? '',
      })
      eventsByMatch.set(row.match_id, list)
    }

    const matches: Match[] = (matchesRes.data ?? [])
    .filter((row: any) => !row.tournament_id || row.tournament_id !== null)
    .map((row: any) => {
      const homeTeamId = row.home_team_id ?? ''
      const awayTeamId = row.away_team_id ?? ''
      const homeName = teamNameMap.get(homeTeamId) || row.home_team?.name || row.home_team_name || row.homeTeamName || homeTeamId || 'Takım'
      const awayName = teamNameMap.get(awayTeamId) || row.away_team?.name || row.away_team_name || row.awayTeamName || awayTeamId || 'Takım'

      // Disabled: stale team-map debug rehydration block.
      // This was logging match/team name mapping during the background refresh loop and
      // could cause noisy re-entry behavior during ghost-row debugging.
      const hydratedRow = {
        ...row,
        homeTeamName: homeName,
        awayTeamName: awayName,
        home_team: { id: homeTeamId, name: homeName },
        away_team: { id: awayTeamId, name: awayName },
        home_team_name: homeName,
        away_team_name: awayName,
      }
      return mapMatchRow(hydratedRow, eventsByMatch.get(row.id) ?? [])
    })

    return {
      users: (usersRes.data ?? []).map(mapUserRow),
      teams,
      tournaments,
      matches,
      announcements: (announcementsRes.data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title ?? '',
        body: row.body ?? '',
        date: row.created_at ?? new Date().toISOString(),
      })),
      gallery: (galleryRes.data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title ?? '',
        image: row.image_url ?? '',
        category: row.category ?? '',
      })),
      messages: (messagesRes.data ?? []).map(mapMessageRow),
      passwordResetRequests: ((passwordResetRequestsRes.data ?? []) as any[]).map((row: any): PasswordResetRequest => ({
        id: row.id,
        userId: row.user_id ?? undefined,
        username: row.username ?? '',
        email: row.email ?? '',
        status: row.status === 'Çözüldü' ? 'Çözüldü' : 'Açık',
        note: row.note ?? undefined,
        temporaryPassword: row.temporary_password ?? undefined,
        requestedAt: row.requested_at ?? row.created_at ?? new Date().toISOString(),
        resolvedAt: row.resolved_at ?? undefined,
        resolvedBy: row.resolved_by ?? undefined,
      })),
      tournamentApplications: [],
      disciplineRecords,
    }
  } catch {
    return EMPTY_APP_STATE
  }
}

interface AppContextType {
  appState: AppState
  session: SessionUser | null
  authLoading: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>
  register: (payload: {
    fullName: string
    username: string
    password: string
    phone: string
    tc: string
    acceptKvkk: boolean
  }) => Promise<{ success: boolean; message: string }>
  requestPasswordReset: (username: string) => Promise<{ success: boolean; message: string }>
  resolvePasswordResetRequest: (requestId: string, temporaryPassword: string) => Promise<{ success: boolean; message: string }>
  logout: () => void
  createTeam: (payload: {
    name: string
    shortName: string
    city: string
    managerId: string
    status?: Team['status']
    logoUrl?: string
  }) => Promise<void>
  updateTeam: (team: Team) => Promise<void>
  updatePlayerDiscipline: (teamId: string, playerId: string, discipline: { yellowCards: number; redCards: number; suspensionMatches?: number; isSuspended: boolean }) => Promise<void>
  setAppState: Dispatch<SetStateAction<AppState>>
  updateAppState: (nextState: AppState) => Promise<void>
  updateTournament: (tournament: Tournament) => Promise<void>
  loadTournaments: () => Promise<void>
  deleteTournament: (tournamentId: string) => Promise<void>
  setSession: (user: SessionUser | null) => void
  refreshData: () => Promise<void>
  updateUserPermissions: (userId: string, permissions: PermissionSet) => Promise<void>
  updateMatchState: (match: Match) => Promise<void>
  addPlayerToTeam: (teamId: string, player: PlayerInput) => Promise<void>
  removePlayerFromTeam: (playerId: string) => Promise<void>
  sendMessage: (payload: { senderId: string; senderName: string; title: string; body: string }) => Promise<void>
  requestTeamManagerRole: (userId: string) => Promise<void>
  approveTeamManagerRoleRequest: (userId: string) => Promise<void>
  rejectTeamManagerRoleRequest: (userId: string) => Promise<void>
  submitTournamentApplication: (payload: { tournamentId: string; teamName: string; userId: string }) => Promise<void>
  approveTournamentApplication: (application: TournamentApplication) => Promise<void>
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [appState, setAppState] = useState<AppState>(EMPTY_APP_STATE)
  const [session, setSessionState] = useState<SessionUser | null>(() => getInitialSession())
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    clearLocalFallbackState()
    void loadAppState().then((data) => setAppState(data))
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToLeaguehubRealtime(async () => {
      const nextState = await loadAppState()
      setAppState(nextState)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!session) {
      localStorage.removeItem(SESSION_KEY)
      return
    }

    const syncSessionFromDb = async () => {
      try {
        const { data: latestUser, error } = await supabase
          .from('users')
          .select(usersSelectColumns)
          .eq('id', session.id)
          .maybeSingle()

        if (error || !latestUser) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(session))
          return
        }

        const latestUserRecord = latestUser as {
          id?: string
          name?: string
          full_name?: string
          email?: string
          username?: string
          role?: string
          team_id?: string
        } | null

        const syncedSession: SessionUser = {
          id: latestUserRecord?.id ?? session.id,
          fullName: latestUserRecord?.name ?? latestUserRecord?.full_name ?? session.fullName,
          email: latestUserRecord?.email ?? session.email,
          role: (latestUserRecord?.role as SessionUser['role']) ?? session.role,
          teamId: latestUserRecord?.team_id ?? session.teamId,
          username: latestUserRecord?.username ?? (latestUserRecord?.name ?? latestUserRecord?.full_name ?? session.fullName ?? '').replace(/\s+/g, '').toUpperCase(),
        }

        if (syncedSession.role !== session.role || syncedSession.username !== session.username || syncedSession.fullName !== session.fullName || syncedSession.email !== session.email || syncedSession.teamId !== session.teamId) {
          setSessionState(syncedSession)
          return
        }

        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      } catch {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      }
    }

    void syncSessionFromDb()
  }, [session])

  useEffect(() => {
    let active = true

    const hydrateSupabaseSession = async () => {
      setAuthLoading(true)

      try {
        const { data: { session: authSession }, error } = await supabase.auth.getSession()
        if (error) {
          if (active) {
            setSessionState(getInitialSession())
          }
          return
        }

        if (!authSession?.user) {
          if (active) {
            setSessionState(getInitialSession())
          }
          return
        }

        let userRecord: Record<string, any> | null = null

        try {
          const idQuery = await supabase.from('users').select(usersSelectColumns).eq('id', authSession.user.id).maybeSingle()
          if (!idQuery.error && idQuery.data) {
            userRecord = idQuery.data
          }
        } catch {
          userRecord = null
        }

        if (!active) return

        const nextSession: SessionUser = {
          id: userRecord?.id ?? authSession.user.id,
          fullName: userRecord?.full_name ?? userRecord?.name ?? authSession.user.user_metadata?.full_name ?? authSession.user.email?.split('@')[0] ?? 'User',
          email: userRecord?.email ?? authSession.user.email ?? '',
          role: userRecord?.role ?? 'USER',
          teamId: userRecord?.team_id ?? undefined,
          username: userRecord?.username ?? authSession.user.user_metadata?.username ?? (userRecord?.full_name ?? userRecord?.name ?? authSession.user.email ?? '').split('@')[0].toUpperCase(),
        }

        setSessionState(nextSession)
      } finally {
        if (active) {
          setAuthLoading(false)
        }
      }
    }

    void hydrateSupabaseSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession?.user) {
        setSessionState(null)
        return
      }

      void hydrateSupabaseSession()
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const loadTournaments = async () => {
    const data = await loadAppState()
    setAppState(data)
  }

  const refreshData = loadTournaments

  const login = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    const normalizedUsername = (username ?? '').trim()
    const trimmedPassword = (password ?? '').trim()

    console.log('Aranan:', normalizedUsername)

    if (!normalizedUsername || !trimmedPassword) {
      console.warn('[LeagueHub Login] Missing login state values', {
        usernameProvided: Boolean(username),
        passwordProvided: Boolean(password),
      })
      return { success: false, message: 'Kullanıcı adı ve şifre gerekli.' }
    }

    const exactUsername = normalizedUsername.toUpperCase()

    const { data: userRecord, error: userLookupError } = await supabase
      .from('users')
      .select('*')
      .eq('username', exactUsername)
      .single()

    if (userLookupError) {
      console.error('Supabase Sorgu Hatası:', userLookupError.message)
      console.warn('[LeagueHub Login] user not found or password mismatch', {
        username: exactUsername,
        userLookupError,
      })
      return { success: false, message: 'Kullanıcı adı veya şifre hatalı' }
    }

    if (!userRecord || userRecord.password !== trimmedPassword) {
      return { success: false, message: 'Kullanıcı adı veya şifre hatalı' }
    }

    const safeUserRecord = userRecord as {
      id: string
      username?: string
      name?: string
      role?: string
      team_id?: string
      email?: string
      permissions?: PermissionSet
    }

    setSessionState({
      id: safeUserRecord.id,
      fullName: safeUserRecord.name ?? safeUserRecord.username ?? exactUsername,
      email: safeUserRecord.email ?? '',
      role: (safeUserRecord.role as SessionUser['role']) ?? 'USER',
      teamId: safeUserRecord.team_id ?? undefined,
      username: safeUserRecord.username ?? exactUsername,
    })

    return { success: true, message: 'Giriş başarılı.' }
  }

  const register = async (payload: {
    fullName: string
    username: string
    password: string
    phone: string
    tc: string
    acceptKvkk: boolean
  }): Promise<{ success: boolean; message: string }> => {
    const fullName = payload.fullName?.trim() ?? ''
    const username = (payload.username?.trim() ?? '').toUpperCase()
    const password = payload.password?.trim() ?? ''
    const resolvedFullName = fullName || username

    console.log('Kayıt için aranan username:', username)

    if (!resolvedFullName || !username || !password || !payload.phone?.trim() || !payload.tc?.trim() || !payload.acceptKvkk) {
      return { success: false, message: 'Tüm alanlar zorunludur ve KVKK onayı gereklidir.' }
    }

    const generatedEmail = buildUniqueAuthEmail(username)
    const generatedPassword = password.length >= 12 ? password : `${password}LeagueHub!2026`

    const { data: existingUser } = await supabase.from('users').select('*').eq('username', username).maybeSingle()
    if (existingUser) {
      return { success: false, message: 'Bu kullanıcı adı kullanımda.' }
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: generatedEmail,
      password: generatedPassword,
      options: {
        data: {
          name: resolvedFullName,
          username,
        },
      },
    })

    if (authError || !authData.user) {
      return { success: false, message: `Kayıt sırasında hata oluştu: ${authError?.message ?? 'Bilinmeyen hata'}` }
    }

    const userId = authData.user.id

    const userPayload = sanitizeUserPayload({
      id: userId,
      username,
      password,
      email: generatedEmail,
      name: resolvedFullName,
      role: 'USER',
      permissions: {
        fikstur: false,
        puanDurumu: false,
        canliSkor: false,
        disiplin: false,
        takimOnaylari: false,
        takimYonetimi: false,
        galeri: false,
        duyurular: false,
        ayarlar: false,
      },
      status: 'Aktif',
    })

    console.log('[LeagueHub Register] captured password from form state:', { passwordPresent: Boolean(password), passwordLength: password.length })
    console.log('[LeagueHub Register] posting user to public.users', userPayload)

    const userInsertResult = await supabase.from('users').insert([userPayload])
    const userInsertError = userInsertResult.error

    if (userInsertError) {
      console.error('[LeagueHub Register] public.users insert failed', {
        message: userInsertError.message,
        code: userInsertError.code,
        details: userInsertError.details,
        hint: userInsertError.hint,
        payload: userPayload,
      })
      return { success: false, message: `Kayıt sırasında veri tabanı hatası oluştu: ${userInsertError.message}` }
    }

    console.log('[LeagueHub Register] public.users upsert success', userInsertResult.data)

    setSessionState({
      id: userId,
      fullName: resolvedFullName,
      email: generatedEmail,
      role: 'USER',
      username,
    })

    await refreshData()
    return { success: true, message: 'Kayıt başarıyla oluşturuldu.' }
  }

  const requestPasswordReset = async (username: string): Promise<{ success: boolean; message: string }> => {
    const cleanUsername = username.trim()
    if (!cleanUsername) {
      return { success: false, message: 'Kullanıcı adı gereklidir.' }
    }

    const { data, error } = await supabase.rpc('request_password_reset', { p_username: cleanUsername })
    if (error) {
      return { success: false, message: `Talep oluşturulamadı: ${error.message}` }
    }

    const resultText = String(data ?? 'Talep oluşturuldu.')
    return { success: true, message: resultText }
  }

  const resolvePasswordResetRequest = async (requestId: string, temporaryPassword: string): Promise<{ success: boolean; message: string }> => {
    const request = appState.passwordResetRequests.find((entry) => entry.id === requestId)
    if (!request) {
      return { success: false, message: 'İlgili şifre sıfırlama talebi bulunamadı.' }
    }

    const cleanPassword = temporaryPassword.trim()
    if (!cleanPassword || cleanPassword.length < 6) {
      return { success: false, message: 'Geçici şifre en az 6 karakter olmalıdır.' }
    }

    if (!request.userId) {
      return { success: false, message: 'Talebin kullanıcı kimliği eksik.' }
    }

    const { error } = await supabase.rpc('admin_reset_user_password', {
      p_user_id: request.userId,
      p_new_password: cleanPassword,
      p_request_id: requestId,
    })

    if (error) {
      return { success: false, message: `Şifre güncellenemedi: ${error.message}` }
    }

    await refreshData()
    return { success: true, message: 'Şifre sıfırlama talebi çözüldü.' }
  }

  const logout = () => {
    setSessionState(null)
    void supabase.auth.signOut()
  }

  const createTeam = async (payload: {
    name: string
    shortName: string
    city: string
    managerId: string
    status?: Team['status']
    logoUrl?: string
    tournamentId?: string
  }) => {
    const teamPayload = sanitizeTeamPayload({
      id: crypto.randomUUID(),
      name: payload.name.trim(),
      short_name: payload.shortName.trim() || payload.name.trim().slice(0, 3).toUpperCase() || 'TKM',
      city: payload.city?.trim() || 'Belirtilmedi',
      status: payload.status ?? 'Beklemede',
      manager_id: payload.managerId,
      tournament_id: payload.tournamentId ?? null,
      logo_url: payload.logoUrl?.trim() || null,
      created_at: new Date().toISOString(),
    })

    if (!teamPayload.name || !teamPayload.short_name || !teamPayload.city || !teamPayload.manager_id) {
      throw new Error('Takım ekleme için gerekli alanlar eksik: isim, kısa ad, şehir ve yöneticisi zorunludur.')
    }

    const { data: createdTeam, error: teamInsertError } = await supabase.from('teams').insert(teamPayload).select('id').single()
    if (teamInsertError) {
      throw teamInsertError
    }

    const { error: managerUpdateError } = await supabase.from('users').update({ team_id: createdTeam.id }).eq('id', payload.managerId)
    if (managerUpdateError) {
      console.error('Manager team assignment failed after team creation:', managerUpdateError)
      throw managerUpdateError
    }

    if (session?.id === payload.managerId) {
      setSessionState({
        ...session,
        teamId: createdTeam.id,
      })
    }

    await refreshData()
  }

  const updateTeam = async (team: Team) => {
    const teamPayload = sanitizeTeamPayload({
      name: team.name.trim(),
      short_name: team.shortName.trim() || team.name.trim().slice(0, 3).toUpperCase() || 'TKM',
      city: team.city?.trim() || 'Belirtilmedi',
      status: team.status,
      manager_id: team.managerId,
      tournament_id: team.tournamentId ?? null,
      logo_url: team.logoUrl?.trim() || null,
    })

    const { error } = await supabase.from('teams').update(teamPayload).eq('id', team.id)

    if (!error) {
      await refreshData()
    }
  }

  const updatePlayerDiscipline = async (teamId: string, playerId: string, discipline: { yellowCards: number; redCards: number; suspensionMatches?: number; isSuspended: boolean }) => {
    if (!teamId || !playerId) return

    const normalizedYellow = Number.isFinite(Number(discipline.yellowCards)) ? Math.max(0, Number(discipline.yellowCards)) : 0
    const normalizedRed = Number.isFinite(Number(discipline.redCards)) ? Math.max(0, Number(discipline.redCards)) : 0
    const normalizedSuspensionMatches = Number.isFinite(Number(discipline.suspensionMatches ?? 0)) ? Math.max(0, Number(discipline.suspensionMatches ?? 0)) : 0
    const resolvedSuspended = Boolean(discipline.isSuspended) || normalizedRed > 0 || normalizedYellow >= 2 || normalizedSuspensionMatches > 0

    const nextTeams = appState.teams.map((team) => {
      if (team.id !== teamId) return team
      return {
        ...team,
        players: team.players.map((player) => player.id === playerId
          ? {
              ...player,
              yellowCards: normalizedYellow,
              redCards: normalizedRed,
              suspensionMatches: normalizedSuspensionMatches,
              isSuspended: resolvedSuspended,
            }
          : player),
      }
    })

    const tournamentId = appState.tournaments.find((tournament) => tournament.teams.includes(teamId) || tournament.registeredTeamIds?.includes(teamId))?.id ?? appState.tournaments[0]?.id ?? ''
    const existingRecordId = (appState.disciplineRecords ?? []).find((record) => record.playerId === playerId && record.teamId === teamId)?.id

    if (!existingRecordId) {
      console.warn('[LeagueHub] Discipline sync skipped: no existing discipline record id found. Automatic record recreation is disabled to prevent deleted rows from returning.')

      const nextState = {
        ...appState,
        teams: nextTeams,
        disciplineRecords: (appState.disciplineRecords ?? []).filter((record) => record.playerId !== playerId || record.teamId !== teamId),
      }
      setAppState(nextState)
      persistLocalFallbackState(nextState)
      return
    }

    const recordId = existingRecordId
    const matchedMatchId = appState.matches.find((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)?.id ?? ''

    const rawRecordPayload = {
      id: recordId,
      player_id: playerId,
      team_id: teamId,
      tournament_id: tournamentId,
      match_id: matchedMatchId,
      yellow_cards: normalizedYellow,
      red_cards: normalizedRed,
      suspension_matches: normalizedSuspensionMatches,
      description: normalizedRed > 0
        ? 'Kırmızı kart'
        : normalizedSuspensionMatches > 0
          ? `${normalizedSuspensionMatches} maç cezası`
          : `${normalizedYellow} sarı kart`,
    }

    const recordPayload = buildDisciplineRecordWritePayload(rawRecordPayload)
    console.log('Gönderilen Payload:', recordPayload)

    const disciplineWriteResult = await supabase.from('discipline_records').update(recordPayload).eq('id', recordId)
    if (disciplineWriteResult.error) {
      console.error('Kayıt Hatası:', disciplineWriteResult.error)
    } else {
      console.error('Kayıt Başarılı:', disciplineWriteResult.data ?? disciplineWriteResult)
      await refreshData()
    }

    const nextDisciplineRecords = [
      ...(appState.disciplineRecords ?? []).filter((record) => record.playerId !== playerId || record.teamId !== teamId),
      {
        id: recordId,
        playerId,
        teamId,
        tournamentId,
        cardType: normalizedRed > 0 ? 'kırmızı' : normalizedSuspensionMatches > 0 ? 'maç cezası' : 'sarı',
        description: normalizedRed > 0 ? 'Kırmızı kart' : normalizedSuspensionMatches > 0 ? `${normalizedSuspensionMatches} maç cezası` : `${normalizedYellow} sarı kart`,
        yellowCards: normalizedYellow,
        redCards: normalizedRed,
        suspensionMatches: normalizedSuspensionMatches,
      },
    ]

    const nextState = { ...appState, teams: nextTeams, disciplineRecords: nextDisciplineRecords }
    setAppState(nextState)
    persistLocalFallbackState(nextState)

    await refreshData()
  }

  const updateAppState = async (nextState: AppState) => {
    const userRows = nextState.users.map((user) => sanitizeUserPayload({
      id: user.id,
      full_name: user.fullName,
      email: user.email,
      password: user.password,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      team_id: user.teamId ?? null,
      is_active: user.isActive,
      kvkk_accepted: user.kvkkAccepted,
      phone: user.phone,
      tc: user.tc,
      team_manager_request: user.teamManagerRequest,
    }))

    const teamRows = nextState.teams.map((team) => sanitizeTeamPayload({
      id: team.id,
      name: team.name,
      short_name: team.shortName,
      city: team.city,
      status: team.status,
      manager_id: team.managerId,
      logo_url: team.logoUrl ?? null,
    }))

    const playerRows = nextState.teams.flatMap((team) =>
      team.players.map((player) => getPersistedPlayerPayload(player, team.id)),
    )

    const tournamentRows = nextState.tournaments.map((tournament) => sanitizeTournamentPayload({
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      start_date: tournament.startDate,
      rules: tournament.rules ?? '',
      scoring: {
        win: Number(tournament.scoring?.win ?? 3),
        draw: Number(tournament.scoring?.draw ?? 1),
        loss: Number(tournament.scoring?.loss ?? 0),
      },
      yellow_card_rule: Number(tournament.yellowCardRule ?? 2),
      registered_team_ids: Array.isArray(tournament.registeredTeamIds)
        ? tournament.registeredTeamIds
        : Array.isArray(tournament.teams)
          ? tournament.teams
          : [],
      teams: Array.isArray(tournament.teams) ? tournament.teams : [],
    }))

    const fixtureRows = nextState.tournaments.flatMap((tournament) =>
      tournament.fixtures.map((fixture) => ({
        id: fixture.id,
        tournament_id: tournament.id,
        home_team_id: fixture.homeTeamId,
        away_team_id: fixture.awayTeamId,
        fixture_date: fixture.date,
        fixture_time: fixture.time,
        venue: fixture.venue,
        status: fixture.status,
        home_score: fixture.homeScore,
        away_score: fixture.awayScore,
        notes: fixture.notes ?? null,
        week: fixture.week ?? null,
        created_at: new Date().toISOString(),
      })),
    )

    const matchRows = nextState.matches
      .map((match) => sanitizeMatchPayload({
        id: match.id,
        fixture_id: match.fixtureId,
        home_team_id: match.homeTeamId,
        away_team_id: match.awayTeamId,
        home_score: match.homeScore,
        away_score: match.awayScore,
        status: match.status,
        mvp_player_id: match.mvpPlayerId ?? null,
        week: match.week ?? null,
        match_date: match.matchDate ?? null,
        match_time: match.matchTime ?? null,
        venue: match.venue ?? null,
      }))
      .filter((row) => isValidUuid(row.fixture_id) && isValidUuid(row.home_team_id) && isValidUuid(row.away_team_id))

    const matchEventRows = nextState.matches.flatMap((match) =>
      match.events.map((event) => ({
        id: event.id,
        match_id: match.id,
        type: event.type,
        minute: event.minute,
        team_id: event.teamId,
        player_id: event.playerId,
        description: event.description,
        created_at: new Date().toISOString(),
      })),
    )

    const announcementRows = nextState.announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      created_at: announcement.date,
    }))

    const galleryRows = nextState.gallery.map((item) => ({
      id: item.id,
      title: item.title,
      image_url: item.image,
      category: item.category,
      created_at: new Date().toISOString(),
    }))

    const messageRows = nextState.messages.map((message) => ({
      id: message.id,
      sender_id: message.senderId,
      sender_name: message.senderName,
      title: message.title,
      body: message.body,
      read: message.read,
      created_at: message.createdAt,
    }))

    const writeResults = await Promise.all([
      userRows.length ? supabase.from('users').insert(userRows) : Promise.resolve({ error: null }),
      teamRows.length ? supabase.from('teams').insert(teamRows) : Promise.resolve({ error: null }),
      playerRows.length ? supabase.from('players').upsert(playerRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
      tournamentRows.length ? supabase.from('tournaments').upsert(tournamentRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
      fixtureRows.length ? supabase.from('fixtures').insert(fixtureRows) : Promise.resolve({ error: null }),
      matchRows.length ? supabase.from('matches').upsert(matchRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
      matchEventRows.length ? supabase.from('match_events').upsert(matchEventRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
      announcementRows.length ? supabase.from('announcements').upsert(announcementRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
      galleryRows.length ? supabase.from('gallery_items').upsert(galleryRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
      messageRows.length ? supabase.from('messages').upsert(messageRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
    ])

    const schemaIssue = writeResults.find((result) => !!(result as any)?.error && isSchemaMismatchError((result as any).error))

    if (schemaIssue) {
      const error = (schemaIssue as any).error
      console.warn('[LeagueHub] Supabase schema mismatch detected. Falling back to local app state.', error)
      persistLocalFallbackState(nextState)
      setAppState(nextState)
      return
    }

    const criticalError = writeResults.find((result) => !!(result as any)?.error)
    if (criticalError) {
      throw (criticalError as any).error
    }

    persistLocalFallbackState(nextState)
    setAppState(nextState)
  }

  const updateTournament = async (tournament: Tournament) => {
    const titleValue = (tournament.name ?? '').trim() || 'Turnuva'
    const winPoints = Number(tournament.scoring?.win ?? 3)
    const drawPoints = Number(tournament.scoring?.draw ?? 1)
    const lossPoints = Number(tournament.scoring?.loss ?? 0)

    const payload = sanitizeTournamentPayload({
      id: tournament.id,
      name: tournament.name,
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
    })

    const { error } = await supabase.from('tournaments').update(payload).eq('id', tournament.id)
    if (error) {
      console.error('Tournament update failed', error)
      throw error
    }

    await loadTournaments()
  }

  const deleteTournament = async (tournamentId: string) => {
    if (!tournamentId) return

    const normalizedTournamentId = String(tournamentId).trim()

    const tournamentDeleteResult = await supabase.from('tournaments').delete().eq('id', normalizedTournamentId)
    if (tournamentDeleteResult.error) {
      console.error('Direct tournament delete failed, retrying with dependent fixtures cleanup:', tournamentDeleteResult.error)

      const fallbackFixtureDelete = await supabase.from('fixtures').delete().eq('tournament_id', normalizedTournamentId)
      if (fallbackFixtureDelete.error) {
        console.error('Fixture cleanup before tournament delete failed:', fallbackFixtureDelete.error)
        throw fallbackFixtureDelete.error
      }

      const { error: finalDeleteError } = await supabase.from('tournaments').delete().eq('id', normalizedTournamentId)
      if (finalDeleteError) {
        throw finalDeleteError
      }
    }

    setAppState((current) => ({
      ...current,
      tournaments: current.tournaments.filter((item) => item.id !== normalizedTournamentId),
    }))
    await refreshData()
  }

  const updateUserPermissions = async (userId: string, permissions: PermissionSet) => {
    const { error } = await supabase.from('users').update({ permissions }).eq('id', userId)
    if (!error) {
      await refreshData()
    }
  }

  const updateMatchState = async (match: Match) => {
    const fixtureStatus = match.status === 'Bitti' ? 'Tamamlandı' : match.status === 'Durduruldu' ? 'Devam Ediyor' : 'Planlandı'

    const resolvedTournamentId = match.tournamentId ?? appState.tournaments.find((entry) => entry.fixtures.some((fixture) => fixture.id === match.fixtureId))?.id ?? null

    const { error: matchError } = await supabase.from('matches').upsert({
      id: match.id,
      tournament_id: resolvedTournamentId,
      fixture_id: match.fixtureId,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      home_score: match.homeScore,
      away_score: match.awayScore,
      status: match.status,
      elapsed_minutes: Math.max(0, Math.floor(Number(match.elapsedMinutes ?? 0))),
      mvp_player_id: match.mvpPlayerId ?? null,
      week: match.week ?? null,
      match_date: match.matchDate ?? null,
      match_time: match.matchTime ?? null,
      venue: match.venue ?? null,
    }, { onConflict: 'id' })

    if (matchError) {
      throw matchError
    }

    const { error: fixtureError } = await supabase.from('fixtures').update({
      home_score: match.homeScore,
      away_score: match.awayScore,
      status: fixtureStatus,
      notes: `Güncel maç durumu: ${match.status}`,
    }).eq('id', match.fixtureId)

    if (fixtureError) {
      throw fixtureError
    }

    const { error: deleteError } = await supabase.from('match_events').delete().eq('match_id', match.id)
    if (deleteError) {
      throw deleteError
    }

    if (match.events.length > 0) {
      const eventRows = match.events.map((event) => sanitizeMatchEventPayload({
        id: event.id,
        match_id: match.id,
        type: event.type,
        minute: event.minute,
        team_id: event.teamId,
        player_id: event.playerId,
        description: event.description,
        created_at: new Date().toISOString(),
      }))

      const { error: eventsError } = await supabase.from('match_events').upsert(eventRows, { onConflict: 'id' })
      if (eventsError) {
        throw eventsError
      }
    }

    if (match.status === 'Bitti') {
      const tournament = appState.tournaments.find((entry) => entry.fixtures.some((fixture) => fixture.id === match.fixtureId))
      const updatedTeams = applyCompletedMatchSuspensions(appState.teams)
      const nextLocalState = { ...appState, teams: updatedTeams }
      setAppState(nextLocalState)
      persistLocalFallbackState(nextLocalState)

      const allPlayers = updatedTeams.flatMap((team) =>
        team.players.map((player) => ({
          id: player.id,
          name: player.name,
          teamId: team.id,
        })),
      )
      const stats = buildMatchStatistics(match, tournament?.id ?? match.fixtureId, allPlayers)

      if (stats.length > 0) {
        const playerStatRows = stats.map((stat) => ({
          id: stat.id,
          tournament_id: tournament?.id ?? match.fixtureId,
          match_id: stat.matchId,
          team_id: stat.teamId,
          player_id: stat.playerId,
          player_name: stat.playerName,
          goals: stat.goals,
          yellow_cards: stat.yellowCards,
          red_cards: stat.redCards,
          substitutions: stat.substitutions,
          created_at: new Date().toISOString(),
        }))

        const statResults = await Promise.all([
          supabase.from('player_match_stats').upsert(playerStatRows, { onConflict: 'id' }),
          supabase.from('match_statistics').upsert(playerStatRows, { onConflict: 'id' }),
        ])

        const [playerStatsResult, legacyStatsResult] = statResults
        if (playerStatsResult.error) {
          console.warn('player_match_stats sync warning', playerStatsResult.error.message)
        }
        if (legacyStatsResult.error) {
          console.warn('match_statistics sync warning', legacyStatsResult.error.message)
        }
      }

      if (tournament) {
        const updatedTournaments: Tournament[] = appState.tournaments.map((entry) => {
          if (entry.id !== tournament.id) return entry
          return { ...entry, status: 'Turnuva Başladı' as const }
        })
        setAppState({ ...nextLocalState, tournaments: updatedTournaments })
      }
    }

    await refreshData()
    if (appState.teams.length > 0) {
      const completedSuspensionTeams = applyCompletedMatchSuspensions(appState.teams)
      setAppState((current) => ({ ...current, teams: completedSuspensionTeams }))
      persistLocalFallbackState({ ...appState, teams: completedSuspensionTeams })
    }
  }

  const addPlayerToTeam = async (teamId: string, player: PlayerInput) => {
    const resolvedTournamentId = player.tournamentId ?? (await getActiveTournamentIdForTeam(teamId))

    if (!resolvedTournamentId) {
      throw new Error('Oyuncu eklemek için etkin bir turnuva kimliği bulunamadı. Takımın turnuva ilişkisi kontrol edilmeli.')
    }

    const payload = sanitizePlayerPayload({
      id: crypto.randomUUID(),
      team_id: teamId,
      name: player.name,
      unit: player.unit,
      phone: player.phone,
      tc: player.tc,
      photo_url: player.photoUrl ?? null,
      position: player.position ?? null,
      created_at: new Date().toISOString(),
    })

    if (!payload.team_id || !payload.name || !payload.unit || !payload.phone || !payload.tc) {
      throw new Error('Oyuncu ekleme için gerekli alanlar eksik: takım, ad, birim, telefon ve TC zorunludur.')
    }

    const { error } = await supabase.from('players').insert(payload)
    if (error) {
      throw error
    }

    if (session?.id && session.teamId !== teamId) {
      setSessionState({
        ...session,
        teamId,
      })
    }

    await refreshData()
  }

  const getActiveTournamentIdForTeam = async (teamId: string) => {
    const team = appState.teams.find((item) => item.id === teamId)
    if (team?.tournamentId) return team.tournamentId

    const matchingTournament = appState.tournaments.find((tournament) =>
      tournament.teams.includes(teamId) || tournament.registeredTeamIds?.includes(teamId),
    )

    return matchingTournament?.id ?? null
  }

  const removePlayerFromTeam = async (playerId: string) => {
    const { error } = await supabase.from('players').delete().eq('id', playerId)
    if (!error) {
      await refreshData()
    }
  }

  const sendMessage = async (payload: { senderId: string; senderName: string; title: string; body: string }) => {
    const { error } = await supabase.from('messages').insert({
      id: crypto.randomUUID(),
      sender_id: payload.senderId,
      sender_name: payload.senderName,
      title: payload.title,
      body: payload.body,
      read: false,
      created_at: new Date().toISOString(),
    })

    if (!error) {
      await refreshData()
    }
  }

  const requestTeamManagerRole = async (userId: string) => {
    const insertPayload = {
      user_id: userId,
      requested_role: 'Takım Sorumlusu',
      status: 'Beklemede',
      created_at: new Date().toISOString(),
    }

    console.log('Submitting team manager role request payload:', insertPayload)

    try {
      const { data, error: roleRequestError } = await supabase.from('role_requests').insert(insertPayload).select().single()
      if (roleRequestError) {
        console.error('Supabase role_requests insert failed:', { userId, error: roleRequestError, payload: insertPayload })
        throw roleRequestError
      }

      console.log('Role request insert success:', data)

      const { error: userUpdateError } = await supabase.from('users').update({ team_manager_request: true }).eq('id', userId)
      if (userUpdateError) {
        console.error('Team manager request user update failed:', { userId, error: userUpdateError })
      }

      await refreshData()
    } catch (error) {
      console.error('requestTeamManagerRole failed:', { userId, error })
      throw error
    }
  }

  const submitTournamentApplication = async (payload: { tournamentId: string; teamName: string; userId: string }) => {
    try {
      const cleanTeamName = payload.teamName.trim()
      if (!payload.tournamentId || !cleanTeamName || !payload.userId) {
        throw new Error('Turnuva başvurusu için takım adı ve kullanıcı bilgisi gereklidir.')
      }

      const tournament = appState.tournaments.find((entry) => entry.id === payload.tournamentId)
      const existingTeam = appState.teams.find((team) =>
        team.name.trim().toLowerCase() === cleanTeamName.toLowerCase() && team.managerId === payload.userId,
      )

      const { data: existingRegistrations, error: duplicateCheckError } = await supabase
        .from('teams')
        .select('id')
        .eq('manager_id', payload.userId)
        .eq('tournament_id', payload.tournamentId)

      if (duplicateCheckError && !['42P01', '42703', '42501', '404'].includes(duplicateCheckError.code ?? '')) {
        throw duplicateCheckError
      }

      if ((existingRegistrations ?? []).length > 0) {
        console.warn('[LeagueHub] Duplicate tournament registration blocked silently:', {
          userId: payload.userId,
          tournamentId: payload.tournamentId,
        })
        return
      }

      const teamId = existingTeam?.id ?? crypto.randomUUID()
      const teamName = existingTeam?.name ?? cleanTeamName

      const teamRegistrationPayload = sanitizeTeamRegistrationPayload({
        name: teamName,
        status: 'Beklemede',
        manager_id: payload.userId,
        tournament_id: payload.tournamentId,
        logo_url: existingTeam?.logoUrl ?? null,
      })

      const { error: teamRegistrationError } = await supabase
        .from('teams')
        .insert({ id: teamId, ...teamRegistrationPayload })

      if (teamRegistrationError && !['42P01', '42703', '42501', '404'].includes(teamRegistrationError.code ?? '')) {
        console.error('Team registration insert failed:', teamRegistrationError)
        throw teamRegistrationError
      }

      let updatedRegisteredIds: string[] | null = null
      if (tournament) {
        const existingIds = Array.isArray(tournament.registeredTeamIds)
          ? tournament.registeredTeamIds
          : Array.isArray(tournament.teams)
            ? tournament.teams
            : []

        const nextRegisteredIds = Array.from(new Set([...existingIds, teamId]))
        updatedRegisteredIds = nextRegisteredIds

        if (canRegisterTeamToTournament(tournament, teamId)) {
          const { error: tournamentUpdateError } = await supabase
            .from('tournaments')
            .update({
              registered_team_ids: nextRegisteredIds,
              teams: nextRegisteredIds,
            })
            .eq('id', payload.tournamentId)

          if (tournamentUpdateError) {
            console.error('Tournament registration update failed:', tournamentUpdateError)
          }
        }
      }

      if (updatedRegisteredIds && tournament) {
        setAppState((current) => ({
          ...current,
          tournaments: current.tournaments.map((entry) =>
            entry.id === tournament.id
              ? {
                  ...entry,
                  teams: Array.from(new Set([...(entry.teams ?? []), teamId])),
                  registeredTeamIds: Array.from(new Set([...(entry.registeredTeamIds ?? entry.teams ?? []), teamId])),
                }
              : entry,
          ),
        }))
      }

      await updateUserTeamId(payload.userId, teamId)
      await refreshData()
    } catch (error) {
      console.warn('[LeagueHub] Tournament registration suppressed without blocking auth flow:', error)
    }
  }

  const updateUserTeamId = async (userId: string, teamId: string) => {
    const { error } = await supabase
      .from('users')
      .update({ team_id: teamId })
      .eq('id', userId)

    if (error) {
      if (error.code === '42703' || error.message?.includes("team_id") || error.message?.includes("Could not find the 'team_id' column")) {
        throw new Error('Supabase migration gerekli: public.users tablosuna team_id sütunu eklenmeli. SQL dosyasını çalıştırın: supabase-team-id-migration.sql')
      }
      throw error
    }
  }

  const approveTournamentApplication = async (application: TournamentApplication) => {
    try {
      const teamId = application.teamId ?? appState.teams.find((team) =>
        team.name.trim().toLowerCase() === application.teamName.trim().toLowerCase()
        && team.managerId === application.userId,
      )?.id ?? crypto.randomUUID()

      const existingTeam = appState.teams.find((team) => team.id === teamId)
      const sanitizedTeamPayload = sanitizeTeamRegistrationPayload({
        name: application.teamName.trim(),
        status: 'Onaylı',
        manager_id: application.userId,
        tournament_id: application.tournamentId,
        logo_url: existingTeam?.logoUrl ?? null,
      })

      const { error: teamUpdateError } = await supabase
        .from('teams')
        .update(sanitizedTeamPayload)
        .eq('id', teamId)

      if (teamUpdateError) {
        console.error('Team approval update failed:', teamUpdateError)
        throw teamUpdateError
      }

      await updateUserTeamId(application.userId, teamId)

      const tournament = appState.tournaments.find((entry) => entry.id === application.tournamentId)
      if (tournament) {
        const existingTeamIds = Array.isArray(tournament.registeredTeamIds)
          ? tournament.registeredTeamIds
          : Array.isArray(tournament.teams)
            ? tournament.teams
            : []
        const nextRegisteredIds = Array.from(new Set([...existingTeamIds, teamId]))
        const { error: tournamentUpdateError } = await supabase.from('tournaments').update({
          registered_team_ids: nextRegisteredIds,
          teams: nextRegisteredIds,
        }).eq('id', application.tournamentId)

        if (tournamentUpdateError) {
          console.error('Tournament registration sync failed during approval:', tournamentUpdateError)
          throw tournamentUpdateError
        }
      }

      if (session?.id === application.userId) {
        setSessionState({
          ...session,
          teamId,
        })
      }

      await refreshData()
    } catch (error) {
      console.error('approveTournamentApplication failed:', error)
      throw error
    }
  }

  const approveTeamManagerRoleRequest = async (userId: string) => {
    const targetUser = appState.users.find((user) => user.id === userId)
    const approvedPermissions: PermissionSet = {
      fikstur: true,
      puanDurumu: true,
      canliSkor: false,
      disiplin: true,
      takimOnaylari: true,
      takimYonetimi: false,
      galeri: true,
      duyurular: true,
      ayarlar: true,
    }

    try {
      const requestUpdate = await supabase.from('role_requests').update({
        status: 'Onaylandı',
      }).eq('user_id', userId).select()

      if (requestUpdate.error) {
        console.error('Role request approval update failed:', { userId, error: requestUpdate.error })
        throw requestUpdate.error
      }

      const { error: userUpdateError } = await supabase.from('users').update({
        role: 'Team Manager',
        team_manager_request: false,
        access_level: 'Tam Yetki',
        permissions: [...TEAM_MANAGER_PERMISSION_LIST],
      }).eq('id', userId)

      if (userUpdateError) {
        console.error('User role permission update failed after approval:', { userId, error: userUpdateError })
        throw userUpdateError
      }

      const nextUser = targetUser ? { ...targetUser, role: 'Team Manager' as const, teamManagerRequest: false, permissions: approvedPermissions } : null
      if (nextUser && session?.id === userId) {
        setSessionState({
          id: session.id,
          fullName: session.fullName,
          email: session.email,
          role: 'Team Manager',
          teamId: session.teamId,
          username: session.username,
        })
      }

      await refreshData()
    } catch (error) {
      console.error('approveTeamManagerRoleRequest failed:', error)
      throw error
    }
  }

  const rejectTeamManagerRoleRequest = async (userId: string) => {
    const targetUser = appState.users.find((user) => user.id === userId)

    try {
      const requestUpdate = await supabase.from('role_requests').update({
        status: 'Reddedildi',
      }).eq('user_id', userId).select()

      if (requestUpdate.error) {
        console.error('Role request reject update failed:', { userId, error: requestUpdate.error })
        throw requestUpdate.error
      }

      const { error: userUpdateError } = await supabase.from('users').update({
        role: targetUser?.role ?? 'Visitor',
        team_manager_request: false,
        permissions: targetUser?.permissions ?? {
          fikstur: false,
          puanDurumu: false,
          canliSkor: false,
          disiplin: false,
          takimOnaylari: false,
          takimYonetimi: false,
          galeri: false,
          duyurular: false,
          ayarlar: false,
        },
      }).eq('id', userId)

      if (userUpdateError) {
        console.error('User role reject sync failed:', { userId, error: userUpdateError })
        throw userUpdateError
      }

      await refreshData()
    } catch (error) {
      console.error('rejectTeamManagerRoleRequest failed:', error)
      throw error
    }
  }

  const value = useMemo<AppContextType>(
    () => ({
      appState,
      session,
      authLoading,
      login,
      register,
      requestPasswordReset,
      resolvePasswordResetRequest,
      logout,
      createTeam,
      updateTeam,
      updatePlayerDiscipline,
      setAppState,
      updateAppState,
      updateTournament,
      loadTournaments,
      deleteTournament,
      setSession: setSessionState,
      refreshData,
      updateUserPermissions,
      updateMatchState,
      addPlayerToTeam,
      removePlayerFromTeam,
      sendMessage,
      requestTeamManagerRole,
      approveTeamManagerRoleRequest,
      rejectTeamManagerRoleRequest,
      submitTournamentApplication,
      approveTournamentApplication,
    }),
    [appState, session],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}
