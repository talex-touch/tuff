import os from 'node:os'
import path from 'node:path'
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
      name: 'validate-demo',
      version: '1.0.0',
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
        expect.stringContaining('sdkapi 260421 is not a supported SDK marker'),
      )
    })
  })

  it('rejects future sdkapi markers until runtime support is explicit', async () => {
    await withTempDir('tuff-validate-', async (root) => {
      const manifestPath = await writeManifest(root, { sdkapi: 260501 })

      await expect(runValidate(['--manifest', manifestPath])).rejects.toThrow(
        'Manifest validation failed',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('sdkapi 260501 is not a supported SDK marker'),
      )
    })
  })

  it('accepts supported historical markers with an upgrade warning', async () => {
    await withTempDir('tuff-validate-', async (root) => {
      const manifestPath = await writeManifest(root, { sdkapi: 260228 })

      await expect(runValidate(['--manifest', manifestPath])).resolves.toBeUndefined()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Manifest is valid'))
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Outdated sdkapi (260228). Recommended: 260428'),
      )
    })
  })
})
