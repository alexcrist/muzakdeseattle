import { useEffect, useState } from 'react'
import SideRoster from '../../components/SideRoster.jsx'
import { groupLabel } from '../../lib/groups.js'
import { saveSongSubmission } from '../../lib/mutations.js'

export default function SubmissionView({ round, player, songs, activePlayers, sides, mySide, onChanged }) {
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
  const isSplit = sides?.isSplit && mySide !== null
  const otherSide = mySide === 0 ? 1 : 0
  const mySidePlayers = isSplit ? activePlayers.filter(row => sides.sideByPlayerId[row.id] === mySide) : activePlayers
  const otherSidePlayers = isSplit ? activePlayers.filter(row => sides.sideByPlayerId[row.id] === otherSide) : []
  const mySubmittedCount = mySidePlayers.filter(row => submittedIds.has(row.id)).length

  return (
    <section className="phase-layout">
      <aside className="side-panel">
        {isSplit ? (
          <>
            <p className="eyebrow">Your side this week</p>
            <h2 className={`side-name side-${mySide}`}>{groupLabel(mySide)}</h2>
            <p className="big-stat">{mySubmittedCount}/{mySidePlayers.length}</p>
            <p>You will hear and vote on these players only.</p>
            <SideRoster players={mySidePlayers} submittedIds={submittedIds} currentPlayerId={player.id} />
            <hr />
            <p className="eyebrow">Also playing this week</p>
            <h3 className={`side-name side-${otherSide}`}>{groupLabel(otherSide)}</h3>
            <SideRoster players={otherSidePlayers} submittedIds={submittedIds} currentPlayerId={player.id} muted />
          </>
        ) : (
          <>
            <h2>Submission roll call</h2>
            <p className="big-stat">{songs.length}/{activePlayers.length}</p>
            <SideRoster players={activePlayers} submittedIds={submittedIds} currentPlayerId={player.id} />
          </>
        )}
      </aside>

      <section className="card">
        <div className="section-heading">
          <h2>{mySong ? 'Your submission' : 'Lock in a song'}</h2>
          {mySong && <span className="soft-tag">Editable</span>}
        </div>

        {isSplit && (
          <p className="muted side-note">
            Only {groupLabel(mySide)} hears this one. The other {otherSidePlayers.length} players run their own side of
            the same theme, and both sides are ranked together on Sunday.
          </p>
        )}

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
