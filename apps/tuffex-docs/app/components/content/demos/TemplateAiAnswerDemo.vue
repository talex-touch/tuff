<script setup lang="ts">
import type { AiSourceItem, AiSuggestion } from '@talex-touch/tuffex/ai-elements'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { StreamState } from '@talex-touch/tuffex/stream-text'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import TemplateFrame from './TemplateFrame.vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

type TopicId = 'cold' | 'memory' | 'power' | 'shards' | 'custom'

interface Topic {
  question: string
  answer: string
  followUps: TopicId[]
}

interface Turn {
  id: number
  topic: TopicId
  question: string
  /** What the source has sent so far; the element paces it on screen. */
  received: string
  /** The source is still sending. */
  live: boolean
  stopped: boolean
  /** The element's own state, for the header. */
  phase: StreamState
  /** Bumped by Regenerate: a fresh element plays the answer again. */
  gen: number
  /** Cancels the ticks of an earlier run of the same turn. */
  run: number
  feedback: 'up' | 'down' | null
  /** Bumped by a chip, so the source stack remounts open. */
  sourcesKey: number
}

interface Row {
  id: string
  kind: 'ask' | 'reply' | 'tail'
  turn: number
}

const DOCS = 'https://tuff.tagzxia.com/docs/dev'

function favicon(letter: string, fill: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='${fill}'/><text x='16' y='22' text-anchor='middle' font-family='Helvetica,Arial,sans-serif' font-size='17' font-weight='700' fill='#fff'>${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const FENCE = '```'

const COPY = {
  zh: {
    title: '问答助手',
    answering: '正在回答…',
    ready: '可以提问',
    reset: '重新开始',
    stop: '停止生成',
    stopped: '已停止生成',
    you: '你',
    placeholder: '继续追问，或问点别的…',
    busy: '正在回答…',
    send: '发送',
    hostOpens: (url: string) => `宿主会打开：${url}`,
    sourcesLabel: (count: number) => `引用了 ${count} 个来源`,
    copyLabel: '复制',
    copiedLabel: '已复制',
    regenerateLabel: '重新生成',
    helpful: '有帮助',
    unhelpful: '没帮助',
    sources: [
      { id: 'engine', url: `${DOCS}/architecture/search-engine`, title: '搜索引擎落地图', favicon: favicon('S', '#1b8fd4') },
      { id: 'corebox', url: `${DOCS}/architecture/corebox-system`, title: 'CoreBox 系统落地图', favicon: favicon('C', '#7a5af8') },
      { id: 'power', url: `${DOCS}/api/power`, title: 'PowerSDK', favicon: favicon('P', '#189a4d') },
    ] as AiSourceItem[],
    topics: {
      cold: {
        question: '为什么 CoreBox 第一次搜索比较慢？',
        answer: [
          '## 慢在冷启动，不在排序',
          '',
          '第一次唤起时，搜索引擎要先把索引读进内存，还要等各个 Provider 准备好数据 [1]。之后的查询直接命中内存，排序本身只占一小部分 [2]。',
          '',
          '- 首查要读索引，之后命中内存',
          '- 应用图标第一次解码后才进缓存',
          '- 插件 Provider 首次加载各自的数据 [1]',
          '',
          '想让第一次也快，可以在空闲时预热，省电模式下跳过 [3]：',
          '',
          `${FENCE}ts`,
          'import { usePowerSDK } from \'@talex-touch/utils/plugin/sdk\'',
          '',
          'const power = usePowerSDK()',
          'if (!(await power.isLowPower()))',
          '  await prewarmIndex() // 示意：读入常用索引',
          FENCE,
        ].join('\n'),
        followUps: ['memory', 'power'],
      },
      memory: {
        question: '预热会多占多少内存？',
        answer: [
          '取决于预热多少内容 [1]。下表是示例数据，只作定性比较：',
          '',
          '| 策略 | 第一次搜索 | 常驻内存 |',
          '| --- | --- | --- |',
          '| 不预热 | 慢 | 最低 |',
          '| 只预热常用索引 | 快 | 小幅增加 |',
          '| 全部预热 | 最快 | 明显增加 |',
          '',
          '- 先只预热最近常用的应用和文件',
          '- 省电模式下跳过预热 [3]',
        ].join('\n'),
        followUps: ['shards', 'power'],
      },
      power: {
        question: '只在插电时预热怎么写？',
        answer: [
          '用 PowerSDK 读当前的供电状态，插着电、又没进省电模式时再预热 [3]：',
          '',
          `${FENCE}ts`,
          'const power = usePowerSDK()',
          'const { onBattery, lowPower } = await power.getLowPowerStatus()',
          'if (!onBattery && !lowPower)',
          '  await prewarmIndex()',
          FENCE,
          '',
          '进入省电模式时，`onLowPowerChanged` 会通知你，可以借此停下正在进行的预热 [3]。',
        ].join('\n'),
        followUps: ['memory', 'shards'],
      },
      shards: {
        question: '能只预热常用的那部分吗？',
        answer: [
          '可以。推荐系统本来就记录了使用频率 [1]，按它挑出最常用的那部分来预热：',
          '',
          '1. 读取最近一周的使用统计',
          '2. 挑出最常用的应用和文件',
          '3. 空闲时按顺序读入',
          '',
          '这样常用的查询第一次就能命中内存 [2]。',
        ].join('\n'),
        followUps: ['memory', 'power'],
      },
      custom: {
        question: '',
        answer: [
          '这是模板里的预设回答：真实产品会把问题交给模型，这里用同一段文字演示流式输出。',
          '',
          '- 段落、列表和代码在同一个节奏里逐词出现',
          '- 编号引用会变成可以打开的来源 [1]',
          '- 回答完成后才出现操作、来源和追问',
        ].join('\n'),
        followUps: ['cold', 'memory'],
      },
    } as Record<TopicId, Topic>,
  },
  en: {
    title: 'Answer assistant',
    answering: 'Answering…',
    ready: 'Ready',
    reset: 'Start over',
    stop: 'Stop generating',
    stopped: 'Generation stopped',
    you: 'You',
    placeholder: 'Ask a follow-up, or something else…',
    busy: 'Answering…',
    send: 'Send',
    hostOpens: (url: string) => `The host would open ${url}`,
    sourcesLabel: (count: number) => `Used ${count} source${count === 1 ? '' : 's'}`,
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    regenerateLabel: 'Regenerate',
    helpful: 'Helpful',
    unhelpful: 'Not helpful',
    sources: [
      { id: 'engine', url: `${DOCS}/architecture/search-engine`, title: 'Search engine map', favicon: favicon('S', '#1b8fd4') },
      { id: 'corebox', url: `${DOCS}/architecture/corebox-system`, title: 'CoreBox system map', favicon: favicon('C', '#7a5af8') },
      { id: 'power', url: `${DOCS}/api/power`, title: 'PowerSDK', favicon: favicon('P', '#189a4d') },
    ] as AiSourceItem[],
    topics: {
      cold: {
        question: 'Why is the first CoreBox search slow?',
        answer: [
          '## It is the cold start, not the ranking',
          '',
          'On the first launch the search engine has to load its index into memory and wait for every provider to get its data ready [1]. After that, queries hit memory, and ranking is only a small part of the time [2].',
          '',
          '- The first query reads the index; later ones hit memory',
          '- App icons are decoded once, then cached',
          '- Plugin providers load their data the first time [1]',
          '',
          'To make the first search fast too, warm up while idle and skip it in low-power mode [3]:',
          '',
          `${FENCE}ts`,
          'import { usePowerSDK } from \'@talex-touch/utils/plugin/sdk\'',
          '',
          'const power = usePowerSDK()',
          'if (!(await power.isLowPower()))',
          '  await prewarmIndex() // sketch: load the common index',
          FENCE,
        ].join('\n'),
        followUps: ['memory', 'power'],
      },
      memory: {
        question: 'How much memory does warming up take?',
        answer: [
          'It depends on how much you warm up [1]. The table is sample data, for a qualitative comparison only:',
          '',
          '| Strategy | First search | Resident memory |',
          '| --- | --- | --- |',
          '| No warm-up | Slow | Lowest |',
          '| Common index only | Fast | Slightly more |',
          '| Everything | Fastest | Noticeably more |',
          '',
          '- Start with the apps and files used most recently',
          '- Skip warming up in low-power mode [3]',
        ].join('\n'),
        followUps: ['shards', 'power'],
      },
      power: {
        question: 'How do I warm up only when plugged in?',
        answer: [
          'Read the power state with PowerSDK and warm up only when the machine is plugged in and not in low-power mode [3]:',
          '',
          `${FENCE}ts`,
          'const power = usePowerSDK()',
          'const { onBattery, lowPower } = await power.getLowPowerStatus()',
          'if (!onBattery && !lowPower)',
          '  await prewarmIndex()',
          FENCE,
          '',
          'When low-power mode kicks in, `onLowPowerChanged` tells you, so you can stop a warm-up in progress [3].',
        ].join('\n'),
        followUps: ['memory', 'shards'],
      },
      shards: {
        question: 'Can I warm up only the common part?',
        answer: [
          'Yes. The recommendation system already records how often things are used [1]; pick the most used part with it:',
          '',
          '1. Read the last week of usage stats',
          '2. Pick the most used apps and files',
          '3. Load them in order while idle',
          '',
          'That way the common queries hit memory from the first search [2].',
        ].join('\n'),
        followUps: ['memory', 'power'],
      },
      custom: {
        question: '',
        answer: [
          'This is the template\'s canned answer: a real product would send your question to a model, and here the same text shows the streaming.',
          '',
          '- Paragraphs, lists and code come in on one cadence',
          '- Numbered citations become sources you can open [1]',
          '- Actions, sources and follow-ups appear once the answer is done',
        ].join('\n'),
        followUps: ['cold', 'memory'],
      },
    } as Record<TopicId, Topic>,
  },
}

const copy = computed(() => (zh.value ? COPY.zh : COPY.en))

/** The first answer pauses once after its opening paragraph, as a model does. */
const PAUSE_MS = 900
const AUTO_ASK_MS = 1600
const HINT_MS = 3200

function newSession(): string {
  return Math.random().toString(36).slice(2, 10)
}

function initialState() {
  // Row ids are unique across resets: the session prefix changes every time,
  // and it also keys the stream, so no measured height outlives its rows.
  const session = newSession()
  return {
    session,
    turns: [] as Turn[],
    // A permanent last row. TxConversationStream keeps its last item outside
    // the virtual list and remounts it when the next one arrives; with this
    // tail there, every real row mounts once and keeps its state.
    items: [{ id: `${session}-tail`, kind: 'tail', turn: -1 }] as Row[],
    hint: '',
  }
}

const state = reactive(initialState())
const draft = ref('')
const reduced = ref(false)
const streamRef = ref<TxConversationStreamInstance | null>(null)

let entered = false
/** The second question is asked for the reader only until they act. */
let autoAsk = false
let timers: ReturnType<typeof setTimeout>[] = []
let hintTimer: ReturnType<typeof setTimeout> | undefined

function later(ms: number, run: () => void): void {
  const id = setTimeout(() => {
    timers = timers.filter(timer => timer !== id)
    run()
  }, ms)
  timers.push(id)
}

function clearTimers(): void {
  timers.forEach(clearTimeout)
  timers = []
  clearTimeout(hintTimer)
}

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const answering = computed(() => state.turns.some(turn => turn.live || turn.phase === 'streaming' || turn.phase === 'paused' || turn.phase === 'draining'))
const sourcing = computed(() => state.turns.some(turn => turn.live))
const lastTurn = computed(() => state.turns[state.turns.length - 1])

function topicOf(turn: Turn): Topic {
  return copy.value.topics[turn.topic]
}

function answerOf(turn: Turn): string {
  return topicOf(turn).answer
}

/** The sources an answer cites, in the order of their numbers. */
function citedBy(turn: Turn): AiSourceItem[] {
  const numbers = [...new Set([...answerOf(turn).matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])))]
  return numbers.sort((a, b) => a - b).map(n => copy.value.sources[n - 1]).filter((source): source is AiSourceItem => !!source)
}

function followUpsOf(turn: Turn): AiSuggestion[] {
  if (turn !== lastTurn.value || turn.live)
    return []
  const asked = new Set(state.turns.map(item => item.topic))
  return topicOf(turn).followUps
    .filter(topic => !asked.has(topic))
    .map(topic => ({ id: topic, text: copy.value.topics[topic].question }))
}

function addTurn(topic: TopicId, question: string, settled: boolean): Turn {
  const turn: Turn = {
    id: state.turns.length,
    topic,
    question,
    received: settled ? copy.value.topics[topic].answer : '',
    live: false,
    stopped: false,
    phase: settled ? 'done' : 'idle',
    gen: 0,
    run: 0,
    feedback: null,
    sourcesKey: 0,
  }
  state.turns.push(turn)
  const index = state.turns.length - 1
  // New rows go in front of the tail; rows already there keep their place.
  state.items.splice(state.items.length - 1, 0,
    { id: `${state.session}-ask-${index}`, kind: 'ask', turn: index },
    { id: `${state.session}-reply-${index}`, kind: 'reply', turn: index },
  )
  return state.turns[index]!
}

// Tokens arrive the way a model streams them: uneven bursts every 25–70 ms.
function streamTurn(turn: Turn, pauseOnce = false): void {
  const run = ++turn.run
  const answer = answerOf(turn)
  const pauseAt = pauseOnce ? answer.indexOf('\n\n', answer.indexOf('\n\n') + 2) : -1
  let index = 0
  let paused = false
  turn.received = ''
  turn.live = true
  turn.stopped = false
  const tick = () => {
    if (run !== turn.run || !turn.live)
      return
    index = Math.min(answer.length, index + 2 + Math.floor(Math.random() * 6))
    if (pauseAt > 0 && !paused && index >= pauseAt) {
      index = pauseAt
      paused = true
      turn.received = answer.slice(0, index)
      later(PAUSE_MS, tick)
      return
    }
    turn.received = answer.slice(0, index)
    if (index >= answer.length) {
      turn.live = false
      return
    }
    later(25 + Math.random() * 45, tick)
  }
  later(280, tick)
}

function revealLatest(): void {
  // Inside the transcript's own scroller, never the page.
  void nextTick(() => streamRef.value?.scrollToBottom(reduced.value ? 'auto' : 'smooth'))
}

function ask(topic: TopicId, question: string): void {
  autoAsk = false
  showHint('')
  const turn = addTurn(topic, question, reduced.value)
  if (!reduced.value)
    streamTurn(turn)
  revealLatest()
}

function onFollowUp(suggestion: AiSuggestion): void {
  ask(suggestion.id as TopicId, suggestion.text)
}

function onSend(payload: { text: string }): void {
  const text = payload.text.trim()
  if (!text || sourcing.value)
    return
  draft.value = ''
  ask('custom', text)
}

function stop(): void {
  const turn = lastTurn.value
  if (!turn?.live)
    return
  // The source ends here; the element still shows what had arrived.
  turn.live = false
  turn.stopped = true
}

function regenerate(turn: Turn): void {
  if (sourcing.value)
    return
  autoAsk = false
  turn.gen++
  turn.feedback = null
  if (reduced.value) {
    turn.received = answerOf(turn)
    turn.stopped = false
    return
  }
  streamTurn(turn)
}

function onState(turn: Turn, phase: StreamState): void {
  turn.phase = phase
}

function onDone(turn: Turn): void {
  // Only the opening answer leads into the scripted follow-up.
  if (!autoAsk || turn.id !== 0 || turn.stopped)
    return
  later(AUTO_ASK_MS, () => {
    if (!autoAsk)
      return
    ask('memory', copy.value.topics.memory.question)
  })
}

function showHint(text: string): void {
  clearTimeout(hintTimer)
  state.hint = text
  if (text) {
    hintTimer = setTimeout(() => {
      state.hint = ''
    }, HINT_MS)
  }
}

// A chip names its source: the answer's source stack opens, and the host is
// told what it would open. The chip itself never navigates.
function onCite(turn: Turn, source: AiSourceItem): void {
  turn.sourcesKey++
  showHint(copy.value.hostOpens(source.url))
}

function onSourceOpen(source: AiSourceItem): void {
  showHint(copy.value.hostOpens(source.url))
}

/** A click or a key from the reader takes over from the script; scrolling past does not. */
function onReaderInput(): void {
  autoAsk = false
}

function start(): void {
  clearTimers()
  reduced.value = prefersReducedMotion()
  if (reduced.value) {
    // The finished conversation, with no timers.
    addTurn('cold', copy.value.topics.cold.question, true)
    addTurn('memory', copy.value.topics.memory.question, true)
    return
  }
  autoAsk = true
  const turn = addTurn('cold', copy.value.topics.cold.question, false)
  streamTurn(turn, true)
}

function onEnter(): void {
  entered = true
  start()
}

function resetDemo(): void {
  clearTimers()
  autoAsk = false
  Object.assign(state, initialState())
  draft.value = ''
  if (entered)
    void nextTick(start)
}

watch(locale, resetDemo)

onBeforeUnmount(clearTimers)

defineExpose({ resetDemo })

function askMessage(turn: Turn) {
  return { id: `${state.session}-message-${turn.id}`, role: 'user' as const, content: turn.question }
}
</script>

<template>
  <TemplateFrame :title="copy.title" :height="560" @enter="onEnter">
    <template #default>
      <div class="aa-root" @pointerdown.capture="onReaderInput" @keydown.capture="onReaderInput">
        <header class="aa-head">
          <span class="aa-logo" aria-hidden="true" />
          <span class="aa-head__title">{{ copy.title }}</span>
          <span class="aa-head__status" :class="{ 'is-busy': answering }" role="status">
            {{ answering ? copy.answering : copy.ready }}
          </span>
          <TxIconButton icon="i-carbon-renew" size="sm" :label="copy.reset" @click="resetDemo" />
        </header>

        <div class="aa-stream">
          <TxConversationStream
            :key="state.session"
            ref="streamRef"
            :items="state.items"
            item-key="id"
            :overscan="12"
            :estimated-item-height="120"
            :streaming="answering && !reduced"
          >
            <template #item="{ item }">
              <div class="aa-row" :class="`is-${item.kind}`">
                <TxChatMessage
                  v-if="item.kind === 'ask' && state.turns[item.turn]"
                  class="aa-ask"
                  :message="askMessage(state.turns[item.turn]!)"
                  :markdown="false"
                >
                  <template #avatar>
                    <span class="aa-avatar" aria-hidden="true">{{ copy.you }}</span>
                  </template>
                </TxChatMessage>

                <div v-else-if="item.kind === 'reply' && state.turns[item.turn]" class="aa-reply">
                  <span class="aa-logo is-avatar" aria-hidden="true" />
                  <TxStreamElement
                    :key="state.turns[item.turn]!.gen"
                    class="aa-answer"
                    :content="state.turns[item.turn]!.received"
                    :streaming="state.turns[item.turn]!.live"
                    :sources="copy.sources"
                    :locale="zh ? 'zh' : 'en'"
                    @state-change="onState(state.turns[item.turn]!, $event)"
                    @done="onDone(state.turns[item.turn]!)"
                    @cite="onCite(state.turns[item.turn]!, $event)"
                  >
                    <!-- Everything that belongs to a finished answer waits for it. -->
                    <template #footer="{ done }">
                      <div v-if="done" class="aa-footer">
                        <span v-if="state.turns[item.turn]!.stopped" class="aa-stopped">{{ copy.stopped }}</span>
                        <TxMessageActions
                          :copy-text="state.turns[item.turn]!.received"
                          :regenerable="state.turns[item.turn] === lastTurn"
                          :copy-label="copy.copyLabel"
                          :copied-label="copy.copiedLabel"
                          :regenerate-label="copy.regenerateLabel"
                          @regenerate="regenerate(state.turns[item.turn]!)"
                        >
                          <button
                            type="button"
                            class="tx-message-actions__btn"
                            :aria-pressed="state.turns[item.turn]!.feedback === 'up'"
                            :aria-label="copy.helpful"
                            :title="copy.helpful"
                            @click="state.turns[item.turn]!.feedback = state.turns[item.turn]!.feedback === 'up' ? null : 'up'"
                          >
                            <span class="i-carbon-thumbs-up aa-thumb" :class="{ 'is-on': state.turns[item.turn]!.feedback === 'up' }" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            class="tx-message-actions__btn"
                            :aria-pressed="state.turns[item.turn]!.feedback === 'down'"
                            :aria-label="copy.unhelpful"
                            :title="copy.unhelpful"
                            @click="state.turns[item.turn]!.feedback = state.turns[item.turn]!.feedback === 'down' ? null : 'down'"
                          >
                            <span class="i-carbon-thumbs-down aa-thumb" :class="{ 'is-on': state.turns[item.turn]!.feedback === 'down' }" aria-hidden="true" />
                          </button>
                        </TxMessageActions>
                        <TxSources
                          v-if="citedBy(state.turns[item.turn]!).length > 0"
                          :key="state.turns[item.turn]!.sourcesKey"
                          :sources="citedBy(state.turns[item.turn]!)"
                          variant="stack"
                          :default-open="state.turns[item.turn]!.sourcesKey > 0"
                          :label-formatter="copy.sourcesLabel"
                          @open="onSourceOpen"
                        />
                        <TxSuggestionChips
                          v-if="followUpsOf(state.turns[item.turn]!).length > 0"
                          :suggestions="followUpsOf(state.turns[item.turn]!)"
                          layout="list"
                          @select="onFollowUp"
                        />
                      </div>
                    </template>
                  </TxStreamElement>
                </div>
              </div>
            </template>
          </TxConversationStream>
        </div>

        <footer class="aa-composer">
          <div class="aa-composer__inner">
            <div class="aa-composer__bar">
              <span class="aa-hint" role="status">{{ state.hint }}</span>
              <TxButton v-if="sourcing" size="sm" variant="secondary" @click="stop">
                <span class="i-carbon-stop-filled-alt aa-stop" aria-hidden="true" />
                {{ copy.stop }}
              </TxButton>
            </div>
            <TxPromptBar
              v-model="draft"
              :submitting="sourcing"
              :placeholder="sourcing ? copy.busy : copy.placeholder"
              :send-label="copy.send"
              @send="onSend"
            />
          </div>
        </footer>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.aa-root {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  color: var(--tx-text-color-primary);
}

.aa-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.aa-head__title {
  font-size: 14px;
  font-weight: 600;
}

.aa-head__status {
  margin-right: auto;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.aa-head__status.is-busy {
  color: var(--tx-color-primary);
}

/* The Tuff mark: a soft core in a ring, the stream caret's colours. */
.aa-logo {
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, var(--tx-stream-caret-start, #5b8def) 0 32%, transparent 34%),
    radial-gradient(circle at 50% 50%, transparent 0 52%, var(--tx-stream-caret-end, #a46cf0) 54% 66%, transparent 68%);
}

.aa-logo.is-avatar {
  width: 24px;
  height: 24px;
  margin-top: 2px;
}

.aa-stream {
  position: relative;
  min-height: 0;
  flex: 1;
}

/* The stream's pill defaults to --tx-fill-color-blank, which is transparent in
   dark mode and would sit see-through on top of the transcript. */
.aa-stream :deep(.tx-conversation-stream__pill) {
  background: var(--tx-bui-surface, #fff);
}

.aa-row {
  max-width: 760px;
  margin: 0 auto;
  padding: 10px 16px;
}

.aa-row.is-tail {
  padding: 0;
}

/* A question reads as a compact bubble on the right, not a full-width band. */
.aa-ask :deep(.tx-chat-message__bubble) {
  max-width: min(460px, 86%);
  flex: 0 1 auto;
  border-radius: 14px 4px 14px 14px;
}

.aa-ask :deep(.tx-chat-message__plain) {
  font-size: 13px;
}

.aa-avatar {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--tx-fill-color);
  font-size: 11px;
  color: var(--tx-text-color-regular);
}

.aa-reply {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.aa-answer {
  min-width: 0;
  flex: 1;
}

.aa-footer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
}

.aa-stopped {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.aa-thumb {
  display: inline-block;
  width: 14px;
  height: 14px;
}

.aa-thumb.is-on {
  color: var(--tx-color-primary);
}

.aa-composer {
  flex: none;
  padding: 8px 16px 14px;
}

.aa-composer__inner {
  display: flex;
  max-width: 760px;
  flex-direction: column;
  gap: 6px;
  margin: 0 auto;
}

.aa-composer__bar {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.aa-hint {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aa-stop {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 4px;
}

@container template (max-width: 639px) {
  .aa-head {
    padding: 8px 12px;
  }

  .aa-head__status {
    display: none;
  }

  /* The hidden status no longer pushes the reset button to the end. */
  .aa-head__title {
    margin-right: auto;
  }

  .aa-row {
    padding: 8px 12px;
  }

  .aa-logo.is-avatar {
    display: none;
  }

  .aa-composer {
    padding: 6px 12px 10px;
  }
}
</style>
