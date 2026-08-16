<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { SidebarNavEmits, SidebarNavGroup, SidebarNavItem, SidebarNavProps, SidebarNavValue } from './types'
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { TxIconChip } from '../../icon-chip'
import { useIndicatorBox } from './use-indicator-box'

defineOptions({ name: 'TxSidebarNav' })

const props = withDefaults(defineProps<SidebarNavProps>(), {
  workspaceLabel: 'Switch workspace',
  ariaLabel: 'Workspace',
  indicatorDuration: 220,
})

const emit = defineEmits<SidebarNavEmits>()

defineSlots<{
  /** Replaces the whole workspace switcher. */
  workspace?: () => any
  /** Replaces the leading glyph of an item. */
  'item-icon'?: (props: { item: SidebarNavItem, active: boolean }) => any
  /** Appended below the item groups. */
  footer?: () => any
}>()

const navRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const hovered = ref<SidebarNavValue | null>(null)
const itemEls = new Map<SidebarNavValue, HTMLElement>()

// Group headers label their own list, so the ids have to survive two sidebars
// on the same page.
const uid = useId()

function groupLabelId(key: string) {
  return `${uid}-group-${key}`
}

function setItemRef(value: SidebarNavValue, el: Element | null) {
  if (el instanceof HTMLElement)
    itemEls.set(value, el)
  else
    itemEls.delete(value)
}

const queryValue = computed(() => props.query ?? '')

function defaultFilter(items: SidebarNavItem[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle)
    return items
  return items.filter(item => item.label.toLowerCase().includes(needle))
}

const visibleItems = computed(() => (props.filter ?? defaultFilter)(props.items, queryValue.value))

interface RenderedGroup {
  key: string
  label: string
  items: SidebarNavItem[]
}

// Ungrouped items lead the list under no header. A group with nothing left
// after filtering drops its header too, rather than leaving a floating label.
const renderedGroups = computed<RenderedGroup[]>(() => {
  const groups: SidebarNavGroup[] = props.groups ?? []
  const known = new Set(groups.map(group => group.key))
  const loose = visibleItems.value.filter(item => !item.group || !known.has(item.group))

  const result: RenderedGroup[] = []
  if (loose.length)
    result.push({ key: '__ungrouped', label: '', items: loose })

  for (const group of groups) {
    const items = visibleItems.value.filter(item => item.group === group.key)
    if (items.length)
      result.push({ key: group.key, label: group.label, items })
  }
  return result
})

// The highlight tracks the pointer first and the selection second, so it reads
// as "where you are about to go" rather than a second selected state.
const indicatorKey = computed<SidebarNavValue | null>(() => {
  const pointer = hovered.value
  if (pointer !== null && visibleItems.value.some(item => item.value === pointer))
    return pointer
  const active = props.modelValue
  if (active !== undefined && visibleItems.value.some(item => item.value === active))
    return active
  return null
})

const { box, revealed, measure } = useIndicatorBox({
  container: navRef,
  target: () => {
    const key = indicatorKey.value
    return key === null ? null : itemEls.get(key)
  },
})

const indicatorStyle = computed(() => ({
  top: `${box.value?.top ?? 0}px`,
  height: `${box.value?.height ?? 0}px`,
  opacity: box.value ? 1 : 0,
  '--tx-bui-sidebar-nav-indicator-duration': `${props.indicatorDuration}ms`,
}))

function isActive(item: SidebarNavItem) {
  return props.modelValue !== undefined && item.value === props.modelValue
}

function onSelect(item: SidebarNavItem) {
  if (item.disabled)
    return
  emit('update:modelValue', item.value)
  emit('select', item)
}

function onQueryInput(event: Event) {
  emit('update:query', (event.target as HTMLInputElement).value)
}

function focusSearch() {
  searchInputRef.value?.focus()
}

// The hint drives the binding, so the badge and the behaviour cannot drift:
// upstream renders a `/` plate that is wired to nothing, which is the defect
// being fixed here. Multi-character hints ('⌘K') are glyphs, not key values,
// so they render without claiming a key — wire those with `focusSearch()`.
const shortcutKey = computed(() =>
  props.searchHint && props.searchHint.length === 1 ? props.searchHint : null,
)

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    return true
  // `isContentEditable` covers inherited editability (the caret sits in a <b>
  // inside the editable host, so the attribute is on an ancestor); the
  // `closest` walk covers engines that do not implement the property, jsdom
  // among them. Neither alone is sufficient.
  return target.isContentEditable || !!target.closest('[contenteditable]:not([contenteditable="false"])')
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (!shortcutKey.value || !props.searchPlaceholder)
    return
  // Never steal the key from someone already typing, from a chord, or from a
  // handler that has already claimed this press.
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return
  if (event.key !== shortcutKey.value || isTypingTarget(event.target))
    return
  event.preventDefault()
  focusSearch()
}

onMounted(() => {
  if (typeof document !== 'undefined')
    document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined')
    document.removeEventListener('keydown', onDocumentKeydown)
})

function workspaceInitials(name: string, initials?: string) {
  return initials ?? name.slice(0, 1)
}

defineExpose({
  focusSearch,
  /** Re-measures the highlight after a layout change the observers cannot see. */
  refreshIndicator: measure,
})
</script>

<template>
  <nav class="tx-bui-sidebar-nav" :aria-label="ariaLabel">
    <slot name="workspace">
      <button
        v-if="workspace"
        type="button"
        class="tx-bui-sidebar-nav__workspace"
        :aria-label="workspaceLabel"
        @click="emit('workspaceClick')"
      >
        <TxIconChip :size="32" tone="ink" :font-size="13">
          {{ workspaceInitials(workspace.name, workspace.initials) }}
        </TxIconChip>
        <span class="tx-bui-sidebar-nav__workspace-text">
          <span class="tx-bui-sidebar-nav__workspace-name">{{ workspace.name }}</span>
          <span v-if="workspace.description" class="tx-bui-sidebar-nav__workspace-desc">
            {{ workspace.description }}
          </span>
        </span>
        <svg
          class="tx-bui-sidebar-nav__workspace-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
        </svg>
      </button>
    </slot>

    <label v-if="searchPlaceholder" class="tx-bui-sidebar-nav__search">
      <svg
        class="tx-bui-sidebar-nav__search-icon"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        ref="searchInputRef"
        class="tx-bui-sidebar-nav__search-input"
        type="text"
        :value="queryValue"
        :placeholder="searchPlaceholder"
        :aria-label="searchLabel || searchPlaceholder"
        @input="onQueryInput"
      >
      <kbd v-if="searchHint" class="tx-bui-sidebar-nav__search-hint" aria-hidden="true">
        {{ searchHint }}
      </kbd>
    </label>

    <button
      v-if="actionLabel"
      type="button"
      class="tx-bui-sidebar-nav__action"
      @click="emit('action')"
    >
      <span class="tx-bui-sidebar-nav__action-label">{{ actionLabel }}</span>
      <span class="tx-bui-sidebar-nav__action-plus" aria-hidden="true">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </button>

    <div
      ref="navRef"
      class="tx-bui-sidebar-nav__body"
      @mouseleave="hovered = null"
    >
      <span
        class="tx-bui-sidebar-nav__indicator"
        :class="{ 'is-revealed': revealed }"
        :style="indicatorStyle"
        aria-hidden="true"
      />

      <div v-for="group in renderedGroups" :key="group.key" class="tx-bui-sidebar-nav__group">
        <div v-if="group.label" :id="groupLabelId(group.key)" class="tx-bui-sidebar-nav__group-label">
          {{ group.label }}
        </div>
        <ul
          class="tx-bui-sidebar-nav__list"
          :aria-labelledby="group.label ? groupLabelId(group.key) : undefined"
        >
          <li
            v-for="item in group.items"
            :key="item.value"
            :ref="el => setItemRef(item.value, el as Element | null)"
            class="tx-bui-sidebar-nav__item"
            :class="{ 'is-active': isActive(item) }"
            @mouseenter="hovered = item.value"
            @focusin="hovered = item.value"
            @focusout="hovered = null"
          >
            <button
              type="button"
              class="tx-bui-sidebar-nav__row"
              :disabled="item.disabled"
              :aria-current="isActive(item) ? 'page' : undefined"
              @click="onSelect(item)"
            >
              <span class="tx-bui-sidebar-nav__icon">
                <slot name="item-icon" :item="item" :active="isActive(item)">
                  <i v-if="item.icon" :class="item.icon" aria-hidden="true" />
                </slot>
              </span>
              <span class="tx-bui-sidebar-nav__label">{{ item.label }}</span>
              <span
                v-if="item.badge !== undefined"
                :key="String(item.badge)"
                class="tx-bui-sidebar-nav__badge"
              >{{ item.badge }}</span>
            </button>
            <button
              v-if="item.action"
              type="button"
              class="tx-bui-sidebar-nav__item-action"
              :aria-label="item.action.label"
              :disabled="item.disabled"
              @click="emit('itemAction', item)"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <slot name="footer" />
  </nav>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;

.tx-bui-sidebar-nav {
  @include bui-scope;

  width: var(--tx-bui-sidebar-nav-width, 240px);
  padding: 8px;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-card, 10px);
  box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 0 2px 10px #0000000b);

  &__workspace {
    @include bui-press-scale;

    display: flex;
    gap: 10px;
    align-items: center;
    width: 100%;
    padding: 6px;
    margin-bottom: 8px;
    text-align: left;
    cursor: pointer;
    border-radius: var(--tx-bui-radius-control, 8px);
    transition:
      background-color 100ms ease,
      transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:hover {
      background: var(--tx-bui-hover, #f4f5f6);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: -2px;
    }
  }

  &__workspace-text {
    display: block;
    flex: 1;
    min-width: 0;
  }

  &__workspace-name {
    display: block;
    overflow: hidden;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.25;
    color: var(--tx-bui-ink, #1f2124);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__workspace-desc {
    display: block;
    overflow: hidden;
    font-size: 11px;
    line-height: 1.25;
    color: var(--tx-bui-ink-3, #9a9da3);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__workspace-chevron {
    flex-shrink: 0;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  &__search {
    display: flex;
    gap: 8px;
    align-items: center;
    height: 32px;
    padding: 0 10px;
    margin-bottom: 4px;
    background: var(--tx-bui-inset, #f7f8f9);
    border-radius: var(--tx-bui-radius-control, 8px);
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);

    &:focus-within {
      box-shadow: 0 0 0 1px var(--tx-bui-accent, #0285ff);
    }
  }

  &__search-icon {
    flex-shrink: 0;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  &__search-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    font: inherit;
    font-size: 12.5px;
    color: var(--tx-bui-ink, #1f2124);
    background: transparent;
    border: 0;
    outline: none;

    &::placeholder {
      color: var(--tx-bui-ink-3, #9a9da3);
    }
  }

  // Not TxKbd: that primitive floors at 22px and paints itself from the
  // `--tx-*` ramp with a gradient and a bottom-border lip. This hint is an
  // 18px BUI plate on `surface` with a hairline ring.
  &__search-hint {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    font-family: inherit;
    font-size: 10px;
    color: var(--tx-bui-ink-3, #9a9da3);
    background: var(--tx-bui-surface, #fff);
    border-radius: 5px;
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  }

  &__action {
    @include bui-press-scale;

    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--tx-bui-accent, #0285ff);
    text-align: left;
    cursor: pointer;
    border-radius: var(--tx-bui-radius-control, 8px);
    transition:
      background-color 100ms ease,
      transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:hover {
      background: var(--tx-bui-accent-tint, #e9f3ff);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: -2px;
    }
  }

  &__action-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__action-plus {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: #fff;
    background: var(--tx-bui-accent, #0285ff);
    border-radius: 999px;
  }

  &__body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  // One travelling plate rather than a background per row: the highlight reads
  // as a single object moving, which is what makes the list feel responsive.
  &__indicator {
    position: absolute;
    right: 0;
    left: 0;
    pointer-events: none;
    background: var(--tx-bui-hover, #f4f5f6);
    border-radius: 7px;

    &.is-revealed {
      transition:
        top var(--tx-bui-sidebar-nav-indicator-duration, 220ms) var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
        height var(--tx-bui-sidebar-nav-indicator-duration, 220ms) var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
        opacity 150ms ease;
    }
  }

  &__group-label {
    padding: 4px 8px;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--tx-bui-ink-3, #9a9da3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  &__item {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
  }

  &__row {
    @include bui-press-scale;

    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 6px 8px;
    text-align: left;
    cursor: pointer;
    border-radius: 7px;
    transition:
      color 150ms ease,
      transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: -2px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    line-height: 1;
    color: var(--tx-bui-ink-3, #9a9da3);
    transition: color 150ms ease;

    > svg {
      width: 13px;
      height: 13px;
    }
  }

  &__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    color: var(--tx-bui-ink-2, #62656b);
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 150ms ease;
  }

  &__badge {
    @include bui-tabular-nums;
    @include bui-pop-in(250ms);

    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--tx-bui-accent-ink, #0170dd);
    background: var(--tx-bui-accent-tint, #e9f3ff);
    border-radius: 999px;
  }

  // A real button, not upstream's inert <span>, and a sibling of the row
  // rather than a child — nesting it would be invalid interactive content.
  &__item-action {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 8px;
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: pointer;
    border-radius: 5px;
    opacity: 0;
    transition:
      background-color 100ms ease,
      color 100ms ease,
      opacity 100ms ease;

    &:hover {
      color: var(--tx-bui-ink-2, #62656b);
      background: color-mix(in oklab, var(--tx-bui-line, #ecedef) 70%, transparent);
    }

    &:focus-visible {
      opacity: 1;
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: 1px;
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  &__item:hover &__item-action,
  &__item:focus-within &__item-action,
  &__item.is-active &__item-action {
    opacity: 1;
  }

  &__item.is-active {
    .tx-bui-sidebar-nav__icon {
      color: var(--tx-bui-ink, #1f2124);
    }

    .tx-bui-sidebar-nav__label {
      font-weight: 500;
      color: var(--tx-bui-ink, #1f2124);
    }

    .tx-bui-sidebar-nav__badge {
      color: var(--tx-bui-ink-2, #62656b);
      background: var(--tx-bui-surface, #fff);
      box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
    }
  }

  // Hover is the only affordance upstream gives the quick action, which hides
  // it outright on touch.
  @media (hover: none) {
    &__item-action {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    &__workspace,
    &__action,
    &__row,
    &__icon,
    &__label,
    &__item-action,
    &__indicator.is-revealed {
      transition: none;
    }
  }
}
</style>
