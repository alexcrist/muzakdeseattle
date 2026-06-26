import { useLocation, useNavigate } from 'react-router-dom'

const ITEMS = [
  { path: '/', icon: '♪', label: 'Home' },
  { path: '/rounds', icon: '□', label: 'Rounds' },
  { path: '/players', icon: '●', label: 'Players' },
  { path: '/admin', icon: '!', label: 'Admin' },
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
          className={`nav-item ${location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)) ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
