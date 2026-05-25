<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const active = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      clickable: active.value ? '已选择' : '可点击',
      disabled: '禁用',
      status: active.value ? '当前状态：已选择' : '当前状态：未选择',
    }
  : {
      clickable: active.value ? 'Selected' : 'Clickable',
      disabled: 'Disabled',
      status: active.value ? 'Current state: selected' : 'Current state: idle',
    }))
</script>

<template>
  <div class="tag-state-demo">
    <div class="tuff-demo-row">
      <TxTag
        :label="labels.clickable"
        :color="active ? 'var(--tx-color-success)' : 'var(--tx-color-primary)'"
        @click="active = !active"
      />
      <TxTag :label="labels.disabled" disabled />
    </div>
    <span class="tag-state-demo__status">{{ labels.status }}</span>
  </div>
</template>

<style scoped>
.tag-state-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.tag-state-demo__status {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}
</style>
