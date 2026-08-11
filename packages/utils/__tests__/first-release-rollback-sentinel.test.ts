import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AppPreviewChannel,
  isValidRollbackFromVersion,
  validateUpdateReleaseManifest,
} from '../types/update'

/**
 * A channel's first release has to produce a manifest that already-shipped clients accept (#559).
 *
 * `resolve-update-rollback-version.mjs` used to throw when no same-channel predecessor existed,
 * failing the release job *after* all three platform builds had finished. It now emits a
 * channel-matched zero instead.
 *
 * The obvious alternative — omit the field — is what this file rules out. `validateUpdateReleaseManifest`
 * below is the validator running inside every installed client, and it requires
 * `rollbackFromVersion` to be a **string**. An optional field would mean a first release
 * publishes a manifest that existing users' clients reject, so they never see the update at
 * all. That is a worse failure than the one being fixed, and an invisible one.
 *
 * So this test exists to keep the two ends of a cross-repo-boundary contract in agreement: the
 * release script picks the sentinel, and the client has to accept it.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const RESOLVER = path.join(REPO_ROOT, 'scripts/resolve-update-rollback-version.mjs')

/** The sentinel as the release script writes it, read from the script rather than restated. */
function sentinels(): Record<'RELEASE' | 'BETA', string> {
  const source = readFileSync(RESOLVER, 'utf8')
  const block = source.slice(
    source.indexOf('export const FIRST_RELEASE_ROLLBACK_VERSION'),
    source.indexOf('function versionFromTag'),
  )
  const entries = [...block.matchAll(/(RELEASE|BETA):\s*'([^']+)'/g)].map(
    ([, channel, version]) => [channel, version] as const,
  )
  return Object.fromEntries(entries) as Record<'RELEASE' | 'BETA', string>
}

describe('first-release rollback sentinel', () => {
  it('reads the sentinel the release script actually uses', () => {
    // Positive control: every assertion below is about values parsed out of that file, so a
    // parse that silently returns nothing would make them all vacuous.
    const found = sentinels()
    expect(found.RELEASE).toMatch(/^\d+\.\d+\.\d+$/)
    expect(found.BETA).toMatch(/^\d+\.\d+\.\d+-[a-z]+\.\d+$/)
  })

  it('is accepted by the validator running in already-shipped clients', () => {
    const found = sentinels()

    expect(
      isValidRollbackFromVersion('2.5.0', found.RELEASE, AppPreviewChannel.RELEASE),
    ).toBe(true)
    expect(
      isValidRollbackFromVersion('2.5.0-beta.1', found.BETA, AppPreviewChannel.BETA),
    ).toBe(true)
    // …and stays channel-correct, which is what a bare `0.0.0` would get wrong for BETA.
    expect(
      isValidRollbackFromVersion('2.5.0-beta.1', found.RELEASE, AppPreviewChannel.BETA),
    ).toBe(false)
  })

  it('cannot be omitted instead, because the shipped client requires a string', () => {
    // The reason the sentinel exists rather than an optional field. If this ever starts
    // passing, "no predecessor" can be modelled honestly and the sentinel can go.
    const manifest = {
      schemaVersion: 1,
      release: {
        tag: 'v2.5.0',
        version: '2.5.0',
        channel: 'RELEASE',
        rollbackCompatible: false,
      },
      artifacts: [],
    }

    const result = validateUpdateReleaseManifest(manifest as never, {
      tag: 'v2.5.0',
      channel: 'RELEASE',
    } as never)

    expect(result.valid).toBe(false)
  })
})
