<script setup lang="ts">
import { computed, ref } from 'vue'

type Placement = 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'right'
type Surface = 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
type PanelVariant = 'solid' | 'plain' | 'dashed'
type Shadow = 'none' | 'soft' | 'medium'
type WidthMode = 'auto' | 'compact' | 'wide'

const { locale } = useI18n()

const open = ref(false)
const placement = ref<Placement>('bottom-start')
const surface = ref<Surface>('refraction')
const panelVariant = ref<PanelVariant>('plain')
const panelShadow = ref<Shadow>('soft')
const widthMode = ref<WidthMode>('auto')
const showArrow = ref(true)
const useCard = ref(true)
const matchReferenceWidth = ref(false)
const toggleOnReferenceClick = ref(true)
const offset = ref(10)
const radius = ref(18)
const padding = ref(12)
const duration = ref(432)
const ease = ref('back.out(2)')
const maskOpacity = ref(0.75)
const fallbackMaskOpacity = ref(0.34)

const labels = computed(() => {
  if (locale.value.startsWith('zh')) {
    return {
      trigger: '打开 Playground',
      controlsTitle: 'Anchor 参数控制台',
      controlsDesc: '可自由调 placement / motion / surface / card 外观，重点观察 surface 差异。',
      section: {
        surface: 'Surface',
        placement: 'Placement',
        width: 'Width',
        variant: 'Variant',
        shadow: 'Shadow',
        ease: 'Ease',
      },
      switch: {
        showArrow: 'Show arrow',
        useCard: 'Use card',
        matchReferenceWidth: 'Match reference width',
        toggleOnReferenceClick: 'Toggle on click',
      },
      slider: {
        offset: 'Offset',
        radius: 'Radius',
        padding: 'Padding',
        duration: 'Duration',
        maskOpacity: 'Mask opacity',
        fallbackMaskOpacity: 'Fallback mask',
      },
      widthMode: {
        auto: 'auto',
        compact: 'compact',
        wide: 'wide',
      },
      panel: {
        title: 'BaseAnchor Surface Preview',
        desc: '切换 surface 可明显看到材质变化；关闭 Use card 后会回退成纯包装层。',
        action: 'Apply Settings',
      },
      surfacePreset: 'Surface Presets',
    }
  }

  return {
    trigger: 'Open playground',
    controlsTitle: 'Anchor Control Panel',
    controlsDesc: 'Freely tune placement, motion, surface and card visuals. Focus on surface differences.',
    section: {
      surface: 'Surface',
      placement: 'Placement',
      width: 'Width',
      variant: 'Variant',
      shadow: 'Shadow',
      ease: 'Ease',
    },
    switch: {
      showArrow: 'Show arrow',
      useCard: 'Use card',
      matchReferenceWidth: 'Match reference width',
      toggleOnReferenceClick: 'Toggle on click',
    },
    slider: {
      offset: 'Offset',
      radius: 'Radius',
      padding: 'Padding',
      duration: 'Duration',
      maskOpacity: 'Mask opacity',
      fallbackMaskOpacity: 'Fallback mask',
    },
    widthMode: {
      auto: 'auto',
      compact: 'compact',
      wide: 'wide',
    },
    panel: {
      title: 'BaseAnchor Surface Preview',
      desc: 'Switch surface to inspect material differences. Disable Use card to fallback to raw wrapper.',
      action: 'Apply Settings',
    },
    surfacePreset: 'Surface Presets',
  }
})

const surfaceOptions: Surface[] = ['pure', 'mask', 'blur', 'glass', 'refraction']
const placementOptions: Placement[] = ['bottom-start', 'bottom', 'top-start', 'top', 'left', 'right']
const variantOptions: PanelVariant[] = ['plain', 'solid', 'dashed']
const shadowOptions: Shadow[] = ['none', 'soft', 'medium']
const widthOptions: WidthMode[] = ['auto', 'compact', 'wide']
const easeOptions = ['back.out(2)', 'power2.out', 'elastic.out(1, 0.45)']

const resolvedWidth = computed(() => {
  if (widthMode.value === 'compact')
    return 220
  if (widthMode.value === 'wide')
    return 320
  return 0
})

const resolvedMaxWidth = computed(() => {
  if (widthMode.value === 'wide')
    return 520
  if (widthMode.value === 'compact')
    return 280
  return 420
})

const panelCard = computed(() => ({
  maskOpacity: maskOpacity.value,
  fallbackMaskOpacity: fallbackMaskOpacity.value,
}))
</script>

<template>
  <div class="anchor-playground">
    <TxCard variant="plain" background="mask" :radius="14" :padding="14" class="anchor-playground__controls">
      <div class="anchor-playground__heading">
        <div class="anchor-playground__title">
          {{ labels.controlsTitle }}
        </div>
        <div class="anchor-playground__desc">
          {{ labels.controlsDesc }}
        </div>
      </div>

      <div class="anchor-playground__grid">
        <label class="anchor-playground__field">
          <span>{{ labels.section.surface }}</span>
          <TxFlatSelect v-model="surface">
            <TxFlatSelectItem v-for="item in surfaceOptions" :key="item" :value="item" :label="item" />
          </TxFlatSelect>
        </label>

        <label class="anchor-playground__field">
          <span>{{ labels.section.placement }}</span>
          <TxFlatSelect v-model="placement">
            <TxFlatSelectItem v-for="item in placementOptions" :key="item" :value="item" :label="item" />
          </TxFlatSelect>
        </label>

        <label class="anchor-playground__field">
          <span>{{ labels.section.width }}</span>
          <TxFlatSelect v-model="widthMode">
            <TxFlatSelectItem v-for="item in widthOptions" :key="item" :value="item" :label="labels.widthMode[item]" />
          </TxFlatSelect>
        </label>

        <label class="anchor-playground__field">
          <span>{{ labels.section.variant }}</span>
          <TxFlatSelect v-model="panelVariant">
            <TxFlatSelectItem v-for="item in variantOptions" :key="item" :value="item" :label="item" />
          </TxFlatSelect>
        </label>

        <label class="anchor-playground__field">
          <span>{{ labels.section.shadow }}</span>
          <TxFlatSelect v-model="panelShadow">
            <TxFlatSelectItem v-for="item in shadowOptions" :key="item" :value="item" :label="item" />
          </TxFlatSelect>
        </label>

        <label class="anchor-playground__field">
          <span>{{ labels.section.ease }}</span>
          <TxFlatSelect v-model="ease">
            <TxFlatSelectItem v-for="item in easeOptions" :key="item" :value="item" :label="item" />
          </TxFlatSelect>
        </label>
      </div>

      <div class="anchor-playground__switches">
        <label class="anchor-playground__switch-field">
          <span>{{ labels.switch.showArrow }}</span>
          <TxSwitch v-model="showArrow" />
        </label>
        <label class="anchor-playground__switch-field">
          <span>{{ labels.switch.useCard }}</span>
          <TxSwitch v-model="useCard" />
        </label>
        <label class="anchor-playground__switch-field">
          <span>{{ labels.switch.matchReferenceWidth }}</span>
          <TxSwitch v-model="matchReferenceWidth" />
        </label>
        <label class="anchor-playground__switch-field">
          <span>{{ labels.switch.toggleOnReferenceClick }}</span>
          <TxSwitch v-model="toggleOnReferenceClick" />
        </label>
      </div>

      <div class="anchor-playground__sliders">
        <div class="anchor-playground__slider-item">
          <span>{{ labels.slider.offset }}: {{ offset }}</span>
          <TxSlider v-model="offset" :min="0" :max="24" :step="1" />
        </div>
        <div class="anchor-playground__slider-item">
          <span>{{ labels.slider.radius }}: {{ radius }}</span>
          <TxSlider v-model="radius" :min="8" :max="28" :step="1" />
        </div>
        <div class="anchor-playground__slider-item">
          <span>{{ labels.slider.padding }}: {{ padding }}</span>
          <TxSlider v-model="padding" :min="6" :max="22" :step="1" />
        </div>
        <div class="anchor-playground__slider-item">
          <span>{{ labels.slider.duration }}: {{ duration }}ms</span>
          <TxSlider v-model="duration" :min="180" :max="760" :step="20" />
        </div>
        <div class="anchor-playground__slider-item">
          <span>{{ labels.slider.maskOpacity }}: {{ maskOpacity.toFixed(2) }}</span>
          <TxSlider v-model="maskOpacity" :min="0.1" :max="1" :step="0.01" />
        </div>
        <div class="anchor-playground__slider-item">
          <span>{{ labels.slider.fallbackMaskOpacity }}: {{ fallbackMaskOpacity.toFixed(2) }}</span>
          <TxSlider v-model="fallbackMaskOpacity" :min="0.08" :max="0.72" :step="0.01" />
        </div>
      </div>

      <div class="anchor-playground__surface-row">
        <span class="anchor-playground__surface-label">{{ labels.surfacePreset }}</span>
        <TxButton
          v-for="item in surfaceOptions"
          :key="`preset-${item}`"
          size="small"
          :variant="surface === item ? 'primary' : 'ghost'"
          @click="surface = item"
        >
          {{ item }}
        </TxButton>
      </div>
    </TxCard>

    <div class="anchor-playground__stage">
      <TxBaseAnchor
        v-model="open"
        :placement="placement"
        :offset="offset"
        :duration="duration"
        :ease="ease"
        :show-arrow="showArrow"
        :use-card="useCard"
        :panel-background="surface"
        :panel-variant="panelVariant"
        :panel-shadow="panelShadow"
        :panel-radius="radius"
        :panel-padding="padding"
        :panel-card="panelCard"
        :match-reference-width="matchReferenceWidth"
        :toggle-on-reference-click="toggleOnReferenceClick"
        :width="resolvedWidth"
        :max-width="resolvedMaxWidth"
      >
        <template #reference>
          <TxButton variant="primary">
            {{ labels.trigger }}
          </TxButton>
        </template>

        <div class="anchor-playground__panel-content">
          <div class="anchor-playground__panel-title">
            {{ labels.panel.title }}
          </div>
          <p class="anchor-playground__panel-desc">
            {{ labels.panel.desc }}
          </p>
          <div class="anchor-playground__meta">
            <TxTag :label="`surface: ${surface}`" size="sm" />
            <TxTag :label="`variant: ${panelVariant}`" size="sm" />
            <TxTag :label="`shadow: ${panelShadow}`" size="sm" />
            <TxTag :label="`mask: ${maskOpacity.toFixed(2)}`" size="sm" />
          </div>
          <TxButton size="small" variant="secondary">
            {{ labels.panel.action }}
          </TxButton>
        </div>
      </TxBaseAnchor>
    </div>
  </div>
</template>

<style scoped>
.anchor-playground {
  display: grid;
  gap: 14px;
}

.anchor-playground__controls {
  display: grid;
  gap: 12px;
}

.anchor-playground__heading {
  display: grid;
  gap: 4px;
}

.anchor-playground__title {
  font-size: 14px;
  font-weight: 700;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 92%, transparent);
}

.anchor-playground__desc {
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 86%, transparent);
}

.anchor-playground__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.anchor-playground__field {
  display: grid;
  gap: 6px;
  font-size: 12px;
}

.anchor-playground__field > span {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 86%, transparent);
}

.anchor-playground__switches {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.anchor-playground__switch-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, #d1d5db) 72%, transparent);
  border-radius: 10px;
  padding: 6px 10px;
}

.anchor-playground__switch-field > span {
  font-size: 12px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 86%, transparent);
}

.anchor-playground__sliders {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.anchor-playground__slider-item {
  display: grid;
  gap: 6px;
}

.anchor-playground__slider-item > span {
  font-size: 12px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 86%, transparent);
}

.anchor-playground__surface-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.anchor-playground__surface-label {
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 84%, transparent);
}

.anchor-playground__stage {
  min-height: 240px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, #d1d5db) 72%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 18px;
  background:
    radial-gradient(circle at 14% 15%, rgba(59, 130, 246, 0.22), transparent 46%),
    radial-gradient(circle at 82% 22%, rgba(34, 197, 94, 0.2), transparent 40%),
    radial-gradient(circle at 48% 82%, rgba(245, 158, 11, 0.16), transparent 44%),
    color-mix(in srgb, var(--tx-bg-color-page, #f8fafc) 84%, transparent);
}

.anchor-playground__panel-content {
  display: grid;
  gap: 10px;
  min-width: min(360px, 100%);
}

.anchor-playground__panel-title {
  font-size: 14px;
  font-weight: 700;
}

.anchor-playground__panel-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 88%, transparent);
}

.anchor-playground__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 900px) {
  .anchor-playground__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .anchor-playground__sliders {
    grid-template-columns: 1fr;
  }

  .anchor-playground__switches {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .anchor-playground__grid {
    grid-template-columns: 1fr;
  }
}
</style>
