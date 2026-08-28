#!/usr/bin/env node
/**
 * Single entry point for the nexus admin regression guards.
 *
 *   node test/guards/run-guards.mjs              # run all seven
 *   node test/guards/run-guards.mjs --list       # inventory only, no run
 *   node test/guards/run-guards.mjs i18n         # vitest name filter
 *
 * Anything after the flags is forwarded to `vitest run` as a filter, so
 * `node test/guards/run-guards.mjs form-submit` works the same way vitest does.
 *
 * See README.md in this directory for what each guard asserts and why.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GUARDS = [
  ['component-auto-import', 'Nested app/components/** used under its bare name renders nothing'],
  ['form-submit-button', 'TxButton in a submitting form with neither native-type nor @click is inert'],
  ['feature-flag-coercion', 'runtimeConfig booleans compared strictly disagree with NUXT_PUBLIC_*=1'],
  ['page-toplevel-throw', 'Unconditional throw in <script setup> white-screens client navigation'],
  ['i18n-key-existence', 'Missing keys and lying fallbacks hide behind t(key, fallback)'],
  ['admin-route-reachability', 'Admin pages with no navigation entry are URL-only'],
  ['sfc-size-budget', 'Huge SFCs must keep <style> in a sibling file'],
]

const guardsDir = fileURLToPath(new URL('.', import.meta.url))
const nexusDir = fileURLToPath(new URL('../../', import.meta.url))
const args = process.argv.slice(2)

for (const [name, summary] of GUARDS)
  process.stdout.write(`  ${name.padEnd(26)} ${summary}\n`)
process.stdout.write('\n')

if (args.includes('--list'))
  process.exit(0)

const child = spawn(
  'npx',
  ['vitest', 'run', guardsDir, ...args.filter(arg => arg !== '--list')],
  { cwd: nexusDir, stdio: 'inherit' },
)
child.on('exit', code => process.exit(code ?? 1))
