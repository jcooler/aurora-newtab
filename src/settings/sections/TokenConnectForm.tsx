import { useId, useState } from 'react'
import { ensureOrigin } from '../../services/permissions'
import { control, submitBtn } from './shared'

export interface TokenField {
  id: string
  label: string
  type: 'text' | 'password'
  placeholder: string
  defaultValue?: string
}

/** The one card body every token connector (Tasks 48-51) renders: a small
 *  form of labelled fields plus a Connect button, OR — once `connectedAs` is
 *  set — a connected row with a Disconnect button in place of the form (the
 *  form does NOT own the enable toggle; that stays the card shell's). House
 *  styling matches Connectors.tsx's RSS body: `control` for inputs, the
 *  shared `label` class, text-accent for the primary action, and a single
 *  `role="alert"` paragraph for every inline error (validation, denied
 *  grant, and validate() failure all funnel through the same error state —
 *  same idiom as RSS's handleAddFeed). */
export function TokenConnectForm(props: {
  fields: TokenField[]
  connectLabel?: string
  /** Origins to request BEFORE validation — derived synchronously from the
   *  field values. Returning [] or throwing -> inline alert, no permission
   *  request, nothing stored. */
  originsFor(values: Record<string, string>): string[]
  /** The who-am-I probe. Runs AFTER the grant. Resolve { ok: true, identity }
   *  to persist; { ok: false, message } -> role="alert", NOTHING stored. */
  validate(values: Record<string, string>): Promise<{ ok: true; identity: string } | { ok: false; message: string }>
  /** Persist the validated config (called once, after validate ok). */
  onConnected(values: Record<string, string>, identity: string): Promise<void>
  /** Present when already connected -> renders Disconnect instead of the form. */
  connectedAs: string | null
  onDisconnect(): Promise<void>
}) {
  const { fields, connectLabel = 'Connect', originsFor, validate, onConnected, connectedAs, onDisconnect } = props

  // Two token connectors can render on the same Connectors tab at once
  // (GithubConfig and VercelConfig both declare a `token` field, for
  // instance), so a static `token-connect-${field.id}` id would collide
  // across instances — duplicate DOM ids break label association and
  // aria-describedby for screen readers. useId() gives each mounted
  // TokenConnectForm its own stable, unique prefix.
  const uid = useId()

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, f.defaultValue ?? ''])),
  )
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  if (connectedAs !== null) {
    // `connectedAs` still SELECTS this connected branch, but the identity itself
    // is shown by the card SHELL's authState-driven chip (Connectors.tsx) — the
    // single source of that indicator, and the only one present in the
    // Off-but-connected state, where this form isn't rendered at all. Repeating
    // it here was redundant, so this branch is now just the Disconnect action.
    return (
      <div className="mt-3 flex border-t border-hairline pt-3">
        <button
          type="button"
          onClick={() => void onDisconnect()}
          className={`${submitBtn} self-start`}
        >
          Disconnect
        </button>
      </div>
    )
  }

  async function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    // COMPLIANCE-CRITICAL gesture chain, same discipline as Connectors.tsx's
    // RSS handleAddFeed and permissions.ts's ensureOrigin doc comment:
    // chrome.permissions.request (inside ensureOrigin below) must be the
    // FIRST await anywhere in this handler, with ZERO awaits ahead of it —
    // any earlier await (even a fast one) is an IPC round-trip that can land
    // outside the user-gesture window and make Chrome refuse to show its
    // permission prompt. Trimming/required-check and originsFor() are both
    // synchronous, so they cost the gesture nothing.
    const trimmed: Record<string, string> = {}
    for (const field of fields) {
      const value = (values[field.id] ?? '').trim()
      if (!value) {
        setError(`${field.label} is required.`)
        return
      }
      trimmed[field.id] = value
    }

    // A thrown originsFor error (e.g. jira.ts's normalizeJiraSite naming the
    // exact expected site shape) is a more useful message than the generic
    // fallback below — captured here and preferred when present, so a
    // connector-specific rejection reaches the user instead of being
    // discarded. A messageless throw (or a non-Error thrown value) still
    // falls back to the generic copy.
    let origins: string[] = []
    let originsError: string | null = null
    try {
      origins = originsFor(trimmed)
    } catch (e) {
      originsError = e instanceof Error && e.message ? e.message : null
    }
    if (origins.length === 0) {
      setError(originsError ?? 'Could not determine which site to connect to.')
      return
    }

    setConnecting(true)
    try {
      // ensureOrigin -> chrome.permissions.request is the first await, per
      // the comment above. Multi-origin originsFor() results would only ever
      // request the FIRST origin in-gesture; every token connector this form
      // serves derives exactly one, so that's also always the whole set.
      let granted: boolean
      try {
        granted = await ensureOrigin(origins[0]!)
      } catch {
        granted = false
      }
      if (!granted) {
        setError('Permission to read that site was denied, so nothing was connected.')
        return
      }

      const result = await validate(trimmed)
      if (!result.ok) {
        setError(result.message)
        return
      }

      await onConnected(trimmed, result.identity)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3"
      onSubmit={(e) => void handleConnect(e)}
    >
      {fields.map((field) => (
        <div key={field.id}>
          <label htmlFor={`${uid}-${field.id}`} className="sr-only">
            {field.label}
          </label>
          <input
            id={`${uid}-${field.id}`}
            type={field.type}
            placeholder={field.placeholder}
            value={values[field.id] ?? ''}
            autoComplete={field.type === 'password' ? 'off' : undefined}
            onChange={(e) => {
              const next = e.currentTarget.value
              setValues((prev) => ({ ...prev, [field.id]: next }))
              setError(null)
            }}
            aria-describedby={error ? `${uid}-error` : undefined}
            className={`${control} w-full`}
          />
        </div>
      ))}

      <button type="submit" disabled={connecting} className={`${submitBtn} self-start`}>
        {connectLabel}
      </button>

      {error && (
        <p id={`${uid}-error`} role="alert" className="text-xs text-fg-muted">
          {error}
        </p>
      )}
    </form>
  )
}
