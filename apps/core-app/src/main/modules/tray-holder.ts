import { TalexTouch } from '../types'
import { Menu, Tray } from 'electron'
import fse from 'fs-extra'
import { APP_SCHEMA } from '../config/default'
import { DownloadManager } from '@talex-touch/utils/electron'
import { BaseModule } from './abstract-base-module'
import { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import { TalexEvents } from '../core/eventbus/touch-event'
import path from 'path'

interface IconItem {
  url: string
  filename: string
  apply?: (app: TalexTouch.TouchApp, filePath: string) => void
}

const iconItems: IconItem[] = [
  {
    url: 'https://files.catbox.moe/44pnti.png',
    filename: 'app-tray-icon.png',
    apply: (app: TalexTouch.TouchApp, filePath: string) => {
      console.log('[TrayHolder] TrayIcon path from ' + filePath)

      const tray = new Tray(filePath)

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
    }
  },
  {
    url: 'https://files.catbox.moe/ssn1rx.png',
    filename: 'app-default-icon.png',
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
    const markerFile = path.join(modulePath, 'tray-downloaded')

    if (fse.existsSync(markerFile)) {
      iconItems.map((item) => item.apply && item.apply($app, path.join(modulePath, item.filename)))
      return
    }

    fse.remove(modulePath, () => {
      fse.ensureDirSync(modulePath)
    })

    const downloadManager = new DownloadManager(modulePath)

    downloadManager.addDownloads(
      iconItems.map((item) => ({
        ...item,
        apply: (filePath: string) => {
          item.apply!($app, filePath)
        }
      }))
    )

    const checkDownload = setInterval(() => {
      if (downloadManager.getQueueLength() === 0) {
        clearInterval(checkDownload)

        fse.writeFileSync(markerFile, '1')
      }
    }, 100)
  }

  onDestroy(): MaybePromise<void> {
    console.log('[TrayHolder] Module destroyed.')
  }
}

const trayHolderModule = new TrayHolderModule()

export { trayHolderModule }
