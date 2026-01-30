<script setup lang="ts">
import TuffPropsTable from '~/components/content/TuffPropsTable.vue'

interface PropRow {
  name: string
  type?: string
  default?: string
  description?: string
  values?: string[]
}

const props = withDefaults(defineProps<{
  title?: string
  rows?: PropRow[]
}>(), {
  title: '',
  rows: () => [],
})
</script>

<template>
  <section class="tuff-api-table">
    <h3 v-if="props.title" class="tuff-api-table__title">
      {{ props.title }}
    </h3>
    <TuffPropsTable :rows="props.rows" />
  </section>
</template>

<style scoped>
.tuff-api-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tuff-api-table__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--docs-ink);
}
</style>
