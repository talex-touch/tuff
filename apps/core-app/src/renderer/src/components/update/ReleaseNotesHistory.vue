<script setup lang="ts">
import type { ReleaseNotesEntry, UpdateReleaseNotesChannel } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxMarkdownView } from '@talex-touch/tuffex/markdown-view'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useReleaseNotesRuntime } from '~/modules/hooks/useReleaseNotesRuntime'

interface ChannelState {
  entries: ReleaseNotesEntry[]
  nextCursor: string | null
  hasMore: boolean
  stale: boolean
  loading: boolean
  loaded: boolean
  error: string | null
}

function createChannelState(): ChannelState {
  return {
    entries: [],
    nextCursor: null,
    hasMore: false,
    stale: false,
    loading: false,
    loaded: false,
    error: null
  }
}

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { listReleaseNotes, getReleaseNotes, currentVersion } = useReleaseNotesRuntime()
const activeChannel = ref<UpdateReleaseNotesChannel>('RELEASE')
const selectedEntry = shallowRef<ReleaseNotesEntry | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const channelStates = reactive<Record<UpdateReleaseNotesChannel, ChannelState>>({
  RELEASE: createChannelState(),
  BETA: createChannelState()
})

const activeState = computed(() => channelStates[activeChannel.value])
const isChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))
const selectedNotes = computed(() => {
  const entry = selectedEntry.value
  if (!entry) return ''
  return isChinese.value ? entry.notes.zh : entry.notes.en
})

function channelLabel(channel: UpdateReleaseNotesChannel): string {
  return channel === 'BETA' ? t('releaseNotes.channelBeta') : t('releaseNotes.channelRelease')
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(date)
}

async function loadChannel(
  channel: UpdateReleaseNotesChannel,
  options: { reset?: boolean } = {}
): Promise<void> {
  const state = channelStates[channel]
  if (state.loading) return
  if (options.reset) {
    state.entries = []
    state.nextCursor = null
    state.hasMore = false
    state.loaded = false
  }

  state.loading = true
  state.error = null
  try {
    const page = await listReleaseNotes({
      channel,
      cursor: state.nextCursor ?? undefined,
      limit: 20
    })
    const knownTags = new Set(state.entries.map((entry) => entry.tag))
    state.entries.push(...page.entries.filter((entry) => !knownTags.has(entry.tag)))
    state.nextCursor = page.nextCursor
    state.hasMore = page.hasMore
    state.stale = page.stale
    state.loaded = true

    const refreshedSelection = state.entries.find((entry) => entry.tag === selectedEntry.value?.tag)
    if (activeChannel.value === channel && refreshedSelection) {
      selectedEntry.value = refreshedSelection
    } else if (
      activeChannel.value === channel &&
      !selectedEntry.value &&
      state.entries.length > 0
    ) {
      await selectEntry(state.entries[0], false)
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    state.loaded = true
  } finally {
    state.loading = false
  }
}

async function selectEntry(entry: ReleaseNotesEntry, updateRoute = true): Promise<void> {
  selectedEntry.value = entry
  detailError.value = null
  if (!updateRoute) return
  await router.replace({
    query: {
      ...route.query,
      section: 'update',
      release: entry.tag
    }
  })
}

async function openDeepLinkedEntry(tag: string): Promise<void> {
  detailLoading.value = true
  detailError.value = null
  try {
    const entry = await getReleaseNotes(tag)
    activeChannel.value = entry.channel
    selectedEntry.value = entry
    if (!channelStates[entry.channel].loaded) {
      await loadChannel(entry.channel)
    }
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : String(error)
  } finally {
    detailLoading.value = false
  }
}

async function changeChannel(channel: UpdateReleaseNotesChannel): Promise<void> {
  if (activeChannel.value === channel) return
  activeChannel.value = channel
  selectedEntry.value = channelStates[channel].entries[0] ?? null
  if (!channelStates[channel].loaded) {
    await loadChannel(channel)
  }

  const firstEntry = channelStates[channel].entries[0]
  if (firstEntry) {
    await selectEntry(firstEntry)
  }
}

async function refresh(): Promise<void> {
  selectedEntry.value = null
  await loadChannel(activeChannel.value, { reset: true })
}

function showList(): void {
  selectedEntry.value = null
}

watch(
  () => route.query.release,
  async (value) => {
    if (typeof value === 'string' && value && value !== selectedEntry.value?.tag) {
      await openDeepLinkedEntry(value)
    }
  }
)

onMounted(async () => {
  const requestedTag = typeof route.query.release === 'string' ? route.query.release : ''
  if (requestedTag) {
    await openDeepLinkedEntry(requestedTag)
    return
  }
  await loadChannel(activeChannel.value)
})
</script>

<template>
  <section class="release-notes-history" aria-labelledby="release-notes-history-title">
    <header class="release-notes-history__header">
      <div>
        <h4 id="release-notes-history-title">
          {{ t('releaseNotes.historyTitle') }}
        </h4>
        <p>{{ t('releaseNotes.historyDescription') }}</p>
      </div>
      <TxButton size="sm" :loading="activeState.loading" @click="refresh">
        {{ t('releaseNotes.refresh') }}
      </TxButton>
    </header>

    <div
      class="release-notes-history__tabs"
      role="tablist"
      :aria-label="t('releaseNotes.channelTabs')"
    >
      <button
        v-for="channel in ['RELEASE', 'BETA'] as const"
        :id="`release-notes-tab-${channel.toLowerCase()}`"
        :key="channel"
        type="button"
        role="tab"
        :aria-selected="activeChannel === channel"
        :aria-controls="`release-notes-panel-${channel.toLowerCase()}`"
        :class="{ 'is-active': activeChannel === channel }"
        @click="changeChannel(channel)"
      >
        {{ channelLabel(channel) }}
      </button>
    </div>

    <p v-if="activeState.stale" class="release-notes-history__notice" role="status">
      {{ t('releaseNotes.cachedNotice') }}
    </p>

    <div
      :id="`release-notes-panel-${activeChannel.toLowerCase()}`"
      class="release-notes-history__workspace"
      role="tabpanel"
      :aria-labelledby="`release-notes-tab-${activeChannel.toLowerCase()}`"
    >
      <aside
        class="release-notes-history__list"
        :class="{ 'has-selection': selectedEntry }"
        :aria-label="t('releaseNotes.versionList')"
      >
        <button
          v-for="entry in activeState.entries"
          :key="entry.tag"
          type="button"
          class="release-notes-history__item"
          :class="{ 'is-active': selectedEntry?.tag === entry.tag }"
          @click="selectEntry(entry)"
        >
          <span class="release-notes-history__item-title">
            <strong>v{{ entry.version }}</strong>
            <TxTag v-if="entry.version === currentVersion" size="sm" type="success">
              {{ t('releaseNotes.current') }}
            </TxTag>
            <TxTag v-if="entry.legacy" size="sm" type="info">
              {{ t('releaseNotes.legacy') }}
            </TxTag>
          </span>
          <time v-if="entry.publishedAt" :datetime="entry.publishedAt">{{
            formatDate(entry.publishedAt)
          }}</time>
        </button>

        <div v-if="activeState.error" class="release-notes-history__empty" role="alert">
          <p>{{ t('releaseNotes.loadFailed') }}</p>
          <TxButton size="sm" @click="loadChannel(activeChannel, { reset: true })">
            {{ t('releaseNotes.retry') }}
          </TxButton>
        </div>
        <p
          v-else-if="activeState.loaded && activeState.entries.length === 0"
          class="release-notes-history__empty"
        >
          {{ t('releaseNotes.empty') }}
        </p>
        <p
          v-else-if="activeState.loading && activeState.entries.length === 0"
          class="release-notes-history__empty"
        >
          {{ t('releaseNotes.loading') }}
        </p>

        <TxButton
          v-if="activeState.hasMore"
          class="release-notes-history__load-more"
          size="sm"
          :loading="activeState.loading"
          block
          @click="loadChannel(activeChannel)"
        >
          {{ t('releaseNotes.loadMore') }}
        </TxButton>
      </aside>

      <article class="release-notes-history__detail">
        <button
          type="button"
          class="release-notes-history__back"
          :aria-label="t('releaseNotes.backToVersions')"
          @click="showList"
        >
          <i class="i-ri-arrow-left-line" aria-hidden="true" />
          {{ t('releaseNotes.backToVersions') }}
        </button>

        <p v-if="detailLoading" class="release-notes-history__detail-state">
          {{ t('releaseNotes.loading') }}
        </p>
        <p v-else-if="detailError" class="release-notes-history__detail-state" role="alert">
          {{ t('releaseNotes.loadFailed') }}
        </p>
        <template v-else-if="selectedEntry">
          <header class="release-notes-history__detail-header">
            <div>
              <h5>{{ selectedEntry.name }}</h5>
              <time v-if="selectedEntry.publishedAt" :datetime="selectedEntry.publishedAt">
                {{ formatDate(selectedEntry.publishedAt) }}
              </time>
            </div>
            <div class="release-notes-history__badges">
              <TxTag size="sm" :type="selectedEntry.channel === 'BETA' ? 'warning' : 'success'">
                {{ channelLabel(selectedEntry.channel) }}
              </TxTag>
              <TxTag v-if="selectedEntry.version === currentVersion" size="sm" type="success">
                {{ t('releaseNotes.current') }}
              </TxTag>
              <TxTag v-if="selectedEntry.legacy" size="sm" type="info">
                {{ t('releaseNotes.legacy') }}
              </TxTag>
            </div>
          </header>
          <TxMarkdownView class="release-notes-history__markdown" :content="selectedNotes" />
        </template>
        <p v-else class="release-notes-history__detail-state">
          {{ t('releaseNotes.selectVersion') }}
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.release-notes-history {
  margin-top: 18px;
}

.release-notes-history__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.release-notes-history__header h4,
.release-notes-history__header p,
.release-notes-history__detail-header h5 {
  margin: 0;
}

.release-notes-history__header h4 {
  font-size: 15px;
  line-height: 1.4;
}

.release-notes-history__header p {
  margin-top: 3px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}

.release-notes-history__tabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  margin-bottom: 10px;
  border: 1px solid var(--tx-border-color);
  border-radius: 7px;
  background: var(--tx-fill-color-light);
}

.release-notes-history__tabs button {
  min-width: 88px;
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.release-notes-history__tabs button.is-active {
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}

.release-notes-history__notice {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-left: 3px solid var(--tx-color-warning);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  background: var(--tx-fill-color-light);
}

.release-notes-history__workspace {
  display: grid;
  grid-template-columns: minmax(190px, 230px) minmax(0, 1fr);
  min-height: 500px;
  max-height: 620px;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--tx-bg-color);
}

.release-notes-history__list {
  overflow-y: auto;
  border-right: 1px solid var(--tx-border-color);
  background: var(--tx-fill-color-extra-light);
}

.release-notes-history__item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  width: 100%;
  min-height: 62px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  background: transparent;
  color: var(--tx-text-color-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.release-notes-history__item:hover,
.release-notes-history__item.is-active {
  background: var(--tx-fill-color-light);
}

.release-notes-history__item.is-active {
  box-shadow: inset 3px 0 var(--tx-color-primary);
}

.release-notes-history__item-title,
.release-notes-history__badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.release-notes-history__item time,
.release-notes-history__detail-header time {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.release-notes-history__empty,
.release-notes-history__detail-state {
  margin: 0;
  padding: 24px 16px;
  color: var(--tx-text-color-secondary);
  text-align: center;
}

.release-notes-history__load-more {
  margin: 10px auto;
  width: calc(100% - 20px);
}

.release-notes-history__detail {
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.release-notes-history__detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.release-notes-history__detail-header h5 {
  margin-bottom: 4px;
  font-size: 16px;
  line-height: 1.4;
}

.release-notes-history__markdown {
  margin-top: 18px;
}

.release-notes-history__back {
  display: none;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--tx-color-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

@media (max-width: 760px) {
  .release-notes-history__workspace {
    display: block;
    max-height: none;
    min-height: 420px;
  }

  .release-notes-history__list {
    max-height: 480px;
    border-right: 0;
  }

  .release-notes-history__list.has-selection {
    display: none;
  }

  .release-notes-history__detail {
    min-height: 420px;
    padding: 16px;
  }

  .release-notes-history__detail:has(.release-notes-history__detail-state:last-child) {
    display: none;
  }

  .release-notes-history__back {
    display: inline-flex;
  }
}
</style>
