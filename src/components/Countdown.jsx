import { useEffect, useState } from 'react'
import { formatCountdownParts } from '../lib/schedule.js'

export default function Countdown({ target, label }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(tick => tick + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const parts = formatCountdownParts(target)

  if (parts.expired) {
    return (
      <div className="countdown-card">
        <span className="countdown-label">{label || 'Next phase'}</span>
        <span className="countdown-expired">Refreshing...</span>
      </div>
    )
  }

  const units = [
    ['days', parts.days],
    ['hrs', parts.hours],
    ['min', parts.minutes],
    ['sec', parts.seconds],
  ].filter(([unit, value]) => unit !== 'days' || value > 0)

  return (
    <div className="countdown-card">
      {label && <span className="countdown-label">{label}</span>}
      <div className="countdown">
        {units.map(([unit, value]) => (
          <span className="countdown-unit" key={unit}>
            <strong>{String(value).padStart(unit === 'days' ? 1 : 2, '0')}</strong>
            <span>{unit}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
