/**
 * DivisionBox 基础使用示例
 *
 * 本示例展示如何:
 * 1. 创建简单的 DivisionBox
 * 2. 监听状态变化
 * 3. 更新 sessionState
 * 4. 关闭 DivisionBox
 */

import { Plugin, DivisionBoxState } from '@talex-touch/utils'

export default class BasicUsageExample implements Plugin {
  private currentSessionId: string | null = null

  async onLoad() {
    console.log('BasicUsageExample plugin loaded')

    // 监听状态变化
    this.plugin.divisionBox.onStateChange((data) => {
      console.log(`Session ${data.sessionId} state changed:`, {
        from: data.oldState,
        to: data.newState
      })

      // 当 DivisionBox 变为活跃状态时
      if (data.newState === DivisionBoxState.ACTIVE) {
        console.log('DivisionBox is now visible and interactive')
      }

      // 当 DivisionBox 被销毁时
      if (data.newState === DivisionBoxState.DESTROY) {
        console.log('DivisionBox has been destroyed')
        if (data.sessionId === this.currentSessionId) {
          this.currentSessionId = null
        }
      }
    })
  }

  /**
   * 打开一个简单的 DivisionBox
   */
  async openSimpleDivisionBox() {
    try {
      console.log('Opening DivisionBox...')

      const { sessionId } = await this.plugin.divisionBox.open({
        url: 'https://example.com/tool',
        title: '简单工具',
        icon: 'ri:tools-line',
        size: 'medium'
      })

      console.log('DivisionBox opened successfully:', sessionId)
      this.currentSessionId = sessionId

      return sessionId
    } catch (error) {
      console.error('Failed to open DivisionBox:', error)
      throw error
    }
  }

  /**
   * 更新 DivisionBox 的状态
   */
  async updateDivisionBoxState(sessionId: string) {
    try {
      // 保存用户数据
      await this.plugin.divisionBox.updateState(sessionId, 'userData', {
        name: 'John Doe',
        preferences: {
          theme: 'dark',
          language: 'zh-CN'
        }
      })

      console.log('State updated successfully')

      // 读取状态
      const userData = await this.plugin.divisionBox.getState(sessionId, 'userData')
      console.log('Current user data:', userData)
    } catch (error) {
      console.error('Failed to update state:', error)
    }
  }

  /**
   * 关闭 DivisionBox
   */
  async closeDivisionBox(sessionId: string) {
    try {
      console.log('Closing DivisionBox...')

      await this.plugin.divisionBox.close(sessionId)

      console.log('DivisionBox closed successfully')
    } catch (error) {
      console.error('Failed to close DivisionBox:', error)
    }
  }

  /**
   * 延迟关闭 DivisionBox (带动画)
   */
  async closeWithDelay(sessionId: string) {
    try {
      console.log('Closing DivisionBox with delay...')

      await this.plugin.divisionBox.close(sessionId, {
        delay: 2000,      // 2 秒后关闭
        animation: true   // 播放关闭动画
      })

      console.log('DivisionBox will close in 2 seconds')
    } catch (error) {
      console.error('Failed to close DivisionBox:', error)
    }
  }

  /**
   * 获取所有活跃的会话
   */
  async listActiveSessions() {
    try {
      const sessions = await this.plugin.divisionBox.getActiveSessions()

      console.log(`Found ${sessions.length} active sessions:`)
      sessions.forEach(session => {
        console.log(`- ${session.sessionId}:`, {
          state: session.state,
          title: session.meta.title,
          size: session.meta.size
        })
      })

      return sessions
    } catch (error) {
      console.error('Failed to list sessions:', error)
      return []
    }
  }

  /**
   * 插件功能被触发时调用
   */
  async onFeatureTriggered(featureId: string, query: string) {
    console.log('Feature triggered:', featureId, query)

    // 打开 DivisionBox
    const sessionId = await this.openSimpleDivisionBox()

    // 更新状态
    await this.updateDivisionBoxState(sessionId)

    // 5 秒后自动关闭
    setTimeout(async () => {
      await this.closeDivisionBox(sessionId)
    }, 5000)
  }

  /**
   * 插件卸载时清理资源
   */
  async onUnload() {
    console.log('Cleaning up...')

    // 关闭当前会话
    if (this.currentSessionId) {
      await this.plugin.divisionBox.close(this.currentSessionId, {
        force: true  // 强制关闭
      })
    }

    console.log('BasicUsageExample plugin unloaded')
  }
}
