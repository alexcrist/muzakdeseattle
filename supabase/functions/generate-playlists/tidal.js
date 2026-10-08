import { checked, digest, JobError, jsonRequest, requiredEnv } from './http.js'

const API = 'https://openapi.tidal.com/v2'
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token'
const COUNTRY = 'US'

export function tidalClient(db, deadline) {
  let catalogTokenPromise
  let userTokenPromise
  const clientId = requiredEnv('TIDAL_CLIENT_ID')

  async function catalogToken() {
    const result = await jsonRequest('Tidal catalog authorization', TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${requiredEnv('TIDAL_CLIENT_SECRET')}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    }, deadline)
    if (!result?.access_token) throw new JobError('Tidal did not return a catalog token.')
    return result.access_token
  }

  async function userToken() {
    const saved = await checked(db.rpc('playlist_get_oauth', { p_service: 'tidal' }), 'Could not read the Tidal connection.')
    if (!saved?.refresh_token) throw new JobError('Connect the playlist owner with npm run tidal:connect.')
    if (saved.access_token && saved.expires_at > Date.now() + 60000) return saved.access_token
    const result = await jsonRequest('Tidal account authorization', TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refresh_token, client_id: clientId }),
    }, deadline)
    if (!result?.access_token) throw new JobError('Tidal did not refresh the account token. Reconnect Tidal.')
    await checked(db.rpc('playlist_save_oauth', { p_service: 'tidal', p_credentials: {
      access_token: result.access_token,
      refresh_token: result.refresh_token || saved.refresh_token,
      expires_at: Date.now() + Number(result.expires_in || 3600) * 1000,
    } }), 'Could not save the refreshed Tidal connection.')
    return result.access_token
  }

  async function request(path, { method = 'GET', body, catalog = false, key, until = deadline } = {}) {
    const url = new URL(path.startsWith('/') ? `${API}${path}` : path, API)
    if (url.origin !== 'https://openapi.tidal.com' || !url.pathname.startsWith('/v2/')) throw new JobError('Tidal returned an unexpected pagination URL.')
    if (method === 'GET') url.searchParams.set('countryCode', COUNTRY)
    const token = catalog
      ? await (catalogTokenPromise ||= catalogToken())
      : await (userTokenPromise ||= userToken())
    return jsonRequest('Tidal', url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json',
        ...(body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, until)
  }

  async function search(song, count, until) {
    const query = `${song.title} ${song.artist}`.trim().slice(0, 256)
    const searchResult = await request(`/searchResults?${new URLSearchParams({ 'filter[query]': query })}`, { catalog: true, until })
    const searchId = searchResult?.data?.[0]?.id
    if (!searchId) return []
    const found = await request(`/searchResults/${encodeURIComponent(searchId)}/relationships/tracks`, { catalog: true, until })
    const ids = [...new Set((found?.data || []).filter(row => row.type === 'tracks').map(row => row.id))].slice(0, count)
    if (!ids.length) return []
    const details = await request(`/tracks?${new URLSearchParams({ 'filter[id]': ids.join(','), include: 'artists,albums' })}`, { catalog: true, until })
    const included = new Map((details.included || []).map(resource => [`${resource.type}:${resource.id}`, resource]))
    const tracks = new Map((details.data || []).map(resource => [resource.id, resource]))
    // Preserve search relevance order; the /tracks response can use its own order.
    return ids.flatMap(id => {
      const resource = tracks.get(id)
      if (!resource) return []
      const attributes = resource.attributes || {}
      const related = name => (resource.relationships?.[name]?.data || []).map(link => included.get(`${link.type}:${link.id}`)).filter(Boolean)
      return [{
        id, title: attributes.title || '', version: attributes.version || '',
        artists: related('artists').map(artist => artist.attributes?.name || ''),
        albums: related('albums').map(album => ({ title: album.attributes?.title || '', releaseDate: album.attributes?.releaseDate || null })),
        duration: attributes.duration, explicit: attributes.explicit, isrc: attributes.isrc,
      }]
    })
  }

  async function items(playlistId) {
    const rows = []
    let path = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`
    const visited = new Set()
    while (path) {
      if (visited.has(path) || visited.size >= 100) throw new JobError('Tidal playlist pagination could not be completed.')
      visited.add(path)
      const page = await request(path)
      rows.push(...(page.data || []))
      const next = page.links?.next
      const href = typeof next === 'string' ? next : next?.href
      path = href ? new URL(href, `${API}/playlists/${encodeURIComponent(playlistId)}/relationships/items`).toString() : null
    }
    return rows
  }

  async function syncPlaylist(playlist, trackIds, runId) {
    let playlistId = playlist.playlist_id
    if (!playlistId) {
      // The payload and key are saved before the request, so a crash between
      // creation and saving the response can replay the exact operation.
      const created = await request('/playlists', { method: 'POST', body: playlist.create_payload, key: playlist.create_key })
      playlistId = created?.data?.id
      if (!playlistId) throw new JobError('Tidal did not return the created playlist ID.')
      await checked(db.from('playlist_managed_playlists').update({
        playlist_id: playlistId, url: `https://tidal.com/playlist/${encodeURIComponent(playlistId)}`,
        updated_at: new Date().toISOString(),
      }).eq('service', 'tidal').eq('round_id', playlist.round_id).eq('group_index', playlist.group_index))
    }

    const path = `/playlists/${encodeURIComponent(playlistId)}`
    const visibility = { data: { type: 'playlists', id: playlistId, attributes: { accessType: 'PUBLIC' } } }
    await request(path, { method: 'PATCH', body: visibility, key: `public-${playlist.create_key}-${runId}` })

    const existing = await items(playlistId)
    const desired = new Set(trackIds)
    const kept = new Set()
    const remove = existing.filter(item => {
      if (item.type !== 'tracks' || !desired.has(item.id) || kept.has(item.id)) return true
      kept.add(item.id)
      return false
    })
    // Only playlists created by this integration reach this method. Updating
    // them reconciles corrected matches without changing songs or vote rows.
    for (let offset = 0; offset < remove.length; offset += 50) {
      const data = remove.slice(offset, offset + 50).map(item => {
        if (!item.meta?.itemId) throw new JobError('Tidal did not supply the item IDs needed to update this playlist.')
        return { type: item.type, id: item.id, meta: { itemId: item.meta.itemId } }
      })
      await request(`${path}/relationships/items`, { method: 'DELETE', body: { data }, key: `remove-${await digest(JSON.stringify([playlistId, runId, data]))}` })
    }
    const missing = trackIds.filter(id => !kept.has(id))
    for (let offset = 0; offset < missing.length; offset += 50) {
      const data = missing.slice(offset, offset + 50).map(id => ({ type: 'tracks', id }))
      await request(`${path}/relationships/items`, {
        method: 'POST', body: { data, meta: { onDuplicates: 'SKIP' } },
        key: `add-${await digest(JSON.stringify([playlistId, runId, data]))}`,
      })
    }

    const [published, finalItems] = await Promise.all([request(path), items(playlistId)])
    if (published?.data?.attributes?.accessType !== 'PUBLIC') throw new JobError('Tidal did not make the playlist public. Retry from Admin.')
    const finalIds = new Set(finalItems.filter(item => item.type === 'tracks').map(item => item.id))
    if (trackIds.some(id => !finalIds.has(id))) throw new JobError('Tidal could not add every matched track. Some recordings may be unavailable in the US.')
    return { id: playlistId, url: `https://tidal.com/playlist/${encodeURIComponent(playlistId)}` }
  }

  return { search, syncPlaylist }
}
