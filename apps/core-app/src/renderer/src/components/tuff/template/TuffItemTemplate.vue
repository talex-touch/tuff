<script lang="ts" name="TuffItemTemplate" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import TuffIcon from '../../base/TuffIcon.vue'
import TuffStatusBadge from '../TuffStatusBadge.vue'

export interface TuffItemBadge {
  text: string
  icon?: string
  status?: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  statusKey?: string
}

export interface TuffItemStatusDot {
  color?: string
  class?: string
  label?: string
}

export interface TuffItemTemplateProps {
  // Main content
  title?: string
  subtitle?: string
  icon?: ITuffIcon
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
  icon: undefined,
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
    <div
      v-if="$slots.trailing || $slots['badge-top'] || topBadge"
      class="TuffItemTemplate-Trailing"
    >
      <slot name="trailing" />
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
  </div>
</template>

<style lang="scss" scoped>
.TuffItemTemplate {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 100%;
  border-radius: 16px;
  border: 1px solid var(--tx-border-color-lighter);
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &.is-clickable {
    cursor: pointer;

    &:hover:not(.is-disabled) {
      background-color: color-mix(in srgb, var(--tx-fill-color) 60%, transparent);
    }

    &:active:not(.is-disabled) {
      background-color: color-mix(in srgb, var(--tx-fill-color-light) 70%, transparent);
    }
  }

  &:focus-visible {
    outline: 3px solid var(--tx-color-primary);
    outline-offset: 2px;
    border-color: var(--tx-color-primary-light-5);
  }

  &.is-selected {
    border-color: var(--tx-color-primary);
    background-color: color-mix(in srgb, var(--tx-color-primary) 5%, var(--tx-fill-color-blank));
    box-shadow: none;
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
      border: 1px solid var(--tx-color-error-light-5);
      border-radius: inherit;
      pointer-events: none;
      opacity: 0.3;
      animation: pulse-error 2s ease-in-out infinite;
    }
  }

  &.size-sm {
    height: 3rem;
    min-height: 3rem;
    padding: 0.375rem;
  }

  &.size-md {
    height: 4rem;
    min-height: 4rem;
    padding: 0.5rem;
  }

  &.size-lg {
    height: 4.75rem;
    min-height: 4.75rem;
    padding: 0.625rem;
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

.TuffItemTemplate-Icon {
  position: relative;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 0.75rem;
  background-color: var(--tx-fill-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  .size-sm & {
    width: 2rem;
    height: 2rem;

    :deep(.TuffIcon) {
      font-size: 1rem;
    }
  }

  .size-md & {
    width: 2.5rem;
    height: 2.5rem;

    :deep(.TuffIcon) {
      font-size: 1.25rem;
    }
  }

  .size-lg & {
    width: 3rem;
    height: 3rem;

    :deep(.TuffIcon) {
      font-size: 1.5rem;
    }
  }

  .TuffItemTemplate.is-selected & {
    background: linear-gradient(135deg, var(--tx-fill-color-light) 0%, var(--tx-fill-color) 100%);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }

  .TuffItemTemplate-StatusDot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 0 2px var(--tx-fill-color-blank);
    z-index: 1;

    &.is-active {
      background-color: var(--tx-color-success);
      animation: pulse-success 2s ease-in-out infinite;
    }

    &.is-inactive {
      background-color: var(--tx-text-color-disabled);
    }

    &.is-error {
      background-color: var(--tx-color-error);
    }

    &.is-warning {
      background-color: var(--tx-color-warning);
    }
  }
}

.TuffItemTemplate-Content {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
}

.TuffItemTemplate-Title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.TuffItemTemplate-TitleText {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.3s ease;

  .size-sm & {
    font-size: 0.8125rem;
  }

  .size-lg & {
    font-size: 0.9375rem;
  }

  .TuffItemTemplate:hover & {
    color: var(--tx-color-primary);
  }
}

.TuffItemTemplate-Subtitle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.TuffItemTemplate-SubtitleText {
  font-size: 0.8125rem;
  color: var(--tx-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .size-sm & {
    font-size: 0.75rem;
  }

  .size-lg & {
    font-size: 0.875rem;
  }
}

.TuffItemTemplate-Trailing {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  max-width: 40%;
}

@keyframes pulse-success {
  0%,
  100% {
    box-shadow:
      0 0 0 2px var(--tx-fill-color-blank),
      0 0 0 4px rgba(34, 197, 94, 0.2);
  }
  50% {
    box-shadow:
      0 0 0 2px var(--tx-fill-color-blank),
      0 0 0 6px rgba(34, 197, 94, 0.1);
  }
}

// Badges
.TuffItemTemplate-BadgeBottom {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 10;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.05);
  }
}
</style>
