import { shell } from 'electron'
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
import { assistantModule } from '../assistant/module'
import { CommandVoiceGestureController, registerPlatformVoiceGesture } from './command-gesture'

const voiceLog = createLogger('Voice')

/**
 * Where each platform keeps the microphone permission pane.
 *
 * Constants, never renderer input: these schemes are deliberately absent from the external-URL
 * allowlist, so the only safe way to reach them is for main to hold the whole string. Linux has
 * no equivalent that works across desktops, so it is absent and the caller is told so rather
 * than being handed a button that does nothing.
 */
const MICROPHONE_SETTINGS_URL: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  win32: 'ms-settings:privacy-microphone'
}
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
  private commandGestureController: CommandVoiceGestureController | null = null

  constructor() {
    super(VoiceModule.key)
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'VoiceModule.onInit')
    this.transport = runtime.transport

    voiceLog.info('Initializing Voice module')
    this.registerChannels()
    globalDictationController.register()
    this.commandGestureController = new CommandVoiceGestureController(
      (payload) => assistantModule.handleVoiceCommandGesture(payload),
      () => assistantModule.isVoiceCommandActive(),
      registerPlatformVoiceGesture
    )
    this.commandGestureController.register()
    voiceLog.success('Voice module initialized')
  }

  async onDestroy(): Promise<void> {
    this.commandGestureController?.unregister()
    this.commandGestureController = null
    voiceService.dispose()
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

    // Main-owned uploaded audio transcription.
    this.cleanups.push(
      transport.on(
        voiceApiEvents.transcribeUpload,
        withPermissionSafeApi(
          { permissionId: VOICE_PERMISSION },
          (payload) => voiceService.transcribeUpload(payload),
          { onError: (error) => voiceLog.error('Voice upload transcription failed:', { error }) }
        )
      )
    )

    // The settings button on a device failure. Nothing crosses the boundary but the intent.
    this.cleanups.push(
      transport.on(
        voiceApiEvents.openMicrophoneSettings,
        withPermissionSafeApi(
          { permissionId: VOICE_PERMISSION },
          async () => {
            const url = MICROPHONE_SETTINGS_URL[process.platform]
            if (!url) throw new Error('VOICE_MICROPHONE_SETTINGS_UNSUPPORTED')
            await shell.openExternal(url)
          },
          {
            onError: (error) => voiceLog.error('Opening microphone settings failed:', { error })
          }
        )
      )
    )

    // Does a cancelled or failed recording still exist? Lets the dock offer recovery after
    // the pill has already collapsed, which is the only thing that makes the window reachable.
    this.cleanups.push(
      transport.on(
        voiceApiEvents.recoveryStatus,
        withPermissionSafeApi(
          { permissionId: VOICE_PERMISSION },
          () => voiceService.getRecoveryStatus(),
          { onError: (error) => voiceLog.error('Voice recovery status failed:', { error }) }
        )
      )
    )

    // Retry the last failed streaming session against the audio it already captured.
    this.cleanups.push(
      transport.on(
        voiceApiEvents.retryLastFailure,
        withPermissionSafeApi(
          { permissionId: VOICE_PERMISSION },
          (payload) => voiceService.retryLastFailure(payload),
          { onError: (error) => voiceLog.error('Voice retry failed:', { error }) }
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
                nextPayload as VoiceAsrStreamPayload,
                streamContext.signal,
                { stopSignal: streamContext.stopSignal }
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
