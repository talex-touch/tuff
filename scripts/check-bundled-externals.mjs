#!/usr/bin/env node
/**
 * Every bare import that survives into a published bundle must be declared by the package that
 * ships it.
 *
 * `@talex-touch/tuff-cli` bundles `@talex-touch/tuff-cli-core` (it is in tsup's `noExternal`) but
 * keeps `glob` external, so the emitted chunk carries `import … from 'glob'` at runtime.
 * `tuff-cli-core` declares `glob` correctly — but it is a *devDependency* of `tuff-cli`, so that
 * declaration does not follow the code into `dist/`. Nothing in `tuff-cli`'s own manifest mentioned
 * `glob`, and the Windows production gate failed on every PR with `ERR_MODULE_NOT_FOUND` (#1509).
 *
 * It reads the built artifact rather than the tsup config on purpose. `external` also lists
 * `rollup` (never imported) and ~20 optional template engines that only `@vue/compiler-sfc`
 * reaches dynamically. A config-based check would demand declarations for all of them; the bundle
 * names only what is actually required.
 *
 * Read-only. `--self-test` proves the detector fires, because "every import is declared" looks the
 * same whether the check works or matched nothing at all.
 */

import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

/** Packages whose bundles are published and therefore have to stand on their own manifest. */
const TARGETS = [{ name: '@talex-touch/tuff-cli', dir: 'packages/tuff-cli' }]

const BUILTINS = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])

const STATIC_IMPORT = /(?:from|import)\s*["']([^"']+)["']/g
const REQUIRE_CALL = /require\(\s*["']([^"']+)["']\s*\)/g

/** `@scope/name/sub` -> `@scope/name`, `name/sub` -> `name`. */
function toPackageName(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function isBare(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/'))
    return false
  // Template-literal fragments of a dynamic import, e.g. `${args.path}` — not a package.
  if (specifier.includes('${'))
    return false
  return !BUILTINS.has(specifier)
}

function collectSpecifiers(read, files) {
  const found = new Map()
  for (const file of files) {
    const source = read(file)
    if (!source)
      continue
    for (const pattern of [STATIC_IMPORT, REQUIRE_CALL]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]
        if (!isBare(specifier))
          continue
        const name = toPackageName(specifier)
        if (!found.has(name))
          found.set(name, file)
      }
    }
  }
  return found
}

function listDistFiles(dir) {
  if (!fs.existsSync(dir))
    return []
  return fs
    .readdirSync(dir, { recursive: true })
    .map(entry => String(entry))
    .filter(entry => entry.endsWith('.js') || entry.endsWith('.cjs') || entry.endsWith('.mjs'))
}

function declaredNames(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])
}

function selfTest() {
  const declared = new Set(['glob', '@talex-touch/utils'])
  const cases = [
    {
      name: 'an undeclared runtime import is caught',
      source: 'import { globSync } from \'unlisted-pkg\'\n',
      expectMissing: ['unlisted-pkg'],
    },
    {
      name: 'a declared import is allowed',
      source: 'import { globSync } from \'glob\'\n',
      expectMissing: [],
    },
    {
      name: 'a subpath resolves to its package',
      source: 'import x from \'@talex-touch/utils/plugin/sdk\'\n',
      expectMissing: [],
    },
    {
      name: 'node builtins are not packages',
      source: 'import fs from \'node:fs\'\nimport path from \'path\'\n',
      expectMissing: [],
    },
    {
      name: 'relative imports are not packages',
      source: 'import x from \'./chunk-ABC.js\'\n',
      expectMissing: [],
    },
    {
      name: 'a template-literal dynamic import is not a package',
      // The fixture *is* the literal text a bundler emits for a dynamic import; interpolating it
      // here would defeat the case.
      // eslint-disable-next-line no-template-curly-in-string
      source: 'await import(`${args.path}`)\n',
      expectMissing: [],
    },
    {
      name: 'require() is scanned too',
      source: 'const y = require(\'another-unlisted\')\n',
      expectMissing: ['another-unlisted'],
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const found = collectSpecifiers(() => testCase.source, ['fixture.js'])
    const missing = [...found.keys()].filter(name => !declared.has(name))
    const ok = JSON.stringify(missing) === JSON.stringify(testCase.expectMissing)
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!ok) {
      failures += 1
      console.log(`     expected ${JSON.stringify(testCase.expectMissing)}, got ${JSON.stringify(missing)}`)
    }
  }
  return failures
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

let hasErrors = false

for (const target of TARGETS) {
  const packageDir = path.join(rootDir, target.dir)
  const distDir = path.join(packageDir, 'dist')
  const files = listDistFiles(distDir)

  if (files.length === 0) {
    console.error(
      `[bundled-externals] ${target.name}: no build output in ${target.dir}/dist — run its build first`,
    )
    hasErrors = true
    continue
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'))
  const declared = declaredNames(manifest)
  const found = collectSpecifiers(
    file => fs.readFileSync(path.join(distDir, file), 'utf-8'),
    files,
  )
  const missing = [...found.entries()].filter(([name]) => !declared.has(name))

  if (missing.length > 0) {
    hasErrors = true
    console.error(`[bundled-externals] ${target.name} imports packages it does not declare:\n`)
    for (const [name, file] of missing) {
      console.error(`  - ${name}  (first seen in dist/${file})`)
    }
    console.error(
      '\nThe bundle keeps these as runtime imports, so an install of this package alone cannot'
      + '\nresolve them. Add each to "dependencies" — a declaration on a workspace package that is'
      + '\nonly a devDependency here does not follow the code into dist/.',
    )
    continue
  }

  console.log(
    `[bundled-externals] ${target.name}: ${found.size} bundled import(s), all declared`,
  )
}

if (hasErrors)
  process.exit(1)
