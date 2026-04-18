import { FLAVOR } from '../../lib/flavor.js'

export default function WaitingState() {
  return (
    <div className="page">
      <div className="empty-state">
        <div className="emoji">🎵</div>
        <h3 style={{ marginBottom: '0.5rem' }}>No Active Round</h3>
        {/* FLAVOR TEXT: Waiting for next round */}
        <p className="flavor-text" style={{ maxWidth: '380px', margin: '0 auto' }}>
          {FLAVOR.WAITING_FOR_ROUND}
        </p>
        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text3)' }}>
          Head to <strong style={{ color: 'var(--text2)' }}>Round Queue</strong> to add the next round.
        </p>
      </div>
    </div>
  )
}
