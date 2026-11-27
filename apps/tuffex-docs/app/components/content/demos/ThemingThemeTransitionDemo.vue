<script setup lang="ts">
import type { TxSelectModelValue, TxSelectOption } from '@talex-touch/tuffex/select'
import type { ThemeTransitionVariant } from '~/utils/theme-transition'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '~/composables/useTheme'

const { locale } = useI18n()
const { color, toggleDark } = useTheme()

const currentVariant = ref<ThemeTransitionVariant>('circle-blur')
const lastOrigin = ref<{ x: number, y: number } | null>(null)

const isDark = computed(() => color.value === 'dark')

const copy = computed(() => locale.value === 'zh'
  ? {
      preset: '动效预设',
      theme: '当前主题：',
      origin: '触发坐标：',
      dark: '深色',
      light: '浅色',
      toLight: '切换到浅色模式',
      toDark: '切换到深色模式',
      hint: '点击按钮或舞台任意位置，新主题会从点击处展开',
    }
  : {
      preset: 'Preset',
      theme: 'Theme: ',
      origin: 'Origin: ',
      dark: 'Dark',
      light: 'Light',
      toLight: 'Switch to light',
      toDark: 'Switch to dark',
      hint: 'Click the button or anywhere on the stage; the new theme opens from where you clicked',
    })

const variantOptions = computed<TxSelectOption[]>(() => locale.value === 'zh'
  ? [
      { value: 'circle-blur', label: '柔和光晕圆', description: 'circle-blur · 默认' },
      { value: 'circle', label: '硬边圆形', description: 'circle' },
      { value: 'polygon', label: '斜切光刃', description: 'polygon' },
      { value: 'polygon-gradient', label: '渐变光刃', description: 'polygon-gradient' },
      { value: 'wipe', label: '平推扫光', description: 'wipe' },
      { value: 'fade', label: '平滑淡出', description: 'fade' },
      { value: 'circle-blur-top-left', label: '左上角光晕', description: 'circle-blur-top-left' },
    ]
  : [
      { value: 'circle-blur', label: 'Circle blur', description: 'circle-blur · default' },
      { value: 'circle', label: 'Circle', description: 'circle' },
      { value: 'polygon', label: 'Polygon slash', description: 'polygon' },
      { value: 'polygon-gradient', label: 'Gradient slash', description: 'polygon-gradient' },
      { value: 'wipe', label: 'Wipe', description: 'wipe' },
      { value: 'fade', label: 'Fade', description: 'fade' },
      { value: 'circle-blur-top-left', label: 'Circle blur from top left', description: 'circle-blur-top-left' },
    ])

function selectVariant(value: TxSelectModelValue) {
  const match = variantOptions.value.find(option => option.value === value)
  if (match)
    currentVariant.value = match.value as ThemeTransitionVariant
}

/**
 * A keyboard press on the button arrives as a click at 0,0, which would open the new theme from the
 * corner of the viewport. Start it from the middle of the button instead.
 */
function resolveOrigin(event: MouseEvent) {
  if (event.detail === 0 && event.currentTarget instanceof HTMLElement) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  return { x: event.clientX, y: event.clientY }
}

function triggerSwitch(event: MouseEvent) {
  const origin = resolveOrigin(event)
  lastOrigin.value = { x: Math.round(origin.x), y: Math.round(origin.y) }
  toggleDark(isDark.value ? 'light' : 'dark', { clientX: origin.x, clientY: origin.y }, {
    variant: currentVariant.value,
  })
}
</script>

<template>
  <div class="theme-transition-demo not-prose">
    <div class="theme-transition-demo__controls">
      <div class="theme-transition-demo__field">
        <span class="theme-transition-demo__label">{{ copy.preset }}</span>
        <TxSelect
          class="theme-transition-demo__select"
          :model-value="currentVariant"
          :options="variantOptions"
          :aria-label="copy.preset"
          @update:model-value="selectVariant"
        />
      </div>

      <div class="theme-transition-demo__info">
        <TxTag size="sm" variant="plain" :label="`${copy.theme}${isDark ? copy.dark : copy.light}`" />
        <TxTag
          v-if="lastOrigin"
          class="theme-transition-demo__origin"
          size="sm"
          variant="plain"
          :label="`${copy.origin}${lastOrigin.x}, ${lastOrigin.y}`"
        />
      </div>
    </div>

    <div class="theme-transition-demo__stage" @click="triggerSwitch">
      <TxButton
        variant="primary"
        :icon="isDark ? 'i-carbon-sun' : 'i-carbon-moon'"
        @click.stop="triggerSwitch"
      >
        {{ isDark ? copy.toLight : copy.toDark }}
      </TxButton>
      <p class="theme-transition-demo__hint">
        {{ copy.hint }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.theme-transition-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.theme-transition-demo__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
  border: 1px solid var(--tx-border-color-lighter);
}

.theme-transition-demo__field {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.theme-transition-demo__label {
  flex: none;
  font-weight: 500;
  color: var(--tx-text-color-secondary);
}

.theme-transition-demo__select {
  width: 200px;
}

.theme-transition-demo__info {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.theme-transition-demo__origin {
  font-variant-numeric: tabular-nums;
}

.theme-transition-demo__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 180px;
  padding: 32px 20px;
  border-radius: 16px;
  border: 1px dashed var(--tx-border-color);
  cursor: pointer;
  transition: border-color 0.2s ease;
  user-select: none;
}

.theme-transition-demo__stage:hover {
  border-color: var(--tx-color-primary);
}

.theme-transition-demo__hint {
  margin: 0;
  max-width: 420px;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--tx-text-color-secondary);
}
</style>
