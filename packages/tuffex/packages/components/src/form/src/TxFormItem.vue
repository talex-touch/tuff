<script setup lang="ts">
import type { FormItemEmits, FormItemProps } from './types'
import { ref } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import { useFormItem } from './use-form-item'

defineOptions({ name: 'TxFormItem' })

const props = withDefaults(defineProps<FormItemProps>(), {
  label: '',
  required: false,
  showMessage: true,
  inline: false,
  persist: true,
})

const emit = defineEmits<FormItemEmits>()

const rootRef = ref<HTMLElement | null>(null)

const {
  labelId,
  messageId,
  hintId,
  hintName,
  labelFor,
  messages,
  note,
  notePrefix,
  invalid,
  required,
  markRequired,
  markOptional,
  layout,
  labelAlign,
  slotProps,
  onFocusout,
} = useFormItem({
  prop: () => props.prop,
  label: () => props.label,
  rules: () => props.rules,
  required: () => props.required,
  help: () => props.help,
  hint: () => props.hint,
  showMessage: () => props.showMessage,
  root: rootRef,
  labelledBy: 'for',
  onValidated: valid => emit('validate', valid),
  persist: () => props.persist,
})
</script>

<template>
  <div
    ref="rootRef"
    class="tx-form-item"
    :class="[
      `tx-form-item--${layout}`,
      `tx-form-item--label-${labelAlign}`,
      width ? `tx-form-item--w-${width}` : '',
      { 'is-error': invalid, 'is-required': required, 'is-inline': inline },
    ]"
    @focusout="onFocusout"
  >
    <div v-if="label || hint" class="tx-form-item__label-row">
      <label v-if="label" :id="labelId" class="tx-form-item__label" :for="labelFor">
        <span class="tx-form-item__label-text">{{ label }}</span>
        <span v-if="markRequired" class="tx-form-item__required" aria-hidden="true">*</span>
        <span v-else-if="markOptional" class="tx-form-item__optional">{{ messages.optional }}</span>
      </label>
      <TxPopover
        v-if="hint"
        trigger="hover"
        placement="top-start"
        :match-reference-width="false"
        :max-width="280"
      >
        <template #reference>
          <button type="button" class="tx-form-item__hint" :aria-label="hintName" :aria-describedby="hintId">
            <svg
              class="tx-form-item__hint-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.25"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6.25" />
              <path d="M6.2 6.45a1.85 1.85 0 1 1 2.55 1.7c-.5.22-.8.66-.8 1.2v.4" />
              <path d="M8 11.6h.01" />
            </svg>
          </button>
        </template>
        <p class="tx-form-item__hint-text" aria-hidden="true">
          {{ hint }}
        </p>
      </TxPopover>
      <span v-if="hint" :id="hintId" class="tx-form-item__sr-only">{{ hint }}</span>
    </div>
    <div class="tx-form-item__content">
      <div class="tx-form-item__control">
        <slot v-bind="slotProps" />
      </div>
      <p
        v-if="note"
        :id="messageId"
        class="tx-form-item__message"
        :class="`tx-form-item__${note.kind}`"
      >
        <span v-if="notePrefix" class="tx-form-item__sr-only">{{ notePrefix }}</span>
        <span class="tx-form-item__message-text">{{ note.text }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-form-item {
  min-width: 0;
}

// The label and its `?` share one line. Top-aligned: in the side layout the row is stretched
// to the control and the label sits at its padding, so centring would drift by half a note.
.tx-form-item__label-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}

.tx-form-item__label {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--tx-text-color-regular, #606266);
  overflow-wrap: anywhere;
}

.tx-form-item__required {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-form-item__optional {
  color: var(--tx-text-color-secondary, #909399);
}

.tx-form-item__hint {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--tx-text-color-secondary, #909399);
  cursor: help;
}

.tx-form-item__hint:hover {
  color: var(--tx-text-color-regular, #606266);
}

.tx-form-item__hint:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.tx-form-item__hint-icon {
  width: 14px;
  height: 14px;
}

.tx-form-item__hint-text {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--tx-text-color-regular, #606266);
  overflow-wrap: anywhere;
}

.tx-form-item__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

// Tall enough for one row of controls, so a switch or a radio group lines up
// with the label the way an input does.
.tx-form-item__control {
  display: block;
  align-content: center;
  min-width: 0;
  min-height: var(--tx-form-control-height, 32px);
  max-width: var(--tx-form-item-width, none);
}

.tx-form-item--w-xs {
  --tx-form-item-width: 80px;
}

.tx-form-item--w-sm {
  --tx-form-item-width: 160px;
}

.tx-form-item--w-md {
  --tx-form-item-width: 240px;
}

.tx-form-item--w-lg {
  --tx-form-item-width: 360px;
}

.tx-form-item__message {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-form-item__error {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-form-item__warning {
  color: var(--tx-color-warning, #e6a23c);
}

.tx-form-item__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

// --- stacked: the label above the control ---
.tx-form-item--stacked,
.tx-form-item--auto {
  display: flex;
  flex-direction: column;
  gap: 6px;

  // Only the text and its `?` are the label; the empty line beside them is not.
  .tx-form-item__label-row {
    align-self: flex-start;
    max-width: 100%;
  }
}

// `inline` on an item: the label beside the control, centred on it.
.tx-form-item--stacked.is-inline,
.tx-form-item--auto.is-inline {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

// --- side: the form's label column, shared through subgrid ---
@mixin side {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: start;
  // `normal` takes the form's column gap through the subgrid.
  gap: normal;

  .tx-form-item__label-row {
    align-self: stretch;
    grid-column: label;
    // Centres the first line of the label on a single-row control.
    padding-block: calc((var(--tx-form-control-height, 32px) - 20px) / 2);
  }

  .tx-form-item__content {
    grid-column: field;
  }

  &.is-inline {
    align-items: center;

    .tx-form-item__label-row {
      padding-block: 0;
    }
  }
}

// A right-aligned label keeps its text flush with the field; the asterisk
// moves in front of it.
@mixin label-end {
  .tx-form-item__label-row {
    justify-content: flex-end;
  }

  .tx-form-item__label {
    justify-content: flex-end;
    text-align: end;
  }

  .tx-form-item__required {
    order: -1;
  }
}

.tx-form-item--side {
  @include side;
}

.tx-form-item--side.tx-form-item--label-end {
  @include label-end;
}

@container tx-form (inline-size >= 520px) {
  .tx-form-item--auto {
    @include side;
  }

  .tx-form-item--auto.tx-form-item--label-end {
    @include label-end;
  }
}

// --- inline: items side by side in a wrapping line ---
.tx-form-item--inline {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  .tx-form-item__label-row {
    flex: none;
    padding-block: calc((var(--tx-form-control-height, 32px) - 20px) / 2);
  }

  .tx-form-item__label {
    white-space: nowrap;
  }

  .tx-form-item__content {
    width: var(--tx-form-item-width, 200px);
  }

  .tx-form-item__control {
    max-width: none;
  }

  &.tx-form-item--w-full {
    flex: 1 1 100%;

    .tx-form-item__content {
      flex: 1;
      width: auto;
    }
  }
}
</style>
