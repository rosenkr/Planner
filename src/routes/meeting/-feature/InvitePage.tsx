import { useEffect, useRef, useState } from 'react'
import { openInvite, registerParticipant } from './operations'
import type { Entry } from './meeting'
import { ParticipantEditor } from './ParticipantEditor'
import { Results } from './Results'
import './meeting.css'

export function InvitePage({ code, initial }: { code: string; initial: Entry }) {
  const [result, setResult] = useState<Entry | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const entry = result ?? initial
  const nextBoundary = 'meeting' in entry ? (entry.state === 'closed' ? entry.meeting.expires : entry.meeting.deadline) : undefined
  useEffect(() => {
    if (nextBoundary === undefined) return
    let active = true
    let pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try {
        const next = await openInvite({ data: code })
        if (active && (next.state === 'expired' || next.state === 'closed' || next.state === 'missing')) setResult(next)
      } catch { /* Retry on the next poll or when the tab regains focus. */ }
      finally { pending = false }
    }
    const delay = nextBoundary - Date.now()
    const timeout = window.setTimeout(refresh, Math.min(Math.max(delay, 0) + 50, 2_147_483_647))
    const timer = window.setInterval(() => {
      if (!document.hidden && (entry.state !== 'closed' || Date.now() >= nextBoundary)) void refresh()
    }, 4000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); clearTimeout(timeout); window.removeEventListener('focus', refresh) }
  }, [code, entry.state, nextBoundary])

  if (!('meeting' in entry)) return (
    <section className="meeting-page"><h1>{entry.state === 'expired' ? 'Meeting expired' : 'Meeting not found'}</h1></section>
  )
  const { meeting } = entry
  if (entry.state === 'closed') return <Results entry={entry} />
  const deadlineLabel = new Intl.DateTimeFormat('en-GB', { timeZone: meeting.timeZone, dateStyle: 'medium', timeStyle: 'short' })
    .format(meeting.deadline) + ' · ' + meeting.timeZone
  if (entry.state === 'member') return <ParticipantEditor entry={entry} deadlineLabel={deadlineLabel} onEntry={setResult} />

  return (
    <section className="meeting-page">
      <h1>{meeting.name}</h1>
      <p>{meeting.firstDate} – {meeting.lastDate} · {meeting.timeZone}</p>
      <p>{meeting.minMinutes}–{meeting.maxMinutes} minutes</p>
      {entry.state === 'full' && <p role="status">This meeting is full. Use your recovery code to access your meeting on this device.</p>}
      <p>Respond by {deadlineLabel}</p>
      {entry.state === 'join' && (
        <form className="meeting-form" onSubmit={async event => {
          event.preventDefault()
          if (!name.trim() || sending.current) return
          sending.current = true
          setBusy(true)
          setError('')
          try { setResult(await registerParticipant({ data: { code, name } })) }
          catch { setError('Could not join the meeting. Try again.') }
          finally { sending.current = false; setBusy(false) }
        }}>
          <label>Your name<input required autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
          <button className="meeting-action" disabled={!name.trim() || busy}>{busy ? 'Joining…' : 'Join meeting'}</button>
        </form>
      )}
    </section>
  )
}
