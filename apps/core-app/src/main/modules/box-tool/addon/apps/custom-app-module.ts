import type { IModule } from '@main/core/module-manager'
import { createLogger } from '@main/utils/logger'
import { registerCustomAppIpc, unregisterCustomAppIpc } from './custom-app-ipc'

const logger = createLogger('CustomAppModule')

/**
 * 自定义应用模块
 * 负责初始化和管理自定义应用功能
 */
class CustomAppModule implements IModule {
  name = 'CustomAppModule' as const

  async onLoad(): Promise<void> {
    try {
      // 注册 IPC 处理器
      registerCustomAppIpc()
      
      logger.info('Custom app module loaded')
    } catch (error) {
      logger.error('Failed to load custom app module:', error)
      throw error
    }
  }

  async onUnload(): Promise<void> {
    try {
      // 注销 IPC 处理器
      unregisterCustomAppIpc()
      
      logger.info('Custom app module unloaded')
    } catch (error) {
      logger.error('Failed to unload custom app module:', error)
    }
  }
}

export const customAppModule = new CustomAppModule()
