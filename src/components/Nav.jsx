import { useLocation, useNavigate } from 'react-router-dom'

const ITEMS = [
  { path: '/', Icon: HomeIcon, label: 'Home', tone: 'home' },
  { path: '/rounds', Icon: RoundsIcon, label: 'Rounds', tone: 'rounds' },
  { path: '/players', Icon: PlayersIcon, label: 'Players', tone: 'players' },
  { path: '/admin', Icon: AdminIcon, label: 'Admin', tone: 'admin' },
]

export default function Nav() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <nav className="nav" aria-label="Main navigation">
      {ITEMS.map(item => (
        <button
          type="button"
          key={item.path}
          className={`nav-item nav-${item.tone} ${location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)) ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <span className="nav-icon" aria-hidden="true">
            <item.Icon />
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 32 32" focusable="false">
      <circle className="nav-icon-pop" cx="17" cy="17" r="11" />
      <circle className="nav-icon-core" cx="15" cy="15" r="9" />
      <circle className="nav-icon-hole" cx="15" cy="15" r="3" />
      <path className="nav-icon-line" d="M22 9v11c0 2.2-1.7 3.8-3.8 3.8-1.7 0-3-1-3-2.4 0-1.5 1.4-2.5 3.1-2.5.7 0 1.3.1 1.8.4V9h1.9Z" />
    </svg>
  )
}

function RoundsIcon() {
  return (
    <svg viewBox="0 0 32 32" focusable="false">
      <path className="nav-icon-pop" d="M8 10h14a4 4 0 0 1 4 4v10H10a4 4 0 0 1-4-4v-8a2 2 0 0 1 2-2Z" />
      <path className="nav-icon-core" d="M6 7h15a4 4 0 0 1 4 4v10H10a4 4 0 0 1-4-4V7Z" />
      <path className="nav-icon-line" d="M11 13h9M11 17h6" />
      <circle className="nav-icon-hole" cx="21" cy="21" r="2.5" />
    </svg>
  )
}

function PlayersIcon() {
  return (
    <svg viewBox="0 0 32 32" focusable="false">
      <circle className="nav-icon-pop" cx="21" cy="12" r="6" />
      <circle className="nav-icon-core" cx="13" cy="12" r="7" />
      <path className="nav-icon-line-fill" d="M5 25c1.5-5.4 5-8 10-8s8.5 2.6 10 8H5Z" />
      <circle className="nav-icon-hole" cx="13" cy="12" r="2" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg viewBox="0 0 32 32" focusable="false">
      <path className="nav-icon-pop" d="M17 4 28 24H6L17 4Z" />
      <path className="nav-icon-core" d="M15 4 26 24H4L15 4Z" />
      <path className="nav-icon-line" d="M15 11v6" />
      <circle className="nav-icon-hole" cx="15" cy="21" r="2" />
    </svg>
  )
}
