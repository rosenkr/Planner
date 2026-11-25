import { Temporal } from '@js-temporal/polyfill'

export function deadlineLimits(firstDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) return
  try {
    const previousDay = Temporal.PlainDate.from(firstDate).subtract({ days: 1 }).toString()
    return { defaultValue: previousDay + 'T18:00', latest: previousDay + 'T22:00' }
  } catch { return }
}

export function deadlineInstant(value: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !timeZone) return
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone, { disambiguation: 'reject' }).epochMilliseconds
  } catch { return }
}

export function responseWindow(milliseconds: number) {
  if (milliseconds <= 0) return
  const minutes = Math.floor(milliseconds / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes / 60)
  const parts: string[] = []
  function add(amount: number, unit: string) {
    if (amount) parts.push(amount + ' ' + unit + (amount === 1 ? '' : 's'))
  }
  add(days, 'day')
  add(hours % 24, 'hour')
  if (!days) add(minutes % 60, 'minute')
  const time = parts.join(' and ') || 'less than a minute'
  return {
    color: days ? 'green' : hours >= 6 ? 'yellow' : 'orange',
    text: 'Participants will ' + (hours < 1 ? 'only ' : '') + 'have ' + time + ' to respond.',
  }
}
