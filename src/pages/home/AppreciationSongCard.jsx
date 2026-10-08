import Avatar from '../../components/Avatar.jsx'
import CommentThread from './CommentThread.jsx'
import { commentsForEntry, playerName, searchUrl, serviceLabelForUrl } from './homeUtils.js'

export default function AppreciationSongCard({
  entry,
  comments = [],
  commentsBySongId = null,
  commentLikes = [],
  commentLikesIndex = null,
  player,
  roundId,
  onChanged,
  context = null,
  className = '',
  submitterNote = entry.submitter_note,
}) {
  const entryComments = commentsForEntry(comments, entry, commentsBySongId)
  const linkedService = serviceLabelForUrl(entry.link)

  return (
    <article className={`song-card appreciation-song-card revealed ${className}`.trim()}>
      <div className="appreciation-card-body">
        {context && <div className="appreciation-card-context">{context}</div>}

        <header className="appreciation-song-header">
          <div className="appreciation-track-copy">
            <div className="section-heading compact">
              <h2>{entry.title}</h2>
              {entry.isDuplicate && <span className="soft-tag">Merged duplicate</span>}
            </div>
            <p className="appreciation-byline">
              <strong>{entry.artist}</strong>
              {entry.album && <span>from {entry.album}</span>}
            </p>
            <div className="song-actions song-service-actions appreciation-song-actions">
              {entry.link && <a href={entry.link} target="_blank" rel="noreferrer">{linkedService}</a>}
              {linkedService !== 'Spotify' && <a href={searchUrl('spotify', entry)} target="_blank" rel="noreferrer">Spotify</a>}
              {linkedService !== 'TIDAL' && <a href={searchUrl('tidal', entry)} target="_blank" rel="noreferrer">TIDAL</a>}
            </div>
          </div>

          <div className="score-badge" aria-label={`${entry.totalPoints} point${entry.totalPoints === 1 ? '' : 's'}`}>
            <strong>{entry.totalPoints}</strong>
            <span>points</span>
          </div>
        </header>

        <div className="appreciation-submitters">
          <span className="appreciation-submitter-label">Submitted by</span>
          <div className="submitter-line">
            {entry.submitters.map(submitter => (
              <span className="appreciation-submitter" key={submitter.id}>
                <Avatar player={submitter} size="sm" />
                {playerName(submitter)}
              </span>
            ))}
          </div>
        </div>

        {submitterNote && <p className="note appreciation-note">“{submitterNote}”</p>}
        {entry.isDuplicate && (
          <p className="merge-note appreciation-merge-note">
            {entry.votePoints} vote pts + {entry.courtesyPoints} courtesy pt{entry.courtesyPoints === 1 ? '' : 's'}
            {entry.ineligiblePoints > 0 ? ` · ${entry.ineligiblePoints} self-vote pt${entry.ineligiblePoints === 1 ? '' : 's'} removed` : ''}
          </p>
        )}
      </div>

      <div className="appreciation-discussion">
        <div className="appreciation-discussion-heading">
          <span>Comments</span>
          <span>{entryComments.length} note{entryComments.length === 1 ? '' : 's'}</span>
        </div>
        <CommentThread
          comments={entryComments}
          commentLikes={commentLikes}
          commentLikesIndex={commentLikesIndex}
          player={player}
          revealAuthors
          songId={entry.canonical_song_id}
          submitterIds={entry.submitterIds}
          onChanged={onChanged}
          roundId={roundId}
        />
      </div>
    </article>
  )
}
