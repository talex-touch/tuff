<script lang="ts" name="HomeTurnInfoMenu" setup>
import type { ConversationTurnMeta } from '~/modules/conversation/useHomeConversation'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildTurnInfoRows } from '~/modules/conversation/turn-info-rows'

/**
 * The turn readout behind the top bar's `⋯`.
 *
 * It used to be the first section of the right panel, permanently on screen
 * whenever that panel was open. It is glance-at metadata, not something you
 * work in, so it costs a column it does not earn — and the panel is being
 * handed over to content preview. The caller passes the `⋯` button through the
 * trigger slot so the button keeps living in the top bar, where the drag-region
 * exemption and hover state are already defined.
 */
const props = defineProps<{ turn?: ConversationTurnMeta; messageCount: number }>()

const { t } = useI18n()

const open = ref(false)
const triggerWrapRef = ref<HTMLElement | null>(null)
/**
 * Focus returns to the button only when the panel closed from the keyboard —
 * an outside click already moved focus somewhere deliberate, and pulling it
 * back would fight the user.
 */
let restoreFocusOnClose = false

const rows = computed(() =>
  buildTurnInfoRows({ turn: props.turn, messageCount: props.messageCount, t })
)

/** The anchor closes on Escape by itself; this only marks where focus should land. */
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') restoreFocusOnClose = true
}

watch(open, (isOpen) => {
  if (isOpen) {
    restoreFocusOnClose = false
    return
  }
  if (restoreFocusOnClose) {
    void nextTick(() => triggerWrapRef.value?.querySelector('button')?.focus())
  }
})
</script>

<template>
  <TxDropdownMenu
    v-model="open"
    placement="bottom-end"
    :min-width="240"
    :panel-radius="12"
    :panel-padding="12"
    panel-background="pure"
  >
    <template #trigger>
      <!-- display: contents — the wrapper exists only so closing can find the button to refocus. -->
      <span ref="triggerWrapRef" class="HomeTurnInfoMenu-TriggerWrap">
        <slot name="trigger" :open="open" />
      </span>
    </template>

    <div
      class="HomeTurnInfoMenu"
      role="group"
      :aria-label="t('home.panel.turnInfo')"
      @keydown="onPanelKeydown"
    >
      <h2 class="HomeTurnInfoMenu-Heading">{{ t('home.panel.turnInfo') }}</h2>
      <dl class="HomeTurnInfoMenu-Rows">
        <div v-for="row in rows" :key="row.key" class="HomeTurnInfoMenu-Row">
          <dt class="HomeTurnInfoMenu-Key">{{ row.label }}</dt>
          <dd class="HomeTurnInfoMenu-Value">{{ row.value }}</dd>
        </div>
      </dl>
      <p v-if="!props.turn" class="HomeTurnInfoMenu-Empty">{{ t('home.panel.noTurn') }}</p>
    </div>
  </TxDropdownMenu>
</template>

<style lang="scss" scoped>
.HomeTurnInfoMenu-TriggerWrap {
  display: contents;
}

/* Panel chrome (surface, border, shadow, placement) belongs to the primitive; this is content. */
.HomeTurnInfoMenu {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 320px;
}

.HomeTurnInfoMenu-Heading {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.HomeTurnInfoMenu-Rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.HomeTurnInfoMenu-Row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
}

.HomeTurnInfoMenu-Key {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.HomeTurnInfoMenu-Value {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-sm);
}

.HomeTurnInfoMenu-Empty {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.6;
}
</style>
