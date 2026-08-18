import type { CanvasGuide } from '../arrange/canvasSnap'

/** Magnetic alignment guides during a drag (named-layouts spec 2.5),
 *  rendered as surface-local hairlines. Pointer-transparent chrome. */
export default function GuideOverlay({ guides }: { guides: readonly CanvasGuide[] }) {
  if (guides.length === 0) return null
  return (
    <div className="edit-guides" aria-hidden>
      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.kind}-${guide.value}`}
          className="edit-guide"
          data-axis={guide.axis}
          style={guide.axis === 'x' ? { left: `${guide.value}px` } : { top: `${guide.value}px` }}
        />
      ))}
    </div>
  )
}
