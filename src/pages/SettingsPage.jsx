import { useEffect, useState } from 'react'
import { usePlayer, useSettings } from '../App.jsx'
import useRealtimeData from '../hooks/useRealtimeData.js'
import { ADMIN_REALTIME_TABLES, EMPTY_ADMIN_DATA, fetchAdminData } from '../lib/data.js'
import { saveLeagueSettings } from '../lib/mutations.js'
import {
  DEFAULT_WEEKLY_TEMPLATE,
  getCurrentMonday,
  normalizeTemplate,
} from '../lib/schedule.js'
import AdminUnlock from './admin/AdminUnlock.jsx'
import DuplicateMergeTool from './admin/DuplicateMergeTool.jsx'
import PlayerStatusTool from './admin/PlayerStatusTool.jsx'
import ScheduleEditor from './admin/ScheduleEditor.jsx'

export default function AdminPage() {
  const { player } = usePlayer()
  const { settings, setSettings } = useSettings()
  const { data, loading, reload } = useRealtimeData({
    channelName: 'admin-season-2',
    fetcher: fetchAdminData,
    initialData: EMPTY_ADMIN_DATA,
    tables: ADMIN_REALTIME_TABLES,
  })
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [form, setForm] = useState({
    league_name: settings?.league_name || 'Muzak de Seattle',
    season_label: settings?.season_label || 'Season 2',
    points_per_player: settings?.points_per_player || 10,
    schedule_start_date: settings?.schedule_start_date || getCurrentMonday(),
    weekly_phase_template: normalizeTemplate(settings?.weekly_phase_template || DEFAULT_WEEKLY_TEMPLATE),
  })
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!settings) return
    setForm({
      league_name: settings.league_name || 'Muzak de Seattle',
      season_label: settings.season_label || 'Season 2',
      points_per_player: settings.points_per_player || 10,
      schedule_start_date: settings.schedule_start_date || getCurrentMonday(),
      weekly_phase_template: normalizeTemplate(settings.weekly_phase_template),
    })
  }, [settings])

  async function saveSettings(event) {
    event.preventDefault()
    const { saved, error } = await saveLeagueSettings({ form, rounds: data.rounds })

    if (error || !saved) {
      setMessage('Could not save settings.')
      return
    }

    setSettings(saved)
    setMessage('Settings saved.')
    reload()
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading admin...</p>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Open admin zone</p>
          <h1>Admin</h1>
          <p>Everyone can change these controls. Move carefully.</p>
        </div>
      </section>

      <section className="warning-panel loud">
        <strong>Hear be dragons</strong>
        <p>Past this sign are public controls that can move the season, merge songs, and bench players. Wake them only when you mean it.</p>
      </section>

      {!adminUnlocked ? (
        <AdminUnlock onUnlock={() => setAdminUnlocked(true)} />
      ) : (
        <>
          <DuplicateMergeTool settings={settings} data={data} onChanged={reload} />

          <section className="card admin-settings">
            <div className="section-heading">
              <h2>League settings</h2>
              {message && <span className={message.includes('Could not') ? 'error-msg' : 'success-msg'}>{message}</span>}
            </div>

            <form className="stack" onSubmit={saveSettings}>
              <div className="form-row">
                <label>
                  <span>League name</span>
                  <input value={form.league_name} onChange={event => setForm(f => ({ ...f, league_name: event.target.value }))} />
                </label>
                <label>
                  <span>Season label</span>
                  <input value={form.season_label} onChange={event => setForm(f => ({ ...f, season_label: event.target.value }))} />
                </label>
              </div>

              <div className="form-row">
                <label>
                  <span>Points per player</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.points_per_player}
                    onChange={event => setForm(f => ({ ...f, points_per_player: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Schedule start Monday</span>
                  <input
                    type="date"
                    value={form.schedule_start_date}
                    onChange={event => setForm(f => ({ ...f, schedule_start_date: event.target.value }))}
                  />
                </label>
              </div>

              <ScheduleEditor
                template={form.weekly_phase_template}
                onChange={weekly_phase_template => setForm(f => ({ ...f, weekly_phase_template }))}
              />

              <button type="submit" className="btn btn-primary">Save settings</button>
            </form>
          </section>

          <PlayerStatusTool players={data.players} currentPlayerId={player.id} onChanged={reload} />
        </>
      )}
    </main>
  )
}
