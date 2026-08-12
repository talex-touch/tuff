#!/usr/bin/env node
/**
 * Stops the Electron main process accumulating more implicit `any` (#548).
 *
 * `@electron-toolkit/tsconfig` sets `noImplicitAny: false` alongside `strict: true`, and
 * `apps/core-app/tsconfig.node.json` inherits it. The renderer already overrides it back on
 * (`tsconfig.web.json`), so this is a main-process-only debt now, whatever the issue title says.
 *
 * Turning it on outright is 227 errors across 49 files, concentrated in the plugin host and the
 * privacy modules -- a real piece of work, and which of those to type first is a judgement about
 * where the risk is. What does not need a judgement is that the number should not grow while that
 * waits: every new untyped parameter lands silently today, because the flag that would name it is
 * off.
 *
 * So this pins the count and fails when it grows. It is a ratchet, not a fix: the number below is
 * a debt, and lowering it is the repair. It fails in both directions -- if the count drops, it
 * says so and asks for the pin to come down, so repair work moves the floor instead of leaving
 * slack for the next regression to hide in.
 */
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CORE_APP = path.join(REPO_ROOT, 'apps/core-app')

/**
 * Implicit-any diagnostics in the main process, as of the pin below.
 *
 * Measured with `tsc -p tsconfig.node.json --composite false --noImplicitAny`, counting TS7xxx
 * only -- every error the flag produces is in that range, so a rise here is new untyped code and
 * not some unrelated type break.
 */
export const KNOWN_IMPLICIT_ANY_ERRORS = 5

/** Resolves the workspace's own tsc rather than trusting a .bin shim on PATH. */
function resolveTsc() {
  const require = createRequire(import.meta.url)
  return require.resolve('typescript/bin/tsc', { paths: [REPO_ROOT] })
}

const execFileAsync = promisify(execFile)

/**
 * Counts TS7xxx diagnostics the main-process project reports under `--noImplicitAny`.
 *
 * Async on purpose. The synchronous form blocked a vitest worker for the ~30s tsc takes on CI,
 * which starved the reporter's RPC channel and failed the run with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` while every assertion passed.
 */
export async function countImplicitAnyErrors() {
  let output = ''
  try {
    const result = await execFileAsync(
      process.execPath,
      [
        resolveTsc(),
        '--noEmit',
        '-p',
        'tsconfig.node.json',
        '--composite',
        'false',
        '--noImplicitAny',
      ],
      { cwd: CORE_APP, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
    output = result.stdout ?? ''
  }
  catch (error) {
    // tsc exits non-zero when it reports anything, which is the expected case here.
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }

  const lines = output.split('\n').filter(line => /error TS7\d+:/.test(line))
  return { count: lines.length, lines }
}

async function main() {
  const { count } = await countImplicitAnyErrors()

  if (count > KNOWN_IMPLICIT_ANY_ERRORS) {
    process.stderr.write(
      `[check-implicit-any-debt] ${count} implicit-any errors in the main process, up from `
      + `${KNOWN_IMPLICIT_ANY_ERRORS}. Type the new parameters rather than widening the debt.\n`,
    )
    process.exit(1)
  }

  if (count < KNOWN_IMPLICIT_ANY_ERRORS) {
    process.stderr.write(
      `[check-implicit-any-debt] only ${count} implicit-any errors remain, down from `
      + `${KNOWN_IMPLICIT_ANY_ERRORS}. Lower KNOWN_IMPLICIT_ANY_ERRORS to ${count} so the floor `
      + `moves with the repair.\n`,
    )
    process.exit(1)
  }

  process.stdout.write(`[check-implicit-any-debt] main process holds at ${count} implicit-any errors\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
