import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { DAY, editInterval, formatTime, type Edit, type Interval } from './intervals'

const hours = Array.from({ length: 25 }, (_, i) => i)
type Drag = { id: number; edit: Edit; index: number }
type Props = { windows: Interval[]; onChange: (windows: Interval[], isAddition?: boolean) => void }
type Menu = { x: number; y: number; interval: Interval }

export function DayTimeline({ windows, onChange }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const lane = useRef<HTMLDivElement>(null)
  const active = useRef<Drag | null>(null)
  const frame = useRef(0)
  const pointerY = useRef(0)
  const [preview, setPreview] = useState<{ index: number; window: Interval } | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menu) return
    menuButton.current?.focus({ preventScroll: true })
    function dismiss() { setMenu(null) }
    function outside(event: globalThis.PointerEvent) {
      if (!menuButton.current?.contains(event.target as Node)) dismiss()
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dismiss()
        viewport.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', key)
    document.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', key)
      document.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [menu])

  function remove(interval: Interval) {
    setMenu(null)
    onChange(windows.filter(value => value !== interval))
    viewport.current?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    const scroller = viewport.current!
    let height = scroller.clientHeight
    scroller.scrollTop = (scroller.scrollHeight - height) / 2
    const observer = new ResizeObserver(() => {
      const nextHeight = scroller.clientHeight
      scroller.scrollTop += (height - nextHeight) / 2
      height = nextHeight
    })
    observer.observe(scroller)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
    }
  }, [])

  function minuteAt(y: number) {
    const rect = lane.current!.getBoundingClientRect()
    return (y - rect.top) / rect.height * DAY
  }

  function showPreview(drag: Drag) {
    setPreview({ index: drag.index, window: editInterval(drag.edit, minuteAt(pointerY.current)) })
  }

  // Continue a drag beyond the visible hours by holding near the viewport edge.
  function scrollAtEdge() {
    const drag = active.current
    const scroller = viewport.current
    if (!drag || !scroller) return
    const { top, bottom } = scroller.getBoundingClientRect()
    const y = pointerY.current
    const step = y < top + 20 ? -5 : y > bottom - 20 ? 5 : 0
    if (step === 0) return
    const previous = scroller.scrollTop
    scroller.scrollTop += step
    if (scroller.scrollTop !== previous) {
      showPreview(drag)
      frame.current = requestAnimationFrame(scrollAtEdge)
    }
  }

  function begin(event: PointerEvent, kind: Edit['kind'], index = windows.length) {
    event.stopPropagation()
    if (active.current || !event.isPrimary || event.button !== 0) return
    const anchor = minuteAt(event.clientY)
    const edit: Edit = kind === 'create' ? { kind, anchor } : { kind, anchor, original: windows[index] }
    const drag = { edit, index, id: event.pointerId }
    active.current = drag
    pointerY.current = event.clientY
    lane.current!.setPointerCapture(event.pointerId)
    showPreview(drag)
  }

  function move(event: PointerEvent) {
    const drag = active.current
    if (!drag || event.pointerId !== drag.id) return
    pointerY.current = event.clientY
    showPreview(drag)
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(scrollAtEdge)
  }

  function finish(event: PointerEvent, commit: boolean) {
    const drag = active.current
    if (!drag || event.pointerId !== drag.id) return
    cancelAnimationFrame(frame.current)
    active.current = null
    setPreview(null)
    if (commit) {
      const result = editInterval(drag.edit, minuteAt(event.clientY))
      onChange([...windows.filter((_, i) => i !== drag.index), result], drag.edit.kind === 'create')
    }
  }

  const visible = [...windows]
  if (preview) visible[preview.index] = preview.window

  return (
      <div className="availability-timeline">
        <div className="availability-legend">
          <span>Scroll time</span>
          <span>{preview ? formatTime(preview.window.start) + ' – ' + formatTime(preview.window.end) : 'Availability'}</span>
        </div>
        <div ref={viewport} className="availability-viewport" tabIndex={0} aria-label="Daily timeline, scroll to view other hours" role="region">
          <div className="availability-day">
            <div className="availability-ruler" aria-hidden="true">
              {hours.map(hour => <span key={hour} style={{ top: hour / 24 * 100 + '%' }}>{formatTime(hour * 60)}</span>)}
            </div>
            <div ref={lane} className="availability-lane"
              onPointerDown={event => begin(event, 'create')}
              onPointerMove={move} onPointerUp={event => finish(event, true)}
              onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)}>
              {visible.map((window, index) => {
                const label = formatTime(window.start) + ' – ' + formatTime(window.end)
                return (
                  <div key={index} className="availability-block" title={label}
                    data-day-start={window.start === 0 || undefined} data-day-end={window.end === DAY || undefined}
                    onContextMenu={event => {
                      event.preventDefault()
                      if (active.current) return
                      setMenu({
                        x: Math.max(4, Math.min(event.clientX, document.documentElement.clientWidth - 148)),
                        y: Math.max(4, Math.min(event.clientY, document.documentElement.clientHeight - 48)),
                        interval: window,
                      })
                    }}
                    style={{ top: window.start / DAY * 100 + '%', height: (window.end - window.start) / DAY * 100 + '%' }}
                    onPointerDown={event => begin(event, 'move', index)}>
                    <span className="availability-handle start" title="Drag start time"
                      onPointerDown={event => begin(event, 'start', index)}>
                      <HandleTriangle />
                    </span>
                    <span className="availability-block-label">{label}</span>
                    <span className="availability-handle end" title="Drag end time"
                      onPointerDown={event => begin(event, 'end', index)}>
                      <HandleTriangle />
                    </span>
                    <button type="button" className="availability-delete" title="Delete interval"
                      aria-label={'Delete ' + label} onPointerDown={event => event.stopPropagation()}
                      onClick={() => remove(window)}>×</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        {menu && windows.includes(menu.interval) && (
          <button ref={menuButton} type="button" className="availability-delete-menu"
            style={{ left: menu.x, top: menu.y }} onBlur={() => setMenu(null)}
            onClick={() => remove(menu.interval)}>Delete interval</button>
        )}
      </div>
  )
}

function HandleTriangle() {
  return (
    <svg viewBox="0 0 20 18" aria-hidden="true">
      <path d="M10 3 18 15H2Z" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
    </svg>
  )
}
