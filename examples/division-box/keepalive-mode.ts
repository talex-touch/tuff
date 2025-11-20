/**
 * DivisionBox KeepAlive 模式示例
 * 
 * 本示例展示如何:
 * 1. 启用 KeepAlive 缓存模式
 * 2. 快速恢复会话
 * 3. 保存和恢复用户状态
 * 4. 管理缓存生命周期
 */

import { Plugin, DivisionBoxState } from '@talex-touch/utils'

interface UserSession {
  sessionId: string
  lastAccessTime: number
  userData: {
    scrollPosition: { x: number; y: number }
    draftContent: string
    selectedTab: string
  }
}

export default class KeepAliveModeExample implements Plugin {
  private sessions: Map<string, UserSession> = new Map()

  async onLoad() {
    console.log('KeepAliveModeExample plugin loaded')

    // 监听状态变化
    this.plugin.divisionBox.onStateChange((data) => {
      if (data.newState === DivisionBoxState.INACTIVE) {
        console.log(`Session ${data.sessionId} is now cached (keepAlive)`)
        this.onSessionCached(data.sessionId)
      }

      if (data.newState === DivisionBoxState.ACTIVE && data.oldState === DivisionBoxState.INACTIVE) {
        console.log(`Session ${data.sessionId} restored from cache`)
        this.onSessionRestored(data.sessionId)
      }
    })
  }

  /**
   * 打开启用 KeepAlive 的 DivisionBox
   */
  async openWithKeepAlive() {
    try {
      console.log('Opening DivisionBox with keepAlive enabled...')

      const { sessionId } = await this.plugin.divisionBox.open({
        url: 'https://example.com/editor',
        title: '文档编辑器',
        icon: 'ri:file-edit-line',
        size: 'expanded',
        keepAlive: true  // 启用缓存模式
      })

      console.log('DivisionBox opened with keepAlive:', sessionId)

      // 初始化会话数据
      this.sessions.set(sessionId, {
        sessionId,
        lastAccessTime: Date.now(),
        userData: {
          scrollPosition: { x: 0, y: 0 },
          draftContent: '',
          selectedTab: 'editor'
        }
      })

      return sessionId
    } catch (error) {
      console.error('Failed to open DivisionBox:', error)
      throw error
    }
  }

  /**
   * 保存用户状态到 sessionState
   */
  async saveUserState(sessionId: string) {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        console.warn('Session not found:', sessionId)
        return
      }

      console.log('Saving user state for session:', sessionId)

      // 保存滚动位置
      await this.plugin.divisionBox.updateState(
        sessionId,
        'scrollPosition',
        session.userData.scrollPosition
      )

      // 保存草稿内容
      await this.plugin.divisionBox.updateState(
        sessionId,
        'draftContent',
        session.userData.draftContent
      )

      // 保存选中的标签页
      await this.plugin.divisionBox.updateState(
        sessionId,
        'selectedTab',
        session.userData.selectedTab
      )

      // 保存最后访问时间
      await this.plugin.divisionBox.updateState(
        sessionId,
        'lastAccessTime',
        Date.now()
      )

      console.log('User state saved successfully')
    } catch (error) {
      console.error('Failed to save user state:', error)
    }
  }

  /**
   * 从 sessionState 恢复用户状态
   */
  async restoreUserState(sessionId: string) {
    try {
      console.log('Restoring user state for session:', sessionId)

      // 恢复滚动位置
      const scrollPosition = await this.plugin.divisionBox.getState(
        sessionId,
        'scrollPosition'
      )

      // 恢复草稿内容
      const draftContent = await this.plugin.divisionBox.getState(
        sessionId,
        'draftContent'
      )

      // 恢复选中的标签页
      const selectedTab = await this.plugin.divisionBox.getState(
        sessionId,
        'selectedTab'
      )

      // 恢复最后访问时间
      const lastAccessTime = await this.plugin.divisionBox.getState(
        sessionId,
        'lastAccessTime'
      )

      // 更新本地会话数据
      const session = this.sessions.get(sessionId)
      if (session) {
        session.userData = {
          scrollPosition: scrollPosition || { x: 0, y: 0 },
          draftContent: draftContent || '',
          selectedTab: selectedTab || 'editor'
        }
        session.lastAccessTime = lastAccessTime || Date.now()
      }

      console.log('User state restored:', {
        scrollPosition,
        draftContent: draftContent?.substring(0, 50) + '...',
        selectedTab,
        lastAccessTime: new Date(lastAccessTime).toISOString()
      })
    } catch (error) {
      console.error('Failed to restore user state:', error)
    }
  }

  /**
   * 会话被缓存时调用
   */
  private async onSessionCached(sessionId: string) {
    console.log('Session cached, saving state...')
    await this.saveUserState(sessionId)
  }

  /**
   * 会话从缓存恢复时调用
   */
  private async onSessionRestored(sessionId: string) {
    console.log('Session restored, loading state...')
    await this.restoreUserState(sessionId)

    // 更新最后访问时间
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastAccessTime = Date.now()
    }
  }

  /**
   * 模拟用户编辑操作
   */
  async simulateUserEditing(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // 模拟滚动
    session.userData.scrollPosition = {
      x: 0,
      y: Math.random() * 1000
    }

    // 模拟编辑内容
    session.userData.draftContent = `Draft content at ${new Date().toISOString()}\n` +
      'Lorem ipsum dolor sit amet...'

    // 模拟切换标签页
    session.userData.selectedTab = ['editor', 'preview', 'settings'][
      Math.floor(Math.random() * 3)
    ]

    console.log('User editing simulated:', session.userData)

    // 保存状态
    await this.saveUserState(sessionId)
  }

  /**
   * 测试 KeepAlive 性能
   */
  async testKeepAlivePerformance() {
    console.log('Testing KeepAlive performance...')

    // 1. 打开 DivisionBox
    const openStart = performance.now()
    const sessionId = await this.openWithKeepAlive()
    const openTime = performance.now() - openStart
    console.log(`Initial open time: ${openTime.toFixed(2)}ms`)

    // 2. 模拟用户操作
    await this.simulateUserEditing(sessionId)

    // 3. 关闭 (进入 inactive 状态,但保持缓存)
    const closeStart = performance.now()
    await this.plugin.divisionBox.close(sessionId)
    const closeTime = performance.now() - closeStart
    console.log(`Close time: ${closeTime.toFixed(2)}ms`)

    // 4. 等待一会儿
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 5. 重新打开 (从缓存恢复)
    const restoreStart = performance.now()
    const { sessionId: restoredSessionId } = await this.plugin.divisionBox.open({
      url: 'https://example.com/editor',
      title: '文档编辑器',
      keepAlive: true
    })
    const restoreTime = performance.now() - restoreStart
    console.log(`Restore time: ${restoreTime.toFixed(2)}ms`)

    console.log('Performance test results:', {
      openTime: `${openTime.toFixed(2)}ms`,
      closeTime: `${closeTime.toFixed(2)}ms`,
      restoreTime: `${restoreTime.toFixed(2)}ms`,
      speedup: `${(openTime / restoreTime).toFixed(2)}x faster`
    })

    // 清理
    await this.plugin.divisionBox.close(restoredSessionId, { force: true })
  }

  /**
   * 插件功能被触发时调用
   */
  async onFeatureTriggered(featureId: string, query: string) {
    console.log('Feature triggered:', featureId)

    if (featureId === 'test-keepalive') {
      await this.testKeepAlivePerformance()
    } else {
      const sessionId = await this.openWithKeepAlive()
      await this.simulateUserEditing(sessionId)
    }
  }

  /**
   * 插件卸载时清理资源
   */
  async onUnload() {
    console.log('Cleaning up sessions...')

    // 强制关闭所有会话 (忽略 keepAlive)
    for (const sessionId of this.sessions.keys()) {
      await this.plugin.divisionBox.close(sessionId, { force: true })
    }

    this.sessions.clear()
    console.log('KeepAliveModeExample plugin unloaded')
  }
}
