import type { ITuffTransport } from '../transport/types'
import { describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'
import { createPluginSdk } from '../transport/sdk/domains/plugin'

type PluginUninstallRequestV1 = {
  version: 1
  plugin: {
    name: string
    pluginInstanceId: string
    activationGeneration: number
  }
  disposition: {
    confirmation: 'delete-plugin-and-data'
    ordinaryExport: { enabled: false } | { enabled: true }
    portableSecretBackup: { enabled: false } | { enabled: true; password: string }
  }
}

const request = {
  version: 1,
  plugin: {
    name: 'touch-fixture',
    pluginInstanceId: 'fixture-instance',
    activationGeneration: 3,
  },
  disposition: {
    confirmation: 'delete-plugin-and-data',
    ordinaryExport: { enabled: true },
    portableSecretBackup: {
      enabled: true,
      password: 'correct horse battery staple',
    },
  },
} satisfies PluginUninstallRequestV1

const completedResult = {
  version: 1,
  success: true,
  status: 'completed',
  code: 'PLUGIN_UNINSTALL_COMPLETED',
  retryable: false,
  installed: false,
  stages: [
    {
      stage: 'verification',
      status: 'completed',
      code: 'PLUGIN_UNINSTALL_VERIFIED',
      retryable: false,
    },
  ],
} as const

function createTransport(response: unknown = completedResult) {
  return {
    send: vi.fn(async (_event: unknown, _request: unknown) => response),
    on: vi.fn(),
  }
}

describe('plugin uninstall typed SDK contract', () => {
  it('sends an exact generation-bound disposition without renderer filesystem authority', async () => {
    const transport = createTransport()
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)

    const result = await sdk.uninstall(request as unknown as Parameters<typeof sdk.uninstall>[0])

    expect(transport.send).toHaveBeenCalledExactlyOnceWith(PluginEvents.api.uninstall, request)
    expect(JSON.stringify(transport.send.mock.calls[0]?.[1])).not.toMatch(
      /"(?:path|secretPrefix|secretKey|table|sql|endpoint|rawData)"\s*:/i,
    )
    expect(JSON.stringify(result)).not.toContain(request.disposition.portableSecretBackup.password)
  })

  it.each([
    ['legacy name-only request', { name: 'touch-fixture' }],
    [
      'missing generation identity',
      {
        ...request,
        plugin: { name: 'touch-fixture', pluginInstanceId: 'fixture-instance' },
      },
    ],
    [
      'backup without a transient password',
      {
        ...request,
        disposition: {
          confirmation: 'delete-plugin-and-data',
          ordinaryExport: { enabled: false },
          portableSecretBackup: { enabled: true },
        },
      },
    ],
    [
      'password supplied when backup is disabled',
      {
        ...request,
        disposition: {
          confirmation: 'delete-plugin-and-data',
          ordinaryExport: { enabled: false },
          portableSecretBackup: {
            enabled: false,
            password: 'must-not-cross',
          },
        },
      },
    ],
    [
      'path-shaped plugin name',
      {
        ...request,
        plugin: { ...request.plugin, name: '../touch-fixture' },
      },
    ],
    ['renderer-selected export path', { ...request, path: '/synthetic/private/export.json' }],
    ['renderer-selected Secret prefix', { ...request, secretPrefix: 'plugin.touch-fixture.' }],
    ['renderer-selected Secret key', { ...request, secretKey: 'synthetic-key' }],
    ['renderer-selected table', { ...request, table: 'plugin_data' }],
    ['renderer-selected SQL', { ...request, sql: 'DELETE FROM synthetic' }],
    [
      'missing final confirmation',
      {
        ...request,
        disposition: {
          ordinaryExport: { enabled: false },
          portableSecretBackup: { enabled: false },
        },
      },
    ],
    [
      'short password',
      {
        ...request,
        disposition: {
          confirmation: 'delete-plugin-and-data',
          ordinaryExport: { enabled: false },
          portableSecretBackup: { enabled: true, password: 'too-short' },
        },
      },
    ],
    [
      'malformed password unicode',
      {
        ...request,
        disposition: {
          confirmation: 'delete-plugin-and-data',
          ordinaryExport: { enabled: false },
          portableSecretBackup: {
            enabled: true,
            password: `valid-prefix-${String.fromCharCode(0xd800)}`,
          },
        },
      },
    ],
  ])('rejects %s before transport', async (_label, candidate) => {
    const transport = createTransport()
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)

    await expect(sdk.uninstall(candidate as unknown as Parameters<typeof sdk.uninstall>[0])).rejects.toThrow(
      'PLUGIN_UNINSTALL_REQUEST_INVALID',
    )
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('rejects native or sensitive uninstall failure detail returned by main', async () => {
    const transport = createTransport({
      version: 1,
      success: false,
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED',
      retryable: true,
      installed: true,
      stages: [
        {
          stage: 'sqlite',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_SQLITE_CLOSE_FAILED',
          retryable: true,
          error: 'synthetic native failure at /private/plugin.sqlite with SQL params',
        },
      ],
    })
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)

    await expect(sdk.uninstall(request as unknown as Parameters<typeof sdk.uninstall>[0])).rejects.toThrow(
      'PLUGIN_UNINSTALL_RESULT_INVALID',
    )
  })

  it('keeps reload separate from uninstall disposition', async () => {
    const transport = createTransport()
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)
    const forgedReload = {
      name: 'touch-fixture',
      disposition: request.disposition,
    }

    await expect(sdk.reload(forgedReload as unknown as Parameters<typeof sdk.reload>[0])).rejects.toThrow(
      'PLUGIN_OPERATION_REQUEST_INVALID',
    )
    expect(transport.send).not.toHaveBeenCalled()
  })

  it.each([
    Object.create({ version: 1 }),
    new Proxy(request, {}),
    Object.defineProperty({ ...request }, 'version', {
      enumerable: true,
      get: () => 1,
    }),
    Object.assign(new (class Request {})(), request),
  ])('rejects hostile request objects before transport', async candidate => {
    const transport = createTransport()
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)

    await expect(sdk.uninstall(candidate as unknown as Parameters<typeof sdk.uninstall>[0])).rejects.toThrow(
      'PLUGIN_UNINSTALL_REQUEST_INVALID',
    )
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('rejects sparse aggregate stage results returned by main', async () => {
    const stages = Array.from({ length: 1 })
    const transport = createTransport({ ...completedResult, stages })
    const sdk = createPluginSdk(transport as unknown as ITuffTransport)

    await expect(sdk.uninstall(request as unknown as Parameters<typeof sdk.uninstall>[0])).rejects.toThrow(
      'PLUGIN_UNINSTALL_RESULT_INVALID',
    )
  })
})
