/**
 * 震动类型定义
 */
export type VibrateType = 'light' | 'heavy' | 'medium' | 'bit' | 'success' | 'warning' | 'error'

/**
 * 震动模式配置
 */
export interface VibratePattern {
  /** 震动持续时间数组 [震动时间, 暂停时间, 震动时间, ...] */
  pattern: number[]
  /** 描述 */
  description?: string
}

/**
 * 预设震动模式
 */
export const VIBRATE_PATTERNS: Record<VibrateType, VibratePattern> = {
  light: {
    pattern: [5],
    description: '轻微震动 - 适用于轻触反馈'
  },
  heavy: {
    pattern: [5, 30],
    description: '重度震动 - 适用于重要操作反馈'
  },
  medium: {
    pattern: [10, 15],
    description: '中等震动 - 适用于一般操作反馈'
  },
  bit: {
    pattern: [2, 1],
    description: '微震动 - 适用于细微交互反馈'
  },
  success: {
    pattern: [10, 50, 10],
    description: '成功震动 - 适用于成功操作反馈'
  },
  warning: {
    pattern: [15, 30, 15, 30, 15],
    description: '警告震动 - 适用于警告提示'
  },
  error: {
    pattern: [20, 100, 20, 100, 20],
    description: '错误震动 - 适用于错误提示'
  }
}

/**
 * 震动配置选项
 */
export interface VibrateOptions {
  /** 是否启用震动 */
  enabled?: boolean
  /** 自定义震动模式 */
  pattern?: number[]
  /** 是否在不支持震动的设备上静默失败 */
  silent?: boolean
}

/**
 * 使用预设震动类型
 * @param type 震动类型
 * @param options 配置选项
 */
export function useVibrate(type: VibrateType, options: VibrateOptions = {}) {
  const { enabled = true, silent = true } = options
  
  if (!enabled) return
  
  const pattern = options.pattern || VIBRATE_PATTERNS[type].pattern
  useAutoVibrate(pattern, { silent })
}

/**
 * 自动震动
 * @param duration 震动持续时间数组
 * @param options 配置选项
 */
export function useAutoVibrate(duration: number[], options: VibrateOptions = {}) {
  const { silent = true } = options
  
  try {
    // 检查是否在浏览器环境
    if (typeof window === 'undefined') {
      if (!silent) {
        console.warn('Vibrate API is not available in non-browser environment')
      }
      return false
    }
    
    // 检查是否支持震动 API
    if (!window.navigator.vibrate) {
      if (!silent) {
        console.warn('Vibrate API is not supported in this browser')
      }
      return false
    }
    
    // 执行震动
    return window.navigator.vibrate(duration)
  } catch (error) {
    if (!silent) {
      console.error('Failed to vibrate:', error)
    }
    return false
  }
}

/**
 * 停止震动
 */
export function stopVibrate() {
  try {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate(0)
      return true
    }
  } catch (error) {
    console.error('Failed to stop vibration:', error)
  }
  return false
}

/**
 * 检查是否支持震动 API
 */
export function isVibrateSupported(): boolean {
  return typeof window !== 'undefined' && 
         typeof window.navigator !== 'undefined' && 
         typeof window.navigator.vibrate === 'function'
}

/**
 * 创建自定义震动模式
 * @param pattern 震动模式数组
 * @param description 描述
 */
export function createVibratePattern(pattern: number[], description?: string): VibratePattern {
  return {
    pattern,
    description
  }
}

/**
 * 震动工具类
 */
export class VibrateManager {
  private enabled: boolean = true
  private silent: boolean = true
  
  constructor(options: VibrateOptions = {}) {
    this.enabled = options.enabled ?? true
    this.silent = options.silent ?? true
  }
  
  /**
   * 设置是否启用震动
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }
  
  /**
   * 设置是否静默模式
   */
  setSilent(silent: boolean) {
    this.silent = silent
  }
  
  /**
   * 执行震动
   */
  vibrate(type: VibrateType, customPattern?: number[]) {
    if (!this.enabled) return false
    
    const pattern = customPattern || VIBRATE_PATTERNS[type].pattern
    return useAutoVibrate(pattern, { silent: this.silent })
  }
  
  /**
   * 停止震动
   */
  stop() {
    return stopVibrate()
  }
  
  /**
   * 检查支持状态
   */
  isSupported() {
    return isVibrateSupported()
  }
}

/**
 * 默认震动管理器实例
 */
export const defaultVibrateManager = new VibrateManager()

// 导出常用方法的简化版本
export const vibrate = {
  light: () => useVibrate('light'),
  heavy: () => useVibrate('heavy'),
  medium: () => useVibrate('medium'),
  bit: () => useVibrate('bit'),
  success: () => useVibrate('success'),
  warning: () => useVibrate('warning'),
  error: () => useVibrate('error'),
  stop: stopVibrate,
  isSupported: isVibrateSupported
}
