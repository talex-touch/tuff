import type { Component } from 'vue'
import { isCoreBox } from '@talex-touch/utils/renderer'

/**
 * 对话框优先级级别
 */
export type DialogPriority = 'low' | 'normal' | 'high'

/**
 * 生命周期回调类型
 */
export interface DialogLifecycleCallbacks {
  onShow?: () => void
  onHide?: () => void
  onDestroy?: () => void
}

/**
 * 对话框实例配置
 */
export interface DialogConfig extends DialogLifecycleCallbacks {
  /** 对话框唯一标识符 */
  id: string
  /** 要渲染的 Vue 组件 */
  component: Component
  /** 传递给组件的属性 */
  props: Record<string, unknown>
  /** DOM 容器元素 */
  container: HTMLElement
  /** 清理函数，用于卸载和移除对话框 */
  cleanup: () => void
  /** 优先级级别（默认: 'normal'） */
  priority?: DialogPriority
  /** 是否允许在 CoreBox 窗口中显示（默认: true） */
  allowInCoreBox?: boolean
}

/**
 * 统一对话框管理器
 *
 * 管理对话框堆栈，只有最顶层的对话框可见。
 * 当对话框关闭时，堆栈中的下一个对话框会自动显示。
 *
 * @example
 * ```ts
 * const manager = DialogManager.getInstance()
 *
 * manager.register({
 *   id: 'my-dialog',
 *   component: MyDialog,
 *   props: { title: 'Hello' },
 *   container: document.createElement('div'),
 *   cleanup: () => render(null, container),
 *   allowInCoreBox: false
 * })
 * ```
 */
export class DialogManager {
  private static instance: DialogManager | null = null

  /** 活动对话框堆栈（最后一个 = 最顶层） */
  private stack: DialogConfig[] = []

  private constructor() {
    // 在 CoreBox 中不允许创建 DialogManager
    if (isCoreBox()) {
      throw new Error(
        '[DialogManager] 对话框管理器不允许在 CoreBox 窗口中使用！' +
          'CoreBox 是一个轻量级搜索窗口，不应该显示任何对话框。'
      )
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(): DialogManager {
    if (!DialogManager.instance) {
      DialogManager.instance = new DialogManager()
    }
    return DialogManager.instance
  }

  /**
   * 注册新对话框并添加到堆栈
   *
   * @param config - 对话框配置
   */
  register(config: DialogConfig): void {
    // 检查相同 ID 的对话框是否已存在
    const existingIndex = this.stack.findIndex((d) => d.id === config.id)
    if (existingIndex !== -1) {
      console.warn(`[DialogManager] 对话框 "${config.id}" 已存在，将替换它`)
      this.unregister(config.id)
    }

    // 在添加新对话框前隐藏当前可见的对话框
    const currentVisible = this.getVisibleDialog()
    if (currentVisible) {
      this.hideDialog(currentVisible)
    }

    // 添加到堆栈
    this.stack.push(config)

    // 显示新对话框（现在是最顶层）
    this.showDialog(config)

    console.log(`[DialogManager] 已注册对话框 "${config.id}"，堆栈大小: ${this.stack.length}`)
  }

  /**
   * 注销并从堆栈中移除对话框
   *
   * @param id - 要移除的对话框 ID
   */
  unregister(id: string): void {
    const index = this.stack.findIndex((d) => d.id === id)
    if (index === -1) {
      console.warn(`[DialogManager] 对话框 "${id}" 未在堆栈中找到`)
      return
    }

    const [dialog] = this.stack.splice(index, 1)
    const wasVisible = index === this.stack.length // 它是最顶层的吗？

    // 调用生命周期钩子
    if (dialog.onDestroy) {
      dialog.onDestroy()
    }

    console.log(`[DialogManager] 已注销对话框 "${id}"，堆栈大小: ${this.stack.length}`)

    // 如果移除的是可见的对话框，显示下一个
    if (wasVisible && this.stack.length > 0) {
      const nextVisible = this.getVisibleDialog()
      if (nextVisible) {
        this.showDialog(nextVisible)
      }
    }
  }

  /**
   * 获取当前可见的对话框（堆栈最顶层）
   *
   * @returns 可见的对话框配置，如果堆栈为空则返回 null
   */
  getVisibleDialog(): DialogConfig | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null
  }

  /**
   * 获取堆栈中的所有对话框
   *
   * @returns 所有对话框配置的数组
   */
  getAllDialogs(): DialogConfig[] {
    return [...this.stack]
  }

  /**
   * 获取堆栈大小
   */
  getStackSize(): number {
    return this.stack.length
  }

  /**
   * 清除堆栈中的所有对话框
   */
  clearAll(): void {
    console.log(`[DialogManager] 正在清除所有对话框（共 ${this.stack.length} 个）`)

    // 为所有对话框调用清理函数
    this.stack.forEach((dialog) => {
      if (dialog.onDestroy) {
        dialog.onDestroy()
      }
      dialog.cleanup()
    })

    this.stack = []
  }

  /**
   * 显示对话框（使其可见）
   *
   * @param dialog - 要显示的对话框
   */
  private showDialog(dialog: DialogConfig): void {
    dialog.container.style.display = ''

    if (dialog.onShow) {
      dialog.onShow()
    }
  }

  /**
   * 隐藏对话框（设置 display: none）
   *
   * @param dialog - 要隐藏的对话框
   */
  private hideDialog(dialog: DialogConfig): void {
    dialog.container.style.display = 'none'

    if (dialog.onHide) {
      dialog.onHide()
    }
  }
}

/**
 * 获取对话框管理器单例实例
 *
 * @throws {Error} 如果在 CoreBox 窗口中调用
 */
export function useDialogManager(): DialogManager {
  if (isCoreBox()) {
    throw new Error(
      '[useDialogManager] 对话框系统不允许在 CoreBox 窗口中使用！' +
        'CoreBox 是搜索窗口，不应该显示对话框。'
    )
  }
  return DialogManager.getInstance()
}
