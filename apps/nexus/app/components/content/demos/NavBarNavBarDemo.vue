<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '设置',
      action: '保存',
      content: '账户、安全与通知设置',
    }
  }

  return {
    title: 'Settings',
    action: 'Save',
    content: 'Account, security, and notification settings',
  }
})

function noop() {}
</script>

<template>
  <div class="nav-bar-demo">
    <TxNavBar :title="labels.title" show-back @back="noop" @click-right="noop">
      <template #right>
        <span class="nav-bar-demo__action">{{ labels.action }}</span>
      </template>
    </TxNavBar>

    <div class="nav-bar-demo__content">
      {{ labels.content }}
    </div>
  </div>
</template>

<style scoped>
.nav-bar-demo {
  width: 360px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color);
  border-radius: 12px;
}

.nav-bar-demo__action {
  color: var(--tx-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.nav-bar-demo__content {
  padding: 16px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}
</style>
