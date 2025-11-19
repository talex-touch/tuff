import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { TalexTouch } from '../types'
import os from 'node:os'
import path from 'node:path'
import { ChannelType } from '@talex-touch/utils/channel'
import { shell } from 'electron'
import packageJson from '../../../package.json'
import { genTouchChannel } from '../core/channel-core'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { BaseModule } from '../modules/abstract-base-module'
import { getStartupAnalytics } from '../modules/analytics'
import { fileProvider } from '../modules/box-tool/addon/files/file-provider'
import { buildVerificationModule } from '../modules/build-verification'
import { activeAppService } from '../modules/system/active-app'

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
    version: os.version(),
  }
}

export class CommonChannelModule extends BaseModule {
  static key: symbol = Symbol.for('CommonChannel')
  name: ModuleKey = CommonChannelModule.key

  constructor() {
    super(CommonChannelModule.key, {
      create: false,
      dirName: 'channel',
    })
  }

  async onInit({ app }: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel = genTouchChannel(app as TalexTouch.TouchApp)

    channel.regChannel(ChannelType.MAIN, 'close', () => closeApp(app as TalexTouch.TouchApp))
    channel.regChannel(ChannelType.MAIN, 'hide', () =>
      (app as TalexTouch.TouchApp).window.window.hide())

    channel.regChannel(ChannelType.MAIN, 'minimize', () =>
      (app as TalexTouch.TouchApp).window.minimize())
    channel.regChannel(ChannelType.MAIN, 'dev-tools', () => {
      console.log('[dev-tools] Open dev tools!')
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'undocked' })
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'detach' })
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'right' })
    })
    channel.regChannel(ChannelType.MAIN, 'get-package', () => packageJson)
    channel.regChannel(ChannelType.MAIN, 'open-external', ({ data }) =>
      shell.openExternal(data!.url))

    channel.regChannel(ChannelType.MAIN, 'get-os', () => getOSInformation())
    const systemGetActiveApp = async ({ data }: { data?: { forceRefresh?: boolean } }) =>
      activeAppService.getActiveApp(Boolean(data?.forceRefresh))
    channel.regChannel(ChannelType.MAIN, 'system:get-active-app', systemGetActiveApp)
    channel.regChannel(ChannelType.PLUGIN, 'system:get-active-app', systemGetActiveApp)

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
          data?.name ? data.name : undefined,
        )
        shell.openPath(modulePath)

        console.debug(
          `[Channel] Open path [${modulePath}] with module folder @${data?.name ?? 'defaults'}`,
        )
      }
    })

    channel.regChannel(ChannelType.MAIN, 'execute:cmd', async ({ data }) => {
      if (data?.command) {
        try {
          const error = await shell.openPath(data.command)
          if (error) {
            console.error(`[CommonChannel] Failed to open path: ${data.command}, error: ${error}`)
            return { success: false, error }
          }
          return { success: true }
        }
        catch (error) {
          console.error(`[CommonChannel] Error opening path: ${data.command}`, error)
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
      return { success: false, error: 'No command provided' }
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

    // Analytics channels
    channel.regChannel(ChannelType.MAIN, 'analytics:get-current', () => {
      const analytics = getStartupAnalytics()
      return analytics.getCurrentMetrics()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:get-history', () => {
      const analytics = getStartupAnalytics()
      return analytics.getHistory()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:get-summary', () => {
      const analytics = getStartupAnalytics()
      return analytics.getPerformanceSummary()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:export', () => {
      const analytics = getStartupAnalytics()
      return analytics.exportMetrics()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:report', async ({ data }) => {
      const analytics = getStartupAnalytics()
      await analytics.reportMetrics(data?.endpoint)
      return { success: true }
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

      const regex
        = /(^https:\/\/localhost)|(^http:\/\/localhost)|(^http:\/\/127\.0\.0\.1)|(^https:\/\/127\.0\.0\.1)/
      if (regex.test(url) && url.includes('/#/')) {
        return
      }

      onOpenUrl(url)
    })

    touchEventBus.on(TalexEvents.OPEN_EXTERNAL_URL, event => onOpenUrl(event.data))

    channel.regChannel(ChannelType.MAIN, 'build:get-verification-status', () => {
      try {
        if (buildVerificationModule?.getVerificationStatus) {
          const status = buildVerificationModule.getVerificationStatus()
          return {
            isOfficialBuild: status.isOfficialBuild,
            verificationFailed: status.verificationFailed,
            hasOfficialKey: status.isOfficialBuild || status.verificationFailed,
          }
        }
      }
      catch (error) {
        console.warn('[CommonChannel] Failed to get build verification status:', error)
      }
      return {
        isOfficialBuild: false,
        verificationFailed: false,
        hasOfficialKey: false,
      }
    })
  }

  onDestroy(): MaybePromise<void> {
    console.log('[CommonChannel] CommonChannelModule destroyed')
  }
}

const commonChannelModule = new CommonChannelModule()

export { commonChannelModule }
