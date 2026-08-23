const SAFE_IDENTIFIER = /^[a-z][A-Za-z0-9]*$/
const SAFE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const duplicateValues = (values) => {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

export function validateCatalogModel({ sourceIds, targets, legacyTargetMap, mixedStacks }) {
  const errors = []
  const sourceSet = new Set(sourceIds)
  const targetIds = targets.map(({ id }) => id)
  const targetById = new Map(targets.map((entry) => [entry.id, entry]))

  for (const id of duplicateValues(sourceIds)) errors.push(`duplicate declared source: ${id}`)
  for (const id of duplicateValues(targetIds)) errors.push(`duplicate target identity: ${id}`)

  const ownedSources = targets.flatMap(({ id, sourceIds: owned }) => owned.map((sourceId) => ({ id, sourceId })))
  for (const sourceId of duplicateValues(ownedSources.map(({ sourceId }) => sourceId))) {
    errors.push(`duplicate source ownership: ${sourceId}`)
  }
  for (const { id, sourceId } of ownedSources) {
    if (!sourceSet.has(sourceId)) errors.push(`unknown source ${sourceId} owned by ${id}`)
  }
  for (const sourceId of sourceIds) {
    if (!ownedSources.some((owned) => owned.sourceId === sourceId)) errors.push(`uncovered source: ${sourceId}`)
  }

  for (const target of targets) {
    if (!SAFE_IDENTIFIER.test(target.id)) errors.push(`unsafe target id: ${target.id}`)
    if (!target.tiers.includes(target.primaryTier)) errors.push(`${target.id} primary tier ${target.primaryTier} is unsupported`)
    for (const tier of target.stackTiers) {
      if (tier === 'docked' || !target.tiers.includes(tier)) errors.push(`${target.id} invalid stack tier: ${tier}`)
    }
    for (const tier of target.tiers) {
      const budget = target.budgets[tier]
      if (!budget?.purpose || budget.essential.length === 0 || budget.signature.length === 0) {
        errors.push(`${target.id} ${tier} information budget is incomplete`)
      }
    }
  }

  for (const [sourceId, targetId] of Object.entries(legacyTargetMap)) {
    if (!sourceSet.has(sourceId)) errors.push(`legacy mapping source is unknown: ${sourceId}`)
    if (!targetById.has(targetId)) errors.push(`legacy mapping target is unknown: ${targetId}`)
  }

  for (const stack of mixedStacks) {
    if (!SAFE_SEGMENT.test(stack.id)) errors.push(`unsafe mixed stack id: ${stack.id}`)
    if (!Array.isArray(stack.members) || stack.members.length < 2) errors.push(`${stack.id} needs at least two members`)
    for (const member of stack.members) {
      const target = targetById.get(member)
      if (!target) errors.push(`${stack.id} has unknown member ${member}`)
      else if (!target.stackTiers.includes(stack.tier)) errors.push(`${member} does not support mixed stack tier ${stack.tier}`)
    }
  }

  return errors
}

const capture = (input) => Object.freeze(input)

export function expectedCatalogCaptures({ targets, mixedStacks }) {
  const captures = []
  for (const target of targets) {
    for (const tier of target.tiers) {
      captures.push(capture({
        key: `${target.id}-${tier}-ready-dark`,
        kind: tier === 'docked' ? 'docked' : 'free',
        widget: target.id,
        tier,
        state: 'ready',
        theme: 'dark',
      }))
    }
    for (const theme of ['light', 'pink']) {
      captures.push(capture({
        key: `${target.id}-${target.primaryTier}-ready-${theme}`,
        kind: 'theme',
        widget: target.id,
        tier: target.primaryTier,
        state: 'ready',
        theme,
      }))
    }
    for (const state of target.states) {
      captures.push(capture({
        key: `${target.id}-${target.primaryTier}-${state}-dark`,
        kind: 'state',
        widget: target.id,
        tier: target.primaryTier,
        state,
        theme: 'dark',
      }))
    }
    for (const tier of target.stackTiers) {
      captures.push(capture({
        key: `${target.id}-${tier}-stack-ready-dark`,
        kind: 'stack-face',
        widget: target.id,
        tier,
        state: 'ready',
        theme: 'dark',
      }))
    }
  }

  for (const stack of mixedStacks) {
    captures.push(capture({
      key: `mixed-stack-${stack.id}`,
      kind: 'mixed-stack',
      widget: stack.members[0],
      members: stack.members,
      tier: stack.tier,
      state: 'ready',
      theme: 'dark',
    }))
  }

  captures.push(capture({
    key: 'comparison-calendar-standard-agenda-month',
    kind: 'comparison',
    widget: 'calendar',
    tier: 'standard',
    state: 'ready',
    theme: 'dark',
    views: ['agenda', 'month'],
  }))
  captures.push(capture({
    key: 'migration-calendar-consolidation',
    kind: 'migration',
    widget: 'calendar',
    tier: 'standard',
    state: 'ready',
    theme: 'dark',
  }))
  for (const interaction of ['hover', 'focus', 'plain-click', 'swipe']) {
    captures.push(capture({
      key: `interaction-clock-compact-${interaction}`,
      kind: 'interaction',
      interaction,
      widget: 'clock',
      tier: 'compact',
      state: 'ready',
      theme: 'dark',
    }))
  }

  const duplicates = duplicateValues(captures.map(({ key }) => key))
  if (duplicates.length > 0) throw new Error(`duplicate capture keys: ${duplicates.join(', ')}`)
  return Object.freeze(captures)
}
