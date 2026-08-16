import { useMemo, useState } from 'react'
import { groupLabel } from '../../lib/groups.js'
import { addRoundPlaylist, deleteRoundPlaylist } from '../../lib/mutations.js'
import { serviceLabelForUrl } from './homeUtils.js'

// Voting curates the playlist for the side you are looking at. Appreciation reveals both sides at
// once, so it passes no side and the panel drops to a read-only list of everything the round shared.
export default function PlaylistPanel({ playlists, roundId, side = null, showSides = false, onChanged }) {
  const canEdit = side === 0 || side === 1
  const [isEditing, setIsEditing] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)
  // Showing both sides at once, keep each side's links together instead of interleaved by age.
  const orderedPlaylists = useMemo(() => (
    showSides ? [...playlists].sort((a, b) => a.group_index - b.group_index) : playlists
  ), [playlists, showSides])

  async function addPlaylist(event) {
    event.preventDefault()
    if (!url.trim()) return

    setSaving(true)
    setError('')
    const { error: saveError } = await addRoundPlaylist({
      roundId,
      groupIndex: side,
      service: serviceLabelForUrl(url),
      url,
    })
    setSaving(false)
    if (saveError) {
      setError(saveError.code === '23505' ? 'That playlist is already listed.' : 'Could not save this playlist.')
      return
    }
    setUrl('')
    setIsAdding(false)
    onChanged()
  }

  async function removePlaylist(playlistId) {
    const { error: deleteError } = await deleteRoundPlaylist(playlistId)
    if (deleteError) {
      setError('Could not remove this playlist.')
      return
    }
    setConfirmingId(null)
    onChanged()
  }

  function toggleEditing() {
    setIsEditing(editing => !editing)
    setIsAdding(false)
    setConfirmingId(null)
  }

  // Nothing to browse and nothing to add: stay out of the way.
  if (!canEdit && playlists.length === 0) return null

  return (
    <section className="playlist-panel">
      <div className="playlist-heading">
        <p className="eyebrow">Shared playlists</p>
        {canEdit && (
          <div className="playlist-controls">
            {isEditing && (
              <button type="button" className="playlist-add" onClick={() => setIsAdding(value => !value)}>
                {isAdding ? 'Close' : 'Add link'}
              </button>
            )}
            <button type="button" className="playlist-add" onClick={toggleEditing}>{isEditing ? 'Done' : 'Edit'}</button>
          </div>
        )}
      </div>
      {playlists.length > 0 && (
        <div className="playlist-links">
          {orderedPlaylists.map(playlist => (
            <span className="playlist-link" key={playlist.id}>
              {showSides && <span className="playlist-side">{groupLabel(playlist.group_index)}</span>}
              <a href={playlist.url} target="_blank" rel="noreferrer">{playlist.service || serviceLabelForUrl(playlist.url)}</a>
              {isEditing && confirmingId === playlist.id ? (
                <span className="playlist-delete-confirm">
                  <button type="button" onClick={() => removePlaylist(playlist.id)}>Remove?</button>
                  <button type="button" onClick={() => setConfirmingId(null)}>Keep</button>
                </span>
              ) : isEditing ? (
                <button type="button" aria-label={`Remove ${playlist.service || 'playlist'}`} onClick={() => setConfirmingId(playlist.id)}>×</button>
              ) : null}
            </span>
          ))}
        </div>
      )}
      {!isAdding && playlists.length === 0 && <p className="muted playlist-empty">No playlist link yet.</p>}
      {isAdding && (
        <form className="playlist-form" onSubmit={addPlaylist}>
          <input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="Playlist link" required />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={saving || !url.trim()}>{saving ? 'Saving...' : 'Save link'}</button>
        </form>
      )}
      {error && <p className="error-msg">{error}</p>}
    </section>
  )
}
