import { createClient } from 'npm:@supabase/supabase-js@2.39.0'
import { getLeagueContext } from '../../../src/lib/schedule.js'
import { buildRoundGroupAssignment, sidesForRound } from '../../../src/lib/groups.js'
import { listeningOrderFor } from '../../../src/lib/listeningOrder.js'
import { checked, digest, JobError, mapConcurrent, requiredEnv, safeError } from './http.js'
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

  try {
    const [settings, rounds, config, players, groupRows, songs, previousMatches, previousPlaylists] = await Promise.all([
      checked(db.from('league_settings').select('*').eq('id', 1).single()),
      checked(db.from('rounds').select('*').order('queue_position')),
      checked(db.from('playlist_automation_settings').select('*').eq('service', service).single()),
      checked(db.from('players').select('id, active').eq('active', true)),
      checked(db.from('round_groups').select('round_id, player_id, group_index')),
      checked(db.from('songs').select('id, round_id, player_id, title, artist, album, link, submitter_note').eq('round_id', job.round_id)),
      checked(db.from('playlist_song_matches').select('*').eq('service', service).eq('round_id', job.round_id)),
      checked(db.from('playlist_managed_playlists').select('*').eq('service', service).eq('round_id', job.round_id)),
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
        roundId: job.round_id, activePlayers: players,
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

    await updateJob({ total_songs: songs.length, matched_songs: 0, message: `Finding the submitted recordings on ${serviceName}.` })
    const music = service === 'tidal' ? tidalClient(db, deadline) : spotifyClient(db, deadline)
    const cached = new Map(previousMatches.map(match => [match.song_id, match]))
    const matches = await mapConcurrent(songs, config.concurrency, async song => {
      const fingerprint = await songFingerprint(song, config.model, config.candidate_count)
      const previous = cached.get(song.id)
      if (previous?.fingerprint === fingerprint && previous.status === 'matched' && previous.track_id) return previous
      let match
      try {
        const candidates = await music.search(song, config.candidate_count, matchingDeadline)
        const { track, reason } = await chooseTrack(song, candidates, {
          model: config.model, round: context.currentRound, serviceName, deadline: matchingDeadline,
        })
        match = {
          status: track ? 'matched' : 'unmatched', track_id: track?.id || null,
          track_label: track ? `${track.artists.join(', ')} — ${track.title}${track.version ? ` (${track.version})` : ''}` : null,
          reason,
        }
      } catch (error) {
        match = { status: 'failed', track_id: null, track_label: null, reason: safeError(error) }
      }
      const result = { ...match, service, song_id: song.id, round_id: job.round_id, fingerprint, updated_at: new Date().toISOString() }
      await checked(db.from('playlist_song_matches').upsert(result, { onConflict: 'service,song_id' }))
      return result
    })

    const bySong = new Map(matches.map(match => [match.song_id, match]))
    const matched = matches.filter(match => match.status === 'matched').length
    await updateJob({ matched_songs: matched, message: 'Assembling public playlists.' })
    const sideIndexes = sides.isSplit ? [0, 1] : [0]
    const outcomes = await Promise.allSettled(sideIndexes.map(async groupIndex => {
      const sideSongs = songs.filter(song => !sides.isSplit || sides.sideByPlayerId[song.player_id] === groupIndex)
      const ordered = listeningOrderFor(sideSongs, { roundId: job.round_id, playerId: `playlist-side-${groupIndex}` })
      const trackIds = [...new Set(ordered.map(song => bySong.get(song.id)?.track_id).filter(Boolean))]
      let playlist = previousPlaylists.find(row => row.group_index === groupIndex)
      if (!playlist) {
        const sideName = sides.isSplit ? ` — Side ${groupIndex === 0 ? 'A' : 'B'}` : ''
        const name = `${settings.league_name} — ${settings.season_label} — Round ${context.currentRoundIndex + 1}: ${context.currentRound.theme_name}${sideName}`.slice(0, 250)
        const description = `${settings.season_label}, week of ${context.currentWeekStart}${sideName}. ${context.currentRound.theme_name}. Submitted songs; submitters stay anonymous.`.slice(0, 500)
        playlist = await checked(db.from('playlist_managed_playlists').insert({
          service, round_id: job.round_id, group_index: groupIndex,
          create_payload: service === 'tidal'
            ? { data: { type: 'playlists', attributes: { name, description, accessType: 'PUBLIC' } } }
            : { name, description, public: true, collaborative: false },
        }).select('*').single())
      }
      const published = await music.syncPlaylist(playlist, trackIds, job.run_id)
      // Home and archive already subscribe to this table and show each side's links.
      await checked(db.from('round_playlists').upsert({
        round_id: job.round_id, group_index: groupIndex, service: serviceName, url: published.url,
      }, { onConflict: 'round_id,group_index,url' }))
      await checked(db.from('playlist_managed_playlists').update({
        published: true, updated_at: new Date().toISOString(),
      }).eq('service', service).eq('round_id', job.round_id).eq('group_index', groupIndex))
      return published
    }))
    const errors = outcomes.filter(result => result.status === 'rejected').map(result => safeError(result.reason))
    const publishedCount = outcomes.filter(result => result.status === 'fulfilled').length
    const completed = matched === songs.length && errors.length === 0
    await updateJob({
      status: completed ? 'completed' : 'partial', finished_at: new Date().toISOString(),
      message: `${publishedCount} public playlist${publishedCount === 1 ? '' : 's'} synced. ${matched}/${songs.length} submissions matched.${errors.length ? ` ${errors.join(' ')}` : matched < songs.length ? ' Review the songs needing attention, then retry.' : ''}`,
    })
  } catch (error) {
    try {
      await updateJob({ status: 'failed', finished_at: new Date().toISOString(), message: safeError(error) })
    } catch {
      // No provider bodies, prompts, or credentials are written to logs.
      console.error('Could not record playlist job failure; Admin can retry after the five-minute lease expires.')
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
