import type { ITuffTransport } from '../transport/types'
import type { PluginApiInstallRequest, PluginInstallSourceRequest } from '../transport/events/types'
import { describe, expect, it, vi } from 'vitest'
import { INSTALL_TRANSPORT_TIMEOUT_MS } from '../plugin/install-budgets'
import { PluginProviderType } from '../plugin/providers/types'
import { PluginEvents } from '../transport/events'
import { createPluginSdk } from '../transport/sdk/domains/plugin'

const payload = {
  source: 'tpex:com.tuffex.json-formatter@1.0.8',
  hintType: PluginProviderType.TPEX,
  metadata: { officialVersion: '1.0.8' },
} satisfies PluginInstallSourceRequest

const apiInstallPayload = {
  source: 'https://example.test/widget.tpex',
  hintType: PluginProviderType.TPEX,
} satisfies PluginApiInstallRequest

function createTransport() {
  return {
    send: vi.fn(async () => ({ status: 'success' })),
    on: vi.fn(),
  }
}

describe('plugin:install-source deadline', () => {
  /**
   * The call spans download + permission prompt + unpack, so its deadline has to be the derived
   * budget from `install-budgets.ts` and not a fixed 3 minutes: the old wall fired while the user
   * was still reading the permission card after a successfully downloaded 14 MB package and
   * reported "install failed" for an install that was still running.
   */
  it('sends the download+prompt+unpack budget as the transport deadline', async () => {
    const transport = createTransport()
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)

    await sdk.installFromSource(payload)

    expect(transport.send).toHaveBeenCalledExactlyOnceWith(PluginEvents.install.source, payload, {
      timeout: INSTALL_TRANSPORT_TIMEOUT_MS,
    })
  })
})

describe('plugin:api:install deadline', () => {
  /**
   * `plugin:api:install` routes into the same main-side install queue as `plugin:install-source`,
   * so its call spans the same download + permission prompt + unpack budgets and needs the same
   * derived deadline. The 60s transport default is shorter than the permission card's own 120s
   * budget, so a user who takes a minute to accept the card sees a failed install that is in fact
   * still running.
   */
  it('sends the download+prompt+unpack budget as the transport deadline', async () => {
    const transport = createTransport()
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)

    await sdk.install(apiInstallPayload)

    expect(transport.send).toHaveBeenCalledExactlyOnceWith(
      PluginEvents.api.install,
      apiInstallPayload,
      { timeout: INSTALL_TRANSPORT_TIMEOUT_MS }
    )
  })
})
