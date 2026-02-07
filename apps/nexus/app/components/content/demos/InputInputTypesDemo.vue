<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const content = ref('')
const password = ref('')
const text = ref('')

const labels = computed(() => (locale.value === 'zh'
  ? {
      text: '文本输入',
      password: '密码输入',
      content: '多行文本',
    }
  : {
      text: 'Text input',
      password: 'Password input',
      content: 'Multiline text',
    }))
</script>

<template>
  <div style="display: grid; gap: 10px;">
    <TuffInput v-model="text" :placeholder="labels.text" />
    <TuffInput v-model="password" type="password" :placeholder="labels.password" />
    <TuffInput v-model="content" type="textarea" :placeholder="labels.content" :rows="4" />
  </div>
</template>
