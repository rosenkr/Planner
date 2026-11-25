import { createHash, randomBytes } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import type { TransactionSql } from 'postgres'
import { database } from '../../../db/client.server.ts'
import { meetingDateError, meetingFieldErrors, type Entry, type MeetingFieldErrors, type MeetingInfo, type MeetingInput } from './meeting.ts'
import { deadlineLimits, deadlineInstant } from './deadline.ts'
import type { Schedule } from './recommendations.ts'
import { DAY, STEP, mergeIntervals } from '../../availability/-editor/intervals.ts'

function sessionKey(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function addParticipant(sql: TransactionSql, meetingId: string, token: string, name: string) {
  const [participant] = await sql<{ id: string }[]>`
    INSERT INTO participants (meeting_id, display_name)
    VALUES (${meetingId}, ${name.trim()})
    RETURNING id`
  await sql`
    INSERT INTO participant_sessions (meeting_id, participant_id, token_hash)
    VALUES (${meetingId}, ${participant.id}, ${sessionKey(token)})`
}

export class MeetingValidationError extends Error {
  readonly fields: MeetingFieldErrors

  constructor(fields: MeetingFieldErrors) {
    super(Object.values(fields)[0])
    this.fields = fields
  }
}

export async function createMeeting(input: MeetingInput, token: string, now = Date.now()) {
  const errors = meetingFieldErrors(input, now)
  if (Object.keys(errors).length) throw new MeetingValidationError(errors)
  const deadline = deadlineInstant(input.responseDeadline ?? deadlineLimits(input.firstDate)!.defaultValue, input.timeZone)!
  const expires = Temporal.PlainDate.from(input.lastDate).add({ days: 1 }).toZonedDateTime(input.timeZone).epochMilliseconds
  return database().begin(async sql => {
    for (;;) {
      const code = randomBytes(6).toString('base64url')
      const [meeting] = await sql<{ id: string }[]>`
        INSERT INTO meetings (invite_code, name, first_date, last_date, time_zone,
                              min_minutes, max_minutes, capacity, created_at, response_deadline, expires_at)
        VALUES (${code}, ${input.name.trim()}, ${input.firstDate}, ${input.lastDate}, ${input.timeZone},
                ${input.minMinutes}, ${input.maxMinutes}, ${input.capacity}, ${new Date(now)},
                ${new Date(deadline)}, ${new Date(expires)})
        ON CONFLICT (invite_code) DO NOTHING
        RETURNING id`
      if (!meeting) continue
      if (input.creatorParticipantName !== undefined) await addParticipant(sql, meeting.id, token, input.creatorParticipantName)
      return code
    }
  })
}

async function readSubmitted(sql: TransactionSql, meetingId: string): Promise<Schedule[]> {
  // The left join includes people who explicitly submitted an empty schedule.
  const rows = await sql<{ id: string; day: string | null; start: number; end: number }[]>`
    SELECT p.id, a.available_date::text AS day, a.start_minute AS start, a.end_minute AS end
    FROM participants p
    LEFT JOIN availability_intervals a ON a.participant_id = p.id AND a.schedule_kind = 'submitted'
    WHERE p.meeting_id = ${meetingId} AND p.has_submitted`
  const schedules = new Map<string, Schedule>()
  for (const row of rows) {
    const schedule = schedules.get(row.id) ?? {}
    if (row.day) (schedule[row.day] ??= []).push({ start: row.start, end: row.end })
    schedules.set(row.id, schedule)
  }
  return Array.from(schedules.values())
}

export type StoredEntry = Exclude<Entry, { state: 'closed' }> | { state: 'closed'; meeting: MeetingInfo; schedules: Schedule[] }

async function readEntry(sql: TransactionSql, id: string, meeting: MeetingInfo, token: string | undefined, now: number): Promise<StoredEntry> {
  if (now >= meeting.expires) return { state: 'expired' }
  const [counts] = await sql<{ claimed: number; responses: number }[]>`
    SELECT count(*)::int AS claimed, count(*) FILTER (WHERE has_submitted)::int AS responses
    FROM participants WHERE meeting_id = ${id}`
  if (now >= meeting.deadline || counts.responses === meeting.capacity) {
    return { state: 'closed', meeting, schedules: await readSubmitted(sql, id) }
  }
  if (token) {
    const [member] = await sql<{ id: string; submitted: boolean; revision: number }[]>`
      SELECT p.id, p.has_submitted AS submitted, p.revision
      FROM participant_sessions s JOIN participants p ON p.id = s.participant_id
      WHERE s.meeting_id = ${id} AND s.token_hash = ${sessionKey(token)}`
    if (member) {
      const rows = await sql<{ day: string; start: number; end: number }[]>`
        SELECT available_date::text AS day, start_minute AS start, end_minute AS end
        FROM availability_intervals WHERE participant_id = ${member.id} AND schedule_kind = 'draft'
        ORDER BY available_date, start_minute`
      const draft: Schedule = {}
      for (const row of rows) (draft[row.day] ??= []).push({ start: row.start, end: row.end })
      return { state: 'member', meeting, draft, submitted: member.submitted, revision: member.revision }
    }
  }
  return { state: counts.claimed >= meeting.capacity ? 'full' : 'join', meeting }
}

type MeetingChange = (sql: TransactionSql, id: string, entry: StoredEntry) => Promise<boolean>

async function withMeeting(code: string, token: string | undefined, now?: number, change?: MeetingChange): Promise<StoredEntry> {
  return database().begin(async sql => {
    // Serialize changes per meeting, including the capacity check and the last submission.
    const [row] = await sql<(MeetingInfo & { id: string })[]>`
      SELECT id, invite_code AS code, name, first_date::text AS "firstDate", last_date::text AS "lastDate",
             time_zone AS "timeZone", min_minutes AS "minMinutes", max_minutes AS "maxMinutes", capacity,
             (extract(epoch FROM response_deadline) * 1000)::float8 AS deadline,
             (extract(epoch FROM expires_at) * 1000)::float8 AS expires
      FROM meetings WHERE invite_code = ${code}
      ${change ? sql`FOR UPDATE` : sql`FOR SHARE`}`
    if (!row) return { state: 'missing' } as const
    const { id, ...meeting } = row
    const entry = await readEntry(sql, id, meeting, token, now ?? Date.now())
    if (change && await change(sql, id, entry)) return readEntry(sql, id, meeting, token, now ?? Date.now())
    return entry
  })
}

export function getEntry(code: string, token: string | undefined, now?: number) {
  return withMeeting(code, token, now)
}

export function joinMeeting(code: string, token: string, name: string, now?: number) {
  return withMeeting(code, token, now, async (sql, id, entry) => {
    if (entry.state !== 'join') return false
    if (typeof name !== 'string' || !name.trim()) throw new Error('Enter your name.')
    await addParticipant(sql, id, token, name)
    return true
  })
}

function normalizedDraft(schedule: Schedule, meeting: MeetingInfo) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) throw new Error('Invalid availability.')
  const draft: Schedule = {}
  for (const [day, windows] of Object.entries(schedule)) {
    if (meetingDateError(day, 1) || day < meeting.firstDate || day > meeting.lastDate || !Array.isArray(windows))
      throw new Error('Choose availability within the meeting dates.')
    if (windows.some(w => !w || !Number.isInteger(w.start) || !Number.isInteger(w.end) || w.start < 0 ||
      w.start >= w.end || w.end > DAY || w.start % STEP !== 0 || w.end % STEP !== 0))
      throw new Error('Choose availability in 15-minute steps within each day.')
    if (windows.length) draft[day] = mergeIntervals(windows)
  }
  return draft
}

export function writeSchedule(code: string, token: string, schedule: Schedule, revision: number, submit: boolean, now?: number) {
  return withMeeting(code, token, now, async (sql, id, entry) => {
    if (entry.state !== 'member') return false
    if (revision !== entry.revision) throw new Error('Your availability changed in another session. Reload to get the latest version.')
    if (typeof submit !== 'boolean') throw new Error('Invalid availability.')
    const draft = normalizedDraft(schedule, entry.meeting)
    const [member] = await sql<{ id: string }[]>`
      UPDATE participants p SET revision = p.revision + 1, has_submitted = p.has_submitted OR ${submit}
      FROM participant_sessions s
      WHERE p.id = s.participant_id AND s.meeting_id = ${id} AND s.token_hash = ${sessionKey(token)}
      RETURNING p.id`
    await sql`DELETE FROM availability_intervals WHERE participant_id = ${member.id} AND (schedule_kind = 'draft' OR ${submit})`
    await sql`
      INSERT INTO availability_intervals (participant_id, schedule_kind, available_date, start_minute, end_minute)
      SELECT ${member.id}, 'draft', day.key::date, slot.start, slot.end
      FROM jsonb_each(${sql.json(draft)}::jsonb) AS day,
           jsonb_to_recordset(day.value) AS slot(start int, "end" int)`
    if (submit) {
      await sql`
        INSERT INTO availability_intervals (participant_id, schedule_kind, available_date, start_minute, end_minute)
        SELECT participant_id, 'submitted', available_date, start_minute, end_minute
        FROM availability_intervals WHERE participant_id = ${member.id} AND schedule_kind = 'draft'`
    }
    return true
  })
}
