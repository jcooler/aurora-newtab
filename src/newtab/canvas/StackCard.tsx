import { useRef, type ReactNode } from 'react'
import type { CanvasSize } from '../../lib/layout/canvasTypes'
import type { BlockId } from '../../lib/layout/types'

export interface StackCardMember {
  id: BlockId
  label: string
  content: ReactNode
  size?: CanvasSize
}

export interface StackCardProps {
  id: string
  members: readonly StackCardMember[]
  facing: BlockId
  editing: boolean
  onStep: (direction: -1 | 1) => void
  onFace: (id: BlockId) => void
}

const SWIPE_THRESHOLD = 40

export default function StackCard({
  id,
  members,
  facing,
  editing,
  onStep,
  onFace,
}: StackCardProps) {
  const pointer = useRef<{ id: number; x: number; captured: boolean } | null>(null)
  const suppressReleaseClick = useRef(false)
  const faceIndex = Math.max(0, members.findIndex((member) => member.id === facing))
  const face = members[faceIndex]

  return (
    <div
      role="group"
      aria-roledescription="widget stack"
      aria-label={`${face?.label ?? 'Widget'}, ${faceIndex + 1} of ${members.length}`}
      data-stack-card={id}
      className={`stack-card${editing ? ' stack-card--editing' : ''}`}
      tabIndex={editing ? -1 : 0}
      onKeyDown={(event) => {
        if (editing || event.target !== event.currentTarget) return
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        onStep(event.key === 'ArrowLeft' ? -1 : 1)
      }}
      onPointerDown={(event) => {
        if (editing || event.button !== 0) return
        if ((event.target as Element).closest('[data-stack-control]')) return
        // Do not capture a simple press. Capturing here retargets pointerup
        // from the nested widget button to the stack card, so Chromium never
        // synthesizes the widget's click. Capture begins only once an actual
        // 40px paging swipe is established below.
        pointer.current = { id: event.pointerId, x: event.clientX, captured: false }
      }}
      onPointerMove={(event) => {
        const start = pointer.current
        if (editing || !start || start.id !== event.pointerId || start.captured) return
        if (Math.abs(event.clientX - start.x) < SWIPE_THRESHOLD) return
        start.captured = true
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onPointerUp={(event) => {
        const start = pointer.current
        pointer.current = null
        if (editing || !start || start.id !== event.pointerId) return
        const distance = event.clientX - start.x
        if (Math.abs(distance) < SWIPE_THRESHOLD) return
        suppressReleaseClick.current = true
        onStep(distance < 0 ? 1 : -1)
      }}
      onPointerCancel={() => { pointer.current = null }}
      onClickCapture={(event) => {
        if (!suppressReleaseClick.current) return
        suppressReleaseClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div data-stack-members className="stack-card__members">
        {members.map((member) => {
          const active = member.id === facing
          return (
            <div
              key={member.id}
              data-stack-member={member.id}
              data-stack-active={active ? 'true' : 'false'}
              data-block-id={member.size ? member.id : undefined}
              data-canvas-size={member.size}
              data-canvas-mode={member.size ? 'stack-member' : undefined}
              className={`stack-card__member${member.size ? ' canvas-item' : ''}`}
              inert={editing || !active ? true : undefined}
              aria-hidden={active ? undefined : true}
            >
              {member.content}
            </div>
          )
        })}
      </div>

      {!editing ? (
        <>
          <button
            type="button"
            aria-label="Previous widget"
            data-stack-control
            className="stack-card__arrow stack-card__arrow--previous"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onStep(-1) }}
          >
            <span aria-hidden>‹</span>
          </button>
          <button
            type="button"
            aria-label="Next widget"
            data-stack-control
            className="stack-card__arrow stack-card__arrow--next"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onStep(1) }}
          >
            <span aria-hidden>›</span>
          </button>
        </>
      ) : null}

      <div
        data-stack-dots
        data-stack-control
        className={`stack-card__dots${editing ? ' stack-card__dots--editing' : ''}`}
        aria-label="Widgets in stack"
      >
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            aria-label={`Show ${member.label}`}
            aria-pressed={member.id === facing}
            className="stack-card__dot"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onFace(member.id) }}
          />
        ))}
      </div>
    </div>
  )
}
