/**
 * TrayStateManager - 托盘状态管理器
 *
 * 管理托盘菜单相关的状态信息，包括窗口状态、下载任务、更新状态等
 */
export interface TrayState {
  windowVisible: boolean
  activeDownloads: number
  hasUpdate: boolean
  updateVersion?: string
}

export class TrayStateManager {
  private state: TrayState = {
    windowVisible: true,
    activeDownloads: 0,
    hasUpdate: false,
  }

  /**
   * 更新状态
   * @param partial 部分状态更新
   */
  updateState(partial: Partial<TrayState>): void {
    this.state = { ...this.state, ...partial }
  }

  /**
   * 获取当前状态
   * @returns 当前状态的副本
   */
  getState(): TrayState {
    return { ...this.state }
  }

  /**
   * 获取窗口可见性状态
   * @returns 窗口是否可见
   */
  isWindowVisible(): boolean {
    return this.state.windowVisible
  }

  /**
   * 设置窗口可见性状态
   * @param visible 是否可见
   */
  setWindowVisible(visible: boolean): void {
    this.updateState({ windowVisible: visible })
  }

  /**
   * 获取活跃下载任务数量
   * @returns 下载任务数量
   */
  getActiveDownloads(): number {
    return this.state.activeDownloads
  }

  /**
   * 设置活跃下载任务数量
   * @param count 任务数量
   */
  setActiveDownloads(count: number): void {
    this.updateState({ activeDownloads: count })
  }

  /**
   * 获取更新可用状态
   * @returns 是否有更新可用
   */
  hasUpdateAvailable(): boolean {
    return this.state.hasUpdate
  }

  /**
   * 设置更新可用状态
   * @param hasUpdate 是否有更新
   * @param version 更新版本（可选）
   */
  setUpdateAvailable(hasUpdate: boolean, version?: string): void {
    this.updateState({ hasUpdate, updateVersion: version })
  }

  /**
   * 重置状态到默认值
   */
  reset(): void {
    this.state = {
      windowVisible: true,
      activeDownloads: 0,
      hasUpdate: false,
    }
  }
}
