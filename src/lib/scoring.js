function playerLabel(player) {
  return player?.name || 'Unknown player'
}

function uniqueById(items) {
  const seen = new Set()
  const out = []
  for (const item of items || []) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export function groupMembership(groupSongs = []) {
  const songToGroup = {}
  const groupToSongs = {}

  for (const row of groupSongs || []) {
    if (!row.group_id || !row.song_id) continue
    songToGroup[row.song_id] = row.group_id
    if (!groupToSongs[row.group_id]) groupToSongs[row.group_id] = []
    groupToSongs[row.group_id].push(row.song_id)
  }

  return { songToGroup, groupToSongs }
}

export function buildSongEntries({ songs = [], votes = [], duplicateGroups = [], groupSongs = [] }) {
  const songMap = Object.fromEntries((songs || []).map(song => [song.id, song]))
  const groupMap = Object.fromEntries((duplicateGroups || []).map(group => [group.id, group]))
  const { songToGroup, groupToSongs } = groupMembership(groupSongs)
  const usedSongIds = new Set()
  const entries = []

  for (const group of duplicateGroups || []) {
    const memberIds = groupToSongs[group.id] || []
    const memberSongs = memberIds.map(id => songMap[id]).filter(Boolean)
    if (memberSongs.length < 2) continue

    memberSongs.forEach(song => usedSongIds.add(song.id))
    const submitters = uniqueById(memberSongs.map(song => song.players || song.player).filter(Boolean))
    const submitterIds = new Set(memberSongs.map(song => song.player_id).filter(Boolean))
    const memberSet = new Set(memberSongs.map(song => song.id))
    const eligibleVotes = (votes || []).filter(vote => memberSet.has(vote.song_id) && !submitterIds.has(vote.voter_player_id))
    const ineligibleVotes = (votes || []).filter(vote => memberSet.has(vote.song_id) && submitterIds.has(vote.voter_player_id))
    const votePoints = eligibleVotes.reduce((sum, vote) => sum + (Number(vote.points) || 0), 0)
    const courtesyPoints = Math.max(0, submitterIds.size - 1)
    const canonical = songMap[group.canonical_song_id] || memberSongs[0]
    const totalPoints = votePoints + courtesyPoints

    entries.push({
      id: `group:${group.id}`,
      round_id: group.round_id,
      group_id: group.id,
      isDuplicate: true,
      label: group.label || 'Duplicate merge',
      canonical_song_id: canonical.id,
      member_song_ids: memberSongs.map(song => song.id),
      title: canonical.title,
      artist: canonical.artist,
      album: canonical.album,
      link: canonical.link,
      submitter_note: canonical.submitter_note,
      songs: memberSongs,
      submitters,
      submitterIds: [...submitterIds],
      votePoints,
      courtesyPoints,
      totalPoints,
      ineligiblePoints: ineligibleVotes.reduce((sum, vote) => sum + (Number(vote.points) || 0), 0),
      voteCount: eligibleVotes.length,
      ineligibleVoteCount: ineligibleVotes.length,
    })
  }

  for (const song of songs || []) {
    if (usedSongIds.has(song.id) || songToGroup[song.id]) continue

    const eligibleVotes = (votes || []).filter(vote => vote.song_id === song.id && vote.voter_player_id !== song.player_id)
    const ineligibleVotes = (votes || []).filter(vote => vote.song_id === song.id && vote.voter_player_id === song.player_id)
    const votePoints = eligibleVotes.reduce((sum, vote) => sum + (Number(vote.points) || 0), 0)

    entries.push({
      id: `song:${song.id}`,
      round_id: song.round_id,
      group_id: null,
      isDuplicate: false,
      canonical_song_id: song.id,
      member_song_ids: [song.id],
      title: song.title,
      artist: song.artist,
      album: song.album,
      link: song.link,
      submitter_note: song.submitter_note,
      songs: [song],
      submitters: song.players ? [song.players] : [],
      submitterIds: [song.player_id],
      votePoints,
      courtesyPoints: 0,
      totalPoints: votePoints,
      ineligiblePoints: ineligibleVotes.reduce((sum, vote) => sum + (Number(vote.points) || 0), 0),
      voteCount: eligibleVotes.length,
      ineligibleVoteCount: ineligibleVotes.length,
    })
  }

  return entries.sort((a, b) => b.totalPoints - a.totalPoints || a.title.localeCompare(b.title))
}

export function entrySubmitterText(entry) {
  if (!entry?.submitters?.length) return 'Unknown player'
  return entry.submitters.map(playerLabel).join(' + ')
}

export function buildLeaderboard({ players = [], rounds = [], songs = [], votes = [], duplicateGroups = [], groupSongs = [], scoredRoundIds = new Set() }) {
  const playerMap = Object.fromEntries((players || []).map(player => [player.id, player]))
  const roundMap = Object.fromEntries((rounds || []).map(round => [round.id, round]))
  const tally = {}

  for (const player of players || []) {
    tally[player.id] = {
      id: player.id,
      name: player.name,
      avatar_url: player.avatar_url,
      avatar_color: player.avatar_color,
      total: 0,
      byRound: {},
    }
  }

  for (const roundId of scoredRoundIds || []) {
    const roundSongs = songs.filter(song => song.round_id === roundId)
    const roundVotes = votes.filter(vote => vote.round_id === roundId)
    const roundGroups = duplicateGroups.filter(group => group.round_id === roundId)
    const groupIds = new Set(roundGroups.map(group => group.id))
    const roundGroupSongs = groupSongs.filter(row => groupIds.has(row.group_id))
    const entries = buildSongEntries({
      songs: roundSongs,
      votes: roundVotes,
      duplicateGroups: roundGroups,
      groupSongs: roundGroupSongs,
    })

    for (const entry of entries) {
      for (const playerId of entry.submitterIds || []) {
        if (!tally[playerId]) {
          const player = playerMap[playerId]
          tally[playerId] = {
            id: playerId,
            name: player?.name || 'Unknown player',
            avatar_url: player?.avatar_url,
            avatar_color: player?.avatar_color,
            total: 0,
            byRound: {},
          }
        }
        tally[playerId].total += entry.totalPoints
        tally[playerId].byRound[roundId] = (tally[playerId].byRound[roundId] || 0) + entry.totalPoints
      }
    }
  }

  return Object.values(tally)
    .filter(player => player.total > 0 || players.some(p => p.id === player.id && p.active))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map(player => ({
      ...player,
      roundNames: Object.fromEntries(Object.keys(player.byRound).map(roundId => [roundId, roundMap[roundId]?.theme_name || 'Round'])),
    }))
}

export function voterHasCompleted(votes = [], roundId, playerId) {
  return votes.some(vote => vote.round_id === roundId && vote.voter_player_id === playerId && Number(vote.points) > 0)
}
