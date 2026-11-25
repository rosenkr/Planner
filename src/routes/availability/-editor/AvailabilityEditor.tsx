import { useCallback, useEffect, useState } from 'react'
import { DayTimeline } from './DayTimeline'
import { mergeIntervals, type Interval } from './intervals'
import { WindowForm } from './WindowForm'
import type { Schedule } from '../../meeting/-feature/recommendations'
import './editor.css'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
})

type Props = { meetingName: string; firstDate: string; lastDate: string; timeZone: string; initialSchedule?: Schedule; onDraftChange?: (value: Schedule) => void; disabled?: boolean }
type DayDraft = { windows: Interval[]; beforeAdd?: Interval[] }
const emptyDay: DayDraft = { windows: [] }

function shiftDate(day: string, offset: number) {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

export function AvailabilityEditor({ meetingName, firstDate, lastDate, timeZone, initialSchedule, onDraftChange, disabled }: Props) {
  const [day, setDay] = useState(firstDate)
  const [schedule, setSchedule] = useState<Record<string, DayDraft>>(() =>
    Object.fromEntries(Object.entries(initialSchedule ?? {}).map(([date, windows]) => [date, { windows }])))
  const draft = schedule[day] ?? emptyDay

  const saveWindows = useCallback((next: Interval[], isAddition = false) => {
    if (disabled) return
    const windows = mergeIntervals(next)
    if (windows.length === draft.windows.length && windows.every((w, i) =>
      w.start === draft.windows[i].start && w.end === draft.windows[i].end)) return
    const updated = { ...schedule, [day]: { windows, beforeAdd: isAddition ? draft.windows : undefined } }
    setSchedule(updated)
    onDraftChange?.(Object.fromEntries(Object.entries(updated).filter(([, d]) => d.windows.length).map(([date, d]) => [date, d.windows])))
  }, [disabled, draft, schedule, day, onDraftChange])

  useEffect(() => {
    function undoAddition(event: KeyboardEvent) {
      if (!draft.beforeAdd || event.defaultPrevented || event.repeat || event.isComposing) return
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select'))) return
      event.preventDefault()
      saveWindows(draft.beforeAdd)
    }
    window.addEventListener('keydown', undoAddition)
    return () => window.removeEventListener('keydown', undoAddition)
  }, [saveWindows, draft.beforeAdd])

  return (
    <section className="availability-editor" inert={disabled}>
      <header className="border-b border-emerald-100/15 pb-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{meetingName}</h1>
        <p className="mt-2 text-sm text-emerald-100/70">Meeting time zone · {timeZone}</p>
      </header>
      <h2 className="availability-date" aria-live="polite"><time dateTime={day}>{dateFormat.format(new Date(day + 'T00:00:00Z'))}</time></h2>
      <p className="availability-hint">Drag to add or move a time. Use the triangles to resize. Ctrl+Z (⌘Z on Mac) undoes the last addition.</p>
      <div className="availability-layout">
        <DayTimeline key={day} windows={draft.windows} onChange={saveWindows} />
        <div className="availability-sidebar">
          <WindowForm key={day} onAdd={window => saveWindows([...draft.windows, window], true)} />
          <nav className="availability-dates" aria-label="Meeting dates">
            <button type="button" disabled={day === firstDate} onClick={() => setDay(shiftDate(day, -1))}>Previous</button>
            <button type="button" disabled={day === lastDate} onClick={() => setDay(shiftDate(day, 1))}>Next</button>
          </nav>
        </div>
      </div>
    </section>
  )
}
