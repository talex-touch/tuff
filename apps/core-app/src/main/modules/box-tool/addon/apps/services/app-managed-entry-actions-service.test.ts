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
    // Stateful rather than a bare `() => true`, so a rollback asserts "the store holds what it
    // held before" rather than "some mock was called".
    setAppShortcut: (shortcutId: string, accelerator: string) => {
      shortcutStore.set(shortcutId, accelerator)
      return true
    },
    removeAppShortcut: (shortcutId: string) => shortcutStore.delete(shortcutId)
  }
}))

import { AppManagedEntryActionsService } from './app-managed-entry-actions-service'
import { AppUserAliasService } from './app-user-alias-service'
import { toShortcutId } from './app-shortcut-service'

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

/**
 * The config table as `AppShortcutService` uses it: `restore()` reads the shortcutId → path map
 * through `…where().limit(1)`, and `save()` writes it back through an upsert that fails here.
 */
function shortcutConfigDb(seed: Record<string, string>, failWrite: boolean): DbUtils {
  return {
    getDb: () => ({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [{ value: JSON.stringify(seed) }] }) })
      }),
      insert: () => {
        if (failWrite) throw new Error('SQLITE_FULL')
        return { values: () => ({ onConflictDoUpdate: async () => undefined }) }
      }
    })
  } as unknown as DbUtils
}

/** A service holding one live binding for Alpha, whose config write fails. */
async function boundButUnwritableService(
  accelerator: string
): Promise<AppManagedEntryActionsService> {
  shortcutStore.set(toShortcutId(ALPHA_PATH), accelerator)
  const service = createService({
    getDbUtils: () => shortcutConfigDb({ [toShortcutId(ALPHA_PATH)]: ALPHA_PATH }, true),
    entries: [managedEntry(ALPHA_PATH, 'com.example.alpha')]
  })
  await service.restoreShortcuts()
  return service
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

describe('AppManagedEntryActionsService.setShortcut', () => {
  /**
   * A binding is the accelerator plus the shortcutId → path row that rebuilds its callback at
   * startup. `setAppShortcut` has already given the OS the new key by the time the row is written,
   * so a failed write reported as success leaves a live shortcut that silently stops working after
   * a restart — with nothing anywhere saying why.
   */
  it('reports a store write that failed and puts the previous binding back', async () => {
    const service = await boundButUnwritableService('Alt+P')

    const result = await service.setShortcut(ALPHA_PATH, 'Alt+A')

    expect(result).toEqual({
      success: false,
      status: 'error',
      reason: 'shortcut-persist-failed'
    })
    expect(shortcutStore.get(toShortcutId(ALPHA_PATH))).toBe('Alt+P')
  })

  /** The same divergence from the other side: the row would re-register a cleared shortcut. */
  it('reports a failed write when clearing a binding, and keeps it bound', async () => {
    const service = await boundButUnwritableService('Alt+P')

    const result = await service.setShortcut(ALPHA_PATH, '')

    expect(result).toEqual({
      success: false,
      status: 'error',
      reason: 'shortcut-persist-failed'
    })
    expect(shortcutStore.get(toShortcutId(ALPHA_PATH))).toBe('Alt+P')
  })
})
