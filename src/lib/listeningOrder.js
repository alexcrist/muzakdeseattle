function hashString(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function listeningOrderFor(items = [], { roundId, playerId, getId = item => item.id } = {}) {
  const seed = `${roundId || 'round'}:${playerId || 'player'}`
  return [...items]
    .map((item, index) => ({
      item,
      index,
      rank: hashString(`muzak-listening-v1:${seed}:${getId(item) || index}`),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(row => row.item)
}
