<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useLocalePreference } from '~/composables/useLocalePreference'
import { useSubscriptionData } from '~/composables/useDashboardData'
import { useTheme } from '~/composables/useTheme'

const { data: session, signOut } = useAuth()
const { t, locale, setLocale } = useI18n()
const route = useRoute()
const router = useRouter()
const { persistPreferredLocale } = useLocalePreference()
const { color, toggleDark } = useTheme()

const { plan } = useSubscriptionData()
const { data: creditsSummary } = useFetch<any>('/api/credits/summary')

const userMenuOpen = ref(false)
const languageMenuOpen = ref(false)
const themeToggleEvent = ref<MouseEvent | null>(null)
const themeToggleAt = ref(0)
let userMenuTimer: ReturnType<typeof setTimeout> | null = null
let languageMenuTimer: ReturnType<typeof setTimeout> | null = null

const userLabel = computed(() => session.value?.user?.name || session.value?.user?.email || '')
const userEmail = computed(() => {
  const email = session.value?.user?.email || ''
  if (!email || email === userLabel.value)
    return ''
  return email
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

const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const fullPath = computed(() => route.fullPath || '/')
const authRedirectTarget = computed(() => {
  const target = fullPath.value
  if (target.startsWith('/sign-in') || target.startsWith('/sign-up'))
    return '/dashboard'
  return target
})
const normalizedPath = computed(() => {
  const rawPath = route.path || '/'
  const trimmed = rawPath.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return trimmed || '/'
})
const isHome = computed(() => normalizedPath.value === '/')
const afterSignOutUrl = computed(() => {
  const params = new URLSearchParams({
    lang: langTag.value,
    redirect_url: authRedirectTarget.value,
  })
  return `/sign-in?${params.toString()}`
})

async function handleLocaleSelect(nextLocale: 'en' | 'zh') {
  const rawPath = route.path || '/'
  const normalizedPath = rawPath.replace(/^\/(en|zh)(?=\/|$)/i, '') || '/'
  const nextLang = nextLocale === 'zh' ? 'zh-CN' : 'en-US'

  await setLocale(nextLocale)
  persistPreferredLocale(nextLocale)
  await router.replace({
    path: normalizedPath,
    query: { ...route.query, lang: nextLang },
    hash: route.hash,
  })
  userMenuOpen.value = false
  languageMenuOpen.value = false
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

function setUserMenuHover(active: boolean) {
  if (userMenuTimer) {
    clearTimeout(userMenuTimer)
    userMenuTimer = null
  }
  if (active) {
    userMenuOpen.value = true
    return
  }
  userMenuTimer = setTimeout(() => {
    userMenuOpen.value = false
    languageMenuOpen.value = false
  }, 160)
}

function setLanguageHover(active: boolean) {
  if (languageMenuTimer) {
    clearTimeout(languageMenuTimer)
    languageMenuTimer = null
  }
  if (active) {
    languageMenuOpen.value = true
    return
  }
  languageMenuTimer = setTimeout(() => {
    languageMenuOpen.value = false
  }, 120)
}

function handleLanguagePanelHover(active: boolean) {
  setUserMenuHover(active)
  setLanguageHover(active)
}

async function handleAvatarClick() {
  userMenuOpen.value = false
  languageMenuOpen.value = false
  await navigateTo('/dashboard')
}

async function handleMenuNavigate(path: string) {
  userMenuOpen.value = false
  languageMenuOpen.value = false
  await navigateTo(path)
}

async function handleSignOut() {
  userMenuOpen.value = false
  languageMenuOpen.value = false
  try {
    await signOut({ callbackUrl: afterSignOutUrl.value })
  }
  catch (error) {
    console.error('[Header] Failed to sign out:', error)
  }
}

onBeforeUnmount(() => {
  if (userMenuTimer) {
    clearTimeout(userMenuTimer)
    userMenuTimer = null
  }
  if (languageMenuTimer) {
    clearTimeout(languageMenuTimer)
    languageMenuTimer = null
  }
})
</script>

<template>
  <div class="header-user-wrapper header-user-vars" @mouseenter="setUserMenuHover(true)" @mouseleave="setUserMenuHover(false)">
    <TxDropdownMenu
      :model-value="userMenuOpen"
      placement="bottom-end"
      :offset="10"
      :min-width="280"
      :panel-padding="0"
      :close-on-select="false"
      panel-variant="plain"
      panel-background="glass"
      panel-shadow="medium"
    >
      <template #trigger>
        <TxButton variant="bare" native-type="button" class="header-user-trigger" aria-label="Account" @click="handleAvatarClick">
          <TxAvatar
            :src="userAvatar || undefined"
            :name="userLabel || 'U'"
            size="small"
            class="header-user-trigger-avatar"
          />
        </TxButton>
      </template>

      <div
        class="header-user-panel header-user-vars fake-background isolate"
        @mouseenter="setUserMenuHover(true)"
        @mouseleave="setUserMenuHover(false)"
      >
        <div class="header-user-profile">
          <TxAvatar
            :src="userAvatar || undefined"
            :name="userLabel || 'U'"
            size="28"
            class="header-user-profile-avatar"
          />
          <div class="header-user-profile-meta">
            <div class="header-user-name">
              {{ userLabel || t('nav.account', 'Account') }}
            </div>
            <div v-if="userEmail" class="header-user-email">
              {{ userEmail }}
            </div>
          </div>
        </div>

        <div class="header-user-stats">
          <div class="header-user-stat">
            <div class="header-user-stat-label">
              {{ t('dashboard.credits.title', 'Credits') }}
            </div>
            <div class="header-user-stat-value">
              {{ creditsLabel }}
            </div>
          </div>
          <div class="header-user-stat header-user-stat--right">
            <div class="header-user-stat-label">
              {{ t('dashboard.plan', 'Plan') }}
            </div>
            <div class="header-user-stat-value">
              {{ planLabel }}
            </div>
          </div>
        </div>

        <div class="header-user-submenu" @mouseenter="setLanguageHover(true)" @mouseleave="setLanguageHover(false)">
          <TxPopover
            v-model="languageMenuOpen"
            placement="right"
            :offset="6"
            :min-width="160"
            :reference-full-width="true"
            :panel-padding="0"
            :panel-radius="14"
            panel-variant="plain"
            panel-background="glass"
            panel-shadow="soft"
            :close-on-click-outside="false"
          >
            <template #reference>
              <TxDropdownItem class="header-user-submenu-trigger">
                <span class="header-user-item">
                  <span class="i-carbon-language header-user-item-icon" />
                  <span>{{ t('auth.menu.language', 'Language') }}</span>
                </span>
                <template #right>
                  <span class="header-user-right">
                    <span class="header-user-meta">{{ localeLabel }}</span>
                    <span class="i-carbon-chevron-right header-user-submenu-icon" />
                  </span>
                </template>
              </TxDropdownItem>
            </template>
            <div
              class="header-user-submenu-panel header-user-vars fake-background isolate"
              @mouseenter="handleLanguagePanelHover(true)"
              @mouseleave="handleLanguagePanelHover(false)"
            >
              <TxButton variant="bare" native-type="button" class="header-user-submenu-item" :class="{ 'is-active': locale === 'en' }" @click="handleLocaleSelect('en')">
                English
              </TxButton>
              <TxButton variant="bare" native-type="button" class="header-user-submenu-item" :class="{ 'is-active': locale === 'zh' }" @click="handleLocaleSelect('zh')">
                中文
              </TxButton>
            </div>
          </TxPopover>
        </div>

        <TxDropdownItem class="header-user-theme-item">
          <span class="header-user-item">
            <span class="i-carbon-moon header-user-item-icon" />
            <span>{{ t('auth.menu.theme', 'Theme') }}</span>
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
            <span>{{ t('nav.support', 'Support') }}</span>
          </span>
        </TxDropdownItem>
        <TxDropdownItem danger @select="handleSignOut">
          <span class="header-user-item">
            <span class="i-carbon-logout header-user-item-icon" />
            <span>{{ t('nav.logout', 'Log out') }}</span>
          </span>
        </TxDropdownItem>
      </div>
    </TxDropdownMenu>
  </div>
</template>

<style scoped>
.header-user-vars {
  --header-user-bg: color-mix(in srgb, var(--tx-bg-color-overlay, #0b0b10) 84%, transparent);
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

:global(.tx-popover:has(.header-user-panel)) {
  --tx-index-popper: 2200;
}

:global(.tx-popover:has(.header-user-submenu-panel)) {
  --tx-index-popper: 2300;
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
  min-width: 280px;
  margin: 0;
  background: transparent;
  border: 1px solid var(--header-user-border);
  border-radius: 18px;
  box-shadow: none;
  color: var(--header-user-text);
  overflow: visible;
  --fake-color: var(--header-user-bg);
  --fake-opacity: 0.6;
  --fake-radius: 18px;
}

.header-user-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid var(--header-user-border);
  background: var(--header-user-soft);
}

.header-user-profile-avatar {
  --tx-avatar-size: 40px;
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
  font-size: 15px;
  font-weight: 600;
  color: var(--header-user-text);
}

.header-user-email {
  font-size: 12px;
  color: var(--header-user-muted);
  word-break: break-all;
}

.header-user-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--header-user-border);
}

.header-user-stat {
  padding: 12px;
  border-right: 1px solid var(--header-user-border);
  background: var(--header-user-soft);
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
}

.header-user-submenu {
  position: relative;
  width: 100%;
}

.header-user-submenu-icon {
  font-size: 14px;
  opacity: 0.7;
}

.header-user-submenu-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  min-width: 150px;
  border-radius: 14px;
  background: transparent;
  border: 1px solid var(--header-user-border);
  box-shadow: none;
  --fake-color: var(--header-user-bg);
  --fake-opacity: 0.6;
  --fake-radius: 14px;
}

.header-user-submenu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  color: color-mix(in srgb, var(--header-user-text) 82%, transparent);
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  --tx-button-bare-padding: 0;
  --tx-button-bare-radius: 10px;
  --tx-button-bare-hover: var(--header-user-hover);
  --tx-button-bare-bg: transparent;
  --tx-button-gap: 0.5rem;
}

.header-user-submenu-item :deep(.tx-button__inner) {
  width: 100%;
  justify-content: space-between;
}

.header-user-submenu-item:hover {
  background: var(--header-user-hover);
  border-color: var(--header-user-hover-border);
  color: var(--header-user-text);
  box-shadow: inset 0 0 0 1px var(--header-user-hover-border);
}

.header-user-submenu-item.is-active {
  color: var(--header-user-text);
  border-color: var(--header-user-hover-border);
  background: color-mix(in srgb, var(--header-user-bg) 82%, transparent);
}

.header-user-theme-switch {
  margin-left: 8px;
}

.header-user-panel :deep(.tx-dropdown-item) {
  --tx-card-item-padding: 9px 10px;
  --tx-card-item-radius: 12px;
}

.header-user-panel :deep(.tx-card-item) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.header-user-panel :deep(.tx-card-item__title) {
  color: var(--header-user-text);
  font-weight: 500;
}

.header-user-panel :deep(.tx-card-item--clickable:hover) {
  border-color: var(--header-user-hover-border);
  background: var(--header-user-hover);
  box-shadow: inset 0 0 0 1px var(--header-user-hover-border);
}

.header-user-panel :deep(.tx-card-item:focus-visible) {
  box-shadow: none;
}

.header-user-panel :deep(.tx-dropdown-item.is-danger .tx-card-item__title) {
  color: var(--tx-color-danger, #ff6b6b);
}
</style>
