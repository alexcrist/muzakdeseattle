import { useMemo, useState } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { deleteComment as removeComment, postComment as saveComment, toggleCommentLike } from '../../lib/mutations.js'

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY

export default function CommentThread({ comments, commentLikes = [], player, revealAuthors, anonymousLabelFor, songId, roundId, onChanged, compact = false }) {
  const [body, setBody] = useState('')
  const [gif, setGif] = useState(null)
  const [gifPickerOpen, setGifPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [likingCommentId, setLikingCommentId] = useState(null)
  const [deletingCommentId, setDeletingCommentId] = useState(null)
  const [error, setError] = useState('')
  const likesByCommentId = useMemo(() => commentLikes.reduce((result, like) => {
    const likes = result.get(like.comment_id) || []
    likes.push(like)
    result.set(like.comment_id, likes)
    return result
  }, new Map()), [commentLikes])

  async function postComment(event) {
    event?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed && !gif) return

    setSaving(true)
    setError('')
    const { error: insertError } = await saveComment({
      roundId,
      songId,
      playerId: player.id,
      body: trimmed,
      gifUrl: gif?.url,
      gifPreviewUrl: gif?.previewUrl,
      gifProvider: gif?.provider,
      gifId: gif?.id,
    })
    setSaving(false)
    if (insertError) {
      setError('Could not post comment.')
      return
    }
    setBody('')
    setGif(null)
    setGifPickerOpen(false)
    onChanged()
  }

  function selectGif(nextGif) {
    setGif(nextGif)
    setGifPickerOpen(false)
  }

  async function likeComment(commentId) {
    const likes = likesByCommentId.get(commentId) || []
    const liked = likes.some(like => like.player_id === player.id)
    setLikingCommentId(commentId)
    setError('')
    const { error: likeError } = await toggleCommentLike({ commentId, playerId: player.id, liked })
    setLikingCommentId(null)
    if (likeError) {
      setError('Could not update like.')
      return
    }
    onChanged()
  }

  async function deleteComment(commentId) {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return

    setDeletingCommentId(commentId)
    setError('')
    const { error: deleteError } = await removeComment({ commentId, playerId: player.id })
    setDeletingCommentId(null)
    if (deleteError) {
      setError('Could not delete comment.')
      return
    }
    onChanged()
  }

  return (
    <div className={`comments-block ${compact ? 'compact-comments' : ''}`}>
      {comments.length > 0 && (
        <div className="comments-list">
          {comments.map(comment => {
            const isMine = comment.player_id === player.id
            const author = revealAuthors ? comment.players : null
            const anonymousName = anonymousLabelFor ? anonymousLabelFor(comment.player_id) : 'Anonymous'
            const likes = likesByCommentId.get(comment.id) || []
            const liked = likes.some(like => like.player_id === player.id)
            return (
              <div className={`comment ${author ? '' : 'anonymous-comment'}`} key={comment.id}>
                {compact && <span className="comment-mark" aria-hidden="true">↳</span>}
                {!compact && (author ? (
                  <Avatar player={author} size="xs" />
                ) : (
                  <Avatar player={{ id: `anon-${roundId}-${comment.player_id}`, name: anonymousName }} size="xs" />
                ))}
                <div>
                  <strong className={author ? '' : 'anon-name'}>{author ? `${author.name}${isMine ? ' (you)' : ''}` : `${anonymousName}${isMine ? ' (you)' : ''}`}</strong>
                  {comment.body && <p>{comment.body}</p>}
                  {comment.gif_url && (
                    <img
                      className="comment-gif"
                      src={comment.gif_preview_url || comment.gif_url}
                      alt={comment.body ? `GIF attached to comment: ${comment.body}` : 'GIF comment'}
                      loading="lazy"
                    />
                  )}
                  <div className="comment-actions">
                    <button
                      type="button"
                      className={`comment-like ${liked ? 'is-liked' : ''}`}
                      onClick={() => likeComment(comment.id)}
                      disabled={likingCommentId === comment.id}
                      aria-pressed={liked}
                      aria-label={`${liked ? 'Unlike' : 'Like'} this comment${likes.length ? `, ${likes.length} like${likes.length === 1 ? '' : 's'}` : ''}`}
                    >
                      <span aria-hidden="true">♥</span>{likes.length > 0 && <span>{likes.length}</span>}
                    </button>
                    {isMine && (
                      <button
                        type="button"
                        className="comment-delete"
                        onClick={() => deleteComment(comment.id)}
                        disabled={deletingCommentId === comment.id}
                        aria-label="Delete your comment"
                        title="Delete comment"
                      >
                        {deletingCommentId === comment.id ? '…' : (
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M3 4h10M6 4V2h4v2M5 6v6M8 6v6M11 6v6M4 4l.6 10h6.8L12 4" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
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
        <button type="button" className="btn btn-secondary btn-sm gif-toggle" onClick={() => setGifPickerOpen(open => !open)} aria-expanded={gifPickerOpen}>
          GIF
        </button>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={saving || (!body.trim() && !gif)}>
          Post
        </button>
      </form>
      {gif && (
        <div className="selected-gif">
          <img src={gif.previewUrl || gif.url} alt="Selected GIF" />
          <button type="button" className="icon-btn" onClick={() => setGif(null)} aria-label="Remove selected GIF">×</button>
        </div>
      )}
      {gifPickerOpen && <GifPicker onSelect={selectGif} onError={setError} compact={compact} />}
      {error && <p className="error-msg">{error}</p>}
    </div>
  )
}

function GifPicker({ onSelect, onError, compact }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  async function search(event) {
    event.preventDefault()
    const term = query.trim()
    if (!term || !GIPHY_API_KEY) return

    setSearching(true)
    onError('')
    try {
      const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(GIPHY_API_KEY)}&q=${encodeURIComponent(term)}&limit=12&rating=pg-13`)
      if (!response.ok) throw new Error('GIF search failed')
      const payload = await response.json()
      setResults((payload.data || []).map(item => ({
        id: item.id,
        provider: 'giphy',
        url: item.images?.original?.url || item.images?.fixed_width?.url,
        previewUrl: item.images?.fixed_width?.url || item.images?.original?.url,
        alt: item.title || 'GIF result',
      })).filter(item => item.url))
    } catch {
      onError('Could not search GIFs. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className={`gif-picker ${compact ? 'compact-gif-picker' : ''}`}>
      {GIPHY_API_KEY ? (
        <>
          <form className="gif-search-form" onSubmit={search}>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search GIFs" aria-label="Search GIFs" />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={searching || !query.trim()}>{searching ? 'Searching…' : 'Search'}</button>
          </form>
          {results.length > 0 && <div className="gif-results">
            {results.map(result => <button type="button" key={result.id} onClick={() => onSelect(result)} title={result.alt} aria-label={`Choose GIF: ${result.alt}`}><img src={result.previewUrl} alt="" loading="lazy" /></button>)}
          </div>}
          <p className="gif-credit">Powered by GIPHY</p>
        </>
      ) : (
        <p className="gif-helper">GIF search is not available yet.</p>
      )}
    </div>
  )
}
