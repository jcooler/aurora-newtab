import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_PREFIX = '.aurora-expansion-'

function comparable(value) {
  const normalized = path.resolve(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function samePath(left, right) {
  return comparable(left) === comparable(right)
}

function withinPath(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function statIfPresent(target) {
  try {
    return await lstat(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function rejectLinkedChain(root, target) {
  const relative = path.relative(root, target)
  if (relative === '') return
  let cursor = root
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment)
    const stat = await statIfPresent(cursor)
    if (!stat) return
    if (stat.isSymbolicLink()) {
      throw new Error(`output path crosses a symlink or junction: ${cursor}`)
    }
  }
}

function resolvePlannedChild(root, planned) {
  if (typeof planned !== 'string' || planned.length === 0 || path.isAbsolute(planned)) {
    throw new Error(`planned child must be a nonblank relative path: ${String(planned)}`)
  }
  const resolved = path.resolve(root, planned)
  const relative = path.relative(root, resolved)
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`planned child escapes the output root: ${planned}`)
  }
  return resolved
}

export async function resolveSafeExpansionOutput({
  repoRoot,
  requested,
  protectedRoot,
  plannedChildren = [],
  requiredPrefix = OUTPUT_PREFIX,
}) {
  if (typeof repoRoot !== 'string' || typeof requested !== 'string' || typeof protectedRoot !== 'string') {
    throw new Error('repoRoot, requested, and protectedRoot are required paths')
  }
  if (!Array.isArray(plannedChildren)) throw new Error('plannedChildren must be an array')
  if (typeof requiredPrefix !== 'string' || requiredPrefix.length === 0) {
    throw new Error('requiredPrefix must be a nonblank string')
  }

  const active = await realpath(repoRoot)
  const protectedCheckout = await realpath(protectedRoot)
  const output = path.resolve(active, requested)

  if (withinPath(protectedCheckout, active) || withinPath(protectedCheckout, output)) {
    throw new Error('protected checkout and its descendants cannot be output roots')
  }
  if (!samePath(path.dirname(output), active)) {
    throw new Error('output must be a safe direct child of the active repository')
  }

  const name = path.basename(output)
  if (!name.startsWith(requiredPrefix) || name.length === requiredPrefix.length) {
    throw new Error(`output must use the ${requiredPrefix} prefix with a nonblank suffix`)
  }

  await rejectLinkedChain(active, output)
  const outputStat = await statIfPresent(output)
  if (outputStat) {
    if (outputStat.isSymbolicLink()) throw new Error('output cannot be a symlink or junction')
    if (!outputStat.isDirectory()) throw new Error('existing output must be a directory')
  }

  const resolvedChildren = plannedChildren.map((child) => ({ child, resolved: resolvePlannedChild(output, child) }))
  const unique = new Set()
  for (const { child, resolved } of resolvedChildren) {
    const key = comparable(resolved)
    if (unique.has(key)) throw new Error(`planned child collision: ${child}`)
    unique.add(key)
    await rejectLinkedChain(output, resolved)
    if (await statIfPresent(resolved)) throw new Error(`planned child collision: ${child}`)
  }

  if (outputStat && (await readdir(output)).length > 0) {
    throw new Error('existing output directory must be empty')
  }

  return output
}
