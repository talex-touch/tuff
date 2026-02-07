<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 560px;">
      <TxGroupBlock
        name="同步"
        description="手动触发同步"
        default-icon="i-ri-loop-left-line"
        :collapsible="false"
      >
        <template #header-extra>
          <button style="padding: 6px 10px; border-radius: 8px; border: 1px solid var(--tx-border-color); background: var(--tx-fill-color-blank); font-size: 12px;">
            立即同步
          </button>
        </template>
        <template #default>
          <div style="padding: 12px; font-size: 12px; color: var(--tx-text-color-secondary);">
            点击右侧按钮触发立即同步。
          </div>
        </template>
      </TxGroupBlock>
    </div>
  </div>
  <div v-else>
    <div style="width: 560px;">
      <TxGroupBlock
        name="Sync"
        description="Trigger a manual sync"
        default-icon="i-ri-loop-left-line"
        :collapsible="false"
      >
        <template #header-extra>
          <button style="padding: 6px 10px; border-radius: 8px; border: 1px solid var(--tx-border-color); background: var(--tx-fill-color-blank); font-size: 12px;">
            Sync now
          </button>
        </template>
        <template #default>
          <div style="padding: 12px; font-size: 12px; color: var(--tx-text-color-secondary);">
            Use the button to trigger a manual sync.
          </div>
        </template>
      </TxGroupBlock>
    </div>
  </div>
</template>
