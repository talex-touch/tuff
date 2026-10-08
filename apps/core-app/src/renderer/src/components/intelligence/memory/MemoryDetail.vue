<script lang="ts" setup>
import type { MemoryItem } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMemoryLabels } from './memory-labels'
import { memoryScopeEffect } from './memory-scope'

/**
 * One memory, read-only: its full content, what a reply actually receives from it, and where it
 * came from. Editing, enabling and deleting are requests to the page, which owns the list.
 *
 * Usage count and last-used time are left out on purpose: nothing in the app writes them, so
 * they would read "0" and "none" forever.
 */
const props = withDefaults(
  defineProps<{
    memory: MemoryItem
    toggling?: boolean
    deleting?: boolean
  }>(),
  { toggling: false, deleting: false }
)

const emit = defineEmits<{
  edit: []
  toggle: []
  delete: []
}>()

const { t } = useI18n()
const { typeLabel, scopeLabel, effectLabel, formatTimestamp } = useMemoryLabels()

const contentHeadingId = useId()
const injectionHeadingId = useId()
const sourceHeadingId = useId()

const effect = computed(() => memoryScopeEffect(props.memory))
const busy = computed(() => props.toggling || props.deleting)

/** Why this memory's scope does or does not let it reach a reply. */
const scopeNote = computed(() => {
  const { memory } = props
  if (effect.value === 'effective') return t('intelligence.memoryReview.injection.global')
  if (effect.value === 'source-session-only') {
    return t('intelligence.memoryReview.injection.sourceSession', {
      session: memory.sourceSessionId
    })
  }
  if (memory.scope === 'session') {
    return t('intelligence.memoryReview.injection.sessionWithoutSource')
  }
  return t('intelligence.memoryReview.injection.pendingScope', { scope: scopeLabel(memory.scope) })
})
</script>

<template>
  <TxScroll class="memory-detail" data-testid="memory-detail">
    <template #header>
      <header class="memory-detail__header">
        <div class="memory-detail__heading">
          <h2 class="memory-detail__title">
            {{ memory.summary }}
          </h2>
          <p class="memory-detail__meta">
            <span>{{ typeLabel(memory.type) }} · {{ scopeLabel(memory.scope) }}</span>
            <span
              v-if="!memory.enabled"
              class="memory-detail__chip"
              data-testid="memory-detail-disabled"
            >
              {{ t('intelligence.memoryReview.disabled') }}
            </span>
            <span
              v-if="effect !== 'effective'"
              class="memory-detail__chip"
              :class="`is-${effect}`"
              data-testid="memory-detail-effect"
            >
              {{ effectLabel(effect) }}
            </span>
          </p>
        </div>

        <div class="memory-detail__actions shell-chrome-safe-inline-end">
          <TxButton
            variant="flat"
            size="sm"
            :disabled="busy"
            :data-testid="`memory-review-edit-${memory.id}`"
            @click="emit('edit')"
          >
            <i class="i-carbon-edit" aria-hidden="true" />
            {{ t('intelligence.memoryReview.edit') }}
          </TxButton>
          <TxButton
            variant="flat"
            size="sm"
            :loading="toggling"
            :disabled="busy"
            :data-testid="`memory-review-toggle-${memory.id}`"
            @click="emit('toggle')"
          >
            <i :class="memory.enabled ? 'i-carbon-pause' : 'i-carbon-play'" aria-hidden="true" />
            {{
              memory.enabled
                ? t('intelligence.memoryReview.disable')
                : t('intelligence.memoryReview.enable')
            }}
          </TxButton>
          <TxButton
            variant="flat"
            type="danger"
            size="sm"
            :loading="deleting"
            :disabled="busy"
            :data-testid="`memory-review-delete-${memory.id}`"
            @click="emit('delete')"
          >
            <i class="i-carbon-trash-can" aria-hidden="true" />
            {{ t('intelligence.memoryReview.delete') }}
          </TxButton>
        </div>
      </header>
    </template>

    <div class="memory-detail__body">
      <section class="memory-detail__section" :aria-labelledby="contentHeadingId">
        <h3 :id="contentHeadingId">
          {{ t('intelligence.memoryReview.contentTitle') }}
        </h3>
        <p class="memory-detail__content">
          {{ memory.content }}
        </p>
      </section>

      <section
        class="memory-detail__section"
        :aria-labelledby="injectionHeadingId"
        data-testid="memory-detail-injection"
      >
        <h3 :id="injectionHeadingId">
          {{ t('intelligence.memoryReview.injectionTitle') }}
        </h3>
        <p class="memory-detail__note">
          {{ t('intelligence.memoryReview.injection.summary') }}
        </p>
        <blockquote class="memory-detail__summary">
          {{ memory.summary }}
        </blockquote>
        <p
          class="memory-detail__note"
          :class="{ 'is-inactive': effect === 'inactive' }"
          data-testid="memory-detail-scope-note"
        >
          {{ scopeNote }}
        </p>
        <p
          v-if="!memory.enabled"
          class="memory-detail__note is-inactive"
          data-testid="memory-detail-disabled-note"
        >
          {{ t('intelligence.memoryReview.injection.disabled') }}
        </p>
      </section>

      <section class="memory-detail__section" :aria-labelledby="sourceHeadingId">
        <h3 :id="sourceHeadingId">
          {{ t('intelligence.memoryReview.sourceTitle') }}
        </h3>
        <dl class="memory-detail__audit">
          <div>
            <dt>{{ t('intelligence.memoryReview.memoryId') }}</dt>
            <dd>{{ memory.id }}</dd>
          </div>
          <div>
            <dt>{{ t('intelligence.memoryReview.tags') }}</dt>
            <dd>
              {{
                memory.tags.length
                  ? memory.tags.join(', ')
                  : t('intelligence.memoryReview.notAvailable')
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t('intelligence.memoryReview.confidence') }}</dt>
            <dd>{{ Math.round(memory.confidence * 100) }}%</dd>
          </div>
          <div>
            <dt>{{ t('intelligence.memoryReview.privacy') }}</dt>
            <dd>{{ memory.privacyLevel }}</dd>
          </div>
          <div>
            <dt>{{ t('intelligence.memoryReview.sourceSession') }}</dt>
            <dd>{{ memory.sourceSessionId || t('intelligence.memoryReview.notAvailable') }}</dd>
          </div>
          <div>
            <dt>{{ t('intelligence.memoryReview.sourceTurn') }}</dt>
            <dd>{{ memory.sourceTurnId || t('intelligence.memoryReview.notAvailable') }}</dd>
          </div>
          <div>
            <dt>{{ t('intelligence.memoryReview.createdAt') }}</dt>
            <dd>{{ formatTimestamp(memory.createdAt) }}</dd>
          </div>
          <div>
            <dt>{{ t('intelligence.memoryReview.updatedAt') }}</dt>
            <dd>{{ formatTimestamp(memory.updatedAt) }}</dd>
          </div>
          <div v-if="memory.replacesMemoryId">
            <dt>{{ t('intelligence.memoryReview.replacesMemory') }}</dt>
            <dd>{{ memory.replacesMemoryId }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </TxScroll>
</template>

<style lang="scss" scoped>
.memory-detail {
  height: 100%;
  min-height: 0;
  // The pane's own width decides the layout: the window can be wide while the detail is narrow.
  container-type: inline-size;
}

.memory-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--shell-space-4);
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--shell-border);
  -webkit-app-region: drag;
}

.memory-detail__heading {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.memory-detail__title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-lg);
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.memory-detail__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.memory-detail__chip {
  padding: 0 8px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-info-soft);
  color: var(--shell-info);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  line-height: 18px;

  &.is-inactive {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }
}

.memory-detail__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--shell-space-2);
  -webkit-app-region: no-drag;
}

.memory-detail__body {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-5);
  padding: 20px 24px 32px;
}

.memory-detail__section {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);

  h3 {
    margin: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-md);
    font-weight: 600;
  }
}

.memory-detail__content {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.memory-detail__note {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
  line-height: 1.6;

  &.is-inactive {
    color: var(--shell-warning);
  }
}

.memory-detail__summary {
  margin: 0;
  padding: var(--shell-space-2) var(--shell-space-3);
  border-left: 3px solid var(--shell-border-strong);
  border-radius: 0 var(--shell-radius-sm) var(--shell-radius-sm) 0;
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-body);
  line-height: 1.6;
  overflow-wrap: anywhere;
  user-select: text;
}

.memory-detail__audit {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-3) var(--shell-space-4);
  margin: 0;

  div {
    min-width: 0;
  }

  dt,
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  dt {
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
  }

  dd {
    color: var(--shell-text-regular);
    font-size: var(--shell-fs-sm);
    user-select: text;
  }
}

@container (max-width: 560px) {
  .memory-detail__header {
    flex-direction: column;
  }

  .memory-detail__actions {
    justify-content: flex-start;
  }

  .memory-detail__audit {
    grid-template-columns: 1fr;
  }
}
</style>
