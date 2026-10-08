export function safeError(error) {
  // Only messages constructed here are safe for the public admin panel.
  return error instanceof JobError ? error.message : 'The playlist worker encountered an unexpected error. Retry from Admin.'
}

export class JobError extends Error {}

export function requiredEnv(name) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new JobError(`Playlist setup is missing ${name}.`)
  return value
}

export async function jsonRequest(label, url, options = {}, deadline = Date.now() + 25000, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remaining = deadline - Date.now()
    if (remaining < 1500) throw new JobError(`${label} ran out of time. Retry from Admin to continue.`)
    let response
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(Math.min(25000, remaining)) })
    } catch {
      if (attempt + 1 < attempts && deadline - Date.now() > 5000) continue
      throw new JobError(`${label} could not be reached. Retry from Admin.`)
    }
    if (response.ok) {
      if (response.status === 204) return null
      try {
        const text = await response.text()
        return text.trim() ? JSON.parse(text) : null
      } catch { throw new JobError(`${label} returned an unreadable response.`) }
    }

    if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
      const retryHeader = response.headers.get('Retry-After')
      const seconds = retryHeader && /^\d+(\.\d+)?$/.test(retryHeader) ? Number(retryHeader) : null
      const retryAt = retryHeader ? Date.parse(retryHeader) : NaN
      const delay = seconds !== null ? seconds * 1000 : Number.isFinite(retryAt)
        ? Math.max(1000, retryAt - Date.now()) : response.status === 429 ? 60000 : 1000 * (attempt + 1)
      await response.body?.cancel()
      if (delay + 5000 < deadline - Date.now()) {
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
    } else {
      await response.body?.cancel()
    }

    if (response.status === 429) {
      const error = new JobError(`${label} reached its rate limit. Wait a few minutes, then retry from Admin.`)
      error.status = 429
      throw error
    }
    if (response.status === 401 || response.status === 403) throw new JobError(`${label} denied access. Check the API key or reconnect Tidal with playlist permissions.`)
    throw new JobError(`${label} returned HTTP ${response.status}. Retry from Admin; if it persists, check the integration setup.`)
  }
}

export async function checked(query, message = 'Could not save playlist progress.') {
  const { data, error } = await query
  if (error) throw new JobError(message)
  return data
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function mapConcurrent(items, concurrency, process) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await process(items[index], index)
    }
  }))
  const failed = workers.find(worker => worker.status === 'rejected')
  if (failed) throw failed.reason
  return results
}
