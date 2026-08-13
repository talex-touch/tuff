import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every platform electron-builder builds must produce something the release actually publishes
 * (#594).
 *
 * The macOS target is `dir`, which emits `dist/mac-arm64/tuff.app` and nothing else. The release
 * workflow's artifact *check* passes on that, because it counts `.app` directories — but the
 * Upload Artifacts step globs only `*.dmg` / `*.zip` / `*.exe` / `*.AppImage` / `*.deb` / `*.snap`
 * and the release file selection does the same. So a release ships Windows and Linux and silently
 * omits macOS: nothing fails, and nothing says so.
 *
 * Which way to resolve it is a product decision — build dmg/zip and add x64, or state that macOS
 * is arm64-unpacked-only — so this records the gap rather than asserting either outcome. It fails
 * if a *new* platform joins the same state, and it fails once macOS leaves it, which is the prompt
 * to update the release expectations at the same time.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const BUILDER_CONFIG = path.join(REPO_ROOT, 'apps/core-app/electron-builder.yml')
const RELEASE_WORKFLOW = path.join(REPO_ROOT, '.github/workflows/build-and-release.yml')

/** electron-builder target names that yield no installable file. */
const UNPACKED_TARGETS = new Set(['dir'])

/** Platforms currently building only unpacked output. Shrink, never grow — see #594. */
// Empty since the app-shell-v2 merge: macOS now builds dmg + zip for arm64 and x64, where it
// previously produced only `dir`. The gap this recorded is closed, which is the exact
// condition the header describes as the prompt to update it.
const KNOWN_UNPUBLISHABLE: string[] = []

function targetsFor(platform: string): string[] {
  const config = readFileSync(BUILDER_CONFIG, 'utf8')
  const block = new RegExp(`^${platform}:\\n((?:[ ].*\\n|\\n)*)`, 'm').exec(config)
  if (!block) return []

  const targetSection = /^ {2}target:\n((?: {4}.*\n)+)/m.exec(block[1]!)
  if (!targetSection) return []

  return [...targetSection[1]!.matchAll(/^ {4}(?:- target: )?- ?([\w-]+)$/gm)]
    .map((match) => match[1]!)
    .concat(
      [...targetSection[1]!.matchAll(/^ {4}- target: ([\w-]+)$/gm)].map((match) => match[1]!)
    )
}

describe('release target coverage', () => {
  it('reads both files', () => {
    // Positive control: every assertion below is about content, and an unread file would make the
    // target lists empty — which would read as "no platform is unpublishable".
    expect(readFileSync(BUILDER_CONFIG, 'utf8')).toContain('appId:')
    expect(readFileSync(RELEASE_WORKFLOW, 'utf8')).toContain('if-no-files-found: error')
    expect(targetsFor('win').length).toBeGreaterThan(0)
    expect(targetsFor('linux').length).toBeGreaterThan(0)
  })

  it('publishes an installable artifact for every platform except the known gap', () => {
    const unpublishable = ['mac', 'win', 'linux'].filter((platform) => {
      const targets = targetsFor(platform)
      return targets.length > 0 && targets.every((target) => UNPACKED_TARGETS.has(target))
    })

    expect(unpublishable).toEqual(KNOWN_UNPUBLISHABLE)
  })

  it('keeps the upload globs and the release selection in agreement', () => {
    // These two lists are what decide whether a built artifact reaches the release. They are
    // maintained separately, and a platform added to one but not the other fails the same way
    // macOS does now — quietly.
    const workflow = readFileSync(RELEASE_WORKFLOW, 'utf8')

    for (const extension of ['dmg', 'zip', 'AppImage', 'deb', 'snap']) {
      expect(workflow, `upload glob for .${extension}`).toContain(`*.${extension}`)
      expect(workflow, `release selection for .${extension}`).toContain(`-name "*.${extension}"`)
    }
  })
})
