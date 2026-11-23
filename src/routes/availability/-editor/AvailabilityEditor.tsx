import { useEffect, useState } from 'react'
import { DayTimeline } from './DayTimeline'
import { mergeIntervals, type Interval } from './intervals'
import { WindowForm } from './WindowForm'
import './editor.css'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
})

type Props = { meetingName: string; dates: string[]; timeZone: string }
type DayDraft = { windows: Interval[]; beforeAdd?: Interval[] }
const emptyDay: DayDraft = { windows: [] }

export function AvailabilityEditor({ meetingName, dates, timeZone }: Props) {
  const [dayIndex, setDayIndex] = useState(0)
  const [schedule, setSchedule] = useState<Record<string, DayDraft>>({})
  const day = dates[dayIndex]
  const draft = schedule[day] ?? emptyDay

  function saveWindows(next: Interval[], isAddition = false) {
    const windows = mergeIntervals(next)
    setSchedule(previous => {
      const current = previous[day] ?? emptyDay
      if (windows.length === current.windows.length && windows.every((w, i) =>
        w.start === current.windows[i].start && w.end === current.windows[i].end)) return previous

      return { ...previous, [day]: { windows, beforeAdd: isAddition ? current.windows : undefined } }
    })
  }

  useEffect(() => {
    function undoAddition(event: KeyboardEvent) {
      if (!draft.beforeAdd || event.defaultPrevented || event.repeat || event.isComposing) return
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select'))) return
      event.preventDefault()
      setSchedule(previous => {
        const beforeAdd = previous[day]?.beforeAdd
        return beforeAdd ? { ...previous, [day]: { windows: beforeAdd } } : previous
      })
    }
    window.addEventListener('keydown', undoAddition)
    return () => window.removeEventListener('keydown', undoAddition)
  }, [day, draft.beforeAdd])

  return (
    <section className="availability-editor">
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
            <button type="button" disabled={dayIndex === 0} onClick={() => setDayIndex(dayIndex - 1)}>Previous</button>
            <button type="button" disabled={dayIndex === dates.length - 1} onClick={() => setDayIndex(dayIndex + 1)}>Next</button>
          </nav>
        </div>
      </div>
    </section>
  )
}
