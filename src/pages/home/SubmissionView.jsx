import { useEffect, useState } from 'react'
import SideRoster from '../../components/SideRoster.jsx'
import { groupLabel } from '../../lib/groups.js'
import { saveSongSubmission } from '../../lib/mutations.js'

function songFormValues(song) {
  return {
    artist: song?.artist || '',
    title: song?.title || '',
    album: song?.album || '',
    link: song?.link || '',
    submitter_note: song?.submitter_note || '',
  }
}

export default function SubmissionView({ round, player, songs, activePlayers, sides, mySide, onChanged }) {
  const mySong = songs.find(song => song.player_id === player.id)
  const [form, setForm] = useState(() => songFormValues(mySong))
  const [savedSong, setSavedSong] = useState(() => mySong ? songFormValues(mySong) : null)
  const [editing, setEditing] = useState(() => !mySong)
  const [detailsVisible, setDetailsVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setDetailsVisible(false)
  }, [round.id, player.id])

  useEffect(() => {
    function hideDetailsWhenAway() {
      if (document.visibilityState === 'hidden') setDetailsVisible(false)
    }

    document.addEventListener('visibilitychange', hideDetailsWhenAway)
    return () => document.removeEventListener('visibilitychange', hideDetailsWhenAway)
  }, [])

  useEffect(() => {
    if (!mySong) return
    const nextSong = songFormValues(mySong)
    setSavedSong(nextSong)
    setDetailsVisible(false)
    if (!editing) setForm(nextSong)
  }, [mySong?.id, mySong?.artist, mySong?.title, mySong?.album, mySong?.link, mySong?.submitter_note])

  async function handleSubmit(event) {
    event.preventDefault()
    const nextSong = {
      artist: form.artist.trim(),
      title: form.title.trim(),
      album: form.album.trim(),
      link: form.link.trim(),
      submitter_note: form.submitter_note.trim(),
    }

    if (!nextSong.artist || !nextSong.title) {
      setError('Artist and title are required.')
      setSuccess('')
      return
    }

    const wasEditing = Boolean(savedSong)
    setSaving(true)
    setError('')
    setSuccess('')

    let saveError
    try {
      const result = await saveSongSubmission({
        roundId: round.id,
        playerId: player.id,
        form: nextSong,
      })
      saveError = result.error
    } catch {
      setSaving(false)
      setError('Could not save that song. Try again.')
      return
    }

    setSaving(false)
    if (saveError) {
      setError('Could not save that song. Try again.')
      return
    }

    setForm(nextSong)
    setSavedSong(nextSong)
    setSuccess(wasEditing ? 'Changes saved. Your submission is up to date.' : 'Song submitted. Your pick is saved.')
    setEditing(false)
    onChanged()
  }

  function startEditing() {
    setDetailsVisible(false)
    setForm(savedSong || songFormValues(mySong))
    setError('')
    setSuccess('')
    setEditing(true)
  }

  function cancelEditing() {
    setForm(savedSong)
    setError('')
    setSuccess('')
    setEditing(false)
  }

  const submittedIds = new Set(songs.map(song => song.player_id))
  if (savedSong) submittedIds.add(player.id)
  const isSplit = sides?.isSplit && mySide !== null
  const otherSide = mySide === 0 ? 1 : 0
  const mySidePlayers = isSplit ? activePlayers.filter(row => sides.sideByPlayerId[row.id] === mySide) : activePlayers
  const otherSidePlayers = isSplit ? activePlayers.filter(row => sides.sideByPlayerId[row.id] === otherSide) : []
  const playersBySide = isSplit ? [
    { side: mySide, players: mySidePlayers },
    { side: otherSide, players: otherSidePlayers },
  ] : []

  return (
    <section className="phase-layout">
      <aside className="side-panel">
        {isSplit ? (
          <div className="voting-sides submission-voting-sides">
            {playersBySide.map(({ side, players: sidePlayers }) => {
              const submittedCount = sidePlayers.filter(row => submittedIds.has(row.id)).length
              return (
                <div className={`voting-side-roster roster-side-${side}`} key={side}>
                  <h3 className={`side-name side-${side}`}>
                    {groupLabel(side)} <span>{submittedCount}/{sidePlayers.length} songs</span>
                  </h3>
                  <SideRoster
                    players={sidePlayers}
                    submittedIds={submittedIds}
                    currentPlayerId={player.id}
                    phase="submission"
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <h2>Submission roll call</h2>
            <p className="big-stat">{submittedIds.size}/{activePlayers.length}</p>
            <SideRoster
              players={activePlayers}
              submittedIds={submittedIds}
              currentPlayerId={player.id}
              phase="submission"
            />
          </>
        )}
      </aside>

      <section className={`card submission-card ${savedSong && !editing ? 'is-saved' : 'is-editing'}`}>
        {savedSong && !editing ? (
          <>
            <div className="section-heading submission-saved-heading">
              <div>
                <p className="eyebrow">Submission received</p>
                <h2>Your song is in</h2>
              </div>
              <span className="soft-tag submission-saved-tag">
                <span aria-hidden="true">✓</span> Saved
              </span>
            </div>

            {success && (
              <p className="submission-feedback is-success" role="status" aria-live="polite">
                {success}
              </p>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              aria-expanded={detailsVisible}
              onClick={() => setDetailsVisible(visible => !visible)}
            >
              {detailsVisible ? 'Hide my song' : 'Show my song'}
            </button>

            {detailsVisible && (
              <>
                <div className="submission-receipt">
                  <div className="submission-record" aria-hidden="true"><span /></div>
                  <div className="submission-receipt-copy">
                    <p className="eyebrow">Your pick</p>
                    <h3>{savedSong.title}</h3>
                    <p className="submission-receipt-meta">
                      <strong>{savedSong.artist}</strong>
                      {savedSong.album && <span> · {savedSong.album}</span>}
                    </p>
                    {savedSong.link && (
                      <a href={savedSong.link} target="_blank" rel="noreferrer" className="submission-receipt-link">
                        Open submitted link ↗
                      </a>
                    )}
                  </div>
                </div>

                {savedSong.submitter_note && (
                  <p className="submission-receipt-note">“{savedSong.submitter_note}”</p>
                )}
              </>
            )}

            <div className="submission-saved-footer">
              <p>You can change this until voting starts.</p>
              <button type="button" className="btn btn-secondary" onClick={startEditing}>
                Edit submission
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="section-heading">
              <h2>{savedSong ? 'Edit your submission' : 'Lock in a song'}</h2>
              {savedSong && <span className="soft-tag">Editing</span>}
            </div>

            <form className="stack submission-form" onSubmit={handleSubmit} aria-busy={saving}>
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
                  <input
                    type="url"
                    value={form.link}
                    placeholder="Skip unless necessary"
                    onChange={event => setForm(f => ({ ...f, link: event.target.value }))}
                  />
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

              {error && (
                <p className="submission-feedback is-error" role="alert">
                  {error}
                </p>
              )}

              <div className="submission-form-actions">
                {savedSong && (
                  <button type="button" className="btn btn-secondary btn-lg" onClick={cancelEditing} disabled={saving}>
                    Cancel
                  </button>
                )}
                <button type="submit" className="btn btn-primary btn-lg" disabled={saving} aria-live="polite">
                  {saving && <span className="submission-spinner" aria-hidden="true" />}
                  {saving ? savedSong ? 'Saving changes…' : 'Submitting song…' : savedSong ? 'Save changes' : 'Submit song'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </section>
  )
}
