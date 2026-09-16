import type { AppIndexManagedEntry } from '@talex-touch/utils/transport/events/types'
import type { DbUtils } from '../../../../../db/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Electron-backed shortcut store, behind the lazy `global-shortcon` import
 * `AppShortcutService` reaches for. Only the accelerator lookup is load-bearing here;
 * everything else on the module is a stub so the import graph stays out of this suite.
 */
const shortcutStore = vi.hoisted(() => new Map<string, string>())

vi.mock('electron', () => ({
  app: { getLocale: vi.fn(() => 'zh-CN') },
  shell: {},
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  MessageChannelMain: class {}
}))

vi.mock('../../../../global-shortcon', () => ({
  shortcutModule: {
    getShortcutAccelerator: (shortcutId: string) => shortcutStore.get(shortcutId) ?? null,
    setAppShortcut: () => true,
    removeAppShortcut: () => undefined
  }
}))

import { AppManagedEntryActionsService } from './app-managed-entry-actions-service'
import { AppUserAliasService } from './app-user-alias-service'

const ALPHA_PATH = '/Applications/Alpha.app'
const BETA_PATH = '/Applications/Beta.app'

function managedEntry(path: string, bundleId?: string): AppIndexManagedEntry {
  return {
    path,
    name: path.replace('/Applications/', ''),
    enabled: true,
    bundleId,
    launchKind: 'path',
    launchTarget: path
  }
}

/**
 * What `AppUsageQueryService.countAll` awaits: `select().from().where()` over the usage
 * aggregate table. A row per app id, exactly as the real indexed read returns them.
 */
function usageCountDb(rows: Array<{ itemId: string; executeCount: number }>): DbUtils {
  return {
    getDb: () => ({
      select: () => ({ from: () => ({ where: async () => rows }) })
    })
  } as unknown as DbUtils
}

/** The config-table read `AppUserAliasService.load` performs: `…where().limit(1)`. */
function aliasConfigDb(value: string | null): DbUtils {
  return {
    getDb: () => ({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ value }] }) }) })
    })
  } as unknown as DbUtils
}

async function loadedAliases(seed: Record<string, string[]>): Promise<AppUserAliasService> {
  const aliases = new AppUserAliasService({
    getDbUtils: () => aliasConfigDb(JSON.stringify(seed))
  })
  await aliases.load()
  return aliases
}

function createService(options: {
  getDbUtils: () => DbUtils | null
  entries: AppIndexManagedEntry[]
  aliases?: AppUserAliasService
}): AppManagedEntryActionsService {
  return new AppManagedEntryActionsService({
    getDbUtils: options.getDbUtils,
    listEntries: async () => options.entries,
    aliases: options.aliases ?? new AppUserAliasService({ getDbUtils: () => null }),
    // `listSummaries` is a read; reaching the projection writer would be a defect, not a stub gap.
    mapDbAppToScannedInfo: () => {
      throw new Error('listSummaries must not map a row for the search projection')
    },
    toExtensionMap: () => ({}),
    publishUpsert: async () => {
      throw new Error('listSummaries must not publish a search projection')
    },
    runMutation: async (operation) => await operation()
  })
}

beforeEach(() => {
  shortcutStore.clear()
})

describe('AppManagedEntryActionsService.listSummaries', () => {
  it('reports db-not-ready instead of a zeroed launch count when the database is unavailable', async () => {
    const service = createService({
      getDbUtils: () => null,
      entries: [managedEntry(ALPHA_PATH, 'com.example.alpha')]
    })

    const result = await service.listSummaries()

    // A readable entry list with an unreadable usage aggregate must not look like
    // "every application has never been launched".
    expect(result).toEqual({ success: false, reason: 'db-not-ready' })
  })

  it('succeeds with no summaries when the index holds no managed entries', async () => {
    const service = createService({
      getDbUtils: () => usageCountDb([]),
      entries: []
    })

    const result = await service.listSummaries()

    expect(result).toEqual({ success: true, summaries: [] })
  })

  it('summarises each entry from its own usage row, shortcut and alias state', async () => {
    shortcutStore.set(`app-launch:${ALPHA_PATH}`, 'Alt+A')

    const service = createService({
      getDbUtils: () => usageCountDb([{ itemId: ALPHA_PATH, executeCount: 7 }]),
      entries: [
        managedEntry(ALPHA_PATH, 'com.example.alpha'),
        managedEntry(BETA_PATH, 'com.example.beta')
      ],
      aliases: await loadedAliases({ [BETA_PATH]: ['聊天'] })
    })

    const result = await service.listSummaries()

    expect(result).toEqual({
      success: true,
      summaries: [
        { path: ALPHA_PATH, executeCount: 7, hasShortcut: true, hasAliases: false },
        // No usage row for Beta: an absent row is a real zero, and the counts must not
        // be shifted onto the wrong entry.
        { path: BETA_PATH, executeCount: 0, hasShortcut: false, hasAliases: true }
      ]
    })
  })
})
