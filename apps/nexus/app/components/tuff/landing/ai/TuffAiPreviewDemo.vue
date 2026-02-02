<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
    input: '1 + 2',
    type: 'expression',
    result: '3',
    extra: '表达式: 1 + 2',
  },
  {
    input: '19usd->cny',
    type: 'currency',
    result: '137.7500',
    extra: '美元 → 人民币',
    details: {
      source: '19.0000 USD',
      target: '137.7500 CNY',
    },
  },
  {
    input: '2 days later',
    type: 'time',
    result: '2025-11-17 15:20:37',
    extra: '相对时间: in 2 days',
  },
  {
    input: '12cm',
    type: 'unit',
    result: '12 cm',
    extra: '0.12 M / 0.3937 FT / 4.7244 IN',
  },
  {
    input: '#ff00dd',
    type: 'color',
    result: '#FF00DD',
    extra: 'RGB(255, 0, 221)',
    details: {
      rgb: 'rgb(255, 0, 221)',
      hsl: 'hsl(308, 100%, 50%)',
    },
  },
  {
    input: 'earth gravity',
    type: 'constant',
    result: '9.80665',
    extra: 'm*s^-2 | 标准地表重力',
  },
]

const currentIndex = ref(0)
const currentScenario = computed(() => scenarios[currentIndex.value])
const showPreview = ref(false)

let rotationTimer: ReturnType<typeof setInterval> | null = null

function startRotation() {
  if (!props.autoPlay || !props.active)
    return

  rotationTimer = setInterval(() => {
    showPreview.value = false
    setTimeout(() => {
      currentIndex.value = (currentIndex.value + 1) % scenarios.length
      showPreview.value = true
    }, 300)
  }, 5000)
}

function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = null
  }
}

watch(() => props.active, (newVal) => {
  if (newVal) {
    showPreview.value = true
    if (props.autoPlay) {
      setTimeout(() => {
        startRotation()
      }, 2000)
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
    if (props.autoPlay) {
      setTimeout(() => {
        startRotation()
      }, 2000)
    }
  }
})

onBeforeUnmount(() => {
  stopRotation()
})

const previewTypeLabel = computed(() => {
  const typeKey = `landing.os.aiOverview.demo.preview.types.${currentScenario.value.type}`
  return t(typeKey)
})
</script>

<template>
  <div class="ai-preview-demo">
    <div class="ai-preview-demo__container">
      <!-- 搜索框 -->
      <div class="ai-preview-demo__input-area">
        <div class="ai-preview-demo__input-wrapper">
          <div class="ai-preview-demo__input-icon">
            <span class="i-carbon-search text-lg" />
          </div>
          <div class="ai-preview-demo__input-text">
            {{ currentScenario.input }}
          </div>
        </div>
      </div>

      <!-- 预览卡片 -->
      <div
        v-if="showPreview"
        class="ai-preview-demo__card"
        :class="`ai-preview-demo__card--${currentScenario.type}`"
      >
        <div class="ai-preview-demo__card-header">
          <div class="ai-preview-demo__card-type">
            {{ previewTypeLabel }}
          </div>
          <div class="ai-preview-demo__card-badge">
            preview.{{ currentScenario.type }}
          </div>
        </div>

        <div class="ai-preview-demo__card-body">
          <div class="ai-preview-demo__card-result">
            {{ currentScenario.result }}
          </div>
          <div v-if="currentScenario.extra" class="ai-preview-demo__card-extra">
            {{ currentScenario.extra }}
          </div>
        </div>

        <div v-if="currentScenario.details" class="ai-preview-demo__card-details">
          <div
            v-for="(value, key) in currentScenario.details"
            :key="key"
            class="ai-preview-demo__card-detail-item"
          >
            <span class="ai-preview-demo__card-detail-label">{{ key.toUpperCase() }}</span>
            <span class="ai-preview-demo__card-detail-value">{{ value }}</span>
          </div>
        </div>

        <div class="ai-preview-demo__card-footer">
          <div class="ai-preview-demo__card-actions">
            <button type="button" class="ai-preview-demo__card-action-btn">
              <span class="i-carbon-copy" />
              <span>Copy Result</span>
            </button>
          </div>
          <div class="ai-preview-demo__card-powered">
            Powered by TuffIntelligence
          </div>
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
  flex-direction: column;
  justify-content: center;
  padding: 2rem;
  max-width: 600px;
  margin: 0 auto;
}

.ai-preview-demo__container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.ai-preview-demo__input-area {
  width: 100%;
}

.ai-preview-demo__input-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(30, 30, 35, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.ai-preview-demo__input-icon {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 1.25rem;
}

.ai-preview-demo__input-text {
  flex: 1;
  color: rgba(255, 255, 255, 0.95);
  font-size: 1.1rem;
  line-height: 1.5;
  font-weight: 400;
}

.ai-preview-demo__card {
  padding: 1.5rem;
  background: rgba(30, 30, 35, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  backdrop-filter: blur(24px);
  animation: cardEnter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  position: relative;
  overflow: hidden;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5);
}

/* 渐变边框效果 */
.ai-preview-demo__card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 16px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(59, 130, 246, 0.4), rgba(6, 182, 212, 0.2));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* 内部光晕 */
.ai-preview-demo__card::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at center, rgba(139, 92, 246, 0.08), transparent 60%);
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
  margin-bottom: 1.25rem;
}

.ai-preview-demo__card-type {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-preview-demo__card-badge {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.ai-preview-demo__card-body {
  margin-bottom: 1.5rem;
}

.ai-preview-demo__card-result {
  font-size: 2.5rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.1;
  margin-bottom: 0.75rem;
  letter-spacing: -0.02em;
}

.ai-preview-demo__card-extra {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

.ai-preview-demo__card-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.ai-preview-demo__card-detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.ai-preview-demo__card-detail-label {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

.ai-preview-demo__card-detail-value {
  color: rgba(255, 255, 255, 0.9);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.ai-preview-demo__card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.ai-preview-demo__card-actions {
  display: flex;
  gap: 0.75rem;
}

.ai-preview-demo__card-action-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-preview-demo__card-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
  transform: translateY(-1px);
}

.ai-preview-demo__card-powered {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.3);
  font-weight: 500;
}

@keyframes cardEnter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
