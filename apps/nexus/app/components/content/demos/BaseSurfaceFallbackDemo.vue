<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const animating = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      start: '开始运动',
      stop: '停止运动',
      scrollHint: '↓ 可滚动内容',
      line: (i: number) => `第 ${i} 行内容 — 用于演示滚动`,
      noFallback: '无降级',
      withFallback: '有降级',
      hint: {
        idle: '✦ 静止状态 — 所有模式正常渲染',
        moving: '⚡ 综合运动中 (缩放 + 宽高 + 位移 + 旋转)',
      },
    }
  }
  return {
    start: 'Start Motion',
    stop: 'Stop Motion',
    scrollHint: '↓ Scrollable content',
    line: (i: number) => `Line ${i} — scrollable demo content`,
    noFallback: 'No fallback',
    withFallback: 'With fallback',
    hint: {
      idle: '✦ Idle — all modes render normally',
      moving: '⚡ Combined motion (scale + size + translate + rotate)',
    },
  }
})

type Mode = 'blur' | 'glass' | 'refraction'

interface CardDef {
  mode: Mode
  fallback: boolean
}

const cards = computed<CardDef[]>(() => [
  { mode: 'blur', fallback: false },
  { mode: 'blur', fallback: true },
  { mode: 'glass', fallback: false },
  { mode: 'glass', fallback: true },
  { mode: 'refraction', fallback: false },
  { mode: 'refraction', fallback: true },
])

function cardLabel(card: CardDef) {
  const tag = card.fallback ? labels.value.withFallback : labels.value.noFallback
  const modeNames: Record<Mode, string> = { blur: 'Blur', glass: 'Glass', refraction: 'Refraction' }
  return `${modeNames[card.mode]} — ${tag}`
}
</script>

<template>
  <div class="sf-fb">
    <!-- 彩色背景层 -->
    <div class="sf-fb__bg">
      <div class="sf-fb__blob sf-fb__blob--1" />
      <div class="sf-fb__blob sf-fb__blob--2" />
      <div class="sf-fb__blob sf-fb__blob--3" />
      <div class="sf-fb__blob sf-fb__blob--4" />
      <div class="sf-fb__blob sf-fb__blob--5" />
      <span class="sf-fb__watermark">Backdrop</span>
    </div>

    <!-- 控制栏 -->
    <div class="sf-fb__controls">
      <TxButton @click="animating = !animating">
        {{ animating ? labels.stop : labels.start }}
      </TxButton>
      <span class="sf-fb__hint">
        {{ animating ? labels.hint.moving : labels.hint.idle }}
      </span>
    </div>

    <!-- 卡片网格 -->
    <div class="sf-fb__grid">
      <div
        v-for="(card, idx) in cards"
        :key="idx"
        class="sf-fb__col"
      >
        <span
          class="sf-fb__tag"
          :class="card.fallback ? 'sf-fb__tag--good' : 'sf-fb__tag--bad'"
        >
          {{ card.fallback ? labels.withFallback : labels.noFallback }}
        </span>

        <!-- 综合运动容器：缩放 + 宽高 + 位移 + 旋转 -->
        <div
          class="sf-fb__mover"
          :class="{ 'sf-fb__mover--moving': animating }"
        >
          <TxBaseSurface
            :mode="card.mode"
            :blur="12"
            :saturation="1.8"
            :moving="card.fallback ? animating : false"
            fallback-mode="mask"
            :opacity="0.65"
            :settle-delay="200"
            :radius="14"
            class="sf-fb__card"
          >
            <div class="sf-fb__card-header">
              {{ cardLabel(card) }}
            </div>
            <div class="sf-fb__card-scroll">
              <p class="sf-fb__scroll-hint">
{{ labels.scrollHint }}
</p>
              <p v-for="i in 10" :key="i" class="sf-fb__scroll-line">
                {{ labels.line(i) }}
              </p>
            </div>
          </TxBaseSurface>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sf-fb {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  padding: 20px;
  min-height: 400px;
}

/* --- 背景 --- */
.sf-fb__bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sf-fb__blob { position: absolute; border-radius: 50%; }
.sf-fb__blob--1 { width: 240px; height: 240px; background: rgba(255, 215, 0, 0.5); top: -70px; left: -40px; }
.sf-fb__blob--2 { width: 180px; height: 180px; background: rgba(0, 210, 255, 0.45); bottom: -50px; right: 30px; }
.sf-fb__blob--3 { width: 140px; height: 140px; background: rgba(255, 107, 107, 0.45); top: 40px; right: -20px; }
.sf-fb__blob--4 { width: 110px; height: 110px; background: rgba(67, 233, 123, 0.4); bottom: 30px; left: 100px; }
.sf-fb__blob--5 { width: 90px; height: 90px; background: rgba(168, 85, 247, 0.4); top: 50%; left: 50%; transform: translate(-50%, -50%); }

.sf-fb__watermark {
  color: rgba(255, 255, 255, 0.12);
  font-size: 36px;
  font-weight: 900;
  letter-spacing: 6px;
  user-select: none;
  pointer-events: none;
}

/* --- 控制 --- */
.sf-fb__controls {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.sf-fb__hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

/* --- 网格 --- */
.sf-fb__grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (min-width: 900px) {
  .sf-fb__grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

@media (max-width: 540px) {
  .sf-fb__grid {
    grid-template-columns: 1fr;
  }
}

.sf-fb__col {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* --- 标签 --- */
.sf-fb__tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  width: fit-content;
  letter-spacing: 0.3px;
}

.sf-fb__tag--bad { background: rgba(255, 80, 80, 0.35); color: #ffb4b4; }
.sf-fb__tag--good { background: rgba(34, 197, 94, 0.3); color: #86efac; }

/* --- 综合运动容器 --- */
.sf-fb__mover {
  transition:
    transform 1.4s cubic-bezier(0.22, 1, 0.36, 1),
    width 1.4s cubic-bezier(0.22, 1, 0.36, 1),
    height 1.4s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateX(0) translateY(0) scale(1) rotate(0deg);
}

.sf-fb__mover--moving {
  transform: translateX(16px) translateY(-10px) scale(0.92) rotate(2.5deg);
}

/* --- 卡片 --- */
.sf-fb__card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
  min-height: 180px;
}

.sf-fb__card-header {
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.9);
}

.sf-fb__card-scroll {
  padding: 6px 12px;
  max-height: 120px;
  overflow-y: auto;
  flex: 1;
}

.sf-fb__scroll-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 4px;
}

.sf-fb__scroll-line {
  font-size: 11px;
  line-height: 1.7;
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
}
</style>
