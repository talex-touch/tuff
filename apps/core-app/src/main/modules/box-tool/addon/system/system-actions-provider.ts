import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { IManifest } from '@talex-touch/utils/plugin'
import type { ProviderContext } from '../../search-engine/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { t } from '../../../../utils/i18n-helper'
import { installDevPluginFromPath } from '../../../plugin/dev-plugin-installer'
import { pluginModule } from '../../../plugin/plugin-module'
import { appProvider } from '../apps/app-provider'
import { fileProvider } from '../files/file-provider'

type SystemActionType = 'dev-plugin' | 'tpex-plugin' | 'app-index' | 'file-index'

interface SystemActionMeta {
  action: SystemActionType
  path: string
}

interface ResolvedAction {
  type: SystemActionType
  path: string
  displayName: string
  displayPath: string
}

const MAX_ACTION_ITEMS = 6
const systemActionsLog = getLogger('system-actions-provider')
const WINDOWS_APP_EXTENSIONS = new Set(['.exe', '.lnk', '.appref-ms'])
const LINUX_APP_EXTENSIONS = new Set(['.desktop', '.appimage'])

const ACTION_ICON_MAP: Record<SystemActionType, { type: 'class'; value: string }> = {
  'dev-plugin': { type: 'class', value: 'ri:plug-2-line' },
  'tpex-plugin': { type: 'class', value: 'ri:package-line' },
  'app-index': { type: 'class', value: 'ri:apps-2-line' },
  'file-index': { type: 'class', value: 'ri:folder-2-line' }
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

function normalizeCandidatePath(raw: string): string | null {
  const trimmed = stripOuterQuotes(raw.trim())
  if (!trimmed) return null

  let candidate = trimmed
  if (candidate.startsWith('file://')) {
    try {
      candidate = fileURLToPath(candidate)
    } catch {
      return null
    }
  }

  candidate = expandHome(candidate)
  if (!path.isAbsolute(candidate)) return null
  return path.normalize(candidate)
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseFilesInput(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
      if (typeof parsed === 'string') {
        return [parsed]
      }
    } catch {
      return splitLines(trimmed)
    }
  }

  return splitLines(trimmed)
}

function buildDisplayName(value: string): string {
  const base = path.basename(value)
  return base || value
}

function stripExtension(value: string, ext: string): string {
  if (!value.toLowerCase().endsWith(ext.toLowerCase())) {
    return value
  }
  return value.slice(0, -ext.length)
}

export class SystemActionsProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'system-actions-provider'
  readonly type = 'system' as const
  readonly name = 'System Actions'
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Files, TuffInputType.Html]
  readonly priority = 'fast' as const
  readonly expectedDuration = 30

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startTime = performance.now()
    if (signal.aborted) {
      return this.createEmptyResult(query, startTime)
    }

    const candidates = this.collectCandidatePaths(query)
    if (candidates.length === 0) {
      return this.createEmptyResult(query, startTime)
    }

    const items: TuffItem[] = []

    for (const candidate of candidates) {
      if (signal.aborted) break
      const resolved = await this.resolveAction(candidate)
      if (!resolved) continue
      items.push(this.buildActionItem(resolved))
      if (items.length >= MAX_ACTION_ITEMS) break
    }

    const duration = performance.now() - startTime
    return new TuffSearchResultBuilder(query)
      .setItems(items)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: items.length,
          status: 'success'
        }
      ])
      .build()
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const meta = (args.item.meta?.extension as { systemAction?: SystemActionMeta } | undefined)
      ?.systemAction
    if (!meta?.path) return null

    try {
      switch (meta.action) {
        case 'dev-plugin': {
          const result = await installDevPluginFromPath(meta.path)
          if (result.status === 'exists') {
            systemActionsLog.info('Dev plugin already exists', {
              meta: { path: meta.path, name: result.manifest?.name }
            })
          } else if (result.status !== 'success') {
            systemActionsLog.warn('Dev plugin install failed', {
              meta: { path: meta.path, ...result }
            })
          }
          break
        }
        case 'tpex-plugin': {
          const manager = pluginModule.pluginManager
          if (!manager?.installFromSource) {
            systemActionsLog.warn('Plugin manager not ready for tpex install')
            break
          }
          await manager.installFromSource({
            source: meta.path,
            hintType: PluginProviderType.TPEX
          })
          break
        }
        case 'app-index': {
          await appProvider.addAppByPath(meta.path)
          break
        }
        case 'file-index': {
          await fileProvider.addWatchPath(meta.path)
          break
        }
      }
    } catch (error) {
      systemActionsLog.warn('System action execution failed', { error })
    }

    return null
  }

  private collectCandidatePaths(query: TuffQuery): string[] {
    const candidates: string[] = []
    const inputs = query.inputs ?? []

    for (const input of inputs) {
      if (!input?.content) continue
      if (input.type === TuffInputType.Files) {
        candidates.push(...parseFilesInput(input.content))
      } else if (input.type === TuffInputType.Text || input.type === TuffInputType.Html) {
        candidates.push(...splitLines(input.rawContent ?? input.content))
      }
    }

    if (typeof query.text === 'string' && query.text.trim()) {
      candidates.push(...splitLines(query.text))
    }

    const normalized: string[] = []
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const normalizedPath = normalizeCandidatePath(candidate)
      if (!normalizedPath) continue
      const key = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(normalizedPath)
    }

    return normalized.slice(0, MAX_ACTION_ITEMS)
  }

  private async resolveAction(candidate: string): Promise<ResolvedAction | null> {
    let stats: Awaited<ReturnType<typeof fs.stat>> | null = null
    try {
      stats = await fs.stat(candidate)
    } catch {
      return null
    }

    const devManifest = await this.resolveDevManifest(candidate, stats)
    if (devManifest) {
      const displayName = devManifest.manifest.name || buildDisplayName(devManifest.sourceDir)
      return {
        type: 'dev-plugin',
        path: devManifest.sourcePath,
        displayName,
        displayPath: devManifest.sourceDir
      }
    }

    if (stats.isFile() && candidate.toLowerCase().endsWith('.tpex')) {
      const baseName = buildDisplayName(candidate)
      return {
        type: 'tpex-plugin',
        path: candidate,
        displayName: stripExtension(baseName, '.tpex'),
        displayPath: candidate
      }
    }

    const appPath = this.normalizeAppCandidate(candidate, stats)
    if (appPath) {
      const name = buildDisplayName(appPath)
      const displayName = process.platform === 'darwin' ? stripExtension(name, '.app') : name
      return {
        type: 'app-index',
        path: appPath,
        displayName,
        displayPath: appPath
      }
    }

    const watchPath = stats.isDirectory() ? candidate : path.dirname(candidate)
    return {
      type: 'file-index',
      path: watchPath,
      displayName: buildDisplayName(watchPath),
      displayPath: watchPath
    }
  }

  private normalizeAppCandidate(
    candidate: string,
    stats: Awaited<ReturnType<typeof fs.stat>>
  ): string | null {
    if (process.platform === 'darwin') {
      let appPath = candidate
      if (appPath.includes('.app/')) {
        appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      }
      if (!appPath.toLowerCase().endsWith('.app')) return null
      return appPath
    }

    if (!stats.isFile()) return null
    const ext = path.extname(candidate).toLowerCase()
    if (process.platform === 'win32') {
      return WINDOWS_APP_EXTENSIONS.has(ext) ? candidate : null
    }
    return LINUX_APP_EXTENSIONS.has(ext) ? candidate : null
  }

  private async resolveDevManifest(
    candidate: string,
    stats: Awaited<ReturnType<typeof fs.stat>>
  ): Promise<{ manifest: IManifest; sourceDir: string; sourcePath: string } | null> {
    let manifestPath: string | null = null
    let sourceDir = candidate

    if (stats.isDirectory()) {
      manifestPath = path.join(candidate, 'manifest.json')
    } else if (stats.isFile() && path.basename(candidate).toLowerCase() === 'manifest.json') {
      manifestPath = candidate
      sourceDir = path.dirname(candidate)
    }

    if (!manifestPath) return null

    try {
      const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestRaw) as IManifest
      if (!manifest?.name) return null
      return { manifest, sourceDir, sourcePath: candidate }
    } catch (error) {
      systemActionsLog.warn('Failed to read manifest.json for dev plugin', {
        error,
        meta: { path: manifestPath }
      })
      return null
    }
  }

  private buildActionItem(action: ResolvedAction): TuffItem {
    const titleKeyMap: Record<SystemActionType, string> = {
      'dev-plugin': 'corebox.systemActions.addDevPluginTitle',
      'tpex-plugin': 'corebox.systemActions.addTpexPluginTitle',
      'app-index': 'corebox.systemActions.addAppIndexTitle',
      'file-index': 'corebox.systemActions.addFileIndexTitle'
    }
    const subtitleKeyMap: Record<SystemActionType, string> = {
      'dev-plugin': 'corebox.systemActions.addDevPluginSubtitle',
      'tpex-plugin': 'corebox.systemActions.addTpexPluginSubtitle',
      'app-index': 'corebox.systemActions.addAppIndexSubtitle',
      'file-index': 'corebox.systemActions.addFileIndexSubtitle'
    }

    const title = t(titleKeyMap[action.type], { name: action.displayName })
    const subtitle = t(subtitleKeyMap[action.type], { path: action.displayPath })

    return new TuffItemBuilder(`${this.id}:${action.type}:${action.path}`, this.type, this.id)
      .setKind('action')
      .setTitle(title)
      .setSubtitle(subtitle)
      .setIcon(ACTION_ICON_MAP[action.type])
      .setActions([
        {
          id: `system-action-${action.type}`,
          type: 'execute',
          label: title,
          primary: true
        }
      ])
      .setMeta({
        extension: {
          systemAction: {
            action: action.type,
            path: action.path
          }
        }
      })
      .build()
  }

  private createEmptyResult(query: TuffQuery, startedAt: number): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: 0,
          status: 'success'
        }
      ])
      .build()
  }
}

export const systemActionsProvider = new SystemActionsProvider()
