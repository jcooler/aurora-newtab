import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CanvasSize } from '../../lib/layout/canvasTypes'
import type { BlockId } from '../../lib/layout/types'
import TierFrame from '../widgets/shared/TierFrame'

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
const SHELF_GAP = 6
const SHELF_HEIGHT_FALLBACK = 36
const SHELF_VIEWPORT_INSET = 8
const SWIPE_EXCLUSION = '[data-stack-control], input, textarea, select, [contenteditable], [role="textbox"]'
const TIER_LABELS: Readonly<Record<CanvasSize, string>> = {
  compact: 'Compact',
  standard: 'Standard',
  full: 'Full',
}

function tierList(tiers: readonly CanvasSize[]): string {
  const labels = tiers.map((tier) => TIER_LABELS[tier])
  if (labels.length < 2) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, or ${labels.at(-1)}`
}

function overlapArea(
  first: { left: number; right: number; top: number; bottom: number },
  second: { left: number; right: number; top: number; bottom: number },
): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top))
  return width * height
}

export function StackCompatibilityFace({
  label,
  tier,
  commonTiers,
}: {
  label: string
  tier: CanvasSize
  commonTiers: readonly CanvasSize[]
}) {
  return (
    <TierFrame label={`${label} compatibility`} tier={tier} state="empty" className="stack-compatibility-face">
      <div className="flex h-full min-h-0 flex-col justify-center gap-2 p-4 text-center">
        <h2 className="text-sm font-semibold">{label} is not available at {TIER_LABELS[tier]}.</h2>
        <p className="text-xs text-fg-muted">
          {commonTiers.length > 0
            ? `This stack supports ${tierList(commonTiers)}.`
            : 'These widgets do not share a stack size.'}
        </p>
        <p className="text-[11px] text-fg-muted">Change the stack size or remove the incompatible member in edit mode.</p>
      </div>
    </TierFrame>
  )
}

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
  const shelfRef = useRef<HTMLDivElement>(null)
  const [shelfPlacement, setShelfPlacement] = useState<'above' | 'below'>('below')
  const [shelfShift, setShelfShift] = useState(0)
  const faceIndex = Math.max(0, members.findIndex((member) => member.id === facing))
  const face = members[faceIndex]

  const placeShelf = (card: HTMLDivElement) => {
    const cardRect = card.getBoundingClientRect()
    const shelfRect = shelfRef.current?.getBoundingClientRect()
    const shelfWidth = shelfRect?.width ?? 0
    const shelfHeight = shelfRect?.height || SHELF_HEIGHT_FALLBACK
    const centeredLeft = cardRect.left + cardRect.width / 2 - shelfWidth / 2
    const leftEdge = Math.max(SHELF_VIEWPORT_INSET, centeredLeft)
    const clampedLeft = Math.min(leftEdge, window.innerWidth - SHELF_VIEWPORT_INSET - shelfWidth)
    const below = {
      left: clampedLeft,
      right: clampedLeft + shelfWidth,
      top: cardRect.bottom + SHELF_GAP,
      bottom: cardRect.bottom + SHELF_GAP + shelfHeight,
    }
    const above = {
      left: clampedLeft,
      right: clampedLeft + shelfWidth,
      top: cardRect.top - SHELF_GAP - shelfHeight,
      bottom: cardRect.top - SHELF_GAP,
    }
    const owner = card.closest<HTMLElement>('.canvas-item[data-canvas-object-id]')
    const neighbors = owner === null
      ? []
      : [...document.querySelectorAll<HTMLElement>('.canvas-item[data-canvas-object-id]')]
          .filter((node) => node !== owner && !node.hasAttribute('data-canvas-empty'))
          .map((node) => node.getBoundingClientRect())
    const occupiedArea = (candidate: typeof below) => neighbors.reduce((total, rect) => total + overlapArea(candidate, rect), 0)
    const belowFits = below.bottom <= window.innerHeight - SHELF_VIEWPORT_INSET
    const aboveFits = above.top >= SHELF_VIEWPORT_INSET
    const placement = !belowFits || (aboveFits && occupiedArea(above) < occupiedArea(below)) ? 'above' : 'below'
    setShelfPlacement(placement)
    setShelfShift(Math.round((clampedLeft - centeredLeft) * 100) / 100)
  }

  return (
    <div
      role="group"
      aria-roledescription="widget stack"
      aria-label={`${face?.label ?? 'Widget'}, ${faceIndex + 1} of ${members.length}`}
      data-stack-card={id}
      className={`stack-card${editing ? ' stack-card--editing' : ''}`}
      tabIndex={editing ? -1 : 0}
      onPointerEnter={(event) => { placeShelf(event.currentTarget) }}
      onFocus={(event) => { placeShelf(event.currentTarget) }}
      onKeyDown={(event) => {
        if (editing || event.target !== event.currentTarget) return
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        onStep(event.key === 'ArrowLeft' ? -1 : 1)
      }}
      onPointerDown={(event) => {
        if (editing || event.button !== 0) return
        if (event.target instanceof Element && event.target.closest(SWIPE_EXCLUSION)) return
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

      <div
        ref={shelfRef}
        role="toolbar"
        aria-label="Stack navigation"
        data-stack-control
        data-stack-shelf-placement={shelfPlacement}
        style={{ '--stack-shelf-shift': `${shelfShift}px` } as CSSProperties}
        className={`stack-card__shelf${editing ? ' stack-card__shelf--editing' : ''}`}
      >
        {!editing ? (
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

        {!editing ? (
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
        ) : null}
      </div>
    </div>
  )
}
