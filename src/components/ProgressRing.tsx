export default function ProgressRing({
  value,
  target,
  unit,
}: {
  value: number
  target: number
  unit: string
}) {
  const safeTarget = Math.max(1, target)
  const safeValue = Math.min(safeTarget, Math.max(0, value))
  const degrees = (safeValue / safeTarget) * 360

  return (
    <div
      role="progressbar"
      aria-label={`${safeValue} of ${safeTarget} ${unit} complete`}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      aria-valuemax={safeTarget}
      className="grid size-11 shrink-0 place-items-center rounded-full transition-[background] duration-300 motion-reduce:transition-none"
      style={{
        background: `conic-gradient(var(--accent) ${degrees}deg, var(--control-bg) ${degrees}deg)`,
      }}
    >
      <span aria-hidden="true" className="size-8 rounded-full bg-panel-solid" />
    </div>
  )
}
