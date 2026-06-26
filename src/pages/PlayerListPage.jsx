import { useEffect, useMemo, useState } from 'react'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import { uploadProfilePicture } from '../lib/profilePictures.js'
import { buildLeaderboard } from '../lib/scoring.js'
import { getScoredRoundIds } from '../lib/schedule.js'
import { supabase } from '../lib/supabase.js'

async function fetchPlayersData() {
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
    supabase.from('songs').select('*, players(id, name, avatar_url, avatar_color)'),
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

export default function PlayerListPage() {
  const { player, setPlayer } = usePlayer()
  const { settings } = useSettings()
  const [data, setData] = useState({ players: [], rounds: [], songs: [], votes: [], groups: [], groupSongs: [] })
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState({ name: player.name, avatar_url: player.avatar_url || '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    const next = await fetchPlayersData()
    setData(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('players-season-2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_groups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_group_songs' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    setProfile({ name: player.name, avatar_url: player.avatar_url || '' })
  }, [player.id, player.name, player.avatar_url])

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
  const scoreMap = Object.fromEntries(leaderboard.map(row => [row.id, row.total]))
  const submissionCounts = data.songs.reduce((counts, song) => {
    counts[song.player_id] = (counts[song.player_id] || 0) + 1
    return counts
  }, {})

  async function saveProfile(event) {
    event.preventDefault()
    const name = profile.name.trim()
    if (!name) return

    setSaving(true)
    setMessage('')

    const { data: updated, error } = await supabase
      .from('players')
      .update({
        name,
      })
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

  async function toggleActive(row) {
    await supabase.from('players').update({ active: !row.active }).eq('id', row.id)
    load()
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading players...</p>
      </main>
    )
  }

  const active = data.players.filter(row => row.active)
  const inactive = data.players.filter(row => !row.active)

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Profiles</p>
          <h1>Players</h1>
          <p>{active.length} active · {inactive.length} inactive</p>
        </div>
      </section>

      <section className="profile-editor card">
        <div className="profile-preview">
          <Avatar player={{ ...player, ...profile }} size="xl" />
          <div>
            <p className="eyebrow">My profile</p>
            <h2>{profile.name || player.name}</h2>
          </div>
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
          {message && <p className={message.includes('Could not') || message.includes('Choose') || message.includes('under') || message.includes('Uploaded, but') ? 'error-msg' : 'success-msg'}>{message}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            {uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save profile'}
          </button>
        </form>
      </section>

      <section className="warning-panel">
        <strong>Open admin controls</strong>
        <p>Anyone can deactivate or reactivate players. Historical songs, votes, and comments remain intact.</p>
      </section>

      <PlayerSection
        title="Active players"
        players={active}
        currentPlayerId={player.id}
        scoreMap={scoreMap}
        submissionCounts={submissionCounts}
        onToggle={toggleActive}
      />

      {inactive.length > 0 && (
        <PlayerSection
          title="Inactive players"
          players={inactive}
          currentPlayerId={player.id}
          scoreMap={scoreMap}
          submissionCounts={submissionCounts}
          onToggle={toggleActive}
        />
      )}
    </main>
  )
}

function PlayerSection({ title, players, currentPlayerId, scoreMap, submissionCounts, onToggle }) {
  return (
    <section className="round-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="soft-tag">{players.length}</span>
      </div>
      <div className="player-list">
        {players.map(player => (
          <article className={`player-row ${player.active ? '' : 'inactive'}`} key={player.id}>
            <Avatar player={player} />
            <div>
              <h3>{player.name}{player.id === currentPlayerId ? ' (you)' : ''}</h3>
              <p>{submissionCounts[player.id] || 0} submissions · {scoreMap[player.id] || 0} pts</p>
            </div>
            {player.id !== currentPlayerId && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onToggle(player)}>
                {player.active ? 'Deactivate' : 'Reactivate'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
