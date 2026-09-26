import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import { session } from 'electron'
import { tempFileService } from '../../service/temp-file.service'
import { iconService } from '../../service/icon-service'
import { createLogger } from '../../utils/logger'
import { clearTfilePreviewGrants } from './tfile-preview-grant'
import { BaseModule } from '../abstract-base-module'
import {
  clearTfileProtocolLogState,
  configureTfileProtocolAdditionalAllowedRoots,
  registerTfileProtocolForSession
} from './tfile-session'

export { __test__, registerTfileProtocolForSession } from './tfile-session'

const fileProtocolLog = createLogger('FileProtocolModule')

class FileProtocolModule extends BaseModule {
  static key: symbol = Symbol.for('FileProtocolModule')
  name: ModuleKey = FileProtocolModule.key

  private releaseConfiguredRoots: (() => void) | null = null
  private releaseProtocol: (() => void) | null = null

  constructor() {
    super(FileProtocolModule.key, {
      create: false
    })
  }

  onInit(): MaybePromise<void> {
    const additionalRoots = [tempFileService.getBaseDir()]
    // The icon cache root is optional at registration: if Electron cannot resolve a cache or
    // userData path there is no directory to allow, and the protocol must still serve every
    // other root instead of leaving the app without tfile delivery.
    try {
      additionalRoots.push(iconService.getFileIconCacheDirectory())
    } catch (error) {
      fileProtocolLog.warn('File icon cache root unavailable; tfile serves without it', { error })
    }
    this.releaseConfiguredRoots = configureTfileProtocolAdditionalAllowedRoots(additionalRoots)
    this.releaseProtocol = registerTfileProtocolForSession(session.defaultSession)
    fileProtocolLog.info('tfile protocol registered')
  }

  onDestroy(): MaybePromise<void> {
    this.releaseProtocol?.()
    this.releaseProtocol = null
    this.releaseConfiguredRoots?.()
    this.releaseConfiguredRoots = null
    clearTfileProtocolLogState()
    clearTfilePreviewGrants()
  }
}

const fileProtocolModule = new FileProtocolModule()

export { fileProtocolModule }
