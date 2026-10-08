<script setup lang="ts">
import type { MotionDockId, MotionDockItem, MotionDockReorder } from '@talex-touch/tuffex/motion-dock'
import { computed, ref, useId, watch } from 'vue'

const { locale } = useI18n()
const helpId = useId()
const activeId = ref<MotionDockId>('files')
const reorderable = ref(true)
const paused = ref(false)
const showLabels = ref(false)
const lastReorder = ref<MotionDockReorder | null>(null)
const lastSelected = ref<MotionDockId | null>(null)
const copy = computed(() => locale.value === 'zh' ? {
  apps: { files: '文件', search: '搜索', calendar: '日历', terminal: '终端', settings: '设置', help: '说明', locked: '锁定' },
  reset: '恢复初始顺序', reorderOn: '排序：开启', reorderOff: '排序：关闭', pause: '暂停放大', resume: '启用放大',
  labelsOn: '标签：显示', labelsOff: '标签：隐藏', order: '当前顺序', selected: '实际选中', none: '尚无',
  pointer: '指针', keyboard: '键盘', moved: '实际排序操作',
  help: '沿工具栏移动指针，会同时放大临近项。拖动项目后，顺序同步更新。方向键移动焦点，Alt + 方向键排序，Home / End 跳到两端；按 Escape 取消拖动。锁定项不能激活，说明项是当前段落的真实链接。',
  labels: { dock: '应用程序栏', instructions: '左右方向键移动焦点，Home 和 End 到达首尾。Alt 加这些按键调整顺序。Enter 或空格激活；Escape 取消指针拖动。', reordered: '已将{label}移到第 {position} 项，共 {total} 项。' },
} : {
  apps: { files: 'Files', search: 'Search', calendar: 'Calendar', terminal: 'Terminal', settings: 'Settings', help: 'Help', locked: 'Locked' },
  reset: 'Restore initial order', reorderOn: 'Reorder: on', reorderOff: 'Reorder: off', pause: 'Pause magnification', resume: 'Enable magnification',
  labelsOn: 'Labels: visible', labelsOff: 'Labels: hidden', order: 'Current order', selected: 'Actual selection', none: 'None yet',
  pointer: 'Pointer', keyboard: 'Keyboard', moved: 'Actual reorder',
  help: 'Move the pointer along the toolbar to magnify neighboring items. Dragging updates the order. Arrow keys move focus; Alt + arrows reorder; Home / End reach the ends. Escape cancels a drag. The locked item cannot activate. Help is a real link to this paragraph.',
  labels: { dock: 'Application dock', instructions: 'Left and Right move focus; Home and End reach the ends. Alt with these keys changes order. Enter or Space activates; Escape cancels a pointer drag.', reordered: 'Moved {label} to position {position} of {total}.' },
})
const initialIds = ['files', 'search', 'calendar', 'terminal', 'settings', 'help', 'locked'] as const
const items = ref<MotionDockItem[]>(initialIds.map(id => ({ id, label: copy.value.apps[id], disabled: id === 'locked', href: id === 'help' ? `#${helpId}` : undefined })))
const order = computed(() => items.value.map(item => item.label).join(' → '))
const selected = computed(() => items.value.find(item => item.id === lastSelected.value)?.label ?? copy.value.none)
const iconPaths: Record<string, string> = {
  files: 'M3 5h7l2 2h9v13H3z', search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  calendar: 'M4 5h16v16H4zM4 9h16M8 2v6M16 2v6M8 13h2M14 13h2M8 17h2',
  terminal: 'M3 5h18v14H3zM6 9l3 3-3 3M12 15h5',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 18v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  locked: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
}
watch(copy, () => {
  // Localization preserves the user's order instead of rebuilding the initial list.
  items.value = items.value.map(item => ({ ...item, label: copy.value.apps[item.id as typeof initialIds[number]] }))
})
function reset(): void {
  items.value = initialIds.map(id => ({ id, label: copy.value.apps[id], disabled: id === 'locked', href: id === 'help' ? `#${helpId}` : undefined }))
  activeId.value = 'files'
  lastSelected.value = null
  lastReorder.value = null
}
function reordered(_items: MotionDockItem[], detail: MotionDockReorder): void {
  lastReorder.value = detail
}
function selectedItem(item: MotionDockItem): void {
  lastSelected.value = item.id
}
</script>

<template>
  <div class="dock-demo not-prose">
    <div class="dock-demo__actions">
      <TxButton size="sm" @click="reset">
{{ copy.reset }}
</TxButton>
      <TxButton size="sm" :aria-pressed="reorderable" @click="reorderable = !reorderable">
{{ reorderable ? copy.reorderOn : copy.reorderOff }}
</TxButton>
      <TxButton size="sm" :aria-pressed="paused" @click="paused = !paused">
{{ paused ? copy.resume : copy.pause }}
</TxButton>
      <TxButton size="sm" :aria-pressed="showLabels" @click="showLabels = !showLabels">
{{ showLabels ? copy.labelsOn : copy.labelsOff }}
</TxButton>
    </div>
    <div class="dock-demo__stage">
      <TxMotionDock
v-model:items="items" v-model:active-id="activeId" :reorderable="reorderable" :paused="paused" :show-labels="showLabels" :labels="copy.labels"
        @reorder="reordered" @select="selectedItem"
>
        <template #icon="{ item }">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="dock-demo__icon"><path :d="iconPaths[String(item.id)]" /></svg>
</template>
        <template #label="{ item }">
{{ item.label }}
</template>
      </TxMotionDock>
    </div>
    <div class="dock-demo__output">
<span>{{ copy.order }}</span><output>{{ order }}</output><span>{{ copy.selected }}: {{ selected }}</span>
      <span v-if="lastReorder">{{ copy.moved }}: {{ lastReorder.id }} · {{ lastReorder.from + 1 }} → {{ lastReorder.to + 1 }} · {{ lastReorder.source === 'pointer' ? copy.pointer : copy.keyboard }}</span>
</div>
    <p :id="helpId" class="dock-demo__hint">
{{ copy.help }}
</p>
  </div>
</template>

<style scoped>
.dock-demo { display: grid; gap: 16px; color: var(--tx-text-color-regular, #606266); font-size: 13px; }
.dock-demo__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dock-demo__stage { display: flex; align-items: center; justify-content: center; padding: 20px 8px; min-height: 120px; border-block: 1px solid var(--tx-border-color, #dcdfe6); }
.dock-demo__icon { width: 70%; height: 70%; }
.dock-demo__output { display: grid; gap: 6px; overflow-wrap: anywhere; line-height: 1.6; }
.dock-demo__output output { font-size: 13px; color: var(--tx-text-color-primary, #303133); }
.dock-demo__hint { margin: 0; font-size: 12px; line-height: 1.6; }
</style>
