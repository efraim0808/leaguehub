import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lemihuhzszmmzmsciync.supabase.co'
const supabaseAnonKey = 'sb_publishable_XWQrAlG7aTAKHCtgZuP3eg_SkmylCQAkoduda'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
