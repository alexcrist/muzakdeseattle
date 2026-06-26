import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import { buildLeaderboard } from '../lib/scoring.js'
import { getScoredRoundIds } from '../lib/schedule.js'
import { supabase } from '../lib/supabase.js'

async function fetchPlayersData() {
  const [
    { data: players },
    { data: rounds },
    { data: songs },
    { data: votes },
    { data: groups },
    { data: groupSongs },
  ] = await Promise.all([
    supabase.from('players').select('*').order('name'),
    supabase.from('rounds').select('*').order('queue_position'),
    supabase.from('songs').select('*, players(id, name, avatar_url, avatar_color)'),
    supabase.from('votes').select('*'),
    supabase.from('duplicate_groups').select('*'),
    supabase.from('duplicate_group_songs').select('*'),
  ])

  return {
    players: players || [],
    rounds: rounds || [],
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: groupSongs || [],
  }
}

export default function PlayerListPage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const [data, setData] = useState({ players: [], rounds: [], songs: [], votes: [], groups: [], groupSongs: [] })
  const [loading, setLoading] = useState(true)

  async function load() {
    const next = await fetchPlayersData()
    setData(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('players-season-2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_groups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_group_songs' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const scoredRoundIds = useMemo(() => getScoredRoundIds(data.rounds, settings), [data.rounds, settings])
  const leaderboard = useMemo(() => buildLeaderboard({
    players: data.players,
    rounds: data.rounds,
    songs: data.songs,
    votes: data.votes,
    duplicateGroups: data.groups,
    groupSongs: data.groupSongs,
    scoredRoundIds,
  }), [data, scoredRoundIds])
  const scoreMap = Object.fromEntries(leaderboard.map(row => [row.id, row.total]))
  const submissionCounts = data.songs.reduce((counts, song) => {
    if (!scoredRoundIds.has(song.round_id)) return counts
    counts[song.player_id] = (counts[song.player_id] || 0) + 1
    return counts
  }, {})

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading players...</p>
      </main>
    )
  }

  const active = data.players.filter(row => row.active)
  const inactive = data.players.filter(row => !row.active)

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Profiles</p>
          <h1>Players</h1>
          <p>Pick a player to see their profile and songs.</p>
        </div>
      </section>

      <PlayerSection
        title="Active players"
        players={active}
        currentPlayerId={player.id}
        scoreMap={scoreMap}
        submissionCounts={submissionCounts}
      />

      {inactive.length > 0 && (
        <PlayerSection
          title="Inactive players"
          players={inactive}
          currentPlayerId={player.id}
          scoreMap={scoreMap}
          submissionCounts={submissionCounts}
        />
      )}
    </main>
  )
}

function PlayerSection({ title, players, currentPlayerId, scoreMap, submissionCounts }) {
  return (
    <section className="round-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="soft-tag">{players.length}</span>
      </div>
      <div className="player-list">
        {players.map(player => (
          <Link className={`player-row player-row-link ${player.active ? '' : 'inactive'}`} to={`/players/${player.id}`} key={player.id}>
            <Avatar player={player} />
            <div>
              <h3>{player.name}{player.id === currentPlayerId ? ' (you)' : ''}</h3>
              <p>{submissionCounts[player.id] || 0} submissions · {scoreMap[player.id] || 0} pts</p>
            </div>
            <span className="soft-tag">View</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
