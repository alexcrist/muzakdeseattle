export function phaseTitle(phase) {
  if (phase === 'submission') return 'Submit your song'
  if (phase === 'voting') return 'Vote on the songs'
  if (phase === 'appreciation') return 'Appreciate the round'
  return 'Between phases'
}

export function phaseHint(phase) {
  if (phase === 'submission') return 'Songs stay editable until voting starts.'
  if (phase === 'voting') return 'Spend your points before the reveal.'
  if (phase === 'appreciation') return 'Masks are off. Results, submitters, and comment authors are live.'
  return 'The next active phase starts at midnight Pacific.'
}

export function playerName(player) {
  return player?.name || 'Unknown player'
}

export function indexCommentsBySongId(comments = []) {
  return comments.reduce((result, comment) => {
    if (!comment.song_id) return result
    const songComments = result.get(comment.song_id) || []
    songComments.push(comment)
    result.set(comment.song_id, songComments)
    return result
  }, new Map())
}

export function indexCommentLikes(commentLikes = []) {
  return commentLikes.reduce((result, like) => {
    const likes = result.get(like.comment_id) || []
    likes.push(like)
    result.set(like.comment_id, likes)
    return result
  }, new Map())
}

export function commentsForEntry(comments, entry, commentsBySongId = null) {
  const ids = new Set(entry.member_song_ids || [entry.canonical_song_id])
  if (commentsBySongId) {
    return [...ids].flatMap(songId => commentsBySongId.get(songId) || [])
  }
  return comments.filter(comment => ids.has(comment.song_id))
}

export function serviceLabelForUrl(url = '') {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('spotify.com')) return 'Spotify'
    if (host.includes('tidal.com')) return 'TIDAL'
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube'
    if (host.includes('bandcamp.com')) return 'Bandcamp'
    if (host.includes('soundcloud.com')) return 'SoundCloud'
    if (host.includes('music.apple.com')) return 'Apple Music'
  } catch {
    return 'Listen'
  }
  return 'Listen'
}

function songQuery(song) {
  return encodeURIComponent(`${song.artist || ''} ${song.title || ''}`.trim())
}

export function searchUrl(service, song) {
  const query = songQuery(song)
  if (service === 'spotify') return `https://open.spotify.com/search/${query}`
  if (service === 'tidal') return `https://tidal.com/search?q=${query}`
  return `https://www.youtube.com/results?search_query=${query}`
}

const TRACK_URLS = {
  spotify: id => `https://open.spotify.com/track/${encodeURIComponent(id)}`,
  tidal: id => `https://tidal.com/track/${encodeURIComponent(id)}`,
}

// The submitted link wins for its service, then a track matched during
// playlist creation, then a search. Any other submitted service stays first.
export function songServiceLinks(song) {
  const linkedService = song.link ? serviceLabelForUrl(song.link) : null
  const matchedUrl = service => {
    const trackId = (song.track_matches || []).find(match => match.service === service && match.track_id)?.track_id
    return trackId ? TRACK_URLS[service](trackId) : null
  }
  const serviceLink = (service, label) => ({
    label,
    href: (linkedService === label && song.link) || matchedUrl(service) || searchUrl(service, song),
  })
  return [
    ...(linkedService && linkedService !== 'Spotify' && linkedService !== 'TIDAL' ? [{ label: linkedService, href: song.link }] : []),
    serviceLink('spotify', 'Spotify'),
    serviceLink('tidal', 'TIDAL'),
  ]
}

export function copyTextFor(items) {
  return items
    .map((song, index) => {
      const album = song.album ? ` (${song.album})` : ''
      const link = song.link ? `\n   ${song.link}` : ''
      return `${index + 1}. ${song.artist} - ${song.title}${album}${link}`
    })
    .join('\n')
}
