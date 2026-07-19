import type { NetworkRequestOptions, NetworkResponse } from '@talex-touch/utils/network'
import { Buffer } from 'node:buffer'
import { createHash, generateKeyPairSync } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { networkClient } from '@talex-touch/utils/network'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publish } from '../publish'

const expiredAppJwt = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJleHAiOjEsImd0IjoibG9uZyIsImRldmljZUlkIjoiZGV2aWNlLTEifQ',
  'signature',
].join('.')

const freshAppJwt = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJleHAiOjQxMDI0NDQ4MDAsImd0IjoibG9uZyIsImRldmljZUlkIjoiZGV2aWNlLTEifQ',
  'signature',
].join('.')

const publisherSigningPrivateKey = generateKeyPairSync('ed25519')
  .privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString()

function textResponse(
  options: NetworkRequestOptions,
  data: string,
  init: {
    status?: number
    statusText?: string
    headers?: Record<string, string>
  } = {},
): NetworkResponse<string> {
  const status = init.status ?? 200
  return {
    status,
    statusText: init.statusText ?? (status >= 200 && status < 300 ? 'OK' : 'Error'),
    headers: init.headers ?? { 'content-type': 'application/json' },
    data,
    url: options.url,
    ok: status >= 200 && status < 300,
  }
}

const TAR_BLOCK_SIZE = 512

function writeOctal(buffer: Buffer, value: number, start: number, length: number) {
  buffer.write(`${value.toString(8).padStart(length - 1, '0')}\0`, start, length, 'ascii')
}

function createTarEntry(name: string, content: string): Buffer {
  const contentBuffer = Buffer.from(content)
  const header = Buffer.alloc(TAR_BLOCK_SIZE)
  header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8')
  writeOctal(header, 0o644, 100, 8)
  writeOctal(header, contentBuffer.length, 124, 12)
  header.fill(' ', 148, 156)
  header.write('0', 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header)
    checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  const padding = Buffer.alloc((TAR_BLOCK_SIZE - (contentBuffer.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE)
  return Buffer.concat([header, contentBuffer, padding])
}

function createTpex(manifest: { id: string, name: string, version: string }): Buffer {
  const source = 'export const ready = true\n'
  const files = { 'index.js': `sha256-${createHash('sha256').update(source).digest('hex')}` }
  const archiveManifest = {
    ...manifest,
    sdkapi: 260428,
    category: 'utilities',
    permissions: { required: [], optional: [] },
    _files: files,
    _signature: createHash('md5').update(JSON.stringify(files)).digest('base64'),
  }
  return Buffer.concat([
    createTarEntry('index.js', source),
    createTarEntry('manifest.json', JSON.stringify(archiveManifest)),
    Buffer.alloc(TAR_BLOCK_SIZE * 2),
  ])
}

async function withPluginFixture(
  callback: (root: string) => Promise<void>,
  manifestOverrides: Record<string, unknown> = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-publish-'))
  const previousCwd = process.cwd()
  const manifest = {
    id: 'com.tuffex.demo-plugin',
    name: 'demo-plugin',
    version: '1.0.0',
    ...manifestOverrides,
  }

  try {
    process.chdir(root)
    await fs.writeJson(path.join(root, 'package.json'), {
      name: manifest.name,
      version: manifest.version,
    })
    await fs.writeJson(path.join(root, 'manifest.json'), manifest)

    const buildDir = path.join(root, 'dist', 'build')
    await fs.ensureDir(buildDir)
    await fs.writeFile(
      path.join(buildDir, `${manifest.name}-${manifest.version}.tpex`),
      createTpex(manifest),
    )

    await callback(root)
  }
  finally {
    process.chdir(previousCwd)
    await fs.remove(root)
  }
}

describe('publish', () => {
  const previousToken = process.env.TUFF_AUTH_TOKEN
  const previousConfigDir = process.env.TUFF_CONFIG_DIR
  const previousSigningKey = process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM
  const previousSigningKeyId = process.env.TUFF_PLUGIN_SIGNING_KEY_ID
  const previousExitCode = process.exitCode

  beforeEach(() => {
    process.env.TUFF_AUTH_TOKEN = 'test-token'
    process.env.TUFF_CONFIG_DIR = path.join(os.tmpdir(), `tuff-cli-core-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM = publisherSigningPrivateKey
    process.env.TUFF_PLUGIN_SIGNING_KEY_ID = 'publish-smoke-key'
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousToken === undefined)
      delete process.env.TUFF_AUTH_TOKEN
    else
      process.env.TUFF_AUTH_TOKEN = previousToken
    if (previousConfigDir === undefined)
      delete process.env.TUFF_CONFIG_DIR
    else
      process.env.TUFF_CONFIG_DIR = previousConfigDir
    if (previousSigningKey === undefined)
      delete process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM
    else
      process.env.TUFF_PLUGIN_SIGNING_PRIVATE_KEY_PEM = previousSigningKey
    if (previousSigningKeyId === undefined)
      delete process.env.TUFF_PLUGIN_SIGNING_KEY_ID
    else
      process.env.TUFF_PLUGIN_SIGNING_KEY_ID = previousSigningKeyId
    process.exitCode = previousExitCode
  })

  it('runs dry-run publish with minimal package', async () => {
    await withPluginFixture(async () => {
      await publish({ dryRun: true })
      expect(process.exitCode).toBeUndefined()
    })
  })

  it('publishes through the Dashboard version endpoint', async () => {
    const request = vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      if (options.method === 'GET' && options.url.includes('/api/dashboard/auth/publisher')) {
        return textResponse(options, JSON.stringify({
          ok: true,
          userId: 'user-1',
          authType: 'app',
          role: 'admin',
        }))
      }

      if (options.method === 'GET' && options.url.includes('/api/dashboard/plugins')) {
        return textResponse(options, JSON.stringify({
          total: 1,
          plugins: [
            {
              id: 'plugin-1',
              slug: 'com.tuffex.demo.plugin',
              name: 'demo-plugin',
            },
          ],
        }))
      }

      if (options.method === 'POST') {
        return textResponse(options, JSON.stringify({
          version: {
            id: 'version-1',
            version: '1.0.0',
            status: 'pending',
            channel: 'RELEASE',
          },
        }))
      }

      throw new Error(`Unexpected request: ${options.method} ${options.url}`)
    })

    await withPluginFixture(async () => {
      await publish({ notes: 'First release' })
      expect(process.exitCode).toBeUndefined()
    })

    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls[0]?.[0].url).toContain('/api/dashboard/auth/publisher')
    expect(request.mock.calls[1]?.[0].url).toContain('/api/dashboard/plugins')
    expect(request.mock.calls[2]?.[0].url).toContain('/api/dashboard/plugins/plugin-1/versions')
    expect(request.mock.calls[2]?.[0].headers).toMatchObject({
      'Authorization': 'Bearer test-token',
      'X-Device-Client': 'cli',
    })
  })

  it('refreshes an expired app jwt before publish preflight continues', async () => {
    process.env.TUFF_AUTH_TOKEN = expiredAppJwt

    const request = vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      const authHeader = String(options.headers?.Authorization || '')
      if (options.method === 'GET' && options.url.includes('/api/dashboard/auth/publisher')) {
        if (authHeader === `Bearer ${expiredAppJwt}`) {
          return textResponse(
            options,
            JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
            { status: 401 },
          )
        }
        return textResponse(options, JSON.stringify({
          ok: true,
          userId: 'user-1',
          authType: 'app',
          role: 'admin',
        }))
      }

      if (options.method === 'GET' && options.url.includes('/api/dashboard/plugins')) {
        return textResponse(options, JSON.stringify({
          total: 1,
          plugins: [
            {
              id: 'plugin-1',
              slug: 'com.tuffex.demo.plugin',
              name: 'demo-plugin',
            },
          ],
        }))
      }

      if (options.method === 'POST') {
        return textResponse(options, JSON.stringify({
          version: {
            id: 'version-1',
            version: '1.0.0',
            status: 'pending',
            channel: 'RELEASE',
          },
        }))
      }

      throw new Error(`Unexpected request: ${options.method} ${options.url}`)
    })

    const refreshAppJwt = vi.fn(async () => freshAppJwt)

    await withPluginFixture(async () => {
      await publish({ notes: 'First release' }, { refreshAppJwt })
      expect(process.exitCode).toBeUndefined()
    })

    expect(refreshAppJwt).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[1]?.[0].headers).toMatchObject({
      'Authorization': `Bearer ${freshAppJwt}`,
      'X-Device-Client': 'cli',
    })
    expect(request.mock.calls[3]?.[0].headers).toMatchObject({
      'Authorization': `Bearer ${freshAppJwt}`,
      'X-Device-Client': 'cli',
    })
  })

  it('fails fast when api key preflight reports missing publish scopes', async () => {
    process.env.TUFF_AUTH_TOKEN = 'tuff_missing_scope'

    const request = vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      return textResponse(options, JSON.stringify({
        ok: true,
        userId: 'user-1',
        authType: 'apiKey',
        role: 'admin',
        scopes: ['plugin:read'],
      }))
    })

    await withPluginFixture(async () => {
      await publish({ notes: 'First release' })
      expect(process.exitCode).toBe(1)
    })

    expect(request).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('missing required scopes'))
  })

  it('fails closed when non-interactive publish cannot refresh an expired app jwt', async () => {
    process.env.TUFF_AUTH_TOKEN = expiredAppJwt

    vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      return textResponse(
        options,
        JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
        { status: 401 },
      )
    })

    const refreshAppJwt = vi.fn(async () => null)

    await withPluginFixture(async () => {
      await publish({ notes: 'First release', nonInteractive: true }, { refreshAppJwt })
      expect(process.exitCode).toBe(1)
    })

    expect(refreshAppJwt).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Publisher authentication was rejected by Nexus before publish'))
  })

  it('rejects 200 HTML responses from the publish endpoint', async () => {
    vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      if (options.method === 'GET' && options.url.includes('/api/dashboard/auth/publisher')) {
        return textResponse(options, JSON.stringify({ ok: true, userId: 'user-1' }))
      }

      if (options.method === 'GET' && options.url.includes('/api/dashboard/plugins')) {
        return textResponse(options, JSON.stringify({
          total: 1,
          plugins: [{ id: 'plugin-1', slug: 'com.tuffex.demo.plugin' }],
        }))
      }

      return textResponse(
        options,
        '<!DOCTYPE html><html><body>/api/store/plugins/publish does not exist</body></html>',
        { headers: { 'content-type': 'text/html;charset=utf-8' } },
      )
    })

    await withPluginFixture(async () => {
      await publish({ notes: 'First release' })
      expect(process.exitCode).toBe(1)
    })

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('returned HTML instead of JSON'))
  })

  it('fails clearly when the Dashboard plugin cannot be found', async () => {
    const request = vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      if (options.url.includes('/api/dashboard/auth/publisher')) {
        return textResponse(options, JSON.stringify({ ok: true, userId: 'user-1' }))
      }

      return textResponse(options, JSON.stringify({
        total: 1,
        plugins: [{ id: 'plugin-2', slug: 'com.tuffex.other' }],
      }))
    })

    await withPluginFixture(async () => {
      await publish({ notes: 'First release' })
      expect(process.exitCode).toBe(1)
    })

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0]?.[0].url).toContain('/api/dashboard/auth/publisher')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('was not found'))
  })

  it('fails before package resolution when auth token is rejected by Nexus', async () => {
    const request = vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      return textResponse(
        options,
        JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
        { status: 401 },
      )
    })

    await withPluginFixture(async () => {
      await publish({ notes: 'First release' })
      expect(process.exitCode).toBe(1)
    })

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0].url).toContain('/api/dashboard/auth/publisher')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Publisher authentication was rejected by Nexus before publish'))
  })
})
