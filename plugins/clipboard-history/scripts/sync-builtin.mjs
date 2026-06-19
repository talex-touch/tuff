import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(pluginRoot, '..', '..')

const sourceDir = path.join(pluginRoot, 'dist', 'build')
const builtInTargetDir = path.join(
  repoRoot,
  'apps/core-app/tuff/modules/plugins/clipboard-history',
)

function uniq(values) {
  return [...new Set(values.filter(Boolean))]
}

async function exists(targetPath) {
  try {
    await stat(targetPath)
    return true
  }
  catch {
    return false
  }
}

function getAppDataRoots() {
  if (process.platform === 'darwin') {
    return [path.join(os.homedir(), 'Library/Application Support')]
  }

  if (process.platform === 'win32') {
    return [process.env.APPDATA]
  }

  return [process.env.XDG_CONFIG_HOME, path.join(os.homedir(), '.config')]
}

function getDevTargetCandidates() {
  const explicitTarget = process.env.TUFF_CLIPBOARD_HISTORY_DEV_PLUGIN_DIR?.trim()
  const appDataRoots = getAppDataRoots()

  return uniq([
    explicitTarget,
    ...appDataRoots.map(root =>
      root
        ? path.join(
            root,
            '@talex-touch/core-app/tuff-dev/modules/plugins/clipboard-history',
          )
        : '',
    ),
    ...appDataRoots.map(root =>
      root
        ? path.join(
            root,
            '@talex-touch/tuff-dev/tuff-dev/modules/plugins/clipboard-history',
          )
        : '',
    ),
  ])
}

async function syncCleanTarget(targetDir) {
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  await cp(sourceDir, targetDir, { recursive: true })
}

async function syncRuntimeTarget(targetDir) {
  const entries = await readdir(sourceDir)

  await mkdir(targetDir, { recursive: true })
  for (const entry of entries) {
    await rm(path.join(targetDir, entry), { recursive: true, force: true })
  }

  await cp(sourceDir, targetDir, { recursive: true })
}

await syncCleanTarget(builtInTargetDir)

console.log(`[clipboard-history] synced built-in fallback -> ${builtInTargetDir}`)

for (const targetDir of getDevTargetCandidates()) {
  const explicit = targetDir === process.env.TUFF_CLIPBOARD_HISTORY_DEV_PLUGIN_DIR?.trim()
  if (!explicit && !(await exists(targetDir))) {
    continue
  }

  await syncRuntimeTarget(targetDir)
  console.log(`[clipboard-history] synced dev runtime plugin -> ${targetDir}`)
}
