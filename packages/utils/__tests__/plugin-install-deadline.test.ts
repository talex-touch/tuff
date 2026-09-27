import type { ITuffTransport } from '../transport/types'
import type { PluginInstallSourceRequest } from '../transport/events/types'
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
