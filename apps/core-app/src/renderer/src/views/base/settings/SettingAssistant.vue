<script setup lang="ts" name="SettingAssistant">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { appSetting } from '~/modules/storage/app-storage'

const { t } = useI18n()

const assistantEnabled = computed({
  get: () => appSetting.assistant?.enabled === true,
  set: (value: boolean) => {
    ensureAssistantSettings()
    appSetting.assistant.enabled = value
    if (!value) {
      appSetting.floatingBall.enabled = false
      appSetting.voiceWake.enabled = false
    }
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

const voiceWakeEnabled = computed({
  get: () => appSetting.voiceWake?.enabled === true,
  set: (value: boolean) => {
    ensureAssistantSettings()
    appSetting.voiceWake.enabled = value
    if (value) {
      appSetting.assistant.enabled = true
      appSetting.floatingBall.enabled = true
    }
  }
})

const assistantName = computed({
  get: () => appSetting.assistant?.name || '阿洛 aler',
  set: (value: string | number) => {
    ensureAssistantSettings()
    const next = String(value).trim()
    appSetting.assistant.name = next || '阿洛 aler'
  }
})

const wakeWords = computed({
  get: () => appSetting.voiceWake?.wakeWords?.join(', ') || '阿洛, aler',
  set: (value: string | number) => {
    ensureAssistantSettings()
    const next = String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    appSetting.voiceWake.wakeWords = next.length ? next : ['阿洛', 'aler']
  }
})

function ensureAssistantSettings(): void {
  if (!appSetting.assistant || typeof appSetting.assistant !== 'object') {
    appSetting.assistant = {
      name: '阿洛 aler',
      identifier: 'aler',
      enabled: false
    }
  }
  if (typeof appSetting.assistant.name !== 'string' || !appSetting.assistant.name.trim()) {
    appSetting.assistant.name = '阿洛 aler'
  }
  if (
    typeof appSetting.assistant.identifier !== 'string' ||
    !appSetting.assistant.identifier.trim()
  ) {
    appSetting.assistant.identifier = 'aler'
  }
  if (typeof appSetting.assistant.enabled !== 'boolean') {
    appSetting.assistant.enabled = false
  }

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

  if (!appSetting.voiceWake || typeof appSetting.voiceWake !== 'object') {
    appSetting.voiceWake = {
      enabled: false,
      wakeWords: ['阿洛', 'aler'],
      language: 'zh-CN',
      continuous: true,
      cooldownMs: 2200,
      openPanelOnWake: true
    }
  }
  if (typeof appSetting.voiceWake.enabled !== 'boolean') {
    appSetting.voiceWake.enabled = false
  }
  if (
    !Array.isArray(appSetting.voiceWake.wakeWords) ||
    appSetting.voiceWake.wakeWords.length === 0
  ) {
    appSetting.voiceWake.wakeWords = ['阿洛', 'aler']
  }
  if (typeof appSetting.voiceWake.language !== 'string' || !appSetting.voiceWake.language.trim()) {
    appSetting.voiceWake.language = 'zh-CN'
  }
  if (typeof appSetting.voiceWake.continuous !== 'boolean') {
    appSetting.voiceWake.continuous = true
  }
  if (!Number.isFinite(appSetting.voiceWake.cooldownMs)) {
    appSetting.voiceWake.cooldownMs = 2200
  }
  if (typeof appSetting.voiceWake.openPanelOnWake !== 'boolean') {
    appSetting.voiceWake.openPanelOnWake = true
  }
}

watch(
  () => [appSetting.assistant, appSetting.floatingBall, appSetting.voiceWake],
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
      v-model="assistantEnabled"
      :title="t('settingAssistant.enableAssistant')"
      :description="t('settingAssistant.enableAssistantDesc')"
      default-icon="i-carbon-ai"
      active-icon="i-carbon-ai"
    />

    <TuffBlockSwitch
      v-model="floatingBallEnabled"
      :title="t('settingAssistant.floatingBall')"
      :description="t('settingAssistant.floatingBallDesc')"
      default-icon="i-carbon-dot-mark"
      active-icon="i-carbon-dot-mark"
    />

    <TuffBlockInput
      v-model="assistantName"
      :title="t('settingAssistant.assistantName')"
      :description="t('settingAssistant.assistantNameDesc')"
      :placeholder="t('settingAssistant.assistantNamePlaceholder')"
      default-icon="i-carbon-user-avatar"
      active-icon="i-carbon-user-avatar-filled"
    />

    <TuffBlockSwitch
      v-model="voiceWakeEnabled"
      :title="t('settingAssistant.voiceWake')"
      :description="t('settingAssistant.voiceWakeDesc')"
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
    />

    <TuffBlockInput
      v-model="wakeWords"
      :title="t('settingAssistant.wakeWords')"
      :description="t('settingAssistant.wakeWordsDesc')"
      :placeholder="t('settingAssistant.wakeWordsPlaceholder')"
      :disabled="!voiceWakeEnabled"
      default-icon="i-carbon-text-link"
      active-icon="i-carbon-text-link"
    />
  </TuffGroupBlock>
</template>
