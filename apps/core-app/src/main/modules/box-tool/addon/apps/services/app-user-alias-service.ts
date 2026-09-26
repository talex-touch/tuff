import type { DbUtils } from '../../../../../db/utils'
import { eq } from 'drizzle-orm'
import { getLogger } from '@talex-touch/utils/common/logger'
import { config as configSchema } from '../../../../../db/schema'
import { resolveAppItemId } from '../app-index-metadata'
import type { ScannedAppInfo } from '../app-types'
import { normalizeStringList } from '../app-utils'

const log = getLogger('app-user-alias')

/** Where the map persists. Same table and shape the shortcut store uses for its own key. */
const USER_ALIASES_CONFIG_KEY = 'app_provider_user_aliases'

export interface AppUserAliasServiceOptions {
  getDbUtils: () => DbUtils | null
  /**
   * Fires after a mutation has been persisted and adopted. The in-memory search catalog folds
   * these names into its exact-keyword set, so it has to hear about an edit without a rescan.
   */
  onChanged?: () => void
}

/**
 * What the user calls an app, keyed by catalog item id.
 *
 * Beside the provider rather than inside it: the two sides of this map have nothing to do with
 * each other. A scan reads it once per app so the projection can index the user's own names, while
 * the settings surface replaces one app's names at a time — neither needs the scan, the writer or
 * the projection, and `app-provider.ts` is under a ceiling that may fall and may not rise (#343).
 */
export class AppUserAliasService {
  private aliases: Record<string, string[]> = {}

  constructor(private readonly options: AppUserAliasServiceOptions) {}

  /**
   * Reads the persisted map.
   *
   * A corrupt row costs the user their aliases, never app search: the scan still publishes the
   * generated keywords, so the apps stay findable by their own names.
   */
  async load(): Promise<void> {
    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) return

    try {
      const [row] = await dbUtils
        .getDb()
        .select({ value: configSchema.value })
        .from(configSchema)
        .where(eq(configSchema.key, USER_ALIASES_CONFIG_KEY))
        .limit(1)
      if (!row?.value) return

      const parsed: unknown = JSON.parse(row.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

      const restored: Record<string, string[]> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(value)) continue
        const aliases = normalizeStringList(value.filter((item) => typeof item === 'string'))
        if (aliases.length > 0) restored[key] = aliases
      }
      this.aliases = restored
    } catch (error) {
      log.warn('Failed to load user aliases, continuing without them', { error })
    }
  }

  /** The aliases stored under one key — an item id, a path or a bundle id. */
  get(key: string | null | undefined): string[] {
    if (!key) return []
    return this.aliases[key] ?? []
  }

  /**
   * Every alias search should index for one app: the ones stored under its item id, under its
   * path, and under its bundle id.
   *
   * A key the user never touched simply contributes nothing, so the caller can fold all three
   * without asking which one an alias was written against.
   */
  resolveForApp(appInfo: Pick<ScannedAppInfo, 'bundleId' | 'stableId' | 'path'>): string[] {
    return [
      ...this.get(resolveAppItemId(appInfo)),
      ...this.get(appInfo.path),
      ...this.get(appInfo.bundleId)
    ]
  }

  /**
   * Replaces the whole map. Only for callers that hold the complete set — the settings surface
   * uses {@link setForEntry}, which cannot clobber a concurrent edit to another app.
   */
  async replace(aliases: Record<string, string[]>): Promise<void> {
    await this.persist(aliases)
    this.aliases = aliases
    this.options.onChanged?.()
  }

  /**
   * Replaces one key's aliases, leaving every other app's untouched.
   *
   * An empty list removes the entry rather than storing an empty array, so the map's keys stay a
   * list of the apps that actually have aliases. The candidate map is persisted before it is
   * adopted: a write that fails has to reach the caller, and a map that outlived its failed write
   * would read as saved until the next restart.
   */
  async setForEntry(key: string, aliases: string[]): Promise<void> {
    const normalized = normalizeStringList(aliases)
    const next = { ...this.aliases }
    if (normalized.length > 0) next[key] = normalized
    else delete next[key]

    await this.persist(next)
    this.aliases = next
    this.options.onChanged?.()
  }

  /** Writes the map as it will be held. A failed write throws so the caller can report it. */
  private async persist(candidate: Record<string, string[]>): Promise<void> {
    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) throw new Error('ALIAS_STORE_UNAVAILABLE')

    try {
      const value = JSON.stringify(candidate)
      const db = dbUtils.getDb()
      await db
        .insert(configSchema)
        .values({ key: USER_ALIASES_CONFIG_KEY, value })
        .onConflictDoUpdate({ target: configSchema.key, set: { value } })
    } catch (error) {
      log.error('Failed to persist user aliases', { error })
      throw new Error('ALIAS_PERSIST_FAILED')
    }
  }
}
