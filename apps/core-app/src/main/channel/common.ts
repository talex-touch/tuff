import packageJson from '../../../package.json'
import { shell } from 'electron'
import os from 'os'
import { ChannelType } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../core/channel-core'
import { TalexTouch } from '../types'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import path from 'path'
import { BaseModule } from '../modules/abstract-base-module'
import { fileProvider } from '../modules/box-tool/addon/files/file-provider'
import { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'

function closeApp(app: TalexTouch.TouchApp): void {
  app.window.close()

  app.app.quit()

  process.exit(0)
}

function getOSInformation(): any {
  return {
    arch: os.arch(),
    cpus: os.cpus(),
    endianness: os.endianness(),
    freemem: os.freemem(),
    homedir: os.homedir(),
    hostname: os.hostname(),
    loadavg: os.loadavg(),
    networkInterfaces: os.networkInterfaces(),
    platform: os.platform(),
    release: os.release(),
    tmpdir: os.tmpdir(),
    totalmem: os.totalmem(),
    type: os.type(),
    uptime: os.uptime(),
    userInfo: os.userInfo(),
    version: os.version()
  }
}

export class CommonChannelModule extends BaseModule {
  static key: symbol = Symbol.for('CommonChannel')
  name: ModuleKey = CommonChannelModule.key

  constructor() {
    super(CommonChannelModule.key, {
      create: false,
      dirName: 'channel'
    })
  }

  async onInit({ app }: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel = genTouchChannel(app as TalexTouch.TouchApp)

    channel.regChannel(ChannelType.MAIN, 'close', () => closeApp(app as TalexTouch.TouchApp))
    channel.regChannel(ChannelType.MAIN, 'hide', () =>
      (app as TalexTouch.TouchApp).window.window.hide()
    )

    channel.regChannel(ChannelType.MAIN, 'minimize', () =>
      (app as TalexTouch.TouchApp).window.minimize()
    )
    channel.regChannel(ChannelType.MAIN, 'dev-tools', () => {
      console.log('[dev-tools] Open dev tools!')
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'undocked' })
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'detach' })
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'right' })
    })
    channel.regChannel(ChannelType.MAIN, 'get-package', () => packageJson)
    channel.regChannel(ChannelType.MAIN, 'open-external', ({ data }) =>
      shell.openExternal(data!.url)
    )

    channel.regChannel(ChannelType.MAIN, 'get-os', () => getOSInformation())

    channel.regChannel(ChannelType.MAIN, 'common:cwd', process.cwd)

    channel.regChannel(ChannelType.MAIN, 'folder:open', ({ data }) => {
      if (data?.path) {
        shell.showItemInFolder(data.path)
      }
    })

    channel.regChannel(ChannelType.MAIN, 'module:folder', ({ data }) => {
      if (data?.name) {
        const modulePath = path.join(
          (app as TalexTouch.TouchApp).rootPath,
          'modules',
          data?.name ? data.name : undefined
        )
        shell.openPath(modulePath)

        console.log(
          `[Channel] Open path [${modulePath}] with module folder @${data?.name ?? 'defaults'}`
        )
      }
    })

    channel.regChannel(ChannelType.MAIN, 'execute:cmd', ({ data }) => {
      if (data?.command) {
        shell.openPath(data.command)
      }
    })

    channel.regChannel(ChannelType.MAIN, 'app:open', ({ data }) => {
      if (data?.appName || data?.path) {
        shell.openPath(data.appName || data.path)
      }
    })

    channel.regChannel(ChannelType.MAIN, 'url:open', ({ data }) => onOpenUrl(data as any))

    channel.regChannel(ChannelType.MAIN, 'files:index-progress', async ({ data }) => {
      const paths = Array.isArray(data?.paths) ? data.paths : undefined
      return fileProvider.getIndexingProgress(paths)
    })

    async function onOpenUrl(url: string) {
      const data = await channel.send(ChannelType.MAIN, 'url:open', url)
      console.log('open url', url, data)

      if (data.data) {
        shell.openExternal(url)
      }
    }

    ;(app as TalexTouch.TouchApp).app.addListener('open-url', (event, url) => {
      event.preventDefault()

      const regex =
        /(^https:\/\/localhost)|(^http:\/\/localhost)|(^http:\/\/127\.0\.0\.1)|(^https:\/\/127\.0\.0\.1)/
      if (regex.test(url) && url.indexOf('/#/') !== -1) {
        return
      }

      onOpenUrl(url)
    })

    touchEventBus.on(TalexEvents.OPEN_EXTERNAL_URL, (event) => onOpenUrl(event.data))
  }

  onDestroy(): MaybePromise<void> {
    console.log('[CommonChannel] CommonChannelModule destroyed')
  }
}

const commonChannelModule = new CommonChannelModule()

export { commonChannelModule }
