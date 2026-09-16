import type { DbUtils } from '../../../../../db/utils'
import { eq } from 'drizzle-orm'
import { getLogger } from '@talex-touch/utils/common/logger'
import { config as configSchema } from '../../../../../db/schema'

/**
 * Resolved on demand rather than imported at module scope.
 *
 * `global-shortcon` pulls in Electron's `ipcMain` through the transport, and a static import here
 * drags that into every module graph that reaches AppProvider — including its unit tests, which
 * mock `electron` without `ipcMain` and died on import alone. The shortcut module is only needed
 * when a binding is actually touched.
 */
async function resolveShortcutModule(): Promise<
  (typeof import('../../../../global-shortcon'))['shortcutModule']
> {
  const module = await import('../../../../global-shortcon')
  return module.shortcutModule
}
const log = getLogger('app-shortcut')

/**
 * Stores the path each app shortcut launches.
 *
 * The shortcut store already persists accelerators, but it holds no idea what a shortcut *does* —
 * `registerMainShortcut` takes a live callback, which cannot be serialized. So the accelerator
 * survives a restart and the callback does not, and the binding has to be rebuilt at startup from
 * this map.
 */
const APP_SHORTCUTS_CONFIG_KEY = 'app_provider_shortcuts'

/** Namespaced so a binding can never collide with a built-in shortcut id. */
const SHORTCUT_ID_PREFIX = 'app-launch:'

export interface AppShortcutServiceOptions {
  getDbUtils: () => DbUtils | null
  /** Launches the bound application, recording the launch against the shortcut entry point. */
  launch: (path: string) => Promise<void>
}

export class AppShortcutService {
  /** App path keyed by shortcut id. Mirrors what is persisted under the config key. */
  private bindings: Record<string, string> = {}

  constructor(private readonly options: AppShortcutServiceOptions) {}

  /**
   * Rebuilds every stored binding's callback.
   *
   * Runs at startup: without it the accelerators are still registered with the OS from the
   * shortcut store but resolve to no callback, so the key does nothing.
   */
  async restore(): Promise<void> {
    await this.load()
    if (Object.keys(this.bindings).length === 0) return

    const shortcutModule = await resolveShortcutModule()
    for (const [shortcutId, path] of Object.entries(this.bindings)) {
      const accelerator = shortcutModule.getShortcutAccelerator(shortcutId)
      if (!accelerator) {
        // The accelerator was removed from the shortcut store; the binding is orphaned.
        delete this.bindings[shortcutId]
        continue
      }
      shortcutModule.setAppShortcut(shortcutId, accelerator, () => {
        void this.options.launch(path)
      })
    }
  }

  async get(path: string): Promise<string | null> {
    const shortcutModule = await resolveShortcutModule()
    return shortcutModule.getShortcutAccelerator(toShortcutId(path))
  }

  /**
   * Stored accelerators for a whole list, so a caller that needs presence per row does not await
   * one round trip per application. Reads the same store {@link get} reads, so a row and the detail
   * panel can never disagree about whether a binding exists.
   */
  async getAccelerators(paths: string[]): Promise<Map<string, string | null>> {
    if (paths.length === 0) return new Map()

    const shortcutModule = await resolveShortcutModule()
    return new Map(
      paths.map((path) => [path, shortcutModule.getShortcutAccelerator(toShortcutId(path))])
    )
  }

  async set(path: string, accelerator: string): Promise<boolean> {
    const shortcutModule = await resolveShortcutModule()
    const shortcutId = toShortcutId(path)
    const registered = shortcutModule.setAppShortcut(shortcutId, accelerator, () => {
      void this.options.launch(path)
    })
    if (!registered) {
      // `setAppShortcut` has already put the previous binding back — or removed the attempt when
      // there was none — so the store must not be touched again here: removing it would discard
      // the accelerator the user had before this failed rebind.
      return false
    }
    this.bindings[shortcutId] = path
    await this.save()
    return true
  }

  async remove(path: string): Promise<void> {
    const shortcutModule = await resolveShortcutModule()
    const shortcutId = toShortcutId(path)
    shortcutModule.removeAppShortcut(shortcutId)
    delete this.bindings[shortcutId]
    await this.save()
  }

  private async load(): Promise<void> {
    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) return
    try {
      const [row] = await dbUtils
        .getDb()
        .select({ value: configSchema.value })
        .from(configSchema)
        .where(eq(configSchema.key, APP_SHORTCUTS_CONFIG_KEY))
        .limit(1)
      if (!row?.value) return

      const parsed: unknown = JSON.parse(row.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

      const restored: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string' && value) restored[key] = value
      }
      this.bindings = restored
    } catch (error) {
      log.warn('Failed to load app shortcut bindings', { error })
    }
  }

  private async save(): Promise<void> {
    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) return
    try {
      const value = JSON.stringify(this.bindings)
      const db = dbUtils.getDb()
      await db
        .insert(configSchema)
        .values({ key: APP_SHORTCUTS_CONFIG_KEY, value })
        .onConflictDoUpdate({ target: configSchema.key, set: { value } })
    } catch (error) {
      log.error('Failed to persist app shortcut bindings', { error })
    }
  }
}

/**
 * The shortcut id for an application path.
 *
 * Keyed by path rather than by catalog item id: the id is derived from identity columns that a
 * rescan can revise, and a binding whose id drifts silently stops matching its stored accelerator.
 */
export function toShortcutId(path: string): string {
  return `${SHORTCUT_ID_PREFIX}${path}`
}
