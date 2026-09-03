import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Home,
  Image as ImageIcon,
  LogOut,
  PencilLine,
  PlayCircle,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Trophy,
  UserRound,
  Video,
} from 'lucide-react'
import { useAppContext } from './context/AppContext'
import {
  DEFAULT_FIXTURE_TIMES,
  FULL_WEEK_DAYS,
  buildDisciplineRows,
  canManageMatchControls,
  canRegisterTeamToTournament,
  createTournamentDraft,
  filterSelectablePlayers,
  generateAutoFixtures,
  normalizeNumberInput,
} from './lib/leaguehub-data'
import { supabase } from './lib/supabase'
import { isValidUuid } from './lib/utils'
import { checkPermission } from './utils/permissions'
import type { AppState, Fixture, Match, MatchEvent, Player, Role, Team, Tournament, User } from './types'

const navItems = [
  { to: '/', label: 'Ana Sayfa', icon: Home },
  { to: '/standings', label: 'Puan Durumu', icon: BarChart3 },
  { to: '/fixtures', label: 'Fikstür', icon: CalendarDays },
  { to: '/live', label: 'Canlı Skor', icon: PlayCircle },
  { to: '/gallery', label: 'Galeri', icon: Camera },
  { to: '/profile', label: 'Profilim', icon: UserRound },
]

export type SponsorRecord = {
  id: string
  name: string
  logoUrl: string
  website?: string
  location?: string
  createdAt: string
}

export const normalizeSponsorRecord = (record: any): SponsorRecord => ({
  id: String(record?.id ?? ''),
  name: String(record?.name ?? '').trim(),
  logoUrl: String(record?.logo_url ?? record?.logoUrl ?? '').trim(),
  website: String(record?.website ?? '').trim() || undefined,
  location: String(record?.location ?? '').trim() || undefined,
  createdAt: String(record?.created_at ?? record?.createdAt ?? new Date().toISOString()),
})

export const buildFixtureRowsFromMatches = (matches: Match[], tournamentId: string, tournamentTeamIds?: string[]): Fixture[] => {
  const allowedTeamIds = new Set((tournamentTeamIds ?? []).filter(Boolean))

  const entries = matches
    .filter((match) => {
      if (!match.fixtureId || !match.homeTeamId || !match.awayTeamId) return false
      if (allowedTeamIds.size === 0) return true
      return allowedTeamIds.has(match.homeTeamId) || allowedTeamIds.has(match.awayTeamId)
    })
    .map((match) => {
      const mappedHome = match.homeTeamName ?? match.home_team?.name ?? (match as any).home_team_name ?? 'Takım'
      const mappedAway = match.awayTeamName ?? match.away_team?.name ?? (match as any).away_team_name ?? 'Takım'
      const mappedStatus: Fixture['status'] = match.status === 'Bitti'
        ? 'Tamamlandı'
        : match.status === 'Durduruldu' || match.status === 'Başlatıldı'
          ? 'Devam Ediyor'
          : 'Planlandı'

      return {
        id: match.fixtureId,
        tournamentId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeTeamName: mappedHome,
        awayTeamName: mappedAway,
        mappedHome,
        mappedAway,
        home_team_name: mappedHome,
        away_team_name: mappedAway,
        date: match.matchDate ?? '',
        time: match.matchTime ?? '00:00',
        venue: match.venue ?? '',
        status: mappedStatus,
        homeScore: Number(match.homeScore ?? 0),
        awayScore: Number(match.awayScore ?? 0),
        notes: undefined,
        week: match.week,
      }
    })

  return entries.sort((a, b) => {
    const byDate = new Date(a.date || '2000-01-01').getTime() - new Date(b.date || '2000-01-01').getTime()
    if (byDate !== 0) return byDate
    return a.time.localeCompare(b.time)
  })
}

function TeamLogo({ team, size = 36 }: { team?: Team | null; size?: number }) {
  const initials = (team?.shortName || team?.name || 'T')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'T'

  const imageUrl = team?.logoUrl?.trim()

  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-cyan-950 text-[10px] font-black text-cyan-200 shadow-inner shadow-cyan-500/10"
      style={{ width: size, height: size }}
      aria-label={team?.name ? `${team.name} logosu` : 'Takım logosu'}
      title={team?.name ?? 'Takım'}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={team?.name ?? 'Takım'} className="h-full w-full object-cover" onError={(event) => {
          const target = event.currentTarget
          target.style.display = 'none'
          const parent = target.parentElement as HTMLElement | null
          if (parent) {
            parent.textContent = initials
            parent.className = 'flex items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-cyan-950 text-[10px] font-black text-cyan-200 shadow-inner shadow-cyan-500/10'
            parent.style.width = `${size}px`
            parent.style.height = `${size}px`
          }
        }} />
      ) : (
        initials
      )}
    </div>
  )
}

const resolveFixtureTeamName = (fixture: any, side: 'home' | 'away', safeTeams: Team[]) => {
  const mappedKey = side === 'home' ? 'mappedHome' : 'mappedAway'
  const directMapped = fixture?.[mappedKey]
  if (directMapped) {
    return String(directMapped)
  }

  const homeId = fixture?.home_team_id ?? fixture?.homeTeamId
  const awayId = fixture?.away_team_id ?? fixture?.awayTeamId
  const teamId = side === 'home' ? homeId : awayId

  const team = safeTeams.find((candidate) => candidate.id === teamId)
  if (team?.name) {
    return team.name
  }

  if (side === 'home') {
    return fixture?.home_team_name ?? fixture?.homeTeamName ?? fixture?.home_team?.name ?? 'Takım'
  }

  return fixture?.away_team_name ?? fixture?.awayTeamName ?? fixture?.away_team?.name ?? 'Takım'
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  const { appState, session, authLoading, logout } = useAppContext()
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([])
  const safeUsers = Array.isArray(appState?.users) ? appState.users : []
  const safeTeams = Array.isArray(appState?.teams) ? appState.teams : []
  const safeTournaments = Array.isArray(appState?.tournaments) ? appState.tournaments : []

  useEffect(() => {
    let ignore = false
    const loadSponsors = async () => {
      const { data, error } = await supabase
        .from('sponsors')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[LeagueHub] Sponsors load failed:', error)
        return
      }

      if (!ignore) {
        setSponsors((data ?? []).map(normalizeSponsorRecord))
      }
    }

    void loadSponsors()
    return () => {
      ignore = true
    }
  }, [])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-slate-800 bg-slate-900/80 px-8 py-8 shadow-[0_25px_60px_rgba(15,23,42,0.7)]">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-400/30 border-t-cyan-400" />
          <div className="text-xs uppercase tracking-[0.35em] text-cyan-300">Yükleniyor</div>
          <div className="text-sm text-slate-400">Oturum kontrolü yapılıyor...</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen />
  }

  const fallbackUser: User | null = session ? {
    id: session.id,
    fullName: session.fullName,
    email: session.email,
    password: '',
    username: session.username,
    role: session.role,
    isActive: true,
    kvkkAccepted: true,
    phone: '',
    tc: '',
    teamId: session.teamId,
    teamManagerRequest: false,
    permissions: {
      fikstur: true,
      puanDurumu: true,
      canliSkor: true,
      disiplin: true,
      takimOnaylari: true,
      takimYonetimi: true,
      galeri: true,
      duyurular: true,
      ayarlar: true,
    },
    createdAt: new Date().toISOString(),
  } : null

  const currentUser = safeUsers.find((user) => user.id === session.id)
    ?? safeUsers.find((user) => user.email?.toLowerCase() === session.email?.toLowerCase())
    ?? fallbackUser
  const activeUserRole = currentUser?.role ?? session.role
  const canAccessLiveMatchControls = canManageMatchControls(activeUserRole)

  return (
    <div className="min-h-screen bg-slate-950 pb-28 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="LeagueHub Logo"
              className="h-10 w-10 rounded-lg object-contain"
            />
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">LeagueHub</div>
              <div className="text-sm font-semibold text-white">Turnuva Yönetimi</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 sm:flex">
              {activeUserRole}
            </div>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <LogOut size={14} />
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5">
        <Routes>
          <Route path="/" element={<HomePage currentUser={currentUser} safeTournaments={safeTournaments} sponsors={sponsors} />} />
          <Route path="/standings" element={<StandingsPage safeTeams={safeTeams} safeTournaments={safeTournaments} matches={appState.matches ?? []} />} />
          <Route path="/fixtures" element={<FixturesPage safeTeams={safeTeams} safeTournaments={safeTournaments} matches={appState.matches ?? []} canManageMatchControls={canAccessLiveMatchControls} />} />
          <Route path="/stats" element={<Navigate to="/standings" replace />} />
          <Route path="/live" element={<LiveScorePage safeTeams={safeTeams} appState={appState} canManageMatchControls={canAccessLiveMatchControls} />} />
          <Route path="/gallery" element={<GalleryPage currentUser={currentUser} />} />
          <Route path="/profile" element={<ProfilePage currentUser={currentUser} safeTeams={safeTeams} safeTournaments={safeTournaments} sponsors={sponsors} setSponsors={setSponsors} />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-1 px-1.5 py-1.5 sm:grid-cols-6">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[10px] font-medium leading-none transition sm:text-[11px] ${
                  isActive ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={15} />
              <span className="mt-1 whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

function AuthScreen() {
  const { login, register, requestPasswordReset } = useAppContext()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    fullName: '',
    username: '',
    password: '',
    phone: '',
    tc: '',
    acceptKvkk: false,
  })

  useEffect(() => {
    setLoginForm({ username: '', password: '' })
  }, [])
  const [authMessage, setAuthMessage] = useState('')
  const [kvkkOpen, setKvkkOpen] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [forgotUsername, setForgotUsername] = useState('')

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await login(loginForm.username, loginForm.password)
    setAuthMessage(result.message)
  }

  const submitRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await register({
      fullName: registerForm.fullName,
      username: registerForm.username,
      password: registerForm.password,
      phone: registerForm.phone,
      tc: registerForm.tc,
      acceptKvkk: registerForm.acceptKvkk,
    })
    setAuthMessage(result.message)
    if (result.success) {
      setMode('login')
      setRegisterForm({ fullName: '', username: '', password: '', phone: '', tc: '', acceptKvkk: false })
    }
  }

  const submitForgotPassword = async () => {
    const result = await requestPasswordReset(forgotUsername)
    setAuthMessage(result.message)
    setForgotPasswordOpen(false)
    setForgotUsername('')
  }

  const normalizeGeneratedUsername = (fullName: string) =>
    fullName
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/\s+/g, '')
      .toUpperCase()

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="glass-panel mx-auto max-w-md rounded-[30px] p-5">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="LeagueHub Logo"
            className="mx-auto mb-4 h-20 w-20 object-contain"
          />
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white">LeagueHub</h1>
          <p className="mt-1 text-sm text-slate-400">Turnuva Yönetim Sistemi</p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-950/60 p-1 shadow-inner shadow-slate-950/40">
          <button type="button" onClick={() => setMode('login')} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/15' : 'text-slate-300 hover:text-white'}`}>
            Giriş
          </button>
          <button type="button" onClick={() => setMode('register')} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/15' : 'text-slate-300 hover:text-white'}`}>
            Kayıt Ol
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={submitLogin} className="space-y-4">
            <input type="text" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <input type="password" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />

            <label className="premium-label">
              Kullanıcı Adı
              <input
                type="text"
                placeholder="Kullanıcı Adı"
                value={loginForm.username}
                onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
                autoComplete="one-time-code"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                className="glass-input mt-1 w-full rounded-2xl px-3 py-2.5 text-white"
              />
            </label>
            <label className="premium-label">
              Şifre
              <input
                type="password"
                placeholder="Şifre"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                autoComplete="new-password"
                className="glass-input mt-1 w-full rounded-2xl px-3 py-2.5 text-white"
              />
            </label>
            <button type="button" onClick={() => setForgotPasswordOpen(true)} className="text-sm text-cyan-300 underline decoration-cyan-400/70 underline-offset-4">Şifremi Unuttum</button>
            <button type="submit" className="glass-button w-full rounded-2xl px-4 py-3 font-bold text-slate-950">
              Giriş Yap
            </button>
          </form>
        ) : (
          <form onSubmit={submitRegister} className="space-y-4">
            <label className="premium-label">
              Ad Soyad
              <input
                required
                value={registerForm.fullName}
                onChange={(event) => {
                  const nextFullName = event.target.value
                  setRegisterForm({
                    ...registerForm,
                    fullName: nextFullName,
                    username: nextFullName ? normalizeGeneratedUsername(nextFullName) : '',
                  })
                }}
                className="glass-input mt-1 w-full rounded-2xl px-3 py-2.5 text-white"
              />
            </label>
            <label className="premium-label">
              Kullanıcı Adı
              <input
                required
                value={registerForm.username}
                onChange={(event) => {
                  const nextUsername = normalizeGeneratedUsername(event.target.value)
                  setRegisterForm((previous) => ({
                    ...previous,
                    username: nextUsername,
                  }))
                }}
                className="glass-input mt-1 w-full rounded-2xl px-3 py-2.5 text-white uppercase"
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <label className="premium-label">
              Şifre
              <input
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                className="glass-input mt-1 w-full rounded-2xl px-3 py-2.5 text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="premium-label">
                İletişim
                <input
                  value={registerForm.phone}
                  onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })}
                  className="glass-input mt-1 w-full rounded-2xl px-3 py-2.5 text-white"
                />
              </label>
              <label className="premium-label">
                TC
                <input
                  value={registerForm.tc}
                  onChange={(event) => setRegisterForm({ ...registerForm, tc: event.target.value })}
                  className="glass-input mt-1 w-full rounded-2xl px-3 py-2.5 text-white"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-700/70 bg-slate-950/40 p-3 text-sm text-slate-300 shadow-inner shadow-slate-950/30">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-white">KVKK Onayı</span>
                <button type="button" onClick={() => setKvkkOpen(true)} className="text-xs text-cyan-300 underline decoration-cyan-400/60 underline-offset-4">
                  Metni Gör
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={registerForm.acceptKvkk}
                  onChange={(event) => setRegisterForm({ ...registerForm, acceptKvkk: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                KVKK metnini okudum ve kabul ediyorum.
              </label>
            </div>

            <button type="submit" className="glass-button w-full rounded-2xl px-4 py-3 font-bold text-slate-950">
              Kayıt Ol
            </button>
          </form>
        )}

        {authMessage ? (
          <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 shadow-inner shadow-slate-950/20">{authMessage}</div>
        ) : null}
      </div>

      {forgotPasswordOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Şifremi Unuttum</h2>
              <button type="button" onClick={() => setForgotPasswordOpen(false)} className="rounded-full border border-slate-700 px-2 py-1 text-sm text-slate-300">Kapat</button>
            </div>
            <label className="block text-sm text-slate-300">
              Kullanıcı Adı
              <input value={forgotUsername} onChange={(event) => setForgotUsername(event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none transition focus:border-cyan-400" />
            </label>
            <button type="button" onClick={() => void submitForgotPassword()} className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-cyan-400 px-4 py-3 font-bold text-slate-950">
              Talep Oluştur
            </button>
          </div>
        </div>
      ) : null}

      {kvkkOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-700 bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">KVKK Açık Rıza Metni</h2>
              <button type="button" onClick={() => setKvkkOpen(false)} className="rounded-full border border-slate-700 px-2 py-1 text-sm text-slate-300">
                Kapat
              </button>
            </div>
            <div className="max-h-72 space-y-3 overflow-y-auto text-sm leading-6 text-slate-300">
              <p>Bu platform, yarışma ve turnuva yönetimi için kişisel iletişim, kimlik ve ekip bilgilerini güvenli şekilde saklar.</p>
              <p>Kayıt sırasında verilen isim, telefon, TC ve iletişim bilgileri; turnuva organizasyonu, takım onayı, disiplin işlemleri ve bilgilendirme amaçlarıyla kullanılacaktır.</p>
              <p>İlgili kişiler, her zaman veri güncelleme ve silme taleplerini yönetici kanalları üzerinden iletebilir.</p>
            </div>
            <button type="button" onClick={() => setKvkkOpen(false)} className="mt-5 w-full rounded-2xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950">
              Anladım
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HomePage({ currentUser, safeTournaments, sponsors }: {
  currentUser: User | null
  safeTournaments: Tournament[]
  sponsors: SponsorRecord[]
}) {
  const { appState, submitTournamentApplication } = useAppContext()
  const [selectedOpenTournament, setSelectedOpenTournament] = useState<Tournament | null>(null)
  const [teamNameInput, setTeamNameInput] = useState('')
  const [applying, setApplying] = useState(false)
  const [applicationFeedback, setApplicationFeedback] = useState('')

  const announcements = (appState.announcements ?? []).slice(0, 3).map((item) => ({
    title: item.title,
    text: item.body,
    badge: item.title === 'Canlı Yayın' ? 'Live' : 'Duyuru',
  }))

  const openTournaments = useMemo(
    () => safeTournaments.filter((tournament) => tournament.status === 'Kayıt Açık'),
    [safeTournaments],
  )

  const getApprovedTeamsForTournament = (tournament: Tournament): Team[] => {
    return appState.teams.filter((team) => {
      if (team.status !== 'Onaylı') return false
      const matchesTournament = team.tournamentId === tournament.id || tournament.teams.includes(team.id) || tournament.registeredTeamIds?.includes(team.id)
      return matchesTournament
    })
  }

  const handleSubmitTournamentApplication = async () => {
    if (!selectedOpenTournament || !currentUser || currentUser.role !== 'Team Manager') {
      return
    }

    const cleanTeamName = teamNameInput.trim()
    if (!cleanTeamName) {
      setApplicationFeedback('Takım adını yazmanız gerekiyor.')
      return
    }

    const existingTeam = appState.teams.find((team) =>
      team.name.trim().toLowerCase() === cleanTeamName.toLowerCase()
      && (team.managerId === currentUser.id || team.id === currentUser.teamId),
    )

    if (existingTeam && !canRegisterTeamToTournament(selectedOpenTournament, existingTeam.id)) {
      setApplicationFeedback('Bu turnuvaya zaten kayıtlısınız veya turnuva kayıt açığı değil.')
      return
    }

    setApplying(true)
    setApplicationFeedback('Başvuru gönderiliyor...')

    try {
      await submitTournamentApplication({
        tournamentId: selectedOpenTournament.id,
        teamName: cleanTeamName,
        userId: currentUser.id,
      })

      setApplicationFeedback('Başvurunuz alınmıştır.')
      setSelectedOpenTournament(null)
      setTeamNameInput('')
    } catch (error) {
      console.warn('submitTournamentApplication suppressed:', error)
      setApplicationFeedback('Başvuru işleme alınmadı; giriş akışı etkilenmedi.')
    } finally {
      setApplying(false)
    }
  }

  const [selectedSponsor, setSelectedSponsor] = useState<SponsorRecord | null>(null)

  return (
    <div className="space-y-5 pb-8">
      {selectedOpenTournament ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setSelectedOpenTournament(null)}>
          <div className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-cyan-500/10" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Turnuva Kayıt</div>
                <h3 className="mt-2 text-2xl font-black text-white">{selectedOpenTournament.name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedOpenTournament(null)} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200">Kapat</button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Takım Adı
                  <input
                    value={teamNameInput}
                    onChange={(event) => setTeamNameInput(event.target.value.toLocaleUpperCase('tr-TR'))}
                    placeholder="Örn: MERKEZ SAĞLIK FC"
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white uppercase outline-none ring-0 placeholder:text-slate-500"
                  />
                </label>
              </div>

              {applicationFeedback ? (
                <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-100">{applicationFeedback}</div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSubmitTournamentApplication()}
                disabled={applying || !teamNameInput.trim()}
                className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-base font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applying ? 'Gönderiliyor...' : 'Turnuvaya Başvur / Takım Kaydı Yap'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedSponsor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSponsor(null)}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-cyan-500/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500">
                  <img src={selectedSponsor.logoUrl} alt={selectedSponsor.name} className="h-full w-full object-cover" />
                </div>
                <div>
                  <div className="text-sm uppercase tracking-[0.2em] text-cyan-300">Sponsor</div>
                  <h3 className="text-xl font-black text-white">{selectedSponsor.name}</h3>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedSponsor(null)} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 hover:border-slate-500">Kapat</button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Logo</div>
                <div className="mt-2 flex h-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                  <img src={selectedSponsor.logoUrl} alt={selectedSponsor.name} className="h-full w-full object-cover" />
                </div>
              </div>

              {selectedSponsor.website ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Web sitesi</div>
                  <a href={selectedSponsor.website} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-cyan-300 hover:underline">{selectedSponsor.website}</a>
                </div>
              ) : null}

              {selectedSponsor.location ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Konum</div>
                  <div className="mt-1 text-slate-200">{selectedSponsor.location}</div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Eklenme tarihi</div>
                <div className="mt-1 text-slate-200">{new Date(selectedSponsor.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <section className="glass-panel rounded-[30px] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300">
              <ShieldCheck size={12} />
              LeagueHub Live
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white">Modern turnuva yönetimi</h2>
            <p className="mt-2 max-w-md text-sm text-slate-300">Canlı skor, disiplin takibi, takım onayı ve mobil deneyim tek akışta.</p>
          </div>
          <div className="hidden h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/20 md:flex">
            <Trophy size={28} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-800 bg-slate-900/80 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Kayıt Açık</div>
            <h3 className="mt-2 text-xl font-black text-white">Turnuva Kayıtları</h3>
          </div>
          <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
            {openTournaments.length} açık
          </div>
        </div>

        {openTournaments.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {openTournaments.map((tournament) => {
              const approvedTeamsForBadge = getApprovedTeamsForTournament(tournament)

              return (
                <div key={tournament.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{tournament.status}</div>
                      <h4 className="mt-2 text-lg font-black text-white">{tournament.name}</h4>
                    </div>
                    <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                      {approvedTeamsForBadge.length} kayıt
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <div>Başlangıç: {tournament.startDate}</div>
                    <div>Ödül kuralları: {tournament.scoring.win}-3, {tournament.scoring.draw}-1, {tournament.scoring.loss}-0</div>
                  </div>

                  {currentUser?.role === 'Team Manager' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOpenTournament(tournament)
                        setTeamNameInput('')
                        setApplicationFeedback('')
                      }}
                      className="mt-4 w-full rounded-2xl bg-violet-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-violet-400"
                    >
                      Turnuvaya Başvur / Takım Kaydı Yap
                    </button>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
                      Bu alana erişmek için takım sorumlusu olarak giriş yapmanız gerekir.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
            Şu anda açık turnuva kaydı bulunmuyor.
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
        <div className="glass-card rounded-[28px] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Genel Duyurular</h3>
            <Bell className="text-cyan-300" size={18} />
          </div>
          <div className="space-y-3">
            {announcements.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{item.title}</span>
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300">{item.badge}</span>
                </div>
                <p className="text-sm text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-800/80 bg-slate-900/80 p-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Sponsorlar</h3>
            <Star className="text-yellow-300" size={18} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {sponsors.length > 0 ? (
              sponsors.map((brand) => (
                <button
                  type="button"
                  key={brand.id}
                  onClick={() => setSelectedSponsor(brand)}
                  className="group flex h-20 items-center justify-center rounded-2xl border border-slate-700/70 bg-white/5 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-cyan-500/5 hover:shadow-lg hover:shadow-cyan-500/10"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-inner shadow-white/10">
                      {brand.logoUrl ? (
                        <img src={brand.logoUrl} alt={brand.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-950">{brand.name.slice(0, 2)}</span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold tracking-[0.12em] text-slate-200 group-hover:text-white">{brand.name}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-3 text-center text-xs text-slate-400">
                Sponsor kaydı bulunmuyor.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Canlı Yayın</h3>
          <div className="flex items-center gap-3">
            <a href="https://www.instagram.com/leaguehubb" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-pink-300">
              <Camera size={16} />
              Instagram
            </a>
            <a href="https://www.youtube.com/@saglikcalisanlarsporkulubu/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300">
              <Video size={16} />
              Kanal Aç
            </a>
          </div>
        </div>

        {(() => {
          const streamUrl = 'https://www.youtube.com/@saglikcalisanlarsporkulubu/'
          const embedUrl = 'https://www.youtube.com/embed?listType=user_uploads&list=saglikcalisanlarsporkulubu'
          const isLive = false

          if (isLive && streamUrl) {
            return (
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                <iframe
                  className="aspect-video w-full"
                  src={embedUrl}
                  title="LeagueHub live stream"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            )
          }

          return (
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),transparent_40%)]" />
              <div className="relative flex flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 shadow-lg shadow-cyan-500/10">
                  <Trophy size={36} strokeWidth={2.2} />
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-cyan-300">Broadcast</div>
                  <h4 className="mt-2 text-2xl font-black text-white">Yakında Canlı Yayınlanacak</h4>
                  <p className="mt-2 max-w-md text-sm text-slate-300">Maç yayınlarımız ve turnuva akışı için kanalımız hazır hale geldiğinde burada otomatik olarak görüntülenecek.</p>
                </div>

                <a
                  href={streamUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
                >
                  <Video size={16} />
                  Kanalı Aç
                </a>
              </div>
            </div>
          )
        })()}
      </section>
    </div>
  )
}

type LeagueTab = 'standings' | 'fixtures' | 'stats' | 'discipline'

function LeagueTabBar({ activeTab, onChange }: { activeTab: LeagueTab; onChange: (nextTab: LeagueTab) => void }) {
  const tabs: { id: LeagueTab; label: string }[] = [
    { id: 'standings', label: 'Puan Durumu' },
    { id: 'fixtures', label: 'Fikstür' },
    { id: 'stats', label: 'İstatistik' },
    { id: 'discipline', label: 'Cezalılar' },
  ]

  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 rounded-full border border-slate-800 bg-slate-950/70 p-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            activeTab === tab.id
              ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

const buildTournamentFixtureRows = ({
  tournament,
  teams,
  matches,
  directMatches = [],
}: {
  tournament: Tournament | null | undefined
  teams: Team[]
  matches: Match[]
  directMatches?: Match[]
}) => {
  if (!tournament) return []

  const directFixtures = tournament.fixtures ?? []
  if (directFixtures.length > 0) {
    return directFixtures
  }

  const candidateMatches = (directMatches.length > 0 ? directMatches : matches).filter((match) => {
    if (match.tournamentId === tournament.id) return true
    if (match.tournamentId) return false
    if (tournament.teams.length === 0) return Boolean(match.homeTeamId && match.awayTeamId)
    return tournament.teams.includes(match.homeTeamId) || tournament.teams.includes(match.awayTeamId)
  })

  return buildFixtureRowsFromMatches(candidateMatches, tournament.id, tournament.teams.length > 0 ? tournament.teams : teams.map((team) => team.id))
}

function FixtureWeekCarousel({
  fixtureWeeks,
  selectedWeek,
  onSelectWeek,
  safeTeams,
  onSelectFixture,
}: {
  fixtureWeeks: { key: string; label: string; entries: Fixture[] }[]
  selectedWeek: string
  onSelectWeek: (nextWeek: string) => void
  safeTeams: Team[]
  onSelectFixture?: (fixtureId: string) => void
}) {
  if (!fixtureWeeks.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-300">
        Bu turnuvada henüz fikstür oluşturulmadı.
      </div>
    )
  }

  const activeWeekIndex = fixtureWeeks.findIndex((week) => week.label === selectedWeek)
  const fallbackWeekIndex = activeWeekIndex >= 0 ? activeWeekIndex : 0
  const activeWeek = fixtureWeeks[fallbackWeekIndex] ?? fixtureWeeks[0]
  const visibleFixtures = activeWeek ? activeWeek.entries : []

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const currentIndex = fixtureWeeks.findIndex((week) => week.label === selectedWeek)
            const nextIndex = Math.max(currentIndex - 1, 0)
            onSelectWeek(fixtureWeeks[nextIndex]?.label ?? '')
          }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-lg text-slate-200"
          aria-label="Önceki hafta"
        >
          ‹
        </button>

        <div className="flex-1 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {fixtureWeeks.map((week) => (
              <button
                key={week.key}
                type="button"
                onClick={() => onSelectWeek(week.label)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                  selectedWeek === week.label
                    ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.2)]'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {week.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const currentIndex = fixtureWeeks.findIndex((week) => week.label === selectedWeek)
            const nextIndex = Math.min(currentIndex + 1, Math.max(fixtureWeeks.length - 1, 0))
            onSelectWeek(fixtureWeeks[nextIndex]?.label ?? '')
          }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-lg text-slate-200"
          aria-label="Sonraki hafta"
        >
          ›
        </button>
      </div>

      {activeWeek ? (
        <div className="space-y-3 pt-2">
          {visibleFixtures.map((fixture) => {
            const home = safeTeams.find((team) => team.id === fixture.homeTeamId)
            const away = safeTeams.find((team) => team.id === fixture.awayTeamId)
            const homeId = (fixture as any).home_team_id ?? fixture.homeTeamId ?? 'Bilinmiyor'
            const awayId = (fixture as any).away_team_id ?? fixture.awayTeamId ?? 'Bilinmiyor'
            const homeName = home?.name || (fixture as any).mappedHome || (fixture as any).home_team_name || (fixture as any).homeTeam || `Takım ID: ${homeId}`
            const awayName = away?.name || (fixture as any).mappedAway || (fixture as any).away_team_name || (fixture as any).awayTeam || `Takım ID: ${awayId}`
            const isLive = fixture.status === 'Devam Ediyor'
            const timeLabel = isLive ? 'MS' : fixture.time || 'TBD'

            return (
              <div
                key={fixture.id}
                onClick={() => onSelectFixture?.(fixture.id)}
                className={`rounded-[22px] border border-slate-800 bg-slate-950/80 p-3 shadow-[0_0_20px_rgba(15,23,42,0.25)] ${onSelectFixture ? 'cursor-pointer' : ''} ${isLive ? 'border-red-500/40 bg-red-500/5' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  <span>{formatFixtureDateTitle(fixture.date)}</span>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-cyan-300">{timeLabel}</span>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2.5 text-left">
                    <TeamLogo team={home} size={28} />
                    <span className="truncate text-sm font-bold text-white">{homeName}</span>
                  </div>

                  <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-lg font-black text-cyan-300">
                    <span>{fixture.homeScore}</span>
                    <span className="text-slate-500">-</span>
                    <span>{fixture.awayScore}</span>
                  </div>

                  <div className="flex min-w-0 items-center justify-end gap-2.5 text-right">
                    <span className="truncate text-sm font-bold text-white">{awayName}</span>
                    <TeamLogo team={away} size={28} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </>
  )
}

function StandingsPage({ safeTeams, safeTournaments, matches }: { safeTeams: Team[]; safeTournaments: Tournament[]; matches: Match[] }) {
  const { appState, updatePlayerDiscipline, setAppState, refreshData } = useAppContext()
  const [activeStandingsTab, setActiveStandingsTab] = useState<LeagueTab>('standings')
  const [selectedFixtureWeek, setSelectedFixtureWeek] = useState('')
  const [disciplineModalOpen, setDisciplineModalOpen] = useState(false)
  const [disciplineDraft, setDisciplineDraft] = useState<{ teamId: string; playerId: string; yellowCards: number | ''; redCards: number | ''; suspensionMatches: number | ''; isSuspended: boolean }>({
    teamId: '',
    playerId: '',
    yellowCards: 0,
    redCards: 0,
    suspensionMatches: 0,
    isSuspended: false,
  })
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const tournament = safeTournaments.find((item) => item.status === 'Turnuva Başladı') ?? safeTournaments[0]

  const standings = useMemo(() => {
    const resultMap = new Map<string, { teamId: string; played: number; won: number; draw: number; lost: number; gf: number; ga: number; pts: number }>()
    const completedMatches = (matches ?? []).filter((match) => match.status === 'Bitti')

    for (const match of completedMatches) {
      const homeKey = match.homeTeamId
      const awayKey = match.awayTeamId

      if (!homeKey || !awayKey) continue

      const homeResult = resultMap.get(homeKey) ?? { teamId: homeKey, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 }
      const awayResult = resultMap.get(awayKey) ?? { teamId: awayKey, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 }

      const homeGoals = Number(match.homeScore ?? 0)
      const awayGoals = Number(match.awayScore ?? 0)

      homeResult.played += 1
      awayResult.played += 1
      homeResult.gf += homeGoals
      awayResult.gf += awayGoals
      homeResult.ga += awayGoals
      awayResult.ga += homeGoals

      if (homeGoals > awayGoals) {
        homeResult.won += 1
        awayResult.lost += 1
        homeResult.pts += tournament?.scoring?.win ?? 3
      } else if (homeGoals < awayGoals) {
        awayResult.won += 1
        homeResult.lost += 1
        awayResult.pts += tournament?.scoring?.win ?? 3
      } else {
        homeResult.draw += 1
        awayResult.draw += 1
        homeResult.pts += tournament?.scoring?.draw ?? 1
        awayResult.pts += tournament?.scoring?.draw ?? 1
      }

      resultMap.set(homeKey, homeResult)
      resultMap.set(awayKey, awayResult)
    }

    const allTeamIds = new Set<string>([
      ...safeTeams.map((team) => team.id),
      ...Array.from(resultMap.keys()),
    ])

    return Array.from(allTeamIds)
      .map((teamId) => {
        const row = resultMap.get(teamId) ?? { teamId, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, pts: 0 }
        const team = safeTeams.find((candidate) => candidate.id === teamId) ?? {
          id: teamId,
          name: 'Takım',
          shortName: 'T',
          city: 'Bilinmiyor',
          players: [],
          managerId: '',
          status: 'Beklemede',
          tournamentId: tournament?.id ?? '',
          logoUrl: '',
        } as Team

        return {
          team,
          played: row.played,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          gf: row.gf,
          ga: row.ga,
          pts: row.pts,
          gd: row.gf - row.ga,
        }
      })
      .sort((left, right) => right.pts - left.pts || right.gf - left.gf || left.team.name.localeCompare(right.team.name))
  }, [matches, safeTeams, tournament])

  const fixtureRows = useMemo(() => {
    return buildTournamentFixtureRows({
      tournament,
      teams: safeTeams,
      matches,
      directMatches: [],
    })
  }, [matches, safeTeams, tournament])

  const fixtureWeeks = useMemo(() => buildFixtureWeekGroups(fixtureRows), [fixtureRows])

  useEffect(() => {
    if (fixtureWeeks.length > 0 && !fixtureWeeks.some((week) => week.label === selectedFixtureWeek)) {
      setSelectedFixtureWeek(fixtureWeeks[0].label)
    }
  }, [fixtureWeeks, selectedFixtureWeek])

  const activeFixtureWeekIndex = fixtureWeeks.findIndex((week) => week.label === selectedFixtureWeek)
  const fallbackFixtureWeekIndex = activeFixtureWeekIndex >= 0 ? activeFixtureWeekIndex : 0
  const activeFixtureWeek = fixtureWeeks[fallbackFixtureWeekIndex] ?? fixtureWeeks[0]

  const [activeStatsTab, setActiveStatsTab] = useState<'goals' | 'golden-glove' | 'mvp'>('goals')

  const statLeaderboards = useMemo(() => {
    const completedMatches = (matches ?? []).filter((match) => match.status === 'Bitti')
    const playerTeamMap = new Map<string, { team: Team; player: Player }>()
    for (const team of safeTeams) {
      for (const player of team.players ?? []) {
        playerTeamMap.set(player.id, { team, player })
      }
    }

    const goalMap = new Map<string, { playerName: string; teamName: string; team: Team; value: number }>()
    const cleanSheetMap = new Map<string, { playerName: string; teamName: string; team: Team; value: number }>()
    const mvpMap = new Map<string, { playerName: string; teamName: string; team: Team; value: number }>()

    for (const match of completedMatches) {
      for (const event of match.events ?? []) {
        const person = playerTeamMap.get(event.playerId)
        if (!person) continue

        if (event.type === 'goal') {
          const current = goalMap.get(event.playerId) ?? {
            playerName: person.player.name,
            teamName: person.team.name,
            team: person.team,
            value: 0,
          }
          current.value += 1
          goalMap.set(event.playerId, current)
        }
      }

      if (match.mvpPlayerId) {
        const person = playerTeamMap.get(match.mvpPlayerId)
        if (person) {
          const current = mvpMap.get(match.mvpPlayerId) ?? {
            playerName: person.player.name,
            teamName: person.team.name,
            team: person.team,
            value: 0,
          }
          current.value += 1
          mvpMap.set(match.mvpPlayerId, current)
        }
      }

      const homeTeam = safeTeams.find((team) => team.id === match.homeTeamId)
      const awayTeam = safeTeams.find((team) => team.id === match.awayTeamId)

      if (homeTeam && match.homeScore === 0) {
        for (const player of homeTeam.players ?? []) {
          if (player.position === 'KL') {
            const current = cleanSheetMap.get(player.id) ?? {
              playerName: player.name,
              teamName: homeTeam.name,
              team: homeTeam,
              value: 0,
            }
            current.value += 1
            cleanSheetMap.set(player.id, current)
          }
        }
      }

      if (awayTeam && match.awayScore === 0) {
        for (const player of awayTeam.players ?? []) {
          if (player.position === 'KL') {
            const current = cleanSheetMap.get(player.id) ?? {
              playerName: player.name,
              teamName: awayTeam.name,
              team: awayTeam,
              value: 0,
            }
            current.value += 1
            cleanSheetMap.set(player.id, current)
          }
        }
      }
    }

    const rankRows = <T extends { playerName: string; teamName: string; team: Team; value: number }>(rows: Map<string, T>, label: string) =>
      Array.from(rows.values())
        .sort((left, right) => right.value - left.value || left.playerName.localeCompare(right.playerName))
        .slice(0, 10)
        .map((row, index) => ({ ...row, rank: index + 1, label }))

    return {
      goals: rankRows(goalMap, 'gol'),
      'golden-glove': rankRows(cleanSheetMap, 'temiz maç'),
      mvp: rankRows(mvpMap, 'puan'),
    }
  }, [matches, safeTeams])

  const statTabs = [
    { id: 'goals', label: 'Gol Krallığı', icon: Trophy },
    { id: 'golden-glove', label: 'Altın Eldiven', icon: ShieldCheck },
    { id: 'mvp', label: 'MVP', icon: Star },
  ] as const

  const currentLeaderboard = statLeaderboards[activeStatsTab]

  const displayRecords = useMemo(
    () => (appState.disciplineRecords ?? []).filter((item: any) => {
      const tId = item?.team_id ?? item?.teamId ?? ''
      const pId = item?.player_id ?? item?.playerId ?? ''

      if (tId === 'ae8a980c-f672-4b6c-a499-d78352422491' && pId === '629632f4-fef5-40a9-bb95-ab1c986b9dc1') return false
      if (tId === '865bd943-e13b-4df2-8413-ee86a5691d49' && pId === '0a8b9cab-eb57-48bd-9ee4-a60013b59218') return false

      return true
    }),
    [appState.disciplineRecords],
  )

  const ghostDisciplinePairs = useMemo(() => new Set([
    ['ae8a980c-f672-4b6c-a499-d78352422491', '629632f4-fef5-40a9-bb95-ab1c986b9dc1'].join('|'),
    ['865bd943-e13b-4df2-8413-ee86a5691d49', '0a8b9cab-eb57-48bd-9ee4-a60013b59218'].join('|'),
  ]), [])

  const visibleDisciplineRecords = useMemo(
    () => displayRecords.filter((record: any) => {
      const teamId = record?.team_id ?? record?.teamId ?? ''
      const playerId = record?.player_id ?? record?.playerId ?? ''
      return !ghostDisciplinePairs.has(`${teamId}|${playerId}`)
    }),
    [displayRecords, ghostDisciplinePairs],
  )

  const normalizedDisciplineRecords = useMemo(
    () => visibleDisciplineRecords.map((record) => {
      const rawRecord = record as any
      const yellowCards = Number(rawRecord.yellow_cards ?? rawRecord.yellowCards ?? (rawRecord.card_type === 'sarı' || rawRecord.cardType === 'sarı' ? 1 : 0))
      const redCards = Number(rawRecord.red_cards ?? rawRecord.redCards ?? (rawRecord.card_type === 'kırmızı' || rawRecord.cardType === 'kırmızı' ? 1 : 0))
      const suspensionMatches = Number(rawRecord.suspension_matches ?? rawRecord.suspensionMatches ?? rawRecord.match_suspension_count ?? 0)

      return {
        playerId: rawRecord.playerId ?? rawRecord.player_id ?? '',
        teamId: rawRecord.teamId ?? rawRecord.team_id ?? '',
        yellowCards,
        redCards,
        suspensionMatches,
        cardType: rawRecord.cardType ?? rawRecord.card_type,
        description: rawRecord.description,
        isSuspended: Boolean(rawRecord.isSuspended ?? rawRecord.is_suspended ?? false),
      }
    }),
    [visibleDisciplineRecords],
  )

  const disciplineRows = useMemo(() => buildDisciplineRows(safeTeams, matches, normalizedDisciplineRecords), [safeTeams, matches, normalizedDisciplineRecords])

  const openDisciplineEditor = (teamId: string, playerId: string) => {
    const team = safeTeams.find((candidate) => candidate.id === teamId)
    const player = team?.players.find((candidate) => candidate.id === playerId)
    if (!team || !player) return

    const record = (appState.disciplineRecords ?? []).find((entry) => entry.playerId === playerId && entry.teamId === teamId)

    setDisciplineDraft({
      teamId: team.id,
      playerId: player.id,
      yellowCards: Number(record?.yellowCards ?? player.yellowCards ?? 0),
      redCards: Number(record?.redCards ?? player.redCards ?? 0),
      suspensionMatches: Number(record?.suspensionMatches ?? player.suspensionMatches ?? 0),
      isSuspended: Boolean(record?.isSuspended ?? player.isSuspended),
    })
    setDisciplineModalOpen(true)
  }

  const saveDisciplineChanges = async () => {
    if (!disciplineDraft.teamId || !disciplineDraft.playerId) return

    const normalizedYellow = normalizeNumberInput(disciplineDraft.yellowCards, 0)
    const normalizedRed = normalizeNumberInput(disciplineDraft.redCards, 0)
    const normalizedSuspensionMatches = normalizeNumberInput(disciplineDraft.suspensionMatches, 0)

    try {
      await updatePlayerDiscipline(disciplineDraft.teamId, disciplineDraft.playerId, {
        yellowCards: normalizedYellow,
        redCards: normalizedRed,
        suspensionMatches: normalizedSuspensionMatches,
        isSuspended: Boolean(disciplineDraft.isSuspended) || normalizedRed > 0 || normalizedYellow >= 2 || normalizedSuspensionMatches > 0,
      })
      await refreshData()
      setSuccessMessage('Disiplin kaydı başarıyla alındı!')
      window.setTimeout(() => {
        setSuccessMessage(null)
        setDisciplineDraft({ teamId: '', playerId: '', yellowCards: 0, redCards: 0, suspensionMatches: 0, isSuspended: false })
        setDisciplineModalOpen(false)
      }, 2000)
    } catch (error) {
      console.error('Kayıt Hatası:', error)
    }
  }

  const handleDelete = async (record: any) => {
    const teamId = record?.team_id ?? record?.teamId ?? null
    const playerId = record?.player_id ?? record?.playerId ?? null

    console.log('[LeagueHub] Kesin imha tetiklendi:', { teamId, playerId, record })

    if (teamId && playerId) {
      const { error } = await supabase
        .from('discipline_records')
        .delete()
        .eq('team_id', teamId)
        .eq('player_id', playerId)

      if (error) {
        console.error('[LeagueHub] Supabase silme hatası:', error)
      }
    }

    setAppState((prevState) => {
      const currentList = prevState.disciplineRecords || []

      const updatedList = currentList.filter((item: any) => {
        if (teamId && playerId && item?.team_id === teamId && item?.player_id === playerId) {
          return false
        }

        if (item === record) {
          return false
        }

        return true
      })

      return {
        ...prevState,
        disciplineRecords: updatedList,
      }
    })
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Puan Durumu</div>
            <h2 className="mt-1 text-2xl font-black text-white">{tournament?.name ?? 'Turnuva'}</h2>
          </div>
        </div>
        <LeagueTabBar activeTab={activeStandingsTab} onChange={setActiveStandingsTab} />
      </div>

      {activeStandingsTab === 'standings' ? (
        <div className="overflow-hidden rounded-[22px] border border-slate-800 bg-slate-900">
          <div className="overflow-hidden">
            <table className="w-full table-fixed border-separate border-spacing-0 text-[8px] leading-none text-slate-200 sm:text-[9px]">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[32%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
              </colgroup>

              <thead>
                <tr className="bg-slate-950/80 text-[7px] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-[8px]">
                  <th className="px-1 py-2 text-left">S</th>
                  <th className="px-1 py-2 text-left">Takım</th>
                  <th className="px-1 py-2 text-center">O</th>
                  <th className="px-1 py-2 text-center">G</th>
                  <th className="px-1 py-2 text-center">B</th>
                  <th className="px-1 py-2 text-center">M</th>
                  <th className="px-1 py-2 text-center">AG</th>
                  <th className="px-1 py-2 text-center">YG</th>
                  <th className="px-1 py-2 text-center">AV</th>
                  <th className="px-1 py-2 text-right">P</th>
                </tr>
              </thead>

              <tbody>
                {standings.map((row, index) => (
                  <tr
                    key={row.team.id}
                    className="border-t border-slate-800 bg-slate-950/50 text-[8px] text-slate-200 sm:text-[9px]"
                  >
                    <td className="px-1 py-2 text-left font-black text-cyan-300">{index + 1}</td>
                    <td className="px-1 py-2">
                      <div className="flex max-w-full items-center gap-1.5 overflow-hidden">
                        <TeamLogo team={row.team} size={16} />
                        <span className="truncate font-semibold text-white">{row.team.name}</span>
                      </div>
                    </td>
                    <td className="px-1 py-2 text-center">{row.played}</td>
                    <td className="px-1 py-2 text-center text-emerald-300">{row.won}</td>
                    <td className="px-1 py-2 text-center text-yellow-300">{row.draw}</td>
                    <td className="px-1 py-2 text-center text-rose-300">{row.lost}</td>
                    <td className="px-1 py-2 text-center">{row.gf}</td>
                    <td className="px-1 py-2 text-center">{row.ga}</td>
                    <td className="px-1 py-2 text-center text-cyan-300">{row.gd}</td>
                    <td className="px-1 py-2 text-right font-black text-emerald-300">{row.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeStandingsTab === 'fixtures' ? (
        <div className="space-y-4 rounded-[28px] border border-slate-800 bg-slate-900 p-4">
          <FixtureWeekCarousel
            fixtureWeeks={fixtureWeeks}
            selectedWeek={selectedFixtureWeek}
            onSelectWeek={setSelectedFixtureWeek}
            safeTeams={safeTeams}
          />
        </div>
      ) : null}

      {disciplineModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onClick={() => setDisciplineModalOpen(false)}>
          <div className="w-full max-w-lg rounded-[28px] border border-slate-700 bg-slate-900 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.8)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Cezalı Yönetimi</div>
                <h3 className="mt-2 text-xl font-black text-white">Kart / Ceza Güncelleme</h3>
              </div>
              <button type="button" onClick={() => {
                setSuccessMessage(null)
                setDisciplineModalOpen(false)
              }} className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200">Kapat</button>
            </div>

            {successMessage && (
              <div className="mb-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-center text-sm font-medium text-emerald-300">
                {successMessage}
              </div>
            )}

            <div className="grid gap-3">
              <select
                value={disciplineDraft.teamId}
                onChange={(event) => {
                  const teamId = event.target.value
                  const team = safeTeams.find((candidate) => candidate.id === teamId)
                  const firstPlayer = team?.players[0]
                  setDisciplineDraft((current) => ({
                    ...current,
                    teamId,
                    playerId: firstPlayer ? firstPlayer.id : current.playerId,
                    yellowCards: firstPlayer?.yellowCards ?? 0,
                    redCards: firstPlayer?.redCards ?? 0,
                    suspensionMatches: Number(firstPlayer?.suspensionMatches ?? 0),
                    isSuspended: Boolean(firstPlayer?.isSuspended),
                  }))
                }}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="">Takım seç</option>
                {safeTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>

              <select
                value={disciplineDraft.playerId}
                onChange={(event) => {
                  const playerId = event.target.value
                  const team = safeTeams.find((candidate) => candidate.id === disciplineDraft.teamId)
                  const player = team?.players.find((candidate) => candidate.id === playerId)
                  setDisciplineDraft((current) => ({
                    ...current,
                    playerId,
                    yellowCards: Number(player?.yellowCards ?? 0),
                    redCards: Number(player?.redCards ?? 0),
                    suspensionMatches: Number(player?.suspensionMatches ?? 0),
                    isSuspended: Boolean(player?.isSuspended),
                  }))
                }}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                disabled={!disciplineDraft.teamId}
              >
                <option value="">Oyuncu seç</option>
                {(safeTeams.find((team) => team.id === disciplineDraft.teamId)?.players ?? []).map((player) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-slate-400">Sarı kart</span>
                  <input
                    type="number"
                    min={0}
                    value={disciplineDraft.yellowCards ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value
                      setDisciplineDraft((current) => ({
                        ...current,
                        yellowCards: raw === '' ? '' : normalizeNumberInput(raw, 0),
                      }))
                    }}
                    className="w-full bg-transparent text-white outline-none"
                  />
                </label>

                <label className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-slate-400">Kırmızı kart</span>
                  <input
                    type="number"
                    min={0}
                    value={disciplineDraft.redCards ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value
                      setDisciplineDraft((current) => ({
                        ...current,
                        redCards: raw === '' ? '' : normalizeNumberInput(raw, 0),
                      }))
                    }}
                    className="w-full bg-transparent text-white outline-none"
                  />
                </label>
              </div>

              <label className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">
                <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-slate-400">Maç cezası</span>
                <input
                  type="number"
                  min={0}
                  value={disciplineDraft.suspensionMatches ?? ''}
                  onChange={(event) => {
                    const raw = event.target.value
                    setDisciplineDraft((current) => ({
                      ...current,
                      suspensionMatches: raw === '' ? '' : normalizeNumberInput(raw, 0),
                    }))
                  }}
                  className="w-full bg-transparent text-white outline-none"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">
                <span>Ceza durumu</span>
                <input
                  type="checkbox"
                  checked={disciplineDraft.isSuspended}
                  onChange={(event) => setDisciplineDraft((current) => ({ ...current, isSuspended: event.target.checked }))}
                  className="h-4 w-4 accent-rose-500"
                />
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => void saveDisciplineChanges()} className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950">Kaydet</button>
              <button type="button" onClick={() => {
                setSuccessMessage(null)
                setDisciplineDraft({ teamId: '', playerId: '', yellowCards: 0, redCards: 0, suspensionMatches: 0, isSuspended: false })
                setDisciplineModalOpen(false)
              }} className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200">İptal</button>
            </div>
          </div>
        </div>
      ) : null}

      {activeStandingsTab === 'discipline' ? (
        <div className="rounded-[22px] border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Cezalılar</div>
              <div className="mt-1 text-xl font-black text-white">Sarı / Kırmızı Kart Takibi</div>
            </div>
            <button
              type="button"
              onClick={() => {
                const first = disciplineRows[0]
                if (!first) return
                openDisciplineEditor(first.team.id, first.player.id)
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-200 transition hover:bg-rose-500/15"
              aria-label="Cezalı kayıtları düzenle"
              title="Cezalı kayıtları düzenle"
            >
              <PencilLine size={14} />
            </button>
          </div>

          {disciplineRows.length ? (
            <div className="overflow-hidden rounded-[18px] border border-slate-800 bg-slate-950/70">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs text-slate-200">
                  <thead className="bg-slate-950/80 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Takım</th>
                      <th className="px-3 py-2">Oyuncu</th>
                      <th className="px-3 py-2 text-center">Sarı</th>
                      <th className="px-3 py-2 text-center">Kırmızı</th>
                      <th className="px-3 py-2 text-center">Maç Cezası</th>
                      <th className="px-3 py-2 text-center">Durum</th>
                      <th className="px-3 py-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disciplineRows.map(({ team, player, suspensionMatches }) => {
                      const matchingRecord = (appState.disciplineRecords ?? []).find((record) => record.playerId === player.id && record.teamId === team.id)
                      const recordId = matchingRecord?.id ?? (matchingRecord as any)?.uuid ?? (matchingRecord as any)?._id ?? (matchingRecord as any)?.record_id ?? null

                      return (
                        <tr key={`${team.id}-${player.id}`} className="border-t border-slate-800 bg-slate-900/50">
                          <td className="px-3 py-3 font-semibold text-white">{team.name}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-100">{player.name}</div>
                            {player.position ? <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{player.position}</div> : null}
                          </td>
                          <td className="px-3 py-3 text-center text-yellow-300">{player.yellowCards}</td>
                          <td className="px-3 py-3 text-center text-red-300">{player.redCards}</td>
                          <td className="px-3 py-3 text-center text-amber-300">{suspensionMatches > 0 ? `${suspensionMatches} Maç Ceza` : '0 Maç'}</td>
                          <td className="px-3 py-3 text-center">
                            {player.isSuspended ? (
                              <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-red-300">Cezalı</span>
                            ) : (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Aktif</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => openDisciplineEditor(team.id, player.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-200" aria-label="Cezayı düzenle">
                                <PencilLine size={14} />
                              </button>
                              <button type="button" onClick={() => void handleDelete(matchingRecord ?? { id: recordId, team_id: team.id, player_id: player.id, teamId: team.id, playerId: player.id })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-200" aria-label="Cezayı sil">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-300">
              Şu anda aktif ceza kaydı yok.
            </div>
          )}
        </div>
      ) : null}

      {activeStandingsTab === 'stats' ? (
        <div className="rounded-[22px] border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-violet-300">İstatistik</div>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-1">
            {statTabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveStatsTab(tab.id)}
                  className={`min-w-0 overflow-hidden rounded-full border px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[-0.02em] transition leading-none ${
                    activeStatsTab === tab.id
                      ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center justify-center gap-1 truncate">
                    <Icon size={10} className={activeStatsTab === tab.id ? 'text-cyan-300' : 'text-yellow-300'} />
                    <span className="truncate">{tab.label}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="overflow-hidden rounded-[18px] border border-slate-800 bg-slate-950/70">
            <div className="grid grid-cols-[34px_1fr_auto] items-center border-b border-slate-800 bg-slate-950/80 px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <span>#</span>
              <span>Oyuncu</span>
              <span className="text-right">İstatistik</span>
            </div>

            <div className="divide-y divide-slate-800">
              {currentLeaderboard.map((row) => (
                <div key={`${activeStatsTab}-${row.playerName}-${row.teamName}`} className="grid grid-cols-[34px_1fr_auto] items-center gap-2.5 px-2.5 py-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-[11px] font-black text-cyan-300">
                    {row.rank}
                  </div>

                  <div className="flex min-w-0 items-center gap-2.5">
                    <TeamLogo team={row.team} size={22} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-white">{row.playerName}</div>
                      <div className="truncate text-[10px] text-slate-400">{row.teamName}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-black text-cyan-300">{row.value}</div>
                    <div className="text-[8px] uppercase tracking-[0.12em] text-slate-400">{row.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const getFixtureWeekStart = (dateValue: string) => {
  const date = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(date.getTime())) return new Date()

  const dayNumber = date.getDay()
  const mondayOffset = dayNumber === 0 ? -6 : 1 - dayNumber
  const weekStart = new Date(date)
  weekStart.setDate(date.getDate() + mondayOffset)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

const formatFixtureDateTitle = (dateValue: string) => {
  const date = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateValue

  const dayName = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(date)
  const dateName = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)

  return `${dateName} - ${dayName.charAt(0).toUpperCase()}${dayName.slice(1)}`
}

const getWeekRank = (value: string) => {
  const match = value.match(/(\d+)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

export const buildFixtureWeekGroups = (fixtures: Fixture[]) => {
  const groups = new Map<string, { label: string; entries: Fixture[] }>()

  for (const fixture of [...fixtures].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    const normalizedWeek = (fixture.week ?? '').trim()
    const key = normalizedWeek || (() => {
      const weekStart = getFixtureWeekStart(fixture.date)
      return weekStart.toISOString().slice(0, 10)
    })()
    const label = normalizedWeek || `${groups.size + 1}. Hafta`

    const current = groups.get(key) ?? { label, entries: [] }
    current.label = label
    current.entries.push(fixture)
    groups.set(key, current)
  }

  const ordered = Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: group.label || key,
    entries: group.entries.sort((a, b) => a.time.localeCompare(b.time) || new Date(a.date).getTime() - new Date(b.date).getTime()),
  }))

  return ordered.sort((a, b) => {
    const weekDiff = getWeekRank(a.label) - getWeekRank(b.label)
    if (weekDiff !== 0) return weekDiff
    return a.label.localeCompare(b.label, 'tr')
  })
}

export const sortMatchesChronologically = (items: Match[]) => {
  const getMatchTimestamp = (match: Match) => {
    const rawDate = match.matchDate ?? '2999-12-31'
    const rawTime = match.matchTime ?? '00:00'
    const value = new Date(`${rawDate}T${rawTime}:00`)
    return Number.isNaN(value.getTime()) ? new Date('2999-12-31T00:00:00').getTime() : value.getTime()
  }

  return [...items].sort((left, right) => getMatchTimestamp(left) - getMatchTimestamp(right))
}

function FixturesPage({ safeTeams, safeTournaments, matches = [], canManageMatchControls = false }: { safeTeams: Team[]; safeTournaments: Tournament[]; matches?: Match[]; canManageMatchControls?: boolean }) {
  const { appState, updateMatchState } = useAppContext()
  const [selectedWeek, setSelectedWeek] = useState('')
  const [directMatches, setDirectMatches] = useState<Match[]>([])
  const [selectedFixtureDetailId, setSelectedFixtureDetailId] = useState<string | null>(null)
  const [eventDraft, setEventDraft] = useState<{ teamId: string; playerId: string; minute: number; type: MatchEvent['type']; description: string }>({
    teamId: '',
    playerId: '',
    minute: 0,
    type: 'goal',
    description: '',
  })
  const tournament = safeTournaments[0] ?? null

  useEffect(() => {
    if (!tournament?.id) {
      setDirectMatches([])
      return
    }

    let isMounted = true

    const loadTournamentMatches = async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!home_team_id(id, name, logo_url, short_name),
          away_team:teams!away_team_id(id, name, logo_url, short_name),
          match_events(*)
        `)
        .eq('tournament_id', tournament.id)
        .order('match_date', { ascending: true })

      if (!isMounted) return

      if (error) {
        console.warn('Tournament match load failed:', error)
        setDirectMatches([])
        return
      }

      setDirectMatches((data ?? []).map((row) => {
        const homeTeamId = row.home_team_id ?? ''
        const awayTeamId = row.away_team_id ?? ''
        const homeTeam = Array.isArray(row.home_team) ? row.home_team[0] : row.home_team ?? null
        const awayTeam = Array.isArray(row.away_team) ? row.away_team[0] : row.away_team ?? null
        const mappedHome = homeTeam?.name ?? row.home_team_name ?? row.homeTeamName ?? 'Takım'
        const mappedAway = awayTeam?.name ?? row.away_team_name ?? row.awayTeamName ?? 'Takım'
        const homeTeamName = mappedHome || homeTeamId || 'Takım'
        const awayTeamName = mappedAway || awayTeamId || 'Takım'
        const eventsFromMatch = (Array.isArray(row.match_events) ? row.match_events : []).map((eventRow: any) => ({
          id: eventRow.id,
          type: eventRow.type ?? 'goal',
          minute: Number(eventRow.minute ?? 0),
          teamId: eventRow.team_id ?? homeTeamId,
          playerId: eventRow.player_id ?? '',
          description: eventRow.description ?? '',
        }))

        return {
          id: row.id,
          tournamentId: row.tournament_id ?? undefined,
          fixtureId: row.fixture_id ?? '',
          homeTeamId,
          awayTeamId,
          homeTeamName,
          awayTeamName,
          mappedHome,
          mappedAway,
          home_team: homeTeam ? { id: homeTeam.id, name: homeTeam.name, logoUrl: homeTeam.logo_url ?? homeTeam.logoUrl ?? '', shortName: homeTeam.short_name ?? homeTeam.shortName ?? undefined } : { id: homeTeamId, name: homeTeamName },
          away_team: awayTeam ? { id: awayTeam.id, name: awayTeam.name, logoUrl: awayTeam.logo_url ?? awayTeam.logoUrl ?? '', shortName: awayTeam.short_name ?? awayTeam.shortName ?? undefined } : { id: awayTeamId, name: awayTeamName },
          home_team_name: homeTeamName,
          away_team_name: awayTeamName,
          homeScore: Number(row.home_score ?? 0),
          awayScore: Number(row.away_score ?? 0),
          status: row.status ?? 'Başlatıldı',
          events: eventsFromMatch,
          mvpPlayerId: row.mvp_player_id ?? undefined,
          week: row.week ?? undefined,
          matchDate: row.match_date ?? undefined,
          matchTime: row.match_time ?? undefined,
          venue: row.venue ?? undefined,
        }
      }))
    }

    void loadTournamentMatches()
    return () => {
      isMounted = false
    }
  }, [tournament?.id])

  const fixtureList = useMemo(() => {
    return buildTournamentFixtureRows({
      tournament,
      teams: safeTeams,
      matches,
      directMatches,
    })
  }, [directMatches, matches, safeTeams, tournament])

  const fixtureWeeks = useMemo(() => buildFixtureWeekGroups(fixtureList), [fixtureList])

  useEffect(() => {
    if (fixtureWeeks.length > 0) {
      const firstWeek = fixtureWeeks[0]?.label ?? '1. Hafta'
      if (firstWeek) {
        setSelectedWeek(firstWeek)
      }
    }
  }, [fixtureWeeks])

  const activeWeekIndex = fixtureWeeks.findIndex((week) => week.label === selectedWeek)
  const fallbackWeekIndex = activeWeekIndex >= 0 ? activeWeekIndex : 0
  const activeWeek = fixtureWeeks[fallbackWeekIndex] ?? fixtureWeeks[0]
  const candidateMatches = directMatches.length > 0 ? directMatches : matches
  const selectedFixtureMatch = selectedFixtureDetailId
    ? candidateMatches.find((match) => match.fixtureId === selectedFixtureDetailId || match.id === selectedFixtureDetailId) ?? null
    : null
  const allPlayersAcrossTeams = safeTeams.flatMap((team) => team.players ?? [])
  const getPlayerNameById = (playerId: string) => allPlayersAcrossTeams.find((player) => player.id === playerId)?.name ?? 'Bilinmeyen oyuncu'
  const matchEventsForSelectedFixture = selectedFixtureMatch
    ? ((selectedFixtureMatch.events ?? []).length > 0
      ? selectedFixtureMatch.events
      : (appState.matches ?? []).find((match) => match.id === selectedFixtureMatch.id || match.fixtureId === selectedFixtureMatch.fixtureId)?.events ?? [])
    : []

  useEffect(() => {
    if (!selectedFixtureMatch) return

    const homeTeam = safeTeams.find((team) => team.id === selectedFixtureMatch.homeTeamId)
    const awayTeam = safeTeams.find((team) => team.id === selectedFixtureMatch.awayTeamId)
    const homePlayers = filterSelectablePlayers(homeTeam?.players ?? [])
    const awayPlayers = filterSelectablePlayers(awayTeam?.players ?? [])
    const defaultTeamId = selectedFixtureMatch.homeTeamId || homePlayers[0]?.id || selectedFixtureMatch.awayTeamId
    const defaultPlayerId = homePlayers[0]?.id ?? awayPlayers[0]?.id ?? ''

    setEventDraft((current) => ({
      ...current,
      teamId: current.teamId || defaultTeamId,
      playerId: current.playerId || defaultPlayerId,
    }))
  }, [selectedFixtureMatch, safeTeams])

  const handleFixtureEventAdd = async (match: Match) => {
    if (!canManageMatchControls) return

    const homeTeam = safeTeams.find((team) => team.id === match.homeTeamId)
    const awayTeam = safeTeams.find((team) => team.id === match.awayTeamId)
    const teamPlayers = eventDraft.teamId === match.homeTeamId
      ? filterSelectablePlayers(homeTeam?.players ?? [])
      : filterSelectablePlayers(awayTeam?.players ?? [])

    if (!eventDraft.playerId || !teamPlayers.some((player) => player.id === eventDraft.playerId)) {
      return
    }

    const nextMatch = {
      ...match,
      events: [
        ...(match.events ?? []),
        {
          id: crypto.randomUUID(),
          type: eventDraft.type,
          minute: Number(eventDraft.minute) || 0,
          teamId: eventDraft.teamId,
          playerId: eventDraft.playerId,
          description: eventDraft.description.trim() || `${eventDraft.type === 'goal' ? 'Gol' : eventDraft.type === 'yellow' ? 'Sarı kart' : eventDraft.type === 'red' ? 'Kırmızı kart' : 'Oyuncu değişikliği'}`,
        },
      ],
    }

    if (eventDraft.type === 'goal') {
      if (eventDraft.teamId === match.homeTeamId) {
        nextMatch.homeScore = match.homeScore + 1
      } else {
        nextMatch.awayScore = match.awayScore + 1
      }
    }

    await updateMatchState(nextMatch)
    setEventDraft({ teamId: match.homeTeamId, playerId: homeTeam?.players?.[0]?.id ?? '', minute: 0, type: 'goal', description: '' })
  }

  const handleFixtureEventRemove = async (match: Match, eventId: string) => {
    if (!canManageMatchControls) return

    const nextMatch = { ...match, events: (match.events ?? []).filter((event) => event.id !== eventId) }
    await updateMatchState(nextMatch)
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Fikstür</div>
            <h2 className="mt-1 text-2xl font-black text-white">{tournament?.name ?? 'Turnuva Maç Takvimi'}</h2>
          </div>
          <CalendarDays className="text-cyan-300" size={22} />
        </div>
      </div>

      <div className="space-y-4 rounded-[28px] border border-slate-800 bg-slate-900 p-4">
        <FixtureWeekCarousel
          fixtureWeeks={fixtureWeeks}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
          safeTeams={safeTeams}
          onSelectFixture={setSelectedFixtureDetailId}
        />
      </div>

      {selectedFixtureMatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setSelectedFixtureDetailId(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-slate-700 bg-slate-900 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.75)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Maç Detayı</div>
                <h3 className="mt-2 text-xl font-black text-white">
                  {resolveFixtureTeamName(selectedFixtureMatch as any, 'home', safeTeams)} vs {resolveFixtureTeamName(selectedFixtureMatch as any, 'away', safeTeams)}
                </h3>
              </div>
              <button type="button" onClick={() => setSelectedFixtureDetailId(null)} className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200">Kapat</button>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-sm text-slate-300">Skor</div>
              <div className="text-2xl font-black text-cyan-300">
                {selectedFixtureMatch.homeScore} - {selectedFixtureMatch.awayScore}
              </div>
            </div>

            <div className="space-y-3">
              {matchEventsForSelectedFixture.length ? (
                matchEventsForSelectedFixture.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{event.description}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{getPlayerNameById(event.playerId)} • {event.type} • {event.minute}'</div>
                    </div>
                    {canManageMatchControls ? (
                      <button
                        type="button"
                        onClick={() => void handleFixtureEventRemove(selectedFixtureMatch, event.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-300 transition hover:bg-red-500/15"
                        aria-label={`${event.description} olayını sil`}
                        title="Olayı sil"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                  Bu maç için henüz olay kaydı yok.
                </div>
              )}
            </div>

            {canManageMatchControls ? (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-cyan-300">Olay Ekle</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <select value={eventDraft.teamId || selectedFixtureMatch.homeTeamId} onChange={(event) => setEventDraft((current) => ({ ...current, teamId: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                    <option value={selectedFixtureMatch.homeTeamId}>{resolveFixtureTeamName(selectedFixtureMatch as any, 'home', safeTeams)}</option>
                    <option value={selectedFixtureMatch.awayTeamId}>{resolveFixtureTeamName(selectedFixtureMatch as any, 'away', safeTeams)}</option>
                  </select>
                  <select value={eventDraft.type} onChange={(event) => setEventDraft((current) => ({ ...current, type: event.target.value as MatchEvent['type'] }))} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                    <option value="goal">Gol</option>
                    <option value="yellow">Sarı Kart</option>
                    <option value="red">Kırmızı Kart</option>
                    <option value="substitution">Oyuncu Değişikliği</option>
                  </select>
                  <input type="number" min={0} max={120} value={eventDraft.minute || ''} onChange={(event) => setEventDraft((current) => ({ ...current, minute: Number(event.target.value) || 0 }))} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" placeholder="Dakika" />
                  <select value={eventDraft.playerId} onChange={(event) => setEventDraft((current) => ({ ...current, playerId: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                    {(eventDraft.teamId === selectedFixtureMatch.homeTeamId ? filterSelectablePlayers((safeTeams.find((team) => team.id === selectedFixtureMatch.homeTeamId)?.players ?? [])) : filterSelectablePlayers((safeTeams.find((team) => team.id === selectedFixtureMatch.awayTeamId)?.players ?? []))).map((player) => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                </div>
                <input value={eventDraft.description} onChange={(event) => setEventDraft((current) => ({ ...current, description: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" placeholder="Açıklama (opsiyonel)" />
                <button type="button" onClick={() => void handleFixtureEventAdd(selectedFixtureMatch)} className="mt-3 w-full rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950">Olay Ekle</button>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Yalnızca izleme modu: bu detay penceresinden olay ekleme ve silme işlemi yapılamaz.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LiveScorePage({ safeTeams, appState, canManageMatchControls }: { safeTeams: Team[]; appState: AppState; canManageMatchControls: boolean }) {
  const { updateMatchState } = useAppContext()
  const [eventDraft, setEventDraft] = useState<{ matchId: string; teamId: string; playerId: string; minute: number; type: 'goal' | 'yellow' | 'red' | 'substitution'; description: string; mvpPlayerId: string }>({
    matchId: '',
    teamId: '',
    playerId: '',
    minute: 0,
    type: 'goal',
    description: '',
    mvpPlayerId: '',
  })
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const formatElapsedTime = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
    const minutes = Math.floor(safeSeconds / 60)
    const seconds = safeSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const getMatchDateTimestamp = (match: Match) => {
    const rawDate = (match.matchDate ?? (match as any).match_date ?? '2999-12-31').toString()
    const value = new Date(rawDate).getTime()
    return Number.isFinite(value) ? value : new Date('2999-12-31').getTime()
  }

  const matches = useMemo(() => {
    const allMatches = [...(appState.matches ?? [])]
    return allMatches.sort((a, b) => new Date(a.matchDate ?? (a as any).match_date ?? '2999-12-31').getTime() - new Date(b.matchDate ?? (b as any).match_date ?? '2999-12-31').getTime())
  }, [appState.matches])

  const getPreferredMatchId = (items: Match[]) => {
    const currentDate = new Date()
    const ordered = [...items].sort((a, b) => getMatchDateTimestamp(a) - getMatchDateTimestamp(b))
    const upcoming = ordered.find((match) => {
      const dateValue = getMatchDateTimestamp(match)
      const status = String(match.status ?? '').trim()
      return dateValue >= currentDate.getTime() && status !== 'Bitti' && status !== 'completed' && status !== 'Tamamlandı'
    })

    return upcoming?.id ?? ordered[0]?.id ?? ''
  }

  const activeMatches = useMemo(() => {
    return matches.filter((match) => {
      const status = String(match.status ?? '').trim().toLowerCase()
      return status !== 'bitti' && status !== 'completed' && status !== 'tamamlandı'
    })
  }, [matches])

  useEffect(() => {
    if (!activeMatches.length) {
      setSelectedMatchId('')
      return
    }

    const selected = activeMatches.find((match) => match.id === selectedMatchId)
    const selectedStatus = String(selected?.status ?? '').trim().toLowerCase()
    const shouldAutoSelect = !selectedMatchId || !selected || selectedStatus === 'bitti' || selectedStatus === 'completed' || selectedStatus === 'tamamlandı'

    if (!shouldAutoSelect) return

    const nextMatchId = getPreferredMatchId(activeMatches)
    if (nextMatchId) {
      setSelectedMatchId(nextMatchId)
    }
  }, [activeMatches, selectedMatchId])

  const selectedMatch = activeMatches.find((match) => match.id === selectedMatchId) ?? activeMatches[0] ?? null

  useEffect(() => {
    if (!selectedMatch) return

    const persistedSeconds = (Number(selectedMatch.elapsedMinutes ?? 0) * 60) || 0
    setLiveElapsedSeconds(persistedSeconds)
    setIsPlaying((current) => {
      if (selectedMatch.status === 'Başlatıldı') {
        return current || false
      }
      return false
    })

    setEventDraft((current) => {
      if (current.matchId === selectedMatch.id) return current
      const homeTeam = safeTeams.find((team) => team.id === selectedMatch.homeTeamId)
      const firstPlayerId = homeTeam?.players?.[0]?.id ?? ''
      return {
        ...current,
        matchId: selectedMatch.id,
        teamId: selectedMatch.homeTeamId,
        playerId: firstPlayerId,
        mvpPlayerId: '',
      }
    })
  }, [selectedMatch, safeTeams])

  useEffect(() => {
    if (!selectedMatch || !isPlaying) return

    const timerId = window.setInterval(() => {
      setLiveElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [selectedMatch?.id, isPlaying])

  const saveMatch = async (match: Match) => {
    await updateMatchState(match)
  }

  const handleStatusChange = async (match: Match, status: Match['status']) => {
    const isStarting = status === 'Başlatıldı'
    const next = {
      ...match,
      status,
      elapsedMinutes: Math.max(0, Math.floor(liveElapsedSeconds / 60)),
    }

    setIsPlaying(isStarting)
    await saveMatch(next)
  }

  const handleFinishMatch = async (match: Match) => {
    try {
      const next = {
        ...match,
        status: 'Bitti' as const,
        elapsedMinutes: Math.max(0, Math.floor(liveElapsedSeconds / 60)),
      }

      setIsPlaying(false)
      await saveMatch(next)

      const remaining = activeMatches.filter((candidate) => candidate.id !== match.id)
      const nextMatchId = getPreferredMatchId(remaining.length ? remaining : activeMatches.filter((candidate) => candidate.id !== match.id))
      if (nextMatchId) {
        setSelectedMatchId(nextMatchId)
      } else {
        setSelectedMatchId('')
      }

      window.alert('Maç bitti! Fikstüre işlendi, Puan Durumu güncellendi ve İstatistikler yansıdı.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
      window.alert(`Maç bitirilemedi: ${message}`)
    }
  }

  const handleAddEvent = async (match: Match) => {
    const current = eventDraft.matchId === match.id ? eventDraft : { ...eventDraft, matchId: match.id, teamId: match.homeTeamId, playerId: match.homeTeamId ? safeTeams[0]?.players?.[0]?.id ?? '' : '', mvpPlayerId: '' }
    if (!current.playerId || !current.teamId) return
    const event: MatchEvent = {
      id: crypto.randomUUID(),
      type: current.type,
      minute: current.minute,
      teamId: current.teamId,
      playerId: current.playerId,
      description: current.description || `${current.type === 'goal' ? 'Gol' : current.type === 'yellow' ? 'Sarı kart' : current.type === 'red' ? 'Kırmızı kart' : 'Oyuncu değişikliği'}`,
    }
    const nextMatch = { ...match, events: [...match.events, event] }
    if (current.type === 'goal') {
      if (current.teamId === match.homeTeamId) {
        nextMatch.homeScore = match.homeScore + 1
      } else {
        nextMatch.awayScore = match.awayScore + 1
      }
    }
    await saveMatch(nextMatch)
    setEventDraft({ matchId: '', teamId: '', playerId: '', minute: 0, type: 'goal', description: '', mvpPlayerId: '' })
  }

  const formatDate = (value: string | null | undefined) => {
    if (!value || typeof value !== 'string') return 'Tarih yok'

    const trimmed = value.trim()
    if (!trimmed) return 'Tarih yok'

    const [year, month, day] = trimmed.split('-').map((part) => part.trim())
    if (!year || !month || !day) return trimmed

    const dayNumber = Number(day)
    const monthNumber = Number(month)
    const validYear = Number(year)

    if (!Number.isFinite(dayNumber) || !Number.isFinite(monthNumber) || !Number.isFinite(validYear)) {
      return trimmed
    }

    const monthNames = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ]

    const date = new Date(validYear, monthNumber - 1, dayNumber)
    if (Number.isNaN(date.getTime())) return trimmed

    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
    const dayName = dayNames[date.getDay()]

    return `${dayNumber} ${monthNames[monthNumber - 1]} ${validYear} (${dayName})`
  }

  const formatMatchMenuLabel = (match: Match) => {
    const date = formatDate((match as any).match_date ?? match.matchDate)
    const time = (match as any).match_time ?? match.matchTime ?? '00:00'
    const homeDisplayName = resolveFixtureTeamName(match as any, 'home', safeTeams)
    const awayDisplayName = resolveFixtureTeamName(match as any, 'away', safeTeams)
    return `${date} - ${time} | ${homeDisplayName} vs ${awayDisplayName}`
  }

  if (!selectedMatch) {
    return (
      <div className="space-y-5 pb-8">
        <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Canlı Skor</div>
              <h2 className="mt-1 text-2xl font-black text-white">Maç Akışı</h2>
            </div>
            <PlayCircle className="text-cyan-300" size={22} />
          </div>
        </div>
        <div className="rounded-[24px] border border-dashed border-slate-700 bg-slate-900 p-6 text-center text-sm text-slate-300">
          Görüntülenecek maç bulunamadı.
        </div>
      </div>
    )
  }

  const home = safeTeams.find((team) => team.id === selectedMatch.homeTeamId)
  const away = safeTeams.find((team) => team.id === selectedMatch.awayTeamId)
  const homeDisplayName = resolveFixtureTeamName(selectedMatch as any, 'home', safeTeams)
  const awayDisplayName = resolveFixtureTeamName(selectedMatch as any, 'away', safeTeams)
  const homePlayers = filterSelectablePlayers(home?.players ?? [])
  const awayPlayers = filterSelectablePlayers(away?.players ?? [])
  const allPlayers = safeTeams.flatMap((team) => team.players)
  const isLive = selectedMatch.status === 'Durduruldu' || selectedMatch.status === 'Başlatıldı'
  const statusTone = selectedMatch.status === 'Bitti'
    ? 'bg-slate-700 text-slate-200'
    : isLive
      ? 'bg-red-500/15 text-red-300 border-red-500/30'
      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'

  const getEventTypeLabel = (type: MatchEvent['type']) => {
    switch (type) {
      case 'goal': return 'Gol'
      case 'yellow': return 'Sarı Kart'
      case 'red': return 'Kırmızı Kart'
      case 'substitution': return 'Değişiklik'
      default: return 'Olay'
    }
  }

  const getPlayerNameById = (playerId: string) => {
    return allPlayers.find((player) => player.id === playerId)?.name ?? 'Bilinmeyen oyuncu'
  }

  const handleRemoveEvent = async (match: Match, eventId: string) => {
    const nextMatch = {
      ...match,
      events: (match.events ?? []).filter((event) => event.id !== eventId),
    }
    await saveMatch(nextMatch)
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Canlı Skor</div>
            <h2 className="mt-1 text-2xl font-black text-white">Maç Akışı</h2>
          </div>
          <PlayCircle className="text-cyan-300" size={22} />
        </div>
        {!canManageMatchControls ? (
          <div className="mt-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
            Yalnızca izleme modu
          </div>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4">
        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Maç seçimi
        </label>
        <select
          value={selectedMatchId}
          onChange={(event) => setSelectedMatchId(event.target.value)}
          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none ring-0 transition focus:border-cyan-400"
        >
          {activeMatches.map((match) => (
            <option key={match.id} value={match.id}>
              {formatMatchMenuLabel(match)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4 shadow-[0_20px_40px_rgba(15,23,42,0.35)]">
        <div className="mb-3 flex items-center justify-between">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusTone}`}>
            {selectedMatch.status === 'Durduruldu' ? 'MS' : selectedMatch.status === 'Başlatıldı' ? 'Canlı' : selectedMatch.status === 'Bitti' ? 'Tamamlandı' : 'Planlandı'}
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Maç No {selectedMatch.id.slice(-3)}</span>
        </div>

        <div className="relative pb-4 pt-1">
          <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-full border border-cyan-400/50 bg-slate-950/95 px-3 py-1.5 text-sm font-black tracking-[0.12em] text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.25)] backdrop-blur-sm">
              {selectedMatch.status === 'Bitti' ? '90+\'' : formatElapsedTime(liveElapsedSeconds)}
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 pt-5">
            <div className="flex min-w-0 items-center gap-3 text-left">
              <TeamLogo team={home} size={34} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{homeDisplayName}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Ev</div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-2xl font-black text-cyan-300 shadow-inner shadow-cyan-500/10">
              <span>{selectedMatch.homeScore}</span>
              <span className="text-slate-500">-</span>
              <span>{selectedMatch.awayScore}</span>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-3 text-right">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{awayDisplayName}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Dep.</div>
              </div>
              <TeamLogo team={away} size={34} />
            </div>
          </div>
        </div>

        {canManageMatchControls ? (
          <>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => handleStatusChange(selectedMatch, 'Başlatıldı')} className="flex-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">Başlat</button>
              <button type="button" onClick={() => handleStatusChange(selectedMatch, 'Durduruldu')} className="flex-1 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm font-semibold text-yellow-300">Durdur</button>
              <button type="button" onClick={() => handleFinishMatch(selectedMatch)} className="flex-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">Maçı Bitir</button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-white">Olay Ekle</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <select value={eventDraft.type} onChange={(event) => setEventDraft({ ...eventDraft, type: event.target.value as MatchEvent['type'] })} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                  <option value="goal">Gol</option>
                  <option value="yellow">Sarı Kart</option>
                  <option value="red">Kırmızı Kart</option>
                  <option value="substitution">Oyuncu Değişikliği</option>
                </select>
                <input type="number" min={0} max={120} value={eventDraft.minute || ''} onChange={(event) => setEventDraft({ ...eventDraft, minute: Number(event.target.value) || 0 })} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" placeholder="Dakika" />
                <select value={eventDraft.teamId || selectedMatch.homeTeamId} onChange={(event) => setEventDraft({ ...eventDraft, teamId: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                  <option value={selectedMatch.homeTeamId}>{home?.name}</option>
                  <option value={selectedMatch.awayTeamId}>{away?.name}</option>
                </select>
                <select value={eventDraft.playerId} onChange={(event) => setEventDraft({ ...eventDraft, playerId: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                  {(eventDraft.teamId === selectedMatch.homeTeamId ? homePlayers : awayPlayers).map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
                <input value={eventDraft.description} onChange={(event) => setEventDraft({ ...eventDraft, description: event.target.value })} className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" placeholder="Açıklama" />
                <select value={eventDraft.mvpPlayerId || ''} onChange={(event) => setEventDraft({ ...eventDraft, mvpPlayerId: event.target.value })} className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white">
                  <option value="">MVP seçimi</option>
                  {[...(homePlayers ?? []), ...(awayPlayers ?? [])].map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => handleAddEvent(selectedMatch)} className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950">Olay Ekle</button>
                <button type="button" onClick={async () => {
                  const nextMatch = { ...selectedMatch, mvpPlayerId: eventDraft.mvpPlayerId || selectedMatch.mvpPlayerId }
                  await saveMatch(nextMatch)
                }} className="flex-1 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-bold text-violet-200">MVP Kaydet</button>
              </div>
            </div>
          </>
        ) : null}

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-white">Olaylar</span>
            <span className="text-xs text-slate-400">Olay / Oyuncu / Dakika</span>
          </div>
          {(selectedMatch.events ?? []).length ? (
            <div className="space-y-2 text-sm text-slate-300">
              {(selectedMatch.events ?? []).map((event) => (
                <div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-2">
                  <span className="inline-flex shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200">
                    {getEventTypeLabel(event.type)}
                  </span>
                  <span className="min-w-0 truncate text-[12px] font-medium text-slate-100" title={getPlayerNameById(event.playerId)}>
                    {getPlayerNameById(event.playerId)}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-cyan-300">{event.minute}'</span>
                  {canManageMatchControls ? (
                    <button
                      type="button"
                      aria-label="Olayı sil"
                      onClick={() => handleRemoveEvent(selectedMatch, event.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 transition hover:border-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">Henüz olay kaydı yok.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function GalleryPage({ currentUser }: { currentUser: User | null }) {
  const { appState, setAppState } = useAppContext()
  const galleryItems = Array.isArray(appState.gallery) ? appState.gallery : []

  const [showAddModal, setShowAddModal] = useState(false)
  const [newGalleryTitle, setNewGalleryTitle] = useState('')
  const [newGalleryCategory, setNewGalleryCategory] = useState('Genel')
  const [newGalleryUrl, setNewGalleryUrl] = useState('')
  const [isSubmittingGallery, setIsSubmittingGallery] = useState(false)

  const normalizedRole = String(currentUser?.role ?? '').trim().toLowerCase()
  const canManageGallery = normalizedRole.includes('super_admin')
    || normalizedRole.includes('super admin')
    || normalizedRole.includes('admin')
    || normalizedRole.includes('yönetici')
    || normalizedRole.includes('yonetici')

  const handleDeleteGalleryItem = async (item: { id: string; title?: string }) => {
    if (!item?.id || !canManageGallery) return

    const confirmed = window.confirm('Bu görseli silmek istediğinize emin misiniz?')
    if (!confirmed) return

    const { error } = await supabase.from('gallery_items').delete().eq('id', item.id)

    if (error) {
      console.error('Gallery delete error:', error)
      window.alert('Galeri görseli silinemedi: ' + (error.message ?? 'Bilinmeyen hata'))
      return
    }

    setAppState((previousState) => ({
      ...previousState,
      gallery: (previousState.gallery ?? []).filter((galleryItem) => galleryItem.id !== item.id),
    }))
  }

  const handleAddGalleryImage = async () => {
    if (!canManageGallery) return

    const trimmedUrl = newGalleryUrl.trim()
    if (!trimmedUrl) {
      window.alert('Lütfen bir görsel URL adresi girin.')
      return
    }

    setIsSubmittingGallery(true)

    const payload = {
      title: (newGalleryTitle || 'Galeri Görseli').trim() || 'Galeri Görseli',
      category: (newGalleryCategory || 'Genel').trim() || 'Genel',
      image_url: trimmedUrl,
    }

    const { data: insertedRows, error } = await supabase
      .from('gallery_items')
      .insert(payload)
      .select()

    setIsSubmittingGallery(false)

    if (error) {
      console.error('Gallery insert error:', error)
      window.alert('Galeri görseli eklenemedi: ' + (error.message ?? 'Bilinmeyen hata'))
      return
    }

    const insertedRow = Array.isArray(insertedRows) ? insertedRows[0] : null
    const nextItem = {
      id: insertedRow?.id ?? crypto.randomUUID(),
      title: insertedRow?.title ?? payload.title,
      image: insertedRow?.image_url ?? payload.image_url,
      category: insertedRow?.category ?? payload.category,
    }

    setAppState((previousState) => ({
      ...previousState,
      gallery: [nextItem, ...(previousState.gallery ?? [])],
    }))

    setNewGalleryTitle('')
    setNewGalleryCategory('Genel')
    setNewGalleryUrl('')
    setShowAddModal(false)
  }

  const handleGalleryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const imageSource = typeof reader.result === 'string' ? reader.result : ''
      if (imageSource) {
        setNewGalleryUrl(imageSource)
        setNewGalleryTitle((currentTitle) => currentTitle || file.name.replace(/\.[^/.]+$/, '') || 'Galeri Görseli')
      }
    }

    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Galeri</div>
            <h2 className="mt-1 text-2xl font-black text-white">Kulüp ve Turnuva Görselleri</h2>
          </div>
          <div className="flex items-center gap-2">
            <ImageIcon className="text-cyan-300" size={22} />
            {canManageGallery ? (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 text-xl font-black text-cyan-300 shadow-lg shadow-cyan-500/10 transition hover:border-cyan-400 hover:bg-cyan-500/15"
                aria-label="Galeriye resim ekle"
                title="Galeriye resim ekle"
              >
                +
              </button>
            ) : (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                Görüntüleme
              </span>
            )}
          </div>
        </div>
      </div>

      {showAddModal && canManageGallery ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-md rounded-[24px] border border-slate-700 bg-slate-900 p-4 shadow-[0_25px_70px_rgba(15,23,42,0.8)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Yeni Görsel</div>
                <h3 className="mt-1 text-lg font-black text-white">Galeriye Ekle</h3>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">Kapat</button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-slate-200">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-400">Başlık</span>
                <input
                  value={newGalleryTitle}
                  onChange={(event) => setNewGalleryTitle(event.target.value)}
                  placeholder="Kupa Töreni"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>

              <label className="block text-sm text-slate-200">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-400">Kategori</span>
                <input
                  value={newGalleryCategory}
                  onChange={(event) => setNewGalleryCategory(event.target.value)}
                  placeholder="Turnuva"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>

              <label className="block text-sm text-slate-200">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-400">Resim URL</span>
                <input
                  value={newGalleryUrl}
                  onChange={(event) => setNewGalleryUrl(event.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>

              <label className="block text-sm text-slate-200">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-400">Veya yerel dosya</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleGalleryFileChange}
                  className="w-full rounded-xl border border-dashed border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-500/15 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-cyan-300"
                />
              </label>

              {newGalleryUrl ? (
                <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                  <img src={newGalleryUrl} alt="Önizleme" className="h-32 w-full object-cover" />
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleAddGalleryImage()}
                disabled={isSubmittingGallery || !newGalleryUrl.trim()}
                className="w-full rounded-xl bg-cyan-500 px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingGallery ? 'Ekleniyor...' : 'Ekle / Kaydet'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {galleryItems.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-300">
          Henüz galeri görseli bulunmuyor.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {galleryItems.map((item) => (
            <div key={item.id} className="group relative overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900">
              {canManageGallery ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteGalleryItem(item)}
                  className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/40 bg-slate-950/80 text-red-300 shadow-lg shadow-slate-900/60 transition hover:border-red-400 hover:bg-red-500/10"
                  aria-label={`${item.title ?? 'Galeri'} görselini sil`}
                  title="Görseli sil"
                >
                  <Trash2 size={16} />
                </button>
              ) : null}

              <img src={item.image || 'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=900&q=80'} alt={item.title || 'Galeri görseli'} className="h-56 w-full object-cover" />
              <div className="flex items-center justify-between p-3">
                <div>
                  <div className="font-semibold text-white">{item.title || 'Galeri Görseli'}</div>
                  <div className="text-xs text-slate-400">{item.category || 'Genel'}</div>
                </div>
                <button type="button" className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-200">İncele</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProfilePage({ currentUser, safeTeams, safeTournaments, sponsors, setSponsors }: {
  currentUser: User | null
  safeTeams: Team[]
  safeTournaments: Tournament[]
  sponsors: SponsorRecord[]
  setSponsors: React.Dispatch<React.SetStateAction<SponsorRecord[]>>
}) {
  const { appState, approveTeamManagerRoleRequest, rejectTeamManagerRoleRequest, approveTournamentApplication, updateAppState, updateTournament, loadTournaments, deleteTournament, resolvePasswordResetRequest, addPlayerToTeam, refreshData } = useAppContext()
  const [requestSent, setRequestSent] = useState(false)
  const [newPlayerForm, setNewPlayerForm] = useState({
    teamId: '',
    name: '',
    unit: '',
    phone: '',
    tc: '',
    photoUrl: '',
    position: 'KL' as 'KL' | 'DEF' | 'ORT' | 'FOR',
  })
  const [showPlayerList, setShowPlayerList] = useState(false)
  const [playerEditor, setPlayerEditor] = useState<{
    teamId: string
    playerId: string
    name: string
    unit: string
    phone: string
    tc: string
    photoUrl: string
    position: 'KL' | 'DEF' | 'ORT' | 'FOR'
  } | null>(null)
  const [resetPasswordForm, setResetPasswordForm] = useState<Record<string, string>>({})
  const [resetPasswordMessage, setResetPasswordMessage] = useState('')
  const [adminModal, setAdminModal] = useState<'users' | 'tournaments' | 'home' | 'fixture' | 'password-requests' | 'sponsors' | null>(null)
  const [adminTab, setAdminTab] = useState<'overview' | 'users' | 'tournaments' | 'home' | 'fixture' | 'password-requests' | 'sponsors'>('overview')
  const [fixtureForm, setFixtureForm] = useState<{ tournamentId: string; days: string[]; times: string[]; venue: string }>({
    tournamentId: safeTournaments[0]?.id ?? '',
    days: ['Salı', 'Perşembe'],
    times: [...DEFAULT_FIXTURE_TIMES],
    venue: 'Merkez Stadyum',
  })

  useEffect(() => {
    if (!safeTournaments.length) {
      setFixtureForm((current) => ({ ...current, tournamentId: '' }))
      return
    }

    setFixtureForm((current) => {
      const hasValidTournament = current.tournamentId && safeTournaments.some((tournament) => tournament.id === current.tournamentId)
      return {
        ...current,
        tournamentId: hasValidTournament ? current.tournamentId : safeTournaments[0].id,
      }
    })
  }, [safeTournaments])
  const [newTournament, setNewTournament] = useState({
    name: '',
    startDate: '2026-09-15',
    status: 'Kayıt Açık' as Tournament['status'],
    rules: '',
    scoring: { win: 3, draw: 1, loss: 0 },
    yellowCardRule: 2,
  })
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '' })
  const [fixtureCustomTime, setFixtureCustomTime] = useState('')
  const toggleFixtureTime = (time: string) => {
    setFixtureForm((current) => ({
      ...current,
      times: current.times.includes(time)
        ? current.times.filter((item) => item !== time)
        : [...current.times, time],
    }))
  }
  const [tournamentEditor, setTournamentEditor] = useState<Tournament | null>(null)
  const [sponsorForm, setSponsorForm] = useState({
    name: '',
    logoUrl: '',
    website: '',
    location: '',
  })

  const normalizeRole = (role?: string | null) => (role ?? '').trim().toLowerCase()

  const normalizedRole = normalizeRole(currentUser?.role)
  const isAdmin = normalizedRole.includes('admin') || normalizedRole.includes('super') || normalizedRole.includes('süper') || normalizedRole.includes('yönetici') || normalizedRole.includes('yonetici')
  const canSeeMinimalAdminPanel = isAdmin
  const canManageSponsors = isAdmin
  const canManageTournamentSettings = isAdmin
  const canDeletePlayer = checkPermission(currentUser?.role, 'canDeletePlayer')
  const canEditPlayer = checkPermission(currentUser?.role, 'canEditPlayer')
  const canManageSystem = checkPermission(currentUser?.role, 'canManageSystem')
  const canDeleteTournament = isAdmin || canManageSystem || canDeletePlayer
  const adminModalIsOpen = adminModal !== null

  const handleBecomeManager = async () => {
    if (!currentUser) {
      window.alert('Giriş yapmadığınız için takım sorumlusu talebi oluşturamazsınız. Lütfen önce giriş yapın.')
      return
    }

    if (currentUser.teamManagerRequest || requestSent) return

    console.log('Talep butonuna basıldı, kullanıcı ID:', currentUser?.id)

    try {
      const { error } = await supabase.from('role_requests').insert([
        {
          user_id: currentUser.id,
          requested_role: 'Takım Sorumlusu',
          status: 'Beklemede',
        },
      ])

      if (error) {
        console.error('Supabase Hatası:', error)
        window.alert('Hata oluştu: ' + error.message)
        return
      }

      console.log('Supabase insert başarılı. Kullanıcı ID:', currentUser.id)
      setRequestSent(true)
      window.alert('Talebiniz alınmıştır!')
    } catch (error: any) {
      console.error('Supabase Hatası:', error)
      window.alert('Hata oluştu: ' + (error?.message ?? 'Bilinmeyen hata'))
    }
  }

  const handleSaveTournament = async () => {
    if (!newTournament.name.trim()) return

    const nextTournament: Tournament = createTournamentDraft({
      id: crypto.randomUUID(),
      name: newTournament.name,
      status: newTournament.status,
      startDate: newTournament.startDate,
      scoring: {
        win: Number(newTournament.scoring.win) || 3,
        draw: Number(newTournament.scoring.draw) || 1,
        loss: Number(newTournament.scoring.loss) || 0,
      },
      rules: newTournament.rules,
      yellowCardRule: Number(newTournament.yellowCardRule) || 2,
      teams: safeTeams.map((team) => team.id),
      fixtures: [],
    })

    const winPoints = Number(nextTournament.scoring.win) || 3
    const drawPoints = Number(nextTournament.scoring.draw) || 1
    const lossPoints = Number(nextTournament.scoring.loss) || 0
    const titleValue = nextTournament.name.trim() || 'Turnuva'

    const tournamentPayload = {
      id: nextTournament.id,
      name: titleValue,
      title: titleValue,
      status: nextTournament.status,
      start_date: nextTournament.startDate,
      rules: nextTournament.rules ?? '',
      scoring: {
        win: winPoints,
        draw: drawPoints,
        loss: lossPoints,
      },
      points_config: {
        win: winPoints,
        draw: drawPoints,
        loss: lossPoints,
      },
      win_points: winPoints,
      draw_points: drawPoints,
      loss_points: lossPoints,
      yellow_card_rule: Number(nextTournament.yellowCardRule) || 2,
      yellow_card_limit: Number(nextTournament.yellowCardRule) || 2,
      registered_team_ids: Array.isArray(nextTournament.registeredTeamIds) && nextTournament.registeredTeamIds.length
        ? nextTournament.registeredTeamIds
        : nextTournament.teams,
      teams: nextTournament.teams,
    }

    const { error: tournamentInsertError } = await supabase.from('tournaments').insert(tournamentPayload)
    if (tournamentInsertError) {
      console.error('Tournament insert failed:', tournamentInsertError)
      window.alert('Turnuva kaydı başarısız: ' + tournamentInsertError.message)
      return
    }

    await updateAppState({ ...appState, tournaments: [nextTournament, ...appState.tournaments] })
    setNewTournament({ name: '', startDate: '2026-09-15', status: 'Kayıt Açık', rules: '', scoring: { win: 3, draw: 1, loss: 0 }, yellowCardRule: 2 })
    setAdminModal(null)
  }

  const handleUpdateTournament = async () => {
    if (!tournamentEditor) return
    const cleanedName = tournamentEditor.name.trim()
    if (!cleanedName) return

    const nextTournament: Tournament = {
      ...tournamentEditor,
      name: cleanedName,
      rules: tournamentEditor.rules?.trim() ?? '',
      startDate: tournamentEditor.startDate || '2026-09-15',
      yellowCardRule: Number(tournamentEditor.yellowCardRule) || 2,
      scoring: {
        win: Number(tournamentEditor.scoring?.win) || 3,
        draw: Number(tournamentEditor.scoring?.draw) || 1,
        loss: Number(tournamentEditor.scoring?.loss) || 0,
      },
      teams: Array.isArray(tournamentEditor.teams) ? tournamentEditor.teams : [],
      registeredTeamIds: Array.isArray(tournamentEditor.registeredTeamIds) ? tournamentEditor.registeredTeamIds : (Array.isArray(tournamentEditor.teams) ? tournamentEditor.teams : []),
      fixtures: Array.isArray(tournamentEditor.fixtures) ? tournamentEditor.fixtures : [],
    }

    try {
      await updateTournament(nextTournament)
      setTournamentEditor(null)
      await loadTournaments()
    } catch (error) {
      console.error('handleUpdateTournament failed', error)
      window.alert('Turnuva güncellenemedi. Lütfen verileri kontrol edip tekrar deneyin.')
    }
  }

  const handleToggleTournament = async (tournamentId: string, nextStatus: Tournament['status']) => {
    const currentTournament = appState.tournaments.find((tournament) => tournament.id === tournamentId)
    if (!currentTournament) return

    const nextTournament = { ...currentTournament, status: nextStatus }
    try {
      await updateTournament(nextTournament)
      await loadTournaments()
    } catch (error) {
      console.error('handleToggleTournament failed', error)
      window.alert('Turnuva durumu güncellenemedi.')
    }
  }

  const handleDeleteTournament = async (tournamentId: string) => {
    const tournament = appState.tournaments.find((item) => item.id === tournamentId)
    if (!tournament) return

    const confirmed = window.confirm(`${tournament.name} turnuvasını silmek istediğinize emin misiniz?\n\nBu işlem ilgili tüm kayıtları, fikstürleri ve maç verilerini de kalıcı olarak silecektir.`)
    if (!confirmed) return

    try {
      await deleteTournament(tournamentId)
      if (tournamentEditor?.id === tournamentId) {
        setTournamentEditor(null)
      }
    } catch (error) {
      console.error('Tournament delete failed', error)
      window.alert('Turnuva silinemedi. Lütfen Supabase ilişkilerini kontrol edin.')
    }
  }

  const managedTeamsForCurrentUser = useMemo(() => {
    if (!currentUser) return []
    return safeTeams.filter((team) => team.managerId === currentUser.id || team.id === currentUser.teamId)
  }, [currentUser, safeTeams])

  const handleAddPlayer = async () => {
    if (!currentUser) return

    const selectedTeamId = newPlayerForm.teamId || currentUser.teamId || managedTeamsForCurrentUser[0]?.id
    if (!selectedTeamId) {
      window.alert('Önce yönetilen bir takım seçin.')
      return
    }

    const cleanTc = newPlayerForm.tc.trim()
    if (!/^\d{11}$/.test(cleanTc)) {
      window.alert('TC kimlik numarası tam 11 hane olmalıdır.')
      return
    }

    const payload = {
      name: newPlayerForm.name.trim(),
      unit: newPlayerForm.unit.trim(),
      phone: newPlayerForm.phone.trim(),
      tc: cleanTc,
      photoUrl: newPlayerForm.photoUrl.trim() || undefined,
      position: newPlayerForm.position.trim(),
    }

    if (!payload.name || !payload.unit || !payload.phone || !payload.tc) {
      window.alert('Ad soyad, birim, telefon ve TC alanları zorunludur.')
      return
    }

    try {
      await addPlayerToTeam(selectedTeamId, payload)
      setNewPlayerForm({
        teamId: selectedTeamId,
        name: '',
        unit: '',
        phone: '',
        tc: '',
        photoUrl: '',
        position: 'KL',
      })
    } catch (error) {
      console.error('handleAddPlayer failed', error)
      window.alert('Oyuncu eklenemedi. Lütfen tekrar deneyin.')
    }
  }

  const handleEditPlayer = (teamId: string, player: Player) => {
    setPlayerEditor({
      teamId,
      playerId: player.id,
      name: player.name,
      unit: player.unit,
      phone: player.phone,
      tc: player.tc,
      photoUrl: player.photoUrl ?? '',
      position: (player.position ?? 'KL') as 'KL' | 'DEF' | 'ORT' | 'FOR',
    })
  }

  const handleSaveEditedPlayer = async () => {
    if (!playerEditor) return

    const cleanTc = playerEditor.tc.trim()
    if (!/^\d{11}$/.test(cleanTc)) {
      window.alert('TC kimlik numarası tam 11 hane olmalıdır.')
      return
    }

    const team = safeTeams.find((item) => item.id === playerEditor.teamId)
    if (!team) return

    const nextPlayers = team.players.map((member) =>
      member.id === playerEditor.playerId
        ? {
            ...member,
            name: playerEditor.name.trim() || member.name,
            unit: playerEditor.unit.trim() || member.unit,
            phone: playerEditor.phone.trim() || member.phone,
            tc: cleanTc,
            photoUrl: playerEditor.photoUrl.trim() || undefined,
            position: playerEditor.position,
          }
        : member,
    )

    await updateAppState({
      ...appState,
      teams: safeTeams.map((item) =>
        item.id === playerEditor.teamId
          ? { ...item, players: nextPlayers }
          : item,
      ),
    })

    setPlayerEditor(null)
  }

  const handleAddAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) return
    const nextAnnouncement = {
      id: `announcement-${crypto.randomUUID()}`,
      title: announcementForm.title.trim(),
      body: announcementForm.body.trim(),
      date: new Date().toISOString(),
    }
    await updateAppState({ ...appState, announcements: [nextAnnouncement, ...appState.announcements] })
    setAnnouncementForm({ title: '', body: '' })
  }

  const handleDeleteAnnouncement = async (announcementId: string) => {
    await updateAppState({
      ...appState,
      announcements: appState.announcements.filter((item) => item.id !== announcementId),
    })
  }

  const handleAddSponsor = async () => {
    if (!canManageSponsors) {
      window.alert('Sponsor eklemek için yalnızca yönetici rolüne sahip kullanıcılar erişebilir.')
      return
    }

    const cleanName = sponsorForm.name.trim()
    const cleanLogoUrl = sponsorForm.logoUrl.trim()
    const cleanWebsite = sponsorForm.website.trim()
    const cleanLocation = sponsorForm.location.trim()
    if (!cleanName || !cleanLogoUrl) return

    try {
      const { data, error } = await supabase
        .from('sponsors')
        .insert([{ name: cleanName, logo_url: cleanLogoUrl, website: cleanWebsite || null, location: cleanLocation || null }])
        .select('*')
        .single()

      if (error) {
        throw error
      }

      setSponsors((current) => [normalizeSponsorRecord(data), ...current])
      setSponsorForm({ name: '', logoUrl: '', website: '', location: '' })
      setAdminModal('sponsors')
    } catch (error: any) {
      console.error('[LeagueHub] Sponsor insert failed:', error)
      window.alert('Sponsor eklenemedi: ' + (error?.message ?? 'Bilinmeyen hata'))
    }
  }

  const handleDeleteSponsor = async (id: string) => {
    const sponsor = sponsors.find((item) => item.id === id)
    const confirmed = window.confirm(`${sponsor?.name ?? 'Sponsor'} silinsin mi?`)
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('sponsors')
        .delete()
        .eq('id', id)

      if (error) {
        throw error
      }

      setSponsors((current) => current.filter((item) => item.id !== id))
    } catch (error: any) {
      console.error('[LeagueHub] Sponsor delete failed:', error)
      window.alert('Sponsor silinemedi: ' + (error?.message ?? 'Bilinmeyen hata'))
    }
  }

  const handleAutoGenerateFixtures = async () => {
    if (!fixtureForm.tournamentId) {
      console.warn('AUTO_FIXTURE_MISSING_TOURNAMENT_ID', {
        fixtureForm,
        safeTournaments,
      })
      window.alert('Fikstür oluşturulacak geçerli turnuva bulunamadı.')
      return
    }

    const selectedTournament = safeTournaments.find((item) => item.id === fixtureForm.tournamentId)
    if (!selectedTournament) {
      console.warn('AUTO_FIXTURE_INVALID_TOURNAMENT_ID', {
        tournamentId: fixtureForm.tournamentId,
        availableTournamentIds: safeTournaments.map((item) => item.id),
      })
      window.alert('Seçili turnuva bulunamadı.')
      return
    }

    const selectedDays = fixtureForm.days.length ? fixtureForm.days : [...FULL_WEEK_DAYS]
    const selectedTimes = fixtureForm.times.length ? fixtureForm.times : [...DEFAULT_FIXTURE_TIMES]
    const approvedTeams = getApprovedTeamsForTournament(selectedTournament)

    if (selectedDays.length === 0 || selectedTimes.length === 0) {
      window.alert('Fikstür oluşturmak için en az bir gün ve bir saat seçmelisiniz.')
      return
    }

    if (approvedTeams.length < 2) {
      window.alert('Bu turnuvada otomatik fikstür oluşturmak için en az 2 onaylı takım gerekir.')
      return
    }

    const teamIds = approvedTeams.map((team) => team.id)

    console.log('AUTO_FIXTURE_CLICK', {
      tournamentId: fixtureForm.tournamentId,
      selectedDays,
      selectedHours: selectedTimes,
      venue: fixtureForm.venue,
      teamCount: teamIds.length,
      teamIds,
    })

    const generated = generateAutoFixtures(
      fixtureForm.tournamentId,
      teamIds,
      selectedDays,
      selectedTimes,
      fixtureForm.venue,
      selectedTournament.startDate,
    )

    console.log('AUTO_FIXTURE_GENERATED', {
      generatedCount: generated.length,
      fixtures: generated,
    })

    const generatedMatches = generated.map((fixture) => ({
      id: crypto.randomUUID(),
      tournamentId: fixtureForm.tournamentId,
      fixtureId: fixture.id,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeScore: 0,
      awayScore: 0,
      status: 'Durduruldu' as const,
      events: [],
      elapsedMinutes: 0,
      week: fixture.week,
      matchDate: fixture.date,
      matchTime: fixture.time,
      venue: fixture.venue,
    }))

    const validGeneratedMatches = generatedMatches.filter((match) => {
      return isValidUuid(match.fixtureId) && isValidUuid(match.homeTeamId) && isValidUuid(match.awayTeamId)
    })

    console.log('AUTO_FIXTURE_MATCH_ROWS_READY', {
      readyCount: validGeneratedMatches.length,
      matches: validGeneratedMatches,
    })

    if (validGeneratedMatches.length === 0) {
      window.alert('Fikstür oluşturulamadı: geçerli UUID takım veya maç kimliği bulunamadı.')
      return
    }

    const fixtureRows = generated.map((fixture) => ({
      id: fixture.id,
      tournament_id: fixtureForm.tournamentId,
      fixture_date: fixture.date.includes(' (') ? fixture.date.split(' (')[0] : fixture.date,
      fixture_time: fixture.time,
      venue: fixture.venue,
      status: 'Planlandı' as const,
    }))

    const matchRows = validGeneratedMatches.map((match) => ({
      id: match.id,
      tournament_id: fixtureForm.tournamentId,
      fixture_id: match.fixtureId,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      home_score: match.homeScore,
      away_score: match.awayScore,
      status: match.status,
      elapsed_minutes: Number(match.elapsedMinutes ?? 0),
      week: match.week ?? null,
      match_date: match.matchDate ?? null,
      match_time: match.matchTime ?? null,
      venue: match.venue ?? null,
      mvp_player_id: null,
    }))

    const [{ error: fixtureUpsertError }, { error: matchInsertError }] = await Promise.all([
      supabase.from('fixtures').upsert(fixtureRows, { onConflict: 'id' }),
      supabase.from('matches').upsert(matchRows, { onConflict: 'id' }),
    ])

    if (fixtureUpsertError) {
      console.error('Generated fixture upsert failed:', fixtureUpsertError)
      window.alert('Fikstür kaydı başarısız: ' + fixtureUpsertError.message)
      return
    }

    if (matchInsertError) {
      console.error('Generated match insert failed:', matchInsertError)
      window.alert('Maçlar oluşturulamadı: ' + matchInsertError.message)
      return
    }

    await loadTournaments()
    setAdminModal(null)
  }

  const handleClearTournamentFixtures = async () => {
    if (!fixtureForm.tournamentId) return

    const selectedTournament = safeTournaments.find((item) => item.id === fixtureForm.tournamentId)
    if (!selectedTournament) return

    const confirmed = window.confirm(`${selectedTournament.name} turnuvasındaki tüm fikstürü silmek istediğinize emin misiniz?`)
    if (!confirmed) return

    const { error } = await supabase.from('fixtures').delete().eq('tournament_id', fixtureForm.tournamentId)
    if (error) {
      console.error('Fixture cleanup failed:', error)
      window.alert('Fikstür silinemedi: ' + error.message)
      return
    }

    await updateAppState({
      ...appState,
      tournaments: appState.tournaments.map((tournament) =>
        tournament.id === fixtureForm.tournamentId ? { ...tournament, fixtures: [] } : tournament,
      ),
    })
    setAdminModal(null)
  }

  const adminModules = [
    { key: 'tournaments', label: 'Turnuvalar', description: 'Etkinlik ve durum' },
    { key: 'users', label: 'Onaylar', description: 'Rol ve başvuru takibi' },
    { key: 'fixture', label: 'Fikstür', description: 'Planlama ve maç akışı' },
    { key: 'sponsors', label: 'Sponsorlar', description: 'Sponsor yönetimi' },
    { key: 'password-requests', label: 'Şifre Talepleri', description: 'Güvenlik yönetimi' },
  ] as const

  const adminOverviewStats = [
    { label: 'Toplam Kullanıcı', value: appState.users.length, tone: 'text-cyan-300', accent: 'from-cyan-500/15 to-cyan-500/5' },
    { label: 'Aktif Turnuva', value: safeTournaments.filter((tournament) => tournament.status !== 'Turnuva Bitti').length, tone: 'text-emerald-300', accent: 'from-emerald-500/15 to-emerald-500/5' },
    { label: 'Takım Sayısı', value: safeTeams.length, tone: 'text-violet-300', accent: 'from-violet-500/15 to-violet-500/5' },
    { label: 'Onay Bekleyen', value: appState.users.filter((user) => user.teamManagerRequest || user.role === 'Visitor').length, tone: 'text-amber-300', accent: 'from-amber-500/15 to-amber-500/5' },
  ]

  const adminTabs = [
    { id: 'overview', label: 'Özet', description: 'Genel bakış' },
    { id: 'tournaments', label: 'Turnuvalar', description: 'Planlama' },
    { id: 'users', label: 'Onaylar', description: 'İzin ve başvurular' },
    { id: 'fixture', label: 'Fikstür', description: 'Otomasyon' },
    { id: 'sponsors', label: 'Sponsorlar', description: 'Yönetim' },
    { id: 'password-requests', label: 'Şifre', description: 'Yönetim' },
  ] as const

  function getApprovedTeamsForTournament(tournament: Tournament): Team[] {
    return safeTeams.filter((team) => {
      if (team.status !== 'Onaylı') return false
      const matchesTournament = team.tournamentId === tournament.id || tournament.teams.includes(team.id) || tournament.registeredTeamIds?.includes(team.id)
      return matchesTournament
    })
  }

  const handleEditTeam = async (team: Team) => {
    const nextName = window.prompt('Takım adını düzenleyin:', team.name)
    if (nextName === null) return

    const cleanName = nextName.trim()
    if (!cleanName || cleanName === team.name) return

    const nextTeams = safeTeams.map((item) =>
      item.id === team.id
        ? {
            ...item,
            name: cleanName,
            shortName: cleanName.slice(0, 3).toUpperCase() || item.shortName,
          }
        : item,
    )

    await updateAppState({
      ...appState,
      teams: nextTeams,
    })
  }

  const handleDeleteTeam = async (teamId: string) => {
    const team = safeTeams.find((item) => item.id === teamId)
    if (!team) return

    const confirmed = window.confirm(`${team.name} takımı silinsin mi?`)
    if (!confirmed) return

    const nextTeams = safeTeams.filter((item) => item.id !== teamId)
    const nextTournaments = appState.tournaments.map((tournament) => ({
      ...tournament,
      teams: (tournament.teams ?? []).filter((id) => id !== teamId),
      registeredTeamIds: (tournament.registeredTeamIds ?? []).filter((id) => id !== teamId),
    }))

    await updateAppState({
      ...appState,
      teams: nextTeams,
      tournaments: nextTournaments,
    })
  }

  const profileSummaryCards = (() => {
    const role = normalizeRole(currentUser?.role)
    const teamCount = safeTeams.filter((team) => team.managerId === currentUser?.id).length
    const playerCount = safeTeams.filter((team) => team.managerId === currentUser?.id).reduce((total, team) => total + (team.players?.length ?? 0), 0)

    if (role === 'visitor') {
      return [
        { label: 'Rol', value: 'Visitor', tone: 'text-slate-200', accent: 'bg-slate-700/70' },
        { label: 'Katılım', value: '0 turnuva', tone: 'text-cyan-300', accent: 'bg-cyan-500/10' },
        { label: 'Durum', value: 'İzleyici', tone: 'text-emerald-300', accent: 'bg-emerald-500/10' },
      ]
    }

    if (role === 'team manager') {
      return [
        { label: 'Takım', value: String(teamCount || 1), tone: 'text-violet-300', accent: 'bg-violet-500/10' },
        { label: 'Oyuncu', value: String(playerCount || 0), tone: 'text-cyan-300', accent: 'bg-cyan-500/10' },
        { label: 'Turnuva', value: `${safeTournaments.filter((t) => t.status !== 'Turnuva Bitti').length} aktif`, tone: 'text-emerald-300', accent: 'bg-emerald-500/10' },
      ]
    }

    if (role.includes('admin')) {
      return [
        { label: 'Kullanıcı', value: String(appState.users.length), tone: 'text-cyan-300', accent: 'bg-cyan-500/10' },
        { label: 'Turnuva', value: String(safeTournaments.filter((t) => t.status !== 'Turnuva Bitti').length), tone: 'text-emerald-300', accent: 'bg-emerald-500/10' },
        { label: 'Onay', value: String(appState.passwordResetRequests.length), tone: 'text-amber-300', accent: 'bg-amber-500/10' },
      ]
    }

    return [
      { label: 'Rol', value: 'Profil', tone: 'text-slate-200', accent: 'bg-slate-700/70' },
      { label: 'Erişim', value: 'Temel', tone: 'text-cyan-300', accent: 'bg-cyan-500/10' },
      { label: 'Durum', value: 'Aktif', tone: 'text-emerald-300', accent: 'bg-emerald-500/10' },
    ]
  })()

  const roleOptions = [
    { value: 'Super Admin', label: 'Yönetici (Süper Admin)' },
    { value: 'Admin', label: 'Admin' },
    { value: 'Team Manager', label: 'Takım Sorumlusu' },
    { value: 'Visitor', label: 'Ziyaretçi' },
  ] as const

  const canUpdateTournamentForm = Boolean(isAdmin || canEditPlayer || canManageSystem)
  const isTournamentEditorValid = Boolean(tournamentEditor && tournamentEditor.name.trim().length > 0)
  const handleUserRoleChange = async (userId: string, nextRole: Role) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: nextRole })
        .eq('id', userId)

      if (error) {
        console.error('User role update failed:', error)
        window.alert('Rol güncellenirken hata oluştu: ' + error.message)
        return
      }

      await refreshData()
      window.alert('Seçim onaylanmıştır')
    } catch (error: any) {
      console.error('User role update failed:', error)
      window.alert('Rol güncellenirken hata oluştu: ' + (error?.message ?? 'Bilinmeyen hata'))
    }
  }

  const canApprovePendingTeamApplications = normalizedRole.includes('admin') || normalizedRole.includes('super') || normalizedRole.includes('süper') || normalizedRole.includes('yönetici') || normalizedRole.includes('yonetici')

  const handleApproveTournamentTeamApplication = async (team: Team) => {
    if (!canApprovePendingTeamApplications) {
      window.alert('Bu işlemi yalnızca Admin ve Süper Admin kullanıcılar yapabilir.')
      return
    }

    const resolvedTournamentId = team.tournamentId ?? appState.tournaments.find((item) => item.teams.includes(team.id) || item.registeredTeamIds?.includes(team.id))?.id
    if (!resolvedTournamentId) {
      window.alert('Turnuva kimliği bulunamadığı için başvuru onayı yapılamadı.')
      return
    }

    try {
      await approveTournamentApplication({
        id: `approval-${team.id}`,
        tournamentId: resolvedTournamentId,
        teamName: team.name,
        userId: team.managerId,
        status: 'Beklemede',
        teamId: team.id,
        createdAt: new Date().toISOString(),
      })
      window.alert(`${team.name} takımı onaylandı.`)
    } catch (error) {
      console.error('handleApproveTournamentTeamApplication failed:', error)
      window.alert('Takım onayı sırasında hata oluştu.')
    }
  }

  const handleApproveTeamManagerRequest = async (userId: string) => {
    try {
      await approveTeamManagerRoleRequest(userId)
      window.alert('Takım sorumlusu talebi onaylandı. Kullanıcıya yeni yetkiler aktif edildi.')
    } catch (error) {
      console.error('handleApproveTeamManagerRequest failed:', error)
      window.alert('Talep onayı sırasında hata oluştu.')
    }
  }

  const handleRejectTeamManagerRequest = async (userId: string) => {
    try {
      await rejectTeamManagerRoleRequest(userId)
      window.alert('Takım sorumlusu talebi reddedildi.')
    } catch (error) {
      console.error('handleRejectTeamManagerRequest failed:', error)
      window.alert('Talep reddi sırasında hata oluştu.')
    }
  }

  const handleResolvePasswordResetRequest = async (requestId: string) => {
    const temporaryPassword = (resetPasswordForm[requestId] ?? '').trim()
    const result = await resolvePasswordResetRequest(requestId, temporaryPassword)
    setResetPasswordMessage(result.message)
    if (result.success) {
      setResetPasswordForm((current) => ({ ...current, [requestId]: '' }))
    }
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="rounded-[28px] border border-slate-800 bg-[linear-gradient(135deg,rgba(15,118,110,0.12),rgba(15,23,42,1)_35%,rgba(15,23,42,1))] p-4 shadow-[0_18px_48px_rgba(14,116,144,0.18)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Profil</div>
            <h2 className="mt-2 text-2xl font-black text-white">{currentUser?.fullName ?? 'Kullanıcı'}</h2>
            <div className="mt-1 text-sm text-slate-400">{currentUser?.username ?? 'username'} • {currentUser?.role ?? 'Visitor'}</div>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-xl font-black text-slate-950 shadow-lg shadow-cyan-500/20">{currentUser?.fullName?.substring(0, 1) ?? 'U'}</div>
        </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {profileSummaryCards.map((card) => (
          <div key={card.label} className={`rounded-[18px] border border-slate-700/80 bg-gradient-to-br ${card.accent} p-[1px]`}>
            <div className="h-full rounded-[18px] bg-slate-950/80 p-2.5">
              <div className="text-[9px] uppercase tracking-[0.15em] text-slate-400">{card.label}</div>
              <div className={`mt-1 text-base font-black leading-tight ${card.tone}`}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      </div>

      {currentUser && (currentUser.role === 'Team Manager' || currentUser.role === 'Admin' || currentUser.role === 'Super Admin') ? (
        <div className="rounded-[28px] border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.25)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Oyuncu Yönetimi</div>
              <h3 className="mt-2 text-xl font-black text-white">Yeni oyuncu ekle</h3>
            </div>

            <button
              type="button"
              onClick={() => setShowPlayerList(true)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200"
            >
              Oyuncu Listesi
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">
        
              <select
                value={newPlayerForm.teamId || currentUser.teamId || managedTeamsForCurrentUser[0]?.id || ''}
                onChange={(event) => setNewPlayerForm({ ...newPlayerForm, teamId: event.target.value })}
                className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
              >
                {managedTeamsForCurrentUser.length > 0 ? (
                  managedTeamsForCurrentUser.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))
                ) : (
                  <option value="">Takım bulunamadı</option>
                )}
              </select>
            </label>

            <label className="text-sm text-slate-300">
              Ad Soyad
              <input value={newPlayerForm.name} onChange={(event) => setNewPlayerForm({ ...newPlayerForm, name: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="Örn: Ahmet Yılmaz" />
            </label>

            <label className="text-sm text-slate-300">
              Birim / Hastane
              <input value={newPlayerForm.unit} onChange={(event) => setNewPlayerForm({ ...newPlayerForm, unit: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="Örn: Sağlık SK / Merkez Hastane" />
            </label>

            <label className="text-sm text-slate-300">
              Mevki
              <select
                value={newPlayerForm.position}
                onChange={(event) => setNewPlayerForm({ ...newPlayerForm, position: event.target.value as 'KL' | 'DEF' | 'ORT' | 'FOR' })}
                className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
              >
                <option value="KL">KL</option>
                <option value="DEF">DEF</option>
                <option value="ORT">ORT</option>
                <option value="FOR">FOR</option>
              </select>
            </label>

            <label className="text-sm text-slate-300">
              TC
              <input value={newPlayerForm.tc} onChange={(event) => setNewPlayerForm({ ...newPlayerForm, tc: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="TC kimlik no" />
            </label>

            <label className="text-sm text-slate-300">
              Telefon
              <input value={newPlayerForm.phone} onChange={(event) => setNewPlayerForm({ ...newPlayerForm, phone: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="+90 555 123 45 67" />
            </label>

            <label className="text-sm text-slate-300 md:col-span-2">
              Profil Resmi URL (Opsiyonel)
              <input value={newPlayerForm.photoUrl} onChange={(event) => setNewPlayerForm({ ...newPlayerForm, photoUrl: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="https://..." />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void handleAddPlayer()} className="rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950">Oyuncuyu Ekle</button>
          </div>

        </div>
      ) : null}

      {showPlayerList ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-800 bg-slate-900 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.55)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Oyuncu Listesi</div>
                <h3 className="mt-2 text-xl font-black text-white">Takım kadrosu</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPlayerList(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-xl font-bold text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
                aria-label="Oyuncu listesini kapat"
                title="Kapat"
              >
                ×
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {managedTeamsForCurrentUser.length > 0 ? (
                managedTeamsForCurrentUser.map((team) => (
                  <div key={team.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">{team.name}</div>
                    {team.players.length > 0 ? (
                      <div className="space-y-2">
                        {team.players.map((player) => (
                          <div key={player.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-[10px] font-black text-cyan-200">
                                {player.photoUrl ? (
                                  <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover" />
                                ) : (
                                  player.name.slice(0, 2).toUpperCase()
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-white">{player.name}</div>
                                <div className="mt-0.5 text-[10px] text-slate-400">
                                  {player.position ?? 'KL'} • {player.unit}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setShowPlayerList(false)
                                handleEditPlayer(team.id, player)
                              }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
                              aria-label={`${player.name} oyuncusunu düzenle`}
                              title="Oyuncuyu düzenle"
                            >
                              <PencilLine size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-xs text-slate-400">Bu takımda oyuncu bulunmuyor.</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">Takım bulunamadı.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {playerEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Oyuncu</div>
                <h3 className="mt-1 text-xl font-black text-white">Düzenle</h3>
              </div>
              <button type="button" onClick={() => setPlayerEditor(null)} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">Kapat</button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-slate-300">
                Ad Soyad
                <input
                  value={playerEditor.name}
                  onChange={(event) => setPlayerEditor({ ...playerEditor, name: event.target.value })}
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>

              <label className="block text-sm text-slate-300">
                Birim / Hastane
                <input
                  value={playerEditor.unit}
                  onChange={(event) => setPlayerEditor({ ...playerEditor, unit: event.target.value })}
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>

              <label className="block text-sm text-slate-300">
                Mevki
                <select
                  value={playerEditor.position}
                  onChange={(event) => setPlayerEditor({ ...playerEditor, position: event.target.value as 'KL' | 'DEF' | 'ORT' | 'FOR' })}
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                >
                  <option value="KL">KL</option>
                  <option value="DEF">DEF</option>
                  <option value="ORT">ORT</option>
                  <option value="FOR">FOR</option>
                </select>
              </label>

              <label className="block text-sm text-slate-300">
                Telefon
                <input
                  value={playerEditor.phone}
                  onChange={(event) => setPlayerEditor({ ...playerEditor, phone: event.target.value })}
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>

              <label className="block text-sm text-slate-300">
                TC
                <input
                  value={playerEditor.tc}
                  onChange={(event) => setPlayerEditor({ ...playerEditor, tc: event.target.value })}
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>

              <label className="block text-sm text-slate-300">
                Profil Resim URL
                <input
                  value={playerEditor.photoUrl}
                  onChange={(event) => setPlayerEditor({ ...playerEditor, photoUrl: event.target.value })}
                  className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPlayerEditor(null)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">İptal</button>
              <button type="button" onClick={() => void handleSaveEditedPlayer()} className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-black text-slate-950">Kaydet</button>
            </div>
          </div>
        </div>
      ) : null}

      {canSeeMinimalAdminPanel ? (
        <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.25)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-300">Süper Admin</div>
              <h3 className="mt-2 text-xl font-black text-white">Minimal Yönetim Paneli</h3>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Çevrim içi
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            {adminOverviewStats.map((item) => (
              <div key={item.label} className={`rounded-xl border border-slate-700/80 bg-gradient-to-br ${item.accent} p-[1px]`}>
                <div className="h-full rounded-xl bg-slate-950/75 p-2.5">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                  <div className={`mt-1 text-lg font-black leading-tight ${item.tone}`}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
              <div className="space-y-1">
                {adminTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAdminTab(tab.id)}
                    className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${adminTab === tab.id ? 'bg-cyan-500/10 text-white ring-1 ring-cyan-500/30' : 'text-slate-300 hover:bg-slate-900'}`}
                  >
                    <div className="text-sm font-semibold">{tab.label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{tab.description}</div>
                  </button>
                ))}
              </div>
            </aside>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              {adminTab === 'overview' ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Özet</div>
                    <h4 className="mt-2 text-xl font-black text-white">Operasyonel Durum</h4>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">İş Akışı</div>
                      <div className="mt-2 text-lg font-bold text-white">Sürekli ve net kontrol</div>
                      <div className="mt-1 text-sm text-slate-400">Turnuva, onay, fikstür ve güvenlik talepleri tek ekranda yönetilebilir.</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Erişim</div>
                      <div className="mt-2 text-lg font-bold text-white">{appState.users.filter((user) => user.role === 'Team Manager' || user.role === 'Admin' || user.role === 'Super Admin').length} yöneticili kayıt</div>
                      <div className="mt-1 text-sm text-slate-400">Rol ve yetki güncellemeleri hızlıca takip edilir.</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {adminModules.map((module) => (
                      <button
                        key={module.key}
                        type="button"
                        onClick={() => {
                          setAdminTab(module.key)
                          setAdminModal(module.key)
                        }}
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:border-cyan-500/30"
                      >
                        {module.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {adminTab === 'users' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Kullanıcılar</div>
                      <h4 className="mt-2 text-xl font-black text-white">Roller ve erişim</h4>
                    </div>
                    <button type="button" onClick={() => setAdminModal('users')} className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950">Yönet</button>
                  </div>
                  <div className="space-y-2">
                    {appState.users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{user.fullName}</div>
                          <div className="text-xs text-slate-400">{user.email}</div>
                          {user.teamManagerRequest ? (
                            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-amber-300">Takım sorumlusu talebi bekliyor</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {user.teamManagerRequest ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleApproveTeamManagerRequest(user.id)}
                                className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950"
                              >
                                Onayla
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRejectTeamManagerRequest(user.id)}
                                className="rounded-xl bg-rose-500 px-3 py-2 text-sm font-bold text-white"
                              >
                                Reddet
                              </button>
                            </>
                          ) : null}
                          <select
                            value={user.role}
                            onChange={(event) => {
                              const nextRole = event.target.value as Role
                              void handleUserRoleChange(user.id, nextRole)
                            }}
                            className="w-48 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white outline-none ring-0"
                          >
                            {roleOptions.map((roleOption) => (
                              <option key={roleOption.value} value={roleOption.value}>{roleOption.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  {appState.tournamentApplications.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.28em] text-violet-300">Ön Başvurular</div>
                        <h4 className="mt-2 text-xl font-black text-white">Turnuva başvuruları</h4>
                      </div>

                      {appState.tournamentApplications.filter((application) => application.status === 'Beklemede').map((application) => (
                        <div key={application.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-white">{application.teamName}</div>
                            <div className="text-xs text-slate-400">{appState.users.find((user) => user.id === application.userId)?.fullName ?? 'Bilinmeyen kullanıcı'} / {appState.tournaments.find((tournament) => tournament.id === application.tournamentId)?.name ?? 'Turnuva'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void approveTournamentApplication(application)}
                            className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950"
                          >
                            Onayla
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {adminTab === 'tournaments' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-violet-300">Turnuvalar</div>
                      <h4 className="mt-2 text-xl font-black text-white">Etkinlik takibi</h4>
                    </div>
                    <button type="button" onClick={() => setAdminModal('tournaments')} className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-bold text-white">Ekle</button>
                  </div>

                  <div className="space-y-2">
                    {safeTournaments.map((tournament) => {
                      const pendingApplications = safeTeams.filter((team) => {
                        const matchesTournament = team.tournamentId === tournament.id || tournament.teams.includes(team.id) || tournament.registeredTeamIds?.includes(team.id)
                        return matchesTournament && team.status === 'Beklemede'
                      })
                      const approvedTeams = getApprovedTeamsForTournament(tournament)

                      return (
                        <div key={tournament.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-white">{tournament.name}</div>
                              <div className="text-xs text-slate-400">{tournament.status}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">{approvedTeams.length} takım</span>
                              {canManageTournamentSettings ? (
                                <button
                                  type="button"
                                  onClick={() => setTournamentEditor(tournament)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-500/40 hover:text-cyan-200"
                                  title="Turnuva ayarlarını aç"
                                >
                                  <Settings size={11} />
                                  Ayarlar
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-3 space-y-2">
                            {approvedTeams.length > 0 ? (
                              approvedTeams.map((team) => (
                                <div key={team.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                    <TeamLogo team={team} size={22} />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-white">{team.name}</div>
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Onaylandı</div>
                                    </div>
                                  </div>

                                  {isAdmin ? (
                                    <div className="flex shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void handleEditTeam(team)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
                                        aria-label={`${team.name} takımını düzenle`}
                                        title="Takımı düzenle"
                                      >
                                        <PencilLine size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteTeam(team.id)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-300 transition hover:bg-red-500/15"
                                        aria-label={`${team.name} takımını sil`}
                                        title="Takımı sil"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5 text-xs text-slate-400">Onaylanan takım yok.</div>
                            )}
                          </div>

                          <div className="mt-3 space-y-2">
                            {pendingApplications.length > 0 ? (
                              pendingApplications.map((team) => (
                                <div key={team.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <TeamLogo team={team} size={24} />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-white">{team.name}</div>
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Beklemede</div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => void handleApproveTournamentTeamApplication(team)}
                                    disabled={!canApprovePendingTeamApplications}
                                    className="rounded-xl bg-emerald-500 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                                  >
                                    Onayla
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5 text-xs text-slate-400">Bekleyen başvuru yok.</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {adminTab === 'home' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-amber-300">Ana Sayfa</div>
                      <h4 className="mt-2 text-xl font-black text-white">İçerik yönetimi</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdminModal('home')}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 transition hover:bg-amber-500/15"
                      aria-label="Ana sayfa düzenle"
                      title="Ana sayfa düzenle"
                    >
                      <PencilLine size={14} />
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <div className="text-sm font-semibold text-white">Duyurular</div>
                    <div className="mt-2 text-sm text-slate-400">Toplam 3 aktif bildirim ve 4 sponsor listesi hazırlanmış durumda.</div>
                  </div>
                </div>
              ) : null}

              {adminTab === 'fixture' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-300">Fikstür</div>
                      <h4 className="mt-2 text-xl font-black text-white">Otomasyon merkezi</h4>
                    </div>
                    <button type="button" onClick={() => setAdminModal('fixture')} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950">Planla</button>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <div className="text-sm text-slate-400">Günler: {fixtureForm.days.join(', ')} • Saatler: {fixtureForm.times.join(', ')} • Mekan: {fixtureForm.venue}</div>
                  </div>
                </div>
              ) : null}

              {adminTab === 'sponsors' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Sponsorlar</div>
                      <h4 className="mt-2 text-xl font-black text-white">Sponsor yönetimi</h4>
                    </div>
                    <button type="button" onClick={() => setAdminModal('sponsors')} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-slate-950">
                      <Plus size={14} />
                      Ekle
                    </button>
                  </div>

                  {sponsors.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">Henüz sponsordan kayıt yok.</div>
                  ) : (
                    <div className="space-y-2">
                      {sponsors.map((sponsor) => (
                        <div key={sponsor.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                              <img src={sponsor.logoUrl} alt={sponsor.name} className="h-full w-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">{sponsor.name}</div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{new Date(sponsor.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleDeleteSponsor(sponsor.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/15"
                            aria-label={`${sponsor.name} sponsorunu sil`}
                            title="Sponsor sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {adminTab === 'password-requests' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-amber-300">Şifre Sıfırlama</div>
                      <h4 className="mt-2 text-xl font-black text-white">Talep yönetimi</h4>
                    </div>
                  </div>

                  {resetPasswordMessage ? <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">{resetPasswordMessage}</div> : null}

                  {appState.passwordResetRequests.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">Şifre sıfırlama talebi bulunmuyor.</div>
                  ) : (
                    <div className="space-y-3">
                      {appState.passwordResetRequests.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-white">{request.username}</div>
                              <div className="text-xs text-slate-400">{request.email}</div>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${request.status === 'Çözüldü' ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                              {request.status}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                            <input
                              value={resetPasswordForm[request.id] ?? ''}
                              onChange={(event) => setResetPasswordForm((current) => ({ ...current, [request.id]: event.target.value }))}
                              placeholder="Geçici şifre"
                              className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                            />
                            <button type="button" onClick={() => void handleResolvePasswordResetRequest(request.id)} className="rounded-2xl bg-gradient-to-r from-amber-400 to-cyan-400 px-4 py-2.5 font-bold text-slate-950">
                              Çözüldü
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {currentUser && normalizeRole(currentUser.role) === 'user' ? (
        <div className="rounded-[28px] border border-cyan-500/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(15,23,42,1))] p-4 shadow-[0_18px_40px_rgba(34,211,238,0.12)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Rol Talebi</div>
              <h3 className="mt-2 text-xl font-black text-white">Takım Sorumlusu Rolü Talep Et</h3>
              <p className="mt-1 text-sm text-slate-300">Yetki talebiniz yönetici paneline iletilecek ve onay süreci başlatılacaktır.</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleBecomeManager}
                disabled={Boolean(currentUser?.teamManagerRequest || requestSent)}
                className={`rounded-2xl px-5 py-3 text-base font-black shadow-lg transition ${Boolean(currentUser?.teamManagerRequest || requestSent)
                  ? 'cursor-not-allowed border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 shadow-emerald-500/10'
                  : 'bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 text-slate-950 shadow-cyan-500/20 hover:scale-[1.01]'
                }`}
              >
                {currentUser?.teamManagerRequest || requestSent ? 'Talep Gönderildi' : 'Talep Et'}
              </button>
              {(currentUser?.teamManagerRequest || requestSent) ? (
                <span className="text-xs font-medium text-emerald-200">Durum: Talep Gönderildi</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tournamentEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-slate-700 bg-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.9)]">
            <div className="border-b border-slate-800 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(15,23,42,1))] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-300">Turnuva Detayı</div>
                  <h3 className="mt-2 text-2xl font-black text-white">{tournamentEditor.name || 'Turnuva'}</h3>
                </div>
                <button type="button" onClick={() => setTournamentEditor(null)} className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500">Kapat</button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-300 md:col-span-2">
                  Turnuva Adı
                  <input value={tournamentEditor.name} onChange={(event) => setTournamentEditor({ ...tournamentEditor, name: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Başlangıç Tarihi
                  <input type="date" value={tournamentEditor.startDate} onChange={(event) => setTournamentEditor({ ...tournamentEditor, startDate: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Durum
                  <select value={tournamentEditor.status} onChange={(event) => setTournamentEditor({ ...tournamentEditor, status: event.target.value as Tournament['status'] })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                    <option value="Kayıt Açık">Kayıt Açık</option>
                    <option value="Turnuva Başladı">Turnuva Başladı</option>
                    <option value="Turnuva Bitti">Turnuva Bitti</option>
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Galibiyet Puanı
                  <input type="number" min={0} value={tournamentEditor.scoring.win} onChange={(event) => setTournamentEditor({ ...tournamentEditor, scoring: { ...tournamentEditor.scoring, win: Number(event.target.value) || 0 } })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Beraberlik Puanı
                  <input type="number" min={0} value={tournamentEditor.scoring.draw} onChange={(event) => setTournamentEditor({ ...tournamentEditor, scoring: { ...tournamentEditor.scoring, draw: Number(event.target.value) || 0 } })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Mağlubiyet Puanı
                  <input
                    type="number"
                    value={tournamentEditor.scoring.loss}
                    onChange={(event) => {
                      const raw = event.target.value
                      if (raw === '' || /^-?\d*$/.test(raw)) {
                        setTournamentEditor({
                          ...tournamentEditor,
                          scoring: { ...tournamentEditor.scoring, loss: Number(raw === '' ? 0 : raw) },
                        })
                      }
                    }}
                    className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  Sarı Kart Kuralı
                  <input type="number" min={0} value={tournamentEditor.yellowCardRule} onChange={(event) => setTournamentEditor({ ...tournamentEditor, yellowCardRule: Number(event.target.value) || 2 })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
                <label className="text-sm text-slate-300 md:col-span-2">
                  Kurallar
                  <textarea value={tournamentEditor.rules ?? ''} onChange={(event) => setTournamentEditor({ ...tournamentEditor, rules: event.target.value })} className="mt-1 min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setTournamentEditor(null)} className="glass-button-secondary flex-1 rounded-2xl px-4 py-3 font-bold text-slate-200">İptal</button>
                <button
                  type="button"
                  onClick={() => void handleUpdateTournament()}
                  disabled={!canUpdateTournamentForm || !isTournamentEditorValid}
                  className="glass-button flex-1 rounded-2xl px-4 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Güncelle / Kaydet
                </button>
              </div>

              <div className="border-t border-red-500/20 pt-4">
                <button
                  type="button"
                  onClick={() => void handleDeleteTournament(tournamentEditor.id)}
                  disabled={!canDeleteTournament}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`${tournamentEditor.name || 'Turnuva'} turnuvasını sil`}
                  title="Turnuva sil"
                >
                  <Trash2 size={16} />
                  <span className="sr-only">Turnuva sil</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {adminModalIsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-[30px] border border-slate-700 bg-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.9)]">
            <div className="border-b border-slate-800 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(15,23,42,1))] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-300">Admin Panel</div>
                  <h3 className="mt-2 text-2xl font-black text-white">
                    {adminModal === 'users' ? 'Kullanıcı Yönetimi' : adminModal === 'tournaments' ? 'Turnuva Yönetimi' : adminModal === 'home' ? 'Ana Sayfa Yönetimi' : adminModal === 'sponsors' ? 'Sponsor Yönetimi' : 'Otomatik Fikstür & Maç Planlama'}
                  </h3>
                </div>
                <button type="button" onClick={() => setAdminModal(null)} className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500">Kapat</button>
              </div>
            </div>

            <div className="p-5">
              {adminModal === 'users' ? (
                <div className="space-y-4">
                  {appState.users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{user.fullName}</div>
                        <div className="text-xs text-slate-400">{user.email}</div>
                      </div>
                      <select
                        value={user.role}
                        onChange={(event) => {
                          const nextRole = event.target.value as Role
                          void handleUserRoleChange(user.id, nextRole)
                        }}
                        className="w-52 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white outline-none ring-0"
                      >
                        {roleOptions.map((roleOption) => (
                          <option key={roleOption.value} value={roleOption.value}>{roleOption.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}

              {adminModal === 'tournaments' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm text-slate-300">
                      Turnuva Adı
                      <input value={newTournament.name} onChange={(event) => setNewTournament({ ...newTournament, name: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">
                      Başlangıç
                      <input type="date" value={newTournament.startDate} onChange={(event) => setNewTournament({ ...newTournament, startDate: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">
                      Durum
                      <select value={newTournament.status} onChange={(event) => setNewTournament({ ...newTournament, status: event.target.value as Tournament['status'] })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                        <option value="Kayıt Açık">Kayıt Açık</option>
                        <option value="Turnuva Başladı">Turnuva Başladı</option>
                        <option value="Turnuva Bitti">Turnuva Bitti</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-300 md:col-span-2">
                      Turnuva Kuralları
                      <textarea value={newTournament.rules} onChange={(event) => setNewTournament({ ...newTournament, rules: event.target.value })} className="mt-1 min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="Maç kuralları, disiplin, ekipman ve oyuncu şartları..." />
                    </label>
                    <label className="text-sm text-slate-300">
                      Galibiyet Puanı
                      <input type="number" min={0} value={newTournament.scoring.win} onChange={(event) => setNewTournament({ ...newTournament, scoring: { ...newTournament.scoring, win: Number(event.target.value) } })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">
                      Beraberlik Puanı
                      <input type="number" min={0} value={newTournament.scoring.draw} onChange={(event) => setNewTournament({ ...newTournament, scoring: { ...newTournament.scoring, draw: Number(event.target.value) } })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">
                      Mağlubiyet Puanı
                      <input
                        type="number"
                        value={newTournament.scoring.loss}
                        onChange={(event) => {
                          const raw = event.target.value
                          if (raw === '' || /^-?\d*$/.test(raw)) {
                            setNewTournament({
                              ...newTournament,
                              scoring: { ...newTournament.scoring, loss: Number(raw === '' ? 0 : raw) },
                            })
                          }
                        }}
                        className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                      />
                    </label>
                    <label className="text-sm text-slate-300">
                      Sarı Kart Kuralı
                      <input type="number" min={0} value={newTournament.yellowCardRule} onChange={(event) => setNewTournament({ ...newTournament, yellowCardRule: Number(event.target.value) })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                  </div>
                  <button type="button" onClick={() => void handleSaveTournament()} className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 font-bold text-slate-950">Turnuva Oluştur</button>

                  <div className="space-y-3">
                    {safeTournaments.map((tournament) => (
                      <div key={tournament.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <div>
                          <div className="font-semibold text-white">{tournament.name}</div>
                          <div className="text-xs text-slate-400">{tournament.status}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select value={tournament.status} onChange={(event) => void handleToggleTournament(tournament.id, event.target.value as Tournament['status'])} className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white">
                            <option value="Kayıt Açık">Kayıt Açık</option>
                            <option value="Turnuva Başladı">Turnuva Başladı</option>
                            <option value="Turnuva Bitti">Turnuva Bitti</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setTournamentEditor(tournament)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-500/40 hover:text-cyan-200"
                            aria-label={`${tournament.name} turnuvasını düzenle`}
                            title="Turnuva ayarlarını aç"
                          >
                            <Settings size={11} />
                            Ayarlar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTournament(tournament.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-200 transition hover:bg-red-500/15"
                            aria-label={`${tournament.name} turnuvasını sil`}
                            title="Turnuva sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {adminModal === 'home' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-300">
                      Duyuru başlığı
                      <input value={announcementForm.title} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                    <label className="text-sm text-slate-300 md:col-span-2">
                      Duyuru içeriği
                      <textarea value={announcementForm.body} onChange={(event) => setAnnouncementForm({ ...announcementForm, body: event.target.value })} className="mt-1 min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                  </div>
                  <button type="button" onClick={() => void handleAddAnnouncement()} className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 font-bold text-slate-950">Duyuru Ekle</button>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-white">Mevcut Duyurular</div>
                    {appState.announcements.length === 0 ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400">Hiç duyuru eklenmemiş.</div>
                    ) : (
                      appState.announcements.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-white">{item.title}</div>
                            <div className="mt-1 text-xs text-slate-400 line-clamp-2">{item.body}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAnnouncement(item.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/15"
                            aria-label={`${item.title} duyurusunu sil`}
                            title="Duyuruyu sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {adminModal === 'sponsors' ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Sponsor Ekle</div>
                        <h4 className="mt-2 text-xl font-black text-white">Yeni sponsor</h4>
                      </div>
                      <div className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{sponsors.length} kayıt</div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-slate-300 md:col-span-2">
                        Sponsor adı
                        <input value={sponsorForm.name} onChange={(event) => setSponsorForm({ ...sponsorForm, name: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="Medica Sport" />
                      </label>

                      <label className="text-sm text-slate-300 md:col-span-2">
                        Logo URL
                        <input value={sponsorForm.logoUrl} onChange={(event) => setSponsorForm({ ...sponsorForm, logoUrl: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="https://.../logo.png" />
                      </label>

                      <label className="text-sm text-slate-300 md:col-span-2">
                        İnternet Adresi / Web Sitesi (URL)
                        <input value={sponsorForm.website} onChange={(event) => setSponsorForm({ ...sponsorForm, website: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="https://www.medicasport.example" />
                      </label>

                      <label className="text-sm text-slate-300 md:col-span-2">
                        Konum / Adres Bilgisi
                        <input value={sponsorForm.location} onChange={(event) => setSponsorForm({ ...sponsorForm, location: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" placeholder="İstanbul / Türkiye" />
                      </label>
                    </div>

                    <button type="button" onClick={() => void handleAddSponsor()} className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 font-bold text-slate-950">Kaydet</button>
                  </div>

                  <div className="space-y-2">
                    {sponsors.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">Henüz sponsor kaydı yok.</div>
                    ) : (
                      sponsors.map((sponsor) => (
                        <div key={sponsor.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                              <img src={sponsor.logoUrl} alt={sponsor.name} className="h-full w-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">{sponsor.name}</div>
                              {sponsor.website ? (
                                <a href={sponsor.website} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[10px] text-cyan-300 underline-offset-2 hover:underline">{sponsor.website}</a>
                              ) : null}
                              {sponsor.location ? (
                                <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-slate-400">{sponsor.location}</div>
                              ) : null}
                              <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">{new Date(sponsor.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleDeleteSponsor(sponsor.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/15"
                            aria-label={`${sponsor.name} sponsorunu sil`}
                            title="Sponsor sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {adminModal === 'fixture' ? (
                <div className="space-y-4">
                  {safeTournaments.some((item) => item.status === 'Turnuva Başladı') ? null : (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                      Fikstür otomasyonu için en az bir turnuva başlatılmalıdır. Durum "Turnuva Başladı" olarak değiştirildiğinde bu modül aktifleşir.
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-300 md:col-span-2">
                      Hedef Turnuva
                      <select value={fixtureForm.tournamentId} onChange={(event) => setFixtureForm({ ...fixtureForm, tournamentId: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                        {safeTournaments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-slate-300">
                      Günler
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {FULL_WEEK_DAYS.map((day) => {
                          const isSelected = fixtureForm.days.includes(day)

                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                setFixtureForm((current) => ({
                                  ...current,
                                  days: current.days.includes(day)
                                    ? current.days.filter((entry) => entry !== day)
                                    : [...current.days, day],
                                }))
                              }}
                              className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                                isSelected
                                  ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100 shadow-md shadow-cyan-500/10'
                                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600 hover:text-white'
                              }`}
                            >
                              {day}
                            </button>
                          )
                        })}
                      </div>
                    </label>
                    <label className="text-sm text-slate-300">
                      Saatler
                      <div className="mt-1 flex min-h-40 flex-wrap gap-2 rounded-2xl border border-slate-700 bg-slate-950 p-2">
                        {fixtureForm.times.length > 0 ? (
                          fixtureForm.times.map((time) => (
                            <button
                              key={time}
                              type="button"
                              onClick={() => toggleFixtureTime(time)}
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                                fixtureForm.times.includes(time)
                                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100 shadow-md shadow-cyan-500/10'
                                  : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500 hover:text-white'
                              }`}
                              title="Tek dokunuşla saat seç / kaldır"
                            >
                              {time}
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">Henüz saat eklenmedi.</span>
                        )}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input value={fixtureCustomTime} onChange={(event) => setFixtureCustomTime(event.target.value)} className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Özel saat: 17:30" />
                        <button type="button" onClick={() => {
                          const normalized = fixtureCustomTime.trim()
                          if (!normalized) return
                          const nextTime = normalized.includes(':') ? normalized : `${normalized}:00`
                          setFixtureForm((current) => ({ ...current, times: Array.from(new Set([...current.times, nextTime])) }))
                          setFixtureCustomTime('')
                        }} className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Ekle</button>
                      </div>
                    </label>
                    <label className="text-sm text-slate-300 md:col-span-2">
                      Mekan
                      <input value={fixtureForm.venue} onChange={(event) => setFixtureForm({ ...fixtureForm, venue: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      style={{ pointerEvents: 'auto' }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        console.log('AUTO_FIXTURE_BUTTON_CLICKED', {
                          tournamentId: fixtureForm.tournamentId,
                          selectedDays: fixtureForm.days.length ? fixtureForm.days : FULL_WEEK_DAYS,
                          selectedHours: fixtureForm.times.length ? fixtureForm.times : DEFAULT_FIXTURE_TIMES,
                          venue: fixtureForm.venue,
                          pointerEvents: 'auto',
                        })
                        void handleAutoGenerateFixtures()
                      }}
                      disabled={!safeTournaments.some((item) => item.status === 'Turnuva Başladı')}
                      className="relative z-20 flex-1 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 font-bold text-slate-950 ring-0 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Otomatik Fikstür Oluştur
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleClearTournamentFixtures()}
                      className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 font-bold text-red-200"
                    >
                      Fikstürü Sil / Tümünü Temizle
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
