import BrandMark from '../../brand/BrandMark'
import { PRODUCT_NAME, PRODUCT_SLOGAN } from '../../brand/identity'

// Quiet drawer footer, after the last settings section (Layout) — a
// thank-you nook, not a banner. `__APP_VERSION__` is a build-time constant
// injected by Vite (see vite.config.ts / vitest.config.ts's `define` and
// src/vite-env.d.ts) from package.json's version, so this can't drift from
// it; settings components don't touch chrome.* (chrome.runtime.getManifest()
// is off-limits here — see the chrome.* boundary note), which is the other
// reason a build-time constant is used instead.
//
// The Buy Me a Coffee link is a plain, user-clicked `<a>` — navigation, not
// extension traffic — so it makes no network call of its own (no favicon
// fetch, no prefetch of the domain) and PRIVACY.md needs no update for it.
export default function About() {
  return (
    // The hairline above this footer comes from the tabpanel's divide-y (Task
    // 61 rhythm pass); pt-6 matches the sections' own vertical rhythm.
    <footer className="space-y-4 pt-6 text-xs text-fg-muted">
      <div className="flex items-center gap-3">
        <BrandMark className="size-10 shrink-0 rounded-xl" />
        <div>
          <p className="font-display text-sm font-semibold text-fg">{PRODUCT_NAME} v{__APP_VERSION__}</p>
          <p className="mt-0.5">{PRODUCT_SLOGAN}</p>
        </div>
      </div>
      <div className="max-w-xl rounded-xl border border-control-border bg-control-bg/25 p-3 leading-relaxed">
        <p className="font-medium text-fg">Local-first today. Optional services later.</p>
        <p className="mt-1">
          Optional premium services are planned, but nothing is sold or activated here yet. Encrypted sync and device transfer are being designed separately.
        </p>
      </div>
      <a
        href="https://buymeacoffee.com/joncooler"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy me a coffee - support Tab Two"
        className="inline-flex min-h-9 items-center hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        ☕ Buy me a coffee
      </a>
    </footer>
  )
}
