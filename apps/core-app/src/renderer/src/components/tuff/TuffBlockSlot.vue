<script lang="ts" name="TuffBlockSlot" setup>
import { computed } from 'vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { type IconValue, toIcon } from './tuff-icon-utils'

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    defaultIcon?: IconValue
    activeIcon?: IconValue
    iconSize?: number
    disabled?: boolean
    active?: boolean
  }>(),
  {
    title: '',
    description: '',
    iconSize: 20,
    disabled: false,
    active: false
  }
)

const emits = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const defaultIcon = computed(() => toIcon(props.defaultIcon))
const activeIcon = computed(() => toIcon(props.activeIcon))

const currentIcon = computed(() => {
  if (props.active) {
    return activeIcon.value ?? defaultIcon.value
  }
  return defaultIcon.value ?? activeIcon.value
})

function handleClick(event: MouseEvent) {
  if (props.disabled) return
  emits('click', event)
}
</script>

<template>
  <div
    class="TBlockSlot-Container TBlockSelection fake-background index-fix"
    :class="{ disabled }"
    @click="handleClick"
  >
    <div class="TBlockSlot-Content TBlockSelection-Content">
      <slot name="icon" :active="active">
        <TuffIcon v-if="currentIcon" :icon="currentIcon" :size="iconSize" />
      </slot>
      <div class="TBlockSlot-Label TBlockSelection-Label">
        <template v-if="$slots.label">
          <slot name="label" />
          <div v-if="$slots.tags" class="TBlockSlot-Tags TBlockSlot-Tags--after">
            <slot name="tags" />
          </div>
        </template>
        <template v-else>
          <div class="TBlockSlot-TitleRow">
            <h5 class="text-sm">
              {{ title }}
            </h5>
            <div v-if="$slots.tags" class="TBlockSlot-Tags">
              <slot name="tags" />
            </div>
          </div>
          <p>{{ description }}</p>
        </template>
      </div>
    </div>
    <div class="TBlockSlot-Slot TBlockSelection-Func">
      <slot :active="active" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TBlockSlot-Container {
  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .TBlockSlot-Slot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-left: auto;
    flex-shrink: 0;
    gap: 8px;
  }

  .TBlockSlot-Content {
    display: flex;
    align-items: center;

    width: 100%;
    height: 100%;

    box-sizing: border-box;

    cursor: pointer;

    > * {
      margin-right: 16px;

      font-size: 24px;
    }

    > .TBlockSlot-Label {
      flex: 1;

      > h3 {
        margin: 0;

        font-size: 14px;
        font-weight: 500;
      }

      > p {
        margin: 2px 0 0;

        font-size: 12px;
        font-weight: 400;

        opacity: 0.5;
      }
    }

    .TBlockSlot-TitleRow {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      width: 100%;
    }

    .TBlockSlot-Tags {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      flex: 0 0 auto;
      max-width: 100%;
      align-self: flex-start;
      height: auto;
    }

    .TBlockSlot-Tags--after {
      margin-top: 4px;
    }
  }

  position: relative;
  padding: 4px 16px;
  display: flex;

  justify-content: space-between;
  align-items: center;

  width: 100%;
  height: 56px;

  user-select: none;
  border-radius: 12px;
  box-sizing: border-box;
  --fake-color: var(--el-fill-color-dark);
  --fake-radius: 12px;
  --fake-opacity: 0.5;
  transition:
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s ease;

  &:hover {
    --fake-color: var(--el-fill-color);
  }

  &:active:not(.disabled) {
    transform: scale(0.985);
  }
}

.touch-blur .TBlockSlot-Container {
  --fake-color: var(--el-fill-color);

  &:hover {
    --fake-color: var(--el-fill-color-dark);
  }
}
</style>
