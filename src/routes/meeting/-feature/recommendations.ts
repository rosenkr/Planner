import { DAY, STEP, type Interval } from '../../availability/-editor/intervals.ts'

export type Schedule = Record<string, Interval[]>
export type Recommendation = Interval & { day: string; attendance: number }
export type MeetingResult = { responses: number; main: Recommendation | null; alternatives: Recommendation[] }

// Each schedule contains merged, disjoint windows, so a voter contributes at most once per start.
export function recommend(schedules: Schedule[], min: number, max: number): MeetingResult {
  const result: MeetingResult = { responses: schedules.length, main: null, alternatives: [] }
  if (schedules.length < 2) return result
  const byDay = new Map<string, Interval[]>()
  for (const schedule of schedules) {
    for (const [day, windows] of Object.entries(schedule)) {
      const entries = byDay.get(day) ?? []
      for (const window of windows) entries.push(window)
      byDay.set(day, entries)
    }
  }

  const shorter: Recommendation[] = []
  const days = Array.from(byDay.keys()).sort()
  for (let duration = max; duration >= min; duration -= STEP) {
    for (const day of days) {
      const changes = new Int32Array(DAY / STEP + 1)
      for (const { start, end } of byDay.get(day)!) {
        if (end - start < duration) continue
        changes[start / STEP]++
        changes[(end - duration) / STEP + 1]--
      }
      let attendance = 0
      for (let start = 0; start + duration <= DAY; start += STEP) {
        attendance += changes[start / STEP]
        if (attendance < 2 || attendance <= (result.main?.attendance ?? 0)) continue
        const candidate = { day, start, end: start + duration, attendance }
        if (duration === max) result.main = candidate
        else shorter.push(candidate)
      }
    }
  }

  shorter.sort((a, b) => b.attendance - a.attendance || (b.end - b.start) - (a.end - a.start)
    || a.day.localeCompare(b.day) || a.start - b.start)
  for (const candidate of shorter) {
    if (result.alternatives.some(other => other.day === candidate.day && other.start < candidate.end && candidate.start < other.end)) continue
    result.alternatives.push(candidate)
    if (result.alternatives.length === 5) break
  }
  return result
}
