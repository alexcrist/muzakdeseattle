import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { FLAVOR } from '../lib/flavor.js'

export default function JoinScreen({ onJoin }) {
  const [name, setName] = useState('')
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [leagueName, setLeagueName] = useState('Music League')

  useEffect(() => {
    // Only show ACTIVE players on join screen
    supabase
      .from('players')
      .select('id, name, active')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setPlayers(data || []))

    supabase
      .from('league_settings')
      .select('league_name')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data?.league_name) setLeagueName(data.league_name)
      })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')

    // Check if player already exists (active or inactive)
    const { data: existing } = await supabase
      .from('players')
      .select('*')
      .ilike('name', trimmed)
      .single()

    if (existing) {
      if (!existing.active) {
        setError('That account is inactive. Contact your league admin.')
        setLoading(false)
        return
      }
      onJoin(existing)
      return
    }

    // Create new player
    const { data: newPlayer, error: err } = await supabase
      .from('players')
      .insert({ name: trimmed, active: true })
      .select()
      .single()

    if (err) {
      setError('Something went wrong. Try again.')
      setLoading(false)
      return
    }

    onJoin(newPlayer)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      {/* Logo area */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎵</div>
        <h1 style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>{leagueName}</h1>
        {/* FLAVOR TEXT: Join welcome */}
        <p className="flavor-text" style={{ marginTop: '0.5rem' }}>{FLAVOR.JOIN_WELCOME}</p>
      </div>

      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div className="card">

          {/* ── Existing players FIRST ── */}
          {players.length > 0 && (
            <>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem', marginBottom: '0.3rem' }}>
                Already registered?
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '0.9rem' }}>
                If you've already registered, select your profile name below.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto', marginBottom: '0.5rem' }}>
                {players.map(p => (
                  <button
                    key={p.id}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => onJoin(p)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <hr className="divider" />
            </>
          )}

          {/* ── New registration BELOW ── */}
          <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem', marginBottom: '0.3rem' }}>
            New here?
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '0.9rem' }}>
            Need to register? Enter your name below.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name..."
              />
              {error && <p className="error-msg">{error}</p>}
            </div>
            <button
              type="submit"
              className="btn btn-secondary btn-lg"
              disabled={loading || !name.trim()}
              style={{ width: '100%' }}
            >
              {loading ? 'Joining...' : 'Register & Enter →'}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
