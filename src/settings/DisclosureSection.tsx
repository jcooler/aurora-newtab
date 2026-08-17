import { useId, useState, type ReactNode } from 'react'

/** A session-only editor disclosure. Its body is unmounted while closed so
 * inactive editors add neither visual weight nor form controls to the
 * Settings document. Storage remains owned by the editor passed as children. */
export default function DisclosureSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const buttonId = `${id}-button`
  const regionId = `${id}-region`

  return (
    <section data-settings-disclosure="" className="overflow-hidden rounded-xl border border-control-border bg-control-bg/35">
      <h4>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-fg transition-colors hover:bg-control-bg-hover focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-accent motion-reduce:transition-none"
        >
          <span>{title}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 8 4 4 4-4" />
          </svg>
        </button>
      </h4>
      {open ? (
        <div
          id={regionId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-control-border px-3 py-3"
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}
