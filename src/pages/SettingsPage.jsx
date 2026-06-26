import { useEffect, useMemo, useState } from 'react'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import { buildSongEntries, entrySubmitterText } from '../lib/scoring.js'
import {
  addDays,
  DAY_KEYS,
  DAY_LABELS,
  DEFAULT_WEEKLY_TEMPLATE,
  formatPacificDate,
  getCurrentMonday,
  getLeagueContext,
  getRoundState,
  normalizeTemplate,
  PHASES,
} from '../lib/schedule.js'
import { supabase } from '../lib/supabase.js'

const PHASE_OPTIONS = ['submission', 'voting', 'appreciation', 'off']

async function fetchAdminData() {
  const [
    { data: rounds },
    { data: songs },
    { data: votes },
    { data: groups },
    { data: groupSongs },
    { data: players },
  ] = await Promise.all([
    supabase.from('rounds').select('*').order('queue_position'),
    supabase.from('songs').select('*, players(id, name, avatar_url, avatar_color)').order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('duplicate_groups').select('*').order('created_at'),
    supabase.from('duplicate_group_songs').select('*'),
    supabase.from('players').select('*').order('name'),
  ])

  return {
    rounds: rounds || [],
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: groupSongs || [],
    players: players || [],
  }
}

export default function AdminPage() {
  const { player } = usePlayer()
  const { settings, setSettings } = useSettings()
  const [data, setData] = useState({ rounds: [], songs: [], votes: [], groups: [], groupSongs: [], players: [] })
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    league_name: settings?.league_name || 'Muzak de Seattle',
    season_label: settings?.season_label || 'Season 2',
    points_per_player: settings?.points_per_player || 10,
    schedule_start_date: settings?.schedule_start_date || getCurrentMonday(),
    weekly_phase_template: normalizeTemplate(settings?.weekly_phase_template || DEFAULT_WEEKLY_TEMPLATE),
  })
  const [message, setMessage] = useState('')

  async function load() {
    const next = await fetchAdminData()
    setData(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('admin-season-2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_groups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_group_songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (!settings) return
    setForm({
      league_name: settings.league_name || 'Muzak de Seattle',
      season_label: settings.season_label || 'Season 2',
      points_per_player: settings.points_per_player || 10,
      schedule_start_date: settings.schedule_start_date || getCurrentMonday(),
      weekly_phase_template: normalizeTemplate(settings.weekly_phase_template),
    })
  }, [settings])

  async function saveSettings(event) {
    event.preventDefault()
    const payload = {
      id: 1,
      league_name: form.league_name.trim() || 'Muzak de Seattle',
      season_label: form.season_label.trim() || 'Season 2',
      points_per_player: Math.max(1, Number(form.points_per_player) || 10),
      schedule_start_date: form.schedule_start_date || getCurrentMonday(),
      weekly_phase_template: normalizeTemplate(form.weekly_phase_template),
      timezone: 'America/Los_Angeles',
    }

    const { data: saved, error } = await supabase
      .from('league_settings')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single()

    if (error || !saved) {
      setMessage('Could not save settings.')
      return
    }

    await Promise.all(data.rounds.map((round, index) => (
      supabase
        .from('rounds')
        .update({ week_start_date: addDays(payload.schedule_start_date, index * 7) })
        .eq('id', round.id)
    )))

    setSettings(saved)
    setMessage('Settings saved.')
    load()
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading admin...</p>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Open admin zone</p>
          <h1>Admin</h1>
          <p>Everyone can change these controls. Move carefully.</p>
        </div>
      </section>

      <section className="warning-panel loud">
        <strong>No auth, no undo button</strong>
        <p>This league intentionally trusts the room. Settings, duplicate song merges, and player status are public controls.</p>
      </section>

      <DuplicateMergeTool settings={settings} data={data} onChanged={load} />

      <section className="card admin-settings">
        <div className="section-heading">
          <h2>League settings</h2>
          {message && <span className={message.includes('Could not') ? 'error-msg' : 'success-msg'}>{message}</span>}
        </div>

        <form className="stack" onSubmit={saveSettings}>
          <div className="form-row">
            <label>
              <span>League name</span>
              <input value={form.league_name} onChange={event => setForm(f => ({ ...f, league_name: event.target.value }))} />
            </label>
            <label>
              <span>Season label</span>
              <input value={form.season_label} onChange={event => setForm(f => ({ ...f, season_label: event.target.value }))} />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Points per player</span>
              <input
                type="number"
                min="1"
                max="100"
                value={form.points_per_player}
                onChange={event => setForm(f => ({ ...f, points_per_player: event.target.value }))}
              />
            </label>
            <label>
              <span>Schedule start Monday</span>
              <input
                type="date"
                value={form.schedule_start_date}
                onChange={event => setForm(f => ({ ...f, schedule_start_date: event.target.value }))}
              />
            </label>
          </div>

          <ScheduleEditor
            template={form.weekly_phase_template}
            onChange={weekly_phase_template => setForm(f => ({ ...f, weekly_phase_template }))}
          />

          <button type="submit" className="btn btn-primary">Save settings</button>
        </form>
      </section>

      <PlayerStatusTool players={data.players} currentPlayerId={player.id} onChanged={load} />

    </main>
  )
}

function PlayerStatusTool({ players, currentPlayerId, onChanged }) {
  const [message, setMessage] = useState('')
  const active = players.filter(row => row.active)
  const inactive = players.filter(row => !row.active)

  async function toggleActive(row) {
    const { error } = await supabase
      .from('players')
      .update({ active: !row.active })
      .eq('id', row.id)

    if (error) {
      setMessage('Could not update player status.')
      return
    }

    setMessage(`${row.name} ${row.active ? 'deactivated' : 'reactivated'}.`)
    onChanged()
  }

  return (
    <section className="card player-status-tool">
      <div className="section-heading">
        <h2>Player controls</h2>
        {message && <span className={message.includes('Could not') ? 'error-msg' : 'success-msg'}>{message}</span>}
      </div>
      <div className="admin-player-columns">
        <AdminPlayerList
          title="Active"
          players={active}
          currentPlayerId={currentPlayerId}
          actionLabel="Deactivate"
          onToggle={toggleActive}
        />
        <AdminPlayerList
          title="Inactive"
          players={inactive}
          currentPlayerId={currentPlayerId}
          actionLabel="Reactivate"
          onToggle={toggleActive}
        />
      </div>
    </section>
  )
}

function AdminPlayerList({ title, players, currentPlayerId, actionLabel, onToggle }) {
  return (
    <div className="admin-player-list">
      <div className="section-heading compact">
        <h3>{title}</h3>
        <span className="soft-tag">{players.length}</span>
      </div>
      {players.length === 0 ? (
        <div className="empty-state compact">
          <p>No {title.toLowerCase()} players.</p>
        </div>
      ) : (
        <div className="player-list">
          {players.map(player => {
            const isSelf = player.id === currentPlayerId
            return (
              <div className={`admin-player-row ${player.active ? '' : 'inactive'}`} key={player.id}>
                <Avatar player={player} />
                <div>
                  <strong>{player.name}{isSelf ? ' (you)' : ''}</strong>
                  <p>{player.active ? 'Active' : 'Inactive'}</p>
                </div>
                {isSelf ? (
                  <span className="soft-tag">Current</span>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onToggle(player)}>
                    {actionLabel}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ScheduleEditor({ template, onChange }) {
  const normalized = normalizeTemplate(template)

  function setDay(day, phase) {
    onChange({ ...normalized, [day]: phase })
  }

  return (
    <div className="schedule-editor">
      <div className="section-heading compact">
        <h3>Weekly phase calendar</h3>
        <span className="soft-tag">Pacific time</span>
      </div>
      <div className="day-grid">
        {DAY_KEYS.map(day => (
          <div className="day-tile" key={day}>
            <strong>{DAY_LABELS[day]}</strong>
            <div className="segmented">
              {PHASE_OPTIONS.map(phase => (
                <button
                  type="button"
                  key={phase}
                  className={normalized[day] === phase ? 'active' : ''}
                  onClick={() => setDay(day, phase)}
                >
                  {PHASES[phase].shortLabel}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DuplicateMergeTool({ settings, data, onChanged }) {
  const context = useMemo(() => getLeagueContext(data.rounds, settings), [data.rounds, settings])
  const eligibleRounds = context.orderedRounds.filter((round, index) => {
    const state = getRoundState(round, index, settings)
    return state === 'past' || (state === 'current' && context.phase === 'appreciation')
  }).reverse()
  const defaultRound = eligibleRounds[0]
  const [selectedRoundId, setSelectedRoundId] = useState(defaultRound?.id || '')
  const [selectedSongIds, setSelectedSongIds] = useState([])
  const [canonicalSongId, setCanonicalSongId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!eligibleRounds.some(round => round.id === selectedRoundId)) {
      setSelectedRoundId(defaultRound?.id || '')
      setSelectedSongIds([])
      setCanonicalSongId('')
    }
  }, [defaultRound?.id, eligibleRounds, selectedRoundId])

  const selectedRound = data.rounds.find(round => round.id === selectedRoundId)
  const roundSongs = data.songs.filter(song => song.round_id === selectedRoundId)
  const roundVotes = data.votes.filter(vote => vote.round_id === selectedRoundId)
  const roundGroups = data.groups.filter(group => group.round_id === selectedRoundId)
  const groupIds = new Set(roundGroups.map(group => group.id))
  const roundGroupSongs = data.groupSongs.filter(row => groupIds.has(row.group_id))
  const groupedSongIds = new Set(roundGroupSongs.map(row => row.song_id))
  const entries = buildSongEntries({ songs: roundSongs, votes: roundVotes, duplicateGroups: roundGroups, groupSongs: roundGroupSongs })

  function toggleSong(songId) {
    setSelectedSongIds(ids => {
      const next = ids.includes(songId) ? ids.filter(id => id !== songId) : [...ids, songId]
      if (!next.includes(canonicalSongId)) setCanonicalSongId(next[0] || '')
      return next
    })
  }

  async function createMerge() {
    if (selectedSongIds.length < 2) {
      setMessage('Pick at least two songs to merge.')
      return
    }

    const canonical = canonicalSongId && selectedSongIds.includes(canonicalSongId)
      ? canonicalSongId
      : selectedSongIds[0]

    const { data: group, error } = await supabase
      .from('duplicate_groups')
      .insert({
        round_id: selectedRoundId,
        canonical_song_id: canonical,
        label: 'Duplicate submission',
      })
      .select()
      .single()

    if (error || !group) {
      setMessage('Could not create duplicate merge.')
      return
    }

    await supabase.from('duplicate_group_songs').insert(
      selectedSongIds.map(songId => ({ group_id: group.id, song_id: songId }))
    )

    setSelectedSongIds([])
    setCanonicalSongId('')
    setMessage('Duplicate merge created.')
    onChanged()
  }

  async function deleteGroup(groupId) {
    await supabase.from('duplicate_groups').delete().eq('id', groupId)
    setMessage('Duplicate merge removed.')
    onChanged()
  }

  return (
    <section className="card duplicate-tool">
      <div className="section-heading">
        <h2>Duplicate song merge</h2>
        {message && <span className={message.includes('Could not') || message.includes('Pick') ? 'error-msg' : 'success-msg'}>{message}</span>}
      </div>
      <p className="muted">Use this after voting. Votes stay intact; results recalculate with self-votes removed and courtesy points added.</p>

      <label>
        <span>Round</span>
        <select
          value={selectedRoundId}
          onChange={event => {
            setSelectedRoundId(event.target.value)
            setSelectedSongIds([])
            setCanonicalSongId('')
            setMessage('')
          }}
        >
          {eligibleRounds.map(round => (
            <option key={round.id} value={round.id}>{round.theme_name}</option>
          ))}
        </select>
      </label>

      {eligibleRounds.length === 0 ? (
        <div className="empty-state compact">
          <p>Duplicate merging opens once a round reaches appreciation.</p>
        </div>
      ) : !selectedRound ? (
        <div className="empty-state compact">
          <p>Add a round before merging duplicates.</p>
        </div>
      ) : (
        <>
          <div className="merge-grid">
            <div>
              <h3>Songs</h3>
              <div className="merge-song-list">
                {roundSongs.map(song => {
                  const disabled = groupedSongIds.has(song.id)
                  const selected = selectedSongIds.includes(song.id)
                  return (
                    <button
                      type="button"
                      key={song.id}
                      className={`merge-song ${selected ? 'selected' : ''}`}
                      onClick={() => toggleSong(song.id)}
                      disabled={disabled}
                    >
                      <span>
                        <strong>{song.title}</strong>
                        <small>{song.artist} · {song.players?.name || 'Unknown player'}</small>
                      </span>
                      {disabled ? <em>Already merged</em> : selected ? <em>Selected</em> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <h3>Canonical display song</h3>
              <select value={canonicalSongId} onChange={event => setCanonicalSongId(event.target.value)} disabled={selectedSongIds.length === 0}>
                <option value="">Use first selected</option>
                {selectedSongIds.map(songId => {
                  const song = roundSongs.find(item => item.id === songId)
                  return song ? <option key={song.id} value={song.id}>{song.title} · {song.artist}</option> : null
                })}
              </select>
              <button type="button" className="btn btn-primary" onClick={createMerge} disabled={selectedSongIds.length < 2}>
                Merge selected songs
              </button>
            </div>
          </div>

          {roundGroups.length > 0 && (
            <div className="existing-merges">
              <h3>Existing merges</h3>
              {entries.filter(entry => entry.isDuplicate).map(entry => (
                <div className="existing-merge" key={entry.id}>
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entrySubmitterText(entry)} · {entry.totalPoints} pts total</p>
                    <p>{entry.votePoints} vote pts + {entry.courtesyPoints} courtesy pts{entry.ineligiblePoints ? ` · ${entry.ineligiblePoints} self-vote pts removed` : ''}</p>
                  </div>
                  <div className="avatar-cluster">
                    {entry.submitters.map(submitter => <Avatar key={submitter.id} player={submitter} size="sm" />)}
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => deleteGroup(entry.group_id)}>
                    Remove merge
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
