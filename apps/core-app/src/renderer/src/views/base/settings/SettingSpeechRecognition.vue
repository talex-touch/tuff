<script setup lang="ts" name="SettingSpeechRecognition">
import { TxButton } from '@talex-touch/tuffex/button'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { useEventListener } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useTuffTransport } from '@talex-touch/utils/transport'
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
const transport = useTuffTransport()
const router = useRouter()
// Keep the hint hidden until main confirms an active macOS Globe action.
const globeKeyConflict = ref(false)

const voiceInputEnabled = computed({
  get: () => appSetting.voiceInput?.enabled === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    appSetting.voiceInput.enabled = value
  }
})
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

const noiseSuppression = computed({
  get: () => (appSetting.voiceInput as VoiceInputSetting).noiseSuppression === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).noiseSuppression = value
  }
})

watch(
  () => appSetting.voiceInput,
  () => ensureVoiceInputSetting(appSetting as Record<string, unknown>),
  { immediate: true }
)

async function refreshGlobeKeyStatus(): Promise<void> {
  try {
    const status = await transport.send(AssistantEvents.voice.getGlobeKeyStatus)
    globeKeyConflict.value = status.applies && status.systemActionActive
  } catch {
    // A settings page that cannot reach main has nothing to say about the system keyboard, and
    // a hint that appears on a transport failure would be noise.
    globeKeyConflict.value = false
  }
}

/**
 * Hands the key over on one click.
 *
 * Writing the preference applies immediately — the logout every document about this key insists
 * on turned out to be folklore. The status is re-read from the system rather than assumed, so a
 * write that does not stick leaves the row and its manual escape hatch on screen.
 */
async function disableGlobeKeyAction(): Promise<void> {
  try {
    const status = await transport.send(AssistantEvents.voice.disableGlobeKeyAction)
    globeKeyConflict.value = status.applies && status.systemActionActive
  } catch {
    await refreshGlobeKeyStatus()
  }
}

async function openKeyboardSettings(): Promise<void> {
  await transport.send(AssistantEvents.voice.openKeyboardSettings)
}

onMounted(() => {
  void refreshGlobeKeyStatus()
})

// The user changes this preference in another application, so the row has to be able to retire
// itself when they come back rather than waiting for a remount they have no reason to perform.
useEventListener(window, 'focus', () => {
  void refreshGlobeKeyStatus()
})
function openCapabilities(): void {
  void router.push('/setting/intelligence/capabilities')
}
</script>

<template>
  <TuffGroupBlock
    class="VoiceInputSettings"
    :description="t('settingSpeechRecognition.description')"
    default-icon="i-carbon-microphone"
    active-icon="i-carbon-microphone-filled"
  >
    <TuffBlockSwitch
      v-model="voiceInputEnabled"
      :title="t('settingSpeechRecognition.input.title')"
      :description="t('settingSpeechRecognition.input.description')"
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
    />

    <!--
      Only while voice input is on: a machine that is not using Fn for dictation has no conflict
      to report, and this is a request to change a system preference, not a warning. The primary
      control performs the change; opening System Settings stays as the manual route for anyone
      who would rather see the switch they are flipping.
    -->
    <TuffBlockSlot
      v-if="voiceInputEnabled && globeKeyConflict"
      :title="t('settingSpeechRecognition.globeKey.title')"
      :description="t('settingSpeechRecognition.globeKey.description')"
      default-icon="i-carbon-keyboard"
      data-testid="voice-globe-key-hint"
    >
      <TxButton
        size="small"
        variant="ghost"
        data-testid="voice-open-keyboard-settings"
        @click.stop="openKeyboardSettings"
      >
        {{ t('settingSpeechRecognition.globeKey.manual') }}
      </TxButton>
      <TxButton
        size="small"
        data-testid="voice-disable-globe-key"
        @click.stop="disableGlobeKeyAction"
      >
        {{ t('settingSpeechRecognition.globeKey.action') }}
      </TxButton>
    </TuffBlockSlot>
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
    <TuffBlockSwitch
      v-model="noiseSuppression"
      data-testid="voice-noise-suppression"
      :title="t('settingSpeechRecognition.noiseSuppression.title')"
      :description="t('settingSpeechRecognition.noiseSuppression.description')"
      default-icon="i-carbon-waveform"
      active-icon="i-carbon-waveform"
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

<style scoped lang="scss">
.VoiceInputSettings {
  :deep(.TBlockSlot-Container) {
    height: auto;
    min-height: 56px;
    padding-block: 12px;
  }

  :deep(.TBlockSlot-Content) {
    height: auto;
  }

  :deep(.TBlockSlot-TitleRow h5) {
    margin: 0;
  }

  :deep(.TBlockSlot-Label > p) {
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}
</style>
