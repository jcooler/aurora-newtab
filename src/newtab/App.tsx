import { useEffect } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'

export default function App() {
  const [settings] = useStoredKey('settings')

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  if (!settings) return null
  return (
    <main
      className="flex h-screen items-center justify-center text-fg"
      style={{ background: 'var(--bg-fallback)' }}
    >
      <h1 className="text-2xl font-light tracking-[0.3em]">AURORA</h1>
    </main>
  )
}
