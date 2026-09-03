import { expect, it } from 'vitest'

import { CONNECTOR_IDS } from '../../services/connectors/types'
import { CONNECTOR_BODY_IDS } from './Connectors'

it('keeps one Settings body for every implemented connector editor', () => {
  expect(CONNECTOR_BODY_IDS).toEqual(CONNECTOR_IDS)
  expect(new Set(CONNECTOR_BODY_IDS).size).toBe(CONNECTOR_BODY_IDS.length)
})
