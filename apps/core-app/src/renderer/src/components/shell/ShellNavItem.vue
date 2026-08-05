<script lang="ts" name="ShellNavItem" setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    /** UnoCSS icon class, e.g. `i-ri-settings-3-line`. */
    icon: string
    label: string
    /** Target route. Omit to make the item a pure button driven by `@select`. */
    to?: string
    /** Optional trailing count badge. */
    badge?: string | number
    /** Force the active state instead of deriving it from the current route. */
    active?: boolean
  }>(),
  {
    to: undefined,
    badge: undefined,
    active: undefined
  }
)

const emit = defineEmits<{ select: [] }>()

const route = useRoute()
const router = useRouter()

const isActive = computed(() => {
  if (props.active !== undefined) return props.active
  if (!props.to) return false
  return route.path === props.to || route.path.startsWith(`${props.to}/`)
})

function activate(): void {
  emit('select')
  if (props.to && route.path !== props.to) {
    void router.push(props.to)
  }
}
</script>

<template>
  <button
    class="ShellNavItem"
    :class="{ active: isActive }"
    type="button"
    :aria-current="isActive ? 'page' : undefined"
    :title="label"
    @click="activate"
  >
    <span class="ShellNavItem-Icon" :class="icon" />
    <span class="ShellNavItem-Label">{{ label }}</span>
    <span v-if="badge !== undefined" class="ShellNavItem-Badge">{{ badge }}</span>
  </button>
</template>

<style lang="scss" scoped>
.ShellNavItem {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover:not(.active) {
    background: var(--shell-surface-2);
  }

  &.active {
    border-color: transparent;
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  // Rail mode stacks the label under the icon instead of dropping it. Eleven settings glyphs
  // are not self-evident, and a named column stays scannable at any width.
  .is-rail & {
    flex-direction: column;
    gap: 3px;
    justify-content: center;
    padding: 6px 2px;
    text-align: center;
  }
}

/**
 * Fixed at every sidebar width. `flex: 0 0 auto` alone is not enough: the generated icon class
 * sizes itself in `em`, so the glyph would ride whatever font-size it inherits. Pinning
 * `font-size` too keeps the column of icons identical from 360px down to the rail.
 */
.ShellNavItem-Icon {
  flex: 0 0 auto;
  width: 16px;
  min-width: 16px;
  height: 16px;
  min-height: 16px;
  font-size: 16px;
}

.ShellNavItem-Label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--shell-fs-body);

  .active & {
    font-weight: 500;
  }

  // One step down rather than hidden. `flex: 0 0 auto` because the rail lays the item out as a
  // column, where the label must take its own height instead of stretching along the main axis.
  .is-rail & {
    flex: 0 0 auto;
    max-width: 100%;
    font-size: 10px;
    line-height: 1.25;
  }
}

.ShellNavItem-Badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  .is-rail & {
    display: none;
  }
}
</style>
