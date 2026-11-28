<script setup lang="ts">
import { useReducedMotion } from '@talex-touch/tuffex/utils'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * Two real TxDropdownMenus that differ only in `activation-feedback`. A capture
 * listener on the document stamps the input that activates one of their rows, a
 * MutationObserver on that row stamps `is-activation-clear` and
 * `is-activation-confirm` as they land, and the item's `select` closes the record.
 *
 * The replay re-enacts the recorded stamps on a slower clock. Its rows copy the
 * TxCardItem looks the real row passes through: the neutral hover under the
 * pointer, the cleared row, and the active fill under the pointer.
 */

type MenuKey = 'on' | 'off'
type ItemKey = 'copy' | 'rename' | 'archive'
type Frame = 'hover' | 'clear' | 'confirm' | 'closed'

interface BeatTrace {
  item: ItemKey
  /** Milliseconds from the input to the class landing on the row; null if it never did. */
  clear: number | null
  confirm: number | null
  /** Milliseconds from the input to `select`, the moment the menu is also told to close. */
  select: number
}

interface Pending {
  start: number
  clear: number | null
  confirm: number | null
  observer: MutationObserver
}

interface TimelineRow {
  menu: MenuKey
  name: string
  segments: Array<{ kind: 'clear' | 'confirm', from: number, to: number, label: string }>
  /** Where `select` falls, in percent of the axis; null when that menu has no record. */
  select: number | null
}

const MENUS: MenuKey[] = ['on', 'off']
const ITEMS: ItemKey[] = ['copy', 'rename', 'archive']
const SPEEDS = [1, 4, 8]
/** Share of the replay's span played before the input, so the row's hover is seen first. */
const LEAD_SHARE = 0.25
/** An input whose `select` has not arrived by then did not activate anything. */
const STALE_MS = 2000

const { locale } = useI18n()
const reducedMotion = useReducedMotion()

const copy = computed(() => locale.value === 'zh'
  ? {
      on: '两拍反馈：开（默认）',
      off: '两拍反馈：关',
      onShort: '开',
      offShort: '关',
      trigger: '打开菜单',
      items: { copy: '复制链接', rename: '重命名', archive: '移到归档' } as Record<ItemKey, string>,
      last: '上次选中：',
      none: '还没选',
      reduced: '系统开启了“减弱动态效果”：两拍反馈按规范降级为立即执行，此刻两个菜单表现相同。',
      replay: '慢放回放',
      speed: '慢放倍数',
      play: '回放',
      replayHint: '在「两拍反馈：开」的菜单里点一项，这里会按那一下的实测时间轴慢放。',
      noBeats: '那一下没有出现两拍，没有可以慢放的过程。',
      missing: '还没录到',
      picked: '已选中：',
      clear: '第一拍：清除',
      confirm: '第二拍：确认',
      select: 'select + 关闭',
      timeline: '实测时间轴',
      statOn: '开 · 点击到 select',
      statClear: '第一拍 · 清除',
      statConfirm: '第二拍 · 确认',
      statOff: '关 · 点击到 select',
      caption: '两个菜单都是真实的 TxDropdownMenu，只差 activation-feedback。读数取自三个时刻：输入事件、行上 is-activation-clear / is-activation-confirm 类出现、select 事件到达。慢放按你那一下的实测时间轴重演：“开”先撤掉悬停底色，再闪一下激活色才收起；“关”在点击当下就收起了。',
    }
  : {
      on: 'Two beats: on (default)',
      off: 'Two beats: off',
      onShort: 'On',
      offShort: 'Off',
      trigger: 'Open menu',
      items: { copy: 'Copy link', rename: 'Rename', archive: 'Move to archive' } as Record<ItemKey, string>,
      last: 'Last picked: ',
      none: 'nothing yet',
      reduced: 'Reduce motion is on: the two beats degrade to an immediate select, so both menus behave the same right now.',
      replay: 'Slow-motion replay',
      speed: 'Slow down',
      play: 'Replay',
      replayHint: 'Pick an item from the menu with the two beats on, and that click replays here on its measured timeline.',
      noBeats: 'That click ran no beats, so there is nothing to slow down.',
      missing: 'not recorded yet',
      picked: 'Picked: ',
      clear: 'Beat 1: clear',
      confirm: 'Beat 2: confirm',
      select: 'select + close',
      timeline: 'Measured timeline',
      statOn: 'On · click to select',
      statClear: 'Beat 1 · clear',
      statConfirm: 'Beat 2 · confirm',
      statOff: 'Off · click to select',
      caption: 'Both are real TxDropdownMenus that differ only in activation-feedback. The readings come from three moments: the input event, the is-activation-clear / is-activation-confirm classes landing on the row, and the select event. The replay re-enacts your click on its measured timeline: with the beats on, the hover fill goes, the active fill flashes, then the menu closes; with them off, it closes the instant it is clicked.',
    })

/** Scopes the capture listener to this figure's rows; other menus on the page are ignored. */
const uid = `mbeat-${Math.random().toString(36).slice(2, 10)}`

const traces = reactive<Record<MenuKey, BeatTrace | null>>({ on: null, off: null })
const picked = reactive<Record<MenuKey, ItemKey | null>>({ on: null, off: null })
const speed = ref(4)
/** The replay's position on the recorded clock, in ms from the input; null before any replay. */
const replayT = ref<number | null>(null)

const pendings = new Map<string, Pending>()
let replayFrame = 0
let replayLast = 0

/** The two beats of the last click on the "on" menu; null when it ran none. */
const beats = computed(() => {
  const on = traces.on
  if (!on || on.clear === null || on.confirm === null)
    return null
  return { clear: on.confirm - on.clear, confirm: on.select - on.confirm }
})
const hasBeats = computed(() => beats.value !== null)

const span = computed(() => {
  const end = Math.max(traces.on?.select ?? 0, traces.off?.select ?? 0)
  return { lead: end * LEAD_SHARE, end }
})

function percent(t: number) {
  const { lead, end } = span.value
  const total = lead + end
  return total > 0 ? ((t + lead) / total) * 100 : 0
}

function formatMs(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(1)} ms`
}

function propText(menu: MenuKey) {
  return `:activation-feedback="${menu === 'on'}"`
}

function pickedLabel(menu: MenuKey) {
  const item = picked[menu]
  return item ? copy.value.items[item] : copy.value.none
}

function frameOf(menu: MenuKey): Frame {
  const trace = traces[menu]
  const t = replayT.value
  if (!trace || t === null)
    return 'hover'
  if (t >= trace.select)
    return 'closed'
  if (trace.confirm !== null && t >= trace.confirm)
    return 'confirm'
  if (trace.clear !== null && t >= trace.clear)
    return 'clear'
  return 'hover'
}

const minis = computed(() => MENUS.map(menu => ({
  menu,
  name: menu === 'on' ? copy.value.onShort : copy.value.offShort,
  trace: traces[menu],
  frame: frameOf(menu),
})))

const timeline = computed(() => {
  const on = traces.on
  if (!on || on.clear === null || on.confirm === null)
    return null
  const off = traces.off
  const rows: TimelineRow[] = [
    {
      menu: 'on',
      name: copy.value.onShort,
      segments: [
        { kind: 'clear', from: percent(on.clear), to: percent(on.confirm), label: copy.value.clear },
        { kind: 'confirm', from: percent(on.confirm), to: percent(on.select), label: copy.value.confirm },
      ],
      select: percent(on.select),
    },
    {
      menu: 'off',
      name: copy.value.offShort,
      segments: [],
      select: off ? percent(off.select) : null,
    },
  ]
  return {
    rows,
    ticks: [
      { key: 'input', at: percent(0), label: '0' },
      { key: 'confirm', at: percent(on.confirm), label: formatMs(on.confirm) },
      { key: 'select', at: percent(on.select), label: formatMs(on.select) },
    ],
    label: `${copy.value.timeline}: ${copy.value.clear} ${formatMs(on.confirm - on.clear)}, ${copy.value.confirm} ${formatMs(on.select - on.confirm)}, ${copy.value.select} ${formatMs(on.select)}`,
  }
})

const playhead = computed(() => (replayT.value === null ? null : percent(replayT.value)))

function dropStale(now: number) {
  for (const [key, pending] of pendings) {
    if (now - pending.start > STALE_MS) {
      pending.observer.disconnect()
      pendings.delete(key)
    }
  }
}

/** Stamps the input that activates one of this figure's rows, before any handler runs. */
function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof Element))
    return
  const row = target.closest<HTMLElement>(`[data-mbeat="${uid}"]`)
  if (!row)
    return
  if (event instanceof KeyboardEvent) {
    // TxCardItem activates on Enter / Space pressed on the row itself.
    if ((event.key !== 'Enter' && event.key !== ' ') || target !== row || event.repeat)
      return
  }
  const key = row.dataset.mbeatKey
  const now = performance.now()
  dropStale(now)
  // A row already running its beats ignores the input, and so does the record.
  if (!key || pendings.has(key))
    return
  const pending: Pending = {
    start: now,
    clear: null,
    confirm: null,
    observer: new MutationObserver(() => {
      const at = performance.now() - pending.start
      if (pending.clear === null && row.classList.contains('is-activation-clear'))
        pending.clear = at
      if (pending.confirm === null && row.classList.contains('is-activation-confirm'))
        pending.confirm = at
    }),
  }
  pending.observer.observe(row, { attributes: true, attributeFilter: ['class'] })
  pendings.set(key, pending)
}

function onSelect(menu: MenuKey, item: ItemKey) {
  const end = performance.now()
  picked[menu] = item
  const key = `${menu}:${item}`
  const pending = pendings.get(key)
  if (!pending)
    return
  pending.observer.disconnect()
  pendings.delete(key)
  traces[menu] = { item, clear: pending.clear, confirm: pending.confirm, select: end - pending.start }
  if (menu === 'on' && hasBeats.value && !reducedMotion.value)
    startReplay()
}

function stopReplay() {
  if (replayFrame)
    cancelAnimationFrame(replayFrame)
  replayFrame = 0
  replayLast = 0
}

function stepReplay(now: number) {
  replayFrame = 0
  const { end } = span.value
  const current = replayT.value ?? 0
  replayT.value = replayLast ? Math.min(end, current + (now - replayLast) / speed.value) : current
  replayLast = now
  if (replayT.value < end)
    replayFrame = requestAnimationFrame(stepReplay)
}

function startReplay() {
  if (!hasBeats.value)
    return
  stopReplay()
  replayT.value = -span.value.lead
  replayFrame = requestAnimationFrame(stepReplay)
}

function resetDemo() {
  stopReplay()
  for (const pending of pendings.values())
    pending.observer.disconnect()
  pendings.clear()
  traces.on = null
  traces.off = null
  picked.on = null
  picked.off = null
  replayT.value = null
  speed.value = 4
}

onMounted(() => {
  document.addEventListener('click', onInput, true)
  document.addEventListener('keydown', onInput, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onInput, true)
  document.removeEventListener('keydown', onInput, true)
  stopReplay()
  for (const pending of pendings.values())
    pending.observer.disconnect()
  pendings.clear()
})

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="mb-root" :caption="copy.caption">
    <div class="mb">
      <div class="cfig-split">
        <section v-for="menu in MENUS" :key="menu" class="cfig-panel">
          <div class="cfig-panel__title">
            {{ menu === 'on' ? copy.on : copy.off }}
          </div>
          <span class="cfig-badge cfig-mono mb__prop">{{ propText(menu) }}</span>
          <div>
            <TxDropdownMenu :activation-feedback="menu === 'on'" :min-width="200">
              <template #trigger>
                <TxButton size="sm" variant="secondary">
                  {{ copy.trigger }}
                </TxButton>
              </template>
              <TxDropdownItem
                v-for="item in ITEMS"
                :key="item"
                :data-mbeat="uid"
                :data-mbeat-key="`${menu}:${item}`"
                @select="onSelect(menu, item)"
              >
                {{ copy.items[item] }}
              </TxDropdownItem>
            </TxDropdownMenu>
          </div>
          <p class="cfig-panel__note">
            {{ copy.last }}<strong class="mb__picked">{{ pickedLabel(menu) }}</strong>
          </p>
        </section>
      </div>

      <section class="cfig-panel">
        <div class="cfig-panel__title">
          {{ copy.replay }}
        </div>
        <p v-if="reducedMotion" class="cfig-panel__note">
          {{ copy.reduced }}
        </p>
        <p v-else-if="!traces.on" class="cfig-panel__note">
          {{ copy.replayHint }}
        </p>
        <p v-else-if="!hasBeats" class="cfig-panel__note">
          {{ copy.noBeats }}
        </p>

        <div class="mb-minis">
          <div v-for="mini in minis" :key="mini.menu" class="mb-mini">
            <span class="mb-mini__name">{{ mini.name }}</span>
            <template v-if="mini.trace">
              <div class="mb-mini__panel" :class="{ 'is-closed': mini.frame === 'closed' }">
                <span
                  v-for="item in ITEMS"
                  :key="item"
                  class="mb-mini__row"
                  :class="item === mini.trace.item ? `is-${mini.frame}` : ''"
                >
                  {{ copy.items[item] }}
                </span>
              </div>
              <span class="mb-mini__picked" :class="{ 'is-visible': mini.frame === 'closed' }">
                {{ copy.picked }}{{ copy.items[mini.trace.item] }}
              </span>
            </template>
            <span v-else class="mb-mini__missing">{{ copy.missing }}</span>
          </div>
        </div>

        <div v-if="timeline" class="mb-timeline" role="img" :aria-label="timeline.label">
          <div class="mb-timeline__names" aria-hidden="true">
            <span v-for="row in timeline.rows" :key="row.menu" class="mb-timeline__name">{{ row.name }}</span>
          </div>
          <div class="mb-timeline__track" aria-hidden="true">
            <div v-for="row in timeline.rows" :key="row.menu" class="mb-timeline__bar">
              <span
                v-for="segment in row.segments"
                :key="segment.kind"
                class="mb-timeline__segment"
                :class="`is-${segment.kind}`"
                :style="{ left: `${segment.from}%`, width: `${segment.to - segment.from}%` }"
              >
                <span class="mb-timeline__segment-label">{{ segment.label }}</span>
              </span>
              <span v-if="row.select !== null" class="mb-timeline__mark" :style="{ left: `${row.select}%` }" />
              <span v-else class="mb-timeline__missing">{{ copy.missing }}</span>
            </div>
            <div class="mb-timeline__ticks">
              <span
                v-for="tick in timeline.ticks"
                :key="tick.key"
                class="mb-timeline__tick"
                :class="`is-${tick.key}`"
                :style="{ left: `${tick.at}%` }"
              >{{ tick.label }}</span>
            </div>
            <span v-if="playhead !== null" class="mb-timeline__playhead" :style="{ left: `${playhead}%` }" />
          </div>
        </div>
        <div v-if="timeline" class="cfig-legend">
          <span class="cfig-legend__item" style="--swatch: var(--mb-clear)"><span class="cfig-legend__swatch" />{{ copy.clear }}</span>
          <span class="cfig-legend__item" style="--swatch: var(--mb-confirm)"><span class="cfig-legend__swatch" />{{ copy.confirm }}</span>
          <span class="cfig-legend__item"><span class="mb-legend-mark" />{{ copy.select }}</span>
        </div>
      </section>
    </div>

    <template #controls>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.speed }}</span>
        <TxRadioGroup v-model="speed">
          <TxRadio v-for="value in SPEEDS" :key="value" :value="value">
            ×{{ value }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <TxButton size="sm" variant="secondary" :disabled="!hasBeats" @click="startReplay">
        {{ copy.play }}
      </TxButton>
    </template>

    <template #readout>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.statOn }}</span>
        <span class="cfig-stat__value">{{ formatMs(traces.on?.select) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.statClear }}</span>
        <span class="cfig-stat__value">{{ formatMs(beats?.clear) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.statConfirm }}</span>
        <span class="cfig-stat__value">{{ formatMs(beats?.confirm) }}</span>
      </span>
      <span class="cfig-stat is-fail">
        <span class="cfig-stat__label">{{ copy.statOff }}</span>
        <span class="cfig-stat__value">{{ formatMs(traces.off?.select) }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.mb-root {
  --mb-clear: color-mix(in srgb, var(--cfig-ink) 22%, transparent);
  --mb-confirm: var(--tx-color-primary, #409eff);
}

.mb {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.mb__prop {
  align-self: flex-start;
}

.mb__picked {
  color: var(--cfig-ink);
  font-weight: 600;
}

.mb-minis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 12px;
}

.mb-mini {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.mb-mini__name {
  color: var(--cfig-muted);
  font-size: 11px;
  font-weight: 600;
}

/* The real menu panel's shape: a padded card of 10px-radius rows. */
.mb-mini__panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--cfig-line);
  border-radius: 14px;
  background: var(--tx-bg-color, #fff);
}

.mb-mini__panel.is-closed {
  visibility: hidden;
}

.mb-mini__row {
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* TxCardItem's clickable hover. */
.mb-mini__row.is-hover {
  border-color: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
  background: var(--tx-card-item-hover-bg, color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 18%, transparent));
}

/* TxDropdownItem's first beat: no fill, no border. */
.mb-mini__row.is-clear {
  border-color: transparent;
  background: transparent;
}

/* TxCardItem's active row under the pointer: the second beat. */
.mb-mini__row.is-confirm {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 58%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 15%, transparent);
}

.mb-mini__picked {
  color: var(--cfig-ink);
  font-size: 12px;
  visibility: hidden;
}

.mb-mini__picked.is-visible {
  visibility: visible;
}

.mb-mini__missing,
.mb-timeline__missing {
  color: var(--cfig-muted);
  font-size: 12px;
}

.mb-timeline {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.mb-timeline__names {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mb-timeline__name {
  display: flex;
  align-items: center;
  height: 22px;
  color: var(--cfig-muted);
  font-size: 11px;
  font-weight: 600;
}

.mb-timeline__track {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.mb-timeline__bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 22px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--cfig-ink) 4%, transparent);
}

.mb-timeline__segment {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  border-radius: 4px;
}

.mb-timeline__segment.is-clear {
  background: var(--mb-clear);
}

.mb-timeline__segment.is-confirm {
  background: color-mix(in srgb, var(--mb-confirm) 30%, transparent);
}

.mb-timeline__segment-label {
  padding: 0 6px;
  font-size: 11px;
  white-space: nowrap;
}

.mb-timeline__mark,
.mb-legend-mark {
  width: 9px;
  height: 9px;
  rotate: 45deg;
  border-radius: 2px;
  background: var(--cfig-ink);
}

.mb-timeline__mark {
  position: absolute;
  top: 50%;
  margin: -4.5px 0 0 -4.5px;
}

.mb-legend-mark {
  display: inline-block;
}

.mb-timeline__missing {
  padding-left: 8px;
}

.mb-timeline__ticks {
  position: relative;
  height: 16px;
}

.mb-timeline__tick {
  position: absolute;
  top: 0;
  translate: -50% 0;
  color: var(--cfig-muted);
  font-family: var(--cfig-mono);
  font-size: 11px;
  white-space: nowrap;
}

.mb-timeline__tick.is-select {
  translate: -100% 0;
}

.mb-timeline__playhead {
  position: absolute;
  top: -4px;
  bottom: 20px;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--tx-color-danger, #f56c6c);
  pointer-events: none;
}
</style>
