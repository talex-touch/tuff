import type {
  AppIndexEntryMutationResult,
  AppIndexLaunchResult,
  AppIndexManagedEntry,
  AppIndexSummariesResult,
  AppIndexUsageResult
} from '@talex-touch/utils/transport/events/types'
import type { DbUtils } from '../../../../../db/utils'
import { files as filesSchema } from '../../../../../db/schema'
import type { UsageEntryPoint } from '../../../search-engine/usage-entry-point'
import type { AppUserAliasService } from './app-user-alias-service'
import { AppShortcutService } from './app-shortcut-service'
import { AppUsageQueryService } from './app-usage-query-service'
import type { ScannedAppInfo } from '../app-types'
import {
  AppLaunchRecorder,
  resolvePreviousAppContext
} from '../../../search-engine/app-launch-recorder'
import { resolveAppItemId } from '../app-index-metadata'
import { launchApp } from '../app-launcher'
import { normalizeOptionalString } from '../app-provider-path-utils'

type DbAppRecord = typeof filesSchema.$inferSelect
type DbAppWithExtensions = DbAppRecord & { extensions: Record<string, string | null> }

/**
 * Everything the applications settings page asks of one already-indexed entry.
 *
 * Separate from `AppManagedEntryService`, which owns whether an entry exists at all — adding one,
 * removing it, toggling whether it is indexed. This owns what an entry *does*: how it is summoned,
 * how often it has been, and under which names.
 *
 * Beside the provider rather than inside it, for the reason `app-user-alias-service` gives: none
 * of this needs the scan, the writer or the projection, and `app-provider.ts` is under a ceiling
 * that may fall and may not rise (#343).
 */
export interface AppManagedEntryActionsServiceOptions {
  getDbUtils: () => DbUtils | null
  listEntries: () => Promise<AppIndexManagedEntry[]>
  aliases: AppUserAliasService
  /** The provider's projection writer: where an alias change has to land to be searchable. */
  mapDbAppToScannedInfo: (app: DbAppWithExtensions) => ScannedAppInfo
  toExtensionMap: (
    records: Array<{ key: string; value: string | null }>
  ) => Record<string, string | null>
  publishUpsert: (appInfo: ScannedAppInfo, reason: string) => Promise<void>
  /** Serialises a write against the running scan, the same guard the lifecycle actions use. */
  runMutation: <T>(operation: () => Promise<T>) => Promise<T>
}

export class AppManagedEntryActionsService {
  private readonly shortcuts: AppShortcutService
  private readonly usage: AppUsageQueryService
  private readonly launchRecorder: AppLaunchRecorder

  constructor(private readonly options: AppManagedEntryActionsServiceOptions) {
    this.usage = new AppUsageQueryService({ getDbUtils: options.getDbUtils })
    this.launchRecorder = new AppLaunchRecorder({ getDbUtils: options.getDbUtils })
    this.shortcuts = new AppShortcutService({
      getDbUtils: options.getDbUtils,
      launch: async (path) => {
        await this.launch(path, 'shortcut')
      }
    })
  }

  /**
   * Every managed entry with the facts the list orders and narrows itself by.
   *
   * Composed from three sources that are each cheap in bulk but were only reachable per entry:
   * the usage aggregate table, the shortcut store, and the in-memory alias map.
   *
   * A failed usage read is returned as a failure rather than as an empty map: the caller renders
   * these as per-app totals, so a zero here is indistinguishable from a real "never launched".
   */
  public async listSummaries(): Promise<AppIndexSummariesResult> {
    const entries = await this.options.listEntries()
    const paths = entries.map((entry) => entry.path)

    const [usage, shortcuts] = await Promise.all([
      this.usage.countAll(),
      this.shortcuts.getAccelerators(paths)
    ])

    if (!usage.ok) return { success: false, reason: usage.reason }

    return {
      success: true,
      summaries: entries.map((entry) => ({
        path: entry.path,
        executeCount: usage.counts.get(this.itemId(entry)) ?? 0,
        hasShortcut: Boolean(shortcuts.get(entry.path)),
        hasAliases: this.getAliases(entry.path, entry.bundleId).length > 0
      }))
    }
  }

  public getAliases(pathValue: string, bundleId?: string): string[] {
    return this.options.aliases.get(resolveAppItemId({ bundleId, path: pathValue }))
  }

  /**
   * Replaces the whole alias map. For callers holding the complete set only — the settings surface
   * uses {@link setEntryAliases}, which cannot clobber a concurrent edit to another app.
   */
  public async replaceAliases(aliases: Record<string, string[]>): Promise<void> {
    await this.options.runMutation(async () => {
      await this.options.aliases.replace(aliases)
    })
  }

  /**
   * Sets the aliases for one entry, leaving every other app's untouched.
   *
   * Republishes that app's search projection immediately rather than waiting for the next scan:
   * an alias the user just typed has to be searchable now, and a full scan is minutes away.
   */
  public async setEntryAliases(
    pathValue: string,
    aliases: string[]
  ): Promise<AppIndexEntryMutationResult> {
    const target = normalizeOptionalString(pathValue)
    if (!target) return { success: false, status: 'invalid', reason: 'path-empty' }

    const entry = await this.resolveEntry(target)
    if (!entry) return { success: false, status: 'not-found', reason: 'entry-missing' }

    return await this.options.runMutation(async () => {
      await this.options.aliases.setForEntry(this.itemId(entry), aliases)
      await this.republishEntry(entry)
      return { success: true, status: 'updated' }
    })
  }

  public async getShortcut(pathValue: string): Promise<string | null> {
    return await this.shortcuts.get(pathValue)
  }

  /**
   * Binds or clears the launch shortcut for one entry. An empty accelerator clears it.
   *
   * Reports `shortcut-conflict` when the OS refused the accelerator — reserved by the system or
   * already taken — rather than a success the key will not honour.
   */
  public async setShortcut(
    pathValue: string,
    accelerator: string
  ): Promise<AppIndexEntryMutationResult> {
    const target = normalizeOptionalString(pathValue)
    if (!target) return { success: false, status: 'invalid', reason: 'path-empty' }

    const entries = await this.options.listEntries()
    if (!entries.some((candidate) => candidate.path === target)) {
      return { success: false, status: 'not-found', reason: 'entry-missing' }
    }

    const normalized = accelerator.trim()
    if (!normalized) {
      await this.shortcuts.remove(target)
      return { success: true, status: 'updated' }
    }

    const bound = await this.shortcuts.set(target, normalized)
    return bound
      ? { success: true, status: 'updated' }
      : { success: false, status: 'invalid', reason: 'shortcut-conflict' }
  }

  /** Rebuilds every stored binding's callback after a restart. */
  public async restoreShortcuts(): Promise<void> {
    await this.shortcuts.restore()
  }

  /**
   * Launches one indexed application and records the launch against the surface that asked.
   *
   * The applications settings page previously called the generic `system.openApp` shell handler,
   * which knows nothing about the catalog: it could not resolve an item id, so the launch was
   * invisible to every per-app statistic, and it bypassed the protocol allowlist and launch-args
   * handling that `launchApp` owns. Routing it here fixes both.
   */
  public async launch(
    pathValue: string,
    entryPoint: UsageEntryPoint
  ): Promise<AppIndexLaunchResult> {
    const target = normalizeOptionalString(pathValue)
    if (!target) return { success: false, reason: 'invalid-path' }

    const entry = await this.resolveEntry(target)
    if (!entry) return { success: false, reason: 'not-found' }

    // Captured before the launch: once the target is frontmost, "what the user came from" is
    // gone. The recorder falls back to capturing it itself for callers that cannot.
    const previous = await resolvePreviousAppContext()

    const outcome = await launchApp({
      name: entry.displayName || entry.name,
      path: entry.path,
      launchKind: entry.launchKind,
      launchTarget: entry.launchTarget || entry.path,
      launchArgs: entry.launchArgs ?? undefined,
      workingDirectory: entry.workingDirectory ?? undefined
    })

    if (outcome.status === 'failed') {
      return { success: false, reason: 'error', error: outcome.error }
    }

    await this.launchRecorder.record({
      itemId: this.itemId(entry),
      entryPoint,
      previousApp: previous.prevApp ?? null
    })

    return { success: true }
  }

  public async queryUsage(pathValue: string): Promise<AppIndexUsageResult> {
    const target = normalizeOptionalString(pathValue)
    if (!target) return { success: false, reason: 'invalid-path' }

    const entry = await this.resolveEntry(target)
    if (!entry) return { success: false, reason: 'not-found' }

    return await this.usage.query(this.itemId(entry), entry.bundleId)
  }

  /** The catalog key an entry's usage and aliases are stored under. */
  /**
   * Republishes one entry's search projection after its aliases changed.
   *
   * Same lookup the managed-entry service uses to re-publish after a mutation: the row plus its
   * extension map is what the provider's mapper needs to rebuild the projection.
   */
  private async republishEntry(entry: AppIndexManagedEntry): Promise<void> {
    const dbUtils = this.options.getDbUtils()
    const existingFile = await dbUtils?.getFileByPath(entry.path)
    if (!existingFile) return

    const extensions = this.options.toExtensionMap(
      await dbUtils!.getFileExtensions(existingFile.id)
    )
    await this.options.publishUpsert(
      this.options.mapDbAppToScannedInfo({ ...existingFile, extensions }),
      'app-user-alias-update'
    )
  }

  private itemId(entry: AppIndexManagedEntry): string {
    return resolveAppItemId({ bundleId: entry.bundleId, path: entry.path })
  }

  /** The lookup every action here opens with: a path the catalog actually knows. */
  private async resolveEntry(target: string): Promise<AppIndexManagedEntry | null> {
    const entries = await this.options.listEntries()
    return entries.find((candidate) => candidate.path === target) ?? null
  }
}
