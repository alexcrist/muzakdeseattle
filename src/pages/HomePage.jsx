import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Countdown from '../components/Countdown.jsx'
import { usePlayer, useSettings } from '../App.jsx'
import useRealtimeData from '../hooks/useRealtimeData.js'
import {
  EMPTY_HOME_CORE_DATA,
  EMPTY_HOME_ROUND_DATA,
  fetchHomeCoreData,
  fetchHomeRoundData,
  homeRoundRealtimeTables,
  HOME_CORE_REALTIME_TABLES,
} from '../lib/data.js'
import { buildRoundGroupAssignment, shouldSplitRound, sideOf, sidesForRound } from '../lib/groups.js'
import { assignRoundGroups, joinRoundGroup } from '../lib/mutations.js'
import { formatPacificDate, formatPhaseDateRange, getLeagueContext, getRoundTiming, phaseForDate } from '../lib/schedule.js'

const phaseLoaders = {
  submission: () => import('./home/SubmissionView.jsx'),
  voting: () => import('./home/VotingView.jsx'),
  appreciation: () => import('./home/AppreciationView.jsx'),
}
const SubmissionView = lazy(phaseLoaders.submission)
const VotingView = lazy(phaseLoaders.voting)
const AppreciationView = lazy(phaseLoaders.appreciation)

function getDevDayOffset() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return 0

  const value = new URLSearchParams(window.location.search).get('days')
  if (value === null || value.trim() === '') return 0

  const offset = Number(value)
  return Number.isSafeInteger(offset) ? offset : 0
}

function nowWithDayOffset(dayOffset) {
  const now = new Date()
  now.setDate(now.getDate() + dayOffset)
  return now
}

function useNow() {
  const dayOffset = getDevDayOffset()
  const [now, setNow] = useState(() => nowWithDayOffset(dayOffset))

  useEffect(() => {
    setNow(nowWithDayOffset(dayOffset))
    const id = setInterval(() => setNow(nowWithDayOffset(dayOffset)), 60000)
    return () => clearInterval(id)
  }, [dayOffset])

  return { now, dayOffset }
}

export default function HomePage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const { now, dayOffset } = useNow()
  const coreFetcher = useCallback(() => fetchHomeCoreData(), [])
  const { data: coreData, loading: coreLoading, reload: reloadCore } = useRealtimeData({
    cacheKey: 'home-core',
    channelName: 'home-core-season-2',
    fetcher: coreFetcher,
    initialData: EMPTY_HOME_CORE_DATA,
    tables: HOME_CORE_REALTIME_TABLES,
  })
  const context = useMemo(() => getLeagueContext(coreData.rounds, settings, now), [coreData.rounds, settings, now])
  const currentRound = context.currentRound
  const roundFetcher = useCallback(() => fetchHomeRoundData(currentRound?.id), [currentRound?.id])
  const roundRealtimeTables = useMemo(() => homeRoundRealtimeTables(currentRound?.id), [currentRound?.id])
  const { data: roundActivity, loading: roundLoading, reload } = useRealtimeData({
    cacheKey: `home-round:${currentRound?.id || 'none'}`,
    channelName: `home-round-season-2-${currentRound?.id || 'none'}`,
    fetcher: roundFetcher,
    initialData: EMPTY_HOME_ROUND_DATA,
    tables: roundRealtimeTables,
  })
  const data = useMemo(() => ({ ...coreData, ...roundActivity }), [coreData, roundActivity])
  const loading = coreLoading || (Boolean(currentRound) && roundLoading)

  useEffect(() => {
    phaseLoaders[phaseForDate(settings, now)]?.()
  }, [settings, now])

  const activePlayers = useMemo(() => data.players.filter(p => p.active), [data.players])

  const sides = useMemo(
    () => sidesForRound(data.roundGroups, currentRound?.id),
    [data.roundGroups, currentRound?.id]
  )
  const mySide = sideOf(sides, player.id)

  // The sides for a round are written once, by whoever opens the app first after it goes live.
  // The RPC is first-writer-wins, so a race between two clients cannot produce two splits.
  const settledRoundsRef = useRef(new Set())
  useEffect(() => {
    // Time travel is for inspecting existing rounds, never for mutating their assignments.
    if (dayOffset !== 0 || loading || !currentRound) return

    const roundId = currentRound.id
    const needsAssignment = !sides.isSplit && shouldSplitRound(activePlayers.length)
    const needsJoin = sides.isSplit && mySide === null
    if (!needsAssignment && !needsJoin) return

    const attemptKey = `${roundId}:${needsAssignment ? 'assign' : 'join'}:${activePlayers.length}`
    if (settledRoundsRef.current.has(attemptKey)) return
    settledRoundsRef.current.add(attemptKey)

    let cancelled = false

    async function settleSides() {
      if (needsAssignment) {
        const assignments = buildRoundGroupAssignment({
          roundId,
          activePlayers,
          rounds: data.rounds,
          priorGroupRows: data.roundGroups.filter(row => row.round_id !== roundId),
        })
        if (!assignments) return
        await assignRoundGroups({ roundId, assignments })
      } else {
        await joinRoundGroup({ roundId, playerId: player.id })
      }

      if (!cancelled) reloadCore()
    }

    settleSides()

    return () => {
      cancelled = true
    }
  }, [dayOffset, loading, currentRound, sides.isSplit, mySide, activePlayers, data.rounds, data.roundGroups, player.id, reloadCore])

  const roundData = useMemo(() => {
    if (!currentRound) return null

    const roundSongs = data.songs.filter(song => song.round_id === currentRound.id)
    const roundVotes = data.votes.filter(vote => vote.round_id === currentRound.id)
    const roundComments = data.comments.filter(comment => comment.round_id === currentRound.id)
    const roundGroups = data.duplicateGroups.filter(group => group.round_id === currentRound.id)
    const groupIds = new Set(roundGroups.map(group => group.id))
    const roundGroupSongs = data.groupSongs.filter(row => groupIds.has(row.group_id))
    const roundPlaylists = data.playlists.filter(playlist => playlist.round_id === currentRound.id)

    // During submission and voting a player only ever votes on their own side. Song comments follow
    // their song; general round comments follow their author, so nothing leaks across the split.
    const onMySide = playerId => !sides.isSplit || sides.sideByPlayerId[playerId] === mySide
    const mySideSongs = roundSongs.filter(song => onMySide(song.player_id))
    const mySideSongIds = new Set(mySideSongs.map(song => song.id))
    const mySideVotes = roundVotes.filter(vote => mySideSongIds.has(vote.song_id))
    const mySideComments = roundComments.filter(comment => (
      comment.song_id ? mySideSongIds.has(comment.song_id) : onMySide(comment.player_id)
    ))
    const mySidePlayers = activePlayers.filter(row => onMySide(row.id))

    // Voting is still scoped to your own side, but players can browse and comment on the
    // non-voting group's songs during voting. No votes/scores are exposed for that side.
    const otherSide = sides.isSplit && mySide !== null ? 1 - mySide : null
    const otherSideSongs = otherSide === null
      ? []
      : roundSongs.filter(song => sides.sideByPlayerId[song.player_id] === otherSide)
    const otherSideSongIds = new Set(otherSideSongs.map(song => song.id))
    const otherSideComments = otherSide === null
      ? []
      : roundComments.filter(comment => comment.song_id && otherSideSongIds.has(comment.song_id))

    return {
      roundSongs,
      roundVotes,
      roundComments,
      roundGroups,
      roundGroupSongs,
      roundPlaylists,
      mySideSongs,
      mySideVotes,
      mySideComments,
      mySidePlayers,
      otherSide,
      otherSideSongs,
      otherSideComments,
    }
  }, [
    currentRound,
    data.songs,
    data.votes,
    data.comments,
    data.duplicateGroups,
    data.groupSongs,
    data.playlists,
    sides,
    mySide,
    activePlayers,
  ])

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
  const awaitingSides = sides.isSplit && mySide === null
  const appreciationPlayers = sides.isSplit
    ? data.players.filter(row => sides.sideByPlayerId[row.id] === 0 || sides.sideByPlayerId[row.id] === 1)
    : activePlayers

  return (
    <main className="page">
      <section className="hero-surface">
        <div className="hero-topline">
          <span className={`phase-pill phase-${context.phase}`}>{context.phaseMeta.label}</span>
          <span className="date-chip">Week of {formatPacificDate(timing.weekStart)}</span>
        </div>
        <h1>{currentRound.theme_name}</h1>
        {currentRound.theme_description && <p>{currentRound.theme_description}</p>}
        <div className="hero-footer">
          <div className="phase-summary">
            {timing.phaseRanges.map(range => (
              <span key={`${range.phase}-${range.startDate}`}>{formatPhaseDateRange(range)}</span>
            ))}
          </div>
          <Countdown target={context.nextPhaseAt} />
        </div>
      </section>

      {awaitingSides && context.phase !== 'appreciation' ? (
        <section className="empty-state">
          <h2>Finding you a side</h2>
          <p>This round is already split. Hang tight while you get slotted in.</p>
        </section>
      ) : (
        <Suspense fallback={<p className="muted">Loading this phase...</p>}>
          {context.phase === 'submission' && (
            <SubmissionView
              round={currentRound}
              player={player}
              songs={roundData.roundSongs}
              activePlayers={activePlayers}
              sides={sides}
              mySide={mySide}
              onChanged={reload}
            />
          )}

          {context.phase === 'voting' && (
            <VotingView
              round={currentRound}
              player={player}
              songs={roundData.mySideSongs}
              votes={roundData.mySideVotes}
              statusVotes={roundData.roundVotes}
              comments={roundData.mySideComments}
              commentLikes={data.commentLikes}
              activePlayers={roundData.mySidePlayers}
              pointsTotal={settings?.points_per_player || 10}
              mySide={mySide}
              otherSide={roundData.otherSide}
              otherSideSongs={roundData.otherSideSongs}
              otherSideComments={roundData.otherSideComments}
              playlists={roundData.roundPlaylists}
              allPlayers={activePlayers}
              sides={sides}
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
              commentLikes={data.commentLikes}
              duplicateGroups={roundData.roundGroups}
              groupSongs={roundData.roundGroupSongs}
              playlists={roundData.roundPlaylists}
              allPlayers={appreciationPlayers}
              pointsTotal={settings?.points_per_player || 10}
              sides={sides}
              onChanged={reload}
            />
          )}

          {context.phase === 'off' && (
            <section className="empty-state">
              <h2>Off day</h2>
              <p>This round is waiting for the next scheduled phase.</p>
            </section>
          )}
        </Suspense>
      )}
    </main>
  )
}
