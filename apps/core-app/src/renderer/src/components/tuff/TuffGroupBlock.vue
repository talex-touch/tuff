<script lang="ts" name="TuffGroupBlock" setup>
// Legacy CoreApp business wrapper: keep the existing API while delegating primitives to TuffEx.
import type { IconValue } from './tuff-icon-utils'

/**
 * Artboard `iqbKR` reshapes the group: the label moved out above the card, the card became a
 * single hairline-bordered container of rows, and the header — icon, chevron, collapse — is gone.
 *
 * The collapse and icon props stay declared so the ~40 existing call sites keep compiling, but
 * they no longer do anything: the block is always expanded and never draws an icon.
 */
withDefaults(
  defineProps<{
    /** Group label, rendered above the card. */
    name?: string
    /** Second, smaller line under the label. Also outside the card. */
    description?: string
    /** No-op since v2: groups carry no icon. */
    defaultIcon?: IconValue
    /** No-op since v2. */
    activeIcon?: IconValue
    /** No-op since v2. */
    iconSize?: number
    /** No-op since v2: groups no longer collapse. */
    collapsible?: boolean
    /** No-op since v2. */
    collapsed?: boolean
    /** No-op since v2. */
    defaultExpand?: boolean
    /** No-op since v2: there is no expand state left to remember. */
    memoryName?: string
  }>(),
  {
    name: '',
    description: '',
    iconSize: 22,
    collapsible: true,
    collapsed: false,
    defaultExpand: true
  }
)
</script>

<template>
  <div class="TGroupBlock-Container">
    <div v-if="name || description || $slots['header-extra']" class="TGroupBlock-Header">
      <div class="TGroupBlock-Label">
        <span v-if="name" class="TGroupBlock-Name">{{ name }}</span>
        <span v-if="description" class="TGroupBlock-Desc">{{ description }}</span>
      </div>
      <!-- `active` is always true now, so `#header-extra="{ active }"` still destructures. -->
      <slot name="header-extra" :active="true" />
    </div>
    <div class="TGroupBlock-Main">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TGroupBlock-Container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  /*
   * Unchanged from v1. Plenty of pages stack blocks in a parent with no `gap` of its own and
   * rely on this; the settings shell adds its 20px column gap on top, exactly as it already did.
   */
  margin-bottom: 0.7rem;
}

.TGroupBlock-Header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding-left: 2px;
}

.TGroupBlock-Label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.TGroupBlock-Name {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  letter-spacing: 0.2px;
}

.TGroupBlock-Desc {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.TGroupBlock-Main {
  overflow: hidden;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
}

/**
 * Row hairlines, drawn by the card instead of by each child, so any content can be dropped in
 * a group without also having to know the separator rule.
 *
 * Painted as a background image rather than a border or a pseudo-element: a border cannot be
 * inset the 16px the artboard asks for, and `::before` is already spoken for by
 * `.fake-background` on much of the slotted content. A child that sets its own `background`
 * shorthand simply loses its hairline, which is a missing line rather than a broken row.
 */
.TGroupBlock-Main > :deep(* + *) {
  background-image: linear-gradient(var(--shell-border), var(--shell-border));
  background-repeat: no-repeat;
  background-position: 16px 0;
  background-size: calc(100% - 16px) 1px;
}
</style>
