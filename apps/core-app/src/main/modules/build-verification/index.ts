import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import { TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import path from 'node:path'
import axios from 'axios'
import fse from 'fs-extra'
import { BrowserWindow, app } from 'electron'
import { ChannelType } from '@talex-touch/utils/channel'
import { BaseModule } from '../abstract-base-module'
import { createLogger } from '../../utils/logger'
import { SignatureVerifier } from '../../utils/release-signature'

/**
 * 构建完整性验证模块
 * 在应用启动完成后异步验证构建签名
 */
export class BuildVerificationModule extends BaseModule {
  static key = Symbol.for('BuildVerification')
  name = BuildVerificationModule.key

  private isVerified = false
  private isOfficialBuild = false
  private verificationFailed = false
  private readonly signatureVerifier = new SignatureVerifier()
  private readonly log = createLogger('BuildVerification')

  constructor() {
    super(BuildVerificationModule.key)
  }

  onInit(_ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    if (!app.isPackaged) {
      this.setVerificationStatus(true, false)
      return
    }

    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, () => {
      setTimeout(() => {
        void this.verifyBuildIntegrity()
      }, 2000)
    })

    app.on('browser-window-created', (_event, window) => {
      window.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          if (this.isVerified) {
            this.pushVerificationStatus(window)
          }
        }, 500)
      })
    })
  }

  onDestroy(): MaybePromise<void> {
    console.debug('[BuildVerification] onDestroy')
  }

  private getBuildAssetPath(): string | null {
    if (!app.isPackaged) {
      return null
    }

    const appPath = app.getAppPath()
    if (appPath.endsWith('.asar')) {
      return appPath
    }

    const asarPath = path.join(process.resourcesPath, 'app.asar')
    if (fse.existsSync(asarPath)) {
      return asarPath
    }

    return process.execPath
  }

  private resolveChannel(version: string): 'RELEASE' | 'BETA' | 'SNAPSHOT' {
    const lower = version.toLowerCase()
    if (lower.includes('snapshot')) {
      return 'SNAPSHOT'
    }
    if (lower.includes('beta')) {
      return 'BETA'
    }
    return 'RELEASE'
  }

  private resolvePlatform(): 'darwin' | 'win32' | 'linux' {
    if (process.platform === 'win32') return 'win32'
    if (process.platform === 'linux') return 'linux'
    return 'darwin'
  }

  private resolveArch(): 'x64' | 'arm64' | 'universal' {
    if (process.arch === 'arm64') {
      return 'arm64'
    }
    return 'x64'
  }

  private resolveApiBase(): string {
    return process.env.TUFF_RELEASE_API_URL || 'https://tuff.talex.link/api/releases'
  }

  private async fetchReleaseByTag(apiBase: string, tag: string): Promise<any | null> {
    try {
      const response = await axios.get(`${apiBase}/${encodeURIComponent(tag)}`, {
        timeout: 8000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Client/2.0'
        }
      })
      return response.data?.release || null
    } catch {
      return null
    }
  }

  private async fetchLatestRelease(
    apiBase: string,
    channel: 'RELEASE' | 'BETA' | 'SNAPSHOT',
    platform: 'darwin' | 'win32' | 'linux'
  ): Promise<any | null> {
    try {
      const response = await axios.get(`${apiBase}/latest`, {
        timeout: 8000,
        params: { channel, platform },
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Client/2.0'
        }
      })
      return response.data?.release || null
    } catch {
      return null
    }
  }

  private pickReleaseAsset(
    assets: any[] | undefined,
    platform: 'darwin' | 'win32' | 'linux',
    arch: 'x64' | 'arm64' | 'universal'
  ): any | null {
    if (!assets || !assets.length) {
      return null
    }

    const exact = assets.find((asset) => asset.platform === platform && asset.arch === arch)
    if (exact) {
      return exact
    }

    if (arch !== 'universal') {
      const universal = assets.find(
        (asset) => asset.platform === platform && asset.arch === 'universal'
      )
      if (universal) {
        return universal
      }
    }

    return assets.find((asset) => asset.platform === platform) || null
  }

  private async resolveSignatureSource(): Promise<{
    signatureUrl: string | null
    signatureKeyUrl?: string
  }> {
    const forcedSignatureUrl = process.env.TUFF_BUILD_SIGNATURE_URL
    if (forcedSignatureUrl) {
      return {
        signatureUrl: forcedSignatureUrl,
        signatureKeyUrl: process.env.TUFF_BUILD_SIGNATURE_KEY_URL
      }
    }

    const apiBase = this.resolveApiBase()
    const version = app.getVersion()
    const platform = this.resolvePlatform()
    const arch = this.resolveArch()

    const tagCandidates = version.startsWith('v') ? [version] : [`v${version}`, version]
    let release: any | null = null

    for (const tag of tagCandidates) {
      release = await this.fetchReleaseByTag(apiBase, tag)
      if (release) {
        break
      }
    }

    if (!release) {
      const channel = this.resolveChannel(version)
      release = await this.fetchLatestRelease(apiBase, channel, platform)
      if (release && release.version !== version) {
        release = null
      }
    }

    if (!release) {
      return { signatureUrl: null }
    }

    const asset = this.pickReleaseAsset(release.assets, platform, arch)
    if (!asset || !asset.downloadUrl) {
      return { signatureUrl: null }
    }

    const signatureUrl = asset.signatureUrl || `${asset.downloadUrl}.sig`
    return { signatureUrl }
  }

  private async verifyBuildIntegrity(): Promise<void> {
    const targetPath = this.getBuildAssetPath()
    if (!targetPath) {
      return
    }

    try {
      const { signatureUrl, signatureKeyUrl } = await this.resolveSignatureSource()
      if (!signatureUrl) {
        this.setVerificationStatus(false, false)
        this.log.warn('[BuildVerification] Signature URL not found for current build.')
        return
      }

      const result = await this.signatureVerifier.verifyFileSignature(
        targetPath,
        signatureUrl,
        signatureKeyUrl
      )

      if (result.valid) {
        this.setVerificationStatus(true, false)
        this.log.info('[BuildVerification] Official build verified.')
      } else {
        const nonFatalReasons = [
          'Signature file not available',
          'Signature public key not available'
        ]
        const shouldMarkFailed = !nonFatalReasons.includes(result.reason || '')
        this.setVerificationStatus(false, shouldMarkFailed)
        this.log.warn('[BuildVerification] Build verification failed.', {
          meta: { reason: result.reason }
        })
      }
    } catch (error: unknown) {
      this.log.warn('[BuildVerification] Verification error.', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
      this.setVerificationStatus(false, false)
    }
  }

  private pushVerificationStatus(window: BrowserWindow): void {
    $app.channel?.sendTo(window, ChannelType.MAIN, 'build:verification-status', {
      isOfficialBuild: this.isOfficialBuild,
      verificationFailed: this.verificationFailed,
      hasOfficialKey: this.isVerified
    })
  }

  private setVerificationStatus(isOfficial: boolean, verificationFailed: boolean): void {
    this.isVerified = true
    this.isOfficialBuild = isOfficial
    this.verificationFailed = verificationFailed

    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      this.pushVerificationStatus(win)
    }
  }

  /**
   * 获取验证状态（供其他模块调用）
   */
  public getVerificationStatus(): {
    isVerified: boolean
    isOfficialBuild: boolean
    verificationFailed: boolean
  } {
    return {
      isVerified: this.isVerified,
      isOfficialBuild: this.isOfficialBuild,
      verificationFailed: this.verificationFailed
    }
  }
}

export const buildVerificationModule = new BuildVerificationModule()
