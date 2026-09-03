import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import { session } from 'electron'
import { tempFileService } from '../../service/temp-file.service'
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
    this.releaseConfiguredRoots = configureTfileProtocolAdditionalAllowedRoots([
      tempFileService.getBaseDir()
    ])
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
