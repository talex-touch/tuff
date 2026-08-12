import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No debug flag may be baked into an OS protocol registration (#803).
 *
 * `setAsDefaultProtocolClient` records the command line the OS runs for a `tuff://` link. The dev
 * registration passed `--inspect`, so any web page containing such a link could start Electron with
 * an open Node inspector port — and anything able to reach that port has main-process code
 * execution. The developer's own `pnpm core:dev` is where an inspector belongs; protocol handling
 * needs nothing from it.
 *
 * The second half is quieter. `isDefaultProtocolClient` answers "is this scheme mine", not "does
 * the registration point at this binary" — so a packaged build that skipped registration on `true`
 * left a stale dev registration in place, pointing at a checkout that may no longer exist, with
 * nothing ever replacing it.
 *
 * Lives in packages/utils because `ci / CI - utils` is blocking, while `App suites (core-app)` is
 * continue-on-error and reports success however the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const MAIN = path.join(REPO_ROOT, 'apps/core-app/src/main')

/** Flags that open a debugging surface if the OS launches with them. */
const DEBUG_FLAGS = ['--inspect', '--inspect-brk', '--remote-debugging-port']

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full)
  }
  return found
}

const registrations = sourceFiles(MAIN)
  .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
  .filter(({ source }) => source.includes('setAsDefaultProtocolClient'))

describe('protocol registration', () => {
  it('is found where it is expected', () => {
    // Positive control: "no registration carries a debug flag" is also what an empty scan reports.
    expect(registrations.length).toBeGreaterThan(0)
    expect(registrations.some(({ file }) => file.endsWith('addon-opener.ts'))).toBe(true)
  })

  it('bakes no debug flag into the command the OS will run', () => {
    const offenders = registrations.flatMap(({ file, source }) =>
      [...source.matchAll(/setAsDefaultProtocolClient\([^)]*\)/g)]
        .filter((call) => DEBUG_FLAGS.some((flag) => call[0].includes(flag)))
        .map((call) => `${path.relative(REPO_ROOT, file)}: ${call[0].slice(0, 80)}`)
    )

    expect(offenders).toEqual([])
  })

  it('still registers the dev build against the checkout', () => {
    // The flag goes; the registration does not. Dropping the whole call would also satisfy the
    // rule above and would silently stop tuff:// links working in development.
    const source = registrations.find(({ file }) => file.endsWith('addon-opener.ts'))!.source

    expect(source).toContain('setAsDefaultProtocolClient(APP_SCHEMA, electronPath, [appPath])')
  })

  it('lets a packaged build replace a stale registration', () => {
    // Without this a dev registration survives into packaged runs: isDefaultProtocolClient returns
    // true for it, so the packaged branch never ran.
    const source = registrations.find(({ file }) => file.endsWith('addon-opener.ts'))!.source

    expect(source).toContain('if (app.isPackaged || !app.isDefaultProtocolClient(APP_SCHEMA))')
  })
})
