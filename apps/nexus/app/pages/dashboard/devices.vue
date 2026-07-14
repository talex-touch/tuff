<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { useToast } from '~/composables/useToast'
import { requestJson, useTypedFetch } from '~/utils/request'

const LazyGeoLeafletMap = defineAsyncComponent(() => import('~/components/dashboard/GeoLeafletMap.client.vue'))

defineI18nRoute(false)

const { t, locale } = useI18n()
const toast = useToast()
const { deviceId: currentDeviceId, deviceName: currentDeviceName, setDeviceName } = useDeviceIdentity()

interface DeviceItem {
  id: string
  deviceName: string | null
  platform: string | null
  clientType: string | null
  trusted: boolean
  trustedAt: string | null
  userAgent: string | null
  lastSeenAt: string | null
  lastSeenIpMasked?: string | null
  lastSeenIp?: string | null
  createdAt: string
  revokedAt: string | null
  lastLocation?: {
    countryCode: string | null
    regionCode: string | null
    regionName: string | null
    city: string | null
    latitude: number | null
    longitude: number | null
    updatedAt: string | null
  } | null
  lastLoginIpMasked?: string | null
  lastLoginIp?: string | null
  lastLoginAt?: string | null
}

type DeviceFilter = 'all' | 'revoked' | 'trusted'

const { data, pending, refresh } = useTypedFetch<DeviceItem[]>('/api/devices')
const actionLoading = ref(false)
const editingId = ref<string | null>(null)
const renameValue = ref('')

const devices = computed(() => data.value ?? [])
const expandedMapDeviceId = ref<string | null>(null)
const openActionDeviceId = ref<string | null>(null)
const filterOpen = ref(false)
const selectedSessionFilters = ref<DeviceFilter[]>(['all'])
const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))

const countryDisplayNames = computed(() => {
  try {
    return new Intl.DisplayNames([localeTag.value], { type: 'region' })
  }
  catch {
    return null
  }
})

const absoluteDateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}))

function isCurrent(device: DeviceItem) {
  return device.id === currentDeviceId.value
}

function isTrustedDevice(device: DeviceItem) {
  return device.trusted && !device.revokedAt
}

const sessionFilterOptions = computed<Array<{ value: DeviceFilter, label: string, icon: string, count: number }>>(() => [
  {
    value: 'all',
    label: t('dashboard.devices.filters.all', '全部'),
    icon: 'i-carbon-list',
    count: devices.value.length,
  },
  {
    value: 'revoked',
    label: t('dashboard.devices.revoked', '已撤销'),
    icon: 'i-carbon-logout',
    count: devices.value.filter(device => Boolean(device.revokedAt)).length,
  },
  {
    value: 'trusted',
    label: t('dashboard.devices.trusted', '可信设备'),
    icon: 'i-carbon-security',
    count: devices.value.filter(isTrustedDevice).length,
  },
])

const activeSessionFilterLabel = computed(() => {
  if (selectedSessionFilters.value.includes('all'))
    return t('dashboard.devices.filters.all', '全部')

  return sessionFilterOptions.value
    .filter(option => selectedSessionFilters.value.includes(option.value))
    .map(option => option.label)
    .join(' / ')
})

const filteredDevices = computed(() => {
  const orderedDevices = [...devices.value].sort((a, b) => {
    return Number(Boolean(a.revokedAt)) - Number(Boolean(b.revokedAt))
  })

  if (selectedSessionFilters.value.includes('all'))
    return orderedDevices

  return orderedDevices.filter((device) => {
    return (
      (selectedSessionFilters.value.includes('revoked') && Boolean(device.revokedAt))
      || (selectedSessionFilters.value.includes('trusted') && isTrustedDevice(device))
    )
  })
})

function isSessionFilterSelected(filter: DeviceFilter) {
  return selectedSessionFilters.value.includes(filter)
}

function toggleSessionFilter(filter: DeviceFilter, selected: boolean) {
  if (filter === 'all') {
    selectedSessionFilters.value = ['all']
    return
  }

  const next = new Set(selectedSessionFilters.value.filter(item => item !== 'all'))
  if (selected)
    next.add(filter)
  else
    next.delete(filter)

  selectedSessionFilters.value = next.size > 0 ? Array.from(next) : ['all']
}

function formatClientType(value: string | null) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (normalized === 'cli')
    return t('dashboard.devices.clientTypes.cli', 'CLI')
  if (normalized === 'external')
    return t('dashboard.devices.clientTypes.external', 'External')
  if (normalized === 'web')
    return t('dashboard.devices.clientTypes.web', 'Web')
  if (normalized === 'app')
    return t('dashboard.devices.clientTypes.app', 'App')
  return t('dashboard.devices.clientTypes.unknown', '未知来源')
}

function formatAbsoluteTime(value: string | null) {
  if (!value)
    return t('dashboard.devices.unknown', '未知')
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return t('dashboard.devices.unknown', '未知')
  return absoluteDateFormatter.value.format(date)
}

function formatDevicePlatform(device: DeviceItem): string {
  const value = `${device.platform || ''} ${device.userAgent || ''}`.toLowerCase()
  if (value.includes('iphone') || value.includes('ipad') || value.includes('ios'))
    return 'iOS'
  if (value.includes('mac') || value.includes('darwin'))
    return 'macOS'
  if (value.includes('win'))
    return 'Windows'
  if (value.includes('android'))
    return 'Android'
  if (value.includes('linux'))
    return 'Linux'
  return device.platform || 'Web'
}

function formatDeviceTime(device: DeviceItem): string {
  return formatAbsoluteTime(device.lastLoginAt || device.lastSeenAt)
}

function resolveDeviceIp(device: DeviceItem): string | null {
  return device.lastLoginIp || device.lastSeenIp || device.lastLoginIpMasked || device.lastSeenIpMasked || null
}

function formatMaskedIp(device: DeviceItem): string {
  return device.lastLoginIpMasked || device.lastSeenIpMasked || t('dashboard.devices.ipUnknown', 'IP 未知')
}

async function copyText(value: string | null | undefined) {
  const text = value?.trim()
  if (!text)
    return

  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('dashboard.devices.copied', '已复制'))
  }
  catch (error) {
    console.error('Failed to copy device field:', error)
    toast.error(t('dashboard.devices.copyFailed', '复制失败'))
  }
}

function getDeviceBrandIcon(device: DeviceItem): string {
  const value = `${device.platform || ''} ${device.deviceName || ''} ${device.clientType || ''}`.toLowerCase()
  if (value.includes('mac') || value.includes('darwin') || value.includes('iphone') || value.includes('ipad') || value.includes('ios'))
    return 'i-cib-apple'
  if (value.includes('win'))
    return 'i-cib-windows'
  if (value.includes('linux'))
    return 'i-cib-linux'
  if (value.includes('android'))
    return 'i-cib-android'
  if (value.includes('safari'))
    return 'i-cib-safari'
  if (value.includes('edge'))
    return 'i-cib-microsoft-edge'
  if (value.includes('web'))
    return 'i-carbon-application-web'
  return 'i-carbon-devices'
}

function startRename(device: DeviceItem) {
  editingId.value = device.id
  renameValue.value = device.deviceName || currentDeviceName.value || ''
}

function formatLocation(device: DeviceItem): string {
  const location = device.lastLocation
  if (!location) {
    return t('dashboard.devices.locationUnknown', '位置未知')
  }
  const country = location.countryCode
    ? countryDisplayNames.value?.of(location.countryCode) || location.countryCode
    : null
  const pieces = [country, location.regionName || location.regionCode, location.city].filter(Boolean)
  return pieces.length ? pieces.join(' · ') : t('dashboard.devices.locationUnknown', '位置未知')
}

function hasCoordinates(device: DeviceItem): boolean {
  return Number.isFinite(device.lastLocation?.latitude) && Number.isFinite(device.lastLocation?.longitude)
}

function toggleMap(device: DeviceItem) {
  if (!hasCoordinates(device)) {
    return
  }
  expandedMapDeviceId.value = expandedMapDeviceId.value === device.id ? null : device.id
}

function cancelRename() {
  editingId.value = null
  renameValue.value = ''
}

function isActionMenuOpen(device: DeviceItem): boolean {
  return openActionDeviceId.value === device.id
}

function setActionMenuOpen(device: DeviceItem, open: boolean) {
  openActionDeviceId.value = open ? device.id : null
}

async function saveRename(device: DeviceItem) {
  if (!renameValue.value.trim())
    return
  actionLoading.value = true
  try {
    await requestJson('/api/devices/rename', {
      method: 'POST',
      body: { deviceId: device.id, name: renameValue.value.trim() },
    })
    if (isCurrent(device))
      setDeviceName(renameValue.value.trim())
    await refresh()
    cancelRename()
  }
  catch (error) {
    console.error('Failed to rename device:', error)
  }
  finally {
    actionLoading.value = false
  }
}

async function revokeDevice(device: DeviceItem) {
  if (isCurrent(device))
    return
  actionLoading.value = true
  try {
    await requestJson('/api/devices/revoke', {
      method: 'POST',
      body: { deviceId: device.id },
    })
    await refresh()
  }
  catch (error) {
    console.error('Failed to revoke device:', error)
  }
  finally {
    actionLoading.value = false
  }
}

async function setTrusted(device: DeviceItem, trusted: boolean) {
  actionLoading.value = true
  try {
    await requestJson('/api/devices/trust', {
      method: 'POST',
      body: { deviceId: device.id, trusted },
    })
    await refresh()
  }
  catch (error) {
    console.error('Failed to update trusted device:', error)
  }
  finally {
    actionLoading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.devices.title', '设备管理') }}
      </h1>
      <p class="DashboardDevices-Description">
        {{ t('dashboard.devices.description', '查看和管理您登录的设备') }}
      </p>
    </header>

    <section class="DashboardDevices-Card apple-card-lg">
      <div class="DashboardDevices-CardHeader">
        <h2 class="DashboardDevices-CardTitle">
          {{ t('dashboard.devices.activeSessions', '设备列表') }}
        </h2>
        <TxPopover
          v-model="filterOpen"
          placement="bottom-end"
          :min-width="220"
          :max-width="260"
          :panel-padding="10"
          panel-background="pure"
        >
          <template #reference>
            <TxButton class="DashboardDevices-FilterButton" size="small" variant="secondary" icon="i-carbon-filter">
              {{ t('dashboard.devices.filters.label', '筛选') }}
              <span class="DashboardDevices-FilterSummary">{{ activeSessionFilterLabel }}</span>
              <span class="DashboardDevices-ActionChevron i-carbon-chevron-down" aria-hidden="true" />
            </TxButton>
          </template>

          <div class="DashboardDevices-FilterPanel">
            <p class="DashboardDevices-FilterTitle">
              {{ t('dashboard.devices.filters.title', '会话筛选') }}
            </p>
            <button
              v-for="option in sessionFilterOptions"
              :key="option.value"
              type="button"
              class="DashboardDevices-FilterOption"
              :class="{ 'is-selected': isSessionFilterSelected(option.value) }"
              @click="toggleSessionFilter(option.value, !isSessionFilterSelected(option.value))"
            >
              <TxCheckbox
                :model-value="isSessionFilterSelected(option.value)"
                :aria-label="option.label"
                @click.stop
                @change="(value: boolean) => toggleSessionFilter(option.value, value)"
              />
              <span class="DashboardDevices-FilterIcon" :class="option.icon" aria-hidden="true" />
              <span class="DashboardDevices-FilterLabel">{{ option.label }}</span>
              <span class="DashboardDevices-FilterCount">{{ option.count }}</span>
            </button>
          </div>
        </TxPopover>
      </div>

      <div v-if="pending" class="space-y-3">
        <div class="flex items-center justify-center">
          <TxSpinner :size="22" />
        </div>
        <div class="DashboardDevices-Item">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="DashboardDevices-Item">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>

      <ul v-else-if="filteredDevices.length" class="DashboardDevices-List">
        <li
          v-for="device in filteredDevices"
          :key="device.id"
          class="DashboardDevices-Item"
          :class="{ 'is-current': isCurrent(device), 'is-trusted': isTrustedDevice(device), 'is-revoked': Boolean(device.revokedAt) }"
        >
          <span v-if="isCurrent(device)" class="DashboardDevices-CurrentRibbon">
            {{ t('dashboard.devices.currentDevice', '当前设备') }}
          </span>
          <div class="DashboardDevices-ItemMain">
            <div class="DashboardDevices-Brand">
              <div class="DashboardDevices-BrandIcon">
                <span :class="getDeviceBrandIcon(device)" aria-hidden="true" />
                <span
                  v-if="isTrustedDevice(device)"
                  class="DashboardDevices-BrandTrustMark i-carbon-checkmark-filled"
                  aria-hidden="true"
                />
              </div>
              <span class="DashboardDevices-Platform">{{ formatDevicePlatform(device) }}</span>
            </div>

            <div class="DashboardDevices-Content">
              <p class="DashboardDevices-Title">
                <span class="DashboardDevices-TitleName truncate">{{ device.deviceName || t('dashboard.devices.unnamed', '未命名设备') }}</span>
                <span v-if="isTrustedDevice(device)" class="DashboardDevices-Badge is-trusted">
                  <span class="i-carbon-checkmark-filled" aria-hidden="true" />
                  {{ t('dashboard.devices.trusted', '可信设备') }}
                </span>
                <span v-if="device.revokedAt" class="DashboardDevices-Badge is-revoked">
                  {{ t('dashboard.devices.revoked', '已撤销') }}
                </span>
              </p>
              <p class="DashboardDevices-Subtle">
                {{ formatLocation(device) }}
                <button
                  v-if="resolveDeviceIp(device)"
                  class="DashboardDevices-Ip"
                  type="button"
                  :title="t('dashboard.devices.copyIp', '复制 IP')"
                  @click="copyText(resolveDeviceIp(device))"
                >
                  · <span>{{ formatMaskedIp(device) }}</span>
                  <span class="DashboardDevices-IpFull">{{ resolveDeviceIp(device) }}</span>
                </button>
              </p>
            </div>

            <div class="DashboardDevices-Actions">
              <div class="DashboardDevices-ActionsTop">
                <TxDropdownMenu
                  :model-value="isActionMenuOpen(device)"
                  placement="bottom-end"
                  :min-width="180"
                  @update:model-value="setActionMenuOpen(device, $event)"
                >
                  <template #trigger>
                    <TxButton class="DashboardDevices-ActionButton" size="small" variant="secondary" icon="i-carbon-overflow-menu-horizontal">
                      {{ t('dashboard.devices.actions', '操作') }}
                      <span class="DashboardDevices-ActionChevron i-carbon-chevron-down" aria-hidden="true" />
                    </TxButton>
                  </template>

                  <TxDropdownItem v-if="hasCoordinates(device)" @select="toggleMap(device)">
                    <span class="DashboardDevices-MenuItem">
                      <span class="DashboardDevices-MenuIcon i-carbon-location" aria-hidden="true" />
                      <span>{{ expandedMapDeviceId === device.id ? t('common.collapse', '收起') : t('dashboard.devices.viewLocation', '查看位置') }}</span>
                    </span>
                  </TxDropdownItem>
                  <TxDropdownItem v-if="editingId !== device.id" @select="startRename(device)">
                    <span class="DashboardDevices-MenuItem">
                      <span class="DashboardDevices-MenuIcon i-carbon-edit" aria-hidden="true" />
                      <span>{{ t('dashboard.devices.rename', '重命名') }}</span>
                    </span>
                  </TxDropdownItem>
                  <TxDropdownItem :disabled="actionLoading || Boolean(device.revokedAt)" @select="setTrusted(device, !device.trusted)">
                    <span class="DashboardDevices-MenuItem">
                      <span
                        class="DashboardDevices-MenuIcon"
                        :class="device.trusted ? 'i-carbon-security' : 'i-carbon-checkmark-outline'"
                        aria-hidden="true"
                      />
                      <span>{{ device.trusted ? t('dashboard.devices.untrust', '取消信任') : t('dashboard.devices.trust', '信任') }}</span>
                    </span>
                  </TxDropdownItem>
                  <TxDropdownItem
                    danger
                    :disabled="actionLoading || isCurrent(device) || Boolean(device.revokedAt)"
                    @select="revokeDevice(device)"
                  >
                    <span class="DashboardDevices-MenuItem is-danger">
                      <span class="DashboardDevices-MenuIcon i-carbon-logout" aria-hidden="true" />
                      <span>{{ t('dashboard.devices.revoke', '踢出') }}</span>
                    </span>
                  </TxDropdownItem>
                </TxDropdownMenu>
              </div>

              <div class="DashboardDevices-Footer">
                <span class="DashboardDevices-AppTag">
                  <span class="i-carbon-application" aria-hidden="true" />
                  {{ formatClientType(device.clientType) }}
                </span>
                <button
                  class="DashboardDevices-TextLink"
                  type="button"
                  :title="t('dashboard.devices.copyTime', '复制时间')"
                  @click="copyText(formatDeviceTime(device))"
                >
                  {{ formatDeviceTime(device) }}
                </button>
                <TxPopover
                  v-if="device.userAgent"
                  placement="top-end"
                  :width="320"
                  :max-width="320"
                  :panel-padding="12"
                  panel-background="pure"
                >
                  <template #reference>
                    <button
                      class="DashboardDevices-TextLink"
                      type="button"
                      :aria-label="t('dashboard.devices.userAgent', 'User-Agent')"
                    >
                      User-Agent
                    </button>
                  </template>

                  <div class="DashboardDevices-Popover">
                    <p class="DashboardDevices-PopoverTitle">
                      {{ t('dashboard.devices.userAgent', 'User-Agent') }}
                    </p>
                    <p class="DashboardDevices-PopoverValue">
                      {{ device.userAgent }}
                    </p>
                    <button
                      class="DashboardDevices-PopoverAction"
                      type="button"
                      @click="copyText(device.userAgent)"
                    >
                      <span class="i-carbon-copy" aria-hidden="true" />
                      {{ t('dashboard.devices.copyUserAgent', '复制 User-Agent') }}
                    </button>
                  </div>
                </TxPopover>
              </div>
            </div>
          </div>

          <div v-if="expandedMapDeviceId === device.id && hasCoordinates(device)" class="DashboardDevices-Map">
            <LazyGeoLeafletMap
              :height="220"
              :points="[{
                id: device.id,
                label: device.deviceName || t('dashboard.devices.unnamed', '未命名设备'),
                latitude: device.lastLocation?.latitude ?? null,
                longitude: device.lastLocation?.longitude ?? null,
                value: 1,
              }]"
            />
          </div>

          <div v-if="editingId === device.id" class="flex flex-wrap items-center gap-2">
            <TuffInput v-model="renameValue" type="text" :placeholder="t('dashboard.devices.renamePlaceholder', '输入设备名称')" />
            <TxButton size="small" :loading="actionLoading" @click="saveRename(device)">
              {{ t('common.save', '保存') }}
            </TxButton>
            <TxButton size="small" variant="secondary" @click="cancelRename">
              {{ t('common.cancel', '取消') }}
            </TxButton>
          </div>
        </li>
      </ul>

      <div v-else class="DashboardDevices-Empty">
        {{ devices.length ? t('dashboard.devices.noFilteredSessions', '当前筛选下暂无设备') : t('dashboard.devices.noSessions', '暂无设备') }}
      </div>
    </section>
  </div>
</template>

<style scoped>
.DashboardDevices-Card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.DashboardDevices-CardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.DashboardDevices-CardTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 18px;
  font-weight: 700;
}

.DashboardDevices-FilterButton {
  --tx-button-gap: 6px;
  flex: 0 0 auto;
}

.DashboardDevices-FilterSummary {
  max-width: 112px;
  overflow: hidden;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.DashboardDevices-FilterPanel {
  display: flex;
  min-width: 200px;
  flex-direction: column;
  gap: 6px;
}

.DashboardDevices-FilterTitle {
  margin: 0 0 4px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 700;
}

.DashboardDevices-FilterOption {
  appearance: none;
  display: grid;
  grid-template-columns: 18px 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--tx-text-color-regular);
  cursor: pointer;
  font: inherit;
  padding: 8px;
  text-align: left;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.DashboardDevices-FilterOption:hover,
.DashboardDevices-FilterOption:focus-visible {
  border-color: var(--tx-border-color-lighter);
  background: var(--tx-fill-color-light);
  outline: none;
}

.DashboardDevices-FilterOption.is-selected {
  border-color: color-mix(in srgb, var(--tx-color-primary) 24%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary) 8%, transparent);
  color: var(--tx-text-color-primary);
}

.DashboardDevices-FilterIcon {
  display: inline-flex;
  color: var(--tx-text-color-secondary);
  font-size: 15px;
}

.DashboardDevices-FilterLabel {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.DashboardDevices-FilterCount {
  color: var(--tx-text-color-placeholder);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.DashboardDevices-List {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.DashboardDevices-Item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  background: var(--tx-fill-color-lighter);
  padding: 16px;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.DashboardDevices-Item::after {
  position: absolute;
  inset: -1px -1px -1px auto;
  width: 38%;
  background: radial-gradient(circle at 100% 50%, rgba(34, 197, 94, 0.18), transparent 68%);
  content: "";
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.DashboardDevices-Item.is-trusted {
  border-color: color-mix(in srgb, var(--tx-color-success) 34%, var(--tx-border-color-lighter));
  box-shadow: inset -18px 0 36px rgba(34, 197, 94, 0.06);
}

.DashboardDevices-Item.is-trusted::after {
  opacity: 1;
}

.DashboardDevices-Item.is-revoked {
  border-color: color-mix(in srgb, var(--tx-color-danger) 18%, var(--tx-border-color-lighter));
}

.DashboardDevices-Item.is-revoked::after {
  background: radial-gradient(circle at 100% 50%, rgba(239, 68, 68, 0.08), transparent 72%);
  opacity: 1;
}

.DashboardDevices-CurrentRibbon {
  position: absolute;
  z-index: 2;
  top: 14px;
  left: 6px;
  display: inline-flex;
  width: 92px;
  height: 22px;
  align-items: center;
  justify-content: center;
  transform: rotate(-34deg);
  background: color-mix(in srgb, var(--tx-color-primary) 16%, var(--tx-fill-color-blank));
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 18%, transparent);
  border-radius: 999px;
  box-shadow: 0 6px 18px rgba(64, 158, 255, 0.12);
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 700;
  pointer-events: none;
}

.DashboardDevices-ItemMain {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) minmax(260px, 32%);
  align-items: stretch;
  gap: 18px;
  min-height: 132px;
}

.DashboardDevices-Brand {
  display: flex;
  width: 112px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.DashboardDevices-BrandIcon {
  position: relative;
  display: flex;
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  border: 1px solid var(--tx-border-color-lighter);
  background: color-mix(in srgb, var(--tx-fill-color-blank) 74%, transparent);
  color: var(--tx-text-color-secondary);
  font-size: 30px;
}

.DashboardDevices-BrandTrustMark {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--tx-fill-color-lighter);
  border-radius: 999px;
  background: var(--tx-color-success);
  box-shadow: 0 0 18px rgba(34, 197, 94, 0.55);
  color: #fff;
  font-size: 12px;
}

.DashboardDevices-Platform {
  max-width: 100%;
  overflow: hidden;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.DashboardDevices-Content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
}

.DashboardDevices-Title {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 15px;
  font-weight: 600;
}

.DashboardDevices-TitleName {
  min-width: 0;
  max-width: 100%;
}

.DashboardDevices-Badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  border: 1px solid var(--tx-border-color-lighter);
  padding: 2px 8px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
}

.DashboardDevices-Badge.is-trusted {
  border-color: color-mix(in srgb, var(--tx-color-success) 42%, transparent);
  background: color-mix(in srgb, var(--tx-color-success) 12%, transparent);
  color: var(--tx-color-success);
}

.DashboardDevices-Badge.is-revoked {
  border-color: color-mix(in srgb, var(--tx-color-danger) 22%, transparent);
  background: color-mix(in srgb, var(--tx-color-danger) 7%, transparent);
  color: color-mix(in srgb, var(--tx-color-danger) 72%, var(--tx-text-color-secondary));
}

.DashboardDevices-Subtle {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.55;
}

.DashboardDevices-Subtle {
  color: var(--tx-text-color-secondary);
}

.DashboardDevices-Actions {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0 18px;
}

.DashboardDevices-ActionsTop {
  display: flex;
  justify-content: flex-end;
}

.DashboardDevices-ActionButton {
  --tx-button-gap: 6px;
}

.DashboardDevices-ActionChevron {
  display: inline-flex;
  margin-left: 2px;
  color: currentColor;
  font-size: 12px;
}

.DashboardDevices-MenuItem {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.DashboardDevices-MenuIcon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary);
  font-size: 16px;
}

.DashboardDevices-MenuItem.is-danger .DashboardDevices-MenuIcon {
  color: var(--tx-color-danger);
}

.DashboardDevices-Footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  column-gap: 12px;
  row-gap: 8px;
  max-width: 100%;
  margin-top: 0;
}

.DashboardDevices-Ip,
.DashboardDevices-TextLink,
.DashboardDevices-PopoverAction {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
}

.DashboardDevices-Ip {
  position: relative;
}

.DashboardDevices-IpFull {
  position: absolute;
  z-index: 2;
  left: 16px;
  top: 100%;
  display: none;
  margin-top: 6px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 8px;
  background: var(--tx-fill-color-blank);
  box-shadow: var(--tx-box-shadow-light);
  color: var(--tx-text-color-primary);
  font-size: 12px;
  line-height: 1.4;
  padding: 6px 8px;
  white-space: nowrap;
}

.DashboardDevices-Ip:hover .DashboardDevices-IpFull,
.DashboardDevices-Ip:focus-visible .DashboardDevices-IpFull {
  display: block;
}

.DashboardDevices-TextLink {
  font-size: 12px;
  line-height: 1.4;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.DashboardDevices-AppTag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color-blank) 66%, transparent);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
  padding: 3px 8px;
}

.DashboardDevices-Popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.DashboardDevices-PopoverTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 12px;
  font-weight: 700;
}

.DashboardDevices-PopoverValue {
  margin: 0;
  max-height: 120px;
  overflow: auto;
  color: var(--tx-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.DashboardDevices-PopoverAction {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 5px;
  color: var(--tx-color-primary);
  font-size: 12px;
}

.DashboardDevices-Map {
  position: relative;
  z-index: 1;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  padding: 8px;
}

.DashboardDevices-Description {
  margin-top: 8px;
  color: var(--tx-text-color-secondary);
  font-size: 14px;
}

.DashboardDevices-Empty {
  margin-top: 16px;
  padding: 32px 0;
  text-align: center;
  color: var(--tx-text-color-placeholder);
  font-size: 14px;
}

@media (max-width: 768px) {
  .DashboardDevices-CardHeader {
    align-items: flex-start;
    flex-direction: column;
  }

  .DashboardDevices-FilterButton {
    align-self: flex-end;
  }

  .DashboardDevices-ItemMain {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 12px;
    min-height: 108px;
  }

  .DashboardDevices-Brand {
    width: 76px;
  }

  .DashboardDevices-BrandIcon {
    width: 50px;
    height: 50px;
    border-radius: 14px;
    font-size: 26px;
  }

  .DashboardDevices-Actions {
    grid-column: 2;
    align-items: flex-start;
    padding: 8px 0 0;
  }

  .DashboardDevices-Footer {
    justify-content: flex-start;
  }
}
</style>
