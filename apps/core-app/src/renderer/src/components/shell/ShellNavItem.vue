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
  <button class="ShellNavItem" :class="{ active: isActive }" type="button" @click="activate">
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
  padding: 7px 10px;
  border: none;
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
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }
}

.ShellNavItem-Icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
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
}

.ShellNavItem-Badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}
</style>
