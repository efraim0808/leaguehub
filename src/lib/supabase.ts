import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lemihuhzszmmzmsciync.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlbWlodWh6c3ptbXptc2NpeW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwODY4NjYsImV4cCI6MjEwMzY2Mjg2Nn0._63ZKE0eKJnDDtgtD_ed9e6SRWbOcH_yI-XKMIUCwZw'

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
