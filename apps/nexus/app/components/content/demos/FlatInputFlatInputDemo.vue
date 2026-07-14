<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const text = ref('')
const secret = ref('')
const note = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      search: '搜索项目',
      password: '输入密码',
      note: '补充说明',
    }
  }

  return {
    search: 'Search projects',
    password: 'Password',
    note: 'Additional notes',
  }
})
</script>

<template>
  <div class="flat-input-demo">
    <FlatInput v-model="text" icon="i-carbon-search" :placeholder="labels.search" />
    <FlatInput v-model="secret" :placeholder="labels.password" password />
    <FlatInput v-model="note" :placeholder="labels.note" area :non-win="true" />
  </div>
</template>

<style scoped>
.flat-input-demo {
  display: grid;
  width: min(420px, 100%);
  gap: 12px;
}
</style>
