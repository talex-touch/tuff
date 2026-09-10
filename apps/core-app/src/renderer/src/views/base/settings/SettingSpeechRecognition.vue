<script setup lang="ts" name="SettingSpeechRecognition">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  ensureVoiceInputSetting,
  normalizeVoicePolishStrength,
  VOICE_POLISH_STRENGTHS,
  type VoiceInputSetting,
  type VoicePolishStrength
} from '@talex-touch/utils/common/storage/entity/app-settings'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import { appSetting } from '~/modules/storage/app-storage'

const { t } = useI18n()
const router = useRouter()

const historyEnabled = computed({
  get: () => (appSetting.voiceInput as VoiceInputSetting).historyEnabled === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).historyEnabled = value
  }
})

const polishEnabled = computed({
  get: () => (appSetting.voiceInput as VoiceInputSetting).polishEnabled !== false,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).polishEnabled = value
  }
})

const polishStrength = computed({
  get: (): VoicePolishStrength =>
    normalizeVoicePolishStrength((appSetting.voiceInput as VoiceInputSetting).polishStrength),
  set: (value: string | number) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).polishStrength =
      normalizeVoicePolishStrength(value)
  }
})

const polishStrengthDescription = computed(() =>
  t(`settingSpeechRecognition.polishStrength.options.${polishStrength.value}.description`)
)

function openCapabilities(): void {
  void router.push('/setting/intelligence/capabilities')
}
</script>

<template>
  <TuffGroupBlock
    data-voice-settings
    :name="t('settingSpeechRecognition.title')"
    :description="t('settingSpeechRecognition.description')"
    default-icon="i-carbon-microphone"
    active-icon="i-carbon-microphone-filled"
  >
    <TuffBlockSwitch
      v-model="polishEnabled"
      :title="t('settingSpeechRecognition.polish.title')"
      :description="t('settingSpeechRecognition.polish.description')"
      default-icon="i-carbon-magic-wand"
      active-icon="i-carbon-magic-wand-filled"
    />
    <TuffBlockSelect
      v-if="polishEnabled"
      v-model="polishStrength"
      :title="t('settingSpeechRecognition.polishStrength.title')"
      :description="polishStrengthDescription"
      default-icon="i-carbon-text-align-left"
    >
      <TxSelectItem v-for="strength in VOICE_POLISH_STRENGTHS" :key="strength" :value="strength">
        {{ t(`settingSpeechRecognition.polishStrength.options.${strength}.label`) }}
      </TxSelectItem>
    </TuffBlockSelect>
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
