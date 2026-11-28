import { afterEach, describe, expect, it, vi } from 'vitest'
import { providerCredentialSecureStoreKey as aiProviderCredentialSecureStoreKey } from '../../modules/ai/provider-credential-service'
import {
  evaluatePermissionPluginSdkHardCutGate,
  teardownPermissionPluginStorage
} from '../../modules/permission/permission-ports'
import { registerPluginStorageTeardown } from '../../modules/plugin/runtime/plugin-storage-lifecycle'
import { getPluginSdkHardCutGate as pluginGetPluginSdkHardCutGate } from '../../modules/plugin/sdkapi-hard-cut-gate'
import { PORTABLE_SECRET_CATALOG_V1 } from '../../modules/privacy/portable-secret-catalog'
import {
  getRegisteredPrivacyVoiceStores,
  resolveOrchestratorPrivacyStoreFactory,
  resolvePrivacyRuntimeDependencies
} from '../../modules/privacy/privacy-ports'
import { providerCredentialSecureStoreKey as sharedProviderCredentialSecureStoreKey } from '../../shared/provider-credential-key'
import { registerDp2Ports, resetDp2PortsForTests } from './register-dp2-ports'

describe('registerDp2Ports composition root', () => {
  afterEach(() => {
    resetDp2PortsForTests()
  })

  it('is idempotent and wires permission storage teardown through plugin-storage-lifecycle', async () => {
    registerDp2Ports()
    registerDp2Ports()

    const teardown = vi.fn(async () => undefined)
    const disposePluginTeardown = registerPluginStorageTeardown(teardown)
    try {
      await teardownPermissionPluginStorage('touch-demo')
      expect(teardown).toHaveBeenCalledTimes(1)
      expect(teardown).toHaveBeenCalledWith('touch-demo')
    } finally {
      disposePluginTeardown()
    }
  })

  it('wires privacy voice stores and orchestrator store factory and cleans up on reset', async () => {
    expect(getRegisteredPrivacyVoiceStores()).toBeNull()
    expect(resolveOrchestratorPrivacyStoreFactory()).toBeNull()
    await expect(resolvePrivacyRuntimeDependencies()).rejects.toThrow(
      'PRIVACY_RUNTIME_DEPENDENCIES_UNAVAILABLE'
    )

    registerDp2Ports()

    expect(getRegisteredPrivacyVoiceStores()?.voiceInsightsStore).toBeDefined()
    expect(getRegisteredPrivacyVoiceStores()?.voiceRecognitionStore).toBeDefined()
    expect(resolveOrchestratorPrivacyStoreFactory()).toBeTypeOf('function')

    resetDp2PortsForTests()

    expect(getRegisteredPrivacyVoiceStores()).toBeNull()
    expect(resolveOrchestratorPrivacyStoreFactory()).toBeNull()
    await expect(resolvePrivacyRuntimeDependencies()).rejects.toThrow(
      'PRIVACY_RUNTIME_DEPENDENCIES_UNAVAILABLE'
    )
  })

  it('preserves exact SDK hard-cut gate parity between DP2 permission port and DP5 plugin contract', () => {
    registerDp2Ports()
    for (const candidate of [undefined, 'bad', 251111, 251212, 260615]) {
      expect(evaluatePermissionPluginSdkHardCutGate('touch-demo', candidate)).toEqual(
        pluginGetPluginSdkHardCutGate('touch-demo', candidate)
      )
    }
  })

  it('preserves exact provider credential secure-store key parity with DP6 provider-credential-service', () => {
    const providerIds = [
      ...PORTABLE_SECRET_CATALOG_V1.filter((entry) => entry.ownerKind === 'provider').map(
        (entry) => entry.ownerId
      ),
      'custom-provider-1',
      'anthropic-enterprise'
    ]
    for (const providerId of providerIds) {
      expect(sharedProviderCredentialSecureStoreKey(providerId)).toBe(
        aiProviderCredentialSecureStoreKey(providerId)
      )
    }
  })
})
