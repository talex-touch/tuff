import type { NetworkRequestOptions, NetworkResponse } from '../../network'
import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { networkClient } from '../../network'
import { TpexProvider } from '../../plugin/providers/tpex-provider'

function makeResponse<T>(options: NetworkRequestOptions, data: T, status = 200): NetworkResponse<T> {
  return {
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: {},
    data,
    url: options.url,
    ok: status >= 200 && status < 300,
  }
}

describe('TpexProvider URL/filename/temp hardening', () => {
  const createdDirs: string[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(createdDirs.splice(0).map(dir => fs.remove(dir)))
  })

  it('URL-encodes slug in getPlugin requests', async () => {
    const requestSpy = vi.spyOn(networkClient, 'request').mockImplementation(async (opts: NetworkRequestOptions) => {
      return makeResponse(opts, { plugin: { id: '1', slug: 'a/b?x=1' } })
    })

    const provider = new TpexProvider('https://nexus.example.com')
    await provider.getPlugin('a/b?x=1')

    expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://nexus.example.com/api/store/plugins/a%2Fb%3Fx%3D1',
    }))
  })

  it('rejects non-http(s) packageUrl schemes during registry install', async () => {
    for (const badUrl of ['file:///etc/passwd', 'javascript:alert(1)', '//evil.example/a.tpex']) {
      vi.spyOn(networkClient, 'request').mockImplementationOnce(async (opts: NetworkRequestOptions) => {
        return makeResponse(opts, {
          plugin: {
            id: '1',
            slug: 'demo-plugin',
            name: 'Demo',
            summary: 'Demo',
            category: 'utilities',
            installs: 0,
            isOfficial: false,
            badges: [],
            latestVersion: {
              id: 'v1',
              version: '1.0.0',
              channel: 'RELEASE',
              packageUrl: badUrl,
              packageSize: 10,
              artifactSha256: 'a'.repeat(64),
              nexusAttestation: { payload: { pluginId: 'demo', pluginName: 'Demo' } },
            },
          },
        })
      })

      const provider = new TpexProvider('https://nexus.example.com')
      await expect(provider.install({ source: 'tpex:demo-plugin' })).rejects.toThrow(/download URL/i)
    }
  })

  it('sanitizes version in filenames and creates an isolated mkdtemp directory when tempDir is omitted', async () => {
    const bytes = new TextEncoder().encode('tpex-bytes').buffer
    vi.spyOn(networkClient, 'request').mockImplementation(async (opts: NetworkRequestOptions) => {
      if (opts.responseType === 'arrayBuffer')
        return makeResponse(opts, bytes)
      return makeResponse(opts, {
        plugin: {
          id: '1',
          slug: 'demo-plugin',
          name: 'Demo',
          summary: 'Demo',
          category: 'utilities',
          installs: 0,
          isOfficial: false,
          badges: [],
          latestVersion: {
            id: 'v1',
            version: '../../evil/1.0.0',
            channel: 'RELEASE',
            packageUrl: '/api/store/plugins/demo-plugin/download',
            packageSize: 10,
            artifactSha256: 'a'.repeat(64),
            nexusAttestation: { payload: { pluginId: 'demo', pluginName: 'Demo' } },
          },
        },
      })
    })

    const provider = new TpexProvider('https://nexus.example.com')
    const result = await provider.install({ source: 'tpex:demo-plugin' })
    const dir = path.dirname(result.filePath)
    createdDirs.push(dir)

    expect(path.basename(dir)).toMatch(/^tuff-tpex-/)
    expect(path.basename(result.filePath)).toBe('demo-plugin-evil-1.0.0.tpex')
    expect(await fs.readFile(result.filePath, 'utf8')).toBe('tpex-bytes')

    // Also verify installFromFile uses mkdtemp rather than predictable /tmp/tpex-${Date.now()}.tpex
    vi.spyOn(networkClient, 'request').mockResolvedValueOnce(
      makeResponse({ method: 'GET', url: 'https://nexus.example.com/demo.tpex' }, new TextEncoder().encode('file-bytes').buffer),
    )
    const fileResult = await provider.install({ source: 'https://nexus.example.com/demo.tpex' })
    const fileDir = path.dirname(fileResult.filePath)
    createdDirs.push(fileDir)
    expect(path.basename(fileDir)).toMatch(/^tuff-tpex-/)
    expect(await fs.readFile(fileResult.filePath, 'utf8')).toBe('file-bytes')
  })
})
