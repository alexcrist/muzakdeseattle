import { useState } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { postComment as saveComment } from '../../lib/mutations.js'

export default function CommentThread({ comments, player, revealAuthors, anonymousLabelFor, songId, roundId, onChanged }) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function postComment(event) {
    event?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return

    setSaving(true)
    setError('')
    const { error: insertError } = await saveComment({
      roundId,
      songId,
      playerId: player.id,
      body: trimmed,
    })
    setSaving(false)
    if (insertError) {
      setError('Could not post comment.')
      return
    }
    setBody('')
    onChanged()
  }

  return (
    <div className="comments-block">
      {comments.length > 0 && (
        <div className="comments-list">
          {comments.map(comment => {
            const isMine = comment.player_id === player.id
            const author = revealAuthors ? comment.players : null
            const anonymousName = anonymousLabelFor ? anonymousLabelFor(comment.player_id) : 'Anonymous'
            return (
              <div className={`comment ${author ? '' : 'anonymous-comment'}`} key={comment.id}>
                {author ? (
                  <Avatar player={author} size="xs" />
                ) : (
                  <Avatar player={{ id: `anon-${roundId}-${comment.player_id}`, name: anonymousName }} size="xs" />
                )}
                <div>
                  <strong className={author ? '' : 'anon-name'}>{author ? `${author.name}${isMine ? ' (you)' : ''}` : `${anonymousName}${isMine ? ' (you)' : ''}`}</strong>
                  <p>{comment.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form className="comment-form" onSubmit={postComment}>
        <input
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder={revealAuthors ? 'Add appreciation...' : 'Leave an anonymous comment...'}
        />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={saving || !body.trim()}>
          Post
        </button>
      </form>
      {error && <p className="error-msg">{error}</p>}
    </div>
  )
}

export function RoundThread({ comments, player, revealAuthors, anonymousLabelFor, roundId, onChanged }) {
  return (
    <section className="song-card round-thread-card">
      <div>
        <p className="eyebrow">Round thread</p>
        <h2>General comments</h2>
      </div>
      <CommentThread
        comments={comments}
        player={player}
        revealAuthors={revealAuthors}
        anonymousLabelFor={anonymousLabelFor}
        songId={null}
        onChanged={onChanged}
        roundId={roundId}
      />
    </section>
  )
}
