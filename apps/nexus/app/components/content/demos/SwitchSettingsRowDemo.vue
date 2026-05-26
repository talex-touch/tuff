<script setup lang="ts">
import { computed, reactive } from 'vue'

const { locale } = useI18n()

const settings = reactive({
  notifications: true,
  focusMode: false,
  autoUpdate: true,
})

const labels = computed(() => (locale.value === 'zh'
  ? {
      notifications: '通知',
      notificationsDesc: '接收系统和插件的重要提醒。',
      focusMode: '专注模式',
      focusModeDesc: '隐藏非必要提示，减少打断。',
      autoUpdate: '自动更新',
      autoUpdateDesc: '在后台下载可用更新。',
      on: '已开启',
      off: '已关闭',
    }
  : {
      notifications: 'Notifications',
      notificationsDesc: 'Receive important system and plugin alerts.',
      focusMode: 'Focus mode',
      focusModeDesc: 'Hide non-essential prompts to reduce interruptions.',
      autoUpdate: 'Auto update',
      autoUpdateDesc: 'Download available updates in the background.',
      on: 'On',
      off: 'Off',
    }))
</script>

<template>
  <div class="switch-settings-demo">
    <div class="switch-settings-demo__row">
      <div class="switch-settings-demo__content">
        <TxTag :label="labels.notifications" />
        <p>{{ labels.notificationsDesc }}</p>
      </div>
      <div class="switch-settings-demo__action">
        <span>{{ settings.notifications ? labels.on : labels.off }}</span>
        <TuffSwitch v-model="settings.notifications" />
      </div>
    </div>
    <div class="switch-settings-demo__row">
      <div class="switch-settings-demo__content">
        <TxTag :label="labels.focusMode" color="var(--tx-color-warning)" />
        <p>{{ labels.focusModeDesc }}</p>
      </div>
      <div class="switch-settings-demo__action">
        <span>{{ settings.focusMode ? labels.on : labels.off }}</span>
        <TuffSwitch v-model="settings.focusMode" />
      </div>
    </div>
    <div class="switch-settings-demo__row">
      <div class="switch-settings-demo__content">
        <TxTag :label="labels.autoUpdate" color="var(--tx-color-success)" />
        <p>{{ labels.autoUpdateDesc }}</p>
      </div>
      <div class="switch-settings-demo__action">
        <span>{{ settings.autoUpdate ? labels.on : labels.off }}</span>
        <TuffSwitch v-model="settings.autoUpdate" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.switch-settings-demo {
  display: flex;
  flex-direction: column;
  width: min(100%, 560px);
  overflow: hidden;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
}

.switch-settings-demo__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
}

.switch-settings-demo__row + .switch-settings-demo__row {
  border-top: 1px solid var(--tx-border-color-lighter);
}

.switch-settings-demo__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.switch-settings-demo__content p {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.switch-settings-demo__action {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}

@media (max-width: 520px) {
  .switch-settings-demo__row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
