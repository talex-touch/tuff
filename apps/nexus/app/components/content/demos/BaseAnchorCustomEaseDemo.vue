<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)
const expanded = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '自适应尺寸',
      content: '内容变化后浮层会自动重新计算尺寸，避免突然截断。',
      details: '展开更多说明',
      collapse: '收起',
    }
  }

  return {
    trigger: 'Auto Resize',
    content: 'The floating panel recomputes its size when content changes.',
    details: 'Expand details',
    collapse: 'Collapse',
  }
})
</script>

<template>
  <TxBaseAnchor
    v-model="open"
    placement="bottom-start"
    :auto-resize="true"
    :min-width="220"
    :max-width="340"
    :max-height="320"
  >
    <template #reference>
      <TxButton @click="open = !open">
        {{ labels.trigger }}
      </TxButton>
    </template>

    <template #content>
      <TxCard shadow="soft" :radius="14" :padding="12">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div>{{ labels.content }}</div>
          <div v-if="expanded">
            BaseAnchor uses Floating UI + auto sizer. It keeps panel geometry stable when dynamic content is mounted.
          </div>
          <div>
            <TxButton size="sm" variant="ghost" @click="expanded = !expanded">
              {{ expanded ? labels.collapse : labels.details }}
            </TxButton>
          </div>
        </div>
      </TxCard>
    </template>
  </TxBaseAnchor>
</template>
