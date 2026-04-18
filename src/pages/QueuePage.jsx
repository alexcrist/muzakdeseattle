import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase.js'
import { usePlayer, useSettings } from '../App.jsx'
import { formatDeadline } from '../lib/rounds.js'

// ── Sortable queue item ─────────────────────────────────────────────────────
function SortableRoundItem({ round, index, pendingCount, onPositionInput }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: round.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isLocked = round.status === 'complete' || round.status === 'submission' || round.status === 'voting'

  let label = null
  if (round.status === 'complete')    label = <span className="badge badge-complete">Complete</span>
  else if (round.status === 'submission') label = <span className="badge badge-submission">Active — Submissions</span>
  else if (round.status === 'voting') label = <span className="badge badge-voting">Active — Voting</span>
  else if (index === 0)               label = <span className="badge badge-voting" style={{ background: '#1a2a3a', color: 'var(--accent3)', borderColor: '#2a4a6a' }}>Up Next</span>
  else                                label = <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text3)' }}>#{index + 1}</span>

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`queue-item ${isDragging ? 'dragging' : ''} ${isLocked ? 'locked' : ''}`}
    >
      {/* Drag handle — only for reorderable items */}
      {!isLocked ? (
        <span className="drag-handle" {...attributes} {...listeners}>⠿</span>
      ) : (
        <span style={{ width: '1.5rem', display: 'inline-block' }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
          {label}
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', letterSpacing: '0.04em', color: 'var(--text)' }}>
            {round.theme_name}
          </span>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {round.theme_description}
        </p>
        {round.status === 'submission' && round.submission_deadline && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
            Submissions close: {formatDeadline(round.submission_deadline)}
          </p>
        )}
        {round.status === 'voting' && round.voting_deadline && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
            Voting closes: {formatDeadline(round.voting_deadline)}
          </p>
        )}
        {round.submitted_by_name && (
          <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: '0.15rem' }}>
            Added by <span style={{ color: 'var(--accent3)' }}>{round.submitted_by_name}</span>
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main Queue Page ─────────────────────────────────────────────────────────
export default function QueuePage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    theme_name: '',
    theme_description: '',
    custom_sub_hours: '',
    custom_vote_hours: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function loadRounds() {
    const { data } = await supabase
      .from('rounds')
      .select('*, players(name)')
      .order('queue_position', { ascending: true })

    const enriched = (data || []).map(r => ({
      ...r,
      submitted_by_name: r.players?.name || null,
    }))
    setRounds(enriched)
    setLoading(false)
  }

  useEffect(() => {
    loadRounds()
    const sub = supabase
      .channel('rounds-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, loadRounds)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  // Split into locked (complete/active) and pending (reorderable)
  const locked = rounds.filter(r => r.status === 'complete' || r.status === 'submission' || r.status === 'voting')
  const pending = rounds.filter(r => r.status === 'pending')

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = pending.findIndex(r => r.id === active.id)
    const newIndex = pending.findIndex(r => r.id === over.id)
    const reordered = arrayMove(pending, oldIndex, newIndex)

    // Optimistic update
    setRounds([...locked, ...reordered])

    // Persist new positions (pending items start after all locked items)
    const basePosition = locked.length
    await Promise.all(
      reordered.map((r, i) =>
        supabase.from('rounds').update({ queue_position: basePosition + i }).eq('id', r.id)
      )
    )
  }

  async function handlePositionInput(roundId, newIndex) {
    const clamped = Math.max(0, Math.min(newIndex, pending.length - 1))
    const oldIndex = pending.findIndex(r => r.id === roundId)
    if (oldIndex === clamped) return

    const reordered = arrayMove(pending, oldIndex, clamped)
    setRounds([...locked, ...reordered])

    const basePosition = locked.length
    await Promise.all(
      reordered.map((r, i) =>
        supabase.from('rounds').update({ queue_position: basePosition + i }).eq('id', r.id)
      )
    )
  }

  async function handleAddRound(e) {
    e.preventDefault()
    if (!form.theme_name.trim() || !form.theme_description.trim()) {
      setError('Theme name and description are required.')
      return
    }
    setSaving(true)
    setError('')

    // Determine deadlines if there's an active submission round
    // (for now, pending rounds inherit defaults; deadlines are set when they go active)
    const nextPosition = rounds.length

    const { error: err } = await supabase.from('rounds').insert({
      theme_name: form.theme_name.trim(),
      theme_description: form.theme_description.trim(),
      queue_position: nextPosition,
      status: 'pending',
      submitted_by_player_id: player.id,
      // Store custom overrides in submission/voting deadline fields temporarily as hours
      // They'll be applied when the round goes active in tickRoundTransitions
      // We store custom hours in a note field via description suffix for simplicity
      // Actually: store as negative numbers to signal "custom hours" pre-activation
    })

    if (err) {
      setError('Failed to add round. Try again.')
      setSaving(false)
      return
    }

    setForm({ theme_name: '', theme_description: '', custom_sub_hours: '', custom_vote_hours: '' })
    setShowAddForm(false)
    setSaving(false)
    setSuccess('Round added to the queue!')
    setTimeout(() => setSuccess(''), 3000)
  }

  if (loading) return <div className="page"><p style={{ color: 'var(--text3)' }}>loading...</p></div>

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2>Round Queue</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginTop: '0.2rem' }}>
            Drag or use the number box to reorder upcoming rounds.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddForm(s => !s)}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Round'}
        </button>
      </div>

      {success && <p className="success-msg" style={{ marginBottom: '1rem' }}>{success}</p>}

      {/* Add round form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(232,197,71,0.3)' }}>
          <h3 style={{ marginBottom: '1rem' }}>New Round</h3>
          <form onSubmit={handleAddRound}>
            <div className="form-group">
              <label>Theme Name *</label>
              <input
                type="text"
                value={form.theme_name}
                onChange={e => setForm(f => ({ ...f, theme_name: e.target.value }))}
                placeholder="e.g. Songs that got you through a breakup"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Theme Description *</label>
              <textarea
                value={form.theme_description}
                onChange={e => setForm(f => ({ ...f, theme_description: e.target.value }))}
                placeholder="Give players some context or rules for this theme..."
                rows={3}
              />
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add to Queue →'}
            </button>
          </form>
        </div>
      )}

      {/* Locked rounds (complete + active) */}
      {locked.map((round, i) => (
        <SortableRoundItem
          key={round.id}
          round={round}
          index={i}
          pendingCount={0}
          onPositionInput={() => {}}
        />
      ))}

      {/* Pending rounds — sortable */}
      {pending.length === 0 && (
        <div className="empty-state" style={{ padding: '2rem 1rem' }}>
          <div className="emoji">📭</div>
          <p>No rounds in the queue yet.</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginTop: '0.25rem' }}>
            Add one above to keep the league going.
          </p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={pending.map(r => r.id)}
          strategy={verticalListSortingStrategy}
        >
          {pending.map((round, i) => (
            <SortableRoundItem
              key={round.id}
              round={round}
              index={i}
              pendingCount={pending.length}
              onPositionInput={handlePositionInput}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
