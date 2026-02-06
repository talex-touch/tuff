<script setup lang="ts">
import { type Component, computed, defineAsyncComponent, ref } from 'vue'

interface DemoWrapperProps {
  demo: string
  code?: string
  codeLang?: string
  title?: string
  description?: string
}

const props = withDefaults(defineProps<DemoWrapperProps>(), {
  code: '',
  codeLang: 'vue',
  title: '',
  description: '',
})

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
  return ''
})

const hasCode = computed(() => Boolean(resolvedCode.value))
const showCode = ref(false)

const toggleLabel = computed(() => {
  if (showCode.value)
    return locale.value === 'zh' ? '隐藏代码' : 'Hide code'
  return locale.value === 'zh' ? '展开代码' : 'Show code'
})

function toggleCode() {
  showCode.value = !showCode.value
}

const demoModules = import.meta.glob<{ default: Component }>('./demos/*.vue')
const demoComponentMap: Record<string, Component> = {}
for (const [path, loader] of Object.entries(demoModules)) {
  const name = path.match(/\.\/demos\/(.+)\.vue$/)?.[1]
  if (name)
    demoComponentMap[name] = defineAsyncComponent(loader as any)
}

const demoComponent = computed(() => {
  if (!props.demo)
    return null
  return demoComponentMap[props.demo] ?? null
})
</script>

<template>
  <ClientOnly>
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
            <component :is="demoComponent" v-if="demoComponent" />
            <div v-else class="tuff-demo__placeholder">
              Demo component "{{ props.demo }}" not found.
            </div>
          </div>
          <div v-if="hasCode" class="tuff-demo__code" :class="{ 'is-open': showCode }">
            <div class="tuff-demo__code-body">
              <div class="tuff-demo__code-body-inner">
                <TuffCodeBlock
                  embedded
                  :lang="props.codeLang"
                  :code="resolvedCode"
                />
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
    <template #fallback>
      <div class="tuff-demo__placeholder">
        Demo loads on client.
      </div>
    </template>
  </ClientOnly>
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
  display: flex;
  flex-direction: column;
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
  flex: 1;
  min-height: 0;
}

.tuff-demo__preview {
  flex: 0 0 auto;
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
  flex: 1;
  min-height: 0;
}

.tuff-demo__toggle-row {
  display: flex;
  justify-content: center;
  padding: 16px 18px 20px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  background: rgba(255, 255, 255, 0.98);
  position: sticky;
  bottom: 0;
  z-index: 1;
}

.tuff-demo__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.24);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.03));
  color: rgba(15, 23, 42, 0.86);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
  transition: all 0.2s ease;
}

.tuff-demo__toggle:hover {
  border-color: rgba(15, 23, 42, 0.38);
  color: rgba(15, 23, 42, 0.95);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.12), rgba(15, 23, 42, 0.04));
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.18);
  transform: translateY(-1px);
}

.tuff-demo__toggle:active {
  transform: translateY(0);
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.12);
}

.tuff-demo__toggle:focus-visible {
  outline: 2px solid rgba(15, 23, 42, 0.35);
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
  max-height: 360px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, rgba(12, 14, 18, 0.98), rgba(6, 8, 12, 0.98));
}

.tuff-demo__code:not(.is-open) .tuff-demo__code-body-inner {
  border-top-color: transparent;
}

:deep(.tuff-demo-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

:global(.dark .tuff-demo),
:global([data-theme='dark'] .tuff-demo) {
  background: transparent;
  box-shadow: none;
}

:global(.dark .tuff-demo__preview),
:global([data-theme='dark'] .tuff-demo__preview) {
  background: rgba(22, 19, 17, 0.68);
}

:global(.dark .tuff-demo__toggle-row),
:global([data-theme='dark'] .tuff-demo__toggle-row) {
  border-top-color: rgba(214, 198, 184, 0.18);
  background: rgba(22, 19, 17, 0.62);
}

:global(.dark .tuff-demo__code),
:global([data-theme='dark'] .tuff-demo__code) {
  color: rgba(255, 255, 255, 0.92);
}

:global(.dark .tuff-demo__toggle),
:global([data-theme='dark'] .tuff-demo__toggle) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  border-color: rgba(226, 232, 240, 0.22);
  color: rgba(245, 239, 231, 0.92);
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.45);
}

:global(.dark .tuff-demo__toggle:hover),
:global([data-theme='dark'] .tuff-demo__toggle:hover) {
  border-color: rgba(245, 239, 231, 0.45);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.06));
  color: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 30px rgba(2, 6, 23, 0.55);
}

:global(.dark .tuff-demo__window),
:global([data-theme='dark'] .tuff-demo__window) {
  border-color: rgba(214, 198, 184, 0.22);
  background: rgba(20, 17, 15, 0.82);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
}

:global(.dark .tuff-demo__window-bar),
:global([data-theme='dark'] .tuff-demo__window-bar) {
  border-bottom-color: rgba(214, 198, 184, 0.18);
  background: linear-gradient(90deg, rgba(24, 20, 18, 0.92), rgba(18, 15, 13, 0.85));
}

:global(.dark .tuff-demo__code-body-inner),
:global([data-theme='dark'] .tuff-demo__code-body-inner) {
  border-top-color: rgba(214, 198, 184, 0.18);
  background: linear-gradient(180deg, rgba(18, 16, 14, 0.98), rgba(14, 12, 10, 0.98));
}
</style>
