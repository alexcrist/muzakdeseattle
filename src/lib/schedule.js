const TIME_ZONE = 'America/Los_Angeles'

export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export const PHASES = {
  submission: { key: 'submission', label: 'Submission', shortLabel: 'Submit', tone: 'submission' },
  voting: { key: 'voting', label: 'Voting', shortLabel: 'Vote', tone: 'voting' },
  appreciation: { key: 'appreciation', label: 'Appreciation', shortLabel: 'Appreciate', tone: 'appreciation' },
  off: { key: 'off', label: 'Off day', shortLabel: 'Off', tone: 'off' },
}

export const DEFAULT_WEEKLY_TEMPLATE = {
  monday: 'submission',
  tuesday: 'submission',
  wednesday: 'submission',
  thursday: 'voting',
  friday: 'voting',
  saturday: 'voting',
  sunday: 'appreciation',
}

const WEEKDAY_TO_KEY = {
  Monday: 'monday',
  Tuesday: 'tuesday',
  Wednesday: 'wednesday',
  Thursday: 'thursday',
  Friday: 'friday',
  Saturday: 'saturday',
  Sunday: 'sunday',
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function pad(value) {
  return String(value).padStart(2, '0')
}

function partsFor(date = new Date()) {
  const parts = {}
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  return parts
}

export function getPacificParts(date = new Date()) {
  const parts = partsFor(date)
  return {
    weekday: parts.weekday,
    dayKey: WEEKDAY_TO_KEY[parts.weekday],
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? 0 : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

export function dateKeyToNoonUtc(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`)
}

export function addDays(dateKey, days) {
  const date = dateKeyToNoonUtc(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function daysBetween(startDateKey, endDateKey) {
  const start = dateKeyToNoonUtc(startDateKey).getTime()
  const end = dateKeyToNoonUtc(endDateKey).getTime()
  return Math.round((end - start) / 86400000)
}

export function getCurrentMonday(date = new Date()) {
  const parts = getPacificParts(date)
  const offset = DAY_KEYS.indexOf(parts.dayKey)
  return addDays(parts.dateKey, -offset)
}

export function normalizeTemplate(template) {
  return { ...DEFAULT_WEEKLY_TEMPLATE, ...(template || {}) }
}

export function getScheduleStartDate(settings, now = new Date()) {
  return settings?.schedule_start_date || getCurrentMonday(now)
}

function timeZoneOffsetMs(date, timeZone = TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? 0 : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )

  return asUtc - date.getTime()
}

export function pacificDateTimeToUtc(dateKey, hour = 0, minute = 0, second = 0) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const offset = timeZoneOffsetMs(guess)
  const utc = new Date(guess.getTime() - offset)
  const correctedOffset = timeZoneOffsetMs(utc)
  return new Date(guess.getTime() - correctedOffset)
}

export function nextPacificMidnight(now = new Date()) {
  const today = getPacificParts(now).dateKey
  return pacificDateTimeToUtc(addDays(today, 1), 0, 0, 0)
}

export function phaseForDate(settings, date = new Date()) {
  const template = normalizeTemplate(settings?.weekly_phase_template)
  const dayKey = getPacificParts(date).dayKey
  return template[dayKey] || 'off'
}

export function phaseForDateKey(settings, dateKey) {
  const date = pacificDateTimeToUtc(dateKey, 12, 0, 0)
  return phaseForDate(settings, date)
}

export function nextPhaseAfter(settings, now = new Date()) {
  const template = normalizeTemplate(settings?.weekly_phase_template)
  const today = getPacificParts(now).dateKey
  const currentPhase = phaseForDate(settings, now)

  for (let offset = 1; offset <= 8; offset += 1) {
    const dateKey = addDays(today, offset)
    const dayKey = getPacificParts(pacificDateTimeToUtc(dateKey, 12, 0, 0)).dayKey
    const phase = template[dayKey] || 'off'
    if (phase !== currentPhase || offset === 8) {
      return {
        phase,
        dateKey,
        at: pacificDateTimeToUtc(dateKey, 0, 0, 0),
      }
    }
  }

  return {
    phase: currentPhase,
    dateKey: addDays(today, 1),
    at: nextPacificMidnight(now),
  }
}

export function sortedRounds(rounds = []) {
  return [...rounds]
    .filter(round => !round.is_archived)
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0) || a.created_at?.localeCompare(b.created_at || '') || 0)
}

export function getRoundWeekStart(settings, round, index, now = new Date()) {
  return round?.week_start_date || addDays(getScheduleStartDate(settings, now), index * 7)
}

export function getLeagueContext(rounds = [], settings, now = new Date()) {
  const orderedRounds = sortedRounds(rounds)
  const startDate = getScheduleStartDate(settings, now)
  const today = getPacificParts(now).dateKey
  const dayOffset = daysBetween(startDate, today)
  const currentWeekIndex = Math.floor(dayOffset / 7)
  const phase = phaseForDate(settings, now)
  const nextChange = nextPhaseAfter(settings, now)

  const currentRound = currentWeekIndex >= 0 && currentWeekIndex < orderedRounds.length
    ? orderedRounds[currentWeekIndex]
    : null

  const nextRound = currentRound
    ? orderedRounds[currentWeekIndex + 1] || null
    : currentWeekIndex < 0
      ? orderedRounds[0] || null
      : null

  const latestRound = currentWeekIndex >= orderedRounds.length
    ? orderedRounds[orderedRounds.length - 1] || null
    : currentRound

  return {
    orderedRounds,
    startDate,
    today,
    currentWeekIndex,
    phase,
    phaseMeta: PHASES[phase] || PHASES.off,
    currentRound,
    currentRoundIndex: currentRound ? currentWeekIndex : -1,
    currentWeekStart: currentRound ? getRoundWeekStart(settings, currentRound, currentWeekIndex, now) : null,
    nextRound,
    latestRound,
    nextPhase: nextChange.phase,
    nextPhaseAt: nextChange.at,
    nextPhaseDateKey: nextChange.dateKey,
  }
}

export function getRoundTiming(round, index, settings, now = new Date()) {
  const weekStart = getRoundWeekStart(settings, round, index, now)
  const weekEnd = addDays(weekStart, 7)
  const phaseRanges = []
  const template = normalizeTemplate(settings?.weekly_phase_template)

  let activePhase = template.monday || 'off'
  let rangeStart = weekStart

  for (let i = 1; i <= DAY_KEYS.length; i += 1) {
    const nextPhase = i < DAY_KEYS.length ? template[DAY_KEYS[i]] || 'off' : null
    if (nextPhase !== activePhase) {
      phaseRanges.push({
        phase: activePhase,
        startDate: rangeStart,
        endDate: addDays(weekStart, i),
      })
      rangeStart = addDays(weekStart, i)
      activePhase = nextPhase
    }
  }

  return { weekStart, weekEnd, phaseRanges }
}

export function getRoundState(round, index, settings, now = new Date()) {
  const today = getPacificParts(now).dateKey
  const weekStart = getRoundWeekStart(settings, round, index, now)
  const weekEnd = addDays(weekStart, 7)

  if (daysBetween(today, weekStart) > 0) return 'upcoming'
  if (daysBetween(weekEnd, today) >= 0) return 'past'
  return 'current'
}

export function getScoredRoundIds(rounds = [], settings, now = new Date()) {
  const context = getLeagueContext(rounds, settings, now)
  const ids = new Set()
  context.orderedRounds.forEach((round, index) => {
    const state = getRoundState(round, index, settings, now)
    if (state === 'past') ids.add(round.id)
    if (state === 'current' && context.phase === 'appreciation') ids.add(round.id)
  })
  return ids
}

export function formatPacificDate(dateOrKey, options = {}) {
  const date = typeof dateOrKey === 'string'
    ? pacificDateTimeToUtc(dateOrKey, 12, 0, 0)
    : dateOrKey

  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: options.weekday || 'short',
    month: 'short',
    day: 'numeric',
    hour: options.includeTime ? 'numeric' : undefined,
    minute: options.includeTime ? '2-digit' : undefined,
  }).format(date)
}

export function formatPhaseDateRange(range) {
  const start = formatPacificDate(range.startDate, { weekday: 'short' })
  const endDate = addDays(range.endDate, -1)
  const end = formatPacificDate(endDate, { weekday: 'short' })
  const phase = PHASES[range.phase]?.label || 'Off'
  return start === end ? `${phase}: ${start}` : `${phase}: ${start}-${end}`
}

export function formatCountdownParts(targetDate) {
  if (!targetDate) return { expired: true }
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    expired: false,
  }
}
