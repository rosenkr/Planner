import { formatTime } from '../../availability/-editor/intervals'
import type { Entry } from './meeting'
import type { Recommendation } from './recommendations'

function slotText(slot: Recommendation) {
  return `${slot.day} · ${formatTime(slot.start)}–${formatTime(slot.end)} · ${slot.end - slot.start} minutes · ${slot.attendance} can attend`
}

export function Results({ entry }: { entry: Extract<Entry, { state: 'closed' }> }) {
  const { meeting, result } = entry
  return <section className="meeting-page meeting-results">
    <h1>{meeting.name}</h1>
    <h2>Final results</h2>
    <p>{result.responses} of {meeting.capacity} participants responded.
      {result.responses < meeting.capacity && ' Results are based only on submitted availability.'}</p>
    {result.responses < 2 ? <p>At least two responses are needed for a viable meeting.</p> : <>
      <p>Meeting time zone · {meeting.timeZone}</p>
      <h3>Best time for {meeting.maxMinutes} minutes</h3>
      <p>{result.main ? slotText(result.main) : 'Not possible. Fewer than two respondents share a window of that length.'}</p>
      {result.alternatives.length > 0 && <>
        <h3>Shorter options</h3>
        <ul>{result.alternatives.map(slot => <li key={slot.day + '-' + slot.start}>{slotText(slot)}</li>)}</ul>
      </>}
    </>}
  </section>
}
