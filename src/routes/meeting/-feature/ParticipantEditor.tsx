import { useRef, useState } from 'react'
import { AvailabilityEditor } from '../../availability/-editor/AvailabilityEditor'
import type { Entry } from './meeting'
import { saveAvailability } from './operations'
import type { Schedule } from './recommendations'
import { ShareLink } from './ShareLink'

export function ParticipantEditor({ entry, deadlineLabel, onEntry }: {
  entry: Extract<Entry, { state: 'member' }>
  deadlineLabel: string
  onEntry: (entry: Entry) => void
}) {
  const { meeting } = entry
  const draft = useRef(entry.draft)
  const revision = useRef(entry.revision)
  const writes = useRef(Promise.resolve())
  const lastWrite = useRef(0)
  const [submitted, setSubmitted] = useState(entry.submitted)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  function save(schedule: Schedule, submit: boolean) {
    draft.current = schedule
    const index = ++lastWrite.current
    setStatus(submit ? 'Submitting…' : 'Saving draft…')
    setError('')
    setSubmitting(submit)
    // Each queued write uses the revision acknowledged by the preceding write.
    writes.current = writes.current.then(async () => {
      try {
        const next = await saveAvailability({ data: { code: meeting.code, schedule, revision: revision.current, submit } })
        if (next.state !== 'member') { onEntry(next); return }
        revision.current = next.revision
        setSubmitted(next.submitted)
        if (index === lastWrite.current) setStatus(submit ? 'Availability submitted.' : 'Draft saved.')
      } catch (cause) {
        if (index === lastWrite.current) {
          setStatus('')
          setError(cause instanceof Error ? cause.message : 'Could not save your availability. Try again.')
        }
      } finally {
        if (index === lastWrite.current) setSubmitting(false)
      }
    })
  }

  return <>
    <AvailabilityEditor meetingName={meeting.name} firstDate={meeting.firstDate} lastDate={meeting.lastDate} timeZone={meeting.timeZone}
      initialSchedule={entry.draft} disabled={submitting} onDraftChange={schedule => save(schedule, false)} />
    <section className="meeting-response">
      <p>Respond by <strong>{deadlineLabel}</strong>. Results are available sooner if everyone submits.</p>
      {submitted && <p>Your last submission counts. You can update it while responses are open.</p>}
      <button className="meeting-action" disabled={submitting} onClick={() => save(draft.current, true)}>
        {submitted ? 'Update submission' : Object.keys(draft.current).length ? 'Submit availability' : 'Submit no availability'}
      </button>
      <p role="status">{status}</p>
      {error && <p className="meeting-error" role="alert">{error}</p>}
    </section>
    <ShareLink code={meeting.code} />
  </>
}
