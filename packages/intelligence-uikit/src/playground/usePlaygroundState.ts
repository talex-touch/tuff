import type { AiAttachmentFile, AiMessagePart } from '@talex-touch/tuffex/ai-elements'
import type { ConversationStreamLoadResult } from '@talex-touch/tuffex/conversation-stream'
import type { PromptBarCommand, PromptBarModel, PromptBarSource } from '@talex-touch/tuffex/prompt-bar'
import type {
  TxAiComposerAttachment,
  TxAiContextMeterProps,
  TxAiMessageModel,
  TxAiRunStatusProps,
  TxAiToolStatus,
} from '../types'
import { CHART_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { computed, onBeforeUnmount, ref } from 'vue'

export type MockPhase = 'empty' | 'waiting' | 'streaming' | 'tool' | 'done' | 'error'
export type MockBranch = 'success' | 'error'
export type MockSession = 'conversation' | 'tools' | 'markdown'

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
  suggestions: Array<{ text: string; description: string }>
  citations: Array<{ title: string; description: string }>
}

const sessionConfigs: MockSessionConfig[] = [
  {
    id: 'conversation',
    title: 'CoreApp Home parity',
    heading: 'Stream, turn & composer workspace',
    eyebrow: 'AI conversation surface',
    prompt: 'Audit the composer shell, attach runtime logs, and chart weekly latency with an interactive follow-up.',
    adapterName: 'Conversation Adapter',
    adapterDescription: 'stream + segments + composer',
    suggestions: [
      { text: 'Compare attachment tray & voice clip density', description: 'Check CoreApp user bubble parity' },
      { text: 'Test @source mentions and /commands', description: 'Verify keyboard navigation and token insertion' },
      { text: 'Inspect live OpenUI form + chart turn', description: 'Preview segments + turn footer metrics' },
    ],
    citations: [
      { title: 'TxAiConversation.vue', description: 'virtual stream + rail + clearance' },
      { title: 'TxAiMessage.vue', description: 'hybrid user bubble + assistant turn' },
      { title: 'TxAiComposer.vue', description: 'beam + tray + dictation + capsule send' },
    ],
  },
  {
    id: 'tools',
    title: 'Tool faces & OpenUI',
    heading: 'Structured tool workbench',
    eyebrow: 'AI tool execution surface',
    prompt: 'Run a chart query and confirm the rollout plan before queueing the next turn.',
    adapterName: 'Tool Adapter',
    adapterDescription: 'tool-call + chart + error recovery',
    suggestions: [
      { text: 'Toggle tool payload drawer', description: 'Verify tool-call card collapse state' },
      { text: 'Switch error recovery branch', description: 'Test retry & warning limit styling' },
      { text: 'Inspect OpenUI action dispatch', description: 'Check live action banner output' },
    ],
    citations: [
      { title: 'TxAiToolChart.vue', description: 'editable series workbench' },
      { title: 'TxAiToolForm.vue', description: 'scoped accessible form' },
      { title: 'TxAiToolCall.vue', description: 'collapsible card face' },
    ],
  },
  {
    id: 'markdown',
    title: 'Markdown & dictation',
    heading: 'Streaming prose & voice draft',
    eyebrow: 'AI content rendering surface',
    prompt: 'Summarize the migration diff, including voice note replay and fenced code copy feedback.',
    adapterName: 'Markdown Adapter',
    adapterDescription: 'pacer + voice clip + code block',
    suggestions: [
      { text: 'Stream incremental markdown heading', description: 'Check sticky scroll behavior' },
      { text: 'Toggle dictation simulation', description: 'Preview VoiceBeam pill + Esc cancel' },
      { text: 'Load older history batch', description: 'Verify top prepend scroll anchoring' },
    ],
    citations: [
      { title: 'TxAiMarkdown.vue', description: 'streaming markdown view' },
      { title: 'TxAiVoiceDraft.vue', description: 'dictation timer + VoiceBeam' },
      { title: 'TxAiMessageRail.vue', description: 'turn outline navigation' },
    ],
  },
]

const phaseOptions: Array<{ label: string; value: MockPhase }> = [
  { label: 'Empty', value: 'empty' },
  { label: 'Streaming', value: 'streaming' },
  { label: 'Tool', value: 'tool' },
  { label: 'Done', value: 'done' },
  { label: 'Error', value: 'error' },
]

const composerSources: PromptBarSource[] = [
  { key: 'attach', name: 'Add photos & files', desc: 'Attach workspace context', attach: true },
  { key: 'workspace', name: 'workspace', desc: 'packages/intelligence-uikit/src', connectable: true, connected: true },
  { key: 'core-home', name: 'core-home', desc: 'HomePage.vue & TuffAIComposer.vue', connectable: true, connected: true },
  { key: 'diagnostics', name: 'diagnostics', desc: 'Live telemetry & Vitest logs', connectable: true, connected: false },
]

const composerCommands: PromptBarCommand[] = [
  { key: 'explain', name: '/explain', desc: 'Walk through the selected file or turn' },
  { key: 'chart', name: '/chart', desc: 'Render an interactive ECharts breakdown' },
  { key: 'review', name: '/review', desc: 'Audit accessibility, motion, and parity' },
]

const composerModels: PromptBarModel[] = [
  { key: 'gpt-5.4', name: 'GPT-5.4', tag: 'Flagship' },
  { key: 'claude-4.6', name: 'Claude 4.6', tag: 'Reasoning' },
  { key: 'tuff-local', name: 'Tuff Local', tag: 'On-device' },
]

export function usePlaygroundState() {
  const mockStartedAt = Date.now() - 180_000
  const activeSession = ref<MockSession>('conversation')
  const branch = ref<MockBranch>('success')
  const timelineIndex = ref(3)
  const isPlaying = ref(false)
  const draft = ref('')
  const selectedModel = ref('gpt-5.4')
  const webSearchEnabled = ref(true)
  const olderLoaded = ref(false)
  const queuedPrompts = ref<string[]>([])
  const listening = ref(false)
  const dictationElapsedMs = ref(0)
  const customMessages = ref<TxAiMessageModel[]>([])

  const extraAttachments = ref<TxAiComposerAttachment[]>([
    {
      kind: 'file',
      id: 'att-uikit',
      name: 'TxAiComposer.vue',
      size: 18_420,
    },
  ])

  let playTimer: ReturnType<typeof setInterval> | undefined
  let dictationTimer: ReturnType<typeof setInterval> | undefined

  const activeSessionConfig = computed(
    () => sessionConfigs.find(item => item.id === activeSession.value) ?? sessionConfigs[0],
  )

  const sampleChartOutput = `${CHART_RESULT_PREFIX}${JSON.stringify({
    type: 'line',
    title: 'Turn latency across stream frames (ms)',
    labels: ['Frame 1', 'Frame 2', 'Frame 3', 'Frame 4', 'Frame 5'],
    series: [{ name: 'P95 ms', values: [42, 39, 36, 33, 29] }],
    yLabel: 'ms',
    showValues: true,
  })}`

  const timelineSteps = computed<MockTimelineStep[]>(() => {
    const cfg = activeSessionConfig.value
    const userMessage: TxAiMessageModel = {
      id: `${cfg.id}-user-1`,
      role: 'user',
      content: cfg.prompt,
      createdAt: mockStartedAt,
      voiceClip: {
        durationMs: 4200,
        peaks: [0.22, 0.55, 0.78, 0.64, 0.35, 0.72, 0.85, 0.48, 0.3, 0.6],
      },
      attachments: [
        { kind: 'file', id: 'ctx-1', name: 'HomePage.vue', size: 61_200 },
      ],
    }

    const streamingParts: AiMessagePart[] = [
      {
        type: 'reasoning',
        text: 'Inspecting CoreApp stream clearance, ResizeObserver dock measurements, and turn footer hover thresholds.',
        done: false,
      },
      {
        type: 'text',
        text: 'Upgrading `TxAiConversation` onto `TxConversationStream` with `TxGradualBlur` masks, outline rail navigation, and resize-observed composer clearance…',
      },
    ]

    const toolParts: AiMessagePart[] = [
      {
        type: 'reasoning',
        text: 'Verified CoreApp HomeMessageRow parity and TX modular CSS limits.',
        done: true,
        durationMs: 920,
      },
      {
        type: 'tool-call',
        id: 'tool-render-chart',
        name: 'tuff_render_chart',
        status: 'running',
        summary: 'Comparing frame jitter across stream chunks',
      },
    ]

    const doneParts: AiMessagePart[] = [
      {
        type: 'reasoning',
        text: 'Completed parity check across stream virtualization, composer beam states, and turn footer metrics.',
        done: true,
        durationMs: 1280,
      },
      {
        type: 'tool-call',
        id: 'tool-render-chart',
        name: 'tuff_render_chart',
        status: 'done',
        summary: 'Frame jitter settled at 29ms P95',
        output: sampleChartOutput,
        durationMs: 410,
      },
      {
        type: 'text',
        text: [
          '### Parity summary',
          '',
          '- `TxAiConversation` wraps `TxConversationStream` with `TxAiMessageRail`, `TxMiko` empty state, and live composer dock clearance.',
          '- `TxAiComposer` integrates `TxBorderBeam`, `TxVoiceBeam`, `TxAttachmentTray`, `@`/`/` token completion, and the capsule Send/Stop/Queue island.',
          '',
          '```ts',
          'const sendState = deriveAiSendState({ sending, busy, hasDraft, allowEmptySend })',
          '```',
        ].join('\n'),
      },
    ]

    const errorMessage: TxAiMessageModel = {
      id: `${cfg.id}-assistant-error`,
      role: 'assistant',
      status: 'error',
      content: 'Partial stream persisted before interruption.',
      parts: [
        {
          type: 'reasoning',
          text: 'Connecting to remote worker endpoint…',
          done: true,
          durationMs: 650,
        },
        {
          type: 'text',
          text: 'Partial stream persisted before the upstream worker closed early.',
        },
      ],
      error: {
        title: 'Upstream coordinator timed out',
        detail: 'No response delta received after 15 seconds. You can retry the turn safely.',
        reportCode: 'STREAM_TIMEOUT',
        tone: 'danger',
        retryable: true,
        retryLabel: 'Retry turn',
      },
      footer: {
        content: 'Partial stream persisted before the upstream worker closed early.',
        regenerable: true,
        metrics: { latencyMs: 1520, totalTokens: 164, model: selectedModel.value },
      },
    }

    const doneAssistant: TxAiMessageModel = {
      id: `${cfg.id}-assistant-done`,
      role: 'assistant',
      status: 'done',
      parts: doneParts,
      footer: {
        content: 'Completed parity check across stream virtualization, composer beam states, and turn footer metrics.',
        regenerable: true,
        branchable: true,
        metrics: { latencyMs: 1280, completionTokens: 196, totalTokens: 312, cacheReadTokens: 64, model: selectedModel.value, coordinator: 'Tuff Pi' },
      },
    }

    return [
      {
        label: 'Empty state',
        description: 'Idle workspace with TxMiko empty head and starter suggestions',
        phase: 'empty',
        messages: [],
      },
      {
        label: 'Streaming response',
        description: 'Live token pacing with border beam + stop capsule active',
        phase: 'streaming',
        messages: [
          userMessage,
          { id: `${cfg.id}-assistant-stream`, role: 'assistant', status: 'streaming', parts: streamingParts },
        ],
      },
      {
        label: 'Tool execution',
        description: 'Tool call running in-stream with run status pill updating',
        phase: 'tool',
        messages: [
          userMessage,
          { id: `${cfg.id}-assistant-tool`, role: 'assistant', status: 'streaming', parts: toolParts },
        ],
      },
      {
        label: branch.value === 'error' ? 'Turn interrupted' : 'Turn complete',
        description: branch.value === 'error' ? 'Error recovery block + preserved turn footer' : 'Complete turn with interactive ECharts tool face and metrics footer',
        phase: branch.value === 'error' ? 'error' : 'done',
        messages: [
          userMessage,
          branch.value === 'error' ? errorMessage : doneAssistant,
        ],
      },
    ]
  })

  const activeStep = computed(() => timelineSteps.value[timelineIndex.value] ?? timelineSteps.value[0])
  const phase = computed(() => activeStep.value.phase)
  const generating = computed(() => phase.value === 'waiting' || phase.value === 'streaming' || phase.value === 'tool')
  const modeLabel = computed(() => activeSessionConfig.value.title)
  const currentStepLabel = computed(() => activeStep.value.label)

  const toolStatus = computed<TxAiToolStatus>(() => {
    if (phase.value === 'error')
      return 'error'
    if (phase.value === 'done')
      return 'success'
    if (phase.value === 'empty')
      return 'pending'
    return 'running'
  })

  const workspacePhase = computed(() => `${activeSession.value}:${phase.value}`)

  const messages = computed<TxAiMessageModel[]>(() => {
    const older: TxAiMessageModel[] = olderLoaded.value
      ? [
          { id: 'hist-user-0', role: 'user', content: 'Earlier thread: check previous CSS import audit results.', createdAt: mockStartedAt - 90_000 },
          { id: 'hist-asst-0', role: 'assistant', status: 'done', content: 'Earlier check passed with modular `@talex-touch/tuffex/*/style.css` imports.', createdAt: mockStartedAt - 85_000 },
        ]
      : []
    return [...older, ...activeStep.value.messages, ...customMessages.value]
  })

  const runStatus = computed<TxAiRunStatusProps | null>(() => {
    if (!generating.value && !queuedPrompts.value.length)
      return null
    return {
      streaming: phase.value === 'streaming',
      waiting: phase.value === 'waiting',
      queuedCount: queuedPrompts.value.length,
      elapsedMs: phase.value === 'tool' ? 2400 : 1200,
      activeTools: phase.value === 'tool'
        ? [{ name: 'tuff_render_chart', status: 'running', summary: 'Analyzing frame latency' }]
        : [],
    }
  })

  const contextMeter = computed<TxAiContextMeterProps>(() => ({
    usedTokens: 18_400 + messages.value.length * 420,
    maxTokens: 128_000,
  }))

  async function loadOlderMessages(): Promise<ConversationStreamLoadResult> {
    await new Promise(resolve => setTimeout(resolve, 250))
    olderLoaded.value = true
    return { hasMore: false }
  }

  function stopPlayback() {
    if (playTimer) {
      clearInterval(playTimer)
      playTimer = undefined
    }
    isPlaying.value = false
  }

  function stopDictation() {
    if (dictationTimer) {
      clearInterval(dictationTimer)
      dictationTimer = undefined
    }
    listening.value = false
    dictationElapsedMs.value = 0
  }

  function toggleDictation() {
    if (listening.value) {
      stopDictation()
      if (!draft.value.trim())
        draft.value = 'Inspect focus rings and reduced-motion rules across every toolbar chip.'
      return
    }
    listening.value = true
    dictationElapsedMs.value = 300
    dictationTimer = setInterval(() => {
      dictationElapsedMs.value += 200
    }, 200)
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
    olderLoaded.value = false
    customMessages.value = []
    queuedPrompts.value = []
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
  }

  function selectSession(session: MockSession) {
    stopPlayback()
    activeSession.value = session
    branch.value = 'success'
    timelineIndex.value = 3
    customMessages.value = []
    queuedPrompts.value = []
    draft.value = ''
  }

  function addSampleAttachment() {
    const id = `att-${Date.now()}`
    extraAttachments.value = [
      ...extraAttachments.value,
      { kind: 'file', id, name: `note-${extraAttachments.value.length + 1}.md`, size: 3200 },
    ]
  }

  function removeAttachment(id: string) {
    extraAttachments.value = extraAttachments.value.filter(item => !('id' in item && item.id === id))
  }

  function openAttachment(att: AiAttachmentFile) {
    draft.value = draft.value ? `${draft.value} @${att.name}` : `@${att.name} `
  }

  function sendDraft(payload?: { text: string }) {
    const text = (payload?.text ?? draft.value).trim()
    if (!text)
      return
    draft.value = ''
    customMessages.value = [
      ...customMessages.value,
      { id: `user-${Date.now()}`, role: 'user', content: text, createdAt: Date.now() },
      {
        id: `asst-${Date.now() + 1}`,
        role: 'assistant',
        status: 'done',
        content: `Received follow-up (${selectedModel.value}${webSearchEnabled.value ? ' · Search on' : ''}): **${text}**`,
        footer: {
          content: `Received follow-up: ${text}`,
          regenerable: true,
          metrics: { latencyMs: 640, completionTokens: 28, totalTokens: 86, model: selectedModel.value },
        },
      },
    ]
  }

  function queueDraft(payload?: { text: string }) {
    const text = (payload?.text ?? draft.value).trim()
    if (!text)
      return
    queuedPrompts.value = [...queuedPrompts.value, text]
    draft.value = ''
  }

  onBeforeUnmount(() => {
    stopPlayback()
    stopDictation()
  })

  return {
    activeSession,
    activeSessionConfig,
    activeStep,
    addSampleAttachment,
    branch,
    completeTimeline,
    composerAttachments: extraAttachments,
    composerCommands,
    composerModels,
    composerSources,
    contextMeter,
    currentStepLabel,
    dictationElapsedMs,
    draft,
    generating,
    isPlaying,
    listening,
    loadOlderMessages,
    messages,
    modeLabel,
    nextTimelineStep,
    olderLoaded,
    openAttachment,
    phase,
    phaseOptions,
    playFromStart,
    queueDraft,
    queuedPrompts,
    removeAttachment,
    resetTimeline,
    runStatus,
    selectBranch,
    selectPhase,
    selectSession,
    selectedModel,
    sendDraft,
    sessionConfigs,
    stopDictation,
    stopPlayback,
    timelineIndex,
    timelineSteps,
    toggleDictation,
    toolStatus,
    webSearchEnabled,
    workspacePhase,
  }
}
