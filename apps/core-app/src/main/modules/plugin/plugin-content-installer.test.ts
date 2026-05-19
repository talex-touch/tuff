import type { PluginContentPackage } from '@talex-touch/utils/types/cloud-share'
import type { TouchPlugin } from './plugin'
import { describe, expect, it, vi } from 'vitest'
import { installPluginContentPackageToLocalPlugin } from './plugin-content-installer'

function createPackage(overrides: Partial<PluginContentPackage> = {}): PluginContentPackage {
  return {
    id: 'pkg-1',
    pluginId: 'touch-snippets',
    kind: 'snippet-pack',
    title: 'React snippets',
    summary: null,
    schemaVersion: 1,
    visibility: 'public',
    manifest: {
      importTarget: 'touch-snippets',
      format: 'tuff.snippet-pack+json'
    },
    contentRef: null,
    contentInline: {
      format: 'tuff.snippet-pack+json',
      title: 'React snippets',
      snippets: [
        {
          id: 'existing',
          title: 'Imported',
          content: 'new content'
        },
        {
          id: 'fresh',
          title: 'Fresh',
          content: 'fresh content'
        }
      ],
      skippedSensitiveCount: 1
    },
    createdBy: 'user-1',
    status: 'published',
    installCount: 0,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    publishedAt: '2026-05-17T00:00:00.000Z',
    ...overrides
  }
}

function createPlugin(
  options: {
    current?: unknown
    saveResult?: { success: boolean; error?: string }
  } = {}
) {
  const savePluginFile = vi.fn(() => options.saveResult ?? { success: true })
  const getPluginFile = vi.fn(
    () =>
      options.current ?? {
        version: 1,
        snippets: [
          {
            id: 'existing',
            title: 'Existing',
            content: 'old content'
          }
        ]
      }
  )

  return {
    plugin: {
      getPluginFile,
      savePluginFile
    } as unknown as TouchPlugin,
    getPluginFile,
    savePluginFile
  }
}

describe('installPluginContentPackageToLocalPlugin', () => {
  it('imports a supported touch-snippets package into local plugin storage', () => {
    vi.useFakeTimers()
    vi.setSystemTime(456)

    try {
      const { plugin, savePluginFile } = createPlugin()
      const result = installPluginContentPackageToLocalPlugin(
        {
          getPluginByName: () => plugin
        },
        {
          packageId: 'pkg-1',
          targetPluginName: 'touch-snippets',
          contentPackage: createPackage()
        }
      )

      expect(result).toEqual({
        success: true,
        importedCount: 2,
        skippedCount: 1
      })
      expect(savePluginFile).toHaveBeenCalledWith('snippets.json', {
        version: 1,
        snippets: expect.arrayContaining([
          expect.objectContaining({ id: 'existing-imported-456-0', title: 'Imported' }),
          expect.objectContaining({ id: 'fresh', title: 'Fresh' }),
          expect.objectContaining({ id: 'existing', title: 'Existing' })
        ])
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('requires the target plugin to be installed before writing storage', () => {
    const result = installPluginContentPackageToLocalPlugin(
      {
        getPluginByName: () => undefined
      },
      {
        packageId: 'pkg-1',
        targetPluginName: 'touch-snippets',
        contentPackage: createPackage()
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'TARGET_PLUGIN_NOT_INSTALLED'
    })
  })

  it('rejects unsupported import target and format before touching plugin storage', () => {
    const getPluginByName = vi.fn()

    expect(
      installPluginContentPackageToLocalPlugin(
        { getPluginByName },
        {
          packageId: 'pkg-1',
          targetPluginName: 'other-plugin',
          contentPackage: createPackage()
        }
      )
    ).toEqual({
      success: false,
      error: 'UNSUPPORTED_TARGET_PLUGIN'
    })

    expect(
      installPluginContentPackageToLocalPlugin(
        { getPluginByName },
        {
          packageId: 'pkg-1',
          targetPluginName: 'touch-snippets',
          contentPackage: createPackage({
            manifest: {
              importTarget: 'touch-snippets',
              format: 'application/json'
            }
          })
        }
      )
    ).toEqual({
      success: false,
      error: 'UNSUPPORTED_CONTENT_FORMAT'
    })

    expect(getPluginByName).not.toHaveBeenCalled()
  })

  it('returns a clear write failure when plugin storage save fails', () => {
    const { plugin } = createPlugin({
      saveResult: { success: false, error: 'DISK_FULL' }
    })

    const result = installPluginContentPackageToLocalPlugin(
      {
        getPluginByName: () => plugin
      },
      {
        packageId: 'pkg-1',
        targetPluginName: 'touch-snippets',
        contentPackage: createPackage()
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'DISK_FULL'
    })
  })
})
