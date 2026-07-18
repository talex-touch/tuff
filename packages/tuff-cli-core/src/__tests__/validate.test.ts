import os from 'node:os'
import path from 'node:path'
import { CURRENT_SDK_VERSION } from '@talex-touch/utils/plugin/sdk-version'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runValidate } from '../validate'

async function withTempDir(prefix: string, fn: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  try {
    await fn(root)
  }
  finally {
    await fs.remove(root)
  }
}

async function writeManifest(root: string, manifest: Record<string, unknown>): Promise<string> {
  const manifestPath = path.join(root, 'manifest.json')
  await fs.writeJson(
    manifestPath,
    {
      id: 'com.tuffex.validate-demo',
      name: 'validate-demo',
      version: '1.0.0',
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['clipboard.read'],
        optional: [],
      },
      ...manifest,
    },
    { spaces: 2 },
  )
  return manifestPath
}

describe('manifest validate', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects non-canonical sdkapi markers instead of warning only', async () => {
    await withTempDir('tuff-validate-', async (root) => {
      const manifestPath = await writeManifest(root, { sdkapi: 260421 })

      await expect(runValidate(['--manifest', manifestPath])).rejects.toThrow(
        'Manifest validation failed',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '✖ PLUGIN_PACKAGE_MANIFEST_SDKAPI_INCOMPATIBLE at manifest.sdkapi',
      )
    })
  })

  it('rejects future sdkapi markers until runtime support is explicit', async () => {
    await withTempDir('tuff-validate-', async (root) => {
      const manifestPath = await writeManifest(root, { sdkapi: 260701 })

      await expect(runValidate(['--manifest', manifestPath])).rejects.toThrow(
        'Manifest validation failed',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '✖ PLUGIN_PACKAGE_MANIFEST_SDKAPI_INCOMPATIBLE at manifest.sdkapi',
      )
    })
  })

  it('accepts supported historical markers with an upgrade warning', async () => {
    await withTempDir('tuff-validate-', async (root) => {
      const manifestPath = await writeManifest(root, { sdkapi: 260228 })

      await expect(runValidate(['--manifest', manifestPath])).resolves.toBeUndefined()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Manifest is valid'))
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Outdated sdkapi (260228). Recommended: ${CURRENT_SDK_VERSION}`),
      )
    })
  })
})
