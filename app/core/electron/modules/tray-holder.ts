import { TalexTouch } from '../types';
import { Menu, Tray, net } from 'electron'
import path from 'path'
import fse from 'fs-extra'

const iconUrls = [
  "https://files.catbox.moe/ssn1rx.png"
]

async function downloadImage(url: string, path: string) {
  return new Promise((resolve, reject) => {
    const request = net.request(url)

    console.log('[TrayHolder] File download request sent.')

    request.addListener('error', reject)

    request.addListener('response', (response) => {

      fse.createFileSync(path)

      response.addListener('data', (chunk: any) => {
        console.log('[TrayHolder] Downloading appicon file ...')
        fse.appendFile(path, chunk, 'utf8')
      })

      response.addListener('end', () => resolve(true))

    })

    request.end()
  })

  // const res = await net.request(url, { method: 'GET' })

  // if ( !res.ok ) return false


}

async function downloadAppIcon(filePath: string) {

  for (let i = 0; i < iconUrls.length; i++) {
    const url = iconUrls[i]

    console.log('[TrayHolder] Starting to download appicon from `' + url + '`')

    const res = await downloadImage(url, filePath)

    if (res) {
      console.log('[TrayHolder] Download icon success.')

      return true
    } else {
      console.log('[TrayHolder] Download icon failed, attempt to next one ...')
    }

    // .then(() => {
    //   console.log('[TrayHolder] Download icon success')

    //   resolve(true)
    // }).catch(() => {
    //   console.log('[TrayHolder] Download icon failed')

    //   reject(false)
    // })
  }

  console.log('[TrayHolder] AppIcon download failed!')

  return false

}

export default {
  name: Symbol("TrayHolder"),
  filePath: "tray",
  init(app: TalexTouch.TouchApp) {
    const that: any = this
    const modulePath = that['modulePath']!
    const iconPath = path.join(modulePath, 'app-default-icon.png')

    if (!fse.existsSync(iconPath)) {
      setTimeout(() => {

        downloadAppIcon(iconPath).then(init)

      })
    } else init()

    function init() {

      if (!fse.existsSync(iconPath)) {
        console.log('[TrayHolder] AppIcon file not found, app starting to quit ...')

        app.app.exit(-1)

        return
      }

      console.log('[TrayHolder] TrayIcon path from ' + iconPath)

      const tray = new Tray(iconPath)

      const contextMenu = Menu.buildFromTemplate([
        { label: '退出时最小化程序', type: 'radio' },
        { label: '退出', type: 'normal' }
      ])

      contextMenu.items[1].checked = false

      tray.setContextMenu(contextMenu)
    }
  },
  destroy() {
  },
};