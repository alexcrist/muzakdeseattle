import { useState } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { togglePlayerActive } from '../../lib/mutations.js'

export default function PlayerStatusTool({ players, currentPlayerId, onChanged }) {
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
