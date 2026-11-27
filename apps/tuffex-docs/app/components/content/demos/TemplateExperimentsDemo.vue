<script setup lang="ts">
// Experiments template: a TensorBoard / W&B-style board comparing six training
// runs of `corebox-intent-mini`, the on-device classifier that sorts a CoreBox
// query into one of 12 intents. The runs sweep lr × batch; one of them, r6, is
// still training. On first view it streams from step 1,200 to 6,000 in about
// six seconds, overtakes r3 near step 4,600 and finishes as the best run.
//
// At any time the reader can stop (and resume) r6, choose which runs the chart
// compares — ticking rows, clicking legend items, or boxing cells of the sweep
// heatmap — switch the metric, zoom into a range of steps, and focus a run (a
// row or a heatmap cell) to read its config.
//
// Every number is sample data and says so. The curves come from a seeded
// generator, so the server and every reload draw the same runs.
import type { EChartEventParams, HeatmapLabels, HeatmapSelection, LearningCurveLabels, LearningCurveRun } from '@talex-touch/tuffex/charts'
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { TxFlatRadioValue } from '@talex-touch/tuffex/flat-radio'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { ChartPalette } from '@talex-touch/tuffex/charts'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide'
type RunId = 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'r6'
type Metric = 'valAcc' | 'valLoss' | 'trainLoss'
type RunStatus = 'running' | 'done' | 'stopped' | 'failed'
type LiveStatus = Exclude<RunStatus, 'failed'>
type NarrowTab = 'curves' | 'runs' | 'sweep'
type SideTab = 'sweep' | 'config'
type Part = 'chart' | 'runs' | SideTab
type Point = [number, number]

interface RunSpec {
  id: RunId
  lr: string
  batch: number
  seed: number
  /** Last logged step. */
  end: number
  /** Steps for the loss to fall most of the way to its floor. */
  tau: number
  accMax: number
  valFloor: number
  trainFloor: number
  /** Past this step the loss blows up: the learning rate is too high. */
  divergeAt?: number
  /** Past this step validation drifts back up: the run over-fits. */
  overfitAt?: number
  /** Wall-clock seconds per step on the sample GPU. */
  secondsPerStep: number
  outcome: 'done' | 'stopped' | 'failed' | 'live'
}

interface RunSeries {
  trainLoss: Point[]
  valLoss: Point[]
  valAcc: Point[]
}

interface RunRow {
  id: RunId
  lr: string
  batch: number
  status: RunStatus
  best: number
  leader: boolean
  duration: string
}

// ── Sample data ──────────────────────────────────────────────────────────────

const PROJECT = 'corebox-intent-mini'
const COMMIT = 'e31a6c8'
const GPU = '1 × RTX 4090 · 24 GB'
const DATASET_SIZE = 96_000
const TOTAL_STEPS = 6000
const TRAIN_EVERY = 50
const VAL_EVERY = 200
/** Cross-entropy and accuracy of a uniform guess over the 12 intents. */
const LOSS_START = Math.log(12)
const ACC_START = 1 / 12

// Seeds are picked so every best rounds to three non-zero decimals: the heatmap
// prints cell values as they are, with no formatter to pad `0.89` out.
const RUNS: RunSpec[] = [
  { id: 'r1', lr: '1e-4', batch: 64, seed: 17, end: 6000, tau: 1500, accMax: 0.888, valFloor: 0.42, trainFloor: 0.3, secondsPerStep: 0.212, outcome: 'done' },
  { id: 'r2', lr: '1e-4', batch: 128, seed: 23, end: 3200, tau: 1500, accMax: 0.88, valFloor: 0.45, trainFloor: 0.33, secondsPerStep: 0.355, outcome: 'stopped' },
  { id: 'r3', lr: '3e-4', batch: 128, seed: 31, end: 6000, tau: 900, accMax: 0.896, valFloor: 0.35, trainFloor: 0.2, secondsPerStep: 0.361, outcome: 'done' },
  { id: 'r4', lr: '1e-3', batch: 64, seed: 42, end: 2150, tau: 450, accMax: 0.853, valFloor: 0.4, trainFloor: 0.22, divergeAt: 1900, secondsPerStep: 0.208, outcome: 'failed' },
  { id: 'r5', lr: '1e-3', batch: 128, seed: 6, end: 6000, tau: 500, accMax: 0.891, valFloor: 0.37, trainFloor: 0.12, overfitAt: 2800, secondsPerStep: 0.358, outcome: 'done' },
  { id: 'r6', lr: '3e-4', batch: 64, seed: 1027, end: 6000, tau: 1100, accMax: 0.911, valFloor: 0.3, trainFloor: 0.18, secondsPerStep: 0.214, outcome: 'live' },
]

const LIVE_ID: RunId = 'r6'
/** Where r6 stands before the reader arrives. */
const START_STEP = 1200
// 4,800 steps in 60 ticks: about six seconds.
const TICK_MS = 100
const STEPS_PER_TICK = 80
const TOAST_MS = 3200
const TOAST_REARM_MS = 2000

/** Stage height in the docs column. */
const STAGE_H = 640
const HEAD_H = 56
/** The runs strip: a header and six rows with no scrollbar. The grid rows in the styles repeat it. */
const TABLE_H = 266

/** A seeded PRNG (mulberry32), so every render draws the same curves. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard normal draw (Box–Muller). */
function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

function round(value: number, digits: number): number {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

/**
 * One run's scalars: train loss every 50 steps, validation every 200. Losses
 * decay from a uniform guess toward the run's floor; a diverging run blows up
 * past `divergeAt`, an over-fitting one drifts back up past `overfitAt`.
 */
function buildSeries(spec: RunSpec): RunSeries {
  const random = mulberry32(spec.seed)
  const small = spec.batch === 64
  const blowup = (t: number): number => spec.divergeAt && t > spec.divergeAt ? ((t - spec.divergeAt) / 250) ** 2 : 0
  const drift = (t: number): number => spec.overfitAt && t > spec.overfitAt ? (t - spec.overfitAt) / (TOTAL_STEPS - spec.overfitAt) : 0
  const trainLoss: Point[] = []
  const valLoss: Point[] = []
  const valAcc: Point[] = []
  for (let t = 0; t <= spec.end; t += TRAIN_EVERY) {
    const base = spec.trainFloor + (LOSS_START - spec.trainFloor) * Math.exp(-t / (spec.tau * 0.9))
    const noise = gaussian(random) * (small ? 0.05 : 0.034) * (0.45 + base / LOSS_START)
    trainLoss.push([t, round(Math.max(0.02, base + noise + 2.8 * blowup(t)), 4)])
  }
  for (let t = VAL_EVERY; t <= spec.end; t += VAL_EVERY) {
    const loss = spec.valFloor + (LOSS_START - spec.valFloor) * Math.exp(-t / spec.tau) + 0.1 * drift(t) ** 1.3 + 1.6 * blowup(t)
    valLoss.push([t, round(loss + gaussian(random) * 0.012, 4)])
    const acc = ACC_START + (spec.accMax - ACC_START) * (1 - Math.exp(-t / spec.tau)) - 0.014 * drift(t) - 0.4 * blowup(t)
    valAcc.push([t, round(Math.min(0.99, acc + gaussian(random) * (small ? 0.0035 : 0.0025)), 4)])
  }
  return { trainLoss, valLoss, valAcc }
}

/** Best validation accuracy logged up to `step`, rounded the way it is shown. */
function bestUpTo(points: readonly Point[], step = Number.POSITIVE_INFINITY): number {
  let best = 0
  for (const [at, value] of points) {
    if (at > step)
      break
    best = Math.max(best, value)
  }
  return round(best, 3)
}

const RUN_IDS: RunId[] = RUNS.map(run => run.id)
const RUN_BY_ID = Object.fromEntries(RUNS.map(run => [run.id, run])) as Record<RunId, RunSpec>
const SERIES = Object.fromEntries(RUNS.map(run => [run.id, buildSeries(run)])) as Record<RunId, RunSeries>
const FINAL_BEST = Object.fromEntries(RUNS.map(run => [run.id, bestUpTo(SERIES[run.id].valAcc)])) as Record<RunId, number>
// The chart's own palette, by run position, so a row's swatch matches its curve.
const RUN_COLOR = Object.fromEntries(RUNS.map((run, index) => [run.id, ChartPalette.categoricalVar(index)])) as Record<RunId, string>

// The compare checkbox wears its run's colour. Yellow (r2) and teal (r5) are
// light fills, so their tick is dark.
const DARK_TICK = new Set<RunId>(['r2', 'r5'])
const PICK_STYLE = Object.fromEntries(RUNS.map((run) => {
  const color = RUN_COLOR[run.id]
  const style: Record<string, string> = {
    '--tx-color-primary': color,
    '--tx-border-color': `color-mix(in srgb, ${color} 55%, transparent)`,
    '--tx-color-primary-light-9': `color-mix(in srgb, ${color} 18%, transparent)`,
    '--tx-color-primary-light-7': `color-mix(in srgb, ${color} 35%, transparent)`,
    '--tx-checkbox-checkmark-color': DARK_TICK.has(run.id) ? '#1f2329' : '#fff',
  }
  return [run.id, style]
})) as Record<RunId, Record<string, string>>

// The sweep as ECharts lays it out: the first row is the bottom one. The axis
// names would be clipped, so each category label says what it is.
const GRID_ROWS = ['bs 64', 'bs 128']
const GRID_COLUMNS = ['lr 1e-4', 'lr 3e-4', 'lr 1e-3']
const GRID_RUNS: RunId[][] = [['r1', 'r6', 'r4'], ['r2', 'r3', 'r5']]
/** Colour scale bounds: r2's 0.785 reads pale, r6's 0.912 deep. */
const HEAT_MIN = 0.75
const HEAT_MAX = 0.92

const METRICS: Metric[] = ['valAcc', 'valLoss', 'trainLoss']
const METRIC_LABEL: Record<Metric, string> = { valAcc: 'val/acc', valLoss: 'val/loss', trainLoss: 'train/loss' }

const STATUS_TONE: Record<RunStatus, StatusTone> = { running: 'info', done: 'success', stopped: 'muted', failed: 'danger' }
const STATUS_ICON: Record<RunStatus, string> = {
  running: 'i-carbon-play-filled-alt',
  done: 'i-carbon-checkmark',
  stopped: 'i-carbon-stop-filled-alt',
  failed: 'i-carbon-close',
}

// ── Copy ─────────────────────────────────────────────────────────────────────

const zhCurveLabels: Partial<LearningCurveLabels> = {
  chart: '学习曲线',
  instructions: '左右方向键逐步读数，Home 和 End 跳到首尾，Escape 清除。',
  zoomInstructions: '左右方向键逐步读数，加号和减号缩放，Shift 加左右方向键平移，0 显示全部步数，Escape 清除。',
  step: step => `第 ${step} 步`,
  raw: '原始',
}

const zhHeatLabels: Partial<HeatmapLabels> = {
  instructions: '在单元格上拖拽可框选一块。单击或按 Escape 清除选区。',
  selected: '已选择 {count} 格，共 {total} 格。',
  cleared: '已清除选区。',
}

const zhCopy = {
  title: 'Experiments 训练实验',
  subtitle: '网格扫描 · 示例数据',
  metricLabel: '曲线指标',
  training: (id: string) => `${id} 训练中`,
  finished: (id: string) => `${id} 已完成`,
  halted: (id: string) => `${id} 已停止`,
  stop: '停止',
  resume: '继续',
  tabsLabel: '看板分区',
  tabs: { curves: '曲线', runs: '运行', sweep: '扫描' } as Record<NarrowTab, string>,
  sideTabsLabel: '侧栏内容',
  sideTabs: { sweep: '扫描', config: '配置' } as Record<SideTab, string>,
  status: { running: '运行中', done: '完成', stopped: '已停止', failed: '失败' } as Record<RunStatus, string>,
  chartRegion: '学习曲线',
  legendLabel: '对比的运行',
  empty: '勾选至少一次运行来对比曲线',
  xAxis: '训练步数',
  chartName: (metric: string, ids: string) => `${metric} 学习曲线，对比 ${ids}（示例数据）`,
  chartEmpty: (metric: string) => `${metric} 学习曲线，未选择运行（示例数据）`,
  zoomed: (range: string) => `已放大 · ${range} 步`,
  showAll: '显示全部步数',
  runsRegion: '运行列表',
  columns: { pick: '对比', name: '运行', status: '状态', best: '最佳 val/acc', bestShort: '最佳', duration: '时长' },
  compareAll: '对比全部运行',
  compareRun: (id: string) => `对比 ${id}`,
  leader: '（当前最佳）',
  sweepTitle: '超参扫描',
  sweepMeta: 'lr × batch · 最佳 val/acc',
  sweepLabel: '超参扫描：lr × batch 的最佳 val/acc（示例数据）',
  sweepHint: '拖拽框选只对比这几次，单击查看该运行的配置。',
  boxed: (count: number, ids: string) => `已框选 ${count} 格，只对比 ${ids}。单击任一格子或按 Escape 恢复。`,
  bestLabel: '最佳 val/acc',
  configTitle: (id: string) => `${id} 的配置`,
  sample: '示例数据',
  config: { optimizer: '优化器', lr: '学习率', batch: '批大小', epochs: '训练轮数', seed: '随机种子', dataset: '数据集', commit: '代码提交', gpu: 'GPU', state: '状态' },
  optimizer: 'AdamW · 权重衰减 0.01',
  schedule: (lr: string) => `${lr} · 余弦衰减 · 预热 300 步`,
  epochs: (count: number) => `${count} 轮 · 6,000 步`,
  dataset: 'corebox-queries v7 · 9.6 万条',
  state: {
    done: '完成 · 6,000 步',
    running: (step: string) => `运行中 · ${step} / 6,000 步`,
    stopped: (step: string) => `手动停止 · 第 ${step} 步`,
    failed: '损失发散 · 第 2,150 步终止',
  },
  duration: (minutes: number, seconds: string) => `${minutes} 分 ${seconds} 秒`,
  list: '、',
  toastLabel: '训练提示',
  dismiss: '关闭提示',
  toast: {
    done: (id: string, best: string) => `${id} 训练完成 · 最佳 ${best}（示例数据）`,
    stopped: (id: string, step: string) => `已停止 ${id} · 停在第 ${step} 步（示例数据）`,
  },
  curveLabels: zhCurveLabels,
  heatLabels: zhHeatLabels,
}

type Copy = typeof zhCopy

const enCopy: Copy = {
  title: 'Experiments',
  subtitle: 'Grid sweep · sample data',
  metricLabel: 'Curve metric',
  training: id => `Training ${id}`,
  finished: id => `${id} finished`,
  halted: id => `${id} stopped`,
  stop: 'Stop',
  resume: 'Resume',
  tabsLabel: 'Board sections',
  tabs: { curves: 'Curves', runs: 'Runs', sweep: 'Sweep' },
  sideTabsLabel: 'Side panel',
  sideTabs: { sweep: 'Sweep', config: 'Config' },
  status: { running: 'Running', done: 'Finished', stopped: 'Stopped', failed: 'Failed' },
  chartRegion: 'Learning curves',
  legendLabel: 'Runs compared',
  empty: 'Tick at least one run to compare its curve',
  xAxis: 'Training step',
  chartName: (metric, ids) => `${metric} learning curves comparing ${ids} (sample data)`,
  chartEmpty: metric => `${metric} learning curves, no run selected (sample data)`,
  zoomed: range => `Zoomed · steps ${range}`,
  showAll: 'Show every step',
  runsRegion: 'Runs',
  columns: { pick: 'Compare', name: 'Run', status: 'Status', best: 'Best val/acc', bestShort: 'Best', duration: 'Duration' },
  compareAll: 'Compare every run',
  compareRun: id => `Compare ${id}`,
  leader: '(current best)',
  sweepTitle: 'Hyperparameter sweep',
  sweepMeta: 'lr × batch · best val/acc',
  sweepLabel: 'Hyperparameter sweep: best val/acc by lr × batch (sample data)',
  sweepHint: 'Drag across cells to compare only those runs; click a cell to see its config.',
  boxed: (count, ids) => `Boxed ${count} ${count === 1 ? 'cell' : 'cells'}: comparing ${ids} only. Click any cell or press Escape to restore.`,
  bestLabel: 'Best val/acc',
  configTitle: id => `${id} config`,
  sample: 'Sample data',
  config: { optimizer: 'Optimizer', lr: 'Learning rate', batch: 'Batch size', epochs: 'Epochs', seed: 'Seed', dataset: 'Dataset', commit: 'Commit', gpu: 'GPU', state: 'Status' },
  optimizer: 'AdamW · weight decay 0.01',
  schedule: lr => `${lr} · cosine · 300 warmup`,
  epochs: count => `${count} · 6,000 steps`,
  dataset: 'corebox-queries v7 · 96k',
  state: {
    done: 'Finished · 6,000 steps',
    running: step => `Running · ${step} / 6,000`,
    stopped: step => `Stopped at step ${step}`,
    failed: 'Diverged · killed at 2,150',
  },
  duration: (minutes, seconds) => `${minutes}m ${seconds}s`,
  list: ', ',
  toastLabel: 'Training notice',
  dismiss: 'Dismiss',
  toast: {
    done: (id, best) => `${id} finished · best ${best} (sample data)`,
    stopped: (id, step) => `Stopped ${id} at step ${step} (sample data)`,
  },
  curveLabels: {},
  heatLabels: {},
}

const COPY = { zh: zhCopy, en: enCopy }

const { locale } = useI18n()
const lang = computed(() => (locale.value.startsWith('zh') ? 'zh' : 'en') as keyof typeof COPY)
const copy = computed(() => COPY[lang.value])

// Every column after the name hugs its content; the name takes the rest.
function buildColumns(text: Copy): Record<'full' | 'narrow', DataTableColumn[]> {
  const pick = (width: number): DataTableColumn => ({ key: 'pick', title: text.columns.pick, width, cellClass: 'exp-cell-pick', headerClass: 'exp-cell-pick' })
  const name: DataTableColumn = { key: 'name', title: text.columns.name }
  const status: DataTableColumn = { key: 'status', title: text.columns.status, nowrap: true }
  return {
    full: [
      pick(44),
      name,
      status,
      { key: 'lr', title: 'lr', nowrap: true, cellClass: 'exp-cell-mono' },
      { key: 'batch', title: 'batch', nowrap: true, cellClass: 'exp-cell-mono' },
      { key: 'best', title: text.columns.best, nowrap: true, cellClass: 'exp-cell-mono' },
      { key: 'duration', title: text.columns.duration, nowrap: true, cellClass: 'exp-cell-num' },
    ],
    narrow: [pick(40), name, status, { key: 'best', title: text.columns.bestShort, nowrap: true, cellClass: 'exp-cell-mono' }],
  }
}

const COLUMNS = { zh: buildColumns(zhCopy), en: buildColumns(enCopy) }

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Layout ───────────────────────────────────────────────────────────────────

function layoutOf(width: number): Layout {
  if (width === 0)
    return 'column'
  return width < 640 ? 'narrow' : width < 960 ? 'column' : 'wide'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The slot reports 0 on the first frame. */
function stageOf(height: number): number {
  return height || STAGE_H
}

// The chart fills its pane: the stage less the header and the runs strip, and its
// own padding and legend (42px). It has no upper bound, or an expanded stage leaves
// a band above the runs. Narrow scrolls, so it only keeps the chart on screen.
function chartHeight(layout: Layout, height: number): number {
  const stage = stageOf(height)
  return layout === 'narrow'
    ? clamp(stage - 220, 220, 420)
    : Math.max(160, stage - HEAD_H - TABLE_H - 42)
}

// Wide stacks the sweep over the config; the column shows one of them beside
// the chart, under the side tabs.
function heatHeight(layout: Layout, height: number): number {
  const stage = stageOf(height)
  if (layout === 'narrow')
    return clamp(stage - 360, 200, 280)
  if (layout === 'wide')
    return clamp(stage - 430, 150, 320)
  return clamp(stage - HEAD_H - TABLE_H - 104, 140, 360)
}

function columnsFor(layout: Layout): DataTableColumn[] {
  return COLUMNS[lang.value][layout === 'narrow' ? 'narrow' : 'full']
}

// ── State ────────────────────────────────────────────────────────────────────

const live = reactive<{ step: number, status: LiveStatus, streaming: boolean }>({ step: START_STEP, status: 'running', streaming: false })
const metric = ref<Metric>('valAcc')
const compared = ref<RunId[]>([...RUN_IDS])
const focused = ref<RunId>(LIVE_ID)
const hovered = ref<RunId | null>(null)
/** Runs picked by boxing heatmap cells; the comparison follows them until the box clears. */
const boxed = ref<RunId[] | null>(null)
const view = ref<[number, number] | null>(null)
const narrowTab = ref<NarrowTab>('curves')
const sideTab = ref<SideTab>('sweep')
/** The heatmap mounts once it is first on screen, then stays (and keeps its box) while hidden. */
const heatReady = ref(false)
const heatSelectable = ref(true)
const toast = reactive({ open: false, text: '', tone: 'success' as 'success' | 'info' })

let entered = false
let timers: ReturnType<typeof setTimeout>[] = []
let toastTimer: ReturnType<typeof setTimeout> | undefined
/** The comparison from before the box, put back when it clears. */
let beforeBox: RunId[] | null = null
/** Whether the press in progress on the heatmap started over a box. */
let heatPressBoxed = false

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

// ── Derived ──────────────────────────────────────────────────────────────────

/** r6's best so far. Moves only when a validation point beats it, so the heatmap redraws that rarely. */
const liveBest = computed(() => bestUpTo(SERIES[LIVE_ID].valAcc, live.step))

function bestOf(id: RunId): number {
  return id === LIVE_ID ? liveBest.value : FINAL_BEST[id]
}

function statusOf(run: RunSpec): RunStatus {
  return run.outcome === 'live' ? live.status : run.outcome
}

function stepOf(run: RunSpec): number {
  return run.outcome === 'live' ? live.step : run.end
}

/** The run with the best validation accuracy so far; a tie stays with the earlier run. */
const leader = computed<RunId>(() => RUN_IDS.reduce((best, id) => (bestOf(id) > bestOf(best) ? id : best)))

function formatStep(step: number): string {
  return step.toLocaleString('en-US')
}

function formatValue(value: number): string {
  return value.toFixed(3)
}

function formatBest(value: number): string {
  return round(value, 3).toFixed(3)
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  return copy.value.duration(Math.floor(total / 60), String(total % 60).padStart(2, '0'))
}

const rows = computed<RunRow[]>(() => RUNS.map(run => ({
  id: run.id,
  lr: run.lr,
  batch: run.batch,
  status: statusOf(run),
  best: bestOf(run.id),
  leader: run.id === leader.value,
  duration: formatDuration(stepOf(run) * run.secondsPerStep),
})))

function rowClass(row: RunRow): Record<string, boolean> {
  return { 'is-focus': row.id === focused.value }
}

/** What a run has logged so far: r6 up to its current step, the others in full. */
function logged(id: RunId, key: Metric): Point[] {
  const points = SERIES[id][key]
  return id === LIVE_ID ? points.filter(([step]) => step <= live.step) : points
}

// Only r6's array is new on a tick; the finished runs hand over the same arrays.
const curveRuns = computed<LearningCurveRun[]>(() => RUNS.map(run => ({
  name: run.id,
  color: RUN_COLOR[run.id],
  data: logged(run.id, metric.value),
})))

const hiddenRuns = computed(() => RUN_IDS.filter(id => !compared.value.includes(id)))
// Emphasizing a hidden run would dim every line that is drawn.
const highlighted = computed(() => (hovered.value && compared.value.includes(hovered.value) ? hovered.value : null))
const allCompared = computed(() => compared.value.length === RUN_IDS.length)
const someCompared = computed(() => compared.value.length > 0 && !allCompared.value)

const chartName = computed(() => compared.value.length
  ? copy.value.chartName(METRIC_LABEL[metric.value], compared.value.join(copy.value.list))
  : copy.value.chartEmpty(METRIC_LABEL[metric.value]))

/** The latest reading, shown beside each legend item when there is room. */
function legendValue(id: RunId): string {
  const points = logged(id, metric.value)
  const last = points[points.length - 1]
  return last ? formatValue(last[1]) : ''
}

const zoomLabel = computed(() => {
  const range = view.value
  return range ? copy.value.zoomed(`${formatStep(Math.round(range[0]))}–${formatStep(Math.round(range[1]))}`) : ''
})

const heatValues = computed(() => GRID_RUNS.map(row => row.map(id => bestOf(id))))

const boxedNote = computed(() => boxed.value
  ? copy.value.boxed(boxed.value.length, boxed.value.join(copy.value.list))
  : copy.value.sweepHint)

function cellOf(params: unknown): { column: number, row: number, value: number } | null {
  if (!params || typeof params !== 'object')
    return null
  const { value, data } = params as { value?: unknown, data?: unknown }
  const triple = Array.isArray(value) ? value : Array.isArray(data) ? data : null
  if (!triple || triple.length < 3)
    return null
  const [column, row, best] = triple.map(Number) as [number, number, number]
  return Number.isInteger(column) && Number.isInteger(row) && Number.isFinite(best) ? { column, row, value: best } : null
}

function runAt(cell: { column: number, row: number }): RunId | undefined {
  return GRID_RUNS[cell.row]?.[cell.column]
}

/** Names the run behind a cell. It returns HTML; every part of it is a constant here. */
function heatTooltip(params: unknown): string {
  const cell = cellOf(params)
  const id = cell && runAt(cell)
  if (!cell || !id)
    return ''
  return `<b>${id}</b> · ${GRID_COLUMNS[cell.column]} · ${GRID_ROWS[cell.row]}<br/>${copy.value.bestLabel} ${formatBest(cell.value)}`
}

// One stable object: TxEChart re-themes the chart on every new `option`. The
// scale bar is hidden, not dropped — `visual-map` false would also drop the
// colour mapping.
const HEAT_OPTION = {
  visualMap: { show: false },
  tooltip: { formatter: heatTooltip },
}

function stateText(run: RunSpec): string {
  const state = copy.value.state
  switch (statusOf(run)) {
    case 'running':
      return state.running(formatStep(live.step))
    case 'stopped':
      return state.stopped(formatStep(stepOf(run)))
    case 'failed':
      return state.failed
    default:
      return state.done
  }
}

const configItems = computed(() => {
  const text = copy.value
  const run = RUN_BY_ID[focused.value]
  return [
    { key: 'optimizer', label: text.config.optimizer, value: text.optimizer },
    { key: 'lr', label: text.config.lr, value: text.schedule(run.lr) },
    { key: 'batch', label: text.config.batch, value: String(run.batch) },
    { key: 'epochs', label: text.config.epochs, value: text.epochs(TOTAL_STEPS * run.batch / DATASET_SIZE) },
    { key: 'seed', label: text.config.seed, value: String(run.seed) },
    { key: 'dataset', label: text.config.dataset, value: text.dataset },
    { key: 'commit', label: text.config.commit, value: COMMIT },
    { key: 'gpu', label: text.config.gpu, value: GPU },
    { key: 'state', label: text.config.state, value: stateText(run) },
  ]
})

/** Which parts are on screen: everything when wide, a side tab beside the chart in the column, one tab when narrow. */
function shows(part: Part, layout: Layout): boolean {
  if (layout === 'wide')
    return true
  if (layout === 'column')
    return part === 'chart' || part === 'runs' || part === sideTab.value
  if (narrowTab.value === 'curves')
    return part === 'chart'
  return part === 'config' || part === narrowTab.value
}

// ── Playback: r6 trains on ───────────────────────────────────────────────────

function onEnter(): void {
  entered = true
  start(false)
}

/**
 * Streams r6 to step 6,000. Reduced motion lands on the end at once, toasting
 * only when the reader asked for it (Resume), not on arrival.
 */
function start(announce: boolean): void {
  if (live.status !== 'running' || live.streaming)
    return
  if (prefersReducedMotion()) {
    finishLive(announce)
    return
  }
  live.streaming = true
  later(TICK_MS, tick)
}

function tick(): void {
  live.step = Math.min(TOTAL_STEPS, live.step + STEPS_PER_TICK)
  if (live.step >= TOTAL_STEPS)
    finishLive(true)
  else
    later(TICK_MS, tick)
}

function finishLive(announce: boolean): void {
  clearTimers()
  live.step = TOTAL_STEPS
  live.status = 'done'
  live.streaming = false
  if (announce)
    openToast(copy.value.toast.done(LIVE_ID, formatBest(liveBest.value)))
}

function stopLive(): void {
  if (live.status !== 'running')
    return
  clearTimers()
  live.status = 'stopped'
  live.streaming = false
  openToast(copy.value.toast.stopped(LIVE_ID, formatStep(live.step)), 'info')
}

function resumeLive(): void {
  if (live.status !== 'stopped')
    return
  live.status = 'running'
  if (entered)
    start(true)
}

// One button: Stop while r6 trains, Resume once stopped. A finished run has
// nothing to stop, so the button stays and says so by being disabled.
const action = computed(() => live.status === 'stopped'
  ? { label: copy.value.resume, variant: 'primary' as const, icon: 'i-carbon-play-filled-alt', disabled: false }
  : { label: copy.value.stop, variant: 'secondary' as const, icon: 'i-carbon-stop-filled-alt', disabled: live.status === 'done' })

function onAction(): void {
  if (live.status === 'stopped')
    resumeLive()
  else
    stopLive()
}

// ── Toast ────────────────────────────────────────────────────────────────────

/** Arms the toast's own dismissal. It runs under reduced motion too: that setting removes movement, not the timer. */
function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
  }, ms)
}

// Pointer or keyboard focus resting on the toast holds it open, so its close
// button can be reached; it re-arms shortly after both have left.
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

function openToast(text: string, tone: 'success' | 'info' = 'success'): void {
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

// ── Comparing runs ───────────────────────────────────────────────────────────

/**
 * TxHeatmapChart keeps its box to itself. Turning `selectable` off for a tick
 * is the one way to clear it from outside, and it keeps ECharts mounted.
 */
function dropBox(): void {
  if (!heatSelectable.value)
    return
  heatSelectable.value = false
  void nextTick(() => {
    heatSelectable.value = true
  })
}

/** A tick or a legend click edits the comparison directly, so a box that set it lets go. */
function setCompared(ids: readonly RunId[]): void {
  if (boxed.value) {
    boxed.value = null
    beforeBox = null
    dropBox()
  }
  compared.value = RUN_IDS.filter(id => ids.includes(id))
}

function toggleCompare(id: RunId): void {
  setCompared(compared.value.includes(id) ? compared.value.filter(other => other !== id) : [...compared.value, id])
}

function toggleAll(on: boolean): void {
  setCompared(on ? RUN_IDS : [])
}

function onHeatPress(): void {
  heatPressBoxed = boxed.value !== null
}

function onHeatSelect(selection: HeatmapSelection | null): void {
  if (!selection) {
    if (boxed.value) {
      compared.value = beforeBox ?? [...RUN_IDS]
      boxed.value = null
      beforeBox = null
    }
    return
  }
  const picked = new Set(selection.cells.map(runAt).filter((id): id is RunId => id !== undefined))
  if (!picked.size)
    return
  if (!boxed.value)
    beforeBox = compared.value
  const ids = RUN_IDS.filter(id => picked.has(id))
  compared.value = ids
  boxed.value = ids
}

/** Focusing a run shows its config; in the column that is the other side tab. */
function focusRun(id: RunId, layout: Layout): void {
  focused.value = id
  if (layout === 'column')
    sideTab.value = 'config'
}

function onHeatClick(params: EChartEventParams, layout: Layout): void {
  // A click over a box only clears it (and restores the comparison).
  if (heatPressBoxed)
    return
  const cell = cellOf(params)
  const id = cell && runAt(cell)
  if (id)
    focusRun(id, layout)
}

function setMetric(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (value === 'valAcc' || value === 'valLoss' || value === 'trainLoss')
    metric.value = value
}

function setNarrowTab(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (value === 'curves' || value === 'runs' || value === 'sweep')
    narrowTab.value = value
}

function setSideTab(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (value === 'sweep' || value === 'config')
    sideTab.value = value
}

/** Back to every step. The chip leaves with the zoom, so focus moves to the chart under it. */
function resetZoom(event: MouseEvent): void {
  const chip = event.currentTarget as HTMLElement
  const plot = chip.parentElement
  const hadFocus = chip.contains(document.activeElement)
  view.value = null
  if (hadFocus)
    void nextTick(() => plot?.querySelector<SVGElement>('.tx-chart__svg')?.focus({ preventScroll: true }))
}

// TxDataTable reports clicks, not hover: the strip reads the run off the row
// under the pointer (or holding focus) to emphasize its curve.
function runUnder(target: EventTarget | null): RunId | null {
  const row = target instanceof Element ? target.closest('tr') : null
  const id = row?.querySelector<HTMLElement>('[data-run]')?.dataset.run
  return RUN_IDS.find(run => run === id) ?? null
}

function onRunsPointer(event: Event): void {
  hovered.value = runUnder(event.target)
}

function onRunsFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    hovered.value = null
}

// ── Reset ────────────────────────────────────────────────────────────────────

function resetDemo(): void {
  clearTimers()
  closeToast()
  live.step = START_STEP
  live.status = 'running'
  live.streaming = false
  metric.value = 'valAcc'
  compared.value = [...RUN_IDS]
  focused.value = LIVE_ID
  hovered.value = null
  boxed.value = null
  beforeBox = null
  view.value = null
  narrowTab.value = 'curves'
  sideTab.value = 'sweep'
  dropBox()
  if (entered)
    void nextTick(() => start(false))
}

watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearTimers()
  clearTimeout(toastTimer)
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="STAGE_H" @enter="onEnter">
    <template #default="{ width, height }">
      <div class="exp">
        <header class="exp-head">
          <span class="exp-head__mark" aria-hidden="true">
            <span class="i-carbon-chart-multi-line" />
          </span>
          <div class="exp-head__brand">
            <span class="exp-head__title">{{ PROJECT }}</span>
            <span class="exp-head__subtitle">{{ copy.subtitle }}</span>
          </div>
          <span class="exp-head__status">
            <!-- The indicator's label is a live region: the step count stays out of it. -->
            <TxWorkingIndicator
              v-if="live.status === 'running'"
              variant="dots"
              :label="copy.training(LIVE_ID)"
              :show-elapsed="false"
            />
            <TxStatusBadge
              v-else
              size="sm"
              :status="STATUS_TONE[live.status]"
              :icon="STATUS_ICON[live.status]"
              :text="live.status === 'done' ? copy.finished(LIVE_ID) : copy.halted(LIVE_ID)"
            />
            <span
              v-if="live.status === 'running' && layoutOf(width) !== 'narrow'"
              class="exp-head__step"
              aria-hidden="true"
            >{{ formatStep(live.step) }} / {{ formatStep(TOTAL_STEPS) }}</span>
          </span>
          <div class="exp-head__controls">
            <TxFlatRadio
              :model-value="metric"
              size="sm"
              :aria-label="copy.metricLabel"
              @update:model-value="setMetric"
            >
              <TxFlatRadioItem v-for="key in METRICS" :key="key" :value="key" :label="METRIC_LABEL[key]" />
            </TxFlatRadio>
            <TxButton
              :variant="action.variant"
              size="sm"
              :icon="action.icon"
              :disabled="action.disabled"
              @click="onAction"
            >
              {{ action.label }}
            </TxButton>
          </div>
        </header>

        <TxFlatRadio
          v-if="layoutOf(width) === 'narrow'"
          :model-value="narrowTab"
          class="exp-tabs"
          :aria-label="copy.tabsLabel"
          @update:model-value="setNarrowTab"
        >
          <TxFlatRadioItem value="curves" :label="copy.tabs.curves" />
          <TxFlatRadioItem value="runs" :label="copy.tabs.runs" />
          <TxFlatRadioItem value="sweep" :label="copy.tabs.sweep" />
        </TxFlatRadio>

        <div class="exp-body">
          <section v-show="shows('chart', layoutOf(width))" class="exp-chart" :aria-label="copy.chartRegion">
            <div class="exp-legend" role="group" :aria-label="copy.legendLabel">
              <TxChartLegendItem
                v-for="run in RUNS"
                :key="run.id"
                class="exp-legend__item"
                :name="run.id"
                :color="RUN_COLOR[run.id]"
                :value="layoutOf(width) === 'wide' ? legendValue(run.id) : undefined"
                :inactive="!compared.includes(run.id)"
                :aria-pressed="compared.includes(run.id)"
                @click="toggleCompare(run.id)"
                @pointerenter="hovered = run.id"
                @pointerleave="hovered = null"
                @focus="hovered = run.id"
                @blur="hovered = null"
              />
            </div>
            <div class="exp-chart__plot">
              <TxLearningCurve
                v-model:window="view"
                :runs="curveRuns"
                :hidden-runs="hiddenRuns"
                :highlighted-run="highlighted"
                :smoothing="metric === 'trainLoss' ? 0.6 : 0.3"
                :x-axis-name="copy.xAxis"
                :y-axis-name="METRIC_LABEL[metric]"
                :step-format="formatStep"
                :tooltip-value-format="formatValue"
                :height="chartHeight(layoutOf(width), height)"
                :aria-description="chartName"
                :labels="copy.curveLabels"
              />
              <p v-if="!compared.length" class="exp-chart__empty">
                {{ copy.empty }}
              </p>
              <button v-if="view" type="button" class="exp-zoom" @click="resetZoom">
                <span class="i-carbon-zoom-reset" aria-hidden="true" />
                <span class="exp-zoom__text">{{ zoomLabel }}</span>
                <span class="exp-sr">{{ copy.showAll }}</span>
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </section>

          <div class="exp-side">
            <TxFlatRadio
              v-if="layoutOf(width) === 'column'"
              :model-value="sideTab"
              class="exp-side__tabs"
              size="sm"
              :aria-label="copy.sideTabsLabel"
              @update:model-value="setSideTab"
            >
              <TxFlatRadioItem value="sweep" :label="copy.sideTabs.sweep" />
              <TxFlatRadioItem value="config" :label="copy.sideTabs.config" />
            </TxFlatRadio>

            <section v-show="shows('sweep', layoutOf(width))" class="exp-sweep" :aria-label="copy.sweepTitle">
              <div v-if="layoutOf(width) !== 'column'" class="exp-section-head">
                <span class="i-carbon-heat-map exp-section-head__icon" aria-hidden="true" />
                <span class="exp-section-head__title">{{ copy.sweepTitle }}</span>
                <span class="exp-section-head__meta">{{ copy.sweepMeta }}</span>
              </div>
              <!-- Keeps the chart's height while ECharts loads. -->
              <div
                class="exp-heat"
                :style="{ height: `${heatHeight(layoutOf(width), height)}px` }"
                @pointerdown.capture="onHeatPress"
              >
                <TxHeatmapChart
                  v-if="heatReady || (width > 0 && shows('sweep', layoutOf(width)))"
                  :values="heatValues"
                  :rows="GRID_ROWS"
                  :columns="GRID_COLUMNS"
                  :min="HEAT_MIN"
                  :max="HEAT_MAX"
                  show-label
                  :selectable="heatSelectable"
                  :option="HEAT_OPTION"
                  :height="heatHeight(layoutOf(width), height)"
                  :aria-label="copy.sweepLabel"
                  :labels="copy.heatLabels"
                  @ready="heatReady = true"
                  @select="onHeatSelect"
                  @click="onHeatClick($event, layoutOf(width))"
                />
              </div>
              <p class="exp-sweep__note">
                {{ boxedNote }}
              </p>
            </section>

            <section v-show="shows('config', layoutOf(width))" class="exp-config" :aria-label="copy.configTitle(focused)">
              <div class="exp-section-head">
                <span class="exp-dot" :style="{ background: RUN_COLOR[focused] }" aria-hidden="true" />
                <span class="exp-section-head__title">{{ copy.configTitle(focused) }}</span>
                <TxTag class="exp-section-head__tag" :label="copy.sample" variant="plain" size="sm" />
              </div>
              <TxDescriptions class="exp-config__list" size="sm" :columns="layoutOf(width) === 'narrow' ? 2 : 1">
                <TxDescriptionsItem v-for="item in configItems" :key="item.key" :label="item.label">
                  {{ item.value }}
                </TxDescriptionsItem>
              </TxDescriptions>
            </section>
          </div>

          <section
            v-show="shows('runs', layoutOf(width))"
            class="exp-runs"
            :aria-label="copy.runsRegion"
            @pointerover="onRunsPointer"
            @pointerleave="hovered = null"
            @focusin="onRunsPointer"
            @focusout="onRunsFocusOut"
          >
            <TxDataTable
              row-key="id"
              :columns="columnsFor(layoutOf(width))"
              :data="rows"
              :row-class="rowClass"
              :max-height="layoutOf(width) === 'narrow' ? undefined : TABLE_H - 1"
              :sticky-header="layoutOf(width) !== 'narrow'"
              @row-click="({ row }) => focusRun(row.id, layoutOf(width))"
            >
              <template #header-pick>
                <span class="exp-pick">
                  <TxCheckbox
                    :model-value="allCompared"
                    :indeterminate="someCompared"
                    :aria-label="copy.compareAll"
                    @update:model-value="toggleAll"
                  />
                </span>
              </template>
              <!-- The tick only compares; a click on the rest of the row focuses the run. -->
              <template #cell-pick="{ row }">
                <span class="exp-pick" :style="PICK_STYLE[row.id as RunId]" @click.stop>
                  <TxCheckbox
                    :model-value="compared.includes(row.id)"
                    :aria-label="copy.compareRun(row.id)"
                    @update:model-value="toggleCompare(row.id)"
                  />
                </span>
              </template>
              <template #cell-name="{ row }">
                <span class="exp-run" :data-run="row.id">
                  <span class="exp-run__id">{{ row.id }}</span>
                  <span v-if="layoutOf(width) === 'narrow'" class="exp-run__meta">lr {{ row.lr }} · bs {{ row.batch }}</span>
                </span>
              </template>
              <template #cell-status="{ row }">
                <span class="exp-status">
                  <TxStatusBadge
                    size="sm"
                    :status="STATUS_TONE[row.status as RunStatus]"
                    :icon="STATUS_ICON[row.status as RunStatus]"
                    :text="copy.status[row.status as RunStatus]"
                  />
                </span>
              </template>
              <template #cell-best="{ row }">
                <span class="exp-best" :class="{ 'is-leader': row.leader }">
                  {{ formatBest(row.best) }}
                  <template v-if="row.leader">
                    <span class="i-carbon-trophy exp-best__icon" aria-hidden="true" />
                    <span class="exp-sr">{{ copy.leader }}</span>
                  </template>
                </span>
              </template>
            </TxDataTable>
          </section>
        </div>

        <!-- Keeps its box while closed, so it is inert until it opens; pointer
             or focus on it holds it open, otherwise it closes by itself. -->
        <div
          class="exp-toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toastLabel">
            <div class="exp-toast__card">
              <span
                class="exp-toast__icon"
                :class="[`is-${toast.tone}`, toast.tone === 'info' ? 'i-carbon-information' : 'i-carbon-checkmark-filled']"
                aria-hidden="true"
              />
              <span class="exp-toast__text">{{ toast.text }}</span>
              <button type="button" class="exp-toast__close" :aria-label="copy.dismiss" @click="closeToast">
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
/* A board: a header, then the chart beside the sweep, over the runs, divided
   by hairlines. Narrow first; the column and wide layouts are at the end. */
.exp {
  --exp-hairline: var(--tx-border-color-lighter, #ebeef5);
  /* Read here: the compare checkboxes repoint --tx-color-primary to their run. */
  --exp-focus: var(--tx-color-primary, #409eff);

  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.exp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
  white-space: nowrap;
}

/* Header ------------------------------------------------------------------- */

/* Narrow: the project and r6's state on one row, the controls on the next. */
.exp-head {
  display: flex;
  min-width: 0;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  box-sizing: border-box;
  padding: 10px 12px;
  box-shadow: 0 1px 0 var(--exp-hairline);
}

.exp-head__mark {
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

.exp-head__brand {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.exp-head__title,
.exp-head__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exp-head__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 18px;
}

.exp-head__subtitle {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 16px;
}

.exp-head__status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.exp-head__status :deep(.tx-bui-working-indicator__label) {
  font-size: 12px;
}

.exp-head__step {
  color: var(--tx-text-color-regular, #606266);
  font-family: var(--tx-font-mono, ui-monospace, 'SF Mono', monospace);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.exp-head__controls {
  display: flex;
  min-width: 0;
  flex: 1 0 100%;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* Narrow tabs, stretched across the stage. */
.exp .exp-tabs {
  display: flex;
  flex: none;
  margin: 8px 12px 0;
}

.exp-tabs :deep(.tx-flat-radio-item) {
  min-width: 0;
  flex: 1 1 0;
}

/* Body --------------------------------------------------------------------- */

/* Narrow: one scrolling column. Positioned, so chart tooltips stay inside it. */
.exp-body {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
}

.exp-side {
  display: contents;
}

/* Chart -------------------------------------------------------------------- */

.exp-chart {
  position: relative;
  display: flex;
  min-width: 0;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 6px;
}

.exp-legend {
  display: flex;
  min-height: 16px;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
}

/* TxChartLegendItem draws no focus ring of its own. */
.exp-legend__item {
  border-radius: 4px;
}

.exp-legend__item:focus-visible {
  outline: 2px solid var(--exp-focus);
  outline-offset: 3px;
}

/* Without a reading the value span still renders, and its gap trails the name. */
.exp-legend__item :deep(.tx-chart-legend-item__value:empty) {
  display: none;
}

.exp-chart__plot {
  position: relative;
  min-width: 0;
}

/* Over the plot area, inside the chart's padding for its axes. */
.exp-chart__empty {
  position: absolute;
  inset: 24px 24px 48px 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  text-align: center;
  pointer-events: none;
}

/* TxLearningCurve zooms by a drag, ⌘/Ctrl + wheel or the keys, and a double-click
   resets it, but nothing on screen says so; the chip does. It sits in the chart's
   top padding. */
.exp-zoom {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  display: inline-flex;
  max-width: calc(100% - 96px);
  height: 24px;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  border-radius: 999px;
  background: var(--tx-bg-color-overlay, #fff);
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.exp-zoom:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.exp-zoom:focus-visible {
  outline: 2px solid var(--exp-focus);
  outline-offset: 2px;
}

.exp-zoom > [class^='i-carbon'] {
  flex: none;
}

.exp-zoom__text {
  min-width: 0;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sweep and config --------------------------------------------------------- */

.exp-sweep,
.exp-config {
  display: flex;
  min-width: 0;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

/* Narrow order: the runs table first, the config under whichever tab shows it. */
.exp-sweep {
  order: 2;
}

.exp-config {
  order: 3;
  box-shadow: inset 0 1px 0 var(--exp-hairline);
}

.exp-section-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  line-height: 20px;
}

.exp-section-head__icon {
  flex: none;
  color: var(--tx-text-color-regular, #606266);
  font-size: 15px;
}

.exp-section-head__title {
  flex: none;
  font-weight: 600;
  white-space: nowrap;
}

.exp-section-head__meta {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exp-section-head__tag {
  flex: none;
  margin-left: auto;
}

.exp-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
}

.exp-heat {
  position: relative;
  min-width: 0;
}

.exp-sweep__note {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 17px;
}

.exp-config__list {
  --tx-descriptions-gap: 6px;
}

/* Runs --------------------------------------------------------------------- */

.exp-runs {
  order: 1;
  min-width: 0;
  flex: none;
  padding-top: 8px;
}

/* The strip is a pane, not a card: no frame, tighter rows. */
.exp-runs :deep(.tx-data-table) {
  border: 0;
  border-radius: 0;
}

.exp-runs :deep(:is(.tx-data-table__th, .tx-data-table__cell)) {
  padding-block: 7px;
}

.exp-runs :deep(.exp-cell-pick) {
  padding-inline: 0;
}

.exp-runs :deep(.exp-cell-mono) {
  font-family: var(--tx-font-mono, ui-monospace, 'SF Mono', monospace);
  font-size: 12px;
}

.exp-runs :deep(:is(.exp-cell-mono, .exp-cell-num)) {
  font-variant-numeric: tabular-nums;
}

/* The focused run, whose config is the one shown, keeps a tint; hovering deepens it. */
.exp-runs :deep(.tx-data-table__table > tbody > tr.tx-data-table__row.is-focus) {
  --tx-data-table-row-tint: color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent);
}

.exp-runs :deep(.tx-data-table.is-hover .tx-data-table__table > tbody > tr.tx-data-table__row.is-focus:hover) {
  --tx-data-table-row-tint: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.exp-runs :deep(tr.is-focus .exp-run__id) {
  font-weight: 600;
}

.exp-pick {
  display: flex;
  height: 20px;
  align-items: center;
  justify-content: center;
}

.exp-pick :deep(.tx-checkbox:focus-visible) {
  border-radius: 5px;
  outline: 2px solid var(--exp-focus);
  outline-offset: 2px;
}

.exp-run {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.exp-run__id {
  font-family: var(--tx-font-mono, ui-monospace, 'SF Mono', monospace);
}

.exp-run__meta {
  color: var(--tx-text-color-regular, #606266);
  font-family: var(--tx-font-mono, ui-monospace, 'SF Mono', monospace);
  font-size: 12px;
}

.exp-status {
  display: flex;
  align-items: center;
}

.exp-best {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.exp-best.is-leader {
  color: var(--tx-bui-accent-ink, #0170dd);
  font-weight: 600;
}

.exp-best__icon {
  flex: none;
  color: var(--tx-color-warning, #e6a23c);
  font-size: 14px;
}

/* Toast -------------------------------------------------------------------- */

/* Narrow: along the bottom edge. It keeps its box while closed, so it lets
   clicks through until it opens. */
.exp-toast {
  position: absolute;
  z-index: 4;
  right: 12px;
  bottom: 12px;
  left: 12px;
  pointer-events: none;
}

.exp-toast.is-open {
  pointer-events: auto;
}

.exp-toast__card {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}

.exp-toast__icon {
  flex: none;
  font-size: 15px;
}

.exp-toast__icon.is-success {
  color: var(--tx-color-success, #67c23a);
}

.exp-toast__icon.is-info {
  color: var(--tx-color-primary, #409eff);
}

.exp-toast__text {
  min-width: 0;
  flex: 1;
  font-weight: 500;
}

.exp-toast__close {
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

.exp-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.exp-toast__close:focus-visible {
  outline: 2px solid var(--exp-focus);
  outline-offset: 1px;
}

/* Column (640–959): a 56px header over the chart beside one side tab, with the
   runs strip along the bottom. -------------------------------------------- */

@container template (min-width: 640px) {
  .exp-head {
    height: 56px;
    flex-wrap: nowrap;
    gap: 12px;
    padding: 0 14px;
  }

  .exp-head__controls {
    flex: none;
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .exp-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 292px;
    /* The second row is TABLE_H in the script. */
    grid-template-rows: minmax(0, 1fr) 266px;
    grid-template-areas:
      'chart side'
      'runs runs';
    overflow: hidden;
  }

  .exp-chart {
    min-height: 0;
    grid-area: chart;
    padding: 12px 14px 6px;
    overflow: hidden;
  }

  .exp-side {
    display: flex;
    min-height: 0;
    grid-area: side;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    box-shadow: inset 1px 0 0 var(--exp-hairline);
  }

  .exp-side__tabs {
    flex: none;
    align-self: flex-start;
    margin: 10px 12px 0;
  }

  .exp-sweep {
    gap: 6px;
    padding: 8px 12px 10px;
  }

  .exp-config {
    padding: 8px 12px 12px;
    box-shadow: none;
  }

  /* A border, not an inset shadow: the sticky header row would paint over a shadow. */
  .exp-runs {
    min-height: 0;
    grid-area: runs;
    padding-top: 0;
    border-top: 1px solid var(--exp-hairline);
  }

  .exp-toast {
    top: 64px;
    right: 14px;
    bottom: auto;
    left: auto;
    width: min(320px, calc(100% - 28px));
  }
}

/* The step readout gives way first in a tight header. */
@container template (max-width: 759.98px) {
  .exp-head__step {
    display: none;
  }
}

/* Wide (≥ 960): the sweep and the config stack in a full-height side column. */
@container template (min-width: 960px) {
  .exp-body {
    grid-template-columns: minmax(0, 1fr) 320px;
    grid-template-areas:
      'chart side'
      'runs side';
  }

  .exp-sweep {
    gap: 8px;
    padding: 12px 14px 10px;
  }

  .exp-config {
    padding: 12px 14px 14px;
    box-shadow: inset 0 1px 0 var(--exp-hairline);
  }
}
</style>
