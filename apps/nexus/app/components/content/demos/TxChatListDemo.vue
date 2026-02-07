<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const messages = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 680px;">
      <TxChatList
        :messages="messages"
        :markdown="true"
        :stagger="true"
        @image-click="(e) => console.log('imageClick', e)"
      />
    </div>
  </div>
  <div v-else>
    <div style="width: 680px;">
      <TxChatList
        :messages="messages"
        :markdown="true"
        :stagger="true"
        @image-click="(e) => console.log('imageClick', e)"
      />
    </div>
  </div>
</template>
