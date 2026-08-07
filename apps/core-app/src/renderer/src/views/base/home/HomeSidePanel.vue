<script lang="ts" name="HomeSidePanel" setup>
import type { ConversationTurnMeta } from '~/modules/conversation/useHomeConversation'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The right panel behind the top bar's `panel-right` toggle.
 *
 * The design only ever draws this collapsed, so the contents are not from an artboard: they are the
 * turn metadata the stream already reports (`provider` / `model` / usage / latency). The work-log
 * section is a declared empty state rather than a mock — tool calls and artifacts do not exist yet,
 * and filling it with plausible rows would misrepresent what the app can do.
 */
const props = defineProps<{ turn?: ConversationTurnMeta; messageCount: number }>()

const { t } = useI18n()

const rows = computed(() => {
  const turn = props.turn
  const entries: Array<{ key: string; label: string; value: string }> = [
    { key: 'messages', label: t('home.panel.messages'), value: String(props.messageCount) }
  ]

  if (turn?.provider) {
    entries.push({ key: 'provider', label: t('home.panel.provider'), value: turn.provider })
  }
  if (turn?.model) {
    entries.push({ key: 'model', label: t('home.panel.model'), value: turn.model })
  }
  if (typeof turn?.totalTokens === 'number' && turn.totalTokens > 0) {
    entries.push({
      key: 'tokens',
      label: t('home.panel.tokens'),
      // The split is what makes the number actionable — a bare total hides which side is growing.
      value: `${turn.totalTokens} (${turn.promptTokens ?? 0} + ${turn.completionTokens ?? 0})`
    })
  }
  if (typeof turn?.latencyMs === 'number') {
    entries.push({
      key: 'latency',
      label: t('home.panel.latency'),
      value: `${(turn.latencyMs / 1000).toFixed(1)}s`
    })
  }
  // Only when it happened: a zero row would make every turn look degraded.
  if (turn?.compactions) {
    entries.push({
      key: 'compactions',
      label: t('home.panel.compactions'),
      value: `×${turn.compactions}`
    })
  }

  return entries
})
</script>

<template>
  <aside class="HomeSidePanel" :aria-label="t('home.panel.title')">
    <section class="HomeSidePanel-Section">
      <h2 class="HomeSidePanel-Heading">{{ t('home.panel.turnInfo') }}</h2>
      <dl class="HomeSidePanel-Rows">
        <div v-for="row in rows" :key="row.key" class="HomeSidePanel-Row">
          <dt class="HomeSidePanel-Key">{{ row.label }}</dt>
          <dd class="HomeSidePanel-Value">{{ row.value }}</dd>
        </div>
      </dl>
      <p v-if="!props.turn" class="HomeSidePanel-Empty">{{ t('home.panel.noTurn') }}</p>
    </section>

    <section class="HomeSidePanel-Section">
      <h2 class="HomeSidePanel-Heading">{{ t('home.panel.workLog') }}</h2>
      <p class="HomeSidePanel-Empty">{{ t('home.panel.workLogEmpty') }}</p>
    </section>
  </aside>
</template>

<style lang="scss" scoped>
.HomeSidePanel {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 24px;
  /**
   * Held at full width even while the slot that clips it animates to zero. `fill_container` here
   * would make every row re-wrap on each frame of the open/close transition.
   */
  width: var(--home-panel-width, 280px);
  min-width: var(--home-panel-width, 280px);
  padding: 20px;
  overflow-y: auto;
  // Only a left rule: the panel is part of the main pane, not a floating sheet over it.
  border-left: 1px solid var(--shell-border);
  box-sizing: border-box;
}

.HomeSidePanel-Section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.HomeSidePanel-Heading {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.HomeSidePanel-Rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.HomeSidePanel-Row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
}

.HomeSidePanel-Key {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.HomeSidePanel-Value {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-sm);
}

.HomeSidePanel-Empty {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.6;
}
</style>
