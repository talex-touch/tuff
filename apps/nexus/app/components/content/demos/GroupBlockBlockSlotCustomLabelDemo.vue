<script setup lang="ts">
import { TxBlockSlot, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { TuffInput } from '@talex-touch/tuffex/input'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const profileName = ref('Nexus')

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '资料字段',
      description: '自定义标签区域',
      label: '资料名称',
      required: '必填',
      hint: '显示在共享工作区。',
      placeholder: '输入资料名称',
    }
  : {
      title: 'Profile fields',
      description: 'Custom label content',
      label: 'Profile name',
      required: 'Required',
      hint: 'Shown in shared workspaces.',
      placeholder: 'Enter profile name',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-user-settings-line"
      :collapsible="false"
    >
      <TxBlockSlot default-icon="i-ri-profile-line">
        <template #label>
          <div class="group-block-custom-label">
            <div class="group-block-custom-label__title">
              <span>{{ labels.label }}</span>
              <span class="group-block-custom-label__required">{{ labels.required }}</span>
            </div>
            <p>{{ labels.hint }}</p>
          </div>
        </template>
        <TuffInput v-model="profileName" :placeholder="labels.placeholder" class="group-block-showcase__input" />
      </TxBlockSlot>
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}

.group-block-showcase__input {
  width: 220px;
}

.group-block-custom-label {
  display: grid;
  gap: 3px;
}

.group-block-custom-label__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.group-block-custom-label__required {
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-danger) 12%, transparent);
  color: var(--tx-color-danger);
  font-size: 11px;
  font-weight: 700;
}

.group-block-custom-label p {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
