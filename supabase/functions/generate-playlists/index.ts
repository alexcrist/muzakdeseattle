import { createClient } from 'npm:@supabase/supabase-js@2.39.0'
import { getLeagueContext } from '../../../src/lib/schedule.js'
import { buildRoundGroupAssignment, sidesForRound } from '../../../src/lib/groups.js'
import { listeningOrderFor } from '../../../src/lib/listeningOrder.js'
import { canRetry, checked, digest, JobError, mapConcurrent, requiredEnv, safeError } from './http.js'
import { chooseTrack, songFingerprint } from './matching.js'
import { tidalClient } from './tidal.js'
import { spotifyClient } from './spotify.js'

async function runJob(db, job) {
  const service = job.service
  const serviceName = service === 'tidal' ? 'TIDAL' : 'Spotify'
  // Free Supabase workers live for 150 seconds. Leave time to assemble playlists
  // and persist a useful result; successful song matches survive a manual retry.
  const deadline = Date.now() + 130000
  const matchingDeadline = Date.now() + 90000
  const updateJob = values => checked(db.from('playlist_jobs').update(values)
    .eq('service', service).eq('round_id', job.round_id).eq('run_id', job.run_id))

  const retryState = needed => ({
    retry_pending: needed && job.retry_count < 7 && job.attempts_today < 8,
    next_retry_at: needed && job.retry_count < 7 && job.attempts_today < 8
      ? new Date(Date.now() + Math.min(30, 5 * 2 ** job.retry_count) * 60000).toISOString() : null,
  })

  try {
    const [settings, rounds, config, players, groupRows, songs, previousMatches, linkedPlaylists] = await Promise.all([
      checked(db.from('league_settings').select('*').eq('id', 1).single()),
      checked(db.from('rounds').select('*').order('queue_position')),
      checked(db.from('playlist_automation_settings').select('*').eq('service', service).single()),
      checked(db.from('players').select('id, active').eq('active', true)),
      checked(db.from('round_groups').select('round_id, player_id, group_index')),
      checked(db.from('songs').select('id, round_id, player_id, title, artist, album, link, submitter_note').eq('round_id', job.round_id)),
      checked(db.from('playlist_song_matches').select('*').eq('service', service).eq('round_id', job.round_id)),
      checked(db.from('round_playlists').select('group_index, service, url').eq('round_id', job.round_id)),
    ])
    if (!config.enabled || !config.connected) throw new JobError(`${serviceName} automation is not connected and enabled.`)
    const context = getLeagueContext(rounds, settings)
    if (context.currentRound?.id !== job.round_id || !['voting', 'appreciation'].includes(context.phase)) {
      throw new JobError('This round is no longer current, or submissions are still open.')
    }
    if (!songs.length) throw new JobError('This round has no submitted songs yet.')

    let sides = sidesForRound(groupRows, job.round_id)
    if (!sides.isSplit) {
      const assignments = buildRoundGroupAssignment({
        roundId: job.round_id, activePlayers: players, rounds,
        priorGroupRows: groupRows.filter(row => row.round_id !== job.round_id),
      })
      if (assignments) {
        await checked(db.rpc('assign_round_groups', { p_round_id: job.round_id, p_assignments: assignments }))
        sides = sidesForRound(await checked(db.from('round_groups').select('round_id, player_id, group_index').eq('round_id', job.round_id)), job.round_id)
      }
    }
    if (sides.isSplit) {
      // Preserve established sides. Missing submitters are late joiners and use
      // the same balancing RPC as the app, never a second split or a shuffle.
      for (const song of songs) {
        if (sides.sideByPlayerId[song.player_id] !== undefined) continue
        const side = await checked(db.rpc('join_round_group', { p_round_id: job.round_id, p_player_id: song.player_id }))
        if (side !== 0 && side !== 1) throw new JobError('A submitted song could not be assigned to a side.')
        sides.sideByPlayerId[song.player_id] = side
      }
    }

    const sideIndexes = sides.isSplit ? [0, 1] : [0]
    const isServiceLink = row => {
      if (row.service?.trim().toLowerCase() === service) return true
      try {
        const hostname = new URL(row.url).hostname.toLowerCase()
        return hostname === `${service}.com` || hostname.endsWith(`.${service}.com`)
      } catch { return false }
    }
    await updateJob({ total_songs: songs.length, message: `Finding the submitted recordings on ${serviceName}.` })
    const music = service === 'tidal' ? tidalClient(db, deadline) : spotifyClient(db, deadline)
    const cached = new Map(previousMatches.map(match => [match.song_id, match]))
    const prepared = await Promise.all(songs.map(async song => ({
      song, fingerprint: await songFingerprint(song, config.model, config.candidate_count),
    })))
    const reusable = ({ song, fingerprint }) => {
      const previous = cached.get(song.id)
      if (previous?.fingerprint !== fingerprint) return null
      if (previous.status === 'matched' && previous.track_id) return previous
      // An automatic continuation only retries unfinished work. A manual run
      // can search again after a genuine no-match or a corrected setup error.
      if (job.source === 'resume' && ['unmatched', 'failed'].includes(previous.status)) return previous
      return null
    }
    const waiting = prepared.filter(item => !reusable(item)).map(({ song, fingerprint }) => ({
      service, song_id: song.id, round_id: job.round_id, fingerprint,
      status: 'pending', track_id: null, track_label: null,
      reason: 'Waiting for a completed search.', updated_at: new Date().toISOString(),
    }))
    if (waiting.length) await checked(db.from('playlist_song_matches').upsert(waiting, { onConflict: 'service,song_id' }))
    const matches = await mapConcurrent(prepared, service === 'tidal' ? Math.min(config.concurrency, 2) : config.concurrency, async item => {
      const previous = reusable(item)
      if (previous) return previous
      const { song, fingerprint } = item
      let match
      try {
        if (Date.now() + 5000 >= matchingDeadline) throw new JobError('The matching window ended before this search could finish.', true)
        const candidates = await music.search(song, config.candidate_count, matchingDeadline)
        const { track, reason } = await chooseTrack(song, candidates, {
          db, model: config.model, round: context.currentRound, serviceName, deadline: matchingDeadline,
        })
        match = {
          status: track ? 'matched' : 'unmatched', track_id: track?.id || null,
          track_label: track ? `${track.artists.join(', ')} — ${track.title}${track.version ? ` (${track.version})` : ''}` : null,
          reason,
        }
      } catch (error) {
        match = { status: canRetry(error) ? 'pending' : 'failed', track_id: null, track_label: null, reason: safeError(error) }
      }
      const result = { ...match, service, song_id: song.id, round_id: job.round_id, fingerprint, updated_at: new Date().toISOString() }
      await checked(db.from('playlist_song_matches').upsert(result, { onConflict: 'service,song_id' }))
      return result
    })

    const bySong = new Map(matches.map(match => [match.song_id, match]))
    const matched = matches.filter(match => match.status === 'matched').length
    await updateJob({ matched_songs: matched, message: 'Assembling public playlists.' })
    const outcomes = []
    // Keep playlist writes serial, so a creation-in-flight marker is durable
    // and unambiguous if a worker is terminated before saving its link.
    for (const groupIndex of sideIndexes) {
      try {
        const sideSongs = songs.filter(song => !sides.isSplit || sides.sideByPlayerId[song.player_id] === groupIndex)
        if (!sideSongs.length) continue
        const ordered = listeningOrderFor(sideSongs, { roundId: job.round_id, playerId: `playlist-side-${groupIndex}` })
        const trackIds = [...new Set(ordered.map(song => bySong.get(song.id)?.track_id).filter(Boolean))]
        const links = linkedPlaylists.filter(row => (row.group_index ?? 0) === groupIndex && isServiceLink(row))
        if (links.length) {
          for (const link of links) {
            const url = new URL(link.url)
            const validHost = service === 'tidal' ? ['tidal.com', 'www.tidal.com', 'listen.tidal.com'] : ['open.spotify.com']
            const playlistId = url.pathname.match(/^\/playlist\/([a-zA-Z0-9-]+)\/?$/)?.[1]
            if (!validHost.includes(url.hostname) || !playlistId) throw new JobError('The saved playlist link is not a supported playlist URL. Update it in Admin.')
            await music.fillPlaylist(playlistId, trackIds, job.run_id)
          }
        } else {
          // Do not spend the assembly budget creating an empty playlist while
          // all of this side's matches are still waiting for another pass.
          if (!trackIds.length && sideSongs.some(song => bySong.get(song.id)?.status === 'pending')) continue
          if (Date.now() + 10000 >= deadline) throw new JobError('Playlist creation is waiting for a fresh worker window.', true)
          const name = `Muzak ⋅ ${context.currentRound.theme_name}${sides.isSplit ? ` ⋅ Side ${groupIndex === 0 ? 'A' : 'B'}` : ''}`.slice(0, 250)
          const playlist = {
            create_key: crypto.randomUUID(),
            create_payload: service === 'tidal'
              ? { data: { type: 'playlists', attributes: { name, accessType: 'PUBLIC' } } }
              : { name, public: true },
          }
          await updateJob({ creation_pending: true })
          const onCreated = async created => {
            await checked(db.from('round_playlists').upsert({
              round_id: job.round_id, group_index: groupIndex, service: serviceName, url: created.url,
            }, { onConflict: 'round_id,group_index,url' }))
            await updateJob({ creation_pending: false })
          }
          await music.createPlaylist(playlist, trackIds, job.run_id, onCreated)
        }
        outcomes.push({ status: 'fulfilled' })
      } catch (error) {
        outcomes.push({ status: 'rejected', reason: error })
        if (!canRetry(error)) break
      }
    }
    const errors = outcomes.filter(result => result.status === 'rejected').map(result => result.reason)
    const pending = matches.filter(match => match.status === 'pending').length
    const unmatched = matches.filter(match => match.status === 'unmatched').length
    const failed = matches.filter(match => match.status === 'failed').length
    const retry = retryState(!errors.some(error => !canRetry(error)) && (pending > 0 || errors.some(canRetry)))
    const completed = pending === 0 && failed === 0 && errors.length === 0
    await updateJob({
      status: completed ? 'completed' : 'partial', finished_at: new Date().toISOString(), ...retry,
      message: `${matched}/${songs.length} submissions matched. ${unmatched} searched with no suitable match. ${pending} still pending. ${failed} need attention.${errors.length ? ` ${errors.map(safeError).join(' ')}` : ''}${retry.retry_pending ? ' Unfinished work will resume automatically; recovered tracks will be added to the existing playlists.' : !completed ? ' Automatic recovery is stopped. Review the details and retry from Admin; unfinished searches are not catalog misses.' : ' Playlist assembly is complete.'}`,
    })

  } catch (error) {
    try {
      const retry = retryState(canRetry(error))
      await updateJob({
        status: 'failed', finished_at: new Date().toISOString(), ...retry,
        message: `${safeError(error)} ${retry.retry_pending ? 'Unfinished work will resume automatically.' : 'Review the details in Admin; this is not a catalog miss.'}`,
      })
    } catch {
      // No provider bodies, prompts, or credentials are written to logs.
      console.error('Could not record playlist job failure; The recovery dispatcher will inspect the expired lease.')
    }
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const secret = Deno.env.get('PLAYLIST_JOB_SECRET')
  if (!secret) return new Response('Worker is not configured', { status: 503 })
  // Hash both values before comparison; the database-held secret never reaches
  // the public SPA. A publishable Supabase key alone cannot invoke this worker.
  const [expected, received] = await Promise.all([
    digest(`Bearer ${secret}`), digest(request.headers.get('Authorization') || ''),
  ])
  if (expected !== received) return new Response('Unauthorized', { status: 401 })

  try {
    const { service, round_id, run_id } = await request.json()
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!['tidal', 'spotify'].includes(service) || !uuid.test(round_id) || !uuid.test(run_id)) return new Response('Invalid job', { status: 400 })
    const db = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) },
    })
    const job = await checked(db.from('playlist_jobs').update({ status: 'running' })
      .eq('service', service).eq('round_id', round_id).eq('run_id', run_id).eq('status', 'queued').select('*').maybeSingle())
    if (!job) return Response.json({ status: 'already_claimed' })
    // Acknowledge pg_net immediately; closing Admin does not cancel the worker.
    EdgeRuntime.waitUntil(runJob(db, job))
    return Response.json({ status: 'running' }, { status: 202 })
  } catch {
    return new Response('Could not start the playlist job. Retry from Admin.', { status: 500 })
  }
})
