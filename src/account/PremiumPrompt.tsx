import { useId } from 'react'

export interface PremiumPromptProps {
  title: string
  benefit: string
  signedIn: boolean
  onSignIn: () => void
  onViewPlans: () => void
  onContinueFree: () => void
}

const actionClass =
  'inline-flex min-h-9 min-w-9 cursor-pointer items-center rounded-lg border border-control-border bg-transparent px-3 text-sm text-fg-muted transition-colors hover:bg-control-bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none'

export default function PremiumPrompt({
  title,
  benefit,
  signedIn,
  onSignIn,
  onViewPlans,
  onContinueFree,
}: PremiumPromptProps) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="border-y border-hairline py-4 text-fg">
      <h2 id={titleId} className="font-display text-lg font-medium tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 max-w-xl text-sm text-fg-muted">{benefit}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!signedIn ? <button type="button" onClick={onSignIn} className={actionClass}>Sign in</button> : null}
        <button type="button" onClick={onViewPlans} className={actionClass}>View plans</button>
        <button type="button" onClick={onContinueFree} className={actionClass}>Continue free</button>
      </div>
    </section>
  )
}
