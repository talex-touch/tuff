import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { getTuffTransportMain, HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { voiceApiEvents } from '@talex-touch/utils/transport/sdk/domains/voice'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { withPermissionSafeApi } from '../../utils/safe-handler'
import { withPermission } from '../permission/channel-guard'
import { BaseModule } from '../abstract-base-module'
import { globalDictationController } from './global-dictation'
import { voiceService } from './voice-service'

const voiceLog = createLogger('Voice')
const VOICE_PERMISSION = 'voice.dictation'

/**
 * Voice module — infrastructure for speech capture + dictation sessions.
 *
 * Registers the one-shot `voice.dictate` handler and the live `voice.asrStream`
 * streaming handler (both permission-gated on `voice.dictation`), backed by
 * {@link voiceService}. TTS / true streaming-provider swaps live behind the same
 * transport contract.
 */
export class VoiceModule extends BaseModule<TalexEvents> {
  static readonly key: symbol = Symbol.for('Voice')
  name: ModuleKey = VoiceModule.key

  private transport: ReturnType<typeof getTuffTransportMain> | null = null
  private cleanups: Array<() => void> = []

  constructor() {
    super(VoiceModule.key)
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'VoiceModule.onInit')
    this.transport = runtime.transport

    voiceLog.info('Initializing Voice module')
    this.registerChannels()
    globalDictationController.register()
    voiceLog.success('Voice module initialized')
  }

  async onDestroy(): Promise<void> {
    globalDictationController.unregister()
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup()
      } catch (error) {
        voiceLog.warn('Voice channel cleanup failed', { error })
      }
    }
    this.transport = null
  }

  private registerChannels(): void {
    const transport = this.transport
    if (!transport) return

    // One-shot dictation.
    this.cleanups.push(
      transport.on(
        voiceApiEvents.dictate,
        withPermissionSafeApi(
          { permissionId: VOICE_PERMISSION },
          (payload, context) => voiceService.dictate(payload, context),
          { onError: (error) => voiceLog.error('Voice dictate failed:', { error }) }
        )
      )
    )

    // Text-to-speech.
    this.cleanups.push(
      transport.on(
        voiceApiEvents.speak,
        withPermissionSafeApi(
          { permissionId: VOICE_PERMISSION },
          (payload) => voiceService.speak(payload),
          { onError: (error) => voiceLog.error('Voice speak failed:', { error }) }
        )
      )
    )

    // Streaming dictation (live partials → final → end).
    this.cleanups.push(
      transport.onStream(voiceApiEvents.asrStream, async (payload, context) => {
        try {
          await withPermission(
            { permissionId: VOICE_PERMISSION },
            async (nextPayload, nextContext) => {
              const streamContext = nextContext as unknown as StreamContext<VoiceAsrStreamEvent>
              for await (const event of voiceService.streamDictation(
                nextPayload as VoiceAsrStreamPayload
              )) {
                if (streamContext.isCancelled()) break
                streamContext.emit(event)
              }
              streamContext.end()
            }
          )(payload, context as unknown as HandlerContext)
        } catch (error) {
          voiceLog.error('Voice asrStream failed:', { error })
          context.error(error instanceof Error ? error : new Error(String(error)))
        }
      })
    )
  }
}

export const voiceModule = new VoiceModule()
