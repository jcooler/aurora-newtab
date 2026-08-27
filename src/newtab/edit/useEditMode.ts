import { useCallback, useRef, useState } from 'react'
import {
  beginEditSession,
  selectStack,
  selectWidget,
  type EditSelection,
  type EditSession,
} from '../../lib/layout/editSession'
import { saveLayoutsDocument } from '../../lib/layout/layoutOperations'
import type { LayoutsDocument } from '../../lib/layout/namedLayouts'
import type { AuroraStorage } from '../../lib/storage/index'
import type { BlockId } from '../../lib/layout/types'
import { closeAllDialogs } from '../../lib/dialogStack'
import { isPremium } from '../../lib/premium'

export interface EditModeApi {
  session: EditSession | null
  begin: (invoker?: HTMLElement | null) => void
  /** String ids remain accepted until the Task 4 canvas cutover. */
  select: (selection: EditSelection | BlockId | null) => void
  dispatch: (updater: (session: EditSession) => EditSession) => void
  cancel: () => void
  save: () => Promise<void>
}

/** The live edit session's React shell (named-layouts spec 2.5). Entry
 *  closes every open dialog (mode entry never strands a panel under the
 *  dimmed page); Cancel discards the session with NO write — exact by
 *  construction; Save calls saveLayoutsDocument exactly once with the
 *  draft, which is also the moment an unsaved "My layout" first
 *  materializes. Both exits restore focus to the entry invoker. */
export function useEditMode(input: {
  document: LayoutsDocument | null
  enabledIds: readonly BlockId[]
  storage: AuroraStorage
}): EditModeApi {
  const [session, setSession] = useState<EditSession | null>(null)
  const sessionLiveRef = useRef(false)
  sessionLiveRef.current = session !== null
  const savingRef = useRef(false)
  const invokerRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef(input)
  inputRef.current = input

  const begin = useCallback((invoker: HTMLElement | null = null) => {
    const { document: resolved, enabledIds } = inputRef.current
    if (!isPremium() || !resolved) return
    // Re-entry while a session is live is identity: replacing the session
    // would silently discard the draft (review fix C1) — the exact failure
    // the explicit Cancel/Save contract exists to prevent.
    if (sessionLiveRef.current) return
    invokerRef.current = invoker
    void closeAllDialogs()
    setSession(beginEditSession(resolved, enabledIds))
  }, [])

  const select = useCallback((selection: EditSelection | BlockId | null) => {
    setSession((current) => {
      if (!current) return current
      if (selection === null || typeof selection === 'string') {
        return selectWidget(current, selection)
      }
      return selection.kind === 'stack'
        ? selectStack(current, selection.id)
        : selectWidget(current, selection.id)
    })
  }, [])

  const dispatch = useCallback((updater: (session: EditSession) => EditSession) => {
    setSession((current) => (current ? updater(current) : current))
  }, [])

  const end = useCallback(() => {
    setSession(null)
    const invoker = invokerRef.current
    invokerRef.current = null
    if (invoker && invoker.isConnected) invoker.focus()
  }, [])

  const cancel = useCallback(() => {
    end()
  }, [end])

  const save = useCallback(async () => {
    const current = session
    // The in-flight guard keeps Save the SINGLE committing write even under
    // a double click (review fix M1).
    if (!current || savingRef.current) return
    savingRef.current = true
    try {
      await saveLayoutsDocument(inputRef.current.storage, current.draft)
    } finally {
      savingRef.current = false
    }
    end()
  }, [end, session])

  return { session, begin, select, dispatch, cancel, save }
}
