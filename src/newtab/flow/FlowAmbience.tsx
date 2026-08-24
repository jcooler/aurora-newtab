import { useEffect, useRef } from 'react'
import type { FlowAmbience as FlowAmbienceChoice } from '../../lib/storage/schema'

const SOUND_SOURCES: Record<Exclude<FlowAmbienceChoice, 'off'>, string> = {
  creek: '/sounds/creek.ogg',
  rain: '/sounds/rain.ogg',
  ocean: '/sounds/ocean.ogg',
  forest: '/sounds/forest.wav',
}

export default function FlowAmbience({
  sound,
  volume,
  running,
}: {
  sound: FlowAmbienceChoice
  volume: number
  running: boolean
}) {
  return sound === 'off'
    ? null
    : <AmbiencePlayer key={sound} src={SOUND_SOURCES[sound]} volume={volume} running={running} />
}

function AmbiencePlayer({
  src,
  volume,
  running,
}: {
  src: string
  volume: number
  running: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Math.min(1, Math.max(0, volume / 100))
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
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

  return <audio ref={audioRef} src={src} preload="auto" loop aria-hidden="true" />
}
