<script lang="ts" name="HomePreviewReview" setup>
import type {
  FileReviewPath,
  FileReviewRecord
} from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type { ReviewRollbackOutcome } from '~/modules/conversation/useConversationReview'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * What the host's file tools changed in this conversation, and the way back (A13, A14).
 *
 * Each row is a record Main captured around one write/delete/copy/move: per path, whether it existed
 * before and after, its hash and size, and a bounded diff when one could be computed. A record only
 * offers Undo when Main says it is supported; a branch's inherited record, a binary or oversized
 * file, a failed snapshot and anything a shell or MCP tool wrote say why instead. Undo sends the
 * record's identity and nothing else — Main re-checks the paths and refuses rather than overwrite a
 * later edit.
 */
const props = defineProps<{
  records: FileReviewRecord[]
  loading: boolean
  loadError: boolean
  detail: FileReviewRecord | null
  detailLoading: boolean
  rollingBack: string | null
  lastRollback: ReviewRollbackOutcome | null
}>()

const emit = defineEmits<{
  (event: 'open', reviewId: string): void
  (event: 'close'): void
  (event: 'rollback', reviewId: string): void
  (event: 'reload'): void
}>()

const { t, locale } = useI18n()

const timeFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' })
)
const sizeFormat = computed(() => new Intl.NumberFormat(locale.value))

/** The record awaiting a second press to roll back: Undo is never one click away. */
const confirming = ref<string | null>(null)
/** The record whose diff was last asked for, so its row alone shows the read in progress. */
const openingId = ref<string | null>(null)

function toggle(record: FileReviewRecord): void {
  if (props.detail?.id === record.id) {
    openingId.value = null
    emit('close')
    return
  }
  openingId.value = record.id
  emit('open', record.id)
}

const OPERATION_ICON: Record<FileReviewRecord['operation'], string> = {
  write: 'i-ri-edit-2-line',
  delete: 'i-ri-delete-bin-line',
  copy: 'i-ri-file-copy-line',
  move: 'i-ri-drag-move-line'
}

const STATUS_TONE: Record<FileReviewRecord['status'], string> = {
  recorded: 'is-recorded',
  partial: 'is-warning',
  unsupported: 'is-muted',
  rolled_back: 'is-done',
  rollback_failed: 'is-danger'
}

function canRollback(record: FileReviewRecord): boolean {
  return record.supported && (record.status === 'recorded' || record.status === 'partial')
}

/** Unknown existence (a capture that failed) reads as unknown, never as absent. */
function existence(value: boolean | null): string {
  if (value === null) return t('home.workspace.review.unknown')
  return value ? t('home.workspace.review.exists') : t('home.workspace.review.absent')
}

function sideSummary(side: FileReviewPath['before']): string {
  const parts = [existence(side.exists)]
  if (side.size !== undefined)
    parts.push(t('home.workspace.review.bytes', { count: sizeFormat.value.format(side.size) }))
  return parts.join(' · ')
}

function shortHash(hash: string | undefined): string | undefined {
  return hash ? hash.slice(0, 12) : undefined
}

function requestRollback(record: FileReviewRecord): void {
  if (!canRollback(record) || props.rollingBack) return
  if (confirming.value !== record.id) {
    confirming.value = record.id
    return
  }
  confirming.value = null
  emit('rollback', record.id)
}

function outcomeFor(record: FileReviewRecord): ReviewRollbackOutcome | null {
  return props.lastRollback?.reviewId === record.id ? props.lastRollback : null
}

function outcomeText(outcome: ReviewRollbackOutcome): string {
  if (outcome.ok)
    return t('home.workspace.review.rolledBack', { count: outcome.restoredPaths.length })
  return outcome.code
    ? t(`home.workspace.review.code.${outcome.code}`)
    : t('home.workspace.review.rollbackRequestFailed')
}
</script>

<template>
  <div class="HomePreviewReview" :aria-busy="loading || undefined">
    <p class="HomePreviewReview-Boundary">{{ t('home.workspace.review.boundary') }}</p>

    <div v-if="loading && records.length === 0" class="HomePreviewReview-List" aria-hidden="true">
      <div v-for="row in 3" :key="row" class="HomePreviewReview-SkeletonRow">
        <div class="HomePreviewReview-SkeletonLine"><TxSkeleton :height="10" :radius="5" /></div>
        <div class="HomePreviewReview-SkeletonLine is-short">
          <TxSkeleton :height="8" :radius="4" />
        </div>
      </div>
    </div>

    <div v-else-if="loadError && records.length === 0" class="HomePreviewReview-State" role="alert">
      <span>{{ t('home.workspace.review.loadFailed') }}</span>
      <button class="HomePreviewReview-Link" type="button" @click="emit('reload')">
        {{ t('home.workspace.retry') }}
      </button>
    </div>

    <p v-else-if="records.length === 0" class="HomePreview-Empty">
      {{ t('home.workspace.review.empty') }}
    </p>

    <ol v-else class="HomePreviewReview-List">
      <li v-for="record in records" :key="record.id" class="HomePreviewReview-Item">
        <button
          class="HomePreviewReview-Head"
          type="button"
          :aria-expanded="detail?.id === record.id"
          @click="toggle(record)"
        >
          <span
            :class="OPERATION_ICON[record.operation]"
            class="HomePreviewReview-Icon"
            aria-hidden="true"
          />
          <span class="HomePreviewReview-Text">
            <span class="HomePreview-Name">
              {{ t(`home.workspace.review.operation.${record.operation}`) }}
              <template v-if="record.paths[0]"> · {{ record.paths[0].path }}</template>
              <template v-if="record.paths.length > 1"> +{{ record.paths.length - 1 }}</template>
            </span>
            <span class="HomePreview-Detail">
              {{ timeFormat.format(record.timestamp) }} ·
              <span class="HomePreviewReview-Status" :class="STATUS_TONE[record.status]">
                {{ t(`home.workspace.review.status.${record.status}`) }}
              </span>
            </span>
          </span>
        </button>

        <p v-if="record.reason" class="HomePreviewReview-Reason">
          {{ t(`home.workspace.review.reason.${record.reason}`) }}
        </p>

        <div v-if="detail?.id === record.id" class="HomePreviewReview-Detail">
          <div v-for="entry in detail.paths" :key="entry.path" class="HomePreviewReview-Path">
            <p class="HomePreviewReview-PathName" :title="entry.path">{{ entry.path }}</p>
            <dl class="HomePreviewReview-Sides">
              <div>
                <dt>{{ t('home.workspace.review.before') }}</dt>
                <dd>
                  {{ sideSummary(entry.before) }}
                  <code v-if="shortHash(entry.before.hash)" :title="entry.before.hash">{{
                    shortHash(entry.before.hash)
                  }}</code>
                </dd>
              </div>
              <div>
                <dt>{{ t('home.workspace.review.after') }}</dt>
                <dd>
                  {{ sideSummary(entry.after) }}
                  <code v-if="shortHash(entry.after.hash)" :title="entry.after.hash">{{
                    shortHash(entry.after.hash)
                  }}</code>
                </dd>
              </div>
            </dl>
            <p v-if="entry.reason" class="HomePreviewReview-Reason">
              {{ t(`home.workspace.review.reason.${entry.reason}`) }}
            </p>

            <template v-if="entry.diff">
              <p v-if="entry.diff.binary" class="HomePreviewReview-Reason">
                {{ t('home.workspace.review.reason.binary') }}
              </p>
              <p v-else-if="entry.diff.tooLarge" class="HomePreviewReview-Reason">
                {{ t('home.workspace.review.reason.too_large') }}
              </p>
              <template v-else>
                <p
                  v-if="entry.diff.additions !== undefined || entry.diff.deletions !== undefined"
                  class="HomePreviewReview-Counts"
                >
                  <span v-if="entry.diff.additions !== undefined" class="is-add"
                    >+{{ entry.diff.additions }}</span
                  >
                  <span v-if="entry.diff.deletions !== undefined" class="is-del"
                    >−{{ entry.diff.deletions }}</span
                  >
                </p>
                <div
                  class="HomePreviewReview-Diff"
                  role="group"
                  :aria-label="t('home.workspace.review.diff', { path: entry.path })"
                >
                  <template v-for="(hunk, hunkIndex) in entry.diff.hunks" :key="hunkIndex">
                    <div class="HomePreviewReview-Hunk">{{ hunk.header }}</div>
                    <div
                      v-for="(line, lineIndex) in hunk.lines"
                      :key="lineIndex"
                      class="HomePreviewReview-Line"
                      :class="`is-${line.type}`"
                    >
                      <span class="HomePreviewReview-Sign" aria-hidden="true">{{
                        line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
                      }}</span>
                      <span class="sr-only">{{
                        t(`home.workspace.review.line.${line.type}`)
                      }}</span>
                      <span>{{ line.text }}</span>
                    </div>
                  </template>
                </div>
                <p v-if="entry.diff.truncated" class="HomePreviewReview-Reason">
                  {{ t('home.workspace.review.reason.diff_limit') }}
                </p>
              </template>
            </template>
          </div>
        </div>
        <p
          v-else-if="detailLoading && openingId === record.id"
          class="HomePreviewReview-Reason"
          role="status"
        >
          {{ t('home.workspace.review.loadingDiff') }}
        </p>

        <div class="HomePreviewReview-Actions">
          <p
            v-if="outcomeFor(record)"
            class="HomePreviewReview-Outcome"
            :class="{ 'is-danger': !outcomeFor(record)!.ok }"
            role="status"
          >
            {{ outcomeText(outcomeFor(record)!) }}
          </p>
          <TxButton
            v-if="canRollback(record)"
            :variant="confirming === record.id ? 'danger' : 'secondary'"
            size="sm"
            :loading="rollingBack === record.id"
            :disabled="rollingBack !== null"
            @click="requestRollback(record)"
          >
            {{
              confirming === record.id
                ? t('home.workspace.review.confirmUndo')
                : t('home.workspace.review.undo')
            }}
          </TxButton>
        </div>
      </li>
    </ol>
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewReview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.HomePreviewReview-Boundary {
  margin: 0;
  padding: 0 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.HomePreviewReview-List {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.HomePreviewReview-Item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--shell-border);
}

.HomePreviewReview-Head {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomePreviewReview-Icon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-secondary);
  font-size: 14px;
}

.HomePreviewReview-Text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomePreviewReview-Status {
  &.is-warning {
    color: var(--shell-warning);
  }

  &.is-danger {
    color: var(--shell-danger);
  }

  &.is-done {
    color: var(--shell-primary);
  }
}

.HomePreviewReview-Reason,
.HomePreviewReview-Outcome {
  margin: 0;
  padding: 0 8px;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;

  &.is-danger {
    color: var(--shell-danger);
  }
}

.HomePreviewReview-Detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 8px;
}

.HomePreviewReview-Path {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.HomePreviewReview-PathName {
  margin: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: var(--shell-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomePreviewReview-Sides {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0;

  dt {
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
  }

  dd {
    margin: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-caption);
    overflow-wrap: anywhere;
  }

  code {
    display: block;
    color: var(--shell-text-muted);
    font-size: 0.9em;
  }
}

.HomePreviewReview-Counts {
  display: flex;
  gap: 8px;
  margin: 0;
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;

  .is-add {
    color: var(--shell-success);
  }

  .is-del {
    color: var(--shell-danger);
  }
}

.HomePreviewReview-Diff {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.HomePreviewReview-Hunk {
  padding: 2px 8px;
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
}

.HomePreviewReview-Line {
  display: flex;
  gap: 6px;
  padding: 0 8px;
  white-space: pre;

  &.is-add {
    background: var(--shell-success-soft);
  }

  &.is-del {
    background: var(--shell-danger-soft);
  }
}

.HomePreviewReview-Sign {
  flex: none;
  width: 1ch;
  color: var(--shell-text-muted);
}

.HomePreviewReview-Actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px;

  .HomePreviewReview-Outcome {
    flex: 1;
    padding: 0;
  }
}

.HomePreviewReview-State {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 8px;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
}

.HomePreviewReview-Link {
  flex: none;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-primary);
  font: inherit;
  cursor: pointer;
}

.HomePreviewReview-SkeletonRow {
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px 6px 30px;
}

.HomePreviewReview-SkeletonLine {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 70%;
  height: 1lh;
  font-size: var(--shell-fs-sm);

  &.is-short {
    width: 45%;
    font-size: var(--shell-fs-caption);
  }
}
</style>
