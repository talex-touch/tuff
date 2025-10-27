import { createApp, type App } from 'vue'
import PlatformCompatibilityWarning from '~/components/base/dialog/PlatformCompatibilityWarning.vue'
import VWave from 'v-wave'

/**
 * 显示平台兼容性警告对话框
 * @param warningMessage - 警告消息
 * @returns Promise，当对话框关闭时解析
 */
export async function showPlatformCompatibilityWarning(
  warningMessage: string
): Promise<void> {
  return new Promise<void>((resolve) => {
    const root: HTMLDivElement = document.createElement('div')

    let index: number = 0
    while (document.getElementById('platform-warning-' + index)) {
      index++
    }

    root.id = 'platform-warning-' + index
    root.style.zIndex = `${100000 + index}`

    const app: App<Element> = createApp(PlatformCompatibilityWarning, {
      warningMessage,
      onContinue: () => {
        app.unmount()
        document.body.removeChild(root)
        resolve()
      },
      onDontShowAgain: () => {
        // 保存用户选择，不再显示此警告
        localStorage.setItem('platform-warning-dismissed', 'true')
        app.unmount()
        document.body.removeChild(root)
        resolve()
      }
    })

    document.body.appendChild(root)
    app.use(VWave, {})
    app.mount(root)
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
