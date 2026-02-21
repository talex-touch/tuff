<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const messages = ref([
  { role: 'assistant', content: 'Hello, how can I help?' },
  { role: 'user', content: 'Show me the docs.' },
])
const handleImageClick = (event: MouseEvent) => {
  console.log('imageClick', event)
}
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 680px;">
      <TxChatList
        :messages="messages"
        :markdown="true"
        :stagger="true"
        @image-click="handleImageClick"
      />
    </div>
  </div>
  <div v-else>
    <div style="width: 680px;">
      <TxChatList
        :messages="messages"
        :markdown="true"
        :stagger="true"
        @image-click="handleImageClick"
      />
    </div>
  </div>
</template>
