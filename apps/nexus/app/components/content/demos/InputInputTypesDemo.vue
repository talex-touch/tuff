<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const content = ref('')
const password = ref('')
const text = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffInput v-model="text" placeholder="文本输入" />
        <TuffInput v-model="password" type="password" placeholder="密码输入" />
        <TuffInput v-model="content" type="textarea" placeholder="多行文本" :rows="4" />
  </div>
  <div v-else>
        <TuffInput v-model="text" placeholder="Text input" />
        <TuffInput v-model="password" type="password" placeholder="Password input" />
        <TuffInput v-model="content" type="textarea" placeholder="Multiline text" :rows="4" />
  </div>
</template>
