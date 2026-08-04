import Avatar from './Avatar.jsx'

export default function SideRoster({ players = [], submittedIds, currentPlayerId, muted = false }) {
  if (players.length === 0) {
    return <p className="muted">Nobody here yet.</p>
  }

  return (
    <div className={`mini-roster ${muted ? 'roster-muted' : ''}`}>
      {players.map(player => (
        <span
          key={player.id}
          className={`roster-dot ${submittedIds?.has(player.id) ? 'done' : ''} ${player.id === currentPlayerId ? 'is-you' : ''}`}
        >
          <Avatar player={player} size="sm" />
          <span>{player.name}{player.id === currentPlayerId ? ' (you)' : ''}</span>
        </span>
      ))}
    </div>
  )
}
