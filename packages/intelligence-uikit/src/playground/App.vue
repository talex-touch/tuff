<script setup lang="ts">
import type { TxAiMessageModel, TxAiRichBlockModel, TxAiToolStatus } from '../types'
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  TxAiAgentBadge,
  TxAiCitation,
  TxAiComposer,
  TxAiConversation,
  TxAiLoadingHint,
  TxAiResultCard,
  TxAiSuggestion,
  TxAiToolCall,
} from '../index'

type MockPhase = 'empty' | 'waiting' | 'streaming' | 'tool' | 'done' | 'error'
type MockBranch = 'success' | 'error'
type MockSession = 'pilot' | 'tools' | 'markdown'

interface MockTimelineStep {
  label: string
  description: string
  phase: MockPhase
  messages: TxAiMessageModel[]
}

interface MockSessionConfig {
  id: MockSession
  title: string
  heading: string
  eyebrow: string
  prompt: string
  adapterName: string
  adapterDescription: string
  suggestions: string[]
  citations: Array<{ title: string, description: string }>
}

const sessionConfigs: MockSessionConfig[] = [
  {
    id: 'pilot',
    title: 'Pilot extraction',
    heading: 'Chat generation mockup',
    eyebrow: 'AI conversation surface',
    prompt: '把 Pilot 的聊天体验抽成一组可以复用的 AI UI Kit，并保留动画调试入口。',
    adapterName: 'Pilot Adapter',
    adapterDescription: 'blocks normalized',
    suggestions: ['拆出消息 hover 工具栏', '补齐 markdown 段落 reveal', '模拟 tool-call collapse'],
    citations: [
      { title: 'ChatItem.vue', description: 'message blocks' },
      { title: 'ThChat.vue', description: 'scroll behavior' },
      { title: 'MilkdownRender.vue', description: 'rich content' },
    ],
  },
  {
    id: 'tools',
    title: 'Tool result cards',
    heading: 'Tool result mockup',
    eyebrow: 'AI tool execution surface',
    prompt: '模拟一次工具调用，从运行中、结果卡、错误卡到最终状态都要能调动画。',
    adapterName: 'Tool Adapter',
    adapterDescription: 'tool states',
    suggestions: ['展开工具调用详情', '切换错误结果卡', '调试运行中 shimmer'],
    citations: [
      { title: 'run-event-card.ts', description: 'tool event shell' },
      { title: 'TxAiToolCall.vue', description: 'status display' },
      { title: 'TxAiResultCard.vue', description: 'result surface' },
    ],
  },
  {
    id: 'markdown',
    title: 'Markdown streaming',
    heading: 'Markdown streaming mockup',
    eyebrow: 'AI content rendering surface',
    prompt: '模拟 markdown 内容逐段生成，并测试逐字 fade in / fade out、代码块和引用块的出现节奏。',
    adapterName: 'Markdown Adapter',
    adapterDescription: 'stream renderer',
    suggestions: ['调试逐字 fade', '调试段落 reveal', '检查代码块进入'],
    citations: [
      { title: 'TxAiMarkdown.vue', description: 'markdown shell' },
      { title: 'TxAiStreamText.vue', description: 'character fade' },
      { title: 'TxMarkdownView.vue', description: 'base renderer' },
    ],
  },
]

const mockStartedAt = Date.now() - 240_000
const activeSession = ref<MockSession>('pilot')
const branch = ref<MockBranch>('success')
const timelineIndex = ref(3)
const isPlaying = ref(false)
const draft = ref('')
let playTimer: ReturnType<typeof setInterval> | undefined

const activeSessionConfig = computed(() => {
  return sessionConfigs.find(item => item.id === activeSession.value) ?? sessionConfigs[0]
})

function createUserMessage(): TxAiMessageModel {
  return {
    id: 'user-1',
    role: 'user',
    content: activeSessionConfig.value.prompt,
    createdAt: mockStartedAt,
  }
}

function createAssistantMessage(status: TxAiMessageModel['status'], blocks: TxAiRichBlockModel[] = []): TxAiMessageModel {
  return {
    id: 'assistant-1',
    role: 'assistant',
    status,
    createdAt: mockStartedAt + 90_000,
    blocks,
  }
}

function createThinkingBlock(kind: 'planning' | 'thinking' | 'thought', content: string, status: TxAiToolStatus = 'success'): TxAiRichBlockModel {
  return {
    id: kind,
    type: 'card',
    name: kind === 'planning' ? '规划中' : kind === 'thinking' ? '思考中' : '思考内容',
    status,
    content,
    meta: { kind },
  }
}

function createPlanBlock(variant: 'partial' | 'full', status: TxAiToolStatus = 'success'): TxAiRichBlockModel {
  const session = activeSession.value
  const title = session === 'tools'
    ? '### 工具结果切片'
    : session === 'markdown'
      ? '### Markdown 渲染切片'
      : '### 迁移切片'
  const lines = session === 'tools'
    ? [
        '- ToolCall 层展示 running、success、error、cancelled。',
        '- ResultCard 层承接结构化结果、摘要和二次操作。',
        '- Error branch 需要保留红色语义和可恢复交互。',
      ]
    : session === 'markdown'
      ? [
          '- StreamText 层负责逐字 fade in / fade out。',
          '- Markdown 层负责段落、引用、列表和代码块渲染。',
          '- Reveal 层负责内容渐显和段落级进入。',
        ]
      : [
          '- Foundation 层负责 reveal、stream text、thinking、loading hint。',
          '- Conversation 层负责消息、滚动跟随、停止生成和输入区域。',
          '- Content 层承接 markdown、code block、tool/card/error blocks。',
        ]

  return {
    id: 'plan',
    type: 'markdown',
    status,
    content: [
      title,
      '',
      ...lines.slice(0, variant === 'full' ? 3 : 2),
      '',
      variant === 'full'
        ? '> 当前内容稳定，适合调试 hover、collapse 和 completed state。'
        : '> 正在生成内容，适合调试段落进入、流式 cursor 和 markdown reveal。',
    ].filter(Boolean).join('\n'),
  }
}

function createToolBlock(status: TxAiToolStatus): TxAiRichBlockModel {
  const session = activeSession.value
  return {
    id: 'tool-search',
    type: 'tool',
    name: session === 'tools' ? 'Tool result pipeline' : session === 'markdown' ? 'Markdown stream parser' : 'Pilot block timeline',
    status,
    content: status === 'running'
      ? session === 'tools'
        ? '执行 mock 工具调用，等待结构化结果和错误分支。'
        : session === 'markdown'
          ? '解析 markdown token，等待段落和代码块进入。'
          : '整理 ChatItem blocks、suggest-card、tool card 与 run event card 的抽象边界。'
      : session === 'tools'
        ? '工具结果已归一化为 TxAiResultCard 输入。'
        : session === 'markdown'
          ? 'Markdown token 已归一化为内容 block。'
          : '已归档为 TxAiRichBlock 的兼容输入。',
  }
}

function createCodeBlock(): TxAiRichBlockModel {
  const session = activeSession.value
  return {
    id: 'code',
    type: 'code',
    content: session === 'tools'
      ? [
          'const result = normalizeToolResult(toolEvent)',
          'const status = mapToolStatus(toolEvent.state)',
          '',
          'return <TxAiResultCard tone={status} />',
        ].join('\n')
      : session === 'markdown'
        ? [
            'const chars = Array.from(streamText)',
            'const blocks = parseMarkdownTokens(tokens)',
            '',
            'return <TxAiStreamText motion="fade" streaming />',
          ].join('\n')
        : [
            'const blocks = mapPilotChatBlocksToAiBlocks(pilotBlocks)',
            'const message = mapPilotChatMessageToAiMessage(pilotMessage)',
            '',
            'return <TxAiConversation messages={messages} generating />',
          ].join('\n'),
    meta: { language: 'ts' },
  }
}

function createResultBlock(): TxAiRichBlockModel {
  if (branch.value === 'error') {
    return {
      id: 'error',
      type: 'error',
      content: '工具卡模拟失败：用于调试 error state、红色语义和进入/退出动画。',
    }
  }

  return {
    id: 'run-card',
    type: 'card',
    name: activeSession.value === 'tools'
      ? 'tool_result_card'
      : activeSession.value === 'markdown'
        ? 'markdown_stream_result'
        : 'pilot_run_event_card',
    content: activeSession.value === 'tools'
      ? '工具返回 2 个结果字段，1 个错误分支已准备。'
      : activeSession.value === 'markdown'
        ? '4 段内容已进入，逐字 fade 动画可调。'
        : '3 个 blocks 已归一化，2 个动画入口等待实现。',
  }
}

const timelineSteps = computed<MockTimelineStep[]>(() => {
  const userMessage = createUserMessage()
  const planningText = activeSession.value === 'tools'
    ? '正在拆分工具调用状态，先覆盖运行中、成功、失败和取消四种节点。'
    : activeSession.value === 'markdown'
      ? '正在拆分 markdown stream 的显示节奏，先确定逐字、逐段、代码块三层动画。'
      : '正在拆分 Pilot 聊天页的可复用边界，先确定消息、内容、工具调用三条主线。'
  const thinkingText = activeSession.value === 'tools'
    ? '对比 run event card 和 result card 的职责，工具数据只做展示映射，不引入业务请求。'
    : activeSession.value === 'markdown'
      ? '逐字 fade 需要保留空格、标点和换行节奏，同时尊重 reduced motion。'
      : '对比 ThChat、ChatItem、MilkdownRender 的职责，避免把 Pilot 业务状态带进 UI Kit。'
  const thoughtText = activeSession.value === 'tools'
    ? '工具卡负责状态语义、摘要和结果壳层；错误分支独立进入，方便调红色状态和恢复操作。'
    : activeSession.value === 'markdown'
      ? '字符层处理 fade in / fade out；markdown 层处理语义结构；两者避免互相抢布局。'
      : '消息容器只处理滚动、贴底、停止生成；block renderer 只处理展示形态；动画通过 class 和 motion prop 扩展。'
  const planningBlock = createThinkingBlock('planning', planningText)
  const planningRunningBlock = createThinkingBlock('planning', planningText, 'running')
  const thinkingBlock = createThinkingBlock('thinking', thinkingText)
  const thinkingRunningBlock = createThinkingBlock('thinking', thinkingText, 'running')
  const thoughtBlock = createThinkingBlock('thought', thoughtText)
  const thoughtRunningBlock = createThinkingBlock('thought', thoughtText, 'running')
  const planPartialStreaming = createPlanBlock('partial', 'running')
  const planFull = createPlanBlock('full')
  const planFullStreaming = createPlanBlock('full', 'running')
  const runningTool = createToolBlock('running')
  const finalTool = createToolBlock(branch.value === 'error' ? 'error' : 'success')
  const status = branch.value === 'error' ? 'error' : 'done'
  const finalPhase = branch.value === 'error' ? 'error' : 'done'

  return [
    {
      label: 'Start',
      description: '空会话，只保留输入区',
      phase: 'empty',
      messages: [],
    },
    {
      label: '用户消息',
      description: '用户消息气泡进入',
      phase: 'waiting',
      messages: [userMessage],
    },
    {
      label: '规划中',
      description: '助手消息壳出现，展示规划中的轻量卡片',
      phase: 'waiting',
      messages: [userMessage, createAssistantMessage('waiting', [planningRunningBlock])],
    },
    {
      label: '思考中',
      description: '思考状态继续递增，适合调 dots 和呼吸动画',
      phase: 'waiting',
      messages: [userMessage, createAssistantMessage('waiting', [planningBlock, thinkingRunningBlock])],
    },
    {
      label: '思考内容',
      description: '思考内容展开，适合调折叠/展开/渐显',
      phase: 'waiting',
      messages: [userMessage, createAssistantMessage('waiting', [planningBlock, thinkingBlock, thoughtRunningBlock])],
    },
    {
      label: '计划草稿',
      description: 'markdown 计划开始流式出现',
      phase: 'streaming',
      messages: [userMessage, createAssistantMessage('streaming', [planningBlock, thinkingBlock, thoughtBlock, planPartialStreaming])],
    },
    {
      label: '计划完整',
      description: 'markdown 内容补齐，适合调段落递进',
      phase: 'streaming',
      messages: [userMessage, createAssistantMessage('streaming', [planningBlock, thinkingBlock, thoughtBlock, planFullStreaming])],
    },
    {
      label: '工具调用',
      description: '工具卡进入并保持 running',
      phase: 'tool',
      messages: [userMessage, createAssistantMessage('streaming', [planningBlock, thinkingBlock, thoughtBlock, planFull, runningTool])],
    },
    {
      label: '代码块',
      description: '代码块在工具卡下方展开',
      phase: 'tool',
      messages: [userMessage, createAssistantMessage('streaming', [planningBlock, thinkingBlock, thoughtBlock, planFull, runningTool, createCodeBlock()])],
    },
    {
      label: branch.value === 'error' ? '错误结束' : '完成',
      description: branch.value === 'error'
        ? '错误块替代最终结果卡'
        : '最终结果卡和 success 状态可见',
      phase: finalPhase,
      messages: [userMessage, createAssistantMessage(status, [planningBlock, thinkingBlock, thoughtBlock, planFull, finalTool, createCodeBlock(), createResultBlock()])],
    },
  ]
})

const activeStep = computed(() => timelineSteps.value[timelineIndex.value] ?? timelineSteps.value[0])
const phase = computed<MockPhase>(() => activeStep.value.phase)
const messages = computed<TxAiMessageModel[]>(() => activeStep.value.messages)
const timelineProgress = computed(() => `${timelineIndex.value + 1}/${timelineSteps.value.length}`)
const toolStatus = computed<TxAiToolStatus>(() => {
  if (phase.value === 'error')
    return 'error'
  if (phase.value === 'done')
    return 'success'
  if (phase.value === 'empty')
    return 'pending'
  return 'running'
})
const generating = computed(() => phase.value === 'waiting' || phase.value === 'streaming' || phase.value === 'tool')

const phaseOptions: Array<{ label: string, value: MockPhase }> = [
  { label: '流式', value: 'streaming' },
  { label: '工具', value: 'tool' },
  { label: '完成', value: 'done' },
  { label: '错误', value: 'error' },
]

function stopPlayback() {
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = undefined
  }
  isPlaying.value = false
}

function playFromStart() {
  stopPlayback()
  timelineIndex.value = 0
  isPlaying.value = true

  playTimer = setInterval(() => {
    if (timelineIndex.value >= timelineSteps.value.length - 1) {
      stopPlayback()
      return
    }

    timelineIndex.value += 1
  }, 1100)
}

function resetTimeline() {
  stopPlayback()
  timelineIndex.value = 0
}

function nextTimelineStep() {
  stopPlayback()
  timelineIndex.value = Math.min(timelineIndex.value + 1, timelineSteps.value.length - 1)
}

function completeTimeline() {
  stopPlayback()
  timelineIndex.value = timelineSteps.value.length - 1
}

function selectPhase(nextPhase: MockPhase) {
  stopPlayback()
  if (nextPhase === 'error')
    branch.value = 'error'
  if (nextPhase === 'done')
    branch.value = 'success'

  const targetIndex = timelineSteps.value.findIndex(step => step.phase === nextPhase)
  timelineIndex.value = targetIndex >= 0 ? targetIndex : timelineSteps.value.length - 1
}

function selectBranch(nextBranch: MockBranch) {
  branch.value = nextBranch
  if (timelineIndex.value === timelineSteps.value.length - 1)
    timelineIndex.value = timelineSteps.value.length - 1
}

function selectSession(session: MockSession) {
  stopPlayback()
  activeSession.value = session
  branch.value = 'success'
  timelineIndex.value = 3
  draft.value = ''
}

function sendDraft() {
  draft.value = ''
}

onBeforeUnmount(stopPlayback)
</script>

<template>
  <main class="uikit-mockup" :data-phase="phase">
    <aside class="uikit-mockup__rail">
      <div class="uikit-mockup__brand">
        <span class="uikit-mockup__mark">iu</span>
        <div>
          <strong>intelligence-uikit</strong>
          <span>mock workspace</span>
        </div>
      </div>

      <nav class="uikit-mockup__sessions" aria-label="Mock sessions">
        <button
          v-for="session in sessionConfigs"
          :key="session.id"
          type="button"
          :class="{ 'is-active': activeSession === session.id }"
          @click="selectSession(session.id)"
        >
          {{ session.title }}
        </button>
      </nav>

      <TxAiAgentBadge
        :name="activeSessionConfig.adapterName"
        :description="activeSessionConfig.adapterDescription"
        tone="primary"
      />
    </aside>

    <section class="uikit-mockup__workspace">
      <header class="uikit-mockup__topbar">
        <div>
          <p class="uikit-mockup__eyebrow">
            {{ activeSessionConfig.eyebrow }}
          </p>
          <h1>{{ activeSessionConfig.heading }}</h1>
          <p class="uikit-mockup__step">
            {{ timelineProgress }} · {{ activeStep.label }} · {{ activeStep.description }}
          </p>
        </div>

        <div class="uikit-mockup__segmented" role="group" aria-label="Mock phase">
          <button
            v-for="item in phaseOptions"
            :key="item.value"
            type="button"
            :class="{ 'is-active': phase === item.value }"
            @click="selectPhase(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </header>

      <TxAiConversation
        class="uikit-mockup__conversation"
        :messages="messages"
        :generating="generating"
        @stop="completeTimeline"
      >
        <template #before>
          <div class="uikit-mockup__timeline-note">
            <TxAiLoadingHint
              label="Runtime trace"
              description="session restored, stream cursor attached"
              :status="toolStatus"
            />
          </div>
        </template>
      </TxAiConversation>

      <div class="uikit-mockup__suggestions">
        <TxAiSuggestion
          v-for="suggestion in activeSessionConfig.suggestions"
          :key="suggestion"
          :text="suggestion"
          @select="draft = $event"
        />
      </div>

      <TxAiComposer
        v-model="draft"
        class="uikit-mockup__composer"
        placeholder="输入消息..."
        show-attachment-button
        :submitting="generating"
        :attachments="[
          { id: 'a1', label: `${activeSessionConfig.title.toLowerCase().replaceAll(' ', '-')}.ts`, kind: 'ts' },
          { id: 'a2', label: activeSession === 'markdown' ? 'TxAiStreamText.vue' : activeSession === 'tools' ? 'TxAiResultCard.vue' : 'ChatItem.vue', kind: 'vue', pending: phase === 'tool' },
        ]"
        @send="sendDraft"
      />
    </section>

    <aside class="uikit-mockup__inspector">
      <section>
        <h2>Timeline</h2>
        <div class="uikit-mockup__timeline-controls">
          <button type="button" class="is-primary" @click="playFromStart">
            {{ isPlaying ? 'Restart' : 'Play from start' }}
          </button>
          <button type="button" @click="nextTimelineStep">
            Next
          </button>
          <button type="button" @click="resetTimeline">
            Reset
          </button>
        </div>

        <div class="uikit-mockup__branch" role="group" aria-label="Timeline branch">
          <button
            type="button"
            :class="{ 'is-active': branch === 'success' }"
            @click="selectBranch('success')"
          >
            Success
          </button>
          <button
            type="button"
            :class="{ 'is-active': branch === 'error' }"
            @click="selectBranch('error')"
          >
            Error
          </button>
        </div>

        <ol class="uikit-mockup__timeline-list">
          <li
            v-for="(step, index) in timelineSteps"
            :key="step.label"
            :class="{
              'is-active': index === timelineIndex,
              'is-done': index < timelineIndex,
            }"
          >
            <button type="button" @click="timelineIndex = index; stopPlayback()">
              <span>{{ index + 1 }}</span>
              <strong>{{ step.label }}</strong>
            </button>
          </li>
        </ol>
      </section>

      <section>
        <h2>Run state</h2>
        <TxAiToolCall
          name="Pilot timeline"
          :status="toolStatus"
          :description="activeStep.description"
        />
      </section>

      <section>
        <h2>Result shell</h2>
        <TxAiResultCard
          title="Reusable component boundary"
          :description="`Current scene: ${activeSessionConfig.title}.`"
          tone="info"
        >
          <div class="uikit-mockup__metric-row">
            <span>Blocks</span>
            <strong>4</strong>
          </div>
          <div class="uikit-mockup__metric-row">
            <span>Motion hooks</span>
            <strong>6</strong>
          </div>
        </TxAiResultCard>
      </section>

      <section>
        <h2>Citations</h2>
        <div class="uikit-mockup__citations">
          <TxAiCitation
            v-for="(citation, index) in activeSessionConfig.citations"
            :key="citation.title"
            :title="citation.title"
            :index="index + 1"
            :description="citation.description"
          />
        </div>
      </section>
    </aside>
  </main>
</template>

<style scoped lang="scss">
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  background:
    linear-gradient(135deg, rgb(245 247 248) 0%, rgb(238 243 241) 48%, rgb(247 246 242) 100%);
  color: #171a1d;
  font-size: 14px;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

button {
  font: inherit;
}

.uikit-mockup {
  --mock-accent: #2f8a6f;
  --mock-accent-2: #c87836;
  --mock-border: rgb(28 34 38 / 10%);
  --mock-surface: rgb(255 255 255 / 82%);
  --mock-muted: #687178;

  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 320px;
  gap: 1px;
  width: 100vw;
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  background: var(--mock-border);
}

.uikit-mockup__rail,
.uikit-mockup__workspace,
.uikit-mockup__inspector {
  height: 100svh;
  min-height: 0;
  background: var(--mock-surface);
  backdrop-filter: blur(20px) saturate(145%);
}

.uikit-mockup__rail,
.uikit-mockup__inspector {
  padding: 18px;
}

.uikit-mockup__rail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.uikit-mockup__brand {
  display: flex;
  align-items: center;
  gap: 12px;

  strong,
  span {
    display: block;
  }

  strong {
    font-size: 14px;
  }

  span {
    color: var(--mock-muted);
    font-size: 12px;
  }
}

.uikit-mockup__mark {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #1c2427;
  color: #f5f7f8;
  font-weight: 700;
}

.uikit-mockup__sessions {
  display: grid;
  gap: 6px;

  button {
    width: 100%;
    border: 0;
    border-radius: 10px;
    background: transparent;
    padding: 8px 10px;
    color: #30363a;
    font-size: 14px;
    text-align: left;
    cursor: pointer;

    &.is-active,
    &:hover {
      background: rgb(47 138 111 / 11%);
      color: #173d33;
    }
  }
}

.uikit-mockup__workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  min-width: 0;
  overflow: hidden;
}

.uikit-mockup__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--mock-border);
  padding: 14px 22px;

  h1,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 2px;
    font-size: 24px;
    line-height: 1.18;
  }
}

.uikit-mockup__eyebrow {
  color: var(--mock-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.uikit-mockup__step {
  margin: 7px 0 0;
  color: var(--mock-muted);
  font-size: 12px;
  line-height: 1.4;
}

.uikit-mockup__segmented {
  display: inline-flex;
  gap: 4px;
  border: 1px solid var(--mock-border);
  border-radius: 12px;
  background: rgb(255 255 255 / 54%);
  padding: 4px;

  button {
    border: 0;
    border-radius: 9px;
    background: transparent;
    padding: 6px 10px;
    color: var(--mock-muted);
    font-size: 14px;
    cursor: pointer;

    &.is-active {
      background: #1d2527;
      color: #fff;
    }
  }
}

.uikit-mockup__conversation {
  min-height: 0;

  :deep(.tx-ai-conversation__list) {
    padding: 16px 12px 68px;
  }

  :deep(.tx-chat-message__bubble) {
    padding: 9px 11px;
    font-size: 14px;
    line-height: 1.55;
  }

  :deep(.tx-ai-rich-block) {
    animation: uikit-block-enter 220ms ease both;
  }

  :deep(.tx-ai-rich-block:nth-child(2)) {
    animation-delay: 30ms;
  }

  :deep(.tx-ai-rich-block:nth-child(3)) {
    animation-delay: 60ms;
  }

  :deep(.tx-ai-rich-block:nth-child(4)) {
    animation-delay: 90ms;
  }

  :deep(.tx-ai-rich-block:nth-child(5)) {
    animation-delay: 120ms;
  }

  :deep(.tx-ai-rich-block:nth-child(6)) {
    animation-delay: 150ms;
  }

  :deep(.tx-ai-rich-block:nth-child(7)) {
    animation-delay: 180ms;
  }

  :deep(.tx-markdown-view) {
    font-size: 14px;
    line-height: 1.6;
  }

  :deep(.tx-markdown-view .markdown-body h3) {
    margin: 0 0 8px;
    font-size: 16px;
    line-height: 1.35;
  }

  :deep(.tx-markdown-view .markdown-body p),
  :deep(.tx-markdown-view .markdown-body ul) {
    margin: 6px 0;
  }

  :deep(.tx-markdown-view .markdown-body blockquote) {
    margin: 10px 0;
    padding: 9px 12px;
  }

  :deep(.tx-ai-conversation__floating) {
    bottom: 18px;
  }
}

.uikit-mockup__timeline-note {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.uikit-mockup__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-top: 1px solid var(--mock-border);
  padding: 10px 22px;
}

.uikit-mockup__composer {
  width: auto;
  margin: 0 22px 18px;
}

.uikit-mockup__inspector {
  display: grid;
  align-content: start;
  gap: 22px;
  overflow: auto;

  h2 {
    margin: 0 0 10px;
    color: #2c3337;
    font-size: 13px;
    font-weight: 700;
  }
}

.uikit-mockup__timeline-controls,
.uikit-mockup__branch {
  display: flex;
  gap: 8px;
}

.uikit-mockup__timeline-controls {
  flex-wrap: wrap;

  button {
    border: 1px solid var(--mock-border);
    border-radius: 10px;
    background: rgb(255 255 255 / 76%);
    padding: 7px 10px;
    color: #283033;
    font-size: 14px;
    cursor: pointer;

    &.is-primary {
      border-color: rgb(47 138 111 / 24%);
      background: #1d2527;
      color: #fff;
    }
  }
}

.uikit-mockup__branch {
  margin-top: 10px;
  border: 1px solid var(--mock-border);
  border-radius: 12px;
  background: rgb(255 255 255 / 54%);
  padding: 4px;

  button {
    flex: 1;
    border: 0;
    border-radius: 9px;
    background: transparent;
    padding: 7px 8px;
    color: var(--mock-muted);
    font-size: 14px;
    cursor: pointer;

    &.is-active {
      background: rgb(47 138 111 / 13%);
      color: #173d33;
    }
  }
}

.uikit-mockup__timeline-list {
  display: grid;
  gap: 4px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  button {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    width: 100%;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    padding: 6px 8px;
    color: var(--mock-muted);
    text-align: left;
    cursor: pointer;
  }

  span {
    display: inline-flex;
    width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgb(29 37 39 / 7%);
    color: inherit;
    font-size: 12px;
    font-weight: 700;
  }

  strong {
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  li.is-done button {
    color: #2f8a6f;
  }

  li.is-active button {
    background: rgb(47 138 111 / 10%);
    color: #173d33;
  }
}

.uikit-mockup__metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--mock-border);
  padding: 9px 0;
  color: var(--mock-muted);

  strong {
    color: #1d2527;
  }
}

.uikit-mockup__citations {
  display: grid;
  gap: 8px;
}

[data-phase="streaming"] {
  .tx-ai-message--streaming {
    :deep(.tx-chat-message__bubble) {
      border-color: rgb(47 138 111 / 32%);
      box-shadow: 0 12px 40px rgb(47 138 111 / 10%);
    }
  }
}

[data-phase="error"] {
  --mock-accent: #b75d4c;
}

@keyframes uikit-block-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .uikit-mockup {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .uikit-mockup__inspector {
    display: none;
  }
}

@media (max-width: 760px) {
  .uikit-mockup {
    grid-template-columns: 1fr;
  }

  .uikit-mockup__rail {
    display: none;
  }

  .uikit-mockup__topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .uikit-mockup__segmented {
    width: 100%;
    overflow-x: auto;
  }
}
</style>
