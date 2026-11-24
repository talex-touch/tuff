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
const builtInTargetDirs = [
  path.join(repoRoot, 'apps/core-app/tuff/modules/plugins/clipboard-history'),
  path.join(repoRoot, 'apps/core-app/resources/bundled-plugins/clipboard-history'),
]

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

function shouldSyncExternalTargets() {
  return (
    process.env.TUFF_CLIPBOARD_HISTORY_SYNC_EXTERNAL === '1'
    || process.argv.includes('--external')
    || Boolean(process.env.TUFF_CLIPBOARD_HISTORY_DEV_PLUGIN_DIR?.trim())
  )
}

function getExternalTargetCandidates() {
  const explicitTarget = process.env.TUFF_CLIPBOARD_HISTORY_DEV_PLUGIN_DIR?.trim()
  if (
    process.env.TUFF_CLIPBOARD_HISTORY_SYNC_EXTERNAL !== '1'
    && !process.argv.includes('--external')
  ) {
    return explicitTarget ? [explicitTarget] : []
  }

  const appDataRoots = getAppDataRoots()

  return uniq([
    explicitTarget,
    '/Applications/Tuff.app/Contents/Resources/bundled-plugins/clipboard-history',
    ...appDataRoots.map(root =>
      root
        ? path.join(
            root,
            '@talex-touch/core-app/tuff/modules/plugins/clipboard-history',
          )
        : '',
    ),
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

// Runtime-owned entries inside an installed plugin dir (see TouchPlugin.getRuntimeLogsPath).
const RUNTIME_OWNED_ENTRIES = new Set(['logs'])

async function syncRuntimeTarget(targetDir) {
  await mkdir(targetDir, { recursive: true })
  // Drop every stale entry (not only those present in the build), so leftovers such as an
  // old package.json cannot trip the core-app runtime drift preflight.
  for (const entry of await readdir(targetDir)) {
    if (RUNTIME_OWNED_ENTRIES.has(entry)) {
      continue
    }
    await rm(path.join(targetDir, entry), { recursive: true, force: true })
  }

  await cp(sourceDir, targetDir, { recursive: true })
}

for (const targetDir of builtInTargetDirs) {
  await syncCleanTarget(targetDir)
  console.log(`[clipboard-history] synced built-in fallback -> ${targetDir}`)
}

if (shouldSyncExternalTargets()) {
  for (const targetDir of getExternalTargetCandidates()) {
    const explicit = targetDir === process.env.TUFF_CLIPBOARD_HISTORY_DEV_PLUGIN_DIR?.trim()
    if (!explicit && !(await exists(targetDir))) {
      continue
    }

    await syncRuntimeTarget(targetDir)
    console.log(`[clipboard-history] synced dev runtime plugin -> ${targetDir}`)
  }
}
