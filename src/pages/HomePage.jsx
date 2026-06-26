import { useEffect, useMemo, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import Countdown from '../components/Countdown.jsx'
import { usePlayer, useSettings } from '../App.jsx'
import { listeningOrderFor } from '../lib/listeningOrder.js'
import { buildSongEntries, entrySubmitterText } from '../lib/scoring.js'
import { formatPacificDate, getLeagueContext, getRoundTiming, PHASES } from '../lib/schedule.js'
import { supabase } from '../lib/supabase.js'

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  return now
}

function phaseTitle(phase) {
  if (phase === 'submission') return 'Submit your song'
  if (phase === 'voting') return 'Vote on the songs'
  if (phase === 'appreciation') return 'Appreciate the round'
  return 'Between phases'
}

function phaseHint(phase) {
  if (phase === 'submission') return 'Songs stay editable until voting starts.'
  if (phase === 'voting') return 'Spend your points before the reveal.'
  if (phase === 'appreciation') return 'Results are live. Comments and submitters are no longer anonymous.'
  return 'The next active phase starts at midnight Pacific.'
}

function playerName(player) {
  return player?.name || 'Unknown player'
}

function commentsForEntry(comments, entry) {
  const ids = new Set(entry.member_song_ids || [entry.canonical_song_id])
  return comments.filter(comment => ids.has(comment.song_id))
}

function serviceLabelForUrl(url = '') {
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

function searchUrl(service, song) {
  const query = songQuery(song)
  if (service === 'spotify') return `https://open.spotify.com/search/${query}`
  if (service === 'tidal') return `https://tidal.com/search?q=${query}`
  return `https://www.youtube.com/results?search_query=${query}`
}

function copyTextFor(items) {
  return items
    .map((song, index) => {
      const album = song.album ? ` (${song.album})` : ''
      const link = song.link ? `\n   ${song.link}` : ''
      return `${index + 1}. ${song.artist} - ${song.title}${album}${link}`
    })
    .join('\n')
}

async function fetchHomeData() {
  const [
    { data: rounds },
    { data: players },
    { data: songs },
    { data: votes },
    { data: comments },
    { data: duplicateGroups },
    { data: groupSongs },
  ] = await Promise.all([
    supabase.from('rounds').select('*, players(id, name, avatar_url, avatar_color)').order('queue_position'),
    supabase.from('players').select('*').order('name'),
    supabase.from('songs').select('*, players(id, name, avatar_url, avatar_color)').order('created_at'),
    supabase.from('votes').select('*'),
    supabase.from('comments').select('*, players(id, name, avatar_url, avatar_color)').order('created_at'),
    supabase.from('duplicate_groups').select('*'),
    supabase.from('duplicate_group_songs').select('*'),
  ])

  return {
    rounds: rounds || [],
    players: players || [],
    songs: songs || [],
    votes: votes || [],
    comments: comments || [],
    duplicateGroups: duplicateGroups || [],
    groupSongs: groupSongs || [],
  }
}

export default function HomePage() {
  const { player } = usePlayer()
  const { settings } = useSettings()
  const now = useNow()
  const [data, setData] = useState({
    rounds: [],
    players: [],
    songs: [],
    votes: [],
    comments: [],
    duplicateGroups: [],
    groupSongs: [],
  })
  const [loading, setLoading] = useState(true)

  async function load() {
    const next = await fetchHomeData()
    setData(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('home-season-2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_groups' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duplicate_group_songs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const context = useMemo(() => getLeagueContext(data.rounds, settings, now), [data.rounds, settings, now])
  const currentRound = context.currentRound
  const activePlayers = data.players.filter(p => p.active)

  const roundData = useMemo(() => {
    if (!currentRound) return null
    const roundSongs = data.songs.filter(song => song.round_id === currentRound.id)
    const roundVotes = data.votes.filter(vote => vote.round_id === currentRound.id)
    const roundComments = data.comments.filter(comment => comment.round_id === currentRound.id)
    const roundGroups = data.duplicateGroups.filter(group => group.round_id === currentRound.id)
    const groupIds = new Set(roundGroups.map(group => group.id))
    const roundGroupSongs = data.groupSongs.filter(row => groupIds.has(row.group_id))
    return { roundSongs, roundVotes, roundComments, roundGroups, roundGroupSongs }
  }, [currentRound, data])

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading current round...</p>
      </main>
    )
  }

  if (!currentRound) {
    const seasonHasStarted = context.currentWeekIndex >= 0
    return (
      <main className="page">
        <section className="hero-surface">
          <span className="phase-pill phase-off">No active round</span>
          <h1>{seasonHasStarted ? 'Queue needs a song theme' : 'Season starts soon'}</h1>
          <p>
            {seasonHasStarted
              ? 'Add another round in Rounds to keep the weekly schedule moving.'
              : `The first scheduled week starts ${formatPacificDate(context.startDate)}.`}
          </p>
        </section>
      </main>
    )
  }

  const timing = getRoundTiming(currentRound, context.currentRoundIndex, settings, now)
  const nextPhaseLabel = PHASES[context.nextPhase]?.label || 'next phase'

  return (
    <main className="page">
      <section className="hero-surface">
        <div className="hero-topline">
          <span className={`phase-pill phase-${context.phase}`}>{context.phaseMeta.label}</span>
          <span className="date-chip">Week of {formatPacificDate(timing.weekStart)}</span>
        </div>
        <h1>{currentRound.theme_name}</h1>
        {currentRound.theme_description && <p>{currentRound.theme_description}</p>}
        <div className="phase-summary">
          {timing.phaseRanges.map(range => (
            <span key={`${range.phase}-${range.startDate}`}>{PHASES[range.phase]?.shortLabel || 'Off'} {formatPacificDate(range.startDate, { weekday: 'short' })}</span>
          ))}
        </div>
      </section>

      <section className="status-strip">
        <div>
          <p className="eyebrow">{phaseTitle(context.phase)}</p>
          <p>{phaseHint(context.phase)}</p>
        </div>
        <Countdown target={context.nextPhaseAt} label={`Next: ${nextPhaseLabel}`} />
      </section>

      {context.phase === 'submission' && (
        <SubmissionView
          round={currentRound}
          player={player}
          songs={roundData.roundSongs}
          activePlayers={activePlayers}
          onChanged={load}
        />
      )}

      {context.phase === 'voting' && (
        <VotingView
          round={currentRound}
          player={player}
          songs={roundData.roundSongs}
          votes={roundData.roundVotes}
          comments={roundData.roundComments}
          activePlayers={activePlayers}
          pointsTotal={settings?.points_per_player || 10}
          onChanged={load}
        />
      )}

      {context.phase === 'appreciation' && (
        <AppreciationView
          round={currentRound}
          player={player}
          songs={roundData.roundSongs}
          votes={roundData.roundVotes}
          comments={roundData.roundComments}
          duplicateGroups={roundData.roundGroups}
          groupSongs={roundData.roundGroupSongs}
          onChanged={load}
        />
      )}

      {context.phase === 'off' && (
        <section className="empty-state">
          <h2>Off day</h2>
          <p>This round is waiting for the next scheduled phase.</p>
        </section>
      )}
    </main>
  )
}

function SubmissionView({ round, player, songs, activePlayers, onChanged }) {
  const mySong = songs.find(song => song.player_id === player.id)
  const [form, setForm] = useState({
    artist: mySong?.artist || '',
    title: mySong?.title || '',
    album: mySong?.album || '',
    link: mySong?.link || '',
    submitter_note: mySong?.submitter_note || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({
      artist: mySong?.artist || '',
      title: mySong?.title || '',
      album: mySong?.album || '',
      link: mySong?.link || '',
      submitter_note: mySong?.submitter_note || '',
    })
  }, [mySong?.id])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.artist.trim() || !form.title.trim()) {
      setError('Artist and title are required.')
      return
    }

    setSaving(true)
    setError('')

    const { error: saveError } = await supabase
      .from('songs')
      .upsert({
        round_id: round.id,
        player_id: player.id,
        artist: form.artist.trim(),
        title: form.title.trim(),
        album: form.album.trim() || null,
        link: form.link.trim() || null,
        submitter_note: form.submitter_note.trim() || null,
      }, { onConflict: 'round_id,player_id' })

    setSaving(false)
    if (saveError) {
      setError('Could not save that song. Try again.')
      return
    }
    onChanged()
  }

  const submittedIds = new Set(songs.map(song => song.player_id))
  const submittedCount = songs.length

  return (
    <section className="phase-layout">
      <aside className="side-panel">
        <h2>Submission roll call</h2>
        <p className="big-stat">{submittedCount}/{activePlayers.length}</p>
        <div className="mini-roster">
          {activePlayers.map(activePlayer => (
            <span key={activePlayer.id} className={`roster-dot ${submittedIds.has(activePlayer.id) ? 'done' : ''}`}>
              <Avatar player={activePlayer} size="sm" />
              <span>{activePlayer.name}</span>
            </span>
          ))}
        </div>
      </aside>

      <section className="card">
        <div className="section-heading">
          <h2>{mySong ? 'Your submission' : 'Lock in a song'}</h2>
          {mySong && <span className="soft-tag">Editable</span>}
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Artist</span>
              <input value={form.artist} onChange={event => setForm(f => ({ ...f, artist: event.target.value }))} />
            </label>
            <label>
              <span>Song title</span>
              <input value={form.title} onChange={event => setForm(f => ({ ...f, title: event.target.value }))} />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Album</span>
              <input value={form.album} onChange={event => setForm(f => ({ ...f, album: event.target.value }))} />
            </label>
            <label>
              <span>Link</span>
              <input type="url" value={form.link} onChange={event => setForm(f => ({ ...f, link: event.target.value }))} />
            </label>
          </div>
          <label>
            <span>Submitter note</span>
            <textarea
              value={form.submitter_note}
              onChange={event => setForm(f => ({ ...f, submitter_note: event.target.value }))}
              rows={3}
              placeholder="Optional context, campaign speech, or lore."
            />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? 'Saving...' : mySong ? 'Save song' : 'Submit song'}
          </button>
        </form>
      </section>
    </section>
  )
}

function VotingView({ round, player, songs, votes, comments, activePlayers, pointsTotal, onChanged }) {
  const [draftVotes, setDraftVotes] = useState({})
  const orderedSongs = useMemo(() => (
    listeningOrderFor(songs, { roundId: round.id, playerId: player.id })
  ), [songs, round.id, player.id])

  useEffect(() => {
    const mine = {}
    votes
      .filter(vote => vote.voter_player_id === player.id)
      .forEach(vote => {
        mine[vote.song_id] = vote.points
      })
    setDraftVotes(mine)
  }, [votes, player.id])

  const pointsUsed = Object.values(draftVotes).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const pointsRemaining = pointsTotal - pointsUsed
  const voters = new Set(votes.filter(vote => Number(vote.points) > 0).map(vote => vote.voter_player_id))

  async function adjustVote(song, delta) {
    if (song.player_id === player.id) return

    const current = Number(draftVotes[song.id]) || 0
    const usedElsewhere = Object.entries(draftVotes)
      .filter(([songId]) => songId !== song.id)
      .reduce((sum, [, points]) => sum + (Number(points) || 0), 0)
    const next = Math.max(0, Math.min(current + delta, pointsTotal - usedElsewhere))
    if (next === current) return

    setDraftVotes(prev => ({ ...prev, [song.id]: next }))

    if (next === 0) {
      await supabase
        .from('votes')
        .delete()
        .eq('round_id', round.id)
        .eq('song_id', song.id)
        .eq('voter_player_id', player.id)
    } else {
      await supabase
        .from('votes')
        .upsert({
          round_id: round.id,
          song_id: song.id,
          voter_player_id: player.id,
          points: next,
        }, { onConflict: 'song_id,voter_player_id' })
    }
    onChanged()
  }

  return (
    <section className="phase-layout">
      <aside className="side-panel">
        <h2>Voting bank</h2>
        <p className="big-stat">{pointsRemaining}</p>
        <p>{pointsRemaining === 0 ? 'All points allocated.' : `${pointsTotal} points available.`}</p>
        <hr />
        <p className="eyebrow">Voters</p>
        <p>{voters.size}/{activePlayers.length} players have voted</p>
      </aside>

      <section className="song-stack">
        {songs.length === 0 ? (
          <div className="empty-state">
            <h2>No songs yet</h2>
            <p>Voting is open, but nobody submitted a song.</p>
          </div>
        ) : (
          <>
            <ListeningOrderPanel items={orderedSongs} />
            {orderedSongs.map((song, index) => {
              const isOwn = song.player_id === player.id
              const songComments = comments.filter(comment => comment.song_id === song.id)
              return (
                <article className={`song-card ${isOwn ? 'is-own' : ''}`} key={song.id}>
                  <div className="song-card-main">
                    <span className="song-number">{index + 1}</span>
                    <div>
                      <h2>{song.title}</h2>
                      <p>{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
                      <div className="song-actions">
                        {song.link && <a href={song.link} target="_blank" rel="noreferrer">{serviceLabelForUrl(song.link)}</a>}
                        <a href={searchUrl('youtube', song)} target="_blank" rel="noreferrer">YouTube</a>
                      </div>
                      {song.submitter_note && <p className="note">{song.submitter_note}</p>}
                    </div>
                  </div>

                  <div className="vote-control">
                    {isOwn ? (
                      <span className="soft-tag">Your song</span>
                    ) : (
                      <>
                        <button type="button" className="icon-btn" onClick={() => adjustVote(song, -1)} disabled={(draftVotes[song.id] || 0) <= 0}>−</button>
                        <strong>{draftVotes[song.id] || 0}</strong>
                        <button type="button" className="icon-btn primary" onClick={() => adjustVote(song, 1)} disabled={pointsRemaining <= 0}>+</button>
                      </>
                    )}
                  </div>

                  <CommentThread
                    comments={songComments}
                    player={player}
                    revealAuthors={false}
                    songId={song.id}
                    onChanged={onChanged}
                    roundId={round.id}
                  />
                </article>
              )
            })}
          </>
        )}
      </section>
    </section>
  )
}

function AppreciationView({ round, player, songs, votes, comments, duplicateGroups, groupSongs, onChanged }) {
  const entries = buildSongEntries({ songs, votes, duplicateGroups, groupSongs })
  const listeningEntries = useMemo(() => (
    listeningOrderFor(entries, {
      roundId: round.id,
      playerId: player.id,
      getId: entry => entry.canonical_song_id || entry.id,
    })
  ), [entries, round.id, player.id])
  const winner = entries[0]

  return (
    <section className="song-stack">
      {winner && (
        <section className="winner-panel">
          <span className="eyebrow">Round winner</span>
          <h2>{winner.title}</h2>
          <p>{winner.artist} by {entrySubmitterText(winner)}</p>
          <strong>{winner.totalPoints} pts</strong>
        </section>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <h2>No songs to reveal</h2>
          <p>This round did not receive submissions.</p>
        </div>
      ) : (
        <>
          <ListeningOrderPanel items={listeningEntries} />
          {entries.map((entry, index) => (
            <article className={`song-card revealed ${index === 0 ? 'top-entry' : ''}`} key={entry.id}>
              <div className="results-row">
                <div className="song-card-main">
                  <span className="song-number">{index + 1}</span>
                  <div>
                    <div className="section-heading compact">
                      <h2>{entry.title}</h2>
                      {entry.isDuplicate && <span className="soft-tag">Merged duplicate</span>}
                    </div>
                    <p>{entry.artist}{entry.album ? ` · ${entry.album}` : ''}</p>
                    <div className="submitter-line">
                      {entry.submitters.map(submitter => (
                        <span key={submitter.id}>
                          <Avatar player={submitter} size="sm" />
                          {playerName(submitter)}
                        </span>
                      ))}
                    </div>
                    {entry.submitter_note && <p className="note">{entry.submitter_note}</p>}
                    {entry.isDuplicate && (
                      <p className="merge-note">
                        {entry.votePoints} vote pts + {entry.courtesyPoints} courtesy pt{entry.courtesyPoints === 1 ? '' : 's'}
                        {entry.ineligiblePoints > 0 ? ` · ${entry.ineligiblePoints} self-vote pt${entry.ineligiblePoints === 1 ? '' : 's'} removed` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="score-badge">
                  <strong>{entry.totalPoints}</strong>
                  <span>pts</span>
                </div>
              </div>

              <CommentThread
                comments={commentsForEntry(comments, entry)}
                player={player}
                revealAuthors
                songId={entry.canonical_song_id}
                onChanged={onChanged}
                roundId={round.id}
              />
            </article>
          ))}
        </>
      )}
    </section>
  )
}

function ListeningOrderPanel({ items }) {
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
          <p className="eyebrow">Listening order</p>
          <h2>Your shuffle</h2>
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
              <a href={searchUrl('spotify', song)} target="_blank" rel="noreferrer">Spotify</a>
              <a href={searchUrl('tidal', song)} target="_blank" rel="noreferrer">TIDAL</a>
              <a href={searchUrl('youtube', song)} target="_blank" rel="noreferrer">YouTube</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CommentThread({ comments, player, revealAuthors, songId, roundId, onChanged }) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function postComment(event) {
    event?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return

    setSaving(true)
    await supabase.from('comments').insert({
      round_id: roundId,
      song_id: songId,
      player_id: player.id,
      body: trimmed,
    })
    setBody('')
    setSaving(false)
    onChanged()
  }

  return (
    <div className="comments-block">
      {comments.length > 0 && (
        <div className="comments-list">
          {comments.map(comment => {
            const isMine = comment.player_id === player.id
            const author = revealAuthors || isMine ? comment.players : null
            return (
              <div className="comment" key={comment.id}>
                {author ? <Avatar player={author} size="xs" /> : <span className="anon-avatar">?</span>}
                <div>
                  <strong>{author ? `${author.name}${isMine ? ' (you)' : ''}` : 'Anonymous'}</strong>
                  <p>{comment.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form className="comment-form" onSubmit={postComment}>
        <input
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder={revealAuthors ? 'Add appreciation...' : 'Leave an anonymous comment...'}
        />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={saving || !body.trim()}>
          Post
        </button>
      </form>
    </div>
  )
}
