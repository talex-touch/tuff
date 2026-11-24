<script lang="ts" name="HomeWorkspaceQueue" setup>
import type {
  ConversationWorkspaceStatus,
  WorkspaceQueueDeliveryMode,
  WorkspaceQueuedInput
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { IntelligenceMessageAttachment } from '@talex-touch/utils/types/intelligence'
import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { WorkspaceQueueAction } from '~/modules/conversation/useAgentWorkspace'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxModal } from '@talex-touch/tuffex/modal'
import { toModelAttachments } from '~/modules/conversation/attachment-payload'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

/**
 * Main's pending steer & follow-up inputs for this conversation, stacked as a narrower card
 * tucked cleanly behind the composer.
 *
 * - `deliveryMode === 'steer'` items are synced into the active agent run and injected at the next
 *   tool/step boundary (falling back to the front of the next-turn queue if the run ends or pauses).
 * - Ordinary queued items follow TurnQueue rules: promoted rows run before ordinary rows in
 *   promotion order, ordinary rows keep arrival order.
 * - A held queue (after Stop, failure or restart) stays visible with its reason and resumes only
 *   on explicit Continue.
 */
const props = withDefaults(
  defineProps<{
    items: WorkspaceQueuedInput[]
    status: ConversationWorkspaceStatus
    held: boolean
    limit: number
    pending: { queueId: string; action: WorkspaceQueueAction } | null
    resuming: boolean
    /** Active Agent run can accept mid-turn steer delivery at the next tool/step boundary. */
    canSteer?: boolean
  }>(),
  { canSteer: false }
)

const emit = defineEmits<{
  (event: 'action', queueId: string, action: WorkspaceQueueAction): void
  (
    event: 'update',
    queueId: string,
    text: string,
    attachments?: IntelligenceMessageAttachment[],
    keptAttachmentIds?: string[]
  ): void
  (event: 'mode', queueId: string, deliveryMode: WorkspaceQueueDeliveryMode): void
  (event: 'recall', item: WorkspaceQueuedInput): void
  (event: 'resume'): void
}>()

const { t } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const steerCount = computed(
  () => props.items.filter((item) => item.deliveryMode === 'steer').length
)

const promotedCount = computed(
  () => props.items.filter((item) => item.priority === 'promoted').length
)

const deliveryTimingHint = computed(() => {
  if (heldReason.value) return null
  if (props.canSteer && steerCount.value > 0) return t('home.workspace.queue.steerTiming')
  return t('home.workspace.queue.queueTiming')
})

function isSteer(item: WorkspaceQueuedInput): boolean {
  return item.deliveryMode === 'steer'
}

defineExpose({ el: rootRef })

watch(
  () => props.items.length,
  async (newLen, oldLen) => {
    if (newLen > oldLen) {
      await nextTick()
      listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
    }
  }
)
/** Why the queue is not draining, in the words of the state Main reported. */
const heldReason = computed(() => {
  if (!props.held) return null
  switch (props.status) {
    case 'interrupted':
      return t('home.workspace.queue.heldInterrupted')
    case 'failed':
      return t('home.workspace.queue.heldFailed')
    case 'cancelled':
      return t('home.workspace.queue.heldStopped')
    case 'pending_approval':
      return t('home.workspace.queue.heldApproval')
    default:
      return t('home.workspace.queue.held')
  }
})

const canResume = computed(
  () => props.held && props.status !== 'running' && props.status !== 'pending_approval'
)

function isPromoted(item: WorkspaceQueuedInput): boolean {
  return item.priority === 'promoted'
}

/** Ordinary rows move within the ordinary run only; the promoted head is not theirs to cross. */
function canMove(item: WorkspaceQueuedInput, direction: 'up' | 'down'): boolean {
  if (isPromoted(item)) return false
  const index = props.items.indexOf(item)
  if (direction === 'up') return index > promotedCount.value
  return index < props.items.length - 1
}

function isPending(item: WorkspaceQueuedInput, action?: WorkspaceQueueAction): boolean {
  return (
    props.pending?.queueId === item.id && (action === undefined || props.pending.action === action)
  )
}

function act(item: WorkspaceQueuedInput, action: WorkspaceQueueAction): void {
  if (props.pending) return
  if ((action === 'up' || action === 'down') && !canMove(item, action)) return
  if (action === 'promote' && isPromoted(item)) return
  emit('action', item.id, action)
}

/** Alt+↑/↓ reorders the focused row, Delete removes it — the list stays usable without a pointer. */
function onRowKeydown(event: KeyboardEvent, item: WorkspaceQueuedInput): void {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    act(item, event.key === 'ArrowUp' ? 'up' : 'down')
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    act(item, 'remove')
  }
}

const editingItem = ref<WorkspaceQueuedInput | null>(null)
const editText = ref('')
const editKeptAttachmentIds = ref<string[]>([])
const editNewAttachments = ref<AiAttachment[]>([])
const editFileInputRef = ref<HTMLInputElement | null>(null)
const savingEdit = ref(false)

const keptAttachments = computed(() => {
  if (!editingItem.value) return []
  return (editingItem.value.attachments ?? []).filter((att) =>
    editKeptAttachmentIds.value.includes(att.id)
  )
})

function openEdit(item: WorkspaceQueuedInput): void {
  editingItem.value = item
  editText.value = item.text
  editKeptAttachmentIds.value = (item.attachments ?? []).map((att) => att.id)
  clearNewAttachments()
}

function clearNewAttachments(): void {
  for (const item of editNewAttachments.value) {
    if (item.kind === 'image' && item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url)
    }
  }
  editNewAttachments.value = []
}

function cancelEdit(): void {
  clearNewAttachments()
  editingItem.value = null
  editText.value = ''
  editKeptAttachmentIds.value = []
}

function removeKeptAttachment(id: string): void {
  editKeptAttachmentIds.value = editKeptAttachmentIds.value.filter((i) => i !== id)
}

function removeNewAttachment(index: number): void {
  const [removed] = editNewAttachments.value.splice(index, 1)
  if (removed?.kind === 'image' && removed.url.startsWith('blob:')) {
    URL.revokeObjectURL(removed.url)
  }
}

function onEditFilePick(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  input.value = ''

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const url = URL.createObjectURL(file)
    editNewAttachments.value.push({
      id: crypto.randomUUID(),
      kind: 'image',
      name: file.name,
      url
    })
  }
}

async function saveEdit(): Promise<void> {
  if (!editingItem.value) return
  const text = editText.value.trim()
  if (!text) return

  savingEdit.value = true
  try {
    const newAttachmentsPayload = editNewAttachments.value.length
      ? await toModelAttachments(editNewAttachments.value)
      : undefined
    emit('update', editingItem.value.id, text, newAttachmentsPayload, editKeptAttachmentIds.value)
    toast.success(t('home.workspace.queue.updated'))
    cancelEdit()
  } catch {
    toast.error(t('home.workspace.queue.updateFailed'))
  } finally {
    savingEdit.value = false
  }
}
</script>

<template>
  <section
    ref="rootRef"
    class="HomeWorkspaceQueue"
    :class="{ 'is-held': held, 'has-steer': canSteer && steerCount > 0 }"
    :aria-label="t('home.workspace.queue.title')"
  >
    <header class="HomeWorkspaceQueue-Head">
      <span class="HomeWorkspaceQueue-Title">
        <span
          :class="
            held
              ? 'i-ri-pause-circle-line'
              : canSteer && steerCount > 0
                ? 'i-ri-corner-down-right-line'
                : 'i-ri-play-list-2-line'
          "
          class="HomeWorkspaceQueue-HeadIcon"
          aria-hidden="true"
        />
        <span v-if="canSteer && steerCount > 0" class="HomeWorkspaceQueue-SteerSummary">
          {{ t('home.workspace.queue.steerCount', { count: steerCount }) }}
        </span>
        <span class="HomeWorkspaceQueue-Count">
          {{ t('home.workspace.queue.count', { count: items.length, max: limit }) }}
        </span>
      </span>
      <span v-if="heldReason" class="HomeWorkspaceQueue-Held" role="status">{{ heldReason }}</span>
      <span v-else-if="deliveryTimingHint" class="HomeWorkspaceQueue-Timing">
        {{ deliveryTimingHint }}
      </span>
      <button
        v-if="canResume"
        class="HomeWorkspaceQueue-Resume"
        type="button"
        :aria-busy="resuming || undefined"
        :disabled="resuming"
        @click="emit('resume')"
      >
        <span class="i-ri-play-line" aria-hidden="true" />
        <span>{{ t('home.workspace.queue.resume') }}</span>
      </button>
    </header>

    <TransitionGroup
      v-if="items.length"
      ref="listRef"
      tag="ol"
      name="queue-row"
      class="HomeWorkspaceQueue-List"
    >
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="HomeWorkspaceQueue-Row"
        :class="{ 'is-pending': isPending(item), 'is-steer': isSteer(item) }"
        tabindex="0"
        :aria-label="t('home.workspace.queue.rowLabel', { position: index + 1, text: item.text })"
        :aria-keyshortcuts="'Alt+ArrowUp Alt+ArrowDown Delete'"
        @keydown="onRowKeydown($event, item)"
      >
        <span class="HomeWorkspaceQueue-Position" aria-hidden="true">
          <span v-if="isSteer(item)" class="HomeWorkspaceQueue-Steer">
            {{ t('home.workspace.queue.steerBadge') }}
          </span>
          <span v-else-if="isPromoted(item)" class="HomeWorkspaceQueue-Next">
            {{ t('home.workspace.queue.next') }}
          </span>
          <span v-else>{{ index + 1 }}</span>
        </span>
        <span class="HomeWorkspaceQueue-Body">
          <span class="HomeWorkspaceQueue-Text">{{ item.text }}</span>
          <div v-if="item.attachments?.length" class="HomeWorkspaceQueue-ThumbList">
            <div
              v-for="att in item.attachments"
              :key="att.id"
              class="HomeWorkspaceQueue-ThumbItem"
              :title="att.name ?? 'attachment'"
            >
              <img
                v-if="att.previewUrl"
                :src="att.previewUrl"
                :alt="att.name ?? 'attachment'"
                class="HomeWorkspaceQueue-ThumbImg"
              />
              <span v-else class="i-ri-image-line" />
            </div>
            <span class="HomeWorkspaceQueue-ThumbCount">
              {{ t('home.workspace.queue.attachments', { count: item.attachments.length }) }}
            </span>
          </div>
        </span>
        <span class="HomeWorkspaceQueue-Actions">
          <button
            v-if="canSteer"
            class="HomeWorkspaceQueue-Btn"
            :class="{ 'is-steer-active': isSteer(item) }"
            type="button"
            :aria-label="
              isSteer(item)
                ? t('home.workspace.queue.switchToQueue')
                : t('home.workspace.queue.switchToSteer')
            "
            :title="
              isSteer(item)
                ? t('home.workspace.queue.switchToQueue')
                : t('home.workspace.queue.switchToSteer')
            "
            :disabled="pending !== null"
            @click.stop="emit('mode', item.id, isSteer(item) ? 'queue' : 'steer')"
          >
            <span
              :class="isSteer(item) ? 'i-ri-play-list-2-line' : 'i-ri-corner-down-right-line'"
            />
          </button>
          <button
            v-if="!item.attachments?.length"
            class="HomeWorkspaceQueue-Btn"
            type="button"
            :aria-label="t('home.workspace.queue.recall')"
            :title="t('home.workspace.queue.recall')"
            :disabled="pending !== null"
            @click.stop="emit('recall', item)"
          >
            <span class="i-ri-arrow-go-back-line" />
          </button>
          <button
            class="HomeWorkspaceQueue-Btn"
            type="button"
            :aria-label="t('home.workspace.queue.edit')"
            :title="t('home.workspace.queue.edit')"
            :disabled="pending !== null"
            @click.stop="openEdit(item)"
          >
            <span class="i-ri-edit-line" />
          </button>
          <button
            v-if="items.length > 1 && !isSteer(item)"
            class="HomeWorkspaceQueue-Btn"
            type="button"
            :aria-label="t('home.workspace.queue.promote')"
            :title="t('home.workspace.queue.promote')"
            :disabled="isPromoted(item) || pending !== null"
            @click="act(item, 'promote')"
          >
            <span class="i-ri-skip-up-line" />
          </button>
          <button
            v-if="items.length > 1 && !isPromoted(item)"
            class="HomeWorkspaceQueue-Btn"
            type="button"
            tabindex="-1"
            :aria-label="t('home.workspace.queue.up')"
            :title="t('home.workspace.queue.up')"
            :disabled="!canMove(item, 'up') || pending !== null"
            @click="act(item, 'up')"
          >
            <span class="i-ri-arrow-up-s-line" />
          </button>
          <button
            v-if="items.length > 1 && !isPromoted(item)"
            class="HomeWorkspaceQueue-Btn"
            type="button"
            tabindex="-1"
            :aria-label="t('home.workspace.queue.down')"
            :title="t('home.workspace.queue.down')"
            :disabled="!canMove(item, 'down') || pending !== null"
            @click="act(item, 'down')"
          >
            <span class="i-ri-arrow-down-s-line" />
          </button>
          <button
            class="HomeWorkspaceQueue-Btn is-danger"
            type="button"
            tabindex="-1"
            :aria-label="t('common.delete')"
            :title="t('common.delete')"
            :disabled="pending !== null"
            @click.stop="act(item, 'remove')"
          >
            <span
              :class="
                isPending(item, 'remove')
                  ? 'i-ri-loader-4-line is-spinning'
                  : 'i-ri-delete-bin-line'
              "
            />
          </button>
        </span>
      </li>
    </TransitionGroup>
    <!-- Edit Modal Dialog -->
    <TxModal
      :model-value="editingItem !== null"
      :title="t('home.workspace.queue.editTitle')"
      :close-label="t('common.close')"
      width="560px"
      @update:model-value="cancelEdit"
    >
      <div class="HomeWorkspaceQueue-EditDialog">
        <textarea
          v-model="editText"
          class="HomeWorkspaceQueue-EditText"
          rows="4"
          :placeholder="t('home.workspace.queue.editPlaceholder')"
          autofocus
        />

        <div class="HomeWorkspaceQueue-EditAttachments">
          <!-- Existing attachments with remove button -->
          <div
            v-for="att in keptAttachments"
            :key="att.id"
            class="HomeWorkspaceQueue-EditThumb"
            :title="att.name"
          >
            <img
              v-if="att.previewUrl"
              :src="att.previewUrl"
              :alt="att.name"
              class="HomeWorkspaceQueue-ThumbImg"
            />
            <button
              class="HomeWorkspaceQueue-EditThumbRemove"
              type="button"
              :title="t('home.attachRemove')"
              @click="removeKeptAttachment(att.id)"
            >
              <span class="i-ri-close-line" />
            </button>
          </div>

          <!-- Newly added attachments -->
          <div
            v-for="(att, idx) in editNewAttachments"
            :key="att.id"
            class="HomeWorkspaceQueue-EditThumb"
            :title="att.name"
          >
            <img
              v-if="att.kind === 'image' && att.url"
              :src="att.url"
              :alt="att.name"
              class="HomeWorkspaceQueue-ThumbImg"
            />
            <button
              class="HomeWorkspaceQueue-EditThumbRemove"
              type="button"
              :title="t('home.attachRemove')"
              @click="removeNewAttachment(idx)"
            >
              <span class="i-ri-close-line" />
            </button>
          </div>

          <!-- Add image button -->
          <button
            class="HomeWorkspaceQueue-EditAddBtn"
            type="button"
            :title="t('home.attach')"
            @click="editFileInputRef?.click()"
          >
            <span class="i-ri-image-add-line" />
            <span>{{ t('home.workspace.queue.addImage') }}</span>
          </button>
          <input
            ref="editFileInputRef"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            style="display: none"
            @change="onEditFilePick"
          />
        </div>
      </div>

      <template #footer>
        <div class="HomeWorkspaceQueue-EditFooter">
          <TxButton variant="flat" type="text" @click="cancelEdit">
            {{ t('common.cancel') }}
          </TxButton>
          <TxButton
            type="primary"
            :disabled="!editText.trim() || savingEdit"
            :loading="savingEdit"
            @click="saveEdit"
          >
            {{ t('common.save') }}
          </TxButton>
        </div>
      </template>
    </TxModal>
  </section>
</template>

<style lang="scss" scoped>
.HomeWorkspaceQueue {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  // Slightly narrower than the composer in front so it reads as a layered card tucked behind it.
  width: calc(var(--home-chat-lane-width) - 44px);
  min-width: 0;
  margin: 0 auto -16px auto;
  padding: 8px 12px 22px 12px;
  border: 1px solid color-mix(in srgb, var(--shell-border) 90%, transparent);
  border-bottom: none;
  border-radius: 18px 18px 0 0;
  background: color-mix(in srgb, var(--shell-surface) 90%, var(--shell-bg));
  box-shadow:
    0 -2px 12px color-mix(in srgb, var(--shell-shadow) 45%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 6%, transparent);
  box-sizing: border-box;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  pointer-events: auto;

  &.has-steer {
    border-color: color-mix(in srgb, var(--shell-primary) 34%, var(--shell-border));
  }

  &.is-held {
    border-color: var(--shell-warning-border);
  }
}

.HomeWorkspaceQueue-Head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
  padding: 0 4px;
}

.HomeWorkspaceQueue-Title {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.HomeWorkspaceQueue-HeadIcon {
  font-size: 13px;
  color: var(--shell-text-secondary);
}

.has-steer .HomeWorkspaceQueue-HeadIcon {
  color: var(--shell-primary);
}

.is-held .HomeWorkspaceQueue-HeadIcon {
  color: var(--shell-warning);
}

.HomeWorkspaceQueue-SteerSummary {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
  font-size: 11px;
  font-weight: 500;
}

.HomeWorkspaceQueue-Count {
  color: var(--shell-text-secondary);
}

.HomeWorkspaceQueue-Timing {
  margin-left: auto;
  color: var(--shell-text-muted);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}

.HomeWorkspaceQueue-Held {
  flex: 1;
  min-width: 0;
  color: var(--shell-text-regular);
  font-size: 11px;
  line-height: 1.3;
}

.HomeWorkspaceQueue-Resume {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  height: 20px;
  margin-left: auto;
  padding: 0 8px;
  border: 1px solid var(--shell-primary-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--shell-primary) 16%, transparent);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }
}

.HomeWorkspaceQueue-List {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 84px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: var(--shell-border) transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 2px;
    background: var(--shell-border);
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.queue-row-enter-active {
  transition:
    opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
    max-height 0.28s cubic-bezier(0.16, 1, 0.3, 1),
    padding 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.queue-row-leave-active {
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 1, 1),
    transform 0.2s cubic-bezier(0.4, 0, 1, 1),
    max-height 0.2s cubic-bezier(0.4, 0, 1, 1),
    padding 0.2s cubic-bezier(0.4, 0, 1, 1);
  overflow: hidden;
}

.queue-row-enter-from,
.queue-row-leave-to {
  opacity: 0;
  max-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  transform: translateY(6px);
}

.queue-row-enter-to,
.queue-row-leave-from {
  opacity: 1;
  max-height: 52px;
  transform: translateY(0);
}

.queue-row-move {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  .queue-row-enter-active,
  .queue-row-leave-active,
  .queue-row-move {
    transition: none;
  }
}

.HomeWorkspaceQueue-Row {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 2.5px 6px;
  border-radius: var(--shell-radius-sm);
  background: transparent;

  &:hover {
    background: var(--shell-surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }

  &.is-pending {
    opacity: 0.6;
  }
}

.HomeWorkspaceQueue-Position {
  flex: none;
  min-width: 16px;
  margin-top: 1px;
  color: var(--shell-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 1.35;
}

.HomeWorkspaceQueue-Steer {
  display: inline-block;
  padding: 0 5px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary);
  color: var(--shell-on-primary, #fff);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.5;
}

.HomeWorkspaceQueue-Next {
  display: inline-block;
  padding: 0 4px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
  font-size: 10px;
}

.HomeWorkspaceQueue-Body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomeWorkspaceQueue-Text {
  display: -webkit-box;
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-caption);
  line-height: 1.35;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.HomeWorkspaceQueue-Meta {
  display: flex;
  gap: 6px;
  color: var(--shell-text-muted);
  font-size: 11px;
}

.HomeWorkspaceQueue-Actions {
  display: flex;
  flex: none;
  gap: 1px;
  opacity: 0;

  .HomeWorkspaceQueue-Row:hover &,
  .HomeWorkspaceQueue-Row:focus-within & {
    opacity: 1;
  }
}

@media (hover: none) {
  .HomeWorkspaceQueue-Actions {
    opacity: 1;
  }
}

.HomeWorkspaceQueue-Btn {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-xs, 4px);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface);
    color: var(--shell-text-primary);
  }

  &.is-steer-active {
    color: var(--shell-primary);
  }

  &.is-danger:hover:not(:disabled) {
    color: var(--shell-danger);
  }

  &:disabled {
    cursor: default;
    opacity: 0.35;
  }
}

.is-spinning {
  animation: home-queue-spin 0.9s linear infinite;
}

@keyframes home-queue-spin {
  to {
    transform: rotate(360deg);
  }
}

.HomeWorkspaceQueue-ThumbList {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}

.HomeWorkspaceQueue-ThumbItem {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  overflow: hidden;
}

.HomeWorkspaceQueue-ThumbImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.HomeWorkspaceQueue-ThumbCount {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.HomeWorkspaceQueue-EditDialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.HomeWorkspaceQueue-EditText {
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface-1);
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: var(--shell-primary);
    box-shadow: 0 0 0 1px var(--shell-primary);
  }
}

.HomeWorkspaceQueue-EditAttachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.HomeWorkspaceQueue-EditThumb {
  position: relative;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface-2);
  overflow: hidden;

  &:hover .HomeWorkspaceQueue-EditThumbRemove {
    opacity: 1;
  }
}

.HomeWorkspaceQueue-EditThumbRemove {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s;

  &:hover {
    background: var(--shell-danger);
    opacity: 1;
  }
}

.HomeWorkspaceQueue-EditAddBtn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 56px;
  padding: 0 14px;
  border: 1px dashed var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);
  color: var(--shell-text-secondary);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--shell-primary);
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }
}

.HomeWorkspaceQueue-EditFooter {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
