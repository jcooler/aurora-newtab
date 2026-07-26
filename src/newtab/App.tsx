import { useEffect } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'
import Background from './components/Background'
import Clock from './components/Clock'
import Greeting from './components/Greeting'
import FocusLine from './components/FocusLine'

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
      <div className="flex flex-col items-center">
        <Clock />
        <Greeting />
        <FocusLine />
      </div>
    </main>
  )
}
