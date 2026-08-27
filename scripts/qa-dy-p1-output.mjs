import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

const PHASE_SUFFIX = Object.freeze({
  baseline: '.qa-dy-p1-baseline',
  after: '.qa-dy-p1-after',
})

function existingEntry(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export function prepareDyOutputDir(argv, repoRoot, phase) {
  const suffix = PHASE_SUFFIX[phase]
  if (!suffix) throw new Error(`unsafe DY-P1 output phase: ${phase}`)

  const root = resolve(repoRoot)
  const requested = argv.find((value) => value.startsWith('--out='))?.slice('--out='.length)
  const output = resolve(root, requested ?? suffix)
  if (dirname(output) !== root || basename(output) !== suffix) {
    throw new Error(`unsafe DY-P1 output path: ${output}`)
  }

  const existing = existingEntry(output)
  if (existing?.isSymbolicLink()) {
    throw new Error('DY-P1 output cannot be a symbolic link or junction')
  }
  if (existing && !existing.isDirectory()) {
    throw new Error('DY-P1 output must be a directory')
  }

  mkdirSync(output, { recursive: true })
  const prepared = lstatSync(output)
  if (prepared.isSymbolicLink() || !prepared.isDirectory()) {
    throw new Error('DY-P1 output must be a real directory, not a symbolic link or junction')
  }
  if (realpathSync(dirname(output)) !== realpathSync(root)) {
    throw new Error('unsafe DY-P1 output must remain a direct repository child')
  }
  return output
}

export function assertLegacyScreenshotEquality(baseline, current) {
  return baseline.map((expected) => {
    const observed = current.find((candidate) => (
      candidate.viewport.width === expected.viewport.width
      && candidate.viewport.height === expected.viewport.height
    ))
    const label = `${expected.viewport.width}x${expected.viewport.height}`
    if (!observed) throw new Error(`${label}: legacy screenshot is missing`)
    if (observed.screenshotSha256 !== expected.screenshotSha256) {
      throw new Error(`${label}: legacy screenshot changed`)
    }
    return { viewport: expected.viewport, exact: true }
  })
}
