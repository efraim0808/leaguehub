import { describe, expect, it } from 'vitest'
import {
  FULL_WEEK_DAYS,
  approveTeamManagerRequest,
  applyMatchEvent,
  authenticateUser,
  buildDisciplineRows,
  buildMatchStatistics,
  buildStandings,
  decrementSuspensionTimers,
  filterSelectablePlayers,
  canRegisterTeamToTournament,
  createAdminDemoSeedState,
  createInitialAppState,
  createManualFixture,
  createPlayer,
  createTeamDraftFromName,
  createSeedTeams,
  createSeedUsers,
  createSessionUser,
  createUserFromRegistration,
  defaultPermissions,
  rejectTeamManagerRequest,
  getVisitorTestUsers,
  buildHiddenAuthEmail,
  buildUniqueAuthEmail,
  buildTournamentUpdatePayload,
  createTournamentDraft,
  finalizeMatch,
  generateAutoFixtures,
  hasPermission,
  isTournamentRegistrationOpen,
  normalizeUsername,
  registerTeamForTournament,
  removeTournamentById,
  restoreSession,
  saveSession,
  toggleSuspension,
} from '../lib/leaguehub-data'
import {
  buildDisciplineRecordWritePayload,
  mapFixtureRow,
  mapMatchRow,
  sanitizeDisciplinePatch,
  sanitizeDisciplineRecordPayload,
  sanitizeFixturePayload,
  sanitizeMatchEventPayload,
  sanitizeMatchPayload,
  sanitizeMatchStatisticsPayload,
  sanitizePlayerPayload,
  sanitizeTeamPayload,
  sanitizeTeamRegistrationPayload,
  sanitizeTournamentPayload,
  sanitizeUserPayload,
} from '../context/AppContext'
import { buildFixtureRowsFromMatches, buildFixtureWeekGroups, normalizeSponsorRecord, resolveMatchEventSelection, sortMatchesChronologically } from '../App'
import { checkPermission } from '../utils/permissions'

const createStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  }
}

describe('LeagueHub – full integration scenarios', () => {
  it('registers a visitor with uppercase username, KVKK consent and manager request flow', () => {
    const payload = {
      fullName: 'efraim yılmaz',
      email: 'efraim@example.com',
      password: 'Efraim+08',
      phone: '+905551234567',
      tc: '12345678901',
      acceptKvkk: true,
    }

    const user = createUserFromRegistration(payload)

    expect(user.username).toBe('EFRAİMYILMAZ')
    expect(user.role).toBe('Visitor')
    expect(user.kvkkAccepted).toBe(true)
    expect(user.permissions.canliSkor).toBe(false)

    const updatedUsers = approveTeamManagerRequest([user], user.id)
    expect(updatedUsers[0].role).toBe('Team Manager')
    expect(updatedUsers[0].permissions.takimYonetimi).toBe(false)
    expect(updatedUsers[0].permissions.canliSkor).toBe(false)
    expect(updatedUsers[0].teamManagerRequest).toBe(false)
  })

  it('rejects a pending team manager request and clears the request state', () => {
    const user = createUserFromRegistration({
      fullName: 'Ayşe Demir',
      email: 'ayse@example.com',
      password: 'Aysedemir123!',
      phone: '+905551234567',
      tc: '12345678901',
      acceptKvkk: true,
    })

    const pendingUser = { ...user, teamManagerRequest: true, role: 'Visitor' as const }
    const updatedUsers = rejectTeamManagerRequest([pendingUser], pendingUser.id)

    expect(updatedUsers[0].teamManagerRequest).toBe(false)
    expect(updatedUsers[0].role).toBe('Visitor')
    expect(updatedUsers[0].permissions.takimYonetimi).toBe(false)
  })

  it('restricts Team Manager permissions to tournament applications and roster creation', () => {
    const user = createUserFromRegistration({
      fullName: 'Mehmet Demir',
      email: 'mehmet@example.com',
      password: 'Mehmet123!',
      phone: '+905551234567',
      tc: '12345678901',
      acceptKvkk: true,
    })

    const updatedUsers = approveTeamManagerRequest([user], user.id)
    const teamManager = updatedUsers[0]

    expect(teamManager.role).toBe('Team Manager')
    expect(checkPermission('Team Manager', 'canApplyTournament')).toBe(true)
    expect(checkPermission('Team Manager', 'canAddPlayer')).toBe(true)
    expect(checkPermission('Team Manager', 'canManageSystem')).toBe(false)
    expect(teamManager.permissions.canliSkor).toBe(false)
    expect(teamManager.permissions.takimYonetimi).toBe(false)
  })

  it('creates four real visitor test credentials with Visitor role and known passwords', () => {
    const visitors = getVisitorTestUsers()

    expect(visitors).toHaveLength(4)
    expect(visitors.every((visitor) => visitor.role === 'Visitor')).toBe(true)
    expect(visitors.every((visitor) => /^visitor\d+@leaguehub\.com$/.test(visitor.email))).toBe(true)
    expect(visitors.every((visitor) => typeof visitor.password === 'string' && visitor.password.length >= 8)).toBe(true)
    expect(new Set(visitors.map((visitor) => visitor.email)).size).toBe(4)
  })

  it('keeps team ownership data on user rows while dropping stale fields', () => {
    const payload = sanitizeUserPayload({
      id: 'user-123',
      name: 'Efraim Yılmaz',
      username: 'EFRAİM',
      password: 'secret',
      team_id: 'team-123',
      role: 'Team Manager',
      legacy_field: 'should be removed',
    })

    expect(payload).toMatchObject({
      id: 'user-123',
      username: 'EFRAİM',
      team_id: 'team-123',
      role: 'Team Manager',
    })
    expect(payload).not.toHaveProperty('legacy_field')
  })

  it('keeps real numeric discipline values in the payload while filtering legacy metadata', () => {
    const payload = sanitizeDisciplineRecordPayload({
      id: '11111111-1111-4111-8111-111111111111',
      player_id: '22222222-2222-4222-8222-222222222222',
      team_id: '33333333-3333-4333-8333-333333333333',
      tournament_id: '44444444-4444-4444-8444-444444444444',
      match_id: '55555555-5555-4555-8555-555555555555',
      yellow_cards: 1,
      red_cards: 0,
      suspension_matches: 0,
      description: 'Sarı kart uyarısı',
      card_type: 'sarı',
      reason: 'Sarı kart uyarısı',
      is_suspended: true,
      unsupported_field: 'drop-me',
    })

    expect(payload).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      player_id: '22222222-2222-4222-8222-222222222222',
      team_id: '33333333-3333-4333-8333-333333333333',
      tournament_id: '44444444-4444-4444-8444-444444444444',
      match_id: '55555555-5555-4555-8555-555555555555',
      yellow_cards: 1,
      red_cards: 0,
      suspension_matches: 0,
      description: 'Sarı kart uyarısı',
    })
    expect(payload).not.toHaveProperty('card_type')
    expect(payload).not.toHaveProperty('is_suspended')
    expect(payload).not.toHaveProperty('unsupported_field')
  })

  it('drops the legacy card_type field before direct Supabase writes and keeps numeric values', () => {
    const payload = buildDisciplineRecordWritePayload({
      id: 'not-a-uuid',
      player_id: 'player-1',
      team_id: 'team-1',
      tournament_id: '44444444-4444-4444-8444-444444444444',
      match_id: 'match-1',
      yellow_cards: 2,
      red_cards: 1,
      match_suspension_count: 3,
      description: 'Geçici test kaydı',
      card_type: 'kırmızı',
      is_suspended: true,
      created_at: '2026-09-01T00:00:00.000Z',
    })

    expect(payload).toMatchObject({
      id: 'not-a-uuid',
      player_id: 'player-1',
      team_id: 'team-1',
      tournament_id: '44444444-4444-4444-8444-444444444444',
      match_id: 'match-1',
      yellow_cards: 2,
      red_cards: 1,
      suspension_matches: 3,
      description: 'Geçici test kaydı',
    })
    expect(payload).not.toHaveProperty('card_type')
    expect(payload).not.toHaveProperty('match_suspension_count')
    expect(payload).not.toHaveProperty('is_suspended')
    expect(payload).not.toHaveProperty('created_at')
  })

  it('normalizes sponsor data from the public.sponsors table for home-page rendering', () => {
    const sponsor = normalizeSponsorRecord({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Medica Sport',
      logo_url: 'https://cdn.example.com/logo.png',
      website: 'https://medicasport.example',
      location: 'İstanbul, Türkiye',
      created_at: '2026-09-01T10:00:00.000Z',
    })

    expect(sponsor).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Medica Sport',
      logoUrl: 'https://cdn.example.com/logo.png',
      website: 'https://medicasport.example',
      location: 'İstanbul, Türkiye',
      createdAt: '2026-09-01T10:00:00.000Z',
    })
  })

  it('derives a fixture list from match rows when the fixtures table is empty', () => {
    const matches = [
      {
        id: 'm-1',
        fixtureId: 'f-1',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 2,
        awayScore: 1,
        status: 'Başlatıldı' as const,
        events: [],
        week: '1. Hafta',
        matchDate: '2026-09-02',
        matchTime: '20:00',
        venue: 'Spor Kompleksi',
      },
      {
        id: 'm-2',
        fixtureId: 'f-2',
        homeTeamId: 'team-b',
        awayTeamId: 'team-c',
        homeScore: 0,
        awayScore: 0,
        status: 'Başlatıldı' as const,
        events: [],
        week: '1. Hafta',
        matchDate: '2026-09-03',
        matchTime: '19:30',
        venue: 'Merkez Stadyum',
      },
    ]

    const derived = buildFixtureRowsFromMatches(matches, 't-1')

    expect(derived).toHaveLength(2)
    expect(derived[0]).toMatchObject({
      id: 'f-1',
      tournamentId: 't-1',
      homeTeamId: 'team-a',
      awayTeamId: 'team-b',
      date: '2026-09-02',
      time: '20:00',
      week: '1. Hafta',
      venue: 'Spor Kompleksi',
    })
    expect(derived[1]).toMatchObject({
      id: 'f-2',
      tournamentId: 't-1',
      homeTeamId: 'team-b',
      awayTeamId: 'team-c',
      date: '2026-09-03',
      time: '19:30',
    })
  })

  it('keeps joined home_team and away_team names on match rows so fixture cards can render real team names', () => {
    const match = mapMatchRow({
      id: 'match-1',
      tournament_id: 't-1',
      fixture_id: 'fixture-1',
      home_team_id: 'team-acil',
      away_team_id: 'team-depo',
      home_score: 2,
      away_score: 1,
      status: 'Başlatıldı',
      home_team: { id: 'team-acil', name: 'ACİL' },
      away_team: { id: 'team-depo', name: 'DEPO' },
    })

    expect(match.home_team?.name).toBe('ACİL')
    expect(match.away_team?.name).toBe('DEPO')
    expect(match.homeTeamId).toBe('team-acil')
    expect(match.awayTeamId).toBe('team-depo')
  })

  it('sorts week tabs in an ascending order and keeps 1. Hafta first', () => {
    const groups = buildFixtureWeekGroups([
      { id: 'f-3', tournamentId: 't-1', homeTeamId: 'team-1', awayTeamId: 'team-2', date: '2026-09-10', time: '20:00', venue: 'X', status: 'Planlandı', homeScore: 0, awayScore: 0, week: '3. Hafta' },
      { id: 'f-1', tournamentId: 't-1', homeTeamId: 'team-2', awayTeamId: 'team-3', date: '2026-09-03', time: '20:00', venue: 'X', status: 'Planlandı', homeScore: 0, awayScore: 0, week: '1. Hafta' },
      { id: 'f-2', tournamentId: 't-1', homeTeamId: 'team-3', awayTeamId: 'team-4', date: '2026-09-06', time: '20:00', venue: 'X', status: 'Planlandı', homeScore: 0, awayScore: 0, week: '2. Hafta' },
    ])

    expect(groups.map((group) => group.label)).toEqual(['1. Hafta', '2. Hafta', '3. Hafta'])
  })

  it('sorts matches in ascending chronological order and lands on the nearest upcoming fixture first', () => {
    const matches = [
      { id: 'm-3', fixtureId: 'f-3', homeTeamId: 't-1', awayTeamId: 't-2', homeScore: 0, awayScore: 0, status: 'Başlatıldı', events: [], matchDate: '2026-09-20', matchTime: '21:00' },
      { id: 'm-1', fixtureId: 'f-1', homeTeamId: 't-2', awayTeamId: 't-3', homeScore: 0, awayScore: 0, status: 'Başlatıldı', events: [], matchDate: '2026-09-04', matchTime: '18:00' },
      { id: 'm-2', fixtureId: 'f-2', homeTeamId: 't-3', awayTeamId: 't-4', homeScore: 0, awayScore: 0, status: 'Başlatıldı', events: [], matchDate: '2026-09-10', matchTime: '19:30' },
    ] as any

    const ordered = sortMatchesChronologically(matches)

    expect(ordered.map((match) => match.id)).toEqual(['m-1', 'm-2', 'm-3'])
    expect(ordered[0].matchDate).toBe('2026-09-04')
  })

  it('normalizes empty UUID fields before writing match events and strips schema-invalid stats columns', () => {
    const eventPayload = sanitizeMatchEventPayload({
      id: '550e8400-e29b-41d4-a716-446655440000',
      match_id: '',
      team_id: 'team-1',
      player_id: '',
      type: 'goal',
      minute: 12,
      description: 'Gol',
    })

    expect(eventPayload).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440000',
      team_id: 'team-1',
      type: 'goal',
      minute: 12,
      description: 'Gol',
    })
    expect(eventPayload).toHaveProperty('match_id', null)
    expect(eventPayload).toHaveProperty('player_id', null)

    const statsPayload = sanitizeMatchStatisticsPayload({
      id: 'stat-1',
      tournament_id: 't-1',
      match_id: 'match-1',
      team_id: 'team-1',
      player_id: 'player-1',
      goals: 2,
      yellow_cards: 1,
      red_cards: 0,
      substitutions: 1,
      player_name: 'Ali',
      extra_field: 'should be removed',
    })

    expect(statsPayload).toMatchObject({
      id: 'stat-1',
      match_id: 'match-1',
      player_id: 'player-1',
      goals: 2,
      yellow_cards: 1,
      red_cards: 0,
    })
    expect(statsPayload).not.toHaveProperty('tournament_id')
    expect(statsPayload).not.toHaveProperty('team_id')
    expect(statsPayload).not.toHaveProperty('player_name')
    expect(statsPayload).not.toHaveProperty('substitutions')
    expect(statsPayload).not.toHaveProperty('extra_field')

    const userPayload = sanitizeUserPayload({
      id: 'user-123',
      full_name: 'Efraim Yılmaz',
      username: 'EFRAİM',
      email: 'efraim@example.com',
      password: 'secret',
      team_id: 'team-123',
      role: 'Team Manager',
      status: 'Aktif',
      legacy_field: 'should be removed',
    })

    expect(userPayload).toMatchObject({
      id: 'user-123',
      username: 'EFRAİM',
      team_id: 'team-123',
      role: 'Team Manager',
    })
    expect(userPayload).not.toHaveProperty('status')
    expect(userPayload).not.toHaveProperty('legacy_field')

    const teamPayload = sanitizeTeamPayload({
      id: 'team-123',
      name: 'İzmir FK',
      short_name: 'İZM',
      city: 'İzmir',
      status: 'Onaylı',
      manager_id: 'mgr-1',
      tournament_id: 'tourney-1',
      created_at: '2026-09-01T00:00:00.000Z',
      legacy_field: 'should be removed',
    })

    expect(teamPayload).toMatchObject({
      id: 'team-123',
      name: 'İzmir FK',
      short_name: 'İZM',
      city: 'İzmir',
      status: 'Onaylı',
      manager_id: 'mgr-1',
    })
    expect(teamPayload).not.toHaveProperty('tournament_id')
    expect(teamPayload).not.toHaveProperty('legacy_field')

    const tournamentPayload = sanitizeTournamentPayload({
      id: 'tournament-1',
      name: 'Yaz Ligi',
      status: 'Kayıt Açık',
      start_date: '2026-09-15',
      rules: 'Fair play',
      manager_request: 'legacy',
      created_at: '2026-09-01T00:00:00.000Z',
    })

    expect(tournamentPayload).toMatchObject({
      id: 'tournament-1',
      name: 'Yaz Ligi',
      status: 'Kayıt Açık',
      start_date: '2026-09-15',
      rules: 'Fair play',
    })
    expect(tournamentPayload).not.toHaveProperty('manager_request')
    expect(tournamentPayload).not.toHaveProperty('created_at')

    const matchPayload = sanitizeMatchPayload({
      id: 'match-1',
      fixture_id: 'fixture-1',
      home_team_id: 'team-1',
      away_team_id: 'team-2',
      home_score: 0,
      away_score: 0,
      status: 'Başlatıldı',
      elapsed_minutes: 12,
      manager_request: 'legacy',
      created_at: '2026-09-01T00:00:00.000Z',
    })

    expect(matchPayload).toMatchObject({
      id: 'match-1',
      fixture_id: 'fixture-1',
      home_team_id: 'team-1',
      away_team_id: 'team-2',
      home_score: 0,
      away_score: 0,
      status: 'Başlatıldı',
      elapsed_minutes: 12,
    })
    expect(matchPayload).not.toHaveProperty('manager_request')
    expect(matchPayload).not.toHaveProperty('created_at')
  })

  it('keeps discipline updates schema-safe and treats empty numeric inputs as blank-safe values', () => {
    const disciplinePatch = sanitizeDisciplinePatch({
      yellow_cards: 2,
      red_cards: 1,
      is_suspended: true,
      legacy_field: 'bad-data',
    })

    expect(disciplinePatch).toMatchObject({
      yellow_cards: 2,
      red_cards: 1,
      is_suspended: true,
    })
    expect(disciplinePatch).not.toHaveProperty('legacy_field')

    const normalizeDisciplineValue = (value: number | string) => {
      if (value === '') return 0
      const parsed = Number(value)
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
    }

    expect(normalizeDisciplineValue('')).toBe(0)
    expect(normalizeDisciplineValue('5')).toBe(5)
    expect(normalizeDisciplineValue('0')).toBe(0)
  })

  it('filters suspended players from selection and reduces suspension timers after match progression', () => {
    const players = [
      { id: 'p-1', name: 'Ali', unit: 'A', phone: '', tc: '', yellowCards: 2, redCards: 0, isSuspended: true, isCaptain: false, suspensionMatches: 2 },
      { id: 'p-2', name: 'Veli', unit: 'A', phone: '', tc: '', yellowCards: 0, redCards: 0, isSuspended: false, isCaptain: false, suspensionMatches: 0 },
      { id: 'p-3', name: 'Can', unit: 'A', phone: '', tc: '', yellowCards: 0, redCards: 1, isSuspended: true, isCaptain: false, suspensionMatches: 1 },
    ]

    const selectable = filterSelectablePlayers(players)
    expect(selectable.map((item) => item.id)).toEqual(['p-2'])

    const reduced = decrementSuspensionTimers(players)
    expect(reduced.find((player) => player.id === 'p-1')?.suspensionMatches).toBe(1)
    expect(reduced.find((player) => player.id === 'p-1')?.isSuspended).toBe(true)
    expect(reduced.find((player) => player.id === 'p-3')?.suspensionMatches).toBe(0)
    expect(reduced.find((player) => player.id === 'p-3')?.isSuspended).toBe(false)
  })

  it('keeps only schema-safe team, player and fixture columns before Supabase inserts', () => {
    const teamPayload = sanitizeTeamPayload({
      id: 'team-123',
      name: 'İzmir FK',
      short_name: 'İZM',
      city: 'İzmir',
      status: 'Onaylı',
      manager_id: 'mgr-1',
      tournament_id: 'tourney-1',
      logo_url: 'https://example.com/logo.png',
      is_active: true,
    })

    expect(teamPayload).toMatchObject({
      name: 'İzmir FK',
      short_name: 'İZM',
      city: 'İzmir',
      manager_id: 'mgr-1',
    })
    expect(teamPayload).not.toHaveProperty('tournament_id')
    expect(teamPayload).not.toHaveProperty('is_active')

    const playerPayload = sanitizePlayerPayload({
      id: 'player-123',
      team_id: 'team-123',
      tournament_id: 'tourney-1',
      name: 'Efraim',
      unit: 'Forvet',
      phone: '+905551234567',
      tc: '12345678901',
      photo_url: 'https://example.com/player.png',
      position: 'Forvet',
      yellow_cards: 0,
      red_cards: 0,
      is_suspended: false,
      is_captain: true,
      created_at: '2026-09-01T00:00:00.000Z',
    })

    expect(playerPayload).toMatchObject({
      team_id: 'team-123',
      name: 'Efraim',
      unit: 'Forvet',
      phone: '+905551234567',
      tc: '12345678901',
      position: 'Forvet',
    })
    expect(playerPayload).not.toHaveProperty('yellow_cards')
    expect(playerPayload).not.toHaveProperty('is_captain')
    expect(playerPayload).not.toHaveProperty('unknown_key')

    const fixturePayload = sanitizeFixturePayload({
      id: 'fixture-123',
      tournament_id: 'tourney-1',
      home_team_id: 'team-1',
      away_team_id: 'team-2',
      fixture_date: '2026-09-02',
      fixture_time: '19:00',
      venue: 'Merkez Stadyum',
      status: 'Planlandı',
      home_score: 0,
      away_score: 0,
      notes: 'Açılış maçı',
      legacy_field: 'bad',
    })

    expect(fixturePayload).toMatchObject({
      tournament_id: 'tourney-1',
      home_team_id: 'team-1',
      away_team_id: 'team-2',
      fixture_date: '2026-09-02',
      venue: 'Merkez Stadyum',
      status: 'Planlandı',
    })
    expect(fixturePayload).not.toHaveProperty('legacy_field')
  })

  it('drops legacy team columns from registration payloads while keeping active DB fields', () => {
    const payload = sanitizeTeamRegistrationPayload({
      name: 'İzmir FK',
      short_name: 'İZM',
      city: 'İzmir',
      captain_name: 'Ali Yılmaz',
      phone: '+905551234567',
      tournament_id: 'tourney-1',
      manager_id: 'mgr-1',
      status: 'Beklemede',
      logo_url: 'https://example.com/logo.png',
      legacy_field: 'should be removed',
    })

    expect(payload).toMatchObject({
      name: 'İzmir FK',
      tournament_id: 'tourney-1',
      manager_id: 'mgr-1',
      status: 'Beklemede',
      logo_url: 'https://example.com/logo.png',
    })
    expect(payload).not.toHaveProperty('short_name')
    expect(payload).not.toHaveProperty('city')
    expect(payload).not.toHaveProperty('captain_name')
    expect(payload).not.toHaveProperty('phone')
    expect(payload).not.toHaveProperty('legacy_field')
  })

  it('converts username input to a hidden leaguehub.local email for auth flows', () => {
    expect(buildHiddenAuthEmail('Efraim Yılmaz')).toBe('efraimyilmaz@leaguehub.local')
    expect(buildHiddenAuthEmail('  demo-user  ')).toBe('demouser@leaguehub.local')
  })

  it('creates a randomized unique synthetic email for every signup attempt', () => {
    const first = buildUniqueAuthEmail('Efraim Yılmaz')
    const second = buildUniqueAuthEmail('Efraim Yılmaz')

    expect(first).toMatch(/^efraimyilmaz_[a-z0-9]{6}@leaguehub\.local$/)
    expect(second).toMatch(/^efraimyilmaz_[a-z0-9]{6}@leaguehub\.local$/)
    expect(first).not.toBe(second)
  })

  it('creates multiple tournaments with unique IDs and starts with score 0', () => {
    const tournaments = createInitialAppState().tournaments

    expect(tournaments).toHaveLength(2)
    expect(new Set(tournaments.map((t) => t.id)).size).toBe(2)

    for (const tournament of tournaments) {
      expect(tournament.scoring.win).toBe(3)
      expect(tournament.scoring.draw).toBe(1)
      expect(tournament.scoring.loss).toBe(0)
      expect(tournament.fixtures.length).toBeGreaterThan(0)
      expect(tournament.fixtures.every((fixture) => fixture.homeScore === 0 && fixture.awayScore === 0)).toBe(true)
    }
  })

  it('includes the required demo auth roles, 4 teams and at least 4 players per team for live scoring tests', () => {
    const users = createSeedUsers()
    const teams = createSeedTeams()

    expect(users.filter((user) => user.role === 'Visitor')).toHaveLength(1)
    expect(users.filter((user) => user.role === 'Team Manager')).toHaveLength(4)
    expect(users.some((user) => user.role === 'Admin')).toBe(true)
    expect(teams).toHaveLength(4)
    expect(teams.every((team) => team.players.length >= 4)).toBe(true)
    expect(teams.map((team) => team.name)).toEqual(expect.arrayContaining(['Sağlık SK', 'Mediterra', 'Asist FK', 'İmed FC']))
  })

  it('creates automatic and manual fixtures and standings begin at zero', () => {
    const { tournaments, teams } = createInitialAppState()
    const firstFixture = createManualFixture('tourney-3', teams[0].id, teams[1].id, '2026-09-15', '19:00', 'Merkez Stadyum')
    const standings = buildStandings(teams, [
      { teamId: teams[0].id, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 },
      { teamId: teams[1].id, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 },
    ])

    expect(firstFixture.id).toContain('tourney-3')
    expect(firstFixture.homeScore).toBe(0)
    expect(firstFixture.awayScore).toBe(0)
    expect(tournaments[0].fixtures.length).toBeGreaterThan(0)
    expect(standings.every((entry) => entry.pts === 0 && entry.gf === 0 && entry.ga === 0)).toBe(true)
  })

  it('offers the full week schedule and custom times for round-robin generation', () => {
    const teamIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ]
    const fixtures = generateAutoFixtures('demo-tourney', teamIds, FULL_WEEK_DAYS, ['18:00', '19:30', '21:00'], 'Merkez Stadyum')

    expect(FULL_WEEK_DAYS).toEqual(['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'])
    expect(fixtures).toHaveLength(6)
    expect(fixtures.every((fixture) => fixture.homeScore === 0 && fixture.awayScore === 0)).toBe(true)
    expect(fixtures.some((fixture) => fixture.time === '18:00' || fixture.time === '19:30' || fixture.time === '21:00')).toBe(true)
  })

  it('assigns round-robin fixtures to distinct weeks and keeps each generated fixture labeled by week', () => {
    const teamIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ]
    const fixtures = generateAutoFixtures('demo-tourney', teamIds, ['Salı', 'Perşembe'], ['18:00', '19:00'], 'Merkez Stadyum', '2026-09-01')

    expect(fixtures.length).toBeGreaterThan(0)
    expect(new Set(fixtures.map((fixture) => fixture.week)).size).toBeGreaterThan(1)
    expect(fixtures.every((fixture) => /^\d+\. Hafta$/.test(fixture.week ?? ''))).toBe(true)
  })

  it('keeps fixture week grouping based on fixtures.week and ignores stale name-based grouping', () => {
    const fixtureRows = [
      {
        id: 'f-1',
        tournament_id: 't-1',
        home_team_id: '11111111-1111-4111-8111-111111111111',
        away_team_id: '22222222-2222-4222-8222-222222222222',
        fixture_date: '2026-09-01',
        fixture_time: '18:00',
        venue: 'Merkez Stadyum',
        status: 'Planlandı',
        home_score: 0,
        away_score: 0,
        notes: 'Açıklama',
        week: '2. Hafta',
      },
      {
        id: 'f-2',
        tournament_id: 't-1',
        home_team_id: '33333333-3333-4333-8333-333333333333',
        away_team_id: '44444444-4444-4444-8444-444444444444',
        fixture_date: '2026-09-03',
        fixture_time: '19:00',
        venue: 'Merkez Stadyum',
        status: 'Planlandı',
        home_score: 0,
        away_score: 0,
        notes: 'Açıklama',
        week: '1. Hafta',
      },
    ]

    const mapped = fixtureRows.map((row) => mapFixtureRow(row))
    const groups = buildFixtureWeekGroups(mapped)

    expect(mapped.every((fixture) => fixture.week && /^\d+\. Hafta$/.test(fixture.week))).toBe(true)
    expect(groups.map((group) => group.label)).toEqual(['1. Hafta', '2. Hafta'])
  })

  it('uses real UUID IDs for generated fixtures and team matches', () => {
    const teamIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ]

    const fixtures = generateAutoFixtures('ac82d7de-2fa6-4f88-b34d-a44cab4e8f12', teamIds, ['Salı', 'Perşembe'], ['18:00', '19:00'], 'Merkez Stadyum', '2026-09-01')

    expect(fixtures).toHaveLength(6)
    expect(fixtures.every((fixture) => /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}?$/i.test(fixture.id))).toBe(true)
    expect(fixtures.every((fixture) => !fixture.id.includes('-auto-'))).toBe(true)
    expect(fixtures.every((fixture) => teamIds.includes(fixture.homeTeamId) && teamIds.includes(fixture.awayTeamId))).toBe(true)
  })

  it('rejects invalid non-UUID team IDs before generating match rows', () => {
    const validTeamIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ]
    const mixedTeamIds = [...validTeamIds, 'team-a', 'team-b']

    const fixtures = generateAutoFixtures('ac82d7de-2fa6-4f88-b34d-a44cab4e8f12', mixedTeamIds, ['Salı', 'Perşembe'], ['18:00', '19:00'], 'Merkez Stadyum', '2026-09-01')

    expect(fixtures).toHaveLength(6)
    expect(fixtures.every((fixture) => validTeamIds.includes(fixture.homeTeamId) && validTeamIds.includes(fixture.awayTeamId))).toBe(true)
  })

  it('distributes each round across the selected days and keeps the selected day pool balanced', () => {
    const teamIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ]
    const fixtures = generateAutoFixtures('demo-tourney', teamIds, ['Salı', 'Perşembe'], ['18:00', '19:00'], 'Merkez Stadyum', '2026-09-01')

    expect(fixtures).toHaveLength(6)
    expect(fixtures.some((fixture) => fixture.date.includes('Salı'))).toBe(true)
    expect(fixtures.some((fixture) => fixture.date.includes('Perşembe'))).toBe(true)
    expect(new Set(fixtures.map((fixture) => fixture.time)).size).toBeGreaterThanOrEqual(2)

    const dayCounts = new Map<string, number>()
    fixtures.forEach((fixture) => {
      const dayName = fixture.date.split(' (')[1]?.replace(')', '') ?? ''
      dayCounts.set(dayName, (dayCounts.get(dayName) ?? 0) + 1)
    })

    expect(dayCounts.get('Salı')).toBeGreaterThan(0)
    expect(dayCounts.get('Perşembe')).toBeGreaterThan(0)
    expect(Math.abs((dayCounts.get('Salı') ?? 0) - (dayCounts.get('Perşembe') ?? 0))).toBeLessThanOrEqual(2)
  })

  it('creates valid UUID-based tournament drafts for Supabase inserts and editing', () => {
    const draft = createTournamentDraft({
      name: 'Yeni Sezon',
      startDate: '2026-09-15',
      status: 'Kayıt Açık',
      rules: 'Takım kuralları',
      scoring: { win: 3, draw: 1, loss: 0 },
      yellowCardRule: 2,
      teams: ['team-a', 'team-b'],
      fixtures: [],
    })

    expect(draft.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(draft.name).toBe('Yeni Sezon')
    expect(draft.registeredTeamIds).toEqual(['team-a', 'team-b'])
    expect(draft.teams).toEqual(['team-a', 'team-b'])
  })

  it('allows negative loss values and removes a tournament from state by id', () => {
    const draft = createTournamentDraft({
      name: 'Negatif Puan Turnuva',
      scoring: { win: 3, draw: 1, loss: -1 },
      teams: ['team-a', 'team-b'],
      fixtures: [],
    })

    expect(draft.scoring.loss).toBe(-1)

    const remaining = removeTournamentById([
      { ...draft, id: 't1' },
      { ...draft, id: 't2' },
    ], 't1')

    expect(remaining.map((item) => item.id)).toEqual(['t2'])
  })

  it('maps the tournament edit form fields into the Supabase update payload', () => {
    const payload = buildTournamentUpdatePayload({
      id: 'tournament-123',
      name: 'Yaz Ligasi',
      status: 'Turnuva Başladı',
      startDate: '2026-09-15',
      scoring: { win: 3, draw: 1, loss: -1 },
      rules: 'Şeffaf oyun',
      yellowCardRule: 2,
      teams: ['team-a', 'team-b'],
      registeredTeamIds: ['team-a', 'team-b'],
      fixtures: [],
    })

    expect(payload.status).toBe('Turnuva Başladı')
    expect(payload.rules).toBe('Şeffaf oyun')
    expect(payload.start_date).toBe('2026-09-15')
    expect(payload.season).toBe(2026)
    expect(payload.points_config).toEqual({ win: 3, draw: 1, loss: -1 })
    expect(payload.scoring).toEqual({ win: 3, draw: 1, loss: -1 })
    expect(payload.yellow_card_limit).toBe(2)
    expect(payload.yellow_card_rule).toBe(2)
    expect(payload.teams).toEqual(['team-a', 'team-b'])
  })

  it('keeps tournament aliases and score fields aligned for Supabase compatibility', () => {
    const payload = buildTournamentUpdatePayload({
      id: 'tournament-456',
      name: 'Yaz Ligasi',
      status: 'Kayıt Açık',
      startDate: '2026-09-15',
      scoring: { win: 4, draw: 2, loss: 0 },
      rules: 'Duyarlı oyun',
      yellowCardRule: 3,
      teams: ['team-a', 'team-b'],
      registeredTeamIds: ['team-a', 'team-b'],
      fixtures: [],
    } as any)

    expect(payload.name).toBe('Yaz Ligasi')
    expect(payload.title).toBe('Yaz Ligasi')
    expect(payload.start_date).toBe('2026-09-15')
    expect(payload.status).toBe('Kayıt Açık')
    expect(payload.win_points).toBe(4)
    expect(payload.draw_points).toBe(2)
    expect(payload.loss_points).toBe(0)
    expect(payload.yellow_card_rule).toBe(3)
    expect(payload.rules).toBe('Duyarlı oyun')
  })

  it('builds a valid team draft from a free-text name for direct tournament registration', () => {
    const draft = createTeamDraftFromName('Merkez Sağlık FC', 'manager-001')

    expect(draft.name).toBe('Merkez Sağlık FC')
    expect(draft.shortName).toBe('MER')
    expect(draft.managerId).toBe('manager-001')
    expect(draft.status).toBe('Onaylı')
    expect(draft.players).toEqual([])
  })

  it('allows manager to add players, mark captain and suspend players', () => {
    const team = createSeedTeams()[0]
    const addedPlayer = createPlayer('Mehmet Şen', 'Hastane', '+905550011223', '55555555555', { photoUrl: 'https://example.com/mehmet.png' })
    const updatedTeam = { ...team, players: [...team.players, addedPlayer] }

    const captainPlayer = { ...addedPlayer, isCaptain: true }
    const withCaptain = { ...updatedTeam, players: updatedTeam.players.map((player) => (player.id === addedPlayer.id ? captainPlayer : player)) }
    const suspended = toggleSuspension(withCaptain, addedPlayer.id, true)

    expect(withCaptain.players.length).toBe(team.players.length + 1)
    expect(withCaptain.players.some((player) => player.name === 'Mehmet Şen')).toBe(true)
    expect(withCaptain.players.find((player) => player.id === addedPlayer.id)?.isCaptain).toBe(true)
    expect(suspended.players.find((player) => player.id === addedPlayer.id)?.isSuspended).toBe(true)
  })

  it('falls back to a valid team and player when the live match event form is incomplete', () => {
    const teams = [{
      id: 'team-home',
      name: 'Galatasaray',
      shortName: 'GTS',
      city: 'İstanbul',
      status: 'Onaylı' as const,
      managerId: 'manager-home',
      players: [{
        id: 'player-home-1',
        name: 'Ali',
        unit: 'A',
        phone: '',
        tc: '',
        yellowCards: 0,
        redCards: 0,
        isSuspended: false,
        isCaptain: false,
      }],
    }, {
      id: 'team-away',
      name: 'Fenerbahçe',
      shortName: 'FNB',
      city: 'İstanbul',
      status: 'Onaylı' as const,
      managerId: 'manager-away',
      players: [{
        id: 'player-away-1',
        name: 'Veli',
        unit: 'A',
        phone: '',
        tc: '',
        yellowCards: 0,
        redCards: 0,
        isSuspended: false,
        isCaptain: false,
      }],
    }] as any

    const match = {
      id: 'match-1',
      fixtureId: 'fixture-1',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
      homeScore: 0,
      awayScore: 0,
      status: 'Başlatıldı' as const,
      events: [],
    } as any

    const selection = resolveMatchEventSelection(match, teams, { teamId: '', playerId: '', minute: '', type: 'goal', description: '' })

    expect(selection.teamId).toBe('team-home')
    expect(selection.playerId).toBe('player-home-1')
    expect(selection.minute).toBe(0)
  })

  it('executes live match flow: start, goals, cards, substitutions, finish and MVP', () => {
    const match = {
      id: 'match-1',
      fixtureId: 'fixture-1',
      homeTeamId: 'team-galatasaray',
      awayTeamId: 'team-fenerbahce',
      homeScore: 0,
      awayScore: 0,
      status: 'Başlatıldı' as const,
      events: [],
    }

    const goalHome = { id: 'event-goal-home', type: 'goal' as const, minute: 12, teamId: 'team-galatasaray', playerId: 'player-home-1', description: 'Galatasaray golü' }
    const yellowAway = { id: 'event-yellow-away', type: 'yellow' as const, minute: 35, teamId: 'team-fenerbahce', playerId: 'player-away-1', description: 'Sarı kart' }
    const substitution = { id: 'event-sub', type: 'substitution' as const, minute: 67, teamId: 'team-galatasaray', playerId: 'player-home-2', description: 'Değişiklik' }
    const redAway = { id: 'event-red-away', type: 'red' as const, minute: 87, teamId: 'team-fenerbahce', playerId: 'player-away-2', description: 'Kırmızı kart' }

    let nextMatch = applyMatchEvent(match, goalHome)
    nextMatch = applyMatchEvent(nextMatch, yellowAway)
    nextMatch = applyMatchEvent(nextMatch, substitution)
    nextMatch = applyMatchEvent(nextMatch, redAway)
    nextMatch = finalizeMatch(nextMatch, 'team-galatasaray', 'player-home-1')

    expect(nextMatch.homeScore).toBe(1)
    expect(nextMatch.awayScore).toBe(0)
    expect(nextMatch.status).toBe('Bitti')
    expect(nextMatch.events).toHaveLength(4)
    expect(nextMatch.mvpPlayerId).toBe('player-home-1')
  })

  it('builds standings and formulas update winners after final result', () => {
    const teams = createSeedTeams()
    const homeTeam = teams[0]
    const awayTeam = teams[1]
    const standings = buildStandings(teams, [
      { teamId: homeTeam.id, played: 1, won: 1, draw: 0, lost: 0, gf: 2, ga: 0, pts: 3 },
      { teamId: awayTeam.id, played: 1, won: 0, draw: 0, lost: 1, gf: 0, ga: 2, pts: 0 },
    ])

    expect(standings[0].name).toBe(homeTeam.name)
    expect(standings[0].pts).toBeGreaterThan(standings[1].pts)
    expect(standings.every((entry) => entry.played >= 0)).toBe(true)
  })

  it('aggregates final match statistics from goals and cards into player records', () => {
    const match = {
      id: 'match-stat-1',
      fixtureId: 'fixture-stat-1',
      homeTeamId: 'team-galatasaray',
      awayTeamId: 'team-fenerbahce',
      homeScore: 2,
      awayScore: 1,
      status: 'Bitti' as const,
      events: [
        { id: 'e1', type: 'goal' as const, minute: 12, teamId: 'team-galatasaray', playerId: 'player-home-1', description: 'Gol' },
        { id: 'e2', type: 'goal' as const, minute: 40, teamId: 'team-fenerbahce', playerId: 'player-away-1', description: 'Gol' },
        { id: 'e3', type: 'goal' as const, minute: 66, teamId: 'team-galatasaray', playerId: 'player-home-2', description: 'Gol' },
        { id: 'e4', type: 'yellow' as const, minute: 75, teamId: 'team-fenerbahce', playerId: 'player-away-2', description: 'Sarı' },
        { id: 'e5', type: 'red' as const, minute: 88, teamId: 'team-galatasaray', playerId: 'player-home-3', description: 'Kırmızı' },
      ],
      mvpPlayerId: 'player-home-2',
    }

    const stats = buildMatchStatistics(match, 'tour-1')

    expect(stats).toHaveLength(5)
    expect(stats.find((stat) => stat.playerId === 'player-home-1')?.goals).toBe(1)
    expect(stats.find((stat) => stat.playerId === 'player-away-1')?.goals).toBe(1)
    expect(stats.find((stat) => stat.playerId === 'player-away-2')?.yellowCards).toBe(1)
    expect(stats.find((stat) => stat.playerId === 'player-home-3')?.redCards).toBe(1)
    expect(stats.every((stat) => stat.tournamentId === 'tour-1' && stat.matchId === 'match-stat-1')).toBe(true)
  })

  it('tracks match-ban counts and suspension state in discipline rows', () => {
    const teams = [
      {
        id: 'team-1',
        name: 'Takım A',
        shortName: 'TA',
        city: 'İzmir',
        status: 'Onaylı' as const,
        managerId: 'manager-1',
        players: [
          { id: 'player-1', name: 'Ali', unit: 'A', phone: '', tc: '', yellowCards: 2, redCards: 0, isSuspended: false, isCaptain: false, suspensionMatches: 1 },
          { id: 'player-2', name: 'Veli', unit: 'A', phone: '', tc: '', yellowCards: 0, redCards: 1, isSuspended: false, isCaptain: false, suspensionMatches: 1 },
        ],
      },
    ]

    const rows = buildDisciplineRows(teams, [{
      events: [
        { id: 'e1', type: 'yellow', minute: 25, teamId: 'team-1', playerId: 'player-1', description: 'Sarı kart' },
        { id: 'e2', type: 'yellow', minute: 40, teamId: 'team-1', playerId: 'player-1', description: 'İkinci sarı kart' },
        { id: 'e3', type: 'red', minute: 80, teamId: 'team-1', playerId: 'player-2', description: 'Kırmızı kart' },
      ],
    }])

    expect(rows.some((row) => row.player.id === 'player-1' && row.yellowCards === 2 && row.suspensionMatches === 1 && row.isSuspended)).toBe(true)
    expect(rows.some((row) => row.player.id === 'player-2' && row.redCards === 1 && row.suspensionMatches === 1 && row.isSuspended)).toBe(true)
  })

  it('maps database card_type values into the UI discipline counters', () => {
    const teams = [{
      id: 'team-1',
      name: 'Takım A',
      shortName: 'TA',
      city: 'İzmir',
      status: 'Onaylı' as const,
      managerId: 'manager-1',
      players: [
        { id: 'player-1', name: 'Ali', unit: 'A', phone: '', tc: '', yellowCards: 0, redCards: 0, isSuspended: false, isCaptain: false, suspensionMatches: 0 },
        { id: 'player-2', name: 'Veli', unit: 'A', phone: '', tc: '', yellowCards: 0, redCards: 0, isSuspended: false, isCaptain: false, suspensionMatches: 0 },
      ],
    }]

    const rows = buildDisciplineRows(teams, [], [
      { playerId: 'player-1', teamId: 'team-1', cardType: 'sarı', yellowCards: 0, redCards: 0, suspensionMatches: 0 },
      { playerId: 'player-2', teamId: 'team-1', cardType: 'kırmızı', yellowCards: 0, redCards: 0, suspensionMatches: 0 },
      { playerId: 'player-2', teamId: 'team-1', cardType: 'maç cezası', yellowCards: 0, redCards: 0, suspensionMatches: 0 },
    ])

    expect(rows.some((row) => row.player.id === 'player-1' && row.yellowCards === 1 && row.redCards === 0)).toBe(true)
    expect(rows.some((row) => row.player.id === 'player-2' && row.redCards === 1 && row.suspensionMatches === 1)).toBe(true)
  })

  it('allows team registration only when the tournament is open and locks it after start', () => {
    const teamId = 'team-galatasaray'
    const registrationOpen = { id: 'tournament-open', status: 'Kayıt Açık' as const, teams: [], registeredTeamIds: [] }
    const started = { id: 'tournament-started', status: 'Turnuva Başladı' as const, teams: [teamId], registeredTeamIds: [teamId] }

    expect(isTournamentRegistrationOpen(registrationOpen)).toBe(true)
    expect(canRegisterTeamToTournament(registrationOpen, teamId)).toBe(true)

    const applied = registerTeamForTournament(registrationOpen, teamId)
    expect(applied.registeredTeamIds).toContain(teamId)
    expect(canRegisterTeamToTournament(applied, teamId)).toBe(false)
    expect(isTournamentRegistrationOpen(started)).toBe(false)
    expect(canRegisterTeamToTournament(started, 'team-fenerbahce')).toBe(false)
  })

  it('uses custom tournament rules and scoring values in standings calculations', () => {
    const teams = createSeedTeams()
    const homeTeam = teams[0]
    const awayTeam = teams[1]
    const standings = buildStandings(
      teams,
      [
        { teamId: homeTeam.id, played: 2, won: 1, draw: 1, lost: 0, gf: 4, ga: 2, pts: 0 },
        { teamId: awayTeam.id, played: 2, won: 0, draw: 1, lost: 1, gf: 2, ga: 4, pts: 0 },
      ],
      { win: 5, draw: 2, loss: 0 },
    )

    expect(standings[0].pts).toBe(7)
    expect(standings[1].pts).toBe(2)
    expect(standings[0].name).toBe(homeTeam.name)
  })

  it('applies permission and storage/session checks correctly', () => {
    const state = createInitialAppState()
    const user = state.users.find((entry) => entry.role === 'Super Admin')!
    const adminUser = state.users.find((entry) => entry.role === 'Admin')!
    const visitor = state.users.find((entry) => entry.role === 'Visitor')!

    expect(hasPermission(user, 'canliSkor')).toBe(true)
    expect(hasPermission(adminUser, 'takimYonetimi')).toBe(false)
    expect(hasPermission(visitor, 'canliSkor')).toBe(false)

    const storage = createStorage()
    const session = createSessionUser(user)
    saveSession(session, storage)
    expect(restoreSession(storage)?.id).toBe(user.id)
    expect(restoreSession(storage)?.role).toBe('Super Admin')

    const expiredStorage = createStorage()
    expect(restoreSession(expiredStorage)).toBeNull()
  })

  it('supports username normalization and default permission set', () => {
    expect(normalizeUsername('Efraim Yılmaz')).toBe('EFRAİMYILMAZ')
    expect(defaultPermissions.canliSkor).toBe(true)
    expect(defaultPermissions.takimYonetimi).toBe(true)
  })

  it('authenticates exact plain-text credentials used by the app', () => {
    const user = { email: 'sagliksk@gmail.com', password: 'Efraim+08' }

    expect(authenticateUser(user, 'sagliksk@gmail.com', 'Efraim+08')).toBe(true)
    expect(authenticateUser(user, 'sagliksk@gmail.com', 'wrong-password')).toBe(false)
  })

  it('keeps team logo urls available for standings, fixtures and live screens', () => {
    const teams = createSeedTeams()

    expect(teams[0].logoUrl).toBeTruthy()
    expect(teams[0].shortName).toBeTruthy()
    expect(teams[1].logoUrl).toBeTruthy()
    expect(teams[1].shortName).toBeTruthy()
  })

  it('offers the full week in the schedule selector and keeps round-robin generation fair across custom times', () => {
    const teamIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ]
    const fixtures = generateAutoFixtures('demo-tourney', teamIds, FULL_WEEK_DAYS, ['18:00', '19:30', '21:00'], 'Merkez Stadyum')

    expect(FULL_WEEK_DAYS).toEqual(['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'])
    expect(fixtures.length).toBe(6)
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(6)
    expect(fixtures.every((fixture) => fixture.homeScore === 0 && fixture.awayScore === 0)).toBe(true)
    expect(fixtures.some((fixture) => fixture.time === '18:00' || fixture.time === '19:30' || fixture.time === '21:00')).toBe(true)
    expect(fixtures.some((fixture) => fixture.date.includes('2026'))).toBe(true)
  })

  it('creates a demo admin dashboard seed state with manager, four teams, players, finished and live matches', () => {
    const state = createAdminDemoSeedState()

    expect(state.users.some((user) => user.role === 'Team Manager')).toBe(true)
    expect(state.teams).toHaveLength(4)
    expect(state.teams.every((team) => team.players.length === 2)).toBe(true)
    expect(state.matches.some((match) => match.status === 'Bitti')).toBe(true)
    expect(state.matches.some((match) => match.status === 'Başlatıldı')).toBe(true)
    expect(state.tournaments.some((tournament) => tournament.fixtures.length > 0)).toBe(true)
  })
})
