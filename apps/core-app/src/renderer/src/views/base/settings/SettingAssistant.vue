<script setup lang="ts" name="SettingAssistant">
import { ensureVoiceInputSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { TxButton } from '@talex-touch/tuffex/button'
import { useEventListener } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { appSetting } from '~/modules/storage/app-storage'

const { t } = useI18n()
const transport = useTuffTransport()

/**
 * Whether macOS will answer a lone Fn press before we do.
 *
 * The app cannot win this one — the Globe action is fired below our event tap — so the only
 * honest thing the settings page can do is say so and offer the trip to System Settings. Starts
 * false so the row never flashes in on a machine that already has it turned off.
 */
const globeKeyConflict = ref(false)

const props = withDefaults(
  defineProps<{
    mode?: 'standard' | 'advanced' | 'all'
  }>(),
  { mode: 'standard' }
)

const assistantEnabled = computed({
  get: () => appSetting.assistant?.enabled === true,
  set: (value: boolean) => {
    ensureAssistantSettings()
    appSetting.assistant.enabled = value
    if (!value) appSetting.floatingBall.enabled = false
  }
})

const floatingBallEnabled = computed({
  get: () => appSetting.floatingBall?.enabled === true,
  set: (value: boolean) => {
    ensureAssistantSettings()
    appSetting.floatingBall.enabled = value
    if (value) {
      appSetting.assistant.enabled = true
    }
  }
})

const voiceInputEnabled = computed({
  get: () => appSetting.voiceInput?.enabled === true,
  set: (value: boolean) => {
    ensureAssistantSettings()
    appSetting.voiceInput.enabled = value
  }
})

function ensureAssistantSettings(): void {
  ensureVoiceInputSetting(appSetting as Record<string, unknown>)
  if (!appSetting.assistant || typeof appSetting.assistant !== 'object') {
    appSetting.assistant = {
      enabled: false
    }
  }
  if (typeof appSetting.assistant.enabled !== 'boolean') {
    appSetting.assistant.enabled = false
  }
  const assistantSettings = appSetting.assistant as Record<string, unknown>
  delete assistantSettings.name
  delete assistantSettings.identifier

  if (!appSetting.floatingBall || typeof appSetting.floatingBall !== 'object') {
    appSetting.floatingBall = {
      enabled: false,
      size: 56,
      opacity: 1,
      edgePadding: 24,
      position: {
        x: -1,
        y: -1
      }
    }
  }
  if (typeof appSetting.floatingBall.enabled !== 'boolean') {
    appSetting.floatingBall.enabled = false
  }
  if (!Number.isFinite(appSetting.floatingBall.size)) {
    appSetting.floatingBall.size = 56
  }
  if (!Number.isFinite(appSetting.floatingBall.opacity)) {
    appSetting.floatingBall.opacity = 1
  }
  if (!Number.isFinite(appSetting.floatingBall.edgePadding)) {
    appSetting.floatingBall.edgePadding = 24
  }
  if (!appSetting.floatingBall.position || typeof appSetting.floatingBall.position !== 'object') {
    appSetting.floatingBall.position = { x: -1, y: -1 }
  }
}

watch(
  () => [appSetting.assistant, appSetting.floatingBall, appSetting.voiceInput],
  () => ensureAssistantSettings(),
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
    :name="t('settingAssistant.groupTitle')"
    :description="t('settingAssistant.groupDesc')"
    default-icon="i-carbon-chat-bot"
    active-icon="i-carbon-chat-bot"
    memory-name="setting-assistant"
  >
    <TuffBlockSwitch
      v-if="props.mode !== 'advanced'"
      v-model="assistantEnabled"
      :title="t('settingAssistant.enableAssistant')"
      :description="t('settingAssistant.enableAssistantDesc')"
      default-icon="i-carbon-ai"
      active-icon="i-carbon-ai"
    />

    <TuffBlockSwitch
      v-if="props.mode !== 'standard'"
      v-model="floatingBallEnabled"
      :title="t('settingAssistant.floatingBall')"
      :description="t('settingAssistant.floatingBallDesc')"
      default-icon="i-carbon-dot-mark"
      active-icon="i-carbon-dot-mark"
    />

    <TuffBlockSwitch
      v-model="voiceInputEnabled"
      :title="t('settingAssistant.voiceInput')"
      :description="t('settingAssistant.voiceInputDesc')"
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
    />

    <!--
      Only while voice input is on: a machine that is not using Fn for dictation has no conflict
      to report, and this is a request to change a system preference, not a warning.
    -->
    <TuffBlockSlot
      v-if="voiceInputEnabled && globeKeyConflict"
      :title="t('settingAssistant.globeKey')"
      :description="t('settingAssistant.globeKeyDesc')"
      default-icon="i-carbon-keyboard"
      data-testid="voice-globe-key-hint"
    >
      <TxButton
        size="small"
        variant="ghost"
        data-testid="voice-open-keyboard-settings"
        @click.stop="openKeyboardSettings"
      >
        {{ t('settingAssistant.globeKeyAction') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="props.mode !== 'standard'"
      :title="t('settingAssistant.voiceWake')"
      :description="t('settingAssistant.voiceWakeDesc')"
      :disabled="true"
      default-icon="i-carbon-microphone-off"
    />
  </TuffGroupBlock>
</template>
