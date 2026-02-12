<script setup lang="ts">
import { type Component, type ComponentPublicInstance, computed, defineAsyncComponent, nextTick, ref } from 'vue'

interface DemoWrapperProps {
  demo: string
  code?: string
  codeLang?: string
  title?: string
  description?: string
}

type DemoResetMethod = () => void | Promise<void>

type DemoResetController = ComponentPublicInstance & {
  replayDemo?: DemoResetMethod
  resetDemo?: DemoResetMethod
  replay?: DemoResetMethod
  reset?: DemoResetMethod
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
const demoRenderKey = ref(0)
const demoInstanceRef = ref<DemoResetController | null>(null)
const isResetting = ref(false)

const toggleLabel = computed(() => {
  if (showCode.value)
    return locale.value === 'zh' ? '隐藏代码' : 'Hide code'
  return locale.value === 'zh' ? '展开代码' : 'Show code'
})

const resetLabel = computed(() => (locale.value === 'zh' ? '重置' : 'Reset'))

function toggleCode() {
  showCode.value = !showCode.value
}

async function hardResetDemo() {
  demoRenderKey.value += 1
  await nextTick()
}

async function tryInvokeDemoReset() {
  const instance = demoInstanceRef.value
  if (!instance)
    return false

  const resetHandler = instance.resetDemo ?? instance.replayDemo ?? instance.reset ?? instance.replay
  if (!resetHandler)
    return false

  await resetHandler.call(instance)
  return true
}

async function resetDemo() {
  if (isResetting.value)
    return

  isResetting.value = true
  try {
    const handled = await tryInvokeDemoReset()
    if (!handled)
      await hardResetDemo()
  }
  catch {
    await hardResetDemo()
  }
  finally {
    isResetting.value = false
  }
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
          <div class="tuff-demo__window-actions">
            <TxButton
              variant="ghost"
              size="small"
              native-type="button"
              class="tuff-demo__reset-btn"
              :aria-label="resetLabel"
              :disabled="isResetting"
              @click="resetDemo"
            >
              <span class="tuff-demo__reset-icon i-carbon-renew" aria-hidden="true" />
              {{ resetLabel }}
            </TxButton>
          </div>
        </div>
        <div class="tuff-demo__window-body">
          <div class="tuff-demo__preview">
            <component :is="demoComponent" v-if="demoComponent" :key="demoRenderKey" ref="demoInstanceRef" />
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
          <TxButton variant="ghost" size="small" native-type="button" :aria-expanded="showCode" @click="toggleCode">
            <span class="tuff-demo__toggle-icon i-carbon-chevron-down" :class="{ 'is-open': showCode }" />
            {{ toggleLabel }}
          </TxButton>
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
  --tuff-demo-window-bg: var(--tx-bg-color);
  --tuff-demo-window-border: var(--tx-border-color-light);
  /* --tuff-demo-window-shadow: var(--tx-box-shadow); */
  --tuff-demo-divider: var(--tx-border-color-lighter);
  --tuff-demo-bar-bg-start: var(--tx-bg-color);
  --tuff-demo-bar-bg-end: var(--tx-fill-color-light);
  --tuff-demo-preview-bg: var(--tx-bg-color);
  --tuff-demo-row-bg: var(--tx-bg-color);
  --tuff-demo-code-bg-start: var(--tx-fill-color);
  --tuff-demo-code-bg-end: var(--tx-fill-color-light);
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
  color: var(--tx-text-color-secondary);
  margin: 0;
}

.tuff-demo__window {
  border-radius: 26px;
  border: 1px solid var(--tuff-demo-window-border);
  background: var(--tuff-demo-window-bg);
  box-shadow: var(--tuff-demo-window-shadow);
  overflow: hidden;
}

.tuff-demo__window-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--tuff-demo-divider);
  background: linear-gradient(90deg, var(--tuff-demo-bar-bg-start), var(--tuff-demo-bar-bg-end));
}

.tuff-demo__window-actions {
  display: inline-flex;
  align-items: center;
}

.tuff-demo__reset-btn {
  gap: 6px;
}

.tuff-demo__reset-icon {
  font-size: 12px;
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
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
}

.tuff-demo__dot.is-red {
  background: var(--tx-color-danger);
}

.tuff-demo__dot.is-yellow {
  background: var(--tx-color-warning);
}

.tuff-demo__dot.is-green {
  background: var(--tx-color-success);
}

.tuff-demo__window-body {
  display: flex;
  flex-direction: column;
}

.tuff-demo__preview {
  padding: 28px;
  background: var(--tuff-demo-preview-bg);
}

.tuff-demo__placeholder {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
  text-align: center;
  padding: 12px 0;
}

.tuff-demo__code {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  color: var(--tx-text-color-primary);
  align-items: stretch;
  width: 100%;
}

.tuff-demo__toggle-row {
  display: flex;
  justify-content: center;
  padding: 16px 18px 20px;
  border-top: 1px solid var(--tuff-demo-divider);
  background: var(--tuff-demo-row-bg);
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
  border-top: 1px solid var(--tuff-demo-divider);
  background: linear-gradient(180deg, var(--tuff-demo-code-bg-start), var(--tuff-demo-code-bg-end));
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
</style>
