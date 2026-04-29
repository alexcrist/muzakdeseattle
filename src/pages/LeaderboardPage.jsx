import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { usePlayer } from '../App.jsx'
import { FLAVOR } from '../lib/flavor.js'

export default function LeaderboardPage() {
  const { player } = usePlayer()
  const [leaderboard, setLeaderboard] = useState([])   // [{ id, name, total, byRound: { roundId: pts } }]
  const [rounds, setRounds] = useState([])             // completed rounds in order
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Complete rounds
      const { data: completedRounds } = await supabase
        .from('rounds')
        .select('id, theme_name, queue_position')
        .eq('status', 'complete')
        .order('queue_position', { ascending: true })

      setRounds(completedRounds || [])
      if (!completedRounds?.length) { setLoading(false); return }

      const roundIds = completedRounds.map(r => r.id)

      // All songs in those rounds (to map song → submitter)
      const { data: songs } = await supabase
        .from('songs')
        .select('id, player_id, round_id, players(id, name)')
        .in('round_id', roundIds)

      // All votes for those rounds
      const { data: votes } = await supabase
        .from('votes')
        .select('song_id, points, round_id')
        .in('round_id', roundIds)

      // song_id → { player_id, player_name, round_id }
      const songMap = {}
      const playerNames = {}
      for (const s of songs || []) {
        songMap[s.id] = { player_id: s.player_id, round_id: s.round_id }
        if (s.players) playerNames[s.player_id] = s.players.name
      }

      // Tally points per player per round
      const tally = {}  // { player_id: { total, byRound: { round_id: pts } } }
      for (const v of votes || []) {
        const song = songMap[v.song_id]
        if (!song) continue
        const pid = song.player_id
        const rid = song.round_id
        if (!tally[pid]) tally[pid] = { total: 0, byRound: {} }
        tally[pid].total += v.points
        tally[pid].byRound[rid] = (tally[pid].byRound[rid] || 0) + v.points
      }

      // Also include players with 0 points (they submitted but got no votes)
      for (const s of songs || []) {
        if (!tally[s.player_id]) tally[s.player_id] = { total: 0, byRound: {} }
      }

      const lb = Object.entries(tally)
        .map(([id, data]) => ({
          id,
          name: playerNames[id] || '???',
          total: data.total,
          byRound: data.byRound,
        }))
        .sort((a, b) => b.total - a.total)

      setLeaderboard(lb)
      setLoading(false)
    }
    load()

    const sub = supabase
      .channel('lb-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  if (loading) return <div className="page"><p style={{ color: 'var(--text3)' }}>Crunching numbers...</p></div>

  const medalFor = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1

  return (
    <div className="page">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2>Leaderboard</h2>
        {/* FLAVOR TEXT: Leaderboard header */}
        {FLAVOR.LEADERBOARD_HEADER && (
          <p className="flavor-text" style={{ marginTop: '0.3rem' }}>{FLAVOR.LEADERBOARD_HEADER}</p>
        )}
      </div>

      {leaderboard.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🏁</div>
          <p>No completed rounds yet. Standings will appear here once the first round finishes.</p>
        </div>
      ) : (
        <>
          {/* Champion hero — maximum swag for the gold medalist */}
          <div className="champion-hero">
            <div className="champion-rays" aria-hidden="true" />
            <span className="champion-sparkle s1">✨</span>
            <span className="champion-sparkle s2">⭐</span>
            <span className="champion-sparkle s3">💎</span>
            <span className="champion-sparkle s4">💫</span>
            <span className="champion-sparkle s5">🔥</span>
            <span className="champion-sparkle s6">✨</span>
            <span className="champion-sparkle s7">💰</span>
            <span className="champion-sparkle s8">⚡</span>
            <span className="champion-sparkle s9">⭐</span>
            <span className="champion-sparkle s10">💎</span>

            <div className="champion-label">👑 &nbsp;R E I G N I N G &nbsp;&nbsp; C H A M P I O N&nbsp; 👑</div>

            <div className="champion-medal-wrap">
              <div className="champion-halo" aria-hidden="true" />
              <div className="champion-medal">🥇</div>
            </div>

            <div className="champion-name">
              {leaderboard[0].name}
              {leaderboard[0].id === player.id && <span className="champion-you"> (that's you!)</span>}
            </div>
            <div className="champion-underline" aria-hidden="true" />

            <div className="champion-stars" aria-hidden="true">
              <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
            </div>

            <div className="champion-score">
              <span className="champion-score-num">{leaderboard[0].total}</span>
              <span className="champion-score-label">pts</span>
            </div>

            <div className="champion-marquee" aria-hidden="true">
              <div className="champion-marquee-track">
                <span>🏆 CERTIFIED HEAVYWEIGHT &nbsp;★&nbsp; TASTEMAKER OF THE YEAR &nbsp;★&nbsp; MUZAK DON &nbsp;★&nbsp; AUX-CORD AUTHORITY &nbsp;★&nbsp; PLATINUM EARDRUM &nbsp;★&nbsp; UNDISPUTED &nbsp;🏆&nbsp;</span>
                <span>🏆 CERTIFIED HEAVYWEIGHT &nbsp;★&nbsp; TASTEMAKER OF THE YEAR &nbsp;★&nbsp; MUZAK DON &nbsp;★&nbsp; AUX-CORD AUTHORITY &nbsp;★&nbsp; PLATINUM EARDRUM &nbsp;★&nbsp; UNDISPUTED &nbsp;🏆&nbsp;</span>
              </div>
            </div>
          </div>

          {/* Silver / Bronze podium */}
          {(leaderboard[1] || leaderboard[2]) && (
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {leaderboard[1] && (
                <div className="card" style={{ flex: 1, textAlign: 'center', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '1.8rem' }}>🥈</div>
                  <p style={{ fontWeight: 700, color: leaderboard[1].id === player.id ? 'var(--accent)' : 'var(--text)', marginTop: '0.3rem' }}>
                    {leaderboard[1].name}
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', color: '#c0c0c0' }}>
                    {leaderboard[1].total}
                  </p>
                </div>
              )}
              {leaderboard[2] && (
                <div className="card" style={{ flex: 1, textAlign: 'center', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '1.8rem' }}>🥉</div>
                  <p style={{ fontWeight: 700, color: leaderboard[2].id === player.id ? 'var(--accent)' : 'var(--text)', marginTop: '0.3rem' }}>
                    {leaderboard[2].name}
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', color: '#cd7f32' }}>
                    {leaderboard[2].total}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Full standings */}
          <div className="card" style={{ padding: 0, marginBottom: '2rem' }}>
            {leaderboard.map((p, i) => (
              <div key={p.id} className={`lb-row ${i === 0 ? 'is-champion' : ''}`}>
                <span className={`lb-rank ${i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : ''}`}>
                  {medalFor(i)}
                </span>
                <span className="lb-name" style={{ color: p.id === player.id ? 'var(--accent)' : undefined }}>
                  {p.name} {p.id === player.id ? <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>(you)</span> : ''}
                </span>
                <span className="lb-points">{p.total}</span>
              </div>
            ))}
          </div>

          {/* Round-by-round breakdown */}
          {rounds.length > 0 && (
            <>
              <h3 style={{ marginBottom: '0.75rem' }}>Round Breakdown</h3>
              <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      {rounds.map(r => (
                        <th key={r.id} style={{ whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.theme_name}
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, color: p.id === player.id ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </td>
                        {rounds.map(r => (
                          <td key={r.id} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: (p.byRound[r.id] || 0) > 0 ? 'var(--text)' : 'var(--text3)' }}>
                            {p.byRound[r.id] || '—'}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700 }}>
                          {p.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
