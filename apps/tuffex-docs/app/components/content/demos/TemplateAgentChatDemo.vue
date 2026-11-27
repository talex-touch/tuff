<script setup lang="ts">
// Agent Chat template: a coding agent takes one request from plan to summary —
// a clarifying questionnaire, a repo search, a write-permission gate, the diff,
// the test run and a streamed wrap-up — beside a live plan, the changed files
// and a preview of the plugin. Every tuffex component here is a controlled
// primitive; the script below owns the whole timeline.
//
// What the script never does:
// - Open the write gate by itself. TxToolConfirmation waits for the reader for
//   as long as it takes. Only the clarifying questionnaire (TxApprovalCard) may
//   fall back to its recommended answers, and any answer cancels that.
// - Touch the docs page. The transcript scrolls its own container, and nothing
//   calls focus() or scrollIntoView() while the script plays.
import type { AgentTraceRow } from '@talex-touch/tuffex/agent-trace'
import type { AgentItemProps } from '@talex-touch/tuffex/agents'
import type { AiAttachment, AiSuggestion, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { ApprovalAnswerMap, ApprovalQuestion } from '@talex-touch/tuffex/approval-card'
import type { CodeStreamProps } from '@talex-touch/tuffex/code-stream'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { PromptBarCommand, PromptBarModel, PromptBarSendPayload, PromptBarSource } from '@talex-touch/tuffex/prompt-bar'
import type { TaskRowItem, TaskRowStatus } from '@talex-touch/tuffex/task-rows'
import type { OrbState } from '@talex-touch/tuffex/thinking-orb'
import type { ToolChipDiff, ToolChipRow } from '@talex-touch/tuffex/tool-chips'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type CodeDiffRow = NonNullable<CodeStreamProps['diff']>[number]
type Layout = 'narrow' | 'column' | 'wide' | 'full'
type ItemKind = 'user' | 'plan' | 'ask' | 'search' | 'gate' | 'code' | 'test' | 'summary' | 'system' | 'reply' | 'tail'
type Phase = 'idle' | 'plan' | 'ask' | 'search' | 'gate' | 'code' | 'test' | 'summary' | 'done' | 'stopped'
type TaskKey = 'clarify' | 'locate' | 'implement' | 'verify'
type Gate = 'waiting' | 'allowed' | 'denied' | 'cancelled'
type Outcome = 'applied' | 'patch'
type SideTab = 'tasks' | 'changes' | 'preview'
type AgentId = 'builder' | 'curator' | 'scribe' | 'legacy'
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

/** Stream rows hold identity only; everything they show is read from `state`. */
interface StreamItem {
  id: string
  kind: ItemKind
}

interface TaskState {
  status: TaskRowStatus
  note?: 'skipped' | 'stopped'
}

const TASK_KEYS: TaskKey[] = ['clarify', 'locate', 'implement', 'verify']
const RUNNING: Phase[] = ['plan', 'ask', 'search', 'gate', 'code', 'test', 'summary']
const WORKING: Phase[] = ['plan', 'search', 'code', 'test', 'summary']

const ORB_BY_PHASE: Record<Phase, OrbState> = {
  idle: 'breathing',
  plan: 'solving',
  ask: 'listening',
  search: 'searching',
  gate: 'listening',
  code: 'composing',
  test: 'working',
  summary: 'weaving',
  done: 'breathing',
  stopped: 'breathing',
}

const PLAN_DONE_MS = 2400
const ASK_IDLE_MS = 3000
const SEARCH_LOG_MS = 300
const CODE_LINE_MS = 110
const TEST_LOG_MS = 320
const TYPING_MS = 650
const STREAM_MS = 30
const REPLY_MS = 900
const MAX_TOKENS = 200_000

function formatTokens(used: number, max: number): string {
  return `${(used / 1000).toFixed(1)}K / ${Math.round(max / 1000)}K`
}
const RECOMMENDED_KINDS = ['apiKey', 'privateKey', 'connection']
// File chips only: an image attachment would open a teleported preview.
const ATTACH_FILES = ['clipboard-samples.json', 'crash-report.log', 'retention-notes.md']

const SEARCH_INPUT = 'rg "detectSecret|retentionReason" plugins/clipboard-history/src'
const SEARCH_LOGS = [
  'src/utils/clipboard-shapes.ts:159  export function detectSecret(',
  'src/utils/clipboard-shapes.ts:524  if (detectSecret(content)) {',
  'src/utils/clipboard-items.ts:608   if (item.retentionReason === \'favorite\')',
  'src/utils/clipboard-items.ts:611   if (item.retentionReason === \'protected\')',
  '4 matches · 2 files · 38ms',
]

const TEST_INPUT = 'pnpm -C plugins/clipboard-history exec vitest run src/utils'
const TEST_LOGS = [
  '✓ src/utils/clipboard-shapes.test.ts (22 tests) 41ms',
  '✓ src/utils/clipboard-items.test.ts (28 tests) 57ms',
  '✓ src/utils/clipboard-colors.test.ts (9 tests) 12ms',
  '✓ src/utils/secret-expiry.test.ts (6 tests) 8ms',
  'Test Files  4 passed (4)',
  '     Tests  65 passed (65)',
]

const PATCH_FILES = [
  'A src/utils/secret-expiry.ts          +22',
  'M src/utils/clipboard-items.ts         +7  −2',
  'M src/components/ClipboardDetail.vue   +7  −3',
  'A src/utils/secret-expiry.test.ts     +41',
].join('\n')

const DIFFS: ToolChipDiff[] = [
  { file: 'secret-expiry.ts', add: 22, del: 0 },
  { file: 'clipboard-items.ts', add: 7, del: 2 },
  { file: 'ClipboardDetail.vue', add: 7, del: 3 },
  { file: 'secret-expiry.test.ts', add: 41, del: 0 },
]

// What the copy button yields: the new revision of the lines shown below.
const CODE = [
  'import { detectSecret } from \'./clipboard-shapes\'',
  'import { SECRET_TTL_MS } from \'./secret-expiry\'',
  '',
  'export function resolveRetention(item: ClipboardItem) {',
  '  if (item.retentionReason === \'favorite\')',
  '    return { keep: true, reason: \'favorite\' }',
  '  if (detectSecret(item.content)) {',
  '    const expiresAt = item.createdAt + SECRET_TTL_MS',
  '    return Date.now() < expiresAt',
  '      ? { keep: true, reason: \'secret\', expiresAt }',
  '      : { keep: false, reason: \'secret-expired\' }',
  '  }',
  '  return resolveDefaultRetention(item)',
  '}',
].join('\n')

// Two hunks of clipboard-items.ts. A removed row and the added row replacing it
// share a gutter number: each is that line of its own revision.
const DIFF_ROWS: CodeDiffRow[] = [
  { number: 11, content: 'import { detectSecret } from \'./clipboard-shapes\'' },
  { number: 12, kind: 'added', content: 'import { SECRET_TTL_MS } from \'./secret-expiry\'' },
  { number: 598, content: 'export function resolveRetention(item: ClipboardItem) {' },
  { number: 599, content: '  if (item.retentionReason === \'favorite\')' },
  { number: 600, content: '    return { keep: true, reason: \'favorite\' }' },
  { number: 601, kind: 'removed', content: '  if (detectSecret(item.content))' },
  { number: 602, kind: 'removed', content: '    return { keep: true, reason: \'protected\' }' },
  { number: 601, kind: 'added', content: '  if (detectSecret(item.content)) {' },
  { number: 602, kind: 'added', content: '    const expiresAt = item.createdAt + SECRET_TTL_MS' },
  { number: 603, kind: 'added', content: '    return Date.now() < expiresAt' },
  { number: 604, kind: 'added', content: '      ? { keep: true, reason: \'secret\', expiresAt }' },
  { number: 605, kind: 'added', content: '      : { keep: false, reason: \'secret-expired\' }' },
  { number: 606, kind: 'added', content: '  }' },
  { number: 607, content: '  return resolveDefaultRetention(item)' },
  { number: 608, content: '}' },
]

const zhCopy = {
  title: 'AgentChat 智能体对话',
  agentsTitle: '智能体',
  enabledAgents: '可用',
  disabledAgents: '不可用',
  noAgents: '暂无智能体',
  sideLabel: '任务面板',
  contextLabel: '上下文用量',
  rerun: '重新运行',
  request: '给 clipboard-history 加个「阅后即焚」：复制进历史的密钥过一会儿自动清掉，收藏过的留着。',
  phase: {
    idle: '就绪',
    plan: '规划中',
    ask: '等你回答',
    search: '检索中',
    gate: '等待确认',
    code: '编写中',
    test: '测试中',
    summary: '整理结论',
    done: '完成',
    stopped: '已停止',
  } satisfies Record<Phase, string>,
  planning: '正在规划…',
  planned: '规划了 4 步 · 2.4 秒',
  plan: [
    { primary: '确认保留时长与密钥类型', secondary: '2 个问题' },
    { primary: '定位密钥识别与保留策略', secondary: 'clipboard-shapes.ts', mono: true },
    { primary: '实现阅后即焚', secondary: 'clipboard-items.ts', mono: true },
    { primary: '补单测并运行', secondary: 'vitest', mono: true },
  ],
  tasks: {
    clarify: '确认规则',
    locate: '定位逻辑',
    implement: '阅后即焚',
    verify: '补测试',
  } satisfies Record<TaskKey, string>,
  hits: '4 处',
  tests: '6 项',
  pending: '待确认',
  awaiting: '等待确认',
  skipped: '已跳过',
  stopped: '已停止',
  running: '进行中',
  details: {
    ttl: '保留时长',
    kinds: '密钥类型',
    kindCount: (count: number) => `${count} 类`,
    newTests: '新增测试',
    allTests: '全部测试',
    testCount: (count: number) => `${count} 项`,
  },
  askLead: '动手前确认两件事：',
  askAuto: '3 秒内没有作答，会先按推荐项继续。',
  askManual: '选好后点右下角的箭头提交。',
  askTookDefaults: '采用推荐项',
  askTookYours: '按你的回答',
  askSent: '已确认',
  askSentLine: (ttl: string, kinds: string) => `保留 ${ttl} · ${kinds}`,
  questions: [
    {
      id: 'retention',
      question: '密钥在历史里保留多久？',
      type: 'radio',
      options: [
        { value: '30s', label: '30 秒' },
        { value: '60s', label: '60 秒（推荐）' },
        { value: '5m', label: '5 分钟' },
      ],
      customPlaceholder: '自定义时长…',
    },
    {
      id: 'kinds',
      question: '哪些内容按密钥处理？',
      type: 'check',
      allowCustom: false,
      options: [
        { value: 'apiKey', label: 'API Key / Token' },
        { value: 'privateKey', label: 'SSH / PEM 私钥' },
        { value: 'connection', label: '数据库连接串' },
        { value: 'jwt', label: 'JWT' },
      ],
    },
  ] satisfies ApprovalQuestion[],
  ttl: { '30s': '30 秒', '60s': '60 秒', '5m': '5 分钟' } as Record<string, string>,
  kindNames: { apiKey: 'API Key', privateKey: '私钥', connection: '连接串', jwt: 'JWT' } as Record<string, string>,
  listJoin: '、',
  approval: {
    ariaLabel: '澄清问题',
    sendLabel: '提交回答',
    nextQuestionLabel: '下一题',
    nextLabel: '下一题',
    prevLabel: '上一题',
    dismissLabel: '收起',
    reopenLabel: '展开问题',
    sentLabel: '已提交',
    startOverLabel: '重新作答',
    customPlaceholder: '自定义…',
    customLabel: '自定义回答',
    pagerLabelFormatter: (position: number) => `第 ${position} 题`,
  },
  tool: {
    retryLabel: '重新运行',
    pendingLabel: '排队中',
    runningLabel: '运行中',
    doneLabel: '完成',
    errorLabel: '已停止',
    inputLabel: '输入',
  },
  searchSummary: '查找密钥识别与保留策略',
  searchOutput: '2 个文件 4 处引用：密钥目前标记为 protected，永远不会过期。',
  testSummary: '运行插件单测',
  testOutput: '4 个测试文件、65 项测试全部通过。',
  stoppedByYou: '你停止了这一步。',
  gate: {
    summary: '修改 2 个文件，新增 2 个文件',
    allowLabel: '允许',
    denyLabel: '拒绝',
    rememberLabel: '本次会话内记住',
    riskLabels: { read: '只读', write: '写入文件', execute: '执行命令' },
  },
  gateHint: '点「允许」继续。写入不会自动放行。',
  decision: {
    allowed: '已允许',
    denied: '已拒绝',
    cancelled: '已取消',
    allowedText: '写入 4 个文件',
    remembered: '本次会话内记住',
    deniedText: '不写入文件，改为导出补丁',
    cancelledText: '运行已停止，没有写入',
  },
  typing: '正在整理结论…',
  thinking: '正在回复…',
  summary: (ttl: string, kinds: string) => [
    '已为 **clipboard-history** 加上「阅后即焚」：',
    '',
    `- 复用现有的 \`detectSecret()\`，覆盖：${kinds}`,
    `- 密钥条目 **${ttl}** 后移出历史，收藏过的保留`,
    '- 详情页显示倒计时，例如 `42 秒后清除`',
    '- 新增 6 项单测，插件 65 项测试全部通过',
    '',
    '要不要在设置页再加个开关，让用户自己选时长？',
  ].join('\n'),
  patchSummary: (ttl: string, kinds: string) => [
    '好的，这次不写入任何文件。改动已整理成 `secret-expiry.patch`（4 个文件，+77 −5）：',
    '',
    `- 复用 \`detectSecret()\`，覆盖：${kinds}`,
    `- 密钥条目 **${ttl}** 后移出历史，收藏过的保留`,
    '- 测试还没跑：应用补丁后发送 `/test` 即可',
  ].join('\n'),
  runSummary: (count: number) => `${count} 次工具调用`,
  moreLabel: (count: number) => `还有 ${count} 个`,
  runRows: {
    ask: '确认需求',
    askChip: '2 个问题',
    search: '搜索代码',
    write: '写入文件',
    writeChip: '4 个文件',
    test: '运行测试',
    testDetail: '65 项通过',
  },
  actions: {
    copyLabel: '复制',
    copiedLabel: '已复制',
    regenerateLabel: '重新生成',
    label: '消息操作',
  },
  stopLine: (task: string) => `已停止 · 中止于「${task}」`,
  stopLineBare: '已停止',
  reply: '这是一段脚本化的演示会话，不会真的执行新指令。点头部的「重新运行」可以从头再看一遍。',
  attached: (names: string) => `附件：${names}`,
  doneIn: (seconds: string) => `完成 · ${seconds}`,
  seconds: (value: number) => (value >= 60 ? `${Math.floor(value / 60)} 分 ${Math.round(value % 60)} 秒` : `${value.toFixed(1)} 秒`),
  stop: '停止',
  side: {
    tasks: '任务',
    changes: '变更',
    preview: '预览',
    planTitle: '计划',
  },
  changesEmpty: '允许写入后，改动的文件会列在这里。',
  changesPatch: '未写入 · 已导出为 secret-expiry.patch',
  changesTotal: '4 个文件 · +77 −5',
  changesHint: '点文件名跳到对应代码。',
  screen: {
    label: '插件预览 · CoreBox',
    aria: '插件预览',
    waiting: {
      before: '代码写入后，在这里预览插件效果',
      gate: '允许写入后，在这里预览效果',
      none: '没有写入，暂无可预览的改动',
    },
    cursor: '预览阅后即焚',
    query: 'clip',
    rows: [
      { title: '会议纪要：Q3 路线图', tag: '文本' },
      { title: 'github.com/talex-touch/tuff', tag: '链接' },
      { title: '截图 2026-09-24 10.21.png', tag: '图片' },
    ],
    burn: '42 秒后清除',
  },
  strip: (done: number, files: number) => (files > 0 ? `任务 ${done}/4 · ${files} 个文件变更` : `任务 ${done}/4`),
  prompt: {
    busy: '智能体运行中，可以先写下一条指令…',
    idle: '继续给插件工程师下指令…',
    agent: (name: string) => `给${name}发一条指令…`,
    sendLabel: '发送',
    attachLabel: '添加附件与资料',
    modelLabel: '选择模型',
    sourcesHintText: '输入以搜索资料与文件',
    commandsHintText: '输入以搜索命令',
    emptyText: (query: string) => `没有匹配「${query}」的项`,
    connectText: '连接',
    connectedText: '已连接',
    attachmentFallbackLabel: '附件',
    removeAttachmentLabel: (name: string) => `移除 ${name}`,
  },
  sources: [
    { key: 'attach', name: '添加截图与文件', desc: '从本机上传', attach: true },
    { key: 'plugin', name: 'clipboard-history', desc: 'plugins/clipboard-history' },
    { key: 'samples', name: '剪贴板样本', desc: '最近 50 条（已脱敏）' },
    { key: 'docs', name: 'Tuff 文档', desc: 'tuff.tagzxia.com/docs' },
  ] satisfies PromptBarSource[],
  commands: [
    { key: 'plan', name: '/plan', desc: '只出计划，不改代码' },
    { key: 'test', name: '/test', desc: '运行插件测试' },
    { key: 'review', name: '/review', desc: '审阅当前改动' },
    { key: 'release', name: '/release', desc: '起草更新日志' },
  ] satisfies PromptBarCommand[],
  models: [
    { key: 'pro', name: 'Tuff Pro', tag: '推荐' },
    { key: 'flash', name: 'Tuff Flash', tag: '快速' },
    { key: 'local', name: '本地模型', tag: '离线' },
  ] satisfies PromptBarModel[],
  agents: {
    builder: { name: '插件工程师', description: '读代码、改插件、跑测试' },
    curator: { name: '剪贴板管家', description: '整理与检索剪贴板历史' },
    scribe: { name: '发布记录员', description: '起草更新日志与发布说明' },
    legacy: { name: '旧版工作流', description: '迁移完成前不可用' },
  } satisfies Record<AgentId, { name: string, description: string }>,
  agentBadge: { running: '运行中', done: '完成' },
  idleAgent: '空闲',
  tryAsking: '可以这样问',
  idleNote: '只有「插件工程师」带有脚本化会话，这里的指令不会执行。',
  starters: {
    curator: ['把本周复制过的链接整理成清单', '找出上周复制的那段 SQL', '清理 30 天前的图片'],
    scribe: ['根据最近 10 个提交起草更新日志', '把 v2.4.0 的变更翻译成英文', '列出这次发布的破坏性变更'],
  } as Record<string, string[]>,
}

const enCopy: typeof zhCopy = {
  title: 'Agent Chat',
  agentsTitle: 'Agents',
  enabledAgents: 'Available',
  disabledAgents: 'Unavailable',
  noAgents: 'No agents yet',
  sideLabel: 'Task panel',
  contextLabel: 'Context usage',
  rerun: 'Run again',
  request: 'Add burn-after-reading to clipboard-history: secrets copied into the history should clear themselves after a short while, unless they are starred.',
  phase: {
    idle: 'Ready',
    plan: 'Planning',
    ask: 'Waiting for you',
    search: 'Searching',
    gate: 'Needs approval',
    code: 'Writing code',
    test: 'Testing',
    summary: 'Wrapping up',
    done: 'Done',
    stopped: 'Stopped',
  },
  planning: 'Planning…',
  planned: 'Planned 4 steps · 2.4s',
  plan: [
    { primary: 'Confirm retention and secret types', secondary: '2 questions' },
    { primary: 'Find secret detection and retention', secondary: 'clipboard-shapes.ts', mono: true },
    { primary: 'Implement burn-after-reading', secondary: 'clipboard-items.ts', mono: true },
    { primary: 'Add tests and run them', secondary: 'vitest', mono: true },
  ],
  tasks: {
    clarify: 'Clarify',
    locate: 'Find logic',
    implement: 'Add expiry',
    verify: 'Run tests',
  },
  hits: '4 hits',
  tests: '6 tests',
  pending: 'To confirm',
  awaiting: 'Awaiting',
  skipped: 'Skipped',
  stopped: 'Stopped',
  running: 'Running',
  details: {
    ttl: 'Retention',
    kinds: 'Secret types',
    kindCount: (count: number) => `${count} types`,
    newTests: 'New tests',
    allTests: 'All tests',
    testCount: (count: number) => `${count} tests`,
  },
  askLead: 'Two things before I start:',
  askAuto: 'No answer in 3 seconds and I will go with the recommended picks.',
  askManual: 'Pick your answers, then send with the arrow.',
  askTookDefaults: 'recommended picks',
  askTookYours: 'your answers',
  askSent: 'Confirmed',
  askSentLine: (ttl: string, kinds: string) => `Keep ${ttl} · ${kinds}`,
  questions: [
    {
      id: 'retention',
      question: 'How long should a secret stay in the history?',
      type: 'radio',
      options: [
        { value: '30s', label: '30 seconds' },
        { value: '60s', label: '60 seconds (recommended)' },
        { value: '5m', label: '5 minutes' },
      ],
      customPlaceholder: 'Custom duration…',
    },
    {
      id: 'kinds',
      question: 'What counts as a secret?',
      type: 'check',
      allowCustom: false,
      options: [
        { value: 'apiKey', label: 'API keys / tokens' },
        { value: 'privateKey', label: 'SSH / PEM private keys' },
        { value: 'connection', label: 'Database connection strings' },
        { value: 'jwt', label: 'JWTs' },
      ],
    },
  ],
  ttl: { '30s': '30 seconds', '60s': '60 seconds', '5m': '5 minutes' },
  kindNames: { apiKey: 'API keys', privateKey: 'private keys', connection: 'connection strings', jwt: 'JWTs' },
  listJoin: ', ',
  approval: {
    ariaLabel: 'Clarifying questions',
    sendLabel: 'Send answers',
    nextQuestionLabel: 'Next question',
    nextLabel: 'Next',
    prevLabel: 'Previous',
    dismissLabel: 'Collapse',
    reopenLabel: 'Show questions',
    sentLabel: 'Answers sent',
    startOverLabel: 'Start over',
    customPlaceholder: 'Something else…',
    customLabel: 'Custom answer',
    pagerLabelFormatter: (position: number) => `Go to question ${position}`,
  },
  tool: {
    retryLabel: 'Run again',
    pendingLabel: 'Queued',
    runningLabel: 'Running',
    doneLabel: 'Done',
    errorLabel: 'Stopped',
    inputLabel: 'Input',
  },
  searchSummary: 'Find secret detection and retention',
  searchOutput: '4 hits in 2 files. Secrets are marked protected and never expire.',
  testSummary: 'Run the plugin tests',
  testOutput: 'All 65 tests in 4 files passed.',
  stoppedByYou: 'You stopped this step.',
  gate: {
    summary: 'Edit 2 files and add 2',
    allowLabel: 'Allow',
    denyLabel: 'Deny',
    rememberLabel: 'Remember for this session',
    riskLabels: { read: 'Read-only', write: 'Writes files', execute: 'Runs commands' },
  },
  gateHint: 'Click Allow to continue. Writes never go ahead on their own.',
  decision: {
    allowed: 'Allowed',
    denied: 'Denied',
    cancelled: 'Cancelled',
    allowedText: 'Write 4 files',
    remembered: 'remembered for this session',
    deniedText: 'Nothing written; exporting a patch instead',
    cancelledText: 'Run stopped before any write',
  },
  typing: 'Writing the summary…',
  thinking: 'Replying…',
  summary: (ttl: string, kinds: string) => [
    '**clipboard-history** now burns secrets after reading:',
    '',
    `- Reuses the existing \`detectSecret()\` for ${kinds}`,
    `- Secret entries leave the history after **${ttl}**; starred ones stay`,
    '- The detail view shows a countdown, e.g. `clears in 42s`',
    '- 6 new tests; all 65 plugin tests pass',
    '',
    'Want a settings toggle so people can pick the duration?',
  ].join('\n'),
  patchSummary: (ttl: string, kinds: string) => [
    'Understood, nothing was written. The change is saved as `secret-expiry.patch` (4 files, +77 −5):',
    '',
    `- Reuses \`detectSecret()\` for ${kinds}`,
    `- Secret entries leave the history after **${ttl}**; starred ones stay`,
    '- Tests have not run yet: apply the patch, then send `/test`',
  ].join('\n'),
  runSummary: (count: number) => `${count} tool call${count === 1 ? '' : 's'}`,
  moreLabel: (count: number) => `+${count} more`,
  runRows: {
    ask: 'Clarify',
    askChip: '2 questions',
    search: 'Search code',
    write: 'Write files',
    writeChip: '4 files',
    test: 'Run tests',
    testDetail: '65 passed',
  },
  actions: {
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    regenerateLabel: 'Regenerate',
    label: 'Message actions',
  },
  stopLine: (task: string) => `Stopped at “${task}”`,
  stopLineBare: 'Stopped',
  reply: 'This is a scripted demo session, so it will not act on new instructions. Use Run again in the header to watch it from the start.',
  attached: (names: string) => `Attached: ${names}`,
  doneIn: (seconds: string) => `Done · ${seconds}`,
  seconds: (value: number) => (value >= 60 ? `${Math.floor(value / 60)}m ${Math.round(value % 60)}s` : `${value.toFixed(1)}s`),
  stop: 'Stop',
  side: {
    tasks: 'Tasks',
    changes: 'Changes',
    preview: 'Preview',
    planTitle: 'Plan',
  },
  changesEmpty: 'Changed files show up here once writes are allowed.',
  changesPatch: 'Not written · exported as secret-expiry.patch',
  changesTotal: '4 files · +77 −5',
  changesHint: 'Click a file to jump to its code.',
  screen: {
    label: 'Plugin preview · CoreBox',
    aria: 'Plugin preview',
    waiting: {
      before: 'The plugin preview appears once the code is written',
      gate: 'Preview appears once the write is allowed',
      none: 'Nothing was written, so there is nothing to preview',
    },
    cursor: 'Previewing burn-after-read',
    query: 'clip',
    rows: [
      { title: 'Meeting notes: Q3 roadmap', tag: 'Text' },
      { title: 'github.com/talex-touch/tuff', tag: 'Link' },
      { title: 'Screenshot 2026-09-24 10.21.png', tag: 'Image' },
    ],
    burn: 'clears in 42s',
  },
  strip: (done: number, files: number) => (files > 0 ? `Tasks ${done}/4 · ${files} files changed` : `Tasks ${done}/4`),
  prompt: {
    busy: 'The agent is working. You can draft the next instruction…',
    idle: 'Give the Plugin Builder a follow-up…',
    agent: (name: string) => `Message ${name}…`,
    sendLabel: 'Send',
    attachLabel: 'Add attachments and sources',
    modelLabel: 'Choose model',
    sourcesHintText: 'Type to search sources & files',
    commandsHintText: 'Type to search commands',
    emptyText: (query: string) => `No matches for “${query}”`,
    connectText: 'Connect',
    connectedText: 'Connected',
    attachmentFallbackLabel: 'Attachment',
    removeAttachmentLabel: (name: string) => `Remove ${name}`,
  },
  sources: [
    { key: 'attach', name: 'Add screenshots & files', desc: 'Upload from this computer', attach: true },
    { key: 'plugin', name: 'clipboard-history', desc: 'plugins/clipboard-history' },
    { key: 'samples', name: 'Clipboard samples', desc: 'Last 50 items, redacted' },
    { key: 'docs', name: 'Tuff docs', desc: 'tuff.tagzxia.com/docs' },
  ],
  commands: [
    { key: 'plan', name: '/plan', desc: 'Plan only, no code changes' },
    { key: 'test', name: '/test', desc: 'Run the plugin tests' },
    { key: 'review', name: '/review', desc: 'Review the current changes' },
    { key: 'release', name: '/release', desc: 'Draft the changelog' },
  ],
  models: [
    { key: 'pro', name: 'Tuff Pro', tag: 'Recommended' },
    { key: 'flash', name: 'Tuff Flash', tag: 'Fast' },
    { key: 'local', name: 'On-device', tag: 'Offline' },
  ],
  agents: {
    builder: { name: 'Plugin Builder', description: 'Reads code, edits plugins, runs tests' },
    curator: { name: 'Clipboard Curator', description: 'Sorts and searches clipboard history' },
    scribe: { name: 'Release Scribe', description: 'Drafts changelogs and release notes' },
    legacy: { name: 'Legacy Workflow', description: 'Unavailable until the migration lands' },
  },
  agentBadge: { running: 'Running', done: 'Done' },
  idleAgent: 'Idle',
  tryAsking: 'Try asking',
  idleNote: 'Only the Plugin Builder has a scripted session; nothing sent here runs.',
  starters: {
    curator: ['List the links I copied this week', 'Find the SQL I copied last Tuesday', 'Clear images older than 30 days'],
    scribe: ['Draft a changelog from the last 10 commits', 'Translate the v2.4.0 notes into Chinese', 'List the breaking changes in this release'],
  },
}

const AGENT_ICONS: Record<AgentId, string> = {
  builder: 'i-carbon-plug',
  curator: 'i-carbon-paste',
  scribe: 'i-carbon-document',
  legacy: 'i-carbon-bot',
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const copy = computed(() => (zh.value ? zhCopy : enCopy))

const stripId = useId()

function layoutOf(width: number): Layout {
  // The stage reports 0 before its first measurement; the column layout is the
  // one it is about to be in.
  if (width <= 0)
    return 'column'
  if (width < 640)
    return 'narrow'
  if (width < 960)
    return 'column'
  return width < 1200 ? 'wide' : 'full'
}

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---------------------------------------------------------------------------
// Script state
// ---------------------------------------------------------------------------

function initialTasks(): Record<TaskKey, TaskState> {
  return {
    clarify: { status: 'pending' },
    locate: { status: 'pending' },
    implement: { status: 'pending' },
    verify: { status: 'pending' },
  }
}

function initialState() {
  return {
    phase: 'idle' as Phase,
    items: [
      { id: 'request', kind: 'user' },
      // A permanent last row. TxConversationStream keeps its last item outside
      // the virtual list and remounts it when the next one arrives; with this
      // tail in that slot, every real row mounts once and keeps its state.
      { id: 'tail', kind: 'tail' },
    ] as StreamItem[],
    startedAt: 0,
    finishedAt: 0,
    context: 8_200,
    planRows: 0,
    planDone: false,
    planOpen: undefined as boolean | undefined,
    tasksShown: false,
    tasks: initialTasks(),
    answers: {} as ApprovalAnswerMap,
    askIndex: 0,
    askSent: false,
    askMode: 'auto' as 'auto' | 'manual' | 'done',
    askAuto: false,
    searchStatus: 'running' as AiToolCallPart['status'],
    searchLogs: 0,
    gate: 'waiting' as Gate,
    remember: false,
    codeLines: 0,
    testStatus: 'running' as AiToolCallPart['status'],
    testLogs: 0,
    outcome: 'applied' as Outcome,
    summaryTyping: false,
    summaryChars: 0,
    summaryDone: false,
    /** The preview only goes live once code is being written. */
    screen: 'waiting' as 'waiting' | 'working',
    cursorOnSecret: false,
    stoppedTask: null as TaskKey | null,
    userTexts: {} as Record<string, string>,
    replying: {} as Record<string, boolean>,
    openTasks: [] as string[],
  }
}

const state = reactive(initialState())
const generation = ref(0)
const reduced = ref(false)
const draft = ref('')
const attachments = ref<AiAttachment[]>([])
const model = ref('pro')
const sideTab = ref<SideTab>('tasks')
const stripOpen = ref(false)
const selectedAgent = ref<AgentId>('builder')
const agentNotes = ref<Record<string, boolean>>({})
const codeFlash = ref(false)
const streamRef = ref<TxConversationStreamInstance | null>(null)

let entered = false
let followUps = 0
let timers: ReturnType<typeof setTimeout>[] = []

function later(ms: number, run: () => void): void {
  const id = setTimeout(() => {
    timers = timers.filter(timer => timer !== id)
    run()
  }, ms)
  timers.push(id)
}

/** Calls `step` every `ms` until it returns false. */
function every(ms: number, step: () => boolean): void {
  later(ms, () => {
    if (step())
      every(ms, step)
  })
}

function clearTimers(): void {
  for (const id of timers)
    clearTimeout(id)
  timers = []
}

/** New rows go in front of the permanent tail. */
function push(kind: ItemKind, id: string = kind): void {
  state.items.splice(state.items.length - 1, 0, { id, kind })
}

const running = computed(() => RUNNING.includes(state.phase))
const working = computed(() => WORKING.includes(state.phase))

// ---------------------------------------------------------------------------
// Derived content
// ---------------------------------------------------------------------------

const ttlLabel = computed(() => {
  const answer = state.answers.retention
  const custom = answer?.custom?.trim()
  if (custom)
    return custom
  return copy.value.ttl[answer?.values[0] ?? '60s'] ?? copy.value.ttl['60s'] ?? ''
})

const kindValues = computed(() => {
  const values = state.answers.kinds?.values ?? []
  return values.length > 0 ? values : RECOMMENDED_KINDS
})

const kindsLabel = computed(() =>
  kindValues.value.map(value => copy.value.kindNames[value] ?? value).join(copy.value.listJoin),
)

const summaryText = computed(() =>
  state.outcome === 'patch'
    ? copy.value.patchSummary(ttlLabel.value, kindsLabel.value)
    : copy.value.summary(ttlLabel.value, kindsLabel.value),
)

const summaryShown = computed(() => summaryText.value.slice(0, state.summaryChars))

const planRows = computed<AgentTraceRow[]>(() =>
  copy.value.plan.slice(0, state.planRows).map((row, index) => ({ id: `plan-${index}`, ...row })),
)

const searchCall = computed<AiToolCallPart>(() => ({
  type: 'tool-call',
  id: 'search',
  name: 'search_repo',
  status: state.searchStatus,
  summary: copy.value.searchSummary,
  input: SEARCH_INPUT,
  logs: SEARCH_LOGS.slice(0, state.searchLogs).join('\n'),
  output: copy.value.searchOutput,
  error: copy.value.stoppedByYou,
}))

const testCall = computed<AiToolCallPart>(() => ({
  type: 'tool-call',
  id: 'test',
  name: 'run_tests',
  status: state.testStatus,
  summary: copy.value.testSummary,
  input: TEST_INPUT,
  logs: TEST_LOGS.slice(0, state.testLogs).join('\n'),
  output: copy.value.testOutput,
  error: copy.value.stoppedByYou,
}))

function taskNote(key: TaskKey): string | undefined {
  const task = state.tasks[key]
  if (task.note === 'skipped')
    return copy.value.skipped
  if (task.note === 'stopped')
    return copy.value.stopped
  if (key === 'implement' && task.status === 'running' && state.gate === 'waiting')
    return copy.value.awaiting
  return undefined
}

function taskAmount(key: TaskKey): string | undefined {
  switch (key) {
    case 'clarify':
      return state.askSent ? ttlLabel.value : undefined
    case 'locate':
      return copy.value.hits
    case 'implement':
      return '+36 −5'
    default:
      return copy.value.tests
  }
}

function taskDetails(key: TaskKey): TaskRowItem['details'] {
  const details = copy.value.details
  switch (key) {
    case 'clarify':
      return state.askSent
        ? [{ label: details.ttl, meta: ttlLabel.value }, { label: details.kinds, meta: details.kindCount(kindValues.value.length) }]
        : [{ label: details.ttl, meta: copy.value.pending }, { label: details.kinds, meta: copy.value.pending }]
    case 'locate':
      return [
        { label: 'clipboard-shapes.ts', meta: 'detectSecret()' },
        { label: 'clipboard-items.ts', meta: 'resolveRetention()' },
      ]
    case 'implement':
      return DIFFS.slice(0, 3).map(diff => ({ label: diff.file, meta: diff.del > 0 ? `+${diff.add} −${diff.del}` : `+${diff.add}` }))
    default:
      return [
        { label: 'secret-expiry.test.ts', meta: details.testCount(6) },
        { label: details.allTests, meta: details.testCount(65) },
      ]
  }
}

const taskRows = computed<TaskRowItem[]>(() =>
  TASK_KEYS.map((key, index) => ({
    id: key,
    index: index + 1,
    label: copy.value.tasks[key],
    // The amount is the step's result, so it appears once the step is done —
    // which also keeps it out of the way of the running and error pills.
    amount: state.tasks[key].status === 'done' ? taskAmount(key) : undefined,
    status: state.tasks[key].status,
    statusText: taskNote(key),
    retryable: false,
    details: taskDetails(key),
  })),
)

const doneCount = computed(() => TASK_KEYS.filter(key => state.tasks[key].status === 'done').length)

const changesReady = computed(() =>
  (state.gate === 'allowed' && state.codeLines > 0) || state.outcome === 'patch',
)

const runRows = computed<ToolChipRow[]>(() => {
  const labels = copy.value.runRows
  const rows: ToolChipRow[] = [
    { id: 'ask', label: labels.ask, chip: labels.askChip, icon: 'think' },
    {
      id: 'search',
      label: labels.search,
      chip: 'detectSecret|retentionReason',
      icon: 'read',
      mono: true,
      detailMono: true,
      detail: SEARCH_LOGS.slice(0, 4).map(text => ({ text })),
    },
  ]
  if (state.outcome === 'applied') {
    rows.push(
      {
        id: 'write',
        label: labels.write,
        chip: labels.writeChip,
        icon: 'write',
        detailMono: true,
        detail: DIFFS.map(diff => ({ text: `${diff.file}  +${diff.add}${diff.del > 0 ? ` −${diff.del}` : ''}`, tone: 'add' as const })),
      },
      {
        id: 'test',
        label: labels.test,
        chip: 'vitest run src/utils',
        icon: 'run',
        mono: true,
        detailMono: true,
        detail: [{ text: labels.testDetail, tone: 'add' }],
      },
    )
  }
  return rows
})

const questions = computed<ApprovalQuestion[]>(() => copy.value.questions)

const askHint = computed(() =>
  state.askMode === 'auto' && !reduced.value ? copy.value.askAuto : copy.value.askManual,
)

const decision = computed(() => {
  const labels = copy.value.decision
  switch (state.gate) {
    case 'allowed':
      return {
        status: 'success' as BadgeTone,
        badge: labels.allowed,
        text: state.remember ? `${labels.allowedText} · ${labels.remembered}` : labels.allowedText,
      }
    case 'denied':
      return { status: 'danger' as BadgeTone, badge: labels.denied, text: labels.deniedText }
    default:
      return { status: 'muted' as BadgeTone, badge: labels.cancelled, text: labels.cancelledText }
  }
})

const stopText = computed(() =>
  state.stoppedTask ? copy.value.stopLine(copy.value.tasks[state.stoppedTask]) : copy.value.stopLineBare,
)

const agents = computed<AgentItemProps[]>(() => {
  const names = copy.value.agents
  const badge = state.phase === 'done'
    ? copy.value.agentBadge.done
    : running.value ? copy.value.agentBadge.running : ''
  return (Object.keys(names) as AgentId[]).map(id => ({
    id,
    name: names[id].name,
    description: names[id].description,
    iconClass: AGENT_ICONS[id],
    disabled: id === 'legacy',
    badgeText: id === 'builder' ? badge : '',
  }))
})

const activeAgent = computed(() => copy.value.agents[selectedAgent.value])
const isBuilder = computed(() => selectedAgent.value === 'builder')

const starters = computed<AiSuggestion[]>(() =>
  (copy.value.starters[selectedAgent.value] ?? []).map((text, index) => ({ id: `starter-${index}`, text })),
)

const modelName = computed(() => copy.value.models.find(entry => entry.key === model.value)?.name ?? 'Tuff Pro')

const headMeta = computed(() =>
  isBuilder.value ? `clipboard-history · ${modelName.value}` : activeAgent.value.description,
)

const phaseLabel = computed(() => copy.value.phase[state.phase])

const headBadge = computed<{ text: string, status: BadgeTone } | null>(() => {
  if (!isBuilder.value)
    return { text: copy.value.idleAgent, status: 'muted' }
  switch (state.phase) {
    case 'ask':
    case 'gate':
      return { text: phaseLabel.value, status: 'warning' }
    case 'done':
      return {
        text: copy.value.doneIn(copy.value.seconds((state.finishedAt - state.startedAt) / 1000)),
        status: 'success',
      }
    case 'stopped':
      return { text: phaseLabel.value, status: 'danger' }
    case 'idle':
      return { text: phaseLabel.value, status: 'muted' }
    default:
      return null
  }
})

const orbState = computed<OrbState>(() => (isBuilder.value ? ORB_BY_PHASE[state.phase] : 'breathing'))
const orbPaused = computed(() => !isBuilder.value || !running.value || reduced.value)

const promptPlaceholder = computed(() => {
  if (!isBuilder.value)
    return copy.value.prompt.agent(activeAgent.value.name)
  return running.value ? copy.value.prompt.busy : copy.value.prompt.idle
})

const stripText = computed(() => copy.value.strip(doneCount.value, changesReady.value ? DIFFS.length : 0))

const previewWaitsForGate = computed(() => state.phase === 'gate' && state.gate === 'waiting')
const previewSkipped = computed(() =>
  state.gate === 'denied' || state.gate === 'cancelled' || state.phase === 'stopped',
)

const previewHint = computed(() => {
  const waiting = copy.value.screen.waiting
  if (previewWaitsForGate.value)
    return waiting.gate
  return previewSkipped.value ? waiting.none : waiting.before
})

const screenCursor = computed(() =>
  state.cursorOnSecret
    ? { x: 72, y: 81, label: copy.value.screen.cursor }
    : { x: 30, y: 21 },
)

function userText(id: string): string {
  return id === 'request' ? copy.value.request : state.userTexts[id] ?? ''
}

function userMessage(id: string) {
  return { id, role: 'user' as const, content: userText(id) }
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function onEnter(): void {
  entered = true
  start()
}

function start(): void {
  clearTimers()
  reduced.value = prefersReducedMotion()
  state.startedAt = Date.now()
  if (reduced.value) {
    settleToGate()
    return
  }
  beginPlan()
}

function beginPlan(): void {
  state.phase = 'plan'
  state.context = 12_400
  push('plan')
  later(800, () => {
    state.planRows = 2
  })
  later(1600, () => {
    state.planRows = 4
    state.tasksShown = true
  })
  later(PLAN_DONE_MS, () => {
    state.planDone = true
    state.context = 18_900
    beginAsk()
  })
}

function beginAsk(): void {
  state.phase = 'ask'
  state.tasks.clarify.status = 'running'
  state.askMode = 'auto'
  push('ask')
  // Clarifying questions are not a safety gate, so an idle reader gets the
  // recommended answers after a pause. Any answer switches this off.
  later(ASK_IDLE_MS, () => autoAnswer(0))
}

function autoAnswer(step: number): void {
  if (state.askMode !== 'auto' || state.askSent)
    return
  if (step === 0) {
    state.answers = { ...state.answers, retention: { questionId: 'retention', values: ['60s'], custom: '' } }
    later(520, () => {
      if (state.askMode !== 'auto')
        return
      state.askIndex = 1
      later(600, () => autoAnswer(1))
    })
    return
  }
  state.answers = {
    ...state.answers,
    kinds: { questionId: 'kinds', values: RECOMMENDED_KINDS.slice(0, step), custom: '' },
  }
  if (step < RECOMMENDED_KINDS.length) {
    later(360, () => autoAnswer(step + 1))
    return
  }
  later(650, () => {
    if (state.askMode === 'auto')
      finishAsk(true)
  })
}

function takeOverAsk(): void {
  if (state.askMode === 'auto')
    state.askMode = 'manual'
}

function onAskAnswers(value: ApprovalAnswerMap): void {
  state.answers = value
}

function onAskIndex(value: number): void {
  takeOverAsk()
  state.askIndex = value
}

function onAskSent(value: boolean): void {
  if (value)
    finishAsk(false)
}

function finishAsk(auto: boolean): void {
  if (state.askSent)
    return
  state.askSent = true
  state.askAuto = auto
  state.askMode = 'done'
  // A stopped run keeps the answers but does not resume on them.
  if (state.phase !== 'ask')
    return
  state.tasks.clarify.status = 'done'
  later(400, beginSearch)
}

function beginSearch(): void {
  state.phase = 'search'
  state.tasks.locate.status = 'running'
  state.context = 29_300
  state.searchStatus = 'running'
  state.searchLogs = 0
  push('search')
  every(SEARCH_LOG_MS, () => {
    state.searchLogs += 1
    return state.searchLogs < SEARCH_LOGS.length
  })
  later(SEARCH_LOG_MS * (SEARCH_LOGS.length + 1), () => {
    state.searchStatus = 'done'
    state.tasks.locate.status = 'done'
    later(600, beginGate)
  })
}

function beginGate(): void {
  state.phase = 'gate'
  state.tasks.implement.status = 'running'
  state.gate = 'waiting'
  push('gate')
  // Nothing is scheduled from here: the run continues only from onAllow or
  // onDeny, whenever the reader gets to it.
}

function onAllow(payload: { remember: boolean }): void {
  if (state.gate !== 'waiting' || state.phase !== 'gate')
    return
  state.gate = 'allowed'
  state.remember = payload.remember
  if (reduced.value) {
    settleApplied()
    return
  }
  later(300, beginCode)
}

function onDeny(payload: { remember: boolean }): void {
  if (state.gate !== 'waiting' || state.phase !== 'gate')
    return
  state.gate = 'denied'
  state.remember = payload.remember
  state.outcome = 'patch'
  state.tasks.implement = { status: 'error', note: 'skipped' }
  state.tasks.verify = { status: 'error', note: 'skipped' }
  if (reduced.value) {
    settleSummary()
    return
  }
  later(400, () => beginSummary())
}

function beginCode(): void {
  state.phase = 'code'
  state.screen = 'working'
  state.codeLines = 0
  push('code')
  later(700, () => {
    state.cursorOnSecret = true
  })
  every(CODE_LINE_MS, () => {
    state.codeLines += 1
    if (state.codeLines < DIFF_ROWS.length)
      return true
    later(350, () => {
      state.tasks.implement.status = 'done'
      later(300, beginTests)
    })
    return false
  })
}

function beginTests(): void {
  state.phase = 'test'
  state.tasks.verify.status = 'running'
  state.context = 38_700
  state.testStatus = 'running'
  state.testLogs = 0
  push('test')
  every(TEST_LOG_MS, () => {
    state.testLogs += 1
    return state.testLogs < TEST_LOGS.length
  })
  later(TEST_LOG_MS * (TEST_LOGS.length + 1), () => {
    state.testStatus = 'done'
    state.tasks.verify.status = 'done'
    later(400, () => beginSummary())
  })
}

function beginSummary(): void {
  state.phase = 'summary'
  state.context = 46_200
  state.summaryTyping = true
  state.summaryChars = 0
  state.summaryDone = false
  if (!state.items.some(item => item.kind === 'summary'))
    push('summary')
  later(TYPING_MS, () => {
    state.summaryTyping = false
    // Chinese carries more per character, so it streams fewer per tick.
    const step = zh.value ? 2 : 4
    every(STREAM_MS, () => {
      state.summaryChars = Math.min(summaryText.value.length, state.summaryChars + step)
      if (state.summaryChars < summaryText.value.length)
        return true
      finishRun()
      return false
    })
  })
}

function finishRun(): void {
  state.summaryDone = true
  state.phase = 'done'
  state.finishedAt = Date.now()
}

function onRegenerate(): void {
  if (running.value)
    return
  if (reduced.value) {
    state.summaryChars = summaryText.value.length
    return
  }
  beginSummary()
}

function onStop(): void {
  if (!running.value)
    return
  clearTimers()
  const active = TASK_KEYS.find(key => state.tasks[key].status === 'running') ?? null
  if (active)
    state.tasks[active] = { status: 'error', note: 'stopped' }
  if (state.searchStatus === 'running' && state.items.some(item => item.kind === 'search'))
    state.searchStatus = 'error'
  if (state.testStatus === 'running' && state.items.some(item => item.kind === 'test'))
    state.testStatus = 'error'
  if (state.gate === 'waiting' && state.phase === 'gate')
    state.gate = 'cancelled'
  if (state.askMode === 'auto')
    state.askMode = 'manual'
  if (state.phase === 'plan')
    state.planDone = true
  if (state.summaryTyping || (state.phase === 'summary' && !state.summaryDone)) {
    state.summaryTyping = false
    state.summaryDone = true
  }
  state.stoppedTask = active
  state.phase = 'stopped'
  state.finishedAt = Date.now()
  push('system', `stop-${state.items.length}`)
}

// --- Reduced motion: land on the end state without a single timer. ---------

function settleToGate(): void {
  // Everything that needs no consent is already done; the gate still waits.
  state.planRows = 4
  state.planDone = true
  state.tasksShown = true
  state.answers = {
    retention: { questionId: 'retention', values: ['60s'], custom: '' },
    kinds: { questionId: 'kinds', values: [...RECOMMENDED_KINDS], custom: '' },
  }
  state.askIndex = 1
  state.askSent = true
  state.askAuto = true
  state.askMode = 'done'
  state.searchStatus = 'done'
  state.searchLogs = SEARCH_LOGS.length
  state.tasks.clarify.status = 'done'
  state.tasks.locate.status = 'done'
  state.tasks.implement.status = 'running'
  state.context = 29_300
  state.gate = 'waiting'
  state.items = [
    { id: 'request', kind: 'user' },
    { id: 'plan', kind: 'plan' },
    { id: 'ask', kind: 'ask' },
    { id: 'search', kind: 'search' },
    { id: 'gate', kind: 'gate' },
    { id: 'tail', kind: 'tail' },
  ]
  state.phase = 'gate'
}

function settleApplied(): void {
  state.screen = 'working'
  state.cursorOnSecret = true
  state.codeLines = DIFF_ROWS.length
  state.testStatus = 'done'
  state.testLogs = TEST_LOGS.length
  state.tasks.implement.status = 'done'
  state.tasks.verify.status = 'done'
  state.context = 38_700
  push('code')
  push('test')
  settleSummary()
}

function settleSummary(): void {
  state.context = 46_200
  state.summaryTyping = false
  state.summaryChars = summaryText.value.length
  state.summaryDone = true
  push('summary')
  state.phase = 'done'
  state.finishedAt = Date.now()
}

// ---------------------------------------------------------------------------
// Reader actions
// ---------------------------------------------------------------------------

function onAttach(): void {
  const name = ATTACH_FILES[attachments.value.length % ATTACH_FILES.length] ?? 'notes.md'
  attachments.value = [...attachments.value, { kind: 'file', id: `${name}-${attachments.value.length}`, name }]
}

function onAttachmentRemove(id: string): void {
  attachments.value = attachments.value.filter(attachment => attachment.id !== id)
}

function onSend(payload: PromptBarSendPayload): void {
  const names = payload.attachments.map(attachment => attachment.name ?? '').filter(Boolean).join(', ')
  const text = [payload.text.trim(), names ? copy.value.attached(names) : ''].filter(Boolean).join('\n')
  if (!text)
    return
  draft.value = ''
  // The bar clears its own text; attachments belong to the host.
  attachments.value = []
  if (!isBuilder.value) {
    agentNotes.value = { ...agentNotes.value, [selectedAgent.value]: true }
    return
  }
  followUps += 1
  const askId = `ask-${followUps}`
  const replyId = `reply-${followUps}`
  state.userTexts[askId] = text
  state.replying[replyId] = !reduced.value
  push('user', askId)
  push('reply', replyId)
  // The reader asked for the newest turn, so bring it into view — inside the
  // transcript's own scroller, never the page.
  void nextTick(() => streamRef.value?.scrollToBottom(reduced.value ? 'auto' : 'smooth'))
  if (!reduced.value) {
    later(REPLY_MS, () => {
      state.replying[replyId] = false
    })
  }
}

function onStarter(suggestion: AiSuggestion): void {
  draft.value = suggestion.text
}

function selectAgent(id: string): void {
  if (id in AGENT_ICONS)
    selectedAgent.value = id as AgentId
}

function jumpToCode(): void {
  const index = state.items.findIndex(item => item.kind === 'code')
  if (index < 0)
    return
  streamRef.value?.scrollToIndex(index)
  codeFlash.value = false
  void nextTick(() => {
    codeFlash.value = true
    // Without motion there is no animationend to clear the ring.
    if (reduced.value) {
      later(1600, () => {
        codeFlash.value = false
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function resetDemo(): void {
  clearTimers()
  Object.assign(state, initialState())
  draft.value = ''
  attachments.value = []
  sideTab.value = 'tasks'
  stripOpen.value = false
  selectedAgent.value = 'builder'
  agentNotes.value = {}
  codeFlash.value = false
  followUps = 0
  // Rebuilds the transcript and the side panel: several of their components
  // read `default*` props once, and entrance motion only plays on mount.
  generation.value += 1
  if (entered)
    void nextTick(start)
}

watch(locale, resetDemo)

onBeforeUnmount(clearTimers)

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="560" @enter="onEnter">
    <template #default="{ width }">
      <div class="ac" :class="`is-${layoutOf(width)}`">
        <aside v-if="layoutOf(width) === 'full'" class="ac-agents" :aria-label="copy.agentsTitle">
          <p class="ac-agents__title">
            {{ copy.agentsTitle }}
            <span class="ac-agents__count">{{ agents.length }}</span>
          </p>
          <div class="ac-agents__list">
            <TxAgentsList
              :agents="agents"
              :selected-id="selectedAgent"
              :enabled-title="copy.enabledAgents"
              :disabled-title="copy.disabledAgents"
              :empty-text="copy.noAgents"
              @select="selectAgent"
            />
          </div>
        </aside>

        <div class="ac-body">
          <header class="ac-head">
            <span class="ac-head__orb">
              <TxThinkingOrb
                :state="orbState"
                :size="20"
                :display-size="22"
                :paused="orbPaused"
                :label="isBuilder ? phaseLabel : copy.idleAgent"
              />
            </span>
            <div class="ac-head__who">
              <span class="ac-head__name">{{ activeAgent.name }}</span>
              <span class="ac-head__meta">{{ headMeta }}</span>
            </div>
            <div class="ac-head__status">
              <TxWorkingIndicator
                v-if="isBuilder && working"
                :label="phaseLabel"
                :started-at="state.startedAt"
              />
              <TxStatusBadge v-else-if="headBadge" :text="headBadge.text" :status="headBadge.status" size="sm" />
            </div>
            <TxContextIndicator
              v-if="isBuilder"
              class="ac-head__context"
              :used-tokens="state.context"
              :max-tokens="MAX_TOKENS"
              :label="copy.contextLabel"
              :formatter="formatTokens"
            />
            <TxIconButton icon="i-carbon-renew" size="sm" :label="copy.rerun" @click="resetDemo" />
          </header>

          <div class="ac-cols">
            <section class="ac-main">
              <div v-show="isBuilder" class="ac-stream">
                <TxConversationStream
                  :key="generation"
                  ref="streamRef"
                  :items="state.items"
                  item-key="id"
                  :overscan="24"
                  :estimated-item-height="88"
                  :streaming="working && !reduced"
                >
                  <template #item="{ item }">
                    <div class="ac-item" :class="[`is-${item.kind}`, { 'is-first': item.id === 'request' }]">
                      <div v-if="item.kind !== 'tail'" class="ac-item__inner">
                        <TxChatMessage
                          v-if="item.kind === 'user'"
                          class="ac-user"
                          :message="userMessage(item.id)"
                          :markdown="false"
                        >
                          <template #avatar>
                            <span class="ac-avatar is-user" aria-hidden="true">
                              <span class="i-carbon-user" />
                            </span>
                          </template>
                        </TxChatMessage>

                        <template v-else-if="item.kind === 'plan'">
                          <div class="ac-who">
                            <span class="ac-avatar is-agent" aria-hidden="true">
                              <span class="i-carbon-plug" />
                            </span>
                            <span class="ac-who__name">{{ copy.agents.builder.name }}</span>
                            <span class="ac-who__meta">{{ modelName }}</span>
                          </div>
                          <div class="ac-turn">
                            <TxAgentTrace
                              :rows="planRows"
                              :working="!state.planDone"
                              :active-label="copy.planning"
                              :done-label="copy.planned"
                              :user-open="state.planOpen"
                              @toggle="state.planOpen = $event"
                            />
                          </div>
                        </template>

                        <div v-else-if="item.kind === 'ask'" class="ac-turn">
                          <p class="ac-say">
                            {{ copy.askLead }}
                          </p>
                          <!-- Once answered, the questionnaire folds into one line of
                               what was decided; the card has done its job. -->
                          <div v-if="state.askSent" class="ac-decision">
                            <TxStatusBadge :text="copy.askSent" status="success" size="sm" />
                            <span class="ac-decision__text">{{ copy.askSentLine(ttlLabel, kindsLabel) }}</span>
                            <span class="ac-decision__note">{{ state.askAuto ? copy.askTookDefaults : copy.askTookYours }}</span>
                          </div>
                          <template v-else>
                            <TxApprovalCard
                              :questions="questions"
                              :model-value="state.answers"
                              :index="state.askIndex"
                              :sent="state.askSent"
                              :dismissible="false"
                              v-bind="copy.approval"
                              @update:model-value="onAskAnswers"
                              @update:index="onAskIndex"
                              @update:sent="onAskSent"
                              @answer="takeOverAsk"
                            />
                            <p class="ac-hint">
                              <span class="i-carbon-time" aria-hidden="true" />
                              {{ askHint }}
                            </p>
                          </template>
                        </div>

                        <div v-else-if="item.kind === 'search'" class="ac-turn">
                          <TxToolCallCard
                            :tool-call="searchCall"
                            default-expanded
                            v-bind="copy.tool"
                            @retry="resetDemo"
                          />
                        </div>

                        <div v-else-if="item.kind === 'gate'" class="ac-turn">
                          <template v-if="state.gate === 'waiting'">
                            <TxToolConfirmation
                              tool-name="apply_patch"
                              risk="write"
                              :summary="copy.gate.summary"
                              :input="PATCH_FILES"
                              :allow-label="copy.gate.allowLabel"
                              :deny-label="copy.gate.denyLabel"
                              :remember-label="copy.gate.rememberLabel"
                              :risk-labels="copy.gate.riskLabels"
                              @approve="onAllow"
                              @deny="onDeny"
                            />
                            <p class="ac-hint is-gate">
                              <span class="ac-hint__lock i-carbon-locked" aria-hidden="true" />
                              {{ copy.gateHint }}
                            </p>
                          </template>
                          <div v-else class="ac-decision">
                            <TxStatusBadge :text="decision.badge" :status="decision.status" size="sm" />
                            <span class="ac-decision__tool">apply_patch</span>
                            <span class="ac-decision__text">{{ decision.text }}</span>
                          </div>
                        </div>

                        <div
                          v-else-if="item.kind === 'code'"
                          class="ac-turn ac-code"
                          :class="{ 'is-flash': codeFlash }"
                          @animationend="codeFlash = false"
                        >
                          <TxCodeStream
                            :code="CODE"
                            :diff="DIFF_ROWS"
                            :revealed-lines="state.codeLines"
                            lang="ts"
                            filename="src/utils/clipboard-items.ts"
                            lang-label="TypeScript"
                            :copy-label="copy.actions.copyLabel"
                            :copied-label="copy.actions.copiedLabel"
                          />
                        </div>

                        <div v-else-if="item.kind === 'test'" class="ac-turn">
                          <TxToolCallCard
                            :tool-call="testCall"
                            default-expanded
                            v-bind="copy.tool"
                            @retry="resetDemo"
                          />
                        </div>

                        <div v-else-if="item.kind === 'summary'" class="ac-turn">
                          <TxTypingIndicator v-if="state.summaryTyping" :text="copy.typing" />
                          <template v-else>
                            <TxStreamMarkdown
                              class="ac-md"
                              :content="summaryShown"
                              :streaming="!state.summaryDone"
                            />
                            <div v-if="state.summaryDone" class="ac-wrap">
                              <TxToolChips
                                :rows="runRows"
                                :diffs="state.outcome === 'applied' ? DIFFS : []"
                                :default-open="false"
                                :summary-formatter="copy.runSummary"
                                :more-label-formatter="copy.moreLabel"
                                @diff-click="jumpToCode"
                              />
                              <TxMessageActions
                                :copy-text="summaryText"
                                regenerable
                                :appear="!reduced"
                                v-bind="copy.actions"
                                @regenerate="onRegenerate"
                              />
                            </div>
                          </template>
                        </div>

                        <p v-else-if="item.kind === 'system'" class="ac-system">
                          <span class="i-carbon-stop-filled-alt" aria-hidden="true" />
                          {{ stopText }}
                        </p>

                        <template v-else-if="item.kind === 'reply'">
                          <div class="ac-who">
                            <span class="ac-avatar is-agent" aria-hidden="true">
                              <span class="i-carbon-plug" />
                            </span>
                            <span class="ac-who__name">{{ copy.agents.builder.name }}</span>
                          </div>
                          <div class="ac-turn">
                            <TxTypingIndicator v-if="state.replying[item.id]" :text="copy.thinking" />
                            <p v-else class="ac-say is-reply">
                              {{ copy.reply }}
                            </p>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </TxConversationStream>
              </div>

              <div v-if="!isBuilder" class="ac-idle">
                <div class="ac-idle__card">
                  <span class="ac-idle__icon" aria-hidden="true">
                    <span :class="AGENT_ICONS[selectedAgent]" />
                  </span>
                  <p class="ac-idle__name">
                    {{ activeAgent.name }}
                  </p>
                  <p class="ac-idle__desc">
                    {{ activeAgent.description }}
                  </p>
                  <p class="ac-idle__label">
                    {{ copy.tryAsking }}
                  </p>
                  <TxSuggestionChips :suggestions="starters" layout="list" @select="onStarter" />
                  <p v-if="agentNotes[selectedAgent]" class="ac-idle__note" role="status">
                    {{ copy.idleNote }}
                  </p>
                </div>
              </div>

              <div class="ac-composer">
                <div v-if="layoutOf(width) === 'narrow' && isBuilder && state.tasksShown" class="ac-strip">
                  <div v-if="stripOpen" :id="stripId" class="ac-strip__panel">
                    <TxTaskRows
                      :rows="taskRows"
                      done-text=""
                      :error-text="copy.stopped"
                      :running-text="copy.running"
                      :open-ids="state.openTasks"
                      @update:open-ids="state.openTasks = $event"
                    />
                  </div>
                  <button
                    type="button"
                    class="ac-strip__toggle"
                    :aria-expanded="stripOpen"
                    :aria-controls="stripId"
                    @click="stripOpen = !stripOpen"
                  >
                    <span class="i-carbon-list-checked" aria-hidden="true" />
                    <span class="ac-strip__text">{{ stripText }}</span>
                    <span class="ac-strip__chevron i-carbon-chevron-down" :class="{ 'is-open': stripOpen }" aria-hidden="true" />
                  </button>
                </div>
                <TxPromptBar
                  v-model="draft"
                  v-model:model="model"
                  :sources="copy.sources"
                  :commands="copy.commands"
                  :models="copy.models"
                  :attachments="attachments"
                  :submitting="isBuilder && running"
                  :placeholder="promptPlaceholder"
                  :send-label="copy.prompt.sendLabel"
                  :attach-label="copy.prompt.attachLabel"
                  :model-label="copy.prompt.modelLabel"
                  :sources-hint-text="copy.prompt.sourcesHintText"
                  :commands-hint-text="copy.prompt.commandsHintText"
                  :empty-text-formatter="copy.prompt.emptyText"
                  :connect-text="copy.prompt.connectText"
                  :connected-text="copy.prompt.connectedText"
                  :attachment-fallback-label="copy.prompt.attachmentFallbackLabel"
                  :remove-attachment-label-formatter="copy.prompt.removeAttachmentLabel"
                  @attach="onAttach"
                  @attachment-remove="onAttachmentRemove"
                  @send="onSend"
                >
                  <template #actions>
                    <TxIconButton
                      v-if="isBuilder && running"
                      icon="i-carbon-stop-filled-alt"
                      size="sm"
                      status="danger"
                      :label="copy.stop"
                      @click="onStop"
                    />
                  </template>
                </TxPromptBar>
              </div>
            </section>

            <aside v-if="layoutOf(width) !== 'narrow'" class="ac-side" :aria-label="copy.sideLabel">
              <div v-if="layoutOf(width) === 'column'" class="ac-side__tabs">
                <TxFlatRadio v-model="sideTab" size="sm">
                  <TxFlatRadioItem value="tasks" :label="`${copy.side.tasks} ${doneCount}/4`" />
                  <TxFlatRadioItem value="changes" :label="changesReady ? `${copy.side.changes} ${DIFFS.length}` : copy.side.changes" />
                  <TxFlatRadioItem value="preview" :label="copy.side.preview" />
                </TxFlatRadio>
              </div>

              <div :key="generation" class="ac-side__scroll">
                <section v-if="layoutOf(width) !== 'column' || sideTab === 'tasks'" class="ac-panel">
                  <p v-if="layoutOf(width) !== 'column'" class="ac-panel__title">
                    {{ copy.side.planTitle }}
                    <span class="ac-panel__count">{{ doneCount }}/4</span>
                  </p>
                  <TxTaskRows
                    v-if="state.tasksShown"
                    :rows="taskRows"
                    done-text=""
                    :error-text="copy.stopped"
                    :running-text="copy.running"
                    :open-ids="state.openTasks"
                    @update:open-ids="state.openTasks = $event"
                  />
                  <TxSkeleton v-else :lines="4" :height="40" :radius="20" :gap="8" />
                </section>

                <section v-if="layoutOf(width) !== 'column' || sideTab === 'changes'" class="ac-panel">
                  <p v-if="layoutOf(width) !== 'column'" class="ac-panel__title">
                    {{ copy.side.changes }}
                    <span v-if="changesReady" class="ac-panel__count">{{ DIFFS.length }}</span>
                  </p>
                  <template v-if="changesReady">
                    <p class="ac-panel__lead">
                      {{ state.outcome === 'patch' ? copy.changesPatch : copy.changesTotal }}
                    </p>
                    <TxDiffChips :diffs="DIFFS" @select="jumpToCode" />
                    <p v-if="state.outcome === 'applied'" class="ac-panel__hint">
                      {{ copy.changesHint }}
                    </p>
                  </template>
                  <p v-else class="ac-panel__empty">
                    <span class="i-carbon-document-tasks" aria-hidden="true" />
                    {{ copy.changesEmpty }}
                  </p>
                </section>

                <section v-if="layoutOf(width) !== 'column' || sideTab === 'preview'" class="ac-panel">
                  <p v-if="layoutOf(width) !== 'column'" class="ac-panel__title">
                    {{ copy.side.preview }}
                  </p>
                  <TxAgentScreen
                    class="ac-screen"
                    state="working"
                    :cursor="state.screen === 'working' ? screenCursor : undefined"
                    ratio="4 / 3"
                    :label="copy.screen.label"
                    :aria-label="copy.screen.aria"
                  >
                    <!-- A painted stand-in for the plugin: CoreBox filtered to the
                         clipboard, with the new countdown on the secret row. -->
                    <div v-if="state.screen === 'working'" class="ac-scr">
                      <div class="ac-scr__win">
                        <div class="ac-scr__search">
                          <span class="i-carbon-search" aria-hidden="true" />
                          <span class="ac-scr__query">{{ copy.screen.query }}</span>
                          <span class="ac-scr__kbd">⌘K</span>
                        </div>
                        <div v-for="row in copy.screen.rows" :key="row.title" class="ac-scr__row">
                          <span class="ac-scr__glyph" />
                          <span class="ac-scr__title">{{ row.title }}</span>
                          <span class="ac-scr__tag">{{ row.tag }}</span>
                        </div>
                        <div class="ac-scr__row is-secret">
                          <span class="ac-scr__glyph is-lock">
                            <span class="i-carbon-locked" aria-hidden="true" />
                          </span>
                          <span class="ac-scr__title is-mono">sk-a1••••••••9f</span>
                          <span class="ac-scr__burn">
                            <span class="i-carbon-fire" aria-hidden="true" />
                            {{ copy.screen.burn }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <!-- Nothing to preview yet: a ghost of the window plus the
                         reason, so the frame never reads as a broken image. -->
                    <div v-else class="ac-scr is-waiting">
                      <div class="ac-scr__win is-ghost" aria-hidden="true">
                        <span class="ac-scr__ghost is-bar" />
                        <span v-for="n in 4" :key="n" class="ac-scr__ghost" />
                      </div>
                      <p class="ac-scr__hint" :class="{ 'is-gate': previewWaitsForGate }">
                        <span v-if="previewWaitsForGate" class="i-carbon-locked" aria-hidden="true" />
                        <span v-else-if="previewSkipped" class="i-carbon-document-tasks" aria-hidden="true" />
                        <span v-else class="i-carbon-time" aria-hidden="true" />
                        {{ previewHint }}
                      </p>
                    </div>
                  </TxAgentScreen>
                </section>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.ac {
  display: flex;
  height: 100%;
  background: var(--tx-bui-page, #fafafb);
  color: var(--tx-bui-ink, #1f2124);
  font-size: 13px;
}

/* --- agents column (≥ 1200) ------------------------------------------------ */

.ac-agents {
  display: flex;
  width: 220px;
  flex: none;
  flex-direction: column;
  background: var(--tx-bui-canvas, #f1f2f3);
  box-shadow: inset -1px 0 0 var(--tx-bui-line, #ecedef);
}

.ac-agents__title {
  display: flex;
  height: 52px;
  flex: none;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0 16px;
  box-shadow: inset 0 -1px 0 var(--tx-bui-line, #ecedef);
  color: var(--tx-bui-ink, #1f2124);
  font-size: 13px;
  font-weight: 600;
}

.ac-agents__count {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.ac-agents__list {
  min-height: 0;
  flex: 1;
  padding: 10px 8px;
}

/* --- header ---------------------------------------------------------------- */

.ac-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.ac-head {
  display: flex;
  height: 52px;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 14px;
  box-shadow: inset 0 -1px 0 var(--tx-bui-line, #ecedef);
}

.ac-head__orb {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 9px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.ac-head__who {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  line-height: 1.3;
}

.ac-head__name {
  font-size: 13px;
  font-weight: 600;
}

.ac-head__meta {
  overflow: hidden;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-head__status {
  display: flex;
  flex: none;
  align-items: center;
}

.ac-head__context {
  flex: none;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
}

/* --- columns --------------------------------------------------------------- */

.ac-cols {
  display: flex;
  min-height: 0;
  flex: 1;
}

/* No overflow clipping on this column: the prompt bar's @ and / menus open
   about 220px upward over the transcript. */
.ac-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.ac-stream {
  position: relative;
  min-height: 0;
  flex: 1;
}

/* The stream's pill defaults to --tx-fill-color-blank, which is transparent in
   dark mode and would sit see-through on top of the transcript. */
.ac-stream :deep(.tx-conversation-stream__pill) {
  background: var(--tx-bui-surface, #fff);
}

.ac-composer {
  flex: none;
  padding: 8px 16px 14px;
}

.ac-composer > * {
  max-width: 760px;
  margin-inline: auto;
}

/* --- transcript rows ------------------------------------------------------- */

.ac-item {
  padding: 7px 18px;
}

.ac-item.is-first {
  padding-top: 16px;
}

.ac-item.is-tail {
  height: 10px;
  padding: 0;
}

.ac-item__inner {
  max-width: 760px;
  margin: 0 auto;
}

.ac-user :deep(.tx-chat-message__bubble) {
  max-width: min(460px, 86%);
  flex: 0 1 auto;
  border-radius: 14px 4px 14px 14px;
}

.ac-user :deep(.tx-chat-message__plain) {
  font-size: 13px;
}

.ac-avatar {
  display: grid;
  width: 22px;
  height: 22px;
  flex: none;
  place-items: center;
  border-radius: 7px;
  font-size: 13px;
}

.ac-avatar.is-agent {
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
}

.ac-avatar.is-user {
  width: 100%;
  height: 100%;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 14px;
}

.ac-who {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.ac-who__name {
  font-size: 12.5px;
  font-weight: 600;
}

.ac-who__meta {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

/* Everything the agent does sits under its name, clear of the avatar. */
.ac-turn {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 30px;
}

.ac-say {
  margin: 0;
  color: var(--tx-bui-ink, #1f2124);
  font-size: 13px;
  line-height: 1.6;
}

.ac-say.is-reply {
  color: var(--tx-bui-ink-2, #62656b);
}

.ac-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
  line-height: 1.5;
}

.ac-hint.is-gate {
  color: var(--tx-bui-ink-2, #62656b);
}

.ac-hint__lock {
  flex: none;
  color: var(--tx-bui-orange, #ef720c);
}

.ac-decision {
  display: flex;
  flex-wrap: wrap;
  align-self: flex-start;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12.5px;
}

.ac-decision__note {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

.ac-decision__tool {
  color: var(--tx-bui-ink, #1f2124);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 12px;
}

.ac-code {
  border-radius: 12px;
}

.ac-code.is-flash :deep(.tx-bui-code-stream) {
  animation: ac-flash 1.1s ease-out;
}

.ac-md {
  color: var(--tx-bui-ink, #1f2124);
}

.ac-md :deep(.markdown-body) {
  font-size: 13px;
  line-height: 1.65;
}

.ac-md :deep(.markdown-body p),
.ac-md :deep(.markdown-body ul) {
  margin: 0 0 8px;
}

.ac-md :deep(.markdown-body ul) {
  padding-left: 1.3em;
}

.ac-md :deep(.markdown-body li + li) {
  margin-top: 2px;
}

.ac-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.ac-system {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

/* --- idle agent ------------------------------------------------------------ */

.ac-idle {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
  padding: 24px;
  overflow-y: auto;
}

.ac-idle__card {
  display: flex;
  width: min(360px, 100%);
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.ac-idle__icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 12px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef);
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 20px;
}

.ac-idle__name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.ac-idle__desc {
  margin: 0 0 10px;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 13px;
}

.ac-idle__label {
  margin: 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
  font-weight: 500;
}

.ac-idle__card :deep(.tx-suggestion-chips) {
  width: 100%;
}

.ac-idle__note {
  margin: 6px 0 0;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
}

/* --- narrow status strip --------------------------------------------------- */

.ac-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.ac-strip__panel {
  max-height: 188px;
  padding: 2px;
  overflow-y: auto;
}

.ac-strip__toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 0;
  border-radius: 10px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  color: var(--tx-bui-ink-2, #62656b);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: left;
}

.ac-strip__toggle:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.ac-strip__toggle:focus-visible {
  outline: 2px solid var(--tx-bui-accent, #0285ff);
  outline-offset: 2px;
}

.ac-strip__text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-strip__chevron {
  flex: none;
  transition: transform 0.2s ease;
}

.ac-strip__chevron.is-open {
  transform: rotate(180deg);
}

/* --- side panel ------------------------------------------------------------ */

.ac-side {
  display: flex;
  width: 272px;
  min-height: 0;
  flex: none;
  flex-direction: column;
  background: var(--tx-bui-canvas, #f1f2f3);
  box-shadow: inset 1px 0 0 var(--tx-bui-line, #ecedef);
}

.ac.is-wide .ac-side,
.ac.is-full .ac-side {
  width: 320px;
}

.ac-side__tabs {
  display: flex;
  padding: 12px 12px 4px;
}

.ac-side__tabs :deep(.tx-flat-radio) {
  width: 100%;
}

.ac-side__tabs :deep(.tx-flat-radio-item) {
  flex: 1 1 0;
  font-size: 12px;
}

.ac-side__scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  padding: 10px 12px 16px;
  overflow-y: auto;
}

.ac-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ac-panel__title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  padding: 0 2px;
  font-size: 12.5px;
  font-weight: 600;
}

.ac-panel__count {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.ac-panel__lead {
  margin: 0;
  padding: 0 2px;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
}

.ac-panel__hint {
  margin: 0;
  padding: 0 2px;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

.ac-panel__empty {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--tx-bui-line, #ecedef);
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
  line-height: 1.5;
}

.ac-panel__empty > span {
  flex: none;
  margin-top: 2px;
  font-size: 14px;
}

/* --- painted plugin preview ------------------------------------------------ */

.ac-screen :deep(.tx-bui-agent-screen__cursor) {
  transition:
    left 0.6s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    top 0.6s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.ac-screen :deep(.tx-bui-agent-screen__label) {
  font-size: 12px;
}

.ac-scr {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  background:
    radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--tx-bui-accent, #0285ff) 34%, transparent), transparent 55%),
    radial-gradient(circle at 88% 90%, color-mix(in srgb, var(--tx-bui-orange, #ef720c) 26%, transparent), transparent 50%),
    var(--tx-bui-canvas, #f1f2f3);
}

.ac-scr.is-waiting {
  position: relative;
}

.ac-scr__win {
  display: flex;
  width: 86%;
  flex-direction: column;
  gap: 3px;
  padding: 6px;
  border-radius: 8px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 2px 4px 10px #0000000b);
  font-size: 9px;
}

.ac-scr__win.is-ghost {
  gap: 6px;
  padding: 8px;
  background: color-mix(in srgb, var(--tx-bui-surface, #fff) 60%, transparent);
  box-shadow: inset 0 0 0 1px var(--tx-bui-line-strong, #e0e2e5);
}

.ac-scr__ghost {
  display: block;
  width: 78%;
  height: 8px;
  border-radius: 4px;
  background: var(--tx-bui-hover-2, #e7e9eb);
}

.ac-scr__ghost:nth-child(odd) {
  width: 62%;
}

.ac-scr__ghost.is-bar {
  width: 100%;
  height: 14px;
  background: var(--tx-bui-field, #f2f2f3);
}

.ac-scr__hint {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  width: max-content;
  max-width: 80%;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 2px 4px 10px #0000000b);
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
  line-height: 1.4;
  transform: translate(-50%, -50%);
}

.ac-scr__hint > span:first-child {
  flex: none;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.ac-scr__hint.is-gate > span:first-child {
  color: var(--tx-bui-orange, #ef720c);
}

.ac-scr__search {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  border-radius: 5px;
  background: var(--tx-bui-field, #f2f2f3);
  color: var(--tx-bui-ink-3, #9a9da3);
}

.ac-scr__query {
  flex: 1;
  color: var(--tx-bui-ink, #1f2124);
}

.ac-scr__kbd {
  font-size: 8px;
}

.ac-scr__row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 5px;
  border-radius: 5px;
  color: var(--tx-bui-ink-2, #62656b);
}

.ac-scr__row.is-secret {
  background: var(--tx-bui-orange-tint, #fdf1e5);
  color: var(--tx-bui-ink, #1f2124);
}

.ac-scr__glyph {
  display: grid;
  width: 11px;
  height: 11px;
  flex: none;
  place-items: center;
  border-radius: 3px;
  background: var(--tx-bui-hover-2, #e7e9eb);
}

.ac-scr__glyph.is-lock {
  background: transparent;
  color: var(--tx-bui-orange, #ef720c);
}

.ac-scr__title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-scr__title.is-mono {
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
}

.ac-scr__tag {
  flex: none;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 8px;
}

.ac-scr__burn {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  color: var(--tx-bui-orange, #ef720c);
  font-size: 8px;
  font-weight: 500;
}

/* --- container tiers ------------------------------------------------------- */

@container template (max-width: 639px) {
  .ac-head {
    gap: 8px;
    padding: 0 8px 0 10px;
  }

  .ac-item {
    padding: 6px 12px;
  }

  .ac-turn {
    padding-left: 0;
  }

  .ac-composer {
    padding: 6px 10px 10px;
  }
}

@container template (max-width: 479px) {
  .ac-head__meta,
  .ac-head__context {
    display: none;
  }
}

@container template (min-width: 1200px) {
  .ac-item {
    padding-inline: 28px;
  }
}

@keyframes ac-flash {
  from {
    box-shadow: 0 0 0 3px var(--tx-bui-accent, #0285ff);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ac-strip__chevron,
  .ac-screen :deep(.tx-bui-agent-screen__cursor) {
    transition: none;
  }

  .ac-code.is-flash :deep(.tx-bui-code-stream) {
    animation: none;
    box-shadow: 0 0 0 2px var(--tx-bui-accent, #0285ff);
  }
}
</style>
