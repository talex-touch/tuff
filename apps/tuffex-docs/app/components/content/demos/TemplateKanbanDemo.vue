<script setup lang="ts">
// Kanban template: a four-column task board. Cards move between columns by
// dragging (native HTML5 drag, which spans lists) or from the keyboard: Space
// picks a card up, the arrow keys move it, Space or Enter drops it and Escape
// puts it back. Every move can be undone from the toast. Playback (the progress
// bars filling) starts on @enter; reduced motion renders the final state.
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type ColumnId = 'todo' | 'doing' | 'review' | 'done'
type Priority = 'high' | 'normal' | 'low'
type FilterId = 'all' | 'mine' | 'high' | 'overdue'
type Board = Record<ColumnId, string[]>

interface Bi { zh: string, en: string }

interface Card {
  id: string
  title: Bi
  summary: Bi
  tags: Bi[]
  assignee: 'lq' | 'ac' | 'nh' | 'mo' | 'ks'
  priority: Priority
  progress: number
  due: number
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

const COLUMNS: ColumnId[] = ['todo', 'doing', 'review', 'done']
const TIMER_FILL_STEPS = 12
const TIMER_FILL_MS = 60
const TOAST_MS = 4000
const TOAST_REARM_MS = 2000

// A fixed "now" keeps every due hint reproducible.
const NOW = Date.UTC(2026, 10, 5, 2, 0)
const DAY = 24 * 60 * 60 * 1000

const ASSIGNEES: Record<Card['assignee'], { name: Bi, hue: string }> = {
  lq: { name: { zh: '林乔', en: 'Lin Qiao' }, hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  ac: { name: { zh: 'Ava Chen', en: 'Ava Chen' }, hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: { zh: 'Noor Haddad', en: 'Noor Haddad' }, hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
  mo: { name: { zh: 'Mara Okafor', en: 'Mara Okafor' }, hue: 'var(--tx-chart-categorical-6, #d37536)' },
  ks: { name: { zh: '佐藤健二', en: 'Kenji Sato' }, hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
}

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--tx-bui-red, #e3474c)',
  normal: 'var(--tx-bui-accent, #0285ff)',
  low: 'var(--tx-bui-ink-3, #9a9da3)',
}

// Sample data, not a real backlog. The starting columns are the reader's first view.
const CARDS: Card[] = [
  { id: 'k1', title: { zh: 'CoreBox 结果列表的键盘选中态', en: 'Keyboard selection in the CoreBox list' }, summary: { zh: '方向键移动选中项，并保证预览同帧更新。', en: 'Arrow keys move the selection, and the preview updates in the same frame.' }, tags: [{ zh: 'CoreBox', en: 'CoreBox' }, { zh: '键盘', en: 'Keyboard' }], assignee: 'lq', priority: 'high', progress: 0, due: NOW + 2 * DAY },
  { id: 'k2', title: { zh: '剪贴板时间线的空状态插画', en: 'Empty-state art for the clipboard timeline' }, summary: { zh: '没有历史记录时显示的插画与提示文案。', en: 'The illustration and hint shown when there is no history yet.' }, tags: [{ zh: '设计', en: 'Design' }], assignee: 'ac', priority: 'low', progress: 0, due: NOW + 9 * DAY },
  { id: 'k3', title: { zh: '插件市场增量更新的文案', en: 'Copy for plugin store delta updates' }, summary: { zh: '更新说明与失败重试的提示。', en: 'Update notes and the retry hint for a failed download.' }, tags: [{ zh: '文案', en: 'Copy' }], assignee: 'nh', priority: 'normal', progress: 0, due: NOW - DAY },
  { id: 'k4', title: { zh: 'Prelude 示例代码审阅', en: 'Review the Prelude sample code' }, summary: { zh: '确认示例与当前 sdkapi 一致。', en: 'Check the sample against the current sdkapi.' }, tags: [{ zh: 'SDK', en: 'SDK' }, { zh: '文档', en: 'Docs' }], assignee: 'mo', priority: 'normal', progress: 60, due: NOW + DAY },
  { id: 'k5', title: { zh: '搜索主线程预算的火焰图分析', en: 'Flame-graph analysis for the search budget' }, summary: { zh: '按键到出结果之间的每一段耗时。', en: 'The time spent between a keystroke and the first result.' }, tags: [{ zh: '性能', en: 'Performance' }], assignee: 'ks', priority: 'high', progress: 35, due: NOW + 4 * DAY },
  { id: 'k6', title: { zh: '本地数据库单写入队列的迁移', en: 'Move the local database to one write queue' }, summary: { zh: '所有写入收拢到一个队列，读取保持原样。', en: 'Every write goes through one queue; reads stay as they are.' }, tags: [{ zh: '数据库', en: 'Database' }], assignee: 'lq', priority: 'high', progress: 80, due: NOW - 6 * 60 * 60 * 1000 },
  { id: 'k7', title: { zh: 'CMS 看板的拖放与键盘路径对照', en: 'Match the drag and keyboard paths on the CMS board' }, summary: { zh: '两条路径的结果必须一致。', en: 'Both paths have to end in the same state.' }, tags: [{ zh: '评审', en: 'Review' }, { zh: '无障碍', en: 'A11y' }], assignee: 'nh', priority: 'normal', progress: 90, due: NOW + DAY },
  { id: 'k8', title: { zh: '设置页的 Provider 表单错误文案', en: 'Provider form error copy in settings' }, summary: { zh: '错误提示留在控件下方。', en: 'Errors stay under the control they describe.' }, tags: [{ zh: '表单', en: 'Form' }], assignee: 'ac', priority: 'low', progress: 95, due: NOW + 3 * DAY },
  { id: 'k9', title: { zh: 'Tuff 2.4 发布说明的截图', en: 'Screenshots for the Tuff 2.4 release notes' }, summary: { zh: '三张截图，覆盖 CoreBox 与剪贴板。', en: 'Three screenshots covering CoreBox and the clipboard.' }, tags: [{ zh: '发布', en: 'Release' }], assignee: 'lq', priority: 'normal', progress: 100, due: NOW - 3 * DAY },
  { id: 'k10', title: { zh: '插件聚光灯的采访稿', en: 'Plugin spotlight interview draft' }, summary: { zh: '作者访谈的定稿与配图。', en: 'The final interview with the author, with images.' }, tags: [{ zh: '社区', en: 'Community' }], assignee: 'mo', priority: 'low', progress: 100, due: NOW - 10 * DAY },
  { id: 'k11', title: { zh: '截图 OCR 的回退策略说明', en: 'Notes on the screenshot OCR fallback' }, summary: { zh: '系统引擎失败时何时回退到 AI。', en: 'When the system engine fails and the AI fallback takes over.' }, tags: [{ zh: 'OCR', en: 'OCR' }], assignee: 'ks', priority: 'normal', progress: 100, due: NOW - 5 * DAY },
]

const PROGRESS_TARGET: Record<string, number> = Object.fromEntries(CARDS.map(card => [card.id, card.progress] as const))

function initialBoard(): Board {
  return {
    todo: ['k1', 'k2', 'k3'],
    doing: ['k4', 'k5', 'k6'],
    review: ['k7', 'k8'],
    done: ['k9', 'k10', 'k11'],
  }
}

const CARD_BY_ID = new Map(CARDS.map(card => [card.id, card] as const))

const copy = computed(() => zh.value
  ? {
      frameTitle: '任务看板',
      heading: '任务看板',
      sub: 'Tuff 2.5 发布 · 示例数据',
      hint: 'Space 拿起 · 方向键移动 · Space 或 Enter 放下 · Esc 取消 · Enter 查看详情',
      boardLabel: '任务看板的四列',
      filtersLabel: '按条件筛选',
      columns: { todo: '待办', doing: '进行中', review: '待审', done: '已完成' } as Record<ColumnId, string>,
      filters: { all: '全部', mine: '我负责的', high: '高优先级', overdue: '已逾期' } as Record<FilterId, string>,
      due: { today: '今天截止', tomorrow: '明天截止', later: (n: number) => `${n} 天后截止`, overdue: '已逾期', done: '已完成' },
      priority: { high: '高', normal: '普通', low: '低' } as Record<Priority, string>,
      cardRole: '任务卡片',
      picked: (title: string) => `已拿起「${title}」，方向键移动，Space 放下，Esc 取消`,
      stepped: (column: string, position: number) => `已移到「${column}」第 ${position} 位`,
      edge: '已到边缘，不能再移动',
      dropped: (title: string, column: string) => `已放下「${title}」，位于「${column}」`,
      canceled: '已取消移动',
      moved: (column: string) => `已移到「${column}」`,
      toastLabel: '操作结果',
      undo: '撤销',
      undone: '已撤销',
      detail: { column: '列', assignee: '负责人', due: '截止', progress: '进度', priority: '优先级', moveLeft: '移到上一列', moveRight: '移到下一列' },
    }
  : {
      frameTitle: 'Kanban',
      heading: 'Task board',
      sub: 'Tuff 2.5 release · sample data',
      hint: 'Space picks up · arrow keys move · Space or Enter drops · Esc cancels · Enter opens details',
      boardLabel: 'Task board columns',
      filtersLabel: 'Filter cards',
      columns: { todo: 'To do', doing: 'In progress', review: 'In review', done: 'Done' } as Record<ColumnId, string>,
      filters: { all: 'All', mine: 'Mine', high: 'High priority', overdue: 'Overdue' } as Record<FilterId, string>,
      due: { today: 'Due today', tomorrow: 'Due tomorrow', later: (n: number) => `Due in ${n} days`, overdue: 'Overdue', done: 'Done' },
      priority: { high: 'High', normal: 'Normal', low: 'Low' } as Record<Priority, string>,
      cardRole: 'Task card',
      picked: (title: string) => `Picked up “${title}”. Arrow keys move it, Space drops it, Escape cancels.`,
      stepped: (column: string, position: number) => `Moved to ${column}, position ${position}.`,
      edge: 'At the edge, it cannot move further.',
      dropped: (title: string, column: string) => `Dropped “${title}” in ${column}.`,
      canceled: 'Move cancelled.',
      moved: (column: string) => `Moved to ${column}`,
      toastLabel: 'Result',
      undo: 'Undo',
      undone: 'Undone',
      detail: { column: 'Column', assignee: 'Assignee', due: 'Due', progress: 'Progress', priority: 'Priority', moveLeft: 'Move left', moveRight: 'Move right' },
    })

const board = reactive<Board>(initialBoard())
const filter = ref<FilterId>('all')
const shown = reactive<Record<string, number>>({})
const entered = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const live = ref('')

// Keyboard pick-up: the card, where it came from, and the board it started from.
const picked = ref<{ id: string, snapshot: Board } | null>(null)
// Drag and drop: the card being dragged and the insertion point in its target column.
const dragId = ref<string | null>(null)
const dragSnapshot = ref<Board | null>(null)
const dropAt = ref<{ column: ColumnId, index: number } | null>(null)

const detailId = ref<string | null>(null)
const detailOpen = ref(false)

const toast = reactive({ open: false, text: '', undoable: false })
const toastHover = ref(false)
const toastFocus = ref(false)
let undoSnapshot: Board | null = null

let timers: Array<ReturnType<typeof setTimeout>> = []
let toastTimer: ReturnType<typeof setTimeout> | undefined

function later(ms: number, fn: () => void): void {
  timers.push(setTimeout(fn, ms))
}

function clearTimers(): void {
  for (const timer of timers)
    clearTimeout(timer)
  timers = []
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function cloneBoard(source: Board): Board {
  return { todo: [...source.todo], doing: [...source.doing], review: [...source.review], done: [...source.done] }
}

function applyBoard(next: Board): void {
  for (const column of COLUMNS)
    board[column] = [...next[column]]
}

function columnOf(id: string): ColumnId {
  return COLUMNS.find(column => board[column].includes(id)) ?? 'todo'
}

function indexOf(id: string): number {
  return board[columnOf(id)].indexOf(id)
}

function cardTitle(id: string): string {
  return L(CARD_BY_ID.get(id)!.title)
}

// Moves a card to `index` of `column`. The index counts the target list after
// the card has been removed from its old place.
function moveCard(id: string, column: ColumnId, index: number): void {
  const from = columnOf(id)
  board[from] = board[from].filter(item => item !== id)
  const list = [...board[column]]
  const at = Math.max(0, Math.min(index, list.length))
  list.splice(at, 0, id)
  board[column] = list
}

function commitMove(id: string, column: ColumnId, index: number, snapshot: Board): void {
  moveCard(id, column, index)
  showToast(copy.value.moved(copy.value.columns[column]), snapshot)
  live.value = copy.value.dropped(cardTitle(id), copy.value.columns[column])
}

// Toast: closes on its own after a few seconds. Pointer or focus on it holds
// it; it re-arms after both have left, reduced motion included.
function armToast(ms: number): void {
  clearTimeout(toastTimer)
  if (toastHover.value || toastFocus.value)
    return
  toastTimer = setTimeout(() => {
    toast.open = false
    undoSnapshot = null
  }, ms)
}

function showToast(text: string, snapshot: Board | null): void {
  undoSnapshot = snapshot
  toast.text = text
  toast.undoable = Boolean(snapshot)
  toast.open = true
  armToast(TOAST_MS)
}

function holdToast(source: 'pointer' | 'focus'): void {
  if (source === 'pointer')
    toastHover.value = true
  else
    toastFocus.value = true
  clearTimeout(toastTimer)
}

function releaseToast(source: 'pointer' | 'focus'): void {
  if (source === 'pointer')
    toastHover.value = false
  else
    toastFocus.value = false
  if (toast.open)
    armToast(TOAST_REARM_MS)
}

function undo(): void {
  if (!undoSnapshot)
    return
  applyBoard(undoSnapshot)
  undoSnapshot = null
  toast.open = false
  clearTimeout(toastTimer)
  live.value = copy.value.undone
}

// Playback: each bar fills from 0 to its value. Only ever started from @enter.
function fillProgress(): void {
  clearTimers()
  if (prefersReducedMotion()) {
    for (const id of Object.keys(PROGRESS_TARGET))
      shown[id] = PROGRESS_TARGET[id]!
    return
  }
  for (const id of Object.keys(PROGRESS_TARGET))
    shown[id] = 0
  let step = 0
  const tick = (): void => {
    step += 1
    const eased = 1 - (1 - step / TIMER_FILL_STEPS) ** 2
    for (const id of Object.keys(PROGRESS_TARGET))
      shown[id] = Math.round(PROGRESS_TARGET[id]! * eased)
    if (step < TIMER_FILL_STEPS)
      later(TIMER_FILL_MS, tick)
  }
  later(200, tick)
}

function play(): void {
  entered.value = true
  fillProgress()
}

function focusCard(id: string): void {
  rootRef.value?.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus()
}

function cardsIn(column: HTMLElement): HTMLElement[] {
  return [...column.querySelectorAll<HTMLElement>('[data-card-id]')]
}

// Keyboard: a card is focused, Space picks it up.
function pickUp(id: string): void {
  picked.value = { id, snapshot: cloneBoard(board) }
  live.value = copy.value.picked(cardTitle(id))
}

function dropPicked(): void {
  const current = picked.value
  if (!current)
    return
  picked.value = null
  const changed = JSON.stringify(current.snapshot) !== JSON.stringify(board)
  live.value = copy.value.dropped(cardTitle(current.id), copy.value.columns[columnOf(current.id)])
  if (changed)
    showToast(copy.value.moved(copy.value.columns[columnOf(current.id)]), current.snapshot)
  void nextTick(() => focusCard(current.id))
}

function cancelPick(): void {
  const current = picked.value
  if (!current)
    return
  applyBoard(current.snapshot)
  picked.value = null
  live.value = copy.value.canceled
  void nextTick(() => focusCard(current.id))
}

function stepInColumn(id: string, delta: number): void {
  const column = columnOf(id)
  const target = indexOf(id) + delta
  if (target < 0 || target >= board[column].length) {
    live.value = copy.value.edge
    return
  }
  moveCard(id, column, target)
  live.value = copy.value.stepped(copy.value.columns[column], target + 1)
  void nextTick(() => focusCard(id))
}

function stepColumn(id: string, delta: number): void {
  const current = COLUMNS.indexOf(columnOf(id))
  const next = COLUMNS[current + delta]
  if (!next) {
    live.value = copy.value.edge
    return
  }
  const position = indexOf(id)
  moveCard(id, next, position)
  live.value = copy.value.stepped(copy.value.columns[next], indexOf(id) + 1)
  void nextTick(() => focusCard(id))
}

// Arrow keys without a pick-up move focus between cards.
function focusNeighbour(element: HTMLElement, delta: number): void {
  const column = element.closest<HTMLElement>('[data-column]')
  if (!column)
    return
  const cards = cardsIn(column)
  cards[cards.indexOf(element) + delta]?.focus()
}

function focusColumn(element: HTMLElement, delta: number): void {
  const column = element.closest<HTMLElement>('[data-column]')
  const columns = [...(rootRef.value?.querySelectorAll<HTMLElement>('[data-column]') ?? [])]
  const next = columns[columns.indexOf(column!) + delta]
  if (!next)
    return
  const cards = cardsIn(next)
  if (!cards.length)
    return
  const position = cardsIn(column!).indexOf(element)
  cards[Math.min(Math.max(position, 0), cards.length - 1)]?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-card-id]')
  if (picked.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelPick()
      return
    }
    if (!element || element.dataset.cardId !== picked.value.id)
      return
    const id = picked.value.id
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      dropPicked()
    }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      stepInColumn(id, event.key === 'ArrowUp' ? -1 : 1)
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      stepColumn(id, event.key === 'ArrowLeft' ? -1 : 1)
    }
    return
  }
  if (!element)
    return
  const id = element.dataset.cardId ?? ''
  if (event.key === ' ') {
    event.preventDefault()
    pickUp(id)
  }
  else if (event.key === 'Enter') {
    event.preventDefault()
    openDetail(id)
  }
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    focusNeighbour(element, event.key === 'ArrowUp' ? -1 : 1)
  }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    focusColumn(element, event.key === 'ArrowLeft' ? -1 : 1)
  }
}

// Leaving the board while a card is picked puts the card back.
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (picked.value && next && !rootRef.value?.contains(next))
    cancelPick()
}

// Drag and drop. The dragged card stays in the DOM so the browser keeps firing
// dragend on it; the drop index is measured against the full column.
function onDragStart(event: DragEvent, id: string): void {
  dragId.value = id
  dragSnapshot.value = cloneBoard(board)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}

function onColumnDragOver(event: DragEvent, column: ColumnId): void {
  if (!dragId.value)
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
  const cards = cardsIn(event.currentTarget as HTMLElement)
  let index = cards.length
  for (let i = 0; i < cards.length; i += 1) {
    const rect = cards[i]!.getBoundingClientRect()
    if (event.clientY < rect.top + rect.height / 2) {
      index = i
      break
    }
  }
  const next = { column, index }
  if (dropAt.value?.column !== next.column || dropAt.value?.index !== next.index)
    dropAt.value = next
}

function onColumnDrop(event: DragEvent, column: ColumnId): void {
  event.preventDefault()
  const id = dragId.value
  const snapshot = dragSnapshot.value
  const target = dropAt.value
  dragId.value = null
  dragSnapshot.value = null
  dropAt.value = null
  if (!id || !snapshot || !target || target.column !== column)
    return
  const from = columnOf(id)
  const origin = snapshot[from].indexOf(id)
  // The index was measured with the dragged card still in its list.
  const index = from === column && origin < target.index ? target.index - 1 : target.index
  commitMove(id, column, index, snapshot)
}

function onDragEnd(): void {
  dragId.value = null
  dragSnapshot.value = null
  dropAt.value = null
}

function isDropAt(column: ColumnId, index: number): boolean {
  return dropAt.value?.column === column && dropAt.value.index === index
}

// Filters dim the cards that do not match. The layout does not change, so
// every card keeps its place for keyboard and drag.
function matches(card: Card, filterValue: FilterId): boolean {
  if (filterValue === 'all')
    return true
  if (filterValue === 'mine')
    return card.assignee === 'lq'
  if (filterValue === 'high')
    return card.priority === 'high'
  return card.due < NOW && columnOf(card.id) !== 'done'
}

const filterItems = computed<FilterChipItem[]>(() => (['all', 'mine', 'high', 'overdue'] as FilterId[]).map(value => ({
  value,
  label: copy.value.filters[value],
  count: CARDS.filter(card => matches(card, value)).length,
  dot: value === 'overdue' ? 'var(--tx-bui-red, #e3474c)' : undefined,
})))

function onFilter(value: FilterChipValue): void {
  filter.value = value as FilterId
}

function dueHint(card: Card, column: ColumnId): { text: string, tone: 'danger' | 'warning' | 'muted' } {
  if (column === 'done')
    return { text: copy.value.due.done, tone: 'muted' }
  if (card.due < NOW)
    return { text: copy.value.due.overdue, tone: 'danger' }
  const days = Math.round((card.due - NOW) / DAY)
  if (days === 0)
    return { text: copy.value.due.today, tone: 'warning' }
  if (days === 1)
    return { text: copy.value.due.tomorrow, tone: 'warning' }
  return { text: copy.value.due.later(days), tone: 'muted' }
}

const dateFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }))

function avatarColors(id: Card['assignee']): { bg: string, ink: string } {
  const hue = ASSIGNEES[id].hue
  return {
    bg: `color-mix(in srgb, ${hue} 20%, var(--tx-bg-color, #fff))`,
    ink: `color-mix(in srgb, ${hue} 78%, var(--tx-text-color-primary, #303133))`,
  }
}

function cardLabel(card: Card, column: ColumnId): string {
  return `${L(card.title)}, ${copy.value.columns[column]}, ${copy.value.priority[card.priority]}, ${shown[card.id] ?? 0}%`
}

const detailCard = computed(() => (detailId.value ? CARD_BY_ID.get(detailId.value) ?? null : null))
const detailTitle = computed(() => (detailCard.value ? L(detailCard.value.title) : ''))

function openDetail(id: string): void {
  detailId.value = id
  detailOpen.value = true
}

// Buttons in the drawer are the non-drag path: the same moves, one column at a time.
function moveFromDetail(delta: number): void {
  const id = detailId.value
  if (!id)
    return
  const current = COLUMNS.indexOf(columnOf(id))
  const next = COLUMNS[current + delta]
  if (!next)
    return
  const snapshot = cloneBoard(board)
  commitMove(id, next, indexOf(id), snapshot)
}

function resetDemo(): void {
  clearTimers()
  clearTimeout(toastTimer)
  picked.value = null
  dragId.value = null
  dragSnapshot.value = null
  dropAt.value = null
  detailOpen.value = false
  detailId.value = null
  toast.open = false
  toastHover.value = false
  toastFocus.value = false
  undoSnapshot = null
  filter.value = 'all'
  applyBoard(initialBoard())
  for (const id of Object.keys(PROGRESS_TARGET))
    shown[id] = 0
  if (entered.value)
    play()
}

watch(locale, resetDemo)
defineExpose({ resetDemo })

onBeforeUnmount(() => {
  clearTimers()
  clearTimeout(toastTimer)
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="600" @enter="play">
    <template #default>
      <div ref="rootRef" class="kb" @keydown="onKeydown" @focusout="onFocusOut">
        <header class="kb-head">
          <div class="kb-title">
            <strong class="kb-heading">{{ copy.heading }}</strong>
            <span class="kb-sub">{{ copy.sub }}</span>
          </div>
          <p id="kb-hint" class="kb-hint">
{{ copy.hint }}
</p>
        </header>

        <div class="kb-chips">
          <TxFilterChips
            :model-value="filter"
            :items="filterItems"
            :aria-label="copy.filtersLabel"
            @update:model-value="onFilter"
          />
        </div>

        <div class="kb-board" role="group" :aria-label="copy.boardLabel">
          <section
            v-for="column in COLUMNS"
            :key="column"
            class="kb-col"
            :class="{ 'is-drop': dropAt?.column === column }"
            :data-column="column"
            :aria-labelledby="`kb-col-${column}`"
            @dragover="onColumnDragOver($event, column)"
            @drop="onColumnDrop($event, column)"
          >
            <header class="kb-col__head">
              <span :id="`kb-col-${column}`" class="kb-col__title">{{ copy.columns[column] }}</span>
              <TxBadge :value="board[column].length" />
            </header>

            <div class="kb-col__cards">
              <template v-for="(id, index) in board[column]" :key="id">
                <div v-if="isDropAt(column, index)" class="kb-drop" aria-hidden="true" />
                <article
                  class="kb-card"
                  role="button"
                  tabindex="0"
                  draggable="true"
                  :data-card-id="id"
                  :aria-label="cardLabel(CARD_BY_ID.get(id)!, column)"
                  :aria-roledescription="copy.cardRole"
                  aria-describedby="kb-hint"
                  :class="{
                    'is-picked': picked?.id === id,
                    'is-dragging': dragId === id,
                    'is-dimmed': !matches(CARD_BY_ID.get(id)!, filter),
                  }"
                  @click="openDetail(id)"
                  @dragstart="onDragStart($event, id)"
                  @dragend="onDragEnd"
                >
                  <span class="kb-card__top">
                    <TxDotIndicator :color="PRIORITY_COLOR[CARD_BY_ID.get(id)!.priority]" :size="6" :label="copy.priority[CARD_BY_ID.get(id)!.priority]" />
                  </span>
                  <span class="kb-card__title">{{ L(CARD_BY_ID.get(id)!.title) }}</span>
                  <span class="kb-card__tags">
                    <TxTag v-for="tag in CARD_BY_ID.get(id)!.tags" :key="tag.en" :label="L(tag)" variant="soft" />
                  </span>
                  <TxProgressBar :percentage="shown[id] ?? 0" />
                  <span class="kb-card__foot">
                    <TxStatusBadge
                      size="sm"
                      :status="dueHint(CARD_BY_ID.get(id)!, column).tone"
                      :text="dueHint(CARD_BY_ID.get(id)!, column).text"
                    />
                    <TxAvatar
                      :name="L(ASSIGNEES[CARD_BY_ID.get(id)!.assignee].name)"
                      :size="20"
                      :background-color="avatarColors(CARD_BY_ID.get(id)!.assignee).bg"
                      :text-color="avatarColors(CARD_BY_ID.get(id)!.assignee).ink"
                    />
                  </span>
                </article>
              </template>
              <div v-if="isDropAt(column, board[column].length)" class="kb-drop" aria-hidden="true" />
            </div>
          </section>
        </div>

        <p class="kb-sr" aria-live="polite">
{{ live }}
</p>

        <TxDrawer v-model:visible="detailOpen" :title="detailTitle" size="min(480px, 94vw)">
          <div v-if="detailCard" class="kb-detail">
            <p class="kb-detail__summary">
{{ L(detailCard.summary) }}
</p>
            <dl class="kb-detail__meta">
              <div>
                <dt>{{ copy.detail.column }}</dt>
                <dd>{{ copy.columns[columnOf(detailCard.id)] }}</dd>
              </div>
              <div>
                <dt>{{ copy.detail.assignee }}</dt>
                <dd>{{ L(ASSIGNEES[detailCard.assignee].name) }}</dd>
              </div>
              <div>
                <dt>{{ copy.detail.due }}</dt>
                <dd>{{ dateFormat.format(detailCard.due) }}</dd>
              </div>
              <div>
                <dt>{{ copy.detail.priority }}</dt>
                <dd>{{ copy.priority[detailCard.priority] }}</dd>
              </div>
              <div>
                <dt>{{ copy.detail.progress }}</dt>
                <dd><TxProgressBar :percentage="shown[detailCard.id] ?? 0" /></dd>
              </div>
            </dl>
            <div class="kb-detail__moves">
              <TxButton
                variant="secondary"
                size="sm"
                icon="i-carbon-arrow-left"
                :disabled="COLUMNS.indexOf(columnOf(detailCard.id)) === 0"
                @click="moveFromDetail(-1)"
              >
                {{ copy.detail.moveLeft }}
              </TxButton>
              <TxButton
                variant="secondary"
                size="sm"
                icon="i-carbon-arrow-right"
                :disabled="COLUMNS.indexOf(columnOf(detailCard.id)) === COLUMNS.length - 1"
                @click="moveFromDetail(1)"
              >
                {{ copy.detail.moveRight }}
              </TxButton>
            </div>
          </div>
        </TxDrawer>

        <div
          class="kb-toast"
          :inert="!toast.open"
          @pointerenter="holdToast('pointer')"
          @pointerleave="releaseToast('pointer')"
          @focusin="holdToast('focus')"
          @focusout="releaseToast('focus')"
        >
          <TxToastPanel :open="toast.open" side="above" :stack="0" :aria-label="copy.toastLabel">
            <span class="kb-toast__text">{{ toast.text }}</span>
            <TxButton v-if="toast.undoable" size="sm" variant="secondary" @click="undo">
{{ copy.undo }}
</TxButton>
          </TxToastPanel>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.kb {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 16px;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.kb-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 16px;
}

.kb-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.kb-heading {
  font-size: 14px;
  font-weight: 600;
}

.kb-sub,
.kb-hint {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.kb-board {
  display: grid;
  gap: 10px;
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  overflow-y: auto;
}

.kb-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border-radius: 14px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.kb-col.is-drop {
  box-shadow: inset 0 0 0 1px var(--tx-color-primary, #409eff);
}

.kb-col__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kb-col__title {
  font-size: 13px;
  font-weight: 600;
}

.kb-col__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.kb-drop {
  height: 3px;
  border-radius: 2px;
  background: var(--tx-color-primary, #409eff);
}

.kb-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  cursor: grab;
  outline: none;
}

.kb-card:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.kb-card.is-picked {
  box-shadow: 0 0 0 2px var(--tx-color-primary, #409eff);
}

.kb-card.is-dragging {
  opacity: 0.45;
}

.kb-card.is-dimmed {
  opacity: 0.4;
}

.kb-card__title {
  font-size: 13px;
  line-height: 1.4;
}

.kb-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.kb-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kb-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.kb-detail__summary {
  margin: 0;
  line-height: 1.5;
}

.kb-detail__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 0;
}

.kb-detail__meta div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.kb-detail__meta dt {
  color: var(--tx-text-color-secondary, #909399);
}

.kb-detail__meta dd {
  margin: 0;
  min-width: 0;
}

.kb-detail__moves {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kb-toast {
  position: absolute;
  right: 16px;
  bottom: 16px;
  left: 16px;
  pointer-events: none;
}

.kb-toast > * {
  pointer-events: auto;
}

.kb-toast__text {
  flex: 1;
  min-width: 0;
}

.kb-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* Under 640px the columns stack; from 640 two per row; from 760 the four
   columns sit side by side and each one scrolls inside the stage. */
@container template (min-width: 640px) {
  .kb-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container template (min-width: 760px) {
  .kb-board {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
  }

  .kb-col {
    min-height: 0;
  }

  .kb-col__cards {
    flex: 1;
    overflow-y: auto;
  }
}
</style>
