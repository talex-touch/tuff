<script setup lang="ts">
import { computed, ref } from 'vue'

const open = ref(false)
const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      open: '打开模态框',
      title: '确认同步设置',
      body: '模态框适合短确认、少量表单或需要阻塞背景内容的轻量任务。',
      metaTitle: '同步范围',
      metaBody: '当前工作区 · 3 个项目 · 仅保存 UI 偏好',
      cancel: '取消',
      confirm: '确认同步',
    }
  : {
      open: 'Open Modal',
      title: 'Confirm sync settings',
      body: 'Use a modal for short confirmations, compact forms, or lightweight tasks that must block the background page.',
      metaTitle: 'Sync scope',
      metaBody: 'Current workspace · 3 projects · UI preferences only',
      cancel: 'Cancel',
      confirm: 'Confirm sync',
    }))
</script>

<template>
  <div class="modal-demo">
    <TxButton variant="primary" @click="open = true">
      {{ labels.open }}
    </TxButton>

    <TxModal v-model="open" :title="labels.title" width="min(92vw, 520px)">
      <p class="modal-demo__copy">
        {{ labels.body }}
      </p>
      <div class="modal-demo__summary">
        <strong>{{ labels.metaTitle }}</strong>
        <span>{{ labels.metaBody }}</span>
      </div>
      <template #footer>
        <TxButton variant="ghost" @click="open = false">
          {{ labels.cancel }}
        </TxButton>
        <TxButton variant="primary" @click="open = false">
          {{ labels.confirm }}
        </TxButton>
      </template>
    </TxModal>
  </div>
</template>

<style scoped>
.modal-demo {
  display: flex;
  align-items: center;
}

.modal-demo__copy {
  margin: 0;
  color: var(--tx-text-color-secondary);
  line-height: 1.6;
}

.modal-demo__summary {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  background: var(--tx-fill-color-lighter);
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}

.modal-demo__summary strong {
  color: var(--tx-text-color-primary);
}
</style>
