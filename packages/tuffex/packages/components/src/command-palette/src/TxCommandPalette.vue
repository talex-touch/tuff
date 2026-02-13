<script setup lang="ts">
import type { TxIconSource } from '../../icon'
import type { CommandPaletteEmits, CommandPaletteItem, CommandPaletteProps } from './types'
import { computed, nextTick, ref, watch } from 'vue'
import { TxIcon } from '../../icon'

defineOptions({ name: 'TxCommandPalette' })

const props = withDefaults(defineProps<CommandPaletteProps>(), {
  commands: () => [],
  placeholder: 'Search commands',
  emptyText: 'No commands found',
  maxHeight: 320,
  autoFocus: true,
  closeOnSelect: true,
})

const emit = defineEmits<CommandPaletteEmits>()

const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const activeIndex = ref(0)

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const filteredCommands = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return props.commands
  return props.commands.filter((cmd) => {
    const haystack = [
      cmd.title,
      cmd.description ?? '',
      ...(cmd.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      emit('open')
      activeIndex.value = 0
      await nextTick()
      if (props.autoFocus)
        inputRef.value?.focus()
      return
    }
    emit('close')
    query.value = ''
    activeIndex.value = 0
  },
)

watch(
  filteredCommands,
  () => {
    activeIndex.value = 0
  },
)

function close() {
  visible.value = false
}

function selectItem(item: CommandPaletteItem) {
  if (item.disabled)
    return
  emit('select', item)
  if (props.closeOnSelect)
    close()
}

function onInput(value: string) {
  query.value = value
  emit('update:query', value)
}

function resolveIcon(icon?: CommandPaletteItem['icon']): TxIconSource | undefined {
  if (!icon)
    return undefined
  if (typeof icon === 'string') {
    return { type: 'class', value: icon }
  }
  return icon
}

function onKeydown(e: KeyboardEvent) {
  if (!filteredCommands.value.length)
    return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % filteredCommands.value.length
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const current = filteredCommands.value[activeIndex.value]
    if (current)
      selectItem(current)
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="tx-command-palette">
      <div
        v-if="visible"
        class="tx-command-palette__overlay"
        role="dialog"
        aria-modal="true"
        @click.self="close"
      >
        <div class="tx-command-palette__panel" :style="{ '--tx-command-palette-max': `${maxHeight}px` }">
          <div class="tx-command-palette__search">
            <input
              ref="inputRef"
              class="tx-command-palette__input"
              :value="query"
              :placeholder="placeholder"
              @input="(e) => onInput((e.target as HTMLInputElement).value)"
              @keydown="onKeydown"
            >
          </div>

          <div class="tx-command-palette__list">
            <button
              v-for="(cmd, index) in filteredCommands"
              :key="cmd.id"
              type="button"
              class="tx-command-palette__item"
              :class="{
                'is-active': index === activeIndex,
                'is-disabled': cmd.disabled,
              }"
              @click="selectItem(cmd)"
            >
              <span v-if="cmd.icon" class="tx-command-palette__icon" aria-hidden="true">
                <TxIcon :icon="resolveIcon(cmd.icon)" :size="16" />
              </span>
              <span class="tx-command-palette__content">
                <span class="tx-command-palette__title">{{ cmd.title }}</span>
                <span v-if="cmd.description" class="tx-command-palette__desc">{{ cmd.description }}</span>
              </span>
              <span v-if="cmd.shortcut" class="tx-command-palette__shortcut">{{ cmd.shortcut }}</span>
            </button>

            <div v-if="!filteredCommands.length" class="tx-command-palette__empty">
              {{ emptyText }}
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.tx-command-palette__overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 24px;
  z-index: 1200;
}

.tx-command-palette__panel {
  width: min(90vw, 560px);
  background: var(--tx-bg-color, #fff);
  border-radius: 18px;
  box-shadow: 0 20px 70px rgba(15, 23, 42, 0.28);
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #e5e7eb) 50%, transparent);
  overflow: hidden;
}

.tx-command-palette__search {
  padding: 16px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tx-command-palette__input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 15px;
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
}

.tx-command-palette__list {
  max-height: var(--tx-command-palette-max, 320px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.tx-command-palette__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  text-align: left;
  border-radius: 12px;
  padding: 10px 12px;
  background: transparent;
  cursor: pointer;
  color: var(--tx-text-color-primary, #303133);
  transition: background 160ms ease, color 160ms ease;
}

.tx-command-palette__item.is-active {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.tx-command-palette__item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tx-command-palette__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-command-palette__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.tx-command-palette__title {
  font-size: 14px;
  font-weight: 600;
}

.tx-command-palette__desc {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-command-palette__shortcut {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #909399);
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  padding: 2px 6px;
  border-radius: 8px;
}

.tx-command-palette__empty {
  padding: 16px;
  text-align: center;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

.tx-command-palette-enter-active,
.tx-command-palette-leave-active {
  transition: opacity 0.34s cubic-bezier(0.2, 0, 0, 1);
}

.tx-command-palette-enter-from,
.tx-command-palette-leave-to {
  opacity: 0;
}
</style>
