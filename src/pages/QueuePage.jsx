import { useEffect, useMemo, useState } from 'react'
import { usePlayer, useSettings } from '../App.jsx'
import Avatar from '../components/Avatar.jsx'
import { buildSongEntries, entrySubmitterText } from '../lib/scoring.js'
import { addDays, formatPacificDate, getLeagueContext, getRoundState, getRoundTiming, PHASES } from '../lib/schedule.js'
import { supabase } from '../lib/supabase.js'

async function fetchRoundsData() {
  const [
    { data: rounds },
    { data: songs },
    { data: votes },
    { data: groups },
    { data: groupSongs },
  ] = await Promise.all([
    supabase.from('rounds').select('*, players(id, name, avatar_url, avatar_color)').order('queue_position'),
    supabase.from('songs').select('*, players(id, name, avatar_url, avatar_color)').order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('duplicate_groups').select('*'),
    supabase.from('duplicate_group_songs').select('*'),
  ])

  return {
    rounds: rounds || [],
    songs: songs || [],
    votes: votes || [],
    groups: groups || [],
    groupSongs: groupSongs || [],
  }
}

export default function RoundsPage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const [data, setData] = useState({ rounds: [], songs: [], votes: [], groups: [], groupSongs: [] })
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ theme_name: '', theme_description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const next = await fetchRoundsData()
    setData(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('rounds-season-2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_groups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_group_songs' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const context = useMemo(() => getLeagueContext(data.rounds, settings), [data.rounds, settings])
  const roundRows = context.orderedRounds.map((round, index) => ({
    round,
    index,
    state: getRoundState(round, index, settings),
    timing: getRoundTiming(round, index, settings),
  }))
  const current = roundRows.filter(row => row.state === 'current')
  const upcoming = roundRows.filter(row => row.state === 'upcoming')
  const past = roundRows.filter(row => row.state === 'past').reverse()

  async function handleAdd(event) {
    event.preventDefault()
    if (!form.theme_name.trim() || !form.theme_description.trim()) {
      setError('Theme and description are required.')
      return
    }

    setSaving(true)
    setError('')
    const nextPosition = context.orderedRounds.length
    const weekStart = addDays(context.startDate, nextPosition * 7)

    const { error: insertError } = await supabase.from('rounds').insert({
      theme_name: form.theme_name.trim(),
      theme_description: form.theme_description.trim(),
      queue_position: nextPosition,
      submitted_by_player_id: player.id,
      week_start_date: weekStart,
      is_archived: false,
    })

    setSaving(false)
    if (insertError) {
      setError('Could not add that round.')
      return
    }

    setForm({ theme_name: '', theme_description: '' })
    setShowAdd(false)
    load()
  }

  async function moveRound(round, direction) {
    const future = upcoming.map(row => row.round)
    const currentIndex = future.findIndex(item => item.id === round.id)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= future.length) return

    const reordered = [...future]
    const [item] = reordered.splice(currentIndex, 1)
    reordered.splice(nextIndex, 0, item)

    const firstFuturePosition = upcoming[0].round.queue_position
    await Promise.all(reordered.map((itemRound, offset) => {
      const queuePosition = firstFuturePosition + offset
      return supabase
        .from('rounds')
        .update({
          queue_position: queuePosition,
          week_start_date: addDays(context.startDate, queuePosition * 7),
        })
        .eq('id', itemRound.id)
    }))
    load()
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading rounds...</p>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Queue and history</p>
          <h1>Rounds</h1>
          <p>One place for what is happening now, what is coming up, and what already happened.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowAdd(value => !value)}>
          {showAdd ? 'Close' : 'Add round'}
        </button>
      </section>

      {showAdd && (
        <section className="card add-round-card">
          <h2>New round</h2>
          <form className="stack" onSubmit={handleAdd}>
            <label>
              <span>Theme</span>
              <input
                value={form.theme_name}
                onChange={event => setForm(f => ({ ...f, theme_name: event.target.value }))}
                placeholder="Songs for a fake movie trailer"
                autoFocus
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={form.theme_description}
                onChange={event => setForm(f => ({ ...f, theme_description: event.target.value }))}
                rows={3}
                placeholder="Give everyone the prompt."
              />
            </label>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add to schedule'}
            </button>
          </form>
        </section>
      )}

      <RoundSection title="Now playing" rows={current}>
        {current.map(row => (
          <RoundCard key={row.round.id} row={row} settings={settings} currentPhase={context.phase} />
        ))}
      </RoundSection>

      <RoundSection title="Up next" rows={upcoming}>
        {upcoming.map((row, index) => (
          <RoundCard
            key={row.round.id}
            row={row}
            settings={settings}
            controls={
              <div className="round-controls">
                <button type="button" className="icon-btn" onClick={() => moveRound(row.round, -1)} disabled={index === 0}>↑</button>
                <button type="button" className="icon-btn" onClick={() => moveRound(row.round, 1)} disabled={index === upcoming.length - 1}>↓</button>
              </div>
            }
          />
        ))}
      </RoundSection>

      <RoundSection title="Record crate" rows={past}>
        {past.map(row => (
          <HistoryRound
            key={row.round.id}
            row={row}
            songs={data.songs.filter(song => song.round_id === row.round.id)}
            votes={data.votes.filter(vote => vote.round_id === row.round.id)}
            groups={data.groups.filter(group => group.round_id === row.round.id)}
            groupSongs={data.groupSongs}
          />
        ))}
      </RoundSection>
    </main>
  )
}

function RoundSection({ title, rows, children }) {
  return (
    <section className="round-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="soft-tag">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state compact">
          <p>No {title.toLowerCase()} rounds.</p>
        </div>
      ) : children}
    </section>
  )
}

function RoundCard({ row, currentPhase, controls }) {
  const { round, state, timing } = row
  const phaseLabel = state === 'current'
    ? PHASES[currentPhase]?.label || 'Current'
    : state === 'upcoming'
      ? 'Scheduled'
      : 'Past'

  return (
    <article className={`round-card ${state}`}>
      <div className="round-artifact" aria-hidden="true">
        <span />
        <strong>{state === 'current' ? 'PLAY' : state === 'upcoming' ? 'NEXT' : 'FILE'}</strong>
        <span />
      </div>
      <div className="round-card-main">
        <span className={`phase-pill phase-${state === 'current' ? currentPhase : state === 'upcoming' ? 'off' : 'appreciation'}`}>{phaseLabel}</span>
        <h3>{round.theme_name}</h3>
        <p>{round.theme_description}</p>
        <div className="round-meta">
          <span>Week of {formatPacificDate(timing.weekStart)}</span>
          {round.players && (
            <span>
              <Avatar player={round.players} size="xs" />
              Added by {round.players.name}
            </span>
          )}
        </div>
      </div>
      {controls}
    </article>
  )
}

function HistoryRound({ row, songs, votes, groups, groupSongs }) {
  const groupIds = new Set(groups.map(group => group.id))
  const entries = buildSongEntries({
    songs,
    votes,
    duplicateGroups: groups,
    groupSongs: groupSongs.filter(item => groupIds.has(item.group_id)),
  })
  const top = entries.slice(0, 4)

  return (
    <details className="history-round">
      <summary>
        <span>
          <strong>{row.round.theme_name}</strong>
          <small>Week of {formatPacificDate(row.timing.weekStart)}</small>
        </span>
        <span className="soft-tag">{entries.length} songs</span>
      </summary>
      <div className="history-list">
        {top.length === 0 ? (
          <p className="muted">No songs were submitted.</p>
        ) : top.map((entry, index) => (
          <div className="history-row" key={entry.id}>
            <span className="song-number">{index + 1}</span>
            <div>
              <strong>{entry.title}</strong>
              <p>{entry.artist} · {entrySubmitterText(entry)}</p>
            </div>
            <span className="score-mini">{entry.totalPoints}</span>
          </div>
        ))}
      </div>
    </details>
  )
}
