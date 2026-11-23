import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { CURRENT_SDK_VERSION, NPM_ABBREVIATED_PACKUMENT_ACCEPT } from '@talex-touch/utils/plugin'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import fse from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  downloadToTempFile: vi.fn(),
  getEnabledNpmSources: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: true
  },
  ipcMain: { handle: vi.fn(), off: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  MessageChannelMain: class {}
}))

vi.mock('../../network', () => ({
  getNetworkService: () => ({
    request: mocks.request
  })
}))

vi.mock('../../../service/store-api.service', () => ({
  getEnabledNpmSources: mocks.getEnabledNpmSources,
  getEnabledApiSources: vi.fn(() => [])
}))

vi.mock('./utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./utils')>()),
  downloadToTempFile: mocks.downloadToTempFile
}))

vi.mock('./logger', () => ({
  createProviderLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    time: () => ({ end: vi.fn() })
  }),
  providerRegistryLog: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn()
  }
}))

import { NpmPluginProvider, resolvePackumentVersion, satisfiesSemverRange } from './npm-provider'
import { ensureDefaultProvidersRegistered, getRegisteredProviders } from './registry'

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const str = value.toString(8).padStart(length - 1, '0')
  buffer.write(`${str}\0`, offset, length, 'ascii')
}

function buildTarGz(files: Record<string, string>): Buffer {
  const chunks: Buffer[] = []
  for (const [name, content] of Object.entries(files)) {
    const body = Buffer.from(content, 'utf8')
    const header = Buffer.alloc(512, 0)
    header.write(name, 0, 100, 'utf8')
    writeOctal(header, 100, 8, 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, body.length)
    writeOctal(header, 136, 12, 1_700_000_000)
    header.write('0', 156, 1, 'ascii')
    header.write('ustar\0', 257, 6, 'ascii')
    header.write('00', 263, 2, 'ascii')
    header.fill(0x20, 148, 156)
    let sum = 0
    for (let i = 0; i < 512; i += 1) sum += header[i]!
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
    chunks.push(header)
    if (body.length > 0) {
      const rem = body.length % 512
      chunks.push(rem === 0 ? body : Buffer.concat([body, Buffer.alloc(512 - rem, 0)]))
    }
  }
  chunks.push(Buffer.alloc(1024, 0))
  return zlib.gzipSync(Buffer.concat(chunks))
}

function createSignedPluginTgz(options: {
  packageName: string
  pluginId: string
  pluginName: string
  version: string
  stamped?: boolean
  indexJs?: string
}): { tgz: Buffer; integrity: string; shasum: string } {
  const indexJs = options.indexJs ?? 'module.exports = { ok: true }\n'
  const pkgJsonStr = JSON.stringify(
    {
      name: options.packageName,
      version: options.version,
      description: 'Test npm plugin',
      keywords: ['tuff-plugin'],
      main: './index.js',
      dependencies: {},
      tuff: {
        schemaVersion: 1,
        id: options.pluginId,
        name: options.pluginName,
        sdkapi: CURRENT_SDK_VERSION,
        category: 'utilities'
      }
    },
    null,
    2
  )

  const fileHashes: Record<string, string> = {
    'index.js': `sha256-${createHash('sha256').update(indexJs).digest('hex')}`,
    'package.json': `sha256-${createHash('sha256').update(pkgJsonStr).digest('hex')}`
  }
  const signature = createHash('sha256')
    .update(
      JSON.stringify({
        'index.js': fileHashes['index.js'],
        'package.json': fileHashes['package.json']
      })
    )
    .digest('base64')

  const manifestStr = JSON.stringify(
    {
      id: options.pluginId,
      name: options.pluginName,
      version: options.version,
      description: 'Test npm plugin',
      author: 'Talex',
      main: 'index.js',
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      dev: { enable: false, address: '', source: false },
      ...(options.stamped !== false ? { _files: fileHashes, _signature: signature } : {})
    },
    null,
    2
  )

  const tgz = buildTarGz({
    'package/manifest.json': manifestStr,
    'package/package.json': pkgJsonStr,
    'package/index.js': indexJs
  })

  return {
    tgz,
    integrity: `sha512-${createHash('sha512').update(tgz).digest('base64')}`,
    shasum: createHash('sha1').update(tgz).digest('hex')
  }
}

describe('Provider registry order', () => {
  it('registers default providers in [Tpex, Github, Npm, File] precedence order', () => {
    ensureDefaultProvidersRegistered()
    expect(getRegisteredProviders().map((provider) => provider.type)).toEqual([
      PluginProviderType.TPEX,
      PluginProviderType.GITHUB,
      PluginProviderType.NPM,
      PluginProviderType.FILE
    ])
  })
})

describe('NpmPluginProvider', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    mocks.request.mockReset()
    mocks.downloadToTempFile.mockReset()
    mocks.getEnabledNpmSources.mockReset()
    mocks.getEnabledNpmSources.mockReturnValue([])
  })

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fse.remove(dir)))
  })

  it('strictly validates canHandle() inputs and rejects URLs, tpex:, paths, and archives', () => {
    const provider = new NpmPluginProvider()

    // Accepted sources
    expect(provider.canHandle({ source: 'npm:@talex-touch/clipboard-history-plugin' })).toBe(true)
    expect(provider.canHandle({ source: 'npm:@talex-touch/clipboard-history-plugin@beta' })).toBe(
      true
    )
    expect(provider.canHandle({ source: 'npm:custom-pkg@^1.2.0' })).toBe(true)
    expect(provider.canHandle({ source: '@talex-touch/clipboard-history-plugin' })).toBe(true)
    expect(provider.canHandle({ source: 'tuff-plugin-weather' })).toBe(true)
    expect(provider.canHandle({ source: '@acme/tuff-plugin-weather@1.0.0' })).toBe(true)
    expect(provider.canHandle({ source: '@acme/weather-plugin@latest' })).toBe(true)
    expect(provider.canHandle({ source: 'custom-pkg', hintType: PluginProviderType.NPM })).toBe(
      true
    )

    // Rejected sources
    expect(provider.canHandle({ source: 'tpex:clipboard-history' })).toBe(false)
    expect(
      provider.canHandle({
        source: 'https://registry.npmjs.org/tuff-plugin-a/-/tuff-plugin-a-1.0.0.tgz'
      })
    ).toBe(false)
    expect(
      provider.canHandle({
        source: 'https://registry.npmjs.org/tuff-plugin-a/-/tuff-plugin-a-1.0.0.tgz',
        hintType: PluginProviderType.NPM
      })
    ).toBe(false)
    expect(provider.canHandle({ source: 'file:///tmp/plugin.tgz' })).toBe(false)
    expect(provider.canHandle({ source: '/tmp/plugin.tgz' })).toBe(false)
    expect(provider.canHandle({ source: './local-plugin' })).toBe(false)
    expect(provider.canHandle({ source: '../local-plugin' })).toBe(false)
    expect(provider.canHandle({ source: 'C:\\plugins\\demo.tgz' })).toBe(false)
    expect(provider.canHandle({ source: 'tuff-plugin-demo.tpex' })).toBe(false)
    expect(provider.canHandle({ source: 'tuff-plugin-demo.tgz' })).toBe(false)
    expect(provider.canHandle({ source: 'owner/repo' })).toBe(false)
    expect(provider.canHandle({ source: 'plain-slug-without-hint' })).toBe(false)
  })

  it('resolves dist-tags, exact versions, and non-deprecated semver ranges accurately', () => {
    const packument = {
      name: '@talex-touch/demo-plugin',
      'dist-tags': {
        latest: '1.2.0',
        beta: '2.0.0-beta.1'
      },
      versions: {
        '1.0.0': { version: '1.0.0' },
        '1.2.0': { version: '1.2.0' },
        '1.5.0-alpha.1': { version: '1.5.0-alpha.1' },
        '1.9.0': { version: '1.9.0', deprecated: 'broken release' },
        '2.0.0-beta.1': { version: '2.0.0-beta.1' }
      }
    }

    expect(resolvePackumentVersion(packument)?.resolvedVersion).toBe('1.2.0')
    expect(resolvePackumentVersion(packument)?.distTag).toBe('latest')
    expect(resolvePackumentVersion(packument, 'beta')).toMatchObject({
      resolvedVersion: '2.0.0-beta.1',
      distTag: 'beta'
    })
    const exact = resolvePackumentVersion(packument, '1.0.0')
    expect(exact?.resolvedVersion).toBe('1.0.0')
    expect(exact?.distTag).toBeUndefined()
    // Skips deprecated 1.9.0 and prerelease 1.5.0-alpha.1
    expect(resolvePackumentVersion(packument, '^1.0.0')?.resolvedVersion).toBe('1.2.0')
    expect(satisfiesSemverRange('1.2.3', '~1.2.0')).toBe(true)
    expect(satisfiesSemverRange('1.3.0', '~1.2.0')).toBe(false)
    expect(satisfiesSemverRange('1.4.0', '1.0.0 - 1.5.0')).toBe(true)
  })

  it('enforces official:false trust invariant on @talex-touch/* packages and inspects tarball before returning', async () => {
    const dir = await fse.mkdtemp(path.join(os.tmpdir(), 'npm-provider-test-'))
    tempDirs.push(dir)

    const pkg = createSignedPluginTgz({
      packageName: '@talex-touch/demo-plugin',
      pluginId: 'com.talex.touch.demo',
      pluginName: 'demo',
      version: '1.2.0'
    })
    const tgzPath = path.join(dir, 'demo-1.2.0.tgz')
    await fse.writeFile(tgzPath, pkg.tgz)

    mocks.request.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://registry.npmjs.org/@talex-touch%2Fdemo-plugin',
      data: {
        name: '@talex-touch/demo-plugin',
        'dist-tags': { latest: '1.2.0' },
        versions: {
          '1.2.0': {
            version: '1.2.0',
            dist: {
              tarball:
                'https://registry.npmjs.org/@talex-touch/demo-plugin/-/demo-plugin-1.2.0.tgz',
              integrity: pkg.integrity,
              shasum: pkg.shasum,
              unpackedSize: 4096
            }
          }
        }
      }
    })
    mocks.downloadToTempFile.mockResolvedValueOnce(tgzPath)

    const provider = new NpmPluginProvider()
    const result = await provider.install({
      source: 'npm:@talex-touch/demo-plugin@latest'
    })

    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://registry.npmjs.org/@talex-touch%2Fdemo-plugin',
        headers: { Accept: NPM_ABBREVIATED_PACKUMENT_ACCEPT },
        timeoutMs: 30_000
      })
    )
    expect(result.provider).toBe(PluginProviderType.NPM)
    // Security invariant: @talex-touch/* naming NEVER sets official: true without Nexus attestation
    expect(result.official).toBe(false)
    expect(result.filePath).toBe(tgzPath)
    expect(result.manifest?.name).toBe('demo')
    expect(result.metadata).toMatchObject({
      packageName: '@talex-touch/demo-plugin',
      resolvedVersion: '1.2.0',
      requestedSpec: 'latest',
      distTag: 'latest',
      registry: 'https://registry.npmjs.org',
      integrity: pkg.integrity,
      shasum: pkg.shasum,
      tarballUrl: 'https://registry.npmjs.org/@talex-touch/demo-plugin/-/demo-plugin-1.2.0.tgz',
      trustTier: 'npm-verified',
      officialScope: true,
      unstamped: false
    })
  })

  it('resolves registry precedence (request.metadata.registry -> enabled npmPackage store source -> default) and rejects non-HTTPS', async () => {
    const dir = await fse.mkdtemp(path.join(os.tmpdir(), 'npm-provider-reg-test-'))
    tempDirs.push(dir)

    const pkg = createSignedPluginTgz({
      packageName: 'tuff-plugin-hello',
      pluginId: 'com.community.hello',
      pluginName: 'hello',
      version: '0.5.0',
      stamped: false
    })
    const tgzPath = path.join(dir, 'hello-0.5.0.tgz')
    await fse.writeFile(tgzPath, pkg.tgz)

    mocks.getEnabledNpmSources.mockReturnValue([
      {
        id: 'custom-npm',
        name: 'Custom NPM',
        type: 'npmPackage',
        url: 'https://npm.store.example',
        enabled: true,
        priority: 80,
        trustLevel: 'unverified',
        config: { registryUrl: 'https://registry.store.example/' }
      }
    ])

    mocks.request.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://registry.store.example/tuff-plugin-hello',
      data: {
        name: 'tuff-plugin-hello',
        'dist-tags': { latest: '0.5.0' },
        versions: {
          '0.5.0': {
            version: '0.5.0',
            dist: {
              tarball:
                'https://registry.store.example/tuff-plugin-hello/-/tuff-plugin-hello-0.5.0.tgz',
              integrity: pkg.integrity,
              shasum: pkg.shasum
            }
          }
        }
      }
    })
    mocks.downloadToTempFile.mockResolvedValueOnce(tgzPath)

    const provider = new NpmPluginProvider()
    const result = await provider.install({ source: 'tuff-plugin-hello' })
    expect(mocks.request.mock.calls[0]![0].url).toBe(
      'https://registry.store.example/tuff-plugin-hello'
    )
    expect(result.metadata).toMatchObject({
      registry: 'https://registry.store.example',
      trustTier: 'npm-community',
      officialScope: false,
      unstamped: true
    })

    // Non-HTTPS external registry rejected fail-closed
    await expect(
      provider.install({
        source: 'tuff-plugin-hello',
        metadata: { registry: 'http://evil.registry.example' }
      })
    ).rejects.toThrow('PLUGIN_NPM_REGISTRY_INVALID')

    // Loopback HTTP rejected in packaged mode (allowLocalHttp: false)
    await expect(
      provider.install({
        source: 'tuff-plugin-hello',
        metadata: { registry: 'http://127.0.0.1:4873' }
      })
    ).rejects.toThrow('PLUGIN_NPM_REGISTRY_INVALID')

    // Loopback HTTP permitted in unpackaged dev/test mode (allowLocalHttp: true)
    mocks.request.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://127.0.0.1:4873/tuff-plugin-hello',
      data: {
        name: 'tuff-plugin-hello',
        'dist-tags': { latest: '0.5.0' },
        versions: {
          '0.5.0': {
            version: '0.5.0',
            dist: {
              tarball: 'http://127.0.0.1:4873/tuff-plugin-hello/-/tuff-plugin-hello-0.5.0.tgz',
              integrity: pkg.integrity,
              shasum: pkg.shasum
            }
          }
        }
      }
    })
    mocks.downloadToTempFile.mockResolvedValueOnce(tgzPath)

    const devProvider = new NpmPluginProvider({ allowLocalHttp: true })
    const devResult = await devProvider.install({
      source: 'tuff-plugin-hello',
      metadata: { registry: 'http://127.0.0.1:4873/' }
    })
    expect(devResult.metadata?.registry).toBe('http://127.0.0.1:4873')
  })

  it('cleans up downloaded temp tarball if pre-extraction inspection fails', async () => {
    const dir = await fse.mkdtemp(path.join(os.tmpdir(), 'npm-provider-cleanup-test-'))
    tempDirs.push(dir)

    const pkg = createSignedPluginTgz({
      packageName: 'tuff-plugin-tampered',
      pluginId: 'com.community.tampered',
      pluginName: 'tampered',
      version: '1.0.0'
    })
    const tgzPath = path.join(dir, 'tampered.tgz')
    await fse.writeFile(tgzPath, pkg.tgz)

    mocks.request.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://registry.npmjs.org/tuff-plugin-tampered',
      data: {
        name: 'tuff-plugin-tampered',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            version: '1.0.0',
            dist: {
              tarball: 'https://registry.npmjs.org/tuff-plugin-tampered/-/tampered-1.0.0.tgz',
              integrity: `sha512-${Buffer.alloc(64, 0xff).toString('base64')}`
            }
          }
        }
      }
    })
    mocks.downloadToTempFile.mockResolvedValueOnce(tgzPath)

    const provider = new NpmPluginProvider()
    await expect(provider.install({ source: 'npm:tuff-plugin-tampered' })).rejects.toMatchObject({
      code: 'PLUGIN_NPM_INTEGRITY_MISMATCH'
    })
    expect(await fse.pathExists(tgzPath)).toBe(false)
  })
})
