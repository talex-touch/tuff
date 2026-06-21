<script setup lang="ts">
import { computed, ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPopover } from '@talex-touch/tuffex/popover'
import GeoLeafletMap from '~/components/dashboard/GeoLeafletMap.client.vue'
import { useToast } from '~/composables/useToast'
import { requestJson, useTypedFetch } from '~/utils/request'

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

const { data, pending, refresh } = useTypedFetch<DeviceItem[]>('/api/devices')
const actionLoading = ref(false)
const editingId = ref<string | null>(null)
const renameValue = ref('')

const devices = computed(() => data.value ?? [])
const expandedMapDeviceId = ref<string | null>(null)
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

      <ul v-else-if="devices.length" class="DashboardDevices-List">
        <li
          v-for="device in devices"
          :key="device.id"
          class="DashboardDevices-Item"
          :class="{ 'is-current': isCurrent(device), 'is-trusted': device.trusted && !device.revokedAt }"
        >
          <div class="DashboardDevices-ItemMain">
            <div class="DashboardDevices-Brand">
              <div class="DashboardDevices-BrandIcon">
                <span :class="getDeviceBrandIcon(device)" aria-hidden="true" />
                <span
                  v-if="device.trusted && !device.revokedAt"
                  class="DashboardDevices-BrandTrustMark i-carbon-checkmark-filled"
                  aria-hidden="true"
                />
              </div>
              <span class="DashboardDevices-Platform">{{ formatDevicePlatform(device) }}</span>
            </div>

            <div class="DashboardDevices-Content">
              <p class="DashboardDevices-Title">
                <span class="DashboardDevices-TitleName truncate">{{ device.deviceName || t('dashboard.devices.unnamed', '未命名设备') }}</span>
                <span v-if="isCurrent(device)" class="DashboardDevices-Badge is-current">
                  {{ t('dashboard.devices.currentDevice', '当前设备') }}
                </span>
                <span v-if="device.revokedAt" class="DashboardDevices-Badge is-revoked">
                  {{ t('dashboard.devices.revoked', '已撤销') }}
                </span>
                <span v-else-if="device.trusted" class="DashboardDevices-Badge is-trusted">
                  <span class="i-carbon-checkmark-filled" aria-hidden="true" />
                  {{ t('dashboard.devices.trusted', '可信设备') }}
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
                <TxDropdownMenu placement="bottom-end" :min-width="180">
                  <template #trigger>
                    <TxButton class="DashboardDevices-ActionButton" size="small" variant="secondary" icon="i-carbon-overflow-menu-horizontal">
                      {{ t('dashboard.devices.actions', '操作') }}
                      <span class="DashboardDevices-ActionChevron i-carbon-chevron-down" aria-hidden="true" />
                    </TxButton>
                  </template>

                  <TxDropdownItem v-if="hasCoordinates(device)" @select="toggleMap(device)">
                    {{ expandedMapDeviceId === device.id ? t('common.collapse', '收起') : t('dashboard.devices.viewLocation', '查看位置') }}
                  </TxDropdownItem>
                  <TxDropdownItem v-if="editingId !== device.id" @select="startRename(device)">
                    {{ t('dashboard.devices.rename', '重命名') }}
                  </TxDropdownItem>
                  <TxDropdownItem :disabled="actionLoading || Boolean(device.revokedAt)" @select="setTrusted(device, !device.trusted)">
                    {{ device.trusted ? t('dashboard.devices.untrust', '取消信任') : t('dashboard.devices.trust', '信任') }}
                  </TxDropdownItem>
                  <TxDropdownItem
                    danger
                    :disabled="actionLoading || isCurrent(device) || Boolean(device.revokedAt)"
                    @select="revokeDevice(device)"
                  >
                    {{ t('dashboard.devices.revoke', '踢出') }}
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
            <GeoLeafletMap
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
        {{ t('dashboard.devices.noSessions', '暂无设备') }}
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
