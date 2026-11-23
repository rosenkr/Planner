import assert from 'node:assert/strict'
import test from 'node:test'
import { DAY, editInterval, mergeIntervals } from './intervals.ts'

test('reverse drags snap both ends, including the last quarter of the day', () => {
  assert.deepEqual(editInterval({ kind: 'create', anchor: 604 }, 537), { start: 540, end: 600 })
  assert.deepEqual(editInterval({ kind: 'create', anchor: DAY }, DAY + 30), { start: 1425, end: DAY })
})

test('moving preserves duration at either day boundary', () => {
  const drag = { kind: 'move' as const, anchor: 580, original: { start: 540, end: 615 } }
  assert.deepEqual(editInterval(drag, -90), { start: 0, end: 75 })
  assert.deepEqual(editInterval(drag, 1500), { start: 1365, end: DAY })
})

test('resizing cannot invert an interval or collapse it below one step', () => {
  const original = { start: 480, end: 600 }
  assert.deepEqual(editInterval({ kind: 'start', anchor: 480, original }, 760), { start: 585, end: 600 })
  assert.deepEqual(editInterval({ kind: 'end', anchor: 600, original }, 360), { start: 480, end: 495 })
})

test('merges chains of overlapping and adjacent windows without closing real gaps or mutating inputs', () => {
  const input = [{ start: 210, end: 240 }, { start: 90, end: 120 }, { start: 105, end: 165 }, { start: 165, end: 195 }]
  const before = structuredClone(input)
  assert.deepEqual(mergeIntervals(input), [{ start: 90, end: 195 }, { start: 210, end: 240 }])
  assert.deepEqual(input, before)
})
