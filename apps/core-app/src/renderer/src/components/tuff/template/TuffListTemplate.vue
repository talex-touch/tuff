<script setup lang="ts" name="TuffListTemplate">
import { reactive } from 'vue'

export interface TuffListGroup<TItem> {
  id: string
  title?: string
  subtitle?: string
  icon?: string
  titleColor?: string
  badgeText?: string
  badgeVariant?: 'info' | 'success' | 'warning' | 'danger'
  items: TItem[]
  collapsible?: boolean
  collapsed?: boolean
  meta?: string
  emptyText?: string
  itemKey?: (item: TItem, index: number) => string
}

export interface TuffListTemplateProps<TItem> {
  groups: TuffListGroup<TItem>[]
  emptyText?: string
}

const props = defineProps<TuffListTemplateProps<any>>()

const emits = defineEmits<{
  'toggle-group': [groupId: string, collapsed: boolean]
}>()

const collapsedState = reactive<Record<string, boolean>>({})

function isGroupCollapsed(group: TuffListGroup<any>): boolean {
  if (!group.collapsible)
    return false
  const stored = collapsedState[group.id]
  if (typeof stored === 'boolean') {
    return stored
  }
  return Boolean(group.collapsed)
}

function toggleGroup(group: TuffListGroup<any>): void {
  if (!group.collapsible)
    return
  const next = !isGroupCollapsed(group)
  collapsedState[group.id] = next
  emits('toggle-group', group.id, next)
}

function setGroupCollapsed(groupId: string, collapsed: boolean): void {
  const group = props.groups.find(item => item.id === groupId)
  if (!group || !group.collapsible)
    return
  collapsedState[group.id] = collapsed
}

const variantTitleColorMap: Record<NonNullable<TuffListGroup<any>['badgeVariant']>, string> = {
  info: 'var(--el-color-info)',
  success: 'var(--el-color-success)',
  warning: 'var(--el-color-warning)',
  danger: 'var(--el-color-danger)',
}

function resolveTitleColor(group: TuffListGroup<any>): string {
  if (group.titleColor) {
    return group.titleColor
  }
  if (group.badgeVariant) {
    return variantTitleColorMap[group.badgeVariant] ?? 'inherit'
  }
  return 'inherit'
}

function getGroupItems(groupId: string) {
  return props.groups.find(group => group.id === groupId)?.items ?? []
}

defineExpose({
  toggleGroup,
  setGroupCollapsed,
  isGroupCollapsed,
  getGroupItems,
})

function getItemKey(group: TuffListGroup<any>, item: any, index: number): string {
  if (group.itemKey) {
    return group.itemKey(item, index)
  }
  return `${group.id}-item-${index}`
}
</script>

<template>
  <div class="TuffListTemplate-Wrapper">
    <div v-if="!props.groups.length && props.emptyText" class="TuffListTemplate-Empty">
      {{ props.emptyText }}
    </div>

    <section v-for="group in props.groups" :key="group.id" class="TuffListTemplate-Group">
      <header
        class="TuffListTemplate-GroupHeader"
        :class="{ 'is-collapsible': group.collapsible }"
        @click="group.collapsible ? toggleGroup(group) : undefined"
      >
        <slot v-if="$slots['group-header']" name="group-header" :group="group" />
        <template v-else>
          <div class="TuffListTemplate-GroupTitle">
            <i v-if="group.icon" :class="group.icon" aria-hidden="true" />
            <div>
              <p
                class="TuffListTemplate-GroupTitleText"
                :style="{ color: resolveTitleColor(group) }"
              >
                {{ group.title }}
              </p>
              <p v-if="group.subtitle" class="TuffListTemplate-GroupSubtitle">
                {{ group.subtitle }}
              </p>
            </div>
          </div>
          <div class="TuffListTemplate-GroupMeta">
            <span v-if="group.badgeText" class="TuffListTemplate-Badge">{{ group.badgeText }}</span>
            <span v-else-if="group.meta" class="TuffListTemplate-Meta">{{ group.meta }}</span>
            <button
              v-if="group.collapsible"
              type="button"
              class="TuffListTemplate-Toggle"
              aria-label="Toggle group"
              :aria-expanded="!isGroupCollapsed(group)"
              @click.stop="toggleGroup(group)"
            >
              <i
                class="transition-transform duration-200" :class="[
                  isGroupCollapsed(group) ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-up-s-line',
                ]"
                aria-hidden="true"
              />
            </button>
          </div>
        </template>
      </header>

      <div
        v-show="!isGroupCollapsed(group)"
        class="TuffListTemplate-GroupBody"
        role="list"
        :aria-label="group.title"
      >
        <template v-if="group.items.length">
          <template v-for="(item, index) in group.items" :key="getItemKey(group, item, index)">
            <slot name="item" :item="item" :group="group" :index="index" />
          </template>
        </template>
        <p v-else class="TuffListTemplate-EmptyGroup" role="status">
          {{ group.emptyText ?? props.emptyText ?? 'No items' }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.TuffListTemplate-Wrapper {
  height: 100%;
  width: 100%;
  position: relative;
}

.TuffListTemplate-Empty {
  padding: 1.5rem;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.TuffListTemplate-Group {
  margin: 0 0 1rem;
}

.TuffListTemplate-GroupHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  cursor: default;
}

.TuffListTemplate-GroupHeader.is-collapsible {
  cursor: pointer;
}

.TuffListTemplate-GroupTitle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.TuffListTemplate-GroupTitle i {
  font-size: 1rem;
}

.TuffListTemplate-GroupTitleText {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--el-text-color-secondary);
}

.TuffListTemplate-GroupSubtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--el-text-color-primary);
}

.TuffListTemplate-GroupMeta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.TuffListTemplate-Badge {
  font-size: 0.5rem;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}

.TuffListTemplate-Meta {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.TuffListTemplate-Toggle {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.TuffListTemplate-GroupBody {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.TuffListTemplate-EmptyGroup {
  margin: 0;
  text-align: center;
  color: var(--el-text-color-tertiary);
  font-size: 0.85rem;
}
</style>
