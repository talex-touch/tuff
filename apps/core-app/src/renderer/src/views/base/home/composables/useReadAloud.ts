import type { TxAiSpeakState } from '@talex-touch/intelligence-uikit'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { homeLog } from './home-log'


/** At most one message reads at a time; starting another stops the current. */
export function useReadAloud() {
  const { t } = useI18n()
  const intelligenceSdk = useIntelligenceSdk()

  const speaking = ref<{ id: string; state: 'loading' | 'speaking' } | null>(null)
  let speakAudio: HTMLAudioElement | null = null
  let speakToken = 0

  function stopSpeaking(): void {
    speakToken += 1
    speakAudio?.pause()
    speakAudio = null
    speaking.value = null
  }

  async function toggleSpeak(message: ConversationMessage): Promise<void> {
    if (speaking.value?.id === message.id) {
      stopSpeaking()
      return
    }
    stopSpeaking()
    if (!message.content) return

    const token = ++speakToken
    speaking.value = { id: message.id, state: 'loading' }
    try {
      const result = await intelligenceSdk.ttsSpeak({ text: message.content })
      // The user may have toggled away while synthesis ran.
      if (token !== speakToken) return
      const audio = new Audio(result.audio)
      speakAudio = audio
      audio.onended = () => {
        if (token === speakToken) stopSpeaking()
      }
      await audio.play()
      if (token === speakToken) speaking.value = { id: message.id, state: 'speaking' }
    } catch (error) {
      if (token !== speakToken) return
      homeLog.warn('Read aloud failed', String(error))
      toast.error(t('home.speakFailed'))
      stopSpeaking()
    }
  }

  onBeforeUnmount(stopSpeaking)

  function speakStateOf(message: ConversationMessage): TxAiSpeakState {
    return speaking.value?.id === message.id ? speaking.value.state : 'idle'
  }

  return { toggleSpeak, speakStateOf, stopSpeaking }
}
