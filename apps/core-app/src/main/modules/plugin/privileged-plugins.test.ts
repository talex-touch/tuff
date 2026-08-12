import { describe, expect, it } from 'vitest'
import {
  isPrivilegedPluginFor,
  PRIVILEGED_PLUGIN_CAPABILITIES,
  PRIVILEGED_PLUGIN_NAMES,
  privilegedPluginFor,
  SYSTEM_ACTION_PLUGIN_NAMES
} from './privileged-plugins'

/**
 * This registry replaced `this.name !== 'touch-x'` guards scattered through TouchPlugin, and until
 * now nothing tested it — the guards it absorbed were only exercised through the plugin runtime,
 * which is why an unregistered capability would have failed open rather than loudly (#713).
 */
describe('privileged plugin capabilities', () => {
  it('admits only the registered holder', () => {
    expect(isPrivilegedPluginFor('browserOpen', 'touch-browser-open')).toBe(true)
    expect(isPrivilegedPluginFor('browserOpen', 'touch-window-manager')).toBe(false)
  })

  // The failure mode worth guarding: a capability that admits a plugin it was never granted to.
  // A registry keyed by capability makes that a data question, so it can be asserted as one.
  it('does not leak a holder across capabilities', () => {
    for (const [capability, holders] of Object.entries(PRIVILEGED_PLUGIN_CAPABILITIES)) {
      for (const name of PRIVILEGED_PLUGIN_NAMES) {
        expect(
          isPrivilegedPluginFor(capability as keyof typeof PRIVILEGED_PLUGIN_CAPABILITIES, name)
        ).toBe((holders as readonly string[]).includes(name))
      }
    }
  })

  // An undefined name reaches this from three different shapes upstream — activation.name,
  // expectedActivation.name, snapshot.manifest.name — and any of them can be absent.
  it('refuses an absent plugin name rather than treating it as a wildcard', () => {
    expect(isPrivilegedPluginFor('translation', undefined)).toBe(false)
    expect(isPrivilegedPluginFor('translation', '')).toBe(false)
  })

  it('names every holder exactly once', () => {
    expect(new Set(PRIVILEGED_PLUGIN_NAMES).size).toBe(PRIVILEGED_PLUGIN_NAMES.length)
    for (const holders of Object.values(PRIVILEGED_PLUGIN_CAPABILITIES)) {
      for (const name of holders as readonly string[]) {
        expect(PRIVILEGED_PLUGIN_NAMES).toContain(name)
      }
    }
  })

  describe('privilegedPluginFor', () => {
    it('returns the sole holder for a single-holder capability', () => {
      expect(privilegedPluginFor('batchRenameFilesystem')).toBe('touch-batch-rename')
      expect(privilegedPluginFor('snipasteProcess')).toBe('touch-snipaste')
      expect(privilegedPluginFor('translation')).toBe('touch-translation')
    })

    // Returning the first of several would read as "the owner" at a call site that renders it as
    // one, so the multi-holder case has to be a throw rather than a silent pick.
    it('throws rather than picking one when a capability gains a second holder', () => {
      const multi = Object.entries(PRIVILEGED_PLUGIN_CAPABILITIES).find(
        ([, holders]) => (holders as readonly string[]).length > 1
      )
      if (!multi) {
        expect(() =>
          privilegedPluginFor('nope' as keyof typeof PRIVILEGED_PLUGIN_CAPABILITIES)
        ).toThrow()
        return
      }
      expect(() =>
        privilegedPluginFor(multi[0] as keyof typeof PRIVILEGED_PLUGIN_CAPABILITIES)
      ).toThrow(/holders/)
    })
  })

  // The two system-action tiers are deliberately separate entries: isActionAllowedForPlugin gives
  // them different action lists, so a single entry naming both would make the gate look like an
  // either/or when it is not. This asserts the union stays the union.
  it('keeps both system-action tiers in the combined gate', () => {
    expect(SYSTEM_ACTION_PLUGIN_NAMES).toContain('touch-quick-actions')
    expect(SYSTEM_ACTION_PLUGIN_NAMES).toContain('touch-system-actions')
    expect(isPrivilegedPluginFor('systemActionsBasic', 'touch-system-actions')).toBe(false)
    expect(isPrivilegedPluginFor('systemActionsAdvanced', 'touch-quick-actions')).toBe(false)
  })
})
