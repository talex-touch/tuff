<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const copied = ref(false)
const failed = ref(false)
const installCommand = 'pnpm add @talex-touch/tuffex'

const labels = computed(() => (locale.value === 'zh'
  ? {
      copy: '复制安装命令',
      copied: '已复制',
      idle: '等待复制',
      success: '复制完成，可粘贴到终端。',
      error: '复制失败，请手动选择命令。',
    }
  : {
      copy: 'Copy install command',
      copied: 'Copied',
      idle: 'Ready to copy',
      success: 'Copied. Paste it into your terminal.',
      error: 'Copy failed. Select the command manually.',
    }))

function handleCopy() {
  copied.value = true
  failed.value = false
}

function handleError() {
  failed.value = true
  copied.value = false
}
</script>

<template>
  <div class="grid gap-3 rounded-2xl border border-[var(--tx-border-color)] bg-[var(--tx-fill-color-lighter)] p-4">
    <code class="rounded-xl bg-[var(--tx-bg-color)] px-3 py-2 text-sm">{{ installCommand }}</code>
    <div class="flex flex-wrap items-center gap-3">
      <TxCopyButton
        :text="installCommand"
        :copy-label="labels.copy"
        :copied-label="labels.copied"
        @copy="handleCopy"
        @error="handleError"
      />
      <span class="text-sm text-[var(--tx-text-color-secondary)]">
        {{ failed ? labels.error : copied ? labels.success : labels.idle }}
      </span>
    </div>
  </div>
</template>
