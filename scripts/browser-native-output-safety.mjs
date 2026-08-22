import { lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_PREFIX = '.qa-browser-native-'

function comparable(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function samePath(left, right) {
  return comparable(path.resolve(left)) === comparable(path.resolve(right))
}

async function statIfPresent(target) {
  try {
    return await lstat(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export async function resolveBrowserNativeOutput({ repoRoot, protectedRoot, requested }) {
  if (!repoRoot || !protectedRoot || !requested) throw new Error('repoRoot, protectedRoot, and a nonblank requested output are required')
  const active = await realpath(repoRoot)
  const protectedCheckout = await realpath(protectedRoot)
  if (samePath(active, protectedCheckout)) throw new Error('the protected checkout cannot be an output root')

  const output = path.resolve(active, requested)
  if (!samePath(path.dirname(output), active)) throw new Error('output must be a safe direct child of the active repository')
  const name = path.basename(output)
  if (!name.startsWith(OUTPUT_PREFIX) || name.length === OUTPUT_PREFIX.length) {
    throw new Error(`output must use the ${OUTPUT_PREFIX} prefix with a nonblank suffix`)
  }
  if (samePath(output, protectedCheckout) || comparable(output).startsWith(`${comparable(protectedCheckout)}${path.sep}`)) {
    throw new Error('the protected checkout cannot contain output')
  }

  const existing = await statIfPresent(output)
  if (existing?.isSymbolicLink()) throw new Error('output cannot be a symbolic link or junction')
  if (existing && !existing.isDirectory()) throw new Error('existing output must be a directory')
  if (existing && (await readdir(output)).length > 0) throw new Error('existing output directory must be empty')
  return output
}

export async function prepareBrowserNativeOutput(options) {
  const output = await resolveBrowserNativeOutput(options)
  await mkdir(output, { recursive: true })
  const prepared = await lstat(output)
  if (prepared.isSymbolicLink() || !prepared.isDirectory()) {
    throw new Error('output must be a real directory, not a symbolic link or junction')
  }
  return output
}
