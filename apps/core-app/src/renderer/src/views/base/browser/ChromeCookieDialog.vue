<script setup lang="ts">
import type { ChromeCookieRecord } from '@talex-touch/utils/transport/sdk/domains/browser-connection'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBrowserConnection } from '~/modules/browser-connection/useBrowserConnection'

const props = defineProps<{
  modelValue: boolean
  url: string
  domain: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'sync-success': [count: number, domain: string]
}>()

const { t, locale } = useI18n()
const connection = useBrowserConnection()

const isConnected = computed(() => connection.activeProfile.value?.status === 'connected')
const profile = computed(() => connection.activeProfile.value)

const fetching = ref(false)
const syncing = ref(false)
const error = ref('')
const cookies = ref<ChromeCookieRecord[]>([])
const searchKeyword = ref('')

const AUTO_SYNC_STORAGE_KEY = 'tuff-browser-cookie-auto-sync-sites'
function getAutoSyncSites(): string[] {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function setAutoSyncSites(sites: string[]): void {
  try {
    localStorage.setItem(AUTO_SYNC_STORAGE_KEY, JSON.stringify(sites))
  } catch {
    // ignore
  }
}

const autoSyncCurrentSite = computed({
  get() {
    if (!props.domain) return false
    return getAutoSyncSites().includes(props.domain)
  },
  set(val: boolean) {
    if (!props.domain) return
    const sites = new Set(getAutoSyncSites())
    if (val) {
      sites.add(props.domain)
    } else {
      sites.delete(props.domain)
    }
    setAutoSyncSites(Array.from(sites))
  }
})

const filteredCookies = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return cookies.value
  return cookies.value.filter(
    (c) => c.name.toLowerCase().includes(kw) || c.domain.toLowerCase().includes(kw)
  )
})

watch(
  () => props.modelValue,
  (val) => {
    if (val && props.url && isConnected.value) {
      loadCookies()
    }
  }
)

async function loadCookies(): Promise<void> {
  if (!profile.value || !props.url || !isConnected.value) return
  fetching.value = true
  error.value = ''
  try {
    const items = await connection.getCookies(profile.value.id, { url: props.url })
    cookies.value = items || []
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    error.value = connection.describeError(msg)
  } finally {
    fetching.value = false
  }
}

async function syncNow(): Promise<void> {
  if (!profile.value || !props.url || syncing.value) return
  if (!isConnected.value) {
    error.value = t('browser.cookies.chromeOfflineHint')
    return
  }
  syncing.value = true
  error.value = ''
  try {
    const res = await connection.importCookies(profile.value.id, { url: props.url })
    await loadCookies()
    emit('sync-success', res?.importedCount ?? 0, props.domain)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    error.value = connection.describeError(msg)
  } finally {
    syncing.value = false
  }
}

function formatExpiry(timestamp?: number): string {
  if (!timestamp || timestamp <= 0) return t('browser.cookies.sessionExpiry')
  try {
    const d = new Date(timestamp * 1000)
    return d.toLocaleDateString(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  } catch {
    return t('browser.cookies.sessionExpiry')
  }
}
</script>

<template>
  <TxModal
    :model-value="modelValue"
    :title="t('browser.cookies.modalTitle')"
    :close-label="t('common.close')"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col gap-4 text-sm">
      <!-- Status Banner -->
      <div
        class="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs"
        :class="
          isConnected
            ? 'bg-[var(--tx-fill-color-light)] text-[var(--tx-text-color-regular)]'
            : 'bg-[var(--tx-color-warning-light-9)] text-[var(--tx-color-warning)]'
        "
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-2.5 w-2.5 flex-none rounded-full"
            :class="isConnected ? 'bg-[var(--tx-color-success)]' : 'bg-[var(--tx-color-warning)]'"
          />
          <span class="truncate font-medium">
            {{
              !profile
                ? t('browser.cookies.noProfileConnected')
                : isConnected
                  ? t('browser.cookies.connectedProfile', { label: profile.label })
                  : t('browser.cookies.profileOffline', { label: profile.label })
            }}
          </span>
        </div>
        <span class="flex-none font-mono text-xs text-[var(--tx-text-color-secondary)]">
          {{ domain }}
        </span>
      </div>

      <!-- Offline Hint -->
      <div
        v-if="!isConnected && profile"
        class="rounded-xl border border-[var(--tx-color-warning-light-7)] bg-[var(--tx-color-warning-light-9)] p-3 text-xs leading-relaxed text-[var(--tx-color-warning)]"
      >
        {{ t('browser.cookies.chromeOfflineHint') }}
      </div>

      <!-- Error message -->
      <div
        v-if="error"
        role="alert"
        class="flex items-start gap-2 rounded-xl border border-[var(--tx-color-danger-light-7)] bg-[var(--tx-color-danger-light-9)] p-3 text-xs text-[var(--tx-color-danger)]"
      >
        <span class="i-ri-error-warning-line text-sm flex-none mt-0.5" />
        <span class="break-words flex-1">{{ error }}</span>
      </div>

      <!-- Actions bar -->
      <div class="flex items-center justify-between gap-3">
        <label
          class="flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--tx-text-color-regular)]"
        >
          <TxSwitch v-model="autoSyncCurrentSite" size="small" />
          <span>{{ t('browser.cookies.autoSyncLabel') }}</span>
        </label>
        <TxButton
          variant="primary"
          size="sm"
          icon="i-ri-refresh-line"
          :loading="syncing"
          :disabled="!isConnected"
          @click="syncNow"
        >
          {{ t('browser.cookies.syncNow') }}
        </TxButton>
      </div>

      <!-- Cookies preview table -->
      <div class="flex flex-col gap-2 pt-2 border-t border-[var(--tx-border-color-light)]">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-[var(--tx-text-color-primary)]">
            {{ t('browser.cookies.detailsTitle', { count: cookies.length }) }}
          </span>
          <span
            v-if="fetching"
            class="i-ri-loader-4-line animate-spin text-xs text-[var(--tx-text-color-secondary)]"
          />
        </div>

        <TxInput
          v-if="cookies.length > 3"
          v-model="searchKeyword"
          :placeholder="t('browser.cookies.searchPlaceholder')"
          size="sm"
          clearable
        />

        <div
          v-if="filteredCookies.length > 0"
          class="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1"
        >
          <div
            v-for="item in filteredCookies"
            :key="`${item.domain}_${item.path}_${item.name}`"
            class="flex flex-col gap-1 rounded-lg border border-[var(--tx-border-color-light)] bg-[var(--tx-fill-color-light)] p-2.5 text-xs"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono font-semibold text-[var(--tx-text-color-primary)] truncate">
                {{ item.name }}
              </span>
              <div class="flex items-center gap-1.5 flex-none">
                <span
                  v-if="item.httpOnly"
                  class="rounded bg-[var(--tx-fill-color-dark)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--tx-text-color-secondary)]"
                >
                  HttpOnly
                </span>
                <span
                  v-if="item.secure"
                  class="rounded bg-[var(--tx-color-success-light-8)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--tx-color-success)]"
                >
                  Secure
                </span>
              </div>
            </div>
            <div
              class="flex items-center justify-between text-[11px] text-[var(--tx-text-color-secondary)]"
            >
              <span class="truncate font-mono">{{ item.domain }}{{ item.path }}</span>
              <span class="flex-none">{{ formatExpiry(item.expirationDate) }}</span>
            </div>
          </div>
        </div>

        <div
          v-else-if="!fetching"
          class="py-6 text-center text-xs text-[var(--tx-text-color-secondary)]"
        >
          {{
            cookies.length === 0
              ? t('browser.cookies.emptyForDomain')
              : t('browser.cookies.noMatch')
          }}
        </div>
      </div>
    </div>
  </TxModal>
</template>
