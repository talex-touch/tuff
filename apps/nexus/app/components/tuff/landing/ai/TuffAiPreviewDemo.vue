<script setup lang="ts">
import gsap from 'gsap'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Logo from '../../../icon/Logo.vue'
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
const currentScenario = computed(() => scenarios[currentIndex.value]!)
const showPreview = ref(false)
const trackRef = ref<HTMLDivElement | null>(null)
const cardRefs = ref<HTMLDivElement[]>([])

const ROTATION_INTERVAL = 5000
const RESUME_DELAY = 4000
const START_DELAY = 1500

let rotationTimer: ReturnType<typeof setInterval> | null = null

function startRotation() {
  if (!props.autoPlay || !props.active)
    return
  stopRotation()
  rotationTimer = setInterval(() => {
    goToIndex((currentIndex.value + 1) % scenarios.length)
  }, ROTATION_INTERVAL)
}

function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = null
  }
}

function goToIndex(index: number) {
  if (index === currentIndex.value)
    return

  const track = trackRef.value
  if (!track)
    return

  const cards = cardRefs.value
  const cardWidth = cards[0]?.offsetWidth || 0
  const gap = 24
  const offset = index * (cardWidth + gap)

  // 使用 GSAP 动画移动 track
  gsap.to(track, {
    x: -offset,
    duration: 0.6,
    ease: 'power2.out',
  })

  // 更新卡片状态
  cards.forEach((card, i) => {
    if (i === index) {
      gsap.to(card, {
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out',
      })
    }
    else {
      gsap.to(card, {
        scale: 0.88,
        opacity: 0.4,
        duration: 0.5,
        ease: 'power2.out',
      })
    }
  })

  currentIndex.value = index
}

function selectScenario(index: number) {
  stopRotation()
  goToIndex(index)
  if (props.autoPlay) {
    setTimeout(() => startRotation(), RESUME_DELAY)
  }
}

function initCards() {
  const cards = cardRefs.value
  cards.forEach((card, i) => {
    if (i === currentIndex.value) {
      gsap.set(card, { scale: 1, opacity: 1 })
    }
    else {
      gsap.set(card, { scale: 0.88, opacity: 0.4 })
    }
  })
}

watch(() => props.active, (newVal) => {
  if (newVal) {
    currentIndex.value = 0
    showPreview.value = true
    // 重置位置
    if (trackRef.value) {
      gsap.set(trackRef.value, { x: 0 })
    }
    initCards()
    if (props.autoPlay) {
      setTimeout(() => startRotation(), START_DELAY)
    }
  }
  else {
    stopRotation()
    showPreview.value = false
  }
}, { immediate: true })

onMounted(() => {
  if (props.active) {
    showPreview.value = true
    initCards()
    if (props.autoPlay) {
      setTimeout(() => startRotation(), START_DELAY)
    }
  }
})

onBeforeUnmount(() => {
  stopRotation()
})

function resolveTypeLabel(type: PreviewScenario['type']) {
  return t(`landing.os.aiOverview.demo.preview.types.${type}`)
}

function setCardRef(el: any, index: number) {
  if (el)
    cardRefs.value[index] = el
}
</script>

<template>
  <div class="ai-preview-demo">
    <div class="ai-preview-demo__wrapper">
      <!-- CoreBox 外壳 -->
      <div class="ai-preview-demo__corebox">
        <!-- 输入栏 -->
        <div class="ai-preview-demo__input">
          <div class="ai-preview-demo__logo">
            <Logo />
          </div>
          <div class="ai-preview-demo__input-text">
            {{ currentScenario.input }}
          </div>
        </div>

        <!-- 卡片轮播区域 - 这个区域允许溢出 -->
        <div class="ai-preview-demo__viewport">
          <div
            ref="trackRef"
            class="ai-preview-demo__track"
            :class="{ 'is-visible': showPreview }"
          >
            <div
              v-for="(scenario, index) in scenarios"
              :key="index"
              :ref="(el) => setCardRef(el, index)"
              class="ai-preview-demo__card-wrapper"
              @click="selectScenario(index)"
            >
              <div class="ai-preview-demo__card">
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
            </div>
          </div>
        </div>
      </div>

      <!-- 下方选择器 -->
      <div class="ai-preview-demo__selector">
        <div class="ai-preview-demo__selector-title">
          {{ t('landing.os.aiOverview.demo.preview.label') }}
        </div>
        <div class="ai-preview-demo__selector-list">
          <button
            v-for="(scenario, index) in scenarios"
            :key="index"
            type="button"
            class="ai-preview-demo__selector-item"
            :class="{ 'is-active': currentIndex === index }"
            @click="selectScenario(index)"
          >
            <span v-if="scenario.icon" :class="scenario.icon" class="ai-preview-demo__selector-icon" />
            <div class="ai-preview-demo__selector-content">
              <div class="ai-preview-demo__selector-input">
                {{ scenario.input }}
              </div>
              <div class="ai-preview-demo__selector-extra">
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
  overflow: hidden;
}

.ai-preview-demo__wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  width: 100%;
  max-width: 800px;
  overflow: hidden;
}

/* CoreBox 外壳 */
.ai-preview-demo__corebox {
  width: 100%;
  background: rgba(20, 20, 25, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  backdrop-filter: blur(24px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 20px 50px -10px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.ai-preview-demo__input {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ai-preview-demo__logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.ai-preview-demo__input-text {
  flex: 1;
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
}

/* 卡片轮播视口 - 关键：这里裁剪溢出 */
.ai-preview-demo__viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
  padding: 1.25rem 0;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.05), rgba(59, 130, 246, 0.02));
}

/* 两侧渐变遮罩 */
.ai-preview-demo__viewport::before,
.ai-preview-demo__viewport::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 80px;
  z-index: 10;
  pointer-events: none;
}

.ai-preview-demo__viewport::before {
  left: 0;
  background: linear-gradient(90deg, rgba(20, 20, 25, 1), transparent);
}

.ai-preview-demo__viewport::after {
  right: 0;
  background: linear-gradient(-90deg, rgba(20, 20, 25, 1), transparent);
}

/* 卡片轨道 - 允许溢出，但被 viewport 裁剪 */
.ai-preview-demo__track {
  display: flex;
  gap: 24px;
  padding: 0.5rem 1rem;
  padding-left: calc(50% - 200px);
  will-change: transform;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.ai-preview-demo__track.is-visible {
  opacity: 1;
}

/* 卡片包装器 */
.ai-preview-demo__card-wrapper {
  flex-shrink: 0;
  width: 400px;
  cursor: pointer;
  will-change: transform, opacity;
  transform-origin: center center;
}

/* 预览卡片 */
.ai-preview-demo__card {
  width: 100%;
  height: 100%;
  min-height: 280px;
  padding: 1.25rem;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  backdrop-filter: blur(20px);
  position: relative;
  overflow: hidden;
  box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.ai-preview-demo__card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.25), transparent);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
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
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.3);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.ai-preview-demo__card-body {
  flex: 1;
  margin-bottom: 1rem;
}

.ai-preview-demo__card-result {
  font-size: 2.5rem;
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
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.ai-preview-demo__card-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ai-preview-demo__card-detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.ai-preview-demo__card-detail-label {
  color: rgba(255, 255, 255, 0.35);
  font-weight: 500;
}

.ai-preview-demo__card-detail-value {
  color: rgba(255, 255, 255, 0.8);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.ai-preview-demo__card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: auto;
}

.ai-preview-demo__card-action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-preview-demo__card-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.ai-preview-demo__card-powered {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.2);
  font-weight: 500;
}

/* 下方选择器 */
.ai-preview-demo__selector {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.ai-preview-demo__selector-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 0.25rem;
}

.ai-preview-demo__selector-list {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  scrollbar-width: none;
}

.ai-preview-demo__selector-list::-webkit-scrollbar {
  display: none;
}

.ai-preview-demo__selector-item {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 15, 20, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
}

.ai-preview-demo__selector-item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
}

.ai-preview-demo__selector-item.is-active {
  background: rgba(139, 92, 246, 0.12);
  border-color: rgba(139, 92, 246, 0.3);
}

.ai-preview-demo__selector-icon {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.5);
}

.ai-preview-demo__selector-item.is-active .ai-preview-demo__selector-icon {
  color: rgba(139, 92, 246, 0.9);
}

.ai-preview-demo__selector-content {
  width: 100%;
}

.ai-preview-demo__selector-input {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-preview-demo__selector-item.is-active .ai-preview-demo__selector-input {
  color: #fff;
}

.ai-preview-demo__selector-extra {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.35);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
