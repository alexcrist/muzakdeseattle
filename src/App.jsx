import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getCurrentMonday } from './lib/schedule.js'
import { clearPlayer, getStoredPlayer, storePlayer } from './lib/identity.js'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'

import AdminPage from './pages/SettingsPage.jsx'
import HomePage from './pages/HomePage.jsx'
import JoinScreen from './pages/JoinScreen.jsx'
import Nav from './components/Nav.jsx'
import PlayerPage from './pages/PlayerPage.jsx'
import PlayerListPage from './pages/PlayerListPage.jsx'
import RoundsPage from './pages/QueuePage.jsx'

export const PlayerContext = createContext(null)
export const SettingsContext = createContext(null)

export function usePlayer() {
  return useContext(PlayerContext)
}

export function useSettings() {
  return useContext(SettingsContext)
}

function SetupRequired() {
  return (
    <main className="setup-screen">
      <div className="setup-panel">
        <span className="bubble-mark">M2</span>
        <h1>Muzak Season 2</h1>
        <p>
          Add Supabase environment variables to run the Season 2 database.
          The setup SQL and Netlify notes are in `SETUP.md`.
        </p>
      </div>
    </main>
  )
}

async function loadSettings() {
  const { data, error } = await supabase
    .from('league_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) return null
  return {
    ...data,
    schedule_start_date: data.schedule_start_date || getCurrentMonday(),
  }
}

export default function App() {
  const [player, setPlayer] = useState(getStoredPlayer())
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return undefined
    }

    let mounted = true

    async function boot() {
      const nextSettings = await loadSettings()
      if (mounted) setSettings(nextSettings)

      const stored = getStoredPlayer()
      if (stored?.id) {
        const { data } = await supabase
          .from('players')
          .select('*')
          .eq('id', stored.id)
          .single()
        if (data?.active) {
          storePlayer(data)
          if (mounted) setPlayer(data)
        } else if (!data) {
          clearPlayer()
          if (mounted) setPlayer(null)
        }
      }

      if (mounted) setLoading(false)
    }

    boot()

    const settingsSub = supabase
      .channel('settings-season-2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_settings' }, async () => {
        const nextSettings = await loadSettings()
        if (mounted) setSettings(nextSettings)
      })
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(settingsSub)
    }
  }, [])

  function handleJoin(nextPlayer) {
    storePlayer(nextPlayer)
    setPlayer(nextPlayer)
  }

  function handlePlayerUpdate(nextPlayer) {
    storePlayer(nextPlayer)
    setPlayer(nextPlayer)
  }

  if (!isSupabaseConfigured) return <SetupRequired />

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="bubble-mark">M2</span>
        <p>Loading Muzak...</p>
      </main>
    )
  }

  if (!player) {
    return (
      <SettingsContext.Provider value={{ settings, setSettings }}>
        <JoinScreen onJoin={handleJoin} />
      </SettingsContext.Provider>
    )
  }

  return (
    <PlayerContext.Provider value={{ player, setPlayer: handlePlayerUpdate }}>
      <SettingsContext.Provider value={{ settings, setSettings }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/rounds" element={<RoundsPage />} />
            <Route path="/players" element={<PlayerListPage />} />
            <Route path="/players/:playerId" element={<PlayerPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/queue" element={<Navigate to="/rounds" replace />} />
            <Route path="/leaderboard" element={<Navigate to="/players" replace />} />
            <Route path="/archive" element={<Navigate to="/rounds" replace />} />
            <Route path="/history" element={<Navigate to="/rounds" replace />} />
            <Route path="/settings" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Nav />
        </BrowserRouter>
      </SettingsContext.Provider>
    </PlayerContext.Provider>
  )
}
