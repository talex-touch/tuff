import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(pluginRoot, '..', '..')

const sourceDir = path.join(pluginRoot, 'dist', 'build')
const targetDir = path.join(
  repoRoot,
  'apps/core-app/tuff/modules/plugins/clipboard-history',
)

await rm(targetDir, { recursive: true, force: true })
await mkdir(path.dirname(targetDir), { recursive: true })
await cp(sourceDir, targetDir, { recursive: true })

console.log(`[clipboard-history] synced built-in fallback -> ${targetDir}`)
