<script setup lang="ts">
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import type { AgentRef } from './agent-registry'
import type { ResourceRowTag } from './types'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingChip from '~/components/settings/SettingChip.vue'
import { AGENT_STRIP_METRICS } from './agent-registry'
import AgentIconRow from './AgentIconRow.vue'

/**
 * One row of a local-resource list: the item's name and labels, a one-line description, which
 * agents hold it, and whatever the page puts at the end (Tuff's own switch, usually).
 *
 * The whole row opens the item's details. That is a stretched button under the content rather than
 * a button around it: the trailing slot holds a switch, and a control nested inside a button is
 * invalid HTML that breaks keyboard and screen-reader behaviour. The text lets the pointer through
 * to that button; the trailing controls and the agent marks sit above it.
 *
 * `placeholder` draws the same row as a loading skeleton — the same containers, line boxes and
 * label chip — so a list of placeholders is exactly as tall as the list that replaces it.
 */
defineOptions({ name: 'ResourceRow' })

const props = withDefaults(
  defineProps<{
    name?: string
    /** One line; anything longer is cut with an ellipsis and read in full in the details. */
    description?: string
    /** Set the description in the monospace face: a command line, an address, a path. */
    descriptionMono?: boolean
    tags?: readonly ResourceRowTag[]
    /** Every agent on the page, in the agent bar's order. */
    agents?: readonly AgentRef[]
    /** Agents whose own configuration holds this item. */
    configured?: readonly AiAgentId[]
    /** The row whose details are open. */
    active?: boolean
    /** Accessible name of the open button; defaults to "<name> details". */
    openLabel?: string
    /**
     * A word at the row's end saying what opening it does ("Configure ›"), for a row with no control
     * of its own. Decoration only: the whole row is already the button, so this is not a second one.
     */
    openHint?: string
    /** Draw the loading skeleton of a row instead of a row. */
    placeholder?: boolean
    /** Placeholder only: how many agent marks to reserve. */
    placeholderAgents?: number
    /** Placeholder only: whether the row ends in a switch. */
    placeholderSwitch?: boolean
    /** Placeholder only: whether the name carries a label chip, as a loaded row's would. */
    placeholderTags?: boolean
    /** Placeholder only: whether the row ends in an open hint. */
    placeholderHint?: boolean
  }>(),
  {
    name: '',
    description: undefined,
    descriptionMono: false,
    tags: () => [],
    agents: () => [],
    configured: () => [],
    active: false,
    openLabel: undefined,
    openHint: undefined,
    placeholder: false,
    placeholderAgents: 3,
    placeholderSwitch: true,
    placeholderTags: true,
    placeholderHint: false
  }
)

const emit = defineEmits<{
  open: []
}>()

defineSlots<{
  /** Controls at the end of the row, above the open button. */
  trailing?: () => unknown
}>()

const { t } = useI18n()

const hitLabel = computed(
  () => props.openLabel ?? t('settings.resources.openDetails', { name: props.name })
)

/**
 * An item no agent can hold — one of Tuff's own — has no agent strip at all. An empty strip would
 * still tell a screen reader "no agent configures it", which says something false about an item
 * agents have nothing to do with.
 */
const showAgents = computed(() => props.agents.length > 0 || props.configured.length > 0)
</script>

<template>
  <div
    v-if="placeholder"
    class="ResourceRow is-placeholder"
    aria-hidden="true"
    data-resource-placeholder="true"
  >
    <div class="ResourceRow-Main">
      <div class="ResourceRow-Head">
        <div class="ResourceRow-Name ResourceRow-Line">
          <TxSkeleton class="ResourceRow-Bar" :width="132" height="0.9em" :radius="4" />
        </div>
        <!-- A real chip, emptied: the head is as tall as its label chip, not as its name. -->
        <span v-if="placeholderTags" class="ResourceRow-Tags">
          <SettingChip class="ResourceRow-ChipPlaceholder">
            <span class="ResourceRow-Line ResourceRow-ChipBar" />
          </SettingChip>
        </span>
      </div>
      <div class="ResourceRow-Desc ResourceRow-Line" :class="{ 'is-mono': descriptionMono }">
        <TxSkeleton class="ResourceRow-Bar" :width="260" height="0.9em" :radius="4" />
      </div>
    </div>
    <div v-if="placeholderAgents > 0" class="ResourceRow-AgentsPlaceholder">
      <TxSkeleton
        v-for="index in placeholderAgents"
        :key="index"
        :width="AGENT_STRIP_METRICS.mark"
        :height="AGENT_STRIP_METRICS.mark"
        :radius="5"
      />
    </div>
    <div v-if="placeholderHint" class="ResourceRow-Hint ResourceRow-Line">
      <TxSkeleton class="ResourceRow-Bar" :width="44" height="0.9em" :radius="4" />
    </div>
    <div v-if="placeholderSwitch" class="ResourceRow-Trailing">
      <TxSkeleton :width="44" :height="24" :radius="999" />
    </div>
  </div>

  <div v-else class="ResourceRow" :class="{ 'is-active': active }" :data-resource-name="name">
    <button
      class="ResourceRow-Hit"
      type="button"
      :aria-label="hitLabel"
      aria-haspopup="dialog"
      :aria-expanded="active"
      @click="emit('open')"
    />

    <div class="ResourceRow-Main">
      <div class="ResourceRow-Head">
        <span class="ResourceRow-Name">{{ name }}</span>
        <span v-if="tags.length > 0" class="ResourceRow-Tags">
          <template v-for="tag in tags" :key="tag.key ?? tag.label">
            <!--
              A hinted label takes the pointer, so its hint can show; every other part of the text
              lets the pointer through to the row's button.
            -->
            <TxTooltip v-if="tag.hint" :content="tag.hint" :anchor="{ placement: 'top' }">
              <SettingChip class="ResourceRow-HintedTag" :tone="tag.tone ?? 'neutral'">
                {{ tag.label }}
              </SettingChip>
            </TxTooltip>
            <SettingChip v-else :tone="tag.tone ?? 'neutral'">
              {{ tag.label }}
            </SettingChip>
          </template>
        </span>
      </div>
      <span v-if="description" class="ResourceRow-Desc" :class="{ 'is-mono': descriptionMono }">
        {{ description }}
      </span>
    </div>

    <AgentIconRow
      v-if="showAgents"
      class="ResourceRow-Agents"
      :agents="agents"
      :configured="configured"
    />

    <span v-if="openHint" class="ResourceRow-Hint" aria-hidden="true">
      {{ openHint }}
      <span class="ResourceRow-HintIcon i-ri-arrow-right-s-line" />
    </span>

    <div v-if="$slots.trailing" class="ResourceRow-Trailing">
      <slot name="trailing" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ResourceRow {
  position: relative;
  display: grid;
  /*
   * The text takes the free width; whatever follows it — agent marks, an open hint, the trailing
   * controls — lines up after it in the same row, however many of those a row has.
   *
   * When the row runs short, the text keeps a readable minimum (10rem, or 40% of a very narrow
   * row) and the agent strip gives way, folding its last marks into "+N" (see `.ResourceRow-Agents`
   * and `AgentIconRow`). The trailing controls never shrink: their column starts at their own
   * width, so the switch is never pushed out of the row. A compact strip of eleven agents is 216px;
   * at the 1100px window minimum the row is 760px and everything fits, and this keeps that true
   * below it.
   */
  grid-template-columns: minmax(min(10rem, 40%), 1fr);
  grid-auto-columns: auto;
  grid-auto-flow: column;
  align-items: center;
  gap: var(--shell-space-4);
  padding: 12px 16px;
  background-color: transparent;
  box-sizing: border-box;

  // Hover ink is immediate: a hover is not a state change worth easing.
  &:hover,
  &.is-active {
    background-color: var(--shell-surface);
  }
}

/* The hairline between two rows; the list's own card draws the outer edge. */
.ResourceRow + .ResourceRow {
  border-top: 1px solid var(--shell-border);
}

.ResourceRow-Hit {
  z-index: 0;
  position: absolute;
  inset: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;

  /*
   * The row spans the full width of a card that clips its overflow, so an outward focus ring would
   * be cut off at the card edges. Draw it inside instead.
   */
  &:focus-visible {
    outline-offset: -3px;
    box-shadow: none;
  }
}

.ResourceRow-Main {
  z-index: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  pointer-events: none;
}

.ResourceRow-Head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}

.ResourceRow-Name {
  min-width: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: 13.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ResourceRow-Tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* The text lets the pointer through; a label with a hint is the exception, or it could not show. */
.ResourceRow-HintedTag {
  pointer-events: auto;
  cursor: default;
}

.ResourceRow-Desc {
  min-width: 0;
  overflow: hidden;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-mono {
    font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11.5px;
  }
}

/*
 * The strip may be narrower than its marks: a clipping box has no content-based minimum width, so
 * its grid column can shrink below the marks and the row's text and switch keep their room. The
 * strip measures what it was given and folds the marks that do not fit into "+N"; the clip is only
 * the last resort, for a row too narrow even for that.
 */
.ResourceRow-Agents {
  z-index: 1;
  min-width: 0;
  overflow: hidden;
}

/*
 * The open hint lets the pointer through to the row's button under it: it names what the row does,
 * it is not a control of its own.
 */
.ResourceRow-Hint {
  z-index: 1;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  white-space: nowrap;
  pointer-events: none;
}

.ResourceRow-HintIcon {
  width: 16px;
  height: 16px;
}

/*
 * Placeholder parts. A bar sits inside an element with the real text's font size and a height of
 * exactly one line box, so the placeholder row is as tall as a loaded one by construction, not by a
 * number kept in step by hand.
 */
.ResourceRow.is-placeholder {
  pointer-events: none;

  &:hover {
    background-color: transparent;
  }

  --tx-skeleton-base-color: var(--shell-surface-2);
}

.ResourceRow-Line {
  display: flex;
  align-items: center;
  height: 1lh;
}

/* The chip keeps its own fill, the skeleton's base tone; only its label is left out. */
.ResourceRow-ChipBar {
  width: 30px;
}

.ResourceRow-AgentsPlaceholder {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.ResourceRow-Trailing {
  z-index: 1;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 640px) {
  .ResourceRow {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-auto-flow: row;
  }

  .ResourceRow-Agents {
    grid-column: 1;
    grid-row: 2;
  }

  .ResourceRow-Hint,
  .ResourceRow-Trailing {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
</style>
