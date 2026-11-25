import { deadlineInstant, deadlineLimits } from './deadline.ts'
import type { Schedule, MeetingResult } from './recommendations.ts'

export type MeetingInput = {
  name: string
  firstDate: string
  lastDate: string
  minMinutes: number
  maxMinutes: number
  capacity: number
  creatorParticipantName?: string
  timeZone: string
  responseDeadline?: string
}

export type MeetingInfo = Omit<MeetingInput, 'creatorParticipantName' | 'responseDeadline'> & { code: string; deadline: number; expires: number }
export type Entry =
  | { state: 'missing' | 'expired' }
  | { state: 'join' | 'full'; meeting: MeetingInfo }
  | { state: 'member'; meeting: MeetingInfo; draft: Schedule; submitted: boolean; revision: number }
  | { state: 'closed'; meeting: MeetingInfo; result: MeetingResult }

export const invitePattern = /^[A-Za-z0-9_-]{8}$/

export function formatInviteUrl(code: string, origin: string) {
  return new URL('/invite/' + code, origin).href
}

export const incompleteDateError = 'Enter all eight digits in yyyy-mm-dd order.'

export function meetingDateError(value: string, currentYear: number): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}/.test(value)) return incompleteDateError
  const year = Number(value.slice(0, 4))
  if (year < currentYear) return `Enter ${currentYear} or a later year.`

  if (!/^\d{4}-\d{2}/.test(value)) return incompleteDateError
  const month = Number(value.slice(5, 7))
  if (month < 1 || month > 12) return 'Enter a month from 01 to 12.'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return incompleteDateError
  const day = Number(value.slice(8))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > lastDay) return `Enter a day from 01 to ${lastDay} for this month.`
}

export type MeetingFieldErrors = Partial<Record<keyof MeetingInput, string>>

export function meetingFieldErrors(input: MeetingInput, now = Date.now()): MeetingFieldErrors {
  const errors: MeetingFieldErrors = {}
  if (!input) return { name: 'Enter a meeting name.' }
  if (typeof input.name !== 'string' || !input.name.trim()) errors.name = 'Enter a meeting name.'
  if (input.creatorParticipantName !== undefined && (typeof input.creatorParticipantName !== 'string' || !input.creatorParticipantName.trim()))
    errors.creatorParticipantName = 'Enter your name.'
  for (const field of ['minMinutes', 'maxMinutes'] as const) {
    const minutes = input[field]
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440 || minutes % 15 !== 0)
      errors[field] = 'Choose a duration from 15 to 1440 minutes in 15-minute steps.'
  }
  if (!errors.minMinutes && !errors.maxMinutes && input.minMinutes > input.maxMinutes)
    errors.maxMinutes = 'Maximum duration must be at least the minimum duration.'
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 2) errors.capacity = 'Choose at least two participants.'
  else if (input.capacity > 2_147_483_647) errors.capacity = 'Choose at most 2,147,483,647 participants.'

  let currentYear = new Date(now).getFullYear()
  if (typeof input.timeZone !== 'string' || !input.timeZone || /^[+-]/.test(input.timeZone)) {
    errors.timeZone = 'A device time zone is required.'
  } else {
    try { currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: input.timeZone }).format(now)) }
    catch { errors.timeZone = 'The device time zone is unrecognized.' }
  }
  for (const field of ['firstDate', 'lastDate'] as const) {
    const message = meetingDateError(input[field], currentYear)
    if (message) errors[field] = message
  }
  if (!errors.firstDate && !errors.lastDate && input.lastDate < input.firstDate)
    errors.lastDate = 'Choose an end date on or after the start date.'
  if (!errors.firstDate && !errors.timeZone) {
    const limits = deadlineLimits(input.firstDate)!
    const value = input.responseDeadline ?? limits.defaultValue
    const instant = deadlineInstant(value, input.timeZone)
    if (now >= (deadlineInstant(limits.latest, input.timeZone) ?? 0))
      errors.firstDate = 'Choose a later first date. The latest response deadline for this date has passed.'
    else if (instant === undefined)
      errors.responseDeadline = 'Choose a valid date and time in the meeting time zone.'
    else if (instant <= now) errors.responseDeadline = 'Choose a response deadline in the future.'
    else if (value > limits.latest) errors.responseDeadline = 'Choose a deadline by 10 pm on the day before the first meeting date.'
  }
  return errors
}
