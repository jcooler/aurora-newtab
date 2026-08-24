export function assertCleanTrackedStatus(status) {
  if (typeof status !== 'string' || status.trim().length > 0) {
    throw new Error('Aurora attributable builds require a clean tracked worktree')
  }
}

const EXACT_BUILD_GENERATED_EVIDENCE = new Set([
  'docs/superpowers/qa/ui-recovery/acceptance/calendar-settings-close.png',
  'docs/superpowers/qa/ui-recovery/acceptance/calendar-settings.png',
  'docs/superpowers/qa/ui-recovery/acceptance/canvas-1408x445.png',
  'docs/superpowers/qa/ui-recovery/acceptance/canvas-1600x900.png',
  'docs/superpowers/qa/ui-recovery/acceptance/evidence.json',
  'docs/superpowers/qa/ui-recovery/github-tiers/evidence.json',
  'docs/superpowers/qa/ui-recovery/github-tiers/github-compact.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/github-full.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/github-standard.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/gitlab-compact.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/gitlab-full.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/gitlab-standard.png',
])

export function assertExactBuildTrackedStatus(status) {
  if (typeof status !== 'string') {
    throw new Error('Exact-build QA requires tracked inputs to match HEAD')
  }

  const dirtyPaths = status
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((entry) => entry.slice(3).split(' -> '))
  const unexpected = dirtyPaths.filter((path) => !EXACT_BUILD_GENERATED_EVIDENCE.has(path))
  if (unexpected.length > 0) {
    throw new Error(`Exact-build QA requires tracked inputs to match HEAD: ${unexpected.join(', ')}`)
  }
}
