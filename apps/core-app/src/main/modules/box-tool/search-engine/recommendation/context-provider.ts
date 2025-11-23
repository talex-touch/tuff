import * as crypto from 'node:crypto'
import type { ContextSignal, TimePattern } from '@talex-touch/utils/core-box'

/**
 * Context provider for recommendation engine.
 * Gathers temporal, clipboard, and foreground app state for intelligent matching.
 * 
 * @remarks
 * Uses dynamic imports to avoid circular dependencies with clipboard and activeApp modules.
 * This is intentional - see plan.prd for future refactoring.
 */
export class ContextProvider {
  /**
   * Retrieves complete current context signal.
   */
  async getCurrentContext(): Promise<ContextSignal> {
    const [clipboard, foregroundApp, systemState] = await Promise.all([
      this.getClipboardContext(),
      this.getForegroundAppContext(),
      this.getSystemContext(),
    ])

    return {
      time: this.getTimeContext(),
      clipboard,
      foregroundApp,
      systemState,
    }
  }

  /**
   * Determines current time pattern for time-based recommendations.
   */
  getTimeContext(): TimePattern {
    const now = new Date()
    const hour = now.getHours()
    const dayOfWeek = now.getDay()

    let timeSlot: TimePattern['timeSlot']
    if (hour >= 6 && hour < 12)
      timeSlot = 'morning'
    else if (hour >= 12 && hour < 18)
      timeSlot = 'afternoon'
    else if (hour >= 18 && hour < 22)
      timeSlot = 'evening'
    else
      timeSlot = 'night'

    return {
      hourOfDay: hour,
      dayOfWeek,
      isWorkingHours: hour >= 9 && hour < 18 && dayOfWeek >= 1 && dayOfWeek <= 5,
      timeSlot,
    }
  }

  /**
   * Retrieves clipboard context if content is recent (within 5 seconds).
   * 
   * @remarks
   * Dynamic import prevents circular dependency with clipboard module.
   */
  private async getClipboardContext(): Promise<ContextSignal['clipboard']> {
    try {
      const { clipboardModule } = await import('../../../clipboard')
      
      const latest = clipboardModule.getLatestItem()
      if (!latest || !latest.timestamp) {
        return undefined
      }

      const isRecent = Date.now() - new Date(latest.timestamp).getTime() < 5000
      if (!isRecent) {
        return undefined
      }

      return {
        type: latest.type,
        content: this.hashContent(latest.content || ''),
        timestamp: new Date(latest.timestamp).getTime(),
        ...this.detectClipboardContentType(latest),
      }
    }
    catch (error) {
      console.debug('[ContextProvider] Failed to get clipboard context:', error)
      return undefined
    }
  }

  /**
   * Detects semantic type of clipboard content.
   */
  private detectClipboardContentType(item: any): {
    contentType?: 'url' | 'text' | 'code' | 'file'
    meta?: Record<string, any>
  } {
    const meta: Record<string, any> = {}
    let contentType: 'url' | 'text' | 'code' | 'file' = 'text'

    if (item.type === 'text') {
      const content = item.content || ''
      meta.textLength = content.length

      const urlPattern = /^https?:\/\//i
      if (urlPattern.test(content.trim())) {
        try {
          const url = new URL(content.trim())
          contentType = 'url'
          meta.isUrl = true
          meta.urlDomain = url.hostname
          meta.protocol = url.protocol
        }
        catch {
          // Not a valid URL
        }
      }

      if (contentType === 'text') {
        const pathMatch = content.match(/\.([a-z0-9]+)$/i)
        if (pathMatch) {
          const ext = pathMatch[1].toLowerCase()
          const fileTypeInfo = this.categorizeFileType(ext)
          if (fileTypeInfo.fileType !== 'other') {
            contentType = 'file'
            meta.fileExtension = ext
            meta.fileType = fileTypeInfo.fileType
            meta.language = fileTypeInfo.language
          }
        }
      }
    }

    if (item.type === 'files') {
      try {
        const files = JSON.parse(item.content || '[]')
        if (files.length > 0) {
          const firstFile = files[0]
          const extMatch = firstFile.match(/\.([a-z0-9]+)$/i)
          if (extMatch) {
            const ext = extMatch[1].toLowerCase()
            const fileTypeInfo = this.categorizeFileType(ext)
            contentType = 'file'
            meta.fileExtension = ext
            meta.fileType = fileTypeInfo.fileType
            meta.language = fileTypeInfo.language
          }
        }
      }
      catch {}
    }

    return { contentType, meta }
  }

  /**
   * Categorizes file extension into broad types.
   */
  private categorizeFileType(ext: string): {
    fileType: 'code' | 'text' | 'image' | 'document' | 'other'
    language?: string
  } {
    const codeExts = new Map([
      ['js', 'javascript'],
      ['jsx', 'javascript'],
      ['ts', 'typescript'],
      ['tsx', 'typescript'],
      ['py', 'python'],
      ['java', 'java'],
      ['kt', 'kotlin'],
      ['swift', 'swift'],
      ['c', 'c'],
      ['cpp', 'cpp'],
      ['cs', 'csharp'],
      ['go', 'go'],
      ['rs', 'rust'],
      ['php', 'php'],
      ['rb', 'ruby'],
      ['scala', 'scala'],
      ['html', 'html'],
      ['css', 'css'],
      ['scss', 'scss'],
      ['vue', 'vue'],
      ['svelte', 'svelte'],
    ])

    const textExts = new Set(['txt', 'md', 'markdown', 'log', 'json', 'xml', 'yaml', 'yml'])
    const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'psd', 'ai'])
    const docExts = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

    if (codeExts.has(ext)) {
      return { fileType: 'code', language: codeExts.get(ext) }
    }
    if (textExts.has(ext)) return { fileType: 'text' }
    if (imageExts.has(ext)) return { fileType: 'image' }
    if (docExts.has(ext)) return { fileType: 'document' }
    return { fileType: 'other' }
  }

  /**
   * Retrieves foreground application context.
   * 
   * @remarks
   * Dynamic import prevents circular dependency with activeApp module.
   */
  private async getForegroundAppContext(): Promise<ContextSignal['foregroundApp']> {
    try {
      const { activeAppService } = await import('../../../system/active-app')
      const activeApp = await activeAppService.getActiveApp()

      if (!activeApp || !activeApp.bundleId) {
        return undefined
      }

      return {
        bundleId: activeApp.bundleId,
        name: activeApp.displayName || activeApp.identifier || '',
      }
    }
    catch (error) {
      console.debug('[ContextProvider] Failed to get foreground app context:', error)
      return undefined
    }
  }

  /**
   * Generates privacy-safe hash of content.
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  /**
   * Retrieves system state context.
   * 
   * @remarks
   * Placeholder implementation - see plan.prd for future enhancement.
   */
  private async getSystemContext(): Promise<ContextSignal['systemState']> {
    return {
      isOnline: true,
      batteryLevel: 100,
      isDNDEnabled: false,
    }
  }

  /**
   * Generates cache key from context signal.
   */
  generateCacheKey(context: ContextSignal): string {
    const parts: string[] = [
      context.time.timeSlot,
      context.time.dayOfWeek.toString(),
    ]

    if (context.clipboard) {
      parts.push(`cb:${context.clipboard.type}:${context.clipboard.content}`)
    }

    if (context.foregroundApp) {
      parts.push(`fg:${context.foregroundApp.bundleId}`)
    }

    return parts.join('|')
  }
}

export { TimePattern, ContextSignal }
