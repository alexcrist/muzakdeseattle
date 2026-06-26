import {
  DAY_KEYS,
  DAY_LABELS,
  normalizeTemplate,
  PHASES,
} from '../../lib/schedule.js'

const PHASE_OPTIONS = ['submission', 'voting', 'appreciation', 'off']

export default function ScheduleEditor({ template, onChange }) {
  const normalized = normalizeTemplate(template)

  function setDay(day, phase) {
    onChange({ ...normalized, [day]: phase })
  }

  return (
    <div className="schedule-editor">
      <div className="section-heading compact">
        <h3>Weekly phase calendar</h3>
        <span className="soft-tag">Pacific time</span>
      </div>
      <div className="day-grid">
        {DAY_KEYS.map(day => (
          <div className="day-tile" key={day}>
            <strong>{DAY_LABELS[day]}</strong>
            <div className="segmented">
              {PHASE_OPTIONS.map(phase => (
                <button
                  type="button"
                  key={phase}
                  className={normalized[day] === phase ? 'active' : ''}
                  onClick={() => setDay(day, phase)}
                >
                  {PHASES[phase].shortLabel}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
