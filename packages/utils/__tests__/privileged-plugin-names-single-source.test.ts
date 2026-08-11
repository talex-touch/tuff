import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A privileged plugin's name may be written in exactly one place (#535).
 *
 * Intelligence context, browser open and data, system actions, window manager and presets, and
 * workspace scripts are not authorized by the manifest permission registry. They are authorized by
 * comparing the activation's plugin name against a literal — and that literal was written in twelve
 * files, twenty-nine times, with no shared constant.
 *
 * The failure that costs is a rename, which the 2026-02 extraction invites. Every gate falls
 * through to `invalid()` or `null`, so the plugin loads and registers and only fails when a user
 * triggers the feature: no build error, no startup warning, and twelve files to find by grep.
 *
 * `privileged-plugins.ts` is now the one place. This keeps it the one place.
 *
 * Lives in packages/utils because `ci / CI - utils` is a blocking check, whereas
 * `App suites (core-app)` is continue-on-error and reports success whatever the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const MAIN = path.join(REPO_ROOT, 'apps/core-app/src/main')
const SOURCE_OF_TRUTH = 'modules/plugin/privileged-plugins.ts'

const PRIVILEGED_NAMES = [
  'touch-intelligence',
  'touch-browser-open',
  'touch-browser-data',
  'touch-quick-actions',
  'touch-system-actions',
  'touch-window-manager',
  'touch-window-presets',
  'touch-workspace-scripts',
]

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found)
      continue
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.'))
      found.push(full)
  }
  return found
}

const files = sourceFiles(MAIN)

/**
 * Files allowed to keep a literal, each because the name is not an authorization subject there.
 *
 * `FIXED_WIDGET_NAVIGATION` names `touch-intelligence` as a navigation *destination*, and
 * `widget-navigation-contract.test.ts` parses this file for a literal `pluginName` and `path`
 * because the host and the renderer have to agree on the exact route. Interpolating a constant
 * breaks that guard, which is the guard doing its job.
 */
const LITERAL_ALLOWED = new Map([
  ['modules/plugin/host/plugin-business-capabilities.ts', 'FIXED_WIDGET_NAVIGATION'],
])

/** Files quoting a privileged plugin name, other than the module that owns them. */
function offenders(): string[] {
  return files
    .map(file => ({ file: path.relative(MAIN, file), source: readFileSync(file, 'utf8') }))
    .filter(({ file }) => file !== SOURCE_OF_TRUTH && !LITERAL_ALLOWED.has(file))
    .filter(({ source }) => PRIVILEGED_NAMES.some(name => source.includes(`'${name}'`)))
    .map(({ file }) => file)
}

describe('privileged plugin names', () => {
  it('scans the main process it means to check', () => {
    // Positive control: "no file quotes a name" is also what an empty file list reports, and a
    // wrong root produces exactly that.
    expect(files.length).toBeGreaterThan(200)
    expect(files.some(file => file.endsWith(SOURCE_OF_TRUTH))).toBe(true)
  })

  it('are all written in the module that owns them', () => {
    // The same query shape finds them there, so a pass here is not the scan failing to look.
    const owner = readFileSync(path.join(MAIN, SOURCE_OF_TRUTH), 'utf8')
    for (const name of PRIVILEGED_NAMES) {
      expect(owner, name).toContain(`'${name}'`)
    }

    expect(offenders()).toEqual([])
  })

  it('does not carry an exception past the reason for it', () => {
    // Each allowed file has to still contain the construct that justifies it. Without this the
    // exception outlives its reason and becomes a place to put a gate nobody notices.
    for (const [file, justification] of LITERAL_ALLOWED) {
      const source = readFileSync(path.join(MAIN, file), 'utf8')
      expect(source, file).toContain(justification)
      expect(source, file).toContain(`pluginName: '`)
    }
  })

  it('keeps the two system-action tiers apart', () => {
    // They are not interchangeable — only touch-system-actions may run the destructive set — so a
    // single lumped entry would make the gate read as an either/or when it is not.
    const owner = readFileSync(path.join(MAIN, SOURCE_OF_TRUTH), 'utf8')

    expect(owner).toMatch(/systemActionsBasic: \['touch-quick-actions'\]/)
    expect(owner).toMatch(/systemActionsAdvanced: \['touch-system-actions'\]/)
  })
})
