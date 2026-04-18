import { useState, useEffect } from 'react'
import { useCountdown } from '../lib/rounds.js'

export default function Countdown({ deadline, label }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const { days, hours, minutes, seconds, expired } = useCountdown(deadline)

  if (expired) {
    return <p style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>Deadline passed — refreshing...</p>
  }

  return (
    <div>
      {label && <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3)', marginBottom: '0.4rem' }}>{label}</p>}
      <div className="countdown">
        {days > 0 && (
          <div className="countdown-unit">
            <span className="num">{days}</span>
            <span className="lbl">days</span>
          </div>
        )}
        <div className="countdown-unit">
          <span className="num">{String(hours).padStart(2,'0')}</span>
          <span className="lbl">hrs</span>
        </div>
        <div className="countdown-unit">
          <span className="num">{String(minutes).padStart(2,'0')}</span>
          <span className="lbl">min</span>
        </div>
        <div className="countdown-unit">
          <span className="num">{String(seconds).padStart(2,'0')}</span>
          <span className="lbl">sec</span>
        </div>
      </div>
    </div>
  )
}
