export function assertCleanTrackedStatus(status) {
  if (typeof status !== 'string' || status.trim().length > 0) {
    throw new Error('Aurora attributable builds require a clean tracked worktree')
  }
}
