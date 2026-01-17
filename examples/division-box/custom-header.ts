/**
 * DivisionBox 自定义 Header 示例
 *
 * 本示例展示如何:
 * 1. 自定义 Header 标题和图标
 * 2. 添加自定义操作按钮
 * 3. 处理按钮点击事件
 * 4. 动态更新 Header
 * 5. 切换沉浸模式
 */

import type { Plugin } from '@talex-touch/utils'

export default class CustomHeaderExample implements Plugin {
  private currentSessionId: string | null = null
  private isImmersiveMode = false

  async onLoad() {
    console.log('CustomHeaderExample plugin loaded')

    // 注册 Header 操作按钮处理器
    this.plugin.divisionBox.onHeaderAction((actionId, sessionId) => {
      console.log('Header action triggered:', actionId, sessionId)
      this.handleHeaderAction(actionId, sessionId)
    })
  }

  /**
   * 打开带自定义 Header 的 DivisionBox
   */
  async openWithCustomHeader() {
    try {
      console.log('Opening DivisionBox with custom header...')

      const { sessionId } = await this.plugin.divisionBox.open({
        url: 'https://example.com/translator',
        title: '智能翻译',
        icon: 'ri:translate-2',
        size: 'medium',
        keepAlive: true,
        header: {
          show: true,
          title: '智能翻译助手',
          icon: 'ri:translate-2',
          actions: [
            {
              id: 'swap-languages',
              label: '交换语言',
              icon: 'ri:arrow-left-right-line',
            },
            {
              id: 'copy-result',
              label: '复制结果',
              icon: 'ri:file-copy-line',
            },
            {
              id: 'history',
              label: '历史记录',
              icon: 'ri:history-line',
            },
            {
              id: 'settings',
              label: '设置',
              icon: 'ri:settings-3-line',
            },
            {
              id: 'toggle-immersive',
              label: '沉浸模式',
              icon: 'ri:fullscreen-line',
            },
          ],
        },
      })

      console.log('DivisionBox opened with custom header:', sessionId)
      this.currentSessionId = sessionId

      return sessionId
    }
    catch (error) {
      console.error('Failed to open DivisionBox:', error)
      throw error
    }
  }

  /**
   * 处理 Header 操作按钮点击
   */
  private async handleHeaderAction(actionId: string, sessionId: string) {
    console.log(`Handling action: ${actionId} for session: ${sessionId}`)

    try {
      switch (actionId) {
        case 'swap-languages':
          await this.swapLanguages(sessionId)
          break

        case 'copy-result':
          await this.copyResult(sessionId)
          break

        case 'history':
          await this.showHistory(sessionId)
          break

        case 'settings':
          await this.openSettings(sessionId)
          break

        case 'toggle-immersive':
          await this.toggleImmersiveMode(sessionId)
          break

        default:
          console.warn('Unknown action:', actionId)
      }
    }
    catch (error) {
      console.error(`Failed to handle action ${actionId}:`, error)
      this.showNotification('操作失败,请重试')
    }
  }

  /**
   * 交换源语言和目标语言
   */
  private async swapLanguages(sessionId: string) {
    console.log('Swapping languages...')

    // 获取当前语言设置
    const currentLangs = await this.plugin.divisionBox.getState(sessionId, 'languages')

    if (currentLangs) {
      // 交换语言
      const swapped = {
        source: currentLangs.target,
        target: currentLangs.source,
      }

      // 保存新的语言设置
      await this.plugin.divisionBox.updateState(sessionId, 'languages', swapped)

      console.log('Languages swapped:', swapped)
      this.showNotification('语言已交换')
    }
    else {
      // 设置默认语言
      await this.plugin.divisionBox.updateState(sessionId, 'languages', {
        source: 'zh-CN',
        target: 'en-US',
      })
    }
  }

  /**
   * 复制翻译结果到剪贴板
   */
  private async copyResult(sessionId: string) {
    console.log('Copying result...')

    // 获取翻译结果
    const result = await this.plugin.divisionBox.getState(sessionId, 'translationResult')

    if (result) {
      // 复制到剪贴板
      await navigator.clipboard.writeText(result)
      console.log('Result copied to clipboard')
      this.showNotification('已复制到剪贴板')
    }
    else {
      console.warn('No result to copy')
      this.showNotification('没有可复制的内容')
    }
  }

  /**
   * 显示翻译历史记录
   */
  private async showHistory(sessionId: string) {
    console.log('Showing history...')

    // 获取历史记录
    const history = await this.plugin.divisionBox.getState(sessionId, 'history') || []

    console.log('Translation history:', history)

    // 在 DivisionBox 中显示历史记录
    await this.plugin.divisionBox.updateState(sessionId, 'showHistory', true)

    this.showNotification(`共有 ${history.length} 条历史记录`)
  }

  /**
   * 打开设置面板
   */
  private async openSettings(sessionId: string) {
    console.log('Opening settings...')

    // 在 DivisionBox 中显示设置面板
    await this.plugin.divisionBox.updateState(sessionId, 'showSettings', true)

    this.showNotification('设置面板已打开')
  }

  /**
   * 切换沉浸模式
   */
  private async toggleImmersiveMode(sessionId: string) {
    console.log('Toggling immersive mode...')

    this.isImmersiveMode = !this.isImmersiveMode

    // 关闭当前 DivisionBox
    await this.plugin.divisionBox.close(sessionId)

    // 重新打开,切换 Header 显示状态
    const { sessionId: newSessionId } = await this.plugin.divisionBox.open({
      url: 'https://example.com/translator',
      title: '智能翻译',
      size: 'medium',
      keepAlive: true,
      header: {
        show: !this.isImmersiveMode, // 切换 Header 显示
      },
    })

    this.currentSessionId = newSessionId

    const mode = this.isImmersiveMode ? '沉浸模式' : '正常模式'
    console.log(`Switched to ${mode}`)
    this.showNotification(`已切换到${mode}`)
  }

  /**
   * 打开最小化 Header 的 DivisionBox
   */
  async openWithMinimalHeader() {
    try {
      console.log('Opening DivisionBox with minimal header...')

      const { sessionId } = await this.plugin.divisionBox.open({
        url: 'https://example.com/calculator',
        title: '计算器',
        icon: 'ri:calculator-line',
        size: 'compact',
        header: {
          show: true,
          title: '计算器',
          icon: 'ri:calculator-line',
          actions: [
            {
              id: 'clear',
              label: '清除',
              icon: 'ri:delete-bin-line',
            },
          ],
        },
      })

      console.log('DivisionBox opened with minimal header:', sessionId)
      return sessionId
    }
    catch (error) {
      console.error('Failed to open DivisionBox:', error)
      throw error
    }
  }

  /**
   * 打开沉浸模式 (无 Header) 的 DivisionBox
   */
  async openImmersiveMode() {
    try {
      console.log('Opening DivisionBox in immersive mode...')

      const { sessionId } = await this.plugin.divisionBox.open({
        url: 'https://example.com/focus-timer',
        title: '专注计时器',
        size: 'compact',
        header: {
          show: false, // 隐藏 Header,进入沉浸模式
        },
      })

      console.log('DivisionBox opened in immersive mode:', sessionId)
      return sessionId
    }
    catch (error) {
      console.error('Failed to open DivisionBox:', error)
      throw error
    }
  }

  /**
   * 显示通知
   */
  private showNotification(message: string) {
    console.log('Notification:', message)
    // 实际实现中应该调用系统通知 API
  }

  /**
   * 插件功能被触发时调用
   */
  async onFeatureTriggered(featureId: string, query: string) {
    console.log('Feature triggered:', featureId)

    switch (featureId) {
      case 'custom-header':
        await this.openWithCustomHeader()
        break

      case 'minimal-header':
        await this.openWithMinimalHeader()
        break

      case 'immersive-mode':
        await this.openImmersiveMode()
        break

      default:
        await this.openWithCustomHeader()
    }
  }

  /**
   * 插件卸载时清理资源
   */
  async onUnload() {
    console.log('Cleaning up...')

    if (this.currentSessionId) {
      await this.plugin.divisionBox.close(this.currentSessionId, { force: true })
    }

    console.log('CustomHeaderExample plugin unloaded')
  }
}
