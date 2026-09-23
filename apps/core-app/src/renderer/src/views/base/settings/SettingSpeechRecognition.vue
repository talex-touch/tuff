<script setup lang="ts" name="SettingSpeechRecognition">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxTag } from '@talex-touch/tuffex/tag'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { useEventListener } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  ensureVoiceInputSetting,
  normalizeVoiceAsrSource,
  normalizeVoicePolishStrength,
  VOICE_ASR_SOURCES,
  VOICE_POLISH_STRENGTHS,
  type VoiceAsrSource,
  type VoiceInputSetting,
  type VoicePolishStrength
} from '@talex-touch/utils/common/storage/entity/app-settings'
import { TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import TuffBlockFlatRadio from '~/components/tuff/TuffBlockFlatRadio.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import { appSetting } from '~/modules/storage/app-storage'
import VoiceProviderCatalogSettings from './VoiceProviderCatalogSettings.vue'
import SpeechModelSettings from './SpeechModelSettings.vue'

const { t } = useI18n()
const transport = useTuffTransport()
// Keep the hint hidden until main confirms an active macOS Globe action.
const globeKeyConflict = ref(false)
/**
 * Raised only by a handover that the system did not actually apply.
 *
 * The preference is the system's to keep, so a write that does not move it leaves the row in
 * place with nothing left to click. This is the signal that the manual route is worth showing.
 */
const globeKeyHandoverFailed = ref(false)

const voiceInputEnabled = computed({
  get: () => appSetting.voiceInput?.enabled === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    appSetting.voiceInput.enabled = value
  }
})
const voiceSource = computed({
  get: (): VoiceAsrSource =>
    normalizeVoiceAsrSource((appSetting.voiceInput as VoiceInputSetting).source),
  set: (value: string | number) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).source = normalizeVoiceAsrSource(value)
  }
})

/**
 * Says what the chosen state will actually do, because the three labels alone do not: nothing
 * tells the reader that 混合 falls back to the cloud, and that is the one thing they are choosing.
 */
const voiceSourceDescription = computed(() =>
  t(`settingSpeechRecognition.source.options.${voiceSource.value}.description`)
)

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
    const conflicted = status.applies && status.systemActionActive
    globeKeyConflict.value = conflicted
    // A read knows nothing about a write, so it can only clear the fallback by resolving the row.
    if (!conflicted) globeKeyHandoverFailed.value = false
  } catch {
    // A settings page that cannot reach main has nothing to say about the system keyboard, and
    // a hint that appears on a transport failure would be noise.
    globeKeyConflict.value = false
    globeKeyHandoverFailed.value = false
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
    const conflicted = status.applies && status.systemActionActive
    globeKeyConflict.value = conflicted
    globeKeyHandoverFailed.value = conflicted
  } catch {
    // The write did not reach the system, so all the row knows is what the read reports. A read
    // that still sees the conflict has to leave the manual route on screen: the key is exactly as
    // taken as it was before the click, and this was the one-click attempt that was meant to fix
    // it. Leaving the flag alone would hide the only way out.
    await refreshGlobeKeyStatus()
    globeKeyHandoverFailed.value = globeKeyConflict.value
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
</script>

<template>
  <TuffGroupBlock
    class="VoiceInputSettings"
    :description="t('settingSpeechRecognition.description')"
    default-icon="i-carbon-microphone"
    active-icon="i-carbon-microphone-filled"
  >
    <TuffBlockFlatRadio
      v-model="voiceSource"
      data-testid="voice-source-selector"
      :title="t('settingSpeechRecognition.source.title')"
      :description="voiceSourceDescription"
      default-icon="i-carbon-connect-source"
      active-icon="i-carbon-connect"
    >
      <TxFlatRadioItem
        v-for="source in VOICE_ASR_SOURCES"
        :key="source"
        :value="source"
        :label="t(`settingSpeechRecognition.source.options.${source}.label`)"
      />
    </TuffBlockFlatRadio>
    <TuffBlockSwitch
      v-model="voiceInputEnabled"
      data-testid="voice-input-enabled-toggle"
      :title="t('settingSpeechRecognition.input.title')"
      :description="t('settingSpeechRecognition.input.description')"
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
    >
      <template #tags>
        <TxTag
          size="sm"
          :type="voiceInputEnabled ? 'success' : 'info'"
          data-testid="voice-input-opt-in-status"
        >
          {{
            voiceInputEnabled
              ? t('settingSpeechRecognition.input.manualOnLabel')
              : t('settingSpeechRecognition.input.defaultOffLabel')
          }}
        </TxTag>
      </template>
    </TuffBlockSwitch>

    <!--
      Only while voice input is on: a machine that is not using Fn for dictation has no conflict
      to report, and this is a request to change a system preference, not a warning. The row
      offers one action — take the key. Opening System Settings is not a peer of it but the way
      out when that write does not stick, so it stays hidden until the handover has failed.
    -->
    <TuffBlockSlot
      v-if="voiceInputEnabled && globeKeyConflict"
      :title="t('settingSpeechRecognition.globeKey.title')"
      :description="t('settingSpeechRecognition.globeKey.description')"
      default-icon="i-carbon-keyboard"
      data-testid="voice-globe-key-hint"
    >
      <TxButton size="sm" data-testid="voice-disable-globe-key" @click.stop="disableGlobeKeyAction">
        {{ t('settingSpeechRecognition.globeKey.action') }}
      </TxButton>
      <TxButton
        v-if="globeKeyHandoverFailed"
        size="sm"
        variant="ghost"
        data-testid="voice-open-keyboard-settings"
        @click.stop="openKeyboardSettings"
      >
        {{ t('settingSpeechRecognition.globeKey.manual') }}
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
  </TuffGroupBlock>
  <VoiceProviderCatalogSettings />
  <SpeechModelSettings />
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
