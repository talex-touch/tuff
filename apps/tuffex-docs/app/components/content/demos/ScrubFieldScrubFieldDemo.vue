<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const width = ref(324)
const opacity = ref(100)
const gap = ref(1.5)
const lastCommit = ref<string | null>(null)

const copy = computed(() => zh.value
  ? {
      width: '宽',
      opacity: '不透明度',
      gap: '间距',
      hint: '把光标移到标签上向左右拖动；或聚焦标签后用 ↑ ↓ 调整（按住 Shift 走 10 倍），Home / End 直达两端，拖动中按 Esc 撤销。',
      committed: '最近提交：',
    }
  : {
      width: 'W',
      opacity: 'Opacity',
      gap: 'Gap',
      hint: 'Drag sideways on the caption, or focus it and use ↑ ↓ (Shift for ×10). Home and End jump to the bounds, Escape abandons a drag.',
      committed: 'Last commit: ',
    })

function onChange(label: string, value: number): void {
  lastCommit.value = `${label} = ${value}`
}
</script>

<template>
  <div class="scrub-demo">
    <div class="scrub-demo__grid">
      <TxScrubField
        v-model="width"
        :label="copy.width"
        :min="40"
        :max="999"
        :active="width !== 324"
        @change="onChange(copy.width, $event)"
      />
      <TxScrubField
        v-model="opacity"
        :label="copy.opacity"
        :min="0"
        :max="100"
        suffix="%"
        :active="opacity !== 100"
        @change="onChange(copy.opacity, $event)"
      />
      <TxScrubField
        v-model="gap"
        :label="copy.gap"
        :min="0"
        :max="8"
        :step="0.5"
        :active="gap !== 1.5"
        @change="onChange(copy.gap, $event)"
      />
    </div>

    <p class="scrub-demo__hint">
      {{ copy.hint }}
    </p>
    <p v-if="lastCommit" class="scrub-demo__commit">
      {{ copy.committed }}<code>{{ lastCommit }}</code>
    </p>
  </div>
</template>

<style scoped>
.scrub-demo {
  width: 100%;
  max-width: 320px;
}

.scrub-demo__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.scrub-demo__hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.scrub-demo__commit {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--tx-bui-ink-2, #62656b);
}

.scrub-demo__commit code {
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-variant-numeric: tabular-nums;
}
</style>
