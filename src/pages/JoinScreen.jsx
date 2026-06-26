import { useEffect, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import { fetchJoinData, fetchPlayerByName } from '../lib/data.js'
import { createPlayer } from '../lib/mutations.js'

const AVATAR_COLORS = ['#ff7ab6', '#65d6ff', '#ffe66d', '#a78bfa', '#6ee7b7', '#ff9f6e']

function randomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

export default function JoinScreen({ onJoin }) {
  const [name, setName] = useState('')
  const [players, setPlayers] = useState([])
  const [leagueName, setLeagueName] = useState('Muzak')
  const [seasonLabel, setSeasonLabel] = useState('Season 2')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { players: playersData, settings: settingsData } = await fetchJoinData()

      setPlayers(playersData)
      if (settingsData?.league_name) setLeagueName(settingsData.league_name)
      if (settingsData?.season_label) setSeasonLabel(settingsData.season_label)
    }
    load()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')

    const existing = await fetchPlayerByName(trimmed)

    if (existing) {
      if (!existing.active) {
        setError('That profile is inactive.')
        setLoading(false)
        return
      }
      onJoin(existing)
      return
    }

    const { data, error: insertError } = await createPlayer({
      name: trimmed,
      avatarColor: randomAvatarColor(),
    })

    if (insertError || !data) {
      setError('That profile could not be created. Try a slightly different name.')
      setLoading(false)
      return
    }

    onJoin(data)
  }

  return (
    <main className="join-screen">
      <section className="join-hero">
        <span className="bubble-mark">M2</span>
        <p className="eyebrow">{seasonLabel}</p>
        <h1>{leagueName}</h1>
        <p className="join-copy">Pick your profile and get to the songs.</p>
      </section>

      <section className="join-panel">
        {players.length > 0 && (
          <div className="join-section">
            <h2>Already here</h2>
            <div className="profile-grid">
              {players.map(player => (
                <button
                  type="button"
                  key={player.id}
                  className="profile-choice"
                  onClick={() => onJoin(player)}
                >
                  <Avatar player={player} />
                  <span>{player.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="join-section">
          <h2>New profile</h2>
          <form onSubmit={handleSubmit} className="stack">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !name.trim()}>
              {loading ? 'Joining...' : 'Enter Muzak'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
