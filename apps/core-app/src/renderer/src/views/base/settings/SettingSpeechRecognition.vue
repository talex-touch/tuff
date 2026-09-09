<script setup lang="ts" name="SettingSpeechRecognition">
import { TxButton } from '@talex-touch/tuffex/button'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  ensureVoiceInputSetting,
  type VoiceInputSetting
} from '@talex-touch/utils/common/storage/entity/app-settings'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import { appSetting } from '~/modules/storage/app-storage'

/**
 * Everything on this page the user can change, which is two things.
 *
 * It used to be six rows: a toggle, three separate trips into Intelligence, and two status
 * readouts. The three trips were one sentence said three times — channels, capability bindings
 * and channel order all live on the same screen, and none of them is an action this page
 * performs. They are now one row, which is what they always were.
 *
 * Status moved out entirely: it is not something you set, and reporting it in the same row shape
 * as a setting is what made a failure look like a preference. See `VoiceRecognitionStatus`.
 */

const { t } = useI18n()
const router = useRouter()

const historyEnabled = computed({
  get: () => (appSetting.voiceInput as VoiceInputSetting).historyEnabled === true,
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
    :name="t('settingSpeechRecognition.title')"
    :description="t('settingSpeechRecognition.description')"
    default-icon="i-carbon-microphone"
    active-icon="i-carbon-microphone-filled"
  >
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
