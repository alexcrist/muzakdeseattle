const COLORS = ['#ff7ab6', '#65d6ff', '#ffe66d', '#a78bfa', '#6ee7b7', '#ff9f6e']

function initialsFor(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

function colorFor(player) {
  if (player?.avatar_color) return player.avatar_color
  const source = player?.id || player?.name || 'muzak'
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 997
  }
  return COLORS[hash % COLORS.length]
}

export default function Avatar({ player, size = 'md', label }) {
  const name = label || player?.name || 'Player'
  const color = colorFor(player)
  const style = {
    '--avatar-color': color,
  }

  if (player?.avatar_url) {
    return (
      <span className={`avatar avatar-${size}`} style={style} aria-label={name}>
        <img src={player.avatar_url} alt="" />
      </span>
    )
  }

  return (
    <span className={`avatar avatar-${size}`} style={style} aria-label={name}>
      {initialsFor(name)}
    </span>
  )
}
