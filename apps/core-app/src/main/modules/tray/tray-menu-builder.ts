import { Menu, MenuItemConstructorOptions } from 'electron'
import { app, shell } from 'electron'
import path from 'path'
import { TrayState } from './tray-state-manager'

// TODO: 导入 i18n 函数
function t(key: string, params?: Record<string, any>): string {
  // 临时实现，后续集成 i18n
  const translations: Record<string, string> = {
    'tray.showWindow': '显示主窗口',
    'tray.hideWindow': '隐藏主窗口',
    'tray.openCoreBox': '打开 CoreBox',
    'tray.downloadCenter': '下载中心',
    'tray.downloadCenterWithCount': '下载中心 ({count} 个任务)',
    'tray.clipboardHistory': '剪贴板历史',
    'tray.terminal': '终端',
    'tray.settings': '设置',
    'tray.about': '关于 Talex Touch',
    'tray.version': '版本 {version}',
    'tray.checkUpdate': '检查更新',
    'tray.checkUpdateAvailable': '检查更新 • 有新版本',
    'tray.viewLogs': '查看日志',
    'tray.openDataDir': '打开数据目录',
    'tray.visitWebsite': '访问官网',
    'tray.restart': '重启应用',
    'tray.quit': '退出 Talex Touch',
    'tray.tooltip': 'Talex Touch'
  }

  let result = translations[key] || key

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      result = result.replace(`{${paramKey}}`, String(paramValue))
    })
  }

  return result
}

/**
 * TrayMenuBuilder - 托盘菜单构建器
 *
 * 负责构建托盘右键菜单，支持动态状态和国际化
 */
export class TrayMenuBuilder {
  /**
   * 构建托盘菜单
   * @param state 当前托盘状态
   * @returns 构建好的菜单
   */
  buildMenu(state: TrayState): Menu {
    const template: MenuItemConstructorOptions[] = [
      // 窗口控制组
      this.buildWindowControlGroup(state),
      { type: 'separator' },

      // 快捷功能组
      ...this.buildQuickActionsGroup(state),
      { type: 'separator' },

      // 工具功能组
      ...this.buildToolsGroup(),
      { type: 'separator' },

      // 关于信息组
      this.buildAboutGroup(state),
      { type: 'separator' },

      // 应用控制组
      ...this.buildAppControlGroup()
    ]

    return Menu.buildFromTemplate(template)
  }

  /**
   * 构建窗口控制组
   * @param state 当前状态
   * @returns 窗口控制菜单项
   */
  private buildWindowControlGroup(state: TrayState): MenuItemConstructorOptions {
    return {
      label: state.windowVisible ? t('tray.hideWindow') : t('tray.showWindow'),
      click: () => {
        const mainWindow = $app.window.window
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    }
  }

  /**
   * 构建快捷功能组
   * @param state 当前状态
   * @returns 快捷功能菜单项数组
   */
  private buildQuickActionsGroup(state: TrayState): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.openCoreBox'),
        accelerator: process.platform === 'darwin' ? 'Cmd+E' : 'Ctrl+E',
        click: () => {
          // TODO: 触发 CoreBox 模块的显示方法
          // coreBoxModule.show()
          console.log('[TrayMenu] Open CoreBox requested')
        }
      },
      {
        label:
          state.activeDownloads > 0
            ? t('tray.downloadCenterWithCount', { count: state.activeDownloads })
            : t('tray.downloadCenter'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          mainWindow.webContents.send('open-download-center')
        }
      }
    ]
  }

  /**
   * 构建工具功能组
   * @returns 工具功能菜单项数组
   */
  private buildToolsGroup(): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.clipboardHistory'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          mainWindow.webContents.send('navigate-to', '/clipboard')
        }
      },
      {
        label: t('tray.terminal'),
        click: () => {
          // TODO: 打开终端模块
          // terminalModule.createWindow()
          console.log('[TrayMenu] Open Terminal requested')
        }
      },
      {
        label: t('tray.settings'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          mainWindow.webContents.send('navigate-to', '/settings')
        }
      }
    ]
  }

  /**
   * 构建关于信息组
   * @param state 当前状态
   * @returns 关于信息菜单项
   */
  private buildAboutGroup(state: TrayState): MenuItemConstructorOptions {
    return {
      label: t('tray.about'),
      submenu: [
        {
          label: t('tray.version', { version: app.getVersion() }),
          enabled: false
        },
        { type: 'separator' },
        {
          label: state.hasUpdate ? t('tray.checkUpdateAvailable') : t('tray.checkUpdate'),
          click: () => {
            $app.window.window.webContents.send('trigger-update-check')
          }
        },
        {
          label: t('tray.viewLogs'),
          click: () => {
            const logPath = path.join(app.getPath('userData'), 'logs')
            shell.openPath(logPath)
          }
        },
        {
          label: t('tray.openDataDir'),
          click: () => {
            shell.openPath(app.getPath('userData'))
          }
        },
        {
          label: t('tray.visitWebsite'),
          click: () => {
            shell.openExternal('https://tuff.tagzxia.com')
          }
        }
      ]
    }
  }

  /**
   * 构建应用控制组
   * @returns 应用控制菜单项数组
   */
  private buildAppControlGroup(): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.restart'),
        click: () => {
          app.relaunch()
          app.quit()
        }
      },
      {
        label: t('tray.quit'),
        click: () => {
          app.quit()
          process.exit(0)
        }
      }
    ]
  }
}
