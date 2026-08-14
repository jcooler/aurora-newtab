import { useCallback, useEffect, useRef, useState } from 'react'
import { useStorage } from '../../../lib/storage/context'
import type { Notes } from '../../../lib/storage/schema'

const SAVE_DEBOUNCE_MS = 500
const SAVED_VISIBLE_MS = 1_400

export type NoteSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface NotesPersistence {
  ready: boolean
  text: string
  status: NoteSaveStatus
  edit(value: string): void
  focus(): void
  blur(): void
  retry(): Promise<boolean>
  flushLatest(): Promise<boolean>
}

function sameNotes(left: Notes | null, right: Notes): boolean {
  return left !== null && left.text === right.text && left.updatedAt === right.updatedAt
}

export function useNotesPersistence(): NotesPersistence {
  const storage = useStorage()
  const [ready, setReady] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<NoteSaveStatus>('idle')
  const [dirty, setDirty] = useState(false)

  const mountedRef = useRef(false)
  const readyRef = useRef(false)
  const textRef = useRef('')
  const revisionRef = useRef(0)
  const dirtyRef = useRef(false)
  const focusedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const saveRevisionRef = useRef<number | null>(null)
  const drainPromiseRef = useRef<Promise<boolean> | null>(null)
  const forceDrainRef = useRef(false)
  const inFlightPayloadRef = useRef<Notes | null>(null)
  const pendingExternalRef = useRef<Notes | null>(null)
  const drainRef = useRef<(force: boolean) => Promise<boolean>>(async () => true)

  const applyExternal = useCallback((value: Notes) => {
    textRef.current = value.text
    if (mountedRef.current) setText(value.text)
  }, [])

  const reconcileExternal = useCallback(() => {
    if (dirtyRef.current || focusedRef.current) return
    const pending = pendingExternalRef.current
    if (!pending) return
    pendingExternalRef.current = null
    applyExternal(pending)
  }, [applyExternal])

  const showSaved = useCallback(() => {
    if (!mountedRef.current) return
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current)
    setStatus('saved')
    const revision = revisionRef.current
    savedTimerRef.current = setTimeout(() => {
      savedTimerRef.current = null
      if (mountedRef.current && !dirtyRef.current && revisionRef.current === revision) {
        setStatus('idle')
      }
    }, SAVED_VISIBLE_MS)
  }, [])

  const persistOnce = useCallback(async (): Promise<{ ok: boolean; revision: number }> => {
    const revision = revisionRef.current
    const payload: Notes = { text: textRef.current, updatedAt: Date.now() }
    inFlightPayloadRef.current = payload
    saveRevisionRef.current = revision
    if (mountedRef.current) setStatus('saving')

    const operation = storage.set('notes', payload).then(
      () => {
        if (revisionRef.current === revision) {
          dirtyRef.current = false
          if (mountedRef.current) setDirty(false)
          showSaved()
          reconcileExternal()
        }
        return true
      },
      () => {
        if (revisionRef.current === revision && mountedRef.current) setStatus('error')
        return false
      },
    ).finally(() => {
      if (inFlightPayloadRef.current === payload) inFlightPayloadRef.current = null
      if (saveRevisionRef.current === revision) saveRevisionRef.current = null
      savePromiseRef.current = null
    })

    savePromiseRef.current = operation
    return { ok: await operation, revision }
  }, [reconcileExternal, showSaved, storage])

  const startDrain = useCallback((force: boolean): Promise<boolean> => {
    if (force) {
      forceDrainRef.current = true
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
    if (drainPromiseRef.current) return drainPromiseRef.current

    const drain = (async () => {
      while (dirtyRef.current) {
        if (!forceDrainRef.current && debounceRef.current !== null) return true
        const { ok, revision } = await persistOnce()
        if (!ok && revisionRef.current === revision) return false
      }
      return true
    })().finally(() => {
      forceDrainRef.current = false
      drainPromiseRef.current = null
    })
    drainPromiseRef.current = drain
    return drain
  }, [persistOnce])
  drainRef.current = startDrain

  useEffect(() => {
    mountedRef.current = true
    let live = true
    let gotUpdate = false

    const receive = (value: Notes) => {
      if (!live) return
      gotUpdate = true
      if (!readyRef.current) {
        readyRef.current = true
        textRef.current = value.text
        setText(value.text)
        setReady(true)
        return
      }
      if (sameNotes(inFlightPayloadRef.current, value)) {
        pendingExternalRef.current = null
        return
      }
      if (dirtyRef.current || focusedRef.current) {
        pendingExternalRef.current = value
        return
      }
      applyExternal(value)
    }

    const unsubscribe = storage.subscribe('notes', receive)
    void storage.get('notes').then((value) => {
      if (live && !gotUpdate) receive(value)
    })

    return () => {
      live = false
      mountedRef.current = false
      unsubscribe()
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current)
      debounceRef.current = null
      savedTimerRef.current = null

      if (!dirtyRef.current) return
      const payload: Notes = { text: textRef.current, updatedAt: Date.now() }
      const inFlightIsLatest = saveRevisionRef.current === revisionRef.current
      if (inFlightIsLatest) return
      const pending = savePromiseRef.current ?? Promise.resolve(true)
      void pending.then(() => storage.set('notes', payload)).catch(() => undefined)
    }
  }, [applyExternal, storage])

  const edit = useCallback((value: string) => {
    revisionRef.current += 1
    textRef.current = value
    dirtyRef.current = true
    setText(value)
    setDirty(true)
    setStatus('saving')
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = null
    }
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void drainRef.current(false)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const focus = useCallback(() => {
    focusedRef.current = true
  }, [])

  const blur = useCallback(() => {
    focusedRef.current = false
    reconcileExternal()
  }, [reconcileExternal])

  const flushLatest = useCallback(() => startDrain(true), [startDrain])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      void flushLatest()
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, flushLatest])

  return {
    ready,
    text,
    status,
    edit,
    focus,
    blur,
    retry: flushLatest,
    flushLatest,
  }
}
