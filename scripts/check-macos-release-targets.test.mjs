import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The macOS release contract in electron-builder.yml (#594, #786).
 *
 * `target: dir` produced an unpackaged .app on arm64 only: nothing installable, nothing the
 * updater could read, and nothing at all for Intel. Every piece of machinery around it was
 * already correct — the release workflow refuses to build without Developer ID and an App Store
 * Connect key, writes the .p8 for notarytool, and counts .dmg and .zip when checking artifacts —
 * so the config was the only thing saying no, and nothing asserted it.
 *
 * `Release acceptance (macOS)` does not cover this: it is gated on `scripts/**` and its two test
 * files never read electron-builder.yml. Adding this file's path to that filter would spend
 * macOS minutes for no coverage, so the contract is asserted here instead, where the Linux
 * script gate already runs on every PR.
 *
 * Read as text rather than through a YAML parser, matching check-action-pins.mjs and its
 * neighbours, which avoid taking a dependency for the same reason.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = path.join(ROOT, 'apps/core-app/electron-builder.yml')

const config = readFileSync(CONFIG, 'utf8')

/** The `mac:` block, up to the next top-level key. */
function macBlock() {
  const start = config.indexOf('\nmac:')
  expect(start, 'no mac: block in electron-builder.yml — this guard is reading the wrong file').toBeGreaterThan(-1)

  const rest = config.slice(start + 1)
  const next = rest.slice(1).search(/\n(?=[a-z])/i)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

/** Comments are stripped: the block documents each decision in prose right above it. */
const mac = macBlock().replace(/^\s*#.*$/gm, '')

describe('macOS release targets', () => {
  it('is reading a mac block and not the whole file', () => {
    // Positive control. Every assertion below is a substring match, so a slice that quietly
    // covered the entire config would satisfy most of them for the wrong reason.
    expect(mac).toMatch(/^mac:/)
    expect(mac.length).toBeLessThan(config.length)
    expect(mac).not.toContain('\nwin:')
    expect(mac).not.toContain('\nlinux:')
  })

  it('ships something a person can install', () => {
    expect(mac).toMatch(/-\s*target:\s*dmg/)
  })

  it('ships the zip electron-updater reads on macOS', () => {
    // Not interchangeable with dmg. Without it the app installs and then cannot update itself,
    // which is a failure nobody notices until a release has already gone out.
    expect(mac).toMatch(/-\s*target:\s*zip/)
  })

  it('does not fall back to an unpackaged .app', () => {
    expect(mac).not.toMatch(/-\s*target:\s*dir\b/)
  })

  it('covers both architectures', () => {
    expect(mac).toContain('arm64')
    expect(mac).toContain('x64')
  })

  it('keeps the architecture in the artifact name', () => {
    // Two architectures resolving to one filename means the second build overwrites the first.
    // update-validate-release-manifest.mjs rejects duplicate names, but only after the
    // overwrite has happened, so the failure reads as a manifest problem rather than a lost
    // artifact.
    const match = mac.match(/artifactName:\s*(.+)/)
    expect(match, 'no artifactName in the mac block').not.toBeNull()
    // electron-builder's own placeholder syntax, matched literally. A backtick here would
    // interpolate it away and the assertion would pass against any artifactName at all.
    // eslint-disable-next-line no-template-curly-in-string
    expect(match[1]).toContain('${arch}')
  })

  it('notarizes', () => {
    expect(mac).toMatch(/notarize:\s*true/)
  })

  it('keeps the hardened runtime notarization requires', () => {
    expect(mac).toMatch(/hardenedRuntime:\s*true/)
  })
})
