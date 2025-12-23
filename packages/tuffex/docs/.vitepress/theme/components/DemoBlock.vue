<script setup lang="ts">
/**
 * DemoBlock 组件
 * 
 * 用于在文档中展示组件的实时预览效果
 */
import { computed, ref, useSlots } from 'vue'

const props = defineProps<{
  title?: string
  code?: string
  codeLang?: string
}>()

const slots = useSlots()

const showCode = ref(false)

function toText(nodes: any): string {
  if (!nodes)
    return ''
  if (typeof nodes === 'string')
    return nodes
  if (Array.isArray(nodes))
    return nodes.map(toText).join('')
  if (typeof nodes === 'object') {
    const children = (nodes as any).children
    if (typeof children === 'string')
      return children
    return toText(children)
  }
  return ''
}

function decodeEntities(input: string): string {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

const codeContent = computed(() => {
  if (typeof props.code === 'string' && props.code.trim()) {
    const raw = props.code.trim()
    if (raw.includes('```'))
      return raw
    return `\n\n\`\`\`${props.codeLang || 'vue'}\n${raw}\n\`\`\`\n`
  }
  const vnodes = slots.code?.() ?? []
  const decoded = decodeEntities(toText(vnodes).trim())
  if (decoded) {
    if (decoded.includes('```'))
      return decoded
    return `\n\n\`\`\`${props.codeLang || 'vue'}\n${decoded}\n\`\`\`\n`
  }
  return ''
})

function toggleCode() {
  showCode.value = !showCode.value
}
</script>

<template>
  <div class="demo-block">
    <div v-if="title" class="demo-block__title">{{ title }}</div>
    <div class="demo-block__preview">
      <slot name="preview" />
    </div>
    <div class="demo-block__actions">
      <button class="demo-block__toggle" @click="toggleCode">
        <span v-if="showCode">隐藏代码</span>
        <span v-else>查看代码</span>
      </button>
    </div>
    <div v-show="showCode" class="demo-block__code">
      <TxMarkdownView v-if="codeContent" :content="codeContent" />
      <slot v-else name="code" />
    </div>
  </div>
</template>

<style lang="scss">
.demo-block {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg);

  &__title {
    padding: 12px 16px;
    font-weight: 600;
    font-size: 14px;
    color: var(--vp-c-text-1);
    border-bottom: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
  }

  &__preview {
    padding: 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  &__actions {
    padding: 8px 16px;
    border-top: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
  }

  &__toggle {
    padding: 4px 12px;
    font-size: 12px;
    color: var(--vp-c-brand-1);
    background: transparent;
    border: 1px solid var(--vp-c-brand-1);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: var(--vp-c-brand-soft);
    }
  }

  &__code {
    border-top: 1px solid var(--vp-c-divider);

    pre {
      margin: 0 !important;
      border-radius: 0 !important;
    }
  }
}
</style>
