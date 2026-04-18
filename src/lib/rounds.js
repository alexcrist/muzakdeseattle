import { supabase } from './supabase.js'

// ─────────────────────────────────────────────
// Checks all rounds and advances status based on deadlines.
// Called on page load and every 60 seconds.
// ─────────────────────────────────────────────
export async function tickRoundTransitions() {
  const now = new Date().toISOString()

  // Get settings to check pause state
  const { data: settings } = await supabase
    .from('league_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (settings?.is_paused) return // frozen

  // Find the active submission round that has passed its deadline
  const { data: submissionExpired } = await supabase
    .from('rounds')
    .select('*')
    .eq('status', 'submission')
    .lt('submission_deadline', now)

  for (const round of submissionExpired || []) {
    await supabase
      .from('rounds')
      .update({ status: 'voting' })
      .eq('id', round.id)
  }

  // Find active voting round that has passed its deadline
  const { data: votingExpired } = await supabase
    .from('rounds')
    .select('*')
    .eq('status', 'voting')
    .lt('voting_deadline', now)

  for (const round of votingExpired || []) {
    // Mark this round complete
    await supabase
      .from('rounds')
      .update({ status: 'complete' })
      .eq('id', round.id)

    // Find the next pending round (lowest queue_position)
    const { data: nextRounds } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'pending')
      .order('queue_position', { ascending: true })
      .limit(1)

    if (nextRounds && nextRounds.length > 0) {
      const next = nextRounds[0]
      const subDeadline = new Date()
      subDeadline.setHours(subDeadline.getHours() + (settings?.default_submission_hours || 48))
      const votDeadline = new Date(subDeadline)
      votDeadline.setHours(votDeadline.getHours() + (settings?.default_voting_hours || 48))

      await supabase
        .from('rounds')
        .update({
          status: 'submission',
          submission_deadline: subDeadline.toISOString(),
          voting_deadline: votDeadline.toISOString(),
        })
        .eq('id', next.id)
    }
  }
}

// Pause: store current time, freeze deadlines
export async function pauseLeague() {
  await supabase
    .from('league_settings')
    .update({ is_paused: true, paused_at: new Date().toISOString() })
    .eq('id', 1)
}

// Unpause: extend all active deadlines by elapsed pause duration
export async function unpauseLeague() {
  const { data: settings } = await supabase
    .from('league_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (!settings?.paused_at) return

  const elapsed = Date.now() - new Date(settings.paused_at).getTime()

  // Extend submission round deadlines
  const { data: activeRounds } = await supabase
    .from('rounds')
    .select('*')
    .in('status', ['submission', 'voting'])

  for (const round of activeRounds || []) {
    const updates = {}
    if (round.submission_deadline) {
      updates.submission_deadline = new Date(
        new Date(round.submission_deadline).getTime() + elapsed
      ).toISOString()
    }
    if (round.voting_deadline) {
      updates.voting_deadline = new Date(
        new Date(round.voting_deadline).getTime() + elapsed
      ).toISOString()
    }
    await supabase.from('rounds').update(updates).eq('id', round.id)
  }

  await supabase
    .from('league_settings')
    .update({ is_paused: false, paused_at: null })
    .eq('id', 1)
}

export function formatDeadline(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}

export function useCountdown(deadline) {
  // Returns { days, hours, minutes, seconds, expired }
  if (!deadline) return { expired: true }
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return { days, hours, minutes, seconds, expired: false }
}
