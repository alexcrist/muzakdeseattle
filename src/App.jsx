import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import { getStoredPlayer, storePlayer } from './lib/identity.js'
import { tickRoundTransitions } from './lib/rounds.js'

import Nav from './components/Nav.jsx'
import PauseBanner from './components/PauseBanner.jsx'
import JoinScreen from './pages/JoinScreen.jsx'
import HomePage from './pages/HomePage.jsx'
import QueuePage from './pages/QueuePage.jsx'
import ArchivePage from './pages/ArchivePage.jsx'
import LeaderboardPage from './pages/LeaderboardPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import PlayerListPage from './pages/PlayerListPage.jsx'

// ── Player context ──────────────────────────────
export const PlayerContext = createContext(null)
export const SettingsContext = createContext(null)
export function usePlayer() { return useContext(PlayerContext) }
export function useSettings() { return useContext(SettingsContext) }

export default function App() {
  const [player, setPlayer] = useState(getStoredPlayer())
  const [settings, setSettings] = useState(null)
  const [loadingSettings, setLoadingSettings] = useState(true)

  // Load league settings
  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from('league_settings')
        .select('*')
        .eq('id', 1)
        .single()
      setSettings(data)
      setLoadingSettings(false)
    }
    loadSettings()

    // Subscribe to settings changes
    const sub = supabase
      .channel('settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_settings' }, () => loadSettings())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  // Tick round transitions on load and every 60s
  useEffect(() => {
    tickRoundTransitions()
    const interval = setInterval(tickRoundTransitions, 60000)
    return () => clearInterval(interval)
  }, [])

  function handleJoin(p) {
    storePlayer(p)
    setPlayer(p)
  }

  if (loadingSettings) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <span style={{ color:'var(--text3)', fontFamily:'var(--font-mono)' }}>loading...</span>
      </div>
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
    <PlayerContext.Provider value={{ player, setPlayer }}>
      <SettingsContext.Provider value={{ settings, setSettings }}>
        <BrowserRouter>
          {settings?.is_paused && <PauseBanner />}
          <div style={{ paddingTop: '0.5rem' }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/queue" element={<QueuePage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/players" element={<PlayerListPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <Nav />
        </BrowserRouter>
      </SettingsContext.Provider>
    </PlayerContext.Provider>
  )
}
