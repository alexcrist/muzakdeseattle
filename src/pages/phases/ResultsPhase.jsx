import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { FLAVOR } from '../../lib/flavor.js'

export default function ResultsPhase({ round, player, onDismiss, isAutoSurfaced }) {
  const [songs, setSongs] = useState([])
  const [comments, setComments] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Songs with submitter names and their vote totals
      const { data: songsData } = await supabase
        .from('songs')
        .select('*, players(name)')
        .eq('round_id', round.id)

      const { data: votesData } = await supabase
        .from('votes')
        .select('*')
        .eq('round_id', round.id)

      const { data: commentsData } = await supabase
        .from('comments')
        .select('*, players(name)')
        .eq('round_id', round.id)
        .order('created_at', { ascending: true })

      // Compute per-song totals
      const voteTotals = {}
      for (const v of votesData || []) {
        voteTotals[v.song_id] = (voteTotals[v.song_id] || 0) + v.points
      }

      const enriched = (songsData || []).map(s => ({
        ...s,
        total_points: voteTotals[s.id] || 0,
      })).sort((a, b) => b.total_points - a.total_points)

      setSongs(enriched)
      setComments(commentsData || [])

      // Cumulative leaderboard across ALL complete rounds
      const { data: allVotes } = await supabase
        .from('votes')
        .select('voter_player_id, points, songs(player_id)')

      const { data: allSongs } = await supabase
        .from('songs')
        .select('id, player_id, players(name)')

      const { data: completedRounds } = await supabase
        .from('rounds')
        .select('id')
        .eq('status', 'complete')

      const completedIds = new Set((completedRounds || []).map(r => r.id))

      // Map song_id → player info
      const songOwnerMap = {}
      for (const s of allSongs || []) {
        songOwnerMap[s.id] = { player_id: s.player_id, name: s.players?.name }
      }

      // Tally points per player (based on votes received for their songs)
      const { data: allVotesFull } = await supabase
        .from('votes')
        .select('song_id, points, round_id')

      const playerTotals = {}
      const playerNames = {}
      for (const v of allVotesFull || []) {
        if (!completedIds.has(v.round_id)) continue
        const owner = songOwnerMap[v.song_id]
        if (!owner) continue
        playerTotals[owner.player_id] = (playerTotals[owner.player_id] || 0) + v.points
        playerNames[owner.player_id] = owner.name
      }

      const lb = Object.entries(playerTotals)
        .map(([id, pts]) => ({ id, name: playerNames[id], pts }))
        .sort((a, b) => b.pts - a.pts)

      setLeaderboard(lb)
      setLoading(false)
    }
    load()
  }, [round.id])

  if (loading) return <div className="page"><p style={{ color: 'var(--text3)' }}>Tallying votes...</p></div>

  const winner = songs[0]
  const isWinnerMe = winner?.player_id === player.id

  // Check for tie
  const tiedSongs = songs.filter(s => s.total_points === winner?.total_points)
  const isTie = tiedSongs.length > 1

  function winnerText() {
    if (!winner) return ''
    if (isTie) {
      const names = tiedSongs.map(s => s.players?.name).join(' & ')
      return FLAVOR.RESULTS_TIE.replace('{names}', names)
    }
    return FLAVOR.RESULTS_WINNER
      .replace('{name}', winner.players?.name || '???')
  }

  const songComments = (songId) => comments.filter(c => c.song_id === songId)

  return (
    <div className="page">
      <div style={{ marginBottom: '1.5rem' }}>
        <span className="badge badge-complete" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>Round Complete</span>
        <h2>{round.theme_name}</h2>
        {/* FLAVOR TEXT: Results intro */}
        <p className="flavor-text" style={{ marginTop: '0.3rem' }}>{FLAVOR.RESULTS_INTRO}</p>
      </div>

      {/* Winner highlight */}
      {winner && (
        <div className="winner-card">
          <div className="crown">👑</div>
          <p style={{ color: 'var(--text3)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            Round Winner
          </p>
          {/* FLAVOR TEXT: Winner callout */}
          <p style={{ color: 'var(--text2)', fontStyle: 'italic', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            {winnerText()}
          </p>
        </div>
      )}

      {/* Full results */}
      <h3 style={{ marginBottom: '1rem' }}>All Results</h3>
      {songs.map((song, i) => (
        <div key={song.id} className="song-item" style={{ borderColor: i === 0 && !isTie ? 'rgba(232,197,71,0.4)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="song-title">{song.title}</span>
                {song.player_id === player.id && <span className="tag-own">Yours</span>}
              </div>
              <div className="song-meta">
                <span className="song-artist">{song.artist}</span>
                {song.album && <span className="song-album">{song.album}</span>}
                {song.link && <a href={song.link} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>🔗</a>}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                submitted by <span style={{ color: 'var(--accent3)' }}>{song.players?.name}</span>
              </p>
              {song.submitter_note && (
                <div className="submitter-note" style={{ marginTop: '0.5rem' }}>{song.submitter_note}</div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: i === 0 && !isTie ? 'var(--accent)' : 'var(--text2)', letterSpacing: '0.04em' }}>
                {song.total_points}
              </span>
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)' }}>pts</p>
            </div>
          </div>

          {/* Comments */}
          {songComments(song.id).length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              {songComments(song.id).map(c => (
                <div key={c.id} className="comment">
                  <span className="comment-author">{c.players?.name}</span>
                  <p style={{ color: 'var(--text2)', fontSize: '0.88rem', margin: 0 }}>{c.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Mini leaderboard */}
      {leaderboard.length > 0 && (
        <>
          <h3 style={{ margin: '2rem 0 0.75rem' }}>Overall Standings</h3>
          <div className="card" style={{ padding: 0 }}>
            {leaderboard.map((p, i) => (
              <div key={p.id} className="lb-row">
                <span className={`lb-rank ${i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : ''}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </span>
                <span className="lb-name" style={{ color: p.id === player.id ? 'var(--accent)' : undefined }}>
                  {p.name} {p.id === player.id ? '(you)' : ''}
                </span>
                <span className="lb-points">{p.pts}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dismiss */}
      {isAutoSurfaced && (
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%', marginTop: '2rem' }}
          onClick={onDismiss}
        >
          {/* FLAVOR TEXT: Dismiss button */}
          {FLAVOR.RESULTS_DISMISS_BUTTON}
        </button>
      )}
    </div>
  )
}
