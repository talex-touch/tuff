<script setup lang="ts">
// The Beautiful UI "chat" panel, rebuilt from parts that already exist: a
// segmented header, a fixed-height transcript, reasoning sections and a
// composer. No new component was needed for it — which is the point of the
// showcase. The reply timeline is demo state; every component below is a
// controlled primitive.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

type Phase = 'idle' | 'sent' | 'reply1' | 'reply2' | 'done'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const tab = ref('flavors')
const draft = ref('')
const phase = ref<Phase>('done')
const asked = ref('')

const question = computed(() =>
  zh.value ? '把薄荷巧克力和去年夏天对比一下' : 'Compare mint chip to last summer',
)

// idle → sent → reply1 → reply2 → done, at the upstream cadence.
const NEXT: Partial<Record<Phase, [Phase, number]>> = {
  sent: ['reply1', 500],
  reply1: ['reply2', 1400],
  reply2: ['done', 1200],
}

let timer: ReturnType<typeof setTimeout> | undefined

watch(phase, (value) => {
  clearTimeout(timer)
  const next = NEXT[value]
  if (!next)
    return

  timer = setTimeout(() => {
    phase.value = next[0]
  }, next[1])
})

onBeforeUnmount(() => clearTimeout(timer))

const userMessage = computed(() => ({
  id: 'q1',
  role: 'user' as const,
  content: asked.value || question.value,
}))

const salesSteps = computed(() => [
  {
    id: 'sales',
    kind: 'thinking' as const,
    title: zh.value ? '销售历史' : 'Sales History',
    body: zh.value
      ? '去年七月薄荷巧克力周销 412 桶，今年同期 389 桶，回落 5.6%。'
      : 'Mint chip moved 412 tubs a week last July against 389 this year — down 5.6%.',
    status: 'done' as const,
    durationMs: 4000,
  },
])

const trendSteps = computed(() => [
  {
    id: 'trend',
    kind: 'tool' as const,
    title: zh.value ? '趋势识别' : 'Trend Detection',
    body: zh.value
      ? '同期开心果上涨 23%，说明是口味迁移，而不是整体客流下滑。'
      : 'Pistachio rose 23% over the same window, so this is a flavour shift rather than softer footfall.',
    status: 'done' as const,
  },
])

const showUser = computed(() => phase.value !== 'idle')
const showSales = computed(() => phase.value === 'reply1' || phase.value === 'reply2' || phase.value === 'done')
const showTrend = computed(() => phase.value === 'reply2' || phase.value === 'done')
// "Produced but not yet final": the upstream signature is a half-opaque,
// barely-blurred, slightly-shrunk block that settles into place.
const resolving = computed(() => phase.value === 'reply2')

function onSend(payload: { text: string }): void {
  asked.value = payload.text
  draft.value = ''
  phase.value = 'sent'
}

function replay(): void {
  asked.value = ''
  phase.value = 'sent'
}
</script>

<template>
  <div class="chat">
    <header class="chat__bar">
      <TxFlatRadio v-model="tab" size="sm">
        <TxFlatRadioItem value="flavors" :label="zh ? '口味' : 'Flavors'" />
        <TxFlatRadioItem value="suppliers" :label="zh ? '供应商' : 'Suppliers'" />
      </TxFlatRadio>

      <div class="chat__bar-actions">
        <TxIconButton icon="i-carbon-add" size="sm" :label="zh ? '新会话' : 'New thread'" @click="replay" />
        <TxIconButton icon="i-carbon-time" size="sm" :label="zh ? '历史' : 'History'" />
        <TxIconButton icon="i-carbon-overflow-menu-horizontal" size="sm" :label="zh ? '更多' : 'More'" />
      </div>
    </header>

    <!-- Fixed region: the card never changes shape as the reply grows. -->
    <div class="chat__body">
      <TxAiMessage v-if="showUser" :message="userMessage" :show-avatar="false" compact />

      <TxChainOfThought v-if="showSales" :steps="salesSteps" default-open />

      <div v-if="showTrend" class="chat__section" :class="{ 'is-resolving': resolving }">
        <TxChainOfThought :steps="trendSteps" default-open />
      </div>
    </div>

    <TxChatComposer
      v-model="draft"
      :min-rows="1"
      :max-rows="3"
      :placeholder="zh ? '继续追问…' : 'Ask a follow-up…'"
      :send-button-text="zh ? '发送' : 'Send'"
      @send="onSend"
    />
  </div>
</template>

<style scoped lang="scss">
.chat {
  display: flex;
  flex-direction: column;
  height: 288px;
  max-width: 380px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--tx-fill-color-blank, #fff);
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter), 0 1px 2px rgb(16 24 40 / 4%), 0 2px 6px rgb(16 24 40 / 3%);
}

.chat__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.chat__bar-actions {
  display: flex;
  gap: 2px;
}

.chat__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 10px 12px 4px;
  overflow-y: auto;
}

.chat__section {
  transition:
    opacity 400ms cubic-bezier(0.23, 1, 0.32, 1),
    filter 400ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 400ms cubic-bezier(0.23, 1, 0.32, 1);
  transform-origin: top left;

  // Half a pixel of blur: enough to read as unsettled, not enough to read as
  // blurred. Kept demo-local until a second surface needs the same state.
  &.is-resolving {
    opacity: 0.55;
    filter: blur(0.5px);
    transform: scale(0.985);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat__section {
    transition: none;
  }
}
</style>
