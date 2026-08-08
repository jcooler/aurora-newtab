import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { searchCity } from '../../../services/weather/geocode'
import { reverseGeocode } from '../../../services/weather/reverseGeocode'
import type { GeoMatch } from '../../../services/weather/types'
import { useStorage } from '../../../lib/storage/context'

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
// Kept clear of the viewport edge when the dropdown is nudged back on-screen
// — same constant/purpose as FolderPopover's EDGE_MARGIN.
const EDGE_MARGIN = 8

export default function LocationSetup() {
  const storage = useStorage()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Typeahead state, entirely separate from the geolocation flow's busy/error
  // above. `open` tracks whether the dropdown should be visible — it's only
  // ever flipped true alongside a non-empty `results` or `noMatches`, so
  // there's never a moment where it's showing an empty, resultless list
  // (no spinner theater: while a search is debouncing or in flight, `open`
  // simply stays whatever it last was, usually false).
  const [results, setResults] = useState<GeoMatch[]>([])
  const [noMatches, setNoMatches] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [edgeShift, setEdgeShift] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  // Mirrors `edgeShift` (updated in lockstep, below) so the measurement
  // effect can recover the list's TRUE unshifted position even though the
  // DOM it's reading already has a previous shift baked into its rendered
  // `style.left`.
  const appliedShiftRef = useRef(0)

  // Weather is a freely-repositionable widget (arrange mode) that can end up
  // anywhere on screen, including hard against the right edge — where a
  // fixed-width dropdown anchored `left-0` would run off-screen unreadable.
  // Same fix as FolderPopover.tsx: measure once per open/result-set change
  // and nudge left by the smallest amount that brings the right edge back
  // within EDGE_MARGIN (jsdom has no layout engine, so getBoundingClientRect
  // is an all-zero rect there — the width===0 guard makes this a no-op in
  // tests unless a test deliberately mocks it).
  //
  // Review fix: `rect` reflects whatever shift is CURRENTLY applied (from a
  // prior run of this same effect), not the list's un-shifted baseline — a
  // naive re-measure treats the already-corrected position as fresh input,
  // which can "un-clamp" a list that's still off-screen at its true position
  // the moment a second search resolves while the list stays open. Subtract
  // the shift that's already baked into `rect` before deciding whether (and
  // how much) to shift it now, so repeated measurements of the same
  // underlying position always converge on the same answer.
  useLayoutEffect(() => {
    if (!open) return
    const el = listRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const baseLeft = rect.left - appliedShiftRef.current
    const baseRight = rect.right - appliedShiftRef.current
    let shift = 0
    if (baseLeft < EDGE_MARGIN) shift = EDGE_MARGIN - baseLeft
    else if (baseRight > window.innerWidth - EDGE_MARGIN) shift = window.innerWidth - EDGE_MARGIN - baseRight
    appliedShiftRef.current = shift
    setEdgeShift(shift)
  }, [open, results, noMatches])

  // Debounce timer + in-flight abort controller, both held in refs (not
  // state) since neither should ever trigger a re-render on its own — same
  // idiom as NotesPanel's saveTimeoutRef.
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  // Abort whatever's outstanding on unmount so a response that arrives after
  // the component is gone never touches state.
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current !== null) clearTimeout(searchTimeoutRef.current)
      controllerRef.current?.abort()
    }
  }, [])

  async function useDevice() {
    // setBusy(true) is the first synchronous line — before
    // navigator.geolocation.getCurrentPosition below — so the button
    // (disabled={busy}) goes inert on this very click. Without this, a
    // second click while a request is still pending re-enters useDevice and
    // fires a second concurrent getCurrentPosition call. Both exit paths
    // below (device-level denial, and the success handler's `finally`)
    // reset it back to false — that's the part that has to stay exhaustive
    // whenever a new early-return is added here.
    setBusy(true)
    setError(null)
    // `geolocation` is an install-time permission (src/manifest.ts) — Chrome
    // does not allow it to be requested as optional (see manifest.ts's
    // comment for the exact chrome://extensions warning this produced when
    // it was tried), so there is no chrome.permissions.request() gate here:
    // the permission is already held by the time this button is clickable.
    // The only remaining prompt is the browser/OS-level location dialog
    // navigator.geolocation itself may show; its denial is handled by the
    // error callback below, and the manual city search stays untouched
    // either way.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Math.round(pos.coords.latitude * 100) / 100 // ~1km precision is plenty
          const lon = Math.round(pos.coords.longitude * 100) / 100
          // One-time lookup so the pill reads "Overcast · Dallas", not "· My location"
          const label = (await reverseGeocode(lat, lon)) ?? 'My location'
          await storage.set('location', { lat, lon, label, manual: false })
        } catch {
          setError('Could not save location — try again.')
        } finally {
          setBusy(false)
        }
      },
      () => {
        setBusy(false)
        setError('Location denied — search for your city instead.')
      },
      { timeout: 8000 },
    )
  }

  // Driven from the input's onChange, not a useEffect keyed on `query` — a
  // programmatic setQuery (see selectResult below, which writes the chosen
  // label back into the input) must NOT re-trigger a search, and routing the
  // debounce through this handler rather than an effect is what makes that
  // true for free, no "did this change come from a select?" ref needed.
  function handleQueryChange(value: string) {
    setQuery(value)
    setActiveIndex(-1)

    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
    // Cancel whatever's still in flight from a previous keystroke — belt and
    // suspenders alongside the `controller.signal.aborted` checks below,
    // which are what actually guarantee a late, stale response can never
    // clobber a newer one (they hold regardless of whether the fetch mock in
    // a given test honors AbortSignal at all).
    controllerRef.current?.abort()

    const trimmed = value.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setNoMatches(false)
      setOpen(false)
      return
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchTimeoutRef.current = null
      const controller = new AbortController()
      controllerRef.current = controller
      const abortableFetch: typeof fetch = (input, init) =>
        fetch(input, { ...init, signal: controller.signal })

      searchCity(trimmed, abortableFetch)
        .then((found) => {
          if (controller.signal.aborted) return
          setResults(found)
          setNoMatches(found.length === 0)
          setOpen(true)
          setActiveIndex(-1)
        })
        .catch(() => {
          // Quiet failure, same convention as the rest of the app — a
          // typeahead dropdown is not the place for an error banner.
          if (controller.signal.aborted) return
          setResults([])
          setNoMatches(false)
          setOpen(false)
        })
    }, SEARCH_DEBOUNCE_MS)
  }

  function selectResult(index: number) {
    const m = results[index]
    if (!m) return
    // Review fix: a selection can happen mid-debounce (the old results are
    // still on screen "by design" while a newer keystroke's timer is armed —
    // see handleQueryChange) or while a search from an EARLIER keystroke is
    // still in flight. Without cancelling both here, that stale timer/fetch
    // fires anyway after selection, re-dispatching a request and reopening
    // the dropdown with unrelated results — the user already picked one.
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
    controllerRef.current?.abort()
    void storage.set('location', { lat: m.lat, lon: m.lon, label: m.name, manual: true })
    setQuery(m.name)
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (results.length === 0) return
      e.preventDefault()
      setActiveIndex((i) => (i >= results.length - 1 ? 0 : i + 1))
    } else if (e.key === 'ArrowUp') {
      if (results.length === 0) return
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      if (results.length === 0) return
      e.preventDefault()
      // No arrowed-to option yet — Enter picks the top match, preserving the
      // old "type, then Enter" muscle memory from before typeahead existed.
      selectResult(activeIndex === -1 ? 0 : activeIndex)
    } else if (e.key === 'Escape' && open) {
      // Deliberate inner consumer (same precedent as TodoPanel's draft-name
      // input): stop this Escape from reaching the shared dialog stack so it
      // closes only the suggestion list, never a dialog this widget happens
      // to be inside. The list isn't itself a dialog, so it doesn't register
      // with useDialogEscape — this stopPropagation is the only thing
      // standing between it and whatever's on top of that stack.
      e.stopPropagation()
      setOpen(false)
    }
  }

  const activeId = activeIndex !== -1 ? `location-option-${activeIndex}` : undefined

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-fg-muted">Weather needs a location.</p>
      <button
        type="button"
        onClick={useDevice}
        disabled={busy}
        aria-describedby={error ? 'location-error' : undefined}
        // Explicit cursors, both here and on the input below: WeatherWidget's
        // <section> sets `cursor-default` (it inherits, which is what keeps
        // the text I-beam off the forecast data — see its own comment), and
        // Tailwind v4's preflight sets `cursor: default` on buttons besides.
        // Neither is right for a form: a button is a control (pointer) and a
        // text field is a text field (I-beam). The suggestion rows below
        // already carry their own `cursor-pointer`.
        className="self-start cursor-pointer rounded-panel border border-panel-border px-2 py-1 text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        Use my location
      </button>
      <div className="relative w-40">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="location-listbox"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Search for a city"
          autoComplete="off"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="or search a city"
          className="w-40 cursor-text border-b border-panel-border bg-transparent text-fg outline-none focus-visible:border-accent"
        />
        {/* Rendered whenever there's something to show, then hidden (not
            unmounted) once closed — the `hidden` attribute drops it from the
            accessibility tree exactly like not rendering it at all (so
            existing queryByRole('listbox') checks are unaffected), but keeps
            the element itself in the DOM so `aria-controls` above always
            resolves to a real id, per the ARIA APG combobox pattern. */}
        <ul
          ref={listRef}
          id="location-listbox"
          role="listbox"
          aria-label="City suggestions"
          hidden={!open}
          style={edgeShift ? { left: edgeShift } : undefined}
          className="absolute left-0 top-full z-10 mt-1 w-72 max-h-56 overflow-y-auto rounded-panel border border-panel-border bg-panel-solid p-1 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
        >
          {results.length === 0 && noMatches && (
            <li className="px-2 py-1.5 text-sm text-fg-muted">No matches</li>
          )}
          {results.map((m, i) => {
            const secondary = [m.admin1, m.country].filter(Boolean).join(', ')
            return (
              <li
                key={`${m.lat},${m.lon}`}
                id={`location-option-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectResult(i)}
                className={`flex cursor-pointer items-baseline gap-1.5 rounded px-2 py-1.5 text-sm ${
                  i === activeIndex ? 'bg-control-bg-hover text-fg' : 'text-fg-muted'
                }`}
              >
                <span className="truncate">{m.name}</span>
                {secondary && (
                  <span className="truncate text-xs text-fg-muted">— {secondary}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {error && (
        <p id="location-error" role="alert" className="text-fg-muted">
          {error}
        </p>
      )}
    </div>
  )
}
