import { join } from 'node:path'

const viewport = (width, height) => Object.freeze({ width, height, deviceScaleFactor: 1 })

export const COMMON_DISPLAY_VIEWPORTS = Object.freeze([
  viewport(320, 568), viewport(360, 800), viewport(375, 812), viewport(390, 844), viewport(412, 915),
  viewport(768, 1024), viewport(820, 1180), viewport(1024, 600), viewport(1024, 768),
  viewport(1280, 720), viewport(1280, 800), viewport(1280, 1024), viewport(1366, 768), viewport(1440, 900), viewport(1536, 864),
  viewport(1600, 900), viewport(1920, 1080), viewport(1920, 1200), viewport(2560, 1440), viewport(2560, 1600),
  viewport(2560, 1080), viewport(3440, 1440), viewport(3840, 2160),
])

export const COMMON_DISPLAY_STATES = Object.freeze([
  'information-rich-canvas',
  'settings-widgets',
  'settings-connectors',
  'weather-top-right-expanded',
  'arrange-small-inspector',
])

const byLabel = new Map(COMMON_DISPLAY_VIEWPORTS.map((item) => [`${item.width}x${item.height}`, item]))
export const viewportLabel = ({ width, height }) => `${width}x${height}`

export const DEEP_INTERACTION_VIEWPORTS = Object.freeze([
  '375x812', '1024x768', '1366x768', '1920x1080', '3440x1440', '3840x2160',
].map((label) => byLabel.get(label)))

export const WEATHER_CORNER_CASES = Object.freeze([
  Object.freeze({ corner: 'top-left', viewport: byLabel.get('390x844'), x: 31, y: 8 }),
  Object.freeze({ corner: 'top-right', viewport: byLabel.get('1920x1080'), x: 92, y: 8 }),
  Object.freeze({ corner: 'bottom-left', viewport: byLabel.get('390x844'), x: 31, y: 92 }),
  Object.freeze({ corner: 'bottom-right', viewport: byLabel.get('1920x1080'), x: 92, y: 92 }),
])

export function commonDisplayPath(root, item, state) {
  return join(root, 'common', viewportLabel(item), `${state}.png`)
}

export function expectedCommonDisplayPaths(root) {
  return COMMON_DISPLAY_VIEWPORTS.flatMap((item) => (
    COMMON_DISPLAY_STATES.map((state) => commonDisplayPath(root, item, state))
  ))
}

export const OWNER_CAPTURE_PATHS = Object.freeze([
  join('common', '375x812', 'information-rich-canvas.png'),
  join('common', '1024x768', 'settings-widgets.png'),
  join('common', '1366x768', 'settings-connectors.png'),
  join('common', '1920x1080', 'weather-top-right-expanded.png'),
  join('common', '1920x1080', 'arrange-small-inspector.png'),
  join('common', '2560x1440', 'information-rich-canvas.png'),
  join('common', '3440x1440', 'information-rich-canvas.png'),
  join('common', '3840x2160', 'information-rich-canvas.png'),
])
