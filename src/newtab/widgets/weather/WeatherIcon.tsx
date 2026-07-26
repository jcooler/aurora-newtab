import type { WeatherIconKey } from '../../../services/weather/codes'

/** Hand-drawn two-tone line icons: structure strokes follow the theme
 *  foreground (currentColor), sun/bolt highlights follow --accent, so every
 *  theme (including Mono) keeps its own discipline. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const accent = { ...base, stroke: 'var(--accent)' } as const

const CLOUD = 'M6.5 17.5h9.5a3.5 3.5 0 0 0 .58-6.95 5 5 0 0 0-9.74 1.02A3.25 3.25 0 0 0 6.5 17.5Z'

const GLYPHS: Record<WeatherIconKey, React.ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" {...accent} />
      <path {...accent} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  'sun-cloud': (
    <>
      <circle cx="8.5" cy="8" r="3" {...accent} />
      <path {...accent} d="M8.5 2.5V4M3 8h1.5M4.6 4.1l1.1 1.1M12.4 4.1l-1.1 1.1" />
      <path {...base} d="M10 19.5h6.9a2.9 2.9 0 0 0 .48-5.76 4.3 4.3 0 0 0-8.38.88A2.7 2.7 0 0 0 10 19.5Z" />
    </>
  ),
  moon: (
    <path
      {...accent}
      d="M14.5 3.5a8 8 0 1 0 6 12.9A9 9 0 0 1 14.5 3.5Z"
    />
  ),
  'moon-cloud': (
    <>
      <path {...accent} d="M9.5 3.5a5 5 0 1 0 4.4 7.5 5.6 5.6 0 0 1-4.4-7.5Z" />
      <path {...base} d="M10 19.5h6.9a2.9 2.9 0 0 0 .48-5.76 4.3 4.3 0 0 0-8.38.88A2.7 2.7 0 0 0 10 19.5Z" />
    </>
  ),
  cloud: <path {...base} d={CLOUD} />,
  fog: (
    <>
      <g transform="translate(0 -2)">
        <path {...base} d={CLOUD} />
      </g>
      <path {...base} d="M7 19.5h10M9 22h6" opacity={0.7} />
    </>
  ),
  drizzle: (
    <>
      <g transform="translate(0 -2)">
        <path {...base} d={CLOUD} />
      </g>
      <path {...accent} d="m9.6 20 .7-1.4M13.8 20l.7-1.4" />
    </>
  ),
  rain: (
    <>
      <g transform="translate(0 -2)">
        <path {...base} d={CLOUD} />
      </g>
      <path {...accent} d="m8.5 21.5 1-2M12 22l1-2M15.5 21.5l1-2" />
    </>
  ),
  snow: (
    <>
      <g transform="translate(0 -2)">
        <path {...base} d={CLOUD} />
      </g>
      <path {...base} d="M9 18.6v2.4M7.8 19.8h2.4M14.8 20v2.4M13.6 21.2H16" opacity={0.85} />
    </>
  ),
  storm: (
    <>
      <g transform="translate(0 -2)">
        <path {...base} d={CLOUD} />
      </g>
      <path d="M13 13.5l-3.1 4.6h2.3L11 22.5l3.9-5.3h-2.4l2-3.7Z" fill="var(--accent)" stroke="none" />
    </>
  ),
}

export default function WeatherIcon({
  icon,
  size = 20,
}: {
  icon: WeatherIconKey
  size?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {GLYPHS[icon]}
    </svg>
  )
}
