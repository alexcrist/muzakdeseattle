import { Link } from 'react-router-dom'

const COLORS = ['#ff7ab6', '#65d6ff', '#ffe66d', '#a78bfa', '#6ee7b7', '#ff9f6e']

function colorFor(player) {
  if (player?.avatar_color) return player.avatar_color
  const source = player?.id || player?.name || 'muzak'
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 997
  }
  return COLORS[hash % COLORS.length]
}

export default function Avatar({ player, size = 'md', label, linkToProfile = true }) {
  const name = label || player?.name || 'Player'
  const color = colorFor(player)
  const style = {
    '--avatar-color': color,
  }
  const canLinkToProfile = linkToProfile && player?.id && !String(player.id).startsWith('anon-')

  const avatar = (
    <span className={`avatar avatar-${size}`} style={style} aria-label={canLinkToProfile ? undefined : name}>
      <img src={player?.avatar_url || '/default-avatar.png'} alt="" />
    </span>
  )

  if (!canLinkToProfile) return avatar

  return (
    <Link className="avatar-link" to={`/players/${player.id}`} aria-label={`View ${name}'s profile`}>
      {avatar}
    </Link>
  )
}
