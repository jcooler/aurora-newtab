import { useEffect, useRef } from 'react'

const CREEK_VOLUME = 0.35

export default function FlowAmbience({
  enabled,
  running,
}: {
  enabled: boolean
  running: boolean
}) {
  return enabled ? <CreekAmbience running={running} /> : null
}

function CreekAmbience({ running }: { running: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = CREEK_VOLUME
    if (running) {
      void audio.play().catch(() => {
        // Chrome can decline playback until the user next interacts with the
        // page. Pause/resume remains the explicit retry gesture.
      })
      return
    }
    audio.pause()
  }, [running])

  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  return <audio ref={audioRef} src="/sounds/creek.ogg" preload="auto" loop aria-hidden="true" />
}
