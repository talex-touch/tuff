<script setup lang="ts">
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import type { AgentRef } from './agent-registry'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { useResizeObserver } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentGlyph from './AgentGlyph.vue'
import { AGENT_STRIP_METRICS, agentBrand, agentStripWidth, foldAgentMarks } from './agent-registry'

/**
 * Which agents hold one item: every agent on the page, lit where the item is configured and dimmed
 * where it is not, in the agent bar's order so the columns line up from row to row.
 *
 * Compact: small marks set close together. When the row cannot give the strip room for all of them,
 * the marks that do not fit fold into a "+N" at the end — dimmed ones first, so an agent that holds
 * the item stays in view — and "+N" lists the folded agents, each with its state, on hover.
 *
 * Read-only attribution, never a control. The marks take no focus and no click — Tuff does not
 * write to an agent's configuration, so there is nothing for them to do — and the pointer passes
 * between them to whatever lies beneath. The hover notes are for the pointer; the sentence before
 * the marks says the same thing to assistive technology, folded agents included.
 */
defineOptions({ name: 'AgentIconRow' })

const props = defineProps<{
  /** Agents on the page, in display order; each gets a column whether or not it has the item. */
  agents: readonly AgentRef[]
  /** Agents whose own configuration holds the item. */
  configured: readonly AiAgentId[]
}>()

const { t, locale } = useI18n()

interface IconSlot {
  agentId: AiAgentId
  label: string
  configured: boolean
  tooltip: string
}

const configuredSet = computed(() => new Set<string>(props.configured))

/**
 * The page's agents plus any configured agent the page did not list. The second set is empty when
 * the presence comes from the same rows, as it does; it is there so a holder is never dropped.
 */
const slots = computed<IconSlot[]>(() => {
  const listed = new Set(props.agents.map((agent) => agent.agentId))
  const extra: AgentRef[] = props.configured
    .filter((agentId) => !listed.has(agentId))
    .map((agentId) => ({ agentId, label: agentBrand(agentId).label }))
  return [...props.agents, ...extra].map((agent) => {
    const label = agentBrand(agent.agentId, agent.label).label
    const configured = configuredSet.value.has(agent.agentId)
    return {
      agentId: agent.agentId,
      label,
      configured,
      tooltip: configured
        ? t('settings.resources.agentConfigured', { agent: label })
        : t('settings.resources.agentNotConfigured', { agent: label })
    }
  })
})

/**
 * The room the row gives the strip. The sizer asks for every mark whatever is shown, so this is the
 * row's answer to "all of them", never a measure of what folding left behind.
 */
const root = ref<HTMLElement | null>(null)
const width = ref<number | null>(null)
useResizeObserver(root, () => {
  width.value = root.value?.clientWidth || null
})

const fullWidth = computed(() => agentStripWidth(slots.value.length, AGENT_STRIP_METRICS))
const layout = computed(() => foldAgentMarks(slots.value, width.value, AGENT_STRIP_METRICS))

const stripStyle = computed(() => ({
  '--agent-strip-mark': `${AGENT_STRIP_METRICS.mark}px`,
  '--agent-strip-gap': `${AGENT_STRIP_METRICS.gap}px`,
  '--agent-strip-full': `${fullWidth.value}px`
}))

function joinNames(names: string[]): string {
  try {
    const tag = typeof locale?.value === 'string' ? locale.value : undefined
    return new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

/** One sentence for assistive technology; the marks themselves are hidden from it. */
const summary = computed(() => {
  const names = slots.value.filter((slot) => slot.configured).map((slot) => slot.label)
  return names.length > 0
    ? t('settings.resources.configuredBy', { agents: joinNames(names) })
    : t('settings.resources.configuredByNone')
})
</script>

<template>
  <div ref="root" class="AgentIconRow" :style="stripStyle">
    <span class="AgentIconRow-Sr">{{ summary }}</span>
    <span class="AgentIconRow-Sizer" aria-hidden="true" />
    <div class="AgentIconRow-Icons" aria-hidden="true">
      <TxTooltip
        v-for="slot in layout.shown"
        :key="slot.agentId"
        :content="slot.tooltip"
        :anchor="{ placement: 'top', showArrow: true }"
      >
        <span
          class="AgentIconRow-Item"
          :class="{ 'is-dim': !slot.configured }"
          :data-agent-id="slot.agentId"
          :data-configured="slot.configured ? 'true' : 'false'"
        >
          <AgentGlyph
            :agent-id="slot.agentId"
            :label="slot.label"
            :size="AGENT_STRIP_METRICS.mark"
          />
        </span>
      </TxTooltip>
      <TxTooltip v-if="layout.folded.length > 0" :anchor="{ placement: 'top', showArrow: true }">
        <span
          class="AgentIconRow-More"
          :data-folded="layout.folded.map((slot) => slot.agentId).join(' ')"
          :data-folded-configured="
            layout.folded
              .filter((slot) => slot.configured)
              .map((slot) => slot.agentId)
              .join(' ')
          "
        >
          +{{ layout.folded.length }}
        </span>
        <template #content>
          <ul class="AgentIconRow-FoldedList">
            <li
              v-for="slot in layout.folded"
              :key="slot.agentId"
              :class="{ 'is-configured': slot.configured }"
            >
              {{ slot.tooltip }}
            </li>
          </ul>
        </template>
      </TxTooltip>
    </div>
  </div>
</template>

<style scoped lang="scss">
/*
 * The pointer goes through the strip and only stops on a mark, so a row that opens on click still
 * opens when the click lands between two marks.
 *
 * The sizer and the marks share one grid cell: the sizer is as wide as every mark together, so the
 * strip always asks the row for room for all of them, and what the row gives is what the marks
 * fold to fit.
 */
.AgentIconRow {
  position: relative;
  display: inline-grid;
  /* One column, as wide as the row gives: the marks never lay out wider than the strip shows. */
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  pointer-events: none;
}

.AgentIconRow-Sizer,
.AgentIconRow-Icons {
  grid-area: 1 / 1;
}

.AgentIconRow-Sizer {
  width: var(--agent-strip-full);
  height: 0;
}

.AgentIconRow-Icons {
  display: inline-flex;
  align-items: center;
  gap: var(--agent-strip-gap);
  min-width: 0;
}

.AgentIconRow-Item {
  display: inline-flex;
  pointer-events: auto;
  cursor: default;

  &.is-dim {
    opacity: 0.28;
    filter: grayscale(1);
  }
}

/* The folded marks' stand-in: as tall as a mark, a quiet fill, the count in the secondary ink. */
.AgentIconRow-More {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--agent-strip-mark);
  height: var(--agent-strip-mark);
  padding: 0 3px;
  border-radius: 5px;
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
  box-sizing: border-box;
  pointer-events: auto;
  cursor: default;
}

.AgentIconRow-FoldedList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    color: var(--shell-text-secondary);
    white-space: nowrap;

    &.is-configured {
      color: var(--shell-text-primary);
    }
  }
}

/* Visually hidden, still read: the clip pattern, never `display: none`. */
.AgentIconRow-Sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
