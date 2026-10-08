import { useMemo, useState } from 'react'
import SideRoster from '../../components/SideRoster.jsx'
import useDebouncedVotes from '../../hooks/useDebouncedVotes.js'
import { anonymousNameFor } from '../../lib/anonymousNames.js'
import { groupLabel } from '../../lib/groups.js'
import { listeningOrderFor } from '../../lib/listeningOrder.js'
import { votePointsByPlayer } from '../../lib/voteProgress.js'
import CommentThread from './CommentThread.jsx'
import { copyTextFor, indexCommentLikes, indexCommentsBySongId, searchUrl, serviceLabelForUrl } from './homeUtils.js'
import PlaylistPanel from './PlaylistPanel.jsx'

export default function VotingView({
  round,
  player,
  songs,
  votes,
  statusVotes = votes,
  comments,
  commentLikes,
  activePlayers,
  pointsTotal,
  mySide,
  otherSide,
  otherSideSongs = [],
  otherSideComments = [],
  playlists = [],
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
  const commentsBySongId = useMemo(() => indexCommentsBySongId(activeComments), [activeComments])
  const commentLikesIndex = useMemo(() => indexCommentLikes(commentLikes), [commentLikes])
  const activeSide = isViewingOther ? otherSide : (mySide ?? 0)
  const activePlaylists = playlists.filter(playlist => playlist.group_index === activeSide)
  const mySidePlayers = mySide === null ? activePlayers : allPlayers.filter(row => sides.sideByPlayerId[row.id] === mySide)
  const otherSidePlayers = otherSide === null ? [] : allPlayers.filter(row => sides.sideByPlayerId[row.id] === otherSide)
  const submittedIds = new Set([...songs, ...otherSideSongs].map(song => song.player_id))
  const {
    adjustVote,
    draftVotes,
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

  const rosterVotePoints = useMemo(() => {
    const pointsByPlayer = votePointsByPlayer(statusVotes)
    pointsByPlayer.set(player.id, pointsUsed)
    return pointsByPlayer
  }, [statusVotes, player.id, pointsUsed])

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
            <div className={`voting-side-roster roster-side-${mySide}`}>
              <h3 className={`side-name side-${mySide}`}>{groupLabel(mySide)}</h3>
              <SideRoster
                players={mySidePlayers}
                submittedIds={submittedIds}
                votePointsByPlayer={rosterVotePoints}
                pointsTotal={pointsTotal}
                currentPlayerId={player.id}
                phase="voting"
              />
            </div>
            <div className={`voting-side-roster roster-side-${otherSide}`}>
              <h3 className={`side-name side-${otherSide}`}>{groupLabel(otherSide)}</h3>
              <SideRoster
                players={otherSidePlayers}
                submittedIds={submittedIds}
                votePointsByPlayer={rosterVotePoints}
                pointsTotal={pointsTotal}
                currentPlayerId={player.id}
                phase="voting"
              />
            </div>
          </div>
        )}
        {(mySide === null || mySide === undefined) && (
          <div className="voting-sides">
            <SideRoster
              players={activePlayers}
              submittedIds={submittedIds}
              votePointsByPlayer={rosterVotePoints}
              pointsTotal={pointsTotal}
              currentPlayerId={player.id}
              phase="voting"
            />
          </div>
        )}
        <AnonymousPersonaCard name={myAnonymousName} />
      </aside>

      <section className="song-stack">
        <div className="phase-toolbar">
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

        <PlaylistPanel
          playlists={activePlaylists}
          roundId={round.id}
          side={activeSide}
          onChanged={onChanged}
        />

        {activeSongs.length === 0 ? (
          <div className="empty-state">
            <h2>No songs yet</h2>
            <p>{isViewingOther ? 'Nobody in the non-voting group submitted a song.' : 'Voting is open, but nobody submitted a song.'}</p>
          </div>
        ) : (
          <>
            {activeSongs.map(song => {
              const isOwn = !isViewingOther && song.player_id === player.id
              const songComments = commentsBySongId.get(song.id) || []
              const currentVote = draftVotes[song.id] || 0
              const linkedService = serviceLabelForUrl(song.link)
              return (
                <article className={`song-card voting-song-card ${isViewingOther ? 'is-no-vote' : ''}`} key={song.id}>
                  <div className="voting-song-header">
                    <div className="song-card-main">
                      <div>
                        <h2>{song.title}</h2>
                        <p>{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
                      </div>
                    </div>

                    <div className="song-actions song-service-actions voting-song-actions">
                      {song.link && <a href={song.link} target="_blank" rel="noreferrer">{linkedService}</a>}
                      {linkedService !== 'Spotify' && <a href={searchUrl('spotify', song)} target="_blank" rel="noreferrer">Spotify</a>}
                      {linkedService !== 'TIDAL' && <a href={searchUrl('tidal', song)} target="_blank" rel="noreferrer">TIDAL</a>}
                    </div>

                    {song.submitter_note && <p className="note">{song.submitter_note}</p>}
                  </div>

                  <CommentThread
                    comments={songComments}
                    commentLikes={commentLikes}
                    commentLikesIndex={commentLikesIndex}
                    player={player}
                    revealAuthors={false}
                    anonymousLabelFor={anonymousLabelFor}
                    songId={song.id}
                    submitterIds={[song.player_id]}
                    onChanged={onChanged}
                    roundId={round.id}
                    compact
                  />

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
            <img className="self-vote-image" src="/oopsies-dog-v2.webp" alt="A dog giving a skeptical side-eye" decoding="async" />
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
