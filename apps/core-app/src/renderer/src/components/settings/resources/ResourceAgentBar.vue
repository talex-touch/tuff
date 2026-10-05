<script setup lang="ts">
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import type { FilterChipItem } from '@talex-touch/tuffex/filter-chips'
import type { AgentCount } from './agent-registry'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentGlyph from './AgentGlyph.vue'

/**
 * The line over a local-resource list: how much of it Tuff runs, and one chip per agent on this
 * machine with how many of the rows it holds. A chip filters the list to that agent; the same chip
 * again shows everything.
 *
 * `placeholder` draws the loading skeleton of the bar in the same boxes: a summary line and a chip
 * row with the chips' own padding, so the list under it does not move when the counts land.
 */
defineOptions({ name: 'ResourceAgentBar' })

const props = withDefaults(
  defineProps<{
    /** Agents holding at least one row, most first. */
    agents?: readonly AgentCount[]
    /** Rows switched on in Tuff. */
    enabled?: number
    /** Every row on the page, filter or not. */
    total?: number
    /** The agent the list is filtered to; `null` shows every row. */
    modelValue?: AiAgentId | null
    disabled?: boolean
    /** Draw the loading skeleton of the bar. */
    placeholder?: boolean
    /** Placeholder only: how many chips to reserve. */
    placeholderChips?: number
  }>(),
  {
    agents: () => [],
    enabled: 0,
    total: 0,
    modelValue: null,
    disabled: false,
    placeholder: false,
    placeholderChips: 3
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: AiAgentId | null]
}>()

const { t } = useI18n()

const chipItems = computed<FilterChipItem[]>(() =>
  props.agents.map((agent) => ({ value: agent.agentId, label: agent.label, count: agent.count }))
)

/**
 * The single writer of the filter.
 *
 * `TxFilterChips` never reports a click on the chip that is already active, so "the same chip again
 * clears it" cannot come from its `update:modelValue`. This listener runs in the capture phase,
 * before the chip's own, and decides both directions from the state as it was when the click
 * landed. The chips' own event is deliberately not bound: on a real click the browser runs a
 * microtask checkpoint between the two listeners, Vue re-renders in it, and a second writer would
 * then see the chip as inactive and select it straight back. Keyboard activation (Enter, Space)
 * arrives as a click on the chip, so it takes the same path.
 */
function onChipClick(event: MouseEvent): void {
  if (props.disabled) return
  const target = event.target
  if (!(target instanceof Element)) return
  const chip = target.closest('button')
  if (!chip || chip.disabled) return
  const agentId = chip.querySelector('[data-agent-chip]')?.getAttribute('data-agent-chip')
  if (!agentId) return
  emit('update:modelValue', props.modelValue === agentId ? null : agentId)
}

// A rescan can drop the agent the list is filtered to; an empty list behind a chip nobody can see
// would look like the page losing every row.
watch(
  () => props.agents,
  (agents) => {
    if (props.modelValue && !agents.some((agent) => agent.agentId === props.modelValue))
      emit('update:modelValue', null)
  }
)
</script>

<template>
  <div
    v-if="placeholder"
    class="ResourceAgentBar is-placeholder"
    aria-hidden="true"
    data-agent-bar-placeholder="true"
  >
    <div class="ResourceAgentBar-Summary ResourceAgentBar-Line">
      <TxSkeleton :width="112" height="0.9em" :radius="4" />
    </div>
    <div class="ResourceAgentBar-Chips">
      <!-- The chip row's own box: `TxFilterChips` pads and offsets its chips exactly so. -->
      <div class="ResourceAgentBar-ChipsPlaceholder">
        <TxSkeleton
          v-for="index in placeholderChips"
          :key="index"
          :width="96"
          :height="26"
          :radius="999"
        />
      </div>
    </div>
  </div>

  <div v-else class="ResourceAgentBar">
    <!--
      Inline text with real spaces, not a flex row: a flex container drops whitespace-only text, and
      the sentence would then be read as "已启用3/ 12".
    -->
    <p class="ResourceAgentBar-Summary">
      <span class="ResourceAgentBar-SummaryLabel">{{ t('settings.resources.enabledLabel') }}</span
      >{{ ' ' }}<strong>{{ enabled }}</strong
      >{{ ' ' }}<span class="ResourceAgentBar-SummaryTotal">/ {{ total }}</span>
    </p>

    <div v-if="chipItems.length > 0" class="ResourceAgentBar-Chips" @click.capture="onChipClick">
      <TxFilterChips
        :model-value="modelValue ?? undefined"
        :items="chipItems"
        :disabled="disabled"
        :aria-label="t('settings.resources.agentFilterLabel')"
      >
        <template #chip="{ item }">
          <span class="ResourceAgentBar-Chip" :data-agent-chip="item.value">
            <AgentGlyph :agent-id="String(item.value)" :label="item.label" :size="14" />
            <span class="tx-bui-filter-chips__label">{{ item.label }}</span>
            <span class="tx-bui-filter-chips__count">{{ item.count }}</span>
          </span>
        </template>
      </TxFilterChips>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ResourceAgentBar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--shell-space-3) var(--shell-space-5);
  min-width: 0;

  &.is-placeholder {
    --tx-skeleton-base-color: var(--shell-surface-2);
  }
}

.ResourceAgentBar-Line {
  display: flex;
  align-items: center;
  height: 1lh;
}

.ResourceAgentBar-ChipsPlaceholder {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 -4px 4px;
  padding: 4px;
}

.ResourceAgentBar-Summary {
  flex: none;
  margin: 0;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-body);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  strong {
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-md);
    font-weight: 600;
  }
}

.ResourceAgentBar-SummaryTotal {
  color: var(--shell-text-secondary);
}

/*
 * The chips take the rest of the summary's line and wrap onto further lines within it: every agent
 * stays in view. A row that scrolled sideways instead hid half of twelve agents at the 1100px window
 * minimum, behind a scroll nothing announced. `TxFilterChips` keeps its own padding, so focus rings
 * and the active fill — placed by each chip's offsets, line included — still have room.
 */
.ResourceAgentBar-Chips {
  min-width: 0;
  flex: 1 1 240px;

  :deep(.tx-bui-filter-chips) {
    flex-wrap: wrap;
    overflow: visible;
  }
}

.ResourceAgentBar-Chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
