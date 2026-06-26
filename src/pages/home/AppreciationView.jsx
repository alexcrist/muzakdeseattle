import { useMemo } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { listeningOrderFor } from '../../lib/listeningOrder.js'
import { buildSongEntries, entrySubmitterText } from '../../lib/scoring.js'
import CommentThread, { RoundThread } from './CommentThread.jsx'
import { commentsForEntry, generalComments, playerName } from './homeUtils.js'
import ListeningOrderPanel from './ListeningOrderPanel.jsx'

export default function AppreciationView({ round, player, songs, votes, comments, duplicateGroups, groupSongs, onChanged }) {
  const entries = buildSongEntries({ songs, votes, duplicateGroups, groupSongs })
  const listeningEntries = useMemo(() => (
    listeningOrderFor(entries, {
      roundId: round.id,
      playerId: player.id,
      getId: entry => entry.canonical_song_id || entry.id,
    })
  ), [entries, round.id, player.id])
  const winner = entries[0]

  return (
    <section className="song-stack">
      {winner && (
        <section className="winner-panel">
          <span className="eyebrow">Round winner</span>
          <h2>{winner.title}</h2>
          <p>{winner.artist} by {entrySubmitterText(winner)}</p>
          <strong>{winner.totalPoints} pts</strong>
        </section>
      )}

      <RevealCeremony entries={entries} comments={comments} />

      <RoundThread
        comments={generalComments(comments)}
        player={player}
        revealAuthors
        onChanged={onChanged}
        roundId={round.id}
      />

      {entries.length === 0 ? (
        <div className="empty-state">
          <h2>No songs to reveal</h2>
          <p>This round did not receive submissions.</p>
        </div>
      ) : (
        <>
          <ListeningOrderPanel items={listeningEntries} />
          {entries.map((entry, index) => (
            <article className={`song-card revealed ${index === 0 ? 'top-entry' : ''}`} key={entry.id}>
              <div className="results-row">
                <div className="song-card-main">
                  <span className="song-number">{index + 1}</span>
                  <div>
                    <div className="section-heading compact">
                      <h2>{entry.title}</h2>
                      {entry.isDuplicate && <span className="soft-tag">Merged duplicate</span>}
                    </div>
                    <p>{entry.artist}{entry.album ? ` · ${entry.album}` : ''}</p>
                    <div className="submitter-line">
                      {entry.submitters.map(submitter => (
                        <span key={submitter.id}>
                          <Avatar player={submitter} size="sm" />
                          {playerName(submitter)}
                        </span>
                      ))}
                    </div>
                    {entry.submitter_note && <p className="note">{entry.submitter_note}</p>}
                    {entry.isDuplicate && (
                      <p className="merge-note">
                        {entry.votePoints} vote pts + {entry.courtesyPoints} courtesy pt{entry.courtesyPoints === 1 ? '' : 's'}
                        {entry.ineligiblePoints > 0 ? ` · ${entry.ineligiblePoints} self-vote pt${entry.ineligiblePoints === 1 ? '' : 's'} removed` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="score-badge">
                  <strong>{entry.totalPoints}</strong>
                  <span>pts</span>
                </div>
              </div>

              <CommentThread
                comments={commentsForEntry(comments, entry)}
                player={player}
                revealAuthors
                songId={entry.canonical_song_id}
                onChanged={onChanged}
                roundId={round.id}
              />
            </article>
          ))}
        </>
      )}
    </section>
  )
}

function RevealCeremony({ entries, comments }) {
  return (
    <section className="reveal-ceremony">
      <span className="phase-pill phase-appreciation">Masks off</span>
      <div>
        <h2>The round is revealed</h2>
        <p>{entries.length} songs · {comments.length} comments · no more mystery names</p>
      </div>
    </section>
  )
}
