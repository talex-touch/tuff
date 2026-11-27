<script setup lang="ts">
import type { ChatMessageModel } from '@talex-touch/tuffex/chat'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const previewedImage = ref('')
const attachmentImage = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22280%22 viewBox=%220 0 420 280%22%3E%3Crect width=%22420%22 height=%22280%22 rx=%2232%22 fill=%22%23eef2ff%22/%3E%3Ccircle cx=%22316%22 cy=%2290%22 r=%2244%22 fill=%22%23c7d2fe%22/%3E%3Cpath d=%22M64 218l82-86 62 58 44-42 104 70H64z%22 fill=%22%236366f1%22 opacity=%22.9%22/%3E%3C/svg%3E'

const messages = computed<ChatMessageModel[]>(() => (locale.value === 'zh'
  ? [
      {
        id: 'system-1',
        role: 'system',
        content: '当前对话启用了 **Markdown** 渲染与图片附件预览。',
        createdAt: 1_705_000_000_000,
      },
      {
        id: 'user-1',
        role: 'user',
        content: '请审阅这张发布封面，并给出一个简短结论。',
        createdAt: 1_705_000_060_000,
        attachments: [
          { type: 'image', url: attachmentImage, name: 'release-cover.svg' },
        ],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '结论：封面层级清晰，可以进入发布说明。\n\n```ts\nconst status = "ready"\n```',
        createdAt: 1_705_000_120_000,
      },
    ]
  : [
      {
        id: 'system-1',
        role: 'system',
        content: 'This thread has **Markdown** rendering and image attachments enabled.',
        createdAt: 1_705_000_000_000,
      },
      {
        id: 'user-1',
        role: 'user',
        content: 'Review this release cover and give a short conclusion.',
        createdAt: 1_705_000_060_000,
        attachments: [
          { type: 'image', url: attachmentImage, name: 'release-cover.svg' },
        ],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Conclusion: the cover hierarchy is clear enough for the release notes.\n\n```ts\nconst status = "ready"\n```',
        createdAt: 1_705_000_120_000,
      },
    ]))

const helperText = computed(() => {
  if (previewedImage.value)
    return locale.value === 'zh' ? `已点击附件：${previewedImage.value}` : `Clicked attachment: ${previewedImage.value}`
  return locale.value === 'zh' ? '点击缩略图会触发 imageClick。' : 'Click the thumbnail to emit imageClick.'
})

function handleImageClick(payload: { url: string, name?: string, messageId: string }) {
  previewedImage.value = payload.name ?? payload.url
}
</script>

<template>
  <div class="grid gap-3">
    <TxChatList :messages="messages" :markdown="true" :stagger="true" @image-click="handleImageClick" />
    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      {{ helperText }}
    </p>
  </div>
</template>
