<script setup lang="ts">
import { computed, ref } from 'vue'

defineI18nRoute(false)

const { t } = useI18n()
const { user, isLoaded } = useUser()
const { session } = useSession()

const loading = ref(false)

interface DeviceSession {
  id: string
  deviceType: string
  browser: string
  os: string
  ipAddress: string
  lastActiveAt: Date
  isCurrent: boolean
}

const sessions = computed<DeviceSession[]>(() => {
  if (!isLoaded.value || !user.value)
    return []

  const userSessions = (user.value as any)?.sessions ?? []
  const currentSessionId = session.value?.id

  return userSessions.map((s: any) => ({
    id: s.id,
    deviceType: getDeviceType(s.latestActivity?.deviceType),
    browser: s.latestActivity?.browserName || t('dashboard.devices.unknown', '未知'),
    os: s.latestActivity?.browserVersion || '',
    ipAddress: s.latestActivity?.ipAddress || '',
    lastActiveAt: new Date(s.lastActiveAt),
    isCurrent: s.id === currentSessionId,
  }))
})

function getDeviceType(type?: string): string {
  switch (type) {
    case 'desktop':
      return t('dashboard.devices.types.desktop', '桌面设备')
    case 'mobile':
      return t('dashboard.devices.types.mobile', '移动设备')
    case 'tablet':
      return t('dashboard.devices.types.tablet', '平板设备')
    default:
      return t('dashboard.devices.types.unknown', '未知设备')
  }
}

function getDeviceIcon(type?: string): string {
  switch (type) {
    case 'desktop':
      return 'i-carbon-laptop'
    case 'mobile':
      return 'i-carbon-mobile'
    case 'tablet':
      return 'i-carbon-tablet'
    default:
      return 'i-carbon-devices'
  }
}

function formatLastActive(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
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

async function revokeSession(sessionId: string) {
  if (!user.value)
    return

  loading.value = true
  try {
    const targetSession = (user.value as any)?.sessions?.find((s: any) => s.id === sessionId)
    if (targetSession) {
      await targetSession.revoke()
    }
  }
  catch (error) {
    console.error('Failed to revoke session:', error)
  }
  finally {
    loading.value = false
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
        {{ t('dashboard.devices.activeSessions', '活跃会话') }}
      </h2>

      <div v-if="!isLoaded" class="mt-4 flex items-center justify-center py-8">
        <span class="i-carbon-circle-dash animate-spin text-2xl text-primary" />
      </div>

      <ul v-else-if="sessions.length > 0" class="mt-4 space-y-3">
        <li
          v-for="device in sessions"
          :key="device.id"
          class="flex items-center justify-between border border-primary/10 rounded-2xl p-4 transition dark:border-light/10"
          :class="device.isCurrent ? 'bg-primary/5 dark:bg-primary/10' : 'bg-white/50 dark:bg-dark/40'"
        >
          <div class="flex items-center gap-4">
            <span
              class="text-2xl text-black/70 dark:text-light/70"
              :class="getDeviceIcon(device.deviceType)"
            />
            <div>
              <p class="text-sm text-black font-medium dark:text-light">
                {{ device.browser }}
                <span
                  v-if="device.isCurrent"
                  class="ml-2 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400"
                >
                  {{ t('dashboard.devices.currentDevice', '当前设备') }}
                </span>
              </p>
              <p class="mt-0.5 text-xs text-black/60 dark:text-light/60">
                {{ device.deviceType }} · {{ formatLastActive(device.lastActiveAt) }}
              </p>
            </div>
          </div>

          <button
            v-if="!device.isCurrent"
            :disabled="loading"
            class="border border-red-500/30 rounded-lg px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
            @click="revokeSession(device.id)"
          >
            {{ t('dashboard.devices.revoke', '撤销') }}
          </button>
        </li>
      </ul>

      <div v-else class="mt-4 py-8 text-center text-sm text-black/60 dark:text-light/60">
        {{ t('dashboard.devices.noSessions', '暂无活跃会话') }}
      </div>
    </section>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.devices.securityTips', '安全提示') }}
      </h2>
      <ul class="mt-4 text-sm text-black/70 space-y-3 dark:text-light/80">
        <li class="flex items-start gap-2">
          <span class="i-carbon-security mt-0.5 text-lg text-black dark:text-light" />
          {{ t('dashboard.devices.tip1', '定期检查登录设备，发现异常及时撤销访问权限') }}
        </li>
        <li class="flex items-start gap-2">
          <span class="i-carbon-password mt-0.5 text-lg text-black dark:text-light" />
          {{ t('dashboard.devices.tip2', '如果发现不认识的设备，建议立即修改密码') }}
        </li>
        <li class="flex items-start gap-2">
          <span class="i-carbon-locked mt-0.5 text-lg text-black dark:text-light" />
          {{ t('dashboard.devices.tip3', '启用两步验证可以大幅提升账户安全性') }}
        </li>
      </ul>
    </section>
  </div>
</template>
