# Chat 消息列表

常见 AI 消息列表（支持 markdown、图片缩略图、消息依次进入）。

<script setup lang="ts">
import { ref } from 'vue'

const messages = ref([
  {
    id: 'm1',
    role: 'system',
    content: 'System message',
    createdAt: Date.now() - 60_000,
  },
  {
    id: 'm2',
    role: 'user',
    content: 'Show me **markdown** and an image.',
    createdAt: Date.now() - 30_000,
    attachments: [
      { type: 'image', url: 'https://picsum.photos/seed/tuffex/420/280', name: 'demo' },
    ],
  },
  {
    id: 'm3',
    role: 'assistant',
    content: 'Here is some code:\n\n```ts\nexport const hello = 1\n```',
    createdAt: Date.now() - 10_000,
  },
])
</script>

## 基础用法

<DemoBlock title="ChatList">
<template #preview>
<div style="width: 680px;">
  <TxChatList
    :messages="messages"
    :markdown="true"
    :stagger="true"
    @imageClick="(e) => console.log('imageClick', e)"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxChatList :messages="messages" :markdown="true" :stagger="true" />
</template>
```
</template>
</DemoBlock>
