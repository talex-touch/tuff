import * as crypto from 'node:crypto'

/**
 * 上下文提供器
 * 负责获取当前的时间、剪贴板、前台应用等上下文信息
 */
export class ContextProvider {
  /**
   * 获取完整的当前上下文
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
   * 获取时间上下文
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
   * 获取剪贴板上下文
   * 检查最近的剪贴板内容(5秒内)
   */
  private async getClipboardContext(): Promise<ContextSignal['clipboard']> {
    try {
      // 动态导入 clipboard module 避免循环依赖
      const { clipboardModule } = await import('../../../clipboard')
      
      // 获取最新剪贴板项
      const latest = clipboardModule.getLatestItem()
      if (!latest || !latest.timestamp) {
        return undefined
      }

      // 检查是否在5秒内
      const isRecent = Date.now() - new Date(latest.timestamp).getTime() < 5000
      if (!isRecent) {
        return undefined
      }

      return {
        type: latest.type,
        content: this.hashContent(latest.content || ''), // 哈希保护隐私
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
   * 检测剪贴板内容类型
   */
  private detectClipboardContentType(item: any): {
    contentType?: 'url' | 'text' | 'code' | 'file'
    meta?: Record<string, any>
  } {
    const meta: Record<string, any> = {}
    let contentType: 'url' | 'text' | 'code' | 'file' = 'text'

    // 文本内容检测
    if (item.type === 'text') {
      const content = item.content || ''
      meta.textLength = content.length

      // URL 检测
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
          // 不是有效的 URL
        }
      }

      // 文件路径检测
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

    // 文件类型检测
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
   * 分类文件类型
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
   * 获取前台应用上下文
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
   * 计算内容哈希(隐私保护)
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  /**
   * 获取系统状态上下文
   */
  private async getSystemContext(): Promise<ContextSignal['systemState']> {
    return {
      isOnline: true, // TODO: 通过网络检测
      batteryLevel: 100, // TODO: 通过 Electron powerMonitor API
      isDNDEnabled: false, // TODO: 通过系统 API
    }
  }

  /**
   * 生成上下文缓存键
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

/**
 * 时间模式接口
 */
export interface TimePattern {
  hourOfDay: number // 0-23
  dayOfWeek: number // 0-6 (0=Sunday)
  isWorkingHours: boolean // 9:00-18:00 工作日
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night'
}

/**
 * 完整的上下文信号接口
 */
export interface ContextSignal {
  time: TimePattern
  clipboard?: {
    type: string
    content: string // 哈希值,非原文
    timestamp: number
    contentType?: 'url' | 'text' | 'code' | 'file' // 新增:检测到的内容类型
    meta?: { // 新增:元数据
      isUrl?: boolean
      urlDomain?: string
      textLength?: number
      fileExtension?: string
      fileType?: 'code' | 'text' | 'image' | 'document' | 'other'
      language?: string
    }
  }
  foregroundApp?: {
    bundleId: string
    name: string
  }
  systemState?: {
    isOnline: boolean
    batteryLevel: number
    isDNDEnabled: boolean
  }
}
