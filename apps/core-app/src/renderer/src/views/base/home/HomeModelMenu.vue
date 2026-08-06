<script lang="ts" name="HomeModelMenu" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModelOptions } from '~/modules/conversation/useModelOptions'

/**
 * The picker behind both model pills. Anchored to whichever pill opened it, so one menu component
 * serves the top bar and the composer without either owning the list.
 */
const props = defineProps<{ open: boolean; align?: 'left' | 'right' }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const { t } = useI18n()
const { choices, loading, load, select, isSelected, selection } = useModelOptions()

const rootRef = ref<HTMLElement | null>(null)

function choose(choice: Parameters<typeof select>[0]): void {
  select(choice)
  emit('close')
}

function handlePointerDown(event: PointerEvent): void {
  const root = rootRef.value
  // The pill that opened the menu sits outside this element, so a plain outside-click check would
  // close on the very click that is about to toggle it back open. `closest` on the shared marker
  // keeps the pill's own click for the pill.
  if (!root || root.contains(event.target as Node)) return
  if ((event.target as HTMLElement)?.closest?.('[data-model-pill]')) return
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) void load()
  },
  { immediate: true }
)

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="props.open"
    ref="rootRef"
    class="HomeModelMenu"
    :class="props.align === 'right' ? 'is-right' : 'is-left'"
    role="listbox"
    :aria-label="t('home.model')"
  >
    <button
      class="HomeModelMenu-Item"
      type="button"
      role="option"
      :aria-selected="!selection.model"
      @click="choose(null)"
    >
      <span class="HomeModelMenu-Label">{{ t('home.modelAuto') }}</span>
      <span v-if="!selection.model" class="i-ri-check-line HomeModelMenu-Check" />
    </button>

    <div class="HomeModelMenu-Divider" />

    <p v-if="loading" class="HomeModelMenu-Hint">{{ t('home.modelLoading') }}</p>
    <!-- Not an error: a machine with no configured provider legitimately has nothing to list. -->
    <p v-else-if="!choices.length" class="HomeModelMenu-Hint">{{ t('home.modelEmpty') }}</p>

    <button
      v-for="choice in choices"
      :key="`${choice.providerId}:${choice.model}`"
      class="HomeModelMenu-Item"
      type="button"
      role="option"
      :aria-selected="isSelected(choice)"
      @click="choose(choice)"
    >
      <span class="HomeModelMenu-Label">
        <span class="HomeModelMenu-Model">{{ choice.model }}</span>
        <span class="HomeModelMenu-Provider">{{ choice.providerName }}</span>
      </span>
      <span v-if="isSelected(choice)" class="i-ri-check-line HomeModelMenu-Check" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
.HomeModelMenu {
  position: absolute;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 240px;
  max-width: 320px;
  // Tall lists scroll rather than running off the window; the pill can sit near either edge.
  max-height: 320px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  box-shadow: 0 8px 28px var(--shell-shadow);

  &.is-left {
    top: calc(100% + 6px);
    left: 0;
  }

  &.is-right {
    right: 0;
    bottom: calc(100% + 6px);
  }
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

.HomeModelMenu-Label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.HomeModelMenu-Model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeModelMenu-Provider {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
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
