const mergeUnique = (primary = [], supplemental = [], identity) => {
  const merged = new Map(primary.map((entry) => [identity(entry), entry]))
  for (const entry of supplemental) merged.set(identity(entry), entry)
  return [...merged.values()]
}

export const mergeInformationFirstEvidence = (primary, supplemental) => {
  if (!primary) return supplemental ?? null
  if (!supplemental || supplemental.error) return primary

  return {
    ...primary,
    states: mergeUnique(primary.states, supplemental.states, (entry) => `${entry.viewport}:${entry.state}`),
    deepInteractions: mergeUnique(primary.deepInteractions, supplemental.deepInteractions, (entry) => entry.viewport),
    weatherCorners: mergeUnique(primary.weatherCorners, supplemental.weatherCorners, (entry) => entry.label),
    connectorSizes: mergeUnique(primary.connectorSizes, supplemental.connectorSizes, (entry) => `${entry.id}:${entry.size}`),
    connectorStates: mergeUnique(primary.connectorStates, supplemental.connectorStates, (entry) => `${entry.id}:${entry.state}`),
    runtimeErrors: [...new Set([...(primary.runtimeErrors ?? []), ...(supplemental.runtimeErrors ?? [])])],
    failedRequests: [...new Set([...(primary.failedRequests ?? []), ...(supplemental.failedRequests ?? [])])],
    unexpectedExternalRequests: [...new Set([...(primary.unexpectedExternalRequests ?? []), ...(supplemental.unexpectedExternalRequests ?? [])])],
    expectedFixtureRequests: [...new Set([...(primary.expectedFixtureRequests ?? []), ...(supplemental.expectedFixtureRequests ?? [])])],
  }
}
