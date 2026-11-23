export const DAY = 24 * 60
export const STEP = 15
export type Interval = { start: number; end: number }
export type Edit =
  | { kind: 'create'; anchor: number }
  | { kind: 'move' | 'start' | 'end'; anchor: number; original: Interval }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function snap(minutes: number) {
  return Math.round(minutes / STEP) * STEP
}

export function editInterval(edit: Edit, minutes: number): Interval {
  if (edit.kind === 'create') {
    const anchor = clamp(snap(edit.anchor), 0, DAY)
    const point = clamp(snap(minutes), 0, DAY)
    const start = Math.min(anchor, point, DAY - STEP)
    return { start, end: Math.max(anchor, point, start + STEP) }
  }

  const { start, end } = edit.original
  const delta = snap(minutes - edit.anchor)
  if (edit.kind === 'start') return { start: clamp(start + delta, 0, end - STEP), end }
  if (edit.kind === 'end') return { start, end: clamp(end + delta, start + STEP, DAY) }
  const shift = clamp(delta, -start, DAY - end)
  return { start: start + shift, end: end + shift }
}

export function mergeIntervals(intervals: Interval[]) {
  const merged: Interval[] = []
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1)
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

export function formatTime(minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0')
  return hours + ':' + String(minutes % 60).padStart(2, '0')
}
