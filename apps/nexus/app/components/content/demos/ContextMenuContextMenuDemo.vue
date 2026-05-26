<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const isZh = computed(() => locale.value === 'zh')
const controlledOpen = ref(false)
const x = ref(0)
const y = ref(0)
const clickOpen = ref(false)
const clickX = ref(0)
const clickY = ref(0)
const popoverOpen = ref(false)
const panelPopoverOpen = ref(false)
const animationMode = ref<'transfer' | 'boom' | 'opacity' | 'none'>('transfer')
const anchorMode = ref<'pointer' | 'reference'>('pointer')
const lastAction = ref(isZh.value ? '等待操作' : 'Waiting for action')

const labels = computed(() => isZh.value
  ? {
      openControlled: '在中心打开受控菜单',
      close: '关闭',
      rightClickZone: '在这里右键：菜单会自动避让边缘，重复右键会跟随最新位置',
      clickOpen: '点击按钮打开坐标菜单',
      popover: '嵌入 Popover 的菜单面板',
      popoverHint: '这个面板没有右键触发器，只复用 ContextMenu 的视觉和 item 行为。',
      action: '最近操作',
      animation: '切换动画',
      anchorMode: '锚点模式',
    }
  : {
      openControlled: 'Open controlled menu at center',
      close: 'Close',
      rightClickZone: 'Right-click here: the menu avoids edges and follows the latest click position',
      clickOpen: 'Open coordinate menu by click',
      popover: 'ContextMenu panel inside Popover',
      popoverHint: 'This panel has no context trigger; it only reuses the menu surface and item behavior.',
      action: 'Last action',
      animation: 'Animation',
      anchorMode: 'Anchor mode',
    })

const animationOptions = computed(() => ({
  type: animationMode.value,
  duration: animationMode.value === 'none' ? 0 : 180,
  closeDuration: animationMode.value === 'none' ? 0 : 120,
  distance: 12,
  scale: 0.94,
  blur: 8,
}))

function setAction(action: string) {
  lastAction.value = action
}

function openAtCenter() {
  x.value = Math.round(window.innerWidth * 0.5)
  y.value = Math.round(window.innerHeight * 0.38)
  controlledOpen.value = true
}

function openClickMenu(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  clickX.value = Math.round(rect.left + rect.width / 2)
  clickY.value = Math.round(rect.bottom + 8)
  clickOpen.value = true
}
</script>

<template>
  <div class="context-menu-demo">
    <div class="context-menu-demo__toolbar">
      <TxButton type="primary" @click="openAtCenter">
        {{ labels.openControlled }}
      </TxButton>
      <TxButton @click="controlledOpen = false; clickOpen = false">
        {{ labels.close }}
      </TxButton>
      <label class="context-menu-demo__select">
        <span>{{ labels.animation }}</span>
        <select v-model="animationMode">
          <option value="transfer">transfer</option>
          <option value="boom">boom</option>
          <option value="opacity">opacity</option>
          <option value="none">none</option>
        </select>
      </label>
      <label class="context-menu-demo__select">
        <span>{{ labels.anchorMode }}</span>
        <select v-model="anchorMode">
          <option value="pointer">pointer</option>
          <option value="reference">reference</option>
        </select>
      </label>
    </div>

    <TxContextMenu
      v-model="controlledOpen"
      :x="x"
      :y="y"
      :animation="animationOptions"
      show-arrow
      @open="setAction(isZh ? '受控菜单已打开' : 'Controlled menu opened')"
    >
      <template #menu>
        <TxContextMenuItem shortcut="⌘C" @select="setAction('Copy')">
          Copy
        </TxContextMenuItem>
        <TxContextMenuItem shortcut="⌘V" disabled @select="setAction('Paste')">
          Paste disabled
        </TxContextMenuItem>
        <TxContextMenuDivider />
        <TxContextMenuItem color="#8b5cf6" shortcut="⌘K" @select="setAction('Custom color')">
          Custom purple action
        </TxContextMenuItem>
        <TxContextMenuItem danger shortcut="⌫" @select="setAction('Delete')">
          Delete
        </TxContextMenuItem>
      </template>
    </TxContextMenu>

    <TxContextMenu
      :animation="animationOptions"
      :anchor-mode="anchorMode"
      :width="260"
      @open="setAction(isZh ? '右键菜单已跟随最新位置' : 'Context menu followed the latest position')"
      @close="popoverOpen = false"
    >
      <template #trigger>
        <div class="context-menu-demo__zone">
          {{ labels.rightClickZone }}
        </div>
      </template>

      <template #menu>
        <TxContextMenuItem shortcut="⌘R" @select="setAction('Refresh')">
          Refresh
        </TxContextMenuItem>
        <TxContextMenuItem shortcut="↩" @select="setAction('Rename')">
          Rename
        </TxContextMenuItem>
        <TxContextMenuDivider dashed />
        <TxPopover
          v-model="popoverOpen"
          placement="right-start"
          :offset="8"
          :show-arrow="false"
          :toggle-on-reference-click="false"
          :close-on-click-outside="false"
          reference-full-width
          :animation="{ type: 'boom', duration: 160, closeDuration: 100, scale: 0.96, blur: 6 }"
          :panel-padding="6"
          :panel-radius="14"
        >
          <template #reference>
            <TxContextMenuItem submenu :close-on-select="false" @select="popoverOpen = true">
              More actions
            </TxContextMenuItem>
          </template>
          <TxContextMenuPanel :width="180" :close="() => { popoverOpen = false }" outside-guard>
            <TxContextMenuItem shortcut="⌘D" @select="setAction('Duplicate'); popoverOpen = false">
              Duplicate
            </TxContextMenuItem>
            <TxContextMenuItem color="var(--tx-color-primary, #409eff)" @select="setAction('Share'); popoverOpen = false">
              Share link
            </TxContextMenuItem>
          </TxContextMenuPanel>
        </TxPopover>
        <TxContextMenuItem danger shortcut="⌘⌫" @select="setAction('Delete')">
          Delete
        </TxContextMenuItem>
      </template>
    </TxContextMenu>

    <div class="context-menu-demo__grid">
      <TxButton @click="openClickMenu">
        {{ labels.clickOpen }}
      </TxButton>
      <TxContextMenu
        v-model="clickOpen"
        trigger="manual"
        :x="clickX"
        :y="clickY"
        :width="230"
        :animation="{ type: 'boom', duration: 180, closeDuration: 120, scale: 0.92, blur: 10 }"
        panel-background="glass"
      >
        <template #menu>
          <TxContextMenuItem shortcut="⌘N" @select="setAction('New file')">
            New file
          </TxContextMenuItem>
          <TxContextMenuItem shortcut="⇧⌘N" @select="setAction('New folder')">
            New folder
          </TxContextMenuItem>
        </template>
      </TxContextMenu>

      <TxPopover
        v-model="panelPopoverOpen"
        placement="bottom-start"
        :width="260"
        :panel-padding="6"
        :show-arrow="true"
        :animation="{ type: 'transfer', duration: 180, closeDuration: 120 }"
      >
        <template #reference>
          <TxButton>{{ labels.popover }}</TxButton>
        </template>
        <TxContextMenuPanel :close="() => { panelPopoverOpen = false }">
          <TxContextMenuItem shortcut="⌘P" @select="setAction('Pinned from popover')">
            Pin to top
          </TxContextMenuItem>
          <TxContextMenuItem color="#10b981" @select="setAction('Approved')">
            Approve
          </TxContextMenuItem>
          <TxContextMenuDivider inset />
          <TxContextMenuItem danger @select="setAction('Rejected')">
            Reject
          </TxContextMenuItem>
          <p class="context-menu-demo__hint">
            {{ labels.popoverHint }}
          </p>
        </TxContextMenuPanel>
      </TxPopover>
    </div>

    <div class="context-menu-demo__status">
      {{ labels.action }}: {{ lastAction }}
    </div>
  </div>
</template>

<style scoped>
.context-menu-demo {
  display: grid;
  gap: 14px;
  width: min(100%, 680px);
}

.context-menu-demo__toolbar,
.context-menu-demo__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.context-menu-demo__select {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

.context-menu-demo__select select {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  border-radius: 10px;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-bg-color-overlay, #fff);
}

.context-menu-demo__zone {
  width: 100%;
  min-height: 86px;
  display: flex;
  align-items: center;
  padding: 24px;
  border: 1px dashed var(--tx-border-color, #dcdfe6);
  border-radius: 14px;
  color: var(--tx-text-color-primary, #303133);
  user-select: none;
  box-sizing: border-box;
}

.context-menu-demo__status {
  width: fit-content;
  padding: 8px 10px;
  border-radius: 12px;
  color: var(--tx-text-color-secondary, #909399);
  background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 70%, transparent);
  font-size: 13px;
}

.context-menu-demo__hint {
  margin: 6px 8px 2px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.45;
}
</style>
