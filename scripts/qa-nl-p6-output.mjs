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
