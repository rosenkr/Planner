import assert from 'node:assert/strict'
import test from 'node:test'
import { incompleteDateError, meetingDateError, meetingFieldErrors, type MeetingInput } from './meeting.ts'
import { createMeeting, getEntry, joinMeeting, MeetingValidationError, writeSchedule } from './store.server.ts'
import { deadlineLimits, deadlineInstant, responseWindow } from './deadline.ts'
import { recommend } from './recommendations.ts'

const input: MeetingInput = {
  name: 'Planning', firstDate: '2026-03-29', lastDate: '2026-03-29',
  timeZone: 'Europe/Stockholm', minMinutes: 15, maxMinutes: 60, capacity: 2,
}
const now = Date.parse('2026-03-01T12:00Z')

test('deadline and inclusive expiry use local midnight on both sides of a daylight-saving change', () => {
  const code = createMeeting(input, 'creator', now)
  const entry = getEntry(code, 'creator', now)
  assert.equal(entry.state, 'join')
  if (!('meeting' in entry)) assert.fail('Expected meeting details')
  const deadline = Date.parse('2026-03-28T17:00Z')
  const expires = Date.parse('2026-03-29T22:00Z')
  assert.equal(entry.meeting.deadline, deadline)
  assert.equal(entry.meeting.expires, expires)
  assert.throws(() => createMeeting(input, 'creator', deadline), error =>
    error instanceof MeetingValidationError && !!error.fields.responseDeadline)
  assert.equal(joinMeeting(code, 'visitor', 'B', deadline).state, 'closed')
  assert.equal(getEntry(code, 'creator', expires).state, 'expired')
})

test('creating a link leaves all spots available to invitees by default', () => {
  const code = createMeeting(input, 'creator', now)
  assert.equal(getEntry(code, 'creator', now).state, 'join')
  assert.equal(joinMeeting(code, 'guest1', 'Alex', now).state, 'member')
  assert.equal(joinMeeting(code, 'guest2', 'Sam', now).state, 'member')
  assert.equal(getEntry(code, 'creator', now).state, 'full')
})

test('a creator who opts in takes one spot and can revisit as a member', () => {
  const code = createMeeting({ ...input, creatorParticipantName: 'Alex' }, 'creator', now)
  assert.match(code, /^[A-Za-z0-9_-]{8}$/)
  assert.equal(getEntry(code, 'creator', now).state, 'member')
  assert.equal(joinMeeting(code, 'creator', 'Alex', now).state, 'member')
  assert.equal(getEntry(code, 'guest', now).state, 'join')
  assert.equal(joinMeeting(code, 'guest', 'Alex', now).state, 'member')
  assert.equal(joinMeeting(code, 'guest', 'Alex', now).state, 'member')
  assert.equal(joinMeeting(code, 'stranger', 'Alex', now).state, 'full')
  assert.equal(getEntry(code, 'creator', now).state, 'member')
  assert.equal(getEntry(code, undefined, now).state, 'full')
})

test('assigns validation errors to the fields that need correcting', () => {
  for (const [field, invalid] of [
    ['firstDate', { firstDate: '2026-02-30' }], ['lastDate', { lastDate: '2026-03-28' }],
    ['minMinutes', { minMinutes: 0 }], ['maxMinutes', { maxMinutes: 50 }], ['maxMinutes', { minMinutes: 90 }],
    ['capacity', { capacity: 1 }], ['capacity', { capacity: 2.5 }], ['name', { name: ' ' }],
    ['creatorParticipantName', { creatorParticipantName: ' ' }], ['timeZone', { timeZone: 'Made/Up' }],
    ['timeZone', { timeZone: '+02:00' }],
  ] as const) {
    assert.deepEqual(Object.keys(meetingFieldErrors({ ...input, ...invalid }, now)), [field])
  }
})

test('date feedback identifies the first invalid year, month or day during entry', () => {
  assert.equal(meetingDateError('202', 2026), incompleteDateError)
  assert.match(meetingDateError('2025-', 2026)!, /2026 or a later year/)
  assert.equal(meetingDateError('2026-0', 2026), incompleteDateError)
  for (const month of ['00', '13', '99']) {
    assert.match(meetingDateError(`2026-${month}-`, 2026)!, /month from 01 to 12/)
  }
  for (const [year, month, days] of [
    [2026, 1, 31], [2026, 2, 28], [2026, 4, 30], [2026, 12, 31],
    [2028, 2, 29], [2100, 2, 28], [2400, 2, 29],
  ]) {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`
    assert.equal(meetingDateError(prefix + days, 2026), undefined)
    for (const day of ['00', String(days + 1)]) {
      assert.match(meetingDateError(prefix + day, 2026)!, new RegExp(`day from 01 to ${days}`))
    }
  }
})

test('creation validates both date fields against the year in the meeting time zone', () => {
  const newYearInStockholm = Date.parse('2025-12-31T23:30Z')
  for (const field of ['firstDate', 'lastDate']) {
    assert.throws(() => createMeeting({ ...input, [field]: '2025-12-31' }, 'creator', newYearInStockholm), /2026 or a later year/)
    assert.throws(() => createMeeting({ ...input, [field]: '2100-02-29' }, 'creator', now), /day from 01 to 28/)
  }
})

test('deadline can extend past 18:00 through 22:00 in the meeting zone, only while still in the future', () => {
  const localEvening = Date.parse('2026-03-28T17:30Z')
  const options = { ...input, responseDeadline: '2026-03-28T22:00' }
  const code = createMeeting(options, 'owner', localEvening)
  assert.equal(getEntry(code, undefined, Date.parse('2026-03-28T20:59:59Z')).state, 'join')
  assert.equal(getEntry(code, undefined, Date.parse('2026-03-28T21:00Z')).state, 'closed')
  assert.ok(meetingFieldErrors({ ...options, responseDeadline: '2026-03-28T22:01' }, localEvening).responseDeadline)
  assert.ok(meetingFieldErrors({ ...options, responseDeadline: '2026-03-28T18:30' }, localEvening).responseDeadline)
  assert.ok(meetingFieldErrors(options, Date.parse('2026-03-28T21:00Z')).firstDate)
  assert.equal(deadlineLimits('2028-03-01')?.defaultValue, '2028-02-29T18:00')
  assert.equal(deadlineInstant('2026-03-29T02:30', input.timeZone), undefined)
  assert.equal(deadlineInstant('2026-10-25T02:30', input.timeZone), undefined)
  assert.equal(responseWindow(86400000)?.color, 'green')
  assert.equal(responseWindow(86400000 - 1)?.color, 'yellow')
  assert.equal(responseWindow(21600000)?.color, 'yellow')
  assert.equal(responseWindow(21600000 - 1)?.color, 'orange')
  assert.equal(responseWindow(3600000)?.text, 'Participants will have 1 hour to respond.')
  assert.equal(responseWindow(45 * 60000)?.text, 'Participants will only have 45 minutes to respond.')
  assert.equal(responseWindow(0), undefined)
})

const windows = { '2026-03-29': [{ start: 540, end: 600 }] }
const later = { '2026-03-29': [{ start: 900, end: 960 }] }

test('drafts resume privately and only explicit submissions can close the meeting early', () => {
  const code = createMeeting(input, 'owner', now)
  assert.equal(writeSchedule(code, 'stranger', windows, 0, true, now).state, 'join')
  for (const token of ['one', 'two']) joinMeeting(code, token, token, now)
  writeSchedule(code, 'one', windows, 0, false, now)
  const member = getEntry(code, 'one', now)
  assert.ok(member.state === 'member' && !member.submitted)
  assert.deepEqual(member.draft, windows)
  assert.throws(() => writeSchedule(code, 'one', later, 0, true, now), /another session/)
  assert.throws(() => writeSchedule(code, 'one', { '2026-03-30': [] }, 1, true, now), /dates/)
  assert.throws(() => writeSchedule(code, 'one', { '2026-03-29': [{ start: 1, end: 5 }] }, 1, true, now), /15-minute/)
  writeSchedule(code, 'one', later, 1, true, now)
  writeSchedule(code, 'one', windows, 2, true, now)
  writeSchedule(code, 'one', later, 3, false, now)
  const final = writeSchedule(code, 'two', windows, 0, true, now)
  assert.ok(final.state === 'closed')
  assert.equal(final.result.responses, 2)
  assert.deepEqual(final.result.main, { day: '2026-03-29', start: 540, end: 600, attendance: 2 })
  assert.deepEqual(getEntry(code, undefined, now), final)
  assert.deepEqual(writeSchedule(code, 'one', {}, 4, true, now), final)
})

test('deadline freezes just the submitted answers and counts explicitly empty submissions', () => {
  for (const responses of [0, 1, 2, 3]) {
    const code = createMeeting({ ...input, capacity: 4 }, 'creator', now)
    for (let i = 0; i < 4; i++) {
      joinMeeting(code, String(i), 'Guest', now)
      writeSchedule(code, String(i), i === 2 ? {} : windows, 0, i < responses, now)
    }
    const final = getEntry(code, undefined, Date.parse('2026-03-28T17:00Z'))
    assert.ok(final.state === 'closed')
    assert.equal(final.result.responses, responses)
    assert.equal(final.result.main?.attendance ?? 0, responses >= 2 ? 2 : 0)
  }
})

test('ranking prefers earlier maximum-duration ties and distinct shorter slots that improve attendance', () => {
  const short = { '2026-03-29': [{ start: 555, end: 585 }] }
  const combined = { '2026-03-29': [...windows['2026-03-29'], ...later['2026-03-29']] }
  const result = recommend([combined, combined, short], 15, 60)
  assert.equal(result.main?.start, 540)
  assert.deepEqual(result.alternatives, [{ day: '2026-03-29', start: 555, end: 585, attendance: 3 }])
  const onlyShort = recommend([short, short], 15, 60)
  assert.equal(onlyShort.main, null)
  assert.equal(onlyShort.alternatives.length, 1)
  assert.deepEqual(recommend([windows, later], 15, 60), { responses: 2, main: null, alternatives: [] })
})
