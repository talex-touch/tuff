#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const rendererRoot = resolve(root, 'apps/core-app/src/renderer/src')

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'out', '.nuxt', '.output'])
const SOURCE_FILE = /\.(?:vue|ts)$/

const LEGACY_PRIMITIVES = new Set([
  'components/base/tuff/TButton.vue',
  'components/base/tuff/TModal.vue',
  'components/base/switch/TSwitch.vue',
  'components/base/select/TSelect.vue',
  'components/base/select/TLabelSelect.vue',
  'components/base/select/TLabelSelectItem.vue',
  'components/base/TuffIcon.vue',
])

const LEGACY_ALLOWED = new Set([
  'components/base/tuff/TButton.vue',
  'components/base/tuff/TModal.vue',
  'components/base/switch/TSwitch.vue',
  'components/base/switch/TBlockSwitch.vue',
  'components/base/select/TBlockSelect.vue',
  'components/base/select/TSelect.vue',
  'components/base/select/TLabelSelect.vue',
  'components/base/select/TLabelSelectItem.vue',
  'components/tabs/TTabs.vue',
  'components/menu/TouchMenu.vue',
  'components/menu/TouchMenuItem.vue',
])

/**
 * Walks the renderer tree with `readdirSync`, matching every other `check-*` script in this
 * directory. The original used `globby`, which is declared in no manifest in the workspace --
 * so this gate threw ERR_MODULE_NOT_FOUND on every invocation and had never once run.
 */
function findSourceFiles(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name))
      continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory())
      findSourceFiles(full, found)
    else if (SOURCE_FILE.test(entry.name))
      found.push(full)
  }
  return found
}

const files = findSourceFiles(rendererRoot)

const violations = []
const importSpecifierPattern
  = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g

function normalizeRendererPath(filePath) {
  return relative(rendererRoot, filePath).replace(/\\/g, '/')
}

function resolveImportPath(specifier, file) {
  if (specifier.startsWith('~/') || specifier.startsWith('@/')) {
    return specifier.slice(2)
  }

  if (!specifier.startsWith('.')) {
    return null
  }

  const resolved = resolve(dirname(file), specifier)
  const rel = normalizeRendererPath(resolved)
  if (rel.startsWith('..')) {
    return null
  }
  return rel
}

function importCandidates(resolvedPath) {
  if (/\.[a-z]+$/i.test(resolvedPath)) {
    return [resolvedPath]
  }
  return [`${resolvedPath}.vue`, `${resolvedPath}.ts`, `${resolvedPath}/index.ts`]
}

for (const file of files) {
  const rel = normalizeRendererPath(file)
  if (LEGACY_ALLOWED.has(rel))
    continue
  const source = readFileSync(file, 'utf8')
  const matches = source.matchAll(importSpecifierPattern)
  for (const match of matches) {
    const resolvedPath = resolveImportPath(match[1] ?? match[2], file)
    if (!resolvedPath)
      continue
    const legacyImport = importCandidates(resolvedPath).find(candidate =>
      LEGACY_PRIMITIVES.has(candidate),
    )
    if (legacyImport) {
      violations.push(`${rel}: imports ${legacyImport}`)
    }
  }
}

if (violations.length > 0) {
  console.error('CoreApp UI Contract violations:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exitCode = 1
}
