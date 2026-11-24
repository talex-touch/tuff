import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(pluginRoot, '..', '..')

const requiredTargets = [
  path.join(pluginRoot, 'dist', 'build'),
]

const optionalTargets = [
  path.join(repoRoot, 'apps/core-app/tuff/modules/plugins/clipboard-history'),
]

const forbidden = [
  'clipboard:get-history',
  'clipboard:get-image-url',
  'system:get-active-app',
]

async function exists(targetPath) {
  try {
    await stat(targetPath)
    return true
  }
  catch {
    return false
  }
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(nextPath)))
      continue
    }

    if (/\.(js|json|html|css)$/i.test(entry.name)) {
      files.push(nextPath)
    }
  }

  return files
}

const targets = [...requiredTargets]
for (const optionalTarget of optionalTargets) {
  if (await exists(optionalTarget)) {
    targets.push(optionalTarget)
  }
}

for (const target of targets) {
  const files = await collectFiles(target)

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const needle of forbidden) {
      if (content.includes(needle)) {
        throw new Error(`forbidden raw channel found: ${needle} in ${file}`)
      }
    }
  }
}

console.log('[clipboard-history] no forbidden raw channel strings found in build outputs')
