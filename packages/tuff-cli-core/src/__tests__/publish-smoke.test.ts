import type { NetworkRequestOptions, NetworkResponse } from '@talex-touch/utils/network'
import os from 'node:os'
import path from 'node:path'
import { networkClient } from '@talex-touch/utils/network'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publish } from '../publish'

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

async function withPluginFixture(
  callback: (root: string) => Promise<void>,
  manifestOverrides: Record<string, unknown> = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-publish-'))
  const previousCwd = process.cwd()

  try {
    process.chdir(root)
    await fs.writeJson(path.join(root, 'package.json'), {
      name: 'demo-plugin',
      version: '1.0.0',
    })
    await fs.writeJson(path.join(root, 'manifest.json'), {
      id: 'com.tuffex.demo-plugin',
      name: 'demo-plugin',
      version: '1.0.0',
      ...manifestOverrides,
    })

    const buildDir = path.join(root, 'dist', 'build')
    await fs.ensureDir(buildDir)
    await fs.writeFile(path.join(buildDir, 'demo-plugin-1.0.0.tpex'), 'dummy')

    await callback(root)
  }
  finally {
    process.chdir(previousCwd)
    await fs.remove(root)
  }
}

describe('publish', () => {
  const previousToken = process.env.TUFF_AUTH_TOKEN
  const previousExitCode = process.exitCode

  beforeEach(() => {
    process.env.TUFF_AUTH_TOKEN = 'test-token'
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
      if (options.method === 'GET') {
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

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0]?.[0].url).toContain('/api/dashboard/plugins')
    expect(request.mock.calls[1]?.[0].url).toContain('/api/dashboard/plugins/plugin-1/versions')
  })

  it('rejects 200 HTML responses from the publish endpoint', async () => {
    vi.spyOn(networkClient, 'request').mockImplementation(async (options: NetworkRequestOptions) => {
      if (options.method === 'GET') {
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
      return textResponse(options, JSON.stringify({
        total: 1,
        plugins: [{ id: 'plugin-2', slug: 'com.tuffex.other' }],
      }))
    })

    await withPluginFixture(async () => {
      await publish({ notes: 'First release' })
      expect(process.exitCode).toBe(1)
    })

    expect(request).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('was not found'))
  })
})
