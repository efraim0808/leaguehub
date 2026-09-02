import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://example.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'demo-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

export const subscribeToLeaguehubRealtime = (onChange: () => void) => {
  const channel = supabase.channel('leaguehub-live-updates')

  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_match_stats' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_statistics' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => onChange())
    .subscribe()

  return () => {
    void channel.unsubscribe()
  }
}
