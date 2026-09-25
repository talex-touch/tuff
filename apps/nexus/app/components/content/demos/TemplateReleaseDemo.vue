<script setup lang="ts">
// Release template: one desktop release taken from CI to a staged rollout —
// build, sign, notarize, stage, then roll out to a growing share of users
// behind guardrails. The pipeline runs by itself; everything that ships to
// users waits for the reader:
// - The first rollout is a TxToolConfirmation that waits for as long as it
//   takes. Its "remember" checkbox cannot be hidden, so it is relabelled as the
//   one automatic thing allowed here, and it points the safe way: pause when a
//   guardrail fails.
// - Promoting and halting are confirmed in a TxModal the reader opens.
//
// Everything on the page is sample data and says so. The version carries a
// `-demo` pre-release tag no real build ever uses, every checksum and signature
// is labelled as a sample, and no build has a download link.
import type { TxVersionCapsulePanel, TxVersionHistoryEntry } from '@talex-touch/tuffex/version-capsule'
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { SegmentedSliderSegment } from '@talex-touch/tuffex/segmented-slider'
import type { SparkPoint } from '@talex-touch/tuffex/spark-chart'
import type { TimelineItemColor } from '@talex-touch/tuffex/timeline'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide'
type StepKey = 'build' | 'sign' | 'notarize' | 'stage' | 'rollout'
type StepStatus = 'wait' | 'active' | 'completed' | 'error'
type MainTab = 'log' | 'artifacts' | 'notes'
type NarrowTab = 'rollout' | MainTab
type Gate = 'hidden' | 'waiting' | 'allowed' | 'denied'
type ModalKind = 'promote' | 'halt' | 'resume'
type SignState = 'pending' | 'done' | 'none'
type NotarizeState = 'na' | 'pending' | 'running' | 'done'
type EventKind = 'built' | 'signed' | 'notarized' | 'staged' | 'awaiting' | 'approved' | 'denied' | 'reopened' | 'promoted' | 'full' | 'halted' | 'autoHalted' | 'resumed'
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface Localized {
  zh: string
  en: string
}

interface ArtifactSeed {
  id: string
  icon: string
  name: Localized
  file: string
  ext: string
  size: string
  /** Signing identity; Linux packages ship unsigned. */
  signer: string | null
  notarize: boolean
}

interface ArtifactRow {
  id: string
  icon: string
  name: string
  file: string
  ext: string
  size: string
  hash: string
  signer: string | null
  sign: SignState
  notarize: NotarizeState
}

interface TimelineEntry {
  id: number
  kind: EventKind
  /** Seconds since midnight on the sample clock. */
  at: number
  value?: number
}

const VERSION = 'v2.5.0-demo.4'
const BUILD = '#1287'
const STEP_KEYS: StepKey[] = ['build', 'sign', 'notarize', 'stage', 'rollout']
const STAGES = [1, 5, 25, 50, 100]
const FIRST_STAGE = 5
/** Guardrail rows fill in one at a time once the rollout starts. */
const GUARDRAIL_MS = 800
const TOAST_MS = 3200
const TOAST_REARM_MS = 2000

const STEP_ICONS: Record<StepKey, string> = {
  build: 'i-carbon-build-tool',
  sign: 'i-carbon-certificate',
  notarize: 'i-carbon-certificate-check',
  stage: 'i-carbon-cloud-upload',
  rollout: 'i-carbon-rocket',
}

const STEP_TOOK: Partial<Record<StepKey, string>> = { build: '4m 12s', sign: '38s', notarize: '2m 51s', stage: '1m 05s' }

// Named as apps/core-app/electron-builder.yml names real artifacts, with the
// demo version in place of a real one.
const ARTIFACTS: ArtifactSeed[] = [
  { id: 'mac-arm64', icon: 'i-cib-apple', name: { zh: 'macOS · Apple 芯片', en: 'macOS · Apple silicon' }, file: 'tuff-2.5.0-demo.4-macos-arm64.dmg', ext: '.dmg', size: '126.4 MB', signer: 'Developer ID', notarize: true },
  { id: 'mac-x64', icon: 'i-cib-apple', name: { zh: 'macOS · Intel', en: 'macOS · Intel' }, file: 'tuff-2.5.0-demo.4-macos-x64.dmg', ext: '.dmg', size: '131.2 MB', signer: 'Developer ID', notarize: true },
  { id: 'win-x64', icon: 'i-cib-windows', name: { zh: 'Windows · x64', en: 'Windows · x64' }, file: 'tuff-2.5.0-demo.4-setup.exe', ext: '.exe', size: '118.7 MB', signer: 'Authenticode', notarize: false },
  { id: 'linux-appimage', icon: 'i-cib-linux', name: { zh: 'Linux · AppImage', en: 'Linux · AppImage' }, file: 'tuff-2.5.0-demo.4.AppImage', ext: '.AppImage', size: '140.3 MB', signer: null, notarize: false },
  { id: 'linux-deb', icon: 'i-cib-debian', name: { zh: 'Linux · deb', en: 'Linux · deb' }, file: 'tuff-2.5.0-demo.4.deb', ext: '.deb', size: '96.5 MB', signer: null, notarize: false },
]

const LOG_HEAD = [
  '12:00:04  build     pnpm build:release · tuff 2.5.0-demo.4',
  '12:03:51  build     electron-vite · main 2.1 MB · renderer 6.8 MB',
  '12:04:16  package   electron-builder · mac(arm64,x64) win(x64) linux(x64)',
  '12:04:40  sign      codesign · Developer ID (sample) · 2 artifacts',
  '12:04:52  sign      signtool · Authenticode (sample) · 1 artifact',
  '12:05:03  notarize  notarytool submit tuff-2.5.0-demo.4-macos-arm64.dmg',
  '12:05:09  notarize  notarytool submit tuff-2.5.0-demo.4-macos-x64.dmg',
  '12:07:41  notarize  status: Accepted (sample) · stapled',
  '12:07:55  stage     upload 5 artifacts → staging (sample, not public)',
  '12:08:06  stage     demo-mac.yml · demo.yml · demo-linux.yml (sample)',
  '12:08:07  rollout   waiting for approval · target 5%',
]

/** Sample clock: seconds since midnight. The gate opens at 12:08:07. */
const GATE_AT = (12 * 60 + 8) * 60 + 7

// ── Sample data helpers ──────────────────────────────────────────────────────

function noise(index: number, seed: number): number {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43_758.5453
  return value - Math.floor(value)
}

/** A stable 64-digit hex string per artifact. It is not a checksum of anything. */
function sampleHash(id: string): string {
  let seed = 0
  for (const char of id)
    seed = (seed * 31 + char.charCodeAt(0)) % 9973
  let hash = ''
  for (let index = 0; index < 64; index++)
    hash += Math.floor(noise(index + seed, seed % 97 + 1) * 16).toString(16)
  return hash
}

const HASHES: Record<string, string> = Object.fromEntries(ARTIFACTS.map(artifact => [artifact.id, sampleHash(artifact.id)]))

function clockOf(seconds: number): string {
  const pad = (value: number): string => String(Math.floor(value)).padStart(2, '0')
  return `${pad(seconds / 3600)}:${pad((seconds / 60) % 60)}:${pad(seconds % 60)}`
}

// ── Copy ─────────────────────────────────────────────────────────────────────

const NOTES: Record<string, Localized> = {
  d4: {
    zh: '### 新功能（示例）\n- 剪贴板历史支持「阅后即焚」：密钥类内容到时自动清除\n- CoreBox 划词翻译支持 12 种语言\n\n### 修复（示例）\n- Windows 上截图 OCR 偶发崩溃\n- 插件市场详情页的权限说明更易读',
    en: '### New (sample)\n- Clipboard history can burn secrets after a set time\n- CoreBox selection translate supports 12 languages\n\n### Fixed (sample)\n- An occasional crash in screenshot OCR on Windows\n- Clearer permission copy on plugin market pages',
  },
  d3: {
    zh: '### 新功能（示例）\n- 剪贴板历史支持「阅后即焚」\n\n### 状态（示例）\n- 灰度到 5% 时崩溃率抬头，已暂停，由 demo.4 修复',
    en: '### New (sample)\n- Clipboard history can burn secrets after a set time\n\n### Status (sample)\n- Halted at 5% on a crash-rate rise; fixed in demo.4',
  },
  d2: {
    zh: '### 新功能（示例）\n- CoreBox 划词翻译新增日语和韩语\n\n### 修复（示例）\n- 深色主题下设置页的对比度',
    en: '### New (sample)\n- CoreBox selection translate adds Japanese and Korean\n\n### Fixed (sample)\n- Contrast of the settings page in the dark theme',
  },
  s7: {
    zh: '### 稳定版（示例）\n- 语音听写插件正式可用\n- 启动速度提升，冷启动少一次磁盘扫描',
    en: '### Stable (sample)\n- The dictation plugin is generally available\n- Faster start-up: one fewer disk scan on a cold launch',
  },
}

const HISTORY_VERSIONS = [
  { id: 'd3', tag: 'v2.5.0-demo.3', channel: 'DEMO', tone: 'preview' as const, date: { zh: '9 月 22 日', en: 'Sep 22' } },
  { id: 'd2', tag: 'v2.5.0-demo.2', channel: 'DEMO', tone: 'preview' as const, date: { zh: '9 月 18 日', en: 'Sep 18' } },
  { id: 's7', tag: 'v2.4.9-demo.7', channel: 'STABLE', tone: 'stable' as const, date: { zh: '9 月 9 日', en: 'Sep 9' } },
]

const zhCopy = {
  title: 'Release 发布控制台',
  heading: '发布控制台',
  sample: '示例数据 · 不是真实发布',
  sampleTag: '示例数据',
  sampleShort: '示例',
  build: `构建 ${BUILD}（示例）`,
  steps: { build: '构建', sign: '签名', notarize: '公证', stage: '分发', rollout: '灰度' } satisfies Record<StepKey, string>,
  running: '进行中',
  awaiting: '待批准',
  notReleased: '未发布',
  rolling: (value: number) => `灰度 ${value}%`,
  halted: (value: number) => `已暂停 · ${value}%`,
  full: '已全量',
  queued: '待开始',
  pipeline: '流水线运行中',
  stepsLabel: '发布流水线',
  tabs: { rollout: '灰度', rolloutWaiting: '灰度 · 待批准', log: '日志', artifacts: '产物', notes: '说明' },
  tabsLabel: '控制台视图',
  logLabel: '构建日志（示例）',
  logComment: '# 示例日志 · 不代表真实构建',
  copy: '复制',
  copied: '已复制',
  table: {
    platform: '平台',
    sha: 'sha256（示例）',
    status: '状态（示例）',
    sign: '签名（示例）',
    notarize: '公证（示例）',
  },
  shaCopy: (name: string) => `复制 ${name} 的示例 sha256`,
  shaCopied: '已复制示例值',
  signing: '签名中',
  signed: '已签名',
  unsigned: '未签名',
  notarizing: '公证中',
  notarized: '已公证',
  noNotarize: '不适用',
  notesTitle: (tag: string) => `${tag} · 发布说明（示例）`,
  rolloutTitle: '灰度',
  current: '当前',
  target: '目标',
  stagesLabel: '目标灰度比例',
  progressLabel: '当前灰度比例',
  promote: (value: number) => `晋级到 ${value}%`,
  resume: '恢复发布',
  startRollout: '开始灰度',
  halt: '暂停发布',
  reasons: {
    collecting: '护栏数据收集中',
    failing: '护栏未达标，先处理再继续',
    lower: '目标要高于当前比例',
    full: '已经全量发布',
  },
  deniedNote: '已分发到预发，没有推送给任何用户。',
  haltedAlert: (value: number) => `已暂停在 ${value}%：新用户不会再收到这个版本（示例）。`,
  gate: {
    summary: `向 5% 的 beta 用户推送 ${VERSION}（示例）`,
    allowLabel: '开始灰度',
    denyLabel: '暂不发布',
    rememberLabel: '护栏失守时自动暂停',
    riskLabels: { read: '只读', write: '改动配置', execute: '推送给用户' },
  },
  gateHint: '发布不会自动开始，点「开始灰度」继续。',
  autoHaltOn: '护栏失守时会自动暂停',
  guardrailsTitle: '护栏（示例）',
  collecting: '收集中…',
  pass: '达标',
  fail: '未达标',
  guardrails: { crashFree: '无崩溃会话', updateFail: '更新失败率', rollbacks: '回滚请求' },
  simulateDip: '模拟崩溃率下滑',
  trendLabel: '无崩溃会话走势（示例）',
  timelineTitle: '本次动态',
  events: {
    built: '构建完成 · 4m 12s',
    signed: '签名完成（示例）',
    notarized: '公证通过（示例）',
    staged: '已分发到预发（示例）',
    awaiting: '等待批准灰度',
    approved: (value: number) => `你批准了灰度 · ${value}%`,
    denied: '暂不发布',
    reopened: '重新申请灰度',
    promoted: (value: number) => `晋级到 ${value}%`,
    full: '已全量发布',
    halted: (value: number) => `你暂停了发布 · ${value}%`,
    autoHalted: '护栏失守，已自动暂停',
    resumed: '恢复发布',
  } as Record<EventKind, string | ((value: number) => string)>,
  modal: {
    promoteTitle: (value: number) => `晋级到 ${value}%？`,
    promoteBody: (from: number, to: number) => `${VERSION}（示例）会从 ${from}% 扩大到 ${to}% 的 beta 用户。`,
    haltTitle: '暂停这次发布？',
    haltBody: (value: number) => `新用户将停止收到 ${VERSION}；已经更新的 ${value}% 用户不受影响，之后可以恢复。`,
    resumeTitle: '恢复发布？',
    resumeBody: (value: number) => `从 ${value}% 继续灰度，护栏会重新开始统计。`,
    checks: '护栏检查',
    demoNote: '这是演示，不会推送任何真实版本。',
    cancel: '取消',
    confirmPromote: '确认晋级',
    confirmHalt: '暂停发布',
    confirmResume: '恢复发布',
  },
  toast: {
    started: (value: number) => `已开始灰度 · ${value}%`,
    promoted: (value: number) => `已晋级到 ${value}%`,
    halted: '已暂停发布',
    autoHalted: '护栏失守，已自动暂停',
    resumed: '已恢复发布',
    noDownload: '示例构建，不提供下载',
    toastLabel: '发布提示',
  },
  dismiss: '关闭提示',
  capsule: {
    history: '历史',
    download: '查看此构建（示例）',
    buildsLabel: '构建产物',
    downloadLabel: '仅示例',
    notice: {
      tone: 'warning' as const,
      title: '演示构建 · 不提供下载',
      description: '版本号、校验值和签名都是示例，不对应任何真实发布。',
      points: ['版本号带 -demo 标识，永远不会发布', 'sha256 与签名均为示例值', '这里的构建没有下载链接'],
    },
    historyTitle: '版本历史（示例）',
    latestLabel: '当前',
    countLabel: '4 个示例版本',
    notesLabel: '发布说明',
    latestNote: '正在灰度的示例版本',
  },
}

const enCopy: typeof zhCopy = {
  title: 'Release',
  heading: 'Release console',
  sample: 'Sample data — not a real release',
  sampleTag: 'Sample data',
  sampleShort: 'SAMPLE',
  build: `Build ${BUILD} (sample)`,
  steps: { build: 'Build', sign: 'Sign', notarize: 'Notarize', stage: 'Stage', rollout: 'Rollout' },
  running: 'Running',
  awaiting: 'Awaiting approval',
  notReleased: 'Not released',
  rolling: (value: number) => `Rolling out ${value}%`,
  halted: (value: number) => `Halted · ${value}%`,
  full: 'Fully rolled out',
  queued: 'Queued',
  pipeline: 'Pipeline running',
  stepsLabel: 'Release pipeline',
  tabs: { rollout: 'Rollout', rolloutWaiting: 'Rollout · waiting', log: 'Log', artifacts: 'Artifacts', notes: 'Notes' },
  tabsLabel: 'Console views',
  logLabel: 'Build log (sample)',
  logComment: '# Sample log — not a real build',
  copy: 'Copy',
  copied: 'Copied',
  table: {
    platform: 'Platform',
    sha: 'sha256 (sample)',
    status: 'Status (sample)',
    sign: 'Signing (sample)',
    notarize: 'Notarization (sample)',
  },
  shaCopy: (name: string) => `Copy the sample sha256 of ${name}`,
  shaCopied: 'Sample copied',
  signing: 'Signing',
  signed: 'Signed',
  unsigned: 'Unsigned',
  notarizing: 'Notarizing',
  notarized: 'Notarized',
  noNotarize: 'n/a',
  notesTitle: (tag: string) => `${tag} · release notes (sample)`,
  rolloutTitle: 'Rollout',
  current: 'Current',
  target: 'Target',
  stagesLabel: 'Target rollout share',
  progressLabel: 'Current rollout share',
  promote: (value: number) => `Promote to ${value}%`,
  resume: 'Resume rollout',
  startRollout: 'Start rollout',
  halt: 'Halt rollout',
  reasons: {
    collecting: 'Guardrail data is still coming in',
    failing: 'A guardrail is failing; fix it before going on',
    lower: 'Pick a target above the current share',
    full: 'Already fully rolled out',
  },
  deniedNote: 'Staged only; nothing has reached any user.',
  haltedAlert: (value: number) => `Halted at ${value}%: new users no longer get this version (sample).`,
  gate: {
    summary: `Ship ${VERSION} to 5% of beta users (sample)`,
    allowLabel: 'Start rollout',
    denyLabel: 'Not yet',
    rememberLabel: 'Pause automatically if a guardrail fails',
    riskLabels: { read: 'Read-only', write: 'Changes config', execute: 'Ships to users' },
  },
  gateHint: 'Nothing ships on its own. Click Start rollout to continue.',
  autoHaltOn: 'Pauses automatically if a guardrail fails',
  guardrailsTitle: 'Guardrails (sample)',
  collecting: 'Collecting…',
  pass: 'Pass',
  fail: 'Fail',
  guardrails: { crashFree: 'Crash-free sessions', updateFail: 'Update failures', rollbacks: 'Rollback requests' },
  simulateDip: 'Simulate a crash-rate dip',
  trendLabel: 'Crash-free sessions trend (sample)',
  timelineTitle: 'This release',
  events: {
    built: 'Build finished · 4m 12s',
    signed: 'Signed (sample)',
    notarized: 'Notarized (sample)',
    staged: 'Staged (sample)',
    awaiting: 'Waiting for rollout approval',
    approved: (value: number) => `You approved the rollout · ${value}%`,
    denied: 'Held back',
    reopened: 'Rollout requested again',
    promoted: (value: number) => `Promoted to ${value}%`,
    full: 'Fully rolled out',
    halted: (value: number) => `You halted the rollout · ${value}%`,
    autoHalted: 'A guardrail failed; paused automatically',
    resumed: 'Rollout resumed',
  },
  modal: {
    promoteTitle: (value: number) => `Promote to ${value}%?`,
    promoteBody: (from: number, to: number) => `${VERSION} (sample) goes from ${from}% to ${to}% of beta users.`,
    haltTitle: 'Halt this release?',
    haltBody: (value: number) => `New users stop getting ${VERSION}; the ${value}% already updated keep it, and you can resume later.`,
    resumeTitle: 'Resume the rollout?',
    resumeBody: (value: number) => `The rollout continues from ${value}% and the guardrails start counting again.`,
    checks: 'Guardrail checks',
    demoNote: 'This is a demo; no real version ships.',
    cancel: 'Cancel',
    confirmPromote: 'Promote',
    confirmHalt: 'Halt rollout',
    confirmResume: 'Resume rollout',
  },
  toast: {
    started: (value: number) => `Rollout started · ${value}%`,
    promoted: (value: number) => `Promoted to ${value}%`,
    halted: 'Rollout halted',
    autoHalted: 'A guardrail failed; paused automatically',
    resumed: 'Rollout resumed',
    noDownload: 'Sample build, no download',
    toastLabel: 'Release notice',
  },
  dismiss: 'Dismiss',
  capsule: {
    history: 'History',
    download: 'This build (sample)',
    buildsLabel: 'Build artifacts',
    downloadLabel: 'Sample only',
    notice: {
      tone: 'warning' as const,
      title: 'Demo build — no downloads',
      description: 'The version, checksums and signatures are samples and match no real release.',
      points: ['The -demo tag never ships', 'sha256 and signatures are sample values', 'None of these builds has a download link'],
    },
    historyTitle: 'Version history (sample)',
    latestLabel: 'CURRENT',
    countLabel: '4 sample versions',
    notesLabel: 'Release notes',
    latestNote: 'The sample version now rolling out',
  },
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const lang = computed(() => (zh.value ? 'zh' : 'en') as keyof Localized)
const copy = computed(() => (zh.value ? zhCopy : enCopy))
const localeTag = computed(() => (zh.value ? 'zh-CN' : 'en-US'))

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── State ────────────────────────────────────────────────────────────────────

function initialSteps(): Record<StepKey, StepStatus> {
  return { build: 'completed', sign: 'active', notarize: 'wait', stage: 'wait', rollout: 'wait' }
}

function initialSigns(): Record<string, SignState> {
  return Object.fromEntries(ARTIFACTS.map(artifact => [artifact.id, artifact.signer ? 'pending' : 'none']))
}

function initialNotarize(): Record<string, NotarizeState> {
  return Object.fromEntries(ARTIFACTS.map(artifact => [artifact.id, artifact.notarize ? 'pending' : 'na']))
}

function seedTimeline(): TimelineEntry[] {
  return [{ id: 1, kind: 'built', at: (12 * 60 + 4) * 60 + 16 }]
}

const steps = reactive<Record<StepKey, StepStatus>>(initialSteps())
const signs = reactive<Record<string, SignState>>(initialSigns())
const notarize = reactive<Record<string, NotarizeState>>(initialNotarize())
/** Log lines shown; the first is the sample comment. */
const revealed = ref(4)
const extraLog = ref<string[]>([])
const gate = ref<Gate>('hidden')
const gateKey = ref(0)
const autoHalt = ref(false)
// Until the first rollout, the target is the step the gate asks for.
const rollout = reactive({ started: false, current: 0, target: FIRST_STAGE, halted: false })
const guardrailsShown = ref(0)
const dip = ref(false)
// Kind and target stay put while the dialog fades out, so its text never
// changes under the reader after they confirm.
const modal = reactive({ open: false, kind: 'promote' as ModalKind, to: 0 })
const timeline = ref<TimelineEntry[]>(seedTimeline())
const clock = ref(GATE_AT)
const ciRunning = ref(false)
const startedAt = ref(0)
const mainTab = ref<MainTab>('log')
const narrowTab = ref<NarrowTab>('rollout')
const notesVersion = ref('d4')
const capsulePanel = ref<TxVersionCapsulePanel>(null)
const toast = reactive({ open: false, text: '', tone: 'success' as 'success' | 'warning' | 'info' })
const logRef = ref<HTMLElement | null>(null)

let entered = false
let entryIds = 1
let timers: ReturnType<typeof setTimeout>[] = []
let toastTimer: ReturnType<typeof setTimeout> | undefined

function later(ms: number, run: () => void): void {
  const id = setTimeout(() => {
    timers = timers.filter(timer => timer !== id)
    run()
  }, ms)
  timers.push(id)
}

function clearTimers(): void {
  for (const id of timers)
    clearTimeout(id)
  timers = []
}

// ── Log ──────────────────────────────────────────────────────────────────────

const logLines = computed(() => [copy.value.logComment, ...LOG_HEAD, ...extraLog.value])
const logCode = computed(() => logLines.value.join('\n'))

function scrollLog(): void {
  void nextTick(() => {
    const scroller = logRef.value
    // The log's own container, never the page.
    if (scroller)
      scroller.scrollTop = scroller.scrollHeight
  })
}

function reveal(count: number): void {
  revealed.value = count
  scrollLog()
}

function appendLog(stage: string, message: string): void {
  extraLog.value = [...extraLog.value, `${clockOf(clock.value)}  ${stage.padEnd(9)} ${message}`]
  revealed.value = logLines.value.length
  scrollLog()
}

// ── Timeline & feedback ──────────────────────────────────────────────────────

function record(kind: EventKind, at = clock.value, value?: number): void {
  entryIds += 1
  timeline.value = [{ id: entryIds, kind, at, value }, ...timeline.value]
}

const EVENT_COLOR: Record<EventKind, TimelineItemColor> = {
  built: 'success',
  signed: 'success',
  notarized: 'success',
  staged: 'success',
  awaiting: 'warning',
  approved: 'primary',
  denied: 'default',
  reopened: 'default',
  promoted: 'primary',
  full: 'success',
  halted: 'warning',
  autoHalted: 'error',
  resumed: 'primary',
}

function eventText(entry: TimelineEntry): string {
  const text = copy.value.events[entry.kind]
  return typeof text === 'function' ? text(entry.value ?? 0) : text
}

function visibleTimeline(layout: Layout): TimelineEntry[] {
  return timeline.value.slice(0, layout === 'wide' ? 8 : 6)
}

/** Arms the toast's own dismissal. It runs under reduced motion too: that setting removes movement, not the timer. */
function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
  }, ms)
}

// Pointer or keyboard focus resting on the toast holds it open, so its buttons
// can be reached; it re-arms shortly after both have left.
let toastHovered = false
let toastFocused = false

function holdToast(kind: 'hover' | 'focus'): void {
  if (kind === 'hover')
    toastHovered = true
  else
    toastFocused = true
  clearTimeout(toastTimer)
}

function releaseToast(kind: 'hover' | 'focus'): void {
  if (kind === 'hover')
    toastHovered = false
  else
    toastFocused = false
  if (toast.open && !toastHovered && !toastFocused)
    armToast(TOAST_REARM_MS)
}

function onToastFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    releaseToast('focus')
}

function openToast(text: string, tone: 'success' | 'warning' | 'info' = 'success'): void {
  toast.text = text
  toast.tone = tone
  toast.open = true
  if (toastHovered || toastFocused)
    clearTimeout(toastTimer)
  else
    armToast(TOAST_MS)
}

function closeToast(): void {
  clearTimeout(toastTimer)
  toast.open = false
  toastHovered = false
  toastFocused = false
}

// ── The pipeline (runs by itself; ships nothing) ─────────────────────────────

interface PlanStep {
  at: number
  apply: () => void
}

function pipelinePlan(): PlanStep[] {
  return [
    { at: 250, apply: () => reveal(5) },
    { at: 500, apply: () => reveal(6) },
    {
      at: 1000,
      apply: () => {
        steps.sign = 'completed'
        for (const artifact of ARTIFACTS) {
          if (artifact.signer)
            signs[artifact.id] = 'done'
          if (artifact.notarize)
            notarize[artifact.id] = 'running'
        }
        steps.notarize = 'active'
        record('signed', (12 * 60 + 4) * 60 + 52)
        reveal(7)
      },
    },
    { at: 1250, apply: () => reveal(8) },
    {
      at: 2800,
      apply: () => {
        steps.notarize = 'completed'
        for (const artifact of ARTIFACTS) {
          if (artifact.notarize)
            notarize[artifact.id] = 'done'
        }
        record('notarized', (12 * 60 + 7) * 60 + 41)
        reveal(9)
      },
    },
    {
      at: 3100,
      apply: () => {
        steps.stage = 'active'
        reveal(10)
      },
    },
    { at: 3600, apply: () => reveal(11) },
    {
      at: 4300,
      apply: () => {
        steps.stage = 'completed'
        steps.rollout = 'active'
        record('staged', (12 * 60 + 8) * 60 + 6)
        record('awaiting', GATE_AT)
        reveal(12)
        ciRunning.value = false
        // Nothing is scheduled past this point: the rollout starts only from
        // onApprove, whenever the reader gets to it.
        gate.value = 'waiting'
      },
    },
  ]
}

function onEnter(): void {
  entered = true
  start()
}

function start(): void {
  clearTimers()
  startedAt.value = Date.now()
  const plan = pipelinePlan()
  if (prefersReducedMotion()) {
    // The same end state, with no timers: the gate is up and still waits.
    for (const step of plan)
      step.apply()
    return
  }
  ciRunning.value = true
  for (const step of plan)
    later(step.at, step.apply)
}

// ── Rollout (every change here is the reader's) ──────────────────────────────

const guardrails = computed(() => {
  const labels = copy.value.guardrails
  return [
    { key: 'crashFree', label: labels.crashFree, value: dip.value ? '99.32%' : '99.71%', target: '≥ 99.50%', pass: !dip.value, level: dip.value ? 1 : 3 },
    { key: 'updateFail', label: labels.updateFail, value: '0.4%', target: '< 1.0%', pass: true, level: 3 },
    { key: 'rollbacks', label: labels.rollbacks, value: '2', target: '≤ 5', pass: true, level: 2 },
  ]
})

const guardrailsReady = computed(() => rollout.started && guardrailsShown.value >= guardrails.value.length)
const guardrailsPass = computed(() => guardrails.value.every(row => row.pass))

const LEVEL_TONE = ['var(--tx-text-color-placeholder, #a8abb2)', 'var(--tx-color-danger, #f56c6c)', 'var(--tx-color-warning, #e6a23c)', 'var(--tx-color-success, #67c23a)']

function nextStage(value: number): number {
  return STAGES.find(stage => stage > value) ?? 100
}

function fillGuardrails(): void {
  guardrailsShown.value = 0
  if (prefersReducedMotion()) {
    guardrailsShown.value = guardrails.value.length
    return
  }
  const step = (): void => {
    guardrailsShown.value += 1
    if (guardrailsShown.value < guardrails.value.length)
      later(GUARDRAIL_MS, step)
  }
  later(GUARDRAIL_MS, step)
}

function beginRollout(): void {
  rollout.started = true
  rollout.current = FIRST_STAGE
  rollout.target = nextStage(FIRST_STAGE)
  clock.value += 24
  appendLog('rollout', `started · ${FIRST_STAGE}% of beta (sample)`)
  fillGuardrails()
}

function onApprove(payload: { remember: boolean }): void {
  if (gate.value !== 'waiting')
    return
  gate.value = 'allowed'
  autoHalt.value = payload.remember
  record('approved', clock.value + 24, FIRST_STAGE)
  openToast(copy.value.toast.started(FIRST_STAGE))
  if (prefersReducedMotion()) {
    beginRollout()
    return
  }
  later(300, beginRollout)
}

function onDeny(): void {
  if (gate.value !== 'waiting')
    return
  gate.value = 'denied'
  steps.rollout = 'wait'
  record('denied')
  appendLog('rollout', 'held back by reviewer · nothing shipped')
}

function reopenGate(): void {
  if (gate.value !== 'denied')
    return
  gateKey.value += 1
  gate.value = 'waiting'
  steps.rollout = 'active'
  clock.value += 60
  record('reopened')
  appendLog('rollout', 'waiting for approval · target 5%')
}

function onTarget(value: number | string): void {
  rollout.target = Number(value)
}

const promoteReason = computed<string | null>(() => {
  const reasons = copy.value.reasons
  if (rollout.current >= 100)
    return reasons.full
  if (!guardrailsReady.value)
    return reasons.collecting
  if (!guardrailsPass.value)
    return reasons.failing
  if (Number(rollout.target) <= rollout.current)
    return reasons.lower
  return null
})

function openModal(kind: ModalKind): void {
  modal.kind = kind
  modal.to = Number(rollout.target)
  modal.open = true
}

function halt(auto: boolean): void {
  if (!rollout.started || rollout.halted)
    return
  rollout.halted = true
  steps.rollout = 'error'
  clock.value += auto ? 6 * 60 : 12 * 60
  record(auto ? 'autoHalted' : 'halted', clock.value, rollout.current)
  appendLog('rollout', auto
    ? `guardrail crash-free 99.32% < 99.50% → auto-halt at ${rollout.current}%`
    : `halted at ${rollout.current}% by reviewer`)
  openToast(auto ? copy.value.toast.autoHalted : copy.value.toast.halted, 'warning')
}

function confirmModal(): void {
  const kind = modal.kind
  modal.open = false
  if (kind === 'halt') {
    halt(false)
    return
  }
  if (kind === 'resume') {
    if (!rollout.halted || !guardrailsPass.value)
      return
    rollout.halted = false
    steps.rollout = rollout.current >= 100 ? 'completed' : 'active'
    clock.value += 20 * 60
    record('resumed')
    appendLog('rollout', `resumed at ${rollout.current}%`)
    fillGuardrails()
    openToast(copy.value.toast.resumed)
    return
  }
  if (kind === 'promote' && promoteReason.value === null) {
    const to = modal.to
    rollout.current = to
    rollout.target = nextStage(to)
    clock.value += 90 * 60
    record(to >= 100 ? 'full' : 'promoted', clock.value, to)
    appendLog('rollout', `promoted · ${to}%`)
    if (to >= 100)
      steps.rollout = 'completed'
    openToast(copy.value.toast.promoted(to))
  }
}

// The one automatic action on this page, and only in the safe direction.
watch(guardrailsPass, (pass) => {
  if (!pass && autoHalt.value && rollout.started && !rollout.halted && rollout.current < 100)
    halt(true)
})

// ── Header, steps and the capsule ────────────────────────────────────────────

const headerStatus = computed<{ text: string, tone: BadgeTone }>(() => {
  const c = copy.value
  if (rollout.halted)
    return { text: c.halted(rollout.current), tone: 'warning' }
  if (rollout.current >= 100)
    return { text: c.full, tone: 'success' }
  if (rollout.started)
    return { text: c.rolling(rollout.current), tone: 'info' }
  if (gate.value === 'waiting')
    return { text: c.awaiting, tone: 'warning' }
  if (gate.value === 'denied')
    return { text: c.notReleased, tone: 'muted' }
  return { text: c.queued, tone: 'muted' }
})

function stepDescription(key: StepKey): string | undefined {
  const c = copy.value
  const status = steps[key]
  if (key === 'rollout') {
    if (rollout.halted)
      return c.halted(rollout.current)
    if (rollout.current >= 100)
      return c.full
    if (rollout.started)
      return c.rolling(rollout.current)
    if (gate.value === 'waiting')
      return c.awaiting
    return gate.value === 'denied' ? c.notReleased : undefined
  }
  if (status === 'completed')
    return STEP_TOOK[key]
  return status === 'active' ? c.running : undefined
}

const historyLatest = computed<TxVersionHistoryEntry>(() => ({
  id: 'd4',
  tag: VERSION,
  channel: 'DEMO',
  tone: 'preview',
  date: zh.value ? '9 月 24 日' : 'Sep 24',
  note: copy.value.capsule.latestNote,
}))

const historyEntries = computed<TxVersionHistoryEntry[]>(() => HISTORY_VERSIONS.map(entry => ({
  id: entry.id,
  tag: entry.tag,
  channel: entry.channel,
  tone: entry.tone,
  date: entry.date[lang.value],
})))

// No `href` anywhere: the panels render builds as buttons, never as downloads.
const builds = computed(() => ARTIFACTS.map((artifact, index) => ({
  id: artifact.id,
  name: artifact.name[lang.value],
  meta: `${artifact.ext} · ${artifact.size} · ${copy.value.sampleShort}`,
  icon: artifact.icon,
  recommended: index === 0,
})))

function onBuildSelect(close: () => void): void {
  openToast(copy.value.toast.noDownload, 'info')
  close()
}

function onHistorySelect(entry: TxVersionHistoryEntry, close: () => void): void {
  notesVersion.value = entry.id in NOTES ? entry.id : 'd4'
  mainTab.value = 'notes'
  narrowTab.value = 'notes'
  close()
}

/** The capsule closes its panel on Escape; this keeps the same press from collapsing the stage. */
function onCapsuleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && capsulePanel.value)
    event.preventDefault()
}

const notesTag = computed(() => (notesVersion.value === 'd4' ? VERSION : HISTORY_VERSIONS.find(entry => entry.id === notesVersion.value)?.tag ?? VERSION))
const notesContent = computed(() => (NOTES[notesVersion.value] ?? NOTES.d4!)[lang.value])

// ── Artifacts ────────────────────────────────────────────────────────────────

const artifactRows = computed<ArtifactRow[]>(() => ARTIFACTS.map(artifact => ({
  id: artifact.id,
  icon: artifact.icon,
  name: artifact.name[lang.value],
  file: artifact.file,
  ext: artifact.ext,
  size: artifact.size,
  hash: HASHES[artifact.id] ?? '',
  signer: artifact.signer,
  sign: signs[artifact.id] ?? 'none',
  notarize: notarize[artifact.id] ?? 'na',
})))

function hashDigest(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`
}

/** For the narrow table, where no sha256 column header says the value is a sample. */
function shortHash(hash: string): string {
  return `${copy.value.sampleShort} ${hashDigest(hash)}`
}

/**
 * One badge for the compact tables, naming the furthest step reached: a
 * notarized build is signed too, so "Notarized" says both in one short word.
 */
function statusOf(row: ArtifactRow): { text: string, tone: BadgeTone } {
  const c = copy.value
  if (row.sign === 'none')
    return { text: c.unsigned, tone: 'muted' }
  if (row.sign === 'pending')
    return { text: c.signing, tone: 'info' }
  if (row.notarize === 'running' || row.notarize === 'pending')
    return { text: c.notarizing, tone: 'info' }
  return { text: row.notarize === 'done' ? c.notarized : c.signed, tone: 'success' }
}

/** The signing identity itself; the column header says it is a sample. */
function signOf(row: ArtifactRow): { text: string, tone: BadgeTone } {
  if (row.sign === 'none' || !row.signer)
    return { text: copy.value.unsigned, tone: 'muted' }
  return row.sign === 'pending'
    ? { text: copy.value.signing, tone: 'info' }
    : { text: row.signer, tone: 'success' }
}

function notarizeOf(row: ArtifactRow): { text: string, tone: BadgeTone } {
  if (row.notarize === 'na')
    return { text: copy.value.noNotarize, tone: 'muted' }
  return row.notarize === 'done'
    ? { text: copy.value.notarized, tone: 'success' }
    : { text: copy.value.notarizing, tone: 'info' }
}

type TableMode = 'narrow' | 'compact' | 'full'

/** Side columns of the wide body, which the table's pane shares the stage with. */
function wideSides(width: number): number {
  return width >= 1200 ? 220 + 340 : 184 + 300
}

/**
 * Which column set the table gets, by the room its pane really has: the wide
 * body only affords separate signing and notarization columns once the pane
 * clears ~620px; below that it keeps the compact set the column layout uses.
 * File name and size ride under the platform name instead of taking columns.
 */
function tableMode(width: number): TableMode {
  const layout = layoutOf(width)
  if (layout === 'narrow')
    return 'narrow'
  if (layout === 'column')
    return 'compact'
  return width - wideSides(width) - 32 >= 620 ? 'full' : 'compact'
}

function columnsFor(mode: TableMode): DataTableColumn<ArtifactRow>[] {
  const t = copy.value.table
  if (mode === 'narrow') {
    return [
      { key: 'platform', title: t.platform },
      { key: 'status', title: t.status, width: 112 },
    ]
  }
  if (mode === 'compact') {
    return [
      { key: 'platform', title: t.platform },
      { key: 'sha', title: t.sha, width: 150 },
      { key: 'status', title: t.status, width: 120 },
    ]
  }
  return [
    { key: 'platform', title: t.platform },
    { key: 'sha', title: t.sha, width: 164 },
    { key: 'sign', title: t.sign, width: 136 },
    { key: 'notarize', title: t.notarize, width: 128 },
  ]
}

// ── Segments, trend ──────────────────────────────────────────────────────────

const stageSegments: SegmentedSliderSegment[] = STAGES.map(value => ({ value, label: `${value}%` }))

const crashTrend = computed<Array<{ id: string, data: SparkPoint[], color: string }>>(() => [{
  id: 'crash-free',
  color: dip.value ? 'var(--tx-color-danger, #f56c6c)' : 'var(--tx-color-success, #67c23a)',
  data: Array.from({ length: 24 }, (_, index) => {
    const base = 99.7 + (noise(index, 7) - 0.5) * 0.08
    const dipped = dip.value && index >= 20 ? 99.7 - (index - 19) * 0.1 : base
    return { time: index, value: Math.round(dipped * 100) / 100 }
  }),
}])

// ── Layout ───────────────────────────────────────────────────────────────────

/** Mirrors the `@container template` breakpoints; width 0 is the unmeasured first frame. */
function layoutOf(width: number): Layout {
  if (width === 0)
    return 'column'
  return width < 640 ? 'narrow' : width < 960 ? 'column' : 'wide'
}

function activeTab(layout: Layout): NarrowTab {
  return layout === 'narrow' ? narrowTab.value : mainTab.value
}

/** Only the wide table owns a scroller; its height follows the stage. */
function tableMaxHeight(height: number): number {
  return Math.max(200, Math.round((height || 820) * 0.42))
}

watch([mainTab, narrowTab], scrollLog)

// ── Reset ────────────────────────────────────────────────────────────────────

function resetDemo(): void {
  clearTimers()
  closeToast()
  Object.assign(steps, initialSteps())
  Object.assign(signs, initialSigns())
  Object.assign(notarize, initialNotarize())
  revealed.value = 4
  extraLog.value = []
  gate.value = 'hidden'
  gateKey.value += 1
  autoHalt.value = false
  Object.assign(rollout, { started: false, current: 0, target: FIRST_STAGE, halted: false })
  guardrailsShown.value = 0
  dip.value = false
  modal.open = false
  timeline.value = seedTimeline()
  entryIds = 1
  clock.value = GATE_AT
  ciRunning.value = false
  mainTab.value = 'log'
  narrowTab.value = 'rollout'
  notesVersion.value = 'd4'
  capsulePanel.value = null
  if (entered)
    void nextTick(start)
}

watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearTimers()
  clearTimeout(toastTimer)
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="600" @enter="onEnter">
    <template #default="{ width, height }">
      <div class="rel" :class="`is-${layoutOf(width)}`">
        <header class="rel-head">
          <span class="rel-head__mark" aria-hidden="true">
            <span class="i-carbon-deployment-pattern" />
          </span>
          <span class="rel-head__title">{{ copy.heading }}</span>
          <!-- Escape inside an open panel closes the panel only. -->
          <div class="rel-capsule" @keydown="onCapsuleKeydown">
            <TxVersionCapsule
              v-model:panel="capsulePanel"
              :version="VERSION"
              channel="DEMO"
              tone="preview"
              :history-label="copy.capsule.history"
              :download-label="copy.capsule.download"
            >
              <template #download="{ close }">
                <TxVersionDownloadPanel
                  :notice="copy.capsule.notice"
                  :builds="builds"
                  :builds-label="copy.capsule.buildsLabel"
                  :download-label="copy.capsule.downloadLabel"
                  @select="onBuildSelect(close)"
                />
              </template>
              <template #history="{ close }">
                <TxVersionHistoryPanel
                  :title="copy.capsule.historyTitle"
                  :latest="historyLatest"
                  :entries="historyEntries"
                  :latest-label="copy.capsule.latestLabel"
                  :count-label="copy.capsule.countLabel"
                  :notes-label="copy.capsule.notesLabel"
                  @select="onHistorySelect($event, close)"
                />
              </template>
            </TxVersionCapsule>
          </div>
          <TxTag
            class="rel-head__sample"
            :label="layoutOf(width) === 'wide' ? copy.sample : copy.sampleTag"
            :title="copy.sample"
            icon="i-carbon-information"
            variant="plain"
            size="sm"
          />
          <span class="rel-head__spacer" />
          <span v-if="layoutOf(width) === 'wide'" class="rel-head__build">{{ copy.build }}</span>
          <span class="rel-head__status">
            <TxWorkingIndicator v-if="ciRunning" :label="copy.pipeline" :started-at="startedAt" />
            <TxStatusBadge v-else size="sm" :status="headerStatus.tone" :text="headerStatus.text" />
          </span>
          <TxButton
            v-if="rollout.started && !rollout.halted && rollout.current < 100"
            variant="danger"
            size="sm"
            icon="i-carbon-pause-filled"
            @click="openModal('halt')"
          >
            {{ copy.halt }}
          </TxButton>
        </header>

        <div v-if="layoutOf(width) !== 'wide'" class="rel-steps">
          <TxSteps size="small" :active="-1" :aria-label="copy.stepsLabel">
            <TxStep
              v-for="key in STEP_KEYS"
              :key="key"
              :title="copy.steps[key]"
              :description="layoutOf(width) === 'narrow' ? undefined : stepDescription(key)"
              :icon="STEP_ICONS[key]"
              :status="steps[key]"
              :clickable="false"
            />
          </TxSteps>
        </div>

        <TxFlatRadio
          v-if="layoutOf(width) === 'narrow'"
          v-model="narrowTab"
          class="rel-tabs is-narrow"
          size="sm"
          :aria-label="copy.tabsLabel"
        >
          <TxFlatRadioItem value="rollout" :label="gate === 'waiting' ? copy.tabs.rolloutWaiting : copy.tabs.rollout" />
          <TxFlatRadioItem value="log" :label="copy.tabs.log" />
          <TxFlatRadioItem value="artifacts" :label="copy.tabs.artifacts" />
          <TxFlatRadioItem value="notes" :label="copy.tabs.notes" />
        </TxFlatRadio>

        <div class="rel-body">
          <aside v-if="layoutOf(width) === 'wide'" class="rel-pipeline" :aria-label="copy.stepsLabel">
            <TxSteps size="small" direction="vertical" :active="-1">
              <TxStep
                v-for="key in STEP_KEYS"
                :key="key"
                :title="copy.steps[key]"
                :description="stepDescription(key)"
                :icon="STEP_ICONS[key]"
                :status="steps[key]"
                :clickable="false"
              />
            </TxSteps>
          </aside>

          <section v-show="layoutOf(width) !== 'narrow' || narrowTab !== 'rollout'" class="rel-main">
            <TxFlatRadio
              v-if="layoutOf(width) === 'column'"
              v-model="mainTab"
              class="rel-tabs"
              size="sm"
              :aria-label="copy.tabsLabel"
            >
              <TxFlatRadioItem value="log" :label="copy.tabs.log" />
              <TxFlatRadioItem value="artifacts" :label="`${copy.tabs.artifacts} ${ARTIFACTS.length}`" />
              <TxFlatRadioItem value="notes" :label="copy.tabs.notes" />
            </TxFlatRadio>

            <div class="rel-panels">
              <div v-show="layoutOf(width) === 'wide' || activeTab(layoutOf(width)) === 'artifacts'" class="rel-artifacts">
                <TxDataTable
                  :columns="columnsFor(tableMode(width))"
                  :data="artifactRows"
                  row-key="id"
                  table-layout="fixed"
                  :hover="false"
                  :max-height="layoutOf(width) === 'wide' ? tableMaxHeight(height) : undefined"
                >
                  <template #cell-platform="{ row }">
                    <span class="rel-platform">
                      <span class="rel-platform__icon" aria-hidden="true">
                        <span :class="(row as ArtifactRow).icon" />
                      </span>
                      <span class="rel-platform__text">
                        <span class="rel-platform__name">{{ (row as ArtifactRow).name }}</span>
                        <span v-if="tableMode(width) === 'full'" class="rel-platform__meta rel-mono is-muted">{{ (row as ArtifactRow).file }} · {{ (row as ArtifactRow).size }}</span>
                        <span v-else-if="tableMode(width) === 'compact'" class="rel-platform__meta rel-mono is-muted">{{ (row as ArtifactRow).size }} · {{ (row as ArtifactRow).ext }}</span>
                        <span v-else class="rel-sha is-inline">
                          <code class="rel-mono">{{ shortHash((row as ArtifactRow).hash) }} · {{ (row as ArtifactRow).size }}</code>
                          <TxCopyButton
                            class="rel-copy"
                            size="sm"
                            :text="`SAMPLE-${(row as ArtifactRow).hash}`"
                            :copy-label="copy.shaCopy((row as ArtifactRow).name)"
                            :copied-label="copy.shaCopied"
                          />
                        </span>
                      </span>
                    </span>
                  </template>
                  <template #cell-sha="{ row }">
                    <span class="rel-sha">
                      <code class="rel-mono rel-sha__digest">{{ hashDigest((row as ArtifactRow).hash) }}</code>
                      <TxCopyButton
                        class="rel-copy"
                        size="sm"
                        :text="`SAMPLE-${(row as ArtifactRow).hash}`"
                        :copy-label="copy.shaCopy((row as ArtifactRow).name)"
                        :copied-label="copy.shaCopied"
                      />
                    </span>
                  </template>
                  <template #cell-status="{ row }">
                    <TxStatusBadge size="sm" :status="statusOf(row as ArtifactRow).tone" :text="statusOf(row as ArtifactRow).text" />
                  </template>
                  <template #cell-sign="{ row }">
                    <TxStatusBadge size="sm" :status="signOf(row as ArtifactRow).tone" :text="signOf(row as ArtifactRow).text" />
                  </template>
                  <template #cell-notarize="{ row }">
                    <TxStatusBadge size="sm" :status="notarizeOf(row as ArtifactRow).tone" :text="notarizeOf(row as ArtifactRow).text" />
                  </template>
                </TxDataTable>
              </div>

              <div v-show="layoutOf(width) === 'wide' || activeTab(layoutOf(width)) === 'log'" ref="logRef" class="rel-log">
                <TxCodeStream
                  :code="logCode"
                  :filename="`release-${BUILD.slice(1)}.log`"
                  :lang-label="copy.logLabel"
                  :revealed-lines="revealed"
                  :min-height="0"
                  :copy-label="copy.copy"
                  :copied-label="copy.copied"
                />
              </div>

              <div v-show="layoutOf(width) === 'wide' || activeTab(layoutOf(width)) === 'notes'" class="rel-notes">
                <p class="rel-notes__title">
                  {{ copy.notesTitle(notesTag) }}
                </p>
                <TxMarkdownView class="rel-notes__body" :content="notesContent" />
              </div>
            </div>
          </section>

          <aside
            v-show="layoutOf(width) !== 'narrow' || narrowTab === 'rollout'"
            class="rel-rail"
            :aria-label="copy.rolloutTitle"
          >
            <div v-if="gate === 'waiting'" class="rel-gate">
              <TxToolConfirmation
                :key="gateKey"
                tool-name="rollout.start"
                risk="execute"
                :summary="copy.gate.summary"
                :input="`channel    beta (sample)\nexposure   0% → ${FIRST_STAGE}%\nartifacts  ${ARTIFACTS.length} · signed (sample)\nguardrail  crash-free ≥ 99.50%`"
                :allow-label="copy.gate.allowLabel"
                :deny-label="copy.gate.denyLabel"
                :remember-label="copy.gate.rememberLabel"
                :risk-labels="copy.gate.riskLabels"
                @approve="onApprove"
                @deny="onDeny"
              />
              <p class="rel-hint">
                <span class="rel-hint__lock i-carbon-locked" aria-hidden="true" />
                {{ copy.gateHint }}
              </p>
            </div>

            <section class="rel-card rel-rollout" :class="{ 'is-halted': rollout.halted }">
              <div class="rel-card__head">
                <span class="rel-card__title">{{ copy.rolloutTitle }}</span>
                <TxStatusBadge size="sm" :status="headerStatus.tone" :text="headerStatus.text" />
              </div>

              <TxAlert
                v-if="rollout.halted"
                type="warning"
                :closable="false"
                :message="copy.haltedAlert(rollout.current)"
              />

              <div class="rel-share">
                <span class="rel-share__figure">
                  <span class="rel-share__label">{{ copy.current }}</span>
                  <span class="rel-share__value">
                    <TxTextMorph :text="rollout.current" :locale="localeTag" />
                    <span class="rel-share__unit">%</span>
                  </span>
                </span>
                <span v-if="rollout.started && rollout.current < 100" class="rel-share__figure is-target">
                  <span class="rel-share__label">{{ copy.target }}</span>
                  <span class="rel-share__target">{{ rollout.target }}%</span>
                </span>
              </div>
              <TxProgressBar :percentage="rollout.current" height="6px" :aria-label="copy.progressLabel" />

              <div class="rel-stages">
                <TxSegmentedSlider
                  :model-value="rollout.target"
                  :segments="stageSegments"
                  :disabled="!rollout.started || rollout.halted || rollout.current >= 100"
                  :aria-label="copy.stagesLabel"
                  @update:model-value="onTarget"
                />
              </div>

              <div class="rel-rollout__actions">
                <template v-if="gate === 'denied'">
                  <p class="rel-note">
                    {{ copy.deniedNote }}
                  </p>
                  <TxButton variant="primary" size="sm" icon="i-carbon-rocket" @click="reopenGate">
                    {{ copy.startRollout }}
                  </TxButton>
                </template>
                <template v-else-if="rollout.halted">
                  <TxButton
                    variant="primary"
                    size="sm"
                    icon="i-carbon-play-filled-alt"
                    :disabled="!guardrailsPass"
                    @click="openModal('resume')"
                  >
                    {{ copy.resume }}
                  </TxButton>
                  <p v-if="!guardrailsPass" class="rel-note">
                    {{ copy.reasons.failing }}
                  </p>
                </template>
                <template v-else-if="rollout.started">
                  <TxButton
                    variant="primary"
                    size="sm"
                    icon="i-carbon-upgrade"
                    :disabled="promoteReason !== null"
                    @click="openModal('promote')"
                  >
                    {{ copy.promote(Number(rollout.target)) }}
                  </TxButton>
                  <p v-if="promoteReason" class="rel-note">
                    {{ promoteReason }}
                  </p>
                  <p v-if="autoHalt" class="rel-note is-auto">
                    <span class="i-carbon-security" aria-hidden="true" />
                    {{ copy.autoHaltOn }}
                  </p>
                </template>
              </div>
            </section>

            <section class="rel-card">
              <div class="rel-card__head">
                <span class="rel-card__title">{{ copy.guardrailsTitle }}</span>
              </div>
              <ul class="rel-guards">
                <li v-for="(row, index) in guardrails" :key="row.key" class="rel-guard">
                  <span class="rel-guard__name">{{ row.label }}</span>
                  <template v-if="rollout.started && index < guardrailsShown">
                    <span class="rel-guard__value" :class="{ 'is-fail': !row.pass }">{{ row.value }}</span>
                    <span class="rel-guard__target">{{ row.target }}</span>
                    <TxSignalMeter
                      :value="row.level"
                      :tone="LEVEL_TONE[row.level]"
                      :label="`${row.label}: ${row.value} · ${row.pass ? copy.pass : copy.fail}`"
                    />
                  </template>
                  <span v-else class="rel-guard__pending">{{ copy.collecting }}</span>
                </li>
              </ul>
              <div v-if="layoutOf(width) === 'wide' && guardrailsReady" class="rel-trend">
                <span class="rel-trend__label">{{ copy.trendLabel }}</span>
                <div class="rel-trend__chart">
                  <TxSparkChart
                    :series="crashTrend"
                    :domain="[99, 100]"
                    :interactive="false"
                    :baseline="false"
                    :padding="{ top: 6, right: 4, bottom: 4, left: 2 }"
                    :aria-label="copy.trendLabel"
                  />
                </div>
              </div>
              <TxSwitch
                v-model="dip"
                class="rel-dip"
                size="small"
                :disabled="!rollout.started"
                :label="copy.simulateDip"
              />
            </section>

            <section class="rel-card">
              <div class="rel-card__head">
                <span class="rel-card__title">{{ copy.timelineTitle }}</span>
              </div>
              <TxTimeline class="rel-timeline">
                <TxTimelineItem
                  v-for="(entry, index) in visibleTimeline(layoutOf(width))"
                  :key="entry.id"
                  :title="eventText(entry)"
                  :time="clockOf(entry.at)"
                  :color="EVENT_COLOR[entry.kind]"
                  :active="index === 0"
                />
              </TxTimeline>
            </section>
          </aside>
        </div>

        <!-- Keeps its box while closed, so it is inert until it opens; pointer
             or focus on it holds it open, otherwise it closes by itself. -->
        <div
          class="rel-toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toast.toastLabel">
            <div class="rel-toast__card">
              <span
                class="rel-toast__icon"
                :class="[`is-${toast.tone}`, toast.tone === 'warning' ? 'i-carbon-warning-alt' : toast.tone === 'info' ? 'i-carbon-information' : 'i-carbon-checkmark-filled']"
                aria-hidden="true"
              />
              <span class="rel-toast__text">{{ toast.text }}</span>
              <button type="button" class="rel-toast__close" :aria-label="copy.dismiss" @click="closeToast">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>

        <TxModal
          :model-value="modal.open"
          :title="modal.kind === 'halt' ? copy.modal.haltTitle : modal.kind === 'resume' ? copy.modal.resumeTitle : copy.modal.promoteTitle(modal.to)"
          width="min(440px, calc(100vw - 40px))"
          @update:model-value="modal.open = $event"
        >
          <div class="rel-modal">
            <p class="rel-modal__lead">
              <template v-if="modal.kind === 'halt'">
                {{ copy.modal.haltBody(rollout.current) }}
              </template>
              <template v-else-if="modal.kind === 'resume'">
                {{ copy.modal.resumeBody(rollout.current) }}
              </template>
              <template v-else>
                {{ copy.modal.promoteBody(rollout.current, modal.to) }}
              </template>
            </p>
            <template v-if="modal.kind === 'promote'">
              <p class="rel-modal__label">
                {{ copy.modal.checks }}
              </p>
              <ul class="rel-modal__checks">
                <li v-for="row in guardrails" :key="row.key">
                  <span class="i-carbon-checkmark-filled" aria-hidden="true" />
                  <span class="rel-modal__check-name">{{ row.label }}</span>
                  <span class="rel-mono">{{ row.value }} · {{ row.target }}</span>
                </li>
              </ul>
            </template>
            <p class="rel-modal__note">
              {{ copy.modal.demoNote }}
            </p>
          </div>
          <template #footer>
            <div class="rel-modal__footer">
              <TxButton variant="secondary" size="sm" @click="modal.open = false">
                {{ copy.modal.cancel }}
              </TxButton>
              <TxButton
                :variant="modal.kind === 'halt' ? 'danger' : 'primary'"
                size="sm"
                @click="confirmModal"
              >
                {{ modal.kind === 'halt' ? copy.modal.confirmHalt : modal.kind === 'resume' ? copy.modal.confirmResume : copy.modal.confirmPromote }}
              </TxButton>
            </div>
          </template>
        </TxModal>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
/* A console: header, a pipeline strip, then panes divided by hairlines. */
.rel {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Header ------------------------------------------------------------------- */

.rel-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  min-height: 54px;
  padding: 8px 14px;
  box-shadow: 0 1px 0 var(--tx-border-color-lighter, #ebeef5);
}

.rel-head__mark {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 16px;
}

.rel-head__title {
  flex: none;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

/* The capsule's own 44px / 14px scale is a hero size; in a console header it
   steps down to a 32px control. */
.rel-capsule {
  flex: none;
}

.rel-capsule :deep(.tx-version-capsule) {
  --tx-version-capsule-height: 32px;
  --tx-version-capsule-font-size: 13px;
  --tx-version-capsule-padding: 0 12px;
  --tx-version-capsule-gap: 7px;
  --tx-version-capsule-panel-width: 360px;
  --tx-version-capsule-panel-offset: 8px;
}

.rel-head__sample {
  flex: none;
}

.rel-head__spacer {
  flex: 1;
}

.rel-head__build {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rel-head__status {
  display: inline-flex;
  flex: none;
  align-items: center;
}

.rel-head__status :deep(.tx-bui-working-indicator__label) {
  font-size: 12px;
}

/* Pipeline strip ----------------------------------------------------------- */

.rel-steps {
  padding: 10px 18px 8px;
  box-shadow: 0 1px 0 var(--tx-border-color-lighter, #ebeef5);
}

.rel-steps :deep(.tx-step__description),
.rel-pipeline :deep(.tx-step__description) {
  font-variant-numeric: tabular-nums;
}

/* Body --------------------------------------------------------------------- */

.rel-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  min-height: 0;
}

.rel-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.rel-tabs {
  flex: none;
  margin: 10px 14px 0;
}

.rel-tabs.is-narrow {
  margin: 8px 12px;
}

.rel-panels {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.rel-artifacts {
  min-height: 0;
  padding: 10px 14px 14px;
  overflow: auto;
  scrollbar-width: thin;
}

/* The log owns its scrolling: TxCodeStream never scrolls vertically itself. */
.rel-log {
  box-sizing: border-box;
  min-height: 0;
  flex: 1;
  padding: 10px 14px 14px;
  overflow: auto;
  scrollbar-width: thin;
}

/* A log line is wider than the column. Lines wrap under a hanging indent that
   keeps each entry's timestamp at the left edge. */
.rel-log :deep(.tx-bui-code-stream__body) {
  overflow-x: hidden;
}

.rel-log :deep(.tx-bui-code-stream__content) {
  min-width: 0;
  padding-left: calc(10px + 2ch);
  text-indent: -2ch;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rel-notes {
  min-height: 0;
  flex: 1;
  padding: 12px 16px 16px;
  overflow: auto;
  scrollbar-width: thin;
}

.rel-notes__title {
  margin: 0 0 6px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rel-notes__body :deep(.markdown-body) {
  font-size: 13px;
  line-height: 1.65;
}

.rel-notes__body :deep(.markdown-body h3) {
  margin: 12px 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.rel-notes__body :deep(.markdown-body h3:first-child) {
  margin-top: 0;
}

.rel-notes__body :deep(.markdown-body ul) {
  margin: 0;
  padding-left: 1.3em;
}

/* Table cells -------------------------------------------------------------- */

.rel-platform {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.rel-platform__icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font-size: 15px;
}

.rel-platform__text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.rel-platform__name {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-mono {
  font-family: var(--tx-font-mono, ui-monospace, "SF Mono", monospace);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rel-mono.is-muted {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11.5px;
}

.rel-platform__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A status is one short word; it never breaks inside its pill. */
.rel-artifacts :deep(.tx-status-badge) {
  white-space: nowrap;
}

.rel-sha {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.rel-sha.is-inline {
  color: var(--tx-text-color-secondary, #909399);
}

/* The column header already says it is a sample; the digest stays on one line. */
.rel-sha__digest {
  white-space: nowrap;
}

/* Icon-only: the label is the button's accessible name, not its face. */
.rel-sha .rel-copy {
  width: 24px;
  height: 24px;
  flex: none;
  padding: 0;
  border-radius: 6px;
}

.rel-copy :deep(.tx-copy-button__label) {
  display: none;
}

/* Rail --------------------------------------------------------------------- */

.rel-rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px 16px;
  overflow-y: auto;
  box-shadow: inset 1px 0 0 var(--tx-border-color-lighter, #ebeef5);
  scrollbar-width: thin;
}

.rel-gate {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
}

/* In the side rail the gate is ~280px wide: its checkbox gets a row of its own
   and the two buttons keep their labels on one line. The narrow tab is full
   width and keeps the component's own footer. */
@container template (min-width: 640px) {
  .rel-gate :deep(.tx-tool-confirmation__actions) {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  .rel-gate :deep(.tx-tool-confirmation__remember) {
    flex: 1 1 100%;
  }

  .rel-gate :deep(.tx-tool-confirmation__buttons) {
    margin-left: auto;
  }

  .rel-gate :deep(.tx-tool-confirmation__deny),
  .rel-gate :deep(.tx-tool-confirmation__allow) {
    white-space: nowrap;
  }
}

.rel-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.5;
}

.rel-hint__lock {
  flex: none;
  color: var(--tx-color-warning, #e6a23c);
}

.rel-card {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 10px;
}

.rel-card + .rel-card {
  padding-top: 12px;
  border-top: 1px solid var(--tx-border-color-extra-light, #f2f6fc);
}

.rel-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rel-card__title {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  font-weight: 600;
}

.rel-share {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.rel-share__figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rel-share__figure.is-target {
  align-items: flex-end;
}

.rel-share__label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.rel-share__value {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.1;
}

.rel-share__unit {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
}

.rel-share__target {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* The slider's first and last labels hang past its track and below it. */
.rel-stages {
  padding: 2px 18px 22px;
}

.rel-rollout__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.rel-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.rel-note.is-auto {
  color: var(--tx-text-color-regular, #606266);
}

.rel-rollout :deep(.tx-alert) {
  padding: 8px 10px;
  font-size: 12.5px;
}

.rel-rollout.is-halted .rel-share__value {
  color: var(--tx-text-color-secondary, #909399);
}

.rel-guards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rel-guard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}

.rel-guard__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-guard__value {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.rel-guard__value.is-fail {
  color: var(--tx-color-danger, #f56c6c);
}

.rel-guard__target {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rel-guard__pending {
  grid-column: 2 / -1;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
}

.rel-trend {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rel-trend__label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11.5px;
}

.rel-trend__chart {
  height: 56px;
}

.rel-dip {
  font-size: 12.5px;
}

/* The dot's ring is hard-coded white in the component; on this pane it has to
   be the pane itself, or dark mode shows a white halo round every entry. */
.rel-timeline :deep(.tx-timeline-item__dot) {
  border-color: var(--tx-bg-color, #fff);
}

.rel-timeline :deep(.tx-timeline-item--vertical) {
  padding-bottom: 12px;
}

.rel-timeline :deep(.tx-timeline-item__title) {
  font-size: 12.5px;
}

.rel-timeline :deep(.tx-timeline-item__time) {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

/* Toast -------------------------------------------------------------------- */

/* Under the header's right end, where the actions that cause it sit. It keeps
   its box while closed, so it lets clicks through until it opens. */
.rel-toast {
  position: absolute;
  z-index: 4;
  top: 62px;
  right: 14px;
  width: min(300px, calc(100% - 28px));
  pointer-events: none;
}

.rel-toast.is-open {
  pointer-events: auto;
}

.rel-toast__card {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}

.rel-toast__icon {
  flex: none;
  font-size: 15px;
}

.rel-toast__icon.is-success {
  color: var(--tx-color-success, #67c23a);
}

.rel-toast__icon.is-warning {
  color: var(--tx-color-warning, #e6a23c);
}

.rel-toast__icon.is-info {
  color: var(--tx-color-primary, #409eff);
}

.rel-toast__text {
  min-width: 0;
  flex: 1;
  font-weight: 500;
}

.rel-toast__close {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-placeholder, #a8abb2);
  cursor: pointer;
  font-size: 13px;
}

.rel-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.rel-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Modal (teleported; the slot keeps these scoped styles) -------------------- */

.rel-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  line-height: 1.6;
}

.rel-modal__lead {
  margin: 0;
}

.rel-modal__label {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.rel-modal__checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rel-modal__checks li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rel-modal__checks li > span:first-child {
  flex: none;
  color: var(--tx-color-success, #67c23a);
}

.rel-modal__check-name {
  min-width: 0;
  flex: 1;
}

.rel-modal__note {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.rel-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Breakpoints -------------------------------------------------------------- */

/* Narrow: header wraps, steps keep their titles, and the rail becomes the first
   tab so the approval gate is the first thing the reader sees. */
@container template (max-width: 639.98px) {
  .rel {
    grid-template-rows: auto auto auto minmax(0, 1fr);
  }

  .rel-head {
    flex-wrap: wrap;
    row-gap: 8px;
    padding: 10px 12px;
  }

  .rel-head__spacer {
    display: none;
  }

  .rel-steps {
    padding: 8px 12px 6px;
  }

  .rel-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .rel-rail {
    box-shadow: none;
  }

  /* Both capsule panels open from its left edge here; right-aligned, the
     history panel would run off the stage. */
  .rel-capsule :deep(.tx-version-capsule__panel--end) {
    right: auto;
    left: 0;
  }

  .rel-capsule :deep(.tx-version-capsule) {
    --tx-version-capsule-panel-width: min(360px, calc(100cqw - 24px));
  }

  .rel-toast {
    top: 12px;
    right: 12px;
  }
}

@container template (min-width: 960px) {
  .rel {
    grid-template-rows: auto minmax(0, 1fr);
  }

  /* Side columns stay at the column layout's rail width until the stage can
     spare more, so the table's pane is never narrower than it is in the column. */
  .rel-body {
    grid-template-columns: 184px minmax(0, 1fr) 300px;
  }

  .rel-pipeline {
    min-height: 0;
    padding: 16px 16px 16px 18px;
    overflow-y: auto;
    box-shadow: inset -1px 0 0 var(--tx-border-color-lighter, #ebeef5);
  }

  .rel-panels {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    grid-template-areas:
      'artifacts artifacts'
      'log notes';
  }

  .rel-artifacts {
    grid-area: artifacts;
    padding: 14px 16px 12px;
    box-shadow: 0 1px 0 var(--tx-border-color-lighter, #ebeef5);
  }

  .rel-log {
    grid-area: log;
    padding: 12px 16px 16px;
  }

  .rel-notes {
    grid-area: notes;
    box-shadow: inset 1px 0 0 var(--tx-border-color-lighter, #ebeef5);
  }

  .rel-rail {
    gap: 14px;
    padding: 14px 16px 18px;
  }

  .rel-share__value {
    font-size: 34px;
  }

  .rel-toast {
    top: 66px;
    right: 16px;
  }
}

@container template (min-width: 1200px) {
  .rel-body {
    grid-template-columns: 220px minmax(0, 1fr) 340px;
  }
}
</style>
