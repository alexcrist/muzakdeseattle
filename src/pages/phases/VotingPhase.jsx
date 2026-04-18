import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase.js'
import { FLAVOR } from '../../lib/flavor.js'
import Countdown from '../../components/Countdown.jsx'

export default function VotingPhase({ round, player, settings }) {
  const [songs, setSongs] = useState([])
  const [comments, setComments] = useState([])
  const [myVotes, setMyVotes] = useState({})     // { songId: points }
  const [myComments, setMyComments] = useState({}) // { songId: draft string }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [commentSaving, setCommentSaving] = useState({})
  const [voterCount, setVoterCount] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(0)

  const pointsTotal = settings?.points_per_player || 10

  useEffect(() => {
    async function load() {
      // Fetch all songs for this round (shuffled client-side)
      const { data: songsData } = await supabase
        .from('songs')
        .select('*, players(name)')
        .eq('round_id', round.id)

      // Shuffle
      const shuffled = (songsData || []).sort(() => Math.random() - 0.5)
      setSongs(shuffled)

      // Fetch my existing votes
      const { data: votesData } = await supabase
        .from('votes')
        .select('*')
        .eq('round_id', round.id)
        .eq('voter_player_id', player.id)

      const voteMap = {}
      for (const v of votesData || []) {
        voteMap[v.song_id] = v.points
      }
      setMyVotes(voteMap)

      // Fetch all comments
      const { data: commentsData } = await supabase
        .from('comments')
        .select('*, players(name)')
        .eq('round_id', round.id)
        .order('created_at', { ascending: true })

      setComments(commentsData || [])

      // Count distinct voters this round
      const { data: allVotes } = await supabase
        .from('votes')
        .select('voter_player_id')
        .eq('round_id', round.id)
      const distinctVoters = new Set((allVotes || []).map(v => v.voter_player_id)).size
      setVoterCount(distinctVoters)

      // Count total ACTIVE players
      const { count: playerCount } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
      setTotalPlayers(playerCount || 0)

      setLoading(false)
    }
    load()

    // Realtime comments subscription
    const sub = supabase
      .channel('comments-voting')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `round_id=eq.${round.id}` }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [round.id, player.id])

  const pointsUsed = useMemo(() => {
    return Object.values(myVotes).reduce((sum, v) => sum + (parseInt(v) || 0), 0)
  }, [myVotes])

  const pointsRemaining = pointsTotal - pointsUsed

  function handleVoteChange(songId, value) {
    const num = Math.max(0, parseInt(value) || 0)
    const currentForOthers = Object.entries(myVotes)
      .filter(([id]) => id !== songId)
      .reduce((sum, [, v]) => sum + (parseInt(v) || 0), 0)

    const max = pointsTotal - currentForOthers
    setMyVotes(v => ({ ...v, [songId]: Math.min(num, max) }))
    setSaved(false)
  }

  async function handleSaveVotes() {
    setSaving(true)
    const upserts = Object.entries(myVotes)
      .filter(([, pts]) => (parseInt(pts) || 0) > 0)
      .map(([song_id, points]) => ({
        round_id: round.id,
        song_id,
        voter_player_id: player.id,
        points: parseInt(points),
      }))

    // Delete existing votes first, then insert (simpler than true upsert with compound keys)
    await supabase.from('votes').delete().eq('round_id', round.id).eq('voter_player_id', player.id)
    if (upserts.length > 0) {
      await supabase.from('votes').insert(upserts)
    }

    setSaving(false)
    setSaved(true)
  }

  async function handleComment(songId) {
    const body = (myComments[songId] || '').trim()
    if (!body) return

    setCommentSaving(s => ({ ...s, [songId]: true }))
    await supabase.from('comments').insert({
      round_id: round.id,
      song_id: songId,
      player_id: player.id,
      body,
    })
    setMyComments(c => ({ ...c, [songId]: '' }))
    setCommentSaving(s => ({ ...s, [songId]: false }))
  }

  if (loading) return <div className="page"><p style={{ color: 'var(--text3)' }}>loading...</p></div>

  const songComments = (songId) => comments.filter(c => c.song_id === songId)

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span className="badge badge-voting">Voting Open</span>
        </div>
        <h2>{round.theme_name}</h2>
        {/* FLAVOR TEXT: Voting tagline */}
        <p className="flavor-text" style={{ marginTop: '0.3rem' }}>{FLAVOR.VOTING_TAGLINE}</p>
      </div>

      <Countdown deadline={round.voting_deadline} label="Voting closes in" />

      {/* Voter progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span className="points-counter">
          🗳️ {voterCount} of {totalPlayers} players voted
        </span>
      </div>

      {/* All voted banner */}
      {totalPlayers > 0 && voterCount >= totalPlayers && (
        <div style={{
          background: 'rgba(71, 232, 160, 0.08)',
          border: '1px solid rgba(71, 232, 160, 0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
        }}>
          <p style={{ fontWeight: 700, color: 'var(--success)', marginBottom: '0.2rem' }}>
            🎉 All players have voted!
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text2)', margin: 0 }}>
            Check back soon for results and the next round.
          </p>
        </div>
      )}

      {/* Points tracker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <span className={`points-counter ${pointsRemaining === 0 ? 'depleted' : ''}`}>
          {pointsRemaining === 0 ? '✓ All points allocated' : `${pointsRemaining} points remaining`}
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSaveVotes}
          disabled={saving}
        >
          {saving ? 'Saving...' : saved ? '✓ Votes saved' : 'Save Votes'}
        </button>
      </div>

      {/* Song list */}
      {songs.map(song => {
        const isOwn = song.player_id === player.id
        const songCommentList = songComments(song.id)

        return (
          <div key={song.id} className={`song-item ${isOwn ? 'own-song' : ''}`}>
            {/* Song info */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="song-title">{song.title}</span>
                  {isOwn && <span className="tag-own">Your Submission</span>}
                </div>
                <div className="song-meta">
                  <span className="song-artist">{song.artist}</span>
                  {song.album && <span className="song-album">{song.album}</span>}
                  {song.link && <a href={song.link} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>🔗</a>}
                </div>
                {/* Submitter note - visible during voting */}
                {song.submitter_note && (
                  <div className="submitter-note" style={{ marginTop: '0.5rem' }}>{song.submitter_note}</div>
                )}
              </div>
            </div>

            {/* Vote input */}
            <div className="vote-row">
              <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: 0, display: 'inline' }}>
                Points:
              </label>
              <input
                type="number"
                className="vote-input"
                min="0"
                max={pointsTotal}
                value={isOwn ? '' : (myVotes[song.id] || '')}
                disabled={isOwn}
                placeholder={isOwn ? '—' : '0'}
                onChange={e => handleVoteChange(song.id, e.target.value)}
              />
              {isOwn && <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>You can't vote for yourself</span>}
            </div>

            {/* Comments */}
            {songCommentList.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                {songCommentList.map(c => {
                  const isMyComment = c.player_id === player.id
                  return (
                    <div key={c.id} className="comment">
                      <span className="comment-author">
                        {isMyComment ? c.players?.name : 'Anonymous'}
                        {isMyComment && <span style={{ fontSize: '0.65rem', color: 'var(--text3)', marginLeft: '0.3rem' }}>(you)</span>}
                      </span>
                      <p style={{ color: 'var(--text2)', fontSize: '0.88rem', margin: 0 }}>{c.body}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add comment */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <input
                type="text"
                placeholder="Leave a comment..."
                value={myComments[song.id] || ''}
                onChange={e => setMyComments(c => ({ ...c, [song.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleComment(song.id)}
                style={{ flex: 1, fontSize: '0.85rem', padding: '0.4rem 0.7rem' }}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleComment(song.id)}
                disabled={commentSaving[song.id] || !(myComments[song.id] || '').trim()}
              >
                Post
              </button>
            </div>
          </div>
        )
      })}

      {/* Save votes sticky bottom */}
      <div style={{ position: 'sticky', bottom: '70px', background: 'rgba(15,14,12,0.9)', backdropFilter: 'blur(8px)', padding: '0.75rem 0', marginTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span className={`points-counter ${pointsRemaining === 0 ? 'depleted' : ''}`}>
            {pointsRemaining === 0 ? '✓ All points allocated' : `${pointsRemaining} points remaining`}
          </span>
          <button className="btn btn-primary" onClick={handleSaveVotes} disabled={saving}>
            {saving ? 'Saving...' : saved ? '✓ Saved — update anytime' : 'Save Votes'}
          </button>
        </div>
      </div>
    </div>
  )
}
