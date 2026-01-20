<script setup lang="ts">
const props = withDefaults(defineProps<{
  code: string
  lang?: string
  title?: string
}>(), {
  lang: 'vue',
  title: '',
})
</script>

<template>
  <div class="tuff-code-block">
    <div v-if="props.title" class="tuff-code-block__title">
      {{ props.title }}
    </div>
    <pre class="tuff-code-block__pre"><code :class="`language-${props.lang}`" v-text="props.code" /></pre>
  </div>
</template>

<style scoped>
.tuff-code-block {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--docs-border);
  background: var(--docs-code-bg);
}

.tuff-code-block__title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--docs-ink);
  border-bottom: 1px solid var(--docs-border);
  background: rgba(255, 255, 255, 0.65);
}

.tuff-code-block__pre {
  margin: 0;
  padding: 12px;
  background: transparent;
}

:global(.dark .tuff-code-block__title),
:global([data-theme='dark'] .tuff-code-block__title) {
  background: rgba(20, 22, 28, 0.85);
}
</style>
