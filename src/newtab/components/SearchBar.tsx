import { searchUrl } from '../../lib/search'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function SearchBar() {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.search) return null
  return (
    <form
      role="search"
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault()
        const q = String(new FormData(e.currentTarget).get('q') ?? '')
        if (q.trim()) window.location.assign(searchUrl(settings.searchEngine, q))
      }}
    >
      <input
        name="q"
        type="search"
        placeholder="Search the web"
        aria-label="Search the web"
        autoComplete="off"
        className="w-80 rounded-panel border border-panel-border bg-panel px-4 py-2 text-center text-fg placeholder:text-fg-muted backdrop-blur-[var(--panel-blur)] outline-none focus-visible:border-accent"
      />
    </form>
  )
}
