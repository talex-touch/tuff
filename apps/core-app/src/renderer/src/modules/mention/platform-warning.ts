import type { AppContext, Component } from 'vue'
import { isCoreBox } from '@talex-touch/utils/renderer'
import { createVNode, getCurrentInstance, render } from 'vue'
import PlatformCompatibilityWarning from '~/components/base/dialog/PlatformCompatibilityWarning.vue'
import { useDialogManager } from './dialog-manager'

/**
 * 全局应用上下文缓存（从 App.vue 捕获）
 */
let globalAppContext: AppContext | null = null

/**
 * 捕获全局应用上下文
 * 必须在 App.vue 中调用
 */
export function capturePlatformWarningContext(): void {
  const instance = getCurrentInstance()
  if (instance) {
    globalAppContext = instance.appContext
  }
}

/**
 * 渲染组件到 DOM（使用全局 context）
 */
function renderWithGlobalContext(
  component: Component,
  props: Record<string, unknown>,
  container: HTMLElement
): () => void {
  const vnode = createVNode(component, props)

  if (globalAppContext) {
    vnode.appContext = globalAppContext
  }

  render(vnode, container)

  return () => {
    render(null, container)
  }
}

/**
 * 显示平台兼容性警告对话框
 * @param warningMessage - 警告消息
 * @returns Promise，当对话框关闭时解析
 */
export async function showPlatformCompatibilityWarning(warningMessage: string): Promise<void> {
  // 在 CoreBox 中不显示
  if (isCoreBox()) {
    console.warn('[PlatformWarning] CoreBox 窗口不显示平台兼容性警告')
    return
  }

  return new Promise<void>((resolve) => {
    const root: HTMLDivElement = document.createElement('div')
    const dialogId = `platform-warning-${Date.now()}`
    const dialogManager = useDialogManager()

    root.id = dialogId
    root.style.zIndex = `${10000 + dialogManager.getStackSize()}`

    const cleanup = renderWithGlobalContext(
      PlatformCompatibilityWarning,
      {
        warningMessage,
        onContinue: () => {
          dialogManager.unregister(dialogId)
          cleanup()
          document.body.removeChild(root)
          resolve()
        },
        onDontShowAgain: () => {
          // 保存用户选择，不再显示此警告
          localStorage.setItem('platform-warning-dismissed', 'true')
          dialogManager.unregister(dialogId)
          cleanup()
          document.body.removeChild(root)
          resolve()
        }
      },
      root
    )

    document.body.appendChild(root)

    // 注册到 dialog manager
    dialogManager.register({
      id: dialogId,
      component: PlatformCompatibilityWarning,
      props: { warningMessage },
      container: root,
      cleanup,
      allowInCoreBox: false
    })
  })
}

/**
 * 检查是否应该显示平台兼容性警告
 * @returns 如果应该显示警告则返回true
 */
export function shouldShowPlatformWarning(): boolean {
  // 检查用户是否已经选择不再显示
  const dismissed = localStorage.getItem('platform-warning-dismissed')
  return dismissed !== 'true'
}

/**
 * 重置平台兼容性警告状态（用于测试或用户设置）
 */
export function resetPlatformWarningState(): void {
  localStorage.removeItem('platform-warning-dismissed')
}
