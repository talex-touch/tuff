<script setup lang="ts">
import { ref } from 'vue'

const active = ref<'Long' | 'Short'>('Long')
const tabsRef = ref<any>(null)

function toggle() {
  void tabsRef.value?.action?.(() => {
    active.value = active.value === 'Long' ? 'Short' : 'Long'
  })
}
</script>

<template>
  <div style="display: grid; gap: 10px;">
    <div style="display: flex; gap: 8px;">
      <TxButton size="small" type="primary" @click="toggle">
        Switch
      </TxButton>
    </div>

    <TxTabs
      ref="tabsRef"
      v-model="active"
      placement="left"
      :content-scrollable="false"
      :animation="{ size: { enabled: true, durationMs: 260, easing: 'ease' } }"
    >
      <TxTabItem name="Long" activation>
        <div style="padding: 10px;">
          <div style="font-weight: 600; margin-bottom: 8px;">Long Content</div>
          <div style="height: 260px; border-radius: 10px; background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);"></div>
        </div>
      </TxTabItem>

      <TxTabItem name="Short">
        <div style="padding: 10px;">
          <div style="font-weight: 600; margin-bottom: 8px;">Short Content</div>
          <div style="height: 90px; border-radius: 10px; background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent);"></div>
        </div>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
