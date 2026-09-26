<script lang="ts" name="MainWindowCommandPalette" setup>
import type { MainWindowCommand } from '~/modules/shortcuts/main-window-shortcuts'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { TxModal } from '@talex-touch/tuffex/modal'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { MAIN_WINDOW_COMMAND_GROUPS } from '~/modules/shortcuts/main-window-command-catalog'
import { shortcutChordLabel } from '~/modules/shortcuts/shortcut-chord'
import { useCoreBoxShortcut } from '~/modules/shortcuts/useCoreBoxShortcut'
import { COREBOX_TOGGLE_SHORTCUT_ID } from '../../../../shared/corebox-shortcut'

/**
 * The window ⌘/ opens: every command the MainWindow can run, grouped, with the key that runs it.
 *
 * It reads the live command list rather than a written-out sheet, so it cannot advertise a command
 * that is not there — including the ones that only exist while a page is mounted. Rows whose
 * handler reports itself unavailable stay visible but inert: "you can send once you have typed
 * something" is worth knowing, and hiding the row would also hide its key.
 */
const props = defineProps<{
  modelValue: boolean
  commands: readonly MainWindowCommand[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'run', id: string): void
}>()

const { t } = useI18n()
const { isMac } = useRendererPlatform()
/** Open CoreBox runs on CoreBox's global key, which the user can rebind or the OS can refuse. */
const { effectiveLabel: coreBoxKey } = useCoreBoxShortcut()

const listRef = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

interface PaletteRow {
  command: MainWindowCommand
  label: string
  /** The key that runs the command, or `null` when none does: no key is printed then. */
  chord: string | null
  runnable: boolean
}

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

/** The in-window chord, or the global key a command runs on as it is bound right now. */
function keyLabel(command: MainWindowCommand): string | null {
  if (command.chord) return shortcutChordLabel(command.chord, isMac.value)
  return command.globalShortcutId === COREBOX_TOGGLE_SHORTCUT_ID ? coreBoxKey.value : null
}

function toRow(command: MainWindowCommand): PaletteRow {
  return {
    command,
    label: t(command.labelKey),
    chord: keyLabel(command),
    runnable: command.enabled ? command.enabled() : true
  }
}

/**
 * Grouped for reading, flat for navigation: one list, two shapes of it, so ArrowDown can cross a
 * section boundary without the component knowing where the boundaries are.
 */
const sections = computed(() =>
  MAIN_WINDOW_COMMAND_GROUPS.map((group) => ({
    group,
    label: t(`shortcuts.group.${group}`),
    rows: props.commands.filter((command) => command.group === group).map(toRow)
  })).filter((section) => section.rows.length > 0)
)

const rows = computed(() => sections.value.flatMap((section) => section.rows))

/** Indexes the keyboard may land on — an inert row is a dead end, so it is skipped. */
function selectableIndexes(): number[] {
  return rows.value.flatMap((row, index) => (row.runnable ? [index] : []))
}

function scrollActiveIntoView(): void {
  const id = rows.value[activeIndex.value]?.command.id
  if (id === undefined) return
  listRef.value
    ?.querySelector<HTMLElement>(`[data-command-id="${id}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function step(delta: number): void {
  const selectable = selectableIndexes()
  if (selectable.length === 0) return
  const position = selectable.indexOf(activeIndex.value)
  activeIndex.value =
    position < 0
      ? selectable[delta > 0 ? 0 : selectable.length - 1]
      : selectable[(position + delta + selectable.length) % selectable.length]
  void nextTick(scrollActiveIntoView)
}

function runRow(row: PaletteRow): void {
  if (!row.runnable) return
  emit('run', row.command.id)
  visible.value = false
}

function runActive(): void {
  const row = rows.value[activeIndex.value]
  if (row) runRow(row)
}

function hoverRow(row: PaletteRow): void {
  const index = rows.value.indexOf(row)
  if (index >= 0 && index !== activeIndex.value) activeIndex.value = index
}

/**
 * Arrows and Enter while the window is open, on the same target the shell's capture listens on.
 *
 * A chord (`⌘N` from inside the window) is left alone — `⌘` is the shell's, and Enter only arrives
 * here bare. `⌘/` never reaches this either way: the shell toggles the window itself.
 */
function onKeyDown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (event.key === 'ArrowDown') step(1)
    else step(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    runActive()
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      window.removeEventListener('keydown', onKeyDown)
      return
    }
    // Start on the first command that can run now, not on the first row — the top of the list is
    // New Chat and Send, and Send is inert until something is typed.
    const selectable = selectableIndexes()
    activeIndex.value = selectable.length > 0 ? selectable[0] : 0
    window.addEventListener('keydown', onKeyDown)
    void nextTick(scrollActiveIntoView)
  }
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <TxModal v-model="visible" :title="t('shortcuts.palette')" width="480px">
    <div ref="listRef" class="MainWindowCommandPalette">
      <section
        v-for="section in sections"
        :key="section.group"
        class="MainWindowCommandPalette-Section"
      >
        <p class="MainWindowCommandPalette-GroupLabel">{{ section.label }}</p>

        <button
          v-for="row in section.rows"
          :key="row.command.id"
          class="MainWindowCommandPalette-Row"
          :class="{
            'is-active': rows[activeIndex]?.command.id === row.command.id,
            'is-disabled': !row.runnable
          }"
          type="button"
          :disabled="!row.runnable"
          :data-command-id="row.command.id"
          @click="runRow(row)"
          @pointermove="hoverRow(row)"
        >
          <span class="MainWindowCommandPalette-Icon" :class="row.command.icon" />
          <span class="MainWindowCommandPalette-Label">{{ row.label }}</span>
          <TxKbd v-if="row.chord" class="MainWindowCommandPalette-Chord">{{ row.chord }}</TxKbd>
        </button>
      </section>
    </div>

    <template #footer>
      <div class="MainWindowCommandPalette-Legend">
        <span class="MainWindowCommandPalette-LegendItem">
          <TxKbd>↑↓</TxKbd>{{ t('shortcuts.legendSelect') }}
        </span>
        <span class="MainWindowCommandPalette-LegendItem">
          <TxKbd>↵</TxKbd>{{ t('shortcuts.legendRun') }}
        </span>
        <span class="MainWindowCommandPalette-LegendItem">
          <TxKbd>Esc</TxKbd>{{ t('shortcuts.legendClose') }}
        </span>
      </div>
    </template>
  </TxModal>
</template>

<style lang="scss" scoped>
/**
 * The modal body carries the padding and the panel its own surface, so rows only own their shape.
 * Its own scroll, capped short of the viewport: eleven rows of ~34px plus the legend fit, and a
 * longer catalog scrolls under the cursor instead of growing the panel past the window.
 */
.MainWindowCommandPalette {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: min(52vh, 420px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.MainWindowCommandPalette-Section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.MainWindowCommandPalette-GroupLabel {
  margin: 0 0 4px;
  padding: 0 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.MainWindowCommandPalette-Row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &.is-active:not(.is-disabled) {
    background: var(--shell-surface-2);
  }

  &.is-disabled {
    // Still readable: the key and the label are the point, and a row that vanished on state
    // would make the sheet's contents depend on when it was opened.
    color: var(--shell-text-muted);
    cursor: default;
    opacity: 0.55;
  }
}

.MainWindowCommandPalette-Icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  font-size: 15px;
}

.MainWindowCommandPalette-Label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--shell-fs-body);
}

.MainWindowCommandPalette-Chord {
  flex: 0 0 auto;
}

.MainWindowCommandPalette-Legend {
  display: flex;
  gap: 14px;
  align-items: center;
}

.MainWindowCommandPalette-LegendItem {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}
</style>
