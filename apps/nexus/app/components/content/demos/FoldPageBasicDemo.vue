<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const open = ref(false)
const progress = ref(0)
const foldStyle = ref<'accordion' | 'gate'>('accordion')
const direction = ref<'horizontal' | 'vertical'>('horizontal')

const copy = computed(() => (locale.value === 'zh'
  ? {
      styleLabel: '折法',
      accordion: '风琴折',
      gate: '对开三折',
      dirLabel: '方向',
      horizontal: '横向',
      vertical: '纵向',
      openAction: '展开折页',
      closeAction: '收起折页',
      progressLabel: '展开进度',
      hint: '可左右/上下拖拽折页，或点击展开。',
      coverKicker: 'TUFFEX PRO · 折页',
      coverTitle: '立体琉光折页卡片',
      coverSubtitle: '点击或向两侧拉开查看三折内容',
      panels: [
        {
          id: 'surface',
          badge: '01 · 折射材质',
          title: '琉光折射层',
          subtitle: '默认遵循 refraction 规范',
          content: '每张折页均内置 TxBaseSurface 琉光底板，支持暗色与高对比度自适应。',
        },
        {
          id: 'crease',
          badge: '02 · 折痕光影',
          title: '实时角度光照',
          subtitle: '随折叠角度连续明暗过渡',
          content: '面板间保持零错位 3D 接缝，并按正弦角度驱动高光与折痕阴影。',
        },
        {
          id: 'spring',
          badge: '03 · 物理手势',
          title: '阻尼惯性回弹',
          subtitle: 'stepSpring 帧循环驱动',
          content: '拖拽超过 4px 即跟随指针，松手后按速度预测停靠，静止自动休眠。',
        },
      ],
    }
  : {
      styleLabel: 'Style',
      accordion: 'Accordion',
      gate: 'Gate tri-fold',
      dirLabel: 'Axis',
      horizontal: 'Horizontal',
      vertical: 'Vertical',
      openAction: 'Unfold',
      closeAction: 'Fold',
      progressLabel: 'Openness',
      hint: 'Drag across the panels or click to fold and unfold.',
      coverKicker: 'TUFFEX PRO · FOLD',
      coverTitle: 'Refraction Tri-Fold Brochure',
      coverSubtitle: 'Click or pull outward to open',
      panels: [
        {
          id: 'surface',
          badge: '01 · Surface',
          title: 'Refraction Base',
          subtitle: 'Follows default refraction spec',
          content: 'Each facet pairs TxBaseSurface specular highlights with crisp theme tokens.',
        },
        {
          id: 'crease',
          badge: '02 · Lighting',
          title: 'Crease Shading',
          subtitle: 'Continuous angle-driven sheen',
          content: 'Panels share exact 3D seam coordinates while bevel shading tracks fold angle.',
        },
        {
          id: 'spring',
          badge: '03 · Physics',
          title: 'Spring Momentum',
          subtitle: 'Driven by shared stepSpring',
          content: 'Pointer drags track live with rubberbanding and settle smoothly on release.',
        },
      ],
    }))

const styleOptions = computed(() => [
  { value: 'accordion', label: copy.value.accordion },
  { value: 'gate', label: copy.value.gate },
])

const dirOptions = computed(() => [
  { value: 'horizontal', label: copy.value.horizontal },
  { value: 'vertical', label: copy.value.vertical },
])

const percent = computed({
  get: () => Math.round(progress.value * 100),
  set: (value: number) => {
    progress.value = Math.min(1, Math.max(0, value / 100))
    open.value = progress.value >= 0.5
  },
})
</script>

<template>
  <div class="not-prose fold-demo">
    <div class="fold-demo__toolbar">
      <div class="fold-demo__group">
        <span class="fold-demo__label">{{ copy.styleLabel }}</span>
        <TxFlatRadio v-model="foldStyle" size="sm">
          <TxFlatRadioItem v-for="opt in styleOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
        </TxFlatRadio>
      </div>
      <div class="fold-demo__group">
        <span class="fold-demo__label">{{ copy.dirLabel }}</span>
        <TxFlatRadio v-model="direction" size="sm">
          <TxFlatRadioItem v-for="opt in dirOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
        </TxFlatRadio>
      </div>
      <TxButton size="sm" variant="primary" @click="open = !open; progress = open ? 1 : 0">
        {{ open ? copy.closeAction : copy.openAction }}
      </TxButton>
    </div>

    <div class="fold-demo__stage">
      <TxFoldPage
        v-model="open"
        v-model:progress="progress"
        :panels="copy.panels"
        :fold-style="foldStyle"
        :direction="direction"
        size="md"
      >
        <template #cover>
          <div class="fold-demo__cover">
            <span class="fold-demo__kicker">
              <i class="i-carbon-book" aria-hidden="true" />
              {{ copy.coverKicker }}
            </span>
            <p class="fold-demo__cover-title">
              {{ copy.coverTitle }}
            </p>
            <p class="fold-demo__cover-sub">
              {{ copy.coverSubtitle }}
            </p>
          </div>
        </template>
      </TxFoldPage>
    </div>

    <div class="fold-demo__footer">
      <div class="fold-demo__slider-row">
        <span class="fold-demo__label">{{ copy.progressLabel }} ({{ percent }}%)</span>
        <TxSlider v-model="percent" :min="0" :max="100" :step="1" />
      </div>
      <p class="fold-demo__hint">
        {{ copy.hint }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.fold-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fold-demo__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
}

.fold-demo__group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.fold-demo__label {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
}

.fold-demo__stage {
  padding: 18px;
  border-radius: 16px;
  background:
    radial-gradient(90% 80% at 15% 15%, color-mix(in srgb, var(--tx-color-primary) 16%, transparent), transparent 60%),
    radial-gradient(80% 90% at 88% 85%, color-mix(in srgb, var(--tx-color-success) 14%, transparent), transparent 62%),
    var(--tx-fill-color-lighter);
}

.fold-demo__cover {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  height: 100%;
}

.fold-demo__kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--tx-color-primary);
}

.fold-demo__cover-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.fold-demo__cover-sub {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.fold-demo__footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fold-demo__slider-row {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 12px;
}

.fold-demo__hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
