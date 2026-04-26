import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(pluginRoot, '..', '..')

const targets = [
  path.join(pluginRoot, 'dist', 'build'),
  path.join(repoRoot, 'apps/core-app/tuff/modules/plugins/clipboard-history'),
]

const forbidden = [
  'clipboard:get-history',
  'clipboard:get-image-url',
  'system:get-active-app',
]

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

for (const target of targets) {
  const files = await collectFiles(target)

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const needle of forbidden) {
      if (content.includes(needle)) {
        throw new Error(`legacy raw channel found: ${needle} in ${file}`)
      }
    }
  }
}

console.log('[clipboard-history] no legacy raw channel strings found in build outputs')
