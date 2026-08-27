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
    <footer className="pt-6 text-xs text-fg-muted">
      Aurora v{__APP_VERSION__} ·{' '}
      <a
        href="https://buymeacoffee.com/joncooler"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy me a coffee — support Aurora"
        className="hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:inline-flex max-[420px]:min-h-9 max-[420px]:items-center"
      >
        ☕ Buy me a coffee
      </a>
    </footer>
  )
}
