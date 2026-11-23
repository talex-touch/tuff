import type { Ref } from 'vue'
import type { Router } from 'vue-router'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { USAGE_LIMITS_ROUTE } from '~/modules/intelligence/ai-error-recovery'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { appSetting } from '~/modules/storage/app-storage'
import { showDictationNotice } from '../composer/dictation-notice'
import { useComposerDictation } from '../composer/useComposerDictation'

export const VOICE_DRAFT_ID = '__home-voice-draft__'

const VOICE_DRAFT_ROW: ConversationMessage = {
  id: VOICE_DRAFT_ID,
  role: 'user',
  content: '',
  status: 'complete'
}

export interface UseHomeDictationOptions {
  draft: Ref<string>
  input: () => HTMLTextAreaElement | null
  messages: Ref<ConversationMessage[]>
  isStreaming: Ref<boolean>
  isHomeRoute: Ref<boolean>
  sending: Ref<boolean>
  workspaceLoading: Ref<boolean>
  workspaceLoadError: Ref<unknown>
  router: Router
  onTextChange: () => void
  onLeaveHome: () => void
}

/**
 * Wires composer dictation, platform-aware toast recovery notices, the trailing stream row for
 * pending voice clips, and lifecycle stop guards when replies start or Home leaves view.
 */
export function useHomeDictation(options: UseHomeDictationOptions) {
  const { t, locale } = useI18n()

  const micSettingsAvailable = (() => {
    const platform = getCurrentRendererPlatformState()
    return platform.isMac || platform.isWindows
  })()

  const dictation = useComposerDictation({
    draft: options.draft,
    input: options.input,
    language: () => appSetting.voiceInput?.language,
    onTextChange: options.onTextChange,
    onNotice: (kind, detail) =>
      showDictationNotice(
        kind,
        {
          t,
          locale: locale.value,
          openRecognitionSettings: () =>
            void options.router.push('/setting/intelligence/capabilities'),
          openMicrophoneSettings: micSettingsAvailable
            ? () => void dictation.openMicrophoneSettings()
            : undefined,
          openUsageLimits: () => void options.router.push(USAGE_LIMITS_ROUTE)
        },
        detail
      )
  })

  const streamItems = computed(() =>
    dictation.clip.value ? [...options.messages.value, VOICE_DRAFT_ROW] : options.messages.value
  )

  const voiceSendBlocked = computed(
    () =>
      !options.isHomeRoute.value ||
      options.sending.value ||
      dictation.active.value ||
      options.workspaceLoading.value ||
      Boolean(options.workspaceLoadError.value)
  )

  watch(options.isStreaming, (streaming) => {
    if (streaming) void dictation.stop()
  })

  watch(options.isHomeRoute, (visible) => {
    if (!visible) {
      options.onLeaveHome()
      void dictation.stop()
    }
  })

  return {
    dictation,
    streamItems,
    voiceSendBlocked
  }
}
