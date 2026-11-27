<script setup lang="ts">
import './TemplateVoiceDemo.css'
// Voice template: Tuff's voice notes. A list of recordings, a recorder whose
// glow follows the voice, a transcript that arrives while people talk, and an
// AI summary with to-dos once the recording stops.
//
// What is real and what is sample data:
// - Nothing listens. There is no microphone, no getUserMedia and no network:
//   the "speech" is a canned stand-up handed to the transcript on a timer, and
//   the glow reads a level synthesized from the same clock. The header and the
//   recorder both say so.
// - Every clip's audio is made in the page (`voice-clip-sample.ts`: a quiet,
//   syllable-shaped WAV behind an object URL), so the play keys work and
//   nothing is fetched. A clip only ever plays from the reader's click.
// - Speakers, recordings, summaries and to-dos are sample data. The follow-up
//   chips answer inside the stage and say when nothing was really sent.
//
// Playback: `@enter` presses Record, and that is the whole script. The rest is
// the recorder's own behaviour, the same for a recording the reader starts:
// the speech ends, two seconds of silence stop the recording, the summary and
// the to-dos stream in, a toast reports the count. The reader takes over at any
// point. Stop ends the recording early, and only finished sentences are
// summarized. Choosing another recording settles the live one at once: what
// was heard is summarized in place, with no toast. Reduced motion shows the
// finished recording without a timer.
import type { AiSuggestion } from '@talex-touch/tuffex/ai-elements'
import type { BotAvatarState } from '@talex-touch/tuffex/bot-avatar'
import type { TxFlatRadioValue } from '@talex-touch/tuffex/flat-radio'
import type { VoiceClipSample } from './voice-clip-sample'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'
import { createVoiceClipSample, releaseVoiceClipSample } from './voice-clip-sample'

type Layout = 'narrow' | 'column' | 'wide'
type Phase = 'idle' | 'recording' | 'processing' | 'done'
type Pane = 'list' | 'detail'
type PastId = 'idea' | 'weekly' | 'followup'
type RecordingId = 'live' | PastId
type Scroller = 'detail' | 'transcript' | 'summary'
type KeyMode = 'record' | 'stop' | 'busy'
type SummaryMode = 'waiting' | 'thinking' | 'streaming' | 'short' | 'ready'
type ToastTone = 'success' | 'info'

interface TodoSeed {
  text: string
  /** Index into the locale's `speakers`. */
  owner: number
  due?: string
}

interface StandupLine {
  text: string
  /** What the summary keeps of the line. */
  point: string
  todo?: TodoSeed
}

interface PastRecording {
  title: string
  date: string
  lines: { speaker: number, at: number, text: string }[]
  points: string[]
  todos: TodoSeed[]
}

interface LiveLine {
  id: number
  speaker: number
  /** Seconds into the recording when the line began. */
  at: number
  /** What the recognizer has produced so far; the element paces it on screen. */
  received: string
  /** Still being spoken. */
  live: boolean
  /** Spoken to its end. Only these are summarized. */
  complete: boolean
}

interface LivePoint {
  /** The stand-up line it summarizes. */
  line: number
  received: string
  live: boolean
}

interface LiveTake {
  /** Bumped per take, so a new take mounts fresh text elements. */
  run: number
  phase: Phase
  /** Whole seconds on the clock. */
  elapsed: number
  /** Who is talking now, or -1. */
  speaker: number
  /** The speech is over; the recorder waits for the silence to stop. */
  silent: boolean
  lines: LiveLine[]
  points: LivePoint[]
  /** Stand-up lines whose to-do has been written down, in order. */
  todos: number[]
  /** Stopped before a single sentence was finished. */
  short: boolean
  src: string
  durationMs: number
  peaks: number[]
}

interface RowView {
  id: RecordingId
  title: string
  date: string
  src: string
  peaks?: readonly number[]
  durationMs?: number
  note: string
  meta: string
}

interface LineView {
  key: string
  speaker: number
  at: number
  text: string
  live: boolean
}

interface PointView {
  key: string
  text: string
  live: boolean
}

interface TodoView {
  key: string
  text: string
  meta: string
}

interface RecorderView {
  title: string
  sub: string
  clock: string
  key: KeyMode
  keyLabel: string
}

// ── Timing ────────────────────────────────────────────────────────────────

/** Who speaks and for how long. The stand-up runs at about twice real speed. */
const STANDUP_TIMING: readonly { speaker: number, ms: number }[] = [
  { speaker: 0, ms: 3000 },
  { speaker: 1, ms: 2800 },
  { speaker: 2, ms: 2000 },
  { speaker: 0, ms: 2800 },
]

const LEAD_IN_MS = 600
const GAP_MS = 500
/** The recorder stops itself after this much silence, and says so while it waits. */
const SILENCE_STOP_MS = 2000
/** How often the recognizer hands over a few more words. */
const CHUNK_MS = 190
const CLOCK_MS = 200
/** The skeleton's turn before the first point of the summary. */
const THINK_MS = 900
const POINT_TICK_MS = 70
const POINT_GAP_MS = 260
const TODO_GAP_MS = 320
/** The avatar keeps moving this long after it finishes, so its last hop lands. */
const SETTLE_MS = 1600
const TOAST_MS = 4000
const TOAST_REARM_MS = 2000
/** A scroller within this many px of its end counts as followed. */
const FOLLOW_SLACK = 24
const SYLLABLE_S = 0.22
const QUIET = 0.06
/** Waveform values per second of audio: about one per bar of a clip. */
const PEAKS_PER_SECOND = 2.5
const LIVE_SEED = 41

// ── Sample audio ──────────────────────────────────────────────────────────

const PAST_IDS: readonly PastId[] = ['idea', 'weekly', 'followup']

/**
 * Length and voice seed of each earlier recording's synthesized audio. Short on
 * purpose: the clips are WAVs held in memory, 32 KB per second.
 */
const PAST_AUDIO: Record<PastId, { seconds: number, seed: number }> = {
  idea: { seconds: 12, seed: 11 },
  weekly: { seconds: 18, seed: 23 },
  followup: { seconds: 9, seed: 37 },
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** A waveform for an earlier recording: runs of syllables, now and then a breath. */
function seededPeaks(seconds: number, seed: number): number[] {
  const random = seeded(seed)
  const peaks: number[] = []
  let pause = 0
  for (let index = 0; index < Math.round(seconds * PEAKS_PER_SECOND); index++) {
    if (pause > 0) {
      pause -= 1
      peaks.push(QUIET + random() * 0.05)
      continue
    }
    if (index > 1 && random() < 0.16)
      pause = 1 + Math.floor(random() * 2)
    peaks.push(0.3 + random() * 0.7)
  }
  return peaks
}

// Drawn from the levels "recorded" with them, as the VoiceClip docs suggest, so
// no clip decodes its audio to find a waveform.
const PAST_PEAKS: Record<PastId, number[]> = {
  idea: seededPeaks(PAST_AUDIO.idea.seconds, PAST_AUDIO.idea.seed),
  weekly: seededPeaks(PAST_AUDIO.weekly.seconds, PAST_AUDIO.weekly.seed),
  followup: seededPeaks(PAST_AUDIO.followup.seconds, PAST_AUDIO.followup.seed),
}

/** Each syllable a little louder or softer than the last. */
function syllableLoudness(ms: number): number {
  return 0.55 + 0.45 * Math.abs(Math.sin(Math.floor(ms / 1000 / SYLLABLE_S) * 2.3))
}

/** The same syllables as a waveform value, with more range between them. */
function syllablePeak(ms: number): number {
  return 0.25 + 0.75 * Math.abs(Math.sin(Math.floor(ms / 1000 / SYLLABLE_S) * 2.3))
}

// ── Copy ──────────────────────────────────────────────────────────────────

const COPY_ZH = {
  title: '语音速记',
  sample: '示例数据',
  sampleLong: '示例数据：录音、转写、摘要与待办都是虚构的',
  simulated: '模拟录音，不使用麦克风',
  tabs: { list: '录音', detail: '详情' },
  listTitle: '录音',
  synthNote: '这里的音频是页面现场合成的示例音，不含真实语音。',
  justNow: '刚刚',
  untitled: '未命名录音',
  speakers: ['林舟', '周岚', '陈默'],
  todoCount: (count: number) => (count === 0 ? '没有待办' : `${count} 条待办`),
  speakerCount: (count: number) => `${count} 位发言人`,
  clip: {
    none: '尚未录音',
    preparing: '音频准备中…',
    recording: '录音中…',
    play: (title: string) => `播放「${title}」`,
    pause: (title: string) => `暂停「${title}」`,
    seek: (title: string) => `「${title}」的播放进度`,
  },
  row: {
    idle: '按录音键开始',
    recording: (clock: string) => `已录 ${clock}`,
    processing: '正在总结…',
  },
  recorder: {
    idle: '新录音',
    idleSub: '模拟录音，不使用麦克风',
    recording: '正在录音',
    listening: '正在聆听…',
    speaking: (name: string) => `${name}正在说话`,
    silence: '静音 2 秒后自动停止',
    processing: '正在总结',
    processingSub: '整理摘要与待办…',
  },
  keys: { record: '开始录音', stop: '停止录音', again: '重新录制', fresh: '新录音', busy: '正在总结' },
  transcript: {
    title: '转写',
    live: '实时',
    empty: '开始录音后，转写会随着说话实时出现在这里。',
    listening: '正在聆听…',
    nothing: '这段录音里没有可转写的话。',
  },
  summary: {
    title: 'AI 摘要',
    bot: 'AI 助手',
    waitingStatus: '录音结束后生成',
    waiting: '停止录音后，这里会生成摘要和待办。',
    working: '正在总结…',
    ready: '已完成',
    shortStatus: '内容太少',
    short: '录音太短，还没有说完一句话，没有可总结的内容。',
    todos: '待办',
    translated: '示例译文',
  },
  chips: { translate: '翻译成英文', original: '显示原文', inbox: '发到收件箱', remind: '设提醒' },
  toast: {
    label: '通知',
    dismiss: '关闭通知',
    todos: (count: number) => `已生成 ${count} 条待办`,
    none: '摘要已生成，没有待办',
    short: '录音太短，未生成摘要',
    inbox: '已发到收件箱（示例，未真正发送）',
    remind: (count: number) => `已按截止时间给 ${count} 条待办设提醒（示例）`,
  },
  standup: {
    title: '站会：阅后即焚上 beta',
    lines: [
      {
        text: '剪贴板「阅后即焚」今天合进 beta 分支了，复制的内容 30 秒后自动清掉。',
        point: '剪贴板「阅后即焚」已合入 beta：复制内容 30 秒后自动清除。',
      },
      {
        text: '截图翻译的 OCR 回退还差一个竖排文字的用例，我明天补上。',
        point: 'OCR 回退还缺竖排文字的测试用例。',
        todo: { text: '补竖排文字用例', owner: 1, due: '明天' },
      },
      {
        text: '发版说明我来写，周四前发到收件箱。',
        point: '发版说明由陈默负责。',
        todo: { text: '写发版说明并发到收件箱', owner: 2, due: '周四前' },
      },
      {
        text: '那就周四发 beta，在 CoreBox 里搜「阅后即焚」就能打开开关。',
        point: '周四发布 beta，在 CoreBox 搜「阅后即焚」即可开启。',
        todo: { text: '发布 beta', owner: 0, due: '周四' },
      },
    ] as StandupLine[],
  },
  recordings: {
    idea: {
      title: '灵感：剪贴板按来源分组',
      date: '昨天 16:20',
      lines: [
        { speaker: 0, at: 0, text: '剪贴板历史能不能按来源应用分组？浏览器里复制的放一组，终端里复制的放一组。' },
        { speaker: 0, at: 7, text: '找东西会快很多。这周我先画个草图。' },
      ],
      points: ['提议剪贴板历史按来源应用分组。', '浏览器与终端的复制内容分开显示，查找更快。'],
      todos: [{ text: '画一版分组草图', owner: 0, due: '本周' }],
    },
    weekly: {
      title: '周报口述',
      date: '周一 09:05',
      lines: [
        { speaker: 1, at: 0, text: '这周修好了大目录扫描时的内存峰值，搜索冷启动明显快了。' },
        { speaker: 1, at: 9, text: '下周排查语义召回为什么还是空的，顺便补上测试。' },
      ],
      points: ['修复大目录扫描的内存峰值。', '搜索冷启动明显变快。', '下周排查语义召回为空的问题。'],
      todos: [
        { text: '排查语义召回为空', owner: 1, due: '下周' },
        { text: '补语义召回的测试', owner: 1, due: '下周' },
      ],
    },
    followup: {
      title: '回访：插件授权说明',
      date: '10月18日 14:30',
      lines: [
        { speaker: 2, at: 0, text: '用户说插件授权弹窗的说明太长，希望先给一句话结论，细节放进展开里。' },
      ],
      points: ['用户觉得插件授权弹窗的说明太长。', '建议先给一句话结论，细节折叠。'],
      todos: [{ text: '精简授权弹窗文案', owner: 2 }],
    },
  } as Record<PastId, PastRecording>,
}

type Copy = typeof COPY_ZH

const COPY_EN: Copy = {
  title: 'Voice notes',
  sample: 'Sample data',
  sampleLong: 'Sample data: the recordings, transcripts, summaries and to-dos are made up',
  simulated: 'Simulated recording, no microphone',
  tabs: { list: 'List', detail: 'Details' },
  listTitle: 'Recordings',
  synthNote: 'The audio here is synthesized in the page as a sample. No real voices.',
  justNow: 'Just now',
  untitled: 'Untitled recording',
  speakers: ['Lin Zhou', 'Zhou Lan', 'Chen Mo'],
  todoCount: (count: number) => (count === 0 ? 'No to-dos' : count === 1 ? '1 to-do' : `${count} to-dos`),
  speakerCount: (count: number) => (count === 1 ? '1 speaker' : `${count} speakers`),
  clip: {
    none: 'Not recorded yet',
    preparing: 'Preparing audio…',
    recording: 'Recording…',
    play: (title: string) => `Play “${title}”`,
    pause: (title: string) => `Pause “${title}”`,
    seek: (title: string) => `Playback position in “${title}”`,
  },
  row: {
    idle: 'Press record to start',
    recording: (clock: string) => `${clock} so far`,
    processing: 'Summarizing…',
  },
  recorder: {
    idle: 'New recording',
    idleSub: 'Simulated, no microphone',
    recording: 'Recording',
    listening: 'Listening…',
    speaking: (name: string) => `${name} is speaking`,
    silence: 'Stops after 2 s of silence',
    processing: 'Summarizing',
    processingSub: 'Writing summary and to-dos…',
  },
  keys: { record: 'Start recording', stop: 'Stop recording', again: 'Record again', fresh: 'New recording', busy: 'Summarizing' },
  transcript: {
    title: 'Transcript',
    live: 'Live',
    empty: 'Start recording and the transcript appears here as people speak.',
    listening: 'Listening…',
    nothing: 'Nothing in this recording to transcribe.',
  },
  summary: {
    title: 'AI summary',
    bot: 'AI assistant',
    waitingStatus: 'After recording',
    waiting: 'Stop recording and the summary and to-dos appear here.',
    working: 'Summarizing…',
    ready: 'Done',
    shortStatus: 'Too short',
    short: 'Too short to summarize: not one sentence was finished.',
    todos: 'To-dos',
    translated: 'Sample translation',
  },
  chips: { translate: 'Translate to Chinese', original: 'Show original', inbox: 'Send to Inbox', remind: 'Set reminders' },
  toast: {
    label: 'Notification',
    dismiss: 'Dismiss notification',
    todos: (count: number) => (count === 1 ? '1 to-do created' : `${count} to-dos created`),
    none: 'Summary ready, no to-dos',
    short: 'Too short, no summary',
    inbox: 'Sent to Inbox (sample, nothing was sent)',
    remind: (count: number) => `Reminders set for ${count} to-dos by their due dates (sample)`,
  },
  standup: {
    title: 'Stand-up: burn-after-reading to beta',
    lines: [
      {
        text: 'Burn-after-reading for the clipboard merged into the beta branch today. Anything you copy clears itself after 30 seconds.',
        point: 'Burn-after-reading is in beta: copied content clears after 30 seconds.',
      },
      {
        text: 'The OCR fallback in screenshot translation still needs a vertical-text test. I\'ll add it tomorrow.',
        point: 'The OCR fallback still lacks a vertical-text test.',
        todo: { text: 'Add the vertical-text test', owner: 1, due: 'Tomorrow' },
      },
      {
        text: 'I\'ll write the release notes and send them to the inbox before Thursday.',
        point: 'Chen Mo owns the release notes.',
        todo: { text: 'Write the release notes and send them to the inbox', owner: 2, due: 'Before Thu' },
      },
      {
        text: 'Then the beta ships Thursday. Search “burn after reading” in CoreBox to turn it on.',
        point: 'The beta ships Thursday; search CoreBox for “burn after reading” to turn it on.',
        todo: { text: 'Ship the beta', owner: 0, due: 'Thu' },
      },
    ],
  },
  recordings: {
    idea: {
      title: 'Idea: group the clipboard by app',
      date: 'Yesterday 16:20',
      lines: [
        { speaker: 0, at: 0, text: 'Could clipboard history group items by the app they came from? Browser copies in one group, terminal copies in another.' },
        { speaker: 0, at: 7, text: 'Finding things would be much faster. I\'ll sketch it this week.' },
      ],
      points: ['Proposal: group clipboard history by source app.', 'Browser and terminal copies shown apart, so they are faster to find.'],
      todos: [{ text: 'Sketch the grouped layout', owner: 0, due: 'This week' }],
    },
    weekly: {
      title: 'Weekly update, dictated',
      date: 'Mon 09:05',
      lines: [
        { speaker: 1, at: 0, text: 'This week I fixed the memory spike when scanning large folders, and search cold starts are noticeably faster.' },
        { speaker: 1, at: 9, text: 'Next week I\'ll find out why semantic recall still comes back empty, and add tests while I\'m there.' },
      ],
      points: ['Fixed the memory spike on large-folder scans.', 'Search cold starts are noticeably faster.', 'Next: find out why semantic recall comes back empty.'],
      todos: [
        { text: 'Investigate empty semantic recall', owner: 1, due: 'Next week' },
        { text: 'Add tests for semantic recall', owner: 1, due: 'Next week' },
      ],
    },
    followup: {
      title: 'Follow-up: plugin permission prompt',
      date: 'Oct 18, 14:30',
      lines: [
        { speaker: 2, at: 0, text: 'A user said the plugin permission prompt says too much. Lead with one sentence and fold the details away.' },
      ],
      points: ['Users find the plugin permission prompt too long.', 'Lead with one sentence; fold the details.'],
      todos: [{ text: 'Trim the permission prompt copy', owner: 2 }],
    },
  },
}

const COPY = { zh: COPY_ZH, en: COPY_EN }

// ── State ─────────────────────────────────────────────────────────────────

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const copy = computed(() => (zh.value ? COPY.zh : COPY.en))
/** The other language, for the sample translation. */
const otherCopy = computed(() => (zh.value ? COPY.en : COPY.zh))

const colorMode = useColorMode()
// VoiceBeam defaults to its dark palette and BotAvatar only reads the surface
// when it syncs, so both are told the page theme.
const theme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))

function freshTake(run: number): LiveTake {
  return { run, phase: 'idle', elapsed: 0, speaker: -1, silent: false, lines: [], points: [], todos: [], short: false, src: '', durationMs: 0, peaks: [] }
}

function initialChecks(): Record<string, boolean> {
  return { 'idea-0': true }
}

const live = reactive<LiveTake>(freshTake(0))
const selected = ref<RecordingId>('live')
const pane = ref<Pane>('detail')
const translated = ref(false)
const checked = reactive<Record<string, boolean>>(initialChecks())
const pastClips = shallowRef<Partial<Record<PastId, VoiceClipSample>>>({})

/** The stage is on screen; the glow and the avatar hold still while it is not. */
const onScreen = ref(false)
const botHover = ref(false)
const botSettling = ref(false)

const toast = reactive({ open: false, text: '', icon: 'i-carbon-checkmark-filled', tone: 'success' as ToastTone })

const rootRef = ref<HTMLElement | null>(null)
const detailRef = ref<HTMLElement | null>(null)
const transcriptRef = ref<HTMLElement | null>(null)
const summaryRef = ref<HTMLElement | null>(null)
const transcriptBodyRef = ref<HTMLElement | null>(null)
const summaryBodyRef = ref<HTMLElement | null>(null)

let timers: ReturnType<typeof setTimeout>[] = []
let entered = false
/** The reader chose something before the scripted press, which then stays away. */
let touched = false
let startedAt = 0
/** A line is being spoken: the glow follows its syllables. */
let voice = false
/** Levels sampled while recording, drawn as the take's waveform. */
let levelHistory: number[] = []
let liveSample: VoiceClipSample | null = null

// ── Helpers ───────────────────────────────────────────────────────────────

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
}

function prefersReducedMotion(): boolean {
  return hasWindow() && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function layoutOf(width: number): Layout {
  if (width === 0)
    return 'column'
  return width < 640 ? 'narrow' : width < 960 ? 'column' : 'wide'
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function speakersIn(lines: readonly { speaker: number }[]): number {
  return new Set(lines.map(line => line.speaker)).size
}

function initialOf(speaker: number): string {
  return copy.value.speakers[speaker]?.slice(0, 1) ?? ''
}

/** The loudest level in each slice of the take, one value per waveform bar. */
function bucketPeaks(values: readonly number[], seconds: number): number[] {
  const count = Math.max(8, Math.round(seconds * PEAKS_PER_SECOND))
  if (values.length === 0)
    return Array.from({ length: count }, () => QUIET)
  return Array.from({ length: count }, (_, bucket) => {
    const start = Math.floor((bucket * values.length) / count)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * values.length) / count))
    let peak = 0
    for (let index = start; index < end && index < values.length; index++)
      peak = Math.max(peak, values[index] ?? 0)
    return peak
  })
}

/** When each line would start and end, in ms, if nobody interrupts. */
function plannedSpans(): [number, number][] {
  let at = LEAD_IN_MS
  return STANDUP_TIMING.map(({ ms }) => {
    const span: [number, number] = [at, at + ms]
    at += ms + GAP_MS
    return span
  })
}

/** The clock at the automatic stop: the last line, its gap, then the silence. */
function plannedSeconds(): number {
  const spans = plannedSpans()
  const end = spans[spans.length - 1]?.[1] ?? 0
  return Math.max(1, Math.floor((end + GAP_MS + SILENCE_STOP_MS) / 1000))
}

function plannedPeaks(seconds: number): number[] {
  const spans = plannedSpans()
  const count = Math.max(8, Math.round(seconds * PEAKS_PER_SECOND))
  return Array.from({ length: count }, (_, index) => {
    const ms = ((index + 0.5) * seconds * 1000) / count
    return spans.some(([from, to]) => ms >= from && ms < to) ? syllablePeak(ms) : QUIET
  })
}

/**
 * The glow's level, sampled by VoiceBeam once per frame from its own loop, so
 * nothing here re-renders sixty times a second. Each syllable rises and falls;
 * between lines the room is quiet.
 */
function beamLevel(): number {
  if (!voice)
    return 0
  const ms = now() - startedAt
  const phase = ((ms / 1000) % SYLLABLE_S) / SYLLABLE_S
  return syllableLoudness(ms) * Math.sin(Math.PI * phase) ** 0.6
}

// ── Views ─────────────────────────────────────────────────────────────────

const busy = computed(() => live.phase === 'recording' || live.phase === 'processing')

const liveTitle = computed(() => {
  if (live.phase !== 'done')
    return copy.value.recorder.idle
  return live.short ? copy.value.untitled : copy.value.standup.title
})

function liveMeta(): string {
  const c = copy.value
  switch (live.phase) {
    case 'idle':
      return c.row.idle
    case 'recording':
      return c.row.recording(formatClock(live.elapsed))
    case 'processing':
      return c.row.processing
    default:
      return live.short ? c.summary.shortStatus : c.todoCount(live.todos.length)
  }
}

const rows = computed<RowView[]>(() => {
  const c = copy.value
  const liveRow: RowView = {
    id: 'live',
    title: liveTitle.value,
    date: live.phase === 'idle' ? '' : c.justNow,
    src: live.src,
    // Without `src` the clip is unavailable and says why in `note`.
    peaks: live.src ? live.peaks : undefined,
    durationMs: live.src ? live.durationMs : undefined,
    note: live.phase === 'recording' ? c.clip.recording : c.clip.none,
    meta: liveMeta(),
  }
  return [liveRow, ...PAST_IDS.map((id): RowView => {
    const recording = c.recordings[id]
    const src = pastClips.value[id]?.src ?? ''
    return {
      id,
      title: recording.title,
      date: recording.date,
      src,
      peaks: PAST_PEAKS[id],
      // An unavailable clip holds its duration's width as a minimum, which
      // would push past the list column until the audio exists.
      durationMs: src ? PAST_AUDIO[id].seconds * 1000 : undefined,
      note: c.clip.preparing,
      meta: c.todoCount(recording.todos.length),
    }
  })]
})

const recorder = computed<RecorderView>(() => {
  const c = copy.value
  if (selected.value !== 'live') {
    const id = selected.value
    const recording = c.recordings[id]
    return {
      title: recording.title,
      sub: [recording.date, c.speakerCount(speakersIn(recording.lines)), c.todoCount(recording.todos.length)].join(' · '),
      clock: formatClock(PAST_AUDIO[id].seconds),
      key: 'record',
      keyLabel: c.keys.fresh,
    }
  }
  const clock = formatClock(live.elapsed)
  switch (live.phase) {
    case 'idle':
      return { title: c.recorder.idle, sub: c.recorder.idleSub, clock, key: 'record', keyLabel: c.keys.record }
    case 'recording':
      return {
        title: c.recorder.recording,
        sub: live.silent
          ? c.recorder.silence
          : live.speaker >= 0 ? c.recorder.speaking(c.speakers[live.speaker] ?? '') : c.recorder.listening,
        clock,
        key: 'stop',
        keyLabel: c.keys.stop,
      }
    case 'processing':
      return { title: c.recorder.processing, sub: c.recorder.processingSub, clock, key: 'busy', keyLabel: c.keys.busy }
    default: {
      const parts = [c.justNow]
      if (live.lines.length > 0)
        parts.push(c.speakerCount(speakersIn(live.lines)))
      if (!live.short)
        parts.push(c.todoCount(live.todos.length))
      return { title: liveTitle.value, sub: parts.join(' · '), clock, key: 'record', keyLabel: c.keys.again }
    }
  }
})

const beamActive = computed(() => selected.value === 'live' && busy.value)

const lineViews = computed<LineView[]>(() => {
  if (selected.value === 'live') {
    return live.lines.map(line => ({
      key: `live-${live.run}-${line.id}`,
      speaker: line.speaker,
      at: line.at,
      text: line.received,
      live: line.live,
    }))
  }
  const id = selected.value
  return copy.value.recordings[id].lines.map((line, index) => ({
    key: `${id}-${index}`,
    speaker: line.speaker,
    at: line.at,
    text: line.text,
    live: false,
  }))
})

const transcriptNote = computed(() => {
  if (selected.value === 'live' && live.phase === 'recording')
    return copy.value.transcript.listening
  return selected.value === 'live' && live.phase !== 'idle' ? copy.value.transcript.nothing : copy.value.transcript.empty
})

/** The summary's language: the page's, or the other one while a translation shows. */
const summaryCopy = computed(() => (translated.value ? otherCopy.value : copy.value))
const summaryLocale = computed(() => (zh.value !== translated.value ? 'zh' : 'en'))

const summaryMode = computed<SummaryMode>(() => {
  if (selected.value !== 'live')
    return 'ready'
  switch (live.phase) {
    case 'idle':
    case 'recording':
      return 'waiting'
    case 'processing':
      return live.short ? 'short' : live.points.length === 0 ? 'thinking' : 'streaming'
    default:
      return live.short ? 'short' : 'ready'
  }
})

const pointViews = computed<PointView[]>(() => {
  const source = summaryCopy.value
  // A translation remounts the points with their text in full: the chip only
  // appears once the summary is finished, so a translated point never streams.
  const variant = translated.value ? 'tr' : 'or'
  if (selected.value === 'live') {
    return live.points.map(point => ({
      key: `live-${live.run}-${point.line}-${variant}`,
      text: translated.value ? (source.standup.lines[point.line]?.point ?? '') : point.received,
      live: point.live,
    }))
  }
  const id = selected.value
  return source.recordings[id].points.map((text, index) => ({ key: `${id}-${index}-${variant}`, text, live: false }))
})

const todoViews = computed<TodoView[]>(() => {
  const source = summaryCopy.value
  const seeds: { key: string, seed: TodoSeed }[] = []
  if (selected.value === 'live') {
    for (const line of live.todos) {
      const seed = source.standup.lines[line]?.todo
      if (seed)
        seeds.push({ key: `live-${live.run}-${line}`, seed })
    }
  }
  else {
    const id = selected.value
    source.recordings[id].todos.forEach((seed, index) => seeds.push({ key: `${id}-${index}`, seed }))
  }
  // The key holds no language, so a ticked to-do stays ticked in translation.
  return seeds.map(({ key, seed }) => ({
    key,
    text: seed.text,
    meta: [source.speakers[seed.owner], seed.due].filter(Boolean).join(' · '),
  }))
})

const summaryStatus = computed(() => {
  const summary = copy.value.summary
  switch (summaryMode.value) {
    case 'waiting':
      return summary.waitingStatus
    case 'thinking':
    case 'streaming':
      return summary.working
    case 'short':
      return summary.shortStatus
    default:
      return todoViews.value.length > 0 ? copy.value.todoCount(todoViews.value.length) : summary.ready
  }
})

const suggestions = computed<AiSuggestion[]>(() => {
  const chips = copy.value.chips
  const list: AiSuggestion[] = [
    { id: 'translate', text: translated.value ? chips.original : chips.translate },
    { id: 'inbox', text: chips.inbox },
  ]
  if (todoViews.value.length > 0)
    list.push({ id: 'remind', text: chips.remind })
  return list
})

const botState = computed<BotAvatarState>(() => {
  if (selected.value !== 'live')
    return 'default'
  if (live.phase === 'processing')
    return 'working'
  return live.phase === 'done' ? 'default' : 'sleeping'
})

/** Its loop runs only while there is something to watch: working, landing, or under the pointer. */
const botPaused = computed(() => !onScreen.value || !(botState.value === 'working' || botSettling.value || botHover.value))

// ── Scrolling ─────────────────────────────────────────────────────────────

// Column and narrow stages scroll the transcript and the summary together in
// `detail`; the expanded stage gives each its own scroller. A scroller follows
// new content while the reader is at its end, and stops once they scroll up.
const SCROLLERS: readonly Scroller[] = ['detail', 'transcript', 'summary']
const following: Record<Scroller, boolean> = { detail: true, transcript: true, summary: true }
/** Where each scroller was last put, to tell our own scroll events from the reader's. */
const pinned: Record<Scroller, number> = { detail: 0, transcript: 0, summary: 0 }

function scrollerOf(kind: Scroller): HTMLElement | null {
  return kind === 'detail' ? detailRef.value : kind === 'transcript' ? transcriptRef.value : summaryRef.value
}

function onScroll(kind: Scroller, event: Event): void {
  const element = event.currentTarget as HTMLElement
  const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight <= FOLLOW_SLACK
  following[kind] = atEnd || (following[kind] && element.scrollTop >= pinned[kind] - 1)
}

/** Keeps a followed scroller at its end: its own scrollTop, never the page's. */
function pin(kind: Scroller): void {
  const element = scrollerOf(kind)
  if (!element || !following[kind] || element.scrollHeight <= element.clientHeight)
    return
  element.scrollTop = element.scrollHeight
  pinned[kind] = element.scrollTop
}

function resetScroll(follow: boolean): void {
  for (const kind of SCROLLERS)
    following[kind] = follow
  void nextTick(() => {
    for (const kind of SCROLLERS) {
      const element = scrollerOf(kind)
      if (!element)
        continue
      element.scrollTop = follow ? element.scrollHeight : 0
      pinned[kind] = element.scrollTop
    }
  })
}

// ── Recording ─────────────────────────────────────────────────────────────

function stopEngine(): void {
  clearTimers()
  voice = false
  botSettling.value = false
}

function releaseLiveClip(): void {
  releaseVoiceClipSample(liveSample)
  liveSample = null
  live.src = ''
  live.durationMs = 0
  live.peaks = []
}

/** The take's audio: synthesized at the length the clock showed, so the clip reads the same time. */
function makeLiveClip(ms: number, peaks: number[]): void {
  releaseVoiceClipSample(liveSample)
  liveSample = createVoiceClipSample(ms / 1000, LIVE_SEED + live.run)
  live.src = liveSample.src
  live.durationMs = liveSample.durationMs
  live.peaks = peaks
}

function tickClock(): void {
  const ms = now() - startedAt
  const seconds = Math.floor(ms / 1000)
  if (seconds !== live.elapsed)
    live.elapsed = seconds
  levelHistory.push(voice ? syllablePeak(ms) : QUIET + Math.random() * 0.04)
  later(CLOCK_MS, tickClock)
}

function startRecording(): void {
  stopEngine()
  closeToast()
  releaseLiveClip()
  Object.assign(live, freshTake(live.run + 1))
  live.phase = 'recording'
  selected.value = 'live'
  translated.value = false
  startedAt = now()
  levelHistory = []
  resetScroll(true)
  later(CLOCK_MS, tickClock)
  later(LEAD_IN_MS, () => speak(0))
}

function speak(index: number): void {
  const timing = STANDUP_TIMING[index]
  const text = copy.value.standup.lines[index]?.text
  if (!timing || text === undefined) {
    // The speech is over: silence, then the recorder stops itself.
    live.silent = true
    later(SILENCE_STOP_MS, stopRecording)
    return
  }
  live.lines.push({ id: index, speaker: timing.speaker, at: Math.floor((now() - startedAt) / 1000), received: '', live: true, complete: false })
  const line = live.lines[live.lines.length - 1]
  if (!line)
    return
  live.speaker = timing.speaker
  voice = true
  const steps = Math.max(3, Math.round(timing.ms / CHUNK_MS))
  let step = 0
  const tick = (): void => {
    step += 1
    // A few words at a time, the way live captions arrive. The element paces
    // them on screen; this is only the source.
    line.received = text.slice(0, Math.round((text.length * step) / steps))
    if (step < steps) {
      later(CHUNK_MS * (0.75 + Math.random() * 0.5), tick)
      return
    }
    line.live = false
    line.complete = true
    voice = false
    live.speaker = -1
    later(GAP_MS, () => speak(index + 1))
  }
  later(CHUNK_MS, tick)
}

/** Ends the take where it stands: the clock stops, the line being spoken closes, the clip is made. */
function endRecording(): void {
  stopEngine()
  const ms = Math.max(1000, Math.floor((now() - startedAt) / 1000) * 1000)
  live.elapsed = ms / 1000
  live.speaker = -1
  live.silent = false
  const last = live.lines[live.lines.length - 1]
  if (last?.live) {
    last.live = false
    // A line cut off before its first word is not a line.
    if (!last.received)
      live.lines.pop()
  }
  makeLiveClip(ms, bucketPeaks(levelHistory, ms / 1000))
}

function completedLines(): number[] {
  return live.lines.filter(line => line.complete).map(line => line.id)
}

function stopRecording(): void {
  if (live.phase !== 'recording')
    return
  endRecording()
  live.phase = 'processing'
  streamSummary()
}

function streamSummary(): void {
  const lines = completedLines()
  if (lines.length === 0) {
    later(THINK_MS, () => {
      live.short = true
      finish()
    })
    return
  }
  let cursor = 0
  const nextPoint = (): void => {
    const index = lines[cursor]
    if (index === undefined) {
      later(TODO_GAP_MS, revealTodo)
      return
    }
    cursor += 1
    const text = copy.value.standup.lines[index]?.point ?? ''
    live.points.push({ line: index, received: '', live: true })
    const point = live.points[live.points.length - 1]
    if (!point)
      return
    const size = zh.value ? 2 : 6
    const tick = (): void => {
      point.received = text.slice(0, point.received.length + size + Math.floor(Math.random() * size))
      if (point.received.length < text.length) {
        later(POINT_TICK_MS, tick)
        return
      }
      point.live = false
      later(POINT_GAP_MS, nextPoint)
    }
    later(POINT_TICK_MS, tick)
  }
  const pending = lines.filter(index => copy.value.standup.lines[index]?.todo)
  const revealTodo = (): void => {
    const index = pending[live.todos.length]
    if (index === undefined) {
      finish()
      return
    }
    live.todos.push(index)
    later(TODO_GAP_MS, revealTodo)
  }
  later(THINK_MS, nextPoint)
}

function finish(): void {
  live.phase = 'done'
  botSettling.value = true
  later(SETTLE_MS, () => {
    botSettling.value = false
  })
  const count = live.todos.length
  if (live.short)
    openToast(copy.value.toast.short, 'i-carbon-information', 'info')
  else if (count > 0)
    openToast(copy.value.toast.todos(count), 'i-carbon-checkmark-filled', 'success')
  else
    openToast(copy.value.toast.none, 'i-carbon-checkmark-filled', 'success')
}

/** Everything that was heard, summarized at once. */
function fillSummary(): void {
  const lines = completedLines()
  const source = copy.value.standup.lines
  live.short = lines.length === 0
  live.points = lines.map(index => ({ line: index, received: source[index]?.point ?? '', live: false }))
  live.todos = lines.filter(index => source[index]?.todo)
}

/**
 * The reader moved to another recording while this one was live: it settles
 * where it stands, summarized in place, without streaming and without a toast.
 */
function settleLive(): void {
  if (live.phase === 'recording')
    endRecording()
  else if (live.phase === 'processing')
    stopEngine()
  else
    return
  fillSummary()
  live.phase = 'done'
}

/** Reduced motion: the finished stand-up, with no timer. */
function applyFinalState(): void {
  stopEngine()
  const spans = plannedSpans()
  const seconds = plannedSeconds()
  Object.assign(live, freshTake(live.run + 1))
  live.lines = copy.value.standup.lines.map((line, index) => ({
    id: index,
    speaker: STANDUP_TIMING[index]?.speaker ?? 0,
    at: Math.floor((spans[index]?.[0] ?? 0) / 1000),
    received: line.text,
    live: false,
    complete: true,
  }))
  live.elapsed = seconds
  makeLiveClip(seconds * 1000, plannedPeaks(seconds))
  fillSummary()
  live.phase = 'done'
  resetScroll(false)
}

// ── Reader input ──────────────────────────────────────────────────────────

function onKey(): void {
  touched = true
  if (selected.value !== 'live' || live.phase === 'idle' || live.phase === 'done')
    startRecording()
  else if (live.phase === 'recording')
    stopRecording()
}

/**
 * Selects a recording. `open` also shows it on a narrow stage; the clip's own
 * keys pass false, so a clip played from the list keeps its controls in view.
 */
function select(id: RecordingId, open: boolean): void {
  touched = true
  if (id !== 'live')
    settleLive()
  if (selected.value !== id) {
    selected.value = id
    translated.value = false
    resetScroll(id === 'live' && busy.value)
  }
  if (open)
    pane.value = 'detail'
}

function selectPane(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (value === 'list' || value === 'detail')
    pane.value = value
}

function setChecked(key: string, value: boolean): void {
  checked[key] = value
}

function onSuggestion(suggestion: AiSuggestion): void {
  const c = copy.value
  if (suggestion.id === 'translate')
    translated.value = !translated.value
  else if (suggestion.id === 'inbox')
    openToast(c.toast.inbox, 'i-carbon-send-alt', 'info')
  else if (suggestion.id === 'remind')
    openToast(c.toast.remind(todoViews.value.length), 'i-carbon-time', 'info')
}

// ── Toast ─────────────────────────────────────────────────────────────────

// Controlled and inside the stage. It closes itself after a few seconds,
// reduced motion included; pointer or focus on it holds it, re-arming once
// both have left.
let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastHovered = false
let toastFocused = false

function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
  }, ms)
}

function openToast(text: string, icon: string, tone: ToastTone): void {
  toast.text = text
  toast.icon = icon
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

// ── Lifecycle ─────────────────────────────────────────────────────────────

function start(): void {
  if (touched || live.phase !== 'idle')
    return
  if (prefersReducedMotion()) {
    applyFinalState()
    return
  }
  startRecording()
}

function onEnter(): void {
  entered = true
  start()
}

function resetDemo(): void {
  stopEngine()
  closeToast()
  releaseLiveClip()
  Object.assign(live, freshTake(live.run + 1))
  for (const key of Object.keys(checked))
    delete checked[key]
  Object.assign(checked, initialChecks())
  selected.value = 'live'
  pane.value = 'detail'
  translated.value = false
  touched = false
  resetScroll(true)
  if (entered)
    void nextTick(start)
}

let visibility: IntersectionObserver | null = null
let growth: ResizeObserver | null = null

onMounted(() => {
  // Made here rather than on `@enter`: the clips are data, not playback, and a
  // reader may press play before the stage is far enough in to start.
  pastClips.value = Object.fromEntries(PAST_IDS.map(id => [id, createVoiceClipSample(PAST_AUDIO[id].seconds, PAST_AUDIO[id].seed)]))

  const root = rootRef.value
  if (root && typeof IntersectionObserver === 'function') {
    visibility = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry)
        onScreen.value = entry.isIntersecting
    })
    visibility.observe(root)
  }
  else {
    onScreen.value = true
  }

  // The streamed text keeps growing after each source update while the element
  // paces it, so the followed scrollers track the content's size, not the data.
  if (typeof ResizeObserver === 'function') {
    growth = new ResizeObserver((entries) => {
      for (const entry of entries) {
        pin('detail')
        pin(entry.target === transcriptBodyRef.value ? 'transcript' : 'summary')
      }
    })
    if (transcriptBodyRef.value)
      growth.observe(transcriptBodyRef.value)
    if (summaryBodyRef.value)
      growth.observe(summaryBodyRef.value)
  }
})

watch(locale, resetDemo)

onBeforeUnmount(() => {
  stopEngine()
  clearTimeout(toastTimer)
  visibility?.disconnect()
  visibility = null
  growth?.disconnect()
  growth = null
  releaseLiveClip()
  for (const clip of Object.values(pastClips.value))
    releaseVoiceClipSample(clip)
  pastClips.value = {}
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="560" @enter="onEnter">
    <template #default="{ width }">
      <div ref="rootRef" class="vnote" :data-pane="pane">
        <header class="vnote__head">
          <span class="vnote__mark" aria-hidden="true">
            <span class="i-carbon-microphone-filled" />
          </span>
          <span class="vnote__title">{{ copy.title }}</span>
          <TxTag
            class="vnote__sample"
            :label="copy.sample"
            :title="copy.sampleLong"
            icon="i-carbon-information"
            variant="plain"
            size="sm"
          />
          <span class="vnote__spacer" />
          <TxFlatRadio
            v-if="layoutOf(width) === 'narrow'"
            class="vnote__tabs"
            size="sm"
            :model-value="pane"
            @update:model-value="selectPane"
          >
            <TxFlatRadioItem value="list" :label="`${copy.tabs.list} · ${rows.length}`" />
            <TxFlatRadioItem value="detail" :label="copy.tabs.detail" />
          </TxFlatRadio>
          <span v-else class="vnote__hint">
            <span class="i-carbon-microphone-off" aria-hidden="true" />
            {{ copy.simulated }}
          </span>
        </header>

        <div class="vnote__body">
          <aside class="vnote-list" :aria-label="copy.listTitle">
            <div class="vnote-list__head">
              <span>{{ copy.listTitle }}</span>
              <span class="vnote-list__count">{{ rows.length }}</span>
            </div>
            <ul class="vnote-list__rows">
              <li
                v-for="row in rows"
                :key="row.id"
                class="vnote-row"
                :class="{ 'is-selected': selected === row.id, 'is-recording': row.id === 'live' && live.phase === 'recording' }"
                @click="select(row.id, true)"
              >
                <button
                  type="button"
                  class="vnote-row__select"
                  :aria-current="selected === row.id ? 'true' : undefined"
                  @click.stop="select(row.id, true)"
                >
                  <span class="vnote-row__title">{{ row.title }}</span>
                  <span v-if="row.date" class="vnote-row__date">{{ row.date }}</span>
                </button>
                <div class="vnote-row__clip" @click.stop="select(row.id, false)">
                  <TxVoiceClip
                    :src="row.src"
                    :peaks="row.peaks"
                    :duration-ms="row.durationMs"
                    :unavailable-label="row.note"
                    :play-label="copy.clip.play(row.title)"
                    :pause-label="copy.clip.pause(row.title)"
                    :seek-label="copy.clip.seek(row.title)"
                  />
                </div>
                <span class="vnote-row__meta">{{ row.meta }}</span>
              </li>
            </ul>
            <p class="vnote-list__note">
              {{ copy.synthNote }}
            </p>
          </aside>

          <div class="vnote-main">
            <TxVoiceBeam
              class="vnote-rec"
              :theme="theme"
              :level="beamLevel"
              :active="beamActive"
              :processing="beamActive && live.phase === 'processing'"
              :paused="!onScreen"
              :organic="1"
              :border-radius="16"
            >
              <div class="vnote-rec__body">
                <button
                  type="button"
                  class="vnote-key"
                  :class="`is-${recorder.key}`"
                  :aria-label="recorder.keyLabel"
                  :title="recorder.keyLabel"
                  :disabled="recorder.key === 'busy'"
                  @click="onKey"
                >
                  <span class="vnote-key__glyph" aria-hidden="true" />
                </button>
                <div class="vnote-rec__text">
                  <span class="vnote-rec__title" aria-live="polite">{{ recorder.title }}</span>
                  <span class="vnote-rec__sub">{{ recorder.sub }}</span>
                </div>
                <span class="vnote-rec__clock">{{ recorder.clock }}</span>
              </div>
            </TxVoiceBeam>

            <div ref="detailRef" class="vnote-detail" @scroll="onScroll('detail', $event)">
              <section
                ref="transcriptRef"
                class="vnote-transcript"
                :aria-label="copy.transcript.title"
                @scroll="onScroll('transcript', $event)"
              >
                <div ref="transcriptBodyRef" class="vnote-transcript__body">
                  <div class="vnote-section-head">
                    <span class="i-carbon-chat" aria-hidden="true" />
                    <span>{{ copy.transcript.title }}</span>
                    <span v-if="selected === 'live' && live.phase === 'recording'" class="vnote-live">
                      {{ copy.transcript.live }}
                    </span>
                    <span v-if="lineViews.length > 0" class="vnote-section-head__meta">
                      {{ copy.speakerCount(speakersIn(lineViews)) }}
                    </span>
                  </div>
                  <p v-if="lineViews.length === 0" class="vnote-empty">
                    {{ transcriptNote }}
                  </p>
                  <ol v-else class="vnote-lines">
                    <li v-for="line in lineViews" :key="line.key" class="vnote-line">
                      <span class="vnote-avatar" :class="`is-s${line.speaker}`" aria-hidden="true">
                        {{ initialOf(line.speaker) }}
                      </span>
                      <div class="vnote-line__body">
                        <div class="vnote-line__meta">
                          <span class="vnote-line__name">{{ copy.speakers[line.speaker] }}</span>
                          <span class="vnote-line__at">{{ formatClock(line.at) }}</span>
                        </div>
                        <div class="vnote-line__text">
                          <TxStreamText
                            :content="line.text"
                            :streaming="line.live"
                            :locale="zh ? 'zh' : 'en'"
                            reveal="blur"
                          />
                        </div>
                      </div>
                    </li>
                  </ol>
                </div>
              </section>

              <section
                ref="summaryRef"
                class="vnote-summary"
                :aria-label="copy.summary.title"
                :aria-busy="summaryMode === 'thinking' || summaryMode === 'streaming' ? 'true' : undefined"
                @scroll="onScroll('summary', $event)"
                @pointerenter="botHover = true"
                @pointerleave="botHover = false"
              >
                <div ref="summaryBodyRef" class="vnote-summary__body">
                  <div class="vnote-summary__head">
                    <TxBotAvatar
                      :size="30"
                      :state="botState"
                      :paused="botPaused"
                      :theme="theme"
                      :aria-label="copy.summary.bot"
                    />
                    <span class="vnote-summary__titles">
                      <span class="vnote-summary__title">{{ copy.summary.title }}</span>
                      <span class="vnote-summary__status">{{ summaryStatus }}</span>
                    </span>
                    <TxTag
                      v-if="translated"
                      class="vnote-summary__tag"
                      :label="copy.summary.translated"
                      icon="i-carbon-translate"
                      variant="plain"
                      size="sm"
                    />
                  </div>

                  <p v-if="summaryMode === 'waiting'" class="vnote-empty">
                    {{ copy.summary.waiting }}
                  </p>
                  <p v-else-if="summaryMode === 'short'" class="vnote-empty">
                    {{ copy.summary.short }}
                  </p>
                  <div v-else-if="summaryMode === 'thinking'" class="vnote-skeleton">
                    <TxSkeleton width="92%" :height="10" />
                    <TxSkeleton width="78%" :height="10" />
                    <TxSkeleton width="60%" :height="10" />
                  </div>
                  <template v-else>
                    <ul class="vnote-points">
                      <li v-for="point in pointViews" :key="point.key" class="vnote-point">
                        <TxStreamText :content="point.text" :streaming="point.live" :locale="summaryLocale" />
                      </li>
                    </ul>
                    <div v-if="todoViews.length > 0" class="vnote-todos">
                      <span class="vnote-todos__head">{{ copy.summary.todos }} · {{ todoViews.length }}</span>
                      <ul class="vnote-todos__list">
                        <li
                          v-for="todo in todoViews"
                          :key="todo.key"
                          class="vnote-todo"
                          :class="{ 'is-done': checked[todo.key] === true }"
                        >
                          <TxCheckbox
                            :model-value="checked[todo.key] === true"
                            :label="todo.text"
                            @update:model-value="setChecked(todo.key, $event)"
                          />
                          <span class="vnote-todo__meta">{{ todo.meta }}</span>
                        </li>
                      </ul>
                    </div>
                    <TxSuggestionChips
                      v-if="summaryMode === 'ready'"
                      class="vnote-follow"
                      layout="list"
                      :suggestions="suggestions"
                      @select="onSuggestion"
                    />
                  </template>
                </div>
              </section>
            </div>
          </div>
        </div>

        <!-- Keeps its box while closed, so it is inert until it opens; pointer
             or focus on it holds it open, otherwise it closes by itself. -->
        <div
          class="vnote-toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toast.label">
            <div class="vnote-toast__card">
              <span class="vnote-toast__icon" :class="[toast.icon, `is-${toast.tone}`]" aria-hidden="true" />
              <span class="vnote-toast__text">{{ toast.text }}</span>
              <button type="button" class="vnote-toast__close" :aria-label="copy.toast.dismiss" @click="closeToast">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>
