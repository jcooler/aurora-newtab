import { TARGET_WIDGETS } from '../catalog-model.mjs'
import { renderCalendarSkyWidget } from './calendar-sky.mjs'
import { renderCoreWidget } from './core.mjs'
import { renderResourceWidget } from './resources.mjs'
import { renderWorkWidget } from './work.mjs'

const targets = new Map(TARGET_WIDGETS.map((target) => [target.id, target]))

export function renderWidgetFace(capture, fixture) {
  const target = targets.get(capture.id)
  if (!target) throw new Error(`Unsupported widget identity: ${capture.id}`)
  if (!target.tiers.includes(capture.tier)) throw new Error(`Unsupported tier ${capture.tier} for ${capture.id}`)
  if (target.family === 'core') return renderCoreWidget(capture, fixture)
  if (target.family === 'calendar-sky') return renderCalendarSkyWidget(capture, fixture)
  if (target.family === 'work') return renderWorkWidget(capture, fixture)
  if (target.family === 'resources') return renderResourceWidget(capture, fixture)
  throw new Error(`Renderer not implemented for ${capture.id}`)
}
