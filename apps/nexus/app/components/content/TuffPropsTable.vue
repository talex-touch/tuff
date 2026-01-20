<script setup lang="ts">
interface PropRow {
  name: string
  type?: string
  default?: string
  description?: string
}

const props = withDefaults(defineProps<{ rows?: PropRow[] }>(), {
  rows: () => [],
})
</script>

<template>
  <div class="tuff-props-table">
    <table>
      <thead>
        <tr>
          <th>Prop</th>
          <th>Type</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody v-if="props.rows.length">
        <tr v-for="row in props.rows" :key="row.name">
          <td>
            <code>{{ row.name }}</code>
          </td>
          <td>{{ row.type || '-' }}</td>
          <td>{{ row.default || '-' }}</td>
          <td>{{ row.description || '-' }}</td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr>
          <td colspan="4" class="tuff-props-table__empty">
            No props yet.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.tuff-props-table {
  border: 1px solid var(--docs-border);
  border-radius: 12px;
  overflow: hidden;
}

.tuff-props-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tuff-props-table thead {
  background: rgba(255, 255, 255, 0.7);
}

.tuff-props-table th,
.tuff-props-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--docs-border);
}

.tuff-props-table__empty {
  text-align: center;
  color: var(--docs-muted);
}

:global(.dark .tuff-props-table thead),
:global([data-theme='dark'] .tuff-props-table thead) {
  background: rgba(24, 26, 34, 0.8);
}
</style>
