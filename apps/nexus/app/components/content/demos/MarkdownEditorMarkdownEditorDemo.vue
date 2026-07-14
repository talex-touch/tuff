<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const content = ref('## Release note\n\n- API reviewed\n- Demos verified\n- Follow-up checklist updated')

const labels = computed(() => (locale.value === 'zh'
  ? {
      placeholder: '输入 Markdown 内容...',
      help: 'Source 模式适合保留原始 Markdown，Preview 模式适合审阅渲染结果。',
    }
  : {
      placeholder: 'Type Markdown content...',
      help: 'Use Source to preserve Markdown and Preview to review rendered output.',
    }))
</script>

<template>
  <div class="grid gap-2">
    <TxMarkdownEditor
      v-model="content"
      default-mode="source"
      :placeholder="labels.placeholder"
      :toolbar-actions="['heading', 'bold', 'italic', 'bulletList', 'orderedList', 'link']"
      :min-height="220"
    />
    <span class="text-sm text-[var(--tx-text-color-secondary)]">{{ labels.help }}</span>
  </div>
</template>
