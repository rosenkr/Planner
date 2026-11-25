import type { Entry } from './meeting.ts'
import { recommend } from './recommendations.ts'
import type { StoredEntry } from './store.server.ts'

export function toPublicEntry(entry: StoredEntry): Entry {
  if (entry.state !== 'closed') return entry
  const { meeting, schedules } = entry
  return { state: 'closed', meeting, result: recommend(schedules, meeting.minMinutes, meeting.maxMinutes) }
}
