import { createServerFn } from '@tanstack/react-start'
import { toPublicEntry } from './entry.server'
import { type MeetingInput, invitePattern } from './meeting'
import { createMeeting, getEntry, joinMeeting, MeetingValidationError, writeSchedule } from './store.server'
import type { Schedule } from './recommendations'
import { getBrowserToken } from './session.server'

function validateCode(code: string) {
  if (typeof code !== 'string' || !invitePattern.test(code)) throw new Error('Invalid invite link.')
  return code
}

export const generateLink = createServerFn({ method: 'POST' })
  .validator((data: MeetingInput) => data)
  .handler(async ({ data }) => {
    try { return { code: await createMeeting(data, getBrowserToken()) } }
    catch (cause) {
      if (cause instanceof MeetingValidationError) return { errors: cause.fields }
      console.error('Could not create meeting', cause instanceof Error ? cause.name : 'Database error')
      throw new Error('Could not save the meeting. Try again.')
    }
  })

export const openInvite = createServerFn({ method: 'GET' })
  .validator((code: string) => code)
  .handler(({ data: code }) => {
    if (!invitePattern.test(code)) return { state: 'missing' } as const
    return getEntry(code, getBrowserToken()).then(toPublicEntry)
  })

export const registerParticipant = createServerFn({ method: 'POST' })
  .validator((data: { code: string; name: string }) => ({ code: validateCode(data.code), name: data.name }))
  .handler(({ data }) => joinMeeting(data.code, getBrowserToken(), data.name).then(toPublicEntry))

export const saveAvailability = createServerFn({ method: 'POST' })
  .validator((data: { code: string; schedule: Schedule; revision: number; submit: boolean }) => ({ ...data, code: validateCode(data.code) }))
  .handler(({ data }) => writeSchedule(data.code, getBrowserToken(), data.schedule, data.revision, data.submit).then(toPublicEntry))
