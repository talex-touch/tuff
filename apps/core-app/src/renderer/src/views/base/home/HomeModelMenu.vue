<script lang="ts">
/**
 * The one menu the two pills may hold open between them — the old `openMenu` state machine's
 * invariant. Pointer flows keep it on their own (the primitive's outside-click closes the other
 * copy on pointerdown), but a keyboard activation of the other pill fires no pointerdown, so the
 * newly opening copy closes the previous one through this hand-off.
 */
let closeActiveModelMenu: (() => void) | null = null
</script>

<script lang="ts" name="HomeModelMenu" setup>
import type { ModelChoice } from '~/modules/conversation/useModelOptions'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModelOptions } from '~/modules/conversation/useModelOptions'

/**
 * The picker behind both model pills. Each caller hands its pill in through the trigger slot and
 * this control owns the rest: anchoring, outside-click, Escape and arrow traversal all come from
 * TxDropdownMenu, so the component is only the option content plus the shared selection state.
 */
const props = withDefaults(defineProps<{ placement?: 'bottom-start' | 'top-end' }>(), {
  placement: 'bottom-start'
})

const { t } = useI18n()
const { choices, loading, load, select, isSelected, selection } = useModelOptions()

const open = ref(false)
const triggerWrapRef = ref<HTMLElement | null>(null)
/**
 * Focus goes back to the pill only when the menu closed from the keyboard or a selection —
 * an outside click moved focus somewhere deliberate, and yanking it back would fight the user.
 */
let restoreFocusOnClose = false

interface ModelChoiceGroup {
  providerId: string
  providerName: string
  items: ModelChoice[]
}

/**
 * One group per provider, in the order the options arrived. The flat list
 * repeated the provider under every row, which reads as noise once a single
 * provider carries many models.
 */
const groups = computed<ModelChoiceGroup[]>(() => {
  const byProvider = new Map<string, ModelChoiceGroup>()
  for (const choice of choices.value) {
    let group = byProvider.get(choice.providerId)
    if (!group) {
      group = { providerId: choice.providerId, providerName: choice.providerName, items: [] }
      byProvider.set(choice.providerId, group)
    }
    group.items.push(choice)
  }
  return [...byProvider.values()]
})

function choose(choice: ModelChoice | null): void {
  select(choice)
  restoreFocusOnClose = true
  open.value = false
}

/** The anchor closes on Escape by itself; this only marks that focus should return to the pill. */
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') restoreFocusOnClose = true
}

function closeSelf(): void {
  open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    if (closeActiveModelMenu !== null && closeActiveModelMenu !== closeSelf) closeActiveModelMenu()
    closeActiveModelMenu = closeSelf
    restoreFocusOnClose = false
    void load()
    return
  }
  if (closeActiveModelMenu === closeSelf) closeActiveModelMenu = null
  if (restoreFocusOnClose) {
    void nextTick(() => triggerWrapRef.value?.querySelector('button')?.focus())
  }
})

onBeforeUnmount(() => {
  if (closeActiveModelMenu === closeSelf) closeActiveModelMenu = null
})
</script>

<template>
  <TxDropdownMenu
    v-model="open"
    :placement="props.placement"
    :min-width="240"
    :max-height="320"
    :panel-radius="12"
    :panel-padding="6"
    panel-background="pure"
  >
    <template #trigger>
      <!-- display: contents — the wrapper exists only so closing can find the pill to refocus. -->
      <span ref="triggerWrapRef" class="HomeModelMenu-TriggerWrap">
        <slot name="trigger" :open="open" />
      </span>
    </template>

    <!-- `group` so the label is announced: on a bare div `aria-label` is ignored, and the
         old listbox named itself. The radio rows also belong inside a group per ARIA menus. -->
    <div class="HomeModelMenu" role="group" :aria-label="t('home.model')" @keydown="onPanelKeydown">
      <button
        class="HomeModelMenu-Item"
        type="button"
        role="menuitemradio"
        :aria-checked="!selection.model"
        @click="choose(null)"
      >
        <span class="HomeModelMenu-Label">{{ t('home.modelAuto') }}</span>
        <span v-if="!selection.model" class="i-ri-check-line HomeModelMenu-Check" />
      </button>

      <div class="HomeModelMenu-Divider" />

      <p v-if="loading" class="HomeModelMenu-Hint">{{ t('home.modelLoading') }}</p>
      <!-- Not an error: a machine with no configured provider legitimately has nothing to list. -->
      <p v-else-if="!choices.length" class="HomeModelMenu-Hint">{{ t('home.modelEmpty') }}</p>

      <div
        v-for="group in groups"
        :key="group.providerId"
        class="HomeModelMenu-Group"
        role="group"
        :aria-labelledby="`home-model-group-${group.providerId}`"
      >
        <p :id="`home-model-group-${group.providerId}`" class="HomeModelMenu-GroupLabel">
          {{ group.providerName }}
        </p>
        <button
          v-for="choice in group.items"
          :key="`${choice.providerId}:${choice.model}`"
          class="HomeModelMenu-Item"
          type="button"
          role="menuitemradio"
          :aria-checked="isSelected(choice)"
          @click="choose(choice)"
        >
          <span class="HomeModelMenu-Model">{{ choice.model }}</span>
          <span v-if="isSelected(choice)" class="i-ri-check-line HomeModelMenu-Check" />
        </button>
      </div>
    </div>
  </TxDropdownMenu>
</template>

<style lang="scss" scoped>
.HomeModelMenu-TriggerWrap {
  display: contents;
}

/* Panel chrome (surface, border, shadow, placement) belongs to the primitive; this is content. */
.HomeModelMenu {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-width: 320px;
}

.HomeModelMenu-Item {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 7px 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
  }
}

.HomeModelMenu-Group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* A label, not an option: the provider names the block so the rows can stay one line each. */
.HomeModelMenu-GroupLabel {
  margin: 0;
  padding: 8px 9px 3px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.HomeModelMenu-Model {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeModelMenu-Check {
  flex: none;
  color: var(--shell-primary);
}

.HomeModelMenu-Divider {
  margin: 4px 2px;
  border-top: 1px solid var(--shell-border);
}

.HomeModelMenu-Hint {
  margin: 0;
  padding: 8px 9px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}
</style>
