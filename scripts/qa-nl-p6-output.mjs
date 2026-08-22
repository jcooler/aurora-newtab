import { lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

export function resolveQaOutputDir(argv, cwd) {
  const raw = argv.find((arg) => arg.startsWith('--out-dir='))?.slice('--out-dir='.length)
  if (!raw) throw new Error('NL-P6 --out-dir scratch output is required')

  const output = resolve(cwd, raw)
  const root = resolve(cwd)
  const name = basename(output)
  if (dirname(output) !== root || !/^\.qa-nl-p6-[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error('NL-P6 --out-dir must be a .qa-nl-p6-* scratch output')
  }
  return output
}

export function prepareQaOutputDir(argv, cwd, { empty = false } = {}) {
  const output = resolveQaOutputDir(argv, cwd)
  let existing = null
  try {
    existing = lstatSync(output)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  if (existing?.isSymbolicLink()) {
    throw new Error('NL-P6 scratch output cannot be a symbolic link or junction')
  }
  if (existing && !existing.isDirectory()) {
    throw new Error('NL-P6 scratch output must be a directory')
  }
  if (empty && existing) rmSync(output, { recursive: true, force: true })

  mkdirSync(output, { recursive: true })
  const prepared = lstatSync(output)
  if (prepared.isSymbolicLink() || !prepared.isDirectory()) {
    throw new Error('NL-P6 scratch output must be a real directory, not a symbolic link or junction')
  }
  if (realpathSync(dirname(output)) !== realpathSync(resolve(cwd))) {
    throw new Error('NL-P6 scratch output must remain a direct repository child')
  }
  return output
}
