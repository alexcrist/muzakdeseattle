import { getCurrentMonday } from './schedule.js'
import { supabase } from './supabase.js'

const PLAYER_FIELDS = 'id, name, avatar_url, avatar_color'
const ROUND_WITH_PLAYER = `*, players(${PLAYER_FIELDS})`
const SONG_WITH_PLAYER = `*, players(${PLAYER_FIELDS})`
const COMMENT_WITH_PLAYER = `*, players(${PLAYER_FIELDS})`

export const HOME_REALTIME_TABLES = ['rounds', 'songs', 'votes', 'comments', 'duplicate_groups', 'duplicate_group_songs', 'players', 'round_groups']
export const ROUNDS_REALTIME_TABLES = ['rounds', 'songs', 'votes', 'duplicate_groups', 'duplicate_group_songs', 'round_groups']
export const PLAYER_REALTIME_TABLES = ['players', 'rounds', 'songs', 'votes', 'duplicate_groups', 'duplicate_group_songs', 'round_groups']
export const ADMIN_REALTIME_TABLES = ['rounds', 'songs', 'votes', 'duplicate_groups', 'duplicate_group_songs', 'players', 'round_groups']

export const EMPTY_HOME_DATA = {
  rounds: [],
  players: [],
  songs: [],
  votes: [],
  comments: [],
  duplicateGroups: [],
  groupSongs: [],
  roundGroups: [],
}

export const EMPTY_ROUNDS_DATA = {
  rounds: [],
  songs: [],
  votes: [],
  groups: [],
  groupSongs: [],
  roundGroups: [],
}

export const EMPTY_PLAYER_DATA = {
  players: [],
  rounds: [],
  songs: [],
  votes: [],
  groups: [],
  groupSongs: [],
  roundGroups: [],
}

export const EMPTY_ADMIN_DATA = {
  rounds: [],
  songs: [],
  votes: [],
  groups: [],
  groupSongs: [],
  players: [],
  roundGroups: [],
}

export async function fetchLeagueSettings() {
  const { data, error } = await supabase
    .from('league_settings')
    .select('*')
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
    .select('*')
    .eq('id', playerId)
    .single()

  return data || null
}

export async function fetchJoinData() {
  const [{ data: players }, { data: settings }] = await Promise.all([
    supabase.from('players').select('*').eq('active', true).order('name'),
    supabase.from('league_settings').select('league_name, season_label').eq('id', 1).single(),
  ])

  return {
    players: players || [],
    settings: settings || null,
  }
}

export async function fetchPlayerByName(name) {
  const { data } = await supabase
    .from('players')
    .select('*')
    .ilike('name', name)
    .single()

  return data || null
}

export async function fetchHomeData() {
  const [
    { data: rounds },
    { data: players },
    { data: songs },
    { data: votes },
    { data: comments },
    { data: duplicateGroups },
    { data: groupSongs },
    { data: roundGroups },
  ] = await Promise.all([
    supabase.from('rounds').select(ROUND_WITH_PLAYER).order('queue_position'),
    supabase.from('players').select('*').order('name'),
    supabase.from('songs').select(SONG_WITH_PLAYER).order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('comments').select(COMMENT_WITH_PLAYER).order('created_at'),
    supabase.from('duplicate_groups').select('*'),
    supabase.from('duplicate_group_songs').select('*'),
    supabase.from('round_groups').select('*'),
  ])

  return {
    rounds: rounds || [],
    players: players || [],
    songs: songs || [],
    votes: votes || [],
    comments: comments || [],
    duplicateGroups: duplicateGroups || [],
    groupSongs: groupSongs || [],
    roundGroups: roundGroups || [],
  }
}

export async function fetchRoundsData() {
  const [
    { data: rounds },
    { data: songs },
    { data: votes },
    { data: groups },
    { data: groupSongs },
    { data: roundGroups },
  ] = await Promise.all([
    supabase.from('rounds').select(ROUND_WITH_PLAYER).order('queue_position'),
    supabase.from('songs').select(SONG_WITH_PLAYER).order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('duplicate_groups').select('*'),
    supabase.from('duplicate_group_songs').select('*'),
    supabase.from('round_groups').select('*'),
  ])

  return {
    rounds: rounds || [],
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: groupSongs || [],
    roundGroups: roundGroups || [],
  }
}

export async function fetchPlayerData() {
  const [
    { data: players },
    { data: rounds },
    { data: songs },
    { data: votes },
    { data: groups },
    { data: groupSongs },
    { data: roundGroups },
  ] = await Promise.all([
    supabase.from('players').select('*').order('name'),
    supabase.from('rounds').select('*').order('queue_position'),
    supabase.from('songs').select(SONG_WITH_PLAYER).order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('duplicate_groups').select('*'),
    supabase.from('duplicate_group_songs').select('*'),
    supabase.from('round_groups').select('*'),
  ])

  return {
    players: players || [],
    rounds: rounds || [],
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: groupSongs || [],
    roundGroups: roundGroups || [],
  }
}

export async function fetchAdminData() {
  const [
    { data: rounds },
    { data: songs },
    { data: votes },
    { data: groups },
    { data: groupSongs },
    { data: players },
    { data: roundGroups },
  ] = await Promise.all([
    supabase.from('rounds').select('*').order('queue_position'),
    supabase.from('songs').select(SONG_WITH_PLAYER).order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('duplicate_groups').select('*').order('created_at'),
    supabase.from('duplicate_group_songs').select('*'),
    supabase.from('players').select('*').order('name'),
    supabase.from('round_groups').select('*'),
  ])

  return {
    rounds: rounds || [],
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: groupSongs || [],
    players: players || [],
    roundGroups: roundGroups || [],
  }
}
