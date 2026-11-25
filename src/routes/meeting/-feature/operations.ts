import { createServerFn } from '@tanstack/react-start'
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
  .handler(({ data }) => {
    try { return { code: createMeeting(data, getBrowserToken()) } }
    catch (cause) {
      if (cause instanceof MeetingValidationError) return { errors: cause.fields }
      throw cause
    }
  })

export const openInvite = createServerFn({ method: 'GET' })
  .validator((code: string) => code)
  .handler(({ data: code }) => {
    if (!invitePattern.test(code)) return { state: 'missing' } as const
    return getEntry(code, getBrowserToken())
  })

export const registerParticipant = createServerFn({ method: 'POST' })
  .validator((data: { code: string; name: string }) => ({ code: validateCode(data.code), name: data.name }))
  .handler(({ data }) => joinMeeting(data.code, getBrowserToken(), data.name))

export const saveAvailability = createServerFn({ method: 'POST' })
  .validator((data: { code: string; schedule: Schedule; revision: number; submit: boolean }) => ({ ...data, code: validateCode(data.code) }))
  .handler(({ data }) => writeSchedule(data.code, getBrowserToken(), data.schedule, data.revision, data.submit))
