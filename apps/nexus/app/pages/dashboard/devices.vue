<script setup lang="ts">
import { computed, ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import Input from '~/components/ui/Input.vue'
import GeoLeafletMap from '~/components/dashboard/GeoLeafletMap.client.vue'

defineI18nRoute(false)

const { t, locale } = useI18n()
const { deviceId: currentDeviceId, deviceName: currentDeviceName, setDeviceName } = useDeviceIdentity()

interface DeviceItem {
  id: string
  deviceName: string | null
  platform: string | null
  userAgent: string | null
  lastSeenAt: string | null
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
}

const { data, pending, refresh } = useFetch<DeviceItem[]>('/api/devices')
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

function isCurrent(device: DeviceItem) {
  return device.id === currentDeviceId.value
}

function formatLastActive(value: string | null) {
  if (!value)
    return t('dashboard.devices.unknown', '未知')
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1)
    return t('dashboard.devices.justNow', '刚刚')
  if (minutes < 60)
    return t('dashboard.devices.minutesAgo', { n: minutes })
  if (hours < 24)
    return t('dashboard.devices.hoursAgo', { n: hours })
  return t('dashboard.devices.daysAgo', { n: days })
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
    await $fetch('/api/devices/rename', {
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
    await $fetch('/api/devices/revoke', {
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
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.devices.title', '设备管理') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.devices.description', '查看和管理您登录的设备') }}
      </p>
    </header>

    <section class="apple-card-lg p-6">
      <h2 class="apple-heading-sm">
        {{ t('dashboard.devices.activeSessions', '设备列表') }}
      </h2>

      <div v-if="pending" class="mt-4 space-y-3 py-6">
        <div class="flex items-center justify-center">
          <TxSpinner :size="22" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>

      <ul v-else-if="devices.length" class="mt-5 space-y-3">
        <li
          v-for="device in devices"
          :key="device.id"
          class="flex flex-col gap-3 rounded-2xl border border-black/[0.04] p-4 transition dark:border-white/[0.06]"
          :class="isCurrent(device) ? 'bg-primary/5 dark:bg-primary/10' : 'bg-black/[0.02] dark:bg-white/[0.03]'"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-black dark:text-white">
                {{ device.deviceName || t('dashboard.devices.unnamed', '未命名设备') }}
                <span
                  v-if="isCurrent(device)"
                  class="ml-2 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400"
                >
                  {{ t('dashboard.devices.currentDevice', '当前设备') }}
                </span>
                <span
                  v-if="device.revokedAt"
                  class="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-600 dark:text-red-400"
                >
                  {{ t('dashboard.devices.revoked', '已撤销') }}
                </span>
              </p>
              <p class="mt-0.5 text-xs text-black/50 dark:text-white/50">
                {{ device.platform || 'Web' }} · {{ formatLastActive(device.lastSeenAt) }}
              </p>
              <p class="mt-0.5 text-xs text-black/45 dark:text-white/45">
                {{ formatLocation(device) }}
                <span v-if="device.lastLoginIpMasked"> · {{ device.lastLoginIpMasked }}</span>
              </p>
              <p v-if="device.userAgent" class="mt-0.5 text-xs text-black/40 dark:text-white/40">
                {{ device.userAgent }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <TxButton
                v-if="hasCoordinates(device)"
                size="small"
                variant="secondary"
                @click="toggleMap(device)"
              >
                {{ expandedMapDeviceId === device.id ? t('common.collapse', '收起') : t('dashboard.devices.viewLocation', '查看位置') }}
              </TxButton>
              <TxButton v-if="editingId !== device.id" size="small" variant="secondary" @click="startRename(device)">
                {{ t('dashboard.devices.rename', '重命名') }}
              </TxButton>
              <TxButton size="small" variant="secondary" :disabled="actionLoading || isCurrent(device) || Boolean(device.revokedAt)" @click="revokeDevice(device)">
                {{ t('dashboard.devices.revoke', '踢出') }}
              </TxButton>
            </div>
          </div>

          <div v-if="expandedMapDeviceId === device.id && hasCoordinates(device)" class="rounded-xl border border-black/[0.05] bg-black/[0.03] p-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
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
            <Input v-model="renameValue" type="text" :placeholder="t('dashboard.devices.renamePlaceholder', '输入设备名称')" />
            <TxButton size="small" :loading="actionLoading" @click="saveRename(device)">
              {{ t('common.save', '保存') }}
            </TxButton>
            <TxButton size="small" variant="secondary" @click="cancelRename">
              {{ t('common.cancel', '取消') }}
            </TxButton>
          </div>
        </li>
      </ul>

      <div v-else class="mt-4 py-8 text-center text-sm text-black/40 dark:text-white/40">
        {{ t('dashboard.devices.noSessions', '暂无设备') }}
      </div>
    </section>
  </div>
</template>
