import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { AuroraStorage } from '../../lib/storage'
import {
  releaseUnownedOrigins,
  runOriginTransaction,
  type OriginTransactionResult,
} from '../../services/permissionTransactions'
import { btnQuiet, control, submitBtn } from './shared'
import type { ConnectorCardMode } from '../connectors/connectorCardState'

export interface TokenField {
  id: string
  label: string
  type: 'text' | 'password' | 'select'
  placeholder: string
  defaultValue?: string
  options?: readonly { value: string; label: string }[]
}

export interface TokenDisconnectResult {
  candidates: string[]
  transaction: OriginTransactionResult<void>
}

/** The one card body every token connector (Tasks 48-51) renders: an explicit
 *  setup/edit disclosure around labelled fields plus a Connect button, OR —
 *  once `connectedAs` is set — connected extras with Edit and Disconnect
 *  actions (the form does NOT own the enable toggle; that stays the card shell's). House
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
  /** Present when already connected -> renders Edit/Disconnect instead of the form. */
  connectedAs: string | null
  /** Hide a first-time setup form until the user explicitly asks to configure it.
   * Reconnect callers leave this false so stripped-secret recovery remains immediate. */
  initiallyCollapsed?: boolean
  /** When the connector-card parent owns the active editor, render the form
   * immediately and route Cancel/success/disconnect back through that owner. */
  managedMode?: ConnectorCardMode
  onManagedClose?(): void
  /** Attempts the authoritative config removal and returns both its lifecycle
   * outcome and the canonical origins captured from the removed config. */
  onDisconnect(): Promise<TokenDisconnectResult>
  /** The real SettingsPanel storage instance, needed for transaction rollback ownership checks. */
  storage: AuroraStorage
  /** Durable SettingsPanel-owned cleanup reporter. */
  reportPendingCleanup(patterns: readonly string[]): void
  /** Connector-specific content slotted into the CONNECTED branch only,
   *  between the connected-as row (owned by the card shell, not this form —
   *  see the comment on that branch below) and the Disconnect row. GithubBody
   *  (Task 69) is the first consumer: the "Show on your board" view chips.
   *  Absent in the disconnected (form) state — there is nothing composed yet
   *  to show chips for. */
  connectedExtras?: ReactNode
}) {
  const {
    fields,
    connectLabel = 'Connect',
    originsFor,
    validate,
    onConnected,
    connectedAs,
    initiallyCollapsed = false,
    managedMode,
    onManagedClose,
    onDisconnect,
    storage,
    reportPendingCleanup,
    connectedExtras,
  } = props
  const managed = managedMode !== undefined

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
  const [revealed, setRevealed] = useState(() => managed || (connectedAs === null && !initiallyCollapsed))
  const firstFieldRef = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const setupButtonRef = useRef<HTMLButtonElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const focusFieldAfterRevealRef = useRef(false)
  const restoreDisclosureFocusRef = useRef(false)

  useEffect(() => {
    if (revealed && focusFieldAfterRevealRef.current) {
      focusFieldAfterRevealRef.current = false
      firstFieldRef.current?.focus()
    } else if (!revealed && restoreDisclosureFocusRef.current) {
      restoreDisclosureFocusRef.current = false
      ;(connectedAs === null ? setupButtonRef.current : editButtonRef.current)?.focus()
    }
  }, [connectedAs, revealed])

  function revealCredentials() {
    focusFieldAfterRevealRef.current = true
    setRevealed(true)
  }

  function resetAndCollapse() {
    setValues(Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? ''])))
    setError(null)
    setRevealed(false)
  }

  function cancelAndCollapse() {
    if (managed) {
      setValues(Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? ''])))
      setError(null)
      onManagedClose?.()
      return
    }
    restoreDisclosureFocusRef.current = true
    resetAndCollapse()
  }

  async function handleDisconnect() {
    let result: TokenDisconnectResult
    try {
      setError(null)
      result = await onDisconnect()
      if ('pendingCleanup' in result.transaction && result.transaction.pendingCleanup.length > 0) {
        reportPendingCleanup(result.transaction.pendingCleanup)
      }
      if (result.transaction.status !== 'committed') {
        setError("Couldn't disconnect because the saved connection could not be updated. Please try again.")
        return
      }
    } catch {
      setError("Couldn't disconnect because the saved connection could not be updated. Please try again.")
      return
    }

    try {
      const cleanup = await releaseUnownedOrigins(storage, result.candidates)
      if (cleanup.pending.length > 0) reportPendingCleanup(cleanup.pending)
    } catch {
      if (result.candidates.length > 0) reportPendingCleanup(result.candidates)
    }
    if (managed) onManagedClose?.()
  }

  if (!managed && !revealed && connectedAs !== null) {
    // `connectedAs` still SELECTS this connected branch, but the identity itself
    // is shown by the card SHELL's authState-driven chip (Connectors.tsx) — the
    // single source of that indicator, and the only one present in the
    // Off-but-connected state, where this form isn't rendered at all. Repeating
    // it here was redundant, so this branch is now just the Disconnect action.
    return (
      <div className="mt-3 flex flex-col gap-3 border-t border-hairline pt-3">
        {connectedExtras}
        <div className="flex flex-wrap gap-3">
          <button ref={editButtonRef} type="button" onClick={revealCredentials} className={submitBtn}>
            Edit connection
          </button>
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            aria-describedby={error ? `${uid}-error` : undefined}
            className={submitBtn}
          >
            Disconnect
          </button>
        </div>
        {error && (
          <p id={`${uid}-error`} role="alert" className="text-xs text-fg-muted">
            {error}
          </p>
        )}
      </div>
    )
  }

  if (!managed && !revealed) {
    return (
      <div className="mt-3 border-t border-hairline pt-3">
        <button ref={setupButtonRef} type="button" onClick={revealCredentials} className={submitBtn}>
          Set up connection
        </button>
      </div>
    )
  }

  async function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    // COMPLIANCE-CRITICAL gesture chain: trimming and originsFor() are
    // synchronous, then runOriginTransaction queues lifecycle authority and
    // invokes chrome.permissions.request before its first await. Do not insert
    // an await between this validation boundary and that call.
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
      const transaction = await runOriginTransaction(storage, origins, async () => {
        const result = await validate(trimmed)
        if (!result.ok) return result
        await onConnected(trimmed, result.identity)
        return { ok: true as const, value: undefined, ownerCommitted: true as const }
      })

      if ('pendingCleanup' in transaction && transaction.pendingCleanup.length > 0) {
        reportPendingCleanup(transaction.pendingCleanup)
      }
      if (transaction.status === 'committed') {
        if (managed) {
          setValues(Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? ''])))
          setError(null)
          onManagedClose?.()
        } else {
          resetAndCollapse()
        }
        return
      }
      if (transaction.status === 'aborted') {
        setError(transaction.message)
        return
      }
      if (transaction.status === 'denied') {
        setError('Permission to read that site was denied, so nothing was connected.')
        return
      }
      if (transaction.status === 'access-lost') {
        setError('Access changed before saving. Please try again.')
        return
      }
      setError("Couldn't save that connection. Please try again.")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <form
      className={managed ? 'flex flex-col gap-2' : 'mt-3 flex flex-col gap-2 border-t border-hairline pt-3'}
      onSubmit={(e) => void handleConnect(e)}
    >
      {managed && connectedAs !== null && connectedExtras ? (
        <div className="mb-1 border-b border-hairline pb-3">{connectedExtras}</div>
      ) : null}
      {fields.map((field, index) => {
        const id = `${uid}-${field.id}`
        const common = {
          id,
          value: values[field.id] ?? '',
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const next = event.currentTarget.value
            setValues((prev) => ({ ...prev, [field.id]: next }))
            setError(null)
          },
          'aria-describedby': error ? `${uid}-error` : undefined,
          className: `${control} w-full`,
        }
        return (
        <div key={field.id}>
          <label htmlFor={`${uid}-${field.id}`} className="sr-only">
            {field.label}
          </label>
          {field.type === 'select' ? (
            <select
              ref={index === 0 ? (node) => { firstFieldRef.current = node } : undefined}
              {...common}
            >
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              ref={index === 0 ? (node) => { firstFieldRef.current = node } : undefined}
              type={field.type}
              placeholder={field.placeholder}
              autoComplete={field.type === 'password' ? 'off' : undefined}
              {...common}
            />
          )}
        </div>
        )
      })}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={connecting} className={submitBtn}>
          {connectLabel}
        </button>
        <button type="button" disabled={connecting} onClick={cancelAndCollapse} className={btnQuiet}>
          Cancel
        </button>
        {managed && connectedAs !== null ? (
          <button
            type="button"
            disabled={connecting}
            onClick={() => void handleDisconnect()}
            className={btnQuiet}
          >
            Disconnect
          </button>
        ) : null}
      </div>

      {error && (
        <p id={`${uid}-error`} role="alert" className="text-xs text-fg-muted">
          {error}
        </p>
      )}
    </form>
  )
}
