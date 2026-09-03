export type Role = 'Super Admin' | 'Admin' | 'Team Manager' | 'Visitor' | 'USER'

export type TournamentStatus = 'Kayıt Açık' | 'Turnuva Başladı' | 'Turnuva Bitti'

export type PermissionKey =
  | 'fikstur'
  | 'puanDurumu'
  | 'canliSkor'
  | 'disiplin'
  | 'takimOnaylari'
  | 'takimYonetimi'
  | 'galeri'
  | 'duyurular'
  | 'ayarlar'

export interface PermissionSet {
  fikstur: boolean
  puanDurumu: boolean
  canliSkor: boolean
  disiplin: boolean
  takimOnaylari: boolean
  takimYonetimi: boolean
  galeri: boolean
  duyurular: boolean
  ayarlar: boolean
}

export interface User {
  id: string
  fullName: string
  email: string
  password: string
  username: string
  role: Role
  isActive: boolean
  kvkkAccepted: boolean
  phone: string
  tc: string
  teamId?: string
  teamManagerRequest: boolean
  permissions: PermissionSet
  createdAt: string
}

export interface Team {
  id: string
  name: string
  shortName: string
  city: string
  status: 'Onaylı' | 'Beklemede' | 'Reddedildi'
  managerId: string
  tournamentId?: string
  logoUrl?: string
  players: Player[]
}

export interface Player {
  id: string
  name: string
  unit: string
  phone: string
  tc: string
  photoUrl?: string
  position?: string
  yellowCards: number
  redCards: number
  suspensionMatches?: number
  isSuspended: boolean
  isCaptain: boolean
}

export interface PlayerInput {
  name: string
  unit: string
  phone: string
  tc: string
  photoUrl?: string
  position?: string
  yellowCards?: number
  redCards?: number
  isSuspended?: boolean
  isCaptain?: boolean
  tournamentId?: string
}

export interface TournamentScoring {
  win: number
  draw: number
  loss: number
}

export interface Tournament {
  id: string
  name: string
  status: TournamentStatus
  startDate: string
  scoring: TournamentScoring
  rules?: string
  yellowCardRule: number
  teams: string[]
  registeredTeamIds?: string[]
  fixtures: Fixture[]
}

export interface Fixture {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName?: string
  awayTeamName?: string
  date: string
  time: string
  venue: string
  status: 'Planlandı' | 'Devam Ediyor' | 'Tamamlandı'
  homeScore: number
  awayScore: number
  notes?: string
  week?: string
}

export interface MatchEvent {
  id: string
  type: 'goal' | 'yellow' | 'red' | 'substitution'
  minute: number
  teamId: string
  playerId: string
  description: string
}

export interface MatchTeamNameRecord {
  id?: string
  name?: string
}

export interface Match {
  id: string
  tournamentId?: string
  fixtureId: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName?: string
  awayTeamName?: string
  home_team?: MatchTeamNameRecord
  away_team?: MatchTeamNameRecord
  homeScore: number
  awayScore: number
  status: 'Başlatıldı' | 'Durduruldu' | 'Bitti'
  events: MatchEvent[]
  elapsedMinutes?: number
  mvpPlayerId?: string
  week?: string
  matchDate?: string
  matchTime?: string
  venue?: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  date: string
}

export interface GalleryItem {
  id: string
  title: string
  image: string
  category: string
}

export interface ContactMessage {
  id: string
  senderId: string
  senderName: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export interface PasswordResetRequest {
  id: string
  userId?: string
  username: string
  email: string
  status: 'Açık' | 'Çözüldü'
  note?: string
  temporaryPassword?: string
  requestedAt: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface TournamentApplication {
  id: string
  tournamentId: string
  teamName: string
  userId: string
  status: 'Beklemede' | 'Onaylandı' | 'Reddedildi'
  teamId?: string
  createdAt: string
  reviewedAt?: string
}

export interface DisciplineRecord {
  id: string
  playerId?: string
  player_id?: string
  teamId?: string
  team_id?: string
  tournamentId?: string
  tournament_id?: string
  cardType?: 'sarı' | 'kırmızı' | 'maç cezası' | 'yellow' | 'red' | 'suspension' | string
  card_type?: string
  matchId?: string
  match_id?: string
  yellow_cards?: number
  red_cards?: number
  suspension_matches?: number
  match_suspension_count?: number
  description?: string
  yellowCards?: number
  redCards?: number
  suspensionMatches?: number
  isSuspended?: boolean
  is_suspended?: boolean
  createdAt?: string
}

export interface AppState {
  users: User[]
  teams: Team[]
  tournaments: Tournament[]
  matches: Match[]
  announcements: Announcement[]
  gallery: GalleryItem[]
  messages: ContactMessage[]
  passwordResetRequests: PasswordResetRequest[]
  tournamentApplications: TournamentApplication[]
  disciplineRecords: DisciplineRecord[]
}

export interface SessionUser {
  id: string
  fullName: string
  email: string
  role: Role
  teamId?: string
  username: string
} 
