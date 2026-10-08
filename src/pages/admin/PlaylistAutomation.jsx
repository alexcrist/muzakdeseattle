import { useCallback, useEffect, useState } from 'react'
import useRealtimeData from '../../hooks/useRealtimeData.js'
import {
  EMPTY_PLAYLIST_AUTOMATION_DATA,
  fetchPlaylistAutomationData,
  PLAYLIST_AUTOMATION_REALTIME_TABLES,
} from '../../lib/data.js'
import { requestPlaylistGeneration } from '../../lib/mutations.js'
import { getLeagueContext } from '../../lib/schedule.js'
import { groupLabel } from '../../lib/groups.js'

const SERVICES = [{ id: 'tidal', name: 'TIDAL' }, { id: 'spotify', name: 'Spotify' }]
const STATUS_LABELS = {
  queued: 'Queued', running: 'Running', completed: 'Ready', partial: 'Needs attention', failed: 'Failed',
}

export default function PlaylistAutomation({ settings, rounds }) {
  const context = getLeagueContext(rounds, settings)
  const roundId = context.currentRound?.id
  const fetcher = useCallback(() => fetchPlaylistAutomationData(roundId), [roundId])
  const { data, loading, reload } = useRealtimeData({
    cacheKey: `playlist-automation:${roundId || 'none'}`,
    channelName: `playlist-automation-${roundId || 'none'}`,
    fetcher, initialData: EMPTY_PLAYLIST_AUTOMATION_DATA,
    tables: PLAYLIST_AUTOMATION_REALTIME_TABLES,
  })
  const canRun = Boolean(roundId) && ['voting', 'appreciation'].includes(context.phase)

  return (
    <section className="card admin-settings">
      <div className="section-heading">
        <h2>Listening playlists</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()}>Refresh status</button>
      </div>
      <p>Every Thursday at 12:05 a.m. Pacific, create public playlists for Side A and Side B on each connected service.</p>
      <p className="muted">Each playlist contains only that side’s songs. Small rounds without sides get one playlist per service.</p>
      {context.currentRound ? <p>Current round: <strong>{context.currentRound.theme_name}</strong></p> : <p className="muted">No current round is queued.</p>}
      {!canRun && roundId && <p className="muted">Manual runs open when submissions close.</p>}
      {data.error && <p className="error-msg" role="alert">{data.error}</p>}
      {loading ? <p className="muted">Loading playlist connections…</p> : (
        <div className="stack">
          {SERVICES.map(service => (
            <ServicePlaylists
              key={`${roundId || 'none'}:${service.id}`}
              service={service}
              connection={data.connections.find(row => row.service === service.id)}
              job={data.jobs.find(row => row.service === service.id)}
              matches={data.matches.filter(row => row.service === service.id)}
              playlists={data.playlists.filter(row => row.service === service.id)}
              canRun={canRun && !data.error}
              onChanged={reload}
            />
          ))}
        </div>
      )}
      <p className="muted">Jobs run in the cloud. You can close this page. Songs without matches are omitted and listed below. Existing playlists are left untouched. Retrying creates only missing playlists.</p>
    </section>
  )
}

function ServicePlaylists({ service, connection, job, matches, playlists, canRun, onChanged }) {
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState('')
  const [expired, setExpired] = useState(false)
  const active = job?.status === 'queued' || job?.status === 'running'
  const ready = connection?.enabled && connection?.connected

  useEffect(() => {
    setExpired(false)
    if (!active || !job?.started_at) return
    const wait = Math.max(0, new Date(job.started_at).getTime() + 5 * 60 * 1000 - Date.now())
    const timer = window.setTimeout(() => setExpired(true), wait)
    return () => window.clearTimeout(timer)
  }, [active, job?.started_at])

  async function start() {
    setStarting(true)
    setMessage('')
    try {
      const { error } = await requestPlaylistGeneration(service.id)
      if (error) setMessage(error.message || 'Could not start the playlist job.')
      await onChanged()
    } catch {
      setMessage('Could not reach the playlist worker. Try again.')
    } finally {
      setStarting(false)
    }
  }

  const unresolved = matches.filter(match => match.status !== 'matched')
  const published = playlists.filter(playlist => playlist.published && playlist.url)

  return (
    <section className="card">
      <div className="section-heading">
        <h3>{service.name}</h3>
        <span className="soft-tag">{!ready ? 'Setup needed' : expired ? 'Retry available' : STATUS_LABELS[job?.status] || 'Connected'}</span>
      </div>
      {!ready && <p className="muted">{!connection?.enabled ? 'API keys need to be configured.' : 'The playlist owner needs to connect their account.'}</p>}
      {job?.message && <p role="status">{job.message}</p>}
      {active && !expired && <p className="muted" role="status">{job.status === 'queued' ? 'Waiting for the worker…' : 'Matching songs and assembling playlists…'}</p>}
      {expired && <p className="error-msg">The job stopped responding. Retry to create missing playlists. Existing playlists will be left untouched.</p>}
      {published.length > 0 && (
        <div className="playlist-links">
          {published.map(playlist => (
            <a key={playlist.group_index} href={playlist.url} target="_blank" rel="noreferrer">
              {published.length > 1 ? groupLabel(playlist.group_index) : 'Open playlist'} ↗
            </a>
          ))}
        </div>
      )}
      {unresolved.length > 0 && (
        <div>
          <h4>Songs needing attention</h4>
          <ul>
            {unresolved.map(match => (
              <li key={match.song_id}>
                <strong>{match.songs?.artist} — {match.songs?.title}</strong>
                <p>{match.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {matches.some(match => match.status === 'matched') && (
        <details>
          <summary>Matched recordings</summary>
          <ul>
            {matches.filter(match => match.status === 'matched').map(match => (
              <li key={match.song_id}>
                <a href={service.id === 'tidal' ? `https://tidal.com/track/${encodeURIComponent(match.track_id)}` : `https://open.spotify.com/track/${encodeURIComponent(match.track_id)}`} target="_blank" rel="noreferrer">
                  {match.track_label}
                </a>
                <p>{match.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="button" className="btn btn-secondary" disabled={!ready || !canRun || starting || (active && !expired)} onClick={start}>
        {starting ? 'Starting…' : active && !expired ? 'Running…' : job ? `Create missing ${service.name} playlists` : `Create ${service.name} playlists`}
      </button>
      {message && <p className="error-msg" role="alert">{message}</p>}
    </section>
  )
}
