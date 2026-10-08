import { Buffer } from 'node:buffer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/plugins/assets/:key` passes a package straight through: the R2 body streams to the client
 * with the headers it always had, instead of being read whole into the isolate first.
 */

const h3Mocks = vi.hoisted(() => ({
  send: vi.fn((_event: unknown, data: unknown) => ({ sent: data })),
  sendStream: vi.fn((_event: unknown, stream: unknown) => ({ streamed: stream })),
  setResponseHeader: vi.fn(),
}))
const storageMocks = vi.hoisted(() => ({ openPluginPackage: vi.fn() }))
const pluginsMocks = vi.hoisted(() => ({
  findVersionByPackageKey: vi.fn(),
  buildPluginPackageGovernanceResourceId: vi.fn(() => 'plugin-package:v-1'),
}))

vi.mock('h3', async () => ({ ...(await vi.importActual<typeof import('h3')>('h3')), ...h3Mocks }))
vi.mock('../../../server/utils/pluginPackageStorage', () => storageMocks)
vi.mock('../../../server/utils/pluginsStore', () => pluginsMocks)
vi.mock('../../../server/utils/auth', () => ({ getOptionalAuth: vi.fn(async () => null) }))
vi.mock('../../../server/utils/authStore', () => ({ getUserById: vi.fn() }))
vi.mock('../../../server/utils/pluginStoreAccess', () => ({ resolvePluginStoreAudience: vi.fn(async () => 'public') }))

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  handler = (await import('../../../server/api/plugins/assets/[key].get')).default as any
})

beforeEach(() => {
  vi.clearAllMocks()
  pluginsMocks.findVersionByPackageKey.mockResolvedValue({
    plugin: { id: 'plugin-1', userId: 'owner-1' },
    version: { id: 'v-1', version: '1.2.0', channel: 'RELEASE' },
  })
})

describe('GET /api/plugins/assets/:key', () => {
  it('streams the package with its download headers', async () => {
    const body = new ReadableStream()
    storageMocks.openPluginPackage.mockResolvedValue({ body, size: 4096, contentType: 'application/octet-stream' })

    const result = await handler({ context: { params: { key: 'pkg.tpex' } } })

    expect(result).toEqual({ streamed: body })
    expect(storageMocks.openPluginPackage).toHaveBeenCalledWith(expect.anything(), 'pkg.tpex', { governanceResourceId: 'plugin-package:v-1' })
    const headers = Object.fromEntries(h3Mocks.setResponseHeader.mock.calls.map(([, name, value]) => [name, value]))
    expect(headers).toEqual({
      'Content-Type': 'application/octet-stream',
      'Content-Length': 4096,
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'Content-Disposition': 'attachment; filename="1.2.0.tpex"',
    })
  })

  it('sends the bytes where the store answered in full', async () => {
    const bytes = Buffer.from('tpex')
    storageMocks.openPluginPackage.mockResolvedValue({ body: bytes, size: 4, contentType: 'application/octet-stream' })

    const result = await handler({ context: { params: { key: 'pkg.tpex' } } })

    expect(result).toEqual({ sent: bytes })
  })

  it('answers 404 when the package is gone', async () => {
    storageMocks.openPluginPackage.mockResolvedValue(null)

    await expect(handler({ context: { params: { key: 'pkg.tpex' } } })).rejects.toMatchObject({ statusCode: 404 })
  })
})
