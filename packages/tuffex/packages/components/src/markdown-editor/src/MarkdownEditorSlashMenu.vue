<script setup lang="ts">
import type { BaseAnchorVirtualReference } from '../../base-anchor/src/types'
import type { MarkdownSlashState } from './use-markdown-slash'
import { computed, nextTick, ref, watch } from 'vue'
import { TxBaseAnchor } from '../../base-anchor'
import { TxIcon } from '../../icon'

// Internal: the slash command menu of the rich surface. The surface keeps
// focus; the editor drives `active` from the arrow keys.
defineOptions({ name: 'TxMarkdownEditorSlashMenu' })

const props = defineProps<{
  state: MarkdownSlashState | null
  label: string
  reference: BaseAnchorVirtualReference
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  pick: [index: number]
  hover: [index: number]
  close: []
}>()

const layerClass = computed(() => ['tx-markdown-editor-layer', `tx-markdown-editor-layer--${props.theme}`])
const anchor = ref<InstanceType<typeof TxBaseAnchor> | null>(null)
const list = ref<HTMLElement | null>(null)

watch(() => props.state?.active, async (active) => {
  if (active === undefined)
    return
  await nextTick()
  list.value?.children[active]?.scrollIntoView?.({ block: 'nearest' })
})

defineExpose({
  updatePosition: () => anchor.value?.updatePosition?.(),
  containsFloating: (target: Node) => !!anchor.value?.containsFloating(target),
})
</script>

<template>
  <TxBaseAnchor
    ref="anchor"
    :model-value="!!state"
    :class="layerClass"
    :data-theme="theme"
    :virtual-reference="reference"
    placement="bottom-start"
    :offset="6"
    :min-width="256"
    :max-width="292"
    panel-variant="solid"
    panel-background="refraction"
    panel-shadow="soft"
    :panel-radius="18"
    :panel-padding="8"
    @update:model-value="(open: boolean) => !open && emit('close')"
  >
    <ul
      v-if="state"
      ref="list"
      class="tx-markdown-editor-slash"
      role="listbox"
      :aria-label="label"
      @mousedown.prevent
    >
      <li
        v-for="(item, position) in state.items"
        :key="item.id"
        class="tx-markdown-editor-slash__item"
        :class="{ 'is-active': position === state.active }"
        role="option"
        :aria-selected="position === state.active"
        @mousemove="position !== state.active && emit('hover', position)"
        @click="emit('pick', position)"
      >
        <span class="tx-markdown-editor-slash__icon" aria-hidden="true">
          <TxIcon v-if="item.icon" :name="item.icon" :size="15" />
          <template v-else>{{ item.glyph }}</template>
        </span>
        <span class="tx-markdown-editor-slash__label">{{ item.label }}</span>
        <span class="tx-markdown-editor-slash__hint" aria-hidden="true">{{ item.hint }}</span>
      </li>
    </ul>
  </TxBaseAnchor>
</template>

<style lang="scss">
.tx-markdown-editor-slash {
  display: flex;
  flex-direction: column;
  gap: var(--tx-markdown-editor-menu-gap, 2px);
  max-height: 278px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  list-style: none;
  color: var(--tx-markdown-editor-text);
  font-size: 13px;
}

.tx-markdown-editor-slash__item {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--tx-markdown-editor-menu-item-gap, 10px);
  padding: var(--tx-markdown-editor-menu-item-padding, 7px 10px);
  border-radius: var(--tx-markdown-editor-menu-item-radius, 10px);
  line-height: 1.35;
  cursor: pointer;

  &.is-active {
    background: color-mix(in srgb, var(--tx-markdown-editor-accent) 12%, transparent);
  }
}

.tx-markdown-editor-slash__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--tx-markdown-editor-text) 5%, transparent);
  color: var(--tx-markdown-editor-muted);
  font-size: 11px;
  font-weight: var(--tx-font-weight-semibold, 600);
  letter-spacing: -0.02em;
}

.tx-markdown-editor-slash__item.is-active .tx-markdown-editor-slash__icon {
  background: color-mix(in srgb, var(--tx-markdown-editor-accent) 16%, transparent);
  color: var(--tx-markdown-editor-accent);
}

.tx-markdown-editor-slash__label {
  flex: 1;
  min-width: 0;
  font-weight: var(--tx-font-weight-medium, 500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-markdown-editor-slash__hint {
  flex: none;
  color: var(--tx-markdown-editor-placeholder);
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 11px;
  opacity: 0.78;
}
</style>
