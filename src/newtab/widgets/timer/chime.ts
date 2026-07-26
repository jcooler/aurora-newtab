/** Two-note soft bell via WebAudio — no bundled asset, respects nothing
 *  itself: callers must check settings.muted before invoking. */
export function playChime(): void {
  const ctx = new AudioContext()
  const play = (freq: number, at: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 1.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + at)
    osc.stop(ctx.currentTime + at + 1.3)
  }
  play(880, 0)
  play(660, 0.35)
  setTimeout(() => void ctx.close(), 2000)
}
