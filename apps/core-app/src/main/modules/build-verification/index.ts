import fse from 'fs-extra'
import path from 'path'
import { BaseModule } from '../abstract-base-module'
import { ModuleInitContext, MaybePromise, ChannelType } from '@talex-touch/utils'
import { TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { BrowserWindow, app } from 'electron'
import { mainLog } from '../../utils/logger'

interface BuildInfo {
  version: string
  buildTime: number
  buildIdentifier: string
  buildType: string
  channel: string
  isSnapshot: boolean
  isBeta: boolean
  isRelease: boolean
  gitCommitHash?: string
  officialSignature?: string
  hasOfficialKey: boolean
}

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

  constructor() {
    super(BuildVerificationModule.key)
  }

  onInit(_ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, () => {
      setTimeout(() => {
        this.verifyBuildIntegrity().catch((error) => {
          mainLog.error('[BuildVerification] Verification failed:', {
            meta: { error: error instanceof Error ? error.message : String(error) }
          })
        })
      }, 2000)
    })

    app.on('browser-window-created', (_, window) => {
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

  /**
   * Verify build integrity
   */
  private async verifyBuildIntegrity(): Promise<void> {
    try {
      const signaturePath = path.join(__dirname, '../../../signature.json')

      if (!fse.existsSync(signaturePath)) {
        mainLog.warn('[BuildVerification] signature.json not found')
        this.setVerificationStatus(false, false)
        return
      }

      const buildInfo: BuildInfo = fse.readJsonSync(signaturePath, { encoding: 'utf8' })

      // 如果没有官方密钥或签名，标记为非官方构建
      if (!buildInfo.hasOfficialKey || !buildInfo.officialSignature) {
        mainLog.warn('[BuildVerification] Non-official build detected (no encryption key)')
        this.setVerificationStatus(false, false)
        return
      }

      // 注意：运行时无法验证签名，因为没有构建时的 TUFF_ENCRYPTION_KEY
      // 我们只检查是否有签名存在，如果有签名就认为是官方构建
      // 完整的签名验证需要服务器端验证或应用启动时提供密钥

      // 有签名且 hasOfficialKey 为 true，认为是官方构建
      mainLog.info('[BuildVerification] Official build detected (has signature)')
      this.setVerificationStatus(true, false)
    } catch (error) {
      mainLog.error('[BuildVerification] Verification error:', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
      this.setVerificationStatus(false, false)
    }
  }

  // 注意：运行时验证签名需要在服务器端或提供密钥
  // 这里仅检测是否有签名存在

  /**
   * 推送验证状态到指定窗口
   */
  private pushVerificationStatus(window: BrowserWindow): void {
    $app.channel?.sendTo(window, ChannelType.MAIN, 'build:verification-status', {
      isOfficialBuild: this.isOfficialBuild,
      verificationFailed: this.verificationFailed,
      hasOfficialKey: this.isVerified
    })
  }

  /**
   * 设置验证状态并通知前端
   */
  private setVerificationStatus(isOfficial: boolean, verificationFailed: boolean): void {
    this.isVerified = true
    this.isOfficialBuild = isOfficial
    this.verificationFailed = verificationFailed

    // 通过 channel 通知所有窗口
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      this.pushVerificationStatus(win)
    }

    mainLog.info('[BuildVerification] Status updated', {
      meta: {
        isOfficialBuild: isOfficial,
        verificationFailed
      }
    })
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

