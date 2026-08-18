<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'
import { useSubscriptionData } from '~/composables/useDashboardData'
import { sanitizeRedirect } from '~/composables/useOauthContext'
import { useTheme } from '~/composables/useTheme'
import { formatCompactAccountLabel, formatCompactEmail } from '~/utils/account-display'
import { useTypedFetch } from '~/utils/request'

const { data: session, status, signOut } = useNexusAuth()
const { t, te, locale } = useI18n()
const route = useRoute()
const { setManualLocale } = useLocaleOrchestrator()
const { color, toggleDark } = useTheme()

const isAuthenticated = computed(() => status.value === 'authenticated')
const { plan, refresh: refreshSubscription } = useSubscriptionData({ immediate: false })
const { data: creditsSummary, refresh: refreshCreditsSummary } = useTypedFetch<any>('/api/credits/summary', {
  immediate: false,
  server: false,
  default: () => null,
})
const userMenuPanelCard = {
  glassOverlayOpacity: 0.16,
  refractionStrength: 74,
  refractionProfile: 'cinematic',
  refractionTone: 'balanced',
} as const

const userMenuOpen = ref(false)
const themeToggleEvent = ref<MouseEvent | null>(null)
const themeToggleAt = ref(0)
const accountStatsLoading = ref(false)
const accountStatsLoaded = ref(false)
const menuMotionDuration = 207

const userLabel = computed(() => {
  const rawLabel = session.value?.user?.name || session.value?.user?.email || ''
  return rawLabel ? formatCompactAccountLabel(rawLabel) : ''
})
const userEmail = computed(() => {
  const email = session.value?.user?.email || ''
  if (!email)
    return ''
  return email
})
const userEmailDisplay = computed(() => {
  const email = userEmail.value.trim()
  if (!email)
    return tSafe('auth.menu.emailPlaceholder', 'jefjheljkls...@gmail.com')

  return formatCompactEmail(email)
})
const userAvatar = computed(() => session.value?.user?.image || '')

const localeLabel = computed(() => (locale.value === 'zh' ? '中文' : 'English'))
const themeLabel = computed(() =>
  color.value === 'dark'
    ? t('auth.theme.dark', 'Dark')
    : t('auth.theme.light', 'Light'),
)
const isDark = computed(() => color.value === 'dark')
const planLabel = computed(() => {
  const raw = plan.value || 'FREE'
  const normalized = raw.toLowerCase()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
})

const userBalance = computed(() => creditsSummary.value?.user ?? null)
const creditsRemaining = computed(() => {
  const quota = userBalance.value?.quota ?? 0
  const used = userBalance.value?.used ?? 0
  return Math.max(0, quota - used)
})
const creditsLabel = computed(() => new Intl.NumberFormat().format(creditsRemaining.value))

const fullPath = computed(() => route.fullPath || '/')
const authRedirectTarget = computed(() => {
  return sanitizeRedirect(fullPath.value, '/dashboard')
})
const normalizedPath = computed(() => {
  const rawPath = route.path || '/'
  const trimmed = rawPath.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return trimmed || '/'
})
const isHome = computed(() => normalizedPath.value === '/')
const afterSignOutUrl = computed(() => {
  const params = new URLSearchParams({
    redirect_url: authRedirectTarget.value,
  })
  return `/sign-in?${params.toString()}`
})

function tSafe(key: string, fallback: string) {
  return te(key) ? t(key) : fallback
}

async function handleLocaleSelect(nextLocale: 'en' | 'zh') {
  await setManualLocale(nextLocale)
  userMenuOpen.value = false
}

function handleThemeSwitch(value: boolean) {
  if (isHome.value)
    return
  const cached = themeToggleEvent.value
  const event = cached && Date.now() - themeToggleAt.value < 600 ? cached : undefined
  themeToggleEvent.value = null
  toggleDark(value ? 'dark' : 'light', event)
}

function captureThemeEvent(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.tuff-switch'))
    return
  themeToggleEvent.value = event
  themeToggleAt.value = Date.now()
}

function shouldNavigateFromAvatar() {
  if (!hasWindow() || !('matchMedia' in window))
    return false
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function handleAvatarClick() {
  void loadAccountStats()
  if (!shouldNavigateFromAvatar())
    return
  handleMenuNavigate('/dashboard')
}

async function loadAccountStats() {
  if (!isAuthenticated.value || accountStatsLoading.value || accountStatsLoaded.value)
    return

  accountStatsLoading.value = true
  try {
    await Promise.allSettled([
      refreshSubscription(),
      refreshCreditsSummary(),
    ])
    accountStatsLoaded.value = true
  }
  finally {
    accountStatsLoading.value = false
  }
}

async function handleMenuNavigate(path: string) {
  userMenuOpen.value = false
  await navigateTo(path)
}

async function handleSignOut() {
  userMenuOpen.value = false
  try {
    await signOut({ callbackUrl: afterSignOutUrl.value })
  }
  catch (error) {
    console.error('[Header] Failed to sign out:', error)
  }
}

watch(
  userMenuOpen,
  (isOpen) => {
    if (!isOpen)
      return
    void loadAccountStats()
  },
)
</script>

<template>
  <div class="header-user-wrapper header-user-vars">
    <TxDropdownMenu
      v-model="userMenuOpen"
      trigger="hover"
      placement="bottom-end"
      :offset="10"
      :animation="{ type: 'transfer', duration: menuMotionDuration }"
      :min-width="328"
      :panel-padding="0"
      :close-on-select="false"
      :panel-card="userMenuPanelCard"
      :unlimited-height="true"
      panel-variant="plain"
      panel-background="refraction"
      panel-shadow="medium"
    >
      <template #trigger>
        <TxButton
          variant="bare"
          native-type="button"
          class="header-user-trigger"
          aria-label="Account"
          @click="handleAvatarClick"
        >
          <TxAvatar
            :src="userAvatar || undefined"
            :name="userLabel || 'U'"
            size="small"
            class="header-user-trigger-avatar"
          />
        </TxButton>
      </template>

      <div class="header-user-panel header-user-vars isolate">
        <div class="header-user-profile fake-background">
          <TxAvatar
            :src="userAvatar || undefined"
            :name="userLabel || 'U'"
            size="28"
            class="header-user-profile-avatar"
          />
          <div class="header-user-profile-meta">
            <div class="header-user-name">
              {{ userLabel || tSafe('nav.account', 'Account') }}
            </div>
            <div class="header-user-email" :title="userEmailDisplay">
              {{ userEmailDisplay }}
            </div>
          </div>
        </div>

        <div class="header-user-stats fake-background">
          <div class="header-user-stat">
            <div class="header-user-stat-label">
              {{ tSafe('dashboard.credits.title', 'Credits') }}
            </div>
            <div class="header-user-stat-value">
              {{ creditsLabel }}
            </div>
          </div>
          <div class="header-user-stat header-user-stat--right">
            <div class="header-user-stat-label">
              {{ tSafe('dashboard.plan', 'Plan') }}
            </div>
            <div class="header-user-stat-value">
              {{ planLabel }}
            </div>
          </div>
        </div>

        <TxDropdownItem @select="handleMenuNavigate('/dashboard')">
          <span class="header-user-item">
            <span class="i-carbon-dashboard header-user-item-icon" />
            <span>{{ tSafe('nav.dashboard', 'Dashboard') }}</span>
          </span>
        </TxDropdownItem>

        <TxDropdownSubmenu
          :width="132"
          :min-width="132"
          :offset="6"
          :animation="{ type: 'transfer', duration: menuMotionDuration }"
          :panel-radius="14"
          :panel-padding="0"
          panel-variant="plain"
          panel-background="refraction"
          panel-shadow="soft"
        >
          <span class="header-user-item">
            <span class="i-carbon-language header-user-item-icon" />
            <span>{{ tSafe('auth.menu.language', 'Language') }}</span>
          </span>
          <template #right>
            <span class="header-user-meta">{{ localeLabel }}</span>
          </template>
          <template #menu>
            <div class="header-user-submenu-panel header-user-vars">
              <TxDropdownItem
                class="header-user-submenu-item"
                :class="{ 'is-active': locale === 'en' }"
                @select="handleLocaleSelect('en')"
              >
                English
              </TxDropdownItem>
              <TxDropdownItem
                class="header-user-submenu-item"
                :class="{ 'is-active': locale === 'zh' }"
                @select="handleLocaleSelect('zh')"
              >
                中文
              </TxDropdownItem>
            </div>
          </template>
        </TxDropdownSubmenu>

        <TxDropdownItem class="header-user-theme-item">
          <span class="header-user-item">
            <span class="i-carbon-moon header-user-item-icon" />
            <span>{{ tSafe('auth.menu.theme', 'Theme') }}</span>
          </span>
          <template #right>
            <span class="header-user-right" @pointerdown.capture="captureThemeEvent">
              <span class="header-user-meta">{{ themeLabel }}</span>
              <TuffSwitch
                class="header-user-theme-switch"
                size="small"
                :disabled="isHome"
                :model-value="isDark"
                @change="handleThemeSwitch"
              />
            </span>
          </template>
        </TxDropdownItem>

        <div class="header-user-divider" />

        <TxDropdownItem @select="handleMenuNavigate('/docs')">
          <span class="header-user-item">
            <span class="i-carbon-help header-user-item-icon" />
            <span>{{ tSafe('nav.support', 'Support') }}</span>
          </span>
        </TxDropdownItem>
        <TxDropdownItem danger @select="handleSignOut">
          <span class="header-user-item">
            <span class="i-carbon-logout header-user-item-icon" />
            <span>{{ tSafe('nav.logout', 'Log out') }}</span>
          </span>
        </TxDropdownItem>
      </div>
    </TxDropdownMenu>
  </div>
</template>

<style scoped>
.header-user-vars {
  --header-user-bg: color-mix(in srgb, var(--tx-bg-color-overlay, #0b0b10) 90%, transparent);
  --tx-card-fake-background: color-mix(
    in srgb,
    var(--tx-bg-color-overlay, #0b0b10) 78%,
    color-mix(in srgb, var(--tx-text-color-primary, #ffffff) 22%, transparent)
  );
  --header-user-border: color-mix(in srgb, var(--tx-border-color-light, rgba(255, 255, 255, 0.2)) 65%, transparent);
  --header-user-border-strong: color-mix(in srgb, var(--tx-border-color-light, rgba(255, 255, 255, 0.32)) 80%, transparent);
  --header-user-text: color-mix(in srgb, var(--tx-text-color-primary, #ffffff) 92%, transparent);
  --header-user-muted: color-mix(in srgb, var(--tx-text-color-secondary, #ffffff) 70%, transparent);
  --header-user-soft: color-mix(in srgb, var(--header-user-bg) 82%, transparent);
  --header-user-hover: color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, var(--header-user-bg));
  --header-user-hover-border: color-mix(
    in srgb,
    var(--tx-color-primary, #409eff) 36%,
    var(--header-user-border-strong)
  );
  --header-user-divider: color-mix(in srgb, var(--header-user-border-strong) 90%, transparent);
}

/* No API exists to drop just the anchor's outline ring; both panels hide it
   deliberately, so this internal reach stays. */
:global(.tx-base-anchor:has(.header-user-panel) .tx-base-anchor__outline),
:global(.tx-base-anchor:has(.header-user-submenu-panel) .tx-base-anchor__outline) {
  display: none !important;
}

:global(.tx-base-anchor:has(.header-user-panel) .tx-base-anchor__card) {
  overflow-x: visible !important;
}

.header-user-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  align-self: center;
  min-height: 28px;
}

.header-user-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 0;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--header-user-text);
  --tx-button-bare-padding: 0;
  --tx-button-bare-radius: 999px;
  --tx-button-bare-hover: transparent;
  --tx-button-bare-bg: transparent;
  --tx-button-gap: 0;
}

.header-user-trigger.tx-button.variant-bare {
  justify-content: center;
  width: 28px;
  height: 28px;
}

.header-user-trigger-avatar {
  --tx-avatar-size: 22px;
  --tx-avatar-border-radius: 999px;
  --tx-avatar-background: color-mix(in srgb, var(--header-user-text) 16%, transparent);
  --tx-avatar-color: var(--header-user-text);
}

.header-user-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  box-sizing: border-box;
  width: min(328px, calc(100vw - 32px));
  min-width: min(328px, calc(100vw - 32px));
  margin: 0;
  background: transparent;
  border: 1px solid var(--header-user-border);
  border-radius: 18px;
  box-shadow: none;
  color: var(--header-user-text);
  overflow: hidden;
}

.header-user-profile {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px 8px 10px;
  border-radius: 12px;

  --fake-opacity: 0;
}

.header-user-profile-avatar {
  flex: 0 0 auto;
  --tx-avatar-size: 36px;
  --tx-avatar-border-radius: 999px;
  --tx-avatar-background: color-mix(in srgb, var(--header-user-text) 18%, transparent);
  --tx-avatar-color: var(--header-user-text);
}

.header-user-profile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.header-user-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  color: var(--header-user-text);
  line-height: 1.25;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-user-email {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12.5px;
  color: var(--header-user-muted);
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1.35;
}

.header-user-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--header-user-border);

  --fake-opacity: 0.25;
}

.header-user-stat {
  padding: 12px;
  border-right: 1px solid var(--header-user-border);
}

.header-user-stat--right {
  border-right: none;
}

.header-user-stat-label {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--header-user-muted);
}

.header-user-stat-value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--header-user-text);
}

.header-user-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--header-user-divider), transparent);
  margin: 6px 4px;
  opacity: 0.95;
}

.header-user-item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.header-user-item-icon {
  font-size: 16px;
  opacity: 0.75;
}

.header-user-meta {
  font-size: 12px;
  color: var(--header-user-muted);
}

.header-user-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-width: 0;
}

.header-user-submenu-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  box-sizing: border-box;
  width: 100%;
  border-radius: 14px;
  background: transparent;
  border: 1px solid var(--header-user-border);
  box-shadow: none;
  color: var(--header-user-text);
}

.header-user-submenu-item {
  --tx-card-item-padding: 7px 9px;
  --tx-card-item-radius: 10px;
}

.header-user-submenu-item :deep(.tx-card-item__title) {
  font-size: 13px;
  font-weight: 500;
  color: color-mix(in srgb, var(--header-user-text) 82%, transparent);
}

.header-user-submenu-item.is-active :deep(.tx-card-item) {
  border-color: var(--header-user-hover-border);
  background: color-mix(in srgb, var(--header-user-bg) 82%, transparent);
}

.header-user-submenu-item.is-active :deep(.tx-card-item__title) {
  color: var(--header-user-text);
}

.header-user-theme-switch {
  flex: 0 0 auto;
  margin-left: 8px;
}

.header-user-panel :deep(.tx-dropdown-item) {
  --tx-card-item-padding: 8px 10px;
  --tx-card-item-radius: 12px;
}

.header-user-panel :deep(.tx-card-item),
.header-user-submenu-panel :deep(.tx-card-item) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.header-user-panel :deep(.tx-card-item__title) {
  color: var(--header-user-text);
  font-weight: 500;
}

.header-user-panel :deep(.tx-card-item--clickable:hover),
.header-user-submenu-panel :deep(.tx-card-item--clickable:hover) {
  border-color: var(--header-user-hover-border);
  background: var(--header-user-hover);
  box-shadow: inset 0 0 0 1px var(--header-user-hover-border);
}

.header-user-panel :deep(.tx-card-item:focus-visible),
.header-user-submenu-panel :deep(.tx-card-item:focus-visible) {
  box-shadow: none;
}

.header-user-panel :deep(.tx-dropdown-item.is-danger .tx-card-item__title) {
  color: var(--tx-color-danger, #ff6b6b);
}
</style>
