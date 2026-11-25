import { useEffect, useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { incompleteDateError, meetingDateError, meetingFieldErrors, type MeetingFieldErrors, type MeetingInput } from './meeting'
import { deadlineInstant, deadlineLimits, responseWindow } from './deadline'
import { generateLink } from './operations'
import { ShareLink } from './ShareLink'
import './meeting.css'

const initial = {
  name: '', firstDate: '', lastDate: '', minMinutes: '', maxMinutes: '', capacity: '',
}

function earliestDate(now: number) {
  const date = new Date(now)
  date.setDate(date.getDate() + (date.getHours() >= 22 ? 2 : 1))
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function formatDateEntry(text: string) {
  const digits = text.replace(/\D/g, '')
  const year = digits.slice(0, 4)
  const month = digits.slice(4, 6)
  const day = digits.slice(6, 8)
  if (year.length < 4) return year
  if (month.length < 2) return `${year}-${month}`
  return `${year}-${month}-${day}`
}

function MeetingField({ label, error, value, ...inputProps }: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  value: string
}) {
  const id = useId()
  const [touched, setTouched] = useState(false)
  const message = (touched || value) && error
  return (
    <div>
      <label>{label}
        <input {...inputProps} required value={value} onBlur={() => setTouched(true)}
          aria-invalid={Boolean(message)} aria-describedby={message ? id : undefined} />
      </label>
      {message && <p className="meeting-error" id={id} role="status">{message}</p>}
    </div>
  )
}

function MeetingDateField({ label, value, min, max, dateError, onChange }: {
  label: string
  value: string
  min?: string
  max?: string
  dateError?: string
  onChange: (value: string) => void
}) {
  const errorId = useId()
  const textInput = useRef<HTMLInputElement>(null)
  const [showIncomplete, setShowIncomplete] = useState(false)
  const message = dateError === incompleteDateError && !showIncomplete ? undefined : dateError
  useEffect(() => { textInput.current?.setCustomValidity(dateError ?? '') }, [dateError])

  function handleTextChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const raw = input.value
    const caret = input.selectionStart ?? raw.length
    const inputType = (event.nativeEvent as InputEvent).inputType
    let formatted = formatDateEntry(raw)
    if (inputType?.startsWith('delete')) formatted = formatted.replace(/-$/, '')

    if (formatted !== raw) {
      // Map the caret by the digits to its left so edits in the middle stay in place.
      let position = formatDateEntry(raw.slice(0, caret)).length
      if (inputType === 'deleteContentBackward' && formatted[position - 1] === '-') position--
      input.value = formatted
      input.setSelectionRange(position, position)
    }
    onChange(formatted)
  }

  return (
    <div onFocus={() => setShowIncomplete(false)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setShowIncomplete(true)
    }}>
      <div className="meeting-date">
        <label>{label}
          <input ref={textInput} type="text" inputMode="numeric" maxLength={10} required placeholder="yyyy-mm-dd"
            aria-invalid={Boolean(message)} aria-describedby={message ? errorId : undefined}
            pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" value={value} onChange={handleTextChange} />
        </label>
        <span className="meeting-date-picker">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3.5" y="5" width="17" height="16" rx="2" />
            <path d="M7.5 3v4m9-4v4m-13 3.5h17" />
          </svg>
          <input type="date" aria-label={`${label} calendar`} min={min} max={max}
            aria-describedby={message ? errorId : undefined}
            value={meetingDateError(value, new Date().getFullYear()) ? '' : value} onChange={event => onChange(event.target.value)} />
        </span>
      </div>
      {message && <p className="meeting-error" id={errorId} role="status">{message}</p>}
    </div>
  )
}

export function CreateMeeting() {
  const [form, setForm] = useState(initial)
  const [includeCreator, setIncludeCreator] = useState(false)
  const [creatorName, setCreatorName] = useState('')
  const [zone, setZone] = useState<string>()
  const [customDeadlineDate, setCustomDeadlineDate] = useState<string>()
  const [customDeadlineTime, setDeadlineTime] = useState<string>()
  const [now, setNow] = useState(Date.now)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [serverErrors, setServerErrors] = useState<MeetingFieldErrors>({})
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || '') }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const limits = deadlineLimits(form.firstDate)
  const deadlineDate = customDeadlineDate ?? limits?.defaultValue.slice(0, 10) ?? ''
  const deadlineTime = customDeadlineTime ?? limits?.defaultValue.slice(11) ?? ''
  const deadline = deadlineDate + 'T' + deadlineTime
  const input: MeetingInput = {
    ...form, timeZone: zone ?? '', minMinutes: Number(form.minMinutes),
    maxMinutes: Number(form.maxMinutes), capacity: Number(form.capacity),
    ...(includeCreator && { creatorParticipantName: creatorName }),
    responseDeadline: deadline,
  }
  const earliest = zone ? earliestDate(now) : undefined
  const errors = { ...meetingFieldErrors(input, now), ...serverErrors }
  let deadlineDateError = meetingDateError(deadlineDate, new Date(now).getFullYear())
  if (!deadlineDateError && limits && deadlineDate > limits.latest.slice(0, 10))
    deadlineDateError = 'Choose a response date before the first meeting date.'
  const instant = zone && deadlineInstant(deadline, zone)
  const windowHint = instant && !errors.responseDeadline && !errors.firstDate ? responseWindow(instant - now) : undefined
  const ready = Object.keys(errors).length === 0
  function update(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  return (
    <section className="meeting-page">
      <h1>Plan a meeting with your team</h1>
      <form className="meeting-form" onChange={() => { setCode(''); setError(''); setServerErrors({}) }} onSubmit={async event => {
        event.preventDefault()
        if (code || !ready || sending.current) return
        sending.current = true
        setBusy(true)
        setError('')
        try {
          const result = await generateLink({ data: input })
          if (result.errors) setServerErrors(result.errors)
          else setCode(result.code)
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate the link. Try again.') }
        finally { sending.current = false; setBusy(false) }
      }}>
        <fieldset disabled={busy}>
          <MeetingField label="Meeting name" error={errors.name} value={form.name} onChange={e => update('name', e.target.value)} />
          <div className="meeting-pair">
            <MeetingDateField label="No earlier than" min={earliest} dateError={errors.firstDate} value={form.firstDate} onChange={value => update('firstDate', value)} />
            <MeetingDateField label="No later than" min={errors.firstDate ? earliest : form.firstDate} dateError={errors.lastDate} value={form.lastDate} onChange={value => update('lastDate', value)} />
          </div>
          <div>
            <p className="meeting-note">Meeting time zone · {zone ?? 'Detecting…'}</p>
            {zone !== undefined && errors.timeZone && <p className="meeting-error" role="status">{errors.timeZone}</p>}
          </div>
          <div role="group" aria-label="Response deadline" aria-describedby="deadline-default">
            <div className="meeting-pair">
              <MeetingDateField label="Response deadline date" value={deadlineDate} max={limits?.latest.slice(0, 10)}
                dateError={deadlineDateError} onChange={setCustomDeadlineDate} />
              <MeetingField label="Deadline time" type="time" value={deadlineTime}
                max={deadlineDate === limits?.latest.slice(0, 10) ? '22:00' : undefined}
                aria-details={windowHint ? 'response-window' : undefined}
                error={deadlineDateError ? undefined : errors.responseDeadline} onChange={e => setDeadlineTime(e.target.value)} />
            </div>
            <p id="deadline-default" className="text-sm text-emerald-100/70">The response deadline defaults to 6 pm the day before the first possible meeting date, in the meeting time zone.</p>
            {windowHint && <p id="response-window" className="response-window" data-color={windowHint.color}>{windowHint.text}</p>}
          </div>
          <div className="meeting-pair">
            <MeetingField label="At least (min)" type="number" min={15} max={1440} step={15} placeholder="30"
              error={errors.minMinutes} value={form.minMinutes} onChange={e => update('minMinutes', e.target.value)} />
            <MeetingField label="At most (min)" type="number" min={Math.max(15, input.minMinutes)} max={1440} step={15} placeholder="60"
              error={errors.maxMinutes} value={form.maxMinutes} onChange={e => update('maxMinutes', e.target.value)} />
          </div>
          <div className="meeting-participants">
            <MeetingField label="Total participants" type="number" min={2} step={1} error={errors.capacity}
              value={form.capacity} onChange={e => update('capacity', e.target.value)} />
            <label className="meeting-checkbox">
              <input type="checkbox" checked={includeCreator} onChange={e => setIncludeCreator(e.target.checked)} />
              Include me as a participant
            </label>
            {includeCreator && <MeetingField label="Your name" autoComplete="given-name" error={errors.creatorParticipantName}
              value={creatorName} onChange={e => setCreatorName(e.target.value)} />}
          </div>
        </fieldset>
        <div className="meeting-link-row">
          <button className="meeting-action" disabled={!ready || busy || Boolean(code)}>{busy ? 'Generating…' : 'Generate link'}</button>
          {code && <ShareLink code={code} />}
        </div>
        {code && <p role="status">{includeCreator ? 'You’re registered. Share this link so others can join.' : 'Share this link so participants can join.'}</p>}
        {error && <p className="meeting-error" role="alert">{error}</p>}
      </form>
    </section>
  )
}
