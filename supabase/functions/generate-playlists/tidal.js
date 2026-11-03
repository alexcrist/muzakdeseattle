import { checked, digest, JobError, rateLimitedRequest, requiredEnv } from './http.js'

const API = 'https://openapi.tidal.com/v2'
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token'
const COUNTRY = 'US'

const resourceMap = resources => new Map((resources || []).map(resource => [`${resource.type}:${resource.id}`, resource]))

function toCandidate(resource, included) {
  const attributes = resource.attributes || {}
  const related = name => (resource.relationships?.[name]?.data || []).map(link => included.get(`${link.type}:${link.id}`)).filter(Boolean)
  return {
    id: resource.id, title: attributes.title || '', version: attributes.version || '',
    artists: related('artists').map(artist => artist.attributes?.name || ''),
    albums: related('albums').map(album => ({ title: album.attributes?.title || '', releaseDate: album.attributes?.releaseDate || null })),
    duration: attributes.duration, explicit: attributes.explicit, isrc: attributes.isrc,
  }
}

export function tidalClient(db, deadline) {
  const jsonRequest = rateLimitedRequest(db, 'tidal')
  let catalogTokenPromise
  // Catalog calls share one queue, including retry waits. Matching can still
  // overlap OpenAI calls without sending bursts to Tidal.
  let catalogQueue = Promise.resolve()
  let catalogRateLimited = false
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
    const send = () => jsonRequest('Tidal', url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json',
        ...(body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, until)
    if (!catalog) return send()
    const pending = catalogQueue.then(async () => {
      if (catalogRateLimited) throw new JobError('Tidal search is paused after a rate limit. This song is still pending.', true)
      if (Date.now() + 1500 >= until) throw new JobError('Tidal search ran out of time. This song is still pending.', true)
      try {
        return await send()
      } catch (error) {
        if (error.status === 429) {
          catalogRateLimited = true
          throw new JobError('Tidal reached its rate limit. This song is still pending.', true)
        }
        throw error
      }
    })
    catalogQueue = pending.then(() => undefined, () => undefined)
    return pending
  }

  async function search(song, count, until) {
    const query = `${song.title} ${song.artist}`.trim().slice(0, 256)
    // One request: the search result plus its tracks and their artists and
    // albums. This used to take three serialized catalog calls per song.
    const result = await request(`/searchResults?${new URLSearchParams({
      'filter[query]': query, include: 'tracks.artists,tracks.albums',
    })}`, { catalog: true, until })
    if (!Array.isArray(result?.data)) throw new JobError('Tidal returned incomplete search results.', true)
    const searchResult = result.data[0]
    if (!searchResult) return []
    const order = searchResult.relationships?.tracks?.data
    if (!Array.isArray(order)) throw new JobError('Tidal returned incomplete search results.', true)
    const ids = [...new Set(order.filter(row => row.type === 'tracks').map(row => row.id))].slice(0, count)
    if (!ids.length) return []
    const included = resourceMap(result.included)
    if (ids.some(id => !included.has(`tracks:${id}`))) {
      throw new JobError('Tidal did not return all candidate details; matching is still pending.', true)
    }
    // Included resources arrive in their own order; the relationship list holds relevance order.
    return ids.map(id => toCandidate(included.get(`tracks:${id}`), included))
  }

  // Every Tidal release of one recording, from an ISRC another service matched.
  async function findByIsrc(isrc, until) {
    const result = await request(`/tracks?${new URLSearchParams({ 'filter[isrc]': isrc, include: 'artists,albums' })}`, { catalog: true, until })
    if (!Array.isArray(result?.data)) throw new JobError('Tidal returned incomplete ISRC results.', true)
    const included = resourceMap(result.included)
    return result.data.filter(resource => resource.type === 'tracks').map(resource => toCandidate(resource, included))
  }

  async function items(playlistId) {
    const rows = []
    let path = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`
    const visited = new Set()
    while (path) {
      if (visited.has(path) || visited.size >= 100) throw new JobError('Tidal playlist pagination could not be completed.')
      visited.add(path)
      const page = await request(path)
      if (!Array.isArray(page?.data)) throw new JobError('Tidal returned incomplete playlist contents.', true)
      rows.push(...page.data)
      const next = page.links?.next
      const href = typeof next === 'string' ? next : next?.href
      path = href ? new URL(href, `${API}/playlists/${encodeURIComponent(playlistId)}/relationships/items`).toString() : null
    }
    return rows
  }

  async function fillPlaylist(playlistId, trackIds, runId) {
    const path = `/playlists/${encodeURIComponent(playlistId)}`
    const existing = new Set((await items(playlistId)).filter(item => item.type === 'tracks').map(item => item.id))
    const missing = [...new Set(trackIds)].filter(id => !existing.has(id))
    for (let offset = 0; offset < missing.length; offset += 50) {
      const data = missing.slice(offset, offset + 50).map(id => ({ type: 'tracks', id }))
      await request(`${path}/relationships/items`, {
        method: 'POST', body: { data, meta: { onDuplicates: 'SKIP' } },
        key: `add-${await digest(JSON.stringify([playlistId, runId, data]))}`,
      })
    }
    const [published, finalItems] = await Promise.all([request(path), items(playlistId)])
    if (published?.data?.attributes?.accessType !== 'PUBLIC') throw new JobError('Tidal playlist is not public. Review its sharing settings in Tidal.')
    const finalIds = new Set(finalItems.filter(item => item.type === 'tracks').map(item => item.id))
    if (trackIds.some(id => !finalIds.has(id))) throw new JobError('Tidal has not added every matched track yet.', true)
    return { id: playlistId, url: `https://tidal.com/playlist/${encodeURIComponent(playlistId)}` }
  }

  async function createPlaylist(playlist, trackIds, runId, onCreated) {
    let playlistId
    try {
      const created = await request('/playlists', { method: 'POST', body: playlist.create_payload, key: playlist.create_key })
      playlistId = created?.data?.id
      if (!playlistId) throw new JobError('Tidal did not return the created playlist ID.')
      await onCreated({ id: playlistId, url: `https://tidal.com/playlist/${encodeURIComponent(playlistId)}` })
    } catch {
      // The provider may have created it even if the response/link save failed.
      throw new JobError('Tidal playlist creation could not be confirmed. Check the account and save its link in Admin before retrying.')
    }
    return fillPlaylist(playlistId, trackIds, runId)
  }

  return { search, findByIsrc, createPlaylist, fillPlaylist }
}
