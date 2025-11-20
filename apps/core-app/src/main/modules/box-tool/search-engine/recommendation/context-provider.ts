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
    const [clipboard, systemState] = await Promise.all([
      this.getClipboardContext(),
      this.getSystemContext(),
    ])

    return {
      time: this.getTimeContext(),
      clipboard,
      // foregroundApp: await this.getForegroundAppContext(), // TODO: 需要 native 模块支持
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
      // 动态导入 clipboard 模块避免循环依赖
      const { default: clipboardModule } = await import('../../../clipboard')

      const latest = await clipboardModule.getLatestItem()
      if (!latest)
        return undefined

      // 只考虑 5 秒内的剪贴板内容
      const isRecent = Date.now() - latest.timestamp.getTime() < 5000
      if (!isRecent)
        return undefined

      return {
        type: latest.type,
        content: this.hashContent(latest.content), // 隐私保护:只存哈希
        timestamp: latest.timestamp.getTime(),
      }
    }
    catch (error) {
      console.error('[ContextProvider] Failed to get clipboard context:', error)
      return undefined
    }
  }

  /**
   * 获取前台应用上下文
   * TODO: 需要 native 模块支持获取前台应用
   */
  private async getForegroundAppContext(): Promise<ContextSignal['foregroundApp']> {
    // 在 macOS 上可以使用 NSWorkspace.sharedWorkspace().frontmostApplication
    // 需要通过 native addon 或 AppleScript 实现
    return undefined
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
   * 计算内容哈希(隐私保护)
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
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
