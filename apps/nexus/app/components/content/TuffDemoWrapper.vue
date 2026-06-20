<script setup lang="ts">
import { type ComponentPublicInstance, computed, nextTick, ref } from 'vue'

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

const { t } = useI18n()

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
const wrapperRef = ref<HTMLElement | null>(null)
const isDemoActive = ref(false)
const demoInstanceRef = ref<DemoResetController | null>(null)
const isResetting = ref(false)

const toggleLabel = computed(() => {
  if (showCode.value)
    return t('docs.demo.hideCode')
  return t('docs.demo.showCode')
})

const resetLabel = computed(() => t('docs.demo.reset'))
const runLabel = computed(() => t('docs.demo.run'))
const inactiveLabel = computed(() => t('docs.demo.paused'))
const loadingLabel = computed(() => t('docs.demo.loading'))
const errorLabel = computed(() => t('docs.demo.loadFailed'))
const notFoundLabel = computed(() => t('docs.demo.notFound'))

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
  if (isResetting.value || !isDemoActive.value)
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

function handleDemoInstanceChange(instance: DemoResetController | null) {
  demoInstanceRef.value = instance
}

function activateDemo() {
  if (!props.demo || isDemoActive.value)
    return

  isDemoActive.value = true
}

</script>

<template>
  <section ref="wrapperRef" class="tuff-demo">
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
          <button
            type="button"
            class="tuff-demo__reset-btn"
            :aria-label="resetLabel"
            :disabled="isResetting || !isDemoActive"
            @click="resetDemo"
          >
            <span class="tuff-demo__reset-icon i-carbon-renew" aria-hidden="true" />
            {{ resetLabel }}
          </button>
        </div>
      </div>
      <div class="tuff-demo__window-body">
        <div class="tuff-demo__preview">
          <ClientOnly>
            <LazyTuffDemoClientRenderer
              v-if="isDemoActive"
              :demo="props.demo"
              :is-active="isDemoActive"
              :render-key="demoRenderKey"
              :inactive-label="inactiveLabel"
              :loading-label="loadingLabel"
              :error-label="errorLabel"
              :not-found-label="notFoundLabel"
              @instance-change="handleDemoInstanceChange"
            />
            <div v-else class="tuff-demo__placeholder tuff-demo__placeholder--manual">
              <span class="tuff-demo__placeholder-text">{{ inactiveLabel }}</span>
              <button type="button" class="tuff-demo__run-btn" @click="activateDemo">
                <span class="tuff-demo__run-icon i-carbon-play" aria-hidden="true" />
                {{ runLabel }}
              </button>
            </div>
            <template #fallback>
              <div class="tuff-demo__placeholder">
                {{ inactiveLabel }}
              </div>
            </template>
          </ClientOnly>
        </div>
        <div v-if="hasCode" class="tuff-demo__code" :class="{ 'is-open': showCode }">
          <div class="tuff-demo__code-body">
            <div class="tuff-demo__code-body-inner">
              <LazyTuffCodeBlock
                v-if="showCode"
                embedded
                :lang="props.codeLang"
                :code="resolvedCode"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-if="hasCode" class="tuff-demo__toggle-row">
        <button type="button" class="tuff-demo__toggle-btn" :aria-expanded="showCode" @click="toggleCode">
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 7px 10px;
  transition: background-color 0.16s ease, color 0.16s ease, opacity 0.16s ease;
}

.tuff-demo__reset-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
  color: var(--tx-color-primary);
}

.tuff-demo__reset-btn:disabled {
  cursor: default;
  opacity: 0.45;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 96px;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
  text-align: center;
  padding: 18px 0;
}

.tuff-demo__placeholder-text {
  line-height: 1.5;
}

.tuff-demo__run-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 32%, var(--tx-border-color));
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-primary) 8%, transparent);
  color: var(--tx-color-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  padding: 8px 14px;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.tuff-demo__run-btn:hover {
  border-color: color-mix(in srgb, var(--tx-color-primary) 56%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
  transform: translateY(-1px);
}

.tuff-demo__run-icon {
  font-size: 12px;
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

.tuff-demo__toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 8px 12px;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.tuff-demo__toggle-btn:hover {
  background: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
  color: var(--tx-color-primary);
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
