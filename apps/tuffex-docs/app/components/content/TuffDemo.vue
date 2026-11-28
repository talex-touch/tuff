<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'
import TuffCodeBlock from './TuffCodeBlock.vue'

interface DemoProps {
  title?: string
  description?: string
  codeLabel?: string
  code?: string
  codeHtml?: string
  codeLines?: string[]
  codeLang?: string
}

const props = defineProps<DemoProps>()
const slots = useSlots()
const { locale } = useI18n()

const hasPreview = computed(() => Boolean(slots.preview || slots.default))
const htmlEntityMap: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': '\'',
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(lt|gt|amp|quot|#39);/g, match => htmlEntityMap[match] ?? match)
}

const resolvedCode = computed(() => {
  if (props.code)
    return decodeHtmlEntities(props.code)
  if (props.codeLines?.length)
    return props.codeLines.map(decodeHtmlEntities).join('\n')
  return ''
})
const hasCode = computed(() => Boolean(resolvedCode.value || props.codeHtml || slots.code))
const codeLabel = computed(() => props.codeLabel || '')
const codeLang = computed(() => props.codeLang || 'vue')
const showCode = ref(false)

const toggleLabel = computed(() => {
  if (showCode.value)
    return locale.value === 'zh' ? '隐藏代码' : 'Hide code'
  return locale.value === 'zh' ? '展开代码' : 'Show code'
})
</script>

<template>
  <section class="tuff-demo">
    <header v-if="props.title || props.description" class="tuff-demo__header">
      <h3 v-if="props.title" class="tuff-demo__title">
        {{ props.title }}
      </h3>
      <p v-if="props.description" class="tuff-demo__desc">
        {{ props.description }}
      </p>
    </header>
    <div class="tuff-demo__window">
      <div class="tuff-demo__window-bar not-prose">
        <div class="tuff-demo__dots" aria-hidden="true">
          <span class="tuff-demo__dot is-red" />
          <span class="tuff-demo__dot is-yellow" />
          <span class="tuff-demo__dot is-green" />
        </div>
      </div>
      <div class="tuff-demo__preview">
        <slot name="preview">
          <slot />
        </slot>
        <div v-if="!hasPreview" class="tuff-demo__placeholder">
          Add a preview slot to render the demo.
        </div>
      </div>
      <div v-if="hasCode && showCode" class="tuff-demo__code">
        <slot name="code">
          <TuffCodeBlock
            v-if="resolvedCode || props.codeHtml"
            embedded
            :lang="codeLang"
            :title="codeLabel"
            :code="resolvedCode"
            :code-html="props.codeHtml"
          />
        </slot>
      </div>
      <div v-if="hasCode" class="tuff-demo__toggle-row not-prose">
        <button type="button" class="tuff-demo__toggle-btn" :aria-expanded="showCode" @click="showCode = !showCode">
          <span class="tuff-demo__toggle-icon i-carbon-chevron-down" :class="{ 'is-open': showCode }" aria-hidden="true" />
          <span>{{ toggleLabel }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tuff-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
}

.tuff-demo__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tuff-demo__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--docs-ink);
}

.tuff-demo__desc {
  margin: 0;
  font-size: 13.5px;
  color: var(--docs-muted);
}

.tuff-demo__window {
  border-radius: 20px;
  border: 1px solid var(--docs-border-light);
  background: var(--docs-surface);
  overflow: hidden;
}

.tuff-demo__window-bar {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--docs-border-light);
  background: var(--docs-surface-subtle);
}

.tuff-demo__dots {
  display: inline-flex;
  gap: 6px;
}

.tuff-demo__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.tuff-demo__dot.is-red { background: var(--tx-color-danger, #f56c6c); }
.tuff-demo__dot.is-yellow { background: var(--tx-color-warning, #e6a23c); }
.tuff-demo__dot.is-green { background: var(--tx-color-success, #67c23a); }

.tuff-demo__preview {
  padding: 24px;
}

.tuff-demo__placeholder {
  text-align: center;
  font-size: 13px;
  color: var(--docs-muted);
}

.tuff-demo__code {
  border-top: 1px solid var(--docs-border-light);
  background: var(--docs-code-bg);
}

.tuff-demo__toggle-row {
  display: flex;
  justify-content: center;
  padding: 12px 16px;
  border-top: 1px solid var(--docs-border-light);
}

.tuff-demo__toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--docs-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tuff-demo__toggle-btn:hover {
  color: var(--docs-accent);
}

.tuff-demo__toggle-icon.is-open {
  transform: rotate(180deg);
}
</style>
