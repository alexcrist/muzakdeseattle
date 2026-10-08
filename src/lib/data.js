import { getCurrentMonday, getScoredRoundIds } from './schedule.js'
import { supabase } from './supabase.js'

const PLAYER_EMBED_FIELDS = 'id, name, avatar_url, avatar_color'
const PLAYER_FIELDS = `${PLAYER_EMBED_FIELDS}, active, created_at`
const SETTINGS_FIELDS = 'id, league_name, season_label, points_per_player, weekly_phase_template, schedule_start_date, timezone'
const ROUND_FIELDS = 'id, theme_name, theme_description, queue_position, submitted_by_player_id, week_start_date, is_archived, created_at'
const ROUND_WITH_PLAYER = `${ROUND_FIELDS}, players(${PLAYER_EMBED_FIELDS})`
const SONG_FIELDS = 'id, round_id, player_id, artist, title, album, link, submitter_note, created_at'
const SONG_WITH_PLAYER = `${SONG_FIELDS}, players(${PLAYER_EMBED_FIELDS})`
const VOTE_FIELDS = 'id, round_id, song_id, voter_player_id, points, created_at, updated_at'
const COMMENT_FIELDS = 'id, round_id, song_id, player_id, body, gif_url, gif_preview_url, gif_provider, gif_id, created_at'
// Pin this to the direct author relationship. comment_likes also links comments
// and players, so an unqualified `players(...)` embed is ambiguous to PostgREST.
const COMMENT_WITH_PLAYER = `${COMMENT_FIELDS}, players!comments_player_id_fkey(${PLAYER_EMBED_FIELDS})`
const COMMENT_AWARD_FIELDS = 'id, round_id, song_id, player_id'
const COMMENT_LIKE_FIELDS = 'comment_id, player_id'
const DUPLICATE_GROUP_FIELDS = 'id, round_id, canonical_song_id, label, created_at'
const GROUP_SONG_FIELDS = 'id, group_id, song_id'
const ROUND_GROUP_FIELDS = 'id, round_id, player_id, group_index'
const PLAYLIST_FIELDS = 'id, round_id, group_index, service, url, created_at'

export const HOME_CORE_REALTIME_TABLES = ['rounds', 'players', 'round_groups']
export const HOME_ROUND_REALTIME_TABLES = ['songs', 'votes', 'comments', 'comment_likes', 'duplicate_groups', 'duplicate_group_songs', 'players', 'round_playlists']
export const HOME_REALTIME_TABLES = [...new Set([...HOME_CORE_REALTIME_TABLES, ...HOME_ROUND_REALTIME_TABLES])]
export const ROUNDS_REALTIME_TABLES = ['rounds', 'songs', 'players']
export const PLAYER_REALTIME_TABLES = ['players', 'rounds', 'songs', 'votes', 'comments', 'duplicate_groups', 'duplicate_group_songs', 'round_groups']
export const PLAYER_PROFILE_REALTIME_TABLES = [...PLAYER_REALTIME_TABLES, 'comment_likes']
export const PAST_SONGS_REALTIME_TABLES = PLAYER_PROFILE_REALTIME_TABLES
export const ADMIN_REALTIME_TABLES = ['rounds', 'songs', 'votes', 'duplicate_groups', 'duplicate_group_songs', 'players', 'round_groups']
export const ADMIN_SUMMARY_REALTIME_TABLES = ['rounds', 'players']
export const PLAYLIST_AUTOMATION_REALTIME_TABLES = ['playlist_automation_settings', 'playlist_jobs', 'playlist_song_matches', 'round_playlists']
export const EMPTY_PLAYLIST_AUTOMATION_DATA = { connections: [], jobs: [], matches: [], playlists: [], error: '' }

export function homeRoundRealtimeTables(roundId) {
  if (!roundId) return HOME_ROUND_REALTIME_TABLES
  const filter = `round_id=eq.${roundId}`
  return [
    { table: 'songs', filter },
    { table: 'votes', filter },
    { table: 'comments', filter },
    'comment_likes',
    { table: 'duplicate_groups', filter },
    'duplicate_group_songs',
    'players',
    { table: 'round_playlists', filter },
  ]
}

export function pastRoundRealtimeTables(roundId) {
  if (!roundId) return HOME_REALTIME_TABLES
  const roundFilter = `round_id=eq.${roundId}`
  return [
    { table: 'rounds', filter: `id=eq.${roundId}` },
    { table: 'songs', filter: roundFilter },
    { table: 'votes', filter: roundFilter },
    { table: 'comments', filter: roundFilter },
    'comment_likes',
    { table: 'duplicate_groups', filter: roundFilter },
    'duplicate_group_songs',
    'players',
    { table: 'round_groups', filter: roundFilter },
    { table: 'round_playlists', filter: roundFilter },
  ]
}

export const EMPTY_HOME_DATA = {
  rounds: [],
  players: [],
  songs: [],
  votes: [],
  comments: [],
  commentLikes: [],
  duplicateGroups: [],
  groupSongs: [],
  roundGroups: [],
  playlists: [],
}

export const EMPTY_HOME_CORE_DATA = {
  rounds: [],
  players: [],
  roundGroups: [],
}

export const EMPTY_HOME_ROUND_DATA = {
  songs: [],
  votes: [],
  comments: [],
  commentLikes: [],
  duplicateGroups: [],
  groupSongs: [],
  playlists: [],
}

export const EMPTY_ROUNDS_DATA = {
  players: [],
  rounds: [],
  songs: [],
}

export const EMPTY_PLAYER_DATA = {
  players: [],
  rounds: [],
  songs: [],
  votes: [],
  comments: [],
  groups: [],
  groupSongs: [],
  roundGroups: [],
}

export const EMPTY_PLAYER_PROFILE_DATA = {
  ...EMPTY_PLAYER_DATA,
  commentLikes: [],
}

export const EMPTY_PAST_SONGS_DATA = EMPTY_PLAYER_PROFILE_DATA

export const EMPTY_ADMIN_DATA = {
  rounds: [],
  songs: [],
  votes: [],
  groups: [],
  groupSongs: [],
  players: [],
  roundGroups: [],
}

function withoutJoin(rows, joinName) {
  return (rows || []).map(row => {
    const { [joinName]: _join, ...fields } = row
    return fields
  })
}

function roundScopedQuery(table, fields, roundIds, orderBy = null) {
  if (roundIds.length === 0) return Promise.resolve({ data: [] })
  const query = supabase.from(table).select(fields).in('round_id', roundIds)
  return orderBy ? query.order(orderBy) : query
}

function groupSongsForRounds(roundIds) {
  if (roundIds.length === 0) return Promise.resolve({ data: [] })
  return supabase
    .from('duplicate_group_songs')
    .select(`${GROUP_SONG_FIELDS}, duplicate_groups!inner(round_id)`)
    .in('duplicate_groups.round_id', roundIds)
}

function commentLikesForRounds(roundIds) {
  if (roundIds.length === 0) return Promise.resolve({ data: [] })
  return supabase
    .from('comment_likes')
    .select(`${COMMENT_LIKE_FIELDS}, comments!inner(round_id)`)
    .in('comments.round_id', roundIds)
}

export async function fetchLeagueSettings() {
  const { data, error } = await supabase
    .from('league_settings')
    .select(SETTINGS_FIELDS)
    .eq('id', 1)
    .single()

  if (error || !data) return null
  return {
    ...data,
    schedule_start_date: data.schedule_start_date || getCurrentMonday(),
  }
}

export async function fetchStoredPlayer(playerId) {
  const { data } = await supabase
    .from('players')
    .select(PLAYER_FIELDS)
    .eq('id', playerId)
    .single()

  return data || null
}

export async function fetchJoinData(knownSettings = null) {
  const [{ data: players }, { data: settings }] = await Promise.all([
    supabase.from('players').select(PLAYER_FIELDS).eq('active', true).order('name'),
    knownSettings
      ? Promise.resolve({ data: knownSettings })
      : supabase.from('league_settings').select('league_name, season_label').eq('id', 1).single(),
  ])

  return {
    players: players || [],
    settings: settings || null,
  }
}

export async function fetchPlayerByName(name) {
  const { data } = await supabase
    .from('players')
    .select(PLAYER_FIELDS)
    .ilike('name', name)
    .single()

  return data || null
}

export async function fetchHomeCoreData() {
  // The complete round-group history stays small and is needed to balance the next split.
  const [{ data: rounds }, { data: players }, { data: roundGroups }] = await Promise.all([
    supabase.from('rounds').select(ROUND_WITH_PLAYER).order('queue_position'),
    supabase.from('players').select(PLAYER_FIELDS).order('name'),
    supabase.from('round_groups').select(ROUND_GROUP_FIELDS),
  ])

  return {
    rounds: rounds || [],
    players: players || [],
    roundGroups: roundGroups || [],
  }
}

export async function fetchHomeRoundData(roundId) {
  if (!roundId) return EMPTY_HOME_ROUND_DATA

  const roundIds = [roundId]
  const [
    { data: songs },
    { data: votes },
    { data: comments },
    { data: commentLikes },
    { data: duplicateGroups },
    { data: groupSongs },
    { data: playlists },
  ] = await Promise.all([
    roundScopedQuery('songs', SONG_WITH_PLAYER, roundIds, 'created_at'),
    roundScopedQuery('votes', VOTE_FIELDS, roundIds),
    roundScopedQuery('comments', COMMENT_WITH_PLAYER, roundIds, 'created_at'),
    commentLikesForRounds(roundIds),
    roundScopedQuery('duplicate_groups', DUPLICATE_GROUP_FIELDS, roundIds),
    groupSongsForRounds(roundIds),
    roundScopedQuery('round_playlists', PLAYLIST_FIELDS, roundIds, 'created_at'),
  ])

  return {
    songs: songs || [],
    votes: votes || [],
    comments: comments || [],
    commentLikes: withoutJoin(commentLikes, 'comments'),
    duplicateGroups: duplicateGroups || [],
    groupSongs: withoutJoin(groupSongs, 'duplicate_groups'),
    playlists: playlists || [],
  }
}

export async function fetchPastRoundData(roundId) {
  const roundIds = roundId ? [roundId] : []
  const [
    { data: rounds },
    { data: players },
    { data: songs },
    { data: votes },
    { data: comments },
    { data: commentLikes },
    { data: duplicateGroups },
    { data: groupSongs },
    { data: roundGroups },
    { data: playlists },
  ] = await Promise.all([
    supabase.from('rounds').select(ROUND_WITH_PLAYER).order('queue_position'),
    supabase.from('players').select(PLAYER_FIELDS).order('name'),
    roundScopedQuery('songs', SONG_WITH_PLAYER, roundIds, 'created_at'),
    roundScopedQuery('votes', VOTE_FIELDS, roundIds),
    roundScopedQuery('comments', COMMENT_WITH_PLAYER, roundIds, 'created_at'),
    commentLikesForRounds(roundIds),
    roundScopedQuery('duplicate_groups', DUPLICATE_GROUP_FIELDS, roundIds),
    groupSongsForRounds(roundIds),
    roundScopedQuery('round_groups', ROUND_GROUP_FIELDS, roundIds),
    roundScopedQuery('round_playlists', PLAYLIST_FIELDS, roundIds, 'created_at'),
  ])

  return {
    rounds: rounds || [],
    players: players || [],
    songs: songs || [],
    votes: votes || [],
    comments: comments || [],
    commentLikes: withoutJoin(commentLikes, 'comments'),
    duplicateGroups: duplicateGroups || [],
    groupSongs: withoutJoin(groupSongs, 'duplicate_groups'),
    roundGroups: roundGroups || [],
    playlists: playlists || [],
  }
}

export async function fetchRoundsData() {
  const [{ data: players }, { data: rounds }, { data: songs }] = await Promise.all([
    supabase.from('players').select(PLAYER_FIELDS).order('name'),
    supabase.from('rounds').select(ROUND_WITH_PLAYER).order('queue_position'),
    supabase.from('songs').select('id, round_id'),
  ])

  return {
    players: players || [],
    rounds: rounds || [],
    songs: songs || [],
  }
}

async function fetchSeasonScoringData({ settings, includeCommentDetails = false, includeCommentLikes = false } = {}) {
  const [{ data: players }, { data: rounds }] = await Promise.all([
    supabase.from('players').select(PLAYER_FIELDS).order('name'),
    supabase.from('rounds').select(ROUND_FIELDS).order('queue_position'),
  ])
  const roundRows = rounds || []
  const roundIds = [...getScoredRoundIds(roundRows, settings)]

  const requests = [
    roundScopedQuery('songs', SONG_WITH_PLAYER, roundIds, 'created_at'),
    roundScopedQuery('votes', VOTE_FIELDS, roundIds),
    roundScopedQuery('comments', includeCommentDetails ? COMMENT_WITH_PLAYER : COMMENT_AWARD_FIELDS, roundIds, 'created_at'),
    roundScopedQuery('duplicate_groups', DUPLICATE_GROUP_FIELDS, roundIds),
    groupSongsForRounds(roundIds),
    roundScopedQuery('round_groups', ROUND_GROUP_FIELDS, roundIds),
  ]
  if (includeCommentLikes) requests.push(commentLikesForRounds(roundIds))

  const [songs, votes, comments, groups, groupSongs, roundGroups, commentLikes] = await Promise.all(requests)

  return {
    players: players || [],
    rounds: roundRows,
    songs: songs.data || [],
    votes: votes.data || [],
    comments: comments.data || [],
    groups: groups.data || [],
    groupSongs: withoutJoin(groupSongs.data, 'duplicate_groups'),
    roundGroups: roundGroups.data || [],
    ...(includeCommentLikes ? { commentLikes: withoutJoin(commentLikes?.data, 'comments') } : {}),
  }
}

export function fetchPlayerData(settings) {
  return fetchSeasonScoringData({ settings })
}

export function fetchPlayerProfileData(settings) {
  return fetchSeasonScoringData({ settings, includeCommentDetails: true, includeCommentLikes: true })
}

export function fetchPastSongsData(settings) {
  return fetchSeasonScoringData({ settings, includeCommentDetails: true, includeCommentLikes: true })
}

export async function fetchAdminSummaryData() {
  const [{ data: players }, { data: rounds }] = await Promise.all([
    supabase.from('players').select(PLAYER_FIELDS).order('name'),
    supabase.from('rounds').select(ROUND_FIELDS).order('queue_position'),
  ])

  return {
    ...EMPTY_ADMIN_DATA,
    rounds: rounds || [],
    players: players || [],
  }
}

export async function fetchPlaylistAutomationData(roundId) {
  const [connections, jobs, matches, playlists] = await Promise.all([
    supabase.from('playlist_automation_settings').select('service, enabled, connected'),
    roundId ? supabase.from('playlist_jobs')
      .select('service, round_id, run_id, status, started_at, finished_at, message, total_songs, matched_songs')
      .eq('round_id', roundId) : Promise.resolve({ data: [] }),
    roundId ? supabase.from('playlist_song_matches')
      .select('service, song_id, status, track_id, track_label, reason, songs(title, artist)')
      .eq('round_id', roundId) : Promise.resolve({ data: [] }),
    roundId ? supabase.from('round_playlists')
      .select('id, service, group_index, url').eq('round_id', roundId)
      : Promise.resolve({ data: [] }),
  ])
  return {
    connections: connections.data || [], jobs: jobs.data || [],
    matches: matches.data || [], playlists: (playlists.data || []).map(playlist => {
      let service = playlist.service?.trim().toLowerCase()
      try {
        const host = new URL(playlist.url).hostname.toLowerCase()
        for (const provider of ['tidal', 'spotify']) {
          if (host === `${provider}.com` || host.endsWith(`.${provider}.com`)) service = provider
        }
      } catch { /* A custom service label still works without a recognized URL. */ }
      return { ...playlist, service }
    }),
    error: [connections, jobs, matches, playlists].some(result => result.error)
      ? 'Could not load playlist automation. The backend may still need to be deployed.' : '',
  }
}

export async function fetchAdminData(settings) {
  const [{ data: players }, { data: rounds }] = await Promise.all([
    supabase.from('players').select(PLAYER_FIELDS).order('name'),
    supabase.from('rounds').select(ROUND_FIELDS).order('queue_position'),
  ])
  const roundRows = rounds || []
  const roundIds = [...getScoredRoundIds(roundRows, settings)]
  const [{ data: songs }, { data: votes }, { data: groups }, { data: groupSongs }, { data: roundGroups }] = await Promise.all([
    roundScopedQuery('songs', SONG_WITH_PLAYER, roundIds, 'created_at'),
    roundScopedQuery('votes', VOTE_FIELDS, roundIds),
    roundScopedQuery('duplicate_groups', DUPLICATE_GROUP_FIELDS, roundIds, 'created_at'),
    groupSongsForRounds(roundIds),
    roundScopedQuery('round_groups', ROUND_GROUP_FIELDS, roundIds),
  ])

  return {
    rounds: roundRows,
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: withoutJoin(groupSongs, 'duplicate_groups'),
    players: players || [],
    roundGroups: roundGroups || [],
  }
}
