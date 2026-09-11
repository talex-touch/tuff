<script setup lang="ts" name="SettingSpeechRecognition">
import { TxButton } from '@talex-touch/tuffex/button'
import {
  ensureVoiceInputSetting,
  type VoiceInputSetting
} from '@talex-touch/utils/common/storage/entity/app-settings'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { appSetting } from '~/modules/storage/app-storage'

/**
 * Voice entry, recognition history, and the route to channel/model configuration live here.
 * Runtime readiness remains in `VoiceRecognitionStatus` because status is not a preference.
 */
const { t } = useI18n()
const router = useRouter()

watch(
  () => appSetting.voiceInput,
  () => ensureVoiceInputSetting(appSetting as Record<string, unknown>),
  { immediate: true }
)

const voiceInputEnabled = computed({
  get: () => appSetting.voiceInput?.enabled === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).enabled = value
  }
})

const historyEnabled = computed({
  get: () => (appSetting.voiceInput as VoiceInputSetting)?.historyEnabled === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).historyEnabled = value
  }
})

function openCapabilities(): void {
  void router.push('/setting/intelligence/capabilities')
}
</script>

<template>
  <TuffGroupBlock
    :description="t('settingSpeechRecognition.description')"
    default-icon="i-carbon-microphone"
    active-icon="i-carbon-microphone-filled"
  >
    <TuffBlockSwitch
      v-model="voiceInputEnabled"
      :title="t('settingSpeechRecognition.voiceInput.title')"
      :description="t('settingSpeechRecognition.voiceInput.description')"
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
    />

    <TuffBlockSwitch
      v-model="historyEnabled"
      :title="t('settingSpeechRecognition.history.title')"
      :description="t('settingSpeechRecognition.history.description')"
      default-icon="i-carbon-document-view"
      active-icon="i-carbon-document-view"
    />
    <TuffBlockSlot
      :title="t('settingSpeechRecognition.capabilities.title')"
      :description="t('settingSpeechRecognition.capabilities.description')"
      default-icon="i-carbon-machine-learning-model"
    >
      <TxButton
        size="small"
        variant="ghost"
        data-testid="voice-open-capabilities"
        @click.stop="openCapabilities"
      >
        {{ t('settingSpeechRecognition.capabilities.action') }}
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>
