import { useEffect, useMemo, useState } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { groupLabel, sidesForRound } from '../../lib/groups.js'
import { createDuplicateMerge, deleteDuplicateMerge } from '../../lib/mutations.js'
import { buildSongEntries, entrySubmitterText } from '../../lib/scoring.js'
import { getLeagueContext, getRoundState } from '../../lib/schedule.js'

export default function DuplicateMergeTool({ settings, data, onChanged }) {
  const context = useMemo(() => getLeagueContext(data.rounds, settings), [data.rounds, settings])
  const eligibleRounds = context.orderedRounds.filter((round, index) => {
    const state = getRoundState(round, index, settings)
    return state === 'past' || (state === 'current' && context.phase === 'appreciation')
  }).reverse()
  const defaultRound = eligibleRounds[0]
  const [selectedRoundId, setSelectedRoundId] = useState(defaultRound?.id || '')
  const [selectedSongIds, setSelectedSongIds] = useState([])
  const [canonicalSongId, setCanonicalSongId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!eligibleRounds.some(round => round.id === selectedRoundId)) {
      setSelectedRoundId(defaultRound?.id || '')
      setSelectedSongIds([])
      setCanonicalSongId('')
    }
  }, [defaultRound?.id, eligibleRounds, selectedRoundId])

  const selectedRound = data.rounds.find(round => round.id === selectedRoundId)
  const roundSongs = data.songs.filter(song => song.round_id === selectedRoundId)
  const roundVotes = data.votes.filter(vote => vote.round_id === selectedRoundId)
  const roundGroups = data.groups.filter(group => group.round_id === selectedRoundId)
  const groupIds = new Set(roundGroups.map(group => group.id))
  const roundGroupSongs = data.groupSongs.filter(row => groupIds.has(row.group_id))
  const groupedSongIds = new Set(roundGroupSongs.map(row => row.song_id))
  const sides = sidesForRound(data.roundGroups, selectedRoundId)
  const entries = buildSongEntries({
    songs: roundSongs,
    votes: roundVotes,
    duplicateGroups: roundGroups,
    groupSongs: roundGroupSongs,
    sideByPlayerId: sides.isSplit ? sides.sideByPlayerId : null,
  })

  // Opposite sides never shared a voting pool, so there is no split vote for courtesy points to
  // repair. The RPC rejects a cross-side merge too; this just keeps it un-clickable.
  const sideOfSong = song => {
    if (!sides.isSplit) return null
    const side = sides.sideByPlayerId[song?.player_id]
    return side === 0 || side === 1 ? side : null
  }
  const lockedSide = selectedSongIds.length > 0
    ? sideOfSong(roundSongs.find(song => song.id === selectedSongIds[0]))
    : null

  function toggleSong(songId) {
    setSelectedSongIds(ids => {
      const next = ids.includes(songId) ? ids.filter(id => id !== songId) : [...ids, songId]
      if (!next.includes(canonicalSongId)) setCanonicalSongId(next[0] || '')
      return next
    })
  }

  async function createMerge() {
    if (selectedSongIds.length < 2) {
      setMessage('Pick at least two songs to merge.')
      return
    }

    const canonical = canonicalSongId && selectedSongIds.includes(canonicalSongId)
      ? canonicalSongId
      : selectedSongIds[0]

    const { error } = await createDuplicateMerge({
      roundId: selectedRoundId,
      songIds: selectedSongIds,
      canonicalSongId: canonical,
    })

    if (error) {
      setMessage(error.message || 'Could not create duplicate merge.')
      return
    }

    setSelectedSongIds([])
    setCanonicalSongId('')
    setMessage('Duplicate merge created.')
    onChanged()
  }

  async function deleteGroup(groupId) {
    const { error } = await deleteDuplicateMerge(groupId)
    if (error) {
      setMessage(error.message || 'Could not remove duplicate merge.')
      return
    }

    setMessage('Duplicate merge removed.')
    onChanged()
  }

  return (
    <section className="card duplicate-tool">
      <div className="section-heading">
        <h2>Duplicate song merge</h2>
        {message && <span className={message.includes('Could not') || message.includes('Pick') ? 'error-msg' : 'success-msg'}>{message}</span>}
      </div>
      <p className="muted">Use this after voting. Votes stay intact; results recalculate with self-votes removed and courtesy points added.</p>

      <label>
        <span>Round</span>
        <select
          value={selectedRoundId}
          onChange={event => {
            setSelectedRoundId(event.target.value)
            setSelectedSongIds([])
            setCanonicalSongId('')
            setMessage('')
          }}
        >
          {eligibleRounds.map(round => (
            <option key={round.id} value={round.id}>{round.theme_name}</option>
          ))}
        </select>
      </label>

      {eligibleRounds.length === 0 ? (
        <div className="empty-state compact">
          <p>Duplicate merging opens once a round reaches appreciation.</p>
        </div>
      ) : !selectedRound ? (
        <div className="empty-state compact">
          <p>Add a round before merging duplicates.</p>
        </div>
      ) : (
        <>
          <div className="merge-grid">
            <div>
              <h3>Songs</h3>
              <div className="merge-song-list">
                {roundSongs.map(song => {
                  const songSide = sideOfSong(song)
                  const selected = selectedSongIds.includes(song.id)
                  const wrongSide = !selected && lockedSide !== null && songSide !== lockedSide
                  const disabled = groupedSongIds.has(song.id) || wrongSide
                  return (
                    <button
                      type="button"
                      key={song.id}
                      className={`merge-song ${selected ? 'selected' : ''}`}
                      onClick={() => toggleSong(song.id)}
                      disabled={disabled}
                    >
                      <span>
                        <strong>{song.title}</strong>
                        <small>
                          {song.artist} · {song.players?.name || 'Unknown player'}
                          {songSide === 0 || songSide === 1 ? ` · ${groupLabel(songSide)}` : ''}
                        </small>
                      </span>
                      {groupedSongIds.has(song.id)
                        ? <em>Already merged</em>
                        : wrongSide
                          ? <em>Other side</em>
                          : selected ? <em>Selected</em> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <h3>Canonical display song</h3>
              <select value={canonicalSongId} onChange={event => setCanonicalSongId(event.target.value)} disabled={selectedSongIds.length === 0}>
                <option value="">Use first selected</option>
                {selectedSongIds.map(songId => {
                  const song = roundSongs.find(item => item.id === songId)
                  return song ? <option key={song.id} value={song.id}>{song.title} · {song.artist}</option> : null
                })}
              </select>
              <button type="button" className="btn btn-primary" onClick={createMerge} disabled={selectedSongIds.length < 2}>
                Merge selected songs
              </button>
            </div>
          </div>

          {roundGroups.length > 0 && (
            <div className="existing-merges">
              <h3>Existing merges</h3>
              {entries.filter(entry => entry.isDuplicate).map(entry => (
                <div className="existing-merge" key={entry.id}>
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entrySubmitterText(entry)} · {entry.totalPoints} pts total</p>
                    <p>{entry.votePoints} vote pts + {entry.courtesyPoints} courtesy pts{entry.ineligiblePoints ? ` · ${entry.ineligiblePoints} self-vote pts removed` : ''}</p>
                  </div>
                  <div className="avatar-cluster">
                    {entry.submitters.map(submitter => <Avatar key={submitter.id} player={submitter} size="sm" />)}
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => deleteGroup(entry.group_id)}>
                    Remove merge
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
