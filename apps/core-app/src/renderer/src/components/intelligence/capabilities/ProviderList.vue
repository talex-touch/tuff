<template>
  <div class="provider-list">
    <div class="provider-list__section">
      <p class="provider-list__label">{{ t('settings.intelligence.capabilityActionsLabel') }}</p>
      <p class="provider-list__hint">{{ t('settings.intelligence.capabilityActionsHint') }}</p>
    </div>

    <div class="provider-list__container">
      <div v-if="enabledBindings.length === 0" class="provider-list__empty">
        <p>{{ t('settings.intelligence.capabilityActionsEmpty') }}</p>
      </div>
      <draggable
        v-else
        v-model="sortableBindings"
        item-key="providerId"
        class="provider-list__draggable"
        :handle="'.provider-item__grab'"
        @end="handleDragEnd"
      >
        <template #item="{ element }">
          <button
            type="button"
            class="provider-item"
            :class="{ 'is-selected': focusedProviderId === element.providerId }"
            @click="$emit('select', element.providerId)"
          >
            <i class="i-carbon-drag-horizontal provider-item__grab" aria-hidden="true" />
            <div class="provider-item__content">
              <span class="provider-item__name">{{
                element.provider?.name || element.providerId
              }}</span>
              <span class="provider-item__meta">
                {{ element.provider?.type || element.providerId }}
                <span v-if="element.models?.length" class="provider-item__badge">
                  {{ element.models.length }} {{ t('settings.intelligence.models') }}
                </span>
              </span>
            </div>
            <i class="i-carbon-checkmark provider-item__check" aria-hidden="true" />
          </button>
        </template>
      </draggable>
    </div>

    <div v-if="disabledBindings.length" class="provider-list__section">
      <p class="provider-list__label">{{ t('settings.intelligence.capabilityDisabledLabel') }}</p>
    </div>
    <div v-if="disabledBindings.length" class="provider-list__disabled">
      <button
        v-for="entry in disabledBindings"
        :key="entry.providerId"
        class="provider-item provider-item--disabled"
        type="button"
        @click="$emit('select', entry.providerId)"
      >
        <div class="provider-item__content">
          <span class="provider-item__name">{{
            entry.provider?.name || entry.providerId
          }}</span>
          <span class="provider-item__meta">{{
            entry.provider?.type || entry.providerId
          }}</span>
        </div>
        <span class="provider-item__status">{{ t('settings.intelligence.disabled') }}</span>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable as draggable } from 'vue-draggable-plus'
import type { CapabilityBinding } from './types'

const props = defineProps<{
  enabledBindings: CapabilityBinding[]
  disabledBindings: CapabilityBinding[]
  focusedProviderId: string
}>()

const emits = defineEmits<{
  select: [providerId: string]
  reorder: [bindings: CapabilityBinding[]]
}>()

const { t } = useI18n()

const sortableBindings = ref<CapabilityBinding[]>([])

watch(
  () => props.enabledBindings,
  (list) => {
    sortableBindings.value = list
  },
  { immediate: true, deep: true }
)

function handleDragEnd(): void {
  emits('reorder', sortableBindings.value)
}
</script>

<style lang="scss" scoped>
.provider-list__section {
  margin-bottom: 0.75rem;
}

.provider-list__label {
  font-weight: 600;
  font-size: 0.9rem;
  margin: 0 0 0.25rem 0;
  color: var(--el-text-color-primary);
}

.provider-list__hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.8rem;
  line-height: 1.4;
}

.provider-list__container {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 0.75rem;
  background: var(--el-fill-color-blank);
  padding: 0.5rem;
  min-height: 100px;
}

.provider-list__empty {
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
  text-align: center;
  padding: 1.5rem 1rem;
}

.provider-list__draggable {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.provider-list__disabled {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.provider-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.625rem;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-border-color);
    background: var(--el-fill-color-light);
  }

  &.is-selected {
    border-color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 8%, var(--el-fill-color-blank));

    .provider-item__check {
      opacity: 1;
      color: var(--el-color-primary);
    }
  }

  &--disabled {
    opacity: 0.7;
  }
}

.provider-item__grab {
  font-size: 1rem;
  color: var(--el-text-color-placeholder);
  cursor: grab;
  flex-shrink: 0;
}

.provider-item__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  text-align: left;
  gap: 0.25rem;
}

.provider-item__name {
  font-weight: 600;
  font-size: 0.9rem;
}

.provider-item__meta {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.provider-item__badge {
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  font-size: 0.75rem;
}

.provider-item__check {
  font-size: 1.125rem;
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.provider-item__status {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}

.provider-list__draggable :deep(.sortable-ghost) {
  opacity: 0.5;
}
</style>
