<script setup lang="ts">
import type { AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import { computed } from 'vue'
import { agentBrand } from './agent-registry'

/**
 * One agent's mark: its brand glyph, or a monogram badge when the icon set has none.
 *
 * Decorative by contract. Whoever draws it also says the agent's name in text (a chip label, a
 * row's hidden sentence, a drawer heading), so the mark never has to carry the name itself.
 */
defineOptions({ name: 'AgentGlyph' })

const props = withDefaults(
  defineProps<{
    agentId: AiAgentId
    /** The name main sent with the inventory; the build's brand table is the fallback. */
    label?: string
    /** Edge length in px. The glyph and the badge share the box, so rows of either line up. */
    size?: number
  }>(),
  { label: undefined, size: 18 }
)

const brand = computed(() => agentBrand(props.agentId, props.label))
const monogramWide = computed(() => Array.from(brand.value.monogram).length > 1)
</script>

<template>
  <span
    class="AgentGlyph"
    :class="[
      brand.iconClass ? 'is-icon' : 'is-monogram',
      brand.iconClass ? undefined : `tone-${brand.tone}`,
      { 'is-wide': monogramWide }
    ]"
    :style="{ '--agent-glyph-size': `${size}px` }"
    :data-agent-id="agentId"
    aria-hidden="true"
  >
    <i v-if="brand.iconClass" class="AgentGlyph-Icon" :class="brand.iconClass" />
    <span v-else class="AgentGlyph-Monogram">{{ brand.monogram }}</span>
  </span>
</template>

<style scoped lang="scss">
/*
 * A flex box, not an inline one: preset-icons sizes the glyph in `em` and sets no `display`, so an
 * inline wrapper would measure the `<i>` at 0×0 and the mark would vanish.
 */
.AgentGlyph {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--agent-glyph-size);
  height: var(--agent-glyph-size);
  box-sizing: border-box;
  line-height: 1;
}

.AgentGlyph.is-icon {
  color: var(--shell-text-primary);
  font-size: var(--agent-glyph-size);
}

.AgentGlyph-Icon {
  display: block;
  width: 1em;
  height: 1em;
}

/*
 * The badge stands where a glyph would: same box, a soft fill of its tone and that tone's own ink
 * — the pair the shell measured for chip ink, so the letters stay readable in both themes and in
 * high contrast.
 */
.AgentGlyph.is-monogram {
  border-radius: calc(var(--agent-glyph-size) * 0.3);
  font-size: calc(var(--agent-glyph-size) * 0.56);
  font-weight: 600;

  &.is-wide {
    font-size: calc(var(--agent-glyph-size) * 0.44);
  }

  &.tone-primary {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &.tone-success {
    background: var(--shell-success-soft);
    color: var(--shell-success);
  }

  &.tone-warning {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }

  &.tone-info {
    background: var(--shell-info-soft);
    color: var(--shell-info);
  }
}

.AgentGlyph-Monogram {
  user-select: none;
}
</style>
