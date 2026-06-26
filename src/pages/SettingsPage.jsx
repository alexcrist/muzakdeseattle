import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import useRealtimeData from '../hooks/useRealtimeData.js'
import { ADMIN_REALTIME_TABLES, EMPTY_ADMIN_DATA, fetchAdminData } from '../lib/data.js'
import { createDuplicateMerge, deleteDuplicateMerge, saveLeagueSettings, togglePlayerActive } from '../lib/mutations.js'
import { buildSongEntries, entrySubmitterText } from '../lib/scoring.js'
import {
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

const PHASE_OPTIONS = ['submission', 'voting', 'appreciation', 'off']
const ADMIN_UNLOCK_THRESHOLD = 86

export default function AdminPage() {
  const { player } = usePlayer()
  const { settings, setSettings } = useSettings()
  const { data, loading, reload } = useRealtimeData({
    channelName: 'admin-season-2',
    fetcher: fetchAdminData,
    initialData: EMPTY_ADMIN_DATA,
    tables: ADMIN_REALTIME_TABLES,
  })
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [form, setForm] = useState({
    league_name: settings?.league_name || 'Muzak de Seattle',
    season_label: settings?.season_label || 'Season 2',
    points_per_player: settings?.points_per_player || 10,
    schedule_start_date: settings?.schedule_start_date || getCurrentMonday(),
    weekly_phase_template: normalizeTemplate(settings?.weekly_phase_template || DEFAULT_WEEKLY_TEMPLATE),
  })
  const [message, setMessage] = useState('')

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
    const { saved, error } = await saveLeagueSettings({ form, rounds: data.rounds })

    if (error || !saved) {
      setMessage('Could not save settings.')
      return
    }

    setSettings(saved)
    setMessage('Settings saved.')
    reload()
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
        <strong>Hear be dragons</strong>
        <p>Past this sign are public controls that can move the season, merge songs, and bench players. Wake them only when you mean it.</p>
      </section>

      {!adminUnlocked ? (
        <AdminUnlock onUnlock={() => setAdminUnlocked(true)} />
      ) : (
        <>
          <DuplicateMergeTool settings={settings} data={data} onChanged={reload} />

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

          <PlayerStatusTool players={data.players} currentPlayerId={player.id} onChanged={reload} />
        </>
      )}

    </main>
  )
}

function AdminUnlock({ onUnlock }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  const [dragPercent, setDragPercent] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  function percentFromClientX(clientX) {
    const track = trackRef.current
    if (!track) return 0

    const rect = track.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    return Math.round((x / rect.width) * 100)
  }

  function updateDrag(clientX) {
    setDragPercent(percentFromClientX(clientX))
  }

  function beginDrag(event) {
    draggingRef.current = true
    setIsDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateDrag(event.clientX)
  }

  function moveDrag(event) {
    if (!draggingRef.current) return
    updateDrag(event.clientX)
  }

  function endDrag(event) {
    if (!draggingRef.current) return

    draggingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    const nextPercent = percentFromClientX(event.clientX)
    if (nextPercent >= ADMIN_UNLOCK_THRESHOLD) {
      setDragPercent(100)
      onUnlock()
      return
    }

    setIsDragging(false)
    setDragPercent(0)
  }

  function cancelDrag() {
    draggingRef.current = false
    setIsDragging(false)
    setDragPercent(0)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setDragPercent(value => Math.min(100, value + 20))
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setDragPercent(value => Math.max(0, value - 20))
    }

    if ((event.key === 'Enter' || event.key === ' ') && dragPercent >= ADMIN_UNLOCK_THRESHOLD) {
      event.preventDefault()
      onUnlock()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setDragPercent(0)
    }
  }

  return (
    <section className="card admin-unlock">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin gate</p>
          <h2>Drag to unlock</h2>
        </div>
        <span className="soft-tag">{dragPercent}%</span>
      </div>
      <div
        ref={trackRef}
        className={`drag-unlock ${isDragging ? 'dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Unlock admin controls"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={dragPercent}
        onKeyDown={handleKeyDown}
      >
        <div className="drag-unlock-fill" style={{ width: `${dragPercent}%` }} />
        <span className="drag-unlock-label">{dragPercent >= ADMIN_UNLOCK_THRESHOLD ? 'Release to enter' : 'Pull the record'}</span>
        <button
          type="button"
          className="drag-unlock-handle"
          style={{ left: `${dragPercent}%`, transform: `translate(${-dragPercent}%, -50%)` }}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          aria-label="Drag unlock handle"
          tabIndex={-1}
        >
          <span />
        </button>
      </div>
      <p className="muted">A short pull keeps the admin controls out of casual reach.</p>
    </section>
  )
}

function PlayerStatusTool({ players, currentPlayerId, onChanged }) {
  const [message, setMessage] = useState('')
  const active = players.filter(row => row.active)
  const inactive = players.filter(row => !row.active)

  async function toggleActive(row) {
    const { error } = await togglePlayerActive(row)

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

    const { error } = await createDuplicateMerge({
      roundId: selectedRoundId,
      songIds: selectedSongIds,
      canonicalSongId: canonical,
    })

    if (error) {
      setMessage(error.message || 'Could not create duplicate merge.')
      return
    }

    setSelectedSongIds([])
    setCanonicalSongId('')
    setMessage('Duplicate merge created.')
    onChanged()
  }

  async function deleteGroup(groupId) {
    await deleteDuplicateMerge(groupId)
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
