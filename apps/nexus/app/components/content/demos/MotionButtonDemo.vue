<script setup lang="ts">
import type { MotionButtonInstance, MotionButtonItem, MotionButtonSourceId, MotionButtonVariant } from '@talex-touch/tuffex/motion-button'
import { MOTION_BUTTON_CATALOG, MOTION_BUTTON_VARIANTS, TxMotionButton } from '@talex-touch/tuffex/motion-button'
import { hasNavigator } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, ref, useId } from 'vue'

const { locale } = useI18n()
const id = useId()
const filter = ref<MotionButtonVariant | 'all'>('all')
const layout = ref<'grid' | 'list' | 'matrix'>('grid')
const disabled = ref(false)
const animated = ref(true)
const counts = ref<Partial<Record<MotionButtonSourceId, number>>>({})
const selected = ref<Partial<Record<MotionButtonSourceId, boolean>>>({})
const copying = ref(false)
const clipboardMessage = ref('')
const customOpen = ref(false)
const formSubmits = ref(0)
const lastLink = ref('')
const buttons = new Map<MotionButtonSourceId, MotionButtonInstance>()
const clipboardText = '43c29ce9cdd16459e3eab4992381b8d35b38776a'
let alive = true
let clipboardGeneration = 0

const copy = computed(() => locale.value === 'zh'
  ? {
      title: '35 个来源组合', filter: '交互筛选', all: '全部 13 类交互', layout: '布局', grid: '网格', list: '列表', matrix: '图标矩阵',
      replay: '回放', replayAll: '回放当前组合', reset: '重置调用方状态', disabled: '禁用', animated: '启用动画',
      instruction: '悬停或 Tab 聚焦每个控件，按 Enter 或空格激活按钮。磁吸跟随真实指针位置。回放只重播装饰，不执行业务操作。',
      operation: '本演示由调用方切换本地状态并记录激活次数，不模拟下载、上传、提交或支付成功。第 4 项实际写入剪贴板；链接打开真实站点。',
      activated: '激活', times: '次', state: '调用方状态', on: '已选中', off: '未选中', copied: '已复制',
      copyUnavailable: '当前浏览器不支持剪贴板写入', copyFailed: '复制失败，请检查浏览器权限', copySuccess: '固定来源提交已写入剪贴板',
      customTitle: '自定义图标、内容与原生语义', open: '展开本地内容', close: '收起本地内容', panel: '这段内容由演示调用方的状态控制。',
      realLink: '打开上游仓库', disabledLink: '禁用的链接', submit: '提交本地表单', submitted: '表单实际触发次数', focusLinks: '已打开链接',
      labels: ['下载 macOS 版', '为 GitHub 项目加星', '部署应用', '复制提交哈希', '赞助', '分享', '预览', '设置', '删除', '订阅', '搜索', '主题', '麦克风', '摄像头', '音量', '锁定', '目录', '可见性', '稍后保存', '点赞', '下载', '上传', '账户', '发送', '编辑', '网络', '电源', '展开', '重新加载', '收藏', '光泽扫过', '文字揭示', '磁吸', '扩散轮廓', '焦点模糊链接'],
    }
  : {
      title: '35 source combinations', filter: 'Interaction filter', all: 'All 13 interactions', layout: 'Layout', grid: 'Grid', list: 'List', matrix: 'Icon matrix',
      replay: 'Replay', replayAll: 'Replay visible combinations', reset: 'Reset caller state', disabled: 'Disabled', animated: 'Animate',
      instruction: 'Hover or Tab to each control. Use Enter or Space to activate buttons. Magnetic pull follows the real pointer. Replay only restarts decoration; it does not run an operation.',
      operation: 'The caller toggles local state and counts real activations in this demo. It does not simulate successful downloads, uploads, submissions or payments. Item 4 writes to your actual clipboard; links open real sites.',
      activated: 'Activated', times: 'times', state: 'Caller state', on: 'Selected', off: 'Not selected', copied: 'Copied',
      copyUnavailable: 'Clipboard writing is unavailable in this browser', copyFailed: 'Copy failed; check browser permissions', copySuccess: 'The pinned source commit was written to your clipboard',
      customTitle: 'Custom icons, content and native semantics', open: 'Open local content', close: 'Close local content', panel: 'This content is controlled by state in the demo caller.',
      realLink: 'Open upstream repository', disabledLink: 'Disabled link', submit: 'Submit local form', submitted: 'Actual form submissions', focusLinks: 'Opened link',
      labels: MOTION_BUTTON_CATALOG.map(entry => entry.sourceLabel),
    })

const entries = computed(() => MOTION_BUTTON_CATALOG
  .filter(entry => filter.value === 'all' || entry.variant === filter.value)
  .map(entry => ({ ...entry, label: copy.value.labels[Number(entry.sourceId) - 1] ?? entry.sourceLabel })))
const focusItems = computed<MotionButtonItem[]>(() => [
  { label: '@X', href: 'https://x.com', target: '_blank' },
  { label: '@Threads', href: 'https://www.threads.net', target: '_blank' },
  { label: '@GitHub', href: 'https://github.com/Subhan-code/Amicro--Micro-transitions-', target: '_blank' },
])

function setButton(sourceId: MotionButtonSourceId, value: unknown): void {
  if (typeof value === 'object' && value !== null && 'replay' in value && typeof value.replay === 'function' && 'focus' in value && typeof value.focus === 'function')
    buttons.set(sourceId, value as MotionButtonInstance)
  else buttons.delete(sourceId)
}
function countActivation(sourceId: MotionButtonSourceId): void {
  counts.value[sourceId] = (counts.value[sourceId] ?? 0) + 1
}
async function activate(sourceId: MotionButtonSourceId): Promise<void> {
  if (sourceId !== '4') {
    countActivation(sourceId)
    selected.value[sourceId] = !selected.value[sourceId]
    return
  }
  if (copying.value) return
  const generation = ++clipboardGeneration
  copying.value = true
  clipboardMessage.value = ''
  try {
    if (!hasNavigator() || !navigator.clipboard?.writeText) {
      clipboardMessage.value = copy.value.copyUnavailable
      return
    }
    await navigator.clipboard.writeText(clipboardText)
    if (!alive || generation !== clipboardGeneration) return
    countActivation(sourceId)
    selected.value[sourceId] = true
    clipboardMessage.value = copy.value.copySuccess
  }
  catch {
    if (alive && generation === clipboardGeneration) clipboardMessage.value = copy.value.copyFailed
  }
  finally {
    if (alive && generation === clipboardGeneration) copying.value = false
  }
}
function selectLink(item: MotionButtonItem): void {
  countActivation('35')
  lastLink.value = item.label
}
function reset(): void {
  clipboardGeneration++
  copying.value = false
  clipboardMessage.value = ''
  counts.value = {}
  selected.value = {}
  lastLink.value = ''
}
function replayVisible(): void {
  for (const entry of entries.value) buttons.get(entry.sourceId)?.replay()
}
onBeforeUnmount(() => { alive = false; clipboardGeneration++; buttons.clear() })
</script>

<template>
  <div class="not-prose motion-button-demo">
    <div class="motion-button-demo__toolbar">
      <label :for="`${id}-filter`">{{ copy.filter }}</label>
      <select :id="`${id}-filter`" v-model="filter">
        <option value="all">
{{ copy.all }}
</option>
        <option v-for="variant in MOTION_BUTTON_VARIANTS" :key="variant" :value="variant">
{{ variant }}
</option>
      </select>
      <label :for="`${id}-layout`">{{ copy.layout }}</label>
      <select :id="`${id}-layout`" v-model="layout">
        <option value="grid">
{{ copy.grid }}
</option><option value="list">
{{ copy.list }}
</option><option value="matrix">
{{ copy.matrix }}
</option>
      </select>
      <label class="motion-button-demo__check"><input v-model="disabled" type="checkbox">{{ copy.disabled }}</label>
      <label class="motion-button-demo__check"><input v-model="animated" type="checkbox">{{ copy.animated }}</label>
      <button type="button" @click="replayVisible">
{{ copy.replayAll }}
</button>
      <button type="button" @click="reset">
{{ copy.reset }}
</button>
    </div>
    <p>{{ copy.instruction }}</p>
    <p>{{ copy.operation }}</p>
    <h3>{{ copy.title }} <small>{{ entries.length }}/35</small></h3>
    <div class="motion-button-demo__catalog" :class="`motion-button-demo__catalog--${layout}`">
      <div v-for="entry in entries" :key="entry.sourceId" class="motion-button-demo__entry" :class="{ 'motion-button-demo__entry--links': entry.sourceId === '35' }">
        <div class="motion-button-demo__meta">
<code>{{ entry.sourceId }} · {{ entry.variant }}</code><span>{{ entry.icon }}{{ entry.activeIcon ? ` → ${entry.activeIcon}` : '' }}</span>
</div>
        <div class="motion-button-demo__stage">
          <TxMotionButton
            :ref="value => setButton(entry.sourceId, value)"
            :source-id="entry.sourceId"
            :label="entry.label"
            :aria-label="entry.label"
            :active-label="entry.sourceId === '4' ? copy.copied : undefined"
            :items="entry.sourceId === '35' ? focusItems : undefined"
            :selected="entry.sourceId === '35' ? undefined : selected[entry.sourceId] === true"
            :disabled="disabled || (entry.sourceId === '4' && copying)"
            :animated="animated"
            :icon-only="layout === 'matrix' && entry.sourceId !== '35'"
            @click="activate(entry.sourceId)"
            @select="selectLink"
          />
        </div>
        <div class="motion-button-demo__result">
          <span>{{ copy.activated }} {{ counts[entry.sourceId] ?? 0 }} {{ copy.times }}</span>
          <span v-if="entry.sourceId !== '35'">{{ copy.state }} · {{ selected[entry.sourceId] ? copy.on : copy.off }}</span>
          <button type="button" :disabled="disabled || !animated" :aria-label="`${copy.replay}: ${entry.label}`" @click="buttons.get(entry.sourceId)?.replay()">
{{ copy.replay }}
</button>
        </div>
      </div>
    </div>
    <p role="status" aria-live="polite">
{{ clipboardMessage }}{{ lastLink ? ` ${copy.focusLinks}: ${lastLink}` : '' }}
</p>
    <section class="motion-button-demo__custom">
      <h3>{{ copy.customTitle }}</h3>
      <div class="motion-button-demo__examples">
        <TxMotionButton
          variant="morph" icon="menu" active-icon="close" :selected="customOpen" :disabled="disabled" :animated="animated"
          :aria-expanded="customOpen" :aria-controls="`${id}-panel`" :label="copy.open" :active-label="copy.close"
          @click="customOpen = !customOpen"
        />
        <TxMotionButton source-id="6" href="https://github.com/Subhan-code/Amicro--Micro-transitions-" target="_blank" :label="copy.realLink" :disabled="disabled" :animated="animated" />
        <TxMotionButton source-id="6" href="https://github.com/Subhan-code/Amicro--Micro-transitions-" :label="copy.disabledLink" disabled />
        <TxMotionButton variant="sparkle" :disabled="disabled" :animated="animated" :label="copy.on" @click="customOpen = !customOpen">
          <template #icon>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
</template>
          <template #active-icon>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5" /></svg>
</template>
          <template #default="{ active }">
{{ active ? copy.on : copy.off }}
</template>
        </TxMotionButton>
      </div>
      <p v-if="customOpen" :id="`${id}-panel`">
{{ copy.panel }}
</p>
      <form class="motion-button-demo__form" @submit.prevent="formSubmits++">
        <TxMotionButton source-id="24" type="submit" :label="copy.submit" :disabled="disabled" :animated="animated" />
        <output>{{ copy.submitted }}: {{ formSubmits }}</output>
      </form>
    </section>
  </div>
</template>

<style scoped>
.motion-button-demo { display: grid; gap: 16px; color: var(--tx-text-color-regular); font-size: 13px; }
.motion-button-demo p, .motion-button-demo h3 { margin: 0; }
.motion-button-demo h3 { font-size: 14px; font-weight: 600; }
.motion-button-demo small { font-size: 12px; font-weight: 400; }
.motion-button-demo__toolbar, .motion-button-demo__examples, .motion-button-demo__form { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.motion-button-demo__toolbar select, .motion-button-demo button:not(.tx-motion-button) { min-height: 28px; padding: 4px 10px; border: 0; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--tx-border-color); color: var(--tx-text-color-regular); background: var(--tx-fill-color-light); font: inherit; cursor: pointer; }
.motion-button-demo button:disabled { cursor: not-allowed; opacity: 0.5; }
.motion-button-demo__check { display: inline-flex; gap: 5px; align-items: center; }
.motion-button-demo__catalog { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 16px 24px; }
.motion-button-demo__catalog--list { grid-template-columns: 1fr; }
.motion-button-demo__catalog--matrix { grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); }
.motion-button-demo__entry { display: grid; grid-template-rows: auto 1fr auto; gap: 10px; padding-block: 12px; border-bottom: 1px solid var(--tx-border-color-lighter); }
.motion-button-demo__entry--links { grid-column: 1 / -1; }
.motion-button-demo__meta { display: grid; gap: 4px; font-size: 12px; }
.motion-button-demo__meta code { color: var(--tx-text-color-primary); font-size: 12px; }
.motion-button-demo__stage { min-height: 52px; display: flex; align-items: center; justify-content: center; }
.motion-button-demo__result { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.motion-button-demo__result button { margin-inline-start: auto; }
.motion-button-demo__custom { display: grid; gap: 14px; padding-top: 4px; }
</style>
