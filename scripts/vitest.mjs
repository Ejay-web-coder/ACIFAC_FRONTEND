// Starts Vitest from the project's real path. Run: npm test   One module: npm test -- test/login
//
// On Windows a terminal opened at "c:\..." (lowercase drive letter, as VS Code
// passes the folder) starts Vitest as c:/... while Vitest resolves the test
// files under the real path C:/..., so Node loads two copies of Vitest and
// every test file fails with "Vitest failed to find the current suite".
// Starting it from the real path keeps one copy.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })
process.exit(result.status ?? 1)
