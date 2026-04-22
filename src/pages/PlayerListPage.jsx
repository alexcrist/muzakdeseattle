import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { usePlayer } from '../App.jsx'

export default function PlayerListPage() {
  const { player: currentPlayer } = usePlayer()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState({})

  async function loadPlayers() {
    // Get all players
    const { data: allPlayers } = await supabase
      .from('players')
      .select('*')
      .order('name')

    if (!allPlayers) { setLoading(false); return }

    // Get all songs to count rounds submitted per player
    const { data: allSongs } = await supabase
      .from('songs')
      .select('id, player_id, round_id')

    // Get completed rounds to count how many rounds exist
    const { data: completedRounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('status', 'complete')

    // Get active round songs (to show who submitted this round)
    const { data: activeRound } = await supabase
      .from('rounds')
      .select('id, theme_name, status')
      .in('status', ['submission', 'voting'])
      .limit(1)
      .single()

    // Get votes received per player (points earned)
    const { data: allVotes } = await supabase
      .from('votes')
      .select('song_id, points, voter_player_id, round_id')

    // Map song_id → player_id
    const songOwnerMap = {}
    for (const s of allSongs || []) {
      songOwnerMap[s.id] = s.player_id
    }

    // Count rounds submitted and points earned per player
    const roundsSubmitted = {}
    const pointsEarned = {}
    const activeRoundSubmitters = new Set()
    const activeRoundVoters = new Set()

    for (const s of allSongs || []) {
      roundsSubmitted[s.player_id] = (roundsSubmitted[s.player_id] || 0) + 1
      if (activeRound && s.round_id === activeRound.id) {
        activeRoundSubmitters.add(s.player_id)
      }
    }

    for (const v of allVotes || []) {
      const owner = songOwnerMap[v.song_id]
      if (owner) pointsEarned[owner] = (pointsEarned[owner] || 0) + v.points
      if (activeRound && v.round_id === activeRound.id) {
        activeRoundVoters.add(v.voter_player_id)
      }
    }

    const enriched = allPlayers.map(p => ({
      ...p,
      rounds_submitted: roundsSubmitted[p.id] || 0,
      points_earned: pointsEarned[p.id] || 0,
      submitted_this_round: activeRoundSubmitters.has(p.id),
      voted_this_round: activeRoundVoters.has(p.id),
      completed_rounds: completedRounds?.length || 0,
      active_round: activeRound || null,
    }))

    setPlayers(enriched)
    setLoading(false)
  }

  useEffect(() => {
    loadPlayers()
  }, [])

  async function handleToggleActive(player) {
    setToggling(t => ({ ...t, [player.id]: true }))
    await supabase
      .from('players')
      .update({ active: !player.active })
      .eq('id', player.id)
    await loadPlayers()
    setToggling(t => ({ ...t, [player.id]: false }))
  }

  if (loading) return <div className="page"><p style={{ color: 'var(--text3)' }}>Loading players...</p></div>

  const active = players.filter(p => p.active)
  const inactive = players.filter(p => !p.active)

  return (
    <div className="page">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2>Player List</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginTop: '0.2rem' }}>
          {active.length} active · {inactive.length} inactive · {players.length} total
        </p>
      </div>

      <div style={{
        background: 'rgba(232, 124, 71, 0.08)',
        border: '1px solid rgba(232, 124, 71, 0.3)',
        borderRadius: 'var(--radius-lg)',
        padding: '0.85rem 1.1rem',
        marginBottom: '1.5rem',
      }}>
        <p style={{ color: 'var(--accent2)', fontSize: '0.85rem', fontWeight: 600 }}>
          ⚠️ Deactivating a player removes them from submission/voting counts and hides them from the join screen. Their historical data stays intact.
        </p>
      </div>

      {/* Active players */}
      <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)' }}>
        Active Players
      </h3>

      {active.map(p => (
        <PlayerRow
          key={p.id}
          player={p}
          isCurrentUser={p.id === currentPlayer.id}
          toggling={toggling[p.id]}
          onToggle={handleToggleActive}
        />
      ))}

      {/* Inactive players */}
      {inactive.length > 0 && (
        <>
          <h3 style={{ margin: '1.5rem 0 0.75rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)' }}>
            Inactive Players
          </h3>
          {inactive.map(p => (
            <PlayerRow
              key={p.id}
              player={p}
              isCurrentUser={p.id === currentPlayer.id}
              toggling={toggling[p.id]}
              onToggle={handleToggleActive}
            />
          ))}
        </>
      )}
    </div>
  )
}

function PlayerRow({ player, isCurrentUser, toggling, onToggle }) {
  return (
    <div className="card" style={{
      marginBottom: '0.6rem',
      opacity: player.active ? 1 : 0.55,
      borderColor: isCurrentUser ? 'rgba(232,197,71,0.3)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>

        {/* Name + you tag */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>
              {player.name}
            </span>
            {isCurrentUser && (
              <span className="tag-own">you</span>
            )}
            {!player.active && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', border: '1px solid var(--border)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontFamily: 'var(--font-mono)' }}>
                inactive
              </span>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              🎵 {player.rounds_submitted} round{player.rounds_submitted !== 1 ? 's' : ''} submitted
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              ⭐ {player.points_earned} pts earned
            </span>
            {player.active_round && (
              <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: player.submitted_this_round ? 'var(--success)' : 'var(--accent2)' }}>
                {player.submitted_this_round ? '✓ submitted this round' : '✗ not submitted yet'}
              </span>
            )}
            {player.active_round?.status === 'voting' && (
              <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: player.voted_this_round ? 'var(--success)' : 'var(--accent2)' }}>
                {player.voted_this_round ? '✓ voted this round' : '✗ not voted yet'}
              </span>
            )}
          </div>
        </div>

        {/* Toggle button — can't deactivate yourself */}
        {!isCurrentUser && (
          <button
            className={`btn btn-sm ${player.active ? 'btn-ghost' : 'btn-secondary'}`}
            onClick={() => onToggle(player)}
            disabled={toggling}
            style={{ flexShrink: 0 }}
          >
            {toggling ? '...' : player.active ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </div>
    </div>
  )
}
