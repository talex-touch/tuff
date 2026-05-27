<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex'
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()

const value = ref<TxSelectValue>('agent-builder')
const remoteOptions = ref<Array<{ value: string, label: string }>>([])
const lastQuery = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      placeholder: '搜索远程能力',
      selected: '当前选中',
      query: '最近查询',
      emptyQuery: '未输入',
      hint: 'remote + editable 会把触发器输入作为查询发出。',
    }
  }

  return {
    placeholder: 'Search remote capability',
    selected: 'Selected',
    query: 'Last query',
    emptyQuery: 'None',
    hint: 'remote + editable emits the trigger input as a search query.',
  }
})

function buildOptions() {
  if (locale.value === 'zh') {
    return [
      { value: 'agent-builder', label: 'Agent Builder' },
      { value: 'flow-runner', label: 'Flow Runner' },
      { value: 'release-inspector', label: 'Release Inspector' },
      { value: 'policy-auditor', label: 'Policy Auditor' },
      { value: 'sync-console', label: 'Sync Console' },
      { value: 'telemetry-review', label: 'Telemetry Review' },
    ]
  }

  return [
    { value: 'agent-builder', label: 'Agent Builder' },
    { value: 'flow-runner', label: 'Flow Runner' },
    { value: 'release-inspector', label: 'Release Inspector' },
    { value: 'policy-auditor', label: 'Policy Auditor' },
    { value: 'sync-console', label: 'Sync Console' },
    { value: 'telemetry-review', label: 'Telemetry Review' },
  ]
}

function onSearch(query: string) {
  lastQuery.value = query
  const normalized = query.trim().toLowerCase()
  const options = buildOptions()

  if (!normalized) {
    remoteOptions.value = options
    return
  }

  remoteOptions.value = options.filter(option => option.label.toLowerCase().includes(normalized))
}

watch(
  () => locale.value,
  () => {
    remoteOptions.value = buildOptions()
  },
  { immediate: true },
)
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <TuffSelect
      v-model="value"
      remote
      editable
      :placeholder="labels.placeholder"
      @search="onSearch"
    >
      <TuffSelectItem
        v-for="option in remoteOptions"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
    </TuffSelect>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value }}
      </div>
      <div class="tx-demo__meta">
        {{ labels.query }}: {{ lastQuery || labels.emptyQuery }}
      </div>
      <div class="select-demo__hint">
        {{ labels.hint }}
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.select-demo__hint {
  margin-top: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
