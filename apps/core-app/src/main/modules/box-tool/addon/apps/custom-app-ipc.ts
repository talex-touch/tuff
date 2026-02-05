import { ipcMain, dialog } from 'electron'
import { customAppProvider, type CustomApp, type CustomAppInput } from './custom-app-provider'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('CustomAppIpc')

/**
 * 自定义应用 IPC 通道名称
 */
export const CustomAppIpcChannels = {
  // 查询
  GET_ALL: 'custom-app:get-all',
  GET_ENABLED: 'custom-app:get-enabled',
  GET_ONE: 'custom-app:get-one',

  // 修改
  ADD: 'custom-app:add',
  UPDATE: 'custom-app:update',
  DELETE: 'custom-app:delete',
  TOGGLE_ENABLED: 'custom-app:toggle-enabled',

  // 启动
  LAUNCH: 'custom-app:launch',

  // 文件选择
  SELECT_FILE: 'custom-app:select-file',
  SELECT_ICON: 'custom-app:select-icon'
} as const

/**
 * 注册自定义应用 IPC 处理器
 */
export function registerCustomAppIpc(): void {
  // 获取所有自定义应用
  ipcMain.handle(CustomAppIpcChannels.GET_ALL, async () => {
    try {
      return await customAppProvider.getAllCustomApps()
    } catch (error) {
      logger.error('Failed to get all custom apps:', error)
      throw error
    }
  })

  // 获取启用的自定义应用
  ipcMain.handle(CustomAppIpcChannels.GET_ENABLED, async () => {
    try {
      return await customAppProvider.getEnabledCustomApps()
    } catch (error) {
      logger.error('Failed to get enabled custom apps:', error)
      throw error
    }
  })

  // 获取单个自定义应用
  ipcMain.handle(CustomAppIpcChannels.GET_ONE, async (_event, id: number) => {
    try {
      return await customAppProvider.getCustomApp(id)
    } catch (error) {
      logger.error(`Failed to get custom app ${id}:`, error)
      throw error
    }
  })

  // 添加自定义应用
  ipcMain.handle(CustomAppIpcChannels.ADD, async (_event, input: CustomAppInput) => {
    try {
      const app = await customAppProvider.addCustomApp(input)
      logger.info(`Added custom app: ${app.displayName}`)
      return app
    } catch (error) {
      logger.error('Failed to add custom app:', error)
      throw error
    }
  })

  // 更新自定义应用
  ipcMain.handle(
    CustomAppIpcChannels.UPDATE,
    async (_event, id: number, updates: Partial<CustomAppInput>) => {
      try {
        const app = await customAppProvider.updateCustomApp(id, updates)
        logger.info(`Updated custom app: ${app.displayName}`)
        return app
      } catch (error) {
        logger.error(`Failed to update custom app ${id}:`, error)
        throw error
      }
    }
  )

  // 删除自定义应用
  ipcMain.handle(CustomAppIpcChannels.DELETE, async (_event, id: number) => {
    try {
      await customAppProvider.deleteCustomApp(id)
      logger.info(`Deleted custom app ${id}`)
    } catch (error) {
      logger.error(`Failed to delete custom app ${id}:`, error)
      throw error
    }
  })

  // 切换启用状态
  ipcMain.handle(CustomAppIpcChannels.TOGGLE_ENABLED, async (_event, id: number) => {
    try {
      const app = await customAppProvider.toggleEnabled(id)
      logger.info(`Toggled custom app ${id} enabled: ${app.enabled}`)
      return app
    } catch (error) {
      logger.error(`Failed to toggle custom app ${id}:`, error)
      throw error
    }
  })

  // 启动自定义应用
  ipcMain.handle(CustomAppIpcChannels.LAUNCH, async (_event, id: number) => {
    try {
      await customAppProvider.launchCustomApp(id)
      logger.info(`Launched custom app ${id}`)
    } catch (error) {
      logger.error(`Failed to launch custom app ${id}:`, error)
      throw error
    }
  })

  // 选择文件
  ipcMain.handle(CustomAppIpcChannels.SELECT_FILE, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Application or File',
        properties: ['openFile'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Applications', extensions: ['app', 'exe'] },
          { name: 'JAR Files', extensions: ['jar'] },
          { name: 'Scripts', extensions: ['sh', 'bash', 'py', 'js', 'rb', 'pl'] }
        ]
      })

      if (result.canceled || !result.filePaths.length) {
        return null
      }

      return result.filePaths[0]
    } catch (error) {
      logger.error('Failed to select file:', error)
      throw error
    }
  })

  // 选择图标
  ipcMain.handle(CustomAppIpcChannels.SELECT_ICON, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Icon',
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'icns', 'svg'] }
        ]
      })

      if (result.canceled || !result.filePaths.length) {
        return null
      }

      return result.filePaths[0]
    } catch (error) {
      logger.error('Failed to select icon:', error)
      throw error
    }
  })

  logger.info('Custom app IPC handlers registered')
}

/**
 * 注销自定义应用 IPC 处理器
 */
export function unregisterCustomAppIpc(): void {
  Object.values(CustomAppIpcChannels).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
  logger.info('Custom app IPC handlers unregistered')
}
