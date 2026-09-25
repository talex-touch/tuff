<script setup lang="ts">
// Automation template: "Clipboard OCR → Translate", the workflow Tuff's own OCR
// module runs — native OCR first, an AI re-read only when the native engine is
// not confident enough, then translation and a notification. The canvas is a
// TxFlowchart whose node cards draw their own run state; the inspector edits
// the config the next run reads, so raising the confidence threshold above what
// the engine reports visibly re-routes the run through the AI branch.
//
// A run is one cancellable setTimeout chain, built up front from the config. It
// plays once when the stage first comes into view; under reduced motion the
// chain is applied synchronously and the template shows the finished run.
//
// Node coordinates and the canvas height come from the frame's measured size —
// TxFlowchart takes pixels, which no container query can reach.
import type { FineTuneTypeOption, FineTuneValues } from '@talex-touch/tuffex/fine-tune-card'
import type { TxFlatSelectValue } from '@talex-touch/tuffex/flat-select'
import type { FlowEdge, FlowNode } from '@talex-touch/tuffex/flowchart'
import type { TaskRowDetail, TaskRowItem, TaskRowStatus } from '@talex-touch/tuffex/task-rows'
import type { TimelineItemColor } from '@talex-touch/tuffex/timeline'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateAutomationSplit from './TemplateAutomationSplit.vue'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide'
type NodeId = 'trigger' | 'ocr' | 'fallback' | 'translate' | 'notify'
type NodeState = 'idle' | 'running' | 'done' | 'skipped' | 'error' | 'cancelled'
type Outcome = 'success' | 'fallback' | 'retried' | 'failed' | 'cancelled'
type EngineKey = 'vision' | 'windows' | 'ai'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

// ── Graph ────────────────────────────────────────────────────────────────────

const NODE_IDS: NodeId[] = ['trigger', 'ocr', 'fallback', 'translate', 'notify']

const NODE_ICONS: Record<NodeId, string> = {
  trigger: 'i-carbon-paste',
  ocr: 'i-carbon-scan-alt',
  fallback: 'i-carbon-magic-wand',
  translate: 'i-carbon-translate',
  notify: 'i-carbon-notification',
}

/** The OCR → translate edge is the skip path; the fallback hangs off to the side. */
const EDGE_LIST: Array<[NodeId, NodeId]> = [
  ['trigger', 'ocr'],
  ['ocr', 'translate'],
  ['ocr', 'fallback'],
  ['fallback', 'translate'],
  ['translate', 'notify'],
]

/** Which progress step a node reports into. */
const NODE_STEP: Record<NodeId, number> = { trigger: 0, ocr: 1, fallback: 1, translate: 2, notify: 3 }

/** What each engine reports for the sample screenshot, in percent. */
const ENGINE_CONFIDENCE: Record<EngineKey, number> = { vision: 93, windows: 88, ai: 97 }
const ENGINE_ID: Record<EngineKey, string> = { vision: 'apple-vision', windows: 'windows-ocr', ai: 'ai-provider' }

/** Every node card is this tall in every state, so edges never jitter as a run advances. */
const CARD_HEIGHT = 62
/** Canvas margins around the graph; the bottom one keeps the drag hint clear of the last card. */
const CANVAS_TOP = 20
const CANVAS_BOTTOM = 36
const HEADER_HEIGHT = 56
const COLUMN_RAIL = 300
const WIDE_HISTORY = 232
const WIDE_RAIL = 340
const NARROW_CANVAS = 420

function isNodeId(id: string): id is NodeId {
  return (NODE_IDS as string[]).includes(id)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── Config ───────────────────────────────────────────────────────────────────

interface AutomationConfig {
  enabled: boolean
  trigger: { watch: TxFlatSelectValue, debounce: number, onlyHidden: boolean }
  ocr: { engine: TxFlatSelectValue, minConfidence: number, detectLanguage: boolean }
  fallback: { model: TxFlatSelectValue, timeout: number, keepLayout: boolean }
  translate: { target: TxFlatSelectValue, provider: TxFlatSelectValue, maxTokens: number, rateLimit: boolean }
  notify: FineTuneValues
}

const NOTIFY_DEFAULTS: FineTuneValues = { layout: 'row', width: 320, height: 72, radius: 12, opacity: 100, type: 'toast' }

function defaultConfig(): AutomationConfig {
  return {
    enabled: true,
    trigger: { watch: 'image', debounce: 300, onlyHidden: true },
    ocr: { engine: 'vision', minConfidence: 80, detectLanguage: true },
    fallback: { model: 'local-vision', timeout: 8, keepLayout: true },
    translate: { target: 'en', provider: 'local', maxTokens: 512, rateLimit: false },
    notify: { ...NOTIFY_DEFAULTS },
  }
}

const config = reactive<AutomationConfig>(defaultConfig())

const engine = computed<EngineKey>(() => {
  const value = String(config.ocr.engine)
  return value === 'windows' || value === 'ai' ? value : 'vision'
})
const engineConfidence = computed(() => ENGINE_CONFIDENCE[engine.value])

// ── Copy ─────────────────────────────────────────────────────────────────────

const copy = computed(() => zh.value
  ? {
      frameTitle: 'Automation 自动化编排',
      title: '剪贴板截图翻译',
      subtitle: '复制图片 → 识别文字 → 翻译 → 通知',
      pausedSubtitle: '自动运行已停用，仍可手动运行',
      autoRun: '自动运行',
      run: '运行',
      stop: '停止',
      running: '运行中',
      outcome: { success: '成功', fallback: '经 AI 重读', retried: '重试后成功', failed: '失败', cancelled: '已取消' } as Record<Outcome, string>,
      canvas: '剪贴板截图翻译流程',
      hint: '拖动节点调整布局 · 点击节点编辑配置',
      railLabel: '侧栏内容',
      tabs: { inspector: '节点配置', run: '本次运行' },
      steps: ['触发', '识别', '翻译', '通知'],
      kinds: { trigger: '触发器', ocr: '识别', fallback: '兜底分支', translate: '动作', notify: '通知' } as Record<NodeId, string>,
      nodes: { trigger: '剪贴板图片', ocr: '原生 OCR', fallback: 'AI 重读', translate: '翻译', notify: '通知并复制' } as Record<NodeId, string>,
      badge: { running: '运行中', done: '完成', skipped: '跳过', error: '限流', cancelled: '已取消', listening: '监听中', paused: '暂停' },
      meta: {
        trigger: (watch: string, debounce: number) => `${watch} · 防抖 ${debounce}ms`,
        triggerDone: '1280×720 · 212 KB',
        paused: '已暂停 · 可手动运行',
        ocrDone: (chars: number, confidence: number) => `${chars} 字 · 置信度 ${confidence}%`,
        fallback: (threshold: number, model: string) => `置信度 < ${threshold}% · ${model}`,
        fallbackDone: '146 字 · 置信度 99%',
        fallbackSkipped: (confidence: number, threshold: number) => `${confidence}% ≥ ${threshold}%，无需重读`,
        translateError: '429 · 600ms 后重试',
        translateDone: '2 句 · 38 tokens',
        notify: (type: string) => `${type} · 自动复制`,
        notifyDone: '已写入剪贴板',
      },
      fields: {
        watch: '监听内容',
        debounce: '防抖',
        onlyHidden: '仅在 CoreBox 隐藏时',
        engine: '识别引擎',
        minConfidence: '最低置信度',
        detectLanguage: '自动识别语言',
        model: '重读模型',
        timeout: '超时',
        keepLayout: '保留原始排版',
        target: '目标语言',
        provider: '翻译服务',
        maxTokens: '最多 tokens',
        rateLimit: '模拟限流（429）',
        value: (label: string) => `${label}数值`,
      },
      notes: {
        trigger: (onlyHidden: boolean) => (onlyHidden ? 'CoreBox 打开时复制的图片不会触发。' : '任何时候复制图片都会触发。'),
        ocr: (confidence: number) => `当前引擎对样例截图的置信度是 ${confidence}%。把阈值调到它之上，下次运行会走 AI 重读。`,
        fallback: (threshold: number, confidence: number) => (confidence < threshold
          ? `识别置信度 ${confidence}% 低于 ${threshold}%，下次运行会执行这一步。`
          : `仅在识别置信度低于 ${threshold}% 时执行，下次运行会跳过。`),
        translate: (rateLimit: boolean) => (rateLimit ? '下次运行会先收到 429，600ms 后自动重试。' : '打开「模拟限流」可以预演失败后的重试。'),
        notify: '预览随参数实时变化。',
      },
      fineTune: {
        title: '通知样式',
        layout: '布局',
        type: '类型',
        placeholder: '选择类型',
        adjust: '可调整',
        edited: '已修改',
        fields: { width: '宽', height: '高', radius: '圆角', opacity: '不透明度' },
      },
      preview: '预览',
      previewActions: ['打开', '忽略'],
      runTitle: (id: number) => `运行 #${id}`,
      runIdle: '等待运行',
      tasks: { trigger: '触发', ocr: '识别', fallback: '重读', translate: '翻译', notify: '通知' } as Record<NodeId, string>,
      amounts: { chars: (count: number) => `${count} 字` },
      details: {
        size: '尺寸',
        format: '格式',
        engine: '引擎',
        confidence: '置信度',
        language: '语言',
        model: '模型',
        target: '目标语言',
        provider: '服务',
        tokens: 'Tokens',
        took: '耗时',
        style: '样式',
        clipboard: '剪贴板',
        written: '已写入',
      },
      done: '完成',
      failed: '失败',
      history: '运行记录',
      historyNotes: {
        success: (duration: string) => `译文已复制 · ${duration}`,
        fallback: (duration: string) => `置信度偏低，AI 重读 · ${duration}`,
        retried: (duration: string) => `429 限流，重试成功 · ${duration}`,
        failed: () => '连续 3 次 429，已放弃',
        cancelled: () => '手动停止',
      } as Record<Outcome, (duration: string) => string>,
      toastTitle: '译文已复制到剪贴板',
      toastLabel: '运行结果',
      dismiss: '关闭通知',
      log: '运行日志',
      copyLog: '复制',
      copiedLog: '已复制',
    }
  : {
      frameTitle: 'Automation',
      title: 'Clipboard OCR → Translate',
      subtitle: 'Copy an image → recognise → translate → notify',
      pausedSubtitle: 'Auto-run is off; manual runs still work',
      autoRun: 'Auto-run',
      run: 'Run',
      stop: 'Stop',
      running: 'Running',
      outcome: { success: 'Succeeded', fallback: 'AI re-read', retried: 'Retried', failed: 'Failed', cancelled: 'Cancelled' } as Record<Outcome, string>,
      canvas: 'Clipboard OCR to translate workflow',
      hint: 'Drag nodes to rearrange · click one to edit it',
      railLabel: 'Side panel',
      tabs: { inspector: 'Node', run: 'This run' },
      steps: ['Trigger', 'Recognise', 'Translate', 'Notify'],
      kinds: { trigger: 'Trigger', ocr: 'Recognise', fallback: 'Fallback', translate: 'Action', notify: 'Notify' } as Record<NodeId, string>,
      nodes: { trigger: 'Clipboard image', ocr: 'Native OCR', fallback: 'AI re-read', translate: 'Translate', notify: 'Notify & copy' } as Record<NodeId, string>,
      badge: { running: 'Running', done: 'Done', skipped: 'Skipped', error: '429', cancelled: 'Cancelled', listening: 'Listening', paused: 'Paused' },
      meta: {
        trigger: (watch: string, debounce: number) => `${watch} · ${debounce}ms debounce`,
        triggerDone: '1280×720 · 212 KB',
        paused: 'Paused · manual runs only',
        ocrDone: (chars: number, confidence: number) => `${chars} chars · ${confidence}% confident`,
        fallback: (threshold: number, model: string) => `Below ${threshold}% · ${model}`,
        fallbackDone: '146 chars · 99% confident',
        fallbackSkipped: (confidence: number, threshold: number) => `${confidence}% ≥ ${threshold}%, not needed`,
        translateError: '429 · retrying in 600ms',
        translateDone: '2 sentences · 38 tokens',
        notify: (type: string) => `${type} · copies the result`,
        notifyDone: 'Copied to the clipboard',
      },
      fields: {
        watch: 'Watch for',
        debounce: 'Debounce',
        onlyHidden: 'Only while CoreBox is hidden',
        engine: 'Engine',
        minConfidence: 'Min confidence',
        detectLanguage: 'Detect language',
        model: 'Re-read model',
        timeout: 'Timeout',
        keepLayout: 'Keep the original layout',
        target: 'Target language',
        provider: 'Service',
        maxTokens: 'Max tokens',
        rateLimit: 'Simulate rate limit (429)',
        value: (label: string) => `${label} value`,
      },
      notes: {
        trigger: (onlyHidden: boolean) => (onlyHidden ? 'Images copied while CoreBox is open do not trigger it.' : 'Any copied image triggers it.'),
        ocr: (confidence: number) => `This engine reads the sample screenshot at ${confidence}%. Set the threshold above that and the next run takes the AI re-read.`,
        fallback: (threshold: number, confidence: number) => (confidence < threshold
          ? `Recognition lands at ${confidence}%, under ${threshold}%, so the next run takes this step.`
          : `Runs only when recognition is under ${threshold}%; the next run skips it.`),
        translate: (rateLimit: boolean) => (rateLimit ? 'The next run gets a 429 first and retries after 600ms.' : 'Turn on the rate-limit switch to rehearse a failure and its retry.'),
        notify: 'The preview follows every change.',
      },
      fineTune: {
        title: 'Notification',
        layout: 'Layout',
        type: 'Type',
        placeholder: 'Select type',
        adjust: 'Adjust',
        edited: 'Edited',
        fields: { width: 'W', height: 'H', radius: 'Radius', opacity: 'Opacity' },
      },
      preview: 'Preview',
      previewActions: ['Open', 'Dismiss'],
      runTitle: (id: number) => `Run #${id}`,
      runIdle: 'Waiting to run',
      tasks: { trigger: 'Trigger', ocr: 'OCR', fallback: 'Re-read', translate: 'Translate', notify: 'Notify' } as Record<NodeId, string>,
      amounts: { chars: (count: number) => `${count} chars` },
      details: {
        size: 'Size',
        format: 'Format',
        engine: 'Engine',
        confidence: 'Confidence',
        language: 'Language',
        model: 'Model',
        target: 'Target',
        provider: 'Service',
        tokens: 'Tokens',
        took: 'Took',
        style: 'Style',
        clipboard: 'Clipboard',
        written: 'written',
      },
      done: 'Done',
      failed: 'Failed',
      history: 'Run history',
      historyNotes: {
        success: (duration: string) => `Translation copied · ${duration}`,
        fallback: (duration: string) => `Low confidence, AI re-read · ${duration}`,
        retried: (duration: string) => `Rate limited, retry succeeded · ${duration}`,
        failed: () => 'Three 429s in a row, gave up',
        cancelled: () => 'Stopped by hand',
      } as Record<Outcome, (duration: string) => string>,
      toastTitle: 'Translation copied',
      toastLabel: 'Run result',
      dismiss: 'Dismiss notification',
      log: 'Run log',
      copyLog: 'Copy',
      copiedLog: 'Copied',
    })

type OptionKey = 'watch' | 'engine' | 'model' | 'target' | 'provider' | 'type'

const options = computed<Record<OptionKey, FineTuneTypeOption[]>>(() => ({
  watch: [
    { value: 'image', label: zh.value ? '图片' : 'Images' },
    { value: 'image-file', label: zh.value ? '图片和文件' : 'Images & files' },
    { value: 'any', label: zh.value ? '任意内容' : 'Anything' },
  ],
  engine: [
    { value: 'vision', label: 'Apple Vision' },
    { value: 'windows', label: 'Windows OCR' },
    { value: 'ai', label: zh.value ? 'AI 服务商' : 'AI provider' },
  ],
  model: [
    { value: 'local-vision', label: zh.value ? '端侧视觉模型' : 'On-device vision' },
    { value: 'nexus', label: 'Nexus AI' },
  ],
  target: [
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
  ],
  provider: [
    { value: 'local', label: zh.value ? '端侧模型' : 'On-device' },
    { value: 'nexus', label: 'Nexus AI' },
  ],
  type: [
    { value: 'toast', label: zh.value ? '气泡' : 'Toast' },
    { value: 'banner', label: zh.value ? '横幅' : 'Banner' },
    { value: 'hud', label: 'HUD' },
  ],
}))

function labelOf(key: OptionKey, value: TxFlatSelectValue | null): string {
  return options.value[key].find(option => option.value === value)?.label ?? String(value ?? '')
}

/** The sample screenshot is a Chinese chat line; this is what each target reads. */
const TRANSLATIONS: Record<string, string> = {
  en: 'Release ships at 8 pm tonight — merge #412 first.',
  ja: '今夜 8 時にリリースします。先に #412 をマージしてください。',
  ko: '오늘 밤 8시에 배포합니다. 먼저 #412를 머지해 주세요.',
}

// ── Run state ────────────────────────────────────────────────────────────────

const states = reactive<Record<NodeId, NodeState>>({
  trigger: 'idle',
  ocr: 'idle',
  fallback: 'idle',
  translate: 'idle',
  notify: 'idle',
})

/** `from>to` of the edge a payload is travelling along, drawn dashed and moving. */
const flight = ref<string | null>(null)
const running = ref(false)
const startedAt = ref(0)
const outcome = ref<Outcome | null>(null)
const currentStep = ref(-1)
/** Seeded with the run that happened before the reader arrived. */
const lastRunId = ref(128)
const runId = ref(128)
const lastDuration = ref(3300)
/** Confidence and threshold the latest run saw, so its node text does not follow later edits. */
const runReading = ref({ confidence: 93, threshold: 80 })
const toastOpen = ref(false)
const railTab = ref<'inspector' | 'run'>('inspector')
const selected = ref<NodeId>('ocr')
const splitRatio = ref(0.72)
const entered = ref(false)
const logScroller = ref<HTMLElement | null>(null)
/** Drag offsets from each node's computed spot; the layout itself follows the canvas size. */
const offsets = reactive<Partial<Record<NodeId, { dx: number, dy: number }>>>({})

interface HistoryEntry {
  id: number
  outcome: Outcome
  duration: number
  clock: string
}

function seedHistory(): HistoryEntry[] {
  return [
    { id: 128, outcome: 'success', duration: 3300, clock: '12:04' },
    { id: 127, outcome: 'fallback', duration: 4500, clock: '11:52' },
    { id: 126, outcome: 'failed', duration: 5200, clock: '11:40' },
    { id: 125, outcome: 'success', duration: 3200, clock: '11:02' },
  ]
}

const history = ref<HistoryEntry[]>(seedHistory())

// ── Log ──────────────────────────────────────────────────────────────────────

/** Wall clock a run starts at, in ms since midnight: #129 at 12:16:08.204, one every 73s after. */
function runClock(id: number): number {
  if (id <= 128)
    return ((12 * 60 + 4) * 60 + 7) * 1000 + 112
  return ((12 * 60 + 16) * 60 + 8) * 1000 + 204 + (id - 129) * 73_400
}

function formatClock(ms: number): string {
  const pad = (value: number, size = 2): string => String(Math.floor(value)).padStart(size, '0')
  return `${pad(ms / 3_600_000)}:${pad((ms / 60_000) % 60)}:${pad((ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

function logLine(start: number, at: number, stage: string, message: string): string {
  return `${formatClock(start + at)}  ${stage.padEnd(9)}  ${message}`
}

function seedLog(): string[] {
  const start = runClock(128)
  return [
    logLine(start, 0, 'trigger', 'clipboard.image 1280x720 png · 212 KB'),
    logLine(start, 700, 'ocr', 'engine=apple-vision lang=auto'),
    logLine(start, 1500, 'ocr', '142 chars · confidence 0.93 · zh-Hans'),
    logLine(start, 1500, 'branch', '0.93 >= 0.80 → skip ai re-read'),
    logLine(start, 1800, 'translate', 'provider=on-device target=en'),
    logLine(start, 3000, 'translate', '2 sentences · 38 tokens'),
    logLine(start, 3300, 'notify', 'toast shown · copied to clipboard'),
  ]
}

const logLines = ref<string[]>(seedLog())
/** Lines of the current log shown so far; -1 shows all of them. */
const revealed = ref(-1)
const logCode = computed(() => logLines.value.join('\n'))

function scrollLog(): void {
  void nextTick(() => {
    const scroller = logScroller.value
    // The log's own container, never the page: scrolling the docs page from a
    // demo would drag the reader away from wherever they are reading.
    if (scroller)
      scroller.scrollTop = scroller.scrollHeight
  })
}

// ── Running ──────────────────────────────────────────────────────────────────

interface RunPlan {
  id: number
  steps: Array<{ at: number, apply: () => void }>
  log: string[]
  duration: number
  outcome: Outcome
  toast: boolean
}

let timers: Array<ReturnType<typeof setTimeout>> = []
let activePlan: RunPlan | null = null

function clearTimers(): void {
  for (const timer of timers)
    clearTimeout(timer)
  timers = []
}

/** Only ever asked from the client: runs start from `@enter`, a click or a reset. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function setNode(id: NodeId, state: NodeState): void {
  states[id] = state
  if (state === 'running')
    currentStep.value = NODE_STEP[id]
}

/**
 * The whole run, decided from the config at the moment Run is pressed: later
 * edits in the inspector apply to the next run, as they would in the product.
 */
function buildPlan(id: number, toast: boolean): RunPlan {
  const confidence = engineConfidence.value
  const threshold = config.ocr.minConfidence
  const reread = confidence < threshold
  const rateLimited = config.translate.rateLimit
  const start = runClock(id)
  const steps: RunPlan['steps'] = []
  const log: string[] = []

  const at = (time: number, apply: () => void): void => {
    steps.push({ at: time, apply })
  }
  const line = (time: number, stage: string, message: string): void => {
    log.push(logLine(start, time, stage, message))
    const count = log.length
    at(time, () => {
      revealed.value = count
      scrollLog()
    })
  }
  const ratio = (value: number): string => (value / 100).toFixed(2)

  at(0, () => {
    runReading.value = { confidence, threshold }
    setNode('trigger', 'running')
  })
  line(0, 'trigger', 'clipboard.image 1280x720 png · 212 KB')
  at(400, () => {
    setNode('trigger', 'done')
    flight.value = 'trigger>ocr'
  })
  at(700, () => {
    flight.value = null
    setNode('ocr', 'running')
  })
  line(700, 'ocr', `engine=${ENGINE_ID[engine.value]} lang=${config.ocr.detectLanguage ? 'auto' : 'zh-Hans'}`)
  at(1500, () => setNode('ocr', 'done'))
  line(1500, 'ocr', `142 chars · confidence ${ratio(confidence)} · zh-Hans`)

  let time = 1500
  if (reread) {
    line(time, 'branch', `${ratio(confidence)} < ${ratio(threshold)} → ai re-read`)
    at(time, () => {
      flight.value = 'ocr>fallback'
    })
    at(time + 300, () => {
      flight.value = null
      setNode('fallback', 'running')
    })
    line(time + 300, 'vision', `model=${String(config.fallback.model)} · re-reading 1 region`)
    at(time + 1200, () => {
      setNode('fallback', 'done')
      flight.value = 'fallback>translate'
    })
    line(time + 1200, 'vision', '146 chars · confidence 0.99')
    time += 1200
  }
  else {
    line(time, 'branch', `${ratio(confidence)} >= ${ratio(threshold)} → skip ai re-read`)
    at(time, () => {
      setNode('fallback', 'skipped')
      flight.value = 'ocr>translate'
    })
  }

  at(time + 300, () => {
    flight.value = null
    setNode('translate', 'running')
  })
  line(time + 300, 'translate', `provider=${config.translate.provider === 'nexus' ? 'nexus-ai' : 'on-device'} target=${String(config.translate.target)}`)
  time += 300

  if (rateLimited) {
    at(time + 600, () => setNode('translate', 'error'))
    line(time + 600, 'translate', '429 too many requests · retry in 600 ms')
    at(time + 1200, () => setNode('translate', 'running'))
    line(time + 1200, 'translate', 'retry 1/3')
    time += 1200
  }

  at(time + 1200, () => {
    setNode('translate', 'done')
    flight.value = 'translate>notify'
  })
  line(time + 1200, 'translate', '2 sentences · 38 tokens')
  time += 1200

  const type = String(config.notify.type ?? 'toast')
  line(time + 300, 'notify', `${type} shown · copied to clipboard`)
  const plan: RunPlan = {
    id,
    steps,
    log,
    duration: time + 300,
    outcome: rateLimited ? 'retried' : reread ? 'fallback' : 'success',
    toast,
  }
  at(time + 300, () => {
    flight.value = null
    setNode('notify', 'done')
    finish(plan)
  })
  return plan
}

function recordHistory(entry: HistoryEntry): void {
  history.value = [entry, ...history.value].slice(0, 6)
}

function finish(plan: RunPlan): void {
  running.value = false
  outcome.value = plan.outcome
  currentStep.value = 4
  lastRunId.value = plan.id
  lastDuration.value = plan.duration
  activePlan = null
  recordHistory({ id: plan.id, outcome: plan.outcome, duration: plan.duration, clock: formatClock(runClock(plan.id)).slice(0, 5) })
  if (!plan.toast)
    return
  toastOpen.value = true
  // Reduced motion runs no timers at all: the panel stays until dismissed.
  if (!prefersReducedMotion()) {
    timers.push(setTimeout(() => {
      toastOpen.value = false
    }, 4000))
  }
}

function startRun(toast: boolean): void {
  clearTimers()
  const plan = buildPlan(lastRunId.value + 1, toast)
  activePlan = plan
  for (const id of NODE_IDS)
    states[id] = 'idle'
  flight.value = null
  runId.value = plan.id
  running.value = true
  startedAt.value = Date.now()
  outcome.value = null
  currentStep.value = 0
  toastOpen.value = false
  logLines.value = plan.log
  revealed.value = 0
  railTab.value = 'run'

  if (prefersReducedMotion()) {
    for (const step of plan.steps)
      step.apply()
    return
  }
  for (const step of plan.steps)
    timers.push(setTimeout(step.apply, step.at))
}

function stopRun(): void {
  const plan = activePlan
  if (!running.value || !plan)
    return
  clearTimers()
  for (const id of NODE_IDS) {
    if (states[id] === 'running' || states[id] === 'error')
      states[id] = 'cancelled'
  }
  flight.value = null
  running.value = false
  const elapsed = Date.now() - startedAt.value
  const shown = revealed.value < 0 ? logLines.value : logLines.value.slice(0, revealed.value)
  logLines.value = [...shown, logLine(runClock(plan.id), elapsed, 'run', 'cancelled by user')]
  revealed.value = logLines.value.length
  scrollLog()
  outcome.value = 'cancelled'
  lastRunId.value = plan.id
  lastDuration.value = elapsed
  activePlan = null
  recordHistory({ id: plan.id, outcome: 'cancelled', duration: elapsed, clock: formatClock(runClock(plan.id)).slice(0, 5) })
}

function autoRun(): void {
  // The auto-run's toast would need a timer to go away again; under reduced
  // motion the finished canvas says enough without it.
  startRun(!prefersReducedMotion())
}

function onEnter(): void {
  entered.value = true
  autoRun()
}

function resetDemo(): void {
  clearTimers()
  activePlan = null
  Object.assign(config, defaultConfig())
  for (const id of NODE_IDS) {
    states[id] = 'idle'
    delete offsets[id]
  }
  flight.value = null
  running.value = false
  outcome.value = null
  currentStep.value = -1
  lastRunId.value = 128
  runId.value = 128
  lastDuration.value = 3300
  runReading.value = { confidence: 93, threshold: 80 }
  logLines.value = seedLog()
  revealed.value = -1
  history.value = seedHistory()
  toastOpen.value = false
  railTab.value = 'inspector'
  selected.value = 'ocr'
  splitRatio.value = 0.72
  if (entered.value)
    autoRun()
}

watch(locale, resetDemo)
onBeforeUnmount(clearTimers)

defineExpose({ resetDemo })

// ── Derived display ──────────────────────────────────────────────────────────

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

const headerStatus = computed<{ tone: 'success' | 'warning' | 'danger' | 'muted', text: string }>(() => {
  const value = outcome.value ?? 'success'
  const tone = value === 'success' ? 'success' : value === 'failed' ? 'danger' : value === 'cancelled' ? 'muted' : 'warning'
  return { tone, text: `#${lastRunId.value} · ${copy.value.outcome[value]} · ${seconds(lastDuration.value)}` }
})

function nodeMeta(id: NodeId): string {
  const state = states[id]
  const meta = copy.value.meta
  switch (id) {
    case 'trigger':
      if (state === 'done')
        return meta.triggerDone
      return config.enabled ? meta.trigger(labelOf('watch', config.trigger.watch), config.trigger.debounce) : meta.paused
    case 'ocr':
      if (state === 'done')
        return meta.ocrDone(142, runReading.value.confidence)
      return `${labelOf('engine', config.ocr.engine)} · ≥ ${config.ocr.minConfidence}%`
    case 'fallback':
      if (state === 'done')
        return meta.fallbackDone
      if (state === 'skipped')
        return meta.fallbackSkipped(runReading.value.confidence, runReading.value.threshold)
      return meta.fallback(config.ocr.minConfidence, labelOf('model', config.fallback.model))
    case 'translate':
      if (state === 'error')
        return meta.translateError
      if (state === 'done')
        return meta.translateDone
      return `→ ${labelOf('target', config.translate.target)} · ${labelOf('provider', config.translate.provider)}`
    default:
      return state === 'done' ? meta.notifyDone : meta.notify(labelOf('type', config.notify.type))
  }
}

/** A finished state gets a badge; a running node gets the moving indicator. */
function nodeBadge(id: NodeId): { tone: 'success' | 'danger' | 'muted' | 'info', text: string } | null {
  const badge = copy.value.badge
  switch (states[id]) {
    case 'done':
      return { tone: 'success', text: badge.done }
    case 'skipped':
      return { tone: 'muted', text: badge.skipped }
    case 'error':
      return { tone: 'danger', text: badge.error }
    case 'cancelled':
      return { tone: 'muted', text: badge.cancelled }
    default:
      if (id === 'trigger' && !config.enabled)
        return { tone: 'muted', text: badge.paused }
      return null
  }
}

const edges = computed<FlowEdge[]>(() => EDGE_LIST.map(([from, to]) => ({
  from,
  to,
  dashed: flight.value === `${from}>${to}`,
})))

const TASK_STATUS: Record<NodeState, TaskRowStatus> = {
  idle: 'pending',
  running: 'running',
  done: 'done',
  skipped: 'pending',
  error: 'error',
  cancelled: 'pending',
}

function taskDetails(id: NodeId): TaskRowDetail[] {
  const d = copy.value.details
  switch (id) {
    case 'trigger':
      return [{ label: d.size, meta: '1280×720' }, { label: d.format, meta: 'PNG · 212 KB' }]
    case 'ocr':
      return [
        { label: d.engine, meta: ENGINE_ID[engine.value] },
        { label: d.confidence, meta: (runReading.value.confidence / 100).toFixed(2) },
        { label: d.language, meta: 'zh-Hans' },
      ]
    case 'fallback':
      return [{ label: d.model, meta: String(config.fallback.model) }, { label: d.confidence, meta: '0.99' }]
    case 'translate':
      return [
        { label: d.target, meta: labelOf('target', config.translate.target) },
        { label: d.provider, meta: config.translate.provider === 'nexus' ? 'nexus-ai' : 'on-device' },
        { label: d.tokens, meta: '38' },
        { label: d.took, meta: '1.2s' },
      ]
    default:
      return [{ label: d.style, meta: labelOf('type', config.notify.type) }, { label: d.clipboard, meta: d.written }]
  }
}

/**
 * One-word step titles: in the 300px rail the amount and the status pill take
 * most of the row, and the detail belongs in `amount` / `details` anyway.
 */
const taskRows = computed<TaskRowItem[]>(() => NODE_IDS.map((id, index) => {
  const state = states[id]
  const amounts: Partial<Record<NodeId, string>> = {
    trigger: '212 KB',
    ocr: copy.value.amounts.chars(142),
    fallback: copy.value.amounts.chars(146),
    translate: '38 tokens',
    notify: labelOf('type', config.notify.type),
  }
  return {
    id,
    label: copy.value.tasks[id],
    status: TASK_STATUS[state],
    index: index + 1,
    amount: state === 'done' ? amounts[id] : undefined,
    statusText: state === 'skipped' ? copy.value.badge.skipped : state === 'cancelled' ? copy.value.badge.cancelled : undefined,
    details: state === 'done' ? taskDetails(id) : undefined,
  }
}))

const runHeading = computed(() => {
  if (running.value)
    return { title: copy.value.runTitle(runId.value), tone: 'info' as const, text: copy.value.running }
  if (outcome.value)
    return { title: copy.value.runTitle(lastRunId.value), tone: headerStatus.value.tone, text: `${copy.value.outcome[outcome.value]} · ${seconds(lastDuration.value)}` }
  return { title: copy.value.runTitle(lastRunId.value + 1), tone: 'muted' as const, text: copy.value.runIdle }
})

const HISTORY_COLOR: Record<Outcome, TimelineItemColor> = {
  success: 'success',
  fallback: 'warning',
  retried: 'warning',
  failed: 'error',
  cancelled: 'default',
}

const translation = computed(() => TRANSLATIONS[String(config.translate.target)] ?? TRANSLATIONS.en!)

const previewStyle = computed(() => ({
  '--flow-preview-width': `${config.notify.width}px`,
  '--flow-preview-height': `${config.notify.height}px`,
  '--flow-preview-radius': `${config.notify.radius}px`,
  '--flow-preview-opacity': String(config.notify.opacity / 100),
}))

const FINE_TUNE_RANGES = {
  width: { min: 200, max: 420 },
  height: { min: 48, max: 140 },
  radius: { min: 0, max: 28 },
  opacity: { min: 40, max: 100 },
}

// ── Stage geometry ───────────────────────────────────────────────────────────

/** Mirrors the `@container template` breakpoints; width 0 is the unmeasured first frame. */
function layoutOf(width: number): Layout {
  if (width === 0)
    return 'column'
  return width < 640 ? 'narrow' : width < 960 ? 'column' : 'wide'
}

function canvasSize(width: number, height: number): { w: number, h: number } {
  const stageWidth = width || 782
  const stageHeight = height || 560
  const layout = layoutOf(width)
  if (layout === 'wide')
    return { w: stageWidth - WIDE_HISTORY - WIDE_RAIL, h: Math.floor((stageHeight - HEADER_HEIGHT) * splitRatio.value) }
  if (layout === 'narrow')
    return { w: stageWidth, h: NARROW_CANVAS }
  return { w: stageWidth - COLUMN_RAIL, h: stageHeight - HEADER_HEIGHT }
}

function nodeWidth(width: number): number {
  const layout = layoutOf(width)
  if (layout === 'wide')
    return 236
  if (layout === 'column')
    return 212
  return clamp(Math.round(canvasSize(width, 0).w * 0.56), 176, 212)
}

/** Where each node was drawn last, so a drop can be turned back into an offset. */
let renderedNodes: FlowNode[] = []

/**
 * A top-down DAG centred in the canvas: the main path on one column, the
 * fallback offset to the right so the skip edge runs straight past it.
 * Recomputed from the measured canvas, with any drag kept as an offset.
 */
function flowNodes(width: number, height: number): FlowNode[] {
  const { w, h } = canvasSize(width, height)
  const nodeW = nodeWidth(width)
  const available = h - CANVAS_TOP - CANVAS_BOTTOM - CARD_HEIGHT
  const pitch = clamp(available / 4, 64, 104)
  const top = CANVAS_TOP + Math.max(0, Math.round((available - 4 * pitch) / 2))
  const spread = Math.round(nodeW * 0.86)
  const mainX = clamp(Math.round((w - nodeW - spread) / 2 + nodeW / 2), nodeW / 2 + 16, w - nodeW / 2 - 16)
  const branchX = Math.min(w - nodeW / 2 - 16, mainX + spread)
  const base: Record<NodeId, [number, number]> = {
    trigger: [mainX, top],
    ocr: [mainX, top + pitch],
    fallback: [branchX, top + 2 * pitch],
    translate: [mainX, top + 3 * pitch],
    notify: [mainX, top + 4 * pitch],
  }
  renderedNodes = NODE_IDS.map((id) => {
    const offset = offsets[id]
    return {
      id,
      x: Math.round(clamp(base[id][0] + (offset?.dx ?? 0), nodeW / 2 + 8, w - nodeW / 2 - 8)),
      y: Math.round(clamp(base[id][1] + (offset?.dy ?? 0), 8, h - CARD_HEIGHT - 8)),
    }
  })
  return renderedNodes
}

function onNodeMove({ id, x, y }: { id: string, x: number, y: number }): void {
  const node = renderedNodes.find(entry => entry.id === id)
  if (!node || !isNodeId(id))
    return
  const current = offsets[id] ?? { dx: 0, dy: 0 }
  offsets[id] = { dx: current.dx + x - node.x, dy: current.dy + y - node.y }
}

function onNodeClick({ id }: { id: string }): void {
  if (!isNodeId(id))
    return
  selected.value = id
  railTab.value = 'inspector'
}

function selectTab(value: TxFlatSelectValue | TxFlatSelectValue[]): void {
  if (value === 'inspector' || value === 'run')
    railTab.value = value
}
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="560" @enter="onEnter">
    <template #default="{ width, height }">
      <div class="flow">
        <header class="flow__header">
          <div class="flow__brand">
            <span class="flow__mark" aria-hidden="true">
              <span class="i-carbon-workflow-automation" />
            </span>
            <div class="flow__titles">
              <span class="flow__title-row">
                <span class="flow__title">{{ copy.title }}</span>
                <TxWorkingIndicator v-if="running" :label="copy.running" :started-at="startedAt" />
                <TxStatusBadge v-else size="sm" :status="headerStatus.tone" :text="headerStatus.text" />
              </span>
              <span class="flow__subtitle">{{ config.enabled ? copy.subtitle : copy.pausedSubtitle }}</span>
            </div>
          </div>

          <TxSteps v-if="layoutOf(width) === 'wide'" class="flow__steps" size="small" :active="currentStep">
            <TxStep
              v-for="(label, index) in copy.steps"
              :key="label"
              :step="index"
              :title="label"
              :clickable="false"
            />
          </TxSteps>

          <div class="flow__controls">
            <TxSwitch v-model="config.enabled" size="small" :label="copy.autoRun" />
            <TxButton
              v-if="!running"
              variant="primary"
              size="sm"
              icon="i-carbon-play-filled-alt"
              @click="startRun(true)"
            >
              {{ copy.run }}
            </TxButton>
            <TxButton
              v-else
              variant="secondary"
              size="sm"
              icon="i-carbon-stop-filled-alt"
              @click="stopRun"
            >
              {{ copy.stop }}
            </TxButton>
          </div>
        </header>

        <div class="flow__body">
          <aside v-if="layoutOf(width) === 'wide'" class="flow__history">
            <div class="flow__section-head">
              <span class="flow__section-title">{{ copy.history }}</span>
              <span class="flow__section-meta">{{ history.length }}</span>
            </div>
            <TxTimeline class="flow__timeline">
              <TxTimelineItem
                v-for="entry in history"
                :key="entry.id"
                :title="`#${entry.id} · ${copy.outcome[entry.outcome]}`"
                :time="entry.clock"
                :color="HISTORY_COLOR[entry.outcome]"
                :active="entry.id === lastRunId && !running"
              >
                {{ copy.historyNotes[entry.outcome](seconds(entry.duration)) }}
              </TxTimelineItem>
            </TxTimeline>
          </aside>

          <div class="flow__center">
            <TemplateAutomationSplit v-model="splitRatio" :split="layoutOf(width) === 'wide'">
              <template #a>
                <div class="flow__canvas">
                  <TxFlowchart
                    :nodes="flowNodes(width, height)"
                    :edges="edges"
                    :height="canvasSize(width, height).h"
                    :node-width="nodeWidth(width)"
                    :aria-label="copy.canvas"
                    draggable
                    @node-move="onNodeMove"
                    @node-click="onNodeClick"
                  >
                    <template #node="{ node }">
                      <div
                        class="flow-node"
                        :class="[`is-${states[node.id as NodeId]}`, { 'is-selected': selected === node.id }]"
                        :data-node="node.id"
                      >
                        <span class="flow-node__icon" aria-hidden="true">
                          <span :class="NODE_ICONS[node.id as NodeId]" />
                        </span>
                        <span class="flow-node__text">
                          <!-- The state rides on the short category line, so the
                               title and its result keep the card's full width. -->
                          <span class="flow-node__top">
                            <span class="flow-node__kind">{{ copy.kinds[node.id as NodeId] }}</span>
                            <span class="flow-node__status">
                              <TxWorkingIndicator
                                v-if="states[node.id as NodeId] === 'running'"
                                variant="dots"
                                :label="copy.badge.running"
                                :show-elapsed="false"
                              />
                              <TxStatusBadge
                                v-else-if="nodeBadge(node.id as NodeId)"
                                size="sm"
                                :status="nodeBadge(node.id as NodeId)!.tone"
                                :text="nodeBadge(node.id as NodeId)!.text"
                              />
                              <TxDotIndicator
                                v-else-if="node.id === 'trigger'"
                                color="var(--tx-bui-green, #189a4d)"
                                :size="6"
                                :label="copy.badge.listening"
                              />
                            </span>
                          </span>
                          <span class="flow-node__title">{{ copy.nodes[node.id as NodeId] }}</span>
                          <span class="flow-node__meta">{{ nodeMeta(node.id as NodeId) }}</span>
                        </span>
                      </div>
                    </template>
                  </TxFlowchart>
                  <p class="flow__hint">
                    <span class="i-carbon-draggable" aria-hidden="true" />
                    {{ copy.hint }}
                  </p>
                </div>
              </template>

              <template #b>
                <div ref="logScroller" class="flow__log">
                  <TxCodeStream
                    :code="logCode"
                    :filename="`run-${runId}.log`"
                    :lang-label="copy.log"
                    :revealed-lines="revealed"
                    :min-height="0"
                    :copy-label="copy.copyLog"
                    :copied-label="copy.copiedLog"
                  />
                </div>
              </template>
            </TemplateAutomationSplit>
          </div>

          <aside class="flow__rail" :aria-label="copy.railLabel">
            <TxFlatRadio
              v-if="layoutOf(width) !== 'wide'"
              class="flow__tabs"
              size="sm"
              :model-value="railTab"
              @update:model-value="selectTab"
            >
              <TxFlatRadioItem value="inspector" :label="copy.tabs.inspector" />
              <TxFlatRadioItem value="run" :label="copy.tabs.run" />
            </TxFlatRadio>

            <section v-if="layoutOf(width) === 'wide' || railTab === 'inspector'" class="flow__inspector">
              <div class="flow__inspector-head">
                <span class="flow-node__icon" :class="`is-${selected}`" aria-hidden="true">
                  <span :class="NODE_ICONS[selected]" />
                </span>
                <span class="flow__inspector-titles">
                  <span class="flow__inspector-title">{{ copy.nodes[selected] }}</span>
                  <span class="flow__inspector-kind">{{ copy.kinds[selected] }}</span>
                </span>
              </div>

              <template v-if="selected === 'trigger'">
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.watch }}</span>
                  <TxFlatSelect v-model="config.trigger.watch" class="flow-field__select">
                    <TxFlatSelectItem v-for="option in options.watch" :key="option.value" :value="option.value" :label="option.label" />
                  </TxFlatSelect>
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.debounce }}</span>
                  <TxScrubField
                    v-model="config.trigger.debounce"
                    class="flow-field__scrub"
                    label="↔"
                    :min="0"
                    :max="2000"
                    :step="50"
                    suffix="ms"
                    :aria-label="copy.fields.debounce"
                    :value-label="copy.fields.value(copy.fields.debounce)"
                  />
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.onlyHidden }}</span>
                  <TxSwitch v-model="config.trigger.onlyHidden" size="small" :aria-label="copy.fields.onlyHidden" />
                </div>
                <p class="flow__note">
                  <span class="i-carbon-information" aria-hidden="true" />
                  {{ copy.notes.trigger(config.trigger.onlyHidden) }}
                </p>
              </template>

              <template v-else-if="selected === 'ocr'">
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.engine }}</span>
                  <TxFlatSelect v-model="config.ocr.engine" class="flow-field__select">
                    <TxFlatSelectItem v-for="option in options.engine" :key="option.value" :value="option.value" :label="option.label" />
                  </TxFlatSelect>
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.minConfidence }}</span>
                  <TxScrubField
                    v-model="config.ocr.minConfidence"
                    class="flow-field__scrub"
                    label="≥"
                    :min="50"
                    :max="99"
                    suffix="%"
                    :active="config.ocr.minConfidence > engineConfidence"
                    :aria-label="copy.fields.minConfidence"
                    :value-label="copy.fields.value(copy.fields.minConfidence)"
                  />
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.detectLanguage }}</span>
                  <TxSwitch v-model="config.ocr.detectLanguage" size="small" :aria-label="copy.fields.detectLanguage" />
                </div>
                <p class="flow__note">
                  <span class="i-carbon-information" aria-hidden="true" />
                  {{ copy.notes.ocr(engineConfidence) }}
                </p>
              </template>

              <template v-else-if="selected === 'fallback'">
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.model }}</span>
                  <TxFlatSelect v-model="config.fallback.model" class="flow-field__select">
                    <TxFlatSelectItem v-for="option in options.model" :key="option.value" :value="option.value" :label="option.label" />
                  </TxFlatSelect>
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.timeout }}</span>
                  <TxScrubField
                    v-model="config.fallback.timeout"
                    class="flow-field__scrub"
                    label="↔"
                    :min="1"
                    :max="30"
                    suffix="s"
                    :aria-label="copy.fields.timeout"
                    :value-label="copy.fields.value(copy.fields.timeout)"
                  />
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.keepLayout }}</span>
                  <TxSwitch v-model="config.fallback.keepLayout" size="small" :aria-label="copy.fields.keepLayout" />
                </div>
                <p class="flow__note">
                  <span class="i-carbon-information" aria-hidden="true" />
                  {{ copy.notes.fallback(config.ocr.minConfidence, engineConfidence) }}
                </p>
              </template>

              <template v-else-if="selected === 'translate'">
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.target }}</span>
                  <TxFlatSelect v-model="config.translate.target" class="flow-field__select">
                    <TxFlatSelectItem v-for="option in options.target" :key="option.value" :value="option.value" :label="option.label" />
                  </TxFlatSelect>
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.provider }}</span>
                  <TxFlatSelect v-model="config.translate.provider" class="flow-field__select">
                    <TxFlatSelectItem v-for="option in options.provider" :key="option.value" :value="option.value" :label="option.label" />
                  </TxFlatSelect>
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.maxTokens }}</span>
                  <TxScrubField
                    v-model="config.translate.maxTokens"
                    class="flow-field__scrub"
                    label="↔"
                    :min="128"
                    :max="2048"
                    :step="64"
                    :aria-label="copy.fields.maxTokens"
                    :value-label="copy.fields.value(copy.fields.maxTokens)"
                  />
                </div>
                <div class="flow-field">
                  <span class="flow-field__label">{{ copy.fields.rateLimit }}</span>
                  <TxSwitch v-model="config.translate.rateLimit" size="small" :aria-label="copy.fields.rateLimit" />
                </div>
                <p class="flow__note">
                  <span class="i-carbon-information" aria-hidden="true" />
                  {{ copy.notes.translate(config.translate.rateLimit) }}
                </p>
              </template>

              <template v-else>
                <TxFineTuneCard
                  v-model:values="config.notify"
                  class="flow__fine-tune"
                  :defaults="NOTIFY_DEFAULTS"
                  :title="copy.fineTune.title"
                  :layout-label="copy.fineTune.layout"
                  :type-label="copy.fineTune.type"
                  :type-placeholder="copy.fineTune.placeholder"
                  :adjust-label="copy.fineTune.adjust"
                  :edited-label="copy.fineTune.edited"
                  :field-labels="copy.fineTune.fields"
                  :type-options="options.type"
                  :ranges="FINE_TUNE_RANGES"
                />
                <div class="flow-preview">
                  <span class="flow-preview__label">{{ copy.preview }}</span>
                  <div
                    class="flow-preview__panel"
                    :class="[`is-${config.notify.type ?? 'toast'}`, `is-${config.notify.layout}`]"
                    :style="previewStyle"
                  >
                    <TxToastPanel :tether="false" :stack="0" live="off" :aria-label="copy.preview">
                      <div class="flow-preview__card">
                        <span class="flow-preview__icon i-carbon-translate" aria-hidden="true" />
                        <span class="flow-preview__text">
                          <strong>{{ copy.toastTitle }}</strong>
                          <span>{{ translation }}</span>
                        </span>
                        <span v-if="config.notify.layout === 'grid'" class="flow-preview__actions">
                          <span v-for="action in copy.previewActions" :key="action" class="flow-preview__action">{{ action }}</span>
                        </span>
                      </div>
                    </TxToastPanel>
                  </div>
                </div>
              </template>
            </section>

            <section v-if="layoutOf(width) === 'wide' || railTab === 'run'" class="flow__run">
              <div class="flow__section-head">
                <span class="flow__section-title">{{ runHeading.title }}</span>
                <TxStatusBadge size="sm" :status="runHeading.tone" :text="runHeading.text" />
              </div>
              <div class="flow__tasks">
                <TxTaskRows
                  variant="list"
                  :rows="taskRows"
                  :done-text="copy.done"
                  :error-text="copy.failed"
                />
              </div>
              <div v-if="layoutOf(width) !== 'wide'" ref="logScroller" class="flow__log flow__log--rail">
                <TxCodeStream
                  :code="logCode"
                  :filename="`run-${runId}.log`"
                  :revealed-lines="revealed"
                  :min-height="0"
                  :line-numbers="false"
                  :copy-label="copy.copyLog"
                  :copied-label="copy.copiedLog"
                />
              </div>
            </section>
          </aside>
        </div>

        <div class="flow__toast" :class="{ 'is-open': toastOpen }">
          <TxToastPanel :open="toastOpen" :stack="1" :aria-label="copy.toastLabel">
            <!-- Hangs from the Run button, not from the panel's middle. -->
            <template #tether>
              <span class="flow__toast-tether" aria-hidden="true" />
            </template>
            <div class="flow-toast">
              <span class="flow-toast__icon i-carbon-checkmark-filled" aria-hidden="true" />
              <span class="flow-toast__body">
                <strong>{{ copy.toastTitle }}</strong>
                <span class="flow-toast__text">{{ translation }}</span>
                <span class="flow-toast__meta">#{{ lastRunId }} · {{ copy.outcome[outcome ?? 'success'] }} · {{ seconds(lastDuration) }}</span>
              </span>
              <button type="button" class="flow-toast__close" :aria-label="copy.dismiss" @click="toastOpen = false">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
/* An editor, not a page: header on top, then panes edge to edge, divided by
   hairlines. Only the narrow layout scrolls, because there the panes stack. */
.flow {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Header ------------------------------------------------------------------- */

.flow__header {
  display: flex;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  height: 56px;
  padding: 0 16px;
  box-shadow: 0 1px 0 var(--tx-border-color-lighter, #ebeef5);
}

.flow__brand {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.flow__mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 18px;
}

.flow__titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.flow__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.flow__title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow__title-row :deep(.tx-bui-working-indicator__label) {
  font-size: 12px;
}

.flow__subtitle {
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow__steps {
  flex: 0 1 400px;
  min-width: 0;
}

.flow__controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 14px;
}

/* Body --------------------------------------------------------------------- */

.flow__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  min-height: 0;
}

.flow__center {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.flow__canvas {
  position: relative;
  height: 100%;
}

/* The canvas is a pane of the editor rather than a card on it. */
.flow__canvas :deep(.tx-bui-flowchart) {
  border-radius: 0;
  box-shadow: none;
}

/* The edge a payload is travelling along. Dashed alone would say "optional";
   the accent and the march say "in flight". */
.flow__canvas :deep(.tx-bui-flowchart__edge.is-dashed) {
  stroke: var(--tx-bui-accent, #0285ff);
  stroke-width: 1.75px;
}

@media (prefers-reduced-motion: no-preference) {
  .flow__canvas :deep(.tx-bui-flowchart__edge.is-dashed) {
    animation: flow-march 0.6s linear infinite;
  }
}

@keyframes flow-march {
  to {
    stroke-dashoffset: -8;
  }
}

.flow__canvas :deep(.tx-bui-flowchart__node:has(.flow-node.is-selected) .tx-bui-flowchart__card) {
  box-shadow:
    0 0 0 2px var(--tx-bui-accent, #0285ff),
    var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06));
}

.flow__canvas :deep(.tx-bui-flowchart__node:has(.flow-node.is-running) .tx-bui-flowchart__card) {
  box-shadow:
    0 0 0 1px var(--tx-bui-accent, #0285ff),
    0 0 0 5px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 14%, transparent);
}

.flow__canvas :deep(.tx-bui-flowchart__node:has(.flow-node.is-error) .tx-bui-flowchart__card) {
  box-shadow:
    0 0 0 1px var(--tx-bui-red, #e3474c),
    0 0 0 5px color-mix(in srgb, var(--tx-bui-red, #e3474c) 14%, transparent);
}

.flow__hint {
  position: absolute;
  bottom: 10px;
  left: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 11.5px;
  pointer-events: none;
}

/* Node card ---------------------------------------------------------------- */

.flow-node {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  height: 62px;
  padding: 0 12px 0 10px;
}

.flow-node__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 16px;
}

.flow-node[data-node='trigger'] .flow-node__icon,
.flow-node__icon.is-trigger {
  background: color-mix(in srgb, var(--tx-chart-categorical-4, #8d58ee) 14%, transparent);
  color: var(--tx-chart-categorical-4, #8d58ee);
}

.flow-node[data-node='fallback'] .flow-node__icon,
.flow-node__icon.is-fallback {
  background: var(--tx-bui-orange-tint, #fdf1e5);
  color: var(--tx-bui-orange, #ef720c);
}

.flow-node[data-node='notify'] .flow-node__icon,
.flow-node__icon.is-notify {
  background: var(--tx-bui-green-tint, #e8f5ed);
  color: var(--tx-bui-green, #189a4d);
}

.flow-node__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.flow-node__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 16px;
}

.flow-node__kind {
  overflow: hidden;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-node__title,
.flow-node__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-node__title {
  color: var(--tx-bui-ink, #1f2124);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.flow-node__meta {
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 11.5px;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.flow-node__status {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 16px;
}

/* The badge's own variable brings its disc down with the text, which is how
   it is meant to be compressed for a dense row. */
.flow-node__status :deep(.tx-status-badge) {
  --tx-status-chip-size: 12px;

  gap: 4px;
  padding: 2px 6px 2px 2px;
  border-radius: 6px;
  font-size: 11px;
}

.flow-node__status :deep(.tx-bui-working-indicator__label) {
  font-size: 11px;
}

.flow-node__status :deep(.tx-bui-dot-indicator) {
  gap: 5px;
  font-size: 11px;
}

/* A step the run went around reads as quieter, not as broken. */
.flow-node.is-skipped .flow-node__icon,
.flow-node.is-skipped .flow-node__text,
.flow-node.is-cancelled .flow-node__icon,
.flow-node.is-cancelled .flow-node__text {
  opacity: 0.55;
}

/* History (wide) ----------------------------------------------------------- */

.flow__history {
  min-height: 0;
  padding: 14px 16px;
  overflow-y: auto;
  box-shadow: inset -1px 0 0 var(--tx-border-color-lighter, #ebeef5);
  scrollbar-width: thin;
}

.flow__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.flow__section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-regular, #606266);
}

.flow__section-meta {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* The dot's ring is hard-coded white in the component; on this pane it has
   to be the pane itself, or dark mode shows a white halo round every run. */
.flow__timeline :deep(.tx-timeline-item__dot) {
  border-color: var(--tx-bg-color, #fff);
}

.flow__timeline :deep(.tx-timeline-item--vertical) {
  padding-bottom: 16px;
}

.flow__timeline :deep(.tx-timeline-item__header) {
  margin-bottom: 2px;
}

.flow__timeline :deep(.tx-timeline-item__title) {
  font-size: 13px;
}

.flow__timeline :deep(.tx-timeline-item__description) {
  font-size: 12px;
  line-height: 1.45;
}

/* Rail --------------------------------------------------------------------- */

.flow__rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  min-height: 0;
  padding: 12px 14px;
  box-shadow: inset 1px 0 0 var(--tx-border-color-lighter, #ebeef5);
}

.flow__tabs {
  flex: none;
  width: 100%;
}

.flow__tabs :deep(.tx-flat-radio-item) {
  flex: 1;
  justify-content: center;
}

.flow__inspector {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.flow__inspector-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.flow__inspector-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.flow__inspector-title {
  font-size: 13px;
  font-weight: 600;
}

.flow__inspector-kind {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.flow-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
}

.flow-field__label {
  min-width: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12.5px;
}

.flow-field__select {
  flex: none;
  width: 146px;
}

.flow-field__scrub {
  flex: none;
  width: 146px;
}

.flow__note {
  display: flex;
  gap: 6px;
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.flow__note > span {
  flex: none;
  margin-top: 2px;
  font-size: 13px;
}

.flow__fine-tune {
  max-width: none;
}

.flow-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.flow-preview__label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.flow-preview__panel {
  width: min(var(--flow-preview-width), 100%);
}

.flow-preview__panel :deep(.tx-toast-panel__card) {
  box-sizing: border-box;
  min-height: min(var(--flow-preview-height), 120px);
  border-radius: var(--flow-preview-radius);
  opacity: var(--flow-preview-opacity);
}

.flow-preview__panel.is-banner :deep(.tx-toast-panel__card) {
  box-shadow:
    inset 3px 0 0 var(--tx-color-primary, #409eff),
    0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

/* HUD is the inverted surface: ink becomes the fill. */
.flow-preview__panel.is-hud :deep(.tx-toast-panel__card) {
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 90%, transparent);
  box-shadow: var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06));
  color: var(--tx-bg-color, #fff);
}

.flow-preview__card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.flow-preview__panel.is-col .flow-preview__card {
  flex-direction: column;
  text-align: center;
}

.flow-preview__panel.is-grid .flow-preview__card {
  flex-wrap: wrap;
}

.flow-preview__icon {
  flex: none;
  color: var(--tx-color-primary, #409eff);
  font-size: 18px;
}

.flow-preview__panel.is-hud .flow-preview__icon {
  color: inherit;
}

.flow-preview__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 12px;
}

.flow-preview__text span {
  overflow: hidden;
  opacity: 0.75;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-preview__actions {
  display: flex;
  flex-basis: 100%;
  gap: 6px;
}

.flow-preview__action {
  flex: 1;
  padding: 4px 0;
  border-radius: 6px;
  background: var(--tx-fill-color-light, #f5f7fa);
  font-size: 12px;
  text-align: center;
}

.flow__run {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.flow__run .flow__section-head {
  margin-bottom: 10px;
}

.flow__tasks {
  flex: none;
}

/* The log owns its scrolling: TxCodeStream never scrolls vertically itself. */
.flow__log {
  box-sizing: border-box;
  height: 100%;
  padding: 12px 16px 14px;
  overflow: auto;
  scrollbar-width: thin;
}

.flow__log--rail {
  flex: 1;
  min-height: 96px;
  margin-top: 12px;
  padding: 0;
}

/* A log line is wider than the rail. A horizontal scroll would hide every
   tail behind an overlay scrollbar, so lines wrap here instead, under a
   hanging indent that keeps each entry's timestamp at the left edge. */
.flow__log--rail :deep(.tx-bui-code-stream__body) {
  overflow-x: hidden;
}

.flow__log--rail :deep(.tx-bui-code-stream__content) {
  min-width: 0;
  padding-left: calc(10px + 2ch);
  text-indent: -2ch;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Toast -------------------------------------------------------------------- */

/* Hangs under the Run button. It keeps its box while closed (that is how the
   panel avoids a layout jump), so it lets clicks through until it opens. */
.flow__toast {
  position: absolute;
  z-index: 4;
  top: 44px;
  right: 12px;
  width: 300px;
  pointer-events: none;
}

.flow__toast.is-open {
  pointer-events: auto;
}

.flow__toast-tether {
  flex: none;
  align-self: flex-end;
  width: 0;
  height: 16px;
  margin-right: 36px;
  border-left: 1px dashed var(--tx-border-color, #dcdfe6);
}

.flow-toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.flow-toast__icon {
  flex: none;
  margin-top: 1px;
  color: var(--tx-color-success, #67c23a);
  font-size: 16px;
}

.flow-toast__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 12px;
}

.flow-toast__body strong {
  font-size: 13px;
  font-weight: 600;
}

.flow-toast__text {
  color: var(--tx-text-color-regular, #606266);
  line-height: 1.45;
}

.flow-toast__meta {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-variant-numeric: tabular-nums;
}

.flow-toast__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: -2px -4px 0 0;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-placeholder, #a8abb2);
  cursor: pointer;
  font-size: 13px;
}

.flow-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.flow-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Breakpoints -------------------------------------------------------------- */

/* Narrow: the panes stack and the template scrolls as one page. */
@container template (max-width: 639.98px) {
  .flow {
    display: block;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .flow__header {
    flex-wrap: wrap;
    height: auto;
    padding: 10px 12px;
    gap: 10px;
  }

  .flow__brand {
    flex-basis: 100%;
  }

  .flow__controls {
    justify-content: space-between;
    width: 100%;
  }

  .flow__body {
    display: block;
  }

  .flow__center {
    height: 420px;
  }

  .flow__hint {
    display: none;
  }

  .flow__rail {
    box-shadow: inset 0 1px 0 var(--tx-border-color-lighter, #ebeef5);
  }

  .flow__log--rail {
    flex: none;
    height: 200px;
  }

  /* Under the wrapped header, still hanging from the Run button. */
  .flow__toast {
    top: 84px;
    right: 12px;
    left: 12px;
    width: auto;
  }
}

@container template (min-width: 960px) {
  .flow__body {
    grid-template-columns: 232px minmax(0, 1fr) 340px;
  }

  .flow__rail {
    gap: 18px;
    padding: 14px 16px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .flow__run {
    flex: none;
  }
}
</style>
