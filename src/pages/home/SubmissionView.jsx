import { useEffect, useState } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { saveSongSubmission } from '../../lib/mutations.js'

export default function SubmissionView({ round, player, songs, activePlayers, onChanged }) {
  const mySong = songs.find(song => song.player_id === player.id)
  const [form, setForm] = useState({
    artist: mySong?.artist || '',
    title: mySong?.title || '',
    album: mySong?.album || '',
    link: mySong?.link || '',
    submitter_note: mySong?.submitter_note || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({
      artist: mySong?.artist || '',
      title: mySong?.title || '',
      album: mySong?.album || '',
      link: mySong?.link || '',
      submitter_note: mySong?.submitter_note || '',
    })
  }, [mySong?.id])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.artist.trim() || !form.title.trim()) {
      setError('Artist and title are required.')
      return
    }

    setSaving(true)
    setError('')

    const { error: saveError } = await saveSongSubmission({
      roundId: round.id,
      playerId: player.id,
      form,
    })

    setSaving(false)
    if (saveError) {
      setError('Could not save that song. Try again.')
      return
    }
    onChanged()
  }

  const submittedIds = new Set(songs.map(song => song.player_id))
  const submittedCount = songs.length

  return (
    <section className="phase-layout">
      <aside className="side-panel">
        <h2>Submission roll call</h2>
        <p className="big-stat">{submittedCount}/{activePlayers.length}</p>
        <div className="mini-roster">
          {activePlayers.map(activePlayer => (
            <span key={activePlayer.id} className={`roster-dot ${submittedIds.has(activePlayer.id) ? 'done' : ''}`}>
              <Avatar player={activePlayer} size="sm" />
              <span>{activePlayer.name}</span>
            </span>
          ))}
        </div>
      </aside>

      <section className="card">
        <div className="section-heading">
          <h2>{mySong ? 'Your submission' : 'Lock in a song'}</h2>
          {mySong && <span className="soft-tag">Editable</span>}
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Artist</span>
              <input value={form.artist} onChange={event => setForm(f => ({ ...f, artist: event.target.value }))} />
            </label>
            <label>
              <span>Song title</span>
              <input value={form.title} onChange={event => setForm(f => ({ ...f, title: event.target.value }))} />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Album</span>
              <input value={form.album} onChange={event => setForm(f => ({ ...f, album: event.target.value }))} />
            </label>
            <label>
              <span>Link</span>
              <input type="url" value={form.link} onChange={event => setForm(f => ({ ...f, link: event.target.value }))} />
            </label>
          </div>
          <label>
            <span>Submitter note</span>
            <textarea
              value={form.submitter_note}
              onChange={event => setForm(f => ({ ...f, submitter_note: event.target.value }))}
              rows={3}
              placeholder="Optional note"
            />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? 'Saving...' : mySong ? 'Save song' : 'Submit song'}
          </button>
        </form>
      </section>
    </section>
  )
}
