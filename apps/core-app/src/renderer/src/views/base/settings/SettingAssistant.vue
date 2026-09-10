<script setup lang="ts" name="SettingAssistant">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { appSetting } from '~/modules/storage/app-storage'

const { t } = useI18n()

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

function ensureAssistantSettings(): void {
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
  () => [appSetting.assistant, appSetting.floatingBall],
  () => ensureAssistantSettings(),
  { immediate: true }
)
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

    <TuffBlockSlot
      v-if="props.mode !== 'standard'"
      :title="t('settingAssistant.voiceWake')"
      :description="t('settingAssistant.voiceWakeDesc')"
      :disabled="true"
      default-icon="i-carbon-microphone-off"
    />
  </TuffGroupBlock>
</template>
