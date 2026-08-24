import { useLayoutEffect, useRef, useState } from 'react'
import { anchorPanelAvoidingAnchor } from '../../lib/layout/anchor'
import { type WidgetStack, type WidgetTier } from '../../lib/layout/namedLayouts'
import type { BlockId } from '../../lib/layout/types'
import type { WidgetRegistryEntry } from '../widgetRegistry'
import { stackCompatibility } from '../canvas/stackPresentation'

const TIER_LABELS: Readonly<Record<WidgetTier, string>> = {
  compact: 'Compact',
  standard: 'Standard',
  full: 'Full',
}

export default function StackInspector({
  stack,
  entries,
  anchorRect,
  overlapLabels,
  onTier,
  onLayer,
  onReorder,
  onRemove,
  onMemberPointerDown,
  onHide,
}: {
  stack: WidgetStack
  entries: readonly WidgetRegistryEntry[]
  anchorRect: DOMRectReadOnly
  overlapLabels: readonly string[]
  onTier: (tier: WidgetTier) => void
  onLayer: (direction: 'forward' | 'backward') => void
  onReorder: (id: BlockId, direction: -1 | 1) => void
  onRemove: (id: BlockId) => void
  onMemberPointerDown: (id: BlockId, event: React.PointerEvent) => void
  onHide: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState(1)
  useLayoutEffect(() => {
    const height = panelRef.current?.getBoundingClientRect().height ?? 0
    if (height > 0 && Math.abs(height - measuredHeight) > 0.5) setMeasuredHeight(height)
  }, [entries.length, measuredHeight])
  const viewport = {
    w: typeof window === 'undefined' ? 1 : window.innerWidth,
    h: typeof window === 'undefined' ? 1 : window.innerHeight,
  }
  const position = anchorPanelAvoidingAnchor(anchorRect, { w: 280, h: measuredHeight }, viewport)
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const facing = byId.get(stack.facing)
  const title = `${facing?.label ?? 'Widget'} +${Math.max(0, stack.members.length - 1)}`
  const compatibility = stackCompatibility(stack.members, stack.tier)
  const incompatibleLabels = compatibility.incompatibleMembers
    .map((id) => byId.get(id)?.label ?? id)
  const tierNames = compatibility.commonTiers.map((tier) => TIER_LABELS[tier])
  const compatibilityMessage = compatibility.compatible
    ? null
    : `${TIER_LABELS[stack.tier]} is not available for ${incompatibleLabels.join(', ')}. ${
      tierNames.length > 0
        ? `Choose ${tierNames.join(' or ')} or remove the incompatible member.`
        : 'Remove an incompatible member to recover a shared size.'
    }`

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${title} inspector`}
      className="edit-inspector edit-inspector--stack"
      style={{
        left: position.left,
        ...('top' in position ? { top: position.top } : { bottom: position.bottom }),
      }}
    >
      <p className="edit-inspector__title">
        {title}
        <span className="edit-inspector__context">Widget stack</span>
      </p>

      <div className="edit-inspector__row">
        <span className="edit-inspector__label">Size</span>
        <div role="radiogroup" aria-label="Size" className="edit-segment">
          {compatibility.commonTiers.map((tier) => (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={stack.tier === tier}
              className="edit-segment__option"
              onClick={() => onTier(tier)}
            >
              {TIER_LABELS[tier]}
            </button>
          ))}
        </div>
      </div>
      {compatibilityMessage ? <p className="edit-inspector__note">{compatibilityMessage}</p> : null}

      <div className="edit-inspector__row">
        <span className="edit-inspector__label">Overlap order</span>
        <div className="edit-inspector__actions">
          <button type="button" className="edit-inspector__button" onClick={() => onLayer('backward')}>
            Send backward
          </button>
          <button type="button" className="edit-inspector__button" onClick={() => onLayer('forward')}>
            Bring forward
          </button>
        </div>
      </div>

      <div className="edit-inspector__row">
        <span className="edit-inspector__label">Order</span>
        <div className="stack-inspector__members">
          {stack.members.flatMap((id, index) => {
            const entry = byId.get(id)
            if (!entry) return []
            return [(
              <div key={id} data-stack-inspector-member={id} className="stack-inspector__member">
                <button
                  type="button"
                  aria-label={`Move ${entry.label} out of stack`}
                  className="stack-inspector__drag"
                  onPointerDown={(event) => { event.stopPropagation(); onMemberPointerDown(id, event) }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="8" cy="6" r="1.6" /><circle cx="16" cy="6" r="1.6" />
                    <circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" />
                    <circle cx="8" cy="18" r="1.6" /><circle cx="16" cy="18" r="1.6" />
                  </svg>
                </button>
                <span className="stack-inspector__name">{entry.label}</span>
                <button
                  type="button"
                  aria-label={`Move ${entry.label} earlier`}
                  className="stack-inspector__icon"
                  disabled={index === 0}
                  onClick={() => onReorder(id, -1)}
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  aria-label={`Move ${entry.label} later`}
                  className="stack-inspector__icon"
                  disabled={index === stack.members.length - 1}
                  onClick={() => onReorder(id, 1)}
                >
                  <span aria-hidden>↓</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${entry.label} from stack`}
                  className="stack-inspector__remove"
                  onClick={() => onRemove(id)}
                >
                  Remove
                </button>
              </div>
            )]
          })}
        </div>
      </div>

      <div className="edit-inspector__footer">
        <button type="button" className="edit-inspector__button edit-inspector__button--quiet" onClick={onHide}>
          Hide stack
        </button>
      </div>
      {overlapLabels.length > 0 ? (
        <p className="edit-inspector__note">Overlaps {overlapLabels.join(', ')}</p>
      ) : null}
    </div>
  )
}
