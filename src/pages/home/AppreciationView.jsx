import { useMemo } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { groupLabel } from '../../lib/groups.js'
import { buildSongEntries, rankEntries } from '../../lib/scoring.js'
import CommentThread from './CommentThread.jsx'
import { commentsForEntry, playerName } from './homeUtils.js'
import PlaylistPanel from './PlaylistPanel.jsx'

export default function AppreciationView({ round, player, songs, votes, comments, commentLikes, duplicateGroups, groupSongs, playlists = [], sides, onChanged }) {
  const entries = useMemo(() => buildSongEntries({
    songs,
    votes,
    duplicateGroups,
    groupSongs,
    sideByPlayerId: sides?.isSplit ? sides.sideByPlayerId : null,
  }), [songs, votes, duplicateGroups, groupSongs, sides])

  const rankedEntries = useMemo(() => rankEntries(entries), [entries])

  return (
    <section className="song-stack">
      {entries.length === 0 ? (
        <div className="empty-state">
          <h2>No songs to reveal</h2>
          <p>This round did not receive submissions.</p>
        </div>
      ) : (
        <>
          <PlaylistPanel playlists={playlists} showSides={Boolean(sides?.isSplit)} />

          <p className="eyebrow">Final ranking</p>

          {rankedEntries.map(entry => (
            <article className={`song-card revealed ${entry.rank === 1 && entry.totalPoints > 0 ? 'top-entry' : ''}`} key={entry.id}>
              <div className="results-row">
                <div className="song-card-main">
                  <span className="song-number">{entry.rank}</span>
                  <div>
                    <div className="section-heading compact">
                      <h2>{entry.title}</h2>
                      {entry.side !== null && entry.side !== undefined && (
                        <span className={`side-tag side-${entry.side}`}>{groupLabel(entry.side)}</span>
                      )}
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
                commentLikes={commentLikes}
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
