<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      badges: '文件类型角标（14px）',
      soft: '浅色底（18px）',
      plate: '首字母方块（32px）',
      circle: '圆形（14px）',
      ladder: '圆角由 size / 4 推导：14→4、18→5、32→8，与上游三处用法逐一吻合。',
    }
  }

  return {
    badges: 'File-type badges (14px)',
    soft: 'Tinted plates (18px)',
    plate: 'Initial plate (32px)',
    circle: 'Circle (14px)',
    ladder: 'Radius is derived as size / 4 — 14→4, 18→5, 32→8, matching all three upstream sizes.',
  }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.badges }}</span>
      <div class="flex items-center gap-2">
        <TxIconChip :size="14" tone="red" label="PDF" />
        <TxIconChip :size="14" tone="green" label="CSV" />
        <TxIconChip :size="14" tone="accent" label="DOC" />
        <TxIconChip :size="14" tone="orange" label="XLS" />
        <TxIconChip :size="14" tone="neutral" label="TXT" />
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.soft }}</span>
      <div class="flex items-center gap-2">
        <TxIconChip :size="18" tone="accent" variant="soft">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        </TxIconChip>
        <TxIconChip :size="18" tone="green" variant="soft">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </TxIconChip>
        <TxIconChip :size="18" tone="red" variant="soft">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </TxIconChip>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.plate }}</span>
      <div class="flex items-center gap-2">
        <TxIconChip :size="32" tone="ink" :font-size="13" label="C" />
        <TxIconChip :size="32" tone="accent" :font-size="13" label="A" />
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.circle }}</span>
      <div class="flex items-center gap-2">
        <TxIconChip :size="14" tone="green" shape="circle" />
        <TxIconChip :size="14" tone="orange" shape="circle" />
        <TxIconChip :size="14" tone="red" shape="circle" />
      </div>
    </div>

    <p class="text-xs text-[var(--tx-text-color-secondary)]">
      {{ copy.ladder }}
    </p>
  </div>
</template>
