import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useSettings } from '../App.jsx'
import { FLAVOR } from '../lib/flavor.js'
import { pauseLeague, unpauseLeague } from '../lib/rounds.js'

export default function SettingsPage() {
  const { settings, setSettings } = useSettings()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const [firstRoundSetup, setFirstRoundSetup] = useState(null)
  const [activeRound, setActiveRound] = useState(null)
  const [submissionCount, setSubmissionCount] = useState(0)
  const [voterCount, setVoterCount] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(0)

  useEffect(() => {
    if (settings) {
      setForm({
        league_name: settings.league_name || 'Music League',
        points_per_player: settings.points_per_player || 10,
        default_submission_hours: settings.default_submission_hours || 48,
        default_voting_hours: settings.default_voting_hours || 48,
      })
    }
  }, [settings])

  async function loadRoundData() {
    // Active round
    const { data: active } = await supabase
      .from('rounds')
      .select('*')
      .in('status', ['submission', 'voting'])
      .order('queue_position', { ascending: true })
      .limit(1)
      .single()
    setActiveRound(active || null)

    // First pending round (for start league button)
    const { data: pending } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'pending')
      .order('queue_position', { ascending: true })
      .limit(1)
      .single()
    setFirstRoundSetup(pending || null)

    // Total ACTIVE players
    const { count: playerCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
    setTotalPlayers(playerCount || 0)

    if (active) {
      // Submission count
      const { count: subCount } = await supabase
        .from('songs')
        .select('*', { count: 'exact', head: true })
        .eq('round_id', active.id)
      setSubmissionCount(subCount || 0)

      // Voter count
      const { data: allVotes } = await supabase
        .from('votes')
        .select('voter_player_id')
        .eq('round_id', active.id)
      const distinct = new Set((allVotes || []).map(v => v.voter_player_id)).size
      setVoterCount(distinct)
    }
  }

  useEffect(() => {
    loadRoundData()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    const { data, error } = await supabase
      .from('league_settings')
      .update({
        league_name: form.league_name.trim(),
        points_per_player: parseInt(form.points_per_player) || 10,
        default_submission_hours: parseInt(form.default_submission_hours) || 48,
        default_voting_hours: parseInt(form.default_voting_hours) || 48,
      })
      .eq('id', 1)
      .select()
      .single()
    if (!error && data) setSettings(data)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handlePauseToggle() {
    setPausing(true)
    if (settings?.is_paused) {
      await unpauseLeague()
    } else {
      await pauseLeague()
    }
    const { data } = await supabase.from('league_settings').select('*').eq('id', 1).single()
    if (data) setSettings(data)
    setPausing(false)
  }

  async function handleStartLeague() {
    if (!firstRoundSetup) return
    const subDeadline = new Date()
    subDeadline.setHours(subDeadline.getHours() + (settings?.default_submission_hours || 48))
    const votDeadline = new Date(subDeadline)
    votDeadline.setHours(votDeadline.getHours() + (settings?.default_voting_hours || 48))
    await supabase.from('rounds').update({
      status: 'submission',
      submission_deadline: subDeadline.toISOString(),
      voting_deadline: votDeadline.toISOString(),
    }).eq('id', firstRoundSetup.id)
    await loadRoundData()
    alert('League started! First round is now open for submissions.')
  }

  async function handleAdvanceToVoting() {
    if (!activeRound || activeRound.status !== 'submission') return
    const confirmed = window.confirm("ok, like, are you really sure you want to end the current phase? like really REALLY sure?")
    if (!confirmed) return
    setAdvancing(true)
    // Set submission deadline to now so tick will advance it,
    // then directly flip status to voting
    await supabase.from('rounds').update({
      status: 'voting',
      submission_deadline: new Date().toISOString(),
    }).eq('id', activeRound.id)
    await loadRoundData()
    setAdvancing(false)
    alert('Round advanced to voting! Songs are now revealed.')
  }

  async function handleAdvanceToResults() {
    if (!activeRound || activeRound.status !== 'voting') return
    const confirmed = window.confirm("ok, like, are you really sure you want to end the current phase? like really REALLY sure?")
    if (!confirmed) return
    setAdvancing(true)
    // Flip to complete, then start next pending round if exists
    await supabase.from('rounds').update({
      status: 'complete',
      voting_deadline: new Date().toISOString(),
    }).eq('id', activeRound.id)

    // Start next pending round
    const { data: nextRounds } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'pending')
      .order('queue_position', { ascending: true })
      .limit(1)

    if (nextRounds && nextRounds.length > 0) {
      const next = nextRounds[0]
      const subDeadline = new Date()
      subDeadline.setHours(subDeadline.getHours() + (settings?.default_submission_hours || 48))
      const votDeadline = new Date(subDeadline)
      votDeadline.setHours(votDeadline.getHours() + (settings?.default_voting_hours || 48))
      await supabase.from('rounds').update({
        status: 'submission',
        submission_deadline: subDeadline.toISOString(),
        voting_deadline: votDeadline.toISOString(),
      }).eq('id', next.id)
    }

    await loadRoundData()
    setAdvancing(false)
    alert('Voting closed! Results are now live and the next round has started.')
  }

  if (!form) return <div className="page"><p style={{ color: 'var(--text3)' }}>loading...</p></div>

  const allSubmitted = totalPlayers > 0 && submissionCount >= totalPlayers
  const allVoted = totalPlayers > 0 && voterCount >= totalPlayers

  return (
    <div className="page">
      {/* FLAVOR TEXT: Settings warning */}
      <div style={{
        background: 'rgba(232, 124, 71, 0.08)',
        border: '1px solid rgba(232, 124, 71, 0.3)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem 1.25rem',
        marginBottom: '1.75rem',
      }}>
        <p style={{ color: 'var(--accent2)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          {FLAVOR.SETTINGS_WARNING}
        </p>
      </div>

      {/* Start league button */}
      {!activeRound && firstRoundSetup && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'rgba(71,232,160,0.3)' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>🚀 Ready to start?</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text2)', marginBottom: '1rem' }}>
            You have rounds in the queue but the league hasn't started yet.
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text3)', marginBottom: '1rem' }}>
            First round: <strong style={{ color: 'var(--text2)' }}>{firstRoundSetup.theme_name}</strong>
          </p>
          <button className="btn btn-primary" onClick={handleStartLeague}>
            Start the League →
          </button>
        </div>
      )}

      {/* Advance to voting — shown during submission phase */}
      {activeRound?.status === 'submission' && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: allSubmitted ? 'rgba(71,232,160,0.4)' : 'var(--border)' }}>
          <h3 style={{ marginBottom: '0.4rem' }}>🎵 Submission Phase</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text2)', marginBottom: '0.75rem' }}>
            Current round: <strong style={{ color: 'var(--text)' }}>{activeRound.theme_name}</strong>
          </p>
          <p style={{ fontSize: '0.88rem', color: allSubmitted ? 'var(--success)' : 'var(--text3)', marginBottom: '1rem' }}>
            {allSubmitted
              ? `✅ All ${totalPlayers} players have submitted!`
              : `⏳ ${submissionCount} of ${totalPlayers} players have submitted.`}
          </p>
          <button
            className="btn btn-primary"
            onClick={handleAdvanceToVoting}
            disabled={advancing}
          >
            {advancing ? 'Advancing...' : 'All songs submitted — advance to voting round →'}
          </button>
        </div>
      )}

      {/* Advance to results — shown during voting phase */}
      {activeRound?.status === 'voting' && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: allVoted ? 'rgba(71,232,160,0.4)' : 'var(--border)' }}>
          <h3 style={{ marginBottom: '0.4rem' }}>🗳️ Voting Phase</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text2)', marginBottom: '0.75rem' }}>
            Current round: <strong style={{ color: 'var(--text)' }}>{activeRound.theme_name}</strong>
          </p>
          <p style={{ fontSize: '0.88rem', color: allVoted ? 'var(--success)' : 'var(--text3)', marginBottom: '1rem' }}>
            {allVoted
              ? `✅ All ${totalPlayers} players have voted!`
              : `⏳ ${voterCount} of ${totalPlayers} players have voted.`}
          </p>
          <button
            className="btn btn-primary"
            onClick={handleAdvanceToResults}
            disabled={advancing}
          >
            {advancing ? 'Advancing...' : 'All votes in — close voting and reveal results →'}
          </button>
        </div>
      )}

      {/* Pause toggle */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>
              {settings?.is_paused ? '⏸ League is Paused' : '▶️ League is Running'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text3)' }}>
              {settings?.is_paused
                ? 'All deadlines are frozen. Unpause to resume countdowns.'
                : 'Pause if you need to freeze all timers temporarily.'}
            </p>
          </div>
          <button
            className={`btn ${settings?.is_paused ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handlePauseToggle}
            disabled={pausing}
          >
            {pausing ? '...' : settings?.is_paused ? 'Unpause League' : 'Pause League'}
          </button>
        </div>
      </div>

      {/* League settings form */}
      <div className="card">
        <h3 style={{ marginBottom: '1.25rem' }}>League Settings</h3>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>League Name</label>
            <input
              type="text"
              value={form.league_name}
              onChange={e => setForm(f => ({ ...f, league_name: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label>Points Per Player Per Round</label>
            <input
              type="number"
              min="1"
              max="100"
              value={form.points_per_player}
              onChange={e => setForm(f => ({ ...f, points_per_player: e.target.value }))}
              style={{ maxWidth: '120px' }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: '0.3rem' }}>
              Each player can allocate this many points per voting round.
            </p>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Default Submission Period (hours)</label>
              <input
                type="number"
                min="1"
                value={form.default_submission_hours}
                onChange={e => setForm(f => ({ ...f, default_submission_hours: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Default Voting Period (hours)</label>
              <input
                type="number"
                min="1"
                value={form.default_voting_hours}
                onChange={e => setForm(f => ({ ...f, default_voting_hours: e.target.value }))}
              />
            </div>
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: '1rem' }}>
            Example: 48 hours = 2 days. These are applied to each new round when it becomes active.
            1 week = 168 hours.
          </p>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="card" style={{ marginTop: '1.5rem', borderColor: 'rgba(232,80,71,0.3)' }}>
        <h3 style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}>Danger Zone</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginBottom: '0.75rem' }}>
          These actions are permanent. Be absolutely sure before proceeding.
        </p>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => {
            if (window.confirm('Are you SURE you want to reset your identity? You will be logged out and need to re-enter your name.')) {
              localStorage.clear()
              window.location.reload()
            }
          }}
        >
          Reset My Identity (log out)
        </button>
      </div>
    </div>
  )
}
