import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/store/plugins/[slug]/download.get'

const h3Mocks = vi.hoisted(() => ({
  createError: vi.fn((input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)),
  getQuery: vi.fn(),
  sendRedirect: vi.fn(),
}))

const pluginsStoreMocks = vi.hoisted(() => ({
  blockPluginVersionAdmission: vi.fn(),
  buildPluginPackageGovernanceResourceId: vi.fn(),
  getPluginBySlug: vi.fn(),
  getPluginVersionEligibility: vi.fn(),
  incrementPluginInstalls: vi.fn(),
}))

const pluginPackageStorageMocks = vi.hoisted(() => ({
  getPluginPackage: vi.fn(),
}))
const pluginStoreAccessMocks = vi.hoisted(() => ({
  resolvePluginStoreAudience: vi.fn(),
}))

const governanceMocks = vi.hoisted(() => ({
  recordPlatformGovernanceEvent: vi.fn(),
}))

const geoMocks = vi.hoisted(() => ({
  resolveRequestGeo: vi.fn(),
}))

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'defineEventHandler', {
    configurable: true,
    value: <T>(fn: T) => fn,
  })
  Object.defineProperty(globalThis, 'getQuery', {
    configurable: true,
    value: h3Mocks.getQuery,
  })
})

vi.mock('h3', () => ({
  createError: h3Mocks.createError,
  getQuery: h3Mocks.getQuery,
  sendRedirect: h3Mocks.sendRedirect,
}))
vi.mock('../../../server/utils/pluginPackageStorage', () => pluginPackageStorageMocks)
vi.mock('../../../server/utils/pluginsStore', () => pluginsStoreMocks)
vi.mock('../../../server/utils/pluginStoreAccess', () => pluginStoreAccessMocks)
vi.mock('../../../server/utils/platformGovernanceStore', () => governanceMocks)
vi.mock('../../../server/utils/requestGeo', () => geoMocks)

const event = {
  context: {
    params: { slug: 'focus-flow' },
    requestId: 'plugin-download-gate-test',
  },
} as unknown as H3Event

const artifactBytes = new TextEncoder().encode('focus-flow release archive')
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex')
const version = {
  id: 'version_1',
  version: '1.0.0',
  channel: 'RELEASE',
  packageKey: 'plugins/focus-flow/1.0.0.tpex',
  packageUrl: 'https://packages.example.test/focus-flow-1.0.0.tpex',
  packageSize: artifactBytes.byteLength,
  artifactSha256,
}
const plugin = {
  id: 'plugin_1',
  slug: 'focus-flow',
  artifactType: 'plugin',
  latestVersionId: version.id,
  versions: [version],
}

beforeEach(() => {
  vi.clearAllMocks()
  h3Mocks.getQuery.mockReturnValue({ version: version.version })
  h3Mocks.sendRedirect.mockReturnValue({ redirected: version.packageUrl })
  pluginStoreAccessMocks.resolvePluginStoreAudience.mockResolvedValue('public')
  pluginsStoreMocks.getPluginBySlug.mockResolvedValue(plugin)
  pluginsStoreMocks.getPluginVersionEligibility.mockReturnValue({ eligible: true })
  pluginsStoreMocks.buildPluginPackageGovernanceResourceId.mockReturnValue('plugin-package:version_1')
  pluginsStoreMocks.blockPluginVersionAdmission.mockResolvedValue(undefined)
  pluginsStoreMocks.incrementPluginInstalls.mockResolvedValue(undefined)
  pluginPackageStorageMocks.getPluginPackage.mockResolvedValue({ data: artifactBytes })
  governanceMocks.recordPlatformGovernanceEvent.mockResolvedValue(undefined)
  geoMocks.resolveRequestGeo.mockReturnValue({ countryCode: 'US', regionCode: 'CA', timezone: 'America/Los_Angeles' })
})

describe('/api/store/plugins/:slug/download.tpex', () => {
  it('returns 404 for an unknown requested version without reading an artifact', async () => {
    h3Mocks.getQuery.mockReturnValue({ version: '9.9.9' })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })

    expect(pluginPackageStorageMocks.getPluginPackage).not.toHaveBeenCalled()
  })

  it('returns 404 before artifact access when the requested release is not public-eligible', async () => {
    pluginsStoreMocks.getPluginVersionEligibility.mockReturnValue({ eligible: false })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })

    expect(pluginsStoreMocks.getPluginVersionEligibility).toHaveBeenCalledWith(plugin, version, 'public')
    expect(pluginPackageStorageMocks.getPluginPackage).not.toHaveBeenCalled()
  })

  it('blocks an eligible release with artifact-missing and returns 404 when its artifact is absent', async () => {
    pluginPackageStorageMocks.getPluginPackage.mockResolvedValue(null)

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })

    expect(pluginsStoreMocks.blockPluginVersionAdmission).toHaveBeenCalledWith(event, plugin.id, version.id, 'artifact-missing')
  })

  it('quarantines a digest-mismatched artifact and returns 409', async () => {
    pluginPackageStorageMocks.getPluginPackage.mockResolvedValue({ data: new TextEncoder().encode('tampered archive') })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409 })

    expect(pluginsStoreMocks.blockPluginVersionAdmission).toHaveBeenCalledWith(event, plugin.id, version.id, 'artifact-digest-mismatch')
  })

  it('redirects a valid artifact to the selected package URL without blocking admission', async () => {
    const result = await handler(event)

    expect(h3Mocks.sendRedirect).toHaveBeenCalledWith(event, version.packageUrl, 302)
    expect(result).toEqual({ redirected: version.packageUrl })
    expect(pluginsStoreMocks.blockPluginVersionAdmission).not.toHaveBeenCalled()
  })

  it('uses the authenticated beta audience across Store and asset redirects', async () => {
    const betaVersion = {
      ...version,
      channel: 'BETA',
      packageUrl: '/api/plugins/assets/beta-package.tpex',
    }
    const betaPlugin = {
      ...plugin,
      latestVersionId: betaVersion.id,
      versions: [betaVersion],
    }
    pluginStoreAccessMocks.resolvePluginStoreAudience.mockResolvedValue('beta')
    pluginsStoreMocks.getPluginBySlug.mockResolvedValue(betaPlugin)

    await handler(event)

    expect(pluginsStoreMocks.getPluginBySlug).toHaveBeenCalledWith(event, plugin.slug, {
      includeVersions: true,
      forStore: true,
      audience: 'beta',
    })
    expect(pluginsStoreMocks.getPluginVersionEligibility).toHaveBeenCalledWith(betaPlugin, betaVersion, 'beta')
    expect(h3Mocks.sendRedirect).toHaveBeenCalledWith(
      event,
      '/api/plugins/assets/beta-package.tpex?channel=BETA',
      302,
    )
  })
})
