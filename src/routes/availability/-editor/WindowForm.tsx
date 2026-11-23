import { useState } from 'react'
import { DAY, STEP, formatTime, type Interval } from './intervals'

const times = Array.from({ length: DAY / STEP + 1 }, (_, i) => i * STEP)

export function WindowForm({ onAdd }: { onAdd: (window: Interval) => void }) {
  const [start, setStart] = useState(9 * 60)
  const [end, setEnd] = useState(10 * 60)
  const [showHelp, setShowHelp] = useState(false)

  return (
    <section className="availability-form" aria-labelledby="manual-title">
      <div className="availability-form-heading">
        <h2 id="manual-title">Manual entry</h2>
        <span className="availability-help" onMouseEnter={() => setShowHelp(true)} onMouseLeave={() => setShowHelp(false)}>
          <button type="button" aria-label="About manual entry" aria-describedby="manual-help"
            onFocus={() => setShowHelp(true)} onBlur={() => setShowHelp(false)}
            onClick={() => setShowHelp(true)} onKeyDown={event => { if (event.key === 'Escape') setShowHelp(false) }}>?</button>
          <span id="manual-help" role="tooltip" hidden={!showHelp}>Add a time slot when you’re available for this meeting.</span>
        </span>
      </div>
      <form onSubmit={event => { event.preventDefault(); onAdd({ start, end }) }}>
        <label>Start
          <select value={start} onChange={event => {
            const next = Number(event.target.value)
            setStart(next)
            setEnd(Math.max(end, next + STEP))
          }}>
            {times.slice(0, -1).map(time => <option key={time} value={time}>{formatTime(time)}</option>)}
          </select>
        </label>
        <label>End
          <select value={end} onChange={event => setEnd(Number(event.target.value))}>
            {times.filter(time => time > start).map(time => <option key={time} value={time}>{formatTime(time)}</option>)}
          </select>
        </label>
        <button type="submit">Add time</button>
      </form>
    </section>
  )
}
