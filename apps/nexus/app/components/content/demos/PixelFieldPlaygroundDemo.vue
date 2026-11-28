<script setup lang="ts">
import type { PixelFieldHandle, PixelFieldPreset } from '@talex-touch/tuffex/pixel-field'
import { computed, ref } from 'vue'
import { TxButton, TxPixelField } from '#components'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      modePreset: '几何预设',
      modeText: '自定义文字采样',
      orb: '球体 Orb',
      wave: '波纹地形 Wave',
      textPlaceholder: '输入任意字符或缩写（如 TUFF / AI）',
      density: '点阵密度',
      pulse: '发射脉冲',
    }
  : {
      modePreset: 'Geometric presets',
      modeText: 'Custom text sampler',
      orb: 'Orb',
      wave: 'Wave',
      textPlaceholder: 'Type any glyph or wordmark (e.g. TUFF)',
      density: 'Density',
      pulse: 'Emit pulse',
    })

const mode = ref<'preset' | 'text'>('preset')
const preset = ref<PixelFieldPreset>('orb')
const customText = ref('TUFF')
const density = ref(1.05)
const fieldRef = ref<PixelFieldHandle | null>(null)
</script>

<template>
  <div class="pf-play not-prose">
    <div class="pf-play__controls">
      <TxButton size="sm" :variant="mode === 'preset' && preset === 'orb' ? 'primary' : 'secondary'" @click="mode = 'preset'; preset = 'orb'">
        {{ copy.orb }}
      </TxButton>
      <TxButton size="sm" :variant="mode === 'preset' && preset === 'wave' ? 'primary' : 'secondary'" @click="mode = 'preset'; preset = 'wave'">
        {{ copy.wave }}
      </TxButton>
      <TxButton size="sm" :variant="mode === 'text' ? 'primary' : 'secondary'" @click="mode = 'text'">
        {{ copy.modeText }}
      </TxButton>
      <input
        v-if="mode === 'text'"
        v-model="customText"
        class="pf-play__input"
        maxlength="10"
        :placeholder="copy.textPlaceholder"
      >
      <label class="pf-play__density">
        <span>{{ copy.density }} {{ density.toFixed(2) }}</span>
        <input v-model.number="density" type="range" min="0.5" max="1.5" step="0.05">
      </label>
      <TxButton size="sm" variant="secondary" @click="fieldRef?.pulse(0.5, 0.5)">
        {{ copy.pulse }}
      </TxButton>
    </div>

    <TxPixelField
      ref="fieldRef"
      class="pf-play__stage"
      :preset="preset"
      :text="mode === 'text' ? customText : undefined"
      :palette="mode === 'text' ? 'cyan' : 'violet'"
      stage="obsidian"
      interaction="repel"
      :density="density"
      :pixel-size="3"
      :gap="1.6"
      :radius="20"
    />
  </div>
</template>

<style scoped>
.pf-play {
  display: grid;
  gap: 14px;
  font-size: 13px;
  color: var(--tx-text-color-primary);
}

.pf-play__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.pf-play__input {
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  color: var(--tx-text-color-primary);
  font-size: 13px;
}

.pf-play__density {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.pf-play__density input {
  width: 96px;
  accent-color: var(--tx-color-primary);
  cursor: pointer;
}

.pf-play__stage {
  min-height: 280px;
  cursor: pointer;
}
</style>
