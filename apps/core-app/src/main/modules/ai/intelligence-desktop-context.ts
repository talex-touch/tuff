import type { DesktopContextSnapshot, WorkflowContextSource } from '@talex-touch/tuff-intelligence'
import { activeAppService } from '../system/active-app'
import { clipboardModule } from '../clipboard'
import { tuffIntelligenceRuntime } from './tuff-intelligence-runtime'

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function looksLikeFilePath(value: string): boolean {
  const text = value.trim()
  return text.startsWith('/') || /^[A-Z]:\\/i.test(text) || text.startsWith('~/')
}

function truncateText(value: string, max = 240): string {
  const text = String(value || '').trim()
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max - 3)}...`
}

export interface DesktopContextCaptureOptions {
  contextSources: WorkflowContextSource[]
  sessionId?: string
}

export class IntelligenceDesktopContextService {
  async capture(options: DesktopContextCaptureOptions): Promise<DesktopContextSnapshot> {
    const sources = (options.contextSources ?? []).filter((source) => source.enabled !== false)
    const snapshot: DesktopContextSnapshot = {
      capturedAt: Date.now(),
      contextSources: sources
    }

    const recentLimit = Math.min(
      Math.max(
        Number(sources.find((source) => source.type === 'clipboard.recent')?.config?.limit ?? 8),
        1
      ),
      20
    )
    const history = sources.some(
      (source) =>
        source.type === 'clipboard.recent' ||
        source.type === 'desktop.recent-files' ||
        source.type === 'browser.recent-urls'
    )
      ? await clipboardModule.queryHistoryByMeta({ limit: recentLimit })
      : []

    if (sources.some((source) => source.type === 'clipboard.recent')) {
      snapshot.clipboard = history.slice(0, recentLimit).map((item) => ({
        id: typeof item.id === 'number' ? String(item.id) : undefined,
        type: item.type,
        content: truncateText(item.content ?? ''),
        sourceApp: item.sourceApp ?? null,
        createdAt: item.timestamp ? new Date(item.timestamp).getTime() : undefined,
        metadata: item.meta ?? undefined
      }))
    }

    if (sources.some((source) => source.type === 'desktop.active-app')) {
      const activeApp = await activeAppService.getActiveApp({ includeIcon: false })
      snapshot.activeApp = activeApp
        ? {
            identifier: activeApp.identifier,
            displayName: activeApp.displayName,
            bundleId: activeApp.bundleId,
            executablePath: activeApp.executablePath,
            windowTitle: activeApp.windowTitle,
            url: activeApp.url,
            lastUpdated: activeApp.lastUpdated
          }
        : null
    }

    if (sources.some((source) => source.type === 'desktop.recent-files')) {
      snapshot.recentFiles = history
        .filter((item) => item.type === 'files' || looksLikeFilePath(item.content ?? ''))
        .slice(0, 6)
        .map((item) => ({
          id: typeof item.id === 'number' ? String(item.id) : undefined,
          title:
            item.type === 'files'
              ? 'Clipboard file selection'
              : truncateText(item.content ?? '', 64),
          summary: truncateText(item.content ?? '', 200),
          path: item.content,
          lastUsedAt: item.timestamp ? new Date(item.timestamp).getTime() : undefined,
          metadata: item.meta ?? undefined
        }))
    }

    if (sources.some((source) => source.type === 'browser.recent-urls')) {
      snapshot.recentUrls = history
        .filter((item) => looksLikeUrl(item.content ?? ''))
        .slice(0, 6)
        .map((item) => ({
          id: typeof item.id === 'number' ? String(item.id) : undefined,
          title: truncateText(item.content ?? '', 72),
          summary: truncateText(item.rawContent ?? item.content ?? '', 200),
          url: item.content,
          lastUsedAt: item.timestamp ? new Date(item.timestamp).getTime() : undefined,
          metadata: item.meta ?? undefined
        }))
    }

    if (sources.some((source) => source.type === 'session.memory') && options.sessionId) {
      const trace = await tuffIntelligenceRuntime.queryTrace({
        sessionId: options.sessionId,
        limit: 8
      })
      snapshot.sessionMemory = trace.slice(-6).map((event) => ({
        id: event.id,
        content: truncateText(event.message, 180),
        updatedAt: event.timestamp,
        metadata: event.payload
      }))
    }

    return snapshot
  }
}

export const intelligenceDesktopContextService = new IntelligenceDesktopContextService()
