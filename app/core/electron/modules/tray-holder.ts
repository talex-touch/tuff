import { TalexTouch } from '../types';
import { Menu, Tray } from 'electron'
import fse from 'fs-extra'
import { APP_SCHEMA } from '../config/default'
import { DownloadManager } from '@talex-touch/utils/electron/download-manager'

interface IconItem {
  url: string;
  filename: string;
  apply?: (app: TalexTouch.TouchApp, filePath: string) => void;
}

const iconItems: IconItem[] = [
  {
    url: "https://files.catbox.moe/44pnti.png",
    filename: "app-tray-icon.png",
    apply: (app: TalexTouch.TouchApp, filePath: string) => {
      console.log('[TrayHolder] TrayIcon path from ' + filePath)

      const tray = new Tray(filePath)

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Exit when minimized', type: 'radio', click() {
            contextMenu.items[1].checked = !contextMenu.items[1].checked
          }
        },
        {
          label: 'Exit', type: 'normal', click() {
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
    url: "https://files.catbox.moe/ssn1rx.png",
    filename: "app-default-icon.png",
    apply: (app: TalexTouch.TouchApp, filePath: string) => {
      if ( process.platform === 'darwin' ) {
        app.app.dock?.setIcon(filePath)
      } else {
        app.window.window.setIcon(filePath)
      }
    }
  }
]

export default {
  name: Symbol("TrayHolder"),
  filePath: "tray",
  init(app: TalexTouch.TouchApp) {
    const that: any = this
    const modulePath = that['modulePath']!

    fse.remove(modulePath, () => {
      fse.ensureDirSync(modulePath)
    })

    setTimeout(() => {
        const downloadManager = new DownloadManager();

        downloadManager.addDownloads(iconItems.map(item => ({
          ...item,
          apply: (filePath: string) => {
            item.apply!(app, filePath)
          }
        })));

        const checkDownload = setInterval(() => {
          if (downloadManager.getQueueLength() === 0) {
            clearInterval(checkDownload);
          }
        }, 100);
      });

  },
  destroy() {
  },
};