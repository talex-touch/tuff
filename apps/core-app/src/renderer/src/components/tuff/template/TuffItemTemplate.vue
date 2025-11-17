<template>
  <div
    class="TuffItemTemplate fake-background"
    :class="{
      'is-selected': selected,
      'is-disabled': disabled,
      'is-clickable': clickable,
      'has-error': hasError,
      [`size-${size}`]: true
    }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-label="ariaLabel"
    :aria-pressed="selected"
    :aria-disabled="disabled"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <!-- Top-Right Badge Slot -->
    <div v-if="$slots['badge-top'] || topBadge" class="TuffItemTemplate-BadgeTop">
      <slot name="badge-top">
        <TuffStatusBadge
          v-if="topBadge"
          :text="topBadge.text"
          :icon="topBadge.icon"
          :status="topBadge.status"
          :status-key="topBadge.statusKey"
          size="sm"
        />
      </slot>
    </div>

    <!-- Bottom-Right Badge Slot -->
    <div v-if="$slots['badge-bottom'] || bottomBadge" class="TuffItemTemplate-BadgeBottom">
      <slot name="badge-bottom">
        <TuffStatusBadge
          v-if="bottomBadge"
          :text="bottomBadge.text"
          :icon="bottomBadge.icon"
          :status="bottomBadge.status"
          :status-key="bottomBadge.statusKey"
          size="sm"
        />
      </slot>
    </div>

    <!-- Left Icon -->
    <div class="TuffItemTemplate-Icon" :class="iconClass">
      <slot name="icon">
        <TuffIcon v-if="icon" :icon="icon" :alt="title" />
      </slot>
      <!-- Status Dot on Icon -->
      <div
        v-if="statusDot"
        class="TuffItemTemplate-StatusDot"
        :class="statusDot.class"
        :style="{ backgroundColor: statusDot.color }"
        role="status"
        :aria-label="statusDot.label"
      />
    </div>

    <!-- Main Content (Title + Subtitle) -->
    <div class="TuffItemTemplate-Content">
      <div class="TuffItemTemplate-Title">
        <slot name="title">
          <span class="TuffItemTemplate-TitleText">{{ title }}</span>
        </slot>
        <!-- Inline Badge (next to title) -->
        <slot name="title-badge" />
      </div>

      <div v-if="$slots.subtitle || subtitle" class="TuffItemTemplate-Subtitle">
        <slot name="subtitle">
          <span class="TuffItemTemplate-SubtitleText">{{ subtitle }}</span>
        </slot>
      </div>
    </div>

    <!-- Right Side Content -->
    <div v-if="$slots.trailing" class="TuffItemTemplate-Trailing">
      <slot name="trailing" />
    </div>
  </div>
</template>

<script lang="ts" name="TuffItemTemplate" setup>
import TuffStatusBadge from '../TuffStatusBadge.vue'

export type TuffItemBadge = {
  text: string
  icon?: string
  status?: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  statusKey?: string
}

export type TuffItemStatusDot = {
  color?: string
  class?: string
  label?: string
}

export type TuffItemTemplateProps = {
  // Main content
  title?: string
  subtitle?: string
  icon?: string
  iconClass?: string

  // Badges
  topBadge?: TuffItemBadge
  bottomBadge?: TuffItemBadge

  // Status
  statusDot?: TuffItemStatusDot

  // States
  selected?: boolean
  disabled?: boolean
  clickable?: boolean
  hasError?: boolean

  // Size
  size?: 'sm' | 'md' | 'lg'

  // Accessibility
  ariaLabel?: string
}

const props = withDefaults(defineProps<TuffItemTemplateProps>(), {
  title: '',
  subtitle: '',
  icon: '',
  iconClass: '',
  topBadge: undefined,
  bottomBadge: undefined,
  statusDot: undefined,
  selected: false,
  disabled: false,
  clickable: true,
  hasError: false,
  size: 'md',
  ariaLabel: ''
})

const emit = defineEmits<{
  click: [event: MouseEvent | KeyboardEvent]
}>()

function handleClick(event: MouseEvent | KeyboardEvent) {
  if (props.disabled || !props.clickable) return
  emit('click', event)
}
</script>

<style lang="scss" scoped>
.TuffItemTemplate {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  border-radius: 18px;
  border: 2px solid transparent;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &.is-clickable {
    cursor: pointer;

    &:hover:not(.is-disabled) {
      border-color: var(--el-border-color);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      transform: translateY(-1px);
    }

    &:active:not(.is-disabled) {
      transform: translateY(0);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }
  }

  &:focus-visible {
    outline: 3px solid var(--el-color-primary);
    outline-offset: 2px;
    border-color: var(--el-color-primary-light-5);
  }

  &.is-selected {
    border-color: var(--el-color-primary-light-3);
    background-color: color-mix(in srgb, var(--el-color-primary) 5%, var(--el-fill-color-blank));
    box-shadow: 0 2px 12px rgba(var(--el-color-primary-rgb), 0.15);

    &:hover:not(.is-disabled) {
      box-shadow: 0 4px 16px rgba(var(--el-color-primary-rgb), 0.2);
    }
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.has-error {
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border: 1px solid var(--el-color-error-light-5);
      border-radius: inherit;
      pointer-events: none;
      opacity: 0.3;
      animation: pulse-error 2s ease-in-out infinite;
    }
  }

  // Size variants
  &.size-sm {
    height: 3.5rem;
    padding: 0.375rem;
  }

  &.size-md {
    height: 5rem;
    padding: 0.5rem;
  }

  &.size-lg {
    height: 6rem;
    padding: 0.75rem;
  }
}

@keyframes pulse-error {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.5;
  }
}

// Icon
.TuffItemTemplate-Icon {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 0.75rem;
  background-color: var(--el-fill-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  .size-sm & {
    width: 2.5rem;
    height: 2.5rem;

    i {
      font-size: 1.25rem;
    }
  }

  .size-md & {
    width: 3rem;
    height: 3rem;

    i {
      font-size: 1.5rem;
    }
  }

  .size-lg & {
    width: 3.5rem;
    height: 3.5rem;

    i {
      font-size: 1.75rem;
    }
  }

  i {
    transition: transform 0.3s ease;
  }

  .TuffItemTemplate:hover & {
    background-color: var(--el-fill-color-light);
    transform: scale(1.05);

    i {
      transform: scale(1.1);
    }
  }

  .TuffItemTemplate.is-selected & {
    background: linear-gradient(135deg, var(--el-fill-color-light) 0%, var(--el-fill-color) 100%);
  }
}

// Content
.TuffItemTemplate-Content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
}

.TuffItemTemplate-Title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.TuffItemTemplate-TitleText {
  font-size: 1rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.3s ease;

  .size-sm & {
    font-size: 0.875rem;
  }

  .size-lg & {
    font-size: 1.125rem;
  }

  .TuffItemTemplate:hover & {
    color: var(--el-color-primary);
  }
}

.TuffItemTemplate-Subtitle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.TuffItemTemplate-SubtitleText {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .size-sm & {
    font-size: 0.6875rem;
  }

  .size-lg & {
    font-size: 0.875rem;
  }
}

// Trailing (right side)
.TuffItemTemplate-Trailing {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.TuffItemTemplate-StatusDot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 0 2px var(--el-fill-color-blank);

  &.is-active {
    background-color: var(--el-color-success);
    animation: pulse-success 2s ease-in-out infinite;
  }

  &.is-inactive {
    background-color: var(--el-text-color-disabled);
  }

  &.is-error {
    background-color: var(--el-color-error);
  }

  &.is-warning {
    background-color: var(--el-color-warning);
  }
}

@keyframes pulse-success {
  0%,
  100% {
    box-shadow:
      0 0 0 2px var(--el-fill-color-blank),
      0 0 0 4px rgba(34, 197, 94, 0.2);
  }
  50% {
    box-shadow:
      0 0 0 2px var(--el-fill-color-blank),
      0 0 0 6px rgba(34, 197, 94, 0.1);
  }
}

// Badges
.TuffItemTemplate-BadgeTop,
.TuffItemTemplate-BadgeBottom {
  position: absolute;
  right: 0.5rem;
  z-index: 10;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.05);
  }
}

.TuffItemTemplate-BadgeTop {
  top: 0.5rem;
}

.TuffItemTemplate-BadgeBottom {
  bottom: 0.5rem;
}
</style>
