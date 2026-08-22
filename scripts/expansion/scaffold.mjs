import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveSafeExpansionOutput } from './output-safety.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const PROTECTED_ROOT = path.resolve(REPO_ROOT, '..', 'Chrome plugin')
const CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'superpowers', 'catalog', 'expansion', 'candidates.json')
const KINDS = new Set(['builtin', 'connector', 'provider'])

function pascalCase(id) {
  return id[0].toUpperCase() + id.slice(1)
}

function expectedKind(candidateKind) {
  if (candidateKind === 'browser-native' || candidateKind === 'local') return 'builtin'
  if (candidateKind === 'built-in-provider') return 'provider'
  if (candidateKind === 'connector') return 'connector'
  throw new Error(`candidate catalog has unsupported kind: ${candidateKind}`)
}

function widgetSource(pascal) {
  return `export interface ${pascal}WidgetProps {
  canvasSize?: 'compact' | 'standard' | 'full'
  docked?: boolean
}

export function ${pascal}Widget(_props: ${pascal}WidgetProps) {
  return null
}
`
}

function starterTest(subject) {
  return `import { test } from 'vitest'

test('${subject} defines its first user-visible behavior', () => {
  throw new Error('Write the first behavior test')
})
`
}

function serviceSource(id, kind) {
  const descriptor = kind === 'connector' ? 'connector' : 'provider'
  return `export const ${id}${descriptor[0].toUpperCase()}${descriptor.slice(1)}Descriptor = Object.freeze({
  id: '${id}',
  kind: '${descriptor}',
  enabled: false,
})
`
}

function settingsSource(pascal) {
  return `export function ${pascal}ConnectorSettings() {
  return null
}
`
}

function checklist(id, kind) {
  return `# ${id} integration checklist

- [ ] Replace the \`research-required\` candidate status before integration.
- [ ] Observe a focused failing behavior test before production changes.
- [ ] Confirm storage ownership, migration impact, backup behavior, and redaction.
- [ ] Confirm credentials, requested origins, held origins, and user warnings for ${kind} scope.
- [ ] Implement Compact, Standard, Full, and Docked only where each tier is useful.
- [ ] Add the identity to every current authority and visual-catalog manifest.
- [ ] Run the expansion contract, focused tests, and a scratch Chromium catalog.
- [ ] Complete one bounded review and at most one fix and rereview cycle.
- [ ] Prove active and protected repository state before pushing a checkpoint.
- [ ] Do not perform Chrome Web Store actions without a new action-specific W6-P5 approval.
`
}

function payloadsFor(candidate, label, kind) {
  const id = candidate.id
  const pascal = pascalCase(id)
  const payloads = new Map()
  payloads.set('candidate.json', `${JSON.stringify({ ...candidate, label: label.trim(), status: 'research-required' }, null, 2)}\n`)
  payloads.set(`src/newtab/widgets/${id}/${pascal}Widget.tsx`, widgetSource(pascal))
  payloads.set(`src/newtab/widgets/${id}/${pascal}Widget.test.tsx`, starterTest(`${pascal}Widget`))
  payloads.set('INTEGRATION-CHECKLIST.md', checklist(id, kind))

  if (kind === 'connector' || kind === 'provider') {
    const family = `${kind}s`
    payloads.set(`src/services/${family}/${id}.ts`, serviceSource(id, kind))
    payloads.set(`src/services/${family}/${id}.test.ts`, starterTest(`${id} ${kind}`))
  }
  if (kind === 'connector') {
    payloads.set(`src/settings/${pascal}ConnectorSettings.tsx`, settingsSource(pascal))
  }
  return new Map([...payloads].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function loadCandidate(id, catalogPath) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  const candidate = catalog.candidates?.find((entry) => entry.id === id)
  if (!candidate) throw new Error(`candidate id is unavailable in the expansion catalog: ${id}`)
  return candidate
}

export async function scaffoldAddition({
  id,
  label,
  kind,
  outDir,
  repoRoot = REPO_ROOT,
  protectedRoot = PROTECTED_ROOT,
  catalogPath = CATALOG_PATH,
}) {
  if (typeof id !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(id)) {
    throw new Error('candidate id must use lower camel case')
  }
  if (typeof label !== 'string' || label.trim().length === 0) throw new Error('label must be nonblank')
  if (!KINDS.has(kind)) throw new Error('kind must be builtin, connector, or provider')

  const candidate = await loadCandidate(id, catalogPath)
  const required = expectedKind(candidate.kind)
  if (kind !== required) throw new Error(`${id} requires ${required} scaffold kind`)

  const payloads = payloadsFor(candidate, label, kind)
  const root = await resolveSafeExpansionOutput({
    repoRoot,
    protectedRoot,
    requested: outDir,
    plannedChildren: [...payloads.keys(), 'manifest.json'],
  })

  await mkdir(root)
  const files = []
  for (const [relative, contents] of payloads) {
    const destination = path.join(root, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, contents, { encoding: 'utf8', flag: 'wx' })
    files.push({ path: relative, sha256: digest(contents) })
  }
  const manifest = { scaffoldVersion: 1, candidateId: id, kind, files }
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return { root, files }
}

function parseArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 1) {
    const [flag, inline] = args[index].split('=', 2)
    if (!['--id', '--label', '--kind', '--out-dir'].includes(flag)) {
      throw new Error(`unknown argument: ${args[index]}`)
    }
    const value = inline ?? args[++index]
    if (!value) throw new Error(`${flag} requires a value`)
    values[flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
  }
  return { ...values, repoRoot: REPO_ROOT, protectedRoot: PROTECTED_ROOT }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await scaffoldAddition(parseArgs(process.argv.slice(2)))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
