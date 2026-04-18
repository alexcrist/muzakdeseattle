import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { FLAVOR } from '../../lib/flavor.js'
import Countdown from '../../components/Countdown.jsx'

export default function SubmissionPhase({ round, player, settings }) {
  const [mySong, setMySong] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ artist: '', title: '', album: '', link: '', submitter_note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submissionCount, setSubmissionCount] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(0)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('songs')
        .select('*')
        .eq('round_id', round.id)
        .eq('player_id', player.id)
        .single()
      setMySong(data || null)

      // Count submissions for this round
      const { count: subCount } = await supabase
        .from('songs')
        .select('*', { count: 'exact', head: true })
        .eq('round_id', round.id)
      setSubmissionCount(subCount || 0)

      // Count total ACTIVE players ever joined
      const { count: playerCount } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
      setTotalPlayers(playerCount || 0)

      setLoading(false)
    }
    load()

    // Refresh counts in realtime as others submit
    const sub = supabase
      .channel('songs-submission')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs', filter: `round_id=eq.${round.id}` }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [round.id, player.id])

  const allSubmitted = totalPlayers > 0 && submissionCount >= totalPlayers

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.artist.trim() || !form.title.trim()) {
      setError('Artist and title are required.')
      return
    }
    setSaving(true)
    setError('')

    const { data, error: err } = await supabase
      .from('songs')
      .upsert({
        round_id: round.id,
        player_id: player.id,
        artist: form.artist.trim(),
        title: form.title.trim(),
        album: form.album.trim() || null,
        link: form.link.trim() || null,
        submitter_note: form.submitter_note.trim() || null,
      }, { onConflict: 'round_id,player_id' })
      .select()
      .single()

    if (err) {
      setError('Failed to submit. Try again.')
      setSaving(false)
      return
    }

    setMySong(data)
    setSaving(false)
  }

  if (loading) return <div className="page"><p style={{ color: 'var(--text3)' }}>loading...</p></div>

  return (
    <div className="page">
      {/* Round header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span className="badge badge-submission">Submission Open</span>
        </div>
        <h2>{round.theme_name}</h2>
        <p style={{ marginTop: '0.4rem', fontSize: '1rem', color: 'var(--text2)' }}>{round.theme_description}</p>
      </div>

      <Countdown deadline={round.submission_deadline} label="Submissions close in" />

      {/* Submission progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span className="points-counter">
          🎵 {submissionCount} of {totalPlayers} players submitted
        </span>
      </div>

      {/* All submitted banner */}
      {allSubmitted && (
        <div style={{
          background: 'rgba(71, 232, 160, 0.08)',
          border: '1px solid rgba(71, 232, 160, 0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
        }}>
          <p style={{ fontWeight: 700, color: 'var(--success)', marginBottom: '0.2rem' }}>
            🎉 Everyone has submitted their songs!
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text2)', margin: 0 }}>
            Check back soon for the listening and voting round.
          </p>
        </div>
      )}

      {mySong ? (
        /* Already submitted */
        <div className="card" style={{ borderColor: 'rgba(126, 200, 80, 0.3)' }}>
          <div style={{ display: 'flex', align: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>✅</span>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>You're in.</p>
              {/* FLAVOR TEXT: Already submitted */}
              <p className="flavor-text" style={{ margin: 0 }}>{FLAVOR.ALREADY_SUBMITTED}</p>
            </div>
          </div>
          <hr className="divider" />
          <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: '0.5rem' }}>Your submission</p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.04em' }}>{mySong.title}</p>
          <p style={{ color: 'var(--text2)' }}>{mySong.artist}{mySong.album ? ` — ${mySong.album}` : ''}</p>
          {mySong.link && <a href={mySong.link} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', marginTop: '0.25rem', display: 'inline-block' }}>🔗 Listen</a>}
          {mySong.submitter_note && (
            <div className="submitter-note" style={{ marginTop: '0.75rem' }}>{mySong.submitter_note}</div>
          )}
        </div>
      ) : (
        /* Submission form */
        <div className="card">
          {/* FLAVOR TEXT: Submission tagline */}
          <p className="flavor-text">{FLAVOR.SUBMISSION_TAGLINE}</p>

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Artist *</label>
                <input type="text" value={form.artist} onChange={e => setForm(f => ({...f, artist: e.target.value}))} placeholder="Artist name" />
              </div>
              <div className="form-group">
                <label>Song Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Song title" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Album</label>
                <input type="text" value={form.album} onChange={e => setForm(f => ({...f, album: e.target.value}))} placeholder="Album (optional)" />
              </div>
              <div className="form-group">
                <label>Link</label>
                <input type="url" value={form.link} onChange={e => setForm(f => ({...f, link: e.target.value}))} placeholder="Spotify / YouTube / etc." />
              </div>
            </div>

            <div className="form-group">
              <label>Say something about your pick (optional)</label>
              <textarea
                value={form.submitter_note}
                onChange={e => setForm(f => ({...f, submitter_note: e.target.value}))}
                placeholder="Hype it up, give context, or say nothing. Up to you."
                rows={2}
              />
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg" disabled={saving} style={{ width: '100%' }}>
              {saving ? 'Submitting...' : 'Lock In My Pick 🎵'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
