import { TalexTouch } from '../types'
import { Menu, Tray, nativeImage } from 'electron'
import fse from 'fs-extra'
import { APP_SCHEMA } from '../config/default'
import { BaseModule } from './abstract-base-module'
import { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import { TalexEvents } from '../core/eventbus/touch-event'
import path from 'path'
import { TrayIconProvider } from './tray/tray-icon-provider'

const legacyTrayRef: { value: Tray | null } = {
  value: null
}

interface IconItem {
  name: string
  targetFilename: string
  resolveSourcePath: () => string
  apply?: (app: TalexTouch.TouchApp, filePath: string) => void
  copyRetinaVariant?: boolean
}

/**
 * @deprecated Legacy tray holder.
 * Migrated to load icons from bundled resources instead of remote downloads.
 * See: apps/core-app/src/main/modules/tray/tray-manager.ts
 */
const iconItems: IconItem[] = [
  {
    name: 'tray-icon',
    targetFilename:
      process.platform === 'darwin' ? 'TrayIconTemplate.png' : 'tray_icon.png',
    resolveSourcePath: () => TrayIconProvider.getIconPath(),
    copyRetinaVariant: process.platform === 'darwin',
    apply: (app: TalexTouch.TouchApp, filePath: string) => {
      console.log('[TrayHolder] Legacy tray icon path:', filePath)

      const icon = nativeImage.createFromPath(filePath)
      if (icon.isEmpty()) {
        console.warn('[TrayHolder] Legacy tray icon is empty, skipping legacy tray setup.')
        return
      }

      if (process.platform === 'darwin') {
        icon.setTemplateImage(true)
      }

      const tray = new Tray(icon)

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Exit when minimized',
          type: 'radio',
          click() {
            contextMenu.items[1].checked = !contextMenu.items[1].checked
          }
        },
        {
          label: 'Exit',
          type: 'normal',
          click() {
            app.app.quit()
            process.exit(0)
          }
        }
      ])

      contextMenu.items[1].checked = false

      tray.setContextMenu(contextMenu)
      tray.setToolTip(APP_SCHEMA)

      tray.addListener('click', () => {
        const window = app.window.window
        window.show()
        window.focus()
      })

      legacyTrayRef.value = tray
    }
  },
  {
    name: 'app-icon',
    targetFilename:
      process.platform === 'darwin'
        ? 'app-default-icon.icns'
        : process.platform === 'win32'
          ? 'app-default-icon.ico'
          : 'app-default-icon.png',
    resolveSourcePath: () => TrayIconProvider.getAppIconPath(),
    apply: (app: TalexTouch.TouchApp, filePath: string) => {
      if (process.platform === 'darwin') {
        app.app.dock?.setIcon(filePath)

        if (app.version === TalexTouch.AppVersion.DEV) {
          app.app.dock?.setBadge(app.version)
        }
      } else {
        app.window.window.setIcon(filePath)
      }
    }
  }
]

/**
 * @deprecated This module is deprecated. Use TrayManager instead.
 * See: apps/core-app/src/main/modules/tray/tray-manager.ts
 */
export class TrayHolderModule extends BaseModule {
  static key: symbol = Symbol.for('TrayHolder')
  name: ModuleKey = TrayHolderModule.key

  constructor() {
    super(TrayHolderModule.key, {
      create: true,
      dirName: 'tray'
    })

  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const modulePath = file.dirPath!
    fse.ensureDirSync(modulePath)

    iconItems.forEach((item) => {
      const sourcePath = item.resolveSourcePath()
      if (!sourcePath) {
        console.warn(`[TrayHolder] No source path resolved for ${item.name}`)
        return
      }

      if (!fse.existsSync(sourcePath)) {
        console.warn(`[TrayHolder] Source icon does not exist for ${item.name}: ${sourcePath}`)
        return
      }

      const targetPath = path.join(modulePath, item.targetFilename)

      try {
        fse.copyFileSync(sourcePath, targetPath)
        if (item.copyRetinaVariant && sourcePath.endsWith('Template.png')) {
          const retinaSource = sourcePath.replace('Template.png', 'Template@2x.png')
          const retinaTarget = targetPath.replace('Template.png', 'Template@2x.png')
          if (fse.existsSync(retinaSource)) {
            fse.copyFileSync(retinaSource, retinaTarget)
          }
        }
      } catch (error) {
        console.error(`[TrayHolder] Failed to copy icon for ${item.name}:`, error)
        return
      }

      if (item.apply) {
        try {
          item.apply($app, targetPath)
        } catch (error) {
          console.error(`[TrayHolder] Failed to apply icon for ${item.name}:`, error)
        }
      }
    })
  }

  onDestroy(): MaybePromise<void> {
    if (legacyTrayRef.value) {
      try {
        legacyTrayRef.value.destroy()
      } catch (error) {
        console.warn('[TrayHolder] Failed to destroy legacy tray:', error)
      } finally {
        legacyTrayRef.value = null
      }
    }

    console.log('[TrayHolder] Module destroyed.')
  }
}

const trayHolderModule = new TrayHolderModule()

export { trayHolderModule }
