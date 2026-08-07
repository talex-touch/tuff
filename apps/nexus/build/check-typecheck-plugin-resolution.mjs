#!/usr/bin/env node
/**
 * Runs `nuxt typecheck` and fails when Vue language-core cannot resolve a Volar plugin.
 *
 * `vue-tsc` prints `[Vue] Resolve plugin path failed: … ERR_PACKAGE_PATH_NOT_EXPORTED` and then
 * **exits 0**, so a plugin that never loaded looks exactly like a clean run. That is how the
 * `vue-router/volar/*` failure in #332 stayed hidden: Nuxt 4 writes those plugin paths into
 * `.nuxt/tsconfig.json` and they only exist in vue-router 5, but apps/nexus did not declare
 * vue-router, so resolution fell through to the hoisted 4.x that apps/core-app pins.
 *
 * Silently losing a plugin costs real coverage — sfc-typed-router is what gives typed route
 * names and params — so this wrapper turns the message into a non-zero exit until upstream does.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const NEXUS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Substrings that mean a Volar plugin was requested and could not be loaded. */
const RESOLUTION_FAILURES = ['Resolve plugin path failed', 'ERR_PACKAGE_PATH_NOT_EXPORTED']

const child = spawn('nuxt', ['typecheck'], {
  cwd: NEXUS_ROOT,
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
})

let captured = ''

for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    captured += chunk
    process.stdout.write(chunk)
  })
}

child.on('close', (code) => {
  const offending = captured
    .split('\n')
    .filter(line => RESOLUTION_FAILURES.some(needle => line.includes(needle)))

  if (offending.length > 0) {
    console.error('\n[typecheck-guard] vue-tsc could not resolve one or more Volar plugins:\n')
    for (const line of offending) console.error(`  ${line.trim()}`)
    console.error(
      '\nThe plugin did not load, so whatever it checks was skipped. Align the package that owns'
      + '\nthe subpath (declare it in apps/nexus so it resolves ahead of a hoisted older copy)'
      + '\nrather than patching an export map.',
    )
    process.exit(1)
  }

  process.exit(code ?? 0)
})
