import { useEffect, useMemo, useState } from 'react'
import Countdown from '../components/Countdown.jsx'
import { usePlayer, useSettings } from '../App.jsx'
import useRealtimeData from '../hooks/useRealtimeData.js'
import { EMPTY_HOME_DATA, fetchHomeData, HOME_REALTIME_TABLES } from '../lib/data.js'
import { formatPacificDate, getLeagueContext, getRoundTiming, PHASES } from '../lib/schedule.js'
import AppreciationView from './home/AppreciationView.jsx'
import { phaseHint, phaseTitle } from './home/homeUtils.js'
import SubmissionView from './home/SubmissionView.jsx'
import VotingView from './home/VotingView.jsx'

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function HomePage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const now = useNow()
  const { data, loading, reload } = useRealtimeData({
    channelName: 'home-season-2',
    fetcher: fetchHomeData,
    initialData: EMPTY_HOME_DATA,
    tables: HOME_REALTIME_TABLES,
  })

  const context = useMemo(() => getLeagueContext(data.rounds, settings, now), [data.rounds, settings, now])
  const currentRound = context.currentRound
  const activePlayers = data.players.filter(p => p.active)

  const roundData = useMemo(() => {
    if (!currentRound) return null
    const roundSongs = data.songs.filter(song => song.round_id === currentRound.id)
    const roundVotes = data.votes.filter(vote => vote.round_id === currentRound.id)
    const roundComments = data.comments.filter(comment => comment.round_id === currentRound.id)
    const roundGroups = data.duplicateGroups.filter(group => group.round_id === currentRound.id)
    const groupIds = new Set(roundGroups.map(group => group.id))
    const roundGroupSongs = data.groupSongs.filter(row => groupIds.has(row.group_id))
    return { roundSongs, roundVotes, roundComments, roundGroups, roundGroupSongs }
  }, [currentRound, data])

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading current round...</p>
      </main>
    )
  }

  if (!currentRound) {
    const seasonHasStarted = context.currentWeekIndex >= 0
    return (
      <main className="page">
        <section className="hero-surface">
          <span className="phase-pill phase-off">No active round</span>
          <h1>{seasonHasStarted ? 'Queue needs a song theme' : 'Season starts soon'}</h1>
          <p>
            {seasonHasStarted
              ? 'Add another round in Rounds to keep the weekly schedule moving.'
              : `The first scheduled week starts ${formatPacificDate(context.startDate)}.`}
          </p>
        </section>
      </main>
    )
  }

  const timing = getRoundTiming(currentRound, context.currentRoundIndex, settings, now)
  const nextPhaseLabel = PHASES[context.nextPhase]?.label || 'next phase'

  return (
    <main className="page">
      <section className="hero-surface">
        <div className="hero-topline">
          <span className={`phase-pill phase-${context.phase}`}>{context.phaseMeta.label}</span>
          <span className="date-chip">Week of {formatPacificDate(timing.weekStart)}</span>
        </div>
        <h1>{currentRound.theme_name}</h1>
        {currentRound.theme_description && <p>{currentRound.theme_description}</p>}
        <div className="phase-summary">
          {timing.phaseRanges.map(range => (
            <span key={`${range.phase}-${range.startDate}`}>{PHASES[range.phase]?.shortLabel || 'Off'} {formatPacificDate(range.startDate, { weekday: 'short' })}</span>
          ))}
        </div>
      </section>

      <section className="status-strip">
        <div>
          <p className="eyebrow">{phaseTitle(context.phase)}</p>
          <p>{phaseHint(context.phase)}</p>
        </div>
        <Countdown target={context.nextPhaseAt} label={`Next: ${nextPhaseLabel}`} />
      </section>

      {context.phase === 'submission' && (
        <SubmissionView
          round={currentRound}
          player={player}
          songs={roundData.roundSongs}
          activePlayers={activePlayers}
          onChanged={reload}
        />
      )}

      {context.phase === 'voting' && (
        <VotingView
          round={currentRound}
          player={player}
          songs={roundData.roundSongs}
          votes={roundData.roundVotes}
          comments={roundData.roundComments}
          activePlayers={activePlayers}
          pointsTotal={settings?.points_per_player || 10}
          onChanged={reload}
        />
      )}

      {context.phase === 'appreciation' && (
        <AppreciationView
          round={currentRound}
          player={player}
          songs={roundData.roundSongs}
          votes={roundData.roundVotes}
          comments={roundData.roundComments}
          duplicateGroups={roundData.roundGroups}
          groupSongs={roundData.roundGroupSongs}
          onChanged={reload}
        />
      )}

      {context.phase === 'off' && (
        <section className="empty-state">
          <h2>Off day</h2>
          <p>This round is waiting for the next scheduled phase.</p>
        </section>
      )}
    </main>
  )
}
