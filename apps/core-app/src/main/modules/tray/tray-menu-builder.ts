import type { MenuItemConstructorOptions } from 'electron'
import type { TrayState } from './tray-state-manager'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { NEXUS_BASE_URL } from '@talex-touch/utils/env'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { app, Menu, shell } from 'electron'
import { t } from '../../utils/i18n-helper'
import { coreBoxManager } from '../box-tool/core-box/manager'

const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel

/**
 * TrayMenuBuilder - Tray menu builder
 *
 * Responsible for building the system tray context menu with dynamic state and i18n support.
 *
 * @example
 * ```ts
 * const builder = new TrayMenuBuilder()
 * const menu = builder.buildMenu(currentState)
 * tray.setContextMenu(menu)
 * ```
 */
export class TrayMenuBuilder {
  private openSystemTerminal(): void {
    try {
      if (process.platform === 'darwin') {
        spawn('open', ['-a', 'Terminal'], { detached: true, stdio: 'ignore' }).unref()
        return
      }

      if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', 'cmd'], { detached: true, stdio: 'ignore' }).unref()
        return
      }

      const terminalCommand = process.env.TERM || process.env.TERMINAL
      if (terminalCommand) {
        spawn(terminalCommand, [], { detached: true, stdio: 'ignore' }).unref()
      }
    } catch {}
  }

  /**
   * Builds the complete tray menu
   *
   * @param state - Current tray state containing window visibility, download count, etc.
   * @returns Electron Menu instance ready to be set on the tray
   */
  buildMenu(state: TrayState): Menu {
    const template: MenuItemConstructorOptions[] = [
      this.buildWindowControlGroup(state),
      { type: 'separator' },

      ...this.buildQuickActionsGroup(state),
      { type: 'separator' },

      ...this.buildToolsGroup(),
      { type: 'separator' },

      this.buildAboutGroup(state),
      { type: 'separator' },

      ...this.buildAppControlGroup()
    ]

    return Menu.buildFromTemplate(template)
  }

  /**
   * Builds window control menu item (show/hide main window)
   *
   * @param state - Current tray state
   * @returns Menu item for toggling window visibility
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
   * Builds quick action menu items (CoreBox, Download Center)
   *
   * @param state - Current tray state
   * @returns Array of quick action menu items
   */
  private buildQuickActionsGroup(state: TrayState): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.openCoreBox'),
        accelerator: process.platform === 'darwin' ? 'Cmd+E' : 'Ctrl+E',
        click: () => {
          coreBoxManager.trigger(true, { triggeredByShortcut: true })
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
          const channel = $app.channel
          const tx = getTuffTransportMain(channel, resolveKeyManager(channel))
          tx.sendTo(mainWindow.webContents, AppEvents.window.openDownloadCenter, undefined).catch(
            () => {}
          )
        }
      }
    ]
  }

  /**
   * Builds tool menu items (Clipboard History, Terminal, Settings)
   *
   * @returns Array of tool menu items
   */
  private buildToolsGroup(): MenuItemConstructorOptions[] {
    return [
      {
        label: t('tray.clipboardHistory'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          const channel = $app.channel
          const tx = getTuffTransportMain(channel, resolveKeyManager(channel))
          tx.sendTo(mainWindow.webContents, AppEvents.window.navigate, {
            path: '/details'
          }).catch(() => {})
        }
      },
      {
        label: t('tray.terminal'),
        click: () => {
          this.openSystemTerminal()
        }
      },
      {
        label: t('tray.settings'),
        click: () => {
          const mainWindow = $app.window.window
          mainWindow.show()
          const channel = $app.channel
          const tx = getTuffTransportMain(channel, resolveKeyManager(channel))
          tx.sendTo(mainWindow.webContents, AppEvents.window.navigate, {
            path: '/setting'
          }).catch(() => {})
        }
      }
    ]
  }

  /**
   * Builds about submenu (Version, Update Check, Logs, Data Directory, Website)
   *
   * @param state - Current tray state
   * @returns Menu item with about submenu
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
            shell.openExternal(NEXUS_BASE_URL)
          }
        }
      ]
    }
  }

  /**
   * Builds application control menu items (Restart, Quit)
   *
   * @returns Array of app control menu items
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
