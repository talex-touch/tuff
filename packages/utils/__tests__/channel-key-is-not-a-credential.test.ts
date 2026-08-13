import type { PluginActivationIdentity } from '../transport'
import { describe, expect, it } from 'vitest'
// Imported across the package boundary on purpose — see the note on blocking checks below.
import { resolveChannelCallerIdentity } from '../../../apps/core-app/src/main/core/channel-caller-identity'

/**
 * Knowing a plugin's channel key must not, on its own, make you that plugin (#697, #698).
 *
 * The key travels as a renderer command-line argument (`additionalArguments`), so any process on
 * the machine can read it out of the process table — `ps -ww`, or WMI on Windows. #697 filed that
 * as a credential leak, and it was one until #698: `resolveChannelCallerIdentity` used to accept a
 * self-declared key as an identity source when the sender was not a registered plugin webContents.
 *
 * #698 closed it — identity now comes only from the registration, and a declared key is a
 * consistency check that can downgrade but never grant. That is what makes the exposure in #697
 * inert today, so it is the invariant worth holding still.
 *
 * The core-app suite already covers this in `channel-caller-identity.test.ts`. It is mirrored here
 * because `App suites (core-app)` runs with `continue-on-error: ${{ matrix.app != 'nexus' }}` — it
 * reports success whatever the suite does, so those tests cannot fail a PR. An invariant that a
 * security posture depends on should be enforceable, not merely observed.
 */

const REGISTRATION: PluginActivationIdentity = {
  name: 'com.example.victim',
  pluginInstanceId: 'instance-1',
  activationGeneration: 3,
  key: 'the-real-key',
}

describe('a channel key on its own', () => {
  it('grants nothing to an unregistered sender, however valid it is', () => {
    // The process-table reader's exact position: it has the real key and no registration.
    const caller = resolveChannelCallerIdentity({
      senderId: 99,
      senderDestroyed: false,
      declaredKey: REGISTRATION.key,
      resolveIdentity: key => (key === REGISTRATION.key ? REGISTRATION : undefined),
    })

    expect(caller).toEqual({})
  })

  it('cannot name a plugin, which is what the handlers read', () => {
    // pluginIdentity being empty is not enough on its own: #698 found that handlers reading only
    // `data.plugin` were fooled by the name alone — storage namespacing, quota accounting,
    // permission lookups. So the name must be absent too.
    const caller = resolveChannelCallerIdentity({
      senderId: 99,
      senderDestroyed: false,
      declaredKey: REGISTRATION.key,
      resolveIdentity: () => REGISTRATION,
    })

    expect(caller.pluginName).toBeUndefined()
    expect(caller.pluginIdentity).toBeUndefined()
  })

  it('cannot replace the identity of a sender that is registered as someone else', () => {
    const other: PluginActivationIdentity = { ...REGISTRATION, name: 'com.example.attacker' }

    const caller = resolveChannelCallerIdentity({
      senderId: 7,
      senderDestroyed: false,
      declaredKey: REGISTRATION.key,
      registration: { ...other, key: 'attacker-key' } as never,
      resolveIdentity: () => REGISTRATION,
    })

    expect(caller.pluginName).toBe('com.example.attacker')
    expect(caller.pluginIdentity).toBeUndefined()
  })
})

describe('a registered sender', () => {
  it('still resolves, so the rules above are not simply refusing everything', () => {
    // Positive control. Every assertion above is satisfied by a resolver that returns {} always,
    // which would break every plugin rather than secure anything.
    const caller = resolveChannelCallerIdentity({
      senderId: 7,
      senderDestroyed: false,
      declaredKey: REGISTRATION.key,
      registration: REGISTRATION as never,
      resolveIdentity: key => (key === REGISTRATION.key ? REGISTRATION : undefined),
    })

    expect(caller.pluginName).toBe(REGISTRATION.name)
    expect(caller.pluginIdentity).toEqual(REGISTRATION)
  })
})
