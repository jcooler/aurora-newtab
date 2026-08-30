export default function BrandMark({
  label,
  className = '',
}: {
  label?: string
  className?: string
}) {
  return (
    <img
      src="/icons/tab-two-mark.svg"
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      data-tab-two-mark=""
      className={className}
    />
  )
}
