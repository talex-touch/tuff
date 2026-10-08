<script setup lang="ts">
import type { MotionControlItem, MotionControlLabels, MotionControlStatus, MotionControlValue, MotionControlVariant } from '@talex-touch/tuffex/motion-control'
import { MOTION_CONTROL_SOURCES } from '@talex-touch/tuffex/motion-control'
import { hasDocument } from '@talex-touch/utils/env'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh' ? {
  all: '全部控件', filter: '筛选源码能力', state: '当前模型', event: '最近真实事件', none: '尚未操作',
  disabled: '禁用控件', motion: '启用动效', status: '调用方状态输入', downloadNote: '下载会生成并请求保存真实文本文件。浏览器没有保存完成回调，因此不会自动显示成功。右侧状态仅用于手动查看调用方驱动的外观。',
  tab: '标签', close: '已关闭', added: '已添加', requested: '已请求浏览器下载', history: '导航位置',
  category: ['设计', '开发', '测试'], filters: ['全部', '精选', '最新'], frequency: ['每天', '每周', '每月', '每年'],
  tabs: ['收件箱', '日历', '通知'], days: ['24日', '25日', '26日'], steps: ['草稿', '审核', '发布'],
  menu: ['编辑', '删除', '导出', '纯文本', 'JSON'], preview: '这段预览来自调用方插槽。', tooltip: '聚焦或悬停即可显示提示。',
  action: '打开文档', launch: '执行', like: '赞', liked: '已赞', likes: '当前赞数',
  statuses: ['空闲', '下载中', '已完成', '失败'], labelOverrides: '标签与事件适配示例',
} : {
  all: 'All controls', filter: 'Filter by source ability', state: 'Current model', event: 'Latest real event', none: 'No interaction yet',
  disabled: 'Disable controls', motion: 'Enable motion', status: 'Caller state input', downloadNote: 'Download generates a real text file and asks the browser to save it. Browsers expose no saved-file completion callback, so it never reports success automatically. The status selector only previews caller-driven feedback.',
  tab: 'Tab', close: 'Closed', added: 'Added', requested: 'Browser download requested', history: 'Navigation position',
  category: ['Design', 'Development', 'Testing'], filters: ['All', 'Featured', 'New'], frequency: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
  tabs: ['Inbox', 'Calendar', 'Alerts'], days: ['24th', '25th', '26th'], steps: ['Draft', 'Review', 'Release'],
  menu: ['Edit', 'Delete', 'Export', 'Plain text', 'JSON'], preview: 'This preview comes from the caller slot.', tooltip: 'Focus or hover to reveal the hint.',
  action: 'Open documentation', launch: 'Launch', like: 'Like', liked: 'Liked', likes: 'Current likes',
  statuses: ['Idle', 'Downloading', 'Complete', 'Error'], labelOverrides: 'Label and event adaptation',
})
const labels = computed<Partial<MotionControlLabels>>(() => locale.value === 'zh' ? {
  control: '动态控件', choose: '选择选项', frequency: '频率', confirm: '确认选择', add: '添加标签', close: '关闭',
  increase: '增加', decrease: '减少', back: '后退', forward: '前进', actions: '操作', details: '查看详情',
  action: '操作', launch: '执行', link: '打开链接', preview: '预览', help: '帮助', download: '下载',
  downloading: '下载中', downloaded: '已下载', downloadError: '下载失败', pip: '进入画中画', pipOff: '退出画中画',
  save: '保存项目', saved: '已保存', follow: '关注', following: '已关注', grid: '网格视图', list: '列表视图',
  stack: '堆叠视图', light: '浅色模式', dark: '深色模式', progress: '步骤', page: '页码',
} : { action: 'Action', launch: 'Launch' })
const models = reactive<Record<string, MotionControlValue>>({
  'yui-category-select': 'design', 'yui-filter-tag-pill': 'all', 'yui-submenu-flyout': '',
  'yui-hover-link': '', 'yui-magnetic-icon-btn': '', 'yui-morph-action-pill': '',
  'yui-plus-minus-toggle': 'plus', 'yui-light-dark-toggle': false, 'yui-ab-tabs': 'A',
  'yui-progress-stepper': 'review', 'yui-segmented-arc-meter': 3, 'yui-segmented-step-bar': 2,
  'yui-multi-tab-close': 'tab-1', 'yui-date-position': '2026-10-25', 'yui-stepper-dots': 2,
  'yui-context-menu': '', 'yui-glance-preview': '', 'yui-download-icons': '',
  'yui-wheel-counter': 5, 'yui-perspective-layout': 'grid', 'yui-save-pill': false,
  'frequency-selector': 'daily', 'tab-bar': 'inbox', 'radial-progress-ring': 75,
  'pagination-numbered-bubble': 2, 'back-forward-nav': '', 'question-tooltip': '',
  'pip-mode-icons': false, 'simple-plus-minus-btn': 1, 'quantity-counter': 3,
  'list-column-toggle': 'grid', 'follow-check-button': false, 'menu-dots-expand': '', 'compact-mode-switch': 'grid',
})
const filter = ref('all')
const disabled = ref(false)
const animated = ref(true)
const callerStatus = ref<MotionControlStatus>('idle')
const callerProgress = ref(45)
const lastEvent = ref('')
const historyPosition = ref(1)
const liked = ref(false)
const likes = computed(() => liked.value ? 1 : 0)
const tabs = ref<MotionControlItem[]>([{ value: 'tab-1', label: 'Tab 1' }, { value: 'tab-2', label: 'Tab 2' }])
let nextTab = 3
const filterOptions = computed(() => [{ value: 'all', label: copy.value.all }, ...MOTION_CONTROL_SOURCES.map(item => ({ value: item.variant, label: item.exportName }))])
const shown = computed(() => MOTION_CONTROL_SOURCES.filter(item => filter.value === 'all' || item.variant === filter.value))
const statusOptions = computed(() => ['idle', 'loading', 'success', 'error'].map((value, index) => ({ value, label: copy.value.statuses[index] || value })))
const options = computed<Record<string, MotionControlItem[]>>(() => {
  const map = (values: string[], text: string[], icons?: string[]) => values.map((value, index) => ({ value, label: text[index] || value, icon: icons?.[index] }))
  return {
    'yui-category-select': map(['design', 'dev', 'test'], copy.value.category),
    'yui-filter-tag-pill': map(['all', 'featured', 'new'], copy.value.filters),
    'frequency-selector': map(['daily', 'weekly', 'monthly', 'yearly'], copy.value.frequency),
    'tab-bar': map(['inbox', 'calendar', 'alerts'], copy.value.tabs, ['mail', 'calendar', 'bell']),
    'yui-ab-tabs': map(['A', 'B'], ['A', 'B']),
    'yui-date-position': map(['2026-10-24', '2026-10-25', '2026-10-26'], copy.value.days),
    'yui-progress-stepper': map(['draft', 'review', 'release'], copy.value.steps),
  }
})
const menuItems = computed<MotionControlItem[]>(() => [
  { value: 'edit', label: copy.value.menu[0] || 'Edit' },
  { value: 'export', label: copy.value.menu[2] || 'Export', children: [{ value: 'text', label: copy.value.menu[3] || 'Text' }, { value: 'json', label: copy.value.menu[4] || 'JSON' }] },
  { value: 'delete', label: copy.value.menu[1] || 'Delete', danger: true },
])
function itemsFor(variant: MotionControlVariant): MotionControlItem[] {
  if (variant === 'yui-multi-tab-close') return tabs.value
  return ['yui-context-menu', 'yui-submenu-flyout', 'menu-dots-expand'].includes(variant) ? menuItems.value : []
}
function modelFor(variant: MotionControlVariant): MotionControlValue { return models[variant] ?? '' }
function updateModel(variant: MotionControlVariant, value: MotionControlValue) {
  models[variant] = value
  lastEvent.value = `${variant} → update:modelValue ${JSON.stringify(value)}`
}
function record(variant: string, event: string, value?: unknown) { lastEvent.value = `${variant} → ${event}${value === undefined ? '' : ` ${JSON.stringify(value)}`}` }
function addTab() {
  const item = { value: `tab-${nextTab}`, label: `${copy.value.tab} ${nextTab}` }
  nextTab += 1
  tabs.value = [...tabs.value, item]
  models['yui-multi-tab-close'] = item.value
  record('yui-multi-tab-close', copy.value.added, item)
}
function navigate(direction: 'back' | 'forward') {
  historyPosition.value += direction === 'back' ? -1 : 1
  record('back-forward-nav', 'navigate', direction)
}
function downloadSample() {
  if (!hasDocument()) return
  const content = JSON.stringify({ controls: MOTION_CONTROL_SOURCES.map(source => source.exportName), models }, null, 2)
  const link = document.createElement('a')
  link.href = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`
  link.download = 'tuffex-motion-controls.txt'
  link.click()
  record('yui-download-icons', copy.value.requested)
}
</script>

<template>
  <div class="not-prose motion-control-demo">
    <div class="motion-control-demo__tools">
      <TxSelect v-model="filter" :options="filterOptions" :aria-label="copy.filter" />
      <label class="motion-control-demo__check"><input v-model="disabled" type="checkbox">{{ copy.disabled }}</label>
      <label class="motion-control-demo__check"><input v-model="animated" type="checkbox">{{ copy.motion }}</label>
    </div>
    <div class="motion-control-demo__feedback" role="status" aria-live="polite">
<strong>{{ copy.event }}</strong><code>{{ lastEvent || copy.none }}</code>
</div>
    <div class="motion-control-demo__grid">
      <section v-for="source in shown" :key="source.variant" class="motion-control-demo__specimen" :data-motion-source="source.exportName">
        <h3>{{ source.exportName }}</h3>
        <small>{{ source.variant }}</small>
        <div class="motion-control-demo__stage">
          <TxMotionControl
            :variant="source.variant"
            :model-value="modelFor(source.variant)"
            :options="options[source.variant] || []"
            :items="itemsFor(source.variant)"
            :count="source.variant === 'yui-segmented-step-bar' ? 3 : 4"
            :min="source.variant.includes('counter') ? 1 : 0"
            :max="20"
            :step="source.variant === 'radial-progress-ring' ? 25 : 1"
            :min-items="1"
            :max-items="5"
            :disabled="disabled"
            :animated="animated"
            :labels="labels"
            :label="['yui-magnetic-icon-btn', 'yui-morph-action-pill', 'yui-hover-link'].includes(source.variant) ? copy.action : ''"
            :tooltip="copy.tooltip"
            href="https://tuff.tagzxia.com/en/docs/dev/components/motion-control"
            target="_blank"
            :status="source.variant === 'yui-download-icons' ? callerStatus : 'idle'"
            :progress="callerProgress"
            :can-back="historyPosition > 0"
            :can-forward="historyPosition < 3"
            @update:model-value="updateModel(source.variant, $event)"
            @update:items="tabs = $event"
            @update:open="record(source.variant, 'update:open', $event)"
            @select="record(source.variant, 'select', $event.value)"
            @action="record(source.variant, 'action', $event)"
            @close="record(source.variant, copy.close, $event.value)"
            @add="addTab"
            @navigate="navigate"
            @download="downloadSample"
          >
            <template v-if="source.variant === 'tab-bar'" #icon="{ item }">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path v-if="item.value === 'inbox'" d="M3 5h18v14H3Zm0 0 9 8 9-8" />
                <path v-else-if="item.value === 'calendar'" d="M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-11 4h.01m6 0h.01" />
                <path v-else d="M6 9a6 6 0 0 1 12 0v6l2 2H4l2-2Zm4 11h4" />
              </svg>
            </template>
            <template #preview>
<span class="motion-control-demo__preview-dot" />{{ copy.preview }}
</template>
          </TxMotionControl>
        </div>
        <output class="motion-control-demo__state">{{ copy.state }} <code>{{ JSON.stringify(modelFor(source.variant)) }}</code></output>
        <output v-if="source.variant === 'back-forward-nav'">{{ copy.history }} {{ historyPosition }}</output>
        <template v-if="source.variant === 'yui-download-icons'">
          <TxSelect v-model="callerStatus" :options="statusOptions" :aria-label="copy.status" />
          <input v-model.number="callerProgress" type="range" min="0" max="100" :aria-label="labels.progress || 'Progress'">
          <p>{{ copy.downloadNote }}</p>
        </template>
      </section>
    </div>
    <section class="motion-control-demo__adaptation">
      <h3>{{ copy.labelOverrides }}</h3>
      <TxMotionControl v-model="liked" variant="yui-save-pill" :animated="animated" :disabled="disabled" :labels="{ ...labels, save: copy.like, saved: copy.liked }" @action="record('label-adaptation', 'like', $event.value)" />
      <output>{{ copy.likes }} {{ likes }}</output>
    </section>
  </div>
</template>

<style scoped>
.motion-control-demo { display: grid; gap: 20px; color: var(--tx-text-color-primary); font-size: 13px; }
.motion-control-demo__tools { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
.motion-control-demo__tools :deep(.tx-select) { width: min(280px, 100%); }
.motion-control-demo__check { display: inline-flex; align-items: center; gap: 6px; }
.motion-control-demo__feedback { display: grid; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--tx-border-color-light); }
.motion-control-demo__feedback strong { font-weight: 500; }
.motion-control-demo__feedback code { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.motion-control-demo__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 20px; }
.motion-control-demo__specimen { display: grid; align-content: start; gap: 8px; min-width: 0; padding-bottom: 18px; border-bottom: 1px solid var(--tx-border-color-light); }
.motion-control-demo__specimen h3, .motion-control-demo__adaptation h3 { margin: 0; font-size: 14px; font-weight: 600; }
.motion-control-demo__specimen small { font-size: 12px; color: var(--tx-text-color-regular); }
.motion-control-demo__stage { display: flex; align-items: center; min-height: 96px; max-width: 100%; }
.motion-control-demo__state, .motion-control-demo__specimen output { font-size: 12px; color: var(--tx-text-color-regular); }
.motion-control-demo__specimen p { margin: 0; line-height: 1.55; font-size: 12px; }
.motion-control-demo__adaptation { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.motion-control-demo__adaptation h3 { flex-basis: 100%; }
.motion-control-demo__preview-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--tx-color-primary); }
@media (max-width: 760px) { .motion-control-demo__grid { grid-template-columns: minmax(0, 1fr); } }
</style>
