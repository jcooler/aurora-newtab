import { useEffect, useState } from 'react'

export function useNow(intervalMs = 1000, active = true): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const sample = () => setNow(new Date())
    if (!active) return
    // Activation may follow an arbitrarily long idle/paused interval. Sample
    // before installing the clock so consumers never see the mount-time Date.
    sample()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sample()
    }
    const id = setInterval(sample, intervalMs)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', sample)
    window.addEventListener('pageshow', sample)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', sample)
      window.removeEventListener('pageshow', sample)
    }
  }, [active, intervalMs])
  return now
}
