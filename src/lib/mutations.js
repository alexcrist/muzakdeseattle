import { addDays, getCurrentMonday, normalizeTemplate } from './schedule.js'
import { supabase } from './supabase.js'

export async function saveSongSubmission({ roundId, playerId, form }) {
  const { error } = await supabase
    .from('songs')
    .upsert({
      round_id: roundId,
      player_id: playerId,
      artist: form.artist.trim(),
      title: form.title.trim(),
      album: form.album.trim() || null,
      link: form.link.trim() || null,
      submitter_note: form.submitter_note.trim() || null,
    }, { onConflict: 'round_id,player_id' })

  return { error }
}

export async function createPlayer({ name, avatarColor }) {
  const { data, error } = await supabase
    .from('players')
    .insert({
      name,
      active: true,
      avatar_color: avatarColor,
    })
    .select()
    .single()

  return { data, error }
}

export async function persistVote({ roundId, songId, playerId, points }) {
  if (points === 0) {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('round_id', roundId)
      .eq('song_id', songId)
      .eq('voter_player_id', playerId)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('votes')
    .upsert({
      round_id: roundId,
      song_id: songId,
      voter_player_id: playerId,
      points,
    }, { onConflict: 'song_id,voter_player_id' })

  if (error) throw error
}

export async function postComment({ roundId, songId, playerId, body, gifUrl = null, gifPreviewUrl = null, gifProvider = null, gifId = null }) {
  const { error } = await supabase.from('comments').insert({
    round_id: roundId,
    song_id: songId || null,
    player_id: playerId,
    body,
    gif_url: gifUrl,
    gif_preview_url: gifPreviewUrl,
    gif_provider: gifProvider,
    gif_id: gifId,
  })

  return { error }
}

export async function deleteComment({ commentId, playerId }) {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('player_id', playerId)

  return { error }
}

export async function toggleCommentLike({ commentId, playerId, liked }) {
  if (liked) {
    const { error } = await supabase
      .from('comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('player_id', playerId)
    return { error }
  }

  const { error } = await supabase
    .from('comment_likes')
    .upsert({ comment_id: commentId, player_id: playerId }, { onConflict: 'comment_id,player_id' })
  return { error }
}

export async function addRoundPlaylist({ roundId, groupIndex, service, url }) {
  const { error } = await supabase.from('round_playlists').insert({
    round_id: roundId,
    group_index: groupIndex,
    service: service.trim() || 'Playlist',
    url: url.trim(),
  })

  return { error }
}

export async function deleteRoundPlaylist(playlistId) {
  const { error } = await supabase.from('round_playlists').delete().eq('id', playlistId)
  return { error }
}

export async function addRound({ form, playerId, context }) {
  const nextPosition = context.orderedRounds.length
  const weekStart = addDays(context.startDate, nextPosition * 7)

  const { error } = await supabase.from('rounds').insert({
    theme_name: form.theme_name.trim(),
    theme_description: form.theme_description.trim(),
    queue_position: nextPosition,
    submitted_by_player_id: playerId,
    week_start_date: weekStart,
    is_archived: false,
  })

  return { error }
}

export async function updateRoundTheme({ roundId, theme_name, theme_description }) {
  const { error } = await supabase
    .from('rounds')
    .update({
      theme_name: theme_name.trim(),
      theme_description: theme_description.trim(),
    })
    .eq('id', roundId)

  return { error }
}

export async function deleteRound({ round, orderedRounds, scheduleStartDate }) {
  const { error } = await supabase.from('rounds').delete().eq('id', round.id)
  if (error) return { error }

  // Only rounds scheduled after the deleted one shift back a week to close the gap it leaves;
  // earlier rounds (already played) keep whatever dates they already have.
  const laterRounds = orderedRounds.filter(item => item.id !== round.id && item.queue_position > round.queue_position)
  await Promise.all(laterRounds.map(item => {
    const queuePosition = item.queue_position - 1
    return supabase
      .from('rounds')
      .update({
        queue_position: queuePosition,
        week_start_date: addDays(scheduleStartDate, queuePosition * 7),
      })
      .eq('id', item.id)
  }))

  return { error: null }
}

export async function moveUpcomingRound({ round, direction, upcomingRows, scheduleStartDate }) {
  const future = upcomingRows.map(row => row.round)
  const currentIndex = future.findIndex(item => item.id === round.id)
  const nextIndex = currentIndex + direction
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= future.length) return

  const reordered = [...future]
  const [item] = reordered.splice(currentIndex, 1)
  reordered.splice(nextIndex, 0, item)

  const firstFuturePosition = upcomingRows[0].round.queue_position
  await Promise.all(reordered.map((itemRound, offset) => {
    const queuePosition = firstFuturePosition + offset
    return supabase
      .from('rounds')
      .update({
        queue_position: queuePosition,
        week_start_date: addDays(scheduleStartDate, queuePosition * 7),
      })
      .eq('id', itemRound.id)
  }))
}

export async function saveLeagueSettings({ form, rounds }) {
  const payload = {
    id: 1,
    league_name: form.league_name.trim() || 'Muzak de Seattle',
    season_label: form.season_label.trim() || 'Season 2',
    points_per_player: Math.max(1, Number(form.points_per_player) || 10),
    schedule_start_date: form.schedule_start_date || getCurrentMonday(),
    weekly_phase_template: normalizeTemplate(form.weekly_phase_template),
    timezone: 'America/Los_Angeles',
  }

  const { data: saved, error } = await supabase
    .from('league_settings')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()

  if (error || !saved) return { saved: null, error }

  await Promise.all(rounds.map((round, index) => (
    supabase
      .from('rounds')
      .update({ week_start_date: addDays(payload.schedule_start_date, index * 7) })
      .eq('id', round.id)
  )))

  return { saved, error: null }
}

export async function togglePlayerActive(player) {
  const { error } = await supabase
    .from('players')
    .update({ active: !player.active })
    .eq('id', player.id)

  return { error }
}

export async function saveProfileName(playerId, name) {
  const { data, error } = await supabase
    .from('players')
    .update({ name })
    .eq('id', playerId)
    .select()
    .single()

  return { data, error }
}

export async function saveProfilePictureUrl(playerId, avatarUrl) {
  const { data, error } = await supabase
    .from('players')
    .update({ avatar_url: avatarUrl })
    .eq('id', playerId)
    .select()
    .single()

  return { data, error }
}

export async function clearProfilePictureUrl(playerId) {
  const { data, error } = await supabase
    .from('players')
    .update({ avatar_url: null })
    .eq('id', playerId)
    .select()
    .single()

  return { data, error }
}

export async function assignRoundGroups({ roundId, assignments }) {
  const { data, error } = await supabase.rpc('assign_round_groups', {
    p_round_id: roundId,
    p_assignments: assignments,
  })

  return { inserted: data ?? 0, error }
}

export async function joinRoundGroup({ roundId, playerId }) {
  const { data, error } = await supabase.rpc('join_round_group', {
    p_round_id: roundId,
    p_player_id: playerId,
  })

  return { groupIndex: data ?? -1, error }
}

export async function createDuplicateMerge({ roundId, songIds, canonicalSongId }) {
  const { error } = await supabase.rpc('create_duplicate_merge', {
    p_round_id: roundId,
    p_song_ids: songIds,
    p_canonical_song_id: canonicalSongId,
  })

  return { error }
}

export async function deleteDuplicateMerge(groupId) {
  const { error } = await supabase.from('duplicate_groups').delete().eq('id', groupId)
  return { error }
}
