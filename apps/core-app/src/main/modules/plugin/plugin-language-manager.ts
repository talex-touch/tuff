import path from 'node:path'
import fse from 'fs-extra'
import type { AppLocale, ShortLocale } from '@talex-touch/utils/i18n'
import {
  i18nResolver,
  isI18nMessage,
  normalizeLocale,
  parseI18nMessage,
  toShortLocale
} from '@talex-touch/utils/i18n'
import { parsePluginI18nKey } from '@talex-touch/utils/plugin'
import { getLocale } from '../../utils/i18n-helper'
import { createLogger } from '../../utils/logger'

const logger = createLogger('PluginLanguageManager')

export interface PluginLanguageState {
  pluginId: string
  pluginPath: string
  localeDictionaries: Map<string, Record<string, unknown>>
  isStale: boolean
}

export class PluginLanguageManager {
  private static instance: PluginLanguageManager | null = null
  private plugins = new Map<string, PluginLanguageState>()
  private inFlightLoads = new Map<string, Promise<Record<string, unknown> | null>>()
  private activeLocale: AppLocale = 'en-US'

  constructor(initialLocale?: AppLocale) {
    this.activeLocale = initialLocale ?? this.resolveCurrentAppLocale()
    i18nResolver.setLocale(this.activeLocale)
  }

  static getInstance(): PluginLanguageManager {
    if (!PluginLanguageManager.instance) {
      PluginLanguageManager.instance = new PluginLanguageManager()
    }
    return PluginLanguageManager.instance
  }

  static setInstanceForTests(instance: PluginLanguageManager | null): void {
    PluginLanguageManager.instance = instance
  }

  private resolveCurrentAppLocale(): AppLocale {
    try {
      const raw = getLocale()
      return normalizeLocale(raw) ?? 'en-US'
    } catch {
      return 'en-US'
    }
  }

  getLocale(): AppLocale {
    return this.activeLocale
  }

  /**
   * Register a plugin to manage its language lifecycle.
   * Pure memory record — zero disk I/O.
   */
  register(pluginId: string, pluginPath: string): void {
    const trimmedId = pluginId.trim()
    if (!trimmedId) return

    const existing = this.plugins.get(trimmedId)
    if (existing && existing.pluginPath === pluginPath) {
      return
    }

    this.plugins.set(trimmedId, {
      pluginId: trimmedId,
      pluginPath,
      localeDictionaries: new Map(),
      isStale: true
    })
  }

  /**
   * Unregister a plugin and clear its cached language dictionaries.
   */
  unregister(pluginId: string): void {
    const trimmedId = pluginId.trim()
    this.plugins.delete(trimmedId)
  }

  /**
   * Notification that the main application's language changed.
   * CRITICAL REQUIREMENT: ZERO DISK I/O!
   * Marks all registered plugin language caches as stale so that they will be
   * reloaded lazily on-demand when actually accessed.
   */
  onLocaleChanged(newLocale: AppLocale | string): void {
    const normalized = normalizeLocale(newLocale) ?? 'en-US'
    if (this.activeLocale === normalized) {
      return
    }

    this.activeLocale = normalized
    i18nResolver.setLocale(normalized)
    logger.info(`Host locale changed to ${normalized}, marking plugin language caches stale`)

    for (const state of this.plugins.values()) {
      state.isStale = true
    }
  }

  /**
   * Lazily loads and mounts a plugin's language dictionary when needed.
   * Deduplicates concurrent loads using in-flight promises (Single-Flight).
   */
  async ensurePluginLanguage(
    pluginId: string,
    targetLocale?: AppLocale | string
  ): Promise<Record<string, unknown> | null> {
    const trimmedId = pluginId.trim()
    const state = this.plugins.get(trimmedId)
    if (!state) {
      return null
    }

    const locale = targetLocale ? normalizeLocale(targetLocale) ?? this.activeLocale : this.activeLocale
    const shortLocale: ShortLocale = toShortLocale(locale)

    // Fast path: memory hit and not stale
    if (!state.isStale && state.localeDictionaries.has(locale)) {
      return state.localeDictionaries.get(locale) ?? null
    }

    // In-flight deduplication
    const flightKey = `${trimmedId}:${locale}`
    const existingFlight = this.inFlightLoads.get(flightKey)
    if (existingFlight) {
      return existingFlight
    }

    const loadPromise = (async (): Promise<Record<string, unknown> | null> => {
      try {
        const dictionary = await this.readPluginLanguageFromDisk(state.pluginPath, locale)
        if (dictionary) {
          state.localeDictionaries.set(locale, dictionary)
          state.isStale = false

          // Mount into global i18nResolver under namespace: plugin.<pluginId>
          i18nResolver.addMessages(shortLocale, {
            plugin: {
              [trimmedId]: dictionary
            }
          })
          return dictionary
        }

        // Even if empty or not found, avoid repeatedly reading missing directories
        state.isStale = false
        return null
      } catch (error) {
        logger.warn(`Failed to load languages for plugin ${trimmedId}`, {
          meta: { error: String(error) }
        })
        return null
      } finally {
        this.inFlightLoads.delete(flightKey)
      }
    })()

    this.inFlightLoads.set(flightKey, loadPromise)
    return loadPromise
  }

  /**
   * Read the best-matching language file from disk under <pluginPath>/languages/
   */
  private async readPluginLanguageFromDisk(
    pluginPath: string,
    locale: AppLocale
  ): Promise<Record<string, unknown> | null> {
    const languagesDir = path.join(pluginPath, 'languages')
    const hasLanguagesDir = await fse.pathExists(languagesDir)
    if (!hasLanguagesDir) {
      return null
    }

    // Build fallback candidate filenames
    const candidates: string[] = []
    if (locale === 'zh-CN') {
      candidates.push('zh-CN.json', 'zh.json', 'en-US.json', 'en.json')
    } else {
      candidates.push('en-US.json', 'en.json', 'zh-CN.json', 'zh.json')
    }

    for (const filename of candidates) {
      const filePath = path.join(languagesDir, filename)
      if (await fse.pathExists(filePath)) {
        try {
          const content = await fse.readJSON(filePath)
          if (content && typeof content === 'object' && !Array.isArray(content)) {
            return content as Record<string, unknown>
          }
        } catch (error) {
          logger.warn(`Failed to parse ${filePath}`, { meta: { error: String(error) } })
        }
      }
    }

    return null
  }

  /**
   * Resolve an i18n message string, automatically loading plugin language if needed.
   */
  async resolveMessage(message: string, targetLocale?: AppLocale | string): Promise<string> {
    if (!isI18nMessage(message)) {
      return message
    }

    const parsed = parseI18nMessage(message)
    if (!parsed) {
      return message
    }

    const locale = targetLocale ? normalizeLocale(targetLocale) ?? this.activeLocale : this.activeLocale
    const pluginKeyInfo = parsePluginI18nKey(parsed.key)
    if (pluginKeyInfo) {
      await this.ensurePluginLanguage(pluginKeyInfo.pluginName, locale)
    }

    return i18nResolver.resolve(message, locale)
  }

  getLoadedDictionary(pluginId: string, locale?: AppLocale | string): Record<string, unknown> | undefined {
    const state = this.plugins.get(pluginId.trim())
    if (!state) return undefined
    const resolvedLocale = locale ? normalizeLocale(locale) ?? this.activeLocale : this.activeLocale
    return state.localeDictionaries.get(resolvedLocale)
  }

  isPluginStale(pluginId: string): boolean {
    return this.plugins.get(pluginId.trim())?.isStale ?? true
  }

  resetForTests(): void {
    this.plugins.clear()
    this.inFlightLoads.clear()
    this.activeLocale = 'en-US'
  }
}

export const pluginLanguageManager = PluginLanguageManager.getInstance()
