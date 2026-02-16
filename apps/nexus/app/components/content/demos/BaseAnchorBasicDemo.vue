<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '点击',
      content: '基于锚点定位的基础浮层，可由外部 v-model 完整控制。',
      close: '关闭',
    }
  }

  return {
    trigger: 'Click',
    content: 'Basic floating panel powered by anchor positioning and v-model control.',
    close: 'Close',
  }
})
</script>

<template>
  <TxBaseAnchor v-model="open" placement="bottom-start" :offset="10">
    <template #reference>
      <TxButton @click="open = !open">
        {{ labels.trigger }}
      </TxButton>
    </template>

    <template #content>
      <TxCard shadow="soft" :radius="14" :padding="12" style="width: 240px;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div>{{ labels.content }}</div>
          <div>
            <TxButton size="sm" variant="ghost" @click="open = false">
              {{ labels.close }}
            </TxButton>
          </div>
        </div>
      </TxCard>
    </template>
  </TxBaseAnchor>
</template>
