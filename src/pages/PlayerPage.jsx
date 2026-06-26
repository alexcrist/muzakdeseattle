import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import { uploadProfilePicture } from '../lib/profilePictures.js'
import { buildLeaderboard, buildSongEntries } from '../lib/scoring.js'
import { formatPacificDate, getRoundWeekStart, getScoredRoundIds, sortedRounds } from '../lib/schedule.js'
import { supabase } from '../lib/supabase.js'

async function fetchPlayerPageData() {
  const [
    { data: players },
    { data: rounds },
    { data: songs },
    { data: votes },
    { data: groups },
    { data: groupSongs },
  ] = await Promise.all([
    supabase.from('players').select('*').order('name'),
    supabase.from('rounds').select('*').order('queue_position'),
    supabase.from('songs').select('*, players(id, name, avatar_url, avatar_color)').order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('duplicate_groups').select('*'),
    supabase.from('duplicate_group_songs').select('*'),
  ])

  return {
    players: players || [],
    rounds: rounds || [],
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: groupSongs || [],
  }
}

export default function PlayerPage() {
  const { playerId } = useParams()
  const { player, setPlayer } = usePlayer()
  const { settings } = useSettings()
  const [data, setData] = useState({ players: [], rounds: [], songs: [], votes: [], groups: [], groupSongs: [] })
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState({ name: player.name, avatar_url: player.avatar_url || '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    const next = await fetchPlayerPageData()
    setData(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`player-page-season-2-${playerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_groups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_group_songs' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [playerId])

  useEffect(() => {
    if (playerId !== player.id) return
    setProfile({ name: player.name, avatar_url: player.avatar_url || '' })
  }, [playerId, player.id, player.name, player.avatar_url])

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
        const entries = buildSongEntries({
          songs: roundSongs,
          votes: roundVotes,
          duplicateGroups: roundGroups,
          groupSongs: roundGroupSongs,
        })

        return entries
          .map((entry, index) => ({ entry, rank: index + 1 }))
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

    const { data: updated, error } = await supabase
      .from('players')
      .update({ name })
      .eq('id', player.id)
      .select()
      .single()

    setSaving(false)
    if (error || !updated) {
      setMessage('Could not save profile. The name may already be taken.')
      return
    }

    setPlayer(updated)
    setMessage('Profile saved.')
    load()
  }

  async function clearProfilePicture() {
    setSaving(true)
    setMessage('')

    const { data: updated, error } = await supabase
      .from('players')
      .update({ avatar_url: null })
      .eq('id', player.id)
      .select()
      .single()

    setSaving(false)
    if (error || !updated) {
      setMessage('Could not remove profile picture.')
      return
    }

    setPlayer(updated)
    setProfile(p => ({ ...p, avatar_url: '' }))
    setMessage('Profile picture removed.')
    load()
  }

  async function handlePictureUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setMessage('')

    try {
      const avatarUrl = await uploadProfilePicture(player.id, file)
      const { data: updated, error } = await supabase
        .from('players')
        .update({ avatar_url: avatarUrl })
        .eq('id', player.id)
        .select()
        .single()

      if (error || !updated) throw new Error('Uploaded, but could not save the profile picture.')

      setPlayer(updated)
      setProfile(p => ({ ...p, avatar_url: updated.avatar_url || '' }))
      setMessage('Profile picture uploaded.')
      load()
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
        <Avatar player={displayPlayer} size="hero" />
        <div className="player-profile-main">
          <div>
            <p className="eyebrow">{isSelf ? 'My profile' : displayPlayer.active ? 'Active player' : 'Inactive player'}</p>
            <h2>{displayPlayer.name}</h2>
          </div>
          <div className="player-profile-tags">
            <span className="soft-tag">{displayPlayer.active ? 'Active' : 'Inactive'}</span>
            <span className="soft-tag">{submissions.length} submissions</span>
          </div>
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

      {isSelf && (
        <section className="profile-editor card">
          <div className="section-heading">
            <h2>Edit profile</h2>
            {message && <span className={message.includes('Could not') || message.includes('Choose') || message.includes('under') || message.includes('Uploaded, but') ? 'error-msg' : 'success-msg'}>{message}</span>}
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
            <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
              {uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save profile'}
            </button>
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
