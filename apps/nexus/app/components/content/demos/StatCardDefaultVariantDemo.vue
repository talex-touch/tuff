<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      total: '插件总数',
      enabled: '已启用',
      updates: '待更新',
      disabled: '已停用',
    }
  : {
      total: 'Total plugins',
      enabled: 'Enabled',
      updates: 'Pending updates',
      disabled: 'Disabled',
    }))
</script>

<template>
  <div class="stat-card-default-demo">
    <TxStatCard
      :value="2847"
      :label="labels.total"
      icon-class="i-carbon-download text-[var(--tx-color-primary)]"
      clickable
    />
    <TxStatCard
      :value="2516"
      :label="labels.enabled"
      icon-class="i-carbon-checkmark-outline text-[var(--tx-color-success)]"
    />
    <TxStatCard
      :value="18"
      :label="labels.updates"
      icon-class="i-carbon-renew text-[var(--tx-color-warning)]"
    />
    <TxStatCard
      :value="331"
      :label="labels.disabled"
      icon-class="i-carbon-power text-[var(--tx-color-info)]"
    />
  </div>
</template>

<style scoped>
/* Two columns keep every card's content box over 240px in the desktop docs
   column, so all four tones show the icon centred in its slot with the aura
   behind it; four abreast would drop them into the narrow corner layout.
   `--tx-color-info` is grey, which keeps a grey icon and draws no aura. */
.stat-card-default-demo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
</style>
