<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const secret = ref('')
const text = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <FlatInput v-model="text" placeholder="请输入内容" />
        <FlatInput v-model="secret" placeholder="密码" password />
  </div>
  <div v-else>
        <FlatInput v-model="text" placeholder="Type something" />
        <FlatInput v-model="secret" placeholder="Password" password />
  </div>
</template>
