export const GROUP_LABELS = ['Side A', 'Side B']

// Below this many active players the round runs as a single pool, like Season 2 originally did.
export const MIN_PLAYERS_TO_SPLIT = 10

// Above this many candidate partitions the exact search is abandoned for a local search.
// A 20-player league produces 184,756 candidates, so realistic rosters stay exact.
const MAX_EXHAUSTIVE_PARTITIONS = 300000
const MAX_TIED_CANDIDATES = 512
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

// Counts, for every pair of players, how many past rounds put them on the same side.
function priorPairCounts(playerIds, priorGroupRows) {
  const position = Object.fromEntries(playerIds.map((id, index) => [id, index]))
  const counts = playerIds.map(() => new Array(playerIds.length).fill(0))
  const membersByRoundSide = {}

  for (const row of priorGroupRows || []) {
    const key = `${row.round_id}:${row.group_index}`
    if (!membersByRoundSide[key]) membersByRoundSide[key] = []
    membersByRoundSide[key].push(row.player_id)
  }

  for (const members of Object.values(membersByRoundSide)) {
    for (let i = 0; i < members.length; i += 1) {
      const a = position[members[i]]
      if (a === undefined) continue
      for (let j = i + 1; j < members.length; j += 1) {
        const b = position[members[j]]
        if (b === undefined) continue
        counts[a][b] += 1
        counts[b][a] += 1
      }
    }
  }

  return counts
}

// Cost of a split is the number of same-side pairs weighted by how often those pairs have
// already been together. Minimising it is algebraically the same as minimising the spread in
// pair-meeting counts, which is what "everyone plays with everyone equally" means.
function partitionCost(inSideA, counts) {
  const n = inSideA.length
  let cost = 0
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (inSideA[i] === inSideA[j]) cost += counts[i][j]
    }
  }
  return cost
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

function bestPartitionsExhaustive(n, sizeA, counts, anchorFirst) {
  const inSideA = new Array(n).fill(false)
  let bestCost = Infinity
  let best = []

  eachCombination(n, sizeA, anchorFirst, combo => {
    inSideA.fill(false)
    for (const index of combo) inSideA[index] = true

    const cost = partitionCost(inSideA, counts)
    if (cost < bestCost) {
      bestCost = cost
      best = [combo.slice()]
    } else if (cost === bestCost && best.length < MAX_TIED_CANDIDATES) {
      best.push(combo.slice())
    }
  })

  return best
}

// Swapping a from side A with b from side B changes only the pairs those two belong to.
function swapDelta(a, b, inSideA, counts) {
  let delta = 0
  for (let x = 0; x < inSideA.length; x += 1) {
    if (x === a || x === b) continue
    if (inSideA[x]) delta += counts[b][x] - counts[a][x]
    else delta += counts[a][x] - counts[b][x]
  }
  return delta
}

function bestPartitionLocalSearch(n, sizeA, counts, random) {
  let bestCombo = null
  let bestCost = Infinity

  for (let restart = 0; restart < LOCAL_SEARCH_RESTARTS; restart += 1) {
    const order = Array.from({ length: n }, (_, index) => index)
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }

    const inSideA = new Array(n).fill(false)
    for (let i = 0; i < sizeA; i += 1) inSideA[order[i]] = true

    let cost = partitionCost(inSideA, counts)
    let improved = true

    while (improved) {
      improved = false
      for (let a = 0; a < n; a += 1) {
        if (!inSideA[a]) continue
        for (let b = 0; b < n; b += 1) {
          if (inSideA[b]) continue
          const delta = swapDelta(a, b, inSideA, counts)
          if (delta < 0) {
            inSideA[a] = false
            inSideA[b] = true
            cost += delta
            improved = true
          }
        }
      }
    }

    if (cost < bestCost) {
      bestCost = cost
      bestCombo = inSideA.reduce((acc, isA, index) => (isA ? [...acc, index] : acc), [])
    }
  }

  return bestCombo || []
}

export function buildRoundGroupAssignment({ roundId, activePlayers = [], priorGroupRows = [] }) {
  const playerIds = activePlayers.map(player => player.id).filter(Boolean).sort()
  const n = playerIds.length
  if (!roundId || !shouldSplitRound(n)) return null

  const sizeA = Math.ceil(n / 2)
  const counts = priorPairCounts(playerIds, priorGroupRows)
  const random = mulberry32(hashString(`muzak-sides-v1:${roundId}`))

  // With an even roster every split is generated twice, once as itself and once mirrored.
  // Anchoring the first player to side A removes the duplicate half of the search.
  const anchorFirst = n % 2 === 0

  let combo
  if (binomial(n, sizeA) <= MAX_EXHAUSTIVE_PARTITIONS) {
    const candidates = bestPartitionsExhaustive(n, sizeA, counts, anchorFirst)
    combo = candidates[Math.floor(random() * candidates.length)] || []
  } else {
    combo = bestPartitionLocalSearch(n, sizeA, counts, random)
  }

  const sideAIndexes = new Set(combo)
  // Without this the anchored player would sit on Side A every single week.
  const flip = random() < 0.5

  return playerIds.map((playerId, index) => {
    const side = sideAIndexes.has(index) ? 0 : 1
    return { player_id: playerId, group_index: flip ? 1 - side : side }
  })
}
