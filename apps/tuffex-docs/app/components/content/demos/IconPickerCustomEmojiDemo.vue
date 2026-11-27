<script setup lang="ts">
import type { TxEmojiPack } from '@talex-touch/tuffex/icon-picker'
import { TxIconPicker } from '@talex-touch/tuffex/icon-picker'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const identifier = ref('')

function svg(body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`
}

const SHIP = svg('<path d="M4 20h24l-4 6H8z" fill="#2563eb"/><path d="M16 4v16" stroke="#64748b" stroke-width="2"/><path d="M16 5l8 9h-8z" fill="#f97316"/>')
const CAT = svg('<circle cx="16" cy="17" r="12" fill="#f59e0b"/><path d="M8 4l5 7M24 4l-5 7" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8" fill="#1f2937"/><circle cx="20" cy="15" r="1.8" fill="#1f2937"/>')

const packs = computed<TxEmojiPack[]>(() => [
  {
    id: 'team',
    name: zh.value ? '团队' : 'Team',
    emoji: [
      { name: 'ship_it', src: SHIP, keywords: zh.value ? '发布 上线' : 'release launch' },
      { name: 'cat_happy', src: CAT, keywords: zh.value ? '开心 微笑' : 'happy smile' },
    ],
  },
])

const copy = computed(() => (zh.value
  ? {
      trigger: '触发器（只显示表情分区）',
      inline: '内联模式',
      stored: '存下来的值',
      note: '自定义表情选中后存为 url: 标识符，值就是图片地址；内置表情仍是字符。',
    }
  : {
      trigger: 'Trigger (emoji section only)',
      inline: 'Inline mode',
      stored: 'Stored value',
      note: 'A custom emoji is stored as a url: identifier whose value is the image address; built-in emoji stay characters.',
    }))

const stored = computed(() => (identifier.value.length > 56 ? `${identifier.value.slice(0, 56)}…` : identifier.value || '""'))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.trigger }}</span>
      <div class="flex items-center gap-3">
        <TxIconPicker v-model="identifier" :emoji-packs="packs" :sections="['emoji']" />
        <code class="text-xs text-[var(--tx-text-color-secondary)] break-all">{{ copy.stored }}: {{ stored }}</code>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.inline }}</span>
      <TxIconPicker v-model="identifier" inline :emoji-packs="packs" :sections="['emoji']" />
    </div>

    <p class="text-xs text-[var(--tx-text-color-secondary)]">
      {{ copy.note }}
    </p>
  </div>
</template>
