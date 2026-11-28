<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const sizes = ['md', 'sm'] as const

const hints = computed(() => [
  { tone: 'success' as const, text: zh.value ? '已复制' : 'Copied' },
  { tone: 'warning' as const, text: zh.value ? '仅保存在本地' : 'Saved locally' },
  { tone: 'danger' as const, text: zh.value ? '固定失败' : 'Could not pin' },
  { tone: 'info' as const, text: zh.value ? '已在浏览器中打开' : 'Opened in browser' },
  { tone: 'muted' as const, text: zh.value ? '没有变化' : 'Nothing changed' },
])

// The demo mounts just before it scrolls into view, so the entrance is often over by the
// time it is read. Bumping the key remounts every hint and plays it again. The key sits on a
// wrapper: `sizes` is a constant, so its v-for is a stable fragment whose rows are patched in
// place, and a key on the rows themselves would never be compared.
const round = ref(0)
const replayLabel = computed(() => zh.value ? '重播入场' : 'Replay entrance')
</script>

<template>
  <div class="status-hint-tones-demo not-prose">
    <div :key="round" class="status-hint-tones-demo__rows">
      <div v-for="size in sizes" :key="size" class="status-hint-tones-demo__row">
        <span class="status-hint-tones-demo__size">{{ size }}</span>
        <TxStatusHint
          v-for="hint in hints"
          :key="hint.tone"
          :text="hint.text"
          :tone="hint.tone"
          :size="size"
          :live="false"
        />
      </div>
    </div>
    <div>
      <TxButton size="sm" @click="round += 1">
        {{ replayLabel }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.status-hint-tones-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-hint-tones-demo__rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-hint-tones-demo__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.status-hint-tones-demo__size {
  width: 28px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
