import { useEffect, useRef, useState } from 'react'
import { persistVote } from '../lib/mutations.js'

const SAVE_DELAY_MS = 350

export default function useDebouncedVotes({ roundId, playerId, votes, pointsTotal, onChanged }) {
  const [draftVotes, setDraftVotes] = useState({})
  const [savingVotes, setSavingVotes] = useState(false)
  const [voteError, setVoteError] = useState('')
  const draftVotesRef = useRef({})
  const voteSaveTimersRef = useRef({})
  const pendingVoteValuesRef = useRef({})

  useEffect(() => {
    if (Object.keys(voteSaveTimersRef.current).length > 0) return

    const mine = {}
    votes
      .filter(vote => vote.voter_player_id === playerId)
      .forEach(vote => {
        mine[vote.song_id] = vote.points
      })
    draftVotesRef.current = mine
    setDraftVotes(mine)
  }, [votes, playerId])

  useEffect(() => () => {
    Object.values(voteSaveTimersRef.current).forEach(timer => window.clearTimeout(timer))
    Object.entries(pendingVoteValuesRef.current).forEach(([songId, points]) => {
      persistVote({ roundId, songId, playerId, points }).catch(() => {})
    })
  }, [roundId, playerId])

  const pointsUsed = Object.values(draftVotes).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const pointsRemaining = pointsTotal - pointsUsed
  const hasPendingVotes = Object.keys(voteSaveTimersRef.current).length > 0

  function scheduleVoteWrite(songId, points) {
    if (voteSaveTimersRef.current[songId]) {
      window.clearTimeout(voteSaveTimersRef.current[songId])
    }

    setSavingVotes(true)
    setVoteError('')
    pendingVoteValuesRef.current[songId] = points
    voteSaveTimersRef.current[songId] = window.setTimeout(async () => {
      delete voteSaveTimersRef.current[songId]

      try {
        await persistVote({ roundId, songId, playerId, points: pendingVoteValuesRef.current[songId] })
        delete pendingVoteValuesRef.current[songId]
        onChanged()
      } catch {
        setVoteError('Could not save votes. Try again.')
      } finally {
        if (Object.keys(voteSaveTimersRef.current).length === 0) {
          setSavingVotes(false)
        }
      }
    }, SAVE_DELAY_MS)
  }

  function adjustVote(song, delta) {
    if (song.player_id === playerId) return

    const currentDraft = draftVotesRef.current
    const current = Number(currentDraft[song.id]) || 0
    const usedElsewhere = Object.entries(currentDraft)
      .filter(([songId]) => songId !== song.id)
      .reduce((sum, [, points]) => sum + (Number(points) || 0), 0)
    const next = Math.max(0, Math.min(current + delta, pointsTotal - usedElsewhere))
    if (next === current) return

    const nextDraft = { ...currentDraft }
    if (next === 0) delete nextDraft[song.id]
    else nextDraft[song.id] = next

    draftVotesRef.current = nextDraft
    setDraftVotes(nextDraft)
    scheduleVoteWrite(song.id, next)
  }

  return {
    adjustVote,
    draftVotes,
    hasPendingVotes,
    pointsRemaining,
    pointsUsed,
    savingVotes,
    voteError,
  }
}
