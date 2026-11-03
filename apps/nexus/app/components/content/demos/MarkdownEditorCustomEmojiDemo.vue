<script setup lang="ts">
import type { TxEmojiPack } from '@talex-touch/tuffex/markdown-editor'
import { computed, ref, watch } from 'vue'
import { MARKDOWN_EDITOR_ZH_LABELS } from './markdown-editor-demo-labels'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const lang = computed<'zh' | 'en'>(() => (zh.value ? 'zh' : 'en'))

const SAMPLES = {
  zh: '## 发布日\n\n今天的版本 :party_parrot: 顺利上线 :ship_it:。输入冒号可以从表情包里补全；表情包里没有的 :no_such_emoji: 保持原样。',
  en: '## Release day\n\nToday the build shipped :ship_it: and the team is glad :party_parrot:. Type a colon to complete from the packs; a name no pack has, like :no_such_emoji:, stays as text.',
}

const COPY = {
  zh: {
    hint: '表情包里的图片以 :name: 的形式写进文档；预览与所见即所得里显示为图片，源码模式里是文字。工具栏的表情按钮打开选择器，每个包是一个标签页。',
    stored: '文档里的源码',
  },
  en: {
    hint: 'Pack images are written into the document as :name:; preview and WYSIWYG show them as images, and source mode shows the text. The toolbar emoji button opens the picker, with one tab per pack.',
    stored: 'Markdown source',
  },
}

function svg(body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`
}

const CAT_HAPPY = svg('<circle cx="16" cy="17" r="12" fill="#f59e0b"/><path d="M8 4l5 7M24 4l-5 7" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8" fill="#1f2937"/><circle cx="20" cy="15" r="1.8" fill="#1f2937"/><path d="M11 21q5 4 10 0" stroke="#1f2937" stroke-width="2" fill="none" stroke-linecap="round"/>')
const CAT_SAD = svg('<circle cx="16" cy="17" r="12" fill="#f59e0b"/><path d="M8 4l5 7M24 4l-5 7" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8" fill="#1f2937"/><circle cx="20" cy="15" r="1.8" fill="#1f2937"/><path d="M11 25q5-4 10 0" stroke="#1f2937" stroke-width="2" fill="none" stroke-linecap="round"/>')
const PARROT = svg('<circle cx="16" cy="16" r="12" fill="#22c55e"/><path d="M4 16l8-6v12z" fill="#ef4444"/><circle cx="20" cy="13" r="2" fill="#111827"/>')
const SHIP = svg('<path d="M4 20h24l-4 6H8z" fill="#2563eb"/><path d="M16 4v16" stroke="#64748b" stroke-width="2"/><path d="M16 5l8 9h-8z" fill="#f97316"/>')

const ITEMS = [
  {
    id: 'cats',
    name: { zh: '猫咪', en: 'Cats' },
    emoji: [
      { name: 'cat_happy', src: CAT_HAPPY, keywords: { zh: '开心 微笑', en: 'happy smile' } },
      { name: 'cat_sad', src: CAT_SAD, keywords: { zh: '难过', en: 'sad' } },
    ],
  },
  {
    id: 'party',
    name: { zh: '派对', en: 'Party' },
    emoji: [
      { name: 'party_parrot', src: PARROT, keywords: { zh: '庆祝 开心', en: 'celebrate party' } },
      { name: 'ship_it', src: SHIP, keywords: { zh: '发布 上线', en: 'release launch' } },
    ],
  },
]

const packs = computed<TxEmojiPack[]>(() => ITEMS.map(pack => ({
  id: pack.id,
  name: pack.name[lang.value],
  emoji: pack.emoji.map(emoji => ({ name: emoji.name, src: emoji.src, keywords: emoji.keywords[lang.value] })),
})))

const sample = computed(() => (zh.value ? SAMPLES.zh : SAMPLES.en))
const copy = computed(() => (zh.value ? COPY.zh : COPY.en))
const labels = computed(() => (zh.value ? MARKDOWN_EDITOR_ZH_LABELS : undefined))

const content = ref(sample.value)
watch(zh, () => {
  content.value = sample.value
})

const stored = computed(() => content.value.split('\n').at(-1) ?? '')
</script>

<template>
  <div class="not-prose grid gap-2">
    <TxMarkdownEditor
      v-model="content"
      :labels="labels"
      :emoji-packs="packs"
      :min-height="240"
      :max-height="420"
    />
    <span class="text-sm text-[var(--tx-text-color-secondary)]">{{ copy.hint }}</span>
    <code class="text-xs text-[var(--tx-text-color-secondary)] break-all">{{ copy.stored }}: {{ stored }}</code>
  </div>
</template>
