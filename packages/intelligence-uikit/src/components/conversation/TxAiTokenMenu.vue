<script setup lang="ts">
import type { PromptBarCommand, PromptBarMenuKind, PromptBarSource } from '@talex-touch/tuffex/prompt-bar'
import { nextTick, ref, watch } from 'vue'

export type TxAiTokenMenuRow = PromptBarSource | PromptBarCommand

defineOptions({ name: 'TxAiTokenMenu' })

const props = withDefaults(defineProps<{
  menu: PromptBarMenuKind | null
  rows: TxAiTokenMenuRow[]
  activeIndex: number
  engaged?: boolean
  placement?: 'top' | 'bottom'
  sourcesHint?: string
  commandsHint?: string
  noMatches?: string
  connectLabel?: string
  connectedLabel?: string
}>(), {
  engaged: true,
  placement: 'top',
  sourcesHint: 'Sources & files',
  commandsHint: 'Slash commands',
  noMatches: 'No matches',
  connectLabel: 'Connect',
  connectedLabel: 'Connected',
})

const emit = defineEmits<{
  select: [row: TxAiTokenMenuRow]
  engage: [index: number]
}>()

const itemRefs = ref<HTMLElement[]>([])

function isSourceRow(row: TxAiTokenMenuRow): row is PromptBarSource {
  return 'attach' in row || 'connectable' in row || 'connected' in row
}

watch(
  () => [props.menu, props.activeIndex, props.engaged] as const,
  async ([menu, index, engaged]) => {
    if (!menu || !engaged)
      return
    await nextTick()
    const el = itemRefs.value[index]
    if (el && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <div
    v-if="menu"
    class="tx-ai-token-menu"
    :class="`is-${placement}`"
    role="listbox"
    :aria-label="menu === 'at' ? sourcesHint : commandsHint"
  >
    <div class="tx-ai-token-menu__header">
      {{ menu === 'at' ? sourcesHint : commandsHint }}
    </div>
    <div v-if="!rows.length" class="tx-ai-token-menu__empty">
      {{ noMatches }}
    </div>
    <button
      v-for="(row, index) in rows"
      v-else
      :key="row.key"
      ref="itemRefs"
      type="button"
      role="option"
      class="tx-ai-token-menu__option"
      :class="{ 'is-active': engaged && index === activeIndex }"
      :aria-selected="engaged && index === activeIndex ? 'true' : 'false'"
      @mouseenter="emit('engage', index)"
      @mousedown.prevent
      @click="emit('select', row)"
    >
      <span class="tx-ai-token-menu__name">{{ row.name }}</span>
      <span v-if="row.desc" class="tx-ai-token-menu__desc">{{ row.desc }}</span>
      <span
        v-if="isSourceRow(row) && row.connectable"
        class="tx-ai-token-menu__badge"
        :class="{ 'is-connected': row.connected }"
      >
        {{ row.connected ? connectedLabel : connectLabel }}
      </span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.tx-ai-token-menu {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--tx-border-color-light, #e2e8f0);
  border-radius: 14px;
  background: var(--tx-bg-color-overlay, #ffffff);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);

  &.is-top {
    bottom: calc(100% + 8px);
  }

  &.is-bottom {
    top: calc(100% + 8px);
  }
}

.tx-ai-token-menu__header {
  padding: 4px 8px 6px;
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.tx-ai-token-menu__empty {
  padding: 10px 8px;
  color: var(--tx-text-color-placeholder, #94a3b8);
  font-size: 12px;
}

.tx-ai-token-menu__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-primary, #0f172a);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &.is-active,
  &:hover {
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.14));
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: -2px;
  }
}

.tx-ai-token-menu__name {
  flex: none;
  font-weight: 500;
}

.tx-ai-token-menu__desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 12px;
}

.tx-ai-token-menu__badge {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.16));
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 11px;

  &.is-connected {
    background: var(--tx-color-success-light-9, rgba(34, 197, 94, 0.12));
    color: var(--tx-color-success, #16a34a);
  }
}
</style>
