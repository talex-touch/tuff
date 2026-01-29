<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'

interface DemoProps {
  title?: string
  description?: string
  codeLabel?: string
  code?: string
  codeLines?: string[]
  codeLang?: string
}

const props = defineProps<DemoProps>()
const slots = useSlots()
const hasPreview = computed(() => Boolean(slots.preview || slots.default))
const { locale } = useI18n()
const htmlEntityMap: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': '\'',
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(lt|gt|amp|quot|#39);/g, (match) => htmlEntityMap[match] ?? match)
}

const resolvedCode = computed(() => {
  if (props.code)
    return decodeHtmlEntities(props.code)
  if (props.codeLines?.length)
    return props.codeLines.map(decodeHtmlEntities).join('\n')
  return ''
})
const hasCode = computed(() => Boolean(resolvedCode.value || slots.code))
const codeLabel = computed(() => props.codeLabel || '')
const codeLang = computed(() => props.codeLang || 'vue')
const showCode = ref(false)
const toggleLabel = computed(() => {
  if (showCode.value)
    return locale.value === 'zh' ? '隐藏代码' : 'Hide code'
  return locale.value === 'zh' ? '展开代码' : 'Show code'
})

function toggleCode() {
  showCode.value = !showCode.value
}
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
      <div class="tuff-demo__window-bar">
        <div class="tuff-demo__dots" aria-hidden="true">
          <span class="tuff-demo__dot is-red" />
          <span class="tuff-demo__dot is-yellow" />
          <span class="tuff-demo__dot is-green" />
        </div>
      </div>
      <div class="tuff-demo__window-body">
        <div class="tuff-demo__preview">
          <ClientOnly>
            <slot name="preview">
              <slot />
            </slot>
            <template #fallback>
              <div class="tuff-demo__placeholder">
                Demo loads on client.
              </div>
            </template>
          </ClientOnly>
          <div v-if="!hasPreview" class="tuff-demo__placeholder">
            Add a preview slot to render the demo.
          </div>
        </div>
        <div v-if="hasCode" class="tuff-demo__code" :class="{ 'is-open': showCode }">
          <div class="tuff-demo__code-body">
            <div class="tuff-demo__code-body-inner">
              <slot name="code">
                <TuffCodeBlock
                  v-if="resolvedCode"
                  embedded
                  :lang="codeLang"
                  :title="codeLabel"
                  :code="resolvedCode"
                />
              </slot>
            </div>
          </div>
        </div>
      </div>
      <div v-if="hasCode" class="tuff-demo__toggle-row">
        <button
          type="button"
          class="tuff-demo__toggle"
          :aria-expanded="showCode"
          @click="toggleCode"
        >
          <span class="tuff-demo__toggle-icon i-carbon-chevron-down" :class="{ 'is-open': showCode }" />
          {{ toggleLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tuff-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.tuff-demo__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0;
}

.tuff-demo__title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.tuff-demo__desc {
  font-size: 14px;
  color: var(--docs-muted);
  margin: 0;
}

.tuff-demo__window {
  border-radius: 26px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.tuff-demo__window-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.9));
}

.tuff-demo__dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tuff-demo__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12);
}

.tuff-demo__dot.is-red {
  background: #ff5f57;
}

.tuff-demo__dot.is-yellow {
  background: #febc2e;
}

.tuff-demo__dot.is-green {
  background: #28c840;
}

.tuff-demo__window-body {
  display: flex;
  flex-direction: column;
}

.tuff-demo__preview {
  padding: 28px;
  background: rgba(255, 255, 255, 0.98);
}

.tuff-demo__placeholder {
  font-size: 13px;
  color: var(--docs-muted);
  text-align: center;
  padding: 12px 0;
}

.tuff-demo__code {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  align-items: stretch;
  width: 100%;
}

.tuff-demo__toggle-row {
  display: flex;
  justify-content: center;
  padding: 16px 18px 20px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  background: rgba(255, 255, 255, 0.98);
}

.tuff-demo__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.45);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(14, 165, 233, 0.2));
  color: rgba(30, 64, 175, 0.95);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.18);
  transition: all 0.2s ease;
}

.tuff-demo__toggle:hover {
  border-color: rgba(37, 99, 235, 0.75);
  color: rgba(30, 58, 138, 0.98);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(14, 165, 233, 0.28));
  box-shadow: 0 12px 26px rgba(59, 130, 246, 0.25);
  transform: translateY(-1px);
}

.tuff-demo__toggle:active {
  transform: translateY(0);
  box-shadow: 0 6px 12px rgba(59, 130, 246, 0.2);
}

.tuff-demo__toggle:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.5);
  outline-offset: 2px;
}

.tuff-demo__toggle-icon {
  font-size: 12px;
  transition: transform 0.2s ease;
}

.tuff-demo__toggle-icon.is-open {
  transform: rotate(180deg);
}

.tuff-demo__code-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.25s ease, opacity 0.25s ease;
  width: 100%;
}

.tuff-demo__code.is-open .tuff-demo__code-body {
  grid-template-rows: 1fr;
  opacity: 1;
}

.tuff-demo__code-body-inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, rgba(12, 14, 18, 0.98), rgba(6, 8, 12, 0.98));
}

.tuff-demo__code:not(.is-open) .tuff-demo__code-body-inner {
  border-top-color: transparent;
}

:global(.dark .tuff-demo),
:global([data-theme='dark'] .tuff-demo) {
  background: transparent;
  box-shadow: none;
}

:global(.dark .tuff-demo__preview),
:global([data-theme='dark'] .tuff-demo__preview) {
  background: rgba(15, 23, 42, 0.65);
}

:global(.dark .tuff-demo__toggle-row),
:global([data-theme='dark'] .tuff-demo__toggle-row) {
  border-top-color: rgba(148, 163, 184, 0.15);
  background: rgba(15, 23, 42, 0.6);
}

:global(.dark .tuff-demo__code),
:global([data-theme='dark'] .tuff-demo__code) {
  color: rgba(255, 255, 255, 0.92);
}

:global(.dark .tuff-demo__toggle),
:global([data-theme='dark'] .tuff-demo__toggle) {
  background: rgba(15, 23, 42, 0.75);
  border-color: rgba(148, 163, 184, 0.4);
  color: rgba(226, 232, 240, 0.8);
}

:slotted(.tuff-demo-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

:slotted(.tuff-demo-pill) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--docs-border);
  font-size: 12px;
  color: var(--docs-ink);
  background: rgba(255, 255, 255, 0.75);
}

:slotted(.tuff-demo-btn) {
  border-radius: 999px;
  padding: 8px 16px;
  border: 1px solid var(--docs-border);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(220, 220, 230, 0.65));
  color: var(--docs-ink);
  font-size: 13px;
}

:slotted(.tuff-demo-btn.is-flat) {
  background: transparent;
  border-style: dashed;
}

:slotted(.tuff-demo-avatar) {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--docs-ink);
  border: 1px solid var(--docs-border);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(220, 220, 230, 0.6));
}

:slotted(.tuff-demo-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
  gap: 10px;
  width: 100%;
}

:slotted(.tuff-demo-grid-item) {
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--docs-border);
  background: rgba(255, 255, 255, 0.7);
}
::global(.dark .tuff-demo__toggle),
::global([data-theme='dark'] .tuff-demo__toggle) {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(2, 132, 199, 0.3));
  border-color: rgba(125, 211, 252, 0.4);
  color: rgba(226, 232, 240, 0.92);
  box-shadow: 0 10px 22px rgba(14, 165, 233, 0.25);
}

::global(.dark .tuff-demo__toggle:hover),
::global([data-theme='dark'] .tuff-demo__toggle:hover) {
  border-color: rgba(186, 230, 253, 0.7);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.3), rgba(2, 132, 199, 0.42));
  color: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 30px rgba(14, 165, 233, 0.35);
}

:global(.dark .tuff-demo__window),
:global([data-theme='dark'] .tuff-demo__window) {
  border-color: rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.75);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
}

:global(.dark .tuff-demo__window-bar),
:global([data-theme='dark'] .tuff-demo__window-bar) {
  border-bottom-color: rgba(148, 163, 184, 0.15);
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.7));
}

:global(.dark .tuff-demo__code-body-inner),
:global([data-theme='dark'] .tuff-demo__code-body-inner) {
  border-top-color: rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(8, 10, 16, 0.98), rgba(6, 8, 12, 0.98));
}
</style>
