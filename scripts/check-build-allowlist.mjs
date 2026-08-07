#!/usr/bin/env node
/**
 * Guards `pnpm.onlyBuiltDependencies` in the root package.json.
 *
 * Allowlisting a package lets it execute code at install time, so the list has to stay
 * exactly as large as it needs to be. Two ways it rots:
 *
 *   1. an entry outlives the dependency that needed it, leaving a name that would silently
 *      re-grant install-time execution the day something pulls that name back in;
 *   2. a new dependency arrives with an install script and gets allowlisted to unblock CI,
 *      with no record of what it runs or who needs it.
 *
 * This check is read-only. It fails when the allowlist and REVIEWED disagree, when an
 * allowlisted package is absent from the installed tree, or when an installed package runs
 * install scripts without being reviewed.
 *
 * Requires a completed install; run it after `pnpm install`.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = path.join(ROOT, 'node_modules', '.pnpm')

/**
 * Every allowlisted package, with the workspace capability that needs it and what its
 * install step actually does. Adding an entry here is the review — keep the reason
 * specific enough that a later reader can tell whether it still applies.
 */
const REVIEWED = {
  '@google/genai': 'Pulled in by @earendil-works/pi-ai (the pi provider). preinstall + prepare.',
  '@parcel/watcher': 'Native file watcher behind sass and listhen. install builds the addon.',
  '@sentry/cli': 'Pulled in by @sentry/bundler-plugin-core. postinstall downloads the CLI binary.',
  '@talex-touch/tuff-native':
    'Workspace native addon (OCR, screenshot, Everything). gypfile: true, so pnpm treats it as a build target.',
  'better-sqlite3': 'apps/nexus devDependency. install compiles the SQLite binding.',
  'bufferutil': 'apps/core-app optionalDependency. install compiles the ws speedup.',
  'electron': 'Root and apps/core-app. postinstall downloads the Electron binary.',
  'electron-winstaller':
    'Pulled in by electron-builder-squirrel-windows for Windows packaging. install step.',
  'esbuild':
    'Direct in tuff-cli/tuff-cli-core/core-app and transitive under electron-vite, nitropack, tsup. postinstall installs the platform binary.',
  'extract-file-icon': 'apps/core-app dependency. install compiles the native icon reader.',
  'ffmpeg-static': 'apps/core-app dependency. install downloads the ffmpeg binary.',
  'protobufjs': 'Pulled in by @google/genai. postinstall.',
  'sharp': 'apps/core-app dependency. install fetches/builds libvips.',
  'typeit': 'apps/nexus dependency. postinstall + prepare.',
  'uiohook-napi': 'apps/core-app optionalDependency. install compiles the input-monitoring addon.',
  'unrs-resolver': 'Pulled in by eslint-plugin-import-x. postinstall installs the native resolver.',
  'utf-8-validate': 'apps/core-app optionalDependency. install compiles the ws speedup.',
  'vue-demi': 'Pulled in by @floating-ui/vue. postinstall picks the Vue 2/3 shim.',
  'workerd': 'Pulled in by wrangler/miniflare for the nexus Cloudflare target. postinstall downloads the runtime.',
}

/** Allowlisted but never resolved on this platform, and that is expected. */
const PLATFORM_OPTIONAL = new Set(['electron-winstaller'])

const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall']

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  }
  catch {
    return null
  }
}

/** Store directory names encode a scope as `@scope+name@version`. */
function storeDirsFor(name) {
  if (!existsSync(STORE))
    return []
  const encoded = `${name.replace('/', '+')}@`
  return readdirSync(STORE).filter(dir => dir.startsWith(encoded))
}

function manifestsFor(name) {
  return storeDirsFor(name)
    .map(dir => readJson(path.join(STORE, dir, 'node_modules', name, 'package.json')))
    .filter(Boolean)
}

function installHooks(manifest) {
  const scripts = manifest.scripts ?? {}
  const hooks = INSTALL_HOOKS.filter(hook => scripts[hook])
  if (manifest.gypfile === true && !hooks.includes('install'))
    hooks.push('gypfile')
  return hooks
}

function workspaceManifests() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '*package.json'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  return output
    .split('\n')
    .filter(Boolean)
    .map(file => ({ file, manifest: readJson(path.join(ROOT, file)) }))
    .filter(entry => entry.manifest)
}

const rootManifest = readJson(path.join(ROOT, 'package.json'))
const allowlist = rootManifest?.pnpm?.onlyBuiltDependencies ?? []
const problems = []

// 1. The allowlist and the reviewed table must name the same packages.
const reviewedNames = Object.keys(REVIEWED)
for (const name of allowlist) {
  if (!(name in REVIEWED)) {
    problems.push(
      `${name} is allowlisted but has no entry in REVIEWED. Add one naming the owning workspace capability and what its install step runs.`,
    )
  }
}
for (const name of reviewedNames) {
  if (!allowlist.includes(name)) {
    problems.push(`${name} is documented in REVIEWED but missing from pnpm.onlyBuiltDependencies.`)
  }
}

// 2. Allowlisted packages must still exist. Workspace links never appear in the store, so
//    they are matched by name against the workspace manifests instead.
const workspaceNames = new Set(
  workspaceManifests()
    .map(entry => entry.manifest.name)
    .filter(Boolean),
)
for (const name of allowlist) {
  if (workspaceNames.has(name))
    continue
  if (manifestsFor(name).length > 0)
    continue
  if (PLATFORM_OPTIONAL.has(name))
    continue
  problems.push(
    `${name} is allowlisted but is not installed and is not a workspace package. Nothing depends on it — remove the entry.`,
  )
}

// 3. Anything installed that runs install scripts must have been reviewed.
if (existsSync(STORE)) {
  const unreviewed = new Map()
  for (const dir of readdirSync(STORE)) {
    const scopeMatch = dir.match(/^(@[^@+]+)\+([^@]+)@/)
    const name = scopeMatch ? `${scopeMatch[1]}/${scopeMatch[2]}` : dir.split(/@\d/)[0]
    if (!name || name in REVIEWED)
      continue
    const manifest = readJson(path.join(STORE, dir, 'node_modules', name, 'package.json'))
    if (!manifest || manifest.name !== name)
      continue
    const hooks = installHooks(manifest)
    if (hooks.length > 0)
      unreviewed.set(name, hooks.join(', '))
  }
  for (const [name, hooks] of unreviewed) {
    problems.push(
      `${name} runs install scripts (${hooks}) and is currently blocked. Decide deliberately: if the build is needed, allowlist it and add a REVIEWED entry saying what the script does; if not, leave it blocked and record why in the PR.`,
    )
  }
}

if (problems.length > 0) {
  console.error('[build-allowlist] pnpm.onlyBuiltDependencies needs attention:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(`\n${problems.length} problem(s).`)
  process.exit(1)
}

console.log(
  `[build-allowlist] ${allowlist.length} allowlisted packages verified against the installed tree`,
)
