import type { AuroraStorage } from '../../lib/storage/index'
import type { Countdown } from '../../lib/storage/schema'
import { row, control } from './shared'

/** Existing countdowns (edit date / remove) plus the add-countdown form.
 *  `countdowns` is owned by SettingsPanel (its useStoredKey read) and flows
 *  down as a prop; the add form reads straight off its own FormData on
 *  submit, so it needs no local draft state at all. */
export default function Countdowns({
  countdowns,
  storage,
}: {
  countdowns: Countdown[] | undefined
  storage: AuroraStorage
}) {
  const updateCountdowns = (fn: (list: Countdown[]) => Countdown[]) =>
    void storage.update('countdowns', fn)

  function handleAddCountdown(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const date = String(data.get('date') ?? '')
    if (!name || !date) return
    updateCountdowns((list) => [...list, { id: crypto.randomUUID(), name, date }])
    e.currentTarget.reset()
  }

  return (
    <section aria-label="Countdowns">
      <h3 className="mb-1 text-sm font-medium text-fg">Countdowns</h3>
      {(countdowns ?? []).map((c) => (
        <div key={c.id} className={row}>
          <label htmlFor={`cd-name-${c.id}`} className="sr-only">
            Countdown name
          </label>
          <input
            id={`cd-name-${c.id}`}
            key={c.name} // remount on external change, same as the profile name field above
            defaultValue={c.name}
            onBlur={(e) => {
              const value = e.currentTarget.value.trim()
              if (!value || value === c.name) return
              updateCountdowns((list) =>
                list.map((x) => (x.id === c.id ? { ...x, name: value } : x)),
              )
            }}
            className={`${control} w-28`}
          />
          <div className="flex items-center gap-2">
            <label htmlFor={`cd-date-${c.id}`} className="sr-only">
              Countdown date
            </label>
            <input
              id={`cd-date-${c.id}`}
              type="date"
              value={c.date}
              onChange={(e) => {
                // Capture the value synchronously: e.currentTarget is nulled
                // out once the event finishes dispatching, but storage.update's
                // fn only runs after an internal await (see lib/storage/index.ts),
                // so reading e.currentTarget.value lazily inside that closure
                // would silently throw and drop the write.
                const date = e.currentTarget.value
                updateCountdowns((list) =>
                  list.map((x) => (x.id === c.id ? { ...x, date } : x)),
                )
              }}
              className={control}
            />
            <button
              type="button"
              aria-label={`Remove ${c.name}`}
              onClick={() => updateCountdowns((list) => list.filter((x) => x.id !== c.id))}
              className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <form className={row} onSubmit={handleAddCountdown}>
        <label htmlFor="cd-new-name" className="sr-only">
          New countdown name
        </label>
        <input id="cd-new-name" name="name" placeholder="Name" className={`${control} w-28`} />
        <div className="flex items-center gap-2">
          <label htmlFor="cd-new-date" className="sr-only">
            New countdown date
          </label>
          <input id="cd-new-date" name="date" type="date" className={control} />
          <button
            type="submit"
            className="text-sm text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            Add
          </button>
        </div>
      </form>
    </section>
  )
}
