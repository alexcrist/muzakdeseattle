import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { usePlayer, useSettings } from '../App.jsx'
import { getSeenResultsRoundId, markResultsSeen } from '../lib/identity.js'
import { tickRoundTransitions } from '../lib/rounds.js'

import SubmissionPhase from './phases/SubmissionPhase.jsx'
import VotingPhase from './phases/VotingPhase.jsx'
import ResultsPhase from './phases/ResultsPhase.jsx'
import WaitingState from './phases/WaitingState.jsx'

export default function HomePage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const [activeRound, setActiveRound] = useState(null)
  const [lastCompleteRound, setLastCompleteRound] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showResults, setShowResults] = useState(false)

  async function loadRounds() {
    await tickRoundTransitions()

    // Get active round (submission or voting)
    const { data: active } = await supabase
      .from('rounds')
      .select('*')
      .in('status', ['submission', 'voting'])
      .order('queue_position', { ascending: true })
      .limit(1)
      .single()

    setActiveRound(active || null)

    // Get most recent complete round
    const { data: complete } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'complete')
      .order('queue_position', { ascending: false })
      .limit(1)
      .single()

    setLastCompleteRound(complete || null)

    // Check if we need to auto-surface results
    if (complete) {
      const seen = getSeenResultsRoundId()
      if (seen !== complete.id) {
        setShowResults(true)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    loadRounds()

    // Subscribe to round changes
    const sub = supabase
      .channel('rounds-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, loadRounds)
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [])

  function handleResultsDismiss() {
    if (lastCompleteRound) markResultsSeen(lastCompleteRound.id)
    setShowResults(false)
  }

  if (loading) {
    return (
      <div className="page">
        <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>loading...</p>
      </div>
    )
  }

  // Auto-surface results if player hasn't seen them
  if (showResults && lastCompleteRound) {
    return (
      <ResultsPhase
        round={lastCompleteRound}
        player={player}
        onDismiss={handleResultsDismiss}
        isAutoSurfaced={true}
      />
    )
  }

  if (!activeRound) {
    return (
      <div>
        {lastCompleteRound && (
          <div className="page" style={{ paddingBottom: '0.5rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowResults(true)}
              style={{ marginBottom: '0.5rem' }}
            >
              📊 View last round results
            </button>
          </div>
        )}
        <WaitingState />
      </div>
    )
  }

  return (
    <div>
      {lastCompleteRound && (
        <div className="page" style={{ paddingBottom: '0', paddingTop: '1rem' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowResults(true)}
          >
            📊 View last round results
          </button>
        </div>
      )}

      {activeRound.status === 'submission' && (
        <SubmissionPhase round={activeRound} player={player} settings={settings} />
      )}
      {activeRound.status === 'voting' && (
        <VotingPhase round={activeRound} player={player} settings={settings} />
      )}
    </div>
  )
}
