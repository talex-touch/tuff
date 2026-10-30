<script setup lang="ts">
import { TxAvatar } from '@talex-touch/tuffex/avatar'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { formatCompactAccountLabel } from '@talex-touch/utils/account'
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { isBetaFeatureEnabled } from '../../../../shared/beta-features'
import { appSetting } from '~/modules/storage/app-storage'
import { toast } from 'vue-sonner'
import { useUserIdentity } from '~/components/base/composables/useUserIdentity'
import TuffUserInfo from '~/components/base/TuffUserInfo.vue'
import {
  browserProfileStatus,
  useBrowserConnection
} from '~/modules/browser-connection/useBrowserConnection'
import { useAuth } from '~/modules/auth/useAuth'
import { focusWhenShown } from '~/views/base/home/focus-when-shown'
import BrowserConnectionPanel from './BrowserConnectionPanel.vue'

/**
 * The one avatar entry for the Home and Browser headers. Two identities live behind it and are
 * never merged: the Tuff account (profile, settings, sign-in) and the Chrome profiles paired over
 * the local connector. Signing in to Tuff signs in to no website and no Chrome profile.
 *
 * Every floating layer it opens reports through `overlay-change` synchronously, so the Browser page
 * can hide its native guest view before the layer paints over it.
 */
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{ 'overlay-change': [open: boolean] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const transport = useTuffTransport()
const browserSdk = createBrowserSdk(transport)
const { isLoading, authLoadingState, login, logout } = useAuth()
const { isLoggedIn, displayName, displayEmail, avatarUrl } = useUserIdentity()
const connection = useBrowserConnection()
const accountHeadingId = useId()
const chromeHeadingId = useId()
const alive = ref(true)
const enabled = computed(() => props.active && alive.value)
const open = ref(false)
const view = ref<'home' | 'chrome'>('home')
const accountDialogOpen = ref(false)
const actionError = ref('')
const panel = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const accountInfo = ref<InstanceType<typeof TuffUserInfo> | null>(null)
let focusRun = 0

const accountLabel = computed(() =>
  isLoggedIn.value
    ? formatCompactAccountLabel(displayName.value) ||
      displayEmail.value ||
      t('userProfile.unknownName')
    : t('accountMenu.signedOut')
)
const profiles = computed(() => connection.state.value?.profiles ?? [])
/**
 * The profiles worth listing: one whose Chrome is not running reads 「等待 Chrome」 and offers
 * nothing to pick, so it stays out of the menu until Chrome opens. Pairing, an unsupported
 * platform and an empty connection are the manage view's to explain.
 */
const liveProfiles = computed(() =>
  profiles.value.filter((profile) => profile.status !== 'offline')
)
const chromeLoadFailed = computed(
  () => !connection.state.value && !connection.loading.value && Boolean(connection.loadError.value)
)
const showChromeProfiles = computed(
  () => liveProfiles.value.length > 0 || chromeLoadFailed.value || Boolean(actionError.value)
)
const chromeSummary = computed(() => {
  const active = connection.activeProfile.value
  if (active) return `${active.label} · ${t(browserProfileStatus(active).label)}`
  return profiles.value.length
    ? t('accountMenu.chromeNoneSelected')
    : t('accountMenu.chromeNotConnected')
})

function focusFirst(): void {
  const runId = ++focusRun
  focusWhenShown(
    () => panel.value?.querySelector<HTMLButtonElement>('button:not(:disabled)'),
    () => runId === focusRun && enabled.value && open.value
  )
}

function toggle(): void {
  if (!enabled.value) return
  if (open.value) {
    open.value = false
    return
  }
  view.value = 'home'
  actionError.value = ''
  open.value = true
  focusFirst()
}

function showView(next: 'home' | 'chrome'): void {
  view.value = next
  actionError.value = ''
  focusFirst()
}

function openAccountDetails(): void {
  if (!isLoggedIn.value) return
  // Claimed before the popover closes, so the Browser guest never reappears between the two layers.
  accountDialogOpen.value = true
  open.value = false
  accountInfo.value?.openProfileDialog()
}

async function openAccountSettings(): Promise<void> {
  open.value = false
  try {
    if (isBetaFeatureEnabled(appSetting, 'browserWorkspace')) {
      if (route.path !== '/browser') {
        await router.push('/browser')
      }
      const s = await browserSdk.getState().catch(() => null)
      if (s) {
        const existing = s.tabs.find((tab) => tab.url.startsWith('tuff://setting'))
        if (existing) await browserSdk.activateTab(existing.id)
        else await browserSdk.createTab('tuff://settings')
        return
      }
    }
    await router.push('/setting/overview')
  } catch (failure) {
    toast.error(t('accountMenu.settingsFailed'), {
      description: failure instanceof Error ? failure.message : String(failure)
    })
  }
}

function signIn(): void {
  open.value = false
  void login()
}

async function signOut(): Promise<void> {
  await logout()
}

async function selectProfile(profileId: string): Promise<void> {
  actionError.value = ''
  const failure = await connection.run('select', () => connection.sdk.selectProfile(profileId))
  if (failure) actionError.value = connection.describeError(failure)
}

function panelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    open.value = false
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const buttons = Array.from(
    panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
  )
  if (!buttons.length) return
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  let next = index
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = buttons.length - 1
  else if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
  else next = (index - 1 + buttons.length) % buttons.length
  event.preventDefault()
  buttons[next]?.focus()
}

function closeAll(): void {
  open.value = false
  accountInfo.value?.closeProfileDialog()
  emit('overlay-change', false)
}

watch(
  [open, accountDialogOpen],
  ([popoverOpen, dialogOpen], [wasOpen]) => {
    emit('overlay-change', enabled.value && (popoverOpen || dialogOpen))
    if (!popoverOpen) {
      focusRun += 1
      if (wasOpen && enabled.value && panel.value?.contains(document.activeElement))
        trigger.value?.querySelector('button')?.focus()
    }
  },
  { flush: 'sync' }
)
watch(
  enabled,
  (value) => {
    if (!value) closeAll()
  },
  { flush: 'sync' }
)
onActivated(() => {
  alive.value = true
})
onDeactivated(() => {
  alive.value = false
  closeAll()
})
onBeforeUnmount(() => {
  alive.value = false
  closeAll()
})
</script>

<template>
  <div class="flex-none" style="-webkit-app-region: no-drag">
    <TxPopover
      v-model="open"
      trigger="manual"
      placement="bottom-end"
      :disabled="!enabled"
      :width="340"
      :max-width="360"
      :max-height="520"
      :keep-alive-content="false"
      :animation="{ type: 'none', duration: 0, closeDuration: 0 }"
      panel-background="refraction"
      :panel-radius="12"
      :panel-padding="10"
    >
      <template #reference>
        <span ref="trigger" class="inline-flex">
          <TxButton
            variant="ghost"
            size="md"
            circle
            :disabled="!enabled"
            :aria-label="t('accountMenu.trigger', { account: accountLabel, chrome: chromeSummary })"
            :title="t('accountMenu.trigger', { account: accountLabel, chrome: chromeSummary })"
            aria-haspopup="dialog"
            :aria-expanded="open"
            data-testid="shell-account-avatar"
            @click="toggle"
          >
            <TxAvatar
              :src="isLoggedIn ? avatarUrl || undefined : undefined"
              :name="isLoggedIn ? displayName || displayEmail : undefined"
              :icon="isLoggedIn ? undefined : 'i-ri-user-3-line'"
              :alt="accountLabel"
              :size="24"
            />
          </TxButton>
        </span>
      </template>

      <div
        ref="panel"
        role="dialog"
        :aria-label="t('accountMenu.title')"
        class="min-w-0 text-[var(--tx-text-color-primary)]"
        @keydown="panelKeydown"
      >
        <BrowserConnectionPanel
          v-if="view === 'chrome'"
          :active="enabled && open"
          @back="showView('home')"
        />
        <template v-else>
          <section class="flex flex-col gap-2 pb-3" :aria-labelledby="accountHeadingId">
            <h3
              :id="accountHeadingId"
              class="m-0 px-1.5 text-xs font-medium text-[var(--tx-text-color-secondary)]"
            >
              {{ t('accountMenu.tuffAccount') }}
            </h3>
            <div
              v-if="isLoading"
              class="flex items-center gap-3 px-1.5"
              aria-busy="true"
              :aria-label="t('accountMenu.loadingAccount')"
            >
              <TxSkeleton :width="36" :height="36" :radius="18" />
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <TxSkeleton width="60%" :height="12" :radius="6" />
                <TxSkeleton width="80%" :height="10" :radius="5" />
              </div>
            </div>
            <template v-else-if="isLoggedIn">
              <div class="flex items-center gap-3 px-1.5">
                <TxAvatar
                  :src="avatarUrl || undefined"
                  :name="displayName || displayEmail"
                  :alt="accountLabel"
                  :size="36"
                />
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-sm font-medium">{{ accountLabel }}</p>
                  <p class="m-0 truncate text-xs text-[var(--tx-text-color-secondary)]">
                    {{ displayEmail || t('userProfile.unknownEmail') }}
                  </p>
                </div>
              </div>
              <div class="flex flex-wrap gap-1">
                <TxButton
                  variant="ghost"
                  size="sm"
                  icon="i-ri-account-circle-line"
                  @click="openAccountDetails"
                >
                  {{ t('accountMenu.accountDetails') }}
                </TxButton>
                <TxButton
                  variant="ghost"
                  size="sm"
                  icon="i-ri-settings-3-line"
                  @click="openAccountSettings"
                >
                  {{ t('accountMenu.accountSettings') }}
                </TxButton>
                <TxButton
                  variant="ghost"
                  size="sm"
                  icon="i-ri-logout-box-r-line"
                  :loading="authLoadingState.isSigningOut"
                  :disabled="authLoadingState.isSigningOut"
                  @click="signOut"
                >
                  {{ t('accountMenu.signOut') }}
                </TxButton>
              </div>
            </template>
            <template v-else>
              <div class="flex flex-wrap gap-1">
                <TxButton
                  variant="flat"
                  size="sm"
                  icon="i-ri-login-box-line"
                  :loading="authLoadingState.isLoggingIn"
                  :disabled="authLoadingState.isLoggingIn"
                  @click="signIn"
                >
                  {{ t('accountMenu.signIn') }}
                </TxButton>
                <TxButton
                  variant="ghost"
                  size="sm"
                  icon="i-ri-settings-3-line"
                  @click="openAccountSettings"
                >
                  {{ t('accountMenu.accountSettings') }}
                </TxButton>
              </div>
            </template>
          </section>

          <section
            class="flex flex-col gap-2 border-t border-[var(--tx-border-color-light)] pt-3"
            :aria-labelledby="showChromeProfiles ? chromeHeadingId : undefined"
            :aria-label="showChromeProfiles ? undefined : t('accountMenu.chromeProfiles')"
          >
            <template v-if="showChromeProfiles">
              <h3
                :id="chromeHeadingId"
                class="m-0 px-1.5 text-xs font-medium text-[var(--tx-text-color-secondary)]"
              >
                {{ t('accountMenu.chromeProfiles') }}
              </h3>
              <p
                v-if="actionError"
                role="alert"
                class="m-0 break-words px-1.5 text-xs text-[var(--tx-color-danger)]"
              >
                {{ actionError }}
              </p>
              <div
                v-if="chromeLoadFailed"
                role="alert"
                class="flex flex-col items-start gap-1.5 px-1.5"
              >
                <p class="m-0 text-xs leading-normal text-[var(--tx-text-color-secondary)]">
                  {{ t('browserConnection.loadFailed') }}
                  {{ connection.describeError(connection.loadError.value) }}
                </p>
                <TxButton
                  variant="ghost"
                  size="sm"
                  icon="i-ri-refresh-line"
                  @click="connection.load()"
                >
                  {{ t('browserConnection.retry') }}
                </TxButton>
              </div>
              <div
                v-else-if="connection.state.value && liveProfiles.length"
                class="flex flex-col gap-0.5"
                role="group"
                :aria-label="t('accountMenu.chromeProfiles')"
              >
                <TxButton
                  v-for="profile in liveProfiles"
                  :key="profile.id"
                  variant="ghost"
                  size="md"
                  block
                  :aria-pressed="connection.state.value.activeProfileId === profile.id"
                  :disabled="connection.busy.has('select')"
                  :data-profile-id="profile.id"
                  @click="selectProfile(profile.id)"
                >
                  <span class="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span
                      class="inline-flex h-4 w-4 flex-none"
                      :class="
                        connection.state.value.activeProfileId === profile.id
                          ? 'i-ri-checkbox-circle-fill text-[var(--tx-color-primary)]'
                          : 'i-ri-chrome-line'
                      "
                      aria-hidden="true"
                    />
                    <span class="min-w-0 flex-1 truncate">{{ profile.label }}</span>
                    <TxStatusBadge
                      :text="t(browserProfileStatus(profile).label)"
                      :status="browserProfileStatus(profile).tone"
                      size="sm"
                    />
                  </span>
                </TxButton>
              </div>
            </template>
            <TxButton
              variant="ghost"
              size="sm"
              block
              icon="i-ri-equalizer-line"
              data-testid="shell-account-chrome-manage"
              @click="showView('chrome')"
            >
              {{ t('accountMenu.manageChrome') }}
            </TxButton>
          </section>
        </template>
      </div>
    </TxPopover>
    <TuffUserInfo
      ref="accountInfo"
      :show-trigger="false"
      :reference="trigger"
      @visible-change="accountDialogOpen = $event"
    />
  </div>
</template>
