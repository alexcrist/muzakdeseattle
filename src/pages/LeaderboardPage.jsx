import { useEffect, useMemo, useState } from 'react'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import { buildLeaderboard } from '../lib/scoring.js'
import { getLeagueContext, getScoredRoundIds } from '../lib/schedule.js'
import { supabase } from '../lib/supabase.js'

async function fetchLeaderboardData() {
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

export default function LeaderboardPage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const [data, setData] = useState({ players: [], rounds: [], songs: [], votes: [], groups: [], groupSongs: [] })
  const [loading, setLoading] = useState(true)

  async function load() {
    const next = await fetchLeaderboardData()
    setData(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('leaderboard-season-2')
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
  const context = useMemo(() => getLeagueContext(data.rounds, settings), [data.rounds, settings])
  const scoredRounds = context.orderedRounds.filter(round => scoredRoundIds.has(round.id))
  const leaderboard = useMemo(() => buildLeaderboard({
    players: data.players,
    rounds: data.rounds,
    songs: data.songs,
    votes: data.votes,
    duplicateGroups: data.groups,
    groupSongs: data.groupSongs,
    scoredRoundIds,
  }), [data, scoredRoundIds])

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading leaderboard...</p>
      </main>
    )
  }

  const leader = leaderboard[0]

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Season standings</p>
          <h1>Leaderboard</h1>
          <p>Duplicate merges count once per song and fully for every duplicate submitter.</p>
        </div>
        <span className="soft-tag">{scoredRounds.length} scored rounds</span>
      </section>

      {!leader ? (
        <section className="empty-state">
          <h2>No scores yet</h2>
          <p>Standings appear once a round reaches appreciation.</p>
        </section>
      ) : (
        <>
          <section className="leader-spotlight">
            <Avatar player={leader} size="xl" />
            <div>
              <p className="eyebrow">Current leader</p>
              <h2>{leader.name}{leader.id === player.id ? ' (you)' : ''}</h2>
              <p>{leader.total} points</p>
            </div>
          </section>

          <section className="card leaderboard-list">
            {leaderboard.map((row, index) => (
              <div className={`leader-row ${row.id === player.id ? 'is-you' : ''}`} key={row.id}>
                <span className="rank">{index + 1}</span>
                <Avatar player={row} />
                <span className="leader-name">{row.name}</span>
                <strong>{row.total}</strong>
              </div>
            ))}
          </section>

          {scoredRounds.length > 0 && (
            <section className="round-breakdown">
              <div className="section-heading">
                <h2>Round breakdown</h2>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      {scoredRounds.map(round => <th key={round.id}>{round.theme_name}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(row => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        {scoredRounds.map(round => (
                          <td key={round.id}>{row.byRound[round.id] || '—'}</td>
                        ))}
                        <td><strong>{row.total}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
