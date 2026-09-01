<script setup lang="ts">
import type { PromptBarSendPayload } from '@tuffex-components/prompt-bar'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Attachment {
  kind: 'file'
  id: string
  name: string
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const variant = ref<'rounded' | 'pill'>('rounded')
const draft = ref('')
const model = ref('sprinkles')
const listening = ref(false)
const attachments = ref<Attachment[]>([])
const sent = ref<string | null>(null)
const connected = ref(false)

const sources = computed(() => [
  {
    key: 'attach',
    name: zh.value ? '添加图片与文件' : 'Add photos & files',
    desc: zh.value ? '从本机上传' : 'Upload from your computer',
    attach: true,
  },
  { key: 'scoop', name: 'Scoop Data', desc: zh.value ? '销售与流失指标' : 'Sales & churn metrics' },
  { key: 'flavors', name: 'Flavor records', desc: zh.value ? '26 家供应商、标签、链接' : '26 makers, tags, links' },
  { key: 'web', name: 'Web search', desc: zh.value ? '实时新闻与资讯' : 'Real-time news and info' },
  {
    key: 'gmail',
    name: 'Gmail',
    desc: zh.value ? '读取与管理邮件' : 'Read and manage Gmail',
    connectable: true,
    connected: connected.value,
  },
])

const commands = computed(() => [
  { key: 'compare', name: '/compare', desc: zh.value ? '与去年夏天对比' : 'Flavor vs. last summer' },
  { key: 'churn-plan', name: '/churn-plan', desc: zh.value ? '起草流失应对计划' : 'Draft a churn schedule' },
  { key: 'restock', name: '/restock', desc: zh.value ? '生成补货清单' : 'Build a reorder list' },
  { key: 'summarize', name: '/summarize', desc: zh.value ? '总结当前会话' : 'Digest the thread so far' },
])

const models = [
  { key: 'sprinkles', name: 'Sprinkles 5', tag: 'Flagship' },
  { key: 'vanilla', name: 'Vanilla 1', tag: 'Basic' },
  { key: 'freezer', name: 'Freezer Burn 0.4', tag: 'Stale' },
]

const FILES = ['flavor-chart.png', 'summer-menu.pdf', 'pos-export.csv']

// Dictation is the host's job: the bar only shows the listening state, so the
// demo stands in for a recogniser and lands a transcript after a beat.
const DICTATION_MS = 2200
let dictationTimer: ReturnType<typeof setTimeout> | undefined

watch(listening, (on) => {
  clearTimeout(dictationTimer)
  if (!on)
    return

  dictationTimer = setTimeout(() => {
    const transcript = zh.value ? '把开心果周末和去年夏天对比一下' : 'Compare pistachio weekends to last summer'
    draft.value = draft.value ? `${draft.value.trimEnd()} ${transcript}` : transcript
    listening.value = false
  }, DICTATION_MS)
})

onBeforeUnmount(() => clearTimeout(dictationTimer))

function addAttachment(): void {
  const name = FILES[attachments.value.length % FILES.length]!
  attachments.value = [
    ...attachments.value,
    { kind: 'file', id: `${name}-${attachments.value.length}`, name },
  ]
}

function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter(item => item.id !== id)
}

function onSend(payload: PromptBarSendPayload): void {
  sent.value = payload.attachments.length > 0
    ? `${payload.text} · ${payload.attachments.length} attached`
    : payload.text
  // Attachments are host-owned, so the bar clears its text and leaves these.
  attachments.value = []
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <TxFlatRadio v-model="variant" size="sm">
      <TxFlatRadioItem value="rounded" label="Rounded" />
      <TxFlatRadioItem value="pill" label="Pill" />
    </TxFlatRadio>

    <TxPromptBar
      v-model="draft"
      v-model:model="model"
      v-model:listening="listening"
      :variant="variant"
      :sources="sources"
      :commands="commands"
      :models="models"
      :attachments="attachments"
      dictatable
      :placeholder="zh ? '写点什么…' : 'Write a message…'"
      :listening-placeholder="zh ? '正在聆听…' : 'Listening…'"
      @attach="addAttachment"
      @attachment-remove="removeAttachment"
      @connect-toggle="connected = !connected"
      @send="onSend"
    />

    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      <template v-if="sent">
        {{ zh ? '已发送：' : 'Sent: ' }}<code>{{ sent }}</code>
      </template>
      <template v-else>
        {{ zh
          ? '输入 @ 打开数据源，输入 / 打开命令；↑↓ 选择、Enter 确认。'
          : 'Type @ for sources or / for commands; ↑↓ to move, Enter to pick.' }}
      </template>
    </p>
  </div>
</template>
