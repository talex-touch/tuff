<script
  setup
  lang="ts"
  name="TuffAsideList"
  generic="T extends Record<string, any> = Record<string, any>"
>
type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'muted'

type BadgeInfo = {
  label?: string
  variant?: BadgeVariant
}

const props = withDefaults(
  defineProps<{
    items?: T[]
    selectedId?: string | number | null
    getId?: (item: T) => string | number
    getTitle?: (item: T) => string
    getDescription?: (item: T) => string | undefined
    getBadge?: (item: T) => BadgeInfo
    isDisabled?: (item: T) => boolean
    emptyText?: string
  }>(),
  {
    items: () => [] as T[],
    selectedId: null,
    emptyText: ''
  }
)

const emit = defineEmits<{
  (event: 'update:selectedId', value: string | number | null): void
  (event: 'select', value: string | number | null): void
}>()

function resolveId(item: T): string | number {
  if (props.getId) return props.getId(item)
  const fallback = (item as { id?: string | number }).id
  if (fallback === undefined) {
    throw new Error('[TuffAsideList] item id is required when getId is not provided')
  }
  return fallback
}

function resolveTitle(item: T): string {
  if (props.getTitle) return props.getTitle(item)
  return (item as { title?: string }).title ?? ''
}

function resolveDescription(item: T): string | undefined {
  return props.getDescription
    ? props.getDescription(item)
    : (item as { description?: string }).description
}

function resolveBadge(item: T): BadgeInfo {
  if (props.getBadge) return props.getBadge(item) ?? {}
  const meta = item as { badgeLabel?: string; badgeVariant?: BadgeVariant }
  return {
    label: meta.badgeLabel,
    variant: meta.badgeVariant
  }
}

function resolveDisabled(item: T): boolean {
  if (props.isDisabled) return props.isDisabled(item)
  return Boolean((item as { disabled?: boolean }).disabled)
}

function handleSelect(item: T): void {
  if (resolveDisabled(item)) return
  const id = resolveId(item)
  emit('update:selectedId', id)
  emit('select', id)
}
</script>

<template>
  <div class="tuff-aside-list">
    <ul v-if="props.items.length" class="tuff-aside-list__items" role="listbox">
      <li v-for="item in props.items" :key="resolveId(item)">
        <button
          class="tuff-aside-list__item fake-background"
          type="button"
          role="option"
          :class="{
            'is-active': resolveId(item) === props.selectedId,
            'is-disabled': resolveDisabled(item)
          }"
          :aria-pressed="resolveId(item) === props.selectedId"
          @click="handleSelect(item)"
        >
          <slot name="item" :item="item" :is-active="resolveId(item) === props.selectedId">
            <div class="tuff-aside-list__content">
              <p class="tuff-aside-list__title">{{ resolveTitle(item) }}</p>
              <p v-if="resolveDescription(item)" class="tuff-aside-list__desc">
                {{ resolveDescription(item) }}
              </p>
            </div>
            <template v-if="resolveBadge(item).label">
              <span
                class="tuff-aside-list__badge"
                :class="`is-${resolveBadge(item).variant ?? 'default'}`"
              >
                {{ resolveBadge(item).label }}
              </span>
            </template>
          </slot>
        </button>
      </li>
    </ul>
    <p v-else class="tuff-aside-list__empty" role="status">
      <slot name="empty">
        {{ props.emptyText }}
      </slot>
    </p>
  </div>
</template>

<style scoped lang="scss">
.tuff-aside-list__items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tuff-aside-list__item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 1rem;
  overflow: hidden;
  padding: 0.9rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  text-align: left;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;
  cursor: pointer;

  &:hover {
    border-color: var(--el-border-color);
    background: var(--el-fill-color);
  }

  &.is-active {
    border-color: rgba(99, 102, 241, 0.6);
    background: rgba(99, 102, 241, 0.08);
  }

  &.is-disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.tuff-aside-list__content {
  flex: 1;
}

.tuff-aside-list__title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--el-text-color-primary);
}

.tuff-aside-list__desc {
  margin-top: 0.2rem;
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}

.tuff-aside-list__badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);

  &.is-info {
    background: rgba(99, 102, 241, 0.1);
    color: #6366f1;
  }

  &.is-success {
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
  }

  &.is-warning {
    background: rgba(251, 191, 36, 0.2);
    color: #b45309;
  }

  &.is-muted {
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
  }
}

.tuff-aside-list__empty {
  padding: 1rem;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 1rem;
  text-align: center;
  font-size: 0.9rem;
  color: var(--el-text-color-secondary);
}
</style>
