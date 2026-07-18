import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import packagePolicy from '../packages/utils/plugin/package-policy.ts'

const {
  formatPluginPackageViolation,
  validatePluginPackagePolicy,
} = packagePolicy

const workspaceRoot = path.resolve(import.meta.dirname, '..')
const pluginsRoot = path.join(workspaceRoot, 'plugins')
const pluginEntries = (await readdir(pluginsRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name, 'en'))

let validated = 0
const failures: string[] = []
for (const pluginEntry of pluginEntries) {
  const manifestPath = path.join(pluginsRoot, pluginEntry.name, 'manifest.json')
  let manifest: unknown
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      continue
    }
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${pluginEntry.name}: manifest unreadable: ${message}`)
    continue
  }

  const result = validatePluginPackagePolicy({
    profile: 'source-manifest',
    manifest,
  })
  if (!result.ok) {
    failures.push(
      ...result.violations.map(
        violation => `${pluginEntry.name}: ${formatPluginPackageViolation(violation)}`,
      ),
    )
    continue
  }
  validated += 1
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`✖ ${failure}`))
  process.exitCode = 1
}
else {
  console.log(`✔ ${validated} plugin manifests passed package policy`)
}
