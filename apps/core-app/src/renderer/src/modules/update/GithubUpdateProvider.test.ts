import { describe, expect, it, vi } from 'vitest'
import type { GitHubRelease } from '@talex-touch/utils'
import { GithubUpdateProvider } from './GithubUpdateProvider'

vi.mock('talex-touch:information', () => ({
  default: {
    version: '2.5.0'
  }
}))

describe('GithubUpdateProvider release integrity metadata', () => {
  it('keeps artifact signatures paired with downloadable assets', () => {
    const provider = new GithubUpdateProvider()
    const release = {
      tag_name: 'v2.5.0',
      name: 'Tuff v2.5.0',
      published_at: '2026-06-21T00:00:00.000Z',
      body: 'Release',
      assets: [
        {
          name: 'Tuff-2.5.0-windows-x64.exe',
          url: 'https://api.github.com/repos/talex-touch/tuff/releases/assets/1',
          browser_download_url:
            'https://github.com/talex-touch/tuff/releases/download/v2.5.0/Tuff-2.5.0-windows-x64.exe',
          size: 128,
          sha256: 'b'.repeat(64)
        },
        {
          name: 'Tuff-2.5.0-windows-x64.exe.sig',
          url: 'https://api.github.com/repos/talex-touch/tuff/releases/assets/2',
          browser_download_url:
            'https://github.com/talex-touch/tuff/releases/download/v2.5.0/Tuff-2.5.0-windows-x64.exe.sig',
          size: 512
        }
      ]
    } as unknown as GitHubRelease

    expect(provider.getDownloadAssets(release)).toEqual([
      expect.objectContaining({
        name: 'Tuff-2.5.0-windows-x64.exe',
        checksum: 'b'.repeat(64),
        signatureUrl:
          'https://github.com/talex-touch/tuff/releases/download/v2.5.0/Tuff-2.5.0-windows-x64.exe.sig'
      })
    ])
  })
})
