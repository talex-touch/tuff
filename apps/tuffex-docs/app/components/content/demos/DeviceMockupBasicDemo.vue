<script setup lang="ts">
import type {
  DeviceMockupMetrics,
  DeviceMockupOrientation,
  DeviceMockupPreset,
} from '@talex-touch/tuffex/device-mockup'
import type { TxSelectModelValue, TxSelectOptionGroup } from '@talex-touch/tuffex/select'
import type { CSSProperties } from 'vue'
import { registerDeviceMockupPresets } from '@talex-touch/tuffex/device-mockup'
import {
  ANDROID_DEVICE_PRESETS,
  BROWSER_DEVICE_PRESETS,
  DESKTOP_DEVICE_PRESETS,
  DEVICE_MOCKUP_PRESETS,
  IOS_DEVICE_PRESETS,
  TABLET_DEVICE_PRESETS,
  WATCH_DEVICE_PRESETS,
} from '@talex-touch/tuffex/device-mockup/presets'
import { computed, ref } from 'vue'

registerDeviceMockupPresets(DEVICE_MOCKUP_PRESETS)

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

interface QuickDevice {
  id: string
  label: string
  icon: string
}

const QUICK_DEVICES: readonly QuickDevice[] = [
  { id: 'iphone-17-pro', label: 'iPhone', icon: 'i-carbon-mobile' },
  { id: 'pixel-10-pro', label: 'Pixel', icon: 'i-carbon-mobile' },
  { id: 'ipad-pro-13', label: 'iPad', icon: 'i-carbon-tablet' },
  { id: 'macbook-pro-16', label: 'MacBook', icon: 'i-carbon-laptop' },
  { id: 'pixel-watch-3', label: 'Watch', icon: 'i-carbon-watch' },
  { id: 'browser-arc', label: 'Arc', icon: 'i-carbon-application-web' },
]

const PRESET_BY_ID = new Map<string, DeviceMockupPreset>(
  DEVICE_MOCKUP_PRESETS.map(preset => [preset.id, preset]),
)

const activePresetId = ref<string>('iphone-17-pro')
const orientation = ref<DeviceMockupOrientation>('portrait')
const metrics = ref<DeviceMockupMetrics | null>(null)

const activePreset = computed<DeviceMockupPreset>(
  () => PRESET_BY_ID.get(activePresetId.value) ?? IOS_DEVICE_PRESETS[0]!,
)

const groupedDeviceOptions = computed<TxSelectOptionGroup[]>(() => [
  {
    label: zh.value ? `iOS (${IOS_DEVICE_PRESETS.length})` : `iOS (${IOS_DEVICE_PRESETS.length})`,
    options: IOS_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })),
  },
  {
    label: zh.value ? `Android (${ANDROID_DEVICE_PRESETS.length})` : `Android (${ANDROID_DEVICE_PRESETS.length})`,
    options: ANDROID_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })),
  },
  {
    label: zh.value ? `平板 (${TABLET_DEVICE_PRESETS.length})` : `Tablet (${TABLET_DEVICE_PRESETS.length})`,
    options: TABLET_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })),
  },
  {
    label: zh.value ? `桌面 (${DESKTOP_DEVICE_PRESETS.length})` : `Desktop (${DESKTOP_DEVICE_PRESETS.length})`,
    options: DESKTOP_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })),
  },
  {
    label: zh.value ? `手表 (${WATCH_DEVICE_PRESETS.length})` : `Watch (${WATCH_DEVICE_PRESETS.length})`,
    options: WATCH_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })),
  },
  {
    label: zh.value ? `浏览器与窗口 (${BROWSER_DEVICE_PRESETS.length})` : `Browser & Window (${BROWSER_DEVICE_PRESETS.length})`,
    options: BROWSER_DEVICE_PRESETS.map(p => ({ value: p.id, label: p.name })),
  },
])

const isCompact = computed(() => activePreset.value.category === 'watch')
const isTablet = computed(() => activePreset.value.category === 'tablet')
const isWide = computed(() =>
  activePreset.value.category === 'desktop'
  || activePreset.value.category === 'browser'
  || (activePreset.value.orientable && orientation.value === 'landscape'),
)
const isDesktop = computed(() => activePreset.value.category === 'desktop')
const isBrowser = computed(() => activePreset.value.category === 'browser')

const copy = computed(() => (zh.value
  ? {
      selectDevice: '选择机型（全部 75 款）',
      searchPlaceholder: '搜索 75 款设备…',
      flipOrientation: '切换横竖屏',
      availableModels: `内置 ${DEVICE_MOCKUP_PRESETS.length} 款机型`,
      workspace: 'Tuff 工作台',
      uiSearch: '搜索命令、插件或文档…',
      syncStatus: '已同步',
      latency: '检索延迟',
      plugins: '活跃插件',
      throughput: '索引命中',
      recentTitle: '最近活动',
      items: [
        { title: '剪贴板历史', meta: '2 分钟前', tag: '核心' },
        { title: 'AI 划词助手', meta: '14 分钟前', tag: '智能体' },
        { title: '快速截图标注', meta: '1 小时前', tag: '工具' },
      ],
      watchMetric: '云端已同步',
      watchSub: '3 个插件运行中',
    }
  : {
      selectDevice: 'Select device (75 built-in)',
      searchPlaceholder: 'Search 75 devices...',
      flipOrientation: 'Flip portrait / landscape',
      availableModels: `${DEVICE_MOCKUP_PRESETS.length} models available`,
      workspace: 'Tuff Workspace',
      uiSearch: 'Search commands, plugins, docs...',
      syncStatus: 'Synced',
      latency: 'Search latency',
      plugins: 'Active plugins',
      throughput: 'Index hits',
      recentTitle: 'Recent activity',
      items: [
        { title: 'Clipboard History', meta: '2m ago', tag: 'Core' },
        { title: 'AI Selection Actions', meta: '14m ago', tag: 'Agent' },
        { title: 'Quick Capture Studio', meta: '1h ago', tag: 'Tool' },
      ],
      watchMetric: 'Cloud synced',
      watchSub: '3 active plugins',
    }))

function selectDeviceById(id: string): void {
  const found = PRESET_BY_ID.get(id)
  if (!found)
    return
  activePresetId.value = found.id
  if (!found.orientable)
    orientation.value = 'portrait'
}

function onSelectDevice(value: TxSelectModelValue): void {
  if (typeof value === 'string')
    selectDeviceById(value)
}

function toggleOrientation(): void {
  if (!activePreset.value.orientable)
    return
  orientation.value = orientation.value === 'portrait' ? 'landscape' : 'portrait'
}

function onMetricsChange(next: DeviceMockupMetrics): void {
  metrics.value = next
}

function screenSafeStyle(preset: DeviceMockupPreset, activeOrientation: DeviceMockupOrientation): CSSProperties {
  if (preset.category === 'watch') {
    if (preset.shape === 'circle')
      return { padding: '28px 22px 24px' }
    return { paddingTop: '28px' }
  }
  if (preset.category === 'tablet') {
    return {
      paddingTop: `${Math.max(48, preset.safeArea.top + 24)}px`,
      paddingBottom: `${Math.max(40, preset.safeArea.bottom + 20)}px`,
    }
  }
  if (preset.category === 'phone') {
    if (activeOrientation === 'landscape') {
      const sidePad = preset.cutout !== 'none' ? 56 : 36
      return {
        paddingTop: '42px',
        paddingRight: `${sidePad}px`,
        paddingBottom: `${Math.max(24, Math.round(preset.safeArea.bottom * 0.75) + 12)}px`,
        paddingLeft: `${sidePad}px`,
      }
    }
    return {
      paddingTop: `${Math.max(28, preset.safeArea.top + 14)}px`,
      paddingBottom: `${Math.max(24, preset.safeArea.bottom + 12)}px`,
    }
  }
  if (preset.cutout === 'lid-notch')
    return { paddingTop: '68px' }
  return {}
}
</script>

<template>
  <div class="not-prose dm-basic-demo">
    <div class="dm-basic-demo__stage">
      <TxDeviceMockup
        :device="activePreset"
        :orientation="orientation"
        finish="titanium"
        animated
        show-status-bar
        show-cutout
        status-bar-theme="dark"
        browser-theme="dark"
        shadow="elevated"
        fit="contain"
        :max-height="372"
        browser-url="https://tuff.tagzxia.com/workspace"
        browser-title="Tuff Workspace"
        @metrics-change="onMetricsChange"
      >
        <template #default="{ preset, orientation: activeOrientation }">
          <div
            class="dm-screen"
            :class="{
              'is-compact': isCompact,
              'is-tablet': isTablet,
              'is-wide': isWide,
              'is-desktop': isDesktop,
              'is-browser': isBrowser,
            }"
            :style="screenSafeStyle(preset, activeOrientation)"
          >
            <template v-if="isCompact">
              <div class="dm-screen__watch">
                <span class="dm-screen__watch-ring" aria-hidden="true">
                  <span class="dm-screen__watch-dot" />
                </span>
                <strong>99.8%</strong>
                <span>{{ copy.watchMetric }}</span>
                <small>{{ copy.watchSub }}</small>
              </div>
            </template>

            <template v-else>
              <header class="dm-screen__header">
                <div class="dm-screen__brand">
                  <span class="dm-screen__logo">
                    <i class="i-carbon-flash" aria-hidden="true" />
                  </span>
                  <strong>{{ copy.workspace }}</strong>
                </div>
                <span class="dm-screen__status">
                  <i class="i-carbon-checkmark-filled" aria-hidden="true" />
                  {{ copy.syncStatus }}
                </span>
              </header>

              <div class="dm-screen__search">
                <i class="i-carbon-search" aria-hidden="true" />
                <span>{{ copy.uiSearch }}</span>
                <kbd>⌘K</kbd>
              </div>

              <div class="dm-screen__metrics">
                <div class="dm-screen__metric-card">
                  <small>{{ copy.latency }}</small>
                  <strong>12 ms</strong>
                </div>
                <div class="dm-screen__metric-card">
                  <small>{{ copy.plugins }}</small>
                  <strong>18</strong>
                </div>
                <div v-if="isWide" class="dm-screen__metric-card">
                  <small>{{ copy.throughput }}</small>
                  <strong>99.4%</strong>
                </div>
              </div>

              <div class="dm-screen__list">
                <div class="dm-screen__section-title">
                  {{ copy.recentTitle }}
                </div>
                <div v-for="entry in copy.items" :key="entry.title" class="dm-screen__row">
                  <div class="dm-screen__row-main">
                    <span>{{ entry.title }}</span>
                    <small>{{ entry.meta }}</small>
                  </div>
                  <span class="dm-screen__tag">{{ entry.tag }}</span>
                </div>
              </div>
            </template>
          </div>
        </template>
      </TxDeviceMockup>
    </div>

    <div class="dm-basic-demo__toolbar">
      <div class="dm-basic-demo__quick" role="group" :aria-label="copy.selectDevice">
        <button
          v-for="item in QUICK_DEVICES"
          :key="item.id"
          type="button"
          class="dm-basic-demo__seg"
          :class="{ 'is-active': activePresetId === item.id }"
          :aria-pressed="activePresetId === item.id"
          @click="selectDeviceById(item.id)"
        >
          <i :class="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div class="dm-basic-demo__actions">
        <div class="dm-basic-demo__select-wrap">
          <TxSelect
            :model-value="activePresetId"
            :options="groupedDeviceOptions"
            :placeholder="copy.selectDevice"
            :search-placeholder="copy.searchPlaceholder"
            :aria-label="copy.selectDevice"
            @update:model-value="onSelectDevice"
          />
        </div>
        <TxButton
          size="sm"
          variant="secondary"
          :disabled="!activePreset.orientable"
          :aria-label="copy.flipOrientation"
          :title="copy.flipOrientation"
          @click="toggleOrientation"
        >
          <i class="i-carbon-rotate" aria-hidden="true" />
        </TxButton>
      </div>
    </div>

    <div class="dm-basic-demo__spec">
      <span>{{ activePreset.name }}</span>
      <span>·</span>
      <span>{{ Math.round(metrics?.screenWidth ?? activePreset.width) }} × {{ Math.round(metrics?.screenHeight ?? activePreset.height) }}</span>
      <span>·</span>
      <span>{{ copy.availableModels }}</span>
    </div>
  </div>
</template>

<style scoped>
.dm-basic-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dm-basic-demo__stage {
  --dm-stage-bg-color: #f3f5f9;
  --dm-stage-bg-image:
    radial-gradient(rgba(15, 23, 42, 0.065) 1px, transparent 1px),
    radial-gradient(ellipse 80% 60% at 50% 0%, #ffffff 0%, #f3f5f9 65%, #eaeef5 100%);
  --dm-stage-bg-size: 20px 20px, 100% 100%;
  --dm-stage-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
  padding: 28px 20px;
  border-radius: 16px;
  background-color: var(--dm-stage-bg-color);
  background-image: var(--dm-stage-bg-image);
  background-size: var(--dm-stage-bg-size);
  box-shadow: var(--dm-stage-shadow);
  overflow: hidden;
}

.dm-basic-demo__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
}

.dm-basic-demo__quick {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border-radius: 11px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-basic-demo__seg {
  appearance: none;
  border: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.dm-basic-demo__seg:hover {
  color: var(--tx-text-color-primary);
}

.dm-basic-demo__seg.is-active {
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dm-basic-demo__seg:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 1px;
}

.dm-basic-demo__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dm-basic-demo__select-wrap {
  width: 196px;
}

.dm-basic-demo__select-wrap :deep(.tuff-select) {
  width: 100%;
}

.dm-basic-demo__spec {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.dm-screen {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 28px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background:
    radial-gradient(circle at 84% 12%, rgba(56, 189, 248, 0.16), transparent 42%),
    radial-gradient(circle at 14% 88%, rgba(99, 102, 241, 0.16), transparent 46%),
    linear-gradient(165deg, #0b1120 0%, #111827 58%, #0f172a 100%);
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.dm-screen.is-wide {
  padding: 36px 48px;
  gap: 20px;
}

.dm-screen.is-tablet {
  padding: 56px 52px 48px;
  gap: 32px;
}

.dm-screen.is-tablet .dm-screen__brand {
  font-size: 32px;
  gap: 16px;
}

.dm-screen.is-tablet .dm-screen__logo {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  font-size: 28px;
}

.dm-screen.is-tablet .dm-screen__status {
  padding: 9px 18px;
  font-size: 22px;
  gap: 8px;
}

.dm-screen.is-tablet .dm-screen__search {
  padding: 20px 24px;
  border-radius: 20px;
  font-size: 24px;
  gap: 16px;
}

.dm-screen.is-tablet .dm-screen__search kbd {
  padding: 5px 12px;
  border-radius: 10px;
  font-size: 20px;
}

.dm-screen.is-tablet .dm-screen__metrics {
  gap: 18px;
}

.dm-screen.is-tablet .dm-screen__metric-card {
  padding: 24px 26px;
  border-radius: 20px;
  gap: 10px;
}

.dm-screen.is-tablet .dm-screen__metric-card small {
  font-size: 21px;
}

.dm-screen.is-tablet .dm-screen__metric-card strong {
  font-size: 42px;
}

.dm-screen.is-tablet .dm-screen__list {
  gap: 16px;
}

.dm-screen.is-tablet .dm-screen__section-title {
  font-size: 19px;
}

.dm-screen.is-tablet .dm-screen__row {
  padding: 22px 26px;
  border-radius: 20px;
}

.dm-screen.is-tablet .dm-screen__row-main {
  font-size: 24px;
  gap: 6px;
}

.dm-screen.is-tablet .dm-screen__row-main small {
  font-size: 19px;
}

.dm-screen.is-tablet .dm-screen__tag {
  padding: 6px 16px;
  font-size: 19px;
}

.dm-screen.is-desktop {
  padding: 58px 68px 46px;
  gap: 28px;
}

.dm-screen.is-desktop .dm-screen__brand {
  font-size: 34px;
  gap: 16px;
}

.dm-screen.is-desktop .dm-screen__logo {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  font-size: 28px;
}

.dm-screen.is-desktop .dm-screen__status {
  padding: 9px 20px;
  font-size: 22px;
  gap: 9px;
}

.dm-screen.is-desktop .dm-screen__search {
  padding: 20px 26px;
  border-radius: 20px;
  font-size: 24px;
  gap: 16px;
}

.dm-screen.is-desktop .dm-screen__search kbd {
  padding: 5px 12px;
  border-radius: 9px;
  font-size: 20px;
}

.dm-screen.is-desktop .dm-screen__metrics {
  gap: 20px;
}

.dm-screen.is-desktop .dm-screen__metric-card {
  padding: 24px 28px;
  border-radius: 22px;
  gap: 10px;
}

.dm-screen.is-desktop .dm-screen__metric-card small {
  font-size: 20px;
}

.dm-screen.is-desktop .dm-screen__metric-card strong {
  font-size: 44px;
}

.dm-screen.is-desktop .dm-screen__list {
  gap: 15px;
}

.dm-screen.is-desktop .dm-screen__section-title {
  font-size: 19px;
}

.dm-screen.is-desktop .dm-screen__row {
  padding: 20px 26px;
  border-radius: 20px;
}

.dm-screen.is-desktop .dm-screen__row-main {
  font-size: 24px;
  gap: 5px;
}

.dm-screen.is-desktop .dm-screen__row-main small {
  font-size: 18px;
}

.dm-screen.is-desktop .dm-screen__tag {
  padding: 7px 16px;
  font-size: 18px;
}

.dm-screen.is-browser {
  padding: 34px 44px 30px;
  gap: 20px;
}

.dm-screen.is-browser .dm-screen__brand {
  font-size: 25px;
  gap: 12px;
}

.dm-screen.is-browser .dm-screen__logo {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  font-size: 21px;
}

.dm-screen.is-browser .dm-screen__status {
  padding: 6px 14px;
  font-size: 16px;
  gap: 7px;
}

.dm-screen.is-browser .dm-screen__search {
  padding: 14px 18px;
  border-radius: 15px;
  font-size: 18px;
  gap: 12px;
}

.dm-screen.is-browser .dm-screen__search kbd {
  padding: 4px 10px;
  border-radius: 7px;
  font-size: 15px;
}

.dm-screen.is-browser .dm-screen__metrics {
  gap: 14px;
}

.dm-screen.is-browser .dm-screen__metric-card {
  padding: 16px 20px;
  border-radius: 16px;
  gap: 7px;
}

.dm-screen.is-browser .dm-screen__metric-card small {
  font-size: 15px;
}

.dm-screen.is-browser .dm-screen__metric-card strong {
  font-size: 32px;
}

.dm-screen.is-browser .dm-screen__list {
  gap: 11px;
}

.dm-screen.is-browser .dm-screen__section-title {
  font-size: 14px;
}

.dm-screen.is-browser .dm-screen__row {
  padding: 13px 18px;
  border-radius: 15px;
}

.dm-screen.is-browser .dm-screen__row-main {
  font-size: 18px;
  gap: 3px;
}

.dm-screen.is-browser .dm-screen__row-main small {
  font-size: 14px;
}

.dm-screen.is-browser .dm-screen__tag {
  padding: 5px 12px;
  font-size: 14px;
}

.dm-screen.is-compact {
  padding: 16px;
  align-items: center;
  justify-content: center;
}

.dm-screen__watch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
}

.dm-screen__watch-ring {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(52, 211, 153, 0.14);
  box-shadow: inset 0 0 0 1.5px rgba(52, 211, 153, 0.45);
}

.dm-screen__watch-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #34d399;
}

.dm-screen__watch strong {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.1;
}

.dm-screen__watch span {
  font-size: 13px;
  color: #e2e8f0;
}

.dm-screen__watch small {
  font-size: 11px;
  color: #94a3b8;
}

.dm-screen__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dm-screen__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 600;
}

.dm-screen__logo {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: #ffffff;
  font-size: 15px;
}

.dm-screen__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
  font-size: 12px;
  font-weight: 500;
}

.dm-screen__search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  font-size: 13px;
}

.dm-screen__search span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-screen__search kbd {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dm-screen__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}

.dm-screen__metric-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 15px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.dm-screen__metric-card small {
  font-size: 12px;
  color: #94a3b8;
}

.dm-screen__metric-card strong {
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
}

.dm-screen__list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  flex: 1;
}

.dm-screen__section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
}

.dm-screen__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.075);
}

.dm-screen__row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.dm-screen__row-main small {
  font-size: 11px;
  color: #94a3b8;
}

.dm-screen__tag {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.22);
  color: #c7d2fe;
  font-size: 11px;
  font-weight: 500;
}

@media (max-width: 640px) {
  .dm-basic-demo__stage {
    min-height: 320px;
    padding: 18px 12px;
  }

  .dm-basic-demo__actions {
    width: 100%;
  }

  .dm-basic-demo__select-wrap {
    flex: 1;
    min-width: 0;
    width: auto;
  }
}
</style>

<style>
html.dark .dm-basic-demo .dm-basic-demo__stage,
html[data-theme='dark'] .dm-basic-demo .dm-basic-demo__stage,
.dark .dm-basic-demo .dm-basic-demo__stage,
[data-theme='dark'] .dm-basic-demo .dm-basic-demo__stage {
  --dm-stage-bg-color: #090b10;
  --dm-stage-bg-image:
    radial-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
    radial-gradient(ellipse 64% 52% at 50% 46%, rgba(96, 165, 250, 0.14) 0%, rgba(129, 140, 248, 0.06) 38%, transparent 72%),
    radial-gradient(ellipse 90% 80% at 50% 100%, rgba(15, 23, 42, 0.52) 0%, transparent 65%),
    linear-gradient(180deg, #0b0e16 0%, #090b10 100%);
  --dm-stage-bg-size: 20px 20px, 100% 100%, 100% 100%, 100% 100%;
  --dm-stage-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
}
</style>
