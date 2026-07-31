import type { TempFileService } from '../../service/temp-file.service'
import type { PluginApiUninstallRequest } from '@talex-touch/utils/transport/events/types'
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProductionPluginDataDispositionCoordinator,
  type ProductionPluginDataDispositionOwner
} from './plugin-data-disposition-production'

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: vi.fn(async () => ({ canceled: true }))
  }
}))

const roots: string[] = []

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function createHarness(
  onInvalidate?: (owner: ProductionPluginDataDispositionOwner) => Promise<void>
) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'plugin-disposition-production-'))
  roots.push(temporaryRoot)
  const root = await realpath(temporaryRoot)
  const dataRootPath = join(root, 'data', 'touch-fixture')
  const codePath = join(root, 'plugins', 'touch-fixture-folder')
  await mkdir(join(dataRootPath, 'cache'), { recursive: true })
  await mkdir(join(dataRootPath, 'temp'), { recursive: true })
  await mkdir(codePath, { recursive: true })
  await writeFile(join(dataRootPath, 'ordinary.json'), 'ordinary')
  await writeFile(join(dataRootPath, 'cache', 'cache.bin'), 'cache')
  await writeFile(join(codePath, 'manifest.json'), '{}')

  const owner: ProductionPluginDataDispositionOwner = Object.freeze({
    pluginName: 'touch-fixture',
    folderName: 'touch-fixture-folder',
    pluginInstanceId: 'fixture-instance',
    activationGeneration: 3,
    dataRootPath,
    codePath
  })
  let currentOwner: ProductionPluginDataDispositionOwner | null = owner
  let pluginDataCount = 1
  const namespaces = new Map<string, unknown>()
  const tempFileService = {
    getNamespaceConfig: vi.fn((namespace: string) => namespaces.get(namespace) ?? null),
    registerNamespace: vi.fn((config: { namespace: string }) => {
      namespaces.set(config.namespace, config)
    }),
    cleanupNamespace: vi.fn(async () => ({
      deletedItemCount: 0,
      deletedByteCount: 0,
      failedItemCount: 0,
      bounded: false,
      cancelled: false
    })),
    inspectNamespace: vi.fn(async () => ({
      itemCount: 0,
      byteCount: 0,
      failedItemCount: 0,
      bounded: false,
      cancelled: false
    }))
  } as unknown as TempFileService

  const coordinator = createProductionPluginDataDispositionCoordinator({
    secureStoreRootPath: '',
    dbUtils: {
      listPluginData: async () => [],
      countPluginData: async () => pluginDataCount,
      deletePluginData: async () => {
        pluginDataCount = 0
      }
    },
    tempFileService,
    resolveOwner: () => currentOwner,
    canStart: () => true,
    closeAdmission: async () => 'completed',
    closeRuntime: async () => 'completed',
    closeLogger: async () => 'completed',
    revokePermissions: async () => undefined,
    invalidateAuthority: async (current) => {
      await onInvalidate?.(current)
    },
    inspectAuthorityResiduals: async () => ({
      runtime: false,
      permissions: false,
      pendingAuthority: false
    }),
    purgeSecrets: async () => undefined,
    deletePluginRow: async () => {
      pluginDataCount = 0
    },
    finalize: async () => {
      currentOwner = null
      return 'completed'
    },
    reportUninstall: async () => 'completed'
  })

  const request: PluginApiUninstallRequest = Object.freeze({
    version: 1,
    plugin: Object.freeze({
      name: owner.pluginName,
      pluginInstanceId: owner.pluginInstanceId,
      activationGeneration: owner.activationGeneration
    }),
    disposition: Object.freeze({
      confirmation: 'delete-plugin-and-data',
      ordinaryExport: Object.freeze({ enabled: false }),
      portableSecretBackup: Object.freeze({ enabled: false })
    })
  })

  return { coordinator, request, owner, root }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('production plugin data disposition identity', () => {
  it('removes the pinned data and code roots on a complete uninstall', async () => {
    const harness = await createHarness()

    const result = await harness.coordinator.uninstall(harness.request)

    expect(result).toMatchObject({ success: true, installed: false })
    expect(await exists(harness.owner.dataRootPath)).toBe(false)
    expect(await exists(harness.owner.codePath)).toBe(false)
  })

  it('does not delete a replacement data root with a different identity', async () => {
    let parkedRoot = ''
    const harness = await createHarness(async (owner) => {
      parkedRoot = join(harness.root, 'parked-original-data')
      await rename(owner.dataRootPath, parkedRoot)
      await mkdir(owner.dataRootPath, { recursive: true })
      await writeFile(join(owner.dataRootPath, 'replacement.txt'), 'replacement-must-survive')
    })

    const result = await harness.coordinator.uninstall(harness.request)

    expect(result).toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED',
      installed: true
    })
    await expect(
      readFile(join(harness.owner.dataRootPath, 'replacement.txt'), 'utf8')
    ).resolves.toBe('replacement-must-survive')
    await expect(readFile(join(parkedRoot, 'ordinary.json'), 'utf8')).resolves.toBe('ordinary')
    expect(await exists(harness.owner.codePath)).toBe(true)
  })

  it('does not delete a replacement code root with a different identity', async () => {
    let parkedRoot = ''
    const harness = await createHarness(async (owner) => {
      parkedRoot = join(harness.root, 'parked-original-code')
      await rename(owner.codePath, parkedRoot)
      await mkdir(owner.codePath, { recursive: true })
      await writeFile(join(owner.codePath, 'replacement.txt'), 'replacement-code-must-survive')
    })

    const result = await harness.coordinator.uninstall(harness.request)

    expect(result).toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED',
      installed: true
    })
    await expect(readFile(join(harness.owner.codePath, 'replacement.txt'), 'utf8')).resolves.toBe(
      'replacement-code-must-survive'
    )
    await expect(readFile(join(parkedRoot, 'manifest.json'), 'utf8')).resolves.toBe('{}')
  })
})
