<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      design: '设计',
      ecosystem: '生态',
      github: 'GitHub',
      npm: 'NPM',
    }
  }

  return {
    design: 'Design',
    ecosystem: 'Ecosystem',
    github: 'GitHub',
    npm: 'NPM',
  }
})
</script>

<template>
  <div style="display: flex; align-items: center; gap: 10px;">
    <TxDropdownMenu v-model="open" :min-width="240" placement="bottom-start" :panel-padding="8">
      <template #trigger>
        <div
          style="display: inline-flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--tx-border-color); border-radius: 12px; user-select: none; cursor: pointer;"
        >
          <div style="font-weight: 600;">
            {{ labels.design }}
          </div>
          <div style="color: var(--tx-text-color-secondary); font-weight: 600;">
            {{ labels.ecosystem }}
          </div>
          <TxIcon name="chevron-down" style="opacity: 0.65;" />
        </div>
      </template>

      <TxDropdownItem arrow>
        {{ labels.github }}
        <template #right>
          <span style="opacity: 0.72; display: inline-flex; align-items: center;">
            <i class="i-ri-external-link-line" style="font-size: 16px;" />
          </span>
        </template>
      </TxDropdownItem>
      <TxDropdownItem arrow>
        {{ labels.npm }}
        <template #right>
          <span style="opacity: 0.72; display: inline-flex; align-items: center;">
            <i class="i-ri-external-link-line" style="font-size: 16px;" />
          </span>
        </template>
      </TxDropdownItem>
    </TxDropdownMenu>
  </div>
</template>
