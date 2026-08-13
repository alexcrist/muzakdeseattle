import { useState } from 'react'
import { copyTextFor, searchUrl, serviceLabelForUrl } from './homeUtils.js'

export default function ListeningOrderPanel({ items }) {
  const [message, setMessage] = useState('')

  async function copyOrder() {
    try {
      await navigator.clipboard.writeText(copyTextFor(items))
      setMessage('Copied')
    } catch {
      setMessage('Could not copy')
    }
  }

  return (
    <section className="card listening-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Personal setlist</p>
          <h2>Your listening pass</h2>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyOrder}>
          {message || 'Copy list'}
        </button>
      </div>
      <div className="listening-list">
        {items.map((song, index) => (
          <div className="listening-row" key={song.id || song.canonical_song_id}>
            <span className="song-number">{index + 1}</span>
            <div>
              <strong>{song.title}</strong>
              <p>{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
            </div>
            <div className="listening-actions">
              {song.link && <a href={song.link} target="_blank" rel="noreferrer">{serviceLabelForUrl(song.link)}</a>}
              {serviceLabelForUrl(song.link) !== 'Spotify' && <a href={searchUrl('spotify', song)} target="_blank" rel="noreferrer">Spotify</a>}
              <a href={searchUrl('tidal', song)} target="_blank" rel="noreferrer">TIDAL</a>
              <a href={searchUrl('youtube', song)} target="_blank" rel="noreferrer">YouTube</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
