<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()
const active = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      tab1: '底部 1',
      tab2: '底部 2',
      tab3: '底部 3',
      content1: '底部 - 无动画',
      content2: '底部 - 无动画 2',
      content3: '底部 - 无动画 3',
    }
  }

  return {
    tab1: 'Left1',
    tab2: 'Left2',
    tab3: 'Left3',
    content1: 'Bottom - No animations',
    content2: 'Bottom - No animations 2',
    content3: 'Bottom - No animations 3',
  }
})

watch(
  () => locale.value,
  () => {
    active.value = labels.value.tab1
  },
  { immediate: true },
)
</script>

<template>
  <div style="height: 240px;">
    <TxTabs
      v-model="active"
      placement="bottom"
      :animation="{ indicator: false, content: false }"
    >
      <TxTabItem :name="labels.tab1" activation>
        <div style="padding: 10px;">
          {{ labels.content1 }}
        </div>
      </TxTabItem>
      <TxTabItem :name="labels.tab2">
        <div style="padding: 10px;">
          {{ labels.content2 }}
        </div>
      </TxTabItem>
      <TxTabItem :name="labels.tab3">
        <div style="padding: 10px;">
          {{ labels.content3 }}
        </div>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
