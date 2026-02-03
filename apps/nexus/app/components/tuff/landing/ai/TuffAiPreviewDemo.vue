<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CoreBoxMock from './CoreBoxMock.vue'
import type { PreviewScenario } from './types'

const props = withDefaults(defineProps<{
  active?: boolean
  autoPlay?: boolean
}>(), {
  active: false,
  autoPlay: true,
})

const { t } = useI18n()

const scenarios: PreviewScenario[] = [
  {
    input: '1 + 2 * 3',
    type: 'expression',
    result: '7',
    extra: '数学表达式',
    icon: 'i-carbon-calculator',
  },
  {
    input: '19 usd to cny',
    type: 'currency',
    result: '¥137.75',
    extra: '美元 → 人民币',
    icon: 'i-carbon-currency',
    details: {
      source: '19.0000 USD',
      target: '137.7500 CNY',
    },
  },
  {
    input: '2 days later',
    type: 'time',
    result: '2025-11-17',
    extra: '相对时间计算',
    icon: 'i-carbon-calendar',
  },
  {
    input: '12cm to inch',
    type: 'unit',
    result: '4.72 in',
    extra: '单位转换',
    icon: 'i-carbon-ruler',
    details: {
      meter: '0.12 m',
      feet: '0.3937 ft',
    },
  },
  {
    input: '#8B5CF6',
    type: 'color',
    result: '#8B5CF6',
    extra: 'RGB(139, 92, 246)',
    icon: 'i-carbon-color-palette',
    details: {
      rgb: 'rgb(139, 92, 246)',
      hsl: 'hsl(262, 90%, 66%)',
    },
  },
  {
    input: 'pi * 2',
    type: 'constant',
    result: '6.28319',
    extra: '数学常量',
    icon: 'i-carbon-function',
  },
  {
    input: 'sha256("hello")',
    type: 'hash',
    result: '2cf24d...b4c48',
    extra: 'SHA-256 哈希',
    icon: 'i-carbon-password',
  },
  {
    input: 'base64("Touch")',
    type: 'encode',
    result: 'VG91Y2g=',
    extra: 'Base64 编码',
    icon: 'i-carbon-code',
  },
]

const currentIndex = ref(0)
const currentScenario = computed(() => scenarios[currentIndex.value])
const showPreview = ref(false)
const previewListRef = ref<HTMLDivElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

const TIME_SCALE = 2
const ROTATION_INTERVAL = 3500 * TIME_SCALE
const SELECT_DELAY = 200 * TIME_SCALE
const RESUME_DELAY = 3000 * TIME_SCALE
const START_DELAY = 2500 * TIME_SCALE

let rotationTimer: ReturnType<typeof setInterval> | null = null

function startRotation() {
  if (!props.autoPlay || !props.active)
    return
  stopRotation()
  rotationTimer = setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % scenarios.length
  }, ROTATION_INTERVAL) // 增加时长，让用户有更多时间查看
}

function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = null
  }
}

function scrollActiveIntoView(behavior: ScrollBehavior = 'smooth') {
  if (typeof window === 'undefined')
    return
  const previewList = previewListRef.value
  if (previewList) {
    const activePreview = previewList.querySelector<HTMLElement>('.ai-preview-demo__preview-item.is-active')
    if (activePreview)
      activePreview.scrollIntoView({ behavior, inline: 'center', block: 'nearest' })
  }
  const list = listRef.value
  if (list) {
    const activeItem = list.querySelector<HTMLElement>('.ai-preview-demo__list-item.is-active')
    if (activeItem)
      activeItem.scrollIntoView({ behavior, inline: 'center', block: 'nearest' })
  }
}

function selectScenario(index: number) {
  stopRotation()
  setTimeout(() => {
    currentIndex.value = index
    // 选择后重新开始自动轮播
    if (props.autoPlay) {
      setTimeout(() => startRotation(), RESUME_DELAY)
    }
  }, SELECT_DELAY)
}

watch(() => props.active, (newVal) => {
  if (newVal) {
    currentIndex.value = 0
    showPreview.value = true
    if (props.autoPlay) {
      setTimeout(() => {
        startRotation()
      }, START_DELAY)
    }
  }
  else {
    stopRotation()
    showPreview.value = false
  }
}, { immediate: true })

watch(currentIndex, () => {
  nextTick(() => scrollActiveIntoView())
})

onMounted(() => {
  if (props.active) {
    showPreview.value = true
    if (props.autoPlay) {
      setTimeout(() => {
        startRotation()
      }, START_DELAY)
    }
  }
  scrollActiveIntoView('auto')
})

onBeforeUnmount(() => {
  stopRotation()
})

function resolveTypeLabel(type: PreviewScenario['type']) {
  return t(`landing.os.aiOverview.demo.preview.types.${type}`)
}
</script>

<template>
  <div class="ai-preview-demo">
    <div class="ai-preview-demo__layout">
      <div class="ai-preview-demo__main">
        <CoreBoxMock
          class="ai-preview-demo__corebox"
          :input-text="currentScenario.input"
          :show-results="false"
          :show-logo="true"
        >
          <div class="ai-preview-demo__panel">
            <div
              ref="previewListRef"
              class="ai-preview-demo__preview-list"
              :class="{ 'is-visible': showPreview }"
            >
              <button
                v-for="(scenario, index) in scenarios"
                :key="index"
                type="button"
                class="ai-preview-demo__preview-item"
                :class="{ 'is-active': currentIndex === index }"
                @click="selectScenario(index)"
              >
                <div
                  class="ai-preview-demo__card"
                  :class="`ai-preview-demo__card--${scenario.type}`"
                >
                  <div class="ai-preview-demo__card-header">
                    <div class="ai-preview-demo__card-type">
                      <span v-if="scenario.icon" :class="scenario.icon" class="mr-2" />
                      {{ resolveTypeLabel(scenario.type) }}
                    </div>
                    <div class="ai-preview-demo__card-badge">
                      instant.{{ scenario.type }}
                    </div>
                  </div>

                  <div class="ai-preview-demo__card-body">
                    <!-- 特殊处理颜色预览 -->
                    <template v-if="scenario.type === 'color'">
                      <div class="ai-preview-demo__color-preview">
                        <div
                          class="ai-preview-demo__color-swatch"
                          :style="{ backgroundColor: scenario.result }"
                        />
                        <div class="ai-preview-demo__color-value">
                          {{ scenario.result }}
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="ai-preview-demo__card-result">
                        {{ scenario.result }}
                      </div>
                    </template>
                    <div v-if="scenario.extra" class="ai-preview-demo__card-extra">
                      {{ scenario.extra }}
                    </div>
                  </div>

                  <div v-if="scenario.details" class="ai-preview-demo__card-details">
                    <div
                      v-for="(value, key) in scenario.details"
                      :key="key"
                      class="ai-preview-demo__card-detail-item"
                    >
                      <span class="ai-preview-demo__card-detail-label">{{ key.toUpperCase() }}</span>
                      <span class="ai-preview-demo__card-detail-value">{{ value }}</span>
                    </div>
                  </div>

                  <div class="ai-preview-demo__card-footer">
                    <button type="button" class="ai-preview-demo__card-action-btn">
                      <span class="i-carbon-copy" />
                      <span>{{ t('landing.os.aiOverview.demo.preview.copyResult') }}</span>
                    </button>
                    <div class="ai-preview-demo__card-powered">
                      TuffIntelligence
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </CoreBoxMock>
      </div>

      <!-- 下方：场景轮播 -->
      <div class="ai-preview-demo__carousel">
        <div class="ai-preview-demo__carousel-title">
          {{ t('landing.os.aiOverview.demo.preview.label') }}
        </div>
        <div ref="listRef" class="ai-preview-demo__list">
          <button
            v-for="(scenario, index) in scenarios"
            :key="index"
            type="button"
            class="ai-preview-demo__list-item"
            :class="{ 'is-active': currentIndex === index }"
            @click="selectScenario(index)"
          >
            <span v-if="scenario.icon" :class="scenario.icon" class="ai-preview-demo__list-icon" />
            <div class="ai-preview-demo__list-content">
              <div class="ai-preview-demo__list-input">
                {{ scenario.input }}
              </div>
              <div class="ai-preview-demo__list-extra">
                {{ scenario.extra }}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-preview-demo {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.ai-preview-demo__corebox {
  width: 100%;
  max-width: 760px;
}

.ai-preview-demo__corebox :deep(.corebox-mock__input) {
  background: rgba(255, 255, 255, 0.02);
}

.ai-preview-demo__corebox :deep(.corebox-mock__input-value) {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
}

.ai-preview-demo__panel {
  position: relative;
  padding: 1.25rem 0.5rem 1.25rem;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.02));
  overflow: hidden;
}

.ai-preview-demo__layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 980px;
}

.ai-preview-demo__main {
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: 0;
  overflow: visible;
}

/* 下方轮播 */
.ai-preview-demo__carousel {
  width: 100%;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ai-preview-demo__carousel-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 0.5rem;
}

.ai-preview-demo__list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 180px;
  gap: 0.75rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.25rem 1rem 0.75rem;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 1rem;
  overscroll-behavior-x: contain;
}

.ai-preview-demo__list::-webkit-scrollbar {
  height: 4px;
}

.ai-preview-demo__list::-webkit-scrollbar-track {
  background: transparent;
}

.ai-preview-demo__list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
}

.ai-preview-demo__list-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.65rem 0.75rem 0.7rem;
  background: rgba(15, 15, 20, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  scroll-snap-align: center;
}

.ai-preview-demo__list-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.12);
}

.ai-preview-demo__list-item.is-active {
  background: rgba(139, 92, 246, 0.16);
  border-color: rgba(139, 92, 246, 0.35);
  box-shadow: 0 6px 16px rgba(139, 92, 246, 0.25);
}

.ai-preview-demo__list-icon {
  font-size: 1.05rem;
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.ai-preview-demo__list-item.is-active .ai-preview-demo__list-icon {
  color: #fff;
}

.ai-preview-demo__list-content {
  width: 100%;
}

.ai-preview-demo__list-input {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-preview-demo__list-item.is-active .ai-preview-demo__list-input {
  color: #fff;
}

.ai-preview-demo__list-extra {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 0.125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 搜索框 */
.ai-preview-demo__input-area {
  width: 100%;
}

.ai-preview-demo__input-wrapper {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  background: rgba(30, 30, 35, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
}

.ai-preview-demo__input-icon {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 1.125rem;
}

.ai-preview-demo__input-text {
  flex: 1;
  color: rgba(255, 255, 255, 0.95);
  font-size: 1rem;
  line-height: 1.4;
  font-weight: 400;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

/* 预览卡片 */
.ai-preview-demo__card {
  width: 100%;
  padding: 1.25rem;
  background: rgba(30, 30, 35, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  backdrop-filter: blur(24px);
  position: relative;
  overflow: hidden;
  box-shadow: 0 16px 32px -8px rgba(0, 0, 0, 0.4);
  backface-visibility: hidden;
}

.ai-preview-demo__card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.35), rgba(59, 130, 246, 0.3), rgba(6, 182, 212, 0.15));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.ai-preview-demo__card::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at center, rgba(139, 92, 246, 0.06), transparent 60%);
  pointer-events: none;
  z-index: 0;
}

.ai-preview-demo__card > * {
  position: relative;
  z-index: 1;
}

.ai-preview-demo__card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.ai-preview-demo__card-type {
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-preview-demo__card-badge {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.35);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.ai-preview-demo__card-body {
  margin-bottom: 1.25rem;
}

.ai-preview-demo__card-result {
  font-size: 2.25rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.1;
  margin-bottom: 0.5rem;
  letter-spacing: -0.02em;
}

.ai-preview-demo__card-extra {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

/* 颜色预览特殊样式 */
.ai-preview-demo__color-preview {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.ai-preview-demo__color-swatch {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.ai-preview-demo__color-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #fff;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.ai-preview-demo__card-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ai-preview-demo__card-detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.ai-preview-demo__card-detail-label {
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

.ai-preview-demo__card-detail-value {
  color: rgba(255, 255, 255, 0.85);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.ai-preview-demo__card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ai-preview-demo__card-action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-preview-demo__card-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.ai-preview-demo__card-powered {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.25);
  font-weight: 500;
}

/* 预览横向卡片 */
.ai-preview-demo__preview-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(520px, 1fr);
  gap: 1.5rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.5rem 1rem 0.75rem;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 1rem;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.ai-preview-demo__preview-list.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.ai-preview-demo__preview-list::-webkit-scrollbar {
  height: 0;
}

.ai-preview-demo__preview-item {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  scroll-snap-align: center;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.ai-preview-demo__preview-item.is-active {
  transform: translateY(-2px);
}

.ai-preview-demo__preview-item:not(.is-active) .ai-preview-demo__card {
  opacity: 0.7;
  box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.4);
}

@media (max-width: 960px) {
  .ai-preview-demo__preview-list {
    grid-auto-columns: minmax(460px, 1fr);
  }
}

@media (max-width: 720px) {
  .ai-preview-demo__preview-list {
    grid-auto-columns: minmax(320px, 1fr);
  }
}
</style>
