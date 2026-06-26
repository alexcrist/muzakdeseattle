import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = createClient(
  SUPABASE_URL || 'https://example.supabase.co',
  SUPABASE_ANON_KEY || 'missing-anon-key'
)

// Season 2 uses a clean Supabase schema. Keep the SQL in SETUP.md in sync with
// the summary below when changing tables.
//
// Tables:
// Env vars:
// - VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
// - VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//
// Tables:
// - players(id, name, active, avatar_url, avatar_color, created_at, updated_at)
// - league_settings(id, league_name, season_label, points_per_player,
//   weekly_phase_template, schedule_start_date, timezone, created_at, updated_at)
// - rounds(id, theme_name, theme_description, queue_position,
//   submitted_by_player_id, week_start_date, is_archived, created_at, updated_at)
// - songs(id, round_id, player_id, artist, title, album, link,
//   submitter_note, created_at, updated_at)
// - votes(id, round_id, song_id, voter_player_id, points, created_at, updated_at)
// - comments(id, round_id, song_id, player_id, body, created_at)
// - duplicate_groups(id, round_id, canonical_song_id, label, created_at, updated_at)
// - duplicate_group_songs(id, group_id, song_id, created_at)
