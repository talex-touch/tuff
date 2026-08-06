<script lang="ts" name="ShellConversationList" setup>
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { bucketConversations } from '~/modules/conversation/conversation-buckets'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import ShellNavGroup from './ShellNavGroup.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { conversations, loading, refresh, remove } = useConversationHistory()

onMounted(() => {
  void refresh()
})

/**
 * `Date.now()` is read inside the computed, so buckets re-slot whenever the
 * list itself changes — every persist triggers a refresh, and an idle sidebar
 * that misses midnight by minutes is corrected on the next send.
 */
const buckets = computed(() => bucketConversations(conversations.value, Date.now()))

const activeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))

/** Only the very first load gets a skeleton; refreshes keep the stale rows up. */
const showSkeleton = computed(() => loading.value && conversations.value.length === 0)

function open(id: string): void {
  if (activeId.value === id) return
  void router.push(`/home/c/${id}`)
}

async function removeConversation(id: string): Promise<void> {
  const wasActive = activeId.value === id
  try {
    await remove(id)
  } catch {
    // A failed delete is recoverable — the row simply stays. Taking the
    // sidebar down over it is not.
    return
  }
  // The route must not keep naming a thread that no longer exists — a reload
  // would try to restore it and land on a silent no-op.
  if (wasActive) await router.push('/home')
}
</script>

<template>
  <nav
    v-if="showSkeleton || buckets.length > 0"
    class="ShellConversationList"
    :aria-label="t('shell.history.label')"
  >
    <div v-if="showSkeleton" class="ShellConversationList-Skeleton" aria-hidden="true">
      <TxSkeleton :width="56" :height="9" :radius="3" />
      <TxSkeleton :lines="3" :height="28" :radius="8" :gap="4" />
    </div>

    <template v-else>
      <ShellNavGroup
        v-for="bucket in buckets"
        :key="bucket.key"
        :label="t(`shell.history.${bucket.key}`)"
      >
        <div
          v-for="item in bucket.items"
          :key="item.id"
          class="ShellConversationList-Row"
          :class="{ active: item.id === activeId }"
        >
          <button
            class="ShellConversationList-Open"
            type="button"
            :title="item.title || t('shell.history.untitled')"
            :aria-current="item.id === activeId ? 'page' : undefined"
            @click="open(item.id)"
          >
            {{ item.title || t('shell.history.untitled') }}
          </button>
          <button
            class="ShellConversationList-Remove"
            type="button"
            :title="t('shell.history.delete')"
            :aria-label="t('shell.history.delete')"
            @click.stop="removeConversation(item.id)"
          >
            <span class="i-ri-delete-bin-6-line" />
          </button>
        </div>
      </ShellNavGroup>
    </template>
  </nav>
</template>

<style lang="scss" scoped>
.ShellConversationList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  // Long histories scroll inside the list while 新建对话 above and 设置 below
  // stay pinned; `min-height: 0` is what lets a flex child shrink at all.
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;

  // The rail has no room for titles, and a column of anonymous dots would be
  // guesswork — history simply steps out until the sidebar is widened again.
  .is-rail & {
    display: none;
  }
}

.ShellConversationList-Skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  // Mirrors ShellNavGroup's label indent so the swap to real rows doesn't jump.
  padding: 8px 10px 4px;
}

.ShellConversationList-Row {
  display: flex;
  align-items: center;
  width: 100%;
  border-radius: var(--shell-radius-md);
  transition: background-color 0.15s ease;

  &:hover:not(.active) {
    background: var(--shell-surface-2);
  }

  &.active {
    background: var(--shell-primary-soft);
  }
}

.ShellConversationList-Open {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  padding: 6px 9px;
  border: none;
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  white-space: nowrap;
  text-align: left;
  text-overflow: ellipsis;
  cursor: pointer;
  -webkit-app-region: no-drag;

  .active & {
    color: var(--shell-primary);
    font-weight: 500;
  }
}

.ShellConversationList-Remove {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  cursor: pointer;
  // Hidden until the row is hovered or reached by keyboard, so the column
  // reads as titles, not as a stack of delete affordances.
  opacity: 0;
  transition:
    opacity 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  span {
    width: 13px;
    height: 13px;
    font-size: 13px;
  }

  &:hover {
    color: var(--shell-danger);
  }

  .ShellConversationList-Row:hover &,
  &:focus-visible {
    opacity: 1;
  }
}
</style>
