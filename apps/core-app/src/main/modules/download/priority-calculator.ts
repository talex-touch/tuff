import {
  DownloadRequest,
  DownloadPriority,
  DownloadModule,
  NetworkStatus
} from '@talex-touch/utils'

export class PriorityCalculator {
  private networkStatus: NetworkStatus | null = null

  // 设置当前网络状态
  setNetworkStatus(status: NetworkStatus): void {
    this.networkStatus = status
  }

  // 计算任务优先级
  calculatePriority(request: DownloadRequest): DownloadPriority {
    const basePriority = request.priority

    // 根据模块调整
    const moduleMultiplier = this.getModuleMultiplier(request.module)

    // 根据文件大小调整
    const sizeMultiplier = this.getSizeMultiplier(request.metadata?.fileSize)

    // 根据网络状况调整
    const networkMultiplier = this.getNetworkMultiplier()

    const finalPriority = Math.min(
      100,
      Math.max(1, basePriority * moduleMultiplier * sizeMultiplier * networkMultiplier)
    )

    return Math.round(finalPriority) as DownloadPriority
  }

  // 根据模块获取乘数
  private getModuleMultiplier(module: DownloadModule): number {
    const multipliers = {
      [DownloadModule.USER_MANUAL]: 1.2, // 用户手动触发优先级最高
      [DownloadModule.PLUGIN_INSTALL]: 1.1, // 插件安装优先级较高
      [DownloadModule.APP_UPDATE]: 1.0, // 应用更新标准优先级
      [DownloadModule.RESOURCE_DOWNLOAD]: 0.9 // 资源下载优先级较低
    }
    return multipliers[module] || 1.0
  }

  // 根据文件大小获取乘数
  private getSizeMultiplier(fileSize?: number): number {
    if (!fileSize) return 1.0

    // 小文件优先级稍高（下载速度快，用户体验好）
    if (fileSize < 10 * 1024 * 1024) return 1.1 // < 10MB
    if (fileSize > 100 * 1024 * 1024) return 0.9 // > 100MB
    return 1.0
  }

  // 根据网络状况获取乘数
  private getNetworkMultiplier(): number {
    if (!this.networkStatus) return 1.0

    // 根据网络速度动态调整
    if (this.networkStatus.speed < 1024 * 1024) return 1.2 // 慢网络，提高优先级
    if (this.networkStatus.speed > 10 * 1024 * 1024) return 0.8 // 快网络，降低优先级
    return 1.0
  }

  // 根据用户行为调整优先级
  adjustPriorityByUserAction(
    currentPriority: DownloadPriority,
    action: UserAction
  ): DownloadPriority {
    switch (action) {
      case UserAction.MANUAL_START:
        return Math.min(100, currentPriority + 20) as DownloadPriority
      case UserAction.FREQUENT_RETRY:
        return Math.min(100, currentPriority + 10) as DownloadPriority
      case UserAction.IGNORE:
        return Math.max(1, currentPriority - 30) as DownloadPriority
      case UserAction.PAUSE:
        return Math.max(1, currentPriority - 10) as DownloadPriority
      case UserAction.RESUME:
        return Math.min(100, currentPriority + 5) as DownloadPriority
      default:
        return currentPriority
    }
  }

  // 根据时间调整优先级
  adjustPriorityByTime(currentPriority: DownloadPriority, createdAt: Date): DownloadPriority {
    const age = Date.now() - createdAt.getTime()
    const ageHours = age / (1000 * 60 * 60)

    // 超过1小时的任务优先级降低
    if (ageHours > 1) {
      return Math.max(1, currentPriority - 10) as DownloadPriority
    }

    // 超过6小时的任务优先级大幅降低
    if (ageHours > 6) {
      return Math.max(1, currentPriority - 20) as DownloadPriority
    }

    return currentPriority
  }

  // 根据失败次数调整优先级
  adjustPriorityByFailureCount(
    currentPriority: DownloadPriority,
    failureCount: number
  ): DownloadPriority {
    if (failureCount === 0) {
      return currentPriority
    }

    // 失败次数越多，优先级越低
    const penalty = Math.min(30, failureCount * 5)
    return Math.max(1, currentPriority - penalty) as DownloadPriority
  }

  // 计算综合优先级
  calculateComprehensivePriority(
    request: DownloadRequest,
    createdAt: Date,
    failureCount: number = 0,
    userAction?: UserAction
  ): DownloadPriority {
    // 基础优先级
    let priority = this.calculatePriority(request)

    // 根据时间调整
    priority = this.adjustPriorityByTime(priority, createdAt)

    // 根据失败次数调整
    priority = this.adjustPriorityByFailureCount(priority, failureCount)

    // 根据用户行为调整
    if (userAction) {
      priority = this.adjustPriorityByUserAction(priority, userAction)
    }

    return priority
  }

  // 获取优先级描述
  getPriorityDescription(priority: DownloadPriority): string {
    if (priority >= DownloadPriority.CRITICAL) {
      return 'Critical (Critical)'
    } else if (priority >= DownloadPriority.HIGH) {
      return 'High (High)'
    } else if (priority >= DownloadPriority.NORMAL) {
      return 'Normal (Normal)'
    } else if (priority >= DownloadPriority.LOW) {
      return 'Low (Low)'
    } else {
      return 'Background (Background)'
    }
  }

  // 获取优先级颜色
  getPriorityColor(priority: DownloadPriority): string {
    if (priority >= DownloadPriority.CRITICAL) {
      return '#ff4757' // 红色
    } else if (priority >= DownloadPriority.HIGH) {
      return '#ffa502' // 橙色
    } else if (priority >= DownloadPriority.NORMAL) {
      return '#2ed573' // 绿色
    } else if (priority >= DownloadPriority.LOW) {
      return '#70a1ff' // 蓝色
    } else {
      return '#a4b0be' // 灰色
    }
  }

  // 比较优先级
  comparePriority(priority1: DownloadPriority, priority2: DownloadPriority): number {
    return priority2 - priority1 // 降序排列，优先级高的在前
  }

  // 判断是否为高优先级任务
  isHighPriority(priority: DownloadPriority): boolean {
    return priority >= DownloadPriority.HIGH
  }

  // 判断是否为低优先级任务
  isLowPriority(priority: DownloadPriority): boolean {
    return priority <= DownloadPriority.LOW
  }
}

// 用户操作枚举
export enum UserAction {
  MANUAL_START = 'manual_start',
  FREQUENT_RETRY = 'frequent_retry',
  IGNORE = 'ignore',
  PAUSE = 'pause',
  RESUME = 'resume'
}
