import { checked, JobError, rateLimitedRequest, requiredEnv } from './http.js'

const API = 'https://api.spotify.com/v1'

export function spotifyClient(db, deadline) {
  const jsonRequest = rateLimitedRequest(db, 'spotify')
  let tokenPromise

  async function userToken() {
    const saved = await checked(db.rpc('playlist_get_oauth', { p_service: 'spotify' }), 'Could not read the Spotify connection.')
    if (!saved?.refresh_token) throw new JobError('Connect the playlist owner with npm run spotify:connect.')
    if (saved.access_token && saved.expires_at > Date.now() + 60000) return saved.access_token
    const result = await jsonRequest('Spotify account authorization', 'https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${requiredEnv('SPOTIFY_CLIENT_ID')}:${requiredEnv('SPOTIFY_CLIENT_SECRET')}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refresh_token }),
    }, deadline)
    if (!result?.access_token) throw new JobError('Spotify did not refresh the account token. Reconnect Spotify.')
    await checked(db.rpc('playlist_save_oauth', { p_service: 'spotify', p_credentials: {
      access_token: result.access_token, refresh_token: result.refresh_token || saved.refresh_token,
      expires_at: Date.now() + Number(result.expires_in || 3600) * 1000,
    } }), 'Could not save the refreshed Spotify connection.')
    return result.access_token
  }

  async function request(path, { method = 'GET', body, until = deadline, attempts = 3 } = {}) {
    const url = new URL(path.startsWith('/') ? `${API}${path}` : path, API)
    if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) throw new JobError('Spotify returned an unexpected pagination URL.')
    const token = await (tokenPromise ||= userToken())
    const operation = method === 'POST' && url.pathname === '/v1/me/playlists' ? 'playlist creation'
      : url.pathname.endsWith('/items') ? (method === 'POST' ? 'adding tracks' : 'reading tracks') : 'catalog/account request'
    return jsonRequest(`Spotify ${operation}`, url, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, until, attempts)
  }

  async function search(song, count, until) {
    const result = await request(`/search?${new URLSearchParams({
      q: `${song.title} ${song.artist}`.trim().slice(0, 256), type: 'track', market: 'US', limit: String(Math.min(count, 10)),
    })}`, { until })
    return (result.tracks?.items || []).filter(track => track && track.is_playable !== false && !track.restrictions).map(track => ({
      id: track.id, title: track.name, version: '',
      artists: track.artists.map(artist => artist.name),
      albums: [{ title: track.album.name, releaseDate: track.album.release_date }],
      duration: `${track.duration_ms}ms`, explicit: track.explicit, isrc: track.external_ids?.isrc || null,
    }))
  }

  async function collect(path, field = 'items') {
    const rows = []
    const visited = new Set()
    while (path) {
      if (visited.has(path) || visited.size >= 100) throw new JobError('Spotify playlist pagination could not be completed.')
      visited.add(path)
      const page = await request(path)
      rows.push(...(page[field] || []))
      path = page.next || null
    }
    return rows
  }

  async function createPlaylist(playlist, trackIds, _runId, onCreated) {
    // No account-wide recovery scan or persisted provider ID. Muzak's visible
    // round links are the only source of truth for skipping a side.
    const created = await request('/me/playlists', {
      method: 'POST', attempts: 1,
      body: {
        name: playlist.create_payload.name,
        public: true,
      },
    })
    const playlistId = created?.id
    if (!playlistId) throw new JobError('Spotify did not return the created playlist ID.')
    await onCreated({ id: playlistId, url: `https://open.spotify.com/playlist/${encodeURIComponent(playlistId)}` })
    const path = `/playlists/${encodeURIComponent(playlistId)}`
    const uris = trackIds.map(id => `spotify:track:${id}`)
    // Populate only the playlist created in this invocation; never replace items.
    for (let offset = 0; offset < uris.length; offset += 100) {
      await request(`${path}/items`, { method: 'POST', body: { uris: uris.slice(offset, offset + 100) }, attempts: 1 })
    }
    const [published, items] = await Promise.all([request(path), collect(`${path}/items?limit=50&market=US`)])
    if (published.public !== true) throw new JobError('Spotify did not publish the playlist. Review it directly in Spotify; retries leave existing playlists untouched.')
    const actual = new Set(items.map(row => row.item || row.track).filter(Boolean).flatMap(track => [track.id, track.linked_from?.id].filter(Boolean)))
    if (trackIds.some(id => !actual.has(id))) throw new JobError('Spotify did not add every matched track. Some recordings may be unavailable.')
    return { id: playlistId, url: `https://open.spotify.com/playlist/${encodeURIComponent(playlistId)}` }
  }

  return { search, createPlaylist }
}
