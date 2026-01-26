<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import DocAsideCards from './components/DocAsideCards.vue'

const { frontmatter, page } = useData()

const isComponentDoc = computed(() => {
  const path = page.value.filePath || page.value.relativePath || ''
  return path.startsWith('components/')
})

const showAsideExtras = computed(() => {
  if (frontmatter.value?.aside === false)
    return false
  return isComponentDoc.value
})
</script>

<template>
  <DefaultTheme.Layout>
    <template #aside-top>
      <DocAsideCards v-if="showAsideExtras" />
    </template>
  </DefaultTheme.Layout>
</template>
