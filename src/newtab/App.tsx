import { useEffect } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'
import Background from './components/Background'

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  if (!settings || !photoPrefs) return null
  return (
    <main className="relative flex h-screen items-center justify-center text-fg">
      <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} />
      <h1 className="text-2xl font-light tracking-[0.3em]">AURORA</h1>
    </main>
  )
}
