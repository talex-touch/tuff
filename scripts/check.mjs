#!/usr/bin/env node
/**
 * One entry point for the repository's static gates.
 *
 * Each gate used to be a pair of root scripts -- `check:<name>` and
 * `check:<name>:self-test` -- for a total of 26 entries that differed only in a
 * flag. They all dispatch to `scripts/check-<name>.mjs`, which reads its own
 * flags from `process.argv`, so the pair collapses into:
 *
 *     pnpm check <name> [--self-test]
 *
 * `--self-test` is not decoration: a guard that matches nothing looks exactly
 * like a repository with nothing to report, so CI runs both forms and the
 * self-test proves the detector fires. Flags after the name pass through
 * untouched.
 *
 * Exits with the gate's own status, so CI keeps failing exactly when it did.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPTS_DIR, '..')

/** Gate name -> the file in scripts/ that implements it. */
const GATES = {
  'action-pins': 'check-action-pins.mjs',
  'audit-report-claims': 'check-audit-report-claims.mjs',
  'build-allowlist': 'check-build-allowlist.mjs',
  'coreapp-ui-contract': 'check-coreapp-ui-contract.mjs',
  'doc-metadata': 'check-doc-metadata.mjs',
  'file-icon-guard': 'check-file-icon-guard.mjs',
  'module-size-ratchet': 'check-module-size-ratchet.mjs',
  'orphan-tests': 'check-orphan-tests.mjs',
  'plugin-blocked-reasons': 'check-plugin-blocked-reasons.mjs',
  'plugin-lint-coverage': 'check-plugin-lint-coverage.mjs',
  'prod-audit': 'check-prod-audit.mjs',
  'windows-installer-artifacts': 'check-windows-installer-artifacts.mjs',
  'workflow-injection': 'check-workflow-injection.mjs',
}

function usage() {
  const width = Math.max(...Object.keys(GATES).map(name => name.length))
  const lines = [
    'Usage: pnpm check <gate> [--self-test]',
    '',
    'Gates:',
    ...Object.keys(GATES).sort().map(name => `  ${name.padEnd(width)}  scripts/${GATES[name]}`),
    '',
    '`--self-test` (or any other flag) is forwarded to the gate script as-is.',
  ]
  return `${lines.join('\n')}\n`
}

// `pnpm check -- <gate>` forwards the `--` literally; drop it rather than fail.
const argv = process.argv.slice(2).filter(arg => arg !== '--')
const [name, ...rest] = argv

if (!name) {
  process.stderr.write(usage())
  process.exit(1)
}

if (name === '--list' || name === '-l') {
  process.stdout.write(usage())
  process.exit(0)
}

if (!Object.hasOwn(GATES, name)) {
  process.stderr.write(`Unknown gate: ${name}\n\n${usage()}`)
  process.exit(1)
}

const entry = path.join(SCRIPTS_DIR, GATES[name])
if (!fs.existsSync(entry)) {
  process.stderr.write(`Gate "${name}" points at a missing script: ${entry}\n`)
  process.exit(1)
}

const result = spawnSync(process.execPath, [entry, ...rest], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
