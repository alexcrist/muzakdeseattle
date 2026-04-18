import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Nav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const go = (path) => {
    navigate(path)
    setMenuOpen(false)
  }

  const isMenu = ['/archive', '/leaderboard', '/settings'].includes(location.pathname)

  return (
    <>
      {menuOpen && (
        <div
          style={{ position:'fixed', inset:0, zIndex:150 }}
          onClick={() => setMenuOpen(false)}
        />
      )}

      {menuOpen && (
        <div className="menu-dropdown">
          <button className="menu-dropdown-item" onClick={() => go('/players')}>
            👥 Players
          </button>
          <button className="menu-dropdown-item" onClick={() => go('/archive')}>
            📀 Song Archive
          </button>
          <button className="menu-dropdown-item" onClick={() => go('/leaderboard')}>
            🏆 Leaderboard
          </button>
          <button className="menu-dropdown-item" onClick={() => go('/settings')}>
            ⚙️ Settings
          </button>
        </div>
      )}

      <nav className="nav">
        <button
          className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          onClick={() => go('/')}
        >
          <span className="nav-icon">🎵</span>
          Home
        </button>

        <button
          className={`nav-item ${location.pathname === '/queue' ? 'active' : ''}`}
          onClick={() => go('/queue')}
        >
          <span className="nav-icon">📋</span>
          Round Queue
        </button>

        <button
          className={`nav-item ${isMenu ? 'active' : ''}`}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span className="nav-icon">☰</span>
          Menu
        </button>
      </nav>
    </>
  )
}
