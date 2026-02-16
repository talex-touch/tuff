<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const animating = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      start: '开始运动',
      stop: '停止运动',
      rawTitle: '原生 backdrop-filter',
      rawDesc: '无降级 — 运动时模糊失效',
      surfaceTitle: 'BaseSurface 降级',
      surfaceDesc: '自动切换 mask — 运动平滑',
      scrollHint: '↓ 可滚动',
      line: (i: number) => `第 ${i} 行可滚动内容`,
      hint: {
        idle: '静止 — 两边效果一致',
        moving: '综合运动 (缩放 + 位移 + 旋转) — 观察左侧模糊失效',
      },
    }
  }
  return {
    start: 'Start Motion',
    stop: 'Stop Motion',
    rawTitle: 'Raw backdrop-filter',
    rawDesc: 'No fallback — blur breaks on move',
    surfaceTitle: 'BaseSurface fallback',
    surfaceDesc: 'Auto mask switch — smooth motion',
    scrollHint: '↓ Scrollable',
    line: (i: number) => `Line ${i} scrollable content`,
    hint: {
      idle: 'Idle — both sides look the same',
      moving: 'Combined motion (scale + translate + rotate) — watch left side break',
    },
  }
})
</script>

<template>
  <div class="sf-cmp">
    <!-- 背景 -->
    <div class="sf-cmp__bg">
      <div class="sf-cmp__blob sf-cmp__blob--1" />
      <div class="sf-cmp__blob sf-cmp__blob--2" />
      <div class="sf-cmp__blob sf-cmp__blob--3" />
      <div class="sf-cmp__blob sf-cmp__blob--4" />
      <div class="sf-cmp__blob sf-cmp__blob--5" />
      <span class="sf-cmp__watermark">COMPARE</span>
    </div>

    <!-- 控制 -->
    <div class="sf-cmp__controls">
      <TxButton @click="animating = !animating">
        {{ animating ? labels.stop : labels.start }}
      </TxButton>
      <span class="sf-cmp__hint">
        {{ animating ? labels.hint.moving : labels.hint.idle }}
      </span>
    </div>

    <!-- 对比区域 -->
    <div class="sf-cmp__grid">
      <!-- 左：原生 backdrop-filter -->
      <div class="sf-cmp__col">
        <div class="sf-cmp__label sf-cmp__label--bad">
{{ labels.rawTitle }}
</div>
        <div class="sf-cmp__mover" :class="{ 'sf-cmp__mover--moving': animating }">
          <div class="sf-cmp__raw-glass">
            <div class="sf-cmp__card-header">
glass (raw)
</div>
            <div class="sf-cmp__card-scroll">
              <p class="sf-cmp__scroll-hint">
{{ labels.scrollHint }}
</p>
              <p v-for="i in 8" :key="i" class="sf-cmp__scroll-line">
{{ labels.line(i) }}
</p>
            </div>
          </div>
        </div>
        <p class="sf-cmp__desc">
{{ labels.rawDesc }}
</p>
      </div>

      <!-- 右：BaseSurface 降级 -->
      <div class="sf-cmp__col">
        <div class="sf-cmp__label sf-cmp__label--good">
{{ labels.surfaceTitle }}
</div>
        <div class="sf-cmp__mover" :class="{ 'sf-cmp__mover--moving': animating }">
          <TxBaseSurface
            mode="glass"
            :blur="12"
            :saturation="1.8"
            :moving="animating"
            fallback-mode="mask"
            :opacity="0.6"
            :settle-delay="200"
            :radius="14"
            class="sf-cmp__surface-card"
          >
            <div class="sf-cmp__card-header">
glass (BaseSurface)
</div>
            <div class="sf-cmp__card-scroll">
              <p class="sf-cmp__scroll-hint">
{{ labels.scrollHint }}
</p>
              <p v-for="i in 8" :key="i" class="sf-cmp__scroll-line">
{{ labels.line(i) }}
</p>
            </div>
          </TxBaseSurface>
        </div>
        <p class="sf-cmp__desc">
{{ labels.surfaceDesc }}
</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sf-cmp {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  padding: 20px;
  min-height: 360px;
}

/* --- 背景 --- */
.sf-cmp__bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, #0f2027 0%, #203a43 40%, #2c5364 100%);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sf-cmp__blob { position: absolute; border-radius: 50%; }
.sf-cmp__blob--1 { width: 200px; height: 200px; background: rgba(255, 107, 107, 0.55); top: -50px; left: 10%; }
.sf-cmp__blob--2 { width: 160px; height: 160px; background: rgba(72, 219, 251, 0.5); bottom: -20px; left: 30%; }
.sf-cmp__blob--3 { width: 140px; height: 140px; background: rgba(255, 215, 0, 0.5); top: 20px; right: 5%; }
.sf-cmp__blob--4 { width: 120px; height: 120px; background: rgba(168, 85, 247, 0.5); bottom: -30px; right: 25%; }
.sf-cmp__blob--5 { width: 90px; height: 90px; background: rgba(34, 197, 94, 0.45); top: 50%; left: 50%; transform: translate(-50%, -50%); }

.sf-cmp__watermark {
  color: rgba(255, 255, 255, 0.06);
  font-size: 48px;
  font-weight: 900;
  letter-spacing: 12px;
  user-select: none;
  pointer-events: none;
}

/* --- 控制 --- */
.sf-cmp__controls {
  position: relative;
  z-index: 2;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.sf-cmp__hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 500;
}

/* --- 网格 --- */
.sf-cmp__grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.sf-cmp__col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.sf-cmp__label {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

.sf-cmp__label--bad { background: rgba(255, 80, 80, 0.35); color: #ffb4b4; }
.sf-cmp__label--good { background: rgba(34, 197, 94, 0.3); color: #86efac; }

.sf-cmp__desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  text-align: center;
}

/* --- 综合运动容器 --- */
.sf-cmp__mover {
  transition:
    transform 1.5s cubic-bezier(0.22, 1, 0.36, 1),
    width 1.5s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateX(0) translateY(0) scale(1) rotate(0deg);
  width: 100%;
}

.sf-cmp__mover--moving {
  transform: translateX(14px) translateY(-12px) scale(0.9) rotate(3deg);
}

/* --- 原生 glass 卡片 --- */
.sf-cmp__raw-glass {
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px) saturate(1.8) brightness(1.1);
  -webkit-backdrop-filter: blur(12px) saturate(1.8) brightness(1.1);
  display: flex;
  flex-direction: column;
}

/* --- BaseSurface 卡片 --- */
.sf-cmp__surface-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- 共享卡片内部 --- */
.sf-cmp__card-header {
  padding: 10px 14px;
  font-weight: 600;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}

.sf-cmp__card-scroll {
  padding: 8px 14px;
  max-height: 130px;
  overflow-y: auto;
  flex: 1;
}

.sf-cmp__scroll-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 4px;
}

.sf-cmp__scroll-line {
  font-size: 12px;
  line-height: 1.7;
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
}
</style>
