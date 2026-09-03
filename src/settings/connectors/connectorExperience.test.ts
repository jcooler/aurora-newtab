import { describe, expect, it } from 'vitest'
import { CONNECTORS } from '../../services/connectors/registry'
import { CATEGORY_LABELS, CONNECTOR_IDS } from '../../services/connectors/types'
import { connectorExperience } from './connectorExperience'

describe('connectorExperience', () => {
  it('gives every registered connector complete customer-facing presentation with one explicit premium connector', () => {
    expect(CONNECTORS.map((descriptor) => descriptor.id)).toEqual(CONNECTOR_IDS)

    for (const descriptor of CONNECTORS) {
      const experience = connectorExperience(descriptor)
      expect(experience.mark.trim().length).toBeGreaterThan(0)
      expect(experience.outcome.trim().length).toBeGreaterThan(20)
      expect(experience.benefits).toHaveLength(3)
      expect(experience.benefits.every((benefit) => benefit.trim().length > 8)).toBe(true)
      expect(experience.privacySummary.trim().length).toBeGreaterThan(20)
      expect(experience.categoryLabel).toBe(CATEGORY_LABELS[descriptor.category])
      expect(experience.entitlement).toBe(
        descriptor.id === 'googleCalendar' || descriptor.id === 'microsoftCalendar' ? 'premium' : 'included',
      )
    }
  })

  it('uses short marks that remain legible inside compact icon tiles', () => {
    for (const descriptor of CONNECTORS) {
      expect([...connectorExperience(descriptor).mark].length).toBeLessThanOrEqual(3)
    }
  })
})
