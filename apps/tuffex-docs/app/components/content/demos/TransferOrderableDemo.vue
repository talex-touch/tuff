<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const selected = ref<Array<string | number>>(['gpt-1', 'gpt-3', 'gpt-2'])

const items = computed(() => {
  const zh = locale.value === 'zh'
  return [
    { key: 'gpt-1', label: zh ? '主模型 · 高质量' : 'Primary · high quality' },
    { key: 'gpt-2', label: zh ? '备用模型 · 均衡' : 'Fallback · balanced' },
    { key: 'gpt-3', label: zh ? '快速模型 · 低延迟' : 'Fast · low latency' },
    { key: 'gpt-4', label: zh ? '长上下文模型' : 'Long context' },
    { key: 'gpt-5', label: zh ? '视觉模型' : 'Vision' },
    { key: 'gpt-6', label: zh ? '嵌入模型' : 'Embedding' },
    { key: 'gpt-7', label: zh ? '重排模型' : 'Rerank' },
    { key: 'gpt-8', label: zh ? '语音识别模型' : 'Speech to text' },
    { key: 'gpt-9', label: zh ? '语音合成模型' : 'Text to speech' },
    { key: 'gpt-10', label: zh ? '本地小模型' : 'Local small model' },
    { key: 'gpt-11', label: zh ? '代码模型' : 'Code' },
    { key: 'gpt-12', label: zh ? '推理模型' : 'Reasoning' },
  ]
})

const titles = computed<[string, string]>(() => {
  if (locale.value === 'zh')
    return ['可用模型', '调用顺序']
  return ['Available models', 'Call order']
})

const emptyText = computed<[string, string]>(() => {
  if (locale.value === 'zh')
    return ['没有更多模型', '还没有排序，先加一个模型']
  return ['No more models', 'Nothing ranked yet — add a model first']
})

const filterPlaceholder = computed(() => (locale.value === 'zh' ? '搜索模型' : 'Search models'))
const addAriaLabel = computed(() => (locale.value === 'zh' ? '加入调用顺序' : 'Add to call order'))
const removeAriaLabel = computed(() => (locale.value === 'zh' ? '移出调用顺序' : 'Remove from call order'))
const moveUpAriaLabel = computed(() => (locale.value === 'zh' ? '上移一位' : 'Move up'))
const moveDownAriaLabel = computed(() => (locale.value === 'zh' ? '下移一位' : 'Move down'))
</script>

<template>
  <div class="transfer-orderable-demo">
    <TxTransfer
      v-model="selected"
      :data="items"
      :titles="titles"
      :empty-text="emptyText"
      :filter-placeholder="filterPlaceholder"
      :add-aria-label="addAriaLabel"
      :remove-aria-label="removeAriaLabel"
      :move-up-aria-label="moveUpAriaLabel"
      :move-down-aria-label="moveDownAriaLabel"
      :max-height="260"
      filterable
      orderable
      target-order="push"
    />
  </div>
</template>

<style scoped>
.transfer-orderable-demo {
  width: min(100%, 680px);
}
</style>
