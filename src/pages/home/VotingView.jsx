import { useMemo, useState } from 'react'
import useDebouncedVotes from '../../hooks/useDebouncedVotes.js'
import { anonymousNameFor } from '../../lib/anonymousNames.js'
import { groupLabel } from '../../lib/groups.js'
import { listeningOrderFor } from '../../lib/listeningOrder.js'
import CommentThread, { RoundThread } from './CommentThread.jsx'
import { generalComments, searchUrl, serviceLabelForUrl } from './homeUtils.js'
import ListeningOrderPanel from './ListeningOrderPanel.jsx'

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
  onChanged,
}) {
  const [viewingOtherGroup, setViewingOtherGroup] = useState(false)
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

  return (
    <section className="phase-layout">
      <aside className="side-panel">
        {mySide !== null && mySide !== undefined && (
          <div className="side-banner">
            <p className="eyebrow">Voting on</p>
            <h3 className={`side-name side-${mySide}`}>{groupLabel(mySide)}</h3>
          </div>
        )}
        <h2>Voting bank</h2>
        <p className="big-stat">{pointsRemaining}</p>
        <p>{pointsRemaining === 0 ? 'All points allocated.' : `${pointsTotal} points available.`}</p>
        <VoteTokenBank total={pointsTotal} used={pointsUsed} />
        {savingVotes && <p className="muted">Saving votes...</p>}
        {voteError && <p className="error-msg">{voteError}</p>}
        <AnonymousPersonaCard name={myAnonymousName} />
        <hr />
        <p className="eyebrow">Voters</p>
        <p>{voters.size}/{activePlayers.length} players have voted</p>
      </aside>

      <section className="song-stack">
        {canBrowseOtherGroup && (
          <div className="group-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={!isViewingOther}
              className={`group-tab ${!isViewingOther ? 'is-active' : ''}`}
              onClick={() => setViewingOtherGroup(false)}
            >
              My Group
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isViewingOther}
              className={`group-tab ${isViewingOther ? 'is-active' : ''}`}
              onClick={() => setViewingOtherGroup(true)}
            >
              Non-Voting Group
            </button>
          </div>
        )}

        {isViewingOther && (
          <p className="muted group-tab-note">
            Listen and comment here, but your voting points only count for My Group.
          </p>
        )}

        {!isViewingOther && (
          <RoundThread
            comments={generalComments(comments)}
            player={player}
            revealAuthors={false}
            anonymousLabelFor={anonymousLabelFor}
            onChanged={onChanged}
            roundId={round.id}
          />
        )}
        {activeSongs.length === 0 ? (
          <div className="empty-state">
            <h2>No songs yet</h2>
            <p>{isViewingOther ? 'Nobody in the non-voting group submitted a song.' : 'Voting is open, but nobody submitted a song.'}</p>
          </div>
        ) : (
          <>
            <ListeningOrderPanel items={activeSongs} />
            {activeSongs.map((song, index) => {
              const isOwn = !isViewingOther && song.player_id === player.id
              const songComments = activeComments.filter(comment => comment.song_id === song.id)
              const currentVote = draftVotes[song.id] || 0
              return (
                <article className={`song-card ${isOwn ? 'is-own' : ''} ${currentVote > 0 ? 'has-votes' : ''}`} key={song.id}>
                  <div className="song-card-main">
                    <span className="song-number">{index + 1}</span>
                    <div>
                      <h2>{song.title}</h2>
                      <p>{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
                      <div className="song-actions">
                        {song.link && <a href={song.link} target="_blank" rel="noreferrer">{serviceLabelForUrl(song.link)}</a>}
                        <a href={searchUrl('youtube', song)} target="_blank" rel="noreferrer">YouTube</a>
                      </div>
                      {song.submitter_note && <p className="note">{song.submitter_note}</p>}
                    </div>
                  </div>

                  <div className="vote-control">
                    {isViewingOther ? (
                      <span className="soft-tag">Not your vote</span>
                    ) : isOwn ? (
                      <span className="soft-tag">Your song</span>
                    ) : (
                      <>
                        <button type="button" className="icon-btn" onClick={() => adjustVote(song, -1)} disabled={(draftVotes[song.id] || 0) <= 0}>−</button>
                        <strong className="vote-count-pop" key={`${song.id}-${currentVote}`}>{currentVote}</strong>
                        <button type="button" className="icon-btn primary" onClick={() => adjustVote(song, 1)} disabled={pointsRemaining <= 0}>+</button>
                      </>
                    )}
                  </div>

                  <CommentThread
                    comments={songComments}
                    player={player}
                    revealAuthors={false}
                    anonymousLabelFor={anonymousLabelFor}
                    songId={song.id}
                    onChanged={onChanged}
                    roundId={round.id}
                  />
                </article>
              )
            })}
          </>
        )}
      </section>
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
      <span className="persona-symbol" aria-hidden="true">?</span>
      <div>
        <p className="eyebrow">Comment alias</p>
        <strong>{name}</strong>
      </div>
    </div>
  )
}
