import { searchWeb } from '../../services/search'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function SearchBar() {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.search) return null
  return (
    <form
      role="search"
      className="mt-8 mid:mt-4 short:mt-2 xshort:mt-1"
      onSubmit={(e) => {
        e.preventDefault()
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim()
        if (q) void searchWeb(q)
      }}
    >
      <input
        name="q"
        type="search"
        placeholder="Search the web"
        aria-label="Search the web"
        autoComplete="off"
        className="w-80 narrow:w-64 rounded-panel border border-panel-border bg-panel-solid px-4 py-2 mid:py-1 short:py-1 xshort:py-0.5 text-center text-fg placeholder:text-fg-muted shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] outline-none focus-visible:border-accent"
      />
    </form>
  )
}
