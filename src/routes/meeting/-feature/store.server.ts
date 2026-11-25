import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { meetingDateError, meetingFieldErrors, type Entry, type MeetingFieldErrors, type MeetingInfo, type MeetingInput } from './meeting.ts'
import { deadlineLimits, deadlineInstant } from './deadline.ts'
import { recommend, type MeetingResult, type Schedule } from './recommendations.ts'
import { DAY, STEP, mergeIntervals } from '../../availability/-editor/intervals.ts'

type Participant = { id: string; name: string; registeredAt: number; draft: Schedule; submitted?: Schedule; revision: number }
type Meeting = { info: MeetingInfo; participants: Map<string, Participant>; responses: number; result?: MeetingResult }

const meetings = new Map<string, Meeting>()

function sessionKey(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function addParticipant(meeting: Meeting, token: string, name: string, now: number) {
  meeting.participants.set(sessionKey(token), { id: randomUUID(), name: name.trim(), registeredAt: now, draft: {}, revision: 0 })
}

function generateInviteCode() {
  let code: string
  do { code = randomBytes(6).toString('base64url') } while (meetings.has(code))
  return code
}

export class MeetingValidationError extends Error {
  readonly fields: MeetingFieldErrors

  constructor(fields: MeetingFieldErrors) {
    super(Object.values(fields)[0])
    this.fields = fields
  }
}

export function createMeeting(input: MeetingInput, token: string, now = Date.now()) {
  const errors = meetingFieldErrors(input, now)
  if (Object.keys(errors).length) throw new MeetingValidationError(errors)
  const deadline = deadlineInstant(input.responseDeadline ?? deadlineLimits(input.firstDate)!.defaultValue, input.timeZone)!
  const expires = Temporal.PlainDate.from(input.lastDate).add({ days: 1 }).toZonedDateTime(input.timeZone).epochMilliseconds
  const code = generateInviteCode()
  const meeting: Meeting = {
    info: {
      code, name: input.name.trim(), firstDate: input.firstDate, lastDate: input.lastDate,
      timeZone: input.timeZone, minMinutes: input.minMinutes, maxMinutes: input.maxMinutes,
      capacity: input.capacity, deadline, expires,
    },
    participants: new Map(),
    responses: 0,
  }
  if (input.creatorParticipantName !== undefined) addParticipant(meeting, token, input.creatorParticipantName, now)
  meetings.set(code, meeting)
  return code
}

export function getEntry(code: string, token: string | undefined, now = Date.now()): Entry {
  const meeting = meetings.get(code)
  if (!meeting) return { state: 'missing' }
  if (now >= meeting.info.expires) return { state: 'expired' }
  if (meeting.result || now >= meeting.info.deadline || meeting.responses === meeting.info.capacity) {
    meeting.result ??= recommend(Array.from(meeting.participants.values()).flatMap(p => p.submitted ? [p.submitted] : []),
      meeting.info.minMinutes, meeting.info.maxMinutes)
    return { state: 'closed', meeting: meeting.info, result: meeting.result }
  }
  const participant = token && meeting.participants.get(sessionKey(token))
  if (participant) return { state: 'member', meeting: meeting.info, draft: participant.draft, submitted: !!participant.submitted, revision: participant.revision }
  return { state: meeting.participants.size >= meeting.info.capacity ? 'full' : 'join', meeting: meeting.info }
}

export function joinMeeting(code: string, token: string, name: string, now = Date.now()): Entry {
  // Keep the check and insertion synchronous until ALE-6 replaces them with a database transaction.
  const entry = getEntry(code, token, now)
  if (entry.state !== 'join') return entry
  if (typeof name !== 'string' || !name.trim()) throw new Error('Enter your name.')
  addParticipant(meetings.get(code)!, token, name, now)
  return getEntry(code, token, now)
}

export function writeSchedule(code: string, token: string, schedule: Schedule, revision: number, submit: boolean, now = Date.now()): Entry {
  const entry = getEntry(code, token, now)
  if (entry.state !== 'member') return entry
  if (revision !== entry.revision) throw new Error('Your availability changed in another session. Reload to get the latest version.')
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule) || typeof submit !== 'boolean')
    throw new Error('Invalid availability.')

  const draft: Schedule = {}
  for (const [day, windows] of Object.entries(schedule)) {
    if (meetingDateError(day, 1) || day < entry.meeting.firstDate || day > entry.meeting.lastDate || !Array.isArray(windows))
      throw new Error('Choose availability within the meeting dates.')
    if (windows.some(w => !w || !Number.isInteger(w.start) || !Number.isInteger(w.end) || w.start < 0 ||
      w.start >= w.end || w.end > DAY || w.start % STEP !== 0 || w.end % STEP !== 0))
      throw new Error('Choose availability in 15-minute steps within each day.')
    if (windows.length) draft[day] = mergeIntervals(windows)
  }
  const meeting = meetings.get(code)!
  const participant = meeting.participants.get(sessionKey(token))!
  participant.draft = draft
  participant.revision++
  if (submit) {
    if (!participant.submitted) meeting.responses++
    participant.submitted = draft
  }
  return getEntry(code, token, now)
}
