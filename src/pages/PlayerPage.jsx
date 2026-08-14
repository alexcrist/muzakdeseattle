import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import useRealtimeData from '../hooks/useRealtimeData.js'
import { EMPTY_PLAYER_DATA, fetchPlayerData, PLAYER_REALTIME_TABLES } from '../lib/data.js'
import { groupLabel, sidesForRound } from '../lib/groups.js'
import { clearProfilePictureUrl, saveProfileName, saveProfilePictureUrl } from '../lib/mutations.js'
import { uploadProfilePicture } from '../lib/profilePictures.js'
import { buildLeaderboard, buildSongEntries } from '../lib/scoring.js'
import { formatPacificDate, getRoundWeekStart, getScoredRoundIds, sortedRounds } from '../lib/schedule.js'

export default function PlayerPage() {
  const { playerId } = useParams()
  const { player, setPlayer, logout } = usePlayer()
  const { settings } = useSettings()
  const { data, loading, reload } = useRealtimeData({
    channelName: `player-page-season-2-${playerId}`,
    fetcher: fetchPlayerData,
    initialData: EMPTY_PLAYER_DATA,
    tables: PLAYER_REALTIME_TABLES,
  })
  const [profile, setProfile] = useState({ name: player.name, avatar_url: player.avatar_url || '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isAvatarLightboxOpen, setIsAvatarLightboxOpen] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (playerId !== player.id) return
    setProfile({ name: player.name, avatar_url: player.avatar_url || '' })
  }, [playerId, player.id, player.name, player.avatar_url])

  useEffect(() => {
    if (!isAvatarLightboxOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsAvatarLightboxOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAvatarLightboxOpen])

  const viewedPlayer = data.players.find(row => row.id === playerId)
  const isSelf = playerId === player.id
  const scoredRoundIds = useMemo(() => getScoredRoundIds(data.rounds, settings), [data.rounds, settings])
  const leaderboard = useMemo(() => buildLeaderboard({
    players: data.players,
    rounds: data.rounds,
    songs: data.songs,
    votes: data.votes,
    duplicateGroups: data.groups,
    groupSongs: data.groupSongs,
    scoredRoundIds,
  }), [data, scoredRoundIds])

  const submissions = useMemo(() => {
    if (!viewedPlayer) return []

    return sortedRounds(data.rounds)
      .map((round, index) => ({ round, index }))
      .filter(({ round }) => scoredRoundIds.has(round.id))
      .reverse()
      .flatMap(({ round, index: roundIndex }) => {
        const roundSongs = data.songs.filter(song => song.round_id === round.id)
        const roundVotes = data.votes.filter(vote => vote.round_id === round.id)
        const roundGroups = data.groups.filter(group => group.round_id === round.id)
        const groupIds = new Set(roundGroups.map(group => group.id))
        const roundGroupSongs = data.groupSongs.filter(row => groupIds.has(row.group_id))
        const sides = sidesForRound(data.roundGroups, round.id)
        const entries = buildSongEntries({
          songs: roundSongs,
          votes: roundVotes,
          duplicateGroups: roundGroups,
          groupSongs: roundGroupSongs,
          sideByPlayerId: sides.isSplit ? sides.sideByPlayerId : null,
        })

        // A player only ever competed against their own side, so rank within that side.
        const placeBySide = {}

        return entries
          .map(entry => {
            const key = entry.side === 0 || entry.side === 1 ? entry.side : 'all'
            placeBySide[key] = (placeBySide[key] || 0) + 1
            return { entry, rank: placeBySide[key] }
          })
          .filter(({ entry }) => entry.submitterIds?.includes(viewedPlayer.id))
          .map(({ entry, rank }) => {
            const submittedSong = entry.songs?.find(song => song.player_id === viewedPlayer.id) || entry.songs?.[0]
            return {
              id: `${round.id}:${entry.id}:${submittedSong?.id || 'song'}`,
              round,
              weekStart: getRoundWeekStart(settings, round, roundIndex),
              entry,
              rank,
              song: submittedSong,
            }
          })
      })
  }, [data, scoredRoundIds, settings, viewedPlayer])

  const score = leaderboard.find(row => row.id === playerId)?.total || 0
  const submissionCount = submissions.length

  async function saveProfile(event) {
    event.preventDefault()
    const name = profile.name.trim()
    if (!name) return

    setSaving(true)
    setMessage('')

    const { data: updated, error } = await saveProfileName(player.id, name)

    setSaving(false)
    if (error || !updated) {
      setMessage('Could not save profile. The name may already be taken.')
      return
    }

    setPlayer(updated)
    setMessage('Profile saved.')
    setIsEditingProfile(false)
    reload()
  }

  async function clearProfilePicture() {
    setSaving(true)
    setMessage('')

    const { data: updated, error } = await clearProfilePictureUrl(player.id)

    setSaving(false)
    if (error || !updated) {
      setMessage('Could not remove profile picture.')
      return
    }

    setPlayer(updated)
    setProfile(p => ({ ...p, avatar_url: '' }))
    setMessage('Profile picture removed.')
    setIsEditingProfile(false)
    reload()
  }

  async function handlePictureUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setMessage('')

    try {
      const avatarUrl = await uploadProfilePicture(player.id, file)
      const { data: updated, error } = await saveProfilePictureUrl(player.id, avatarUrl)

      if (error || !updated) throw new Error('Uploaded, but could not save the profile picture.')

      setPlayer(updated)
      setProfile(p => ({ ...p, avatar_url: updated.avatar_url || '' }))
      setMessage('Profile picture uploaded.')
      setIsEditingProfile(false)
      reload()
    } catch (error) {
      setMessage(error.message || 'Could not upload that picture.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading player...</p>
      </main>
    )
  }

  if (!viewedPlayer) {
    return (
      <main className="page">
        <section className="empty-state">
          <h1>Player not found</h1>
          <p>This profile is not in the league.</p>
          <Link className="btn btn-secondary" to="/players">Back to players</Link>
        </section>
      </main>
    )
  }

  const displayPlayer = isSelf ? { ...viewedPlayer, ...player } : viewedPlayer
  const messageIsError = message.includes('Could not') || message.includes('Choose') || message.includes('under') || message.includes('Uploaded, but')

  function openProfileEditor() {
    setProfile({ name: player.name, avatar_url: player.avatar_url || '' })
    setMessage('')
    setIsEditingProfile(true)
  }

  function closeProfileEditor() {
    setProfile({ name: player.name, avatar_url: player.avatar_url || '' })
    setMessage('')
    setIsEditingProfile(false)
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Player profile</p>
          <h1>{displayPlayer.name}{isSelf ? ' (you)' : ''}</h1>
        </div>
        <Link className="btn btn-secondary" to="/players">Back to players</Link>
      </section>

      <section className={`player-profile-hero ${displayPlayer.active ? '' : 'inactive'}`}>
        {displayPlayer.avatar_url ? (
          <button
            type="button"
            className="profile-avatar-button"
            onClick={() => setIsAvatarLightboxOpen(true)}
            aria-label={`Enlarge ${displayPlayer.name}'s profile picture`}
          >
            <Avatar player={displayPlayer} size="hero" linkToProfile={false} />
          </button>
        ) : (
          <Avatar player={displayPlayer} size="hero" linkToProfile={false} />
        )}
        <div className="player-profile-main">
          <div>
            <p className="eyebrow">{isSelf ? 'My profile' : displayPlayer.active ? 'Active player' : 'Inactive player'}</p>
            <h2>{displayPlayer.name}</h2>
          </div>
          <div className="player-profile-tags">
            <span className="soft-tag">{displayPlayer.active ? 'Active' : 'Inactive'}</span>
            <span className="soft-tag">{submissions.length} submissions</span>
          </div>
          {isSelf && (
            <div className="profile-actions">
              {!isEditingProfile && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={openProfileEditor}>
                  Edit profile
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={logout} disabled={saving || uploading}>
                Log out
              </button>
              {message && <span className={messageIsError ? 'error-msg' : 'success-msg'}>{message}</span>}
            </div>
          )}
        </div>
        <div className="player-profile-stats" aria-label="Player stats">
          <span>
            <strong>{score}</strong>
            <small>pts</small>
          </span>
          <span>
            <strong>{submissionCount}</strong>
            <small>submissions</small>
          </span>
        </div>
      </section>

      {isAvatarLightboxOpen && displayPlayer.avatar_url && (
        <div className="profile-image-lightbox-backdrop" role="presentation" onMouseDown={() => setIsAvatarLightboxOpen(false)}>
          <section className="profile-image-lightbox" role="dialog" aria-modal="true" aria-label={`${displayPlayer.name}'s profile picture`} onMouseDown={event => event.stopPropagation()}>
            <button type="button" className="profile-image-lightbox-close" onClick={() => setIsAvatarLightboxOpen(false)} aria-label="Close enlarged profile picture">×</button>
            <img src={displayPlayer.avatar_url} alt={`${displayPlayer.name}'s profile picture`} />
          </section>
        </div>
      )}

      {isSelf && isEditingProfile && (
        <section className="profile-editor card">
          <div className="section-heading">
            <h2>Edit profile</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={closeProfileEditor} disabled={saving || uploading}>
              Close
            </button>
          </div>
          <form className="stack" onSubmit={saveProfile}>
            <div className="form-row">
              <label>
                <span>Name</span>
                <input value={profile.name} onChange={event => setProfile(p => ({ ...p, name: event.target.value }))} />
              </label>
              <label>
                <span>Upload profile picture</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handlePictureUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            {profile.avatar_url && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearProfilePicture}
                disabled={saving || uploading}
              >
                Remove profile picture
              </button>
            )}
            <div className="profile-editor-actions">
              <button type="button" className="btn btn-secondary" onClick={closeProfileEditor} disabled={saving || uploading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
                {uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="round-section">
        <div className="section-heading">
          <h2>Submissions</h2>
          <span className="soft-tag">{submissions.length}</span>
        </div>
        {submissions.length === 0 ? (
          <div className="empty-state compact">
            <p>No submissions yet.</p>
          </div>
        ) : (
          <div className="song-stack">
            {submissions.map(submission => (
              <PlayerSubmission key={submission.id} submission={submission} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function PlayerSubmission({ submission }) {
  const { entry, rank, round, song, weekStart } = submission

  return (
    <article className="song-card player-submission-card">
      <div className="results-row">
        <div className="song-card-main">
          <span className="song-number">{rank}</span>
          <div>
            <p className="eyebrow">Week of {formatPacificDate(weekStart)}</p>
            <div className="section-heading compact">
              <h2>{song?.title || entry.title}</h2>
              {entry.side !== null && entry.side !== undefined && (
                <span className={`side-tag side-${entry.side}`}>{groupLabel(entry.side)}</span>
              )}
              {entry.isDuplicate && <span className="soft-tag">Merged duplicate</span>}
            </div>
            <p>{song?.artist || entry.artist}{song?.album ? ` · ${song.album}` : ''}</p>
            <p className="muted">{round.theme_name}</p>
            <div className="song-actions">
              {song?.link && <a href={song.link} target="_blank" rel="noreferrer">Listen</a>}
              <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${song?.artist || entry.artist} ${song?.title || entry.title}`)}`} target="_blank" rel="noreferrer">YouTube</a>
            </div>
            {song?.submitter_note && <p className="note">{song.submitter_note}</p>}
            {entry.isDuplicate && song?.id !== entry.canonical_song_id && (
              <p className="merge-note">Scored with the merged entry: {entry.title} by {entry.artist}.</p>
            )}
          </div>
        </div>
        <div className="score-badge">
          <strong>{entry.totalPoints}</strong>
          <span>pts</span>
        </div>
      </div>
    </article>
  )
}
