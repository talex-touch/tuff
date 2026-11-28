<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()
const active = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      longTab: '长内容',
      shortTab: '短内容',
      longTitle: '长内容',
      shortTitle: '短内容',
    }
  }

  return {
    longTab: 'Long',
    shortTab: 'Short',
    longTitle: 'Long Content',
    shortTitle: 'Short Content',
  }
})

watch(
  () => locale.value,
  () => {
    active.value = labels.value.longTab
  },
  { immediate: true },
)
</script>

<template>
  <div style="min-height: 120px;">
    <TxTabs
      v-model="active"
      placement="left"
      :content-scrollable="false"
      :animation="{ size: { enabled: true, durationMs: 260, easing: 'ease' } }"
    >
      <TxTabItem :name="labels.longTab" activation>
        <div style="padding: 10px;">
          <div style="font-weight: 600; margin-bottom: 8px;">
            {{ labels.longTitle }}
          </div>
          <div style="height: 260px; border-radius: 10px; background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);" />
        </div>
      </TxTabItem>
      <TxTabItem :name="labels.shortTab">
        <div style="padding: 10px;">
          <div style="font-weight: 600; margin-bottom: 8px;">
            {{ labels.shortTitle }}
          </div>
          <div style="height: 90px; border-radius: 10px; background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent);" />
        </div>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
