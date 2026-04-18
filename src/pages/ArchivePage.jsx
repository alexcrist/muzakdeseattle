import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function ArchivePage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    async function load() {
      // Get all complete rounds
      const { data: rounds } = await supabase
        .from('rounds')
        .select('id, theme_name, queue_position')
        .eq('status', 'complete')
        .order('queue_position', { ascending: true })

      if (!rounds || rounds.length === 0) {
        setLoading(false)
        return
      }

      const roundIds = rounds.map(r => r.id)
      const roundMap = Object.fromEntries(rounds.map(r => [r.id, r]))

      // Get all songs from those rounds with submitter names
      const { data: songs } = await supabase
        .from('songs')
        .select('*, players(name)')
        .in('round_id', roundIds)

      // Get vote totals
      const { data: votes } = await supabase
        .from('votes')
        .select('song_id, points')
        .in('round_id', roundIds)

      const voteTotals = {}
      for (const v of votes || []) {
        voteTotals[v.song_id] = (voteTotals[v.song_id] || 0) + v.points
      }

      // Build flat rows sorted by round, then points desc
      const flat = (songs || []).map(s => ({
        round_name: roundMap[s.round_id]?.theme_name || '—',
        round_position: roundMap[s.round_id]?.queue_position ?? 999,
        song_title: s.title,
        artist: s.artist,
        album: s.album || '—',
        submitter: s.players?.name || '—',
        points: voteTotals[s.id] || 0,
        link: s.link,
      })).sort((a, b) => {
        if (a.round_position !== b.round_position) return a.round_position - b.round_position
        return b.points - a.points
      })

      setRows(flat)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = filter.trim()
    ? rows.filter(r =>
        [r.round_name, r.song_title, r.artist, r.submitter, r.album]
          .some(f => f.toLowerCase().includes(filter.toLowerCase()))
      )
    : rows

  if (loading) return <div className="page"><p style={{ color: 'var(--text3)' }}>loading...</p></div>

  return (
    <div className="page">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2>Song Archive</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginTop: '0.2rem' }}>
          Every song submitted, ever.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📂</div>
          <p>No completed rounds yet. Come back after the first round wraps up.</p>
        </div>
      ) : (
        <>
          {/* Filter */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Filter by song, artist, round, or player..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} song{filtered.length !== 1 ? 's' : ''}
          </p>

          {/* Mobile: cards */}
          <div style={{ display: 'none' }} className="archive-cards">
            {filtered.map((row, i) => (
              <div key={i} className="card" style={{ marginBottom: '0.5rem' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{row.song_title}</p>
                <p style={{ color: 'var(--text2)', fontSize: '0.88rem' }}>{row.artist}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text3)' }}>
                  <span>{row.round_name}</span>
                  <span>{row.submitter}</span>
                  <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{row.points} pts</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>Album</th>
                  <th>Submitted By</th>
                  <th style={{ textAlign: 'right' }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text3)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{row.round_name}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.song_title}</span>
                      {row.link && (
                        <a href={row.link} target="_blank" rel="noreferrer" style={{ marginLeft: '0.4rem', fontSize: '0.75rem' }}>🔗</a>
                      )}
                    </td>
                    <td>{row.artist}</td>
                    <td style={{ fontSize: '0.82rem' }}>{row.album}</td>
                    <td style={{ color: 'var(--accent3)' }}>{row.submitter}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
