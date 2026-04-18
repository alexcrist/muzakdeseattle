import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function RoundHistoryPage() {
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: roundsData } = await supabase
        .from('rounds')
        .select('id, theme_name, theme_description, queue_position')
        .eq('status', 'complete')
        .order('queue_position', { ascending: false })

      if (!roundsData || roundsData.length === 0) {
        setLoading(false)
        return
      }

      const roundIds = roundsData.map(r => r.id)

      const { data: songs } = await supabase
        .from('songs')
        .select('*, players(name)')
        .in('round_id', roundIds)

      const { data: votes } = await supabase
        .from('votes')
        .select('song_id, points')
        .in('round_id', roundIds)

      const voteTotals = {}
      for (const v of votes || []) {
        voteTotals[v.song_id] = (voteTotals[v.song_id] || 0) + v.points
      }

      const byRound = {}
      for (const s of songs || []) {
        if (!byRound[s.round_id]) byRound[s.round_id] = []
        byRound[s.round_id].push({
          id: s.id,
          title: s.title,
          artist: s.artist,
          album: s.album,
          link: s.link,
          submitter: s.players?.name || '—',
          points: voteTotals[s.id] || 0,
        })
      }
      for (const rid of Object.keys(byRound)) {
        byRound[rid].sort((a, b) => b.points - a.points)
      }

      setRounds(roundsData.map(r => ({ ...r, songs: byRound[r.id] || [] })))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="page"><p style={{ color: 'var(--text3)' }}>loading...</p></div>
  }

  return (
    <div className="page">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2>Round History</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginTop: '0.2rem' }}>
          A recap of every round that's wrapped up.
        </p>
      </div>

      {rounds.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🗂️</div>
          <p>No completed rounds yet. Come back after the first round wraps up.</p>
        </div>
      ) : (
        rounds.map(round => {
          const topPoints = round.songs[0]?.points ?? 0
          return (
            <section
              key={round.id}
              style={{
                marginBottom: '2rem',
                padding: '1.1rem 1.25rem',
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <h3 style={{ margin: 0 }}>{round.theme_name}</h3>
              {round.theme_description && (
                <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginTop: '0.3rem', marginBottom: '0.9rem' }}>
                  {round.theme_description}
                </p>
              )}

              {round.songs.length === 0 ? (
                <p style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>No songs were submitted for this round.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {round.songs.map((song, idx) => {
                    const isWinner = idx === 0 && topPoints > 0
                    return (
                      <li
                        key={song.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          padding: '0.6rem 0',
                          borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {isWinner && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                                🏆 WINNER
                              </span>
                            )}
                            <span style={{ fontWeight: 600 }}>{song.title}</span>
                            {song.link && (
                              <a href={song.link} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>🔗</a>
                            )}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>
                            {song.artist}{song.album ? ` · ${song.album}` : ''}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: '0.1rem' }}>
                            submitted by <span style={{ color: 'var(--accent3)' }}>{song.submitter}</span>
                          </div>
                          <div style={{ marginTop: '0.4rem' }}>
                            <a
                              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.artist} ${song.title}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost btn-sm"
                              style={{ textDecoration: 'none' }}
                            >
                              ▶ YouTube
                            </a>
                          </div>
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          color: isWinner ? 'var(--accent)' : 'var(--text2)',
                          fontWeight: isWinner ? 700 : 500,
                          whiteSpace: 'nowrap',
                        }}>
                          {song.points} pt{song.points === 1 ? '' : 's'}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
