import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The plugin channel key must not be described as encryption (#804).
 *
 * It is 16 random bytes minted per activation — a bearer capability token. CLAUDE.md called it
 * "encrypted keys ... for additional security" in three places, and the registry's own doc comment
 * quoted that phrasing back.
 *
 * The cost of the wrong word is specific: a reviewer who reads "encrypted" assumes confidentiality
 * and replay resistance, and stops looking for where the token travels and when it dies — which is
 * exactly where the real issues are (#697 has it passed through renderer command-line arguments,
 * #698 had a self-declared identity accepted alongside it).
 *
 * The second half pins what the token *does* rely on, so the claim and the code cannot drift
 * apart again: rotation on re-activation, and revocation on all three teardown paths.
 *
 * Lives in packages/utils because `ci / CI - utils` is a blocking check, whereas
 * `App suites (core-app)` is continue-on-error and reports success whatever the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

const CLAUDE_MD = readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8')
const REGISTRY = readFileSync(
  path.join(REPO_ROOT, 'apps/core-app/src/main/core/plugin-channel-key-registry.ts'),
  'utf8',
)
const PLUGIN = readFileSync(
  path.join(REPO_ROOT, 'apps/core-app/src/main/modules/plugin/plugin.ts'),
  'utf8',
)

describe('plugin channel key documentation', () => {
  it('reads the files it means to check', () => {
    // Positive control: "no mention of encryption" is also what an unreadable file reports.
    expect(CLAUDE_MD).toContain('Channel Communication')
    expect(REGISTRY).toContain('PluginChannelKeyRegistry')
    expect(PLUGIN).toContain('revokeActivationAuthority')
  })

  it('does not call the channel key encrypted', () => {
    const offenders = [
      ['CLAUDE.md', CLAUDE_MD],
      ['plugin-channel-key-registry.ts', REGISTRY],
    ].filter(([, source]) => /encrypt(?:ed|ion)\s+(?:key|for plugin)/i.test(source as string))

    expect(offenders.map(([name]) => name)).toEqual([])
  })

  it('says what the token actually is', () => {
    // Guards the rule above against being satisfied by deleting the description entirely.
    expect(CLAUDE_MD).toMatch(/capability token/i)
    expect(REGISTRY).toMatch(/bearer capability token/i)
  })
})

describe('plugin channel key lifetime', () => {
  it('mints 16 random bytes per activation', () => {
    expect(REGISTRY).toContain('randomBytes(16).toString(\'hex\')')
  })

  it('rotates when the activation changes', () => {
    // The three maps must move together; a key dropped from one and left in another is a live
    // token with no owner.
    expect(REGISTRY).toMatch(/keyToName\.delete\(existingKey\)/)
    expect(REGISTRY).toMatch(/keyToIdentity\.delete\(existingKey\)/)
    expect(REGISTRY).toMatch(/nameToKey\.delete\(name\)/)
  })

  it('revokes on every teardown path, not only the tidy one', () => {
    // disable(), runtime crash and failed activation. A token that survives a crash is the one
    // that matters, because nothing else about that plugin is still trustworthy.
    const revocations = PLUGIN.match(/this\.revokeActivationAuthority\(activation\)/g) ?? []

    expect(revocations.length).toBeGreaterThanOrEqual(3)
    expect(PLUGIN).toMatch(/handleRuntimeCrash[\s\S]{0,400}revokeActivationAuthority/)
    expect(PLUGIN).toMatch(/async disable\(\)[\s\S]{0,900}revokeActivationAuthority/)
  })
})
