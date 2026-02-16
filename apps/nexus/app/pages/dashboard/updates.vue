<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'
import { useDashboardUpdatesData } from '~/composables/useDashboardData'
import { useToast } from '~/composables/useToast'

interface LocalizedText {
  zh: string
  en: string
}

interface DashboardUpdate {
  id: string
  type: 'news' | 'release'
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
}

interface DashboardUpdateSettings {
  syncBaseUrl: string | null
}

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t, locale } = useI18n()
const { user } = useAuthUser()
const toast = useToast()
const requestUrl = useRequestURL()

const { updates, pending: updatesPending, refresh: refreshUpdates } = useDashboardUpdatesData()
const { data: settingsData, pending: settingsPending } = await useAsyncData(
  'dashboard-update-settings',
  () => $fetch<{ settings: DashboardUpdateSettings }>('/api/dashboard/updates/settings'),
)

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

const syncBaseUrl = ref('')
const syncSaving = ref(false)
const syncError = ref<string | null>(null)
const syncGuideVisible = ref(false)
const syncGuideSource = ref<HTMLElement | null>(null)
const syncGuideTriggerRef = ref<HTMLElement | null>(null)

watch(
  () => settingsData.value?.settings,
  (settings) => {
    if (settings)
      syncBaseUrl.value = settings.syncBaseUrl ?? ''
  },
  { immediate: true },
)

const resolvedSyncBaseUrl = computed(() => syncBaseUrl.value || requestUrl.origin)

const releaseSyncExample = computed(() => {
  const baseUrl = resolvedSyncBaseUrl.value
  return [
    `curl -X POST \"${baseUrl}/api/releases\" \\`,
    '  -H \"Authorization: Bearer $NEXUS_API_KEY\" \\',
    '  -H \"Content-Type: application/json\" \\',
    '  -d \'{"tag":"v1.2.3","name":"Tuff v1.2.3","version":"1.2.3","channel":"RELEASE","notes":{"zh":"...","en":"..."},"status":"published"}\'',
  ].join('\n')
})

function openSyncGuide() {
  syncGuideSource.value = syncGuideTriggerRef.value
  syncGuideVisible.value = true
}

function formatDate(value?: string) {
  if (!value)
    return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return dateFormatter.value.format(parsed)
}

const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

const isZh = computed(() => locale.value.startsWith('zh'))

function resolveLocalizedText(text: LocalizedText) {
  if (isZh.value)
    return text.zh || text.en
  return text.en || text.zh
}

function updateTypeLabel(update: DashboardUpdate) {
  return update.type === 'release'
    ? t('dashboard.sections.updates.typeRelease', '更新')
    : t('dashboard.sections.updates.typeNews', '要闻')
}

async function saveSyncSettings() {
  syncSaving.value = true
  syncError.value = null
  try {
    const response = await $fetch<{ settings: DashboardUpdateSettings }>('/api/dashboard/updates/settings', {
      method: 'PATCH',
      body: {
        syncBaseUrl: syncBaseUrl.value || null,
      },
    })
    syncBaseUrl.value = response.settings.syncBaseUrl ?? ''
    toast.success(t('dashboard.sections.updates.sync.saved', '同步设置已保存'))
  }
  catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || t('dashboard.sections.updates.sync.saveFailed', '保存失败')
    syncError.value = message
    toast.warning(message)
  }
  finally {
    syncSaving.value = false
  }
}

const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const editingUpdate = ref<DashboardUpdate | null>(null)

function openCreate() {
  drawerMode.value = 'create'
  editingUpdate.value = null
  drawerOpen.value = true
}

function openEdit(update: DashboardUpdate) {
  drawerMode.value = 'edit'
  editingUpdate.value = update
  drawerOpen.value = true
}

async function onSaved() {
  await refreshUpdates()
}

// Delete confirmation
const deleteConfirmVisible = ref(false)
const pendingDeleteUpdate = ref<DashboardUpdate | null>(null)

function deleteUpdateItem(update: DashboardUpdate) {
  pendingDeleteUpdate.value = update
  deleteConfirmVisible.value = true
}

async function confirmDeleteUpdate(): Promise<boolean> {
  if (!pendingDeleteUpdate.value)
    return true
  try {
    await $fetch(`/api/dashboard/updates/${pendingDeleteUpdate.value.id}`, { method: 'DELETE' })
    await refreshUpdates()
  }
  catch (error: unknown) {
    console.error('Failed to delete update:', error)
  }
  finally {
    pendingDeleteUpdate.value = null
  }
  return true
}

function closeDeleteConfirm() {
  deleteConfirmVisible.value = false
  pendingDeleteUpdate.value = null
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h2 class="apple-heading-sm">
        {{ t('dashboard.sections.updates.title') }}
      </h2>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.updates.subtitle') }}
      </p>
    </div>

    <section class="apple-card-lg p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 class="text-sm font-semibold text-black dark:text-white">
            {{ t('dashboard.sections.updates.sync.title') }}
          </h3>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.sync.subtitle') }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span ref="syncGuideTriggerRef" class="inline-flex">
            <TxButton
              circle
              size="mini"
              variant="ghost"
              icon="i-carbon-help"
              native-type="button"
              :aria-label="t('dashboard.sections.updates.sync.guideTrigger', '配置说明')"
              :title="t('dashboard.sections.updates.sync.guideTrigger', '配置说明')"
              class="text-black/50 hover:text-primary dark:text-white/50"
              @click="openSyncGuide"
            />
          </span>
          <NuxtLink
            to="/dashboard/api-keys"
            class="text-xs text-primary no-underline hover:text-primary/80"
          >
            {{ t('dashboard.sections.updates.sync.apiKeyHint') }}
          </NuxtLink>
        </div>
      </div>

      <div class="mt-4 space-y-3">
        <div>
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.sync.baseUrlLabel') }}
          </label>
          <Input
            v-model="syncBaseUrl"
            type="text"
            class="mt-2"
            :placeholder="t('dashboard.sections.updates.sync.baseUrlPlaceholder')"
          />
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <TxButton size="small" :disabled="syncSaving || settingsPending" @click="saveSyncSettings">
            <TxSpinner v-if="syncSaving" :size="14" />
            <span class="ml-2">
              {{ t('dashboard.sections.updates.sync.save') }}
            </span>
          </TxButton>
          <span v-if="syncError" class="text-xs text-rose-500">
            {{ syncError }}
          </span>
        </div>
</div>
    </section>

    <section class="apple-card-lg p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-base font-semibold text-black dark:text-white">
            {{ t('dashboard.sections.updates.listTitle', '更新与要闻') }}
          </h3>
          <p class="mt-1 text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.listSubtitle', '统一管理要闻与版本更新。') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <TxButton v-if="isAdmin" icon="i-carbon-add" size="small" @click="openCreate">
            {{ t('dashboard.sections.updates.addButton') }}
          </TxButton>
          <FlatButton
            icon="i-carbon-news"
            to="https://docs.tuff.chat/changelog"
            target="_blank"
          />
        </div>
      </div>

      <div v-if="updatesPending" class="mt-4 space-y-3 py-6">
        <div class="flex items-center justify-center">
          <TxSpinner :size="18" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>

      <div
        v-else-if="!updates.length"
        class="mt-4 rounded-2xl border border-dashed border-black/[0.08] py-8 text-center text-sm text-black/40 dark:border-white/[0.08] dark:text-white/40"
      >
        {{ t('dashboard.sections.updates.empty') }}
      </div>

      <ul v-else class="mt-5 space-y-3">
        <li
          v-for="update in updates"
          :key="update.id"
          class="group relative rounded-2xl bg-black/[0.02] p-4 transition-all duration-200 hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs text-black/40 dark:text-white/40">
                  {{ formatDate(update.timestamp) }}
                </span>
                <span
                  class="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                  :class="update.type === 'release'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-black/[0.05] text-black/60 dark:bg-white/[0.08] dark:text-white/60'"
                >
                  {{ updateTypeLabel(update) }}
                </span>
                <span
                  v-for="tag in update.tags.slice(0, 2)"
                  :key="tag"
                  class="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-black/60 dark:bg-white/[0.08] dark:text-white/60"
                >
                  {{ tag }}
                </span>
              </div>
              <a
                :href="update.link"
                target="_blank"
                rel="noopener"
                class="mt-1.5 block text-sm font-medium text-black transition hover:text-primary dark:text-white"
              >
                {{ resolveLocalizedText(update.title) }}
              </a>
              <p class="mt-1 line-clamp-2 text-sm text-black/50 dark:text-white/50">
                {{ resolveLocalizedText(update.summary) }}
              </p>
            </div>
            <div
              v-if="isAdmin && update.type === 'news'"
              class="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100"
            >
              <FlatButton icon="i-carbon-edit" @click="openEdit(update)" />
              <FlatButton icon="i-carbon-trash-can" @click="deleteUpdateItem(update)" />
            </div>
          </div>
        </li>
      </ul>
    </section>

    <DashboardUpdateFormDrawer
      :open="drawerOpen"
      :mode="drawerMode"
      :update="editingUpdate"
      @close="drawerOpen = false"
      @saved="onSaved"
    />

    <Teleport to="body">
      <TxFlipOverlay
        v-model="syncGuideVisible"
        :source="syncGuideSource"
        :duration="420"
        :rotate-x="6"
        :rotate-y="8"
        transition-name="UpdatesGuideOverlay-Mask"
        mask-class="UpdatesGuideOverlay-Mask"
        card-class="UpdatesGuideOverlay-Card"
      >
        <template #default="{ close }">
          <div class="UpdatesGuideOverlay-Inner">
            <div class="UpdatesGuideOverlay-Header">
              <div class="space-y-1">
                <h2 class="UpdatesGuideOverlay-Title">
                  {{ t('dashboard.sections.updates.sync.guideTitle', '更新/要闻同步说明') }}
                </h2>
                <p class="UpdatesGuideOverlay-Desc">
                  {{ t('dashboard.sections.updates.sync.guideSubtitle', '如何配置同步入口、示例与工作机制。') }}
                </p>
              </div>
              <TxButton variant="secondary" size="small" native-type="button" @click="close?.()">
                {{ t('dashboard.sections.updates.sync.guideClose', '关闭') }}
              </TxButton>
            </div>

            <div class="UpdatesGuideOverlay-Body">
              <section class="UpdatesGuideOverlay-Section">
                <h3 class="UpdatesGuideOverlay-SectionTitle">
                  {{ t('dashboard.sections.updates.sync.guidePurposeTitle', '有什么用') }}
                </h3>
                <ul class="UpdatesGuideOverlay-List">
                  <li class="UpdatesGuideOverlay-ListItem">
                    <span class="i-carbon-checkmark text-primary text-sm" />
                    <span>{{ t('dashboard.sections.updates.sync.guidePurposeItem1', '在发布流水线里自动写入更新与要闻。') }}</span>
                  </li>
                  <li class="UpdatesGuideOverlay-ListItem">
                    <span class="i-carbon-checkmark text-primary text-sm" />
                    <span>{{ t('dashboard.sections.updates.sync.guidePurposeItem2', '保持更新与下载页面内容一致。') }}</span>
                  </li>
                </ul>
              </section>

              <section class="UpdatesGuideOverlay-Section">
                <h3 class="UpdatesGuideOverlay-SectionTitle">
                  {{ t('dashboard.sections.updates.sync.guideConfigTitle', '如何配置') }}
                </h3>
                <ol class="UpdatesGuideOverlay-List UpdatesGuideOverlay-List--ordered">
                  <li>{{ t('dashboard.sections.updates.sync.guideConfigStep1', '在“同步设置”填写服务器地址（留空默认当前域名）。') }}</li>
                  <li>{{ t('dashboard.sections.updates.sync.guideConfigStep2', '到 API Keys 创建密钥，保存为 CI 的 `NEXUS_API_KEY`。') }}</li>
                  <li>{{ t('dashboard.sections.updates.sync.guideConfigStep3', '在流水线中调用发布接口提交数据（release/news）。') }}</li>
                </ol>
              </section>

              <section class="UpdatesGuideOverlay-Section">
                <h3 class="UpdatesGuideOverlay-SectionTitle">
                  {{ t('dashboard.sections.updates.sync.guideExampleTitle', '示例') }}
                </h3>
                <p class="UpdatesGuideOverlay-Hint">
                  {{ t('dashboard.sections.updates.sync.guideExampleHint', '示例使用发布接口（/api/releases）。') }}
                </p>
                <pre class="UpdatesGuideOverlay-Code">{{ releaseSyncExample }}</pre>
              </section>

              <section class="UpdatesGuideOverlay-Section">
                <h3 class="UpdatesGuideOverlay-SectionTitle">
                  {{ t('dashboard.sections.updates.sync.guidePrincipleTitle', '作用原理') }}
                </h3>
                <p class="UpdatesGuideOverlay-Text">
                  {{ t('dashboard.sections.updates.sync.guidePrincipleDesc', 'CI 请求携带 API Key → 服务端校验 → 写入 D1/存储 → 前端拉取并展示。') }}
                </p>
              </section>
            </div>
          </div>
        </template>
      </TxFlipOverlay>
    </Teleport>

    <TxBottomDialog
      v-if="deleteConfirmVisible"
      :title="t('dashboard.sections.updates.deleteTitle', 'Delete Update')"
      :message="t('dashboard.sections.updates.confirmDelete', { title: resolveLocalizedText(pendingDeleteUpdate?.title || { zh: '', en: '' }) })"
      :btns="[
        { content: t('dashboard.sections.updates.cancel', 'Cancel'), type: 'info', onClick: () => true },
        { content: t('dashboard.sections.updates.delete', 'Delete'), type: 'error', onClick: confirmDeleteUpdate },
      ]"
      :close="closeDeleteConfirm"
    />
  </div>
</template>

<style scoped>
.UpdatesGuideOverlay-Inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 20px;
}

.UpdatesGuideOverlay-Header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.UpdatesGuideOverlay-Title {
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.UpdatesGuideOverlay-Desc {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.UpdatesGuideOverlay-Body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.UpdatesGuideOverlay-Section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.UpdatesGuideOverlay-SectionTitle {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.UpdatesGuideOverlay-List {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.UpdatesGuideOverlay-List--ordered {
  display: grid;
  gap: 8px;
  padding-left: 18px;
  list-style: decimal;
}

.UpdatesGuideOverlay-ListItem {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.UpdatesGuideOverlay-Hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.UpdatesGuideOverlay-Code {
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  background: color-mix(in srgb, var(--tx-bg-color-secondary, #f5f5f5) 80%, transparent);
  color: var(--tx-text-color-secondary);
}

.UpdatesGuideOverlay-Text {
  line-height: 1.6;
}
</style>

<style>
.UpdatesGuideOverlay-Mask {
  position: fixed;
  inset: 0;
  z-index: 1900;
  background: rgba(12, 12, 16, 0.4);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.UpdatesGuideOverlay-Mask-enter-active,
.UpdatesGuideOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.UpdatesGuideOverlay-Mask-enter-from,
.UpdatesGuideOverlay-Mask-leave-to {
  opacity: 0;
}

.UpdatesGuideOverlay-Card {
  width: min(640px, 92vw);
  min-height: 360px;
  max-height: 82vh;
  background: var(--tx-bg-color-overlay);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: auto;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}
</style>
