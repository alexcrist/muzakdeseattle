import { useMemo, useState } from 'react'
import SideRoster from '../../components/SideRoster.jsx'
import useDebouncedVotes from '../../hooks/useDebouncedVotes.js'
import { anonymousNameFor } from '../../lib/anonymousNames.js'
import { groupLabel } from '../../lib/groups.js'
import { listeningOrderFor } from '../../lib/listeningOrder.js'
import CommentThread from './CommentThread.jsx'
import { copyTextFor, searchUrl, serviceLabelForUrl } from './homeUtils.js'

export default function VotingView({
  round,
  player,
  songs,
  votes,
  comments,
  activePlayers,
  pointsTotal,
  mySide,
  otherSide,
  otherSideSongs = [],
  otherSideComments = [],
  allPlayers,
  sides,
  onChanged,
}) {
  const [viewingOtherGroup, setViewingOtherGroup] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [selfVoteSong, setSelfVoteSong] = useState(null)
  const canBrowseOtherGroup = otherSide !== null && otherSide !== undefined
  const isViewingOther = canBrowseOtherGroup && viewingOtherGroup

  const orderedSongs = useMemo(() => (
    listeningOrderFor(songs, { roundId: round.id, playerId: player.id })
  ), [songs, round.id, player.id])
  const otherOrderedSongs = useMemo(() => (
    listeningOrderFor(otherSideSongs, { roundId: round.id, playerId: player.id })
  ), [otherSideSongs, round.id, player.id])
  const anonymousLabelFor = playerId => anonymousNameFor(round.id, playerId)
  const myAnonymousName = anonymousLabelFor(player.id)

  const activeSongs = isViewingOther ? otherOrderedSongs : orderedSongs
  const activeComments = isViewingOther ? otherSideComments : comments
  const mySidePlayers = mySide === null ? activePlayers : allPlayers.filter(row => sides.sideByPlayerId[row.id] === mySide)
  const otherSidePlayers = otherSide === null ? [] : allPlayers.filter(row => sides.sideByPlayerId[row.id] === otherSide)
  const {
    adjustVote,
    draftVotes,
    hasPendingVotes,
    pointsRemaining,
    pointsUsed,
    savingVotes,
    voteError,
  } = useDebouncedVotes({
    roundId: round.id,
    playerId: player.id,
    votes,
    pointsTotal,
    onChanged,
  })

  const voters = new Set(votes.filter(vote => Number(vote.points) > 0).map(vote => vote.voter_player_id))
  if (pointsUsed > 0) voters.add(player.id)
  if (pointsUsed === 0 && hasPendingVotes) voters.delete(player.id)

  async function copyOrder() {
    try {
      await navigator.clipboard.writeText(copyTextFor(activeSongs))
      setCopyMessage('Copied')
    } catch {
      setCopyMessage('Could not copy')
    }
  }

  return (
    <section className="phase-layout">
      <aside className="side-panel">
        <div className="voting-bank">
          <div className="voting-bank-heading">
            <h2>Voting bank</h2>
            <strong>{pointsRemaining} left</strong>
          </div>
          <VoteTokenBank total={pointsTotal} used={pointsUsed} />
        </div>
        {savingVotes && <p className="muted">Saving votes...</p>}
        {voteError && <p className="error-msg">{voteError}</p>}
        {mySide !== null && mySide !== undefined && (
          <div className="voting-sides">
            <p className="eyebrow">This round's sides</p>
            <div className="voting-side-roster">
              <h3 className={`side-name side-${mySide}`}>{groupLabel(mySide)}</h3>
              <SideRoster players={mySidePlayers} completedIds={voters} currentPlayerId={player.id} />
            </div>
            <div className="voting-side-roster is-other">
              <h3 className={`side-name side-${otherSide}`}>{groupLabel(otherSide)}</h3>
              <SideRoster players={otherSidePlayers} currentPlayerId={player.id} muted />
            </div>
          </div>
        )}
        {(mySide === null || mySide === undefined) && (
          <div className="voting-sides">
            <SideRoster players={activePlayers} completedIds={voters} currentPlayerId={player.id} />
          </div>
        )}
        <AnonymousPersonaCard name={myAnonymousName} />
      </aside>

      <section className="song-stack">
        <div className="voting-toolbar">
          {canBrowseOtherGroup && (
            <div className="group-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!isViewingOther}
                className={`group-tab ${!isViewingOther ? 'is-active' : ''}`}
                onClick={() => setViewingOtherGroup(false)}
              >
                {groupLabel(mySide)}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isViewingOther}
                className={`group-tab ${isViewingOther ? 'is-active' : ''}`}
                onClick={() => setViewingOtherGroup(true)}
              >
                {groupLabel(otherSide)}
              </button>
            </div>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyOrder} disabled={activeSongs.length === 0}>
            {copyMessage || 'Copy list'}
          </button>
        </div>

        {activeSongs.length === 0 ? (
          <div className="empty-state">
            <h2>No songs yet</h2>
            <p>{isViewingOther ? 'Nobody in the non-voting group submitted a song.' : 'Voting is open, but nobody submitted a song.'}</p>
          </div>
        ) : (
          <>
            {activeSongs.map(song => {
              const isOwn = !isViewingOther && song.player_id === player.id
              const songComments = activeComments.filter(comment => comment.song_id === song.id)
              const currentVote = draftVotes[song.id] || 0
              return (
                <article className={`song-card voting-song-card ${isViewingOther ? 'is-no-vote' : ''} ${currentVote > 0 ? 'has-votes' : ''}`} key={song.id}>
                  <div className="song-card-main">
                    <div>
                      <h2>{song.title}</h2>
                      <p>{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
                      {song.submitter_note && <p className="note">{song.submitter_note}</p>}
                    </div>
                  </div>

                  <div className="song-actions voting-song-actions">
                    {song.link && <a href={song.link} target="_blank" rel="noreferrer">{serviceLabelForUrl(song.link)}</a>}
                    {serviceLabelForUrl(song.link) !== 'Spotify' && <a href={searchUrl('spotify', song)} target="_blank" rel="noreferrer">Spotify</a>}
                    <a href={searchUrl('tidal', song)} target="_blank" rel="noreferrer">TIDAL</a>
                    <a href={searchUrl('youtube', song)} target="_blank" rel="noreferrer">YouTube</a>
                  </div>

                  {!isViewingOther && (
                    <div className="vote-control vote-column">
                      <button
                        type="button"
                        className="icon-btn primary"
                        aria-label={`Add a vote for ${song.title}`}
                        onClick={() => isOwn ? setSelfVoteSong(song) : adjustVote(song, 1)}
                        disabled={!isOwn && pointsRemaining <= 0}
                      >↑</button>
                      <strong className="vote-count-pop" key={`${song.id}-${currentVote}`}>{currentVote}</strong>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove a vote for ${song.title}`}
                        onClick={() => isOwn ? setSelfVoteSong(song) : adjustVote(song, -1)}
                        disabled={!isOwn && (draftVotes[song.id] || 0) <= 0}
                      >↓</button>
                    </div>
                  )}

                  <CommentThread
                    comments={songComments}
                    player={player}
                    revealAuthors={false}
                    anonymousLabelFor={anonymousLabelFor}
                    songId={song.id}
                    onChanged={onChanged}
                    roundId={round.id}
                    compact
                  />
                </article>
              )
            })}
          </>
        )}
      </section>
      {selfVoteSong && (
        <div className="self-vote-modal-backdrop" role="presentation" onMouseDown={() => setSelfVoteSong(null)}>
          <section className="self-vote-modal" role="dialog" aria-modal="true" aria-labelledby="self-vote-title" onMouseDown={event => event.stopPropagation()}>
            <p className="eyebrow">Nice try</p>
            <h2 id="self-vote-title">You can’t vote for your own song.</h2>
            <img className="self-vote-image" src="/oopsies-dog.png" alt="A dog giving a skeptical side-eye" />
            <button type="button" className="btn btn-primary" onClick={() => setSelfVoteSong(null)}>Oopsies</button>
          </section>
        </div>
      )}
    </section>
  )
}

function VoteTokenBank({ total, used }) {
  const tokenCount = Math.max(0, Number(total) || 0)
  const spentCount = Math.min(tokenCount, Math.max(0, Number(used) || 0))
  return (
    <div className={`token-bank ${spentCount >= tokenCount ? 'bank-locked' : ''}`} aria-label={`${tokenCount - spentCount} voting points remaining`}>
      {Array.from({ length: tokenCount }).map((_, index) => (
        <span className={`point-token ${index < spentCount ? 'spent' : ''}`} key={index} />
      ))}
    </div>
  )
}

function AnonymousPersonaCard({ name }) {
  return (
    <div className="persona-card">
      <span className="eyebrow">Comment alias</span>
      <strong>{name}</strong>
    </div>
  )
}
