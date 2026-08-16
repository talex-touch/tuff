<script setup lang="ts" generic="T extends { key: string }">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// Private to TxPromptBar: the shell, the gliding highlight and the listbox
// semantics for both popups. Row content comes from the parent's slot, so the
// element refs the highlight measures never leave this file.
import { computed, ref, watchPostEffect } from 'vue'

defineOptions({ name: 'TxPromptBarMenu' })

const props = withDefaults(
  defineProps<{
    /** Listbox id — the owning combobox points `aria-controls` at it. */
    id: string
    rows: readonly T[]
    activeIndex: number
    /** Gates the highlight: it appears only once a reader has aimed at a row. */
    engaged: boolean
    optionId: (index: number) => string
    /** Row that reads as chosen. `-1` when the menu holds no selection. */
    selectedIndex?: number
    /** `stretch` spans the composer; `end` pins a fixed width to its right. */
    align?: 'stretch' | 'end'
    width?: number
    rowHeight?: number
    emptyText?: string
    footerText?: string
    label?: string
  }>(),
  {
    selectedIndex: -1,
    align: 'stretch',
    rowHeight: 36,
  },
)

const emit = defineEmits<{
  pick: [row: T, index: number]
  hover: [index: number]
  leave: []
}>()

defineSlots<{
  row?: (props: { row: T, index: number, active: boolean, selected: boolean }) => unknown
}>()

const rowEls: (HTMLElement | null)[] = []
const box = ref<{ top: number, height: number } | null>(null)

function captureRow(element: unknown, index: number): void {
  rowEls[index] = (element as HTMLElement | null) ?? null
}

// Post-flush: rows have to be in the document before their offsets read as
// anything but zero.
watchPostEffect(() => {
  void props.rows.length
  void props.activeIndex
  void props.engaged

  rowEls.length = props.rows.length
  const target = rowEls[props.activeIndex]
  box.value = target ? { top: target.offsetTop, height: target.offsetHeight } : null
})

const highlightStyle = computed(() => ({
  top: `${box.value?.top ?? 0}px`,
  height: `${box.value?.height ?? 0}px`,
  opacity: box.value && props.engaged && props.rows.length > 0 ? '1' : '0',
}))

const rootStyle = computed(() => ({
  ...(props.width === undefined ? {} : { width: `${props.width}px` }),
  '--tx-bui-prompt-bar-menu-row-height': `${props.rowHeight}px`,
}))
</script>

<template>
  <div
    class="tx-bui-prompt-bar-menu"
    :class="`is-${align}`"
    :style="rootStyle"
    @mouseleave="emit('leave')"
  >
    <span class="tx-bui-prompt-bar-menu__highlight" aria-hidden="true" :style="highlightStyle" />

    <ul :id="id" class="tx-bui-prompt-bar-menu__list" role="listbox" :aria-label="label">
      <li
        v-for="(row, index) in rows"
        :id="optionId(index)"
        :key="row.key"
        :ref="(element) => captureRow(element, index)"
        class="tx-bui-prompt-bar-menu__option"
        :class="{ 'is-active': index === activeIndex }"
        role="option"
        :aria-selected="index === selectedIndex"
        @mousedown.prevent
        @mouseenter="emit('hover', index)"
        @click="emit('pick', row, index)"
      >
        <slot
          name="row"
          :row="row"
          :index="index"
          :active="index === activeIndex"
          :selected="index === selectedIndex"
        />
      </li>
    </ul>

    <div v-if="rows.length === 0 && emptyText" class="tx-bui-prompt-bar-menu__empty">
      {{ emptyText }}
    </div>

    <div v-if="footerText" class="tx-bui-prompt-bar-menu__footer">
      {{ footerText }}
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;

.tx-bui-prompt-bar-menu {
  @include bui-pop-in(180ms);

  position: absolute;
  bottom: 100%;
  z-index: 10;
  margin-bottom: 8px;
  padding: 4px;
  border-radius: 10px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 0 2px 10px #0000000b);

  &.is-stretch {
    left: 0;
    right: 0;
    transform-origin: bottom center;
  }

  &.is-end {
    right: 0;
    transform-origin: bottom right;
  }

  // One highlight glides between rows instead of each row toggling its own
  // background — the same gesture as the gliding pill in the sidebar.
  .tx-bui-prompt-bar-menu__highlight {
    position: absolute;
    left: 4px;
    right: 4px;
    border-radius: 6px;
    background: var(--tx-bui-hover, #f4f5f6);
    pointer-events: none;
    transition:
      top 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      height 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      opacity 150ms ease;
  }

  .tx-bui-prompt-bar-menu__list {
    position: relative;
    z-index: 1;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tx-bui-prompt-bar-menu__option {
    display: flex;
    align-items: center;
    gap: 10px;
    height: var(--tx-bui-prompt-bar-menu-row-height, 36px);
    padding: 0 8px;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
  }

  .tx-bui-prompt-bar-menu__empty {
    display: flex;
    align-items: center;
    height: var(--tx-bui-prompt-bar-menu-row-height, 36px);
    padding: 0 8px;
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 12px;
  }

  .tx-bui-prompt-bar-menu__footer {
    margin-top: 4px;
    padding: 6px 8px 4px;
    border-top: 1px solid var(--tx-bui-line, #ecedef);
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-bui-prompt-bar-menu .tx-bui-prompt-bar-menu__highlight {
    transition: none;
  }
}
</style>
