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
    <footer className="border-t border-panel-border pt-4 text-xs text-fg-muted">
      Aurora v{__APP_VERSION__} ·{' '}
      <a
        href="https://buymeacoffee.com/joncooler"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy me a coffee — support Aurora"
        className="hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        ☕ Buy me a coffee
      </a>
    </footer>
  )
}
