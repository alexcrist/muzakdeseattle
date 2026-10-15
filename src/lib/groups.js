export const GROUP_LABELS = ['Side A', 'Side B']

// Below this many active players the round runs as a single pool, like Season 2 originally did.
export const MIN_PLAYERS_TO_SPLIT = 10

// Above this many candidate partitions the exact search is abandoned for a local search.
// A 20-player league produces 184,756 candidates, so realistic rosters stay exact.
const MAX_EXHAUSTIVE_PARTITIONS = 300000
const LOCAL_SEARCH_RESTARTS = 200

export function groupLabel(index) {
  return GROUP_LABELS[index] || `Side ${Number(index) + 1}`
}

function hashString(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0
  const half = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= half; i += 1) {
    result = (result * (n - half + i)) / i
  }
  return Math.round(result)
}

export function shouldSplitRound(activePlayerCount) {
  return activePlayerCount >= MIN_PLAYERS_TO_SPLIT
}

export function sidesForRound(roundGroups = [], roundId) {
  const sideByPlayerId = {}
  const playerIdsBySide = [[], []]
  let assignedCount = 0

  for (const row of roundGroups || []) {
    if (row.round_id !== roundId) continue
    const side = Number(row.group_index)
    if (side !== 0 && side !== 1) continue
    sideByPlayerId[row.player_id] = side
    playerIdsBySide[side].push(row.player_id)
    assignedCount += 1
  }

  return { isSplit: assignedCount > 0, sideByPlayerId, playerIdsBySide }
}

export function sideOf(sides, playerId) {
  if (!sides?.isSplit) return null
  const side = sides.sideByPlayerId[playerId]
  return side === 0 || side === 1 ? side : null
}

// Count meetings and remember their scheduled order. Query order and assignment timestamps
// cannot establish recency: rows arrive unordered, and late joiners are written separately.
function priorPairHistory(playerIds, priorGroupRows, rounds, roundId) {
  const position = Object.fromEntries(playerIds.map((id, index) => [id, index]))
  const counts = playerIds.map(() => new Array(playerIds.length).fill(0))
  const lastMet = playerIds.map(() => new Array(playerIds.length).fill(-Infinity))
  const roundPositions = new Map(rounds
    .filter(round => Number.isFinite(round.queue_position))
    .map(round => [round.id, round.queue_position]))
  const currentPosition = roundPositions.get(roundId)
  const membersByRoundSide = {}
  let maxCount = 0

  for (const row of priorGroupRows || []) {
    const roundPosition = roundPositions.get(row.round_id)
    if (row.round_id === roundId || (currentPosition !== undefined && roundPosition >= currentPosition)) continue
    const key = `${row.round_id}:${row.group_index}`
    if (!membersByRoundSide[key]) membersByRoundSide[key] = { members: [], roundPosition }
    membersByRoundSide[key].members.push(row.player_id)
  }

  for (const { members, roundPosition } of Object.values(membersByRoundSide)) {
    for (let i = 0; i < members.length; i += 1) {
      const a = position[members[i]]
      if (a === undefined) continue
      for (let j = i + 1; j < members.length; j += 1) {
        const b = position[members[j]]
        if (b === undefined) continue
        counts[a][b] += 1
        counts[b][a] += 1
        maxCount = Math.max(maxCount, counts[a][b])
        lastMet[a][b] = Math.max(lastMet[a][b], roundPosition ?? -Infinity)
        lastMet[b][a] = lastMet[a][b]
      }
    }
  }

  const recencyLevels = [...new Set(lastMet.flat())].sort((a, b) => a - b)
  const recencyRank = new Map(recencyLevels.map((value, index) => [value, index]))
  return {
    counts,
    recencyRanks: lastMet.map(row => row.map(value => recencyRank.get(value))),
    meetingLevels: maxCount + 1,
    recencyLevels: recencyLevels.length,
  }
}

// Cost of a split is the number of same-side pairs weighted by how often those pairs have
// already been together. Minimising it is algebraically the same as minimising the spread in
// pair-meeting counts, which is what "everyone plays with everyone equally" means.
function adjustPairScore(score, history, a, b, delta) {
  const meetings = history.counts[a][b]
  score.cost += delta * meetings
  score.byMeetings[meetings] += delta
  score.byRecency[history.recencyRanks[a][b]] += delta
}

function partitionScore(inSideA, history) {
  const n = inSideA.length
  const score = {
    cost: 0,
    byMeetings: new Array(history.meetingLevels).fill(0),
    byRecency: new Array(history.recencyLevels).fill(0),
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (inSideA[i] === inSideA[j]) adjustPairScore(score, history, i, j, 1)
    }
  }
  return score
}

// Negative means a is better. These are strict priorities, never a weighted compromise:
// 1. Minimum variance.
// 2. Most never-met pairs together, then most once-met pairs, then twice-met, etc.
// 3. Most longest-separated pairs together, then the next-longest separation, etc.
function compareScores(a, b) {
  if (!b) return -1
  if (a.cost !== b.cost) return a.cost - b.cost
  for (const key of ['byMeetings', 'byRecency']) {
    for (let i = 0; i < a[key].length; i += 1) {
      if (a[key][i] !== b[key][i]) return b[key][i] - a[key][i]
    }
  }
  return 0
}

function eachCombination(n, k, anchorFirst, visit) {
  const combo = new Array(k)

  function recurse(start, depth) {
    if (depth === k) {
      visit(combo)
      return
    }
    for (let i = start; i <= n - (k - depth); i += 1) {
      combo[depth] = i
      recurse(i + 1, depth + 1)
    }
  }

  if (anchorFirst) {
    combo[0] = 0
    recurse(1, 1)
  } else {
    recurse(0, 0)
  }
}

function bestPartitionExhaustive(n, sizeA, history, anchorFirst, random) {
  const inSideA = new Array(n).fill(false)
  let bestScore = null
  let bestCombo = []
  let tiedCount = 0

  eachCombination(n, sizeA, anchorFirst, combo => {
    inSideA.fill(false)
    for (const index of combo) inSideA[index] = true

    const score = partitionScore(inSideA, history)
    const comparison = compareScores(score, bestScore)
    if (comparison < 0) {
      bestScore = score
      bestCombo = combo.slice()
      tiedCount = 1
    } else if (comparison === 0) {
      // Reservoir sampling gives every equally good split the same chance, without a
      // candidate cap that favours the beginning of the sorted player-ID list.
      tiedCount += 1
      if (random() < 1 / tiedCount) bestCombo = combo.slice()
    }
  })

  return bestCombo
}

// Swapping a from side A with b from side B changes only the pairs those two belong to.
function scoreAfterSwap(a, b, inSideA, history, score) {
  const next = {
    cost: score.cost,
    byMeetings: score.byMeetings.slice(),
    byRecency: score.byRecency.slice(),
  }
  for (let x = 0; x < inSideA.length; x += 1) {
    if (x === a || x === b) continue
    const direction = inSideA[x] ? 1 : -1
    adjustPairScore(next, history, a, x, -direction)
    adjustPairScore(next, history, b, x, direction)
  }
  return next
}

function bestPartitionLocalSearch(n, sizeA, history, random) {
  let bestCombo = null
  let bestScore = null
  let tiedSplits = new Set()

  for (let restart = 0; restart < LOCAL_SEARCH_RESTARTS; restart += 1) {
    const order = Array.from({ length: n }, (_, index) => index)
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }

    const inSideA = new Array(n).fill(false)
    for (let i = 0; i < sizeA; i += 1) inSideA[order[i]] = true

    let score = partitionScore(inSideA, history)
    let improved = true

    while (improved) {
      improved = false
      search:
      for (let a = 0; a < n; a += 1) {
        if (!inSideA[a]) continue
        for (let b = 0; b < n; b += 1) {
          if (inSideA[b]) continue
          const next = scoreAfterSwap(a, b, inSideA, history, score)
          if (compareScores(next, score) < 0) {
            inSideA[a] = false
            inSideA[b] = true
            score = next
            improved = true
            // Restart after a swap: a is now on side B, so it cannot be swapped
            // with another B player without unbalancing the roster.
            break search
          }
        }
      }
    }

    const comparison = compareScores(score, bestScore)
    if (comparison > 0) continue
    const combo = []
    const complement = []
    inSideA.forEach((isA, index) => (isA ? combo : complement).push(index))
    const key = (n % 2 === 0 && !inSideA[0] ? complement : combo).join(',')
    if (comparison < 0) {
      bestScore = score
      bestCombo = combo
      tiedSplits = new Set([key])
    } else if (!tiedSplits.has(key)) {
      // This branch is approximate; sample uniformly among distinct best splits found.
      tiedSplits.add(key)
      if (random() < 1 / tiedSplits.size) bestCombo = combo
    }
  }

  return bestCombo || []
}

export function buildRoundGroupAssignment({ roundId, activePlayers = [], priorGroupRows = [], rounds = [] }) {
  const playerIds = activePlayers.map(player => player.id).filter(Boolean).sort()
  const n = playerIds.length
  if (!roundId || !shouldSplitRound(n)) return null

  const sizeA = Math.ceil(n / 2)
  const history = priorPairHistory(playerIds, priorGroupRows, rounds, roundId)
  const random = mulberry32(hashString(`muzak-sides-v2:${roundId}`))

  // With an even roster every split is generated twice, once as itself and once mirrored.
  // Anchoring the first player to side A removes the duplicate half of the search.
  const anchorFirst = n % 2 === 0

  let combo
  if (binomial(n, sizeA) <= MAX_EXHAUSTIVE_PARTITIONS) {
    combo = bestPartitionExhaustive(n, sizeA, history, anchorFirst, random)
  } else {
    combo = bestPartitionLocalSearch(n, sizeA, history, random)
  }

  const sideAIndexes = new Set(combo)
  // Without this the anchored player would sit on Side A every single week.
  const flip = random() < 0.5

  return playerIds.map((playerId, index) => {
    const side = sideAIndexes.has(index) ? 0 : 1
    return { player_id: playerId, group_index: flip ? 1 - side : side }
  })
}
