<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()
const paused = ref(false)
const autoScroll = ref(true)
const history = ref(false)
const records = ref<string[]>(['\x1B[32m[info]\x1B[0m TuffEx · 中文日志 ✓'])
const visible = ref<string[]>([...records.value])
let sequence = 0

const copy = computed(() => locale.value === 'zh'
  ? {
      label: '只读日志演示',
      description: '日志来自页面中的记录数组，展示、选择和复制均不需要进程。暂停仅冻结显示。',
      append: '追加日志',
      edit: '修改首行',
      clear: '清空',
      paused: '暂停显示',
      scroll: '自动滚动',
      history: '切换历史',
      live: '实时记录',
      archived: '历史记录',
      log: '追加记录',
      edited: '首行已原地修改',
    }
  : {
      label: 'Read-only log demo',
      description: 'Logs come from this page’s record array. Display, selection and copying need no process. Pause freezes the display only.',
      append: 'Append log',
      edit: 'Edit first line',
      clear: 'Clear',
      paused: 'Pause display',
      scroll: 'Auto scroll',
      history: 'Switch history',
      live: 'Live records',
      archived: 'Historical records',
      log: 'Appended record',
      edited: 'First line changed in place',
    })

const archived = computed(() => [
  `\x1B[34m[history]\x1B[0m ${copy.value.archived}`,
  '[info] session 001 · 中文 ✓',
])
const lines = computed(() => history.value ? archived.value : visible.value)

function append(): void {
  sequence += 1
  const line = `\x1B[36m[${String(sequence).padStart(3, '0')}]\x1B[0m ${copy.value.log}`
  records.value.push(line)
  if (!paused.value)
    visible.value.push(line)
}

function edit(): void {
  const line = `\x1B[33m[edit]\x1B[0m ${copy.value.edited}`
  records.value[0] = line
  if (!paused.value)
    visible.value[0] = line
}

function clear(): void {
  records.value.length = 0
  visible.value.length = 0
  history.value = false
}

watch(paused, (value) => {
  if (!value)
    visible.value = [...records.value]
})
</script>

<template>
  <div class="terminal-logs-demo not-prose">
    <p>{{ copy.description }}</p>
    <div class="terminal-logs-demo__toolbar">
      <TxButton size="sm" @click="append">
        {{ copy.append }}
      </TxButton>
      <TxButton size="sm" @click="edit">
        {{ copy.edit }}
      </TxButton>
      <TxButton size="sm" @click="clear">
        {{ copy.clear }}
      </TxButton>
      <TxButton size="sm" @click="history = !history">
        {{ copy.history }}
      </TxButton>
      <label><TxSwitch v-model="paused" /><span>{{ copy.paused }}</span></label>
      <label><TxSwitch v-model="autoScroll" /><span>{{ copy.scroll }}</span></label>
    </div>
    <span class="terminal-logs-demo__source">{{ history ? copy.archived : copy.live }}</span>
    <div class="terminal-logs-demo__host">
      <TxTerminal read-only :lines="lines" :auto-scroll="autoScroll" :labels="{ ariaLabel: copy.label }" />
    </div>
  </div>
</template>

<style scoped>
.terminal-logs-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
}

.terminal-logs-demo p {
  margin: 0;
  line-height: 1.5;
}

.terminal-logs-demo__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.terminal-logs-demo label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.terminal-logs-demo__source {
  color: var(--tx-text-color-primary, #303133);
  font-weight: 500;
}

.terminal-logs-demo__host {
  height: 224px;
  min-width: 0;
}
</style>
