<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const query = ref('')
const value = ref<string | number | undefined>()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '过滤节点',
      selected: '当前选中',
      empty: '无',
    }
  }

  return {
    placeholder: 'Filter nodes',
    selected: 'Selected',
    empty: 'None',
  }
})

const nodes = computed(() => {
  if (locale.value === 'zh') {
    return [
      {
        key: 'design',
        label: '设计',
        children: [
          { key: 'design-ui', label: '界面设计' },
          { key: 'design-ux', label: '体验设计' },
        ],
      },
      {
        key: 'dev',
        label: '开发',
        children: [
          { key: 'dev-web', label: 'Web' },
          { key: 'dev-app', label: '应用' },
        ],
      },
    ]
  }

  return [
    {
      key: 'design',
      label: 'Design',
      children: [
        { key: 'design-ui', label: 'UI' },
        { key: 'design-ux', label: 'UX' },
      ],
    },
    {
      key: 'dev',
      label: 'Development',
      children: [
        { key: 'dev-web', label: 'Web' },
        { key: 'dev-app', label: 'App' },
      ],
    },
  ]
})

const selectedLabel = computed(() => {
  if (!value.value)
    return labels.value.empty

  const queue = [...nodes.value]
  while (queue.length) {
    const current = queue.shift() as any
    if (!current)
      continue
    if (current.key === value.value)
      return current.label
    if (Array.isArray(current.children))
      queue.push(...current.children)
  }

  return String(value.value)
})
</script>

<template>
  <div class="group" style="max-width: 320px;">
    <TxSearchInput v-model="query" :placeholder="labels.placeholder" />
    <TxTree
      v-model="value"
      :nodes="nodes"
      :default-expanded-keys="['design']"
      :filter-text="query"
    />
    <div style="margin-top: 8px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
      {{ labels.selected }}：{{ selectedLabel }}
    </div>
  </div>
</template>
