import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import type { BuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { BuildAttestationPlatform, BuildAttestationRuntimeArch } from './attestation'
import path from 'node:path'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { app, BrowserWindow } from 'electron'
import officialReleaseSigningPublicKey from '../../../../resources/keys/release-signing-public.pem?raw'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { verifyBuildAttestation } from './attestation'

const buildVerificationStatusEvent = AppEvents.build.statusUpdated
const buildVerificationLog = createLogger('BuildVerificationModule')
const BUILD_ATTESTATION_FILE = 'build-attestation.json'
const BUILD_ATTESTATION_SIGNATURE_FILE = `${BUILD_ATTESTATION_FILE}.sig`
const OFFICIAL_APP_ID = 'com.tagzxia.app.tuff'

export interface BuildVerificationModuleStatus {
  isVerified: boolean
  isOfficialBuild: boolean
  verificationFailed: boolean
  hasOfficialKey: boolean
  reason?: string
}

export class BuildVerificationModule extends BaseModule {
  static key = Symbol.for('BuildVerificationModule')

  name = BuildVerificationModule.key
  filePath = import.meta.url
  constructorKey = BuildVerificationModule.key
  order = 0

  private status: BuildVerificationModuleStatus = {
    isVerified: false,
    isOfficialBuild: false,
    verificationFailed: false,
    hasOfficialKey: false
  }

  private transport: ITuffTransportMain | null = null

  constructor() {
    super(BuildVerificationModule.key, {
      create: true,
      dirName: 'build-verification'
    })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'build-verification')
    this.transport = runtime.transport

    this.transport.on(AppEvents.build.getVerificationStatus, () => this.toTransportStatus())
    this.transport.on(AppEvents.build.getVerificationStatusLegacy, () => this.toTransportStatus())

    if (!app.isPackaged) {
      this.setVerificationStatus({
        isVerified: true,
        isOfficialBuild: false,
        verificationFailed: false,
        hasOfficialKey: false,
        reason: 'development-build'
      })
      return
    }

    await this.verifyPackagedBuild()
  }

  onDestroy(): MaybePromise<void> {
    this.transport = null
  }

  private async verifyPackagedBuild(): Promise<void> {
    const platform = this.resolvePlatform()
    const arch = this.resolveArch()
    if (!platform || !arch) {
      this.setVerificationStatus({
        isVerified: true,
        isOfficialBuild: false,
        verificationFailed: true,
        hasOfficialKey: false,
        reason: 'unsupported-runtime-target'
      })
      return
    }

    const resourcesPath = process.resourcesPath
    const result = await verifyBuildAttestation({
      appAsarPath: path.join(resourcesPath, 'app.asar'),
      attestationPath: path.join(resourcesPath, BUILD_ATTESTATION_FILE),
      signaturePath: path.join(resourcesPath, BUILD_ATTESTATION_SIGNATURE_FILE),
      publicKey: officialReleaseSigningPublicKey,
      expected: {
        appId: OFFICIAL_APP_ID,
        version: app.getVersion(),
        platform,
        arch
      }
    })

    const verificationFailed = result.reason !== 'attestation-not-available' && !result.valid
    this.setVerificationStatus({
      isVerified: true,
      isOfficialBuild: result.valid,
      verificationFailed,
      hasOfficialKey: result.hasOfficialKey,
      reason: result.reason
    })

    if (result.valid) {
      buildVerificationLog.info('Official build attestation verified', {
        meta: {
          version: result.attestation?.version || app.getVersion(),
          platform: result.attestation?.platform || process.platform,
          arch: result.attestation?.arch || process.arch,
          commit: result.attestation?.commit || 'unknown',
          keyFingerprint: result.attestation?.keyFingerprint || 'unknown'
        }
      })
    } else if (verificationFailed) {
      buildVerificationLog.error('Build attestation verification failed', {
        meta: {
          reason: result.reason || 'unknown',
          detail: result.detail || 'none'
        }
      })
    } else {
      buildVerificationLog.info('Unsigned packaged build detected')
    }
  }

  private resolvePlatform(): BuildAttestationPlatform | null {
    if (
      process.platform === 'darwin' ||
      process.platform === 'win32' ||
      process.platform === 'linux'
    ) {
      return process.platform
    }
    return null
  }

  private resolveArch(): BuildAttestationRuntimeArch | null {
    if (process.arch === 'x64' || process.arch === 'arm64') {
      return process.arch
    }
    return null
  }

  private toTransportStatus(): BuildVerificationStatus {
    return {
      isOfficialBuild: this.status.isOfficialBuild,
      verificationFailed: this.status.verificationFailed,
      hasOfficialKey: this.status.hasOfficialKey
    }
  }

  private pushVerificationStatus(win: BrowserWindow): void {
    if (!this.transport || win.isDestroyed()) return
    this.transport.broadcastToWindow(win.id, buildVerificationStatusEvent, this.toTransportStatus())
  }

  private setVerificationStatus(status: BuildVerificationModuleStatus): void {
    this.status = status
    for (const win of BrowserWindow.getAllWindows()) {
      this.pushVerificationStatus(win)
    }
  }

  public getVerificationStatus(): BuildVerificationModuleStatus {
    return { ...this.status }
  }
}

export const buildVerificationModule = new BuildVerificationModule()
