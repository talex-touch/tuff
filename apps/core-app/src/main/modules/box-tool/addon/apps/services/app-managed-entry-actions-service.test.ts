import type { AppIndexManagedEntry } from '@talex-touch/utils/transport/events/types'
import type { AppPutAwayOutcome } from '../app-hide-adapter'
import type { DbUtils } from '../../../../../db/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Electron-backed shortcut store, behind the lazy `global-shortcon` import
 * `AppShortcutService` reaches for. Only the accelerator lookup is load-bearing here;
 * everything else on the module is a stub so the import graph stays out of this suite.
 */
const shortcutStore = vi.hoisted(() => new Map<string, string>())

/**
 * The callback `AppShortcutService` hands the OS. Captured so a test can press the key the way the
 * OS would, instead of reaching into the service for a private method.
 */
const pressCallbacks = vi.hoisted(() => new Map<string, () => void | Promise<void>>())

const hideAdapter = vi.hoisted(() => ({
  putAwayApplicationInFront: vi.fn(async (): Promise<AppPutAwayOutcome> => ({ hidden: true }))
}))

/**
 * The launch recorder, mocked at this boundary: what a press records is part of this service's
 * contract, while which stats rows a launch writes is the recorder's own.
 */
const launchRecorder = vi.hoisted(() => ({
  record: vi.fn(async () => undefined),
  previousAppContext: vi.fn(async () => ({}))
}))
const launcher = vi.hoisted(() => ({
  launchApp: vi.fn(async () => ({ status: 'success' as const }))
}))

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
    setAppShortcut: (
      shortcutId: string,
      accelerator: string,
      press?: () => void | Promise<void>
    ) => {
      shortcutStore.set(shortcutId, accelerator)
      if (press) pressCallbacks.set(shortcutId, press)
      return { ok: true }
    },
    removeAppShortcut: (shortcutId: string) => {
      pressCallbacks.delete(shortcutId)
      return shortcutStore.delete(shortcutId)
    }
  }
}))

vi.mock('../app-hide-adapter', () => ({
  putAwayApplicationInFront: hideAdapter.putAwayApplicationInFront
}))

vi.mock('../app-launcher', () => ({
  launchApp: launcher.launchApp
}))

vi.mock('../../../search-engine/app-launch-recorder', async (importOriginal) => {
  // Partial: `AppUsageQueryService` reads `APP_PROVIDER_SOURCE_ID` from this module, and a bare
  // replacement would take the usage counts down with it.
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    AppLaunchRecorder: class {
      record = launchRecorder.record
    },
    resolvePreviousAppContext: launchRecorder.previousAppContext
  }
})

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
 * through `…where().limit(1)`, and `save()` writes it back through an upsert that fails when asked.: which stats row a launch
 * produces is `AppLaunchRecorder`'s contract, and a stub that raised would turn that into noise on
 * every press this suite exercises.
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
  pressCallbacks.clear()
  hideAdapter.putAwayApplicationInFront.mockReset()
  hideAdapter.putAwayApplicationInFront.mockResolvedValue({ hidden: true })
  launcher.launchApp.mockReset()
  launcher.launchApp.mockResolvedValue({ status: 'success' })
  launchRecorder.record.mockReset()
  launchRecorder.previousAppContext.mockReset()
  launchRecorder.previousAppContext.mockResolvedValue({})
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

/**
 * One live binding for Alpha, exercised the way the OS would exercise it: by pressing the key.
 *
 * `entries` is held by reference so a test can drop the application out of the catalog between the
 * bind and the press.
 */
async function boundService(
  entries: AppIndexManagedEntry[] = [managedEntry(ALPHA_PATH, 'com.example.alpha')]
): Promise<AppManagedEntryActionsService> {
  const service = createService({
    getDbUtils: () => shortcutConfigDb({}, false),
    entries
  })
  await service.setShortcut(ALPHA_PATH, 'Alt+A')
  return service
}

async function pressAlphaShortcut(): Promise<void> {
  const press = pressCallbacks.get(toShortcutId(ALPHA_PATH))
  if (!press) throw new Error('Alpha has no bound shortcut callback')
  // The OS hands the key to a callback nothing awaits; the service returns that press so a test
  // can wait for the outcome instead of guessing how long it takes.
  await press()
}

describe('AppManagedEntryActionsService shortcut press', () => {
  /**
   * The key is a toggle. A shortcut that can only summon turns a second press into a no-op the
   * user cannot read: the application is already in front, so nothing moves and the key looks
   * broken.
   */
  it('puts the bound application away when the adapter finds it in front', async () => {
    await boundService()
    await pressAlphaShortcut()

    expect(hideAdapter.putAwayApplicationInFront).toHaveBeenCalledWith({
      bundleId: 'com.example.alpha',
      path: ALPHA_PATH
    })
    expect(launcher.launchApp).not.toHaveBeenCalled()
    // Putting an application away is not a launch, and the usage table counts launches.
    expect(launchRecorder.record).not.toHaveBeenCalled()
  })

  it('launches when the bound application is not the one in front', async () => {
    hideAdapter.putAwayApplicationInFront.mockResolvedValue({
      hidden: false,
      reason: 'not-frontmost'
    })

    await boundService()
    await pressAlphaShortcut()

    expect(launcher.launchApp).toHaveBeenCalledTimes(1)
    expect(launchRecorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ entryPoint: 'shortcut' })
    )
  })

  /** Nothing on this platform could put it away: the press still has to summon something. */
  it('launches when the application refuses to be put away', async () => {
    hideAdapter.putAwayApplicationInFront.mockResolvedValue({
      hidden: false,
      reason: 'command-failed'
    })

    await boundService()
    await pressAlphaShortcut()

    expect(launcher.launchApp).toHaveBeenCalledTimes(1)
  })

  /** A path the catalog no longer holds has nothing to hide, and nothing to launch either. */
  it('answers a binding whose application left the index without launching anything', async () => {
    const entries = [managedEntry(ALPHA_PATH, 'com.example.alpha')]
    await boundService(entries)
    entries.length = 0

    await pressAlphaShortcut()

    expect(launcher.launchApp).not.toHaveBeenCalled()
    expect(hideAdapter.putAwayApplicationInFront).not.toHaveBeenCalled()
  })
})
