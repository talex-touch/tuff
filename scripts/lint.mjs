#!/usr/bin/env node
/**
 * ESLint across the whole repository, in the two passes the root `lint` script
 * used to inline as a single ~800-character line (and again for `lint:fix`).
 *
 * Pass 1 goes through `pnpm -r --no-bail --filter ... exec eslint`, so each
 * workspace lints with the dependency versions it actually resolves.
 * Pass 2 covers the directories that are not workspaces -- `scripts/` plus the
 * plugins kept out of the root filter brace list -- resolving eslint through
 * `pnpm exec` so the command works from a plain `node scripts/lint.mjs` too.
 *
 * The `&&` between the two passes is preserved: a failure in pass 1 skips pass 2
 * and its exit code is the one that surfaces, so CI still fails where it did.
 *
 * Usage: pnpm lint | pnpm lint:fix. --print-plan reports the same commands without running them.
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Workspaces ESLint is run inside, one resolved config each. */
const WORKSPACE_FILTERS = [
  './apps/core-app',
  './apps/nexus',
  './apps/tuff-analyse',
  './packages/*',
  './plugins/*',
]

/**
 * The glob sets are deliberately not identical, matching the original command:
 * workspaces and the explicit plugin directories carry `.vue` files, `scripts/`
 * does not. Unifying them (in either direction) silently moves the gate.
 */
const VUE_LINT_EXTENSIONS = '**/*.{js,jsx,ts,tsx,vue,mjs,cjs,cts,mts}'
const SCRIPT_LINT_EXTENSIONS = '**/*.{js,jsx,ts,tsx,mjs,cjs,cts,mts}'

/**
 * Plugins excluded from the root `./plugins/*` filter above, linted explicitly
 * in pass 2. The list has to stay in sync with pnpm-workspace.yaml; a plugin in
 * neither was the #562 drift this pair of passes exists to catch.
 */
const EXPLICIT_PLUGIN_DIRS = [
  'touch-window-manager',
  'touch-window-presets',
  'touch-dev-toolbox',
  'touch-batch-rename',
  'touch-browser-bookmarks',
  'touch-browser-open',
  'touch-system-actions',
  'touch-text-snippets',
  'touch-snipaste',
  'touch-quick-actions',
  'touch-code-snippets',
  'touch-dictation',
]

const argv = process.argv.slice(2).filter(arg => arg !== '--')
const unknown = argv.filter(arg => arg !== '--fix' && arg !== '--print-plan')
if (unknown.length) {
  process.stderr.write(`Unknown argument(s): ${unknown.join(' ')}\nUsage: pnpm lint [--fix] [--print-plan]\n`)
  process.exit(1)
}

const eslintFlags = [
  '--cache',
  ...(argv.includes('--fix') ? ['--fix'] : []),
  '--max-warnings=0',
  '--no-warn-ignored',
  '--no-error-on-unmatched-pattern',
]

function run(args) {
  const result = spawnSync('pnpm', args, { cwd: REPO_ROOT, stdio: 'inherit' })
  return result.status ?? 1
}

const commands = [
  [
    '-r',
    '--no-bail',
    ...WORKSPACE_FILTERS.flatMap(filter => ['--filter', filter]),
    'exec',
    'eslint',
    ...eslintFlags,
    VUE_LINT_EXTENSIONS,
  ],
  [
    'exec',
    'eslint',
    ...eslintFlags,
    `scripts/${SCRIPT_LINT_EXTENSIONS}`,
    `plugins/{${EXPLICIT_PLUGIN_DIRS.join(',')}}/${VUE_LINT_EXTENSIONS}`,
  ],
]

if (argv.includes('--print-plan')) {
  process.stdout.write(`${JSON.stringify(commands)}\n`)
  process.exit(0)
}

for (const args of commands) {
  const status = run(args)
  if (status !== 0)
    process.exit(status)
}

process.exit(0)
