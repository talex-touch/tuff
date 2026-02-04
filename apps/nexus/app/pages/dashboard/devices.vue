<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'

defineI18nRoute(false)

const { t } = useI18n()
const { deviceId: currentDeviceId, deviceName: currentDeviceName, setDeviceName } = useDeviceIdentity()

interface DeviceItem {
  id: string
  deviceName: string | null
  platform: string | null
  userAgent: string | null
  lastSeenAt: string | null
  createdAt: string
  revokedAt: string | null
}

const { data, pending, refresh } = useFetch<DeviceItem[]>('/api/devices')
const actionLoading = ref(false)
const editingId = ref<string | null>(null)
const renameValue = ref('')

const devices = computed(() => data.value ?? [])

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
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl text-black font-semibold tracking-tight dark:text-light">
        {{ t('dashboard.devices.title', '设备管理') }}
      </h1>
      <p class="mt-2 text-sm text-black/70 dark:text-light/80">
        {{ t('dashboard.devices.description', '查看和管理您登录的设备') }}
      </p>
    </header>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.devices.activeSessions', '设备列表') }}
      </h2>

      <div v-if="pending" class="mt-4 flex items-center justify-center py-8">
        <span class="i-carbon-circle-dash animate-spin text-2xl text-primary" />
      </div>

      <ul v-else-if="devices.length" class="mt-4 space-y-3">
        <li
          v-for="device in devices"
          :key="device.id"
          class="flex flex-col gap-3 border border-primary/10 rounded-2xl p-4 transition dark:border-light/10"
          :class="isCurrent(device) ? 'bg-primary/5 dark:bg-primary/10' : 'bg-white/50 dark:bg-dark/40'"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm text-black font-medium dark:text-light">
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
              <p class="mt-0.5 text-xs text-black/60 dark:text-light/60">
                {{ device.platform || 'Web' }} · {{ formatLastActive(device.lastSeenAt) }}
              </p>
              <p v-if="device.userAgent" class="mt-0.5 text-xs text-black/50 dark:text-light/50">
                {{ device.userAgent }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <Button
                v-if="editingId !== device.id"
                size="small"
                variant="secondary"
                @click="startRename(device)"
              >
                {{ t('dashboard.devices.rename', '重命名') }}
              </Button>
              <Button
                size="small"
                variant="secondary"
                :disabled="actionLoading || isCurrent(device) || Boolean(device.revokedAt)"
                @click="revokeDevice(device)"
              >
                {{ t('dashboard.devices.revoke', '踢出') }}
              </Button>
            </div>
          </div>

          <div v-if="editingId === device.id" class="flex flex-wrap items-center gap-2">
            <Input v-model="renameValue" type="text" :placeholder="t('dashboard.devices.renamePlaceholder', '输入设备名称')" />
            <Button size="small" :loading="actionLoading" @click="saveRename(device)">
              {{ t('common.save', '保存') }}
            </Button>
            <Button size="small" variant="secondary" @click="cancelRename">
              {{ t('common.cancel', '取消') }}
            </Button>
          </div>
        </li>
      </ul>

      <div v-else class="mt-4 py-8 text-center text-sm text-black/60 dark:text-light/60">
        {{ t('dashboard.devices.noSessions', '暂无设备') }}
      </div>
    </section>
  </div>
</template>
