import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { assertCleanTrackedStatus } from './build-contracts.mjs'

assertCleanTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const mode = process.argv.find((argument) => argument.startsWith('--mode='))?.slice('--mode='.length)
const env = { ...process.env, AURORA_BUILD_COMMIT: commit }

execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit'], { stdio: 'inherit', env })
execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', ...(mode ? ['--mode', mode] : [])], { stdio: 'inherit', env })
