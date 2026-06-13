#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globby } from 'globby'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const rendererRoot = resolve(root, 'apps/core-app/src/renderer/src')

const LEGACY_PRIMITIVES = new Set([
  'components/base/tuff/TButton.vue',
  'components/base/tuff/TModal.vue',
  'components/base/switch/TSwitch.vue',
  'components/base/select/TSelect.vue',
  'components/base/select/TLabelSelect.vue',
  'components/base/select/TLabelSelectItem.vue',
  'components/base/TuffIcon.vue'
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
  'components/menu/TouchMenuItem.vue'
])

const files = await globby(['**/*.{vue,ts}'], {
  cwd: rendererRoot,
  absolute: true,
  gitignore: true
})

const violations = []
const importSpecifierPattern =
  /(?:import\s+(?:type\s+)?[\s\S]*?\s+from\s*|export\s+[\s\S]*?\s+from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g

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
  if (LEGACY_ALLOWED.has(rel)) continue
  const source = readFileSync(file, 'utf8')
  const matches = source.matchAll(importSpecifierPattern)
  for (const match of matches) {
    const resolvedPath = resolveImportPath(match[1], file)
    if (!resolvedPath) continue
    const legacyImport = importCandidates(resolvedPath).find(candidate =>
      LEGACY_PRIMITIVES.has(candidate)
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
