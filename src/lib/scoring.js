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

function rowsBy(items, keyFor) {
  const index = new Map()
  for (const item of items || []) {
    const key = keyFor(item)
    const rows = index.get(key) || []
    rows.push(item)
    index.set(key, rows)
  }
  return index
}

function scoringRoundIndex({ songs, votes, duplicateGroups, groupSongs, roundGroups = [] }) {
  return {
    songs: rowsBy(songs, row => row.round_id),
    votes: rowsBy(votes, row => row.round_id),
    duplicateGroups: rowsBy(duplicateGroups, row => row.round_id),
    groupSongs: rowsBy(groupSongs, row => row.group_id),
    roundGroups: rowsBy(roundGroups, row => row.round_id),
  }
}

function scoringRowsForRound(index, roundId) {
  const roundDuplicateGroups = index.duplicateGroups.get(roundId) || []
  return {
    roundSongs: index.songs.get(roundId) || [],
    roundVotes: index.votes.get(roundId) || [],
    roundDuplicateGroups,
    roundGroupSongs: roundDuplicateGroups.flatMap(group => index.groupSongs.get(group.id) || []),
    roundGroupRows: index.roundGroups.get(roundId) || [],
  }
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

function sideForPlayers(sideByPlayerId, playerIds = []) {
  if (!sideByPlayerId) return null
  for (const playerId of playerIds) {
    const side = sideByPlayerId[playerId]
    if (side === 0 || side === 1) return side
  }
  return null
}

export function buildSongEntries({ songs = [], votes = [], duplicateGroups = [], groupSongs = [], sideByPlayerId = null }) {
  const songMap = Object.fromEntries((songs || []).map(song => [song.id, song]))
  const { songToGroup, groupToSongs } = groupMembership(groupSongs)
  const votesBySongId = new Map()
  for (const vote of votes || []) {
    const songVotes = votesBySongId.get(vote.song_id) || []
    songVotes.push(vote)
    votesBySongId.set(vote.song_id, songVotes)
  }
  const usedSongIds = new Set()
  const entries = []

  for (const group of duplicateGroups || []) {
    const memberIds = groupToSongs[group.id] || []
    const memberSongs = memberIds.map(id => songMap[id]).filter(Boolean)
    if (memberSongs.length < 2) continue

    memberSongs.forEach(song => usedSongIds.add(song.id))
    const submitters = uniqueById(memberSongs.map(song => song.players || song.player).filter(Boolean))
    const submitterIds = new Set(memberSongs.map(song => song.player_id).filter(Boolean))
    const memberVotes = memberSongs.flatMap(song => votesBySongId.get(song.id) || [])
    const eligibleVotes = memberVotes.filter(vote => !submitterIds.has(vote.voter_player_id))
    const ineligibleVotes = memberVotes.filter(vote => submitterIds.has(vote.voter_player_id))
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
      track_matches: canonical.track_matches,
      submitter_note: canonical.submitter_note,
      songs: memberSongs,
      submitters,
      submitterIds: [...submitterIds],
      side: sideForPlayers(sideByPlayerId, [...submitterIds]),
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

    const songVotes = votesBySongId.get(song.id) || []
    const eligibleVotes = songVotes.filter(vote => vote.voter_player_id !== song.player_id)
    const ineligibleVotes = songVotes.filter(vote => vote.voter_player_id === song.player_id)
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
      track_matches: song.track_matches,
      submitter_note: song.submitter_note,
      songs: [song],
      submitters: song.players ? [song.players] : [],
      submitterIds: [song.player_id],
      side: sideForPlayers(sideByPlayerId, [song.player_id]),
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

// Standard competition ranking: entries on the same score share a place and the next place skips
// past them, so a two-way tie for first reads 1, 1, 3 rather than inventing an order between them.
// Expects the descending sort buildSongEntries already applies.
export function rankEntries(entries = []) {
  let rank = 0
  let previousScore = null

  return entries.map((entry, index) => {
    if (entry.totalPoints !== previousScore) {
      rank = index + 1
      previousScore = entry.totalPoints
    }
    return { ...entry, rank }
  })
}

export function entrySubmitterText(entry) {
  if (!entry?.submitters?.length) return 'Unknown player'
  return entry.submitters.map(playerLabel).join(' + ')
}

export function buildLeaderboard({ players = [], rounds = [], songs = [], votes = [], duplicateGroups = [], groupSongs = [], scoredRoundIds = new Set() }) {
  const playerMap = Object.fromEntries((players || []).map(player => [player.id, player]))
  const roundMap = Object.fromEntries((rounds || []).map(round => [round.id, round]))
  const activePlayerIds = new Set((players || []).filter(player => player.active).map(player => player.id))
  const tally = {}
  const roundIndex = scoringRoundIndex({ songs, votes, duplicateGroups, groupSongs })

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
    const { roundSongs, roundVotes, roundDuplicateGroups, roundGroupSongs } = scoringRowsForRound(roundIndex, roundId)
    const entries = buildSongEntries({
      songs: roundSongs,
      votes: roundVotes,
      duplicateGroups: roundDuplicateGroups,
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
    .filter(player => player.total > 0 || activePlayerIds.has(player.id))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map(player => ({
      ...player,
      roundNames: Object.fromEntries(Object.keys(player.byRound).map(roundId => [roundId, roundMap[roundId]?.theme_name || 'Round'])),
    }))
}

export function buildTopSongsByPlayer({ songs = [], votes = [], duplicateGroups = [], groupSongs = [], scoredRoundIds = new Set() }) {
  const topSongs = {}
  const roundIndex = scoringRoundIndex({ songs, votes, duplicateGroups, groupSongs })

  for (const roundId of scoredRoundIds || []) {
    const { roundSongs, roundVotes, roundDuplicateGroups, roundGroupSongs } = scoringRowsForRound(roundIndex, roundId)
    const entries = buildSongEntries({
      songs: roundSongs,
      votes: roundVotes,
      duplicateGroups: roundDuplicateGroups,
      groupSongs: roundGroupSongs,
    })

    for (const entry of entries) {
      for (const playerId of entry.submitterIds || []) {
        const current = topSongs[playerId]
        const entryLabel = `${entry.artist}\u0000${entry.title}`
        const currentLabel = current ? `${current.artist}\u0000${current.title}` : ''
        if (
          !current
          || entry.totalPoints > current.totalPoints
          || (entry.totalPoints === current.totalPoints && entryLabel.localeCompare(currentLabel) < 0)
        ) {
          topSongs[playerId] = {
            title: entry.title,
            artist: entry.artist,
            totalPoints: entry.totalPoints,
          }
        }
      }
    }
  }

  return topSongs
}

export function buildSubmissionRangesByPlayer({ songs = [], votes = [], duplicateGroups = [], groupSongs = [], scoredRoundIds = new Set() }) {
  const scoresByPlayerId = {}
  const roundIndex = scoringRoundIndex({ songs, votes, duplicateGroups, groupSongs })

  for (const roundId of scoredRoundIds || []) {
    const { roundSongs, roundVotes, roundDuplicateGroups, roundGroupSongs } = scoringRowsForRound(roundIndex, roundId)
    const entries = buildSongEntries({
      songs: roundSongs,
      votes: roundVotes,
      duplicateGroups: roundDuplicateGroups,
      groupSongs: roundGroupSongs,
    })

    for (const entry of entries) {
      for (const playerId of entry.submitterIds || []) {
        if (!scoresByPlayerId[playerId]) scoresByPlayerId[playerId] = []
        scoresByPlayerId[playerId].push(entry.totalPoints)
      }
    }
  }

  return Object.fromEntries(Object.entries(scoresByPlayerId)
    .filter(([, scores]) => scores.length >= 2)
    .map(([playerId, scores]) => {
      const lowest = Math.min(...scores)
      const highest = Math.max(...scores)
      return [playerId, {
        lowest,
        highest,
        range: highest - lowest,
        submissions: scores.length,
      }]
    }))
}

function fairPointsForPool({ poolEntries, poolVotes, entryBySongId, budget, excludedVoterId = null }) {
  // Submitters who skip voting still contribute a neutral ballot. People who did not
  // submit only enter the pool when they cast at least one point.
  const participantIds = new Set(poolEntries.flatMap(entry => entry.submitterIds || []))
  for (const vote of poolVotes) {
    if (Number(vote.points) > 0) participantIds.add(vote.voter_player_id)
  }
  if (excludedVoterId) participantIds.delete(excludedVoterId)
  const votesByVoterId = rowsBy(poolVotes, vote => vote.voter_player_id)

  const filledPointsByEntryId = Object.fromEntries(poolEntries.map(entry => [entry.id, 0]))
  const neutralOpportunityByEntryId = Object.fromEntries(poolEntries.map(entry => [entry.id, 0]))

  for (const voterId of participantIds) {
    const eligibleEntries = poolEntries.filter(entry => !(entry.submitterIds || []).includes(voterId))
    if (eligibleEntries.length === 0) continue

    const actualPointsByEntryId = Object.fromEntries(eligibleEntries.map(entry => [entry.id, 0]))
    for (const vote of votesByVoterId.get(voterId) || []) {
      const entry = entryBySongId.get(vote.song_id)
      if (!entry || actualPointsByEntryId[entry.id] === undefined) continue
      actualPointsByEntryId[entry.id] += Math.max(0, Number(vote.points) || 0)
    }

    const actualSpent = Object.values(actualPointsByEntryId).reduce((sum, points) => sum + points, 0)
    const actualScale = actualSpent > budget ? budget / actualSpent : 1
    const unspentPoints = budget - Math.min(budget, actualSpent)
    const neutralFill = unspentPoints / eligibleEntries.length
    const neutralOpportunity = budget / eligibleEntries.length

    for (const entry of eligibleEntries) {
      filledPointsByEntryId[entry.id] += actualPointsByEntryId[entry.id] * actualScale + neutralFill
      neutralOpportunityByEntryId[entry.id] += neutralOpportunity
    }
  }

  return Object.fromEntries(poolEntries.map(entry => {
    const neutralOpportunity = neutralOpportunityByEntryId[entry.id]
    const fairPoints = neutralOpportunity > 0
      ? budget * filledPointsByEntryId[entry.id] / neutralOpportunity
      : 0
    return [entry.id, fairPoints]
  }))
}

// Experimental vanity score. Each submitter is treated as holding a complete ballot:
// actual eligible votes stay as cast, while any unspent budget is divided evenly among
// the entries they could vote for. The result is then compared with that entry's neutral
// opportunity and returned to the familiar per-round points scale. This does not replace
// buildLeaderboard or the official raw score anywhere in the app.
export function buildFairScores({
  songs = [],
  votes = [],
  duplicateGroups = [],
  groupSongs = [],
  roundGroups = [],
  scoredRoundIds = new Set(),
  pointsPerPlayer = 10,
}) {
  const budget = Math.max(1, Number(pointsPerPlayer) || 10)
  const fairScores = {}
  const roundIndex = scoringRoundIndex({ songs, votes, duplicateGroups, groupSongs, roundGroups })

  for (const roundId of scoredRoundIds || []) {
    const { roundSongs, roundVotes, roundDuplicateGroups, roundGroupSongs, roundGroupRows } = scoringRowsForRound(roundIndex, roundId)
    const sideByPlayerId = Object.fromEntries(
      roundGroupRows
        .filter(row => Number(row.group_index) === 0 || Number(row.group_index) === 1)
        .map(row => [row.player_id, Number(row.group_index)])
    )
    const isSplit = Object.keys(sideByPlayerId).length > 0
    const entries = buildSongEntries({
      songs: roundSongs,
      votes: roundVotes,
      duplicateGroups: roundDuplicateGroups,
      groupSongs: roundGroupSongs,
      sideByPlayerId: isSplit ? sideByPlayerId : null,
    })
    const entryBySongId = new Map()
    const entriesByPool = new Map()

    for (const entry of entries) {
      const pool = entry.side === 0 || entry.side === 1 ? entry.side : 'all'
      if (!entriesByPool.has(pool)) entriesByPool.set(pool, [])
      entriesByPool.get(pool).push(entry)
      for (const songId of entry.member_song_ids || []) entryBySongId.set(songId, entry)
    }

    for (const [pool, poolEntries] of entriesByPool) {
      const poolVotes = roundVotes.filter(vote => {
        const entry = entryBySongId.get(vote.song_id)
        if (!entry) return false
        const entryPool = entry.side === 0 || entry.side === 1 ? entry.side : 'all'
        return entryPool === pool
      })
      const fairPointsByEntryId = fairPointsForPool({ poolEntries, poolVotes, entryBySongId, budget })

      for (const entry of poolEntries) {
        const fairPoints = fairPointsByEntryId[entry.id]

        for (const playerId of entry.submitterIds || []) {
          if (!fairScores[playerId]) fairScores[playerId] = { total: 0, byRound: {} }
          fairScores[playerId].total += fairPoints
          fairScores[playerId].byRound[roundId] = (fairScores[playerId].byRound[roundId] || 0) + fairPoints
        }
      }
    }
  }

  return fairScores
}

// Golden Ear and Deep Cut measure how each ballot relates to the rest of its pool's taste.
// Popularity is calculated with the fair-score model above, but with the voter being
// evaluated removed so their own points cannot improve their result. A song's quality
// blends its fair-score distance from the field (70%) with its percentile rank (30%),
// which gives a close second nearly as much credit as the winner. Ballot points weight
// that quality; Deep Cut uses the inverse. Partial ballots contribute proportionally,
// and a neutral prior tempers tiny samples.
export function buildGoldenEarScores({
  songs = [],
  votes = [],
  duplicateGroups = [],
  groupSongs = [],
  roundGroups = [],
  scoredRoundIds = new Set(),
  pointsPerPlayer = 10,
}) {
  const budget = Math.max(1, Number(pointsPerPlayer) || 10)
  const tallies = {}
  const epsilon = 1e-9
  const roundIndex = scoringRoundIndex({ songs, votes, duplicateGroups, groupSongs, roundGroups })

  for (const roundId of scoredRoundIds || []) {
    const { roundSongs, roundVotes, roundDuplicateGroups, roundGroupSongs, roundGroupRows } = scoringRowsForRound(roundIndex, roundId)
    const sideByPlayerId = Object.fromEntries(
      roundGroupRows
        .filter(row => Number(row.group_index) === 0 || Number(row.group_index) === 1)
        .map(row => [row.player_id, Number(row.group_index)])
    )
    const isSplit = Object.keys(sideByPlayerId).length > 0
    const entries = buildSongEntries({
      songs: roundSongs,
      votes: roundVotes,
      duplicateGroups: roundDuplicateGroups,
      groupSongs: roundGroupSongs,
      sideByPlayerId: isSplit ? sideByPlayerId : null,
    })
    const entryBySongId = new Map()
    const entriesByPool = new Map()

    for (const entry of entries) {
      const pool = entry.side === 0 || entry.side === 1 ? entry.side : 'all'
      if (!entriesByPool.has(pool)) entriesByPool.set(pool, [])
      entriesByPool.get(pool).push(entry)
      for (const songId of entry.member_song_ids || []) entryBySongId.set(songId, entry)
    }

    for (const [pool, poolEntries] of entriesByPool) {
      const poolVotes = roundVotes.filter(vote => {
        const entry = entryBySongId.get(vote.song_id)
        if (!entry) return false
        const entryPool = entry.side === 0 || entry.side === 1 ? entry.side : 'all'
        return entryPool === pool
      })
      const voterIds = new Set(
        poolVotes
          .filter(vote => Number(vote.points) > 0)
          .map(vote => vote.voter_player_id)
      )
      const votesByVoterId = rowsBy(poolVotes, vote => vote.voter_player_id)

      for (const voterId of voterIds) {
        const eligibleEntries = poolEntries.filter(entry => !(entry.submitterIds || []).includes(voterId))
        if (eligibleEntries.length < 2) continue

        const ballotPointsByEntryId = Object.fromEntries(eligibleEntries.map(entry => [entry.id, 0]))
        for (const vote of votesByVoterId.get(voterId) || []) {
          const entry = entryBySongId.get(vote.song_id)
          if (!entry || ballotPointsByEntryId[entry.id] === undefined) continue
          ballotPointsByEntryId[entry.id] += Math.max(0, Number(vote.points) || 0)
        }

        const spent = Object.values(ballotPointsByEntryId).reduce((sum, points) => sum + points, 0)
        if (spent <= 0) continue

        const fairPointsByEntryId = fairPointsForPool({
          poolEntries,
          poolVotes,
          entryBySongId,
          budget,
          excludedVoterId: voterId,
        })
        const eligibleFairScores = eligibleEntries.map(entry => fairPointsByEntryId[entry.id] || 0)
        const minimumFairScore = Math.min(...eligibleFairScores)
        const maximumFairScore = Math.max(...eligibleFairScores)
        const fairScoreRange = maximumFairScore - minimumFairScore
        let ballotAccuracy = 0

        for (const entry of eligibleEntries) {
          const points = ballotPointsByEntryId[entry.id]
          if (points <= 0) continue

          const fairScore = fairPointsByEntryId[entry.id] || 0
          const lowerCount = eligibleFairScores.filter(score => score < fairScore - epsilon).length
          const tiedCount = eligibleFairScores.filter(score => Math.abs(score - fairScore) <= epsilon).length
          const percentile = (lowerCount + (tiedCount - 1) / 2) / (eligibleEntries.length - 1)
          const rangePosition = fairScoreRange > epsilon
            ? (fairScore - minimumFairScore) / fairScoreRange
            : 0.5
          const popularityQuality = 0.7 * rangePosition + 0.3 * percentile
          ballotAccuracy += points / spent * popularityQuality
        }

        const completion = Math.min(1, spent / budget)
        if (!tallies[voterId]) {
          tallies[voterId] = { accuracyTotal: 0, uniquenessTotal: 0, ballotWeight: 0, ballots: 0, byRound: {} }
        }
        tallies[voterId].accuracyTotal += ballotAccuracy * completion
        tallies[voterId].uniquenessTotal += (1 - ballotAccuracy) * completion
        tallies[voterId].ballotWeight += completion
        tallies[voterId].ballots += 1
        tallies[voterId].byRound[roundId] = {
          popularity: ballotAccuracy,
          uniqueness: 1 - ballotAccuracy,
        }
      }
    }
  }

  const neutralPriorWeight = 2
  return Object.fromEntries(Object.entries(tallies).map(([playerId, tally]) => {
    const rawScore = tally.ballotWeight > 0 ? tally.accuracyTotal / tally.ballotWeight : 0.5
    const score = (tally.accuracyTotal + 0.5 * neutralPriorWeight) / (tally.ballotWeight + neutralPriorWeight)
    const uniquenessRawScore = tally.ballotWeight > 0 ? tally.uniquenessTotal / tally.ballotWeight : 0.5
    const uniquenessScore = (tally.uniquenessTotal + 0.5 * neutralPriorWeight) / (tally.ballotWeight + neutralPriorWeight)
    return [playerId, { ...tally, rawScore, score, uniquenessRawScore, uniquenessScore }]
  }))
}

// Cult Following and Crowd Sourced measure opposite shapes of incoming support.
// Each target-voter pair records every ballot where support was possible. Fan affinity
// balances ballot share, repeat support, lift over a neutral ballot, and sample size.
// Cult Following rewards a loyal core; Crowd Sourced rewards broad, even participation.
// Courtesy points never enter either calculation.
export function buildAudienceScores({
  songs = [],
  votes = [],
  duplicateGroups = [],
  groupSongs = [],
  roundGroups = [],
  scoredRoundIds = new Set(),
  pointsPerPlayer = 10,
}) {
  const budget = Math.max(1, Number(pointsPerPlayer) || 10)
  const supportByPlayerId = new Map()
  const epsilon = 1e-9
  const roundIndex = scoringRoundIndex({ songs, votes, duplicateGroups, groupSongs, roundGroups })

  function supportPair(playerId, voterId) {
    if (!supportByPlayerId.has(playerId)) supportByPlayerId.set(playerId, new Map())
    const supportByVoterId = supportByPlayerId.get(playerId)
    if (!supportByVoterId.has(voterId)) {
      supportByVoterId.set(voterId, {
        voterId,
        points: 0,
        neutralPoints: 0,
        opportunities: 0,
        supportEvents: 0,
      })
    }
    return supportByVoterId.get(voterId)
  }

  for (const roundId of scoredRoundIds || []) {
    const { roundSongs, roundVotes, roundDuplicateGroups, roundGroupSongs, roundGroupRows } = scoringRowsForRound(roundIndex, roundId)
    const sideByPlayerId = Object.fromEntries(
      roundGroupRows
        .filter(row => Number(row.group_index) === 0 || Number(row.group_index) === 1)
        .map(row => [row.player_id, Number(row.group_index)])
    )
    const isSplit = Object.keys(sideByPlayerId).length > 0
    const entries = buildSongEntries({
      songs: roundSongs,
      votes: roundVotes,
      duplicateGroups: roundDuplicateGroups,
      groupSongs: roundGroupSongs,
      sideByPlayerId: isSplit ? sideByPlayerId : null,
    })
    const entryBySongId = new Map()
    const entriesByPool = new Map()

    for (const entry of entries) {
      const pool = entry.side === 0 || entry.side === 1 ? entry.side : 'all'
      if (!entriesByPool.has(pool)) entriesByPool.set(pool, [])
      entriesByPool.get(pool).push(entry)
      for (const songId of entry.member_song_ids || []) entryBySongId.set(songId, entry)
    }

    for (const [pool, poolEntries] of entriesByPool) {
      const poolVotes = roundVotes.filter(vote => {
        const entry = entryBySongId.get(vote.song_id)
        if (!entry) return false
        const entryPool = entry.side === 0 || entry.side === 1 ? entry.side : 'all'
        return entryPool === pool
      })
      const participantIds = new Set(poolEntries.flatMap(entry => entry.submitterIds || []))
      for (const vote of poolVotes) {
        if (Number(vote.points) > 0) participantIds.add(vote.voter_player_id)
      }
      const votesByVoterId = rowsBy(poolVotes, vote => vote.voter_player_id)

      for (const voterId of participantIds) {
        const eligibleEntries = poolEntries.filter(entry => !(entry.submitterIds || []).includes(voterId))
        if (eligibleEntries.length === 0) continue

        const actualPointsByEntryId = Object.fromEntries(eligibleEntries.map(entry => [entry.id, 0]))
        for (const vote of votesByVoterId.get(voterId) || []) {
          const entry = entryBySongId.get(vote.song_id)
          if (!entry || actualPointsByEntryId[entry.id] === undefined) continue
          actualPointsByEntryId[entry.id] += Math.max(0, Number(vote.points) || 0)
        }

        const actualSpent = Object.values(actualPointsByEntryId).reduce((sum, points) => sum + points, 0)
        const actualScale = actualSpent > budget ? budget / actualSpent : 1
        const neutralPointsPerEntry = budget / eligibleEntries.length
        const pointsByPlayerId = new Map()
        const neutralPointsByPlayerId = new Map()

        for (const entry of eligibleEntries) {
          const actualPoints = actualPointsByEntryId[entry.id] * actualScale
          for (const playerId of entry.submitterIds || []) {
            pointsByPlayerId.set(playerId, (pointsByPlayerId.get(playerId) || 0) + actualPoints)
            neutralPointsByPlayerId.set(
              playerId,
              (neutralPointsByPlayerId.get(playerId) || 0) + neutralPointsPerEntry
            )
          }
        }

        for (const [playerId, neutralPoints] of neutralPointsByPlayerId) {
          const points = pointsByPlayerId.get(playerId) || 0
          const pair = supportPair(playerId, voterId)
          pair.points += points
          pair.neutralPoints += neutralPoints
          pair.opportunities += 1
          if (points > epsilon) pair.supportEvents += 1
        }
      }
    }
  }

  const results = {}
  for (const [playerId, supportByVoterId] of supportByPlayerId) {
    const fans = [...supportByVoterId.values()]
      .filter(fan => fan.points > epsilon)
      .map(fan => {
        const ballotShare = fan.points / (budget * fan.opportunities)
        const repeatRate = fan.supportEvents / fan.opportunities
        const preferenceLift = fan.neutralPoints > epsilon ? fan.points / fan.neutralPoints : 0
        const liftQuality = preferenceLift / (1 + preferenceLift)
        const sampleConfidence = fan.opportunities / (fan.opportunities + 1)
        const affinity = Math.cbrt(ballotShare * repeatRate * liftQuality) * sampleConfidence
        return { ...fan, ballotShare, repeatRate, preferenceLift, affinity }
      })

    if (fans.length === 0) continue

    const repeatFans = fans.filter(fan => fan.supportEvents >= 2)
    const totalPoints = fans.reduce((sum, fan) => sum + fan.points, 0)
    const pointConcentration = fans.reduce((sum, fan) => {
      const pointShare = fan.points / totalPoints
      return sum + pointShare * pointShare
    }, 0)
    const repeatSupportShare = repeatFans.reduce((sum, fan) => sum + fan.points, 0) / totalPoints
    const coreFans = [...fans].sort((a, b) => b.points - a.points).slice(0, 2)
    const corePoints = coreFans.reduce((sum, fan) => sum + fan.points, 0)
    const coreAffinity = coreFans.reduce((sum, fan) => sum + fan.affinity * fan.points, 0) / corePoints
    const cultFollowingScore = repeatFans.length > 0
      ? Math.cbrt(pointConcentration * repeatSupportShare * coreAffinity)
      : null

    const supportCoverage = fans.length / supportByVoterId.size
    const pointEvenness = fans.length > 1
      ? -fans.reduce((sum, fan) => {
          const pointShare = fan.points / totalPoints
          return sum + pointShare * Math.log(pointShare)
        }, 0) / Math.log(fans.length)
      : 0
    const audienceAffinity = fans.reduce((sum, fan) => sum + fan.affinity * fan.points, 0) / totalPoints
    const audienceConfidence = fans.length / (fans.length + 2)
    const crowdSourcedScore = Math.pow(
      supportCoverage * pointEvenness * audienceAffinity * audienceConfidence,
      1 / 4
    )

    results[playerId] = {
      cultFollowingScore,
      crowdSourcedScore,
      pointConcentration,
      pointEvenness,
      repeatSupportShare,
      coreAffinity,
      audienceAffinity,
      audienceConfidence,
      supportCoverage,
      totalPoints,
      fanCount: fans.length,
      eligibleFanCount: supportByVoterId.size,
      repeatFanCount: repeatFans.length,
      fans,
    }
  }

  return results
}

// Kept as a focused adapter for callers that use the original Cult Following API.
export function buildCultFollowingScores(options) {
  return Object.fromEntries(
    Object.entries(buildAudienceScores(options))
      .filter(([, result]) => Number.isFinite(result.cultFollowingScore))
      .map(([playerId, result]) => [playerId, { ...result, score: result.cultFollowingScore }])
  )
}

export function voterHasCompleted(votes = [], roundId, playerId) {
  return votes.some(vote => vote.round_id === roundId && vote.voter_player_id === playerId && Number(vote.points) > 0)
}
