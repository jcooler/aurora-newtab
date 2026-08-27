import type { WidgetTier } from '../../lib/layout/namedLayouts'
import type { BlockId } from '../../lib/layout/types'
import { WIDGET_PRESENTATION_CONTRACTS } from '../widgetSizeContracts'

const ORDERED_TIERS: readonly WidgetTier[] = ['compact', 'standard', 'full']

export interface StackCompatibility {
  compatible: boolean
  storedTier: WidgetTier
  commonTiers: readonly WidgetTier[]
  incompatibleMembers: readonly BlockId[]
}

export function commonStackTiers(memberIds: readonly BlockId[]): readonly WidgetTier[] {
  if (memberIds.length === 0) return []
  return ORDERED_TIERS.filter((tier) => memberIds.every((id) => (
    WIDGET_PRESENTATION_CONTRACTS[id].stackSizes.includes(tier)
  )))
}

export function canJoinStackAtTier(
  sourceId: BlockId,
  memberIds: readonly BlockId[],
  tier: WidgetTier,
): boolean {
  return commonStackTiers([...memberIds, sourceId]).includes(tier)
}

export function stackCompatibility(
  memberIds: readonly BlockId[],
  storedTier: WidgetTier,
): StackCompatibility {
  const commonTiers = commonStackTiers(memberIds)
  const incompatibleMembers = memberIds.filter((id) => (
    !WIDGET_PRESENTATION_CONTRACTS[id].stackSizes.includes(storedTier)
  ))
  return {
    compatible: incompatibleMembers.length === 0,
    storedTier,
    commonTiers,
    incompatibleMembers,
  }
}
