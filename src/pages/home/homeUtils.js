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

export function commentsForEntry(comments, entry) {
  const ids = new Set(entry.member_song_ids || [entry.canonical_song_id])
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

export function copyTextFor(items) {
  return items
    .map((song, index) => {
      const album = song.album ? ` (${song.album})` : ''
      const link = song.link ? `\n   ${song.link}` : ''
      return `${index + 1}. ${song.artist} - ${song.title}${album}${link}`
    })
    .join('\n')
}
