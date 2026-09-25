<script setup lang="ts">
// Research template: a research copilot answers one engineering question end
// to end — a visible research process, a conclusion with numbered citations,
// a streamed comparison, insights, a recommendation and follow-ups — beside an
// evidence rail that the citations drive. The timeline is demo state; every
// tuffex component here is a controlled primitive.
//
// Two constraints shape the answer:
// - TxStreamMarkdown renders through v-html, so a citation component cannot
//   live inside it. The cited conclusion is a plain paragraph revealed token by
//   token with TxInlineCitation in between; the comparison streams as markdown
//   and carries no links, because a link in v-html would navigate the docs.
// - Nothing touches the docs page: citations scroll the rail's own scroller,
//   the answer column follows through useStickToBottom, and nothing calls
//   focus() or scrollIntoView().
import type { AiAttachment, AiChainStep, AiElementMessage, AiSourceItem, AiSuggestion } from '@talex-touch/tuffex/ai-elements'
import type { ContextChunk, ContextChunkOpenPayload } from '@talex-touch/tuffex/context-cards'
import type { InsightMetricTone, InsightPage } from '@talex-touch/tuffex/insight-cards'
import type { PromptBarCommand, PromptBarModel, PromptBarSendPayload, PromptBarSource } from '@talex-touch/tuffex/prompt-bar'
import type { RecommendationOption } from '@talex-touch/tuffex/recommendation-card'
import { useStickToBottom } from '@talex-touch/tuffex/conversation-stream'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide' | 'full'
type Phase = 'idle' | 'research' | 'answer' | 'table' | 'done'
type SourceId = 'vision' | 'winocr' | 'tesseract' | 'paddle' | 'native' | 'bench'
type RailTab = 'sources' | 'chunks' | 'notes'
type AnswerKey = 'vertical' | 'bundle' | 'steps' | 'latency' | 'generic'
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface Token {
  text: string
  cite?: SourceId
}

interface Target {
  kind: 'source' | 'chunk'
  index: number
}

/**
 * Tokens the answer renders as one unit. A citation run travels with the word
 * before it and the punctuation after it, so neither the chip nor a lone "。"
 * can wrap onto a line of its own.
 */
interface TokenCluster {
  glue: boolean
  first: number
  members: Array<{ token: Token, index: number }>
}

interface ThreadEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  answer: AnswerKey
  typing: boolean
  chars: number
}

interface Metric {
  label: string
  delta: string
  tone: InsightMetricTone
  detail: string
}

const SOURCE_IDS: SourceId[] = ['vision', 'winocr', 'tesseract', 'paddle', 'native', 'bench']

/** Which rail entry a citation jumps to: the retrieved chunk when there is one. */
const CHUNK_OF: Partial<Record<SourceId, number>> = { native: 0, winocr: 1, bench: 2 }

const STEP_MS = [900, 1500, 1200, 800]
const WORD_MS = 55
const STREAM_MS = 30
const TYPING_MS = 600
const STATUS_MS = 4500
// File chips only: an image attachment would open a teleported preview.
const ATTACH_FILES = ['ocr-sample-vertical.png', 'ocr-sample-small-type.png', 'benchmark-v2.csv']

// Favicons are painted data URIs: a docs page must not ping third-party sites.
function favicon(letter: string, fill: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='${fill}'/><text x='16' y='22' text-anchor='middle' font-family='Helvetica,Arial,sans-serif' font-size='17' font-weight='700' fill='#fff'>${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const SOURCE_META: Record<SourceId, { url: string, favicon: string }> = {
  vision: { url: 'https://developer.apple.com/documentation/vision/vnrecognizetextrequest', favicon: favicon('A', '#1d1d1f') },
  winocr: { url: 'https://learn.microsoft.com/uwp/api/windows.media.ocr', favicon: favicon('W', '#0067b8') },
  tesseract: { url: 'https://github.com/tesseract-ocr/tesseract', favicon: favicon('T', '#5b4bc4') },
  paddle: { url: 'https://github.com/PaddlePaddle/PaddleOCR', favicon: favicon('P', '#2932e1') },
  native: { url: 'https://tuff.tagzxia.com/docs/dev/native-ocr', favicon: favicon('N', '#1b8fd4') },
  bench: { url: 'https://tuff.tagzxia.com/docs/dev/ocr-samples', favicon: favicon('S', '#189a4d') },
}

const TRAILING_PUNCTUATION = /^[\s，。；：、！？,.;:!?）)」』”’]+$/

// Grouped over the whole answer, not the revealed part, so a token that
// arrives later lands inside a span that already exists instead of making the
// words before it remount (and replay their reveal).
function clusterTokens(tokens: Token[]): TokenCluster[] {
  const clusters: TokenCluster[] = []
  let index = 0
  while (index < tokens.length) {
    const start = index
    if (!tokens[index]?.cite && tokens[index + 1]?.cite)
      index += 1
    if (tokens[index]?.cite) {
      while (tokens[index]?.cite)
        index += 1
      while (tokens[index] && !tokens[index]?.cite && TRAILING_PUNCTUATION.test(tokens[index]?.text ?? ''))
        index += 1
    }
    else {
      index = start + 1
    }
    const members = tokens.slice(start, index).map((token, offset) => ({ token, index: start + offset }))
    clusters.push({ glue: members.length > 1, first: start, members })
  }
  return clusters
}

function tokenize(text: string, separator: string): Token[] {
  const spaced = separator === ' '
  return text.split(separator).filter(Boolean).map((part) => {
    const cite = /^\{(\w+)\}$/.exec(part)?.[1]
    if (cite && (SOURCE_IDS as string[]).includes(cite))
      return { text: '', cite: cite as SourceId }
    return { text: spaced ? `${part} ` : part }
  })
}

const zhCopy = {
  title: 'Research 研究助手',
  crumb: '研究',
  thread: 'OCR 引擎选型',
  rerun: '重新研究',
  question: 'Tuff 的截图 OCR 该选哪个本地引擎？对比 Apple Vision、Windows OCR、Tesseract 5 和 PaddleOCR 的中文识别、速度与体积。',
  questionMeta: '引用 6 个来源 · 数字均为示例数据',
  status: {
    idle: '就绪',
    research: '检索中',
    answer: '撰写中',
    table: '撰写中',
    replying: '回复中',
    done: (seconds: string) => `完成 · ${seconds}`,
    doneBare: '完成',
  },
  seconds: (value: number) => `${value.toFixed(1)} 秒`,
  cotLabel: '研究过程',
  steps: [
    { kind: 'tool', title: '检索资料', body: 'search · 本地 OCR 中文 对比 → 6 条结果\nread · tuff-native OCR 接入说明 ✓' },
    { kind: 'thinking', title: '阅读并提炼', body: '**关注点**：中文识别、首帧延迟、额外体积，以及能否完全离线。' },
    { kind: 'tool', title: '在样本集上跑基准', body: 'vision     ✓ 200/200\nwinocr     ✓ 200/200\ntesseract  ✓ 200/200\npaddle     ✓ 200/200' },
    { kind: 'thinking', title: '权衡取舍', body: 'Linux 没有系统 OCR，需要一个跨平台兜底；兜底引擎的模型不能打进安装包。' },
  ] as Array<{ kind: AiChainStep['kind'], title: string, body: string }>,
  answerLabel: '结论',
  answer: tokenize('在 macOS 与 Windows 上|优先用|系统自带的 OCR|{vision}|{winocr}|：|不增加安装体积，|首帧延迟最低，|截图|也不离开本机|{native}|。|Linux 和|竖排场景|用 PaddleOCR |兜底|{paddle}|；|Tesseract |只在|极简部署时|考虑|{tesseract}|。', '|'),
  tableLabel: '对比',
  sample: '示例数据',
  table: [
    '| 引擎 | 中文识别 | 首帧延迟 | 额外体积 | 平台 |',
    '| --- | --- | --- | --- | --- |',
    '| Apple Vision | 高 | 低 | 无 | macOS |',
    '| Windows OCR | 中 | 低 | 需语言包 | Windows |',
    '| Tesseract 5 | 中 | 中 | 语言数据 | 全平台 |',
    '| PaddleOCR | 高 | 中 | 模型文件 | 全平台 |',
    '',
    '- **竖排与小字号**：PaddleOCR 更稳',
    '- **离线与隐私**：四者都能在本机运行，截图无需上传',
  ].join('\n'),
  copyTable: '复制 CSV',
  copiedTable: '已复制',
  insightsLabel: '洞察与建议',
  followLabel: '追问',
  railSources: '来源',
  railChunks: '片段',
  sources: {
    vision: 'Apple Vision · VNRecognizeTextRequest',
    winocr: 'Windows.Media.Ocr',
    tesseract: 'Tesseract OCR',
    paddle: 'PaddleOCR',
    native: 'tuff-native OCR 接入说明',
    bench: '截图样本集 v2（示例）',
  } satisfies Record<SourceId, string>,
  sourcesLabel: (count: number) => `参考了 ${count} 个来源`,
  chunksTitle: '命中片段',
  relevance: (value: number) => `相关度 ${value}/3`,
  chunks: [
    {
      id: 'c1',
      title: '系统 OCR 走原生绑定',
      chars: '182 字',
      body: 'tuff-native 在 macOS 调用 Vision、在 Windows 调用 Windows.Media.Ocr，识别在本机完成，截图不上传。',
      source: { name: 'tuff-native OCR 接入说明.md', badge: 'MD', tone: 'accent', href: SOURCE_META.native.url },
    },
    {
      id: 'c2',
      title: '中文需要语言包',
      chars: '96 字',
      body: 'Windows OCR 只识别系统已安装的语言；没有中文语言包时，中文截图无法识别。',
      source: { name: 'Windows.Media.Ocr', badge: 'WEB', tone: 'neutral', href: SOURCE_META.winocr.url },
    },
    {
      id: 'c3',
      title: '样本集结果（示例）',
      chars: '1,240 字',
      body: '200 张界面截图：系统原生引擎的首帧最快；PaddleOCR 在竖排与小字号上更稳。',
      source: { name: '截图样本集 v2.csv', badge: 'CSV', tone: 'green', href: SOURCE_META.bench.url },
    },
  ] satisfies ContextChunk[],
  insightsTitle: '洞察',
  previousInsight: '上一条洞察',
  nextInsight: '下一条洞察',
  insights: [
    {
      key: 'accuracy',
      prose: '中文样本上，Apple Vision 与 PaddleOCR 识别最稳（示例数据）。',
      suggestion: '竖排文字谁更稳？',
      metrics: [
        { label: 'Apple Vision', delta: '高', tone: 'positive', detail: '横排中文' },
        { label: 'Tesseract 5', delta: '中', tone: 'neutral', detail: '需要调参' },
      ],
    },
    {
      key: 'latency',
      prose: '系统原生引擎的首帧最快，不用额外加载模型（示例数据）。',
      suggestion: '首帧为什么更快？',
      metrics: [
        { label: '系统 OCR', delta: '低', tone: 'positive', detail: '随系统常驻' },
        { label: 'PaddleOCR', delta: '中', tone: 'neutral', detail: '首次加载模型' },
      ],
    },
    {
      key: 'size',
      prose: '系统 OCR 不增加安装体积；PaddleOCR 要随插件分发模型文件（示例数据）。',
      suggestion: 'PaddleOCR 模型怎么分发？',
      metrics: [
        { label: '系统 OCR', delta: '+0 MB', tone: 'positive', detail: '无需额外文件' },
        { label: 'PaddleOCR', delta: '需下载', tone: 'negative', detail: '模型文件' },
      ],
    },
  ] as Array<InsightPage & { key: string, metrics: Metric[] }>,
  insightNote: '示例数据 · 截图样本集 v2',
  recTitle: '采用这套 OCR 方案？',
  rec: {
    alternativesLabel: '其他方案',
    otherOptionsLabel: '其他方案',
    acceptedLabel: '已写入笔记',
    acceptLabel: '采用',
  },
  options: [
    {
      key: 'hybrid',
      short: '系统原生优先，PaddleOCR 兜底',
      text: 'macOS 与 Windows 走 tuff-native 的系统 OCR；Linux 与竖排场景切到 PaddleOCR，模型在第一次用到时再下载。',
      confidence: 'high',
      label: '高置信',
      cta: '写入方案',
      ctaTone: 'accent',
    },
    {
      key: 'paddle',
      short: '全平台统一 PaddleOCR',
      text: '三个平台都用 PaddleOCR，识别结果一致，但安装包要带上模型文件。',
      confidence: 'medium',
      label: '需评估体积',
      cta: '写入方案',
      ctaTone: 'ink',
    },
    {
      key: 'cloud',
      short: '统一走云端 AI OCR',
      text: '识别交给云端模型，本机不装任何引擎，但每张截图都要上传。',
      confidence: 'low',
      label: '隐私风险',
      cta: '仍然采用',
      ctaTone: 'danger',
    },
  ] satisfies RecommendationOption[],
  notes: {
    hybrid: [
      '### OCR 方案 · 草案',
      '',
      '- **macOS / Windows**：走 tuff-native 的系统 OCR',
      '- **Linux 与竖排**：切到 PaddleOCR，模型首次使用时下载',
      '- **Tesseract**：不内置，留作极简部署的可选项',
      '- **下一步**：样本集补 20 张竖排截图，复测后定稿',
    ].join('\n'),
    paddle: [
      '### OCR 方案 · 草案',
      '',
      '- **全平台**：统一使用 PaddleOCR',
      '- **风险**：安装包需要带上模型文件',
      '- **下一步**：先测量模型体积，再决定是否按需下载',
    ].join('\n'),
    cloud: [
      '### OCR 方案 · 草案',
      '',
      '- **全平台**：统一走云端 AI OCR',
      '- **风险**：每张截图都要上传，需要用户明确同意',
      '- **下一步**：评估离线场景与费用',
    ].join('\n'),
  } as Record<string, string>,
  notesLabel: '笔记',
  notesEmpty: '采纳一条建议后，方案稿会出现在这里。',
  noteActions: { copyLabel: '复制', copiedLabel: '已复制', label: '笔记操作' },
  followUps: [
    { id: 'vertical', text: '竖排与繁体的识别表现如何？' },
    { id: 'bundle', text: 'PaddleOCR 模型怎么随插件分发？' },
    { id: 'steps', text: '接入 tuff-native 需要哪几步？' },
  ] satisfies AiSuggestion[],
  you: '你',
  assistant: '研究助手',
  reasoningLabel: '思考过程',
  thinkingLabel: '思考中…',
  thoughtFor: (ms: number) => `思考了 ${(ms / 1000).toFixed(1)} 秒`,
  typing: '正在整理…',
  answers: {
    vertical: {
      reasoning: '先把竖排和繁体分开看：竖排是版面问题，繁体是语言数据问题。',
      durationMs: 1400,
      text: [
        '这是两件事：',
        '',
        '- **竖排**：系统 OCR 对竖排的支持参差不齐；PaddleOCR 自带方向分类，更稳（示例结论）',
        '- **繁体**：四个引擎都能识别，前提是装了对应的语言数据',
        '',
        '建议在样本集里补 20 张竖排截图，再发一次 `/bench`。',
      ].join('\n'),
    },
    bundle: {
      reasoning: '模型文件不小，不适合打进安装包；按需下载要考虑校验和回退。',
      durationMs: 1200,
      text: [
        '不建议打进安装包：',
        '',
        '1. 第一次需要 Linux 兜底时再下载模型，存进插件的数据目录',
        '2. 下载前告知体积，允许取消',
        '3. 用哈希校验模型文件，失败时回退并告诉用户',
      ].join('\n'),
    },
    steps: {
      reasoning: '接入顺序：权限、识别、兜底、记录。',
      durationMs: 900,
      text: [
        '按这个顺序接：',
        '',
        '1. 在插件清单里声明需要的权限',
        '2. 通过宿主提供的 OCR 能力识别截图，插件不直接加载原生模块',
        '3. 结果为空或置信度低时，再切到兜底引擎',
        '4. 记下每次识别用的引擎和耗时，方便之后对比',
      ].join('\n'),
    },
    latency: {
      reasoning: '系统引擎常驻内存，调用时不用再读模型；自带模型要先加载。',
      durationMs: 1000,
      text: [
        '系统 OCR 由操作系统常驻加载，调用时不必再读模型；PaddleOCR 第一次识别要先把模型读进内存，之后才快起来（示例结论）。',
        '',
        '如果首帧很关键，可以在 CoreBox 启动后空闲时预热一次。',
      ].join('\n'),
    },
    generic: {
      reasoning: '这是脚本化的演示会话，只能给出预设回答。',
      durationMs: 600,
      text: '（演示）这是脚本化会话，追问只会得到预设回答。接入真实服务时，把发送事件接到你的研究接口即可。',
    },
  } satisfies Record<AnswerKey, { reasoning: string, durationMs: number, text: string }>,
  insightAnswer: { accuracy: 'vertical', latency: 'latency', size: 'bundle' } as Record<string, AnswerKey>,
  hostOpens: (url: string) => `宿主会打开：${url}`,
  attached: (names: string) => `附件：${names}`,
  noted: (short: string) => `已写入笔记：${short}`,
  railLabel: '证据',
  insightsRail: '洞察',
  prompt: {
    placeholder: '追问，或输入 @ 引用资料…',
    busy: '研究进行中，可以先写下追问…',
    sendLabel: '发送',
    attachLabel: '添加截图与资料',
    modelLabel: '选择模式',
    sourcesHintText: '输入以搜索资料与文件',
    commandsHintText: '输入以搜索命令',
    emptyText: (query: string) => `没有匹配「${query}」的项`,
    connectText: '连接',
    connectedText: '已连接',
    attachmentFallbackLabel: '附件',
    removeAttachmentLabel: (name: string) => `移除 ${name}`,
  },
  promptSources: [
    { key: 'attach', name: '添加截图', desc: '拖入或粘贴', attach: true },
    { key: 'docs', name: 'Tuff 文档', desc: 'tuff.tagzxia.com/docs' },
    { key: 'native', name: 'tuff-native 源码', desc: 'packages/tuff-native' },
    { key: 'bench', name: '截图样本集', desc: '200 张（示例）' },
    { key: 'web', name: '网页搜索', desc: '实时结果', connectable: true },
  ] satisfies PromptBarSource[],
  commands: [
    { key: 'compare', name: '/compare', desc: '对比两项' },
    { key: 'cite', name: '/cite', desc: '只给有引用的结论' },
    { key: 'bench', name: '/bench', desc: '在样本集上跑基准' },
    { key: 'note', name: '/note', desc: '存为笔记' },
  ] satisfies PromptBarCommand[],
  models: [
    { key: 'deep', name: '深度研究', tag: '较慢' },
    { key: 'quick', name: '快速回答', tag: '较快' },
  ] satisfies PromptBarModel[],
}

const enCopy: typeof zhCopy = {
  title: 'Research',
  crumb: 'Research',
  thread: 'Choosing an OCR engine',
  rerun: 'Research again',
  question: 'Which local OCR engine should power Tuff’s screenshot OCR? Compare Apple Vision, Windows OCR, Tesseract 5 and PaddleOCR on Chinese accuracy, speed and footprint.',
  questionMeta: '6 sources cited · all figures are sample data',
  status: {
    idle: 'Ready',
    research: 'Researching',
    answer: 'Writing',
    table: 'Writing',
    replying: 'Replying',
    done: (seconds: string) => `Done · ${seconds}`,
    doneBare: 'Done',
  },
  seconds: (value: number) => `${value.toFixed(1)}s`,
  cotLabel: 'Research process',
  steps: [
    { kind: 'tool', title: 'Gather sources', body: 'search · local OCR Chinese comparison → 6 results\nread · tuff-native OCR integration notes ✓' },
    { kind: 'thinking', title: 'Read and distill', body: '**What matters**: Chinese accuracy, first-frame latency, extra size, and whether it runs fully offline.' },
    { kind: 'tool', title: 'Benchmark the sample set', body: 'vision     ✓ 200/200\nwinocr     ✓ 200/200\ntesseract  ✓ 200/200\npaddle     ✓ 200/200' },
    { kind: 'thinking', title: 'Weigh the trade-offs', body: 'Linux has no system OCR, so a cross-platform fallback is needed, and its model cannot ship inside the installer.' },
  ],
  answerLabel: 'Conclusion',
  answer: tokenize('On macOS and Windows, use the built-in system OCR first. {vision} {winocr} It adds nothing to the install, starts fastest, and screenshots never leave the machine. {native} Fall back to PaddleOCR on Linux and for vertical text; {paddle} keep Tesseract for minimal deployments only. {tesseract}', ' '),
  tableLabel: 'Comparison',
  sample: 'Sample data',
  table: [
    '| Engine | Chinese | First frame | Extra size | Platforms |',
    '| --- | --- | --- | --- | --- |',
    '| Apple Vision | High | Low | None | macOS |',
    '| Windows OCR | Medium | Low | Language pack | Windows |',
    '| Tesseract 5 | Medium | Medium | Language data | All |',
    '| PaddleOCR | High | Medium | Model files | All |',
    '',
    '- **Vertical text and small type**: PaddleOCR holds up best',
    '- **Offline and privacy**: all four run on-device; screenshots never upload',
  ].join('\n'),
  copyTable: 'Copy CSV',
  copiedTable: 'Copied',
  insightsLabel: 'Insights and recommendation',
  followLabel: 'Follow-ups',
  railSources: 'Sources',
  railChunks: 'Chunks',
  sources: {
    vision: 'Apple Vision · VNRecognizeTextRequest',
    winocr: 'Windows.Media.Ocr',
    tesseract: 'Tesseract OCR',
    paddle: 'PaddleOCR',
    native: 'tuff-native OCR integration notes',
    bench: 'Screenshot sample set v2 (sample)',
  },
  sourcesLabel: (count: number) => `${count} sources`,
  chunksTitle: 'Matched chunks',
  relevance: (value: number) => `Relevance ${value} of 3`,
  chunks: [
    {
      id: 'c1',
      title: 'System OCR goes through native bindings',
      chars: '182 chars',
      body: 'tuff-native calls Vision on macOS and Windows.Media.Ocr on Windows. Recognition runs on the machine; screenshots are never uploaded.',
      source: { name: 'tuff-native OCR notes.md', badge: 'MD', tone: 'accent', href: SOURCE_META.native.url },
    },
    {
      id: 'c2',
      title: 'Chinese needs a language pack',
      chars: '96 chars',
      body: 'Windows OCR only reads languages installed on the system; without the Chinese pack, Chinese screenshots come back empty.',
      source: { name: 'Windows.Media.Ocr', badge: 'WEB', tone: 'neutral', href: SOURCE_META.winocr.url },
    },
    {
      id: 'c3',
      title: 'Sample set results (sample)',
      chars: '1,240 chars',
      body: '200 UI screenshots: the system engines are fastest to the first frame; PaddleOCR holds up best on vertical text and small type.',
      source: { name: 'ocr-samples-v2.csv', badge: 'CSV', tone: 'green', href: SOURCE_META.bench.url },
    },
  ],
  insightsTitle: 'Insights',
  previousInsight: 'Previous insight',
  nextInsight: 'Next insight',
  insights: [
    {
      key: 'accuracy',
      prose: 'On Chinese samples, Apple Vision and PaddleOCR are the most reliable (sample data).',
      suggestion: 'Which handles vertical text better?',
      metrics: [
        { label: 'Apple Vision', delta: 'High', tone: 'positive', detail: 'horizontal Chinese' },
        { label: 'Tesseract 5', delta: 'Medium', tone: 'neutral', detail: 'needs tuning' },
      ],
    },
    {
      key: 'latency',
      prose: 'The system engines reach the first frame fastest, with no model to load (sample data).',
      suggestion: 'Why is the first frame faster?',
      metrics: [
        { label: 'System OCR', delta: 'Low', tone: 'positive', detail: 'always loaded' },
        { label: 'PaddleOCR', delta: 'Medium', tone: 'neutral', detail: 'loads a model first' },
      ],
    },
    {
      key: 'size',
      prose: 'System OCR adds nothing to the install; PaddleOCR has to ship model files with the plugin (sample data).',
      suggestion: 'How do we ship the PaddleOCR model?',
      metrics: [
        { label: 'System OCR', delta: '+0 MB', tone: 'positive', detail: 'no extra files' },
        { label: 'PaddleOCR', delta: 'Download', tone: 'negative', detail: 'model files' },
      ],
    },
  ],
  insightNote: 'Sample data · screenshot sample set v2',
  recTitle: 'Adopt this OCR plan?',
  rec: {
    alternativesLabel: 'Alternatives',
    otherOptionsLabel: 'Other options',
    acceptedLabel: 'Saved to notes',
    acceptLabel: 'Adopt',
  },
  options: [
    {
      key: 'hybrid',
      short: 'System OCR first, PaddleOCR as fallback',
      text: 'macOS and Windows use the system OCR through tuff-native; Linux and vertical text switch to PaddleOCR, downloading its model on first use.',
      confidence: 'high',
      label: 'High confidence',
      cta: 'Save plan',
      ctaTone: 'accent',
    },
    {
      key: 'paddle',
      short: 'PaddleOCR everywhere',
      text: 'Use PaddleOCR on all three platforms for consistent results, at the cost of shipping model files.',
      confidence: 'medium',
      label: 'Check the size',
      cta: 'Save plan',
      ctaTone: 'ink',
    },
    {
      key: 'cloud',
      short: 'Cloud AI OCR everywhere',
      text: 'Send recognition to a cloud model. No engine on the machine, but every screenshot gets uploaded.',
      confidence: 'low',
      label: 'Privacy risk',
      cta: 'Adopt anyway',
      ctaTone: 'danger',
    },
  ],
  notes: {
    hybrid: [
      '### OCR plan · draft',
      '',
      '- **macOS / Windows**: system OCR through tuff-native',
      '- **Linux and vertical text**: PaddleOCR, model downloaded on first use',
      '- **Tesseract**: not bundled; optional for minimal deployments',
      '- **Next**: add 20 vertical screenshots to the sample set, re-run, then finalize',
    ].join('\n'),
    paddle: [
      '### OCR plan · draft',
      '',
      '- **All platforms**: PaddleOCR',
      '- **Risk**: the installer has to carry the model files',
      '- **Next**: measure the model size, then decide on download-on-demand',
    ].join('\n'),
    cloud: [
      '### OCR plan · draft',
      '',
      '- **All platforms**: cloud AI OCR',
      '- **Risk**: every screenshot is uploaded and needs explicit consent',
      '- **Next**: check the offline story and the cost',
    ].join('\n'),
  },
  notesLabel: 'Notes',
  notesEmpty: 'Adopt a recommendation and the plan draft lands here.',
  noteActions: { copyLabel: 'Copy', copiedLabel: 'Copied', label: 'Note actions' },
  followUps: [
    { id: 'vertical', text: 'How do vertical and Traditional Chinese text fare?' },
    { id: 'bundle', text: 'How should the PaddleOCR model ship with the plugin?' },
    { id: 'steps', text: 'What are the steps to integrate tuff-native?' },
  ],
  you: 'You',
  assistant: 'Research',
  reasoningLabel: 'Reasoning',
  thinkingLabel: 'Thinking…',
  thoughtFor: (ms: number) => `Thought for ${(ms / 1000).toFixed(1)}s`,
  typing: 'Working on it…',
  answers: {
    vertical: {
      reasoning: 'Split the two: vertical text is a layout problem, Traditional Chinese is a language-data problem.',
      durationMs: 1400,
      text: [
        'Those are two separate problems:',
        '',
        '- **Vertical text**: system OCR support is uneven; PaddleOCR ships a direction classifier and holds up better (sample finding)',
        '- **Traditional Chinese**: all four engines read it, provided the matching language data is installed',
        '',
        'Add 20 vertical screenshots to the sample set and send `/bench` again.',
      ].join('\n'),
    },
    bundle: {
      reasoning: 'The model is too large for the installer; downloading on demand needs verification and a fallback.',
      durationMs: 1200,
      text: [
        'Keep it out of the installer:',
        '',
        '1. Download the model the first time the Linux fallback is needed, into the plugin’s data directory',
        '2. Show the size before downloading and let people cancel',
        '3. Verify the file by hash; on failure, fall back and tell the user',
      ].join('\n'),
    },
    steps: {
      reasoning: 'Order: permissions, recognition, fallback, logging.',
      durationMs: 900,
      text: [
        'In this order:',
        '',
        '1. Declare the permissions the plugin needs in its manifest',
        '2. Recognize screenshots through the OCR capability the host provides; the plugin never loads the native module itself',
        '3. When the result is empty or low-confidence, switch to the fallback engine',
        '4. Log the engine and duration of each run so you can compare later',
      ].join('\n'),
    },
    latency: {
      reasoning: 'System engines stay resident, so a call never waits on a model; a bundled model loads first.',
      durationMs: 1000,
      text: [
        'System OCR is kept loaded by the OS, so a call never waits on a model; PaddleOCR reads its model into memory on the first run and is fast after that (sample finding).',
        '',
        'If the first frame matters, warm it up once while CoreBox sits idle after launch.',
      ].join('\n'),
    },
    generic: {
      reasoning: 'This is a scripted demo session; it can only give canned answers.',
      durationMs: 600,
      text: '(Demo) This is a scripted session, so follow-ups get canned answers. With a real service, wire the send event to your research endpoint.',
    },
  },
  insightAnswer: { accuracy: 'vertical', latency: 'latency', size: 'bundle' },
  hostOpens: (url: string) => `The host would open ${url}`,
  attached: (names: string) => `Attached: ${names}`,
  noted: (short: string) => `Saved to notes: ${short}`,
  railLabel: 'Evidence',
  insightsRail: 'Insights',
  prompt: {
    placeholder: 'Ask a follow-up, or type @ to cite a source…',
    busy: 'Research in progress. You can draft a follow-up…',
    sendLabel: 'Send',
    attachLabel: 'Add screenshots and sources',
    modelLabel: 'Choose mode',
    sourcesHintText: 'Type to search sources & files',
    commandsHintText: 'Type to search commands',
    emptyText: (query: string) => `No matches for “${query}”`,
    connectText: 'Connect',
    connectedText: 'Connected',
    attachmentFallbackLabel: 'Attachment',
    removeAttachmentLabel: (name: string) => `Remove ${name}`,
  },
  promptSources: [
    { key: 'attach', name: 'Add screenshots', desc: 'Drop or paste', attach: true },
    { key: 'docs', name: 'Tuff docs', desc: 'tuff.tagzxia.com/docs' },
    { key: 'native', name: 'tuff-native source', desc: 'packages/tuff-native' },
    { key: 'bench', name: 'Screenshot samples', desc: '200 images (sample)' },
    { key: 'web', name: 'Web search', desc: 'Live results', connectable: true },
  ],
  commands: [
    { key: 'compare', name: '/compare', desc: 'Compare two options' },
    { key: 'cite', name: '/cite', desc: 'Only cited conclusions' },
    { key: 'bench', name: '/bench', desc: 'Benchmark the sample set' },
    { key: 'note', name: '/note', desc: 'Save as a note' },
  ],
  models: [
    { key: 'deep', name: 'Deep research', tag: 'Slower' },
    { key: 'quick', name: 'Quick answer', tag: 'Faster' },
  ],
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const copy = computed(() => (zh.value ? zhCopy : enCopy))

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

function initialState() {
  return {
    phase: 'idle' as Phase,
    startedAt: 0,
    finishedAt: 0,
    /** Index of the live research step; 4 once all of them settled. */
    stepIndex: -1,
    stepProgress: [0, 0, 0, 0],
    cotOpen: undefined as boolean | undefined,
    sourcesReady: false,
    chunksReady: false,
    tokens: 0,
    tableChars: 0,
    insightsReady: false,
    insightIndex: 0,
    recKey: 'hybrid',
    recOpen: false,
    recAccepted: false,
    notesKey: null as string | null,
    railTab: 'sources' as RailTab,
    highlight: null as Target | null,
    flash: 0,
    thread: [] as ThreadEntry[],
    status: null as string | null,
  }
}

const state = reactive(initialState())
const generation = ref(0)
const reduced = ref(false)
const draft = ref('')
const attachments = ref<AiAttachment[]>([])
const model = ref('deep')
const webConnected = ref(true)
const railRef = ref<HTMLElement | null>(null)
const mainScrollRef = ref<HTMLElement | null>(null)
const mainContentRef = ref<HTMLElement | null>(null)

const stick = useStickToBottom(mainScrollRef)

let entered = false
let followUps = 0
let timers: ReturnType<typeof setTimeout>[] = []
let statusTimer: ReturnType<typeof setTimeout> | undefined
let revealFrame = 0
let contentObserver: ResizeObserver | null = null
// Following is switched off until something streams: a reader with reduced
// motion lands on the finished answer from the top, not scrolled to its end.
let followEnabled = false

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

// ---------------------------------------------------------------------------
// Derived content
// ---------------------------------------------------------------------------

const sources = computed<AiSourceItem[]>(() =>
  SOURCE_IDS.map(id => ({ id, url: SOURCE_META[id].url, title: copy.value.sources[id], favicon: SOURCE_META[id].favicon })),
)

function sourceOf(id: SourceId): AiSourceItem {
  return sources.value[SOURCE_IDS.indexOf(id)] ?? { id, url: SOURCE_META[id].url }
}

const steps = computed<AiChainStep[]>(() =>
  copy.value.steps.slice(0, Math.max(0, state.stepIndex + 1)).map((step, index) => {
    const done = index < state.stepIndex
    let body = step.body
    if (!done) {
      const progress = state.stepProgress[index] ?? 0
      body = step.kind === 'tool'
        ? step.body.split('\n').slice(0, progress).join('\n')
        : step.body.slice(0, progress)
    }
    return {
      id: `step-${index}`,
      kind: step.kind,
      title: step.title,
      body,
      status: done ? 'done' : 'active',
      durationMs: STEP_MS[index],
    }
  }),
)

const answerTokens = computed(() => copy.value.answer)
const answerClusters = computed(() => clusterTokens(answerTokens.value))
const answerDone = computed(() => state.tokens >= answerTokens.value.length)
const tableShown = computed(() => copy.value.table.slice(0, state.tableChars))

const chunks = computed<ContextChunk[]>(() => copy.value.chunks)
const RELEVANCE = [3, 2, 3]

const insightPages = computed<InsightPage[]>(() =>
  copy.value.insights.map(page => ({ key: page.key, prose: page.prose, suggestion: page.suggestion })),
)

function metricsOf(key: string): Metric[] {
  return copy.value.insights.find(page => page.key === key)?.metrics ?? []
}

const options = computed<RecommendationOption[]>(() => copy.value.options)
const notesText = computed(() => (state.notesKey ? copy.value.notes[state.notesKey] ?? '' : ''))

const promptSources = computed<PromptBarSource[]>(() =>
  copy.value.promptSources.map(source => (source.key === 'web' ? { ...source, connected: webConnected.value } : source)),
)

const modelName = computed(() => copy.value.models.find(entry => entry.key === model.value)?.name ?? '')

const threadMessages = computed<AiElementMessage[]>(() =>
  state.thread.map(entry => ({
    id: entry.id,
    role: entry.role,
    // Never empty: TxAiConversation drops messages without content, and the
    // body is rendered through the default slot anyway.
    content: entry.role === 'user' ? entry.text : '…',
    name: entry.role === 'user' ? copy.value.you : copy.value.assistant,
  })),
)

function entryOf(id: string): ThreadEntry | undefined {
  return state.thread.find(entry => entry.id === id)
}

function answerOf(entry: ThreadEntry) {
  return copy.value.answers[entry.answer]
}

function isStreaming(entry: ThreadEntry): boolean {
  return entry.role === 'assistant' && (entry.typing || entry.chars < answerOf(entry).text.length)
}

/** Everything the thread's default slot shows for one message. */
function replyView(id: string) {
  const entry = entryOf(id)
  if (!entry)
    return null
  const answer = answerOf(entry)
  return {
    user: entry.role === 'user',
    question: entry.text,
    typing: entry.typing,
    reasoning: answer.reasoning,
    durationMs: answer.durationMs,
    text: answer.text.slice(0, entry.chars),
    streaming: entry.chars < answer.text.length,
  }
}

const busy = computed(() => state.phase !== 'done' || state.thread.some(isStreaming))

const headStatus = computed<{ working: boolean, text: string, status: BadgeTone }>(() => {
  const status = copy.value.status
  if (state.phase === 'research')
    return { working: true, text: status.research, status: 'info' }
  if (state.phase === 'answer' || state.phase === 'table')
    return { working: true, text: status.answer, status: 'info' }
  if (state.thread.some(isStreaming) && !reduced.value)
    return { working: true, text: status.replying, status: 'info' }
  if (state.phase === 'done') {
    // Reduced motion settles instantly; "done in 0.0s" would be noise.
    const elapsed = state.finishedAt - state.startedAt
    return { working: false, text: elapsed > 0 ? status.done(copy.value.seconds(elapsed / 1000)) : status.doneBare, status: 'success' }
  }
  return { working: false, text: status.idle, status: 'muted' }
})

const highlightSource = computed(() => (state.highlight?.kind === 'source' ? state.highlight.index + 1 : undefined))
const highlightChunk = computed(() => (state.highlight?.kind === 'chunk' ? state.highlight.index + 1 : undefined))

const tabsAnimation = computed(() =>
  reduced.value ? { size: false, nav: false, indicator: false, content: false } : undefined,
)

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
    settleAll()
    return
  }
  followEnabled = true
  state.phase = 'research'
  runStep(0)
  later(900, () => {
    state.sourcesReady = true
  })
  later(1600, () => {
    state.chunksReady = true
  })
}

function runStep(index: number): void {
  const step = copy.value.steps[index]
  const duration = STEP_MS[index] ?? 900
  if (!step)
    return
  state.stepIndex = index
  if (step.kind === 'tool') {
    const lines = step.body.split('\n').length
    const gap = Math.max(120, Math.floor((duration - 250) / lines))
    state.stepProgress[index] = 1
    every(gap, () => {
      state.stepProgress[index] = (state.stepProgress[index] ?? 0) + 1
      return (state.stepProgress[index] ?? 0) < lines
    })
  }
  else {
    const perTick = Math.max(1, Math.ceil(step.body.length / ((duration - 250) / 40)))
    every(40, () => {
      state.stepProgress[index] = Math.min(step.body.length, (state.stepProgress[index] ?? 0) + perTick)
      return (state.stepProgress[index] ?? 0) < step.body.length
    })
  }
  later(duration, () => {
    if (index < copy.value.steps.length - 1)
      runStep(index + 1)
    else
      beginAnswer()
  })
}

function beginAnswer(): void {
  // Settling every step flips the chain out of streaming, and with
  // `default-open` off it folds itself away above the answer.
  state.stepIndex = copy.value.steps.length
  state.phase = 'answer'
  every(WORD_MS, () => {
    const token = answerTokens.value[state.tokens]
    state.tokens += 1
    if (token?.cite)
      state.flash = SOURCE_IDS.indexOf(token.cite) + 1
    if (state.tokens < answerTokens.value.length)
      return true
    later(300, beginTable)
    return false
  })
}

function beginTable(): void {
  state.phase = 'table'
  state.flash = 0
  const step = zh.value ? 4 : 6
  every(STREAM_MS, () => {
    state.tableChars = Math.min(copy.value.table.length, state.tableChars + step)
    if (state.tableChars < copy.value.table.length)
      return true
    later(350, finishResearch)
    return false
  })
}

function finishResearch(): void {
  state.insightsReady = true
  state.phase = 'done'
  state.finishedAt = Date.now()
}

function settleAll(): void {
  state.stepIndex = copy.value.steps.length
  state.stepProgress = copy.value.steps.map(step => step.body.length)
  state.sourcesReady = true
  state.chunksReady = true
  state.tokens = answerTokens.value.length
  state.tableChars = copy.value.table.length
  state.insightsReady = true
  state.phase = 'done'
  state.finishedAt = state.startedAt
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

function ask(text: string, answer: AnswerKey): void {
  if (busy.value)
    return
  followUps += 1
  const userId = `q-${followUps}`
  const replyId = `a-${followUps}`
  const full = copy.value.answers[answer].text.length
  state.thread.push(
    { id: userId, role: 'user', text, answer, typing: false, chars: 0 },
    { id: replyId, role: 'assistant', text: '', answer, typing: !reduced.value, chars: reduced.value ? full : 0 },
  )
  // The reader asked, so bring the new turn into view — inside the answer
  // column's own scroller, never the page.
  followEnabled = true
  stick.scrollToBottom(reduced.value ? 'auto' : 'smooth')
  if (reduced.value)
    return
  later(TYPING_MS, () => {
    const entry = entryOf(replyId)
    if (!entry)
      return
    entry.typing = false
    const step = zh.value ? 2 : 4
    every(STREAM_MS, () => {
      entry.chars = Math.min(full, entry.chars + step)
      return entry.chars < full
    })
  })
}

function onSuggestion(suggestion: AiSuggestion): void {
  const key = (['vertical', 'bundle', 'steps'] as AnswerKey[]).find(value => value === suggestion.id) ?? 'generic'
  ask(suggestion.text, key)
}

function onInsightFollowUp(page: InsightPage): void {
  ask(page.suggestion ?? '', copy.value.insightAnswer[page.key] ?? 'generic')
}

function onAttach(): void {
  const name = ATTACH_FILES[attachments.value.length % ATTACH_FILES.length] ?? 'sample.png'
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
  ask(text, 'generic')
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

function showStatus(text: string): void {
  state.status = text
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    state.status = null
  }, STATUS_MS)
}

function onOpenSource(source: AiSourceItem): void {
  showStatus(copy.value.hostOpens(source.url))
}

function onOpenChunk(payload: ContextChunkOpenPayload): void {
  showStatus(copy.value.hostOpens(payload.source.href ?? payload.source.name))
}

/** Scrolls the rail's own scroller to an entry; the docs page never moves. */
function revealInRail(target: Target): void {
  const rail = railRef.value
  if (!rail)
    return
  const selector = target.kind === 'source' ? '.tx-sources__item' : '.tx-bui-context-chunk'
  const element = rail.querySelectorAll<HTMLElement>(selector)[target.index]
  const scroller = element?.closest<HTMLElement>('.tx-tabs__content-scroll, .rs-evidence__scroll')
  if (!element || !scroller)
    return
  const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12
  scroller.scrollTo({ top: Math.max(0, top), behavior: reduced.value ? 'auto' : 'smooth' })
}

function onCite(source: AiSourceItem, width: number): void {
  const id = source.id as SourceId
  const layout = layoutOf(width)
  if (layout === 'narrow') {
    showStatus(copy.value.hostOpens(source.url))
    return
  }
  const chunk = CHUNK_OF[id]
  const target: Target = chunk !== undefined && state.chunksReady
    ? { kind: 'chunk', index: chunk }
    : { kind: 'source', index: SOURCE_IDS.indexOf(id) }
  if (layout !== 'full')
    state.railTab = target.kind === 'chunk' ? 'chunks' : 'sources'
  state.highlight = target
  // The tab panel re-renders on the switch; measure after it has laid out.
  void nextTick(() => {
    if (!hasWindow())
      return
    window.cancelAnimationFrame(revealFrame)
    revealFrame = window.requestAnimationFrame(() => revealInRail(target))
  })
}

function onAccept(option: RecommendationOption, width: number): void {
  state.notesKey = option.key
  showStatus(copy.value.noted(option.short))
  const layout = layoutOf(width)
  if (layout === 'column' || layout === 'wide') {
    state.railTab = 'notes'
    return
  }
  if (layout === 'full') {
    void nextTick(() => {
      const scroller = railRef.value?.querySelector<HTMLElement>('.rs-evidence__scroll')
      scroller?.scrollTo({ top: 0, behavior: reduced.value ? 'auto' : 'smooth' })
    })
  }
}

// ---------------------------------------------------------------------------
// Answer-column follow
// ---------------------------------------------------------------------------

// The content element is recreated with the generation key; keep observing the
// current one.
watch(mainContentRef, (next, previous) => {
  if (previous)
    contentObserver?.unobserve(previous)
  if (next)
    contentObserver?.observe(next)
}, { flush: 'post' })

onMounted(() => {
  if (!hasWindow() || !('ResizeObserver' in window))
    return
  contentObserver = new ResizeObserver(() => {
    if (!followEnabled || reduced.value)
      return
    stick.followIfSticking(busy.value ? 220 : 0)
  })
  if (mainContentRef.value)
    contentObserver.observe(mainContentRef.value)
})

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function resetDemo(): void {
  clearTimers()
  clearTimeout(statusTimer)
  if (revealFrame)
    window.cancelAnimationFrame(revealFrame)
  Object.assign(state, initialState())
  draft.value = ''
  attachments.value = []
  followUps = 0
  followEnabled = false
  // Rebuilds everything that reads `default*` props once or only animates on
  // mount: the chain, the sources, the context cards.
  generation.value += 1
  void nextTick(() => {
    mainScrollRef.value?.scrollTo({ top: 0 })
    if (entered)
      start()
  })
}

watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearTimers()
  clearTimeout(statusTimer)
  if (revealFrame)
    window.cancelAnimationFrame(revealFrame)
  contentObserver?.disconnect()
  contentObserver = null
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="560" @enter="onEnter">
    <template #default="{ width }">
      <div class="rs" :class="`is-${layoutOf(width)}`">
        <header class="rs-head">
          <span class="rs-head__icon" aria-hidden="true">
            <span class="i-carbon-microscope" />
          </span>
          <div class="rs-head__title">
            <span class="rs-head__crumb">
              {{ copy.crumb }}
              <span class="rs-head__sep i-carbon-chevron-right" aria-hidden="true" />
              <span class="rs-head__thread">{{ copy.thread }}</span>
            </span>
            <span class="rs-head__meta">{{ modelName }}</span>
          </div>
          <div class="rs-head__status">
            <TxWorkingIndicator
              v-if="headStatus.working"
              variant="orbit"
              :label="headStatus.text"
              :started-at="state.startedAt"
            />
            <TxStatusBadge v-else :text="headStatus.text" :status="headStatus.status" size="sm" />
          </div>
          <TxIconButton icon="i-carbon-renew" size="sm" :label="copy.rerun" @click="resetDemo" />
        </header>

        <div class="rs-cols">
          <section class="rs-main">
            <div
              ref="mainScrollRef"
              class="rs-main__scroll"
              @scroll.passive="stick.handleScroll"
              @wheel.passive="stick.handleWheel"
            >
              <div :key="generation" ref="mainContentRef" class="rs-main__content">
                <div class="rs-q">
                  <p class="rs-q__text">
                    {{ copy.question }}
                  </p>
                  <p class="rs-q__meta">
                    {{ copy.questionMeta }}
                  </p>
                </div>

                <TxChainOfThought
                  v-if="steps.length > 0"
                  class="rs-cot"
                  :steps="steps"
                  :streaming="state.phase === 'research'"
                  :default-open="false"
                  :label="copy.cotLabel"
                  :user-open="state.cotOpen"
                  @toggle="state.cotOpen = $event"
                />

                <section v-if="state.tokens > 0" class="rs-sec">
                  <p class="rs-sec__label">
                    {{ copy.answerLabel }}
                  </p>
                  <p class="rs-answer">
                    <template v-for="cluster in answerClusters" :key="cluster.first">
                      <span v-if="cluster.first < state.tokens" :class="{ 'rs-answer__glue': cluster.glue }">
                        <template v-for="member in cluster.members" :key="member.index">
                          <template v-if="member.index < state.tokens">
                            <TxInlineCitation
                              v-if="member.token.cite"
                              :source="sourceOf(member.token.cite)"
                              :label="String(SOURCE_IDS.indexOf(member.token.cite) + 1)"
                              :appear="!reduced"
                              @open="onCite($event, width)"
                            />
                            <span v-else class="rs-answer__word">{{ member.token.text }}</span>
                          </template>
                        </template>
                      </span>
                    </template>
                    <span v-if="!answerDone" class="rs-answer__caret" aria-hidden="true" />
                  </p>
                  <TxSources
                    v-if="layoutOf(width) === 'narrow' && answerDone"
                    class="rs-stack"
                    :sources="sources"
                    variant="stack"
                    :label-formatter="copy.sourcesLabel"
                    @open="onOpenSource"
                  />
                </section>

                <section v-if="state.tableChars > 0" class="rs-sec">
                  <p class="rs-sec__label">
                    {{ copy.tableLabel }}
                    <span class="rs-sample">{{ copy.sample }}</span>
                    <TxInlineCitation
                      :source="sourceOf('bench')"
                      label="6"
                      :appear="!reduced"
                      @open="onCite($event, width)"
                    />
                  </p>
                  <TxStreamMarkdown
                    class="rs-md"
                    :content="tableShown"
                    :streaming="state.phase === 'table'"
                    :copy-table-text="copy.copyTable"
                    :copied-table-text="copy.copiedTable"
                  />
                </section>

                <template v-if="state.insightsReady && layoutOf(width) !== 'full'">
                  <section class="rs-sec">
                    <p class="rs-sec__label">
                      {{ copy.insightsLabel }}
                    </p>
                    <div class="rs-insights">
                      <TxInsightCards
                        v-model:active-index="state.insightIndex"
                        :pages="insightPages"
                        :title="copy.insightsTitle"
                        :previous-label="copy.previousInsight"
                        :next-label="copy.nextInsight"
                        @follow-up="onInsightFollowUp"
                      >
                        <template #default="{ page }">
                          <div class="rs-metrics">
                            <TxInsightMetric
                              v-for="metric in metricsOf(page.key)"
                              :key="metric.label"
                              :label="metric.label"
                              :delta="metric.delta"
                              :tone="metric.tone"
                              :detail="metric.detail"
                            />
                          </div>
                          <p class="rs-metrics__note">
                            {{ copy.insightNote }}
                          </p>
                        </template>
                      </TxInsightCards>
                      <TxRecommendationCard
                        v-model="state.recKey"
                        v-model:open="state.recOpen"
                        v-model:accepted="state.recAccepted"
                        :title="copy.recTitle"
                        :options="options"
                        v-bind="copy.rec"
                        @accept="onAccept($event, width)"
                      />
                    </div>
                  </section>

                  <section v-if="layoutOf(width) === 'narrow' && notesText" class="rs-sec">
                    <p class="rs-sec__label">
                      {{ copy.notesLabel }}
                    </p>
                    <div class="rs-note">
                      <TxMarkdownView class="rs-md" :content="notesText" />
                      <TxMessageActions :copy-text="notesText" :appear="!reduced" v-bind="copy.noteActions" />
                    </div>
                  </section>

                  <section class="rs-sec">
                    <p class="rs-sec__label">
                      {{ copy.followLabel }}
                    </p>
                    <TxSuggestionChips
                      :suggestions="copy.followUps"
                      layout="list"
                      @select="onSuggestion"
                    />
                  </section>
                </template>

                <section v-if="state.thread.length > 0" class="rs-sec rs-thread">
                  <TxAiConversation :messages="threadMessages" :markdown="false">
                    <template #default="{ message }">
                      <p v-if="replyView(message.id)?.user" class="rs-thread__q">
                        {{ replyView(message.id)?.question }}
                      </p>
                      <TxTypingIndicator v-else-if="replyView(message.id)?.typing" :text="copy.typing" />
                      <div v-else class="rs-thread__a">
                        <TxReasoningDisclosure
                          :text="replyView(message.id)?.reasoning"
                          :duration-ms="replyView(message.id)?.durationMs"
                          :label="copy.reasoningLabel"
                          :thinking-label="copy.thinkingLabel"
                          :duration-formatter="copy.thoughtFor"
                        />
                        <TxStreamMarkdown
                          class="rs-md"
                          :content="replyView(message.id)?.text ?? ''"
                          :streaming="replyView(message.id)?.streaming"
                          :copy-table-text="copy.copyTable"
                          :copied-table-text="copy.copiedTable"
                        />
                      </div>
                    </template>
                  </TxAiConversation>
                </section>
              </div>
            </div>

            <div class="rs-composer">
              <p class="rs-status" role="status">
                <template v-if="state.status">
                  <span class="rs-status__icon i-carbon-launch" aria-hidden="true" />
                  <span class="rs-status__text">{{ state.status }}</span>
                </template>
              </p>
              <TxPromptBar
                v-model="draft"
                v-model:model="model"
                :sources="promptSources"
                :commands="copy.commands"
                :models="copy.models"
                :attachments="attachments"
                :submitting="busy"
                :placeholder="busy && state.phase !== 'idle' ? copy.prompt.busy : copy.prompt.placeholder"
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
                @connect-toggle="webConnected = !webConnected"
                @attach="onAttach"
                @attachment-remove="onAttachmentRemove"
                @send="onSend"
              />
            </div>
          </section>

          <!-- Column and wide: one rail, tabbed. -->
          <aside
            v-if="layoutOf(width) === 'column' || layoutOf(width) === 'wide'"
            ref="railRef"
            class="rs-rail"
            :aria-label="copy.railLabel"
            :data-hl-source="highlightSource"
            :data-hl-chunk="highlightChunk"
            :data-flash="state.flash || undefined"
          >
            <TxTabs
              :key="generation"
              v-model="state.railTab"
              placement="top"
              borderless
              :content-padding="0"
              :animation="tabsAnimation"
            >
              <TxTabItem name="sources">
                <template #name>
                  {{ copy.railSources }}
                  <span class="rs-count">{{ state.sourcesReady ? SOURCE_IDS.length : '…' }}</span>
                </template>
                <template #default>
                  <div class="rs-pane">
                    <TxSources
                      v-if="state.sourcesReady"
                      :sources="sources"
                      default-open
                      :label-formatter="copy.sourcesLabel"
                      @open="onOpenSource"
                    />
                    <div v-else class="rs-skeleton" aria-hidden="true">
                      <TxSkeleton :width="120" :height="12" />
                      <TxSkeleton v-for="n in 4" :key="n" :height="32" :radius="10" />
                    </div>
                  </div>
                </template>
              </TxTabItem>
              <TxTabItem name="chunks">
                <template #name>
                  {{ copy.railChunks }}
                  <span class="rs-count">{{ state.chunksReady ? chunks.length : '…' }}</span>
                </template>
                <template #default>
                  <div class="rs-pane">
                    <TxContextCards
                      v-if="state.chunksReady"
                      class="rs-chunks"
                      :chunks="chunks"
                      :title="copy.chunksTitle"
                      :total="32"
                      :appear="!reduced"
                      @open="onOpenChunk"
                    >
                      <template #chunk-title="{ chunk }">
                        <span class="rs-chunk-title">
                          <span class="rs-chunk-title__text">{{ chunk.title }}</span>
                          <TxSignalMeter
                            :value="RELEVANCE[chunks.indexOf(chunk)] ?? 1"
                            tone="var(--tx-bui-accent, #0285ff)"
                            :label="copy.relevance(RELEVANCE[chunks.indexOf(chunk)] ?? 1)"
                          />
                        </span>
                      </template>
                    </TxContextCards>
                    <div v-else class="rs-skeleton" aria-hidden="true">
                      <TxSkeleton v-for="n in 3" :key="n" :height="96" :radius="10" />
                    </div>
                  </div>
                </template>
              </TxTabItem>
              <TxTabItem name="notes">
                <template #name>
                  {{ copy.notesLabel }}
                </template>
                <template #default>
                  <div class="rs-pane">
                    <div v-if="notesText" class="rs-note">
                      <TxMarkdownView class="rs-md" :content="notesText" />
                      <TxMessageActions :copy-text="notesText" :appear="!reduced" v-bind="copy.noteActions" />
                    </div>
                    <p v-else class="rs-empty">
                      <span class="i-carbon-notebook" aria-hidden="true" />
                      {{ copy.notesEmpty }}
                    </p>
                  </div>
                </template>
              </TxTabItem>
            </TxTabs>
          </aside>

          <!-- Full width: evidence and insights get columns of their own. -->
          <template v-if="layoutOf(width) === 'full'">
            <aside
              ref="railRef"
              class="rs-rail rs-evidence"
              :aria-label="copy.railLabel"
              :data-hl-source="highlightSource"
              :data-hl-chunk="highlightChunk"
              :data-flash="state.flash || undefined"
            >
              <div :key="generation" class="rs-evidence__scroll">
                <section v-if="notesText" class="rs-block">
                  <p class="rs-block__title">
                    {{ copy.notesLabel }}
                  </p>
                  <div class="rs-note">
                    <TxMarkdownView class="rs-md" :content="notesText" />
                    <TxMessageActions :copy-text="notesText" :appear="!reduced" v-bind="copy.noteActions" />
                  </div>
                </section>
                <section class="rs-block">
                  <p class="rs-block__title">
                    {{ copy.railSources }}
                  </p>
                  <TxSources
                    v-if="state.sourcesReady"
                    :sources="sources"
                    default-open
                    :label-formatter="copy.sourcesLabel"
                    @open="onOpenSource"
                  />
                  <div v-else class="rs-skeleton" aria-hidden="true">
                    <TxSkeleton v-for="n in 4" :key="n" :height="32" :radius="10" />
                  </div>
                </section>
                <section class="rs-block">
                  <TxContextCards
                    v-if="state.chunksReady"
                    class="rs-chunks"
                    :chunks="chunks"
                    :title="copy.chunksTitle"
                    :total="32"
                    :appear="!reduced"
                    @open="onOpenChunk"
                  >
                    <template #chunk-title="{ chunk }">
                      <span class="rs-chunk-title">
                        <span class="rs-chunk-title__text">{{ chunk.title }}</span>
                        <TxSignalMeter
                          :value="RELEVANCE[chunks.indexOf(chunk)] ?? 1"
                          tone="var(--tx-bui-accent, #0285ff)"
                          :label="copy.relevance(RELEVANCE[chunks.indexOf(chunk)] ?? 1)"
                        />
                      </span>
                    </template>
                  </TxContextCards>
                  <div v-else class="rs-skeleton" aria-hidden="true">
                    <TxSkeleton :width="120" :height="12" />
                    <TxSkeleton v-for="n in 3" :key="n" :height="96" :radius="10" />
                  </div>
                </section>
              </div>
            </aside>

            <aside class="rs-side" :aria-label="copy.insightsRail">
              <div class="rs-side__scroll">
                <template v-if="state.insightsReady">
                  <TxInsightCards
                    v-model:active-index="state.insightIndex"
                    :pages="insightPages"
                    :title="copy.insightsTitle"
                    :previous-label="copy.previousInsight"
                    :next-label="copy.nextInsight"
                    @follow-up="onInsightFollowUp"
                  >
                    <template #default="{ page }">
                      <div class="rs-metrics">
                        <TxInsightMetric
                          v-for="metric in metricsOf(page.key)"
                          :key="metric.label"
                          :label="metric.label"
                          :delta="metric.delta"
                          :tone="metric.tone"
                          :detail="metric.detail"
                        />
                      </div>
                      <p class="rs-metrics__note">
                        {{ copy.insightNote }}
                      </p>
                    </template>
                  </TxInsightCards>
                  <TxRecommendationCard
                    v-model="state.recKey"
                    v-model:open="state.recOpen"
                    v-model:accepted="state.recAccepted"
                    :title="copy.recTitle"
                    :options="options"
                    v-bind="copy.rec"
                    @accept="onAccept($event, width)"
                  />
                  <div class="rs-block">
                    <p class="rs-block__title">
                      {{ copy.followLabel }}
                    </p>
                    <TxSuggestionChips
                      :suggestions="copy.followUps"
                      layout="list"
                      @select="onSuggestion"
                    />
                  </div>
                </template>
                <div v-else class="rs-skeleton" aria-hidden="true">
                  <TxSkeleton :width="80" :height="12" />
                  <TxSkeleton :height="148" :radius="10" />
                  <TxSkeleton :height="132" :radius="10" />
                </div>
              </div>
            </aside>
          </template>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped lang="scss">
.rs {
  display: flex;
  height: 100%;
  flex-direction: column;
  background: var(--tx-bui-page, #fafafb);
  color: var(--tx-bui-ink, #1f2124);
  font-size: 13px;
}

/* --- header ---------------------------------------------------------------- */

.rs-head {
  display: flex;
  height: 52px;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 14px;
  box-shadow: inset 0 -1px 0 var(--tx-bui-line, #ecedef);
}

.rs-head__icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border-radius: 9px;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 16px;
}

.rs-head__title {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  line-height: 1.3;
}

.rs-head__crumb {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 13px;
  white-space: nowrap;
}

.rs-head__sep {
  flex: none;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

.rs-head__thread {
  overflow: hidden;
  color: var(--tx-bui-ink, #1f2124);
  font-weight: 600;
  text-overflow: ellipsis;
}

.rs-head__meta {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

.rs-head__status {
  display: flex;
  flex: none;
  align-items: center;
}

/* --- columns --------------------------------------------------------------- */

.rs-cols {
  display: flex;
  min-height: 0;
  flex: 1;
}

/* No overflow clipping here: the prompt bar's menus open upward over it. */
.rs-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.rs-main__scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.rs-main__content {
  display: flex;
  max-width: 680px;
  flex-direction: column;
  gap: 18px;
  margin: 0 auto;
  padding: 18px 20px 12px;
}

.rs-composer {
  flex: none;
  padding: 0 16px 14px;
}

.rs-composer > * {
  max-width: 680px;
  margin-inline: auto;
}

.rs-status {
  display: flex;
  min-height: 24px;
  align-items: center;
  gap: 6px;
  margin: 0 auto;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
}

.rs-status__icon {
  flex: none;
  color: var(--tx-bui-accent-ink, #0170dd);
}

.rs-status__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: rs-fade 0.2s ease-out;
}

/* --- answer column --------------------------------------------------------- */

.rs-q {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rs-q__text {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.45;
}

.rs-q__meta {
  margin: 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

.rs-cot {
  margin-top: -6px;
}

.rs-sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rs-sec__label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
  font-weight: 600;
}

.rs-sample {
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--tx-bui-orange-tint, #fdf1e5);
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 11px;
  font-weight: 500;
}

.rs-answer {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
}

.rs-answer__word {
  animation: rs-word 420ms cubic-bezier(0.22, 0.61, 0.25, 1) both;
}

.rs-answer__glue {
  white-space: nowrap;
}

/* A settled bar rather than a blinking one: it marks where text is still
   arriving without competing with the words resolving beside it. */
.rs-answer__caret {
  display: inline-block;
  width: 2px;
  height: 13px;
  margin-left: 2px;
  border-radius: 999px;
  background: var(--tx-bui-ink, #1f2124);
  transform: translateY(2px);
}

.rs-stack {
  --tx-sources-stack-ring: var(--tx-bui-page, #fafafb);
}

.rs-md :deep(.markdown-body) {
  font-size: 13px;
  line-height: 1.65;
}

.rs-md :deep(.markdown-body p),
.rs-md :deep(.markdown-body ul),
.rs-md :deep(.markdown-body ol) {
  margin: 0 0 8px;
}

.rs-md :deep(.markdown-body ul),
.rs-md :deep(.markdown-body ol) {
  padding-left: 1.3em;
}

.rs-md :deep(.markdown-body table) {
  font-size: 12.5px;
}

.rs-md :deep(.markdown-body h3) {
  margin: 0 0 8px;
  font-size: 13px;
}

.rs-insights {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rs-metrics {
  display: flex;
  gap: 16px;
  padding: 12px;
  border-radius: var(--tx-bui-radius-card, 10px);
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.rs-metrics__note {
  margin: 6px 0 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 11.5px;
}

.rs-note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: var(--tx-bui-radius-card, 10px);
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef);
}

.rs-thread :deep(.tx-ai-message--user .tx-ai-message__body) {
  width: auto;
  max-width: 86%;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  border-color: transparent;
}

.rs-thread :deep(.tx-ai-message__body) {
  background: var(--tx-bui-surface, #fff);
}

.rs-thread__q {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.rs-thread__a {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* --- rail (column and wide) ------------------------------------------------ */

.rs-rail {
  display: flex;
  width: 284px;
  min-height: 0;
  flex: none;
  flex-direction: column;
  background: var(--tx-bui-canvas, #f1f2f3);
  box-shadow: inset 1px 0 0 var(--tx-bui-line, #ecedef);
}

.rs.is-wide .rs-rail {
  width: 320px;
}

.rs-rail :deep(.tx-tabs__nav) {
  box-shadow: inset 0 -1px 0 var(--tx-bui-line, #ecedef);
}

.rs-rail :deep(.tx-tabs__nav-inner) {
  padding: 4px 6px;
}

.rs-rail :deep(.tx-tab-item) {
  margin: 4px 2px;
  padding: 6px 10px;
}

.rs-rail :deep(.tx-tab-item__name) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}

.rs-count {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
}

.rs-pane {
  padding: 12px;
}

/* Source rows are outlined on the page; on the rail's grey they read as holes
   unless they get the surface colour the chunk cards beside them have. */
.rs-rail :deep(.tx-sources__link) {
  background: var(--tx-bui-surface, #fff);
}

.rs-rail :deep(.tx-sources__link:hover) {
  background: var(--tx-bui-hover, #f4f5f6);
}

.rs-chunks {
  --tx-bui-context-cards-max-width: 100%;
}

.rs-chunk-title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.rs-chunk-title__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rs-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rs-empty {
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

.rs-empty > span {
  flex: none;
  margin-top: 2px;
  font-size: 14px;
}

/* A citation lands on its entry: ring it, and pulse once when motion is on.
   TxSources exposes no per-row state, so the rail carries the index. */
@for $i from 1 through 6 {
  .rs-rail[data-hl-source='#{$i}'] :deep(.tx-sources__item:nth-child(#{$i}) .tx-sources__link) {
    border-color: var(--tx-bui-accent, #0285ff);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 28%, transparent);
    animation: rs-pulse 0.9s ease-out;
  }

  .rs-rail[data-flash='#{$i}'] :deep(.tx-sources__item:nth-child(#{$i}) .tx-sources__link) {
    animation: rs-flash 0.9s ease-out;
  }
}

@for $i from 1 through 3 {
  .rs-rail[data-hl-chunk='#{$i}'] :deep(.tx-bui-context-chunk:nth-of-type(#{$i})) {
    box-shadow:
      0 0 0 2px var(--tx-bui-accent, #0285ff),
      var(--tx-bui-shadow-card, 0 0 0 1px #ecedef);
    animation: rs-pulse 0.9s ease-out;
  }
}

/* --- full width: evidence + insights columns ------------------------------- */

.rs-evidence {
  width: 320px;
}

.rs-evidence__scroll,
.rs-side__scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  padding: 14px 14px 18px;
  overflow-y: auto;
}

.rs-side {
  display: flex;
  width: 300px;
  min-height: 0;
  flex: none;
  flex-direction: column;
  background: var(--tx-bui-canvas, #f1f2f3);
  box-shadow: inset 1px 0 0 var(--tx-bui-line, #ecedef);
}

.rs-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rs-block__title {
  margin: 0;
  padding: 0 2px;
  font-size: 13px;
  font-weight: 600;
}

/* --- container tiers ------------------------------------------------------- */

@container template (max-width: 639px) {
  .rs-head {
    gap: 8px;
    padding: 0 8px 0 10px;
  }

  .rs-head__icon {
    display: none;
  }

  .rs-main__content {
    padding: 14px 14px 10px;
  }

  .rs-q__text {
    font-size: 15px;
  }

  .rs-composer {
    padding: 0 10px 10px;
  }

  .rs-metrics {
    flex-direction: column;
    gap: 10px;
  }
}

@keyframes rs-word {
  from {
    opacity: 0;
    filter: blur(4px);
  }
}

@keyframes rs-fade {
  from {
    opacity: 0;
  }
}

@keyframes rs-pulse {
  from {
    box-shadow: 0 0 0 7px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 0%, transparent);
  }

  30% {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 30%, transparent);
  }
}

@keyframes rs-flash {
  30% {
    border-color: var(--tx-bui-accent, #0285ff);
    background: var(--tx-bui-accent-tint, #e9f3ff);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rs-answer__word,
  .rs-status__text {
    animation: none;
  }

  @for $i from 1 through 6 {
    .rs-rail[data-hl-source='#{$i}'] :deep(.tx-sources__item:nth-child(#{$i}) .tx-sources__link),
    .rs-rail[data-flash='#{$i}'] :deep(.tx-sources__item:nth-child(#{$i}) .tx-sources__link) {
      animation: none;
    }
  }

  @for $i from 1 through 3 {
    .rs-rail[data-hl-chunk='#{$i}'] :deep(.tx-bui-context-chunk:nth-of-type(#{$i})) {
      animation: none;
    }
  }
}
</style>
