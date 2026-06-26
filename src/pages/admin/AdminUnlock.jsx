import { useRef, useState } from 'react'

const ADMIN_UNLOCK_THRESHOLD = 86

export default function AdminUnlock({ onUnlock }) {
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
